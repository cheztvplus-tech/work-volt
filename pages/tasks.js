window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['tasks'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl      = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret   = localStorage.getItem('wv_api_secret') || '';
  var tasksCache    = {};          // keyed by id
  var usersCache    = [];
  var projectsCache = [];
  var activeView    = sessionStorage.getItem('tasks_view') || 'list';
  var filters       = { status: '', priority: '', assigned_to: '', project_id: '', quick: '' };
  var sortState     = { col: '', dir: 'asc' };
  var collapseDone  = false;
  var savedViews    = JSON.parse(localStorage.getItem('wv_task_views') || '[]');
  var _searchTimer  = null;
  var _searchVal    = '';
  var _dragId       = null;

  // ── Constants ──────────────────────────────────────────────────
  var STATUSES   = ['To Do', 'In Progress', 'In Review', 'Done', 'Cancelled'];
  var PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

  var STATUS_COLORS = {
    'To Do':       'bg-slate-100 text-slate-600',
    'In Progress': 'bg-blue-100 text-blue-700',
    'In Review':   'bg-purple-100 text-purple-700',
    'Done':        'bg-green-100 text-green-700',
    'Cancelled':   'bg-red-100 text-red-600',
  };
  var STATUS_ICON = {
    'To Do':       'fa-circle',
    'In Progress': 'fa-spinner',
    'In Review':   'fa-eye',
    'Done':        'fa-check-circle',
    'Cancelled':   'fa-ban',
  };
  var STATUS_BORDER = {
    'To Do':       'border-slate-300',
    'In Progress': 'border-blue-400',
    'In Review':   'border-purple-400',
    'Done':        'border-green-400',
    'Cancelled':   'border-red-300',
  };
  var PRIORITY_COLORS = {
    'Low':    'bg-slate-100 text-slate-500',
    'Medium': 'bg-amber-100 text-amber-700',
    'High':   'bg-orange-100 text-orange-700',
    'Urgent': 'bg-red-100 text-red-600',
  };
  var PRIORITY_DOT = {
    'Low': '#94a3b8', 'Medium': '#f59e0b', 'High': '#f97316', 'Urgent': '#ef4444',
  };
  // ── Checklist Stages (5 × 20% = 100%) ─────────────────────────
  var CHECKLIST_STAGES = ['Draft', 'Ready', 'In Progress', 'Review', 'Done'];

  function getChecklistKey(taskId) { return 'wv_task_checklist_' + taskId; }
  function getChecklist(taskId) {
    try {
      var raw = localStorage.getItem(getChecklistKey(taskId));
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {};
  }
  function saveChecklist(taskId, state) {
    try { localStorage.setItem(getChecklistKey(taskId), JSON.stringify(state)); } catch(e) {}
  }
  function calcChecklistPct(taskId) {
    var state = getChecklist(taskId);
    var checked = CHECKLIST_STAGES.filter(function(s) { return state[s]; }).length;
    return Math.round((checked / CHECKLIST_STAGES.length) * 100);
  }

  var KANBAN_COLORS = {
    'To Do':       { dot:'bg-slate-400',   ring:'#94a3b8', bar:'bg-slate-200',   head:'bg-slate-50',  border:'border-slate-200' },
    'In Progress': { dot:'bg-blue-500',    ring:'#3b82f6', bar:'bg-blue-100',    head:'bg-blue-50',   border:'border-blue-200'  },
    'In Review':   { dot:'bg-purple-500',  ring:'#8b5cf6', bar:'bg-purple-100',  head:'bg-purple-50', border:'border-purple-200'},
    'Done':        { dot:'bg-green-500',   ring:'#22c55e', bar:'bg-green-100',   head:'bg-green-50',  border:'border-green-200' },
    'Cancelled':   { dot:'bg-red-400',     ring:'#f87171', bar:'bg-red-100',     head:'bg-red-50',    border:'border-red-200'   },
  };

  // ── Role helpers ───────────────────────────────────────────────
  function getRole() {
    try { return window.WorkVolt.user().role || 'SuperAdmin'; } catch(e) { return 'SuperAdmin'; }
  }
  function isAdmin()  { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function myUserId() { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } }
  function projectsInstalled() {
    try { return (window.INSTALLED_MODULES || []).some(function(m) { return m.id === 'projects'; }); }
    catch(e) { return false; }
  }

  // ── API ────────────────────────────────────────────────────────
    function api(path, params) {
    if (!savedUrl || !savedSecret) return Promise.reject(new Error('Google Sheet not connected'));
    var savedSheetId = localStorage.getItem('wv_sheet_id') || '';
    var sessionId = '';
    try { sessionId = window.WorkVolt.session() || ''; } catch(e) {}
    
    var url = new URL(savedUrl);
    url.searchParams.set('path',  path);
    url.searchParams.set('token', savedSecret);
    url.searchParams.set('sheet_id', savedSheetId);
    url.searchParams.set('session_id', sessionId);
    
    if (params) Object.keys(params).forEach(function(k) {
      if (params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
        url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { cache: 'no-cache' })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.error) throw new Error(d.error); return d; });
  }

  // ── Utility helpers ────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
    catch(e) { return d; }
  }
  function fmtHours(h) {
    var n = parseFloat(h) || 0;
    if (!n) return '0h';
    return n % 1 === 0 ? n + 'h' : n.toFixed(1) + 'h';
  }
  function fmtMoney(v) {
    return '$' + (parseFloat(v) || 0).toFixed(2);
  }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u) { return u.user_id === uid || u.id === uid; });
    return u ? (u.name || u.email || uid) : uid;
  }
  function userInitial(uid) { return userName(uid).charAt(0).toUpperCase() || '?'; }
  function userAvatar(uid, size) {
    size = size || 'w-6 h-6 text-[10px]';
    var colors = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
    var idx = uid ? (uid.charCodeAt(0) % colors.length) : 0;
    return '<span class="' + size + ' ' + colors[idx] + ' rounded-full flex items-center justify-center font-bold flex-shrink-0" title="' + esc(userName(uid)) + '">' + userInitial(uid) + '</span>';
  }
  function projectName(pid) {
    if (!pid) return pid;
    var p = projectsCache.find(function(p) { return (p.id || p.project_id) === pid; });
    return p ? (p.name || pid) : pid;
  }

  // ── Badges ────────────────────────────────────────────────────
  function statusBadge(s) {
    var c = STATUS_COLORS[s] || 'bg-slate-100 text-slate-600';
    var i = STATUS_ICON[s]   || 'fa-circle';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + c + '">' +
      '<i class="fas ' + i + ' text-[9px]"></i>' + esc(s || '—') + '</span>';
  }
  function priorityBadge(p) {
    var c = PRIORITY_COLORS[p] || 'bg-slate-100 text-slate-500';
    var d = PRIORITY_DOT[p]   || '#94a3b8';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + c + '">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:' + d + ';flex-shrink:0"></span>' + esc(p || '—') + '</span>';
  }
  function hoursBar(actual, estimated) {
    var a = parseFloat(actual)    || 0;
    var e = parseFloat(estimated) || 0;
    if (!e && !a) return '';
    if (!e) return '<span class="text-xs text-slate-500">' + fmtHours(a) + ' logged</span>';
    var pct      = Math.min(Math.round((a / e) * 100), 100);
    var barColor = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#3b82f6';
    return '<div class="flex items-center gap-1.5">' +
      '<div style="background:#e2e8f0;border-radius:9999px;height:5px;flex:1;min-width:32px">' +
        '<div style="width:' + pct + '%;height:5px;border-radius:9999px;background:' + barColor + ';transition:width .3s"></div>' +
      '</div>' +
      '<span class="text-xs text-slate-500 whitespace-nowrap font-medium">' + pct + '%</span>' +
    '</div>';
  }

  // ── Progress ──────────────────────────────────────────────────
  function calcProgress(t) {
    if (!t || !t.id) return 0;
    var pct = calcChecklistPct(t.id);
    // If no checklist items checked yet but task is Done/Cancelled, show 100
    if (pct === 0 && (t.status === 'Done' || t.status === 'Cancelled')) return 100;
    return pct;
  }
  function progressRing(pct, size, stroke) {
    size   = size   || 36;
    stroke = stroke || 3;
    var r    = (size / 2) - stroke - 1;
    var circ = 2 * Math.PI * r;
    var dash = (pct / 100) * circ;
    var color = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : pct > 0 ? '#3b82f6' : '#e2e8f0';
    var fs = Math.round(size * 0.26);
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="transform:rotate(-90deg)">' +
      '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" ' +
        'stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '" stroke-linecap="round"/>' +
      '<text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" ' +
        'style="transform:rotate(90deg);transform-origin:center;font-size:' + fs + 'px;font-weight:700;fill:#475569;font-family:inherit">' +
        pct + '</text>' +
    '</svg>';
  }
  function columnProgressRing(tasks, status) {
    var total  = tasks.length;
    if (!total) return '';
    var done   = tasks.filter(function(t) { return t.status === 'Done' || t.status === 'Cancelled'; }).length;
    var pct    = Math.round((done / total) * 100);
    var k      = KANBAN_COLORS[status] || KANBAN_COLORS['To Do'];
    return progressRing(pct, 28, 3);
  }

  // ── Countdown ─────────────────────────────────────────────────
  function countdown(t) {
    if (!t.due_date || t.status === 'Done' || t.status === 'Cancelled') return '';
    var now  = new Date(); now.setHours(0,0,0,0);
    var due  = new Date(t.due_date);
    var diff = Math.round((due - now) / 86400000);
    if (diff < 0)  return '<span class="text-[10px] font-bold text-red-500 flex items-center gap-0.5"><i class="fas fa-fire text-[9px]"></i>' + Math.abs(diff) + 'd overdue</span>';
    if (diff === 0) return '<span class="text-[10px] font-bold text-orange-500 flex items-center gap-0.5"><i class="fas fa-exclamation text-[9px]"></i>Due today</span>';
    if (diff <= 3)  return '<span class="text-[10px] font-semibold text-amber-600">' + diff + 'd left</span>';
    return '<span class="text-[10px] text-slate-400">' + diff + 'd left</span>';
  }

  // ── Billable helpers ──────────────────────────────────────────
  function billableValue(t) {
    if (t.billable !== 'true' && t.billable !== true) return 0;
    var rate = parseFloat(t.billable_rate) || 0;
    if (!rate) return 0;
    var pt = t.billable_pay_type || 'per_hour';
    if (pt === 'per_task') return rate;
    if (pt === 'salary')   return 0;
    var h = parseFloat(t.actual_hours) || parseFloat(t.estimated_hours) || 0;
    return h * rate;
  }
  function billableCell(t) {
    if (t.billable !== 'true' && t.billable !== true)
      return '<span class="text-xs text-slate-300">—</span>';
    var val  = billableValue(t);
    var rate = parseFloat(t.billable_rate) || 0;
    var pt   = t.billable_pay_type || 'per_hour';
    var lbl  = rate ? (pt==='per_hour' ? fmtMoney(rate)+'/hr' : pt==='per_task' ? fmtMoney(rate)+' flat' : 'Salary') : 'Rate TBD';
    return '<div class="flex flex-col gap-0.5">' +
      '<span class="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">' +
        '<i class="fas fa-dollar-sign text-[9px]"></i>' + (val ? fmtMoney(val) : 'Billable') +
      '</span>' +
      '<span class="text-[10px] text-slate-400">' + esc(lbl) + '</span>' +
      '<span class="mt-0.5">' + approvalBadge(t) + '</span>' +
    '</div>';
  }
  function approvalBadge(t) {
    if (t.billable !== 'true' && t.billable !== true) return '';
    var st = t.approval_status || 'pending';
    var map = {
      pending:  { cls:'bg-amber-50 border-amber-200 text-amber-700',  icon:'fa-clock',        lbl:'Pending' },
      approved: { cls:'bg-green-50 border-green-200 text-green-700',  icon:'fa-check-circle', lbl:'Approved' },
      rejected: { cls:'bg-red-50 border-red-200 text-red-600',        icon:'fa-times-circle', lbl:'Rejected' },
    }[st] || { cls:'bg-amber-50 border-amber-200 text-amber-700', icon:'fa-clock', lbl:'Pending' };
    return '<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded font-semibold border ' + map.cls + '">' +
      '<i class="fas ' + map.icon + ' text-[9px]"></i>' + map.lbl + '</span>';
  }

  function isOverdue(t) {
    return t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done' && t.status !== 'Cancelled';
  }
  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }
  function sendNotification(toUserId, title, taskId, opts) {
    // Don't notify yourself — correct by design
    if (!toUserId || toUserId === myUserId()) return;
    opts = opts || {};
    var params = {
      to_user_id:   toUserId,
      from_user_id: myUserId(),
      title:        title,
      body:         opts.body    || '',
      type:         opts.type    || 'task_assigned',
      priority:     opts.priority || 'high',
      ref_type:     'tasks',
      ref_id:       taskId || '',
      group_key:    opts.group_key || (opts.type + ':' + (taskId||'') + ':' + myUserId()),
    };
    // Use WVNotifications global if available (cleaner), else direct API
    if (window.WVNotifications) {
      window.WVNotifications.create(params);
    } else {
      api('notifications/create', params).catch(function() {});
    }
  }

  // ── Filtering & Sorting ────────────────────────────────────────
  function applyFilters(rows) {
    var me = myUserId();
    return rows.filter(function(t) {
      if (collapseDone && (t.status === 'Done' || t.status === 'Cancelled')) return false;
      if (filters.status     && t.status     !== filters.status)     return false;
      if (filters.priority   && t.priority   !== filters.priority)   return false;
      if (filters.project_id && t.project_id !== filters.project_id) return false;
      if (filters.assigned_to === '__me__' && t.assigned_to !== me)  return false;
      else if (filters.assigned_to && filters.assigned_to !== '__me__' && t.assigned_to !== filters.assigned_to) return false;
      if (filters.quick === 'me'      && t.assigned_to !== me) return false;
      if (filters.quick === 'today') {
        if (!t.due_date) return false;
        var d = new Date(t.due_date); d.setHours(0,0,0,0);
        var n = new Date(); n.setHours(0,0,0,0);
        if (d.getTime() !== n.getTime()) return false;
      }
      if (filters.quick === 'overdue' && !isOverdue(t)) return false;
      if (filters.quick === 'urgent'  && t.priority !== 'Urgent') return false;
      if (_searchVal) {
        var q = _searchVal.toLowerCase();
        var hay = (t.title||'') + ' ' + (t.description||'') + ' ' + (t.tags||'') + ' ' + (t.id||'');
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }
  function applySort(rows) {
    if (!sortState.col) {
      // Default: urgent first, then overdue, then by due date
      return rows.slice().sort(function(a, b) {
        var po = { 'Urgent':0,'High':1,'Medium':2,'Low':3 };
        var oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        var pa = po[a.priority] !== undefined ? po[a.priority] : 4;
        var pb = po[b.priority] !== undefined ? po[b.priority] : 4;
        if (a.priority === 'Urgent' && b.priority !== 'Urgent') return -1;
        if (b.priority === 'Urgent' && a.priority !== 'Urgent') return  1;
        if (!a.due_date && b.due_date) return  1;
        if (a.due_date && !b.due_date) return -1;
        if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
        return pa - pb;
      });
    }
    return rows.slice().sort(function(a, b) {
      var va = a[sortState.col] || '', vb = b[sortState.col] || '';
      if (sortState.col === 'priority') {
        var o = {'Urgent':0,'High':1,'Medium':2,'Low':3};
        va = o[va] !== undefined ? o[va] : 4;
        vb = o[vb] !== undefined ? o[vb] : 4;
      } else if (sortState.col === 'status') {
        var so = {'To Do':0,'In Progress':1,'In Review':2,'Done':3,'Cancelled':4};
        va = so[va] !== undefined ? so[va] : 5;
        vb = so[vb] !== undefined ? so[vb] : 5;
      } else if (sortState.col === 'due_date') {
        va = va ? new Date(va).getTime() : Infinity;
        vb = vb ? new Date(vb).getTime() : Infinity;
      } else if (sortState.col === 'progress') {
        va = calcProgress(a); vb = calcProgress(b);
      } else {
        va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      }
      var cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortState.dir === 'desc' ? -cmp : cmp;
    });
  }
  function setSort(col) {
    if (sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    else { sortState.col = col; sortState.dir = 'asc'; }
    rerender();
  }
  function rerender() {
    var all   = Object.values(tasksCache);
    var tasks = applySort(applyFilters(all));
    renderStats(all);
    if (activeView === 'kanban') renderKanban(tasks);
    else renderList(tasks);
  }

  // ── Modal portal ──────────────────────────────────────────────
  var MODAL_ID = 'wv-tasks-modal-portal';
  function getPortal() {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el = document.createElement('div'); el.id = MODAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html, maxWidth) {
    maxWidth = maxWidth || '640px';
    getPortal().innerHTML =
      '<div id="tm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem">' +
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,.25);width:100%;max-width:' + maxWidth + ';max-height:92vh;overflow-y:auto;z-index:9999">' +
          html +
        '</div>' +
      '</div>';
    document.getElementById('tm-backdrop').addEventListener('click', function(e) {
      if (e.target.id === 'tm-backdrop') closeModal();
    });
  }
  function closeModal() { var p = document.getElementById(MODAL_ID); if (p) p.innerHTML = ''; }
  function modalStatus(msg, ok) {
    var el = document.getElementById('tm-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 ' +
      (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
      '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i><span>' + esc(msg) + '</span></div>';
  }

  // ================================================================
  //  MAIN SHELL
  // ================================================================
  function render() {
    var projectOpts = '<option value="">All Projects</option>' +
      projectsCache.map(function(p) {
        var pid = p.id || p.project_id;
        return '<option value="' + esc(pid) + '"' + (filters.project_id === pid ? ' selected' : '') + '>' + esc(p.name || pid) + '</option>';
      }).join('');

    var savedViewBtns = savedViews.map(function(v, i) {
      return '<button data-saved-view="' + i + '" title="' + esc(v.name) + '" class="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ' +
        'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 whitespace-nowrap transition-colors flex items-center gap-1">' +
        '<i class="fas fa-bookmark text-[9px]"></i>' + esc(v.name) +
        '<i data-del-view="' + i + '" class="fas fa-times text-[9px] ml-1 hover:text-red-500"></i></button>';
    }).join('');

    var quickChips = [
      { k:'',        icon:'fa-th-large', lbl:'All' },
      { k:'me',      icon:'fa-user',     lbl:'Mine' },
      { k:'today',   icon:'fa-calendar-day', lbl:'Due Today' },
      { k:'overdue', icon:'fa-fire',     lbl:'Overdue' },
      { k:'urgent',  icon:'fa-bolt',     lbl:'Urgent' },
    ].map(function(q) {
      var on = filters.quick === q.k;
      return '<button data-quick="' + q.k + '" class="quick-chip flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border ' +
        (on ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50') + '">' +
        '<i class="fas ' + q.icon + ' text-[10px]"></i>' + q.lbl + '</button>';
    }).join('');

    container.innerHTML =
      '<div class="min-h-full bg-slate-50">' +

      // ── Header ──────────────────────────────────────────────────
      '<div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">' +
        '<div>' +
          '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Tasks</h1>' +
          '<p class="text-slate-400 text-xs mt-0.5" id="tasks-subtitle">Loading…</p>' +
        '</div>' +
        '<div class="flex items-center gap-2 flex-wrap">' +
          '<div class="flex items-center bg-slate-100 rounded-lg p-0.5">' +
            '<button id="btn-view-list" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ' +
              (activeView==='list'   ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700') + '">' +
              '<i class="fas fa-list mr-1"></i>List</button>' +
            '<button id="btn-view-kanban" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ' +
              (activeView==='kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700') + '">' +
              '<i class="fas fa-columns mr-1"></i>Kanban</button>' +
          '</div>' +
          '<button id="btn-collapse-done" title="Toggle Done/Cancelled visibility" class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ' +
            (collapseDone ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400') + '">' +
            '<i class="fas ' + (collapseDone ? 'fa-eye' : 'fa-eye-slash') + ' mr-1"></i>' + (collapseDone ? 'Show Done' : 'Hide Done') +
          '</button>' +
          '<button id="btn-new-task" class="btn-primary text-sm">' +
            '<i class="fas fa-plus text-xs"></i> New Task' +
            '<kbd class="ml-1.5 text-blue-300 text-[10px] font-normal bg-transparent border-none">N</kbd>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // ── Stats strip ─────────────────────────────────────────────
      '<div id="tasks-stats" class="bg-white border-b border-slate-100 px-6 py-2 flex gap-4 text-xs text-slate-400 overflow-x-auto items-center"></div>' +

      // ── Quick filter chips ──────────────────────────────────────
      '<div class="bg-white border-b border-slate-100 px-6 py-2.5 flex items-center gap-2 overflow-x-auto">' +
        quickChips +
        (savedViewBtns ? '<span class="w-px h-4 bg-slate-200 mx-1 flex-shrink-0"></span>' + savedViewBtns : '') +
        '<div class="ml-auto flex items-center gap-2 flex-shrink-0">' +
          '<button id="btn-save-view" class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 border border-slate-200 whitespace-nowrap transition-colors">' +
            '<i class="fas fa-bookmark mr-1 text-[10px]"></i>Save View' +
          '</button>' +
        '</div>' +
      '</div>' +

      // ── Filter row ─────────────────────────────────────────────
      '<div class="bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center gap-2">' +
        '<select id="filter-status" class="field text-xs py-1.5" style="width:8.5rem">' +
          '<option value="">All Statuses</option>' +
          STATUSES.map(function(s) {
            return '<option value="' + s + '"' + (filters.status===s?' selected':'') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
        '<select id="filter-priority" class="field text-xs py-1.5" style="width:7.5rem">' +
          '<option value="">All Priorities</option>' +
          PRIORITIES.map(function(p) {
            return '<option value="' + p + '"' + (filters.priority===p?' selected':'') + '>' + p + '</option>';
          }).join('') +
        '</select>' +
        '<select id="filter-assigned" class="field text-xs py-1.5" style="width:8.5rem">' +
          '<option value="">All Assignees</option>' +
          '<option value="__me__">Assigned to Me</option>' +
        '</select>' +
        (projectsInstalled()
          ? '<select id="filter-project" class="field text-xs py-1.5" style="width:8.5rem">' + projectOpts + '</select>'
          : '') +
        '<button id="btn-clear-filters" class="text-xs text-slate-400 hover:text-red-500 font-semibold px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">' +
          '<i class="fas fa-times mr-1"></i>Clear</button>' +
        '<div class="ml-auto relative">' +
          '<i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>' +
          '<input id="task-search" type="text" placeholder="Search… (/)" value="' + esc(_searchVal) + '" class="field text-xs py-1.5 pl-7" style="width:13rem">' +
        '</div>' +
      '</div>' +

      // ── Quick add bar ───────────────────────────────────────────
      '<div class="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-3">' +
        '<i class="fas fa-plus text-slate-300 text-xs flex-shrink-0"></i>' +
        '<input id="quick-add-input" type="text" placeholder="Quick add — type a task title and press Enter…" ' +
          'class="flex-1 text-sm text-slate-700 outline-none bg-transparent placeholder-slate-300" autocomplete="off">' +
        '<select id="qa-priority" class="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-500 bg-slate-50 flex-shrink-0" style="font-family:inherit">' +
          PRIORITIES.map(function(p) { return '<option' + (p==='Medium'?' selected':'') + '>' + p + '</option>'; }).join('') +
        '</select>' +
        '<input id="qa-due" type="date" class="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-500 bg-slate-50 flex-shrink-0">' +
      '</div>' +

      // ── Content ────────────────────────────────────────────────
      '<div id="tasks-content" class="p-6">' +
        '<div class="flex items-center justify-center py-20 text-slate-300">' +
          '<i class="fas fa-circle-notch fa-spin text-3xl"></i></div>' +
      '</div>' +

      // ── Keyboard shortcuts hint ─────────────────────────────────
      '<div class="fixed bottom-4 right-4 z-10">' +
        '<button id="btn-shortcuts" title="Keyboard shortcuts" class="w-8 h-8 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center shadow-lg hover:bg-slate-800 transition-colors border-none cursor-pointer">?</button>' +
      '</div>' +

      '</div>';

    // Wire controls
    container.querySelector('#btn-view-list').addEventListener('click', function() { setView('list'); });
    container.querySelector('#btn-view-kanban').addEventListener('click', function() { setView('kanban'); });
    container.querySelector('#btn-new-task').addEventListener('click', function() { openTaskForm(null); });
    container.querySelector('#btn-collapse-done').addEventListener('click', function() { collapseDone = !collapseDone; render(); rerender(); });
    container.querySelector('#btn-clear-filters').addEventListener('click', function() {
      filters = { status:'', priority:'', assigned_to:'', project_id:'', quick:'' };
      sortState = { col:'', dir:'asc' };
      _searchVal = '';
      render(); loadData();
    });
    container.querySelector('#filter-status').addEventListener('change', function() { filters.status = this.value; rerender(); });
    container.querySelector('#filter-priority').addEventListener('change', function() { filters.priority = this.value; rerender(); });
    container.querySelector('#filter-assigned').addEventListener('change', function() { filters.assigned_to = this.value; rerender(); });
    var projSel = container.querySelector('#filter-project');
    if (projSel) projSel.addEventListener('change', function() { filters.project_id = this.value; rerender(); });

    container.querySelector('#task-search').addEventListener('input', function() {
      _searchVal = this.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(rerender, 200);
    });
    container.querySelector('#task-search').addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { this.value = ''; _searchVal = ''; rerender(); }
    });

    // Quick chips
    container.querySelectorAll('.quick-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        filters.quick = this.dataset.quick;
        render(); rerender();
      });
    });

    // Quick add
    container.querySelector('#quick-add-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && this.value.trim()) {
        var title    = this.value.trim();
        var priority = container.querySelector('#qa-priority').value;
        var due      = container.querySelector('#qa-due').value;
        this.value = '';
        quickCreate({ title: title, priority: priority, due_date: due });
      }
      if (e.key === 'Escape') { this.value = ''; this.blur(); }
    });

    // Save view
    container.querySelector('#btn-save-view').addEventListener('click', openSaveViewModal);

    // Saved view buttons
    container.querySelectorAll('[data-saved-view]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        if (e.target.dataset.delView !== undefined) {
          var idx = parseInt(e.target.dataset.delView);
          savedViews.splice(idx, 1);
          localStorage.setItem('wv_task_views', JSON.stringify(savedViews));
          render(); rerender();
          return;
        }
        var v = savedViews[parseInt(this.dataset.savedView)];
        if (v) { filters = Object.assign({}, v.filters); _searchVal = v.search || ''; sortState = v.sort || { col:'', dir:'asc' }; render(); rerender(); }
      });
    });

    // Shortcuts button
    container.querySelector('#btn-shortcuts').addEventListener('click', openShortcutsModal);

    // Delegated content clicks
    container.querySelector('#tasks-content').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      var action = btn.dataset.action;
      var id     = btn.dataset.id;
      var task   = tasksCache[id];
      var title  = (task && task.title) || btn.dataset.title || '';
      if (action === 'view')      openTaskDetail(task);
      if (action === 'edit-locked') { toast('Task is closed. Request a reopen to edit it.', 'info'); return; }
      if (action === 'edit')      openTaskForm(task);
      if (action === 'delete')    openDeleteModal(id, title);
      if (action === 'log-hours') openLogHoursModal(task);
      if (action === 'log-note')  openLogNoteModal(task);
      if (action === 'complete')  quickUpdate(id, { status:'Done' },      'Task completed ✓');
      if (action === 'cancel')    quickUpdate(id, { status:'Cancelled' }, 'Task cancelled');
      if (action === 'reopen')    handleReopenRequest(id, 'To Do');
      if (action === 'sort')      setSort(btn.dataset.col);
    });

    // Keyboard shortcuts (global)
    bindKeyboardShortcuts();

    loadData();
  }

  function setView(v) {
    activeView = v;
    sessionStorage.setItem('tasks_view', v);
    render();
  }

  var _kbBound = false;
  function bindKeyboardShortcuts() {
    if (_kbBound) return;
    _kbBound = true;
    document.addEventListener('keydown', function(e) {
      // Only when NOT focused in an input/textarea/select
      var tag = (document.activeElement || {}).tagName || '';
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openTaskForm(null); }
      if (e.key === '/') { e.preventDefault(); var s = document.getElementById('task-search'); if (s) { s.focus(); s.select(); } }
      if (e.key === 'k' || e.key === 'K') setView('kanban');
      if (e.key === 'l' || e.key === 'L') setView('list');
      if (e.key === 'Escape') closeModal();
    });
  }

  // ================================================================
  //  DATA LOADING
  // ================================================================
  function loadData() {
    var content = document.getElementById('tasks-content');
    if (!savedUrl || !savedSecret) {
      if (content) content.innerHTML =
        '<div class="flex flex-col items-center justify-center py-24 text-slate-400">' +
          '<i class="fas fa-plug text-5xl mb-4 opacity-30"></i>' +
          '<p class="font-semibold text-slate-500">Google Sheet not connected</p>' +
          '<p class="text-sm mt-1">Go to <strong>Settings → Connection</strong> to connect.</p>' +
        '</div>';
      return;
    }

    var calls = [
      api('tasks/list', {}),
      api('users/list').catch(function() { return {}; }),
    ];
    if (projectsInstalled()) calls.push(api('projects/list').catch(function() { return {}; }));

    Promise.all(calls).then(function(res) {
      var rows = res[0].rows || [];
      usersCache    = res[1].users || res[1].rows || [];
      projectsCache = res[2] ? (res[2].rows || res[2].projects || []) : [];

      tasksCache = {};
      rows.forEach(function(t) { if (t.id) tasksCache[t.id] = t; });

      // Populate assignee filter
      var sel = document.getElementById('filter-assigned');
      if (sel) {
        var existing = Array.from(sel.options).map(function(o) { return o.value; });
        usersCache.forEach(function(u) {
          var uid = u.user_id || u.id || '';
          if (uid && !existing.includes(uid)) {
            var opt = document.createElement('option');
            opt.value = uid; opt.textContent = u.name || u.email;
            if (uid === filters.assigned_to) opt.selected = true;
            sel.appendChild(opt);
          }
        });
      }

      var sub = document.getElementById('tasks-subtitle');
      if (sub) sub.textContent = rows.length + ' task' + (rows.length !== 1 ? 's' : '');

      rerender();
      // After tasks are in cache, check if a notification deep-link is waiting
      if (window._wvDeepLink && window._wvDeepLink.module === 'tasks') {
        setTimeout(checkDeepLink, 100);
      }
    }).catch(function(e) {
      if (content) content.innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-red-400">' +
          '<i class="fas fa-exclamation-circle text-4xl mb-3"></i>' +
          '<p class="font-semibold">' + esc(e.message) + '</p>' +
        '</div>';
    });
  }

  // ================================================================
  //  STATS STRIP
  // ================================================================
  function renderStats(rows) {
    var el = document.getElementById('tasks-stats');
    if (!el) return;
    var counts = {}; STATUSES.forEach(function(s) { counts[s] = 0; });
    rows.forEach(function(t) { if (counts[t.status] !== undefined) counts[t.status]++; });
    var totalH   = rows.reduce(function(s, t) { return s + (parseFloat(t.actual_hours)||0); }, 0);
    var overdueN = rows.filter(isOverdue).length;
    var billRows = rows.filter(function(t) { return t.billable==='true'||t.billable===true; });
    var billTot  = billRows.reduce(function(s, t) { return s + billableValue(t); }, 0);
    var doneN    = rows.filter(function(t) { return t.status==='Done'; }).length;
    var total    = rows.length;
    var donePct  = total ? Math.round((doneN / total) * 100) : 0;

    el.innerHTML =
      STATUSES.map(function(s) {
        var k = KANBAN_COLORS[s] || {};
        return '<button data-quick="' + (s==='To Do'?'':s) + '" class="quick-chip flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap hover:bg-slate-50 px-1 py-0.5 rounded-lg transition-colors cursor-pointer">' +
          '<span class="w-2 h-2 rounded-full ' + (k.dot||'bg-slate-400') + '"></span>' +
          '<span class="font-bold text-slate-700">' + counts[s] + '</span>' +
          '<span>' + s + '</span></button>';
      }).join('<span class="text-slate-200">|</span>') +
      '<span class="text-slate-200">·</span>' +
      '<span class="flex items-center gap-1 whitespace-nowrap">' +
        '<i class="fas fa-clock text-blue-400"></i>' +
        '<span class="font-bold text-slate-700">' + fmtHours(totalH) + '</span>' +
      '</span>' +
      (billRows.length
        ? '<span class="text-slate-200">·</span>' +
          '<span class="flex items-center gap-1 whitespace-nowrap text-green-600 font-semibold">' +
            '<i class="fas fa-dollar-sign text-green-500 text-[10px]"></i>' +
            '<span class="font-bold">' + (billTot ? fmtMoney(billTot) : billRows.length + ' billable') + '</span>' +
          '</span>'
        : '') +
      (overdueN
        ? '<span class="text-slate-200">·</span>' +
          '<span class="flex items-center gap-1 whitespace-nowrap text-red-500 font-bold">' +
            '<i class="fas fa-fire"></i>' + overdueN + ' overdue' +
          '</span>'
        : '') +
      '<span class="text-slate-200">·</span>' +
      '<span class="flex items-center gap-1.5 whitespace-nowrap ml-auto">' +
        progressRing(donePct, 22, 2.5) +
        '<span class="text-[11px] text-slate-500">' + donePct + '% done</span>' +
      '</span>';

    // Wire stats chips
    el.querySelectorAll('.quick-chip').forEach(function(b) {
      b.addEventListener('click', function() {
        if (this.dataset.quick !== undefined) { filters.quick = this.dataset.quick; render(); rerender(); }
      });
    });
  }

  // ================================================================
  //  LIST VIEW
  // ================================================================
  function renderList(tasks) {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    if (!tasks.length) {
      content.innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-slate-300">' +
          '<i class="fas fa-clipboard-list text-5xl mb-4 opacity-25"></i>' +
          '<p class="font-semibold text-slate-500">No tasks match your filters</p>' +
          '<p class="text-sm mt-1">Try clearing filters or create a new task.</p>' +
        '</div>';
      return;
    }

    var showProject = projectsInstalled();

    function sortTh(col, label) {
      var active = sortState.col === col;
      var icon   = active ? (sortState.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
      return '<th class="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap" data-action="sort" data-col="' + col + '">' +
        '<span class="flex items-center gap-1">' + label +
          '<i class="fas ' + icon + ' text-[9px] ' + (active ? 'text-blue-500' : 'text-slate-300') + '"></i>' +
        '</span></th>';
    }

    var rows = tasks.map(function(t) {
      var overdue  = isOverdue(t);
      var done     = t.status === 'Done' || t.status === 'Cancelled';
      var pct      = calcProgress(t);
      var hasHours = parseFloat(t.estimated_hours) > 0 || parseFloat(t.actual_hours) > 0;
      var checklistPct = calcChecklistPct(t.id);
      var showProgress = hasHours || checklistPct > 0;

      var rowClass = 'border-t border-slate-100 hover:bg-blue-50/30 transition-colors group cursor-pointer' +
        (done ? ' bg-slate-50/60 opacity-60' : '') +
        (overdue && !done ? ' bg-red-50/30' : '') +
        (t.priority === 'Urgent' && !done ? ' border-l-2 border-l-red-400' : '');

      // Non-admins cannot edit a Done/Cancelled task unless it's been reopened
      var editLocked = done && !isAdmin();
      var editBtn = editLocked
        ? '<button data-action="edit-locked" data-id="' + t.id + '" title="Task is closed — request reopen to edit" class="act-btn icon-btn text-slate-300 cursor-not-allowed"><i class="fas fa-lock text-xs"></i></button>'
        : '<button data-action="edit" data-id="' + t.id + '" title="Edit" class="act-btn icon-btn hover:text-indigo-600 hover:bg-indigo-50"><i class="fas fa-pencil text-xs"></i></button>';

      var quickBtns =
        (!done
          ? '<button data-action="complete" data-id="' + t.id + '" title="Mark Done" class="act-btn icon-btn hover:text-green-600 hover:bg-green-50"><i class="fas fa-check text-xs"></i></button>' +
            '<button data-action="cancel"   data-id="' + t.id + '" title="Cancel"    class="act-btn icon-btn hover:text-orange-500 hover:bg-orange-50"><i class="fas fa-ban text-xs"></i></button>'
          : '<button data-action="reopen"   data-id="' + t.id + '" title="Reopen"    class="act-btn icon-btn hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-undo text-xs"></i></button>') +
        '<button data-action="log-hours" data-id="' + t.id + '" title="Log Hours"  class="act-btn icon-btn hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-clock text-xs"></i></button>' +
        '<button data-action="log-note"  data-id="' + t.id + '" title="Comment"    class="act-btn icon-btn hover:text-purple-600 hover:bg-purple-50"><i class="fas fa-comment text-xs"></i></button>' +
        editBtn +
        (isAdmin() ? '<button data-action="delete" data-id="' + t.id + '" data-title="' + esc(t.title) + '" title="Delete" class="act-btn icon-btn hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>' : '');

      return '<tr class="' + rowClass + '" data-action="view" data-id="' + t.id + '">' +

        // Task title + ID + tags + countdown
        '<td class="px-4 py-3" style="max-width:280px">' +
          '<div class="font-semibold text-slate-900 text-sm leading-snug ' + (done ? 'line-through text-slate-400' : '') + '">' + esc(t.title) + '</div>' +
          '<div class="flex items-center gap-2 mt-0.5">' +
            '<span class="text-[10px] text-slate-400 font-mono">' + esc(t.id) + '</span>' +
            countdown(t) +
          '</div>' +
          (t.tags ? '<div class="flex flex-wrap gap-1 mt-1">' +
            t.tags.split(',').map(function(tag) { tag = tag.trim();
              return tag ? '<span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-px rounded font-medium">' + esc(tag) + '</span>' : '';
            }).join('') + '</div>' : '') +
        '</td>' +

        // Status (inline-editable click → dropdown)
        '<td class="px-4 py-3 whitespace-nowrap" data-action="" data-id="">' +
          '<div class="inline-status-wrap" data-id="' + t.id + '">' + statusBadge(t.status) + '</div>' +
        '</td>' +

        // Priority (inline-editable)
        '<td class="px-4 py-3 whitespace-nowrap" data-action="" data-id="">' +
          '<div class="inline-priority-wrap" data-id="' + t.id + '">' + priorityBadge(t.priority) + '</div>' +
        '</td>' +

        // Progress ring + bar
        '<td class="px-4 py-3 whitespace-nowrap" style="min-width:90px">' +
          (showProgress
            ? '<div class="flex items-center gap-2">' +
                progressRing(pct, 30, 2.5) +
                (hasHours
                  ? '<div style="width:50px">' + hoursBar(t.actual_hours, t.estimated_hours) + '</div>'
                  : '<div style="width:50px;display:flex;flex-direction:column;gap:2px">' +
                      '<div style="height:4px;background:#e2e8f0;border-radius:9999px;width:100%">' +
                        '<div style="height:4px;border-radius:9999px;background:' + (pct>=100?'#16a34a':pct>=60?'#3b82f6':pct>=40?'#f59e0b':'#94a3b8') + ';width:' + pct + '%"></div>' +
                      '</div>' +
                      '<span style="font-size:10px;color:#94a3b8;font-weight:600">' + pct + '%</span>' +
                    '</div>') +
              '</div>'
            : '<span class="text-xs text-slate-300">—</span>') +
        '</td>' +

        // Due date
        '<td class="px-4 py-3 text-xs whitespace-nowrap ' + (overdue && !done ? 'text-red-500 font-bold' : 'text-slate-500') + '">' +
          (t.due_date
            ? '<div class="flex flex-col">' +
                '<span>' + fmtDate(t.due_date) + (overdue && !done ? ' <i class="fas fa-exclamation-circle text-[10px]"></i>' : '') + '</span>' +
              '</div>'
            : '<span class="text-slate-300">—</span>') +
        '</td>' +

        // Assigned
        '<td class="px-4 py-3 whitespace-nowrap">' +
          (t.assigned_to
            ? '<span class="inline-flex items-center gap-1.5 text-xs text-slate-600">' +
                userAvatar(t.assigned_to, 'w-6 h-6 text-[10px]') +
                '<span class="truncate" style="max-width:80px">' + esc(userName(t.assigned_to)) + '</span>' +
              '</span>'
            : '<span class="text-xs text-slate-300">—</span>') +
        '</td>' +

        // Billable
        '<td class="px-4 py-3 whitespace-nowrap">' + billableCell(t) + '</td>' +

        // Project
        (showProject
          ? '<td class="px-4 py-3 whitespace-nowrap">' +
              (t.project_id
                ? '<span class="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-semibold">' + esc(projectName(t.project_id)) + '</span>'
                : '<span class="text-xs text-slate-300">—</span>') +
            '</td>'
          : '') +

        // Actions
        '<td class="px-4 py-3 whitespace-nowrap" data-action="" data-id="">' +
          '<div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">' + quickBtns + '</div>' +
        '</td>' +

      '</tr>';
    }).join('');

    content.innerHTML =
      '<style>' +
        '.icon-btn{width:1.75rem;height:1.75rem;border-radius:.5rem;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;transition:all .15s;border:none;background:transparent;cursor:pointer;}' +
        '.inline-status-wrap:hover{opacity:.8;cursor:pointer;}' +
        '.inline-priority-wrap:hover{opacity:.8;cursor:pointer;}' +
        'tr[data-action="view"]:hover td:first-child .font-semibold{text-decoration:underline;text-decoration-color:#94a3b8}' +
      '</style>' +
      '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-left">' +
            '<thead><tr class="bg-slate-50 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">' +
              sortTh('title',    'Task') +
              sortTh('status',   'Status') +
              sortTh('priority', 'Priority') +
              sortTh('progress', 'Progress') +
              sortTh('due_date', 'Due') +
              sortTh('assigned_to', 'Assigned') +
              '<th class="px-4 py-3">Billable</th>' +
              (showProject ? '<th class="px-4 py-3">Project</th>' : '') +
              '<th class="px-4 py-3">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    // Inline status editing
    content.querySelectorAll('.inline-status-wrap').forEach(function(wrap) {
      wrap.addEventListener('click', function(e) {
        e.stopPropagation();
        var id   = this.dataset.id;
        var task = tasksCache[id];
        if (!task) return;
        openInlineSelect(this, STATUSES, task.status, function(val) {
          var isReopening = (task.status === 'Done' || task.status === 'Cancelled')
                         && val !== 'Done' && val !== 'Cancelled';
          if (isReopening) {
            handleReopenRequest(id, val);
          } else {
            quickUpdate(id, { status: val }, 'Status updated');
          }
        });
      });
    });
    // Inline priority editing
    content.querySelectorAll('.inline-priority-wrap').forEach(function(wrap) {
      wrap.addEventListener('click', function(e) {
        e.stopPropagation();
        var id   = this.dataset.id;
        var task = tasksCache[id];
        if (!task) return;
        openInlineSelect(this, PRIORITIES, task.priority, function(val) {
          quickUpdate(id, { priority: val }, 'Priority updated');
        });
      });
    });
  }

  function openInlineSelect(anchor, options, current, onChange) {
    // Remove any existing inline pickers
    document.querySelectorAll('.wv-inline-picker').forEach(function(el) { el.remove(); });
    var rect = anchor.getBoundingClientRect();
    var picker = document.createElement('div');
    picker.className = 'wv-inline-picker';
    picker.style.cssText = 'position:fixed;z-index:9997;background:#fff;border:1.5px solid #e2e8f0;border-radius:.75rem;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:.25rem;min-width:140px;top:' + (rect.bottom + 4) + 'px;left:' + rect.left + 'px';
    picker.innerHTML = options.map(function(opt) {
      return '<button data-val="' + esc(opt) + '" style="display:block;width:100%;text-align:left;padding:.45rem .75rem;border:none;background:' +
        (opt === current ? '#eff6ff' : 'transparent') + ';border-radius:.5rem;font-size:.75rem;font-weight:600;cursor:pointer;color:' +
        (opt === current ? '#1d4ed8' : '#374151') + ';font-family:inherit">' + opt + '</button>';
    }).join('');
    document.body.appendChild(picker);
    picker.querySelectorAll('button').forEach(function(btn) {
      btn.addEventListener('click', function() { picker.remove(); onChange(this.dataset.val); });
    });
    setTimeout(function() {
      document.addEventListener('click', function rm() { picker.remove(); document.removeEventListener('click', rm); });
    }, 10);
  }


  // ================================================================
  //  KANBAN VIEW — with drag-drop and stage progress rings
  // ================================================================
  function renderKanban(tasks) {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    var cols = STATUSES.map(function(status) {
      var colTasks = tasks.filter(function(t) { return t.status === status; });
      var k        = KANBAN_COLORS[status] || {};
      var totalH   = colTasks.reduce(function(s,t) { return s + (parseFloat(t.actual_hours)||0); }, 0);
      var billTot  = colTasks.reduce(function(s,t) { return s + billableValue(t); }, 0);
      var allPcts  = colTasks.map(calcProgress);
      var avgPct   = allPcts.length ? Math.round(allPcts.reduce(function(s,v){return s+v;},0)/allPcts.length) : 0;

      var cards = colTasks.map(function(t) {
        var overdue  = isOverdue(t);
        var hasHours = parseFloat(t.estimated_hours) > 0 || parseFloat(t.actual_hours) > 0;
        var pct      = calcProgress(t);
        var checklistPct = calcChecklistPct(t.id);
        var showProgress = hasHours || checklistPct > 0;
        var border   = STATUS_BORDER[t.status] || 'border-slate-200';

        return '<div draggable="true" data-drag-id="' + t.id + '" data-action="view" data-id="' + t.id + '" ' +
          'class="kanban-card bg-white rounded-xl border-l-4 ' + border + ' border border-slate-200 p-3 shadow-sm hover:shadow-md cursor-pointer transition-all select-none" ' +
          'style="margin-bottom:.5rem">' +

          // Title row + priority badge
          '<div class="flex items-start gap-2 mb-1.5">' +
            '<p class="text-sm font-semibold text-slate-900 leading-snug flex-1 line-clamp-2">' + esc(t.title) + '</p>' +
            priorityBadge(t.priority) +
          '</div>' +

          // Progress ring + countdown
          (showProgress
            ? '<div class="flex items-center gap-2 mb-2">' +
                progressRing(pct, 28, 2.5) +
                (hasHours
                  ? '<div class="flex-1">' + hoursBar(t.actual_hours, t.estimated_hours) + '</div>'
                  : '<div style="flex:1;display:flex;flex-direction:column;gap:2px">' +
                      '<div style="height:4px;background:#e2e8f0;border-radius:9999px">' +
                        '<div style="height:4px;border-radius:9999px;background:' + (pct>=100?'#16a34a':pct>=60?'#3b82f6':pct>=40?'#f59e0b':'#94a3b8') + ';width:' + pct + '%"></div>' +
                      '</div>' +
                      '<span style="font-size:10px;color:#94a3b8;font-weight:600">' + pct + '%</span>' +
                    '</div>') +
              '</div>'
            : '') +

          // Countdown badge
          (countdown(t) ? '<div class="mb-2">' + countdown(t) + '</div>' : '') +

          // Project tag
          (projectsInstalled() && t.project_id
            ? '<div class="mb-2"><span class="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-px rounded font-semibold">' + esc(projectName(t.project_id)) + '</span></div>'
            : '') +

          // Billable badge
          ((t.billable === 'true' || t.billable === true)
            ? '<div class="mb-2 flex flex-col gap-0.5">' +
                '<span class="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-px rounded font-semibold">' +
                  '<i class="fas fa-dollar-sign text-[9px]"></i>' +
                  (billableValue(t) ? fmtMoney(billableValue(t)) : 'Billable') +
                '</span>' +
                approvalBadge(t) +
              '</div>'
            : '') +

          // Tags
          (t.tags
            ? '<div class="flex flex-wrap gap-1 mb-2">' +
                t.tags.split(',').slice(0,3).map(function(tag) { tag=tag.trim(); return tag ? '<span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-px rounded">' + esc(tag) + '</span>' : ''; }).join('') +
              '</div>'
            : '') +

          // Footer: due + assignee + log button
          '<div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">' +
            '<span class="text-xs ' + (overdue ? 'text-red-500 font-bold' : 'text-slate-400') + '">' +
              (t.due_date ? '<i class="fas fa-calendar-alt mr-0.5 text-[10px]"></i>' + fmtDate(t.due_date) : '') +
            '</span>' +
            '<div class="flex items-center gap-1.5">' +
              (t.assigned_to ? userAvatar(t.assigned_to, 'w-6 h-6 text-[10px]') : '') +
              '<button data-action="log-hours" data-id="' + t.id + '" class="kanban-act text-[10px] bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-500 px-1.5 py-px rounded-lg font-semibold transition-colors"><i class="fas fa-clock mr-0.5"></i>Log</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // Column header with progress ring
      return '<div class="flex-shrink-0 w-72 flex flex-col" data-drop-col="' + esc(status) + '">' +

        // Column header
        '<div class="' + (k.head||'bg-slate-50') + ' rounded-xl px-3 py-2 mb-3 border ' + (k.border||'border-slate-200') + '">' +
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-2">' +
              '<span class="w-2.5 h-2.5 rounded-full ' + (k.dot||'bg-slate-400') + '"></span>' +
              '<span class="text-sm font-extrabold text-slate-700">' + status + '</span>' +
              '<span class="text-xs font-bold text-slate-400 bg-white/60 px-2 py-0.5 rounded-full border">' + colTasks.length + '</span>' +
            '</div>' +
            columnProgressRing(colTasks, status) +
          '</div>' +
          (colTasks.length
            ? '<div class="flex items-center gap-3 mt-2 text-[10px] text-slate-500">' +
                (totalH ? '<span><i class="fas fa-clock mr-0.5 text-blue-400"></i>' + fmtHours(totalH) + '</span>' : '') +
                (billTot ? '<span><i class="fas fa-dollar-sign mr-0.5 text-green-500"></i>' + fmtMoney(billTot) + '</span>' : '') +
                '<span class="ml-auto">' + avgPct + '% avg progress</span>' +
              '</div>'
            : '') +
        '</div>' +

        // Drop zone
        '<div class="kanban-col-cards flex flex-col min-h-24" data-drop-col="' + esc(status) + '" style="flex:1">' +
          (cards || '<div class="text-xs text-slate-300 text-center py-8 border-2 border-dashed border-slate-200 rounded-xl kanban-empty-drop" data-drop-col="' + esc(status) + '">Drop here</div>') +
        '</div>' +

        // Add card button
        '<button data-action="new-in-col" data-status="' + esc(status) + '" ' +
          'class="mt-2 w-full text-xs text-slate-400 hover:text-slate-700 hover:bg-white border border-dashed border-slate-200 hover:border-slate-400 rounded-xl py-2 transition-all font-semibold">' +
          '<i class="fas fa-plus mr-1"></i>Add task' +
        '</button>' +

      '</div>';
    }).join('');

    content.innerHTML = '<style>' +
      '.kanban-card{transition:box-shadow .15s,transform .1s;}.kanban-card:active{transform:scale(.98);}' +
      '.kanban-card.drag-over-indicator{border-top:2px solid #3b82f6;}' +
      '.kanban-col-cards.drag-over{background:rgba(59,130,246,.05);border-radius:.75rem;}' +
    '</style>' +
    '<div class="flex gap-4 overflow-x-auto pb-6 kanban-scroll" style="align-items:flex-start;min-height:400px">' + cols + '</div>';

    // Wire kanban action buttons (stop propagation)
    content.querySelectorAll('.kanban-act').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); });
    });

    // Wire "add task in column" buttons
    content.querySelectorAll('[data-action="new-in-col"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openTaskForm(null, { status: this.dataset.status });
      });
    });

    // Drag and drop
    bindKanbanDragDrop(content);
  }

  function bindKanbanDragDrop(content) {
    var dragId = null;

    content.querySelectorAll('.kanban-card').forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        dragId = this.dataset.dragId;
        this.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function() {
        this.style.opacity = '1';
        content.querySelectorAll('.kanban-col-cards').forEach(function(c) { c.classList.remove('drag-over'); });
      });
    });

    content.querySelectorAll('.kanban-col-cards, .kanban-empty-drop').forEach(function(zone) {
      zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        content.querySelectorAll('.kanban-col-cards').forEach(function(c) { c.classList.remove('drag-over'); });
        var col = this.closest('[data-drop-col]');
        if (col) {
          var cards = col.querySelector('.kanban-col-cards');
          if (cards) cards.classList.add('drag-over');
        }
      });
      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        content.querySelectorAll('.kanban-col-cards').forEach(function(c) { c.classList.remove('drag-over'); });
        var col = this.closest('[data-drop-col]');
        var newStatus = col ? col.dataset.dropCol : null;
        if (!newStatus || !dragId) return;
        var task = tasksCache[dragId];
        if (!task || task.status === newStatus) return;
        var isReopening = (task.status === 'Done' || task.status === 'Cancelled')
                       && newStatus !== 'Done' && newStatus !== 'Cancelled';
        if (isReopening) {
          handleReopenRequest(dragId, newStatus);
        } else {
          quickUpdate(dragId, { status: newStatus }, 'Moved to ' + newStatus);
        }
        dragId = null;
      });
    });
  }


  // ================================================================
  //  TASK DETAIL MODAL — with activity timeline & comments
  // ================================================================
  function openTaskDetail(task) {
    if (!task) return;

    Promise.all([
      api('tasks/hours', { task_id: task.id }),
      api('tasks/notes', { task_id: task.id }).catch(function() { return { rows: [] }; }),
      api('tasks/comments', { task_id: task.id }).catch(function() { return { rows: [] }; }),
    ]).then(function(results) {
      var logs     = results[0].rows || [];
      var total    = results[0].total || 0;
      var notes    = results[1].rows || [];
      var comments = results[2].rows || [];
      var over     = isOverdue(task);
      var pct      = calcProgress(task);

      // ── Build checklist HTML ────────────────────────────────────
      var _cState = getChecklist(task.id);
      var _checklistStagesHtml = CHECKLIST_STAGES.map(function(stage) {
        var checked = !!_cState[stage];
        return '<label style="display:flex;align-items:center;gap:.625rem;padding:.55rem .75rem;border-radius:.625rem;cursor:pointer;' +
          (checked ? 'background:#f0fdf4' : 'background:transparent') + '">' +
          '<input type="checkbox" data-checklist-stage="' + stage + '" data-task-id="' + task.id + '" ' +
            (checked ? 'checked ' : '') +
            'style="width:1rem;height:1rem;accent-color:#16a34a;cursor:pointer;flex-shrink:0">' +
          '<span style="flex:1;font-size:.8125rem;font-weight:600;color:' + (checked ? '#16a34a' : '#475569') + ';' +
            (checked ? 'text-decoration:line-through;opacity:.7' : '') + '">' + stage + '</span>' +
          '<span style="font-size:.6875rem;font-weight:700;color:' + (checked ? '#16a34a' : '#94a3b8') + '">+20%</span>' +
        '</label>';
      }).join('');
      var _checklistPct = calcChecklistPct(task.id);
      var _checklistBarColor = _checklistPct >= 100 ? '#16a34a' : _checklistPct >= 60 ? '#3b82f6' : _checklistPct >= 40 ? '#f59e0b' : '#94a3b8';
      var checklistHtml =
        '<div id="td-checklist-wrap" class="border border-slate-200 rounded-xl overflow-hidden">' +
          '<div class="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">' +
            '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Task Progress Checklist</p>' +
            '<span id="td-checklist-pct-lbl" style="font-size:.75rem;font-weight:700;color:' + _checklistBarColor + '">' + _checklistPct + '%</span>' +
          '</div>' +
          '<div style="height:4px;background:#e2e8f0">' +
            '<div id="td-checklist-bar" style="height:4px;background:' + _checklistBarColor + ';width:' + _checklistPct + '%;transition:width .3s,background .3s"></div>' +
          '</div>' +
          '<div class="py-1">' + _checklistStagesHtml + '</div>' +
        '</div>';

      // Build unified activity timeline (comments + notes + hours, sorted by date)
      var timeline = [];
      comments.forEach(function(c) { timeline.push({ type:'comment', date: c.created_at || c.date, data: c }); });
      notes.forEach(function(n)    { timeline.push({ type:'note',    date: n.created_at || n.date, data: n }); });
      logs.forEach(function(l)     { timeline.push({ type:'hours',   date: l.created_at || l.date, data: l }); });
      timeline.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

      var timelineHtml = timeline.length
        ? timeline.map(function(item) {
            var d = item.data;
            if (item.type === 'comment') {
              var txt = d.comment || '';
              // Parse @mentions
              txt = esc(txt).replace(/@(\w+)/g, '<span class="text-blue-600 font-semibold">@$1</span>');
              return '<div class="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">' +
                '<div class="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">' + userInitial(d.user_id) + '</div>' +
                '<div class="flex-1 min-w-0">' +
                  '<div class="flex items-center gap-2 mb-0.5">' +
                    '<span class="text-xs font-semibold text-slate-800">' + esc(userName(d.user_id)) + '</span>' +
                    '<span class="text-[9px] bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-px rounded font-semibold">Comment</span>' +
                    '<span class="text-[10px] text-slate-400 ml-auto">' + fmtDate(item.date) + '</span>' +
                  '</div>' +
                  '<p class="text-xs text-slate-700 leading-relaxed">' + txt + '</p>' +
                '</div></div>';
            }
            if (item.type === 'note') {
              return '<div class="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">' +
                '<div class="w-7 h-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">' + userInitial(d.user_id) + '</div>' +
                '<div class="flex-1 min-w-0">' +
                  '<div class="flex items-center gap-2 mb-0.5">' +
                    '<span class="text-xs font-semibold text-slate-800">' + esc(userName(d.user_id)) + '</span>' +
                    '<span class="text-[9px] bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-px rounded font-semibold">Note</span>' +
                    '<span class="text-[10px] text-slate-400 ml-auto">' + fmtDate(item.date) + '</span>' +
                  '</div>' +
                  '<p class="text-xs text-slate-700 leading-relaxed whitespace-pre-line">' + esc(d.note || '') + '</p>' +
                '</div></div>';
            }
            if (item.type === 'hours') {
              return '<div class="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">' +
                '<div class="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">' + userInitial(d.user_id) + '</div>' +
                '<div class="flex-1 min-w-0">' +
                  '<div class="flex items-center gap-2 mb-0.5">' +
                    '<span class="text-xs font-semibold text-slate-800">' + esc(userName(d.user_id)) + '</span>' +
                    '<span class="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-px rounded font-semibold">Logged ' + fmtHours(d.hours) + '</span>' +
                    '<span class="text-[10px] text-slate-400 ml-auto">' + fmtDate(item.date) + '</span>' +
                  '</div>' +
                  (d.notes ? '<p class="text-xs text-slate-500">' + esc(d.notes) + '</p>' : '') +
                '</div></div>';
            }
            return '';
          }).join('')
        : '<div class="py-6 text-center text-slate-300"><i class="fas fa-stream text-2xl mb-2 block opacity-40"></i><p class="text-xs">No activity yet</p></div>';

      function meta(label, val) {
        return '<div class="flex items-start justify-between gap-2 py-2.5 border-b border-slate-100 last:border-0">' +
          '<span class="text-xs text-slate-400 font-medium flex-shrink-0">' + label + '</span>' +
          '<span class="text-xs font-semibold text-slate-700 text-right">' + val + '</span>' +
        '</div>';
      }

      var html =
        // Header
        '<div class="px-6 py-5 border-b border-slate-100 flex items-start gap-4">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex flex-wrap items-center gap-1.5 mb-2">' +
              statusBadge(task.status) + priorityBadge(task.priority) +
              '<span class="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-px rounded">' + esc(task.id) + '</span>' +
              (over ? '<span class="text-[10px] text-red-500 font-bold bg-red-50 px-2 py-px rounded border border-red-200"><i class="fas fa-fire mr-0.5"></i>Overdue</span>' : '') +
            '</div>' +
            '<h2 class="text-lg font-extrabold text-slate-900 leading-snug">' + esc(task.title) + '</h2>' +
            (pct > 0 ? '<div class="mt-2 flex items-center gap-2">' + progressRing(pct, 28, 2.5) + hoursBar(task.actual_hours, task.estimated_hours) + '</div>' : '') +
          '</div>' +
          '<button id="tm-close" class="flex-shrink-0 w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer">✕</button>' +
        '</div>' +

        // Body — two columns
        '<div style="display:grid;grid-template-columns:1fr 280px;min-height:400px">' +

          // Left: description, comment box, timeline
          '<div class="px-6 py-5 border-r border-slate-100 flex flex-col gap-4" style="overflow-y:auto;max-height:70vh">' +

            (task.description
              ? '<div><p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2">Description</p>' +
                '<p class="text-sm text-slate-700 leading-relaxed">' + esc(task.description) + '</p></div>'
              : '') +

            // ── Checklist Progress ──────────────────────────────────
            checklistHtml +

            // Comment composer with @mention picker
            '<div class="border border-slate-200 rounded-xl overflow-hidden">' +
              '<div class="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">' +
                '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Leave a comment</p>' +
                '<span class="text-[10px] text-slate-400">Type @ to mention someone</span>' +
              '</div>' +
              '<div class="p-3 relative">' +
                '<div id="td-mention-picker" class="hidden absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden" style="bottom:calc(100% - 2rem);left:.75rem;min-width:220px;max-height:200px;overflow-y:auto"></div>' +
                '<textarea id="td-comment-input" rows="3" placeholder="Write a comment… type @name to mention someone" ' +
                  'class="w-full text-sm text-slate-700 border-none outline-none bg-transparent resize-none placeholder-slate-300 leading-relaxed" style="font-family:inherit"></textarea>' +
                '<div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">' +
                  '<div id="td-mention-chips" class="flex flex-wrap gap-1"></div>' +
                  '<button id="td-comment-submit" class="btn-primary text-xs py-1.5 px-3 flex-shrink-0"><i class="fas fa-paper-plane mr-1 text-[10px]"></i>Comment</button>' +
                '</div>' +
              '</div>' +
            '</div>' +

            // Activity timeline
            '<div>' +
              '<div class="flex items-center justify-between mb-3">' +
                '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Activity</p>' +
                '<div class="flex gap-2">' +
                  '<button id="td-log-btn"  class="btn-primary text-xs py-1 px-2.5"><i class="fas fa-clock mr-1 text-[10px]"></i>Log Hours</button>' +
                  '<button id="td-note-btn" class="text-xs py-1 px-2.5 rounded-lg font-semibold border-none cursor-pointer" style="background:#7c3aed;color:#fff"><i class="fas fa-sticky-note mr-1 text-[10px]"></i>Note</button>' +
                '</div>' +
              '</div>' +
              timelineHtml +
            '</div>' +
          '</div>' +

          // Right: metadata + actions
          '<div class="px-5 py-5 bg-slate-50/50 flex flex-col" style="overflow-y:auto;max-height:70vh">' +
            '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Details</p>' +

            meta('Status', statusBadge(task.status)) +
            meta('Priority', priorityBadge(task.priority)) +
            meta('Assigned To', task.assigned_to
              ? '<span class="flex items-center gap-1.5">' + userAvatar(task.assigned_to,'w-5 h-5 text-[10px]') + esc(userName(task.assigned_to)) + '</span>'
              : '<span class="text-slate-300">Unassigned</span>') +
            meta('Due Date', task.due_date
              ? '<span class="' + (over ? 'text-red-500 font-bold' : '') + '">' + fmtDate(task.due_date) +
                (over ? ' <i class="fas fa-exclamation-circle"></i>' : '') +
                '<br><span class="text-slate-400 font-normal">' + (countdown(task)||'') + '</span></span>'
              : '<span class="text-slate-300">None</span>') +
            meta('Progress', progressRing(pct, 32, 3) + '<span class="ml-1 text-sm font-bold ' + (pct>=100?'text-green-600':pct>0?'text-blue-600':'text-slate-400') + '">' + pct + '%</span>') +
            meta('Est. Hours', task.estimated_hours ? fmtHours(task.estimated_hours) : '<span class="text-slate-300">—</span>') +
            meta('Actual Hours', '<span class="text-blue-600 font-bold">' + fmtHours(task.actual_hours || 0) + '</span>') +
            ((task.billable === 'true' || task.billable === true)
              ? meta('Billable', '<div class="flex flex-col gap-1">' +
                  '<span class="text-green-700 font-bold">' + (task.billable_rate ? fmtMoney(billableValue(task)) : 'Yes — rate TBD') + '</span>' +
                  (task.billable_rate ? '<span class="text-[10px] text-slate-400">' + (task.billable_pay_type==='per_hour'?fmtMoney(task.billable_rate)+'/hr':task.billable_pay_type==='per_task'?fmtMoney(task.billable_rate)+' flat':'Salary') + '</span>' : '') +
                  approvalBadge(task) + '</div>')
              : '') +
            (task.tags
              ? meta('Tags', task.tags.split(',').map(function(t) {
                  return '<span class="text-[10px] bg-white border border-slate-200 text-slate-600 px-1.5 py-px rounded">' + esc(t.trim()) + '</span>';
                }).join(' '))
              : '') +
            (projectsInstalled() && task.project_id
              ? meta('Project', '<button data-action="open-project" data-pid="' + esc(task.project_id) + '" class="bg-purple-50 text-purple-700 px-1.5 py-px rounded font-semibold text-xs hover:bg-purple-100 transition-colors border-none cursor-pointer">' + esc(projectName(task.project_id)) + ' <i class="fas fa-external-link-alt text-[9px] ml-0.5"></i></button>')
              : '') +
            meta('Created', fmtDate(task.created_at) || '<span class="text-slate-300">—</span>') +

            '<div class="flex flex-col gap-2 mt-4">' +
              // Reopen request panel — managers see Approve/Deny buttons on Done/Cancelled tasks
              ((task.status === 'Done' || task.status === 'Cancelled') && isAdmin()
                ? '<div class="border border-orange-200 rounded-xl p-3 bg-orange-50">' +
                    '<p class="text-[11px] font-bold text-orange-700 mb-2"><i class="fas fa-unlock-alt mr-1"></i>Reopen Task</p>' +
                    '<p class="text-[11px] text-orange-600 mb-2">As a manager you can reopen this task directly, or approve a pending request.</p>' +
                    '<div class="flex gap-2">' +
                      '<button id="td-reopen-btn" class="flex-1 text-xs text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg px-3 py-2 font-semibold border-none cursor-pointer"><i class="fas fa-undo mr-1"></i>Reopen</button>' +
                    '</div>' +
                  '</div>'
                : '') +
              // Billable approval panel
              ((task.billable === 'true' || task.billable === true) && isAdmin()
                ? '<div class="border border-amber-200 rounded-xl p-3 bg-amber-50">' +
                    '<p class="text-[11px] font-bold text-amber-700 mb-2"><i class="fas fa-dollar-sign mr-1"></i>Billable Approval</p>' +
                    (task.approval_status === 'approved'
                      ? '<div class="flex items-center gap-2">' +
                          '<span class="flex-1 text-xs text-green-700 font-semibold bg-green-100 rounded-lg px-3 py-1.5 text-center"><i class="fas fa-check-circle mr-1"></i>Approved</span>' +
                          '<button id="td-reject-btn" class="text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 font-semibold border-none cursor-pointer">Reject</button>' +
                        '</div>'
                      : task.approval_status === 'rejected'
                        ? '<div class="flex items-center gap-2">' +
                            '<span class="flex-1 text-xs text-red-600 font-semibold bg-red-100 rounded-lg px-3 py-1.5 text-center"><i class="fas fa-times-circle mr-1"></i>Rejected</span>' +
                            '<button id="td-approve-btn" class="text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-3 py-1.5 font-semibold border-none cursor-pointer">Approve</button>' +
                          '</div>'
                        : '<div class="flex gap-2">' +
                            '<button id="td-reject-btn"  class="flex-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-2 font-semibold border-none cursor-pointer"><i class="fas fa-times mr-1"></i>Reject</button>' +
                            '<button id="td-approve-btn" class="flex-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-3 py-2 font-semibold border-none cursor-pointer"><i class="fas fa-check mr-1"></i>Approve</button>' +
                          '</div>') +
                  '</div>'
                : '') +
              '<button id="td-edit-btn" class="btn-primary w-full text-sm"><i class="fas fa-pencil mr-1.5 text-xs"></i>Edit Task</button>' +
              (isAdmin() ? '<button id="td-delete-btn" class="btn-secondary w-full text-sm text-red-500 hover:bg-red-50"><i class="fas fa-trash mr-1.5 text-xs"></i>Delete</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>';

      showModal(html, '960px');

      // Wire checklist checkboxes
      var checkboxes = document.querySelectorAll('[data-checklist-stage]');
      checkboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
          var stage  = this.dataset.checklistStage;
          var tid    = this.dataset.taskId;
          var cState = getChecklist(tid);
          cState[stage] = this.checked;
          saveChecklist(tid, cState);

          // Update row styling
          var lbl = this.closest('label');
          if (lbl) {
            var txt = lbl.querySelector('span:not([style*="+20%"])');
            var pct = lbl.querySelector('span[style*="+20%"]');
            if (this.checked) {
              lbl.style.background = '#f0fdf4';
              if (txt) { txt.style.color = '#16a34a'; txt.style.textDecoration = 'line-through'; txt.style.opacity = '0.7'; }
              if (pct) pct.style.color = '#16a34a';
            } else {
              lbl.style.background = 'transparent';
              if (txt) { txt.style.color = '#475569'; txt.style.textDecoration = 'none'; txt.style.opacity = '1'; }
              if (pct) pct.style.color = '#94a3b8';
            }
          }

          // Update progress bar + label
          var newPct   = calcChecklistPct(tid);
          var barColor = newPct >= 100 ? '#16a34a' : newPct >= 60 ? '#3b82f6' : newPct >= 40 ? '#f59e0b' : '#94a3b8';
          var bar      = document.getElementById('td-checklist-bar');
          var lbl2     = document.getElementById('td-checklist-pct-lbl');
          if (bar)  { bar.style.width = newPct + '%'; bar.style.background = barColor; }
          if (lbl2) { lbl2.textContent = newPct + '%'; lbl2.style.color = barColor; }

          // Update task in cache so list/kanban rings refresh on close
          if (tasksCache[tid]) { /* calcProgress reads localStorage live */ }
          rerender();
        });
      });

      // Wire buttons
      document.getElementById('tm-close').addEventListener('click', closeModal);
      document.getElementById('td-log-btn').addEventListener('click', function() { closeModal(); openLogHoursModal(task); });
      document.getElementById('td-note-btn').addEventListener('click', function() { closeModal(); openLogNoteModal(task); });
      document.getElementById('td-edit-btn').addEventListener('click', function() { closeModal(); openTaskForm(task); });

      // Wire "open project" link in task detail
      var openProjBtn = document.querySelector('[data-action="open-project"]');
      if (openProjBtn) {
        openProjBtn.addEventListener('click', function() {
          var pid = this.dataset.pid;
          if (!pid) return;
          closeModal();
          window._wvDeepLink = { module: 'projects', id: pid };
          if (typeof showModule === 'function') {
            showModule('projects');
          } else {
            var navLink = document.querySelector('[data-module="projects"]');
            if (navLink) navLink.click();
          }
        });
      }
      // If task is closed and user is not admin, grey out and block the edit button
      var tdEditBtn = document.getElementById('td-edit-btn');
      if (tdEditBtn && (task.status === 'Done' || task.status === 'Cancelled') && !isAdmin()) {
        tdEditBtn.disabled = true;
        tdEditBtn.title = 'Task is closed — request reopen to edit';
        tdEditBtn.style.opacity = '0.4';
        tdEditBtn.style.cursor = 'not-allowed';
      }
      var db = document.getElementById('td-delete-btn');
      if (db) db.addEventListener('click', function() { closeModal(); openDeleteModal(task.id, task.title); });
      var ab = document.getElementById('td-approve-btn');
      if (ab) ab.addEventListener('click', function() { submitApproval(task.id, 'approve'); });
      var rb = document.getElementById('td-reject-btn');
      if (rb) rb.addEventListener('click', function() { submitApproval(task.id, 'reject'); });
      var reb = document.getElementById('td-reopen-btn');
      if (reb) reb.addEventListener('click', function() { closeModal(); handleReopenRequest(task.id, task._reopenTarget || 'To Do'); });

      // ── @mention picker wiring ───────────────────────────────
      var _mentionedUsers = []; // [{uid, name}] resolved mentions
      var _mentionStart   = -1; // cursor pos where @ was typed

      var commentInp = document.getElementById('td-comment-input');
      var mentionDd  = document.getElementById('td-mention-picker');
      var mentionChips = document.getElementById('td-mention-chips');

      function closeMentionPicker() {
        if (mentionDd) mentionDd.classList.add('hidden');
        _mentionStart = -1;
      }
      function renderMentionChips() {
        if (!mentionChips) return;
        mentionChips.innerHTML = _mentionedUsers.map(function(u) {
          return '<span class="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-px rounded font-semibold">' +
            '@' + esc(u.name) +
            '<button type="button" data-uid="' + esc(u.uid) + '" class="remove-mention ml-0.5 text-blue-400 hover:text-blue-700 border-none bg-transparent cursor-pointer p-0 leading-none">✕</button>' +
          '</span>';
        }).join('');
        mentionChips.querySelectorAll('.remove-mention').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var uid = this.dataset.uid;
            _mentionedUsers = _mentionedUsers.filter(function(u) { return u.uid !== uid; });
            renderMentionChips();
          });
        });
      }

      if (commentInp) {
        commentInp.addEventListener('keyup', function(e) {
          var val   = this.value;
          var pos   = this.selectionStart;
          // Find if cursor is right after an @word
          var before = val.slice(0, pos);
          var match  = before.match(/@(\w*)$/);
          if (!match) { closeMentionPicker(); return; }
          var query = match[1].toLowerCase();
          _mentionStart = pos - match[0].length;
          var hits = usersCache.filter(function(u) {
            return !query || (u.name||'').toLowerCase().includes(query) || (u.email||'').toLowerCase().includes(query);
          }).slice(0, 6);
          if (!hits.length) { closeMentionPicker(); return; }
          mentionDd.innerHTML = hits.map(function(u) {
            var uid = u.user_id || u.id;
            return '<button type="button" data-uid="' + esc(uid) + '" data-name="' + esc(u.name||u.email) + '" ' +
              'class="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-blue-50 border-none bg-transparent cursor-pointer transition-colors">' +
              userAvatar(uid, 'w-7 h-7 text-xs flex-shrink-0') +
              '<div class="text-left"><div class="text-sm font-semibold text-slate-800">' + esc(u.name||u.email) + '</div>' +
              (u.job_title ? '<div class="text-[11px] text-slate-400">' + esc(u.job_title) + '</div>' : '') +
              '</div></button>';
          }).join('');
          mentionDd.classList.remove('hidden');
          // Wire pick
          mentionDd.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var uid  = this.dataset.uid;
              var name = this.dataset.name;
              // Replace @query with @Name in the textarea
              var txt  = commentInp.value;
              var pre  = txt.slice(0, _mentionStart);
              var post = txt.slice(commentInp.selectionStart);
              commentInp.value = pre + '@' + name + ' ' + post;
              commentInp.focus();
              // Track mentioned user (avoid duplicates)
              if (!_mentionedUsers.find(function(u) { return u.uid === uid; })) {
                _mentionedUsers.push({ uid: uid, name: name });
                renderMentionChips();
              }
              closeMentionPicker();
            });
          });
        });
        commentInp.addEventListener('blur', function() { setTimeout(closeMentionPicker, 200); });
      }

      // Comment submit
      document.getElementById('td-comment-submit').addEventListener('click', function() {
        var txt = (document.getElementById('td-comment-input').value || '').trim();
        if (!txt) { toast('Write a comment first', 'info'); return; }

        var btn = this; btn.disabled = true;
        api('tasks/log-comment', { task_id: task.id, user_id: myUserId(), comment: txt })
          .then(function() {
            // Notify all resolved @mentioned users
            _mentionedUsers.forEach(function(u) {
              var mentioner = userName(myUserId()) || 'Someone';
              sendNotification(
                u.uid,
                mentioner + ' mentioned you in a comment',
                task.id,
                {
                  type:      'mention',
                  priority:  'high',
                  body:      '"' + txt.slice(0, 80) + (txt.length > 80 ? '…' : '') + '" on task: ' + (task.title||task.id),
                  group_key: 'mention:' + task.id + ':' + myUserId(),
                }
              );
            });
            // Also notify task assignee if they're not the commenter and not already mentioned
            if (task.assigned_to && task.assigned_to !== myUserId()) {
              var alreadyMentioned = _mentionedUsers.some(function(u) { return u.uid === task.assigned_to; });
              if (!alreadyMentioned) {
                sendNotification(
                  task.assigned_to,
                  (userName(myUserId())||'Someone') + ' commented on your task',
                  task.id,
                  { type:'comment', priority:'normal', body:txt.slice(0,80), group_key:'comment:' + task.id }
                );
              }
            }
            toast('Comment posted ✓', 'success');
            closeModal();
            openTaskDetail(tasksCache[task.id] || task);
          })
          .catch(function(e) { toast(e.message, 'error'); btn.disabled = false; });
      });

    }).catch(function() { toast('Could not load task details', 'error'); });
  }


  // ================================================================
  //  REOPEN APPROVAL
  // ================================================================
  // Managers and above can reopen immediately. Anyone else must send a
  // request — managers receive a notification and can approve from the
  // task detail panel.
  function handleReopenRequest(taskId, targetStatus) {
    targetStatus = targetStatus || 'To Do';
    var task = tasksCache[taskId];
    if (!task) return;

    // Manager / Admin / SuperAdmin → reopen directly
    if (isAdmin()) {
      quickUpdate(taskId, { status: targetStatus }, 'Task reopened ✓');
      return;
    }

    // Lower roles → show request dialog
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,.25);width:100%;max-width:420px;overflow:hidden;font-family:inherit">' +
        // Header
        '<div style="padding:1.25rem 1.5rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:.875rem">' +
          '<div style="width:2.75rem;height:2.75rem;border-radius:.75rem;background:#fef3c7;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
            '<i class="fas fa-unlock-alt" style="color:#d97706;font-size:1.1rem"></i>' +
          '</div>' +
          '<div>' +
            '<h3 style="font-size:.9375rem;font-weight:800;color:#0f172a;margin:0">Reopen Requires Approval</h3>' +
            '<p style="font-size:.72rem;color:#94a3b8;margin:.2rem 0 0">Only a Manager or above can reopen a closed task.</p>' +
          '</div>' +
        '</div>' +
        // Body
        '<div style="padding:1.25rem 1.5rem">' +
          '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:.75rem;padding:.875rem 1rem;margin-bottom:1rem">' +
            '<p style="font-size:.8rem;font-weight:700;color:#92400e;margin:0 0 .3rem"><i class="fas fa-info-circle" style="margin-right:.35rem"></i>What happens</p>' +
            '<p style="font-size:.8rem;color:#78350f;margin:0;line-height:1.55">' +
              'A reopen request for <strong>&ldquo;' + esc(task.title) + '&rdquo;</strong> will be sent to your managers. ' +
              'The task stays closed until someone approves it.' +
            '</p>' +
          '</div>' +
          '<div id="wv-reopen-result" style="margin-bottom:.75rem"></div>' +
          '<div style="display:flex;gap:.75rem">' +
            '<button id="wv-reopen-cancel" style="flex:1;padding:.65rem 1rem;background:#f1f5f9;color:#475569;border:none;border-radius:.625rem;font-size:.875rem;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>' +
            '<button id="wv-reopen-send"   style="flex:1;padding:.65rem 1rem;background:#d97706;color:#fff;border:none;border-radius:.625rem;font-size:.875rem;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:.5rem">' +
              '<i class="fas fa-paper-plane" style="font-size:.75rem"></i>Send Request' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.querySelector('#wv-reopen-cancel').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    modal.querySelector('#wv-reopen-send').addEventListener('click', function() {
      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:.75rem"></i> Sending…';

      var myName  = userName(myUserId()) || 'A team member';
      var body    = myName + ' has requested to reopen "' + task.title + '" (currently ' + task.status + ')';
      var managers = usersCache.filter(function(u) {
        return ['SuperAdmin','Admin','Manager'].includes(u.role) && (u.user_id || u.id) !== myUserId();
      });

      managers.forEach(function(u) {
        sendNotification(u.user_id || u.id, 'Reopen request: ' + task.title, taskId, {
          type: 'approval_needed', priority: 'high', body: body,
        });
      });

      // Store the pending reopen target status so managers can action it from the detail modal
      task._reopenTarget = targetStatus;

      var resultEl = modal.querySelector('#wv-reopen-result');
      resultEl.innerHTML =
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:.625rem;padding:.75rem 1rem;font-size:.8rem;color:#15803d;display:flex;align-items:center;gap:.5rem">' +
          '<i class="fas fa-check-circle"></i>' +
          '<span>Request sent to ' + managers.length + ' manager' + (managers.length !== 1 ? 's' : '') + '. They\'ll be notified to approve.</span>' +
        '</div>';
      btn.innerHTML = '<i class="fas fa-check"></i> Sent!';
      setTimeout(function() { modal.remove(); }, 2000);
    });
  }


  // ================================================================
  //  APPROVE / REJECT
  // ================================================================
  function submitApproval(taskId, action) {
    api(action === 'approve' ? 'tasks/approve' : 'tasks/reject', { id: taskId, approved_by: myUserId() })
      .then(function() {
        toast(action === 'approve' ? 'Task approved ✓' : 'Task rejected', action === 'approve' ? 'success' : 'info');
        if (action === 'approve') {
          // Notify the task assignee
          var task = tasksCache[taskId];
          if (task && task.assigned_to) sendNotification(task.assigned_to, 'Billable task approved ✓', taskId, { type:'status_change', priority:'normal', body: '"' + (task.title||taskId) + '" has been approved for billing.' });
        }
        closeModal(); loadData();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  }

  // ================================================================
  //  QUICK ACTIONS
  // ================================================================
  function quickUpdate(id, fields, msg) {
    var task = tasksCache[id];
    if (!task) return;
    var params = Object.assign({ id: id }, fields);
    api('tasks/update', params)
      .then(function() {
        Object.assign(task, fields);
        toast(msg || 'Updated', 'success');
        // If assigned_to changed, notify the new assignee
        if (fields.assigned_to && fields.assigned_to !== task.assigned_to) {
          sendNotification(fields.assigned_to, 'You\'ve been assigned: ' + (task.title || id), id, { type:'task_assigned', priority:'high', body:'Assigned by ' + (userName(myUserId()) || 'someone') });
          // Also notify admins if it's billable and pending approval
          if (task.billable === 'true' && (!task.approval_status || task.approval_status === 'pending')) {
            usersCache.filter(function(u) { return ['Admin','SuperAdmin','Manager'].includes(u.role); })
              .forEach(function(u) { sendNotification(u.user_id||u.id, 'Approval needed: ' + (task.title||id), id, { type:'approval_needed', priority:'critical' }); });
          }
        }
        rerender();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  }

  function quickCreate(data) {
    var params = Object.assign({ status: 'To Do', priority: 'Medium' }, data);
    try { params.created_by = myUserId(); } catch(e) {}
    api('tasks/create', params)
      .then(function(res) {
        toast('Task created ✓', 'success');
        loadData();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  }

  // ================================================================
  //  SAVE VIEW MODAL
  // ================================================================
  function openSaveViewModal() {
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900">Save Current View</h3>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<p class="text-sm text-slate-500">Save your current filters and sort as a named view for quick access.</p>' +
        '<div>' +
          '<label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">View Name</label>' +
          '<input id="sv-name" class="field" type="text" placeholder="e.g. My Urgent Tasks, This Week…" autofocus>' +
        '</div>' +
        '<div class="flex gap-3">' +
          '<button id="sv-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="sv-save"   class="btn-primary flex-1"><i class="fas fa-bookmark mr-1 text-xs"></i>Save View</button>' +
        '</div>' +
      '</div>';
    showModal(html, '400px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('sv-cancel').addEventListener('click', closeModal);
    document.getElementById('sv-save').addEventListener('click', function() {
      var name = (document.getElementById('sv-name').value || '').trim();
      if (!name) return;
      savedViews.push({ name: name, filters: Object.assign({}, filters), search: _searchVal, sort: Object.assign({}, sortState) });
      localStorage.setItem('wv_task_views', JSON.stringify(savedViews));
      toast('View "' + name + '" saved', 'success');
      closeModal();
      render(); rerender();
    });
    setTimeout(function() { var el = document.getElementById('sv-name'); if (el) el.focus(); }, 80);
  }

  // ================================================================
  //  KEYBOARD SHORTCUTS MODAL
  // ================================================================
  function openShortcutsModal() {
    var shortcuts = [
      ['N', 'New task'],
      ['/', 'Focus search'],
      ['K', 'Kanban view'],
      ['L', 'List view'],
      ['Esc', 'Close modal / clear search'],
      ['Enter', 'Quick-add (in quick add bar)'],
    ];
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900">Keyboard Shortcuts</h3>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-4">' +
        '<div class="space-y-1">' +
        shortcuts.map(function(s) {
          return '<div class="flex items-center justify-between py-2 border-b border-slate-50">' +
            '<span class="text-sm text-slate-600">' + s[1] + '</span>' +
            '<kbd class="px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-lg border border-slate-200">' + s[0] + '</kbd>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>';
    showModal(html, '360px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
  }

  // ================================================================
  //  LOG HOURS MODAL
  // ================================================================
  function openLogHoursModal(task) {
    if (!task) return;
    var today      = new Date().toISOString().split('T')[0];
    var isBillable = task.billable === 'true' || task.billable === true;

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-start justify-between">' +
        '<div>' +
          '<div class="flex items-center gap-2 mb-1"><i class="fas fa-clock text-blue-500"></i><h3 class="font-extrabold text-slate-900">Log Hours</h3></div>' +
          '<p class="text-xs text-slate-400">' + esc(task.title) +
            (isBillable ? ' <span class="inline-flex items-center gap-0.5 text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-px rounded font-semibold ml-1"><i class="fas fa-dollar-sign text-[9px]"></i>Billable</span>' : '') +
          '</p>' +
        '</div>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="tm-status"></div>' +
        (parseFloat(task.estimated_hours) > 0
          ? '<div class="bg-blue-50 rounded-xl p-3 border border-blue-100">' +
              '<p class="text-xs text-blue-500 font-semibold mb-2">Current Progress</p>' +
              hoursBar(task.actual_hours, task.estimated_hours) +
            '</div>'
          : '') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>' +
          '<input id="lh-date" class="field" type="date" value="' + today + '"></div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Hours <span class="text-red-400">*</span></label>' +
          '<input id="lh-hours" class="field" type="number" step="0.25" min="0.25" max="24" placeholder="e.g. 2.5"></div>' +
        '</div>' +
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>' +
        '<textarea id="lh-notes" class="field text-sm" rows="3" style="resize:none" placeholder="What did you work on?"></textarea></div>' +
        (isBillable
          ? '<div class="bg-green-50 border border-green-200 rounded-xl p-3">' +
              '<p class="text-xs font-bold text-green-700 mb-2"><i class="fas fa-dollar-sign mr-1"></i>Billing</p>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
                '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Pay Type</label>' +
                '<select id="lh-pay-type" class="field text-sm">' +
                  '<option value="per_hour"' + (task.billable_pay_type==='per_hour'?' selected':'') + '>Per Hour</option>' +
                  '<option value="per_task"' + (task.billable_pay_type==='per_task'?' selected':'') + '>Per Task</option>' +
                  '<option value="salary"'   + (task.billable_pay_type==='salary'?' selected':'')   + '>Salary</option>' +
                '</select></div>' +
                '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Rate ($)</label>' +
                '<div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>' +
                '<input id="lh-rate" class="field text-sm pl-7" type="number" step="0.01" min="0" value="' + esc(task.billable_rate||'') + '"></div></div>' +
              '</div>' +
            '</div>'
          : '') +
        '<div class="flex gap-3">' +
          '<button id="lh-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="lh-submit" class="btn-primary flex-1"><i class="fas fa-check text-xs mr-1"></i>Log Hours</button>' +
        '</div>' +
      '</div>';

    showModal(html, '520px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('lh-cancel').addEventListener('click', closeModal);
    document.getElementById('lh-submit').addEventListener('click', function() { submitLogHours(task, isBillable); });
    setTimeout(function() { var el = document.getElementById('lh-hours'); if (el) el.focus(); }, 80);
  }

  function submitLogHours(task, isBillable) {
    var hours = parseFloat(document.getElementById('lh-hours').value);
    if (!hours || hours <= 0) { modalStatus('Enter a valid number of hours.', false); return; }
    var btn = document.getElementById('lh-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Logging…'; }
    var params = {
      task_id:  task.id,
      user_id:  myUserId(),
      date:     document.getElementById('lh-date').value,
      hours:    hours,
      notes:    document.getElementById('lh-notes').value || '',
      billable: isBillable ? 'true' : 'false',
    };
    if (isBillable) {
      params.pay_type = document.getElementById('lh-pay-type').value;
      params.rate     = document.getElementById('lh-rate').value || '';
    }
    api('tasks/log-hours', params)
      .then(function() {
        toast(fmtHours(hours) + ' logged ✓', 'success');
        // Auto-notify admin if billable task and pending approval
        if (isBillable && (!task.approval_status || task.approval_status === 'pending')) {
          usersCache.filter(function(u) { return ['Admin','SuperAdmin','Manager'].includes(u.role); })
            .forEach(function(u) { sendNotification(u.user_id||u.id, 'Hours logged on billable task', task.id, { type:'approval_needed', priority:'high', body:fmtHours(hours) + ' logged on: ' + (task.title||task.id) }); });
        }
        closeModal(); loadData();
      })
      .catch(function(e) {
        modalStatus(e.message, false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check text-xs mr-1"></i>Log Hours'; }
      });
  }

  // ================================================================
  //  LOG NOTE MODAL
  // ================================================================
  function openLogNoteModal(task) {
    if (!task) return;
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<div class="flex items-center gap-2"><i class="fas fa-sticky-note text-purple-500"></i><h3 class="font-extrabold text-slate-900">Log Note</h3></div>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="tm-status"></div>' +
        '<p class="text-xs text-slate-400">' + esc(task.title) + '</p>' +
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Note <span class="text-red-400">*</span></label>' +
        '<textarea id="ln-note" class="field text-sm" rows="4" style="resize:none" placeholder="Progress update, blocker, or observation… (@mention a user)"></textarea></div>' +
        '<div class="flex gap-3">' +
          '<button id="ln-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="ln-submit" class="btn-primary flex-1" style="background:#7c3aed"><i class="fas fa-sticky-note text-xs mr-1"></i>Save Note</button>' +
        '</div>' +
      '</div>';
    showModal(html, '480px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('ln-cancel').addEventListener('click', closeModal);
    document.getElementById('ln-submit').addEventListener('click', function() {
      var note = (document.getElementById('ln-note').value || '').trim();
      if (!note) { modalStatus('Note is required.', false); return; }
      var btn = this; btn.disabled = true;
      api('tasks/log-note', { task_id: task.id, user_id: myUserId(), note: note,
        date: new Date().toISOString().split('T')[0] })
        .then(function() { toast('Note saved ✓', 'success'); closeModal(); loadData(); })
        .catch(function(e) { modalStatus(e.message, false); btn.disabled = false; });
    });
    setTimeout(function() { var el = document.getElementById('ln-note'); if (el) el.focus(); }, 80);
  }

  // ================================================================
  //  TASK FORM (Create / Edit)
  // ================================================================
  function openTaskForm(task, defaults) {
    defaults = defaults || {};
    var isEdit   = !!task;

    // If editing a closed task and user is not admin → show locked view instead
    var isClosed = isEdit && (task.status === 'Done' || task.status === 'Cancelled');
    if (isClosed && !isAdmin()) {
      showModal(
        '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
          '<h3 class="font-extrabold text-slate-900">Task Locked</h3>' +
          '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
        '</div>' +
        '<div class="px-6 py-6 flex flex-col items-center gap-4 text-center">' +
          '<div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">' +
            '<i class="fas fa-lock text-slate-400 text-2xl"></i>' +
          '</div>' +
          '<div>' +
            '<p class="font-bold text-slate-800 text-base mb-1">This task is ' + task.status + '</p>' +
            '<p class="text-sm text-slate-500">You need to reopen this task before editing it. Submit a reopen request and a manager will approve it.</p>' +
          '</div>' +
          '<div class="flex gap-3 w-full mt-2">' +
            '<button id="tf-locked-cancel" class="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm border-none cursor-pointer hover:bg-slate-200">Cancel</button>' +
            '<button id="tf-locked-reopen" class="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm border-none cursor-pointer hover:bg-amber-600 flex items-center justify-center gap-2">' +
              '<i class="fas fa-unlock-alt text-xs"></i>Request Reopen' +
            '</button>' +
          '</div>' +
        '</div>',
        '420px'
      );
      document.getElementById('tm-close').addEventListener('click', closeModal);
      document.getElementById('tf-locked-cancel').addEventListener('click', closeModal);
      document.getElementById('tf-locked-reopen').addEventListener('click', function() {
        closeModal();
        handleReopenRequest(task.id, 'To Do');
      });
      return;
    }

    var btnLabel = isEdit ? '<i class="fas fa-save text-xs mr-1"></i>Save Changes' : '<i class="fas fa-plus text-xs mr-1"></i>Create Task';

    var statusOpts   = STATUSES.map(function(s) {
      var sel = s === (task ? task.status : (defaults.status || 'To Do')) ? ' selected' : '';
      return '<option value="' + s + '"' + sel + '>' + s + '</option>';
    }).join('');
    var priorityOpts = PRIORITIES.map(function(p) {
      var sel = p === (task ? task.priority : (defaults.priority || 'Medium')) ? ' selected' : '';
      return '<option value="' + p + '"' + sel + '>' + p + '</option>';
    }).join('');

    function v(k) { return task ? esc(task[k] || '') : ''; }

    var isBill  = isEdit && (task.billable === 'true' || task.billable === true);
    var payT    = (isEdit && task.billable_pay_type) || 'per_hour';

    var projectField = '';
    if (projectsInstalled()) {
      if (projectsCache.length) {
        var _selPid = (task && task.project_id) || defaults.project_id || '';
        var opts = '<option value="">— No project —</option>' +
          projectsCache.map(function(p) {
            var pid = p.id || p.project_id;
            return '<option value="' + esc(pid) + '"' + (_selPid === pid ? ' selected' : '') + '>' + esc(p.name || pid) + '</option>';
          }).join('');
        projectField = '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Project</label>' +
          '<select id="tf-project_id" class="field text-sm">' + opts + '</select></div>';
      } else {
        projectField = '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Project ID</label>' +
          '<input id="tf-project_id" class="field text-sm" type="text" placeholder="Project ID" value="' + v('project_id') + '"></div>';
      }
    }

    var userSearchField = function(id, label, val) {
      return '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">' + label + '</label>' +
        '<div class="relative">' +
          '<input id="' + id + '" class="field text-sm" type="text" placeholder="Search users…" value="' + esc(val ? userName(val) : '') + '" data-uid="' + esc(val||'') + '" autocomplete="off">' +
          '<div id="' + id + '-dd" class="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg hidden" style="max-height:160px;overflow-y:auto"></div>' +
        '</div></div>';
    };

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900">' + (isEdit ? 'Edit Task' : 'New Task') + '</h3>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="tm-status"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Title <span class="text-red-400">*</span></label>' +
        '<input id="tf-title" class="field" type="text" placeholder="Task title…" value="' + v('title') + '"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>' +
        '<textarea id="tf-description" class="field text-sm" rows="2" style="resize:none">' + v('description') + '</textarea></div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>' +
          '<select id="tf-status" class="field text-sm">' + statusOpts + '</select></div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>' +
          '<select id="tf-priority" class="field text-sm">' + priorityOpts + '</select></div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          userSearchField('tf-assigned', 'Assigned To', isEdit ? task.assigned_to : '') +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>' +
          '<input id="tf-due_date" class="field text-sm" type="date" value="' + v('due_date') + '"></div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Estimated Hours</label>' +
          '<input id="tf-est" class="field text-sm" type="number" step="0.5" min="0" placeholder="e.g. 4" value="' + v('estimated_hours') + '"></div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tags</label>' +
          '<input id="tf-tags" class="field text-sm" type="text" placeholder="design, bug, urgent…" value="' + v('tags') + '"></div>' +
        '</div>' +

        projectField +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>' +
        '<textarea id="tf-notes" class="field text-sm" rows="2" style="resize:none" placeholder="Internal notes, blockers…">' + v('notes') + '</textarea></div>' +

        // Billable section
        (function() {
          return '<div class="border border-slate-200 rounded-xl p-4 bg-slate-50">' +
            '<div class="flex items-center justify-between mb-1">' +
              '<div><p class="text-xs font-bold text-slate-700">Billable Task?</p>' +
              '<p class="text-[11px] text-slate-400">Mark as billable and set a rate</p></div>' +
              '<button type="button" id="tf-billable-btn" data-on="' + (isBill?'1':'0') + '" style="width:2.5rem;height:1.5rem;border-radius:9999px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;background:' + (isBill?'#22c55e':'#cbd5e1') + '">' +
                '<span id="tf-billable-knob" style="position:absolute;top:2px;width:1.25rem;height:1.25rem;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .2s;left:' + (isBill?'calc(100% - 1.35rem)':'2px') + '"></span>' +
              '</button>' +
              '<input type="hidden" id="tf-billable" value="' + (isBill?'true':'false') + '">' +
            '</div>' +
            '<div id="tf-billable-fields" style="display:' + (isBill?'block':'none') + ';margin-top:.75rem;padding-top:.75rem;border-top:1px solid #e2e8f0">' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
                '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Pay Type</label>' +
                '<select id="tf-pay-type" class="field text-sm">' +
                  '<option value="per_hour"' + (payT==='per_hour'?' selected':'') + '>Per Hour</option>' +
                  '<option value="per_task"' + (payT==='per_task'?' selected':'') + '>Per Task (flat)</option>' +
                  '<option value="salary"'   + (payT==='salary'?' selected':'') + '>Salary</option>' +
                '</select></div>' +
                '<div id="tf-rate-wrap" style="display:' + (payT==='salary'?'none':'block') + '"><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Rate ($)</label>' +
                '<div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>' +
                '<input id="tf-rate" class="field text-sm pl-7" type="number" step="0.01" min="0" value="' + v('billable_rate') + '"></div></div>' +
              '</div>' +
            '</div>' +
          '</div>';
        })() +

        '<div style="display:flex;gap:.75rem;padding-top:.25rem">' +
          '<button id="tm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          (isEdit && isAdmin() ? '<button id="tm-delete" class="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-bold border border-red-200 cursor-pointer border-none"><i class="fas fa-trash text-xs"></i></button>' : '') +
          '<button id="tm-submit" class="btn-primary flex-1">' + btnLabel + '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '640px');
    bindUserSearch('tf-assigned');

    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('tf-billable-btn').addEventListener('click', function() {
      var on = this.dataset.on === '1'; on = !on;
      this.dataset.on = on ? '1' : '0';
      this.style.background = on ? '#22c55e' : '#cbd5e1';
      document.getElementById('tf-billable-knob').style.left = on ? 'calc(100% - 1.35rem)' : '2px';
      document.getElementById('tf-billable').value = on ? 'true' : 'false';
      document.getElementById('tf-billable-fields').style.display = on ? 'block' : 'none';
    });
    document.getElementById('tf-pay-type').addEventListener('change', function() {
      document.getElementById('tf-rate-wrap').style.display = this.value === 'salary' ? 'none' : 'block';
    });
    if (isEdit && isAdmin()) {
      document.getElementById('tm-delete').addEventListener('click', function() { closeModal(); openDeleteModal(task.id, task.title); });
    }
    document.getElementById('tm-submit').addEventListener('click', function() { submitForm(isEdit ? task.id : null); });
    setTimeout(function() { var el = document.getElementById('tf-title'); if (el) el.focus(); }, 80);
  }

  function bindUserSearch(fieldId) {
    var inp = document.getElementById(fieldId);
    var dd  = document.getElementById(fieldId + '-dd');
    if (!inp || !dd) return;

    function showUserList(q) {
      var matches = (q
        ? usersCache.filter(function(u) { return (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q); })
        : usersCache.slice()
      ).slice(0, 8);
      if (!matches.length) { dd.classList.add('hidden'); return; }
      dd.innerHTML =
        '<div style="max-height:200px;overflow-y:auto">' +
        matches.map(function(u) {
          var uid = u.user_id || u.id;
          return '<button type="button" data-uid="' + esc(uid) + '" data-name="' + esc(u.name||u.email) + '" ' +
            'class="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2.5 border-none bg-transparent cursor-pointer transition-colors">' +
            userAvatar(uid, 'w-7 h-7 text-xs flex-shrink-0') +
            '<div><div class="font-semibold text-slate-800">' + esc(u.name || u.email) + '</div>' +
            (u.job_title ? '<div class="text-[11px] text-slate-400">' + esc(u.job_title) + '</div>' : '') +
            '</div></button>';
        }).join('') +
        '</div>';
      dd.classList.remove('hidden');
      dd.querySelectorAll('button').forEach(function(btn) {
        // mousedown fires before blur — prevents the dropdown closing before click registers
        btn.addEventListener('mousedown', function(e) {
          e.preventDefault();
          inp.value      = this.dataset.name;
          inp.dataset.uid = this.dataset.uid;
          dd.classList.add('hidden');
        });
      });
    }

    // Show all users on focus (shows everyone when field is empty)
    inp.addEventListener('focus', function() {
      showUserList(this.value.trim().toLowerCase());
    });
    // Filter as user types; clear uid if field emptied
    inp.addEventListener('input', function() {
      if (!this.value.trim()) this.dataset.uid = '';
      showUserList(this.value.trim().toLowerCase());
    });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { dd.classList.add('hidden'); this.blur(); }
    });
    inp.addEventListener('blur', function() { setTimeout(function() { dd.classList.add('hidden'); }, 200); });
  }

  // ================================================================
  //  FORM SUBMIT
  // ================================================================
  function submitForm(taskId) {
    var isEdit = !!taskId;
    var title  = (document.getElementById('tf-title').value || '').trim();
    if (!title) { modalStatus('Title is required.', false); return; }
    var btn = document.getElementById('tm-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…'; }

    var assignedInp = document.getElementById('tf-assigned');
    var assignedUid = (assignedInp && assignedInp.dataset.uid) ? assignedInp.dataset.uid : '';
    // If typed manually (not from dropdown), try to match
    if (!assignedUid && assignedInp && assignedInp.value) {
      var q = assignedInp.value.toLowerCase();
      var match = usersCache.find(function(u) { return (u.name||'').toLowerCase() === q || (u.email||'').toLowerCase() === q; });
      if (match) assignedUid = match.user_id || match.id;
    }

    var billable = document.getElementById('tf-billable').value === 'true' ? 'true' : 'false';
    var params = {
      title:           title,
      description:     document.getElementById('tf-description').value    || '',
      status:          document.getElementById('tf-status').value         || 'To Do',
      priority:        document.getElementById('tf-priority').value       || 'Medium',
      assigned_to:     assignedUid,
      due_date:        document.getElementById('tf-due_date').value       || '',
      estimated_hours: document.getElementById('tf-est').value            || '',
      tags:            document.getElementById('tf-tags').value           || '',
      notes:           document.getElementById('tf-notes').value          || '',
      billable:        billable,
      billable_pay_type: billable === 'true' ? (document.getElementById('tf-pay-type').value || 'per_hour') : '',
      billable_rate:     billable === 'true' ? (document.getElementById('tf-rate').value || '') : '',
    };
    var projEl = document.getElementById('tf-project_id');
    if (projEl) params.project_id = projEl.value || '';
    if (isEdit) { params.id = taskId; }
    else { try { params.created_by = myUserId(); } catch(e) {} }

    var prevTask = isEdit ? tasksCache[taskId] : null;

    api(isEdit ? 'tasks/update' : 'tasks/create', params)
      .then(function(res) {
        modalStatus(isEdit ? 'Saved!' : 'Task created!', true);
        // Notify if assigned_to changed
        if (params.assigned_to && (!prevTask || prevTask.assigned_to !== params.assigned_to)) {
          sendNotification(params.assigned_to, 'You\'ve been assigned: ' + title, isEdit ? taskId : (res.id || ''), { type:'task_assigned', priority:'high', body: 'Assigned by ' + (userName(myUserId()) || 'someone') });
        }
        // Notify admins if billable
        if (billable === 'true') {
          usersCache.filter(function(u) { return ['Admin','SuperAdmin','Manager'].includes(u.role) && u.user_id !== myUserId(); })
            .forEach(function(u) { sendNotification(u.user_id||u.id, 'Approval needed: ' + title, isEdit ? taskId : (res.id||''), { type:'approval_needed', priority:'critical', body:'A billable task requires your approval.' }); });
        }
        setTimeout(function() { closeModal(); loadData(); }, 700);
      })
      .catch(function(e) {
        modalStatus(e.message, false);
        if (btn) { btn.disabled = false; btn.innerHTML = isEdit ? '<i class="fas fa-save text-xs mr-1"></i>Save Changes' : '<i class="fas fa-plus text-xs mr-1"></i>Create Task'; }
      });
  }

  // ================================================================
  //  DELETE MODAL
  // ================================================================
  function openDeleteModal(taskId, taskTitle) {
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-red-600">Delete Task</h3>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div class="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">' +
          '<i class="fas fa-exclamation-triangle text-red-400 mt-0.5 flex-shrink-0"></i>' +
          '<div><p class="text-sm font-bold text-red-700">This cannot be undone</p>' +
          '<p class="text-sm text-red-600 mt-0.5"><strong>' + esc(taskTitle) + '</strong> and all logs will be permanently deleted.</p></div>' +
        '</div>' +
        '<div id="tm-status"></div>' +
        '<div style="display:flex;gap:.75rem">' +
          '<button id="tm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tm-confirm-delete" style="flex:1;display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.65rem 1.25rem;background:#dc2626;color:#fff;border:none;border-radius:.75rem;font-size:.875rem;font-weight:700;cursor:pointer">' +
            '<i class="fas fa-trash text-xs"></i> Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>';
    showModal(html, '480px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('tm-confirm-delete').addEventListener('click', function() {
      var btn = this; btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Deleting…';
      api('tasks/delete', { id: taskId, task_id: taskId })
        .then(function() { toast('Task deleted', 'info'); closeModal(); loadData(); })
        .catch(function(e) { modalStatus(e.message, false); btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-xs"></i> Delete Permanently'; });
    });
  }

  // ── Boot ─────────────────────────────────────────────────────
  var old = document.getElementById(MODAL_ID);
  if (old) old.innerHTML = '';
  _kbBound = false;
  render();

  // ── Deep-link handler ──────────────────────────────────────────
  // When a notification is clicked, index.html sets window._wvDeepLink
  // before navigating here. We pick it up after data loads.
  // loadData() calls rerender() on success — we hook in there.
  function checkDeepLink() {
    var link = window._wvDeepLink;
    if (!link || link.module !== 'tasks' || !link.id) return;
    window._wvDeepLink = null; // consume it so it doesn't fire again

    var id = link.id;
    // Try to find the task in cache first
    var task = tasksCache[id];
    if (task) {
      openTaskDetail(task);
      return;
    }
    // Not in cache yet — fetch directly
    api('tasks/get', { id: id })
      .then(function(data) {
        var t = data.task || data;
        if (t && t.id) {
          tasksCache[t.id] = t;
          openTaskDetail(t);
        }
      })
      .catch(function() {
        toast('Could not open task', 'error');
      });
  }

  // Expose deep-link check globally so index.html can also call it
  // after navigation completes (belt + suspenders approach)
  window._wvTasksDeepLinkCheck = checkDeepLink;

  // Check immediately in case deep-link was already set before this module loaded
  setTimeout(checkDeepLink, 400);
};
