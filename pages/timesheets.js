window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['timesheets'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var db           = window.WorkVoltDB;
  var sheets       = {};
  var usersCache   = [];
  var projectsCache = [];
  var activeView   = sessionStorage.getItem('ts_view') || 'list';
  var filters      = { status:'', user_id:'', project_id:'', billable:'' };
  var _searchVal   = '';
  var _searchTimer = null;
  var sortState    = { col:'date', dir:'desc' };
  var _timerEntry  = null;
  var _timerStart  = null;
  var _timerTick   = null;
  var _weekOffset  = 0;

  var MODAL_ID = 'ts-modal-root';
  var STATUSES = ['Draft','Submitted','Approved','Rejected'];
  var STATUS_CONFIG = {
    'Draft':     { bg:'bg-slate-100',  text:'text-slate-600',  icon:'fa-pencil'      },
    'Submitted': { bg:'bg-blue-100',   text:'text-blue-700',   icon:'fa-paper-plane' },
    'Approved':  { bg:'bg-green-100',  text:'text-green-700',  icon:'fa-check-circle'},
    'Rejected':  { bg:'bg-red-100',    text:'text-red-600',    icon:'fa-times-circle'},
  };

  function getRole()  { try { return window.WorkVolt.user().role||'Employee'; } catch(e) { return 'Employee'; } }
  function isAdmin()  { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function myUserId() { try { return window.WorkVolt.user().id||''; } catch(e) { return ''; } }
  function myName()   { try { return window.WorkVolt.user().name||''; } catch(e) { return ''; } }
  function toast(msg,type) { window.WorkVolt?.toast(msg,type||'info'); }

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch(e) { return d; }
  }
  function fmtHours(h) {
    var n = parseFloat(h)||0; if (!n) return '0h';
    var hrs=Math.floor(n), mins=Math.round((n-hrs)*60);
    return hrs+'h'+(mins?' '+mins+'m':'');
  }
  function fmtMoney(v) { return '$'+(parseFloat(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function todayStr() { return new Date().toISOString().split('T')[0]; }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u){ return u.id===uid||u.user_id===uid; });
    return u ? (u.name||u.email||uid) : uid;
  }
  function userAvatar(uid, size) {
    size=size||'w-7 h-7 text-[11px]';
    var colors=['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
    var idx=uid?(uid.charCodeAt(0)%colors.length):0;
    var init=(userName(uid)||'?').charAt(0).toUpperCase();
    return '<span class="'+size+' '+colors[idx]+' rounded-full flex items-center justify-center font-bold flex-shrink-0" title="'+esc(userName(uid))+'">'+init+'</span>';
  }
  function projectName(pid) {
    if (!pid) return '—';
    var p=projectsCache.find(function(p){ return p.id===pid; });
    return p?(p.name||pid):pid;
  }
  function calcHours(start, end, breakMins) {
    if (!start||!end) return 0;
    var toMins=function(t){ var m=String(t).match(/^(\d{1,2}):(\d{2})/); return m?parseInt(m[1])*60+parseInt(m[2]):null; };
    var s=toMins(start), e=toMins(end);
    if (s===null||e===null) return 0;
    var diff=(e-s)/60; if (diff<=0) diff+=24;
    diff-=(parseFloat(breakMins)||0)/60;
    return Math.max(0,Math.round(diff*100)/100);
  }
  function statusBadge(s) {
    var cfg=STATUS_CONFIG[s]||{bg:'bg-slate-100',text:'text-slate-600',icon:'fa-circle'};
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold '+cfg.bg+' '+cfg.text+'"><i class="fas '+cfg.icon+' text-[9px]"></i>'+esc(s||'—')+'</span>';
  }

  // ── Modal ──────────────────────────────────────────────────────
  function showModal(html, width) {
    var root=document.getElementById(MODAL_ID); if (!root) return;
    root.innerHTML='<div class="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="if(event.target===this)closeTSModal()"><div class="bg-white w-full sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]" style="max-width:'+(width||'540px')+'">'+html+'</div></div>';
  }
  function closeTSModal() { var r=document.getElementById(MODAL_ID); if (r) r.innerHTML=''; }
  window.closeTSModal=closeTSModal;
  function modalStatus(msg, ok) {
    var el=document.getElementById('ts-modal-status'); if (!el) return;
    el.innerHTML='<div class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium my-2 '+(ok?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-600 border border-red-200')+'"><i class="fas '+(ok?'fa-check-circle':'fa-exclamation-circle')+'"></i><span>'+msg+'</span></div>';
  }

  // ── Load ───────────────────────────────────────────────────────
  async function loadData() {
    try {
      var filter = isAdmin() ? {} : { employee_id: myUserId() };
      var [tsRows, userRows, projRows] = await Promise.all([
        db.timesheets.list(filter),
        db.users.list(),
        (window.INSTALLED_MODULES||[]).some(function(m){return m.id==='projects';})
          ? db.projects.list() : Promise.resolve([]),
      ]);
      sheets={};
      tsRows.forEach(function(t){ sheets[t.id]=t; });
      usersCache=userRows;
      projectsCache=projRows;
      rerender();
    } catch(e) { toast('Failed to load timesheets: '+e.message,'error'); }
  }

  // ── Shell ──────────────────────────────────────────────────────
  function render() {
    container.innerHTML=`
      <div class="p-4 md:p-6 fade-in max-w-7xl mx-auto">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fas fa-clock text-white"></i>
            </div>
            <div>
              <h1 class="text-xl font-extrabold text-slate-900">Timesheets</h1>
              <p class="text-xs text-slate-500" id="ts-subtitle">Loading…</p>
            </div>
          </div>
          <div class="flex gap-2 items-center flex-wrap">
            <!-- Timer pill -->
            <div id="ts-timer-pill" class="hidden items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
              <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span id="ts-timer-display" class="text-xs font-bold text-red-600 font-mono">00:00:00</span>
              <button id="ts-timer-stop" class="text-xs text-red-600 hover:text-red-800 font-semibold"><i class="fas fa-stop text-[10px]"></i></button>
            </div>
            <!-- View switcher -->
            <div class="flex gap-1 bg-slate-100 rounded-xl p-1">
              ${[['list','fa-list'],['weekly','fa-calendar-week']].map(function(v){
                return '<button onclick="tsSetView(\''+v[0]+'\')" id="tsv-'+v[0]+'" title="'+v[0]+'" class="px-2.5 py-1.5 rounded-lg text-xs transition-all '+(activeView===v[0]?'bg-white text-blue-600 shadow-sm font-semibold':'text-slate-500 hover:text-slate-700')+'"><i class="fas '+v[1]+'"></i></button>';
              }).join('')}
            </div>
            <button id="ts-timer-start-btn" onclick="tsStartTimer()" class="btn-secondary text-xs px-3 py-2 gap-1.5">
              <i class="fas fa-stopwatch text-xs"></i> Start Timer
            </button>
            <button onclick="tsOpenNew()" class="btn-primary text-xs px-3 py-2 gap-1.5">
              <i class="fas fa-plus text-xs"></i> Log Time
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-2 mb-4">
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" placeholder="Search…" value="${esc(_searchVal)}" oninput="tsSearch(this.value)"
              class="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
          </div>
          <select onchange="tsFilter('status',this.value)" class="field text-xs py-2 px-3 w-auto">
            ${['','Draft','Submitted','Approved','Rejected'].map(function(s){ return '<option value="'+s+'"'+(filters.status===s?' selected':'')+'>'+(s||'All Statuses')+'</option>'; }).join('')}
          </select>
          ${isAdmin() ? '<select onchange="tsFilter(\'user_id\',this.value)" class="field text-xs py-2 px-3 w-auto"><option value="">All Users</option></select>' : ''}
          <button onclick="tsResetFilters()" class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"><i class="fas fa-times mr-1"></i>Clear</button>
        </div>

        <!-- Summary cards -->
        <div id="ts-summary-cards" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"></div>

        <!-- Content -->
        <div id="ts-content">
          <div class="flex items-center justify-center py-16"><i class="fas fa-circle-notch fa-spin text-2xl text-amber-500 opacity-60"></i></div>
        </div>

        <div id="${MODAL_ID}"></div>
      </div>`;

    window.tsSetView=function(v){ activeView=v; sessionStorage.setItem('ts_view',v); rerender(); };
    window.tsSearch=function(v){ _searchVal=v; clearTimeout(_searchTimer); _searchTimer=setTimeout(rerender,250); };
    window.tsFilter=function(k,v){ filters[k]=v; rerender(); };
    window.tsResetFilters=function(){ filters={status:'',user_id:'',project_id:'',billable:''}; _searchVal=''; rerender(); };

    loadData();
    restoreTimer();
  }

  function rerender() {
    updateSummaryCards();
    var el=document.getElementById('ts-content'); if (!el) return;
    var rows=getFiltered();
    if (activeView==='weekly') renderWeekly(el, rows);
    else renderList(el, rows);
  }

  function getFiltered() {
    var rows=Object.values(sheets);
    if (!isAdmin()) rows=rows.filter(function(r){ return r.employee_id===myUserId(); });
    if (filters.status)   rows=rows.filter(function(r){ return r.status===filters.status; });
    if (filters.user_id)  rows=rows.filter(function(r){ return r.employee_id===filters.user_id; });
    if (filters.billable) rows=rows.filter(function(r){ return String(r.billable)===filters.billable; });
    if (_searchVal) {
      var q=_searchVal.toLowerCase();
      rows=rows.filter(function(r){ return (r.task||'').toLowerCase().includes(q)||(r.description||'').toLowerCase().includes(q); });
    }
    return rows.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
  }

  function updateSummaryCards() {
    var el=document.getElementById('ts-summary-cards'); if (!el) return;
    var rows=Object.values(sheets);
    if (!isAdmin()) rows=rows.filter(function(r){ return r.employee_id===myUserId(); });
    var total  = rows.reduce(function(s,r){ return s+(parseFloat(r.hours)||0); },0);
    var billH  = rows.filter(function(r){ return String(r.billable)==='true'; }).reduce(function(s,r){ return s+(parseFloat(r.hours)||0); },0);
    var pending= rows.filter(function(r){ return r.status==='Submitted'; }).length;
    var todayH = rows.filter(function(r){ return r.date===todayStr(); }).reduce(function(s,r){ return s+(parseFloat(r.hours)||0); },0);

    el.innerHTML=[
      {label:'Total Hours',   val:fmtHours(total),   icon:'fa-clock',      color:'blue'},
      {label:'Billable',      val:fmtHours(billH),   icon:'fa-dollar-sign',color:'green'},
      {label:'Pending Review',val:pending,            icon:'fa-hourglass',  color:'amber'},
      {label:'Today',         val:fmtHours(todayH),  icon:'fa-calendar-day',color:'violet'},
    ].map(function(k){
      return '<div class="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">' +
        '<div class="w-10 h-10 bg-'+k.color+'-100 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas '+k.icon+' text-'+k.color+'-500"></i></div>' +
        '<div><div class="text-2xl font-extrabold text-slate-900">'+k.val+'</div><div class="text-xs text-slate-500">'+k.label+'</div></div></div>';
    }).join('');

    var sub=document.getElementById('ts-subtitle');
    if (sub) sub.textContent=rows.length+' entries · '+fmtHours(total)+' total';
  }

  // ── LIST VIEW ──────────────────────────────────────────────────
  function renderList(el, rows) {
    if (!rows.length) {
      el.innerHTML='<div class="flex flex-col items-center justify-center py-16 text-slate-400"><i class="fas fa-clock text-4xl mb-3 opacity-30"></i><p class="font-semibold">No entries found</p></div>';
      return;
    }
    el.innerHTML='<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div class="overflow-x-auto">' +
      '<table class="w-full text-left">' +
      '<thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">' +
        (isAdmin()?'<th class="px-4 py-3">Employee</th>':'')+
        '<th class="px-4 py-3">Date</th><th class="px-4 py-3">Task</th><th class="px-4 py-3">Hours</th>' +
        '<th class="px-4 py-3">Status</th><th class="px-4 py-3">Billable</th><th class="px-4 py-3"></th>' +
      '</tr></thead><tbody>' +
      rows.map(function(r){
        return '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">' +
          (isAdmin()?'<td class="px-4 py-3"><div class="flex items-center gap-2">'+userAvatar(r.employee_id)+'<span class="text-sm font-medium text-slate-700">'+esc(r.employee_name||userName(r.employee_id))+'</span></div></td>':'')+
          '<td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">'+fmtDate(r.date)+'</td>' +
          '<td class="px-4 py-3 min-w-0"><p class="text-sm font-semibold text-slate-900 truncate max-w-[180px]">'+esc(r.task||'—')+'</p>' +
            (r.description?'<p class="text-xs text-slate-400 truncate max-w-[180px]">'+esc(r.description)+'</p>':'')+
          '</td>' +
          '<td class="px-4 py-3"><span class="text-sm font-bold text-slate-800">'+fmtHours(r.hours)+'</span></td>' +
          '<td class="px-4 py-3">'+statusBadge(r.status)+'</td>' +
          '<td class="px-4 py-3">'+(String(r.billable)==='true'?'<span class="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Billable</span>':'<span class="text-xs text-slate-400">—</span>')+'</td>' +
          '<td class="px-4 py-3"><div class="flex gap-1">' +
            '<button onclick="tsOpenEdit(\''+r.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-pencil text-xs"></i></button>' +
            (isAdmin()&&r.status==='Submitted'?'<button onclick="tsApprove(\''+r.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50"><i class="fas fa-check text-xs"></i></button>':'')+
            (isAdmin()&&r.status==='Submitted'?'<button onclick="tsOpenReject(\''+r.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-times text-xs"></i></button>':'')+
            (!isAdmin()&&r.status==='Draft'?'<button onclick="tsSubmit(\''+r.id+'\')" class="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors">Submit</button>':'')+
            '<button onclick="tsConfirmDelete(\''+r.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>' +
          '</div></td></tr>';
      }).join('')+
      '</tbody></table></div></div>';
  }

  // ── WEEKLY VIEW ────────────────────────────────────────────────
  function renderWeekly(el, rows) {
    var ws=getWeekStart(_weekOffset);
    var days=[0,1,2,3,4,5,6].map(function(i){ var d=new Date(ws); d.setDate(d.getDate()+i); return d; });
    var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    el.innerHTML='<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<button onclick="tsWeekNav(-1)" class="btn-secondary text-xs px-3 py-2"><i class="fas fa-chevron-left"></i></button>' +
        '<span class="text-sm font-bold text-slate-700">' +
          days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+' — '+days[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+
        '</span>' +
        '<button onclick="tsWeekNav(1)" class="btn-secondary text-xs px-3 py-2"><i class="fas fa-chevron-right"></i></button>' +
      '</div>' +
      '<div class="grid grid-cols-7 gap-2">' +
        days.map(function(d){
          var ds=d.toISOString().split('T')[0];
          var isToday=ds===todayStr();
          var dayRows=rows.filter(function(r){ return r.date===ds; });
          var tot=dayRows.reduce(function(s,r){ return s+(parseFloat(r.hours)||0); },0);
          return '<div class="bg-white rounded-xl border '+(isToday?'border-blue-400':'border-slate-200')+' p-2 min-h-[120px]">' +
            '<div class="text-center mb-2">' +
              '<p class="text-[10px] font-bold text-slate-400 uppercase">'+DAYS[d.getDay()]+'</p>' +
              '<p class="text-sm font-extrabold '+(isToday?'text-blue-600':'text-slate-800')+'">'+d.getDate()+'</p>' +
              (tot?'<p class="text-[10px] font-bold text-green-600">'+fmtHours(tot)+'</p>':'') +
            '</div>' +
            dayRows.slice(0,3).map(function(r){
              return '<div class="text-[10px] px-1.5 py-1 rounded-lg bg-amber-50 text-amber-700 mb-0.5 truncate cursor-pointer" onclick="tsOpenEdit(\''+r.id+'\')">'+esc(r.task||'—')+'</div>';
            }).join('')+
            '<button onclick="tsOpenNewDate(\''+ds+'\')" class="w-full mt-1 text-[10px] text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg py-1 transition-colors flex items-center justify-center gap-1"><i class="fas fa-plus text-[9px]"></i>Log</button>' +
          '</div>';
        }).join('')+
      '</div></div>';

    window.tsWeekNav=function(dir){ _weekOffset+=dir; rerender(); };
  }
  function getWeekStart(offset) {
    var d=new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate()-d.getDay()+(offset*7));
    return d;
  }

  // ── Entry form ─────────────────────────────────────────────────
  window.tsOpenNew     = function(){ openEntryForm({}); };
  window.tsOpenNewDate = function(date){ openEntryForm({date:date}); };
  window.tsOpenEdit    = function(id){ openEntryForm(sheets[id]||{}); };

  function openEntryForm(prefill) {
    var isEdit = !!(prefill&&prefill.id);
    var v      = function(f){ return isEdit&&prefill[f]!=null ? esc(String(prefill[f])) : ''; };
    var userOpts = isAdmin() ? usersCache.map(function(u){
      var uid=u.id||u.user_id;
      return '<option value="'+uid+'"'+(isEdit&&prefill.employee_id===uid?' selected':'')+(uid===myUserId()&&!isEdit?' selected':'')+'>'+esc(u.name||u.email)+'</option>';
    }).join('') : '';
    var projOpts = projectsCache.map(function(p){
      return '<option value="'+p.id+'"'+(isEdit&&prefill.project===p.id?' selected':'')+'>'+esc(p.name)+'</option>';
    }).join('');

    showModal(
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900">'+(isEdit?'Edit Entry':'Log Time')+'</h3>' +
        '<button onclick="closeTSModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div id="ts-modal-status"></div>' +
        (isAdmin()?'<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Employee</label><select id="tf-user" class="field text-sm"><option value="">— Select —</option>'+userOpts+'</select></div>':'')+
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Date <span class="text-red-500">*</span></label>' +
            '<input id="tf-date" type="date" class="field text-sm" value="'+(v('date')||prefill.date||todayStr())+'"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Hours <span class="text-red-500">*</span></label>' +
            '<input id="tf-hours" type="number" step="0.25" min="0" class="field text-sm" placeholder="0.00" value="'+v('hours')+'"></div>' +
        '</div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Task <span class="text-red-500">*</span></label>' +
          '<input id="tf-task" type="text" class="field text-sm" placeholder="What did you work on?" value="'+v('task')+'"></div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>' +
          '<textarea id="tf-desc" class="field text-sm" rows="2" placeholder="Optional details…">'+v('description')+'</textarea></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          (projOpts?'<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Project</label><select id="tf-project" class="field text-sm"><option value="">— None —</option>'+projOpts+'</select></div>':'<div></div>')+
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Billable</label>' +
            '<select id="tf-billable" class="field text-sm">' +
              '<option value="false"'+(v('billable')==='true'?'':' selected')+'>Not Billable</option>' +
              '<option value="true"'+(v('billable')==='true'?' selected':'')+'>Billable</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="flex gap-3 pt-2">' +
          '<button onclick="closeTSModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tf-save" onclick="tsSubmitForm(\''+( isEdit?prefill.id:'')+'\')" class="btn-primary flex-1">' +
            '<i class="fas '+(isEdit?'fa-save':'fa-clock')+' text-xs mr-1"></i>'+(isEdit?'Save Changes':'Log Entry') +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  window.tsSubmitForm = async function(entryId) {
    var isEdit=!!entryId;
    var userId=isAdmin()?(document.getElementById('tf-user')?.value||myUserId()):myUserId();
    var date  =(document.getElementById('tf-date')?.value||'').trim();
    var hours =document.getElementById('tf-hours')?.value;
    var task  =(document.getElementById('tf-task')?.value||'').trim();

    if (!date)  { modalStatus('Date is required.',false);  return; }
    if (!task)  { modalStatus('Task is required.',false);  return; }
    if (!hours) { modalStatus('Hours is required.',false); return; }

    var btn=document.getElementById('tf-save');
    if (btn){ btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…'; }

    var emp=usersCache.find(function(u){ return (u.id||u.user_id)===userId; });
    var patch={
      employee_id:  userId,
      employee_name:emp?(emp.name||emp.email):'',
      date,
      hours:        parseFloat(hours)||0,
      task,
      description:  document.getElementById('tf-desc')?.value||'',
      project:      document.getElementById('tf-project')?.value||null,
      billable:     document.getElementById('tf-billable')?.value==='true',
      status:       isEdit?(sheets[entryId]?.status||'Draft'):'Draft',
    };
    if (!isEdit) patch.created_by=myUserId();

    try {
      if (isEdit) {
        await db.timesheets.update(entryId, patch);
        sheets[entryId]=Object.assign({},sheets[entryId],patch);
        modalStatus('Saved!',true);
      } else {
        var created=await db.timesheets.create(patch);
        sheets[created.id]=created;
        modalStatus('Time logged!',true);
      }
      setTimeout(function(){ closeTSModal(); rerender(); },600);
    } catch(e) {
      modalStatus(e.message,false);
      if (btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-'+(isEdit?'save':'clock')+' text-xs mr-1"></i>'+(isEdit?'Save Changes':'Log Entry'); }
    }
  };

  window.tsApprove = async function(id) {
    try {
      await db.timesheets.approve(id, myUserId());
      if (sheets[id]) sheets[id].status='Approved';
      toast('Entry approved!','success');
      rerender();
    } catch(e){ toast(e.message,'error'); }
  };

  window.tsOpenReject = function(id) {
    showModal(
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-red-600">Reject Entry</h3>' +
        '<button onclick="closeTSModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div id="ts-modal-status"></div>' +
        '<label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Reason for rejection</label>' +
        '<textarea id="rj-reason" rows="3" class="field text-sm" placeholder="Explain why…"></textarea>' +
        '<div class="flex gap-3">' +
          '<button onclick="closeTSModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button onclick="tsDoReject(\''+id+'\')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold">' +
            '<i class="fas fa-times text-xs"></i>Reject Entry' +
          '</button>' +
        '</div>' +
      '</div>', '480px'
    );
  };

  window.tsDoReject = async function(id) {
    try {
      await db.timesheets.update(id,{ status:'Rejected', approved_by: myUserId() });
      if (sheets[id]) sheets[id].status='Rejected';
      toast('Entry rejected.','info');
      closeTSModal();
      rerender();
    } catch(e){ toast(e.message,'error'); }
  };

  window.tsSubmit = async function(id) {
    try {
      await db.timesheets.update(id,{status:'Submitted'});
      if (sheets[id]) sheets[id].status='Submitted';
      toast('Submitted for approval','success');
      rerender();
    } catch(e){ toast(e.message,'error'); }
  };

  window.tsConfirmDelete = function(id) {
    if (!confirm('Delete this timesheet entry? This cannot be undone.')) return;
    db.timesheets.delete(id).then(function(){
      delete sheets[id];
      toast('Entry deleted.','info');
      rerender();
    }).catch(function(e){ toast(e.message,'error'); });
  };

  // ── Timer ──────────────────────────────────────────────────────
  window.tsStartTimer = function() {
    _timerStart=new Date();
    _timerEntry={};
    try { localStorage.setItem('wv_ts_timer_'+myUserId(), _timerStart.toISOString()); } catch(e){}
    if (_timerTick) clearInterval(_timerTick);
    _timerTick=setInterval(tickTimer,1000);
    updateTimerUI(true);
  };
  function restoreTimer() {
    try {
      var s=localStorage.getItem('wv_ts_timer_'+myUserId());
      if (s) { _timerStart=new Date(s); _timerEntry={}; if (_timerTick) clearInterval(_timerTick); _timerTick=setInterval(tickTimer,1000); updateTimerUI(true); }
    } catch(e){}
  }
  function tickTimer() {
    if (!_timerStart) return;
    var elapsed=Math.floor((Date.now()-_timerStart.getTime())/1000);
    var h=Math.floor(elapsed/3600),m=Math.floor((elapsed%3600)/60),s=elapsed%60;
    var el=document.getElementById('ts-timer-display');
    if (el) el.textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  function stopTimer() {
    if (!_timerStart) return;
    clearInterval(_timerTick);
    var end=new Date();
    var elapsed=(end-_timerStart)/3600000;
    try { localStorage.removeItem('wv_ts_timer_'+myUserId()); } catch(e){}
    _timerStart=null; _timerEntry=null;
    updateTimerUI(false);
    openEntryForm({
      date:end.toISOString().split('T')[0],
      hours:Math.round(elapsed*100)/100,
    });
  }
  function updateTimerUI(running) {
    var pill=document.getElementById('ts-timer-pill');
    var startBtn=document.getElementById('ts-timer-start-btn');
    if (pill){ pill.style.display=running?'flex':'none'; if(running) pill.classList.remove('hidden'); else pill.classList.add('hidden'); }
    if (startBtn) startBtn.style.display=running?'none':'flex';
    var stopBtn=document.getElementById('ts-timer-stop');
    if (stopBtn){ stopBtn.onclick=null; if(running) stopBtn.addEventListener('click',stopTimer); }
  }

  // ── Boot ──────────────────────────────────────────────────────
  var old=document.getElementById(MODAL_ID);
  if (old) old.innerHTML='';
  render();
};
