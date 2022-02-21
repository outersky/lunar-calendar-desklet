const Desklet = imports.ui.desklet;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Tooltips = imports.ui.tooltips;

const Clutter = imports.gi.Clutter;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Cogl = imports.gi.Cogl;

const UUID = "calendar@outersky";

const DESKLET_DIR = imports.ui.deskletManager.deskletMeta[UUID].path;

imports.searchPath.push(DESKLET_DIR);

let Calendar = typeof require !== "undefined" ? require("./calendar") : imports.ui.deskletManager.desklets[UUID].calendar;
let LunarCalendar = typeof require !== "undefined" ? require("./lunar") : imports.ui.deskletManager.desklets[UUID].lunar;

const STYLE_TEXT_CENTER = "text-align: center;";
const STYLE_LABEL_DAY = "padding: 3pt 3pt 3pt 1pt; " + STYLE_TEXT_CENTER;
const STYLE_LUNAR_DAY = " padding: 1pt 3pt 3pt 8pt; font-family: '新宋体'; font-size: 10pt; font-weight:100; " + STYLE_TEXT_CENTER;
const STYLE_LUNAR_DAY1 = " padding: 1pt 3pt 3pt 8pt; font-family: '新宋体'; color:red; font-size: 10pt; font-weight:100; " + STYLE_TEXT_CENTER;


function MyDesklet(metadata, desklet_id) {
	this._init(metadata, desklet_id);
}

