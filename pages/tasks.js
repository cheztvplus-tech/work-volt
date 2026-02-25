window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['tasks'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var tasksCache  = {};  // keyed by `id` (GAS field name)
  var usersCache  = [];
  var activeView  = sessionStorage.getItem('tasks_view') || 'list';
  var filters     = { status: '', priority: '' };

  // ── These EXACTLY match the GAS Tasks_Config seeds ────────────
  var STATUSES   = ['To Do', 'In Progress', 'In Review', 'Done', 'Cancelled'];
  var PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

  var STATUS_COLORS = {
    'To Do':       'bg-slate-100 text-slate-600',
    'In Progress': 'bg-blue-100 text-blue-700',
    'In Review':   'bg-purple-100 text-purple-700',
    'Done':        'bg-green-100 text-green-700',
    'Cancelled':   'bg-red-100 text-red-600',
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

  function getRole() {
    try { return window.WorkVolt.user().role || 'SuperAdmin'; } catch(e) { return 'SuperAdmin'; }
  }
  function isAdmin() { return ['SuperAdmin','Admin'].includes(getRole()); }

  // ================================================================
  //  API  — thin wrapper over the GAS web app
  // ================================================================
  function api(path, params) {
    if (!savedUrl || !savedSecret) return Promise.reject(new Error('Google Sheet not connected'));
    var url = new URL(savedUrl);
    url.searchParams.set('path',  path);
    url.searchParams.set('token', savedSecret);
    if (params) {
      Object.keys(params).forEach(function(k) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '')
          url.searchParams.set(k, String(params[k]));
      });
    }
    return fetch(url.toString(), { cache: 'no-cache' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        return data;
      });
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
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u) { return u.user_id === uid || u.id === uid; });
    return u ? (u.name || u.email || uid) : uid;
  }
  function statusBadge(s) {
    var c = STATUS_COLORS[s] || 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + c + '">' + esc(s || '—') + '</span>';
  }
  function priorityBadge(p) {
    var c = PRIORITY_COLORS[p] || 'bg-slate-100 text-slate-500';
    var d = PRIORITY_DOT[p]   || 'bg-slate-400';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + c + '">' +
      '<span class="w-1.5 h-1.5 rounded-full ' + d + '"></span>' + esc(p || '—') + '</span>';
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

  function showModal(html) {
    var portal = getPortal();
    portal.innerHTML =
      '<div id="tm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem;">' +
        '<div id="tm-box" style="background:#fff;border-radius:1rem;box-shadow:0 25px 60px rgba(0,0,0,0.25);width:100%;max-width:620px;max-height:90vh;overflow-y:auto;position:relative;z-index:9999;">' +
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
    el.innerHTML =
      '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ' +
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

        // Header
        '<div class="bg-white border-b border-slate-200 px-6 md:px-8 py-5 flex items-center justify-between gap-4 flex-wrap">' +
          '<div>' +
            '<h1 class="text-xl font-extrabold text-slate-900">Tasks</h1>' +
            '<p class="text-slate-500 text-sm mt-0.5" id="tasks-count">Loading…</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<div class="flex items-center bg-slate-100 rounded-lg p-0.5">' +
              '<button id="btn-view-list" class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ' +
                (activeView === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700') + '">' +
                '<i class="fas fa-list mr-1"></i>List</button>' +
              '<button id="btn-view-kanban" class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ' +
                (activeView === 'kanban' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700') + '">' +
                '<i class="fas fa-columns mr-1"></i>Kanban</button>' +
            '</div>' +
            '<button id="btn-new-task" class="btn-primary"><i class="fas fa-plus text-sm"></i> New Task</button>' +
          '</div>' +
        '</div>' +

        // Filters
        '<div class="bg-white border-b border-slate-200 px-6 md:px-8 py-3 flex flex-wrap items-center gap-3">' +
          '<select id="filter-status" class="field text-xs py-1.5 w-36">' +
            '<option value="">All Statuses</option>' +
            STATUSES.map(function(s) {
              return '<option value="' + s + '"' + (filters.status === s ? ' selected' : '') + '>' + s + '</option>';
            }).join('') +
          '</select>' +
          '<select id="filter-priority" class="field text-xs py-1.5 w-36">' +
            '<option value="">All Priorities</option>' +
            PRIORITIES.map(function(p) {
              return '<option value="' + p + '"' + (filters.priority === p ? ' selected' : '') + '>' + p + '</option>';
            }).join('') +
          '</select>' +
          '<button id="btn-clear-filters" class="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">' +
            '<i class="fas fa-times mr-1"></i>Clear</button>' +
          '<div class="ml-auto">' +
            '<input id="task-search" type="text" placeholder="Search tasks…" class="field text-xs py-1.5 w-52">' +
          '</div>' +
        '</div>' +

        // Content
        '<div id="tasks-content" class="p-6 md:p-8">' +
          '<div class="flex items-center justify-center py-16 text-slate-400">' +
            '<i class="fas fa-circle-notch fa-spin text-2xl"></i>' +
          '</div>' +
        '</div>' +

      '</div>';

    // ── Event listeners ────────────────────────────────────────────
    container.querySelector('#btn-view-list').addEventListener('click', function() { setView('list'); });
    container.querySelector('#btn-view-kanban').addEventListener('click', function() { setView('kanban'); });
    container.querySelector('#btn-new-task').addEventListener('click', function() { openTaskForm(null); });
    container.querySelector('#btn-clear-filters').addEventListener('click', function() {
      filters = { status: '', priority: '' };
      render();
    });
    container.querySelector('#filter-status').addEventListener('change', function() {
      filters.status = this.value; loadData();
    });
    container.querySelector('#filter-priority').addEventListener('change', function() {
      filters.priority = this.value; loadData();
    });
    container.querySelector('#task-search').addEventListener('input', function() {
      doSearch(this.value);
    });

    // Delegate all row/card action clicks
    container.querySelector('#tasks-content').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      var action = btn.dataset.action;
      var id     = btn.dataset.id;        // GAS field is `id`
      var task   = tasksCache[id];
      var title  = (task && task.title) || btn.dataset.title || '';

      if (action === 'edit')     openTaskForm(task);
      if (action === 'delete')   openDeleteModal(id, title);
      // All status changes go through tasks/update with `id`
      if (action === 'complete') quickUpdate(id, { status: 'Done' },        'Task completed!');
      if (action === 'cancel')   quickUpdate(id, { status: 'Cancelled' },   'Task cancelled.');
      if (action === 'reopen')   quickUpdate(id, { status: 'To Do' },       'Task reopened.');
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
        '<div class="flex flex-col items-center justify-center py-20 text-slate-400">' +
          '<i class="fas fa-plug text-4xl mb-4"></i>' +
          '<p class="font-semibold text-slate-500 mt-2">Google Sheet not connected</p>' +
          '<p class="text-sm mt-1">Go to Settings → Connection to set up your GAS URL.</p>' +
        '</div>';
      var c = document.getElementById('tasks-count');
      if (c) c.textContent = '';
      return;
    }

    // Only send params GAS actually filters on
    var listParams = {};
    if (filters.status)   listParams.status   = filters.status;
    if (filters.priority) listParams.priority = filters.priority;

    Promise.all([
      api('tasks/list', listParams),
      api('users/list').catch(function() { return {}; }),
    ]).then(function(results) {
      // GAS tasks/list returns { rows, count }
      var rows = results[0].rows || [];

      // GAS users module may return { users } or { rows }
      usersCache = results[1].users || results[1].rows || [];

      // Index by `id` — the GAS field name
      tasksCache = {};
      rows.forEach(function(t) { if (t.id) tasksCache[t.id] = t; });

      var c = document.getElementById('tasks-count');
      if (c) c.textContent = rows.length + ' task' + (rows.length !== 1 ? 's' : '');

      if (activeView === 'kanban') renderKanban(rows);
      else renderList(rows);

    }).catch(function(e) {
      var el = document.getElementById('tasks-content');
      if (el) el.innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-red-400">' +
          '<i class="fas fa-exclamation-circle text-4xl mb-4"></i>' +
          '<p class="font-semibold">' + esc(e.message) + '</p>' +
        '</div>';
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
        '<div class="flex flex-col items-center justify-center py-20 text-slate-400">' +
          '<i class="fas fa-check-circle text-4xl mb-4"></i>' +
          '<p class="font-semibold text-slate-500">No tasks found</p>' +
          '<p class="text-sm mt-1">Click <strong>New Task</strong> to get started.</p>' +
        '</div>';
      return;
    }

    var rows = tasks.map(function(t) {
      var overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done' && t.status !== 'Cancelled';
      var isDone  = t.status === 'Done' || t.status === 'Cancelled';

      var actions =
        (!isDone
          ? '<button data-action="complete" data-id="' + t.id + '" title="Mark Done" ' +
              'class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">' +
              '<i class="fas fa-check text-xs"></i></button>' +
            '<button data-action="cancel" data-id="' + t.id + '" title="Cancel" ' +
              'class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">' +
              '<i class="fas fa-ban text-xs"></i></button>'
          : '<button data-action="reopen" data-id="' + t.id + '" title="Reopen" ' +
              'class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">' +
              '<i class="fas fa-undo text-xs"></i></button>') +
        '<button data-action="edit" data-id="' + t.id + '" title="Edit" ' +
          'class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">' +
          '<i class="fas fa-pencil text-xs"></i></button>' +
        (isAdmin()
          ? '<button data-action="delete" data-id="' + t.id + '" data-title="' + esc(t.title) + '" title="Delete" ' +
              'class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">' +
              '<i class="fas fa-trash text-xs"></i></button>'
          : '');

      return '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">' +
        '<td class="px-4 py-3 max-w-xs">' +
          '<div class="font-semibold text-slate-900 text-sm truncate">' + esc(t.title) + '</div>' +
          (t.description ? '<div class="text-xs text-slate-400 truncate mt-0.5">' + esc(t.description) + '</div>' : '') +
        '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">' + statusBadge(t.status) + '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">' + priorityBadge(t.priority) + '</td>' +
        '<td class="px-4 py-3 text-xs whitespace-nowrap ' + (overdue ? 'text-red-500 font-semibold' : 'text-slate-500') + '">' +
          (t.due_date ? fmtDate(t.due_date) + (overdue ? ' <i class="fas fa-exclamation-circle"></i>' : '') : '—') +
        '</td>' +
        '<td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">' + esc(userName(t.assigned_to)) + '</td>' +
        '<td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">' + esc(t.tags || '—') + '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap"><div class="flex items-center gap-1">' + actions + '</div></td>' +
      '</tr>';
    }).join('');

    content.innerHTML =
      '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-left">' +
            '<thead><tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">' +
              '<th class="px-4 py-3">Task</th>' +
              '<th class="px-4 py-3">Status</th>' +
              '<th class="px-4 py-3">Priority</th>' +
              '<th class="px-4 py-3">Due Date</th>' +
              '<th class="px-4 py-3">Assigned To</th>' +
              '<th class="px-4 py-3">Tags</th>' +
              '<th class="px-4 py-3">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }


  // ================================================================
  //  KANBAN VIEW
  // ================================================================
  function renderKanban(tasks) {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    var dotMap = {
      'To Do':       'bg-slate-400',
      'In Progress': 'bg-blue-500',
      'In Review':   'bg-purple-500',
      'Done':        'bg-green-500',
      'Cancelled':   'bg-red-400',
    };

    var cols = STATUSES.map(function(status) {
      var colTasks = tasks.filter(function(t) { return t.status === status; });
      var cards = colTasks.map(function(t) {
        var overdue = t.due_date && new Date(t.due_date) < new Date() && status !== 'Done' && status !== 'Cancelled';
        return '<div data-action="edit" data-id="' + t.id + '" ' +
          'class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md cursor-pointer transition-shadow">' +
          '<div class="flex items-start justify-between gap-2 mb-2">' +
            '<p class="text-sm font-semibold text-slate-900 leading-snug">' + esc(t.title) + '</p>' +
            priorityBadge(t.priority) +
          '</div>' +
          (t.description
            ? '<p class="text-xs text-slate-400 mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(t.description) + '</p>'
            : '') +
          '<div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">' +
            '<span class="text-xs ' + (overdue ? 'text-red-500 font-semibold' : 'text-slate-400') + '">' +
              (t.due_date ? '<i class="fas fa-calendar-alt mr-1"></i>' + fmtDate(t.due_date) : '') +
            '</span>' +
            (t.assigned_to
              ? '<span class="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">' + esc(userName(t.assigned_to)) + '</span>'
              : '') +
          '</div>' +
        '</div>';
      }).join('');

      return '<div class="flex-shrink-0 w-72">' +
        '<div class="flex items-center gap-2 mb-3">' +
          '<span class="w-2.5 h-2.5 rounded-full ' + (dotMap[status] || 'bg-slate-400') + '"></span>' +
          '<span class="text-sm font-bold text-slate-700">' + status + '</span>' +
          '<span class="ml-auto text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">' + colTasks.length + '</span>' +
        '</div>' +
        '<div class="space-y-2 min-h-16">' +
          (cards || '<div class="text-xs text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">No tasks</div>') +
        '</div>' +
      '</div>';
    }).join('');

    content.innerHTML = '<div class="flex gap-4 overflow-x-auto pb-4" style="scrollbar-width:thin">' + cols + '</div>';
  }


  // ================================================================
  //  SEARCH  (client-side, no extra API call)
  // ================================================================
  function doSearch(q) {
    q = q.toLowerCase().trim();
    var all = Object.values(tasksCache);
    var filtered = q ? all.filter(function(t) {
      return (t.title       || '').toLowerCase().includes(q) ||
             (t.description || '').toLowerCase().includes(q) ||
             (t.tags        || '').toLowerCase().includes(q) ||
             userName(t.assigned_to).toLowerCase().includes(q);
    }) : all;
    if (activeView === 'kanban') renderKanban(filtered);
    else renderList(filtered);
    var c = document.getElementById('tasks-count');
    if (c) c.textContent = filtered.length + (q ? ' of ' + all.length : '') + ' task' + (filtered.length !== 1 ? 's' : '');
  }


  // ================================================================
  //  QUICK STATUS UPDATE  (complete / cancel / reopen)
  //  GAS has no separate endpoints for these — all go through tasks/update
  //  with `id` as the identifier key.
  // ================================================================
  function quickUpdate(id, fields, successMsg) {
    var params = { id: id };
    Object.keys(fields).forEach(function(k) { params[k] = fields[k]; });
    api('tasks/update', params)
      .then(function() {
        toast(successMsg, 'success');
        loadData();
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
      '<label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">' + label + '</label>' +
      '<div class="relative">' +
        '<input id="' + fieldId + '-search" type="text" placeholder="Search by name or email…" autocomplete="off" ' +
          'value="' + esc(currentName) + '" class="field text-sm">' +
        '<input type="hidden" id="' + fieldId + '" value="' + esc(currentId || '') + '">' +
        '<div id="' + fieldId + '-dd" class="hidden absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto" style="z-index:10001"></div>' +
      '</div>' +
    '</div>';
  }

  function bindUserSearch(fieldId) {
    var input = document.getElementById(fieldId + '-search');
    var dd    = document.getElementById(fieldId + '-dd');
    if (!input || !dd) return;

    function showDropdown() {
      var q = input.value.toLowerCase().trim();
      var matches = usersCache.filter(function(u) {
        return String(u.active) !== 'false' &&
          ((u.name  || '').toLowerCase().includes(q) ||
           (u.email || '').toLowerCase().includes(q));
      }).slice(0, 8);

      dd.innerHTML = matches.length
        ? matches.map(function(u) {
            var name = u.name || u.email || '';
            return '<button type="button" class="wv-user-pick w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left" ' +
              'data-uid="' + esc(u.user_id || u.id || '') + '" data-name="' + esc(name) + '">' +
              '<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">' +
                name.charAt(0).toUpperCase() +
              '</div>' +
              '<div><div class="text-sm font-semibold text-slate-900">' + esc(name) + '</div>' +
              (u.email ? '<div class="text-xs text-slate-400">' + esc(u.email) + '</div>' : '') +
              '</div></button>';
          }).join('')
        : '<div class="px-4 py-3 text-xs text-slate-400">No users found</div>';

      dd.classList.remove('hidden');
      dd.querySelectorAll('.wv-user-pick').forEach(function(btn) {
        btn.addEventListener('click', function() {
          input.value = this.dataset.name;
          document.getElementById(fieldId).value = this.dataset.uid;
          dd.classList.add('hidden');
        });
      });
    }

    input.addEventListener('input',  showDropdown);
    input.addEventListener('focus',  showDropdown);
    input.addEventListener('blur', function() { setTimeout(function() { dd.classList.add('hidden'); }, 200); });
  }


  // ================================================================
  //  TASK FORM MODAL  (create & edit)
  // ================================================================
  function openTaskForm(task) {
    var isEdit   = !!task;
    var btnLabel = isEdit
      ? '<i class="fas fa-save text-xs"></i> Save Changes'
      : '<i class="fas fa-plus text-xs"></i> Create Task';

    function v(f) { return isEdit && task[f] != null ? esc(String(task[f])) : ''; }

    var statusOpts = STATUSES.map(function(s) {
      var sel = isEdit ? (task.status === s ? ' selected' : '') : (s === 'To Do' ? ' selected' : '');
      return '<option value="' + s + '"' + sel + '>' + s + '</option>';
    }).join('');

    var priorityOpts = PRIORITIES.map(function(p) {
      var sel = isEdit ? (task.priority === p ? ' selected' : '') : (p === 'Medium' ? ' selected' : '');
      return '<option value="' + p + '"' + sel + '>' + p + '</option>';
    }).join('');

    var html =
      '<div style="padding:1.5rem 1.5rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">' +
        '<h3 style="font-weight:700;font-size:1rem;color:#0f172a">' + (isEdit ? 'Edit Task' : 'New Task') + '</h3>' +
        '<button id="tm-close" style="width:2rem;height:2rem;border-radius:.5rem;border:none;background:transparent;cursor:pointer;color:#94a3b8;font-size:1rem">✕</button>' +
      '</div>' +
      '<div style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">' +
        '<div id="tm-status"></div>' +

        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Title <span style="color:red">*</span></label>' +
        '<input id="tf-title" class="field text-sm" type="text" placeholder="Task title" value="' + v('title') + '"></div>' +

        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>' +
        '<textarea id="tf-description" class="field text-sm" rows="3" style="resize:none" placeholder="Describe the task…">' + v('description') + '</textarea></div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</label>' +
          '<select id="tf-status" class="field text-sm">' + statusOpts + '</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Priority</label>' +
          '<select id="tf-priority" class="field text-sm">' + priorityOpts + '</select></div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">' +
          userSearchField('tf-assigned', 'Assigned To', isEdit ? task.assigned_to : '') +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Due Date</label>' +
          '<input id="tf-due_date" class="field text-sm" type="date" value="' + v('due_date') + '"></div>' +
        '</div>' +

        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tags</label>' +
        '<input id="tf-tags" class="field text-sm" type="text" placeholder="design, bug, frontend…" value="' + v('tags') + '"></div>' +

        '<div style="display:flex;gap:.75rem;padding-top:.5rem">' +
          '<button id="tm-cancel" class="btn-secondary" style="flex:1">Cancel</button>' +
          (isEdit && isAdmin()
            ? '<button id="tm-delete" class="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold border border-red-200 transition-colors"><i class="fas fa-trash text-xs"></i></button>'
            : '') +
          '<button id="tm-submit" class="btn-primary" style="flex:1">' + btnLabel + '</button>' +
        '</div>' +
      '</div>';

    showModal(html);
    bindUserSearch('tf-assigned');

    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);

    if (isEdit && isAdmin()) {
      document.getElementById('tm-delete').addEventListener('click', function() {
        closeModal();
        openDeleteModal(task.id, task.title);  // GAS uses `id`
      });
    }

    document.getElementById('tm-submit').addEventListener('click', function() {
      submitForm(isEdit ? task.id : null);     // GAS uses `id`
    });
  }


  // ================================================================
  //  DELETE MODAL
  // ================================================================
  function openDeleteModal(taskId, taskTitle) {
    var html =
      '<div style="padding:1.5rem 1.5rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">' +
        '<h3 style="font-weight:700;color:#b91c1c">Delete Task</h3>' +
        '<button id="tm-close" style="width:2rem;height:2rem;border-radius:.5rem;border:none;background:transparent;cursor:pointer;color:#94a3b8;font-size:1rem">✕</button>' +
      '</div>' +
      '<div style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">' +
        '<div style="display:flex;gap:.75rem;padding:1rem;background:#fef2f2;border:1px solid #fecaca;border-radius:.75rem">' +
          '<i class="fas fa-exclamation-triangle" style="color:#ef4444;margin-top:.1rem"></i>' +
          '<p style="font-size:.875rem;color:#b91c1c">Permanently delete <strong>' + esc(taskTitle) + '</strong>? This cannot be undone.</p>' +
        '</div>' +
        '<div id="tm-status"></div>' +
        '<div style="display:flex;gap:.75rem">' +
          '<button id="tm-cancel" class="btn-secondary" style="flex:1">Cancel</button>' +
          '<button id="tm-confirm-delete" style="flex:1;display:flex;align-items:center;justify-content:center;gap:.5rem;' +
            'padding:.65rem 1.25rem;background:#dc2626;color:#fff;border:none;border-radius:.625rem;font-size:.875rem;font-weight:600;cursor:pointer">' +
            '<i class="fas fa-trash text-sm"></i> Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>';

    showModal(html);
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('tm-confirm-delete').addEventListener('click', function() {
      submitDelete(taskId);
    });
  }


  // ================================================================
  //  FORM SUBMIT  (create & update)
  // ================================================================
  function submitForm(taskId) {
    var isEdit = !!taskId;
    var title  = (document.getElementById('tf-title').value || '').trim();
    if (!title) { modalStatus('Title is required.', false); return; }

    var btn = document.getElementById('tm-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Saving…'; }

    // Only the fields that exist in Tasks_Data sheet headers
    var params = {
      title:       title,
      description: document.getElementById('tf-description').value || '',
      status:      document.getElementById('tf-status').value      || 'To Do',
      priority:    document.getElementById('tf-priority').value    || 'Medium',
      assigned_to: document.getElementById('tf-assigned').value    || '',
      due_date:    document.getElementById('tf-due_date').value    || '',
      tags:        document.getElementById('tf-tags').value        || '',
    };

    if (isEdit) {
      params.id = taskId;  // GAS update expects `id`
    } else {
      var _u = null;
      try { _u = window.WorkVolt.user(); } catch(e) {}
      params.created_by = (_u && _u.user_id) ? _u.user_id : '';
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
          btn.innerHTML = isEdit
            ? '<i class="fas fa-save text-xs"></i> Save Changes'
            : '<i class="fas fa-plus text-xs"></i> Create Task';
        }
      });
  }


  // ================================================================
  //  DELETE SUBMIT
  // ================================================================
  function submitDelete(taskId) {
    if (!taskId) { modalStatus('Error: task ID is missing.', false); return; }
    var btn = document.getElementById('tm-confirm-delete');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Deleting…'; }

    api('tasks/delete', { id: taskId })  // GAS delete expects `id`
      .then(function() {
        modalStatus('Task deleted.', true);
        setTimeout(function() { closeModal(); loadData(); }, 700);
      })
      .catch(function(e) {
        modalStatus(e.message, false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-sm"></i> Delete Permanently'; }
      });
  }


  // ── Boot ──────────────────────────────────────────────────────
  var old = document.getElementById(MODAL_ID);
  if (old) old.innerHTML = '';

  render();
};
