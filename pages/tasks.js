window.WorkVoltPages['tasks'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl      = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret   = localStorage.getItem('wv_api_secret') || '';
  var tasksCache    = {};   // keyed by `id`
  var usersCache    = [];
  var projectsCache = [];
  var activeView    = sessionStorage.getItem('tasks_view') || 'list';
  var filters       = { status: '', priority: '', assigned_to: '' };

  // ── GAS-matching constants ─────────────────────────────────────
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
  var PRIORITY_COLORS = {
    'Low':    'bg-slate-100 text-slate-500',
    'Medium': 'bg-amber-100 text-amber-700',
    'High':   'bg-orange-100 text-orange-700',
    'Urgent': 'bg-red-100 text-red-600',
  };
  var PRIORITY_DOT = {
    'Low': 'bg-slate-400', 'Medium': 'bg-amber-400',
    'High': 'bg-orange-500', 'Urgent': 'bg-red-500',
  };
  var KANBAN_DOT = {
    'To Do':'bg-slate-400','In Progress':'bg-blue-500',
    'In Review':'bg-purple-500','Done':'bg-green-500','Cancelled':'bg-red-400',
  };

  // ── Role helpers ───────────────────────────────────────────────
  function getRole() {
    try { return window.WorkVolt.user().role || 'SuperAdmin'; } catch(e) { return 'SuperAdmin'; }
  }
  function isAdmin()  { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function myUserId() { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } }

  // Projects module installed?
  function projectsInstalled() {
    try { return (window.INSTALLED_MODULES || []).some(function(m) { return m.id === 'projects'; }); }
    catch(e) { return false; }
  }

  // ================================================================
  //  API
  // ================================================================
  function api(path, params) {
    if (!savedUrl || !savedSecret) return Promise.reject(new Error('Google Sheet not connected'));
    var url = new URL(savedUrl);
    url.searchParams.set('path',  path);
    url.searchParams.set('token', savedSecret);
    if (params) Object.keys(params).forEach(function(k) {
      if (params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
        url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { cache: 'no-cache' })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.error) throw new Error(d.error); return d; });
  }

  // ================================================================
  //  HELPERS
  // ================================================================
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
    var n = parseFloat(v) || 0;
    return '$' + n.toFixed(2);
  }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u) { return u.user_id === uid || u.id === uid; });
    return u ? (u.name || u.email || uid) : uid;
  }
  function userInitial(uid) {
    return userName(uid).charAt(0).toUpperCase() || '?';
  }
  function projectName(pid) {
    if (!pid) return pid;
    var p = projectsCache.find(function(p) { return (p.id || p.project_id) === pid; });
    return p ? (p.name || pid) : pid;
  }
  function statusBadge(s) {
    var c = STATUS_COLORS[s] || 'bg-slate-100 text-slate-600';
    var i = STATUS_ICON[s]   || 'fa-circle';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + c + '">' +
      '<i class="fas ' + i + ' text-[9px]"></i>' + esc(s || '—') + '</span>';
  }
  function priorityBadge(p) {
    var c = PRIORITY_COLORS[p] || 'bg-slate-100 text-slate-500';
    var d = PRIORITY_DOT[p]   || 'bg-slate-400';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + c + '">' +
      '<span class="w-1.5 h-1.5 rounded-full ' + d + '"></span>' + esc(p || '—') + '</span>';
  }
  function hoursBar(actual, estimated) {
    var a = parseFloat(actual)    || 0;
    var e = parseFloat(estimated) || 0;
    if (!e && !a) return '';
    if (!e) return '<span class="text-xs text-slate-500">' + fmtHours(a) + ' logged</span>';
    var pct      = Math.min(Math.round((a / e) * 100), 100);
    var barColor = pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-blue-400';
    return '<div class="flex items-center gap-1.5">' +
      '<div class="bg-slate-100 rounded-full h-1.5 flex-1" style="min-width:40px">' +
        '<div class="' + barColor + ' h-1.5 rounded-full" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<span class="text-xs text-slate-500 whitespace-nowrap">' + fmtHours(a) + ' / ' + fmtHours(e) + '</span>' +
    '</div>';
  }
  function isOverdue(t) {
    return t.due_date && new Date(t.due_date) < new Date()
      && t.status !== 'Done' && t.status !== 'Cancelled';
  }
  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }

  // ================================================================
  //  MODAL PORTAL
  // ================================================================
  var MODAL_ID = 'wv-tasks-modal-portal';
  function getPortal() {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el = document.createElement('div'); el.id = MODAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html, maxWidth) {
    maxWidth = maxWidth || '640px';
    getPortal().innerHTML =
      '<div id="tm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;' +
        'display:flex;align-items:center;justify-content:center;padding:1rem;">' +
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,0.25);' +
          'width:100%;max-width:' + maxWidth + ';max-height:92vh;overflow-y:auto;z-index:9999;">' +
          html +
        '</div>' +
      '</div>';
    document.getElementById('tm-backdrop').addEventListener('click', function(e) {
      if (e.target.id === 'tm-backdrop') closeModal();
    });
  }
  function closeModal() {
    var p = document.getElementById(MODAL_ID);
    if (p) p.innerHTML = '';
  }
  function modalStatus(msg, ok) {
    var el = document.getElementById('tm-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 ' +
      (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
      '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i>' +
      '<span>' + esc(msg) + '</span></div>';
  }

  // ================================================================
  //  MAIN SHELL
  // ================================================================
  function render() {
    container.innerHTML =
      '<div class="min-h-full bg-slate-50">' +

        // ── Header ────────────────────────────────────────────────
        '<div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">' +
          '<div>' +
            '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Tasks</h1>' +
            '<p class="text-slate-400 text-xs mt-0.5" id="tasks-subtitle">Loading…</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<div class="flex items-center bg-slate-100 rounded-lg p-0.5">' +
              '<button id="btn-view-list" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ' +
                (activeView==='list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600') + '">' +
                '<i class="fas fa-list mr-1"></i>List</button>' +
              '<button id="btn-view-kanban" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ' +
                (activeView==='kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600') + '">' +
                '<i class="fas fa-columns mr-1"></i>Kanban</button>' +
            '</div>' +
            '<button id="btn-new-task" class="btn-primary text-sm">' +
              '<i class="fas fa-plus"></i> New Task</button>' +
          '</div>' +
        '</div>' +

        // ── Stats strip ───────────────────────────────────────────
        '<div id="tasks-stats" class="bg-white border-b border-slate-100 px-6 py-2 flex gap-5 text-xs text-slate-400 overflow-x-auto items-center"></div>' +

        // ── Filters ───────────────────────────────────────────────
        '<div class="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-2">' +
          '<select id="filter-status" class="field text-xs py-1.5 w-34" style="width:8.5rem">' +
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
          '<button id="btn-clear-filters" class="text-xs text-slate-400 hover:text-slate-600 font-semibold px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">' +
            '<i class="fas fa-times mr-1"></i>Clear</button>' +
          '<div class="ml-auto">' +
            '<div class="relative">' +
              '<i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>' +
              '<input id="task-search" type="text" placeholder="Search…" class="field text-xs py-1.5 pl-7" style="width:13rem">' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ── Content ───────────────────────────────────────────────
        '<div id="tasks-content" class="p-6">' +
          '<div class="flex items-center justify-center py-20 text-slate-300">' +
            '<i class="fas fa-circle-notch fa-spin text-3xl"></i>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ── Wire up controls ──────────────────────────────────────────
    container.querySelector('#btn-view-list').addEventListener('click', function() { setView('list'); });
    container.querySelector('#btn-view-kanban').addEventListener('click', function() { setView('kanban'); });
    container.querySelector('#btn-new-task').addEventListener('click', function() { openTaskForm(null); });
    container.querySelector('#btn-clear-filters').addEventListener('click', function() {
      filters = { status:'', priority:'', assigned_to:'' }; render();
    });
    container.querySelector('#filter-status').addEventListener('change', function() {
      filters.status = this.value; loadData();
    });
    container.querySelector('#filter-priority').addEventListener('change', function() {
      filters.priority = this.value; loadData();
    });
    container.querySelector('#filter-assigned').addEventListener('change', function() {
      filters.assigned_to = this.value; loadData();
    });
    container.querySelector('#task-search').addEventListener('input', function() {
      doSearch(this.value);
    });

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
      if (action === 'edit')      openTaskForm(task);
      if (action === 'delete')    openDeleteModal(id, title);
      if (action === 'log-hours') openLogHoursModal(task);
      if (action === 'log-note')  openLogNoteModal(task);
      if (action === 'complete')  quickUpdate(id, { status:'Done' },       'Task completed ✓');
      if (action === 'cancel')    quickUpdate(id, { status:'Cancelled' },  'Task cancelled');
      if (action === 'reopen')    quickUpdate(id, { status:'To Do' },      'Task reopened');
    });

    loadData();
  }

  function setView(v) {
    activeView = v;
    sessionStorage.setItem('tasks_view', v);
    render();
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
          '<p class="text-sm mt-1">Go to <strong>Settings → Connection</strong> to connect your sheet.</p>' +
        '</div>';
      return;
    }

    var p = {};
    if (filters.status)   p.status   = filters.status;
    if (filters.priority) p.priority = filters.priority;
    if (filters.assigned_to === '__me__') p.assigned_to = myUserId();
    else if (filters.assigned_to) p.assigned_to = filters.assigned_to;

    var calls = [
      api('tasks/list', p),
      api('users/list').catch(function() { return {}; }),
    ];
    if (projectsInstalled()) {
      calls.push(api('projects/list').catch(function() { return {}; }));
    }

    Promise.all(calls).then(function(res) {
      var rows = res[0].rows || [];
      usersCache    = res[1].users || res[1].rows || [];
      projectsCache = res[2] ? (res[2].rows || res[2].projects || []) : [];

      tasksCache = {};
      rows.forEach(function(t) { if (t.id) tasksCache[t.id] = t; });

      // Populate assignee filter options dynamically
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

      renderStats(rows);

      var sub = document.getElementById('tasks-subtitle');
      if (sub) sub.textContent = rows.length + ' task' + (rows.length !== 1 ? 's' : '');

      if (activeView === 'kanban') renderKanban(rows);
      else renderList(rows);

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
    var totalH  = rows.reduce(function(s, t) { return s + (parseFloat(t.actual_hours) || 0); }, 0);
    var overdueN = rows.filter(isOverdue).length;

    el.innerHTML =
      STATUSES.map(function(s) {
        return '<span class="flex items-center gap-1.5 whitespace-nowrap">' +
          '<span class="w-2 h-2 rounded-full ' + (KANBAN_DOT[s] || 'bg-slate-400') + '"></span>' +
          '<span class="font-bold text-slate-700">' + counts[s] + '</span>' +
          '<span>' + s + '</span></span>';
      }).join('<span class="text-slate-200 mx-0.5">|</span>') +
      '<span class="text-slate-200 mx-1">·</span>' +
      '<span class="flex items-center gap-1 whitespace-nowrap">' +
        '<i class="fas fa-clock text-blue-400"></i>' +
        '<span class="font-bold text-slate-700">' + fmtHours(totalH) + '</span> logged' +
      '</span>' +
      (overdueN ? '<span class="text-slate-200 mx-1">·</span>' +
        '<span class="flex items-center gap-1 whitespace-nowrap text-red-500 font-bold">' +
          '<i class="fas fa-exclamation-circle"></i>' + overdueN + ' overdue' +
        '</span>' : '');
  }


  // ================================================================
  //  LIST VIEW
  // ================================================================
    function renderList(tasks) {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    if (!tasks.length) {
      content.innerHTML =
        '<div class="flex flex-col items-center justify-center py-24 text-slate-400">' +
          '<i class="fas fa-clipboard-list text-5xl mb-4 opacity-25"></i>' +
          '<p class="font-semibold text-slate-500">No tasks found</p>' +
          '<p class="text-sm mt-1">Click <strong>New Task</strong> to create one.</p>' +
        '</div>';
      return;
    }

    var showProject = projectsInstalled();

    var rows = tasks.map(function(t) {
      var overdue  = isOverdue(t);
      var done     = t.status === 'Done' || t.status === 'Cancelled';
      var hasHours = parseFloat(t.estimated_hours) > 0 || parseFloat(t.actual_hours) > 0;

      var quickBtns =
        (!done
          ? '<button data-action="complete" data-id="' + t.id + '" title="Mark Done" class="act-btn icon-btn hover:text-green-600 hover:bg-green-50"><i class="fas fa-check text-xs"></i></button>' +
            '<button data-action="cancel"   data-id="' + t.id + '" title="Cancel"    class="act-btn icon-btn hover:text-orange-500 hover:bg-orange-50"><i class="fas fa-ban text-xs"></i></button>'
          : '<button data-action="reopen"   data-id="' + t.id + '" title="Reopen"    class="act-btn icon-btn hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-undo text-xs"></i></button>') +
        '<button data-action="log-hours" data-id="' + t.id + '" title="Log Hours"  class="act-btn icon-btn hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-clock text-xs"></i></button>' +
        '<button data-action="log-note"  data-id="' + t.id + '" title="Log Note"   class="act-btn icon-btn hover:text-purple-600 hover:bg-purple-50"><i class="fas fa-sticky-note text-xs"></i></button>' +
        '<button data-action="view"      data-id="' + t.id + '" title="View Details" class="act-btn icon-btn hover:text-indigo-600 hover:bg-indigo-50"><i class="fas fa-eye text-xs"></i></button>' +
        (isAdmin() ? '<button data-action="delete" data-id="' + t.id + '" data-title="' + esc(t.title) + '" title="Delete" class="act-btn icon-btn hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>' : '');

      // Inline editable title
      var titleCell = '<div class="group/title relative">' +
        '<div class="editable-title font-semibold text-slate-900 text-sm leading-snug truncate cursor-pointer hover:text-blue-600 hover:bg-blue-50 px-2 -mx-2 py-1 rounded transition-colors" ' +
        'data-field="title" data-id="' + t.id + '" title="Click to edit">' + esc(t.title) + '</div>' +
        '<div class="edit-input hidden flex items-center gap-2">' +
          '<input type="text" class="field text-sm py-1" value="' + esc(t.title) + '" data-field="title" data-id="' + t.id + '">' +
          '<button class="save-edit text-green-600 hover:bg-green-50 w-7 h-7 rounded flex items-center justify-center"><i class="fas fa-check text-xs"></i></button>' +
          '<button class="cancel-edit text-slate-400 hover:bg-slate-100 w-7 h-7 rounded flex items-center justify-center"><i class="fas fa-times text-xs"></i></button>' +
        '</div>' +
        '<div class="text-[10px] text-slate-400 font-mono">' + esc(t.id) + '</div>' +
        (t.tags ? '<div class="flex flex-wrap gap-1 mt-1">' +
          t.tags.split(',').map(function(tag) { tag = tag.trim();
            return tag ? '<span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-px rounded font-medium">' + esc(tag) + '</span>' : '';
          }).join('') + '</div>' : '') +
      '</div>';

      // Inline editable status dropdown
      var statusCell = '<div class="editable-status relative" data-field="status" data-id="' + t.id + '">' +
        '<div class="status-display cursor-pointer hover:opacity-80 transition-opacity">' + statusBadge(t.status) + '</div>' +
        '<select class="status-select hidden field text-xs py-1" data-field="status" data-id="' + t.id + '">' +
          STATUSES.map(function(s) {
            return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
      '</div>';

      // Inline editable priority dropdown
      var priorityCell = '<div class="editable-priority relative" data-field="priority" data-id="' + t.id + '">' +
        '<div class="priority-display cursor-pointer hover:opacity-80 transition-opacity">' + priorityBadge(t.priority) + '</div>' +
        '<select class="priority-select hidden field text-xs py-1" data-field="priority" data-id="' + t.id + '">' +
          PRIORITIES.map(function(p) {
            return '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>' + p + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
      
      // Inline editable assigned user - with searchable dropdown
      var assignedCell = '<div class="editable-assigned relative" data-field="assigned_to" data-id="' + t.id + '">' +
        '<div class="assigned-display cursor-pointer hover:opacity-80 transition-opacity">' +
          (t.assigned_to
            ? '<span class="inline-flex items-center gap-1.5 text-xs text-slate-600">' +
                '<span class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">' + userInitial(t.assigned_to) + '</span>' +
                '<span class="truncate" style="max-width:90px">' + esc(userName(t.assigned_to)) + '</span>' +
              '</span>'
            : '<span class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Assign</span>') +
        '</div>' +
        '<div class="assigned-dropdown hidden absolute z-50 left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl w-56 p-2">' +
          '<div class="relative mb-2">' +
            '<i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" class="assigned-search w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Search user…">' +
          '</div>' +
          '<div class="assigned-list max-h-40 overflow-y-auto">' +
            '<button type="button" class="assign-option w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 rounded-lg text-slate-500" data-user-id="">— Unassigned —</button>' +
            usersCache.filter(function(u) { return String(u.active) !== 'false'; }).map(function(u) {
              var uid = u.user_id || u.id || '';
              var name = u.name || u.email || uid;
              return '<button type="button" class="assign-option w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 rounded-lg flex items-center gap-2" data-user-id="' + esc(uid) + '" data-name="' + esc(name.toLowerCase()) + '">' +
                '<span class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">' + name.charAt(0).toUpperCase() + '</span>' +
                '<span class="truncate">' + esc(name) + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';

      return '<tr class="border-t border-slate-100 hover:bg-slate-50/60 transition-colors group">' +

        // Task name - editable
        '<td class="px-4 py-3" style="max-width:260px">' + titleCell + '</td>' +

        // Status - editable
        '<td class="px-4 py-3 whitespace-nowrap">' + statusCell + '</td>' +

        // Priority - editable
        '<td class="px-4 py-3 whitespace-nowrap">' + priorityCell + '</td>' +

        // Due date - not editable inline
        '<td class="px-4 py-3 text-xs whitespace-nowrap ' + (overdue ? 'text-red-500 font-bold' : 'text-slate-500') + '">' +
          (t.due_date
            ? fmtDate(t.due_date) + (overdue ? ' <i class="fas fa-exclamation-circle ml-0.5"></i>' : '')
            : '<span class="text-slate-300">—</span>') +
        '</td>' +

        // Assigned - editable
        '<td class="px-4 py-3 whitespace-nowrap">' + assignedCell + '</td>' +

        // Hours bar
        '<td class="px-4 py-3" style="min-width:120px">' +
          (hasHours ? hoursBar(t.actual_hours, t.estimated_hours) : '<span class="text-xs text-slate-300">—</span>') +
        '</td>' +

        // Project
        (showProject
          ? '<td class="px-4 py-3 whitespace-nowrap">' +
              (t.project_id
                ? '<span class="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-semibold">' + esc(projectName(t.project_id)) + '</span>'
                : '<span class="text-xs text-slate-300">—</span>') +
            '</td>'
          : '') +

        // Actions
        '<td class="px-4 py-3 whitespace-nowrap">' +
          '<div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity wv-action-cell">' +
            quickBtns +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    content.innerHTML =
      '<style>.icon-btn{width:1.75rem;height:1.75rem;border-radius:.5rem;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;transition:all .15s;border:none;background:transparent;cursor:pointer;}</style>' +
      '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-left">' +
            '<thead><tr class="bg-slate-50 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">' +
              '<th class="px-4 py-3">Task</th>' +
              '<th class="px-4 py-3">Status</th>' +
              '<th class="px-4 py-3">Priority</th>' +
              '<th class="px-4 py-3">Due</th>' +
              '<th class="px-4 py-3">Assigned</th>' +
              '<th class="px-4 py-3">Hours</th>' +
              (showProject ? '<th class="px-4 py-3">Project</th>' : '') +
              '<th class="px-4 py-3">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    // Bind inline editing events
    bindInlineEditing();
  }

  function bindInlineEditing() {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    // Title editing
    content.querySelectorAll('.editable-title').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var parent = this.closest('.group\\/title');
        this.classList.add('hidden');
        parent.querySelector('.edit-input').classList.remove('hidden');
        parent.querySelector('input').focus();
      });
    });

    content.querySelectorAll('.save-edit').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var input = this.closest('.edit-input').querySelector('input');
        var id = input.dataset.id;
        var field = input.dataset.field;
        var value = input.value.trim();
        
        if (!value) return;
        
        var updates = { id: id };
        updates[field] = value;
        
        quickUpdate(id, updates, 'Updated');
        
        // Update display
        var parent = this.closest('.group\\/title');
        parent.querySelector('.editable-title').textContent = value;
        parent.querySelector('.editable-title').classList.remove('hidden');
        this.closest('.edit-input').classList.add('hidden');
      });
    });

    content.querySelectorAll('.cancel-edit').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var parent = this.closest('.group\\/title');
        parent.querySelector('.editable-title').classList.remove('hidden');
        this.closest('.edit-input').classList.add('hidden');
      });
    });

    // Status editing
    content.querySelectorAll('.editable-status').forEach(function(el) {
      var display = el.querySelector('.status-display');
      var select = el.querySelector('.status-select');
      
      display.addEventListener('click', function(e) {
        e.stopPropagation();
        display.classList.add('hidden');
        select.classList.remove('hidden');
        select.focus();
      });
      
      select.addEventListener('change', function() {
        var id = this.dataset.id;
        var value = this.value;
        quickUpdate(id, { status: value }, 'Status updated');
        display.innerHTML = statusBadge(value);
        display.classList.remove('hidden');
        this.classList.add('hidden');
      });
      
      select.addEventListener('blur', function() {
        display.classList.remove('hidden');
        this.classList.add('hidden');
      });
    });

    // Priority editing
    content.querySelectorAll('.editable-priority').forEach(function(el) {
      var display = el.querySelector('.priority-display');
      var select = el.querySelector('.priority-select');
      
      display.addEventListener('click', function(e) {
        e.stopPropagation();
        display.classList.add('hidden');
        select.classList.remove('hidden');
        select.focus();
      });
      
      select.addEventListener('change', function() {
        var id = this.dataset.id;
        var value = this.value;
        quickUpdate(id, { priority: value }, 'Priority updated');
        display.innerHTML = priorityBadge(value);
        display.classList.remove('hidden');
        this.classList.add('hidden');
      });
      
      select.addEventListener('blur', function() {
        display.classList.remove('hidden');
        this.classList.add('hidden');
      });
    });

    // Assigned editing
    content.querySelectorAll('.editable-assigned').forEach(function(el) {
      var display = el.querySelector('.assigned-display');
      var select = el.querySelector('.assigned-select');
      
      display.addEventListener('click', function(e) {
        e.stopPropagation();
        display.classList.add('hidden');
        select.classList.remove('hidden');
        select.focus();
      });
      
      select.addEventListener('change', function() {
        var id = this.dataset.id;
        var value = this.value;
        var name = value ? userName(value) : '';
        
        quickUpdate(id, { assigned_to: value }, value ? 'Assigned to ' + name : 'Unassigned');
        
        // Update display
        if (value) {
          display.innerHTML = '<span class="inline-flex items-center gap-1.5 text-xs text-slate-600">' +
            '<span class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">' + userInitial(value) + '</span>' +
            '<span class="truncate" style="max-width:90px">' + esc(name) + '</span>' +
          '</span>';
        } else {
          display.innerHTML = '<span class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Assign</span>';
        }
        display.classList.remove('hidden');
        this.classList.add('hidden');
      });
      
      select.addEventListener('blur', function() {
        display.classList.remove('hidden');
        this.classList.add('hidden');
      });
    });
  }

  // ================================================================
  //  KANBAN VIEW
  // ================================================================
  function renderKanban(tasks) {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    var cols = STATUSES.map(function(status) {
      var colTasks = tasks.filter(function(t) { return t.status === status; });
      var cards = colTasks.map(function(t) {
        var overdue  = isOverdue(t);
        var hasHours = parseFloat(t.estimated_hours) > 0 || parseFloat(t.actual_hours) > 0;
        return '<div data-action="view" data-id="' + t.id + '" class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer transition-all">' +
          '<div class="flex items-start gap-2 mb-1.5">' +
            '<p class="text-sm font-semibold text-slate-900 leading-snug flex-1 line-clamp-2">' + esc(t.title) + '</p>' +
            priorityBadge(t.priority) +
          '</div>' +
          '<p class="text-[10px] text-slate-400 font-mono mb-2">' + esc(t.id) + '</p>' +
          (t.description ? '<p class="text-xs text-slate-400 mb-2 line-clamp-2">' + esc(t.description) + '</p>' : '') +
          (projectsInstalled() && t.project_id
            ? '<div class="mb-2"><span class="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-px rounded font-semibold">' + esc(projectName(t.project_id)) + '</span></div>'
            : '') +
          (hasHours ? '<div class="mb-2">' + hoursBar(t.actual_hours, t.estimated_hours) + '</div>' : '') +
          '<div class="flex items-center justify-between pt-2 border-t border-slate-100">' +
            '<span class="text-xs ' + (overdue ? 'text-red-500 font-bold' : 'text-slate-400') + '">' +
              (t.due_date ? '<i class="fas fa-calendar-alt mr-0.5 text-[10px]"></i>' + fmtDate(t.due_date) : '') +
            '</span>' +
            '<div class="flex items-center gap-1.5">' +
              (t.assigned_to
                ? '<span class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold" title="' + esc(userName(t.assigned_to)) + '">' + userInitial(t.assigned_to) + '</span>'
                : '') +
              '<button data-action="log-hours" data-id="' + t.id + '" class="kanban-act text-[10px] bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-500 px-1.5 py-px rounded-lg font-semibold transition-colors"><i class="fas fa-clock mr-0.5"></i>Log</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      return '<div class="flex-shrink-0 w-72">' +
        '<div class="flex items-center gap-2 mb-3">' +
          '<span class="w-2.5 h-2.5 rounded-full ' + (KANBAN_DOT[status] || 'bg-slate-400') + '"></span>' +
          '<span class="text-sm font-extrabold text-slate-700">' + status + '</span>' +
          '<span class="ml-auto text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">' + colTasks.length + '</span>' +
        '</div>' +
        '<div class="space-y-2 min-h-12">' +
          (cards || '<div class="text-xs text-slate-300 text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">No tasks</div>') +
        '</div>' +
      '</div>';
    }).join('');

    content.innerHTML = '<div class="flex gap-4 overflow-x-auto pb-4 kanban-scroll">' + cols + '</div>';

    // Fix stopPropagation for kanban action buttons
    content.querySelectorAll('.kanban-act').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); });
    });
  }


  // ================================================================
  //  TASK DETAIL MODAL
  // ================================================================
  function openTaskDetail(task) {
    if (!task) return;

    Promise.all([
      api('tasks/hours', { task_id: task.id }),
      api('tasks/notes', { task_id: task.id }).catch(function() { return { rows: [] }; }),
    ]).then(function(results) {
      var data     = results[0];
      var noteData = results[1];
      var logs     = data.rows   || [];
      var notes    = noteData.rows || [];
      var total    = data.total  || 0;
      var over     = isOverdue(task);

      // ── Hours logs ────────────────────────────────────────────
      var logsHtml = logs.length
        ? logs.slice().reverse().map(function(l) {
            var billableBadge = l.billable === 'true' || l.billable === true
              ? '<span class="text-[10px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-px rounded font-semibold ml-1">' +
                  '<i class="fas fa-dollar-sign text-[9px] mr-0.5"></i>Billable' +
                  (l.rate ? ' · ' + (l.pay_type === 'salary' ? 'Salary' : fmtMoney(l.rate) + (l.pay_type === 'per_hour' ? '/hr' : '/task')) : '') +
                '</span>'
              : '';
            return '<div class="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">' +
              '<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">' + userInitial(l.user_id) + '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center justify-between gap-2 mb-0.5">' +
                  '<span class="text-sm font-semibold text-slate-800 truncate">' + esc(userName(l.user_id)) + '</span>' +
                  '<div class="flex items-center gap-1 flex-shrink-0">' +
                    billableBadge +
                    '<span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">' + fmtHours(l.hours) + '</span>' +
                  '</div>' +
                '</div>' +
                (l.notes ? '<p class="text-xs text-slate-600">' + esc(l.notes) + '</p>' : '') +
                '<p class="text-[10px] text-slate-400 mt-0.5"><i class="fas fa-calendar-alt mr-1"></i>' + fmtDate(l.date) + '</p>' +
              '</div>' +
            '</div>';
          }).join('')
        : '<div class="py-8 text-center text-slate-400"><i class="fas fa-clock text-2xl mb-2 opacity-30 block"></i><p class="text-xs">No hours logged yet</p></div>';

      // ── Notes logs ────────────────────────────────────────────
      var notesHtml = notes.length
        ? notes.slice().reverse().map(function(n) {
            return '<div class="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">' +
              '<div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0">' + userInitial(n.user_id) + '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center justify-between gap-2 mb-1">' +
                  '<span class="text-sm font-semibold text-slate-800 truncate">' + esc(userName(n.user_id)) + '</span>' +
                  '<p class="text-[10px] text-slate-400 flex-shrink-0"><i class="fas fa-calendar-alt mr-1"></i>' + fmtDate(n.date) + '</p>' +
                '</div>' +
                '<p class="text-xs text-slate-700 leading-relaxed whitespace-pre-line">' + esc(n.note) + '</p>' +
              '</div>' +
            '</div>';
          }).join('')
        : '<div class="py-8 text-center text-slate-400"><i class="fas fa-sticky-note text-2xl mb-2 opacity-30 block"></i><p class="text-xs">No notes logged yet</p></div>';

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
            '</div>' +
            '<h2 class="text-lg font-extrabold text-slate-900 leading-snug">' + esc(task.title) + '</h2>' +
          '</div>' +
          '<button id="tm-close" class="flex-shrink-0 w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer text-base">✕</button>' +
        '</div>' +

        // Body — two columns
        '<div style="display:grid;grid-template-columns:1fr 280px">' +

          // Left: description, hours, notes
          '<div class="px-6 py-5 border-r border-slate-100 flex flex-col gap-5">' +

            (task.description
              ? '<div><p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2">Description</p>' +
                '<p class="text-sm text-slate-700 leading-relaxed">' + esc(task.description) + '</p></div>'
              : '') +

            (task.notes
              ? '<div><p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2">Notes</p>' +
                '<p class="text-sm text-slate-700 leading-relaxed whitespace-pre-line">' + esc(task.notes) + '</p></div>'
              : '') +

            // Hours section
            '<div>' +
              '<div class="flex items-center justify-between mb-3">' +
                '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Hours Logged</p>' +
                '<div class="flex items-center gap-2">' +
                  (total ? '<span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">' + fmtHours(total) + ' total</span>' : '') +
                  '<button id="td-log-btn" class="btn-primary text-xs py-1 px-3"><i class="fas fa-plus mr-1"></i>Log Hours</button>' +
                '</div>' +
              '</div>' +
              (parseFloat(task.estimated_hours) > 0
                ? '<div class="mb-3">' + hoursBar(task.actual_hours, task.estimated_hours) + '</div>'
                : '') +
              logsHtml +
            '</div>' +

            // Notes section
            '<div>' +
              '<div class="flex items-center justify-between mb-3">' +
                '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Activity Notes</p>' +
                '<button id="td-note-btn" class="btn-primary text-xs py-1 px-3" style="background:#7c3aed"><i class="fas fa-plus mr-1"></i>Log Note</button>' +
              '</div>' +
              notesHtml +
            '</div>' +

          '</div>' +

          // Right: metadata + actions
          '<div class="px-5 py-5 bg-slate-50/50">' +
            '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Details</p>' +

            meta('Assigned To', task.assigned_to
              ? '<span class="flex items-center gap-1.5"><span class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">' + userInitial(task.assigned_to) + '</span>' + esc(userName(task.assigned_to)) + '</span>'
              : '<span class="text-slate-300">Unassigned</span>') +
            meta('Due Date', task.due_date
              ? '<span class="' + (over ? 'text-red-500 font-bold' : '') + '">' + fmtDate(task.due_date) + (over ? ' <i class="fas fa-exclamation-circle ml-0.5"></i>' : '') + '</span>'
              : '<span class="text-slate-300">None</span>') +
            meta('Est. Hours', task.estimated_hours ? fmtHours(task.estimated_hours) : '<span class="text-slate-300">—</span>') +
            meta('Actual Hours', '<span class="text-blue-600 font-bold">' + fmtHours(task.actual_hours || 0) + '</span>') +
            (task.tags
              ? meta('Tags', task.tags.split(',').map(function(t) {
                  return '<span class="text-[10px] bg-white border border-slate-200 text-slate-600 px-1.5 py-px rounded">' + esc(t.trim()) + '</span>';
                }).join(' '))
              : '') +
            (projectsInstalled() && task.project_id
              ? meta('Project', '<span class="bg-purple-50 text-purple-700 px-1.5 py-px rounded font-semibold text-xs">' + esc(projectName(task.project_id)) + '</span>')
              : '') +
            meta('Created',  fmtDate(task.created_at) || '<span class="text-slate-300">—</span>') +
            meta('Updated',  fmtDate(task.updated_at) || '<span class="text-slate-300">—</span>') +

            '<div class="flex flex-col gap-2 mt-5">' +
              '<button id="td-edit-btn"   class="btn-primary w-full text-sm"><i class="fas fa-pencil mr-1.5 text-xs"></i>Edit Task</button>' +
              (isAdmin()
                ? '<button id="td-delete-btn" class="btn-secondary w-full text-sm text-red-500 hover:bg-red-50 hover:text-red-600"><i class="fas fa-trash mr-1.5 text-xs"></i>Delete</button>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>';

      showModal(html, '920px');

      document.getElementById('tm-close').addEventListener('click', closeModal);
      document.getElementById('td-log-btn').addEventListener('click', function() { closeModal(); openLogHoursModal(task); });
      document.getElementById('td-note-btn').addEventListener('click', function() { closeModal(); openLogNoteModal(task); });
      document.getElementById('td-edit-btn').addEventListener('click', function() { closeModal(); openTaskForm(task); });
      var db = document.getElementById('td-delete-btn');
      if (db) db.addEventListener('click', function() { closeModal(); openDeleteModal(task.id, task.title); });

    }).catch(function() {
      toast('Could not load task details', 'error');
    });
  }


  // ================================================================
  //  LOG HOURS MODAL  (with Billable option)
  // ================================================================
  function openLogHoursModal(task) {
    if (!task) return;
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    var dateStr = yyyy + '-' + mm + '-' + dd;

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-start justify-between">' +
        '<div>' +
          '<div class="flex items-center gap-2 mb-1">' +
            '<i class="fas fa-clock text-blue-500"></i>' +
            '<h3 class="font-extrabold text-slate-900">Log Hours</h3>' +
          '</div>' +
          '<p class="text-xs text-slate-400">' + esc(task.title) + ' <span class="font-mono">· ' + esc(task.id) + '</span></p>' +
        '</div>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="tm-status"></div>' +

        // Hours progress if estimated exists
        (parseFloat(task.estimated_hours) > 0
          ? '<div class="bg-blue-50 rounded-xl p-3 border border-blue-100">' +
              '<p class="text-xs text-blue-500 font-semibold mb-2">Current Progress</p>' +
              hoursBar(task.actual_hours, task.estimated_hours) +
            '</div>'
          : '') +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>' +
          '<input id="lh-date" class="field" type="date" value="' + today + '"></div>' +

          '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Hours Worked <span class="text-red-400">*</span></label>' +
          '<input id="lh-hours" class="field" type="number" step="0.25" min="0.25" max="24" placeholder="e.g. 2.5"></div>' +
        '</div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">What did you work on? <span class="text-slate-300 font-normal normal-case">(optional)</span></label>' +
        '<textarea id="lh-notes" class="field text-sm" rows="3" style="resize:none" placeholder="Describe what you worked on, what you accomplished, or any blockers…"></textarea></div>' +

        // ── Billable toggle ───────────────────────────────────────
        '<div class="border border-slate-200 rounded-xl p-4 bg-slate-50">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<div>' +
              '<p class="text-xs font-bold text-slate-700">Billable?</p>' +
              '<p class="text-[11px] text-slate-400">Mark this time entry as billable to a client</p>' +
            '</div>' +
            '<label class="relative inline-flex items-center cursor-pointer">' +
              '<input type="checkbox" id="lh-billable" class="sr-only peer">' +
              '<div class="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500 transition-colors"></div>' +
              '<div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>' +
            '</label>' +
          '</div>' +
          // Billable details — shown/hidden by JS
          '<div id="lh-billable-fields" style="display:none;margin-top:.75rem;padding-top:.75rem;border-top:1px solid #e2e8f0">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
              '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Pay Type</label>' +
              '<select id="lh-pay-type" class="field text-sm">' +
                '<option value="per_hour">Pay Per Hour</option>' +
                '<option value="salary">Salary</option>' +
                '<option value="per_task">Pay Per Task</option>' +
              '</select></div>' +
              '<div id="lh-rate-wrap"><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Rate / Amount</label>' +
              '<div class="relative">' +
                '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>' +
                '<input id="lh-rate" class="field text-sm pl-7" type="number" step="0.01" min="0" placeholder="0.00">' +
              '</div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:.75rem">' +
          '<button id="tm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="lh-submit" class="btn-primary flex-1"><i class="fas fa-clock text-xs mr-1"></i>Log Hours</button>' +
        '</div>' +
      '</div>';

    showModal(html, '520px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('lh-submit').addEventListener('click', function() { submitLogHours(task.id); });

    // Toggle billable fields
    document.getElementById('lh-billable').addEventListener('change', function() {
      document.getElementById('lh-billable-fields').style.display = this.checked ? 'block' : 'none';
    });
    // Hide rate field when pay type is salary
    document.getElementById('lh-pay-type').addEventListener('change', function() {
      document.getElementById('lh-rate-wrap').style.display = this.value === 'salary' ? 'none' : 'block';
    });

    setTimeout(function() { var el = document.getElementById('lh-hours'); if (el) el.focus(); }, 80);
  }

  function submitLogHours(taskId) {
    var hours = parseFloat(document.getElementById('lh-hours').value);
    if (!hours || hours <= 0) { modalStatus('Please enter a valid number of hours (e.g. 1.5)', false); return; }

    var billable = document.getElementById('lh-billable').checked;
    var payType  = document.getElementById('lh-pay-type').value;
    var rate     = payType === 'salary' ? '' : (document.getElementById('lh-rate').value || '');

    var btn = document.getElementById('lh-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i> Logging…'; }

    api('tasks/log-hours', {
      task_id:  taskId,
      user_id:  myUserId(),
      date:     document.getElementById('lh-date').value,
      hours:    hours,
      notes:    document.getElementById('lh-notes').value || '',
      billable: billable ? 'true' : 'false',
      pay_type: billable ? payType : '',
      rate:     billable ? rate : '',
    }).then(function() {
      // Update actual_hours in local cache immediately so stats bar updates right away
      var cached = tasksCache[taskId];
      if (cached) {
        cached.actual_hours = (parseFloat(cached.actual_hours) || 0) + hours;
        renderStats(Object.values(tasksCache));
      }
      modalStatus('Hours logged!', true);
      setTimeout(function() { closeModal(); loadData(); }, 700);
    }).catch(function(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-clock text-xs mr-1"></i>Log Hours'; }
    });
  }


  // ================================================================
  //  LOG NOTE MODAL
  // ================================================================
      // Replace openLogNoteModal function with this:
  function openLogNoteModal(task) {
    if (!task) return;
    
    // Fix: Use local date format YYYY-MM-DD for input value
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    var dateStr = yyyy + '-' + mm + '-' + dd; // "2026-02-26" format for input

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-start justify-between">' +
        '<div>' +
          '<div class="flex items-center gap-2 mb-1">' +
            '<i class="fas fa-sticky-note text-purple-500"></i>' +
            '<h3 class="font-extrabold text-slate-900">Log Note</h3>' +
          '</div>' +
          '<p class="text-xs text-slate-400">' + esc(task.title) + ' <span class="font-mono">· ' + esc(task.id) + '</span></p>' +
        '</div>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="tm-status"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>' +
        '<input id="ln-date" class="field" type="date" value="' + dateStr + '"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Note <span class="text-red-400">*</span></label>' +
        '<textarea id="ln-note" class="field text-sm" rows="5" style="resize:none" placeholder="Add a progress update, decision, blocker, or any relevant information…"></textarea></div>' +

        '<div style="display:flex;gap:.75rem">' +
          '<button id="tm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="ln-submit" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white border-none cursor-pointer transition-colors" style="background:#7c3aed">' +
            '<i class="fas fa-sticky-note text-xs"></i>Log Note' +
          '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '520px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('ln-submit').addEventListener('click', function() { submitLogNote(task.id); });
    setTimeout(function() { var el = document.getElementById('ln-note'); if (el) el.focus(); }, 80);
  }

  function submitLogNote(taskId) {
    var note = (document.getElementById('ln-note').value || '').trim();
    if (!note) { modalStatus('Please enter a note.', false); return; }

    var btn = document.getElementById('ln-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i> Saving…'; }

    api('tasks/log-note', {
      task_id: taskId,
      user_id: myUserId(),
      date:    document.getElementById('ln-date').value,
      note:    note,
    }).then(function() {
      modalStatus('Note saved!', true);
      setTimeout(function() { closeModal(); loadData(); }, 700);
    }).catch(function(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sticky-note text-xs mr-1"></i>Log Note'; }
    });
  }


  // ================================================================
  //  SEARCH
  // ================================================================
  function doSearch(q) {
    q = q.toLowerCase().trim();
    var all      = Object.values(tasksCache);
    var filtered = q ? all.filter(function(t) {
      return (t.id          || '').toLowerCase().includes(q) ||
             (t.title       || '').toLowerCase().includes(q) ||
             (t.description || '').toLowerCase().includes(q) ||
             (t.tags        || '').toLowerCase().includes(q) ||
             (t.notes       || '').toLowerCase().includes(q) ||
             userName(t.assigned_to).toLowerCase().includes(q);
    }) : all;
    renderStats(filtered);
    if (activeView === 'kanban') renderKanban(filtered);
    else renderList(filtered);
    var sub = document.getElementById('tasks-subtitle');
    if (sub) sub.textContent = filtered.length + (q ? ' of ' + all.length : '') + ' task' + (filtered.length !== 1 ? 's' : '');
  }


  // ================================================================
  //  QUICK STATUS UPDATE
  // ================================================================
    function quickUpdate(id, fields, msg) {
    var params = { id: id };
    Object.keys(fields).forEach(function(k) { params[k] = fields[k]; });
    api('tasks/update', params)
      .then(function() { 
        if (msg) toast(msg, 'success'); 
        // Update cache
        if (tasksCache[id]) {
          Object.keys(fields).forEach(function(k) {
            if (k !== 'id') tasksCache[id][k] = fields[k];
          });
        }
        renderStats(Object.values(tasksCache));
      })
      .catch(function(e) { toast(e.message, 'error'); });
  }


  // ================================================================
  //  USER SEARCH FIELD
  // ================================================================
  function userSearchField(fieldId, label, currentId) {
    var currentName = '';
    if (currentId) {
      var found = usersCache.find(function(u) { return u.user_id === currentId || u.id === currentId; });
      currentName = found ? (found.name || found.email || '') : currentId;
    }
    return '<div>' +
      '<label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">' + label + '</label>' +
      '<div class="relative">' +
        '<input id="' + fieldId + '-search" type="text" placeholder="Search name or email…" autocomplete="off" value="' + esc(currentName) + '" class="field text-sm">' +
        '<input type="hidden" id="' + fieldId + '" value="' + esc(currentId || '') + '">' +
        '<div id="' + fieldId + '-dd" class="hidden absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto" style="z-index:10001"></div>' +
      '</div>' +
    '</div>';
  }

  function bindUserSearch(fieldId) {
    var input = document.getElementById(fieldId + '-search');
    var dd    = document.getElementById(fieldId + '-dd');
    if (!input || !dd) return;
    function show() {
      var q = input.value.toLowerCase().trim();
      var m = usersCache.filter(function(u) {
        return String(u.active) !== 'false' &&
          ((u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
      }).slice(0, 8);
      dd.innerHTML = m.length
        ? m.map(function(u) {
            var n = u.name || u.email || '';
            return '<button type="button" class="wv-pick w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left" data-uid="' + esc(u.user_id || u.id || '') + '" data-name="' + esc(n) + '">' +
              '<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs flex-shrink-0">' + n.charAt(0).toUpperCase() + '</div>' +
              '<div><div class="text-sm font-semibold text-slate-900">' + esc(n) + '</div>' +
              (u.email ? '<div class="text-xs text-slate-400">' + esc(u.email) + '</div>' : '') + '</div></button>';
          }).join('')
        : '<div class="px-4 py-3 text-xs text-slate-400">No users found</div>';
      dd.classList.remove('hidden');
      dd.querySelectorAll('.wv-pick').forEach(function(b) {
        b.addEventListener('click', function() {
          input.value = this.dataset.name;
          document.getElementById(fieldId).value = this.dataset.uid;
          dd.classList.add('hidden');
        });
      });
    }
    input.addEventListener('input',  show);
    input.addEventListener('focus',  show);
    input.addEventListener('blur',   function() { setTimeout(function() { dd.classList.add('hidden'); }, 180); });
  }


  // ================================================================
  //  TASK FORM MODAL  (create & edit)
  // ================================================================
    function openTaskForm(task) {
    var isEdit   = !!task;
    var btnLabel = isEdit ? '<i class="fas fa-save text-xs mr-1"></i>Save Changes' : '<i class="fas fa-plus text-xs mr-1"></i>Create Task';
    function v(f) { return isEdit && task[f] != null ? esc(String(task[f])) : ''; }

    var statusOpts = STATUSES.map(function(s) {
      var sel = isEdit ? (task.status === s ? ' selected' : '') : (s === 'To Do' ? ' selected' : '');
      return '<option value="' + s + '"' + sel + '>' + s + '</option>';
    }).join('');
    var priorityOpts = PRIORITIES.map(function(p) {
      var sel = isEdit ? (task.priority === p ? ' selected' : '') : (p === 'Medium' ? ' selected' : '');
      return '<option value="' + p + '"' + sel + '>' + p + '</option>';
    }).join('');

    // Project field
    var projectField = '';
    if (projectsInstalled()) {
      if (projectsCache.length) {
        var opts = '<option value="">No Project</option>' + projectsCache.map(function(p) {
          var pid = p.id || p.project_id;
          return '<option value="' + esc(pid) + '"' + (isEdit && task.project_id === pid ? ' selected' : '') + '>' + esc(p.name || pid) + '</option>';
        }).join('');
        projectField = '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Project</label>' +
          '<select id="tf-project_id" class="field text-sm">' + opts + '</select></div>';
      } else {
        projectField = '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Project ID</label>' +
          '<input id="tf-project_id" class="field text-sm" type="text" placeholder="Project ID" value="' + v('project_id') + '"></div>';
      }
    }

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900">' + (isEdit ? 'Edit Task' : 'New Task') + '</h3>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div id="tm-status"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Title <span class="text-red-400">*</span></label>' +
        '<input id="tf-title" class="field" type="text" placeholder="Task title…" value="' + v('title') + '"></div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>' +
        '<textarea id="tf-description" class="field text-sm" rows="2" style="resize:none" placeholder="Brief description…">' + v('description') + '</textarea></div>' +

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

        // Billable toggle for new tasks
        '<div class="border border-slate-200 rounded-xl p-4 bg-slate-50">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<p class="text-xs font-bold text-slate-700">Billable by default?</p>' +
              '<p class="text-[11px] text-slate-400">New time entries will be marked as billable</p>' +
            '</div>' +
            '<label class="relative inline-flex items-center cursor-pointer">' +
              '<input type="checkbox" id="tf-billable" class="sr-only peer" ' + (isEdit && task.billable === 'true' ? 'checked' : '') + '>' +
              '<div class="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500 transition-colors"></div>' +
              '<div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>' +
        '<textarea id="tf-notes" class="field text-sm" rows="3" style="resize:none" placeholder="Progress updates, blockers, internal notes…">' + v('notes') + '</textarea></div>' +

        '<div style="display:flex;gap:.75rem;padding-top:.25rem">' +
          '<button id="tm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          (isEdit && isAdmin()
            ? '<button id="tm-delete" class="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-bold border border-red-200 transition-colors border-none cursor-pointer"><i class="fas fa-trash text-xs"></i></button>'
            : '') +
          '<button id="tm-submit" class="btn-primary flex-1">' + btnLabel + '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '640px');
    bindUserSearch('tf-assigned');

    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    if (isEdit && isAdmin()) {
      document.getElementById('tm-delete').addEventListener('click', function() { closeModal(); openDeleteModal(task.id, task.title); });
    }
    document.getElementById('tm-submit').addEventListener('click', function() { submitForm(isEdit ? task.id : null); });
    setTimeout(function() { var el = document.getElementById('tf-title'); if (el) el.focus(); }, 80);
  }

  // ================================================================
  //  DELETE MODAL
  // ================================================================
  function openDeleteModal(taskId, taskTitle) {
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-red-600">Delete Task</h3>' +
        '<button id="tm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5 flex flex-col gap-4">' +
        '<div class="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">' +
          '<i class="fas fa-exclamation-triangle text-red-400 mt-0.5 flex-shrink-0"></i>' +
          '<div>' +
            '<p class="text-sm font-bold text-red-700">This cannot be undone</p>' +
            '<p class="text-sm text-red-600 mt-0.5"><strong>' + esc(taskTitle) + '</strong> and all its hour logs will be permanently deleted.</p>' +
          '</div>' +
        '</div>' +
        '<div id="tm-status"></div>' +
        '<div style="display:flex;gap:.75rem">' +
          '<button id="tm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tm-confirm-delete" style="flex:1;display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.65rem 1.25rem;background:#dc2626;color:#fff;border:none;border-radius:.75rem;font-size:.875rem;font-weight:700;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'#b91c1c\'" onmouseout="this.style.background=\'#dc2626\'">' +
            '<i class="fas fa-trash text-xs"></i> Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '480px');
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('tm-confirm-delete').addEventListener('click', function() { submitDelete(taskId); });
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

    var params = {
      title:           title,
      description:     document.getElementById('tf-description').value    || '',
      status:          document.getElementById('tf-status').value         || 'To Do',
      priority:        document.getElementById('tf-priority').value       || 'Medium',
      assigned_to:     document.getElementById('tf-assigned').value       || '',
      due_date:        document.getElementById('tf-due_date').value       || '',
      estimated_hours: document.getElementById('tf-est').value            || '',
      tags:            document.getElementById('tf-tags').value           || '',
      notes:           document.getElementById('tf-notes').value          || '',
      billable:        document.getElementById('tf-billable').checked     ? 'true' : 'false',
    };

    var projEl = document.getElementById('tf-project_id');
    if (projEl) params.project_id = projEl.value || '';

    if (isEdit) {
      params.id = taskId;
    } else {
      try { params.created_by = window.WorkVolt.user().user_id || ''; } catch(e) {}
    }

    api(isEdit ? 'tasks/update' : 'tasks/create', params)
      .then(function() {
        modalStatus(isEdit ? 'Task updated!' : 'Task created!', true);
        setTimeout(function() { closeModal(); loadData(); }, 700);
      })
      .catch(function(e) {
        modalStatus(e.message, false);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = isEdit ? '<i class="fas fa-save text-xs mr-1"></i>Save Changes' : '<i class="fas fa-plus text-xs mr-1"></i>Create Task';
        }
      });
  }


  // ================================================================
  //  DELETE SUBMIT
  // ================================================================
  function submitDelete(taskId) {
    if (!taskId) { modalStatus('Task ID missing.', false); return; }
    var btn = document.getElementById('tm-confirm-delete');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Deleting…'; }

    api('tasks/delete', { id: taskId, task_id: taskId })
      .then(function() {
        modalStatus('Task deleted.', true);
        setTimeout(function() { closeModal(); loadData(); }, 700);
      })
      .catch(function(e) {
        modalStatus(e.message, false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-xs"></i> Delete Permanently'; }
      });
  }


  // ── Boot ──────────────────────────────────────────────────────
  var old = document.getElementById(MODAL_ID);
  if (old) old.innerHTML = '';
  render();
};