MyDesklet.prototype = {
	__proto__: Desklet.Desklet.prototype,

	_init: function(metadata, desklet_id) {
		Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

		// Initialise settings
		this.settings = new Settings.DeskletSettings(this, this.metadata.uuid, desklet_id);
		this.settings.bindProperty(Settings.BindingDirection.IN, "panels", "panels", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "show-weekday", "showWeekday", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "short-month-name", "shortMonthName", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "show-year", "showYear", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "show-time", "showTime", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "layout", "layout", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "custom-font-family", "customFontFamily", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "font-size", "fontSize", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "colour-text", "colourText", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "colour-saturdays", "colourSaturdays", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "colour-sundays", "colourSundays", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "colour-background", "colourBackground", this.onSettingChanged);
		this.settings.bindProperty(Settings.BindingDirection.IN, "transparency", "transparency", this.onSettingChanged);

		// Date of the calendar
		this.date = new Date();

		//////// Today Panel ////////
		this.labelDay = new St.Label();
		this.labelDate = new St.Label();
		this.labelMonthYear = new St.Label();
		this.labelTime = new St.Label();

		this.boxLayoutToday = new St.BoxLayout({vertical: true, y_align: 2});

		this.labelDay.style = this.labelMonthYear.style = this.labelTime.style = STYLE_TEXT_CENTER;

		//////// Month Panel ////////
		this.buttonPrevious = new St.Button();
		this.buttonNext = new St.Button();
		this.buttonMonth = new St.Button();

		this.labelPrevious = new St.Label();
		this.labelNext = new St.Label();
		this.labelMonth = new St.Label();
		this.labelDays = [];
		this.lunarDays = [];

		this.tableMonth = new St.Table();

		this.labelPrevious.style = "text-align: left;";
		this.labelPrevious.set_text("\u2BC7");
		this.labelNext.style = "text-align: right;";
		this.labelNext.set_text("\u2BC8");
		this.labelMonth.style = STYLE_LABEL_DAY + " font-weight: bold;";

		// Create labels for weekdays
		this.labelWeekdays = [];
		for (let i = 0; i < 7; i++) {
			this.labelWeekdays[i] = new St.Label();
			// this.labelWeekdays[i].set_text(Calendar.WEEKDAY_NAMES[i].substring(0, 1));
			this.labelWeekdays[i].set_text(Calendar.WEEKDAY_NAMES_CN[i]);
			this.tableMonth.add(this.labelWeekdays[i], {row: 1, col: i});
		}

		this.buttonPrevious.set_child(this.labelPrevious);
		this.buttonMonth.set_child(this.labelMonth);
		this.buttonNext.set_child(this.labelNext);

		let fnClickPrevious = Lang.bind(this, this.onClickPrevious);
		let fnClickNext = Lang.bind(this, this.onClickNext);
		this.buttonPrevious.connect("clicked", async ()=>fnClickPrevious());
		this.buttonNext.connect("clicked",async ()=>fnClickNext());

		this.tooltipMonth = new Tooltips.Tooltip(this.buttonMonth);
		this.tooltipPrevious = new Tooltips.Tooltip(this.buttonPrevious,
				_("Previous month..."));
		this.tooltipNext = new Tooltips.Tooltip(this.buttonNext,
				_("Next month..."));

		this.tableMonth.add(this.buttonPrevious, {row: 0, col: 0});
		this.tableMonth.add(this.buttonMonth, {row: 0, col: 1, colSpan: 5});
		this.tableMonth.add(this.buttonNext, {row: 0, col: 6});

		// Create buttons with labels (with tooltips) for days
		for (let i = 0; i < 31; i++) {
			this.labelDays[i] = new St.Label();
			this.labelDays[i].style = STYLE_LABEL_DAY;
			this.labelDays[i].set_text(String(i + 1));

			this.lunarDays[i] = new St.Label();
			this.lunarDays[i].style = STYLE_LUNAR_DAY;
			this.lunarDays[i].set_text("初"+i);
		}

		//////// Calendar Layout ////////
		// Set Desklet header
		this.setHeader("Calendar");

		this.updateCalendar();

		//每10分钟刷新一下，不然过了半夜12点也不会自动更新日期
		setInterval(()=>{
			this.date = new Date();
			this.updateCalendar();
		}, 1000*60*10);
	},

	async onClickPrevious(){
		global.log('click previous');
		this.date = Calendar.dateMonthAdd(this.date, -1);
		this.updateCalendar();
		global.log('handle previous ok');
	},

	async onClickNext(){
		global.log('click next');
		this.date = Calendar.dateMonthAdd(this.date, 1);
		this.updateCalendar();
		global.log('handle next ok');
	},

	// Called on user clicking the desklet
	on_desklet_clicked: function(event) {
		global.log(' desklet clicked ');
		this.date = new Date();
		this.updateCalendar(); // 任意点击以下，自动还原
	},
	
	on_desklet_removed: function() {
		this.removed = true;
		// Mainloop.source_remove(this.timeout);
	},
	
	// Refresh on change of settings
	onSettingChanged: function() {
		// if (this.timeout) Mainloop.source_remove(this.timeout);
		this.updateCalendar();
	},
	updateCalendar: function() {
		try{
			global.log(`[${UUID}] call updateCalendar`);
			this.updateCalendar0();
		}catch(e){
			global.logError(e);
		}
	},

	/* Method to update the Desklet layout*/
	updateCalendar0: function() {

		let now = new Date();

		this.lastUpdate = { fullYear: now.getFullYear(), month: now.getMonth(), date: now.getDate()};

		//////// Today Panel ////////
		this.labelDate.style = (now.getDay() === 0 ? "color: " + this.colourSundays + "; " : "")
				+ (now.getDay() === 6 ? "color: " + this.colourSaturdays + "; " : "")
				+ "font-size: 4em; " + STYLE_TEXT_CENTER;

		if (now.getDay() === 0 || now.getDay() === 6)
			this.labelDay.style = "color: " + (now.getDay() === 0 ?
					this.colourSundays : this.colourSaturdays) + "; " + STYLE_TEXT_CENTER;

		this.boxLayoutToday.remove_all_children();
		if (this.showWeekday !== "off")
			this.boxLayoutToday.add(this.labelDay);
		this.boxLayoutToday.add(this.labelDate);
		this.boxLayoutToday.add(this.labelMonthYear);
		if (this.showTime)
			this.boxLayoutToday.add(this.labelTime);

		//////// Month Panel ////////
		// this.labelMonth.set_text(Calendar.MONTH_NAMES[this.date.getMonth()].substring(0, 3) + " " + this.date.getFullYear());
		this.labelMonth.set_text(this.date.getFullYear() + ' 年 ' + (this.date.getMonth()+1) + ' 月');

		// Set weekday style
		for (let i = 0; i < 7; i++)
			this.labelWeekdays[i].style = STYLE_LABEL_DAY + (this.date.getFullYear() == now.getFullYear()
					&& this.date.getMonth() == now.getMonth() && i == now.getDay() ?
					" font-weight: bold;" : "") + (i === 0 ? " color: " + this.colourSundays + ";" : "")
					+ (i === 6 ? " color: " + this.colourSaturdays + ";" : "");

		// Remove currently added days
		for (let i = 0; i < 31; i++){
			if (this.labelDays[i].get_parent()){
				this.tableMonth.remove_child(this.labelDays[i]);
			}

			if (this.lunarDays[i] && this.lunarDays[i].get_parent()){
				this.tableMonth.remove_child(this.lunarDays[i]);
			}
		}

		let year = this.date.getFullYear();
		let month = this.date.getMonth();

		for (let i = 0, row = 0, col = (new Date(this.date.getFullYear(), this.date.getMonth(), 1)).getDay(),
				monthLength = Calendar.daysInMonth(this.date.getMonth(), this.date.getFullYear()); i < monthLength; i++) {
			this.labelDays[i].style = STYLE_LABEL_DAY;
			// Set specified colour of Sunday and Saturday
			if (col === 0)
				this.labelDays[i].style = this.labelDays[i].style + " color: " + this.colourSundays + ";";
			else if (col === 6)
				this.labelDays[i].style = this.labelDays[i].style + " color: " + this.colourSaturdays + ";";

			// Emphasise today's date 
			if (this.date.getFullYear() == now.getFullYear() && this.date.getMonth() == now.getMonth()
					&& i + 1 === now.getDate())
				this.labelDays[i].style = this.labelDays[i].style + " font-weight: 600; font-size: 18pt;";
			this.tableMonth.add(this.labelDays[i], {row: 2+row*2, col: col}); // add days

			var lunar = LunarCalendar.solarToLunar(year,month+1, i+1);
			if(lunar.lunarDayName=='初一'){
				this.lunarDays[i].set_text(lunar.lunarMonthName);
				this.lunarDays[i].style = STYLE_LUNAR_DAY1;
			}else{
				this.lunarDays[i].set_text(lunar.lunarDayName);
				this.lunarDays[i].style = STYLE_LUNAR_DAY;
			}
			
			this.tableMonth.add(this.lunarDays[i], {row: 2+row*2+1, col: col}); // add lunar days
			col++;
			if (col > 6) {
				row++;
				col = 0;
			}
		}
		this.tooltipMonth.set_text(Calendar.MONTH_NAMES[this.date.getMonth()] + " " + this.date.getFullYear());

		//////// Calendar Layout ////////
		if (typeof this.boxLayoutCalendar !== "undefined")
			this.boxLayoutCalendar.remove_all_children();
		this.boxLayoutCalendar = new St.BoxLayout({vertical: this.layout !== "horizontal"});
		this.boxLayoutCalendar.style = "background-color: " + (this.colourBackground.replace(")", ","
				+ (1 - this.transparency / 100) + ")")).replace('rgb', 'rgba')
				+ "; border-radius: " + (this.fontSize / 3 * 2) + "pt; color: " + this.colourText + ";"
				+ (this.customFontFamily !== "" ? " font-family: '" + this.customFontFamily + "';" : "")
				+ " font-size: " + this.fontSize + "pt; padding: " + (this.fontSize / 3 * 2) + "pt; text-shadow: 1px 1px 2px #000;";
		if (this.panels === "both" || this.panels === "today")
			this.boxLayoutCalendar.add_actor(this.boxLayoutToday);
		if (this.panels === "both" || this.panels === "month")
			this.boxLayoutCalendar.add_actor(this.tableMonth);
		if (this.panels === "both")
			this.boxLayoutToday.style = "margin-" + (this.layout === "horizontal" ? "right" : "bottom")
					+ ": " + (this.fontSize / 2) + "pt;";
		
		this.setContent(this.boxLayoutCalendar);

		this.updateValues();
	},

	/* Method to update the Desklet values*/
	updateValues: function() {

		if (this.removed) {
			// this.timeout = 0;
			global.log('calendar desklet removed!');
			return false;
		}

		let now = new Date();

		if (this.lastUpdate.fullYear !== now.getFullYear() || this.lastUpdate.month !== now.getMonth() || this.lastUpdate.date !== now.getDate()) {
			this.updateCalendar();
			return false;
		}

		//////// Today Panel ////////
		this.labelDay.set_text(Calendar.WEEKDAY_NAMES[now.getDay()].substring(0, this.showWeekday !== "full" ? 3 : 9));
		this.labelDate.set_text(String(now.getDate()));
		this.labelMonthYear.set_text(Calendar.MONTH_NAMES[now.getMonth()].substring(0, this.shortMonthName ? 3 : 9)
				+ (this.showYear !== "off" ? " " + (String(now.getFullYear()).substring(this.showYear !== "full" ? 2 : 0)) : ""));
		this.labelTime.set_text(Calendar.zeroPad(now.getHours()) + ":"
				+ Calendar.zeroPad(now.getMinutes()));

		return false;
		// Setup loop to update values
		// this.timeout = Mainloop.timeout_add_seconds(this.showTime ? 1 : 10, Lang.bind(this, this.updateValues));
	}
};

function main(metadata, desklet_id) {
	return new MyDesklet(metadata, desklet_id);
}
