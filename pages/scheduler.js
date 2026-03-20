window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['scheduler'] = function(container) {

  // ── State ─────────────────────────────────────────────────────
  var db    = window.WorkVoltDB;
  var toast = function(msg,type){ window.WorkVolt?.toast(msg,type||'info'); };
  var me    = window.WorkVolt?.user();

  var state = {
    tab:      'dashboard',
    shifts:   [],
    users:    [],
    weekStart: _getMondayOf(new Date()),
    loading:  false,
    // Extended data stored in Supabase config
    templates:    [],
    locations:    [],
    availability: [],
    timeoff:      [],
    swaps:        [],
    otRules:      { max_daily_hours:12, max_weekly_hours:40, min_rest_hours:8 },
  };

  // ── Date utils ────────────────────────────────────────────────
  function _localDateStr(d) {
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function _getMondayOf(d) {
    var day=d.getDay(), diff=(day===0)?-6:1-day;
    return _localDateStr(new Date(d.getFullYear(),d.getMonth(),d.getDate()+diff));
  }
  function _addDays(dateStr,n) {
    var p=dateStr.split('-');
    return _localDateStr(new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2])+n));
  }
  function _fmtDate(dateStr) {
    if (!dateStr) return '';
    try { var p=String(dateStr).substring(0,10).split('-'); return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2])).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return dateStr; }
  }
  function _today() { return _localDateStr(new Date()); }

  function _badge(status) {
    var map={
      Scheduled:'bg-blue-100 text-blue-700', Confirmed:'bg-green-100 text-green-700',
      Completed:'bg-slate-100 text-slate-600', Cancelled:'bg-red-100 text-red-600',
      'No Show':'bg-orange-100 text-orange-700', Pending:'bg-amber-100 text-amber-700',
      Approved:'bg-green-100 text-green-700', Rejected:'bg-red-100 text-red-600',
    };
    return '<span class="px-2 py-0.5 rounded-full text-xs font-semibold '+(map[status]||'bg-slate-100 text-slate-500')+'">'+(status||'—')+'</span>';
  }
  function userName(uid) {
    var u=state.users.find(function(u){ return (u.id||u.user_id)===uid; });
    return u?(u.name||u.email||uid):uid;
  }

  // ── Modal ─────────────────────────────────────────────────────
  function openModal(html) {
    document.getElementById('sch-modal').innerHTML=html;
    document.getElementById('sch-modal-bg').classList.remove('hidden');
  }
  function schCloseModal() {
    document.getElementById('sch-modal-bg').classList.add('hidden');
    document.getElementById('sch-modal').innerHTML='';
  }
  window.schCloseModal=schCloseModal;

  // ── Shell ─────────────────────────────────────────────────────
  function render() {
    container.innerHTML=`
      <div class="p-4 md:p-6 fade-in max-w-7xl mx-auto">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fas fa-calendar-alt text-white"></i>
            </div>
            <div>
              <h1 class="text-xl font-extrabold text-slate-900 leading-tight">Shift Scheduler</h1>
              <p class="text-xs text-slate-500" id="sch-subtitle">Loading…</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="schOpenAutoSchedule()" class="btn-secondary text-xs px-3 py-2 gap-1.5"><i class="fas fa-magic text-xs"></i> Auto-Schedule</button>
            <button onclick="schOpenCreateShift()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i> New Shift</button>
          </div>
        </div>

        <div class="flex gap-1 overflow-x-auto pb-1 mb-5 border-b border-slate-200">
          ${[
            ['dashboard','fa-th-large','Dashboard'],['calendar','fa-calendar-week','Calendar'],
            ['schedule','fa-list','Schedule'],['templates','fa-layer-group','Templates'],
            ['locations','fa-map-marker-alt','Locations'],['availability','fa-user-clock','Availability'],
            ['timeoff','fa-plane-departure','Time Off'],['swaps','fa-exchange-alt','Swaps'],
            ['overtime','fa-exclamation-triangle','Overtime'],
          ].map(function(t){
            return '<button onclick="schTab(\''+t[0]+'\')" id="sch-tab-'+t[0]+'" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors '+(state.tab===t[0]?'bg-blue-600 text-white':'text-slate-500 hover:text-slate-800 hover:bg-slate-100')+'">' +
              '<i class="fas '+t[1]+' text-[11px]"></i>'+t[2]+'</button>';
          }).join('')}
        </div>

        <div id="sch-tab-content"></div>

        <div id="sch-modal-bg" class="hidden fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onclick="if(event.target===this)schCloseModal()">
          <div id="sch-modal" class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"></div>
        </div>
      </div>`;

    window.schTab=schTab;
    window.schOpenCreateShift=schOpenCreateShift;
    window.schOpenAutoSchedule=schOpenAutoSchedule;

    loadAll();
  }

  // ── Load ──────────────────────────────────────────────────────
  async function loadAll() {
    try {
      var [userRows, shiftRows] = await Promise.all([
        db.users.list(),
        db.scheduler.shifts(),
      ]);
      state.users  = userRows;
      state.shifts = shiftRows;

      // Load extended data from config
      try {
        var cfg = await db.config.getAll();
        if (cfg.sch_templates)    try{ state.templates    = JSON.parse(cfg.sch_templates);    }catch(e){}
        if (cfg.sch_locations)    try{ state.locations    = JSON.parse(cfg.sch_locations);    }catch(e){}
        if (cfg.sch_availability) try{ state.availability = JSON.parse(cfg.sch_availability); }catch(e){}
        if (cfg.sch_timeoff)      try{ state.timeoff      = JSON.parse(cfg.sch_timeoff);      }catch(e){}
        if (cfg.sch_swaps)        try{ state.swaps        = JSON.parse(cfg.sch_swaps);        }catch(e){}
        if (cfg.sch_ot_rules)     try{ state.otRules      = JSON.parse(cfg.sch_ot_rules);     }catch(e){}
      } catch(e){}

      var today     = _today();
      var todayShifts = state.shifts.filter(function(s){ return s.date===today; }).length;
      var weekShifts  = state.shifts.filter(function(s){ return s.date>=state.weekStart && s.date<=_addDays(state.weekStart,6); }).length;
      var sub = document.getElementById('sch-subtitle');
      if (sub) sub.textContent=todayShifts+' shifts today · '+weekShifts+' this week';

    } catch(e) { toast('Failed to load scheduler: '+e.message,'error'); }
    renderTab();
  }

  async function saveExtended(key, value) {
    await db.config.set(key, JSON.stringify(value));
  }

  function schTab(name) {
    state.tab=name;
    document.querySelectorAll('[id^="sch-tab-"]').forEach(function(b){
      var tid=b.id.replace('sch-tab-','');
      b.className='flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors '+(tid===name?'bg-blue-600 text-white':'text-slate-500 hover:text-slate-800 hover:bg-slate-100');
    });
    renderTab();
  }

  async function renderTab() {
    var el=document.getElementById('sch-tab-content'); if (!el) return;
    el.innerHTML='<div class="flex items-center justify-center py-16"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-400"></i></div>';
    try {
      switch(state.tab) {
        case 'dashboard':    renderDashboard(el);    break;
        case 'calendar':     renderCalendar(el);     break;
        case 'schedule':     renderSchedule(el);     break;
        case 'templates':    renderTemplates(el);    break;
        case 'locations':    renderLocations(el);    break;
        case 'availability': renderAvailability(el); break;
        case 'timeoff':      renderTimeOff(el);      break;
        case 'swaps':        renderSwaps(el);        break;
        case 'overtime':     renderOvertime(el);     break;
        default: el.innerHTML='<p class="text-slate-400 p-8">Unknown tab</p>';
      }
    } catch(e) { el.innerHTML='<p class="text-red-500 p-6">Error: '+e.message+'</p>'; }
  }

  // ── DASHBOARD ─────────────────────────────────────────────────
  function renderDashboard(el) {
    var today    = _today();
    var weekEnd  = _addDays(state.weekStart, 6);
    var todayS   = state.shifts.filter(function(s){ return s.date===today; });
    var weekS    = state.shifts.filter(function(s){ return s.date>=state.weekStart && s.date<=weekEnd; });
    var pendingTO= state.timeoff.filter(function(t){ return t.status==='Pending'; }).length;
    var pendingSW= state.swaps.filter(function(s){ return s.status==='Pending'; }).length;
    var weekHrs  = weekS.reduce(function(s,r){ return s+calcShiftHours(r.start_time,r.end_time); },0);

    el.innerHTML=`
      <div class="space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${[
            {label:'Scheduled Today', val:todayS.length,      icon:'fa-user-clock',      color:'blue'},
            {label:'Pending Swaps',   val:pendingSW,           icon:'fa-exchange-alt',    color:'amber'},
            {label:'Time-Off Req',    val:pendingTO,           icon:'fa-plane-departure', color:'blue'},
            {label:'Week Hours',      val:weekHrs.toFixed(1)+'h',icon:'fa-clock',         color:'green'},
          ].map(function(k){
            return '<div class="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">' +
              '<div class="w-10 h-10 bg-'+k.color+'-100 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas '+k.icon+' text-'+k.color+'-500"></i></div>' +
              '<div><div class="text-2xl font-extrabold text-slate-900">'+k.val+'</div><div class="text-xs text-slate-500">'+k.label+'</div></div></div>';
          }).join('')}
        </div>
        <div class="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
          <div class="font-bold text-base mb-1">Quick Actions</div>
          <div class="flex flex-wrap gap-2 mt-3">
            <button onclick="schTab('calendar')" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"><i class="fas fa-calendar-week mr-1"></i>Calendar</button>
            <button onclick="schOpenCreateShift()" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"><i class="fas fa-plus mr-1"></i>Add Shift</button>
            <button onclick="schTab('timeoff')" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"><i class="fas fa-plane-departure mr-1"></i>Time-Off</button>
            <button onclick="schTab('swaps')" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition"><i class="fas fa-exchange-alt mr-1"></i>Swaps</button>
          </div>
        </div>
      </div>`;
  }

  function calcShiftHours(start,end) {
    if (!start||!end) return 0;
    var toMins=function(t){ var m=String(t).match(/^(\d{1,2}):(\d{2})/); return m?parseInt(m[1])*60+parseInt(m[2]):null; };
    var s=toMins(start), e=toMins(end);
    if (s===null||e===null) return 0;
    var d=(e-s)/60; if (d<=0) d+=24;
    return Math.max(0,d);
  }

  // ── CALENDAR ──────────────────────────────────────────────────
  function renderCalendar(el) {
    var days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dates=days.map(function(_,i){ return _addDays(state.weekStart,i); });
    var empMap={};
    state.shifts.forEach(function(r){
      var sd=String(r.date||'').substring(0,10);
      if (!empMap[r.employee_id]) empMap[r.employee_id]={name:r.employee_name||userName(r.employee_id),shifts:{}};
      if (!empMap[r.employee_id].shifts[sd]) empMap[r.employee_id].shifts[sd]=[];
      empMap[r.employee_id].shifts[sd].push(r);
    });

    el.innerHTML=`
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <button onclick="schWeekPrev()" class="btn-secondary text-xs px-3 py-2"><i class="fas fa-chevron-left"></i></button>
          <span class="text-sm font-bold text-slate-700 flex-1 text-center">Week of ${_fmtDate(state.weekStart)}</span>
          <button onclick="schWeekNext()" class="btn-secondary text-xs px-3 py-2"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs min-w-[600px]">
            <thead><tr class="border-b border-slate-100">
              <th class="px-3 py-2.5 text-left font-bold text-slate-500 w-32">Employee</th>
              ${dates.map(function(d,i){ var isToday=d===_today(); return '<th class="px-2 py-2.5 text-center font-bold '+(isToday?'text-blue-600':'text-slate-500')+'">'+days[i]+'<br><span class="font-normal text-[10px]">'+d.slice(5)+'</span></th>'; }).join('')}
            </tr></thead>
            <tbody>
              ${Object.entries(empMap).length ? Object.entries(empMap).map(function(e){
                var eid=e[0], data=e[1];
                return '<tr class="border-t border-slate-100 hover:bg-slate-50">' +
                  '<td class="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">'+esc(data.name)+'</td>' +
                  dates.map(function(d){
                    var dayShifts=(data.shifts[d]||[]);
                    return '<td class="px-1 py-1.5 text-center">' +
                      dayShifts.map(function(s){
                        return '<div class="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 mb-0.5 font-semibold cursor-pointer hover:bg-blue-200" onclick="schEditShift(\''+s.id+'\')">' +
                          (s.start_time?String(s.start_time).substring(0,5):'—')+'</div>';
                      }).join('')+
                      '<button onclick="schCreateOnDay(\''+d+'\',\''+eid+'\')" class="text-[10px] text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded px-1 py-0.5 transition-colors">+</button>' +
                    '</td>';
                  }).join('')+
                '</tr>';
              }).join('') : '<tr><td colspan="8" class="text-center text-slate-400 py-8 text-sm">No shifts this week</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    window.schWeekPrev=function(){ state.weekStart=_addDays(state.weekStart,-7); renderTab(); };
    window.schWeekNext=function(){ state.weekStart=_addDays(state.weekStart,7);  renderTab(); };
    window.schCreateOnDay=function(date,empId){ schOpenCreateShift(date,empId); };
  }

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── SCHEDULE LIST ─────────────────────────────────────────────
  function renderSchedule(el) {
    var rows=state.shifts.slice().sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); });
    el.innerHTML=`
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">${rows.length} shifts total</p>
          <button onclick="schOpenCreateShift()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i>New Shift</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-100 text-xs text-slate-500 font-bold uppercase tracking-wide bg-slate-50">
              <th class="px-4 py-3 text-left">Employee</th><th class="px-4 py-3 text-left">Date</th>
              <th class="px-4 py-3 text-left">Time</th><th class="px-4 py-3 text-left">Location</th>
              <th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              ${rows.length ? rows.map(function(r){
                return '<tr class="border-t border-slate-100 hover:bg-slate-50">' +
                  '<td class="px-4 py-3 font-semibold text-slate-800">'+esc(r.employee_name||userName(r.employee_id))+'</td>' +
                  '<td class="px-4 py-3 text-slate-500">'+_fmtDate(r.date)+'</td>' +
                  '<td class="px-4 py-3 text-slate-600 font-mono text-xs">'+(r.start_time?String(r.start_time).substring(0,5):'—')+' – '+(r.end_time?String(r.end_time).substring(0,5):'—')+'</td>' +
                  '<td class="px-4 py-3 text-slate-500">'+esc(r.location||'—')+'</td>' +
                  '<td class="px-4 py-3">'+_badge(r.status)+'</td>' +
                  '<td class="px-4 py-3"><div class="flex gap-1">' +
                    '<button onclick="schEditShift(\''+r.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-pencil text-xs"></i></button>' +
                    '<button onclick="schDeleteShift(\''+r.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>' +
                  '</div></td></tr>';
              }).join('') : '<tr><td colspan="6" class="text-center text-slate-400 py-8">No shifts yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Create / Edit shift form ───────────────────────────────────
  function schOpenCreateShift(prefillDate, prefillEmpId) {
    openShiftForm(null, prefillDate||_today(), prefillEmpId||'');
  }
  window.schOpenCreateShift=schOpenCreateShift;
  window.schEditShift=function(id){
    var s=state.shifts.find(function(x){ return x.id===id; });
    if (s) openShiftForm(s, s.date, s.employee_id);
  };

  function openShiftForm(shift, prefillDate, prefillEmpId) {
    var isEdit=!!shift;
    var v=function(f){ return isEdit&&shift[f]!=null?esc(String(shift[f])):''; };
    var empOpts=state.users.map(function(u){
      var uid=u.id||u.user_id;
      return '<option value="'+uid+'" data-name="'+(u.name||u.email)+'"'+(isEdit&&shift.employee_id===uid?' selected ':(uid===prefillEmpId?' selected':''))+'>'+(u.name||u.email)+'</option>';
    }).join('');
    var locOpts=state.locations.map(function(l){ return '<option value="'+esc(l.name)+'"'+(isEdit&&shift.location===l.name?' selected':'')+'>'+esc(l.name)+'</option>'; }).join('');
    var tplBtns=state.templates.map(function(t){
      return '<button type="button" onclick="schApplyTemplate(\''+esc(t.name)+'\')" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-100 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-colors">'+esc(t.name)+'</button>';
    }).join('');

    openModal(
      '<div class="p-5">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="font-bold text-slate-900">'+(isEdit?'Edit Shift':'New Shift')+'</h3>' +
          '<button onclick="schCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
        '</div>' +
        (tplBtns?'<div class="mb-3"><p class="text-xs font-semibold text-slate-500 mb-1.5">Templates</p><div class="flex flex-wrap gap-1.5">'+tplBtns+'</div></div>':'')+
        '<div id="sch-form-status"></div>' +
        '<div class="space-y-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Employee <span class="text-red-500">*</span></label>' +
            '<select id="sf-emp" class="field text-sm"><option value="">Select…</option>'+empOpts+'</select></div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Date</label>' +
              '<input type="date" id="sf-date" class="field text-sm" value="'+(v('date')||prefillDate||_today())+'"></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Status</label>' +
              '<select id="sf-status" class="field text-sm">' +
                ['Scheduled','Confirmed','Completed','Cancelled','No Show'].map(function(s){ return '<option value="'+s+'"'+(isEdit&&shift.status===s?' selected':'')+(s==='Scheduled'&&!isEdit?' selected':'')+'>'+s+'</option>'; }).join('') +
              '</select></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Start Time</label>' +
              '<input type="time" id="sf-start" class="field text-sm" value="'+v('start_time')+'"></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">End Time</label>' +
              '<input type="time" id="sf-end" class="field text-sm" value="'+v('end_time')+'"></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Role</label>' +
              '<input type="text" id="sf-role" class="field text-sm" placeholder="e.g. Cashier" value="'+v('role')+'"></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Location</label>' +
              '<select id="sf-loc" class="field text-sm"><option value="">—</option>'+locOpts+'</select></div>' +
          '</div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>' +
            '<input type="text" id="sf-notes" class="field text-sm" placeholder="Optional" value="'+v('notes')+'"></div>' +
        '</div>' +
        '<div class="flex gap-2 mt-4">' +
          '<button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>' +
          '<button onclick="schSaveShift(\''+( isEdit?shift.id:'')+'\')" class="btn-primary flex-1 text-sm"><i class="fas fa-save text-xs mr-1"></i>'+(isEdit?'Save Changes':'Create Shift')+'</button>' +
        '</div>' +
      '</div>'
    );

    window.schApplyTemplate=function(name){
      var t=state.templates.find(function(x){ return x.name===name; });
      if (!t) return;
      if (t.start_time && document.getElementById('sf-start')) document.getElementById('sf-start').value=t.start_time;
      if (t.end_time   && document.getElementById('sf-end'))   document.getElementById('sf-end').value=t.end_time;
      if (t.role       && document.getElementById('sf-role'))  document.getElementById('sf-role').value=t.role;
    };
  }

  window.schSaveShift=async function(shiftId){
    var isEdit=!!shiftId;
    var empEl=document.getElementById('sf-emp');
    var empId=empEl?.value;
    if (!empId){ var s=document.getElementById('sch-form-status'); if(s) s.innerHTML='<p class="text-red-500 text-xs mb-2">Employee is required.</p>'; return; }
    var empName=empEl.options[empEl.selectedIndex]?.text||'';
    var patch={
      employee_id:   empId,
      employee_name: empName,
      date:          document.getElementById('sf-date')?.value||_today(),
      start_time:    document.getElementById('sf-start')?.value||null,
      end_time:      document.getElementById('sf-end')?.value||null,
      role:          document.getElementById('sf-role')?.value||null,
      location:      document.getElementById('sf-loc')?.value||null,
      status:        document.getElementById('sf-status')?.value||'Scheduled',
      notes:         document.getElementById('sf-notes')?.value||null,
    };
    try {
      if (isEdit) {
        await db.scheduler.update(shiftId,patch);
        state.shifts=state.shifts.map(function(s){ return s.id===shiftId?Object.assign({},s,patch):s; });
      } else {
        var created=await db.scheduler.create(patch);
        state.shifts.push(created);
      }
      toast(isEdit?'Shift updated':'Shift created','success');
      schCloseModal();
      renderTab();
    } catch(e){ toast(e.message,'error'); }
  };

  window.schDeleteShift=async function(id){
    if (!confirm('Delete this shift?')) return;
    try {
      await db.scheduler.delete(id);
      state.shifts=state.shifts.filter(function(s){ return s.id!==id; });
      toast('Shift deleted','info');
      renderTab();
    } catch(e){ toast(e.message,'error'); }
  };

  // ── AUTO-SCHEDULE ─────────────────────────────────────────────
  window.schOpenAutoSchedule=function(){
    openModal(
      '<div class="p-5">' +
        '<div class="flex items-center justify-between mb-4">' +
          '<h3 class="font-bold text-slate-900">Auto-Schedule Week</h3>' +
          '<button onclick="schCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
        '</div>' +
        '<p class="text-sm text-slate-500 mb-4">Automatically create shifts for all active employees for the selected week based on your templates.</p>' +
        '<div class="space-y-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Week Starting</label>' +
            '<input type="date" id="as-week" class="field text-sm" value="'+state.weekStart+'"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Template</label>' +
            '<select id="as-tpl" class="field text-sm"><option value="">— Default (9AM–5PM) —</option>' +
            state.templates.map(function(t){ return '<option value="'+esc(t.name)+'">'+esc(t.name)+'</option>'; }).join('')+
          '</select></div>' +
        '</div>' +
        '<div class="flex gap-2 mt-4">' +
          '<button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>' +
          '<button onclick="schRunAutoSchedule()" class="btn-primary flex-1 text-sm"><i class="fas fa-magic text-xs mr-1"></i>Generate</button>' +
        '</div>' +
      '</div>'
    );

    window.schRunAutoSchedule=async function(){
      var weekStart=document.getElementById('as-week')?.value||state.weekStart;
      var tplName  =document.getElementById('as-tpl')?.value;
      var tpl      =tplName?state.templates.find(function(t){ return t.name===tplName; }):null;
      var startTime=(tpl&&tpl.start_time)||'09:00';
      var endTime  =(tpl&&tpl.end_time)||'17:00';
      var role     =(tpl&&tpl.role)||'';

      try {
        var created=[];
        for (var i=0;i<5;i++) { // Mon–Fri
          var date=_addDays(weekStart,i);
          for (var j=0;j<state.users.length;j++) {
            var u=state.users[j];
            var uid=u.id||u.user_id;
            var exists=state.shifts.find(function(s){ return s.date===date&&s.employee_id===uid; });
            if (!exists) {
              var s=await db.scheduler.create({ employee_id:uid, employee_name:u.name||u.email, date, start_time:startTime, end_time:endTime, role, status:'Scheduled' });
              created.push(s);
            }
          }
        }
        state.shifts=state.shifts.concat(created);
        toast('Created '+created.length+' shifts','success');
        schCloseModal();
        renderTab();
      } catch(e){ toast(e.message,'error'); }
    };
  };

  // ── TEMPLATES ─────────────────────────────────────────────────
  function renderTemplates(el) {
    var renderList=function(){
      el.innerHTML=`
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-500">Shift templates for quick scheduling</p>
            <button onclick="schAddTemplate()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i>New Template</button>
          </div>
          <div class="space-y-2">
            ${state.templates.length ? state.templates.map(function(t,i){
              return '<div class="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4">' +
                '<div class="flex-1"><p class="font-semibold text-slate-900 text-sm">'+esc(t.name)+'</p>' +
                '<p class="text-xs text-slate-400">'+(t.start_time||'—')+' – '+(t.end_time||'—')+(t.role?' · '+esc(t.role):'')+'</p></div>' +
                '<button onclick="schDeleteTemplate('+i+')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>' +
              '</div>';
            }).join('') : '<div class="text-sm text-slate-400 text-center py-8">No templates yet</div>'}
          </div>
        </div>`;

      window.schDeleteTemplate=async function(idx){
        state.templates.splice(idx,1);
        await saveExtended('sch_templates',state.templates);
        toast('Template deleted','info');
        renderList();
      };
      window.schAddTemplate=function(){
        openModal(
          '<div class="p-5"><h3 class="font-bold text-slate-900 mb-4">New Template</h3>' +
          '<div class="space-y-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Name</label><input type="text" id="tpl-name" class="field text-sm" placeholder="Morning Shift"></div>' +
            '<div class="grid grid-cols-2 gap-3">' +
              '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Start</label><input type="time" id="tpl-start" class="field text-sm" value="09:00"></div>' +
              '<div><label class="block text-xs font-semibold text-slate-600 mb-1">End</label><input type="time" id="tpl-end" class="field text-sm" value="17:00"></div>' +
            '</div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Default Role</label><input type="text" id="tpl-role" class="field text-sm" placeholder="Optional"></div>' +
          '</div>' +
          '<div class="flex gap-2 mt-4">' +
            '<button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>' +
            '<button onclick="schSaveTemplate()" class="btn-primary flex-1 text-sm">Save</button>' +
          '</div></div>'
        );
        window.schSaveTemplate=async function(){
          var name=(document.getElementById('tpl-name')?.value||'').trim();
          if (!name){ toast('Name required','error'); return; }
          state.templates.push({ name, start_time:document.getElementById('tpl-start')?.value, end_time:document.getElementById('tpl-end')?.value, role:document.getElementById('tpl-role')?.value||'' });
          await saveExtended('sch_templates',state.templates);
          toast('Template saved','success');
          schCloseModal();
          renderList();
        };
      };
    };
    renderList();
  }

  // ── LOCATIONS ─────────────────────────────────────────────────
  function renderLocations(el) {
    var renderList=function(){
      el.innerHTML=`
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-500">Work sites and branches</p>
            <button onclick="schAddLocation()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i>Add Location</button>
          </div>
          <div class="space-y-2">
            ${state.locations.length ? state.locations.map(function(l,i){
              return '<div class="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4">' +
                '<div class="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas fa-map-marker-alt text-blue-500 text-sm"></i></div>' +
                '<div class="flex-1"><p class="font-semibold text-slate-900 text-sm">'+esc(l.name)+'</p><p class="text-xs text-slate-400">'+esc(l.address||'')+'</p></div>' +
                '<button onclick="schDeleteLocation('+i+')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>' +
              '</div>';
            }).join('') : '<div class="text-sm text-slate-400 text-center py-8">No locations yet</div>'}
          </div>
        </div>`;

      window.schDeleteLocation=async function(idx){
        state.locations.splice(idx,1);
        await saveExtended('sch_locations',state.locations);
        toast('Location deleted','info'); renderList();
      };
      window.schAddLocation=function(){
        openModal(
          '<div class="p-5"><h3 class="font-bold text-slate-900 mb-4">Add Location</h3>' +
          '<div class="space-y-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Name</label><input type="text" id="loc-name" class="field text-sm" placeholder="Main Office"></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Address</label><input type="text" id="loc-addr" class="field text-sm" placeholder="Optional"></div>' +
          '</div>' +
          '<div class="flex gap-2 mt-4"><button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>' +
          '<button onclick="schSaveLocation()" class="btn-primary flex-1 text-sm">Save</button></div></div>'
        );
        window.schSaveLocation=async function(){
          var name=(document.getElementById('loc-name')?.value||'').trim();
          if (!name){ toast('Name required','error'); return; }
          state.locations.push({name,address:document.getElementById('loc-addr')?.value||''});
          await saveExtended('sch_locations',state.locations);
          toast('Location saved','success'); schCloseModal(); renderList();
        };
      };
    };
    renderList();
  }

  // ── AVAILABILITY ──────────────────────────────────────────────
  function renderAvailability(el) {
    var DAYS_FULL=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    el.innerHTML=`
      <div class="space-y-4">
        <p class="text-xs text-slate-500">Set which days each employee is available to work.</p>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table class="w-full text-xs">
            <thead><tr class="bg-slate-50 border-b border-slate-100">
              <th class="px-4 py-3 text-left font-bold text-slate-500">Employee</th>
              ${DAYS_FULL.map(function(d){ return '<th class="px-2 py-3 text-center font-bold text-slate-500">'+d.slice(0,3)+'</th>'; }).join('')}
              <th class="px-3 py-3"></th>
            </tr></thead>
            <tbody>
              ${state.users.map(function(u){
                var uid=u.id||u.user_id;
                var avail=state.availability.find(function(a){ return a.user_id===uid; })||{user_id:uid,days:[]};
                return '<tr class="border-t border-slate-100 hover:bg-slate-50">' +
                  '<td class="px-4 py-3 font-semibold text-slate-800">'+esc(u.name||u.email)+'</td>' +
                  DAYS_FULL.map(function(d){
                    return '<td class="px-2 py-3 text-center">' +
                      '<input type="checkbox" class="w-3.5 h-3.5 accent-blue-600" '+(avail.days.includes(d)?'checked':'')+' onchange="schToggleAvail(\''+uid+'\',\''+d+'\',this.checked)">'+
                    '</td>';
                  }).join('')+
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    window.schToggleAvail=async function(uid,day,checked){
      var idx=state.availability.findIndex(function(a){ return a.user_id===uid; });
      if (idx===-1){ state.availability.push({user_id:uid,days:[]}); idx=state.availability.length-1; }
      if (checked){ if (!state.availability[idx].days.includes(day)) state.availability[idx].days.push(day); }
      else { state.availability[idx].days=state.availability[idx].days.filter(function(d){ return d!==day; }); }
      await saveExtended('sch_availability',state.availability);
    };
  }

  // ── TIME OFF ──────────────────────────────────────────────────
  function renderTimeOff(el) {
    var renderList=function(){
      el.innerHTML=`
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-500">Leave and time-off requests</p>
            <button onclick="schAddTimeOff()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i>Request Time Off</button>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-bold">
                <th class="px-4 py-3 text-left">Employee</th><th class="px-4 py-3 text-left">Dates</th>
                <th class="px-4 py-3 text-left">Type</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                ${state.timeoff.length ? state.timeoff.map(function(r,i){
                  return '<tr class="border-t border-slate-100 hover:bg-slate-50">' +
                    '<td class="px-4 py-3 font-semibold text-slate-800">'+esc(r.employee_name||userName(r.employee_id))+'</td>' +
                    '<td class="px-4 py-3 text-slate-500">'+_fmtDate(r.start_date)+' – '+_fmtDate(r.end_date)+'</td>' +
                    '<td class="px-4 py-3 text-slate-600">'+esc(r.type||'—')+'</td>' +
                    '<td class="px-4 py-3">'+_badge(r.status)+'</td>' +
                    '<td class="px-4 py-3"><div class="flex gap-1">' +
                      (r.status==='Pending'?
                        '<button onclick="schApproveTO('+i+')" class="text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg">Approve</button>'+
                        '<button onclick="schRejectTO('+i+')" class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg">Reject</button>'
                      : '<span class="text-xs text-slate-400">'+esc(r.status)+'</span>')+
                    '</div></td></tr>';
                }).join('') : '<tr><td colspan="5" class="text-center text-slate-400 py-8">No time-off requests</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;

      window.schApproveTO=async function(i){ state.timeoff[i].status='Approved'; await saveExtended('sch_timeoff',state.timeoff); renderList(); toast('Approved','success'); };
      window.schRejectTO =async function(i){ state.timeoff[i].status='Rejected'; await saveExtended('sch_timeoff',state.timeoff); renderList(); toast('Rejected','info'); };
      window.schAddTimeOff=function(){
        var empOpts=state.users.map(function(u){ var uid=u.id||u.user_id; return '<option value="'+uid+'" data-name="'+(u.name||u.email)+'">'+(u.name||u.email)+'</option>'; }).join('');
        openModal(
          '<div class="p-5"><h3 class="font-bold text-slate-900 mb-4">Request Time Off</h3>' +
          '<div class="space-y-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Employee</label><select id="to-emp" class="field text-sm"><option value="">Select…</option>'+empOpts+'</select></div>' +
            '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">From</label><input type="date" id="to-start" class="field text-sm"></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">To</label><input type="date" id="to-end" class="field text-sm"></div></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Type</label>' +
              '<select id="to-type" class="field text-sm"><option>Vacation</option><option>Sick</option><option>Personal</option><option>Other</option></select></div>' +
          '</div>' +
          '<div class="flex gap-2 mt-4"><button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>' +
          '<button onclick="schSaveTimeOff()" class="btn-primary flex-1 text-sm">Submit</button></div></div>'
        );
        window.schSaveTimeOff=async function(){
          var empEl=document.getElementById('to-emp');
          state.timeoff.push({ employee_id:empEl?.value, employee_name:empEl?.options[empEl.selectedIndex]?.dataset?.name||'',
            start_date:document.getElementById('to-start')?.value, end_date:document.getElementById('to-end')?.value,
            type:document.getElementById('to-type')?.value, status:'Pending' });
          await saveExtended('sch_timeoff',state.timeoff);
          toast('Submitted','success'); schCloseModal(); renderList();
        };
      };
    };
    renderList();
  }

  // ── SWAPS ─────────────────────────────────────────────────────
  function renderSwaps(el) {
    var renderList=function(){
      el.innerHTML=`
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-500">Shift swap requests between employees</p>
            <button onclick="schAddSwap()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i>Request Swap</button>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-bold">
                <th class="px-4 py-3 text-left">Requested By</th><th class="px-4 py-3 text-left">Date & Shift</th>
                <th class="px-4 py-3 text-left">Replacement</th><th class="px-4 py-3 text-left">Status</th><th class="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                ${state.swaps.length ? state.swaps.map(function(r,i){
                  return '<tr class="border-t border-slate-100 hover:bg-slate-50">' +
                    '<td class="px-4 py-3 font-semibold text-slate-800">'+esc(r.requested_by_name||userName(r.requested_by_id))+'</td>' +
                    '<td class="px-4 py-3 text-slate-500">'+String(r.swap_date||'').substring(0,10)+' · '+esc(r.shift_name||'')+'</td>' +
                    '<td class="px-4 py-3">'+esc(r.replacement_name||userName(r.replacement_id))+'</td>' +
                    '<td class="px-4 py-3">'+_badge(r.status)+'</td>' +
                    '<td class="px-4 py-3">'+(r.status==='Pending'?
                      '<div class="flex gap-1"><button onclick="schApproveSwap('+i+')" class="bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-lg">Approve</button>' +
                      '<button onclick="schRejectSwap('+i+')" class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-2 py-1 rounded-lg">Reject</button></div>'
                      :'<span class="text-xs text-slate-400">'+esc(r.status)+'</span>')+
                    '</td></tr>';
                }).join('') : '<tr><td colspan="5" class="text-center text-slate-400 py-8">No swap requests</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;

      window.schApproveSwap=async function(i){ state.swaps[i].status='Approved'; await saveExtended('sch_swaps',state.swaps); renderList(); toast('Swap approved','success'); };
      window.schRejectSwap =async function(i){ state.swaps[i].status='Rejected'; await saveExtended('sch_swaps',state.swaps); renderList(); toast('Swap rejected','info'); };
      window.schAddSwap=function(){
        var empOpts=state.users.map(function(u){ var uid=u.id||u.user_id; return '<option value="'+uid+'" data-name="'+(u.name||u.email)+'">'+(u.name||u.email)+'</option>'; }).join('');
        openModal(
          '<div class="p-5"><h3 class="font-bold text-slate-900 mb-4">Request Shift Swap</h3>' +
          '<div class="space-y-3">' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Requesting Employee</label><select id="sw-req" class="field text-sm"><option value="">Select…</option>'+empOpts+'</select></div>' +
            '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">Shift Date</label><input type="date" id="sw-date" class="field text-sm" value="'+_today()+'"></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Shift Name</label><input type="text" id="sw-shift" class="field text-sm" placeholder="e.g. Morning"></div></div>' +
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1">Replacement Employee</label><select id="sw-rep" class="field text-sm"><option value="">Select…</option>'+empOpts+'</select></div>' +
          '</div>' +
          '<div class="flex gap-2 mt-4"><button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>' +
          '<button onclick="schSaveSwap()" class="btn-primary flex-1 text-sm">Submit</button></div></div>'
        );
        window.schSaveSwap=async function(){
          var reqEl=document.getElementById('sw-req'), repEl=document.getElementById('sw-rep');
          state.swaps.push({ requested_by_id:reqEl?.value, requested_by_name:reqEl?.options[reqEl.selectedIndex]?.dataset?.name||'',
            replacement_id:repEl?.value, replacement_name:repEl?.options[repEl.selectedIndex]?.dataset?.name||'',
            swap_date:document.getElementById('sw-date')?.value, shift_name:document.getElementById('sw-shift')?.value, status:'Pending' });
          await saveExtended('sch_swaps',state.swaps);
          toast('Swap requested','success'); schCloseModal(); renderList();
        };
      };
    };
    renderList();
  }

  // ── OVERTIME ─────────────────────────────────────────────────
  function renderOvertime(el) {
    var rules=state.otRules;
    el.innerHTML=`
      <div class="max-w-lg space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center"><i class="fas fa-exclamation-triangle text-red-500"></i></div>
            <div><h3 class="font-bold text-slate-900">Overtime Rules</h3><p class="text-xs text-slate-500">Alerts fire when limits are exceeded during shift creation</p></div>
          </div>
          <div class="space-y-4">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Max Daily Hours</label>
              <div class="flex items-center gap-2"><input type="number" id="ot-daily" class="field text-sm w-24" value="${rules.max_daily_hours||12}" min="1" max="24"><span class="text-xs text-slate-400">hours/day</span></div></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Max Weekly Hours</label>
              <div class="flex items-center gap-2"><input type="number" id="ot-weekly" class="field text-sm w-24" value="${rules.max_weekly_hours||40}" min="1" max="168"><span class="text-xs text-slate-400">hours/week</span></div></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Min Rest Between Shifts</label>
              <div class="flex items-center gap-2"><input type="number" id="ot-rest" class="field text-sm w-24" value="${rules.min_rest_hours||8}" min="0"><span class="text-xs text-slate-400">hours</span></div></div>
            <div id="ot-status"></div>
            <button onclick="schSaveOT()" class="btn-primary w-full text-sm"><i class="fas fa-save text-xs mr-1"></i>Save Rules</button>
          </div>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700">
          <i class="fas fa-info-circle mr-1"></i>Rules are stored in your Supabase config and checked when creating shifts.
        </div>
      </div>`;

    window.schSaveOT=async function(){
      var statusEl=document.getElementById('ot-status');
      try {
        state.otRules={ max_daily_hours:document.getElementById('ot-daily')?.value, max_weekly_hours:document.getElementById('ot-weekly')?.value, min_rest_hours:document.getElementById('ot-rest')?.value };
        await saveExtended('sch_ot_rules',state.otRules);
        statusEl.innerHTML='<div class="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl px-3 py-2 mb-2"><i class="fas fa-check-circle mr-1"></i>Rules saved</div>';
        toast('Overtime rules saved','success');
      } catch(e){ statusEl.innerHTML='<div class="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-2">'+e.message+'</div>'; }
    };
  }

  // ── Boot ──────────────────────────────────────────────────────
  render();
};
