window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['projects'] = function(container) {

  // ── State ────────────────────────────────────────────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var myId        = (function() { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } })();
  var myRole      = (function() { try { return window.WorkVolt.user().role || 'Employee'; } catch(e) { return 'Employee'; } })();

  // Page-level state
  var view         = 'list';       // 'list' | 'detail'
  var activeProject = null;        // full project object when in detail view
  var projectsCache = [];
  var usersCache    = [];
  var tasksCache    = {};          // keyed by id, scoped to current project
  var membersCache  = [];
  var activityCache = [];
  var statsCache    = {};

  // Detail-view sub-state
  var taskView      = sessionStorage.getItem('proj_task_view') || 'list'; // 'list'|'board'|'calendar'
  var taskFilter    = { status: '', priority: '', assigned_to: '' };
  var taskSearch    = '';
  var focusMode     = false;
  var _searchTimer  = null;

  // ── Constants ───────────────────────────────────────────────────
  var STATUSES   = ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'];
  var PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
  var TASK_STATUSES   = ['To Do', 'In Progress', 'In Review', 'Done', 'Cancelled'];
  var TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

  var STATUS_CONFIG = {
    'Planning':   { color: 'text-slate-600',  bg: 'bg-slate-100',  border: 'border-slate-200',  dot: '#94a3b8', icon: 'fa-drafting-compass' },
    'Active':     { color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',   dot: '#3b82f6', icon: 'fa-bolt' },
    'On Hold':    { color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200',  dot: '#f59e0b', icon: 'fa-pause-circle' },
    'Completed':  { color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200',  dot: '#22c55e', icon: 'fa-check-circle' },
    'Cancelled':  { color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    dot: '#ef4444', icon: 'fa-ban' },
  };
  var TASK_STATUS_COLORS = {
    'To Do':       { bg: 'bg-slate-100',   text: 'text-slate-600',  dot: '#94a3b8' },
    'In Progress': { bg: 'bg-blue-100',    text: 'text-blue-700',   dot: '#3b82f6' },
    'In Review':   { bg: 'bg-purple-100',  text: 'text-purple-700', dot: '#8b5cf6' },
    'Done':        { bg: 'bg-green-100',   text: 'text-green-700',  dot: '#22c55e' },
    'Cancelled':   { bg: 'bg-red-100',     text: 'text-red-600',    dot: '#ef4444' },
  };
  var PRIORITY_COLORS = {
    'Low':      { bg: 'bg-slate-100',   text: 'text-slate-500',  dot: '#94a3b8' },
    'Medium':   { bg: 'bg-amber-100',   text: 'text-amber-700',  dot: '#f59e0b' },
    'High':     { bg: 'bg-orange-100',  text: 'text-orange-700', dot: '#f97316' },
    'Urgent':   { bg: 'bg-red-100',     text: 'text-red-600',    dot: '#ef4444' },
    'Critical': { bg: 'bg-rose-100',    text: 'text-rose-700',   dot: '#f43f5e' },
  };
  var KANBAN_COLORS = {
    'To Do':       { head: 'bg-slate-50',   border: 'border-slate-200', dot: 'bg-slate-400'  },
    'In Progress': { head: 'bg-blue-50',    border: 'border-blue-200',  dot: 'bg-blue-500'   },
    'In Review':   { head: 'bg-purple-50',  border: 'border-purple-200',dot: 'bg-purple-500' },
    'Done':        { head: 'bg-green-50',   border: 'border-green-200', dot: 'bg-green-500'  },
    'Cancelled':   { head: 'bg-red-50',     border: 'border-red-200',   dot: 'bg-red-400'    },
  };

  // ── Helpers ──────────────────────────────────────────────────────
  function isAdmin() { return ['SuperAdmin','Admin','Manager'].includes(myRole); }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
    catch(e) { return d; }
  }
  function fmtMoney(v) { return '$' + (parseFloat(v)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }
  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }
  function timeAgo(d) {
    if (!d) return '';
    var s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }
  function countdown(dueDate, status) {
    if (!dueDate || status === 'Done' || status === 'Cancelled' || status === 'Completed') return '';
    var now  = new Date(); now.setHours(0,0,0,0);
    var due  = new Date(dueDate);
    var diff = Math.round((due - now) / 86400000);
    if (diff < 0)   return '<span class="text-[10px] font-bold text-red-500"><i class="fas fa-fire text-[9px] mr-0.5"></i>' + Math.abs(diff) + 'd overdue</span>';
    if (diff === 0) return '<span class="text-[10px] font-bold text-orange-500"><i class="fas fa-exclamation text-[9px] mr-0.5"></i>Due today</span>';
    if (diff <= 3)  return '<span class="text-[10px] font-semibold text-amber-600">' + diff + 'd left</span>';
    return '<span class="text-[10px] text-slate-400">' + diff + 'd left</span>';
  }
  function isOverdue(t) {
    return t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done' && t.status !== 'Cancelled';
  }
  function userName(uid) {
    var u = usersCache.find(function(u) { return (u.user_id||u.id) === uid; });
    return u ? (u.name || u.email || uid) : (uid || '—');
  }
  function userAvatar(uid, size) {
    size = size || 'w-7 h-7 text-xs';
    var colors = ['bg-blue-100 text-blue-700','bg-violet-100 text-violet-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];
    var idx = uid ? uid.charCodeAt(0) % colors.length : 0;
    var init = userName(uid).charAt(0).toUpperCase() || '?';
    return '<span class="' + size + ' ' + colors[idx] + ' rounded-full flex items-center justify-center font-bold flex-shrink-0" title="' + esc(userName(uid)) + '">' + init + '</span>';
  }
  function progressRing(pct, size, stroke) {
    size = size || 40; stroke = stroke || 3;
    var r = (size/2) - stroke - 1;
    var circ = 2 * Math.PI * r;
    var dash = (pct/100) * circ;
    var color = pct >= 100 ? '#22c55e' : pct >= 66 ? '#3b82f6' : pct >= 33 ? '#f59e0b' : '#e2e8f0';
    if (pct === 0) color = '#e2e8f0';
    var fs = Math.round(size * 0.22);
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="transform:rotate(-90deg)">' +
      '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="#f1f5f9" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" ' +
        'stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '" stroke-linecap="round"/>' +
      '<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ' +
        'style="transform:rotate(90deg);transform-origin:center;font-size:' + fs + 'px;font-weight:800;fill:#334155;font-family:inherit">' +
        pct + '%</text>' +
    '</svg>';
  }
  function healthIndicator(p) {
    // Derive health from status + overdue + progress
    if (p.status === 'Completed') return { label:'Completed', color:'#22c55e', bg:'bg-green-50',  text:'text-green-700',  icon:'fa-check-circle' };
    if (p.status === 'Cancelled') return { label:'Cancelled', color:'#ef4444', bg:'bg-red-50',    text:'text-red-600',    icon:'fa-ban' };
    if (p.status === 'On Hold')   return { label:'On Hold',   color:'#f59e0b', bg:'bg-amber-50',  text:'text-amber-700',  icon:'fa-pause-circle' };
    var overdue = parseInt(p.overdue_count) || 0;
    var prog    = parseInt(p.progress)      || 0;
    var hasDue  = !!p.due_date;
    var daysLeft = hasDue ? Math.round((new Date(p.due_date) - new Date()) / 86400000) : Infinity;
    if (overdue > 2 || daysLeft < 0) return { label:'At Risk',    color:'#ef4444', bg:'bg-red-50',    text:'text-red-600',    icon:'fa-exclamation-triangle' };
    if (overdue > 0 || daysLeft < 7) return { label:'Needs Attention', color:'#f59e0b', bg:'bg-amber-50', text:'text-amber-700', icon:'fa-exclamation-circle' };
    return { label:'On Track', color:'#22c55e', bg:'bg-green-50', text:'text-green-700', icon:'fa-check-circle' };
  }

  // ── API ─────────────────────────────────────────────────────────
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

  function tasksInstalled() {
    try { return (window.INSTALLED_MODULES||[]).some(function(m){ return m.id==='tasks'; }); }
    catch(e) { return false; }
  }

  // ── Modal ───────────────────────────────────────────────────────
  var MODAL_ID = 'wv-projects-modal';
  function getPortal() {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el = document.createElement('div'); el.id = MODAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html, maxWidth) {
    getPortal().innerHTML =
      '<div id="pm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem">' +
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,.25);width:100%;max-width:' + (maxWidth||'620px') + ';max-height:92vh;overflow-y:auto">' +
          html +
        '</div>' +
      '</div>';
    document.getElementById('pm-backdrop').addEventListener('click', function(e) {
      if (e.target.id === 'pm-backdrop') closeModal();
    });
  }
  function closeModal() { var p = getPortal(); if (p) p.innerHTML = ''; }
  function modalStatus(msg, ok) {
    var el = document.getElementById('pm-status');
    if (!el) return;
    el.innerHTML = msg
      ? '<div class="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 ' +
        (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
        '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i><span>' + esc(msg) + '</span></div>'
      : '';
  }

  // ================================================================
  //  PROJECTS LIST VIEW
  // ================================================================
  function renderListView() {
    var html =
      '<div class="min-h-full bg-slate-50">' +

      // Header
      '<div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">' +
        '<div>' +
          '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">' +
            '<i class="fas fa-folder-open text-blue-500"></i>Projects' +
          '</h1>' +
          '<p class="text-slate-400 text-xs mt-0.5" id="proj-subtitle">Loading…</p>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          (isAdmin()
            ? '<button id="btn-new-project" class="btn-primary text-sm"><i class="fas fa-plus text-xs mr-1"></i>New Project</button>'
            : '') +
        '</div>' +
      '</div>' +

      // Status filter tabs
      '<div class="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto">' +
        ['','Planning','Active','On Hold','Completed','Cancelled'].map(function(s) {
          var label = s || 'All';
          return '<button data-status-filter="' + s + '" class="proj-status-tab flex-shrink-0 px-4 py-3 text-sm font-semibold border-b-2 transition-all ' +
            (false ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '">' + label + '</button>';
        }).join('') +
        '<div class="ml-auto py-2 flex-shrink-0">' +
          '<div class="relative">' +
            '<i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>' +
            '<input id="proj-search" type="text" placeholder="Search projects…" class="field text-xs py-1.5 pl-7" style="width:13rem">' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Grid
      '<div id="proj-grid" class="p-6">' +
        '<div class="flex items-center justify-center py-20 text-slate-300">' +
          '<i class="fas fa-circle-notch fa-spin text-3xl"></i>' +
        '</div>' +
      '</div>' +

      '</div>';

    container.innerHTML = html;

    // Wire
    if (isAdmin()) {
      var nb = container.querySelector('#btn-new-project');
      if (nb) nb.addEventListener('click', function() { openProjectForm(null); });
    }

    container.querySelectorAll('.proj-status-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.proj-status-tab').forEach(function(b) {
          b.classList.remove('border-blue-600','text-blue-600');
          b.classList.add('border-transparent','text-slate-500');
        });
        this.classList.add('border-blue-600','text-blue-600');
        this.classList.remove('border-transparent','text-slate-500');
        renderGrid(this.dataset.statusFilter);
      });
    });
    // Default active = All
    container.querySelector('[data-status-filter=""]').classList.add('border-blue-600','text-blue-600');
    container.querySelector('[data-status-filter=""]').classList.remove('border-transparent','text-slate-500');

    container.querySelector('#proj-search').addEventListener('input', function() {
      var q = this.value.toLowerCase();
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function() { renderGrid('', q); }, 200);
    });

    loadListData();
  }

  function loadListData() {
    Promise.all([
      api('projects/list', {}),
      api('users/list').catch(function() { return {}; }),
    ]).then(function(res) {
      projectsCache = res[0].rows || [];
      usersCache    = res[1].users || res[1].rows || [];
      var sub = document.getElementById('proj-subtitle');
      if (sub) sub.textContent = projectsCache.length + ' project' + (projectsCache.length !== 1 ? 's' : '');
      renderGrid('');
    }).catch(function(e) {
      var g = document.getElementById('proj-grid');
      if (g) g.innerHTML = '<div class="text-center py-20 text-red-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>' + esc(e.message) + '</p></div>';
    });
  }

  function renderGrid(statusFilter, searchQ) {
    var grid = document.getElementById('proj-grid');
    if (!grid) return;
    var rows = projectsCache.slice();
    if (statusFilter) rows = rows.filter(function(p) { return p.status === statusFilter; });
    if (searchQ) rows = rows.filter(function(p) {
      return (p.name||'').toLowerCase().includes(searchQ) || (p.description||'').toLowerCase().includes(searchQ);
    });

    if (!rows.length) {
      grid.innerHTML =
        '<div class="flex flex-col items-center justify-center py-24 text-slate-300">' +
          '<i class="fas fa-folder-open text-5xl mb-4 opacity-30"></i>' +
          '<p class="font-semibold text-slate-500">No projects found</p>' +
          '<p class="text-sm mt-1 text-slate-400">' + (isAdmin() ? 'Click "New Project" to create one.' : '') + '</p>' +
        '</div>';
      return;
    }

    grid.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.25rem">' +
        rows.map(function(p) { return renderProjectCard(p); }).join('') +
      '</div>';

    // Wire card clicks
    grid.querySelectorAll('[data-proj-id]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('[data-proj-action]')) {
          e.stopPropagation();
          var act = e.target.closest('[data-proj-action]').dataset.projAction;
          var pid = this.dataset.projId;
          var proj = projectsCache.find(function(p) { return String(p.id) === String(pid); });
          if (act === 'edit')   { openProjectForm(proj); return; }
          if (act === 'delete') { confirmDeleteProject(pid, proj && proj.name); return; }
        }
        var pid = this.dataset.projId;
        if (!pid) return;
        openProjectDetail(pid);
      });
    });
  }

  function renderProjectCard(p) {
    var sc  = STATUS_CONFIG[p.status] || STATUS_CONFIG['Planning'];
    var h   = healthIndicator(p);
    var pct = parseInt(p.progress) || 0;
    var color = p.color || '#3b82f6';

    // Team avatars (up to 4)
    var memberAvatars = '';
    // We don't have members per-card yet — show owner avatar
    if (p.owner_id) {
      memberAvatars = '<div class="flex -space-x-1.5">' + userAvatar(p.owner_id, 'w-6 h-6 text-[10px] ring-2 ring-white') + '</div>';
    }

    return '<div data-proj-id="' + esc(p.id) + '" ' +
      'class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 ' +
      'transition-all cursor-pointer overflow-hidden group">' +

      // Color bar top
      '<div style="height:4px;background:' + esc(color) + '"></div>' +

      '<div class="p-5">' +
        // Header row: name + actions
        '<div class="flex items-start justify-between gap-2 mb-3">' +
          '<div class="flex-1 min-w-0">' +
            '<h3 class="font-extrabold text-slate-900 text-base leading-snug truncate">' + esc(p.name) + '</h3>' +
            (p.description ? '<p class="text-xs text-slate-400 mt-0.5 line-clamp-1">' + esc(p.description) + '</p>' : '') +
          '</div>' +
          '<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">' +
            (isAdmin()
              ? '<button data-proj-action="edit" class="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-blue-600 flex items-center justify-center text-xs transition-colors"><i class="fas fa-pen"></i></button>' +
                '<button data-proj-action="delete" class="w-7 h-7 rounded-lg border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center text-xs transition-colors"><i class="fas fa-trash"></i></button>'
              : '') +
          '</div>' +
        '</div>' +

        // Status + Health badges
        '<div class="flex items-center gap-2 mb-4 flex-wrap">' +
          '<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ' + sc.bg + ' ' + sc.color + '">' +
            '<i class="fas ' + sc.icon + ' text-[9px]"></i>' + esc(p.status) +
          '</span>' +
          '<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ' + h.bg + ' ' + h.text + '">' +
            '<i class="fas ' + h.icon + ' text-[9px]"></i>' + h.label +
          '</span>' +
          (p.priority
            ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
              (PRIORITY_COLORS[p.priority]||PRIORITY_COLORS['Medium']).bg + ' ' +
              (PRIORITY_COLORS[p.priority]||PRIORITY_COLORS['Medium']).text + '">' +
              esc(p.priority) + '</span>'
            : '') +
        '</div>' +

        // Progress bar
        '<div class="mb-4">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<span class="text-[11px] font-semibold text-slate-500">Progress</span>' +
            '<span class="text-[11px] font-bold ' + (pct >= 100 ? 'text-green-600' : pct > 0 ? 'text-blue-600' : 'text-slate-400') + '">' + pct + '%</span>' +
          '</div>' +
          '<div style="background:#f1f5f9;border-radius:9999px;height:6px;overflow:hidden">' +
            '<div style="width:' + pct + '%;height:6px;border-radius:9999px;background:' + (pct >= 100 ? '#22c55e' : color) + ';transition:width .5s"></div>' +
          '</div>' +
          (tasksInstalled() && p.task_count
            ? '<p class="text-[10px] text-slate-400 mt-1">' + (p.tasks_done||0) + ' of ' + p.task_count + ' tasks done</p>'
            : '') +
        '</div>' +

        // Footer: due date + owner + task count
        '<div class="flex items-center justify-between pt-3 border-t border-slate-100">' +
          '<div class="flex items-center gap-3">' +
            (p.due_date
              ? '<span class="flex items-center gap-1 text-[11px] text-slate-500">' +
                '<i class="fas fa-calendar-alt text-[10px] text-slate-300"></i>' +
                fmtDate(p.due_date) +
              '</span>'
              : '<span class="text-[11px] text-slate-300">No deadline</span>') +
            (tasksInstalled() && p.task_count
              ? '<span class="flex items-center gap-1 text-[11px] text-slate-500">' +
                '<i class="fas fa-check-square text-[10px] text-slate-300"></i>' + p.task_count + '</span>'
              : '') +
          '</div>' +
          memberAvatars +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ================================================================
  //  PROJECT DETAIL VIEW — Mission Control
  // ================================================================
  function openProjectDetail(pid) {
    view = 'detail';
    tasksCache = {};
    membersCache = [];
    activityCache = [];
    statsCache = {};
    taskFilter = { status: '', priority: '', assigned_to: '' };
    taskSearch = '';
    focusMode = false;

    // Render shell immediately, load data async
    renderDetailShell(pid);

    Promise.all([
      api('projects/get',      { id: pid }),
      api('users/list').catch(function() { return {}; }),
      api('projects/members',  { project_id: pid }).catch(function() { return { rows: [] }; }),
      api('projects/activity', { project_id: pid, limit: 30 }).catch(function() { return { rows: [] }; }),
      api('projects/stats',    { project_id: pid }).catch(function() { return { stats: {} }; }),
    ]).then(function(res) {
      activeProject  = res[0].project || {};
      usersCache     = res[1].users || res[1].rows || [];
      membersCache   = res[2].rows || [];
      activityCache  = res[3].rows || [];
      statsCache     = res[4].stats || {};

      // Load tasks if Tasks module is installed
      var taskPromise = tasksInstalled()
        ? api('tasks/list', { project_id: pid }).catch(function() { return { rows: [] }; })
        : Promise.resolve({ rows: [] });

      return taskPromise.then(function(td) {
        tasksCache = {};
        (td.rows || []).forEach(function(t) { tasksCache[t.id] = t; });
        renderDetailFull();
      });
    }).catch(function(e) {
      toast(e.message || 'Failed to load project', 'error');
      // Go back to list so user is not stuck on spinner
      view = 'list';
      activeProject = null;
      renderListView();
    });
  }

  function renderDetailShell(pid) {
    container.innerHTML =
      '<div class="min-h-full bg-slate-50">' +
        '<div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">' +
          '<button id="btn-back" class="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">' +
            '<i class="fas fa-arrow-left text-xs"></i>Projects' +
          '</button>' +
          '<span class="text-slate-200">/</span>' +
          '<span class="text-sm font-semibold text-slate-400">Loading…</span>' +
        '</div>' +
        '<div class="flex items-center justify-center py-32 text-slate-300">' +
          '<i class="fas fa-circle-notch fa-spin text-4xl"></i>' +
        '</div>' +
      '</div>';
    container.querySelector('#btn-back').addEventListener('click', function() {
      view = 'list';
      activeProject = null;
      renderListView();
    });
  }

  function renderDetailFull() {
    var p     = activeProject;
    var color = p.color || '#3b82f6';
    var sc    = STATUS_CONFIG[p.status] || STATUS_CONFIG['Planning'];
    var h     = healthIndicator(p);
    var pct   = parseInt(p.progress || statsCache.progress) || 0;
    var tasks = Object.values(tasksCache);
    var budget     = parseFloat(p.budget)       || 0;
    var budgetSpent= parseFloat(p.budget_spent) || 0;
    var budgetPct  = budget ? Math.min(Math.round((budgetSpent/budget)*100), 100) : 0;

    // ── Team avatars for header ──
    var teamAvatars = membersCache.slice(0, 5).map(function(m) {
      return userAvatar(m.user_id, 'w-8 h-8 text-xs ring-2 ring-white');
    }).join('');
    if (membersCache.length > 5) {
      teamAvatars += '<span class="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold ring-2 ring-white">+' + (membersCache.length-5) + '</span>';
    }

    container.innerHTML =
      '<div class="min-h-full bg-slate-50 flex flex-col">' +

      // ── Breadcrumb ──────────────────────────────────────────────
      '<div class="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-2 text-sm flex-shrink-0">' +
        '<button id="btn-back" class="font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1.5">' +
          '<i class="fas fa-arrow-left text-xs"></i>Projects' +
        '</button>' +
        '<i class="fas fa-chevron-right text-slate-300 text-xs"></i>' +
        '<span class="font-semibold text-slate-700 truncate max-w-[200px]">' + esc(p.name) + '</span>' +
      '</div>' +

      // ── Mission Control Header ───────────────────────────────────
      '<div class="bg-white border-b border-slate-200 flex-shrink-0" style="border-top:4px solid ' + esc(color) + '">' +
        '<div class="px-6 py-5">' +

          // Row 1: Name + actions
          '<div class="flex items-start justify-between gap-4 mb-4">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
                '<span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ' + sc.bg + ' ' + sc.color + '">' +
                  '<i class="fas ' + sc.icon + ' text-[10px]"></i>' + esc(p.status) + '</span>' +
                '<span class="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ' + h.bg + ' ' + h.text + '">' +
                  '<i class="fas ' + h.icon + ' text-[10px]"></i>' + h.label + '</span>' +
                (p.priority ? '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ' + (PRIORITY_COLORS[p.priority]||PRIORITY_COLORS.Medium).bg + ' ' + (PRIORITY_COLORS[p.priority]||PRIORITY_COLORS.Medium).text + '">' + esc(p.priority) + '</span>' : '') +
              '</div>' +
              '<h1 class="text-2xl font-extrabold text-slate-900 leading-tight">' + esc(p.name) + '</h1>' +
              (p.description ? '<p class="text-sm text-slate-500 mt-1 line-clamp-2">' + esc(p.description) + '</p>' : '') +
            '</div>' +
            '<div class="flex items-center gap-2 flex-shrink-0">' +
              '<button id="btn-focus-mode" class="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ' +
                (focusMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600') + '">' +
                '<i class="fas fa-crosshairs text-[11px]"></i>Focus</button>' +
              (isAdmin()
                ? '<button id="btn-edit-project" class="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all"><i class="fas fa-pen text-[11px]"></i>Edit</button>'
                : '') +
              (tasksInstalled()
                ? '<button id="btn-new-task" class="btn-primary text-xs"><i class="fas fa-plus text-[11px] mr-1"></i>Add Task</button>'
                : '') +
            '</div>' +
          '</div>' +

          // Row 2: Stats bar ─────────────────────────────────────
          '<div class="grid gap-4" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +

            // Progress ring + bar
            '<div class="flex items-center gap-3">' +
              progressRing(pct, 52, 4) +
              '<div>' +
                '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Progress</p>' +
                '<p class="text-lg font-extrabold text-slate-900">' + pct + '%</p>' +
                (tasksInstalled() ? '<p class="text-[11px] text-slate-400">' + (statsCache.done||0) + '/' + (statsCache.total||0) + ' tasks done</p>' : '') +
              '</div>' +
            '</div>' +

            // Deadline
            '<div class="flex items-center gap-2.5">' +
              '<div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">' +
                '<i class="fas fa-calendar-alt text-slate-400 text-sm"></i>' +
              '</div>' +
              '<div>' +
                '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Deadline</p>' +
                '<p class="text-sm font-bold text-slate-900">' + fmtDate(p.due_date) + '</p>' +
                (p.due_date ? '<div>' + countdown(p.due_date, p.status) + '</div>' : '') +
              '</div>' +
            '</div>' +

            // Overdue
            '<div class="flex items-center gap-2.5">' +
              (tasksInstalled()
                ? '<div class="w-10 h-10 rounded-xl ' + (parseInt(statsCache.overdue) > 0 ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200') + ' flex items-center justify-center flex-shrink-0">' +
                  '<i class="fas fa-fire text-' + (parseInt(statsCache.overdue) > 0 ? 'red-400' : 'slate-400') + ' text-sm"></i>' +
                  '</div>' +
                  '<div>' +
                    '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Overdue</p>' +
                    '<p class="text-sm font-bold ' + (parseInt(statsCache.overdue) > 0 ? 'text-red-600' : 'text-slate-900') + '">' + (statsCache.overdue||0) + ' tasks</p>' +
                  '</div>'
                : '<div class="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">' +
                  '<i class="fas fa-fire text-slate-400 text-sm"></i>' +
                  '</div>' +
                  '<div>' +
                    '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Overdue</p>' +
                    '<p class="text-sm font-bold text-slate-400">N/A</p>' +
                  '</div>') +
            '</div>' +

            // Owner
            '<div class="flex items-center gap-2.5">' +
              '<div class="w-10 h-10 flex-shrink-0">' + userAvatar(p.owner_id, 'w-10 h-10 text-sm') + '</div>' +
              '<div>' +
                '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Owner</p>' +
                '<p class="text-sm font-bold text-slate-900">' + esc(userName(p.owner_id)) + '</p>' +
              '</div>' +
            '</div>' +

            // Team
            (membersCache.length
              ? '<div class="flex items-center gap-2.5">' +
                  '<div class="flex -space-x-2">' + teamAvatars + '</div>' +
                  '<div>' +
                    '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Team</p>' +
                    '<p class="text-sm font-bold text-slate-900">' + membersCache.length + ' member' + (membersCache.length !== 1 ? 's' : '') + '</p>' +
                  '</div>' +
                '</div>'
              : '') +

            // Budget (if set)
            (budget
              ? '<div class="flex items-center gap-2.5">' +
                  '<div class="w-10 h-10 rounded-xl ' + (budgetPct >= 90 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200') + ' flex items-center justify-center flex-shrink-0">' +
                    '<i class="fas fa-dollar-sign text-' + (budgetPct >= 90 ? 'red-400' : 'green-400') + ' text-sm"></i>' +
                  '</div>' +
                  '<div>' +
                    '<p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Budget</p>' +
                    '<p class="text-sm font-bold text-slate-900">' + fmtMoney(budgetSpent) + ' / ' + fmtMoney(budget) + '</p>' +
                    '<div style="background:#f1f5f9;border-radius:9999px;height:4px;margin-top:3px;width:80px">' +
                      '<div style="width:' + budgetPct + '%;height:4px;border-radius:9999px;background:' + (budgetPct >= 90 ? '#ef4444' : '#22c55e') + '"></div>' +
                    '</div>' +
                  '</div>' +
                '</div>'
              : '') +

          '</div>' +
        '</div>' +
      '</div>' +

      // ── Main 3-column body ───────────────────────────────────────
      '<div class="flex flex-1 overflow-hidden" style="min-height:0">' +

        // Left col: members + quick stats
        '<div class="w-56 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto" id="proj-left-panel">' +
          renderLeftPanel() +
        '</div>' +

        // Center: tasks
        '<div class="flex-1 flex flex-col overflow-hidden" id="proj-center">' +
          renderCenterPanel() +
        '</div>' +

        // Right col: analytics
        '<div class="w-64 bg-white border-l border-slate-200 flex-shrink-0 overflow-y-auto" id="proj-right-panel">' +
          renderRightPanel() +
        '</div>' +

      '</div>' +

      '</div>';

    // Wire
    container.querySelector('#btn-back').addEventListener('click', function() {
      view = 'list';
      activeProject = null;
      renderListView();
    });
    container.querySelector('#btn-focus-mode').addEventListener('click', function() {
      focusMode = !focusMode;
      renderDetailFull();
    });
    if (isAdmin()) {
      var editBtn = container.querySelector('#btn-edit-project');
      if (editBtn) editBtn.addEventListener('click', function() { openProjectForm(activeProject); });
    }
    if (tasksInstalled()) {
      var ntBtn = container.querySelector('#btn-new-task');
      if (ntBtn) ntBtn.addEventListener('click', function() { openNewTaskForm(); });
    }

    wireCenterPanel();
  }

  // ── Left Panel ──────────────────────────────────────────────────
  function renderLeftPanel() {
    var html = '<div class="p-4">';

    // Quick nav — only show if Tasks module is installed
    if (tasksInstalled()) {
      html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Quick Filters</p>';
      var quickLinks = [
        { k:'',        icon:'fa-th-large',    lbl:'All Tasks',  count: Object.values(tasksCache).length },
        { k:'mine',    icon:'fa-user',         lbl:'Assigned to Me', count: Object.values(tasksCache).filter(function(t){return t.assigned_to===myId;}).length },
        { k:'overdue', icon:'fa-fire',         lbl:'Overdue',    count: Object.values(tasksCache).filter(isOverdue).length },
        { k:'today',   icon:'fa-calendar-day', lbl:'Due Today',  count: Object.values(tasksCache).filter(function(t){
          if(!t.due_date) return false;
          var d=new Date(t.due_date);d.setHours(0,0,0,0);var n=new Date();n.setHours(0,0,0,0);return d.getTime()===n.getTime();
        }).length },
      ];
      quickLinks.forEach(function(q) {
        html += '<button data-quick="' + q.k + '" class="proj-quick-btn w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all mb-0.5 ' +
          (taskFilter.quick === q.k ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50') + '">' +
          '<span class="flex items-center gap-2"><i class="fas ' + q.icon + ' text-[10px] w-3"></i>' + q.lbl + '</span>' +
          (q.count ? '<span class="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">' + q.count + '</span>' : '') +
          '</button>';
      });

      // Status breakdown
      var breakdown = {};
      try { breakdown = JSON.parse(statsCache.by_status || '{}'); } catch(e) {}
      if (Object.keys(breakdown).length) {
        html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-4 mb-2">By Status</p>';
        TASK_STATUSES.forEach(function(s) {
          var cnt = breakdown[s] || 0;
          if (!cnt) return;
          var tc = TASK_STATUS_COLORS[s] || TASK_STATUS_COLORS['To Do'];
          html += '<div class="flex items-center justify-between mb-1.5">' +
            '<span class="flex items-center gap-1.5 text-[11px] text-slate-600">' +
              '<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:' + tc.dot + '"></span>' + s +
            '</span>' +
            '<span class="text-[11px] font-bold text-slate-700">' + cnt + '</span>' +
            '</div>';
        });
      }
    }

    // Members
    if (membersCache.length) {
      html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-4 mb-2">Team</p>';
      membersCache.forEach(function(m) {
        html += '<div class="flex items-center gap-2 mb-2">' +
          userAvatar(m.user_id, 'w-6 h-6 text-[10px]') +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-xs font-semibold text-slate-700 truncate">' + esc(userName(m.user_id)) + '</p>' +
            '<p class="text-[10px] text-slate-400 truncate">' + esc(m.role || 'Member') + '</p>' +
          '</div>' +
        '</div>';
      });
      if (isAdmin()) {
        html += '<button id="btn-add-member" class="w-full mt-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">' +
          '<i class="fas fa-user-plus text-[10px]"></i>Add member</button>';
      }
    }

    html += '</div>';
    return html;
  }

  // ── Center Panel ────────────────────────────────────────────────
  function renderCenterPanel() {
    var tasks = getFilteredTasks();

    var viewBtns = ['list','board','calendar'].map(function(v) {
      var icons = { list:'fa-list', board:'fa-columns', calendar:'fa-calendar-alt' };
      var labels = { list:'List', board:'Board', calendar:'Calendar' };
      return '<button data-task-view="' + v + '" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ' +
        (taskView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700') + '">' +
        '<i class="fas ' + icons[v] + ' mr-1"></i>' + labels[v] + '</button>';
    }).join('');

    var html =
      // Sub-header: view switcher + search + filters
      '<div class="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2 flex-wrap flex-shrink-0">' +
        '<div class="flex bg-slate-100 rounded-lg p-0.5">' + viewBtns + '</div>' +

        // Focus mode banner
        (focusMode
          ? '<span class="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">' +
            '<i class="fas fa-crosshairs text-[10px]"></i>Focus Mode — showing only your tasks today</span>'
          : '') +

        '<div class="ml-auto flex items-center gap-2">' +
          '<select id="tf-status" class="field text-xs py-1.5" style="width:7.5rem">' +
            '<option value="">All Statuses</option>' +
            TASK_STATUSES.map(function(s) {
              return '<option value="' + s + '"' + (taskFilter.status===s?' selected':'') + '>' + s + '</option>';
            }).join('') +
          '</select>' +
          '<select id="tf-priority" class="field text-xs py-1.5" style="width:7rem">' +
            '<option value="">All Priorities</option>' +
            TASK_PRIORITIES.map(function(p) {
              return '<option value="' + p + '"' + (taskFilter.priority===p?' selected':'') + '>' + p + '</option>';
            }).join('') +
          '</select>' +
          '<div class="relative">' +
            '<i class="fas fa-search absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 text-[10px]"></i>' +
            '<input id="task-search" type="text" placeholder="Search tasks…" value="' + esc(taskSearch) + '" class="field text-xs py-1.5 pl-6" style="width:11rem">' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Quick add
      (tasksInstalled() && isAdmin()
        ? '<div class="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-2 flex-shrink-0">' +
          '<i class="fas fa-plus text-slate-200 text-xs flex-shrink-0"></i>' +
          '<input id="proj-quick-add" type="text" placeholder="Quick add task — press Enter…" class="flex-1 text-sm text-slate-700 outline-none bg-transparent placeholder-slate-300" autocomplete="off">' +
          '</div>'
        : '') +

      // Task content
      '<div id="task-content" class="flex-1 overflow-y-auto p-4">' +
        renderTaskContent(tasks) +
      '</div>';

    return html;
  }

  function getFilteredTasks() {
    var tasks = Object.values(tasksCache);
    if (focusMode) {
      var today = new Date(); today.setHours(0,0,0,0);
      tasks = tasks.filter(function(t) {
        if (t.assigned_to !== myId) return false;
        if (!t.due_date) return false;
        var d = new Date(t.due_date); d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
      });
    }
    if (taskFilter.status)      tasks = tasks.filter(function(t) { return t.status === taskFilter.status; });
    if (taskFilter.priority)    tasks = tasks.filter(function(t) { return t.priority === taskFilter.priority; });
    if (taskFilter.assigned_to) tasks = tasks.filter(function(t) { return t.assigned_to === taskFilter.assigned_to; });
    if (taskFilter.quick === 'mine')    tasks = tasks.filter(function(t) { return t.assigned_to === myId; });
    if (taskFilter.quick === 'overdue') tasks = tasks.filter(isOverdue);
    if (taskFilter.quick === 'today') {
      tasks = tasks.filter(function(t) {
        if(!t.due_date) return false;
        var d=new Date(t.due_date);d.setHours(0,0,0,0);var n=new Date();n.setHours(0,0,0,0);return d.getTime()===n.getTime();
      });
    }
    if (taskSearch) {
      var q = taskSearch.toLowerCase();
      tasks = tasks.filter(function(t) { return (t.title||'').toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q); });
    }
    // Smart sort: overdue first → urgent → due date → priority
    var PO = { Urgent:0, High:1, Medium:2, Low:3 };
    tasks.sort(function(a, b) {
      var oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (a.priority === 'Urgent' && b.priority !== 'Urgent') return -1;
      if (b.priority === 'Urgent' && a.priority !== 'Urgent') return 1;
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && !b.due_date) return -1;
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      return (PO[a.priority]||4) - (PO[b.priority]||4);
    });
    return tasks;
  }

  function renderTaskContent(tasks) {
    if (!tasksInstalled()) {
      return '<div class="flex flex-col items-center justify-center py-20 text-slate-300">' +
        '<i class="fas fa-check-circle text-5xl mb-4 opacity-30"></i>' +
        '<p class="font-semibold text-slate-500">Tasks module not installed</p>' +
        '<p class="text-sm mt-1">Install the Tasks module to manage project tasks.</p>' +
        '</div>';
    }
    if (taskView === 'board')    return renderBoardView(tasks);
    if (taskView === 'calendar') return renderCalendarView(tasks);
    return renderTaskListView(tasks);
  }

  function renderTaskListView(tasks) {
    if (!tasks.length) {
      return '<div class="flex flex-col items-center justify-center py-16 text-slate-300">' +
        '<i class="fas fa-check-circle text-4xl mb-3 opacity-30"></i>' +
        '<p class="font-semibold text-slate-500">' + (focusMode ? "No tasks assigned to you today" : "No tasks yet") + '</p>' +
        (isAdmin() && !focusMode ? '<p class="text-sm mt-1 text-slate-400">Use the quick add bar above</p>' : '') +
        '</div>';
    }

    // Group by status
    var groups = {}, order = [];
    TASK_STATUSES.forEach(function(s) { groups[s] = []; });
    tasks.forEach(function(t) {
      if (!groups[t.status]) groups[t.status] = [];
      groups[t.status].push(t);
      if (!order.includes(t.status)) order.push(t.status);
    });

    return TASK_STATUSES.filter(function(s) { return groups[s] && groups[s].length; }).map(function(s) {
      var tc = TASK_STATUS_COLORS[s] || TASK_STATUS_COLORS['To Do'];
      var isDone = s === 'Done' || s === 'Cancelled';
      return '<div class="mb-4">' +
        '<div class="flex items-center gap-2 mb-2">' +
          '<span class="w-2 h-2 rounded-full flex-shrink-0" style="background:' + tc.dot + '"></span>' +
          '<span class="text-xs font-extrabold text-slate-600 uppercase tracking-wide">' + s + '</span>' +
          '<span class="text-xs font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">' + groups[s].length + '</span>' +
        '</div>' +
        '<div class="flex flex-col gap-1.5 ' + (isDone ? 'opacity-60' : '') + '">' +
          groups[s].map(function(t) { return renderTaskRow(t); }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderTaskRow(t) {
    var tc = TASK_STATUS_COLORS[t.status] || TASK_STATUS_COLORS['To Do'];
    var pc = PRIORITY_COLORS[t.priority]  || PRIORITY_COLORS['Medium'];
    var over = isOverdue(t);
    return '<div data-task-id="' + esc(t.id) + '" class="group bg-white rounded-xl border ' + (over ? 'border-red-200 bg-red-50/30' : 'border-slate-200') + ' px-3.5 py-2.5 flex items-center gap-3 hover:shadow-sm transition-all cursor-pointer">' +
      // Status dot
      '<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:' + tc.dot + '"></span>' +
      // Title + meta
      '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-semibold ' + (over ? 'text-red-700' : 'text-slate-900') + ' truncate ' + (t.status==='Done'||t.status==='Cancelled' ? 'line-through text-slate-400' : '') + '">' + esc(t.title) + '</p>' +
        '<div class="flex items-center gap-2 mt-0.5 flex-wrap">' +
          '<span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-px rounded ' + pc.bg + ' ' + pc.text + '">' +
            '<span class="w-1 h-1 rounded-full" style="background:' + pc.dot + '"></span>' + esc(t.priority||'—') +
          '</span>' +
          (t.due_date ? '<span class="text-[10px] ' + (over ? 'text-red-500 font-bold' : 'text-slate-400') + '">' + (over ? '⚠ ' : '') + fmtDate(t.due_date) + '</span>' : '') +
          countdown(t.due_date, t.status) +
        '</div>' +
      '</div>' +
      // Right: assignee + actions
      '<div class="flex items-center gap-2 flex-shrink-0">' +
        (t.assigned_to ? userAvatar(t.assigned_to, 'w-6 h-6 text-[10px]') : '') +
        '<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">' +
          '<button data-task-action="edit" data-task-id="' + esc(t.id) + '" title="Edit" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-400 flex items-center justify-center text-[10px] border-none cursor-pointer transition-colors"><i class="fas fa-pen"></i></button>' +
          (t.status !== 'Done'
            ? '<button data-task-action="done" data-task-id="' + esc(t.id) + '" title="Mark done" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-green-100 hover:text-green-600 text-slate-400 flex items-center justify-center text-[10px] border-none cursor-pointer transition-colors"><i class="fas fa-check"></i></button>'
            : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderBoardView(tasks) {
    return '<div class="flex gap-3 overflow-x-auto pb-2" style="min-height:400px">' +
      TASK_STATUSES.map(function(s) {
        var cols = tasks.filter(function(t) { return t.status === s; });
        var kc = KANBAN_COLORS[s] || KANBAN_COLORS['To Do'];
        var tc = TASK_STATUS_COLORS[s];
        return '<div class="flex-shrink-0 w-64 rounded-2xl border ' + kc.border + ' overflow-hidden flex flex-col">' +
          '<div class="' + kc.head + ' px-3 py-2.5 flex items-center justify-between border-b ' + kc.border + '">' +
            '<div class="flex items-center gap-2">' +
              '<span class="w-2 h-2 rounded-full ' + kc.dot + '"></span>' +
              '<span class="text-xs font-extrabold text-slate-700">' + s + '</span>' +
              '<span class="text-[10px] font-bold bg-white/60 px-1.5 py-px rounded-full text-slate-600">' + cols.length + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="p-2 flex flex-col gap-2 bg-white/50 flex-1 overflow-y-auto" style="max-height:500px">' +
            (cols.length
              ? cols.map(function(t) {
                  var over = isOverdue(t);
                  var pc = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS['Medium'];
                  return '<div data-task-id="' + esc(t.id) + '" class="bg-white rounded-xl border ' + (over?'border-red-200':'border-slate-200') + ' p-3 cursor-pointer hover:shadow-sm transition-all">' +
                    '<p class="text-xs font-semibold text-slate-800 leading-snug mb-2 ' + (over?'text-red-700':'') + '">' + esc(t.title) + '</p>' +
                    '<div class="flex items-center justify-between">' +
                      '<span class="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-px rounded ' + pc.bg + ' ' + pc.text + '">' + esc(t.priority||'—') + '</span>' +
                      (t.assigned_to ? userAvatar(t.assigned_to, 'w-5 h-5 text-[9px]') : '') +
                    '</div>' +
                    (t.due_date ? '<p class="text-[10px] ' + (over?'text-red-500 font-bold mt-1':'text-slate-400 mt-1') + '">' + fmtDate(t.due_date) + '</p>' : '') +
                  '</div>';
                }).join('')
              : '<div class="text-center py-6 text-slate-300 text-xs">Drop tasks here</div>') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderCalendarView(tasks) {
    var now   = new Date();
    var year  = now.getFullYear();
    var month = now.getMonth();
    var daysInMonth = new Date(year, month+1, 0).getDate();
    var firstDay    = new Date(year, month, 1).getDay();
    var monthName   = now.toLocaleDateString('en-US',{month:'long',year:'numeric'});

    // Index tasks by day
    var byDay = {};
    tasks.forEach(function(t) {
      if (!t.due_date) return;
      var d = new Date(t.due_date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        var day = d.getDate();
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(t);
      }
    });

    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var cells = '';
    // Empty cells before first day
    for (var i = 0; i < firstDay; i++) cells += '<div class="bg-slate-50 rounded-lg p-1.5 min-h-[60px]"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var isToday = d === now.getDate();
      var dayTasks = byDay[d] || [];
      cells += '<div class="bg-white rounded-lg border border-slate-100 p-1.5 min-h-[60px] hover:border-slate-300 transition-colors">' +
        '<p class="text-[10px] font-bold ' + (isToday ? 'w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center' : 'text-slate-500') + ' mb-1">' + d + '</p>' +
        dayTasks.slice(0,2).map(function(t) {
          var pc = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS['Medium'];
          return '<div data-task-id="' + esc(t.id) + '" class="text-[9px] font-semibold px-1 py-0.5 rounded mb-0.5 cursor-pointer truncate ' + pc.bg + ' ' + pc.text + '">' + esc(t.title) + '</div>';
        }).join('') +
        (dayTasks.length > 2 ? '<p class="text-[9px] text-slate-400">+' + (dayTasks.length-2) + ' more</p>' : '') +
      '</div>';
    }

    return '<div>' +
      '<div class="flex items-center justify-between mb-3">' +
        '<h3 class="text-sm font-extrabold text-slate-800">' + monthName + '</h3>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px" class="mb-1">' +
        days.map(function(d) { return '<div class="text-[10px] font-extrabold text-slate-400 text-center py-1">' + d + '</div>'; }).join('') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">' + cells + '</div>' +
    '</div>';
  }

  // ── Right Panel ─────────────────────────────────────────────────
  function renderRightPanel() {
    var tasks     = Object.values(tasksCache);
    var breakdown = {};
    try { breakdown = JSON.parse(statsCache.by_status || '{}'); } catch(e) {}
    var byPriority = {};
    try { byPriority = JSON.parse(statsCache.by_priority || '{}'); } catch(e) {}

    var html = '<div class="p-4 flex flex-col gap-5">';

    if (tasksInstalled()) {
    // ── Stats ──
    html += '<div>';
    html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Overview</p>';
    var statCards = [
      { label: 'Total Tasks',   val: statsCache.total    || tasks.length || 0, icon:'fa-tasks',      color:'text-blue-500' },
      { label: 'In Progress',   val: statsCache.in_progress || 0,              icon:'fa-spinner',    color:'text-blue-500' },
      { label: 'Done',          val: statsCache.done     || 0,                 icon:'fa-check',      color:'text-green-500' },
      { label: 'Overdue',       val: statsCache.overdue  || 0,                 icon:'fa-fire',       color:'text-red-500' },
    ];
    statCards.forEach(function(sc) {
      html += '<div class="flex items-center justify-between py-1.5">' +
        '<span class="flex items-center gap-2 text-xs text-slate-600">' +
          '<i class="fas ' + sc.icon + ' ' + sc.color + ' text-[10px] w-3"></i>' + sc.label +
        '</span>' +
        '<span class="text-xs font-extrabold text-slate-800">' + sc.val + '</span>' +
      '</div>';
    });
    html += '</div>';

    // ── Priority breakdown ──
    if (Object.keys(byPriority).length) {
      html += '<div>';
      html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">By Priority</p>';
      TASK_PRIORITIES.forEach(function(p) {
        var cnt = byPriority[p] || 0;
        if (!cnt) return;
        var pc = PRIORITY_COLORS[p] || PRIORITY_COLORS['Medium'];
        var total = tasks.length || 1;
        var pct = Math.round((cnt/total)*100);
        html += '<div class="mb-2.5">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<span class="text-[11px] font-semibold text-slate-600">' + p + '</span>' +
            '<span class="text-[11px] font-bold text-slate-700">' + cnt + '</span>' +
          '</div>' +
          '<div style="background:#f1f5f9;border-radius:9999px;height:5px">' +
            '<div style="width:' + pct + '%;height:5px;border-radius:9999px;background:' + pc.dot + ';transition:width .5s"></div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    // ── Workload ──
    var byAssignee = {};
    try { byAssignee = JSON.parse(statsCache.by_assignee || '{}'); } catch(e) {}
    if (Object.keys(byAssignee).length > 0) {
      html += '<div>';
      html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Workload</p>';
      var maxLoad = Math.max.apply(null, Object.values(byAssignee)) || 1;
      Object.keys(byAssignee).slice(0,5).forEach(function(uid) {
        var cnt = byAssignee[uid];
        var pct = Math.round((cnt/maxLoad)*100);
        html += '<div class="flex items-center gap-2 mb-2">' +
          userAvatar(uid, 'w-6 h-6 text-[9px]') +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center justify-between mb-0.5">' +
              '<p class="text-[11px] font-semibold text-slate-600 truncate">' + esc(userName(uid)) + '</p>' +
              '<span class="text-[10px] font-bold text-slate-500">' + cnt + '</span>' +
            '</div>' +
            '<div style="background:#f1f5f9;border-radius:9999px;height:4px">' +
              '<div style="width:' + pct + '%;height:4px;border-radius:9999px;background:' + (cnt > maxLoad*0.8 ? '#f97316' : '#3b82f6') + '"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }
    } // end tasksInstalled()

    // ── Activity ──
    if (activityCache.length) {
      html += '<div>';
      html += '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Activity</p>';
      activityCache.slice(0,8).forEach(function(a) {
        html += '<div class="flex gap-2 mb-3">' +
          userAvatar(a.user_id, 'w-6 h-6 text-[9px] flex-shrink-0') +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-[11px] text-slate-600 leading-snug">' +
              '<span class="font-semibold text-slate-800">' + esc(userName(a.user_id)) + '</span> ' + esc(a.action) +
              (a.detail ? ' — <span class="text-slate-500">' + esc(a.detail.substring(0,60)) + '</span>' : '') +
            '</p>' +
            '<p class="text-[10px] text-slate-400 mt-0.5">' + timeAgo(a.created_at) + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── Wire center panel events ─────────────────────────────────────
  function wireCenterPanel() {
    var tc = container.querySelector('#task-content');
    if (!tc) return;

    // View switcher
    container.querySelectorAll('[data-task-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        taskView = this.dataset.taskView;
        sessionStorage.setItem('proj_task_view', taskView);
        refreshCenter();
      });
    });

    // Filters
    var stSel = container.querySelector('#tf-status');
    if (stSel) stSel.addEventListener('change', function() { taskFilter.status = this.value; refreshCenter(); });
    var prSel = container.querySelector('#tf-priority');
    if (prSel) prSel.addEventListener('change', function() { taskFilter.priority = this.value; refreshCenter(); });

    // Search
    var srch = container.querySelector('#task-search');
    if (srch) srch.addEventListener('input', function() {
      taskSearch = this.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(refreshCenter, 200);
    });

    // Quick add
    var qa = container.querySelector('#proj-quick-add');
    if (qa) qa.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && this.value.trim()) {
        var title = this.value.trim();
        this.value = '';
        quickCreateTask(title);
      }
    });

    // Quick filter nav (left panel)
    container.querySelectorAll('.proj-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        taskFilter.quick = this.dataset.quick;
        refreshCenter();
        // Also refresh left panel to update active state
        var lp = document.getElementById('proj-left-panel');
        if (lp) lp.innerHTML = renderLeftPanel();
        wireLeftPanel();
      });
    });

    // Task row clicks (delegated)
    tc.addEventListener('click', function(e) {
      var actionBtn = e.target.closest('[data-task-action]');
      if (actionBtn) {
        e.stopPropagation();
        var id  = actionBtn.dataset.taskId;
        var act = actionBtn.dataset.taskAction;
        if (act === 'edit') openTaskInModule(tasksCache[id]);
        if (act === 'done') quickUpdateTask(id, 'Done');
        return;
      }
      var row = e.target.closest('[data-task-id]');
      if (row) openTaskInModule(tasksCache[row.dataset.taskId]);
    });

    // Add member button
    var amBtn = container.querySelector('#btn-add-member');
    if (amBtn) amBtn.addEventListener('click', openAddMemberModal);

    wireLeftPanel();
  }

  function wireLeftPanel() {
    container.querySelectorAll('.proj-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        taskFilter.quick = this.dataset.quick;
        refreshCenter();
        var lp = document.getElementById('proj-left-panel');
        if (lp) { lp.innerHTML = renderLeftPanel(); wireLeftPanel(); }
      });
    });
    // Wire Add Member button (may be in left panel after refresh)
    var amBtn = document.getElementById('btn-add-member');
    if (amBtn) amBtn.addEventListener('click', openAddMemberModal);
  }

  function refreshCenter() {
    var center = document.getElementById('proj-center');
    if (!center) return;
    center.innerHTML = renderCenterPanel();
    wireCenterPanel();
  }

  // ── Quick create task ───────────────────────────────────────────
  function quickCreateTask(title) {
    api('tasks/create', {
      title:      title,
      project_id: activeProject.id,
      status:     'To Do',
      priority:   'Medium',
      created_by: myId,
    }).then(function(data) {
      var newTask = {
        id:         data.id,
        title:      title,
        project_id: activeProject.id,
        status:     'To Do',
        priority:   'Medium',
        assigned_to:'',
        due_date:   '',
      };
      tasksCache[data.id] = newTask;
      refreshCenter();
      refreshRightPanel();
      // Log activity
      api('projects/log-activity', {
        project_id: activeProject.id,
        user_id:    myId,
        action:     'created task',
        detail:     title,
      }).catch(function(){});
      toast('Task created ✓', 'success');
    }).catch(function(e) { toast(e.message, 'error'); });
  }

  function quickUpdateTask(id, status) {
    api('tasks/update', { id: id, status: status }).then(function() {
      if (tasksCache[id]) tasksCache[id].status = status;
      refreshCenter();
      refreshRightPanel();
      api('projects/log-activity', {
        project_id: activeProject.id,
        user_id: myId,
        action: 'marked ' + status.toLowerCase(),
        detail: tasksCache[id] ? tasksCache[id].title : id,
      }).catch(function(){});
    }).catch(function(e) { toast(e.message, 'error'); });
  }

  function refreshRightPanel() {
    // Recalculate stats from tasksCache
    var tasks = Object.values(tasksCache);
    var now   = new Date().toISOString().split('T')[0];
    statsCache.total       = tasks.length;
    statsCache.done        = tasks.filter(function(t){return t.status==='Done';}).length;
    statsCache.in_progress = tasks.filter(function(t){return t.status==='In Progress';}).length;
    statsCache.overdue     = tasks.filter(function(t){return t.due_date && t.due_date < now && t.status !== 'Done' && t.status !== 'Cancelled';}).length;
    statsCache.progress    = tasks.length ? Math.round((statsCache.done/tasks.length)*100) : 0;

    var byStatus = {}, byPriority = {}, byAssignee = {};
    tasks.forEach(function(t) {
      byStatus[t.status]     = (byStatus[t.status]||0)+1;
      byPriority[t.priority] = (byPriority[t.priority]||0)+1;
      if (t.assigned_to) byAssignee[t.assigned_to] = (byAssignee[t.assigned_to]||0)+1;
    });
    statsCache.by_status   = JSON.stringify(byStatus);
    statsCache.by_priority = JSON.stringify(byPriority);
    statsCache.by_assignee = JSON.stringify(byAssignee);

    var rp = document.getElementById('proj-right-panel');
    if (rp) rp.innerHTML = renderRightPanel();
  }

  // ================================================================
  //  FORMS — Project Create/Edit
  // ================================================================
  function openProjectForm(proj) {
    var isEdit = !!proj;
    function v(k) { return proj ? (proj[k] || '') : ''; }

    var statusOpts = STATUSES.map(function(s) {
      return '<option value="' + s + '"' + (s === (v('status') || 'Planning') ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    var priorityOpts = PRIORITIES.map(function(p) {
      return '<option value="' + p + '"' + (p === (v('priority') || 'Medium') ? ' selected' : '') + '>' + p + '</option>';
    }).join('');

    var colorSwatches = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#6366f1','#ec4899'].map(function(c) {
      var active = c === (v('color') || '#3b82f6');
      return '<button type="button" data-color="' + c + '" class="color-swatch w-7 h-7 rounded-lg border-2 transition-all ' + (active ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105') + '" style="background:' + c + '"></button>';
    }).join('');

    var ownerOpts = '<option value="">— Select owner —</option>' +
      usersCache.map(function(u) {
        var uid = u.user_id || u.id;
        return '<option value="' + esc(uid) + '"' + (uid === v('owner_id') ? ' selected' : '') + '>' + esc(u.name || u.email) + '</option>';
      }).join('');

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2">' +
          '<i class="fas fa-folder-open text-blue-500"></i>' + (isEdit ? 'Edit Project' : 'New Project') +
        '</h3>' +
        '<button id="pf-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer text-base">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="pm-status"></div>' +

        // Name
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Project Name <span class="text-red-400">*</span></label>' +
        '<input id="pf-name" class="field" type="text" placeholder="My awesome project…" value="' + esc(v('name')) + '"></div>' +

        // Description
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>' +
        '<textarea id="pf-desc" class="field text-sm" rows="2" style="resize:none">' + esc(v('description')) + '</textarea></div>' +

        // Status + Priority
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>' +
          '<select id="pf-status" class="field text-sm">' + statusOpts + '</select></div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>' +
          '<select id="pf-priority" class="field text-sm">' + priorityOpts + '</select></div>' +
        '</div>' +

        // Owner
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Owner</label>' +
        '<select id="pf-owner" class="field text-sm">' + ownerOpts + '</select></div>' +

        // Dates
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Start Date</label>' +
          '<input id="pf-start" class="field text-sm" type="date" value="' + esc(v('start_date')) + '"></div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>' +
          '<input id="pf-due" class="field text-sm" type="date" value="' + esc(v('due_date')) + '"></div>' +
        '</div>' +

        // Budget
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Budget (optional)</label>' +
        '<input id="pf-budget" class="field text-sm" type="number" step="100" min="0" placeholder="0" value="' + esc(v('budget')) + '"></div>' +

        // Tags
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tags</label>' +
        '<input id="pf-tags" class="field text-sm" type="text" placeholder="design, q1, client-work…" value="' + esc(v('tags')) + '"></div>' +

        // Color
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Color</label>' +
        '<div class="flex gap-2 flex-wrap">' + colorSwatches + '</div></div>' +

        // Buttons
        '<div class="flex gap-3 pt-2">' +
          '<button id="pf-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="pf-save" class="btn-primary flex-1"><i class="fas fa-' + (isEdit ? 'save' : 'plus') + ' text-xs mr-1"></i>' + (isEdit ? 'Save Changes' : 'Create Project') + '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '560px');

    // Wire color swatches
    var selectedColor = v('color') || '#3b82f6';
    document.querySelectorAll('.color-swatch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        document.querySelectorAll('.color-swatch').forEach(function(s) {
          s.classList.remove('border-slate-800','scale-110');
          s.classList.add('border-transparent');
        });
        this.classList.add('border-slate-800','scale-110');
        this.classList.remove('border-transparent');
        selectedColor = this.dataset.color;
      });
    });

    document.getElementById('pf-close').addEventListener('click', closeModal);
    document.getElementById('pf-cancel').addEventListener('click', closeModal);
    document.getElementById('pf-save').addEventListener('click', function() {
      var name = document.getElementById('pf-name').value.trim();
      if (!name) { modalStatus('Project name is required', false); return; }

      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…';
      modalStatus('', null);

      var params = {
        name:        name,
        description: document.getElementById('pf-desc').value.trim(),
        status:      document.getElementById('pf-status').value,
        priority:    document.getElementById('pf-priority').value,
        owner_id:    document.getElementById('pf-owner').value,
        start_date:  document.getElementById('pf-start').value,
        due_date:    document.getElementById('pf-due').value,
        budget:      document.getElementById('pf-budget').value,
        tags:        document.getElementById('pf-tags').value,
        color:       selectedColor,
        created_by:  myId,
      };

      var promise = isEdit
        ? api('projects/update', Object.assign({ id: proj.id, log_user: myId }, params))
        : api('projects/create', params);

      promise.then(function(data) {
        modalStatus((isEdit ? 'Project updated ✓' : 'Project created ✓'), true);
        setTimeout(function() {
          closeModal();
          if (isEdit) {
            // Reload detail
            openProjectDetail(proj.id);
          } else {
            // Go to new project detail
            openProjectDetail(data.id);
          }
        }, 600);
      }).catch(function(e) {
        modalStatus(e.message, false);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-' + (isEdit ? 'save' : 'plus') + ' text-xs mr-1"></i>' + (isEdit ? 'Save Changes' : 'Create Project');
      });
    });
  }

  // ── Confirm delete project ──────────────────────────────────────
  function confirmDeleteProject(pid, name) {
    showModal(
      '<div class="px-6 py-5 border-b border-slate-100">' +
        '<h3 class="font-extrabold text-slate-900">Delete Project</h3>' +
      '</div>' +
      '<div class="px-6 py-5">' +
        '<div id="pm-status"></div>' +
        '<p class="text-sm text-slate-600 mb-1">Are you sure you want to delete <strong>' + esc(name) + '</strong>?</p>' +
        '<p class="text-xs text-slate-400 mb-5">Tasks assigned to this project will not be deleted — they will just lose their project link.</p>' +
        '<div class="flex gap-3">' +
          '<button id="del-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="del-confirm" class="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors">' +
            '<i class="fas fa-trash text-xs mr-1"></i>Delete Project' +
          '</button>' +
        '</div>' +
      '</div>',
    '420px');
    document.getElementById('del-cancel').addEventListener('click', closeModal);
    document.getElementById('del-confirm').addEventListener('click', function() {
      var btn = this; btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Deleting…';
      api('projects/delete', { id: pid }).then(function() {
        closeModal();
        projectsCache = projectsCache.filter(function(p){ return p.id !== pid; });
        view = 'list';
        activeProject = null;
        renderListView();
        toast('Project deleted', 'info');
      }).catch(function(e) { modalStatus(e.message, false); btn.disabled = false; btn.innerHTML = 'Delete Project'; });
    });
  }

  // ── New/Edit Task form (uses Tasks module API) ──────────────────
  function openNewTaskForm() {
    openEditTaskForm(null);
  }

  function openEditTaskForm(task) {
    var isEdit = !!task;
    function v(k) { return task ? (task[k] || '') : ''; }

    var statusOpts = TASK_STATUSES.map(function(s) {
      return '<option value="' + s + '"' + (s === (v('status') || 'To Do') ? ' selected':'') + '>' + s + '</option>';
    }).join('');
    var priorityOpts = TASK_PRIORITIES.map(function(p) {
      return '<option value="' + p + '"' + (p === (v('priority') || 'Medium') ? ' selected':'') + '>' + p + '</option>';
    }).join('');
    var assigneeOpts = '<option value="">— Unassigned —</option>' +
      usersCache.map(function(u) {
        var uid = u.user_id || u.id;
        return '<option value="' + esc(uid) + '"' + (uid === v('assigned_to') ? ' selected':'') + '>' + esc(u.name || u.email) + '</option>';
      }).join('');

    // Build linked-task field (all tasks from Tasks module, excluding current)
    var linkedTaskId = v('linked_task_id');
    var allTasks = Object.values(tasksCache);
    var linkedTaskField = '';
    if (tasksInstalled()) {
      var taskOpts = '<option value="">— None —</option>' +
        allTasks.filter(function(t) { return !isEdit || t.id !== task.id; }).map(function(t) {
          return '<option value="' + esc(t.id) + '"' + (String(t.id) === String(linkedTaskId) ? ' selected':'') + '>' + esc(t.title) + '</option>';
        }).join('');
      linkedTaskField =
        '<div>' +
          '<label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Linked Task</label>' +
          '<div class="flex gap-2">' +
            '<select id="tf-linked-task" class="field text-sm flex-1">' + taskOpts + '</select>' +
            '<button type="button" id="tf-clear-linked" title="Remove linked task" class="w-9 h-9 flex-shrink-0 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center text-sm transition-colors border-none cursor-pointer" style="border:1px solid #e2e8f0">' +
              '<i class="fas fa-times"></i>' +
            '</button>' +
          '</div>' +
        '</div>';
    }

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900">' + (isEdit ? 'Edit Task' : 'New Task') + '</h3>' +
        '<div class="flex items-center gap-2">' +
        (isEdit && tasksInstalled()
          ? '<button id="tf-open-in-tasks" class="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer" title="Open full task view">' +
            '<i class="fas fa-external-link-alt text-[10px]"></i>Open in Tasks</button>'
          : '') +
        '<button id="tf-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer text-base">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="pm-status"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Title <span class="text-red-400">*</span></label>' +
        '<input id="tf-title" class="field" type="text" placeholder="Task title…" value="' + esc(v('title')) + '"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>' +
        '<textarea id="tf-desc" class="field text-sm" rows="2" style="resize:none">' + esc(v('description')) + '</textarea></div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>' +
          '<select id="tf-status" class="field text-sm">' + statusOpts + '</select></div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>' +
          '<select id="tf-priority" class="field text-sm">' + priorityOpts + '</select></div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div>' +
            '<label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Assigned To</label>' +
            '<div class="flex gap-2">' +
              '<select id="tf-assignee" class="field text-sm flex-1">' + assigneeOpts + '</select>' +
              '<button type="button" id="tf-clear-assignee" title="Remove assignment" class="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center text-sm transition-colors cursor-pointer" style="border:1px solid #e2e8f0;background:#fff;color:#94a3b8">' +
                '<i class="fas fa-user-times"></i>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>' +
          '<input id="tf-due" class="field text-sm" type="date" value="' + esc(v('due_date')) + '"></div>' +
        '</div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Estimated Hours</label>' +
        '<input id="tf-est" class="field text-sm" type="number" step="0.5" min="0" placeholder="e.g. 4" value="' + esc(v('estimated_hours')) + '"></div>' +

        linkedTaskField +

        '<div class="flex gap-3 pt-2">' +
          (isEdit && isAdmin()
            ? '<button id="tf-delete" class="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors border-none cursor-pointer">' +
              '<i class="fas fa-trash text-xs mr-1"></i>Delete</button>'
            : '') +
          '<button id="tf-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tf-save" class="btn-primary flex-1"><i class="fas fa-' + (isEdit ? 'save':'plus') + ' text-xs mr-1"></i>' + (isEdit ? 'Save Changes':'Create Task') + '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '520px');
    document.getElementById('tf-close').addEventListener('click', closeModal);
    document.getElementById('tf-cancel').addEventListener('click', closeModal);

    // Open in Tasks module button
    var openInTasksBtn = document.getElementById('tf-open-in-tasks');
    if (openInTasksBtn) {
      openInTasksBtn.addEventListener('click', function() {
        closeModal();
        openTaskInModule(task);
      });
    }

    // Clear assignee button
    var clearAssigneeBtn = document.getElementById('tf-clear-assignee');
    if (clearAssigneeBtn) {
      clearAssigneeBtn.addEventListener('click', function() {
        document.getElementById('tf-assignee').value = '';
      });
    }

    // Clear linked task button
    var clearLinkedBtn = document.getElementById('tf-clear-linked');
    if (clearLinkedBtn) {
      clearLinkedBtn.addEventListener('click', function() {
        document.getElementById('tf-linked-task').value = '';
      });
    }

    if (isEdit && isAdmin()) {
      var delBtn = document.getElementById('tf-delete');
      if (delBtn) delBtn.addEventListener('click', function() {
        if (!confirm('Delete task "' + (task.title||'') + '"?')) return;
        api('tasks/delete', { id: task.id }).then(function() {
          delete tasksCache[task.id];
          closeModal();
          refreshCenter();
          refreshRightPanel();
          toast('Task deleted', 'info');
        }).catch(function(e) { toast(e.message, 'error'); });
      });
    }

    document.getElementById('tf-save').addEventListener('click', function() {
      var title = document.getElementById('tf-title').value.trim();
      if (!title) { modalStatus('Title is required', false); return; }

      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…';
      modalStatus('', null);

      var linkedTaskEl = document.getElementById('tf-linked-task');
      var params = {
        title:           title,
        description:     document.getElementById('tf-desc').value.trim(),
        status:          document.getElementById('tf-status').value,
        priority:        document.getElementById('tf-priority').value,
        assigned_to:     document.getElementById('tf-assignee').value,
        due_date:        document.getElementById('tf-due').value,
        estimated_hours: document.getElementById('tf-est').value,
        project_id:      activeProject ? activeProject.id : '',
        created_by:      myId,
      };
      if (linkedTaskEl) params.linked_task_id = linkedTaskEl.value;

      var promise = isEdit
        ? api('tasks/update', Object.assign({ id: task.id }, params))
        : api('tasks/create', params);

      promise.then(function(data) {
        var id = isEdit ? task.id : data.id;
        tasksCache[id] = Object.assign({}, tasksCache[id] || {}, params, { id: id });
        modalStatus((isEdit ? 'Task saved ✓' : 'Task created ✓'), true);
        setTimeout(function() {
          closeModal();
          refreshCenter();
          refreshRightPanel();
          if (activeProject) {
            api('projects/log-activity', {
              project_id: activeProject.id,
              user_id:    myId,
              action:     isEdit ? 'updated task' : 'created task',
              detail:     title,
            }).catch(function(){});
          }
        }, 500);
      }).catch(function(e) {
        modalStatus(e.message, false);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-' + (isEdit?'save':'plus') + ' text-xs mr-1"></i>' + (isEdit?'Save Changes':'Create Task');
      });
    });
  }

  // ── Open task in the Tasks module ───────────────────────────────
  function openTaskInModule(task) {
    if (!task) return;
    // Set the deep-link so the Tasks module opens this task on load
    window._wvDeepLink = { module: 'tasks', id: task.id };
    // Navigate to the Tasks module
    if (typeof showModule === 'function') {
      showModule('tasks');
    } else if (window.WorkVolt && typeof window.WorkVolt.navigate === 'function') {
      window.WorkVolt.navigate('tasks');
    } else {
      // Fallback: click the tasks nav item if it exists
      var navLink = document.querySelector('[data-module="tasks"]');
      if (navLink) {
        navLink.click();
      } else {
        // Last resort: open edit modal locally
        openEditTaskForm(task);
      }
    }
  }

  // ── Add member modal ────────────────────────────────────────────
  function openAddMemberModal() {
    var existingIds = membersCache.map(function(m) { return m.user_id; });
    var available   = usersCache.filter(function(u) { return !existingIds.includes(u.user_id||u.id); });

    if (!available.length) {
      toast('All users are already members', 'info');
      return;
    }

    var userOpts = available.map(function(u) {
      var uid = u.user_id || u.id;
      return '<option value="' + esc(uid) + '">' + esc(u.name || u.email) + '</option>';
    }).join('');

    var roleOpts = ['Member','Lead','Reviewer','Observer'].map(function(r) {
      return '<option>' + r + '</option>';
    }).join('');

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><i class="fas fa-user-plus text-blue-500"></i>Add Team Member</h3>' +
        '<button id="am-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer text-base">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="pm-status"></div>' +
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">User</label>' +
        '<select id="am-user" class="field text-sm">' + userOpts + '</select></div>' +
        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Role</label>' +
        '<select id="am-role" class="field text-sm">' + roleOpts + '</select></div>' +
        '<div class="flex gap-3 pt-1">' +
          '<button id="am-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="am-save" class="btn-primary flex-1"><i class="fas fa-user-plus text-xs mr-1"></i>Add Member</button>' +
        '</div>' +
      '</div>';

    showModal(html, '420px');
    document.getElementById('am-close').addEventListener('click', closeModal);
    document.getElementById('am-cancel').addEventListener('click', closeModal);
    document.getElementById('am-save').addEventListener('click', function() {
      var uid  = document.getElementById('am-user').value;
      var role = document.getElementById('am-role').value;
      var btn  = this; btn.disabled = true;
      api('projects/add-member', { project_id: activeProject.id, user_id: uid, role: role })
        .then(function() {
          membersCache.push({ project_id: activeProject.id, user_id: uid, role: role });
          closeModal();
          var lp = document.getElementById('proj-left-panel');
          if (lp) { lp.innerHTML = renderLeftPanel(); wireLeftPanel(); }
          toast('Member added ✓', 'success');
          api('projects/log-activity', { project_id: activeProject.id, user_id: myId, action: 'added member', detail: userName(uid) }).catch(function(){});
        })
        .catch(function(e) { modalStatus(e.message, false); btn.disabled = false; });
    });
  }

  // ================================================================
  //  BOOT
  // ================================================================
  // Check deep-link from notifications
  function checkDeepLink() {
    var link = window._wvDeepLink;
    if (!link || link.module !== 'projects' || !link.id) return;
    window._wvDeepLink = null;
    openProjectDetail(link.id);
  }

  // Initial render
  renderListView();
  setTimeout(checkDeepLink, 300);
};
