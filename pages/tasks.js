window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['tasks'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var db            = window.WorkVoltDB;
  var tasksCache    = {};
  var usersCache    = [];
  var projectsCache = [];
  var activeView    = sessionStorage.getItem('tasks_view') || 'list';
  var filters       = { status:'', priority:'', assignee:'', project:'', quick:'' };
  var sortState     = { col:'', dir:'asc' };
  var collapseDone  = false;
  var _searchTimer  = null;
  var _searchVal    = '';
  var _dragId       = null;

  var STATUSES   = ['To Do','In Progress','In Review','Done','Cancelled'];
  var PRIORITIES = ['Low','Medium','High','Urgent'];

  var STATUS_COLORS = {
    'To Do':       'bg-slate-100 text-slate-600',
    'In Progress': 'bg-blue-100 text-blue-700',
    'In Review':   'bg-purple-100 text-purple-700',
    'Done':        'bg-green-100 text-green-700',
    'Cancelled':   'bg-red-100 text-red-600',
  };
  var STATUS_ICON = {
    'To Do':'fa-circle', 'In Progress':'fa-spinner', 'In Review':'fa-eye',
    'Done':'fa-check-circle', 'Cancelled':'fa-ban',
  };
  var PRIORITY_COLORS = {
    'Low':'bg-slate-100 text-slate-500', 'Medium':'bg-amber-100 text-amber-700',
    'High':'bg-orange-100 text-orange-700', 'Urgent':'bg-red-100 text-red-600',
  };
  var PRIORITY_DOT = { 'Low':'#94a3b8','Medium':'#f59e0b','High':'#f97316','Urgent':'#ef4444' };
  var KANBAN_COLORS = {
    'To Do':       { dot:'bg-slate-400',  head:'bg-slate-50',  border:'border-slate-200'  },
    'In Progress': { dot:'bg-blue-500',   head:'bg-blue-50',   border:'border-blue-200'   },
    'In Review':   { dot:'bg-purple-500', head:'bg-purple-50', border:'border-purple-200' },
    'Done':        { dot:'bg-green-500',  head:'bg-green-50',  border:'border-green-200'  },
    'Cancelled':   { dot:'bg-red-400',    head:'bg-red-50',    border:'border-red-200'    },
  };

  var MODAL_ID = 'tasks-modal-root';

  function getRole()  { try { return window.WorkVolt.user().role || 'Employee'; } catch(e) { return 'Employee'; } }
  function isAdmin()  { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function myUserId() { try { return window.WorkVolt.user().id || ''; } catch(e) { return ''; } }

  // ── Utilities ──────────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch(e) { return d; }
  }
  function toast(msg, type) { window.WorkVolt?.toast(msg, type||'info'); }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u){ return u.id===uid||u.user_id===uid; });
    return u ? (u.name||u.email||uid) : uid;
  }
  function userInitial(uid) { return userName(uid).charAt(0).toUpperCase()||'?'; }
  function userAvatar(uid, size) {
    size = size||'w-6 h-6 text-[10px]';
    var colors = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
    var idx = uid ? (uid.charCodeAt(0)%colors.length) : 0;
    return '<span class="'+size+' '+colors[idx]+' rounded-full flex items-center justify-center font-bold flex-shrink-0" title="'+esc(userName(uid))+'">'+userInitial(uid)+'</span>';
  }
  function projectName(pid) {
    if (!pid) return pid;
    var p = projectsCache.find(function(p){ return p.id===pid; });
    return p ? (p.name||pid) : pid;
  }
  function statusBadge(s) {
    var c = STATUS_COLORS[s]||'bg-slate-100 text-slate-600';
    var i = STATUS_ICON[s]||'fa-circle';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold '+c+'"><i class="fas '+i+' text-[9px]"></i>'+esc(s||'—')+'</span>';
  }
  function priorityBadge(p) {
    var c = PRIORITY_COLORS[p]||'bg-slate-100 text-slate-500';
    var d = PRIORITY_DOT[p]||'#94a3b8';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold '+c+'"><span style="width:6px;height:6px;border-radius:50%;background:'+d+';flex-shrink:0"></span>'+esc(p||'—')+'</span>';
  }
  function isOverdue(t) {
    return t.due_date && t.status !== 'Done' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date();
  }

  // ── Modal ──────────────────────────────────────────────────────
  function showModal(html, width) {
    var root = document.getElementById(MODAL_ID);
    if (!root) return;
    root.innerHTML = '<div class="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" id="tasks-modal-bg" onclick="if(event.target===this)closeTModal()">' +
      '<div class="bg-white w-full sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]" style="max-width:' + (width||'540px') + '">' + html + '</div></div>';
  }
  function closeTModal() {
    var root = document.getElementById(MODAL_ID);
    if (root) root.innerHTML = '';
  }
  window.closeTModal = closeTModal;
  function modalStatus(msg, ok) {
    var el = document.getElementById('tm-status');
    if (!el) return;
    el.innerHTML = '<div class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium my-2 '+(ok?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-600 border border-red-200')+'"><i class="fas '+(ok?'fa-check-circle':'fa-exclamation-circle')+'"></i><span>'+msg+'</span></div>';
  }

  // ── Load data ──────────────────────────────────────────────────
  async function loadData() {
    try {
      var [taskRows, userRows, projRows] = await Promise.all([
        db.tasks.list(),
        db.users.list(),
        (window.INSTALLED_MODULES||[]).some(function(m){return m.id==='projects';})
          ? db.projects.list()
          : Promise.resolve([]),
      ]);
      tasksCache = {};
      taskRows.forEach(function(t){ tasksCache[t.id] = t; });
      usersCache    = userRows;
      projectsCache = projRows;
      rerender();
    } catch(e) {
      toast('Failed to load tasks: ' + e.message, 'error');
    }
  }

  // ── Main render shell ──────────────────────────────────────────
  function render() {
    container.innerHTML = `
      <div class="p-4 md:p-6 fade-in max-w-7xl mx-auto">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fas fa-check-circle text-white"></i>
            </div>
            <div>
              <h1 class="text-xl font-extrabold text-slate-900 leading-tight">Tasks</h1>
              <p class="text-xs text-slate-500" id="tasks-subtitle">Loading…</p>
            </div>
          </div>
          <div class="flex gap-2 items-center flex-wrap">
            <!-- View switcher -->
            <div class="flex gap-1 bg-slate-100 rounded-xl p-1">
              ${[['list','fa-list'],['board','fa-columns'],['calendar','fa-calendar-alt']].map(function(v){
                return '<button onclick="tasksSetView(\''+v[0]+'\')" id="tv-'+v[0]+'" title="'+v[0]+'" class="px-2.5 py-1.5 rounded-lg text-xs transition-all '+(activeView===v[0]?'bg-white text-blue-600 shadow-sm font-semibold':'text-slate-500 hover:text-slate-700')+'"><i class="fas '+v[1]+'"></i></button>';
              }).join('')}
            </div>
            <button onclick="tasksOpenNew()" class="btn-primary text-xs px-3 py-2 gap-1.5">
              <i class="fas fa-plus text-xs"></i> New Task
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-2 mb-4">
          <div class="relative flex-1 min-w-[180px] max-w-xs">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" id="tasks-search" placeholder="Search tasks…" value="${esc(_searchVal)}"
              oninput="tasksSearch(this.value)"
              class="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
          </div>
          ${[
            ['status',   'Status',   ['','To Do','In Progress','In Review','Done','Cancelled']],
            ['priority', 'Priority', ['','Low','Medium','High','Urgent']],
          ].map(function(f){
            return '<select onchange="tasksFilter(\''+f[0]+'\',this.value)" class="field text-xs py-2 px-3 w-auto">' +
              f[2].map(function(v){ return '<option value="'+v+'" '+(filters[f[0]]===v?'selected':'')+'>'+( v||f[1])+'</option>'; }).join('') + '</select>';
          }).join('')}
          ${isAdmin() ? '' : ''}
          <button onclick="tasksResetFilters()" class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <i class="fas fa-times mr-1"></i>Clear
          </button>
        </div>

        <!-- Task content -->
        <div id="tasks-content">
          <div class="flex items-center justify-center py-16"><i class="fas fa-circle-notch fa-spin text-2xl text-violet-500 opacity-60"></i></div>
        </div>

        <!-- Modal root -->
        <div id="${MODAL_ID}"></div>

      </div>`;

    window.tasksSetView = function(v) {
      activeView = v; sessionStorage.setItem('tasks_view', v);
      document.querySelectorAll('[id^="tv-"]').forEach(function(b){
        var vid = b.id.replace('tv-','');
        b.className = 'px-2.5 py-1.5 rounded-lg text-xs transition-all '+(vid===v?'bg-white text-blue-600 shadow-sm font-semibold':'text-slate-500 hover:text-slate-700');
      });
      rerender();
    };
    window.tasksSearch = function(val) {
      _searchVal = val;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(rerender, 250);
    };
    window.tasksFilter = function(key, val) { filters[key] = val; rerender(); };
    window.tasksResetFilters = function() {
      filters = {status:'',priority:'',assignee:'',project:'',quick:''};
      _searchVal = '';
      var si = document.getElementById('tasks-search');
      if (si) si.value = '';
      rerender();
    };

    loadData();
  }

  // ── Filter & sort tasks ─────────────────────────────────────────
  function getFilteredTasks() {
    var rows = Object.values(tasksCache);
    if (filters.status)   rows = rows.filter(function(t){ return t.status===filters.status; });
    if (filters.priority) rows = rows.filter(function(t){ return t.priority===filters.priority; });
    if (filters.assignee) rows = rows.filter(function(t){ return t.assignee===filters.assignee; });
    if (filters.project)  rows = rows.filter(function(t){ return t.project===filters.project; });
    if (filters.quick === 'mine') rows = rows.filter(function(t){ return t.assignee===myUserId(); });
    if (filters.quick === 'overdue') rows = rows.filter(isOverdue);
    if (_searchVal) {
      var q = _searchVal.toLowerCase();
      rows = rows.filter(function(t){
        return (t.title||'').toLowerCase().includes(q) ||
               (t.description||'').toLowerCase().includes(q) ||
               (t.tags||'').toLowerCase().includes(q);
      });
    }
    return rows;
  }

  // ── Rerender content ───────────────────────────────────────────
  function rerender() {
    var el = document.getElementById('tasks-content');
    if (!el) return;
    var tasks = getFilteredTasks();
    var subtitle = document.getElementById('tasks-subtitle');
    if (subtitle) {
      var total = Object.values(tasksCache).length;
      var done  = Object.values(tasksCache).filter(function(t){return t.status==='Done';}).length;
      subtitle.textContent = total + ' tasks · ' + done + ' done';
    }
    if (activeView === 'board')    renderKanban(el, tasks);
    else if (activeView==='calendar') renderCalendar(el, tasks);
    else renderList(el, tasks);
  }

  // ── LIST VIEW ──────────────────────────────────────────────────
  function renderList(el, tasks) {
    if (!tasks.length) {
      el.innerHTML = '<div class="flex flex-col items-center justify-center py-16 text-slate-400"><i class="fas fa-check-circle text-4xl mb-3 opacity-30"></i><p class="font-semibold">No tasks found</p></div>';
      return;
    }
    var sorted = tasks.slice().sort(function(a,b){ return new Date(b.created_at||0)-new Date(a.created_at||0); });
    el.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
      '<table class="w-full text-left">' +
      '<thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">' +
        '<th class="px-4 py-3">Task</th><th class="px-4 py-3">Assignee</th><th class="px-4 py-3">Status</th>' +
        '<th class="px-4 py-3">Priority</th><th class="px-4 py-3">Due</th><th class="px-4 py-3"></th>' +
      '</tr></thead><tbody>' +
      sorted.map(function(t){
        var overdue = isOverdue(t);
        return '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onclick="tasksOpenDetail(\''+t.id+'\')">' +
          '<td class="px-4 py-3 min-w-0">' +
            '<div class="flex items-center gap-2">' +
              '<div class="w-1.5 h-8 rounded-full flex-shrink-0 bg-'+((KANBAN_COLORS[t.status]||{dot:'bg-slate-300'}).dot||'bg-slate-300').replace('bg-','')+'"></div>' +
              '<div class="min-w-0">' +
                '<p class="text-sm font-semibold text-slate-900 truncate max-w-xs">' + esc(t.title) + '</p>' +
                (t.tags ? '<p class="text-xs text-slate-400 truncate">' + esc(t.tags) + '</p>' : '') +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td class="px-4 py-3">' + userAvatar(t.assignee) + '</td>' +
          '<td class="px-4 py-3">' + statusBadge(t.status) + '</td>' +
          '<td class="px-4 py-3">' + priorityBadge(t.priority) + '</td>' +
          '<td class="px-4 py-3 text-xs ' + (overdue?'text-red-500 font-semibold':'text-slate-400') + '">' + fmtDate(t.due_date) + '</td>' +
          '<td class="px-4 py-3">' +
            '<div class="flex gap-1" onclick="event.stopPropagation()">' +
              '<button onclick="tasksOpenEdit(\''+t.id+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-pencil text-xs"></i></button>' +
              '<button onclick="tasksConfirmDelete(\''+t.id+'\',\''+esc(t.title)+'\')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>' +
            '</div>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  // ── KANBAN VIEW ────────────────────────────────────────────────
  function renderKanban(el, tasks) {
    el.innerHTML = '<div class="flex gap-4 overflow-x-auto pb-4">' +
      STATUSES.map(function(status) {
        var kc = KANBAN_COLORS[status] || { dot:'bg-slate-400', head:'bg-slate-50', border:'border-slate-200' };
        var cols = tasks.filter(function(t){ return t.status===status; });
        return '<div class="flex-shrink-0 w-72">' +
          '<div class="rounded-2xl border '+kc.border+' overflow-hidden">' +
          '<div class="'+kc.head+' px-4 py-3 flex items-center gap-2 border-b '+kc.border+'">' +
            '<div class="w-2 h-2 rounded-full '+kc.dot+'"></div>' +
            '<span class="text-xs font-bold text-slate-700 flex-1">'+esc(status)+'</span>' +
            '<span class="text-xs text-slate-400 font-semibold">'+cols.length+'</span>' +
          '</div>' +
          '<div class="p-2 space-y-2 min-h-[120px] bg-white">' +
            cols.map(function(t){
              return '<div class="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all" onclick="tasksOpenDetail(\''+t.id+'\')">' +
                '<p class="text-sm font-semibold text-slate-800 leading-tight mb-2">'+esc(t.title)+'</p>' +
                '<div class="flex items-center gap-2 justify-between">' +
                  priorityBadge(t.priority) +
                  (t.due_date ? '<span class="text-[10px] '+(isOverdue(t)?'text-red-500':'text-slate-400')+'">'+fmtDate(t.due_date)+'</span>' : '') +
                  userAvatar(t.assignee, 'w-5 h-5 text-[9px]') +
                '</div>' +
              '</div>';
            }).join('') +
            '<button onclick="tasksOpenNew(\''+status+'\')" class="w-full mt-1 py-2 text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center gap-1">' +
              '<i class="fas fa-plus text-[10px]"></i>Add task' +
            '</button>' +
          '</div></div></div>';
      }).join('') +
      '</div>';
  }

  // ── CALENDAR VIEW ──────────────────────────────────────────────
  function renderCalendar(el, tasks) {
    var now    = new Date();
    var year   = now.getFullYear();
    var month  = now.getMonth();
    var first  = new Date(year, month, 1);
    var days   = new Date(year, month+1, 0).getDate();
    var startDay = first.getDay();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    var cells = [];
    for (var i=0; i<startDay; i++) cells.push(null);
    for (var d=1; d<=days; d++) cells.push(d);

    var byDay = {};
    tasks.forEach(function(t){
      if (!t.due_date) return;
      var dd = new Date(t.due_date);
      if (dd.getFullYear()===year && dd.getMonth()===month) {
        var k = dd.getDate();
        if (!byDay[k]) byDay[k] = [];
        byDay[k].push(t);
      }
    });

    el.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
      '<div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900">'+months[month]+' '+year+'</h3>' +
      '</div>' +
      '<div class="grid grid-cols-7 border-b border-slate-100">' +
        ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){
          return '<div class="py-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">'+d+'</div>';
        }).join('') +
      '</div>' +
      '<div class="grid grid-cols-7">' +
        cells.map(function(d, i){
          if (!d) return '<div class="border-r border-b border-slate-100 min-h-[80px] bg-slate-50/50"></div>';
          var isToday = d===now.getDate();
          var dayTasks = byDay[d]||[];
          return '<div class="border-r border-b border-slate-100 min-h-[80px] p-1.5 '+(i%7===6?'border-r-0':'')+'">' +
            '<div class="text-right mb-1">' +
              '<span class="text-xs font-semibold '+(isToday?'w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center ml-auto':'text-slate-500')+'">' +
                d + '</span>' +
            '</div>' +
            dayTasks.slice(0,3).map(function(t){
              return '<div onclick="tasksOpenDetail(\''+t.id+'\')" class="text-[10px] font-medium px-1.5 py-0.5 rounded mb-0.5 cursor-pointer truncate '+(STATUS_COLORS[t.status]||'bg-slate-100 text-slate-600')+'">'+esc(t.title)+'</div>';
            }).join('') +
            (dayTasks.length>3 ? '<div class="text-[10px] text-slate-400 px-1">+' + (dayTasks.length-3) + ' more</div>' : '') +
          '</div>';
        }).join('') +
      '</div></div>';
  }

  // ── Task detail modal ──────────────────────────────────────────
  window.tasksOpenDetail = function(id) {
    var t = tasksCache[id];
    if (!t) return;
    showModal(
      '<div class="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">'+esc(t.status||'')+'</p>' +
          '<h3 class="font-extrabold text-slate-900 text-lg leading-tight">'+esc(t.title)+'</h3>' +
        '</div>' +
        '<div class="flex gap-1 flex-shrink-0">' +
          '<button onclick="tasksOpenEdit(\''+id+'\')" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 flex items-center justify-center text-slate-500 hover:text-blue-600"><i class="fas fa-pencil text-xs"></i></button>' +
          '<button onclick="closeTModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div class="flex flex-wrap gap-2">' + statusBadge(t.status) + priorityBadge(t.priority) + '</div>' +
        (t.description ? '<p class="text-sm text-slate-600 leading-relaxed">'+esc(t.description)+'</p>' : '') +
        '<div class="grid grid-cols-2 gap-3 text-sm">' +
          '<div><p class="text-xs font-semibold text-slate-500 mb-0.5">Assignee</p><div class="flex items-center gap-2">'+userAvatar(t.assignee)+' <span class="text-slate-800">'+esc(userName(t.assignee))+'</span></div></div>' +
          '<div><p class="text-xs font-semibold text-slate-500 mb-0.5">Due Date</p><p class="'+(isOverdue(t)?'text-red-500 font-semibold':'text-slate-800')+'">'+( fmtDate(t.due_date)||'—')+'</p></div>' +
          (t.project ? '<div><p class="text-xs font-semibold text-slate-500 mb-0.5">Project</p><p class="text-slate-800">'+esc(projectName(t.project)||t.project)+'</p></div>' : '') +
          (t.tags ? '<div><p class="text-xs font-semibold text-slate-500 mb-0.5">Tags</p><p class="text-slate-800">'+esc(t.tags)+'</p></div>' : '') +
        '</div>' +
        '<div class="pt-2 border-t border-slate-100">' +
          '<p class="text-xs font-semibold text-slate-500 mb-2">Update Status</p>' +
          '<div class="flex flex-wrap gap-2">' +
            STATUSES.map(function(s){
              return '<button onclick="tasksUpdateStatus(\''+id+'\',\''+s+'\')" class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all '+(t.status===s?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200')+'">'+esc(s)+'</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="flex gap-3 pt-2">' +
          '<button onclick="tasksConfirmDelete(\''+id+'\',\''+esc(t.title)+'\')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-semibold transition-colors"><i class="fas fa-trash text-xs"></i>Delete</button>' +
          '<button onclick="tasksOpenEdit(\''+id+'\')" class="flex-1 btn-primary text-sm"><i class="fas fa-pencil text-xs"></i>Edit</button>' +
        '</div>' +
      '</div>'
    );
  };

  window.tasksUpdateStatus = async function(id, status) {
    try {
      await db.tasks.update(id, { status: status });
      if (tasksCache[id]) tasksCache[id].status = status;
      closeTModal();
      rerender();
      toast('Status updated', 'success');
    } catch(e) { toast(e.message, 'error'); }
  };

  // ── Task form ──────────────────────────────────────────────────
  window.tasksOpenNew = function(defaultStatus) {
    openTaskForm(null, defaultStatus||'To Do');
  };
  window.tasksOpenEdit = function(id) {
    openTaskForm(tasksCache[id]||null, null);
  };

  function openTaskForm(task, defaultStatus) {
    var isEdit = !!task;
    var v      = function(f){ return isEdit && task[f] != null ? esc(String(task[f])) : ''; };
    var userOpts = usersCache.map(function(u){
      var uid = u.id||u.user_id;
      var sel = isEdit && task.assignee === uid ? ' selected' : '';
      return '<option value="'+uid+'"'+sel+'>'+(u.name||u.email)+'</option>';
    }).join('');
    var projOpts = projectsCache.length
      ? '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Project</label>' +
        '<select id="tf-project" class="field text-sm"><option value="">— None —</option>' +
        projectsCache.map(function(p){ return '<option value="'+p.id+'"'+(isEdit&&task.project===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('') +
        '</select></div>' : '';

    showModal(
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900">'+(isEdit?'Edit Task':'New Task')+'</h3>' +
        '<button onclick="closeTModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div id="tm-status"></div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Title <span class="text-red-500">*</span></label>' +
          '<input id="tf-title" type="text" class="field text-sm" placeholder="Task title" value="'+v('title')+'"></div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>' +
          '<textarea id="tf-desc" class="field text-sm" rows="3" placeholder="Optional details…">'+v('description')+'</textarea></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</label>' +
            '<select id="tf-status" class="field text-sm">' +
              STATUSES.map(function(s){ return '<option value="'+s+'"'+(isEdit?task.status===s?' selected':'':s===defaultStatus?' selected':'')+'>'+s+'</option>'; }).join('') +
            '</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Priority</label>' +
            '<select id="tf-priority" class="field text-sm">' +
              PRIORITIES.map(function(p){ return '<option value="'+p+'"'+(isEdit&&task.priority===p?' selected':'')+(p==='Medium'&&!isEdit?' selected':'')+'>'+p+'</option>'; }).join('') +
            '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Assignee</label>' +
            '<select id="tf-assignee" class="field text-sm"><option value="">— Unassigned —</option>'+userOpts+'</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Due Date</label>' +
            '<input id="tf-due" type="date" class="field text-sm" value="'+v('due_date')+'"></div>' +
        '</div>' +
        projOpts +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tags</label>' +
          '<input id="tf-tags" type="text" class="field text-sm" placeholder="design, backend, …" value="'+v('tags')+'"></div>' +
        '<div class="flex gap-3 pt-2">' +
          '<button onclick="closeTModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tm-submit" onclick="tasksSubmitForm(\''+( isEdit?task.id:'')+'\')" class="btn-primary flex-1">' +
            '<i class="fas '+(isEdit?'fa-save':'fa-plus')+' text-xs mr-1"></i>'+(isEdit?'Save Changes':'Create Task') +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  window.tasksSubmitForm = async function(taskId) {
    var isEdit = !!taskId;
    var title  = (document.getElementById('tf-title')?.value||'').trim();
    if (!title) { modalStatus('Title is required.', false); return; }
    var btn = document.getElementById('tm-submit');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…'; }

    var patch = {
      title:       title,
      description: document.getElementById('tf-desc')?.value||'',
      status:      document.getElementById('tf-status')?.value||'To Do',
      priority:    document.getElementById('tf-priority')?.value||'Medium',
      assignee:    document.getElementById('tf-assignee')?.value||null,
      due_date:    document.getElementById('tf-due')?.value||null,
      tags:        document.getElementById('tf-tags')?.value||'',
      project:     document.getElementById('tf-project')?.value||null,
    };
    if (!isEdit) patch.creator = myUserId();

    try {
      if (isEdit) {
        await db.tasks.update(taskId, patch);
        tasksCache[taskId] = Object.assign({}, tasksCache[taskId], patch);
        modalStatus('Saved!', true);
      } else {
        var created = await db.tasks.create(patch);
        tasksCache[created.id] = created;
        modalStatus('Task created!', true);
      }
      setTimeout(function(){ closeTModal(); rerender(); }, 600);
    } catch(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-'+(isEdit?'save':'plus')+' text-xs mr-1"></i>'+(isEdit?'Save Changes':'Create Task'); }
    }
  };

  // ── Delete ─────────────────────────────────────────────────────
  window.tasksConfirmDelete = function(id, title) {
    showModal(
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-red-600">Delete Task</h3>' +
        '<button onclick="closeTModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div class="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"><i class="fas fa-exclamation-triangle text-red-400 mt-0.5"></i>' +
          '<p class="text-sm text-red-700">Permanently delete <strong>'+esc(title)+'</strong>? This cannot be undone.</p></div>' +
        '<div id="tm-status"></div>' +
        '<div class="flex gap-3">' +
          '<button onclick="closeTModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tm-del-btn" onclick="tasksDoDelete(\''+id+'\')" class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold">' +
            '<i class="fas fa-trash text-xs"></i>Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>', '480px'
    );
  };

  window.tasksDoDelete = async function(id) {
    var btn = document.getElementById('tm-del-btn');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Deleting…'; }
    try {
      await db.tasks.delete(id);
      delete tasksCache[id];
      toast('Task deleted', 'info');
      closeTModal();
      rerender();
    } catch(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-trash text-xs"></i>Delete Permanently'; }
    }
  };

  // ── Boot ──────────────────────────────────────────────────────
  var old = document.getElementById(MODAL_ID);
  if (old) old.innerHTML = '';
  render();
};
