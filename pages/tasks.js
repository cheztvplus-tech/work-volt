window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['tasks'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var tasksCache  = [];
  var usersCache  = [];   // for assign-by-name dropdowns
  // Persist view preference across navigation
  var activeView  = sessionStorage.getItem('tasks_view') || 'list';
  var filters     = { status: '', priority: '', assigned_to: '' };
  var editingTask = null;
  // Read role lazily so window.WorkVolt is guaranteed to exist
  function currentRole() {
    return (window.WorkVolt && window.WorkVolt.user && window.WorkVolt.user() && window.WorkVolt.user().role) || 'SuperAdmin';
  }

  var STATUSES   = ['Todo', 'In Progress', 'In Review', 'Done', 'Cancelled'];
  var PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

  var STATUS_COLORS = {
    'Todo':        'bg-slate-100 text-slate-600',
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
    'Low':    'bg-slate-400',
    'Medium': 'bg-amber-400',
    'High':   'bg-orange-500',
    'Urgent': 'bg-red-500',
  };

  var ADMIN_ROLES = ['SuperAdmin', 'Admin'];
  function isAdmin() { return ADMIN_ROLES.includes(currentRole()); }


  // ================================================================
  //  API HELPER
  // ================================================================
  async function api(path, params) {
    var url = new URL(savedUrl);
    url.searchParams.set('path',  path);
    url.searchParams.set('token', savedSecret);
    if (params) {
      Object.entries(params).forEach(function(kv) {
        if (kv[1] !== undefined && kv[1] !== null && kv[1] !== '') {
          url.searchParams.set(kv[0], String(kv[1]));
        }
      });
    }
    var res  = await fetch(url.toString(), { cache: 'no-cache' });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }


  // ================================================================
  //  BADGES & HELPERS
  // ================================================================
  function statusBadge(status) {
    var cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + cls + '">' + (status || '—') + '</span>';
  }

  function priorityBadge(priority) {
    var cls = PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-500';
    var dot = PRIORITY_DOT[priority]    || 'bg-slate-400';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + cls + '"><span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + (priority || '—') + '</span>';
  }

  // Look up a user's display name from the users cache
  function userName(userId) {
    if (!userId) return '—';
    var u = usersCache.find(function(u) { return u.user_id === userId; });
    return u ? (u.name || u.email) : userId.substring(0, 8) + '…';
  }

  function setModalContent(html) {
    document.getElementById('task-modal').innerHTML = html;
    document.getElementById('task-modal-backdrop').classList.remove('hidden');
  }

  function setFormStatus(msg, ok) {
    var el = document.getElementById('task-form-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = (
      '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3 ' +
      (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
        '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i>' +
        '<span>' + msg + '</span>' +
      '</div>'
    );
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch(e) { return d; }
  }


  // ================================================================
  //  MAIN RENDER
  // ================================================================
  function render() {
    var listActive   = activeView === 'list';
    var kanbanActive = activeView === 'kanban';

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">

        <!-- Header -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-8 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-xl font-extrabold text-slate-900">Tasks</h1>
            <p class="text-slate-500 text-sm mt-0.5" id="tasks-count">Loading…</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button onclick="tasksSetView('list')" id="view-list-btn"
                class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${listActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
                <i class="fas fa-list mr-1"></i>List
              </button>
              <button onclick="tasksSetView('kanban')" id="view-kanban-btn"
                class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${kanbanActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
                <i class="fas fa-columns mr-1"></i>Kanban
              </button>
            </div>
            <button onclick="tasksOpenAdd()" class="btn-primary">
              <i class="fas fa-plus text-sm"></i> New Task
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-8 py-3 flex flex-wrap items-center gap-3">
          <select id="filter-status" onchange="tasksApplyFilter()" class="field text-xs py-1.5 w-36">
            <option value="">All Statuses</option>
            ${STATUSES.map(function(s) { return '<option value="' + s + '"' + (filters.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')}
          </select>
          <select id="filter-priority" onchange="tasksApplyFilter()" class="field text-xs py-1.5 w-36">
            <option value="">All Priorities</option>
            ${PRIORITIES.map(function(p) { return '<option value="' + p + '"' + (filters.priority === p ? ' selected' : '') + '>' + p + '</option>'; }).join('')}
          </select>
          <button onclick="tasksClearFilters()" class="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <i class="fas fa-times mr-1"></i>Clear
          </button>
          <div class="ml-auto">
            <input id="task-search" type="text" placeholder="Search tasks…" oninput="tasksSearch()" class="field text-xs py-1.5 w-52">
          </div>
        </div>

        <!-- Content -->
        <div id="tasks-content" class="p-6 md:p-8">
          <div class="flex items-center justify-center py-16 text-slate-400">
            <i class="fas fa-circle-notch fa-spin text-2xl"></i>
          </div>
        </div>

        <!-- Modal -->
        <div id="task-modal-backdrop" class="hidden fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onclick="tasksBackdropClick(event)">
          <div id="task-modal" class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto z-50"></div>
        </div>

      </div>
    `;

    loadData();
  }


  // ================================================================
  //  LOAD DATA — tasks + users in parallel
  // ================================================================
  async function loadData() {
    if (!savedUrl || !savedSecret) {
      document.getElementById('tasks-content').innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-slate-400">' +
          '<i class="fas fa-plug text-4xl mb-4"></i>' +
          '<p class="font-semibold text-slate-500">Google Sheet not connected</p>' +
          '<p class="text-sm mt-1">Go to Settings → Connection to set up your GAS URL.</p>' +
        '</div>';
      var c = document.getElementById('tasks-count');
      if (c) c.textContent = '';
      return;
    }

    try {
      // Load tasks and users in parallel
      var results = await Promise.all([
        api('tasks/list', {
          status:      filters.status      || undefined,
          priority:    filters.priority    || undefined,
          assigned_to: filters.assigned_to || undefined,
        }),
        api('users/list').catch(function() { return { rows: [] }; }),
      ]);

      tasksCache = results[0].rows || [];
      usersCache = results[1].rows || [];

      var countEl = document.getElementById('tasks-count');
      if (countEl) countEl.textContent = tasksCache.length + ' task' + (tasksCache.length !== 1 ? 's' : '');

      if (activeView === 'kanban') {
        renderKanban(tasksCache);
      } else {
        renderList(tasksCache);
      }
    } catch(e) {
      document.getElementById('tasks-content').innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-red-400">' +
          '<i class="fas fa-exclamation-circle text-4xl mb-4"></i>' +
          '<p class="font-semibold">' + e.message + '</p>' +
        '</div>';
    }
  }


  // ================================================================
  //  LIST VIEW
  // ================================================================
  function renderList(tasks) {
    var content = document.getElementById('tasks-content');
    if (!tasks.length) {
      content.innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-slate-400">' +
          '<i class="fas fa-check-circle text-4xl mb-4"></i>' +
          '<p class="font-semibold text-slate-500">No tasks found</p>' +
          '<p class="text-sm mt-1">Create your first task to get started.</p>' +
        '</div>';
      return;
    }

    var rows = tasks.map(function(t) {
      var due     = t.due_date ? formatDate(t.due_date) : '—';
      var overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done' && t.status !== 'Cancelled';
      var dueClass = overdue ? 'text-red-500 font-semibold' : 'text-slate-500';

      // Action buttons — all users can complete/reopen/edit/cancel; only admins can delete
      var actionBtns = '';

      if (t.status !== 'Done' && t.status !== 'Cancelled') {
        actionBtns += '<button onclick="tasksQuickComplete(\'' + t.task_id + '\')" title="Mark complete" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"><i class="fas fa-check text-xs"></i></button>';
        actionBtns += '<button onclick="tasksQuickCancel(\'' + t.task_id + '\')" title="Cancel task" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"><i class="fas fa-ban text-xs"></i></button>';
      } else {
        actionBtns += '<button onclick="tasksQuickReopen(\'' + t.task_id + '\')" title="Reopen" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-undo text-xs"></i></button>';
      }

      actionBtns += '<button onclick="tasksOpenEdit(\'' + t.task_id + '\')" title="Edit" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-pencil text-xs"></i></button>';

      if (isAdmin()) {
        actionBtns += '<button onclick="tasksConfirmDelete(\'' + t.task_id + '\',\'' + escHtml(t.title).replace(/'/g, '') + '\')" title="Delete" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>';
      }

      return (
        '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">' +
          // Title cell — clicking opens edit
          '<td class="px-4 py-3 max-w-xs cursor-pointer" onclick="tasksOpenEdit(\'' + t.task_id + '\')">' +
            '<div class="font-semibold text-slate-900 text-sm truncate">' + escHtml(t.title) + '</div>' +
            (t.description ? '<div class="text-xs text-slate-400 truncate mt-0.5">' + escHtml(t.description) + '</div>' : '') +
          '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' + statusBadge(t.status) + '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' + priorityBadge(t.priority) + '</td>' +
          '<td class="px-4 py-3 text-xs ' + dueClass + ' whitespace-nowrap">' +
            due + (overdue ? ' <i class="fas fa-exclamation-circle ml-0.5"></i>' : '') +
          '</td>' +
          '<td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">' + escHtml(userName(t.assigned_to)) + '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            (String(t.billable) === 'true'
              ? '<span class="text-xs text-green-600 font-semibold"><i class="fas fa-dollar-sign mr-0.5"></i>Billable</span>'
              : '<span class="text-xs text-slate-400">—</span>') +
          '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            '<div class="flex items-center gap-1">' + actionBtns + '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    content.innerHTML = (
      '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-left">' +
            '<thead><tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">' +
              '<th class="px-4 py-3">Task</th>' +
              '<th class="px-4 py-3">Status</th>' +
              '<th class="px-4 py-3">Priority</th>' +
              '<th class="px-4 py-3">Due Date</th>' +
              '<th class="px-4 py-3">Assigned To</th>' +
              '<th class="px-4 py-3">Billing</th>' +
              '<th class="px-4 py-3">Actions</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>'
    );
  }


  // ================================================================
  //  KANBAN VIEW
  // ================================================================
  function renderKanban(tasks) {
    var content = document.getElementById('tasks-content');
    var dotMap = {
      'Todo': 'bg-slate-400', 'In Progress': 'bg-blue-500',
      'In Review': 'bg-purple-500', 'Done': 'bg-green-500', 'Cancelled': 'bg-red-400',
    };

    var cols = STATUSES.map(function(status) {
      var colTasks = tasks.filter(function(t) { return t.status === status; });

      var cards = colTasks.map(function(t) {
        var overdue = t.due_date && new Date(t.due_date) < new Date() && status !== 'Done' && status !== 'Cancelled';
        var assigneeName = userName(t.assigned_to);
        return (
          '<div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm card-hover cursor-pointer" onclick="tasksOpenEdit(\'' + t.task_id + '\')">' +
            '<div class="flex items-start justify-between gap-2 mb-2">' +
              '<p class="text-sm font-semibold text-slate-900 leading-snug">' + escHtml(t.title) + '</p>' +
              priorityBadge(t.priority) +
            '</div>' +
            (t.description ? '<p class="text-xs text-slate-400 mb-2 line-clamp-2">' + escHtml(t.description) + '</p>' : '') +
            '<div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">' +
              '<div class="flex items-center gap-2">' +
                (t.due_date ? '<span class="text-xs ' + (overdue ? 'text-red-500 font-semibold' : 'text-slate-400') + '"><i class="fas fa-calendar-alt mr-1"></i>' + formatDate(t.due_date) + '</span>' : '') +
              '</div>' +
              '<div class="flex items-center gap-1.5">' +
                (t.assigned_to !== '' ? '<span class="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">' + escHtml(assigneeName) + '</span>' : '') +
                (String(t.billable) === 'true' ? '<span class="text-xs text-green-600"><i class="fas fa-dollar-sign"></i></span>' : '') +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="flex-shrink-0 w-72">' +
          '<div class="flex items-center gap-2 mb-3">' +
            '<span class="w-2.5 h-2.5 rounded-full ' + (dotMap[status] || 'bg-slate-400') + '"></span>' +
            '<span class="text-sm font-bold text-slate-700">' + status + '</span>' +
            '<span class="ml-auto text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">' + colTasks.length + '</span>' +
          '</div>' +
          '<div class="space-y-2 min-h-16">' +
            (cards || '<div class="text-xs text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">No tasks</div>') +
          '</div>' +
        '</div>'
      );
    }).join('');

    content.innerHTML = '<div class="flex gap-4 overflow-x-auto kanban-scroll pb-4">' + cols + '</div>';
  }


  // ================================================================
  //  USER SEARCH DROPDOWN (for Assigned To field)
  // ================================================================
  function renderUserSearchField(fieldId, labelText, currentUserId) {
    var currentName = currentUserId ? userName(currentUserId) : '';
    return (
      '<div>' +
        '<label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">' + labelText + '</label>' +
        '<div class="relative">' +
          '<input id="' + fieldId + '-search" type="text" placeholder="Search by name or email…" autocomplete="off"' +
            ' value="' + escHtml(currentName) + '"' +
            ' oninput="tasksUserSearchInput(\'' + fieldId + '\')"' +
            ' onfocus="tasksUserSearchInput(\'' + fieldId + '\')"' +
            ' class="field text-sm">' +
          '<input type="hidden" id="' + fieldId + '" value="' + escHtml(currentUserId || '') + '">' +
          '<div id="' + fieldId + '-dropdown" class="hidden absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto thin-scroll"></div>' +
        '</div>' +
      '</div>'
    );
  }

  window.tasksUserSearchInput = function(fieldId) {
    var q   = (document.getElementById(fieldId + '-search')?.value || '').toLowerCase().trim();
    var dd  = document.getElementById(fieldId + '-dropdown');
    if (!dd) return;

    var matches = usersCache.filter(function(u) {
      return String(u.active) !== 'false' && (
        (u.name  || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }).slice(0, 8);

    if (!matches.length) {
      dd.innerHTML = '<div class="px-4 py-3 text-xs text-slate-400">No users found</div>';
      dd.classList.remove('hidden');
      return;
    }

    dd.innerHTML = matches.map(function(u) {
      var initials = u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase();
      var display  = u.name || u.email;
      return (
        '<button type="button" onclick="tasksSelectUser(\'' + fieldId + '\',\'' + u.user_id + '\',\'' + escHtml(display).replace(/'/g, '') + '\')" ' +
          'class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">' +
          '<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs flex-shrink-0">' + initials + '</div>' +
          '<div>' +
            '<div class="text-sm font-semibold text-slate-900">' + escHtml(display) + '</div>' +
            (u.name ? '<div class="text-xs text-slate-400">' + escHtml(u.email) + '</div>' : '') +
          '</div>' +
        '</button>'
      );
    }).join('');

    dd.classList.remove('hidden');
  };

  window.tasksSelectUser = function(fieldId, userId, displayName) {
    var searchEl = document.getElementById(fieldId + '-search');
    var hiddenEl = document.getElementById(fieldId);
    var dd       = document.getElementById(fieldId + '-dropdown');
    if (searchEl) searchEl.value = displayName;
    if (hiddenEl) hiddenEl.value = userId;
    if (dd)       dd.classList.add('hidden');
  };

  // Close user dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    ['tf-assigned_to'].forEach(function(fieldId) {
      var wrap = document.getElementById(fieldId + '-search');
      var dd   = document.getElementById(fieldId + '-dropdown');
      if (dd && wrap && !wrap.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.add('hidden');
      }
    });
  });


  // ================================================================
  //  TASK FORM MODAL
  // ================================================================
  function renderTaskForm(task) {
    var isEdit   = !!task;
    var title    = isEdit ? 'Edit Task' : 'New Task';
    var btnLabel = isEdit ? '<i class="fas fa-save text-sm"></i> Save Changes' : '<i class="fas fa-plus text-sm"></i> Create Task';
    var val      = function(f) { return isEdit && task[f] != null ? String(task[f]).replace(/"/g, '&quot;') : ''; };

    var statusOpts = STATUSES.map(function(s) {
      var sel = isEdit ? (task.status === s) : (s === 'Todo');
      return '<option value="' + s + '"' + (sel ? ' selected' : '') + '>' + s + '</option>';
    }).join('');

    var priorityOpts = PRIORITIES.map(function(p) {
      var sel = isEdit ? (task.priority === p) : (p === 'Medium');
      return '<option value="' + p + '"' + (sel ? ' selected' : '') + '>' + p + '</option>';
    }).join('');

    var billableChecked = isEdit ? String(task.billable) === 'true' : false;
    var paidChecked     = isEdit ? String(task.paid)     === 'true' : false;

    return (
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900">' + title + '</h3>' +
        '<button onclick="tasksCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div id="task-form-status"></div>' +

        // Title
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Title <span class="text-red-500">*</span></label>' +
        '<input id="tf-title" type="text" placeholder="Task title" value="' + val('title') + '" class="field text-sm"></div>' +

        // Description
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>' +
        '<textarea id="tf-description" rows="3" placeholder="Describe the task…" class="field text-sm resize-none">' + (isEdit ? escHtml(task.description || '') : '') + '</textarea></div>' +

        // Status + Priority
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</label>' +
          '<select id="tf-status" class="field text-sm">' + statusOpts + '</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Priority</label>' +
          '<select id="tf-priority" class="field text-sm">' + priorityOpts + '</select></div>' +
        '</div>' +

        // Assigned To (user search) + Due Date
        '<div class="grid grid-cols-2 gap-3">' +
          renderUserSearchField('tf-assigned_to', 'Assigned To', val('assigned_to')) +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Due Date</label>' +
          '<input id="tf-due_date" type="date" value="' + val('due_date') + '" class="field text-sm"></div>' +
        '</div>' +

        // Project ID + Tags
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Project ID</label>' +
          '<input id="tf-project_id" type="text" placeholder="Project UUID" value="' + val('project_id') + '" class="field text-sm"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tags</label>' +
          '<input id="tf-tags" type="text" placeholder="design, frontend, bug" value="' + val('tags') + '" class="field text-sm"></div>' +
        '</div>' +

        // Hours
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Estimated Hours</label>' +
          '<input id="tf-estimated_hours" type="number" placeholder="0.0" step="0.5" value="' + val('estimated_hours') + '" class="field text-sm"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Actual Hours</label>' +
          '<input id="tf-actual_hours" type="number" placeholder="0.0" step="0.5" value="' + val('actual_hours') + '" class="field text-sm"></div>' +
        '</div>' +

        // Pay Per Task + Billable + Paid
        '<div class="grid grid-cols-3 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Pay Per Task ($)</label>' +
          '<input id="tf-pay_per_task" type="number" placeholder="0.00" step="0.01" value="' + val('pay_per_task') + '" class="field text-sm"></div>' +
          '<div class="flex flex-col justify-end pb-1">' +
            '<label class="flex items-center gap-2 cursor-pointer">' +
              '<input id="tf-billable" type="checkbox" class="w-4 h-4 rounded accent-blue-600"' + (billableChecked ? ' checked' : '') + '>' +
              '<span class="text-sm font-medium text-slate-700">Billable</span>' +
            '</label>' +
          '</div>' +
          (isEdit
            ? '<div class="flex flex-col justify-end pb-1"><label class="flex items-center gap-2 cursor-pointer"><input id="tf-paid" type="checkbox" class="w-4 h-4 rounded accent-green-600"' + (paidChecked ? ' checked' : '') + '><span class="text-sm font-medium text-slate-700">Paid</span></label></div>'
            : '<div></div>') +
        '</div>' +

        // Notes
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Notes</label>' +
        '<textarea id="tf-notes" rows="2" placeholder="Internal notes…" class="field text-sm resize-none">' + (isEdit ? escHtml(task.notes || '') : '') + '</textarea></div>' +

        // Actions — admins get Delete button in edit mode
        '<div class="flex gap-3 pt-2">' +
          '<button onclick="tasksCloseModal()" class="btn-secondary flex-1">Cancel</button>' +
          (isEdit && isAdmin()
            ? '<button onclick="tasksConfirmDelete(\'' + task.task_id + '\',\'' + escHtml(task.title).replace(/'/g,'') + '\')" class="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold border border-red-200 transition-colors"><i class="fas fa-trash text-xs"></i></button>'
            : '') +
          '<button onclick="tasksSubmitForm(\'' + (isEdit ? task.task_id : '') + '\')" id="task-form-btn" class="btn-primary flex-1">' + btnLabel + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderDeleteModal(taskId, taskTitle) {
    return (
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-red-700">Delete Task</h3>' +
        '<button onclick="tasksCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div class="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">' +
          '<i class="fas fa-exclamation-triangle text-red-500 mt-0.5"></i>' +
          '<p class="text-sm text-red-700">You are about to permanently delete <strong>' + escHtml(taskTitle) + '</strong>. This cannot be undone.</p>' +
        '</div>' +
        '<div id="task-form-status"></div>' +
        '<div class="flex gap-3">' +
          '<button onclick="tasksCloseModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button onclick="tasksSubmitDelete(\'' + taskId + '\')" id="task-form-btn" ' +
            'class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">' +
            '<i class="fas fa-trash text-sm"></i> Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }


  // ================================================================
  //  TASK ACTIONS
  // ================================================================
  window.tasksSetView = function(view) {
    activeView = view;
    sessionStorage.setItem('tasks_view', view); // persist across navigation
    render();
  };

  window.tasksApplyFilter = function() {
    filters.status   = document.getElementById('filter-status')?.value   || '';
    filters.priority = document.getElementById('filter-priority')?.value || '';
    loadData();
  };

  window.tasksClearFilters = function() {
    filters = { status: '', priority: '', assigned_to: '' };
    render();
  };

  window.tasksSearch = function() {
    var q = (document.getElementById('task-search')?.value || '').toLowerCase().trim();
    if (!q) { renderList(tasksCache); return; }
    var filtered = tasksCache.filter(function(t) {
      return (t.title       || '').toLowerCase().includes(q) ||
             (t.description || '').toLowerCase().includes(q) ||
             (t.tags        || '').toLowerCase().includes(q) ||
             userName(t.assigned_to).toLowerCase().includes(q);
    });
    if (activeView === 'kanban') { renderKanban(filtered); } else { renderList(filtered); }
    var countEl = document.getElementById('tasks-count');
    if (countEl) countEl.textContent = filtered.length + ' of ' + tasksCache.length + ' tasks';
  };

  window.tasksBackdropClick = function(e) {
    if (e.target === document.getElementById('task-modal-backdrop')) window.tasksCloseModal();
  };

  window.tasksOpenAdd = function() {
    editingTask = null;
    setModalContent(renderTaskForm(null));
  };

  window.tasksOpenEdit = function(taskId) {
    editingTask = tasksCache.find(function(t) { return t.task_id === taskId; }) || null;
    if (!editingTask) return;
    setModalContent(renderTaskForm(editingTask));
  };

  window.tasksCloseModal = function() {
    var backdrop = document.getElementById('task-modal-backdrop');
    var modal    = document.getElementById('task-modal');
    if (backdrop) backdrop.classList.add('hidden');
    if (modal)    modal.innerHTML = '';
    editingTask = null;
  };

  window.tasksSubmitForm = async function(taskId) {
    var btn    = document.getElementById('task-form-btn');
    var isEdit = !!(taskId);
    var title  = (document.getElementById('tf-title')?.value || '').trim();
    if (!title) return setFormStatus('Title is required.', false);

    var assignedTo = (document.getElementById('tf-assigned_to')?.value || '').trim();

    var params = {
      title:           title,
      description:     document.getElementById('tf-description')?.value     || '',
      status:          document.getElementById('tf-status')?.value          || 'Todo',
      priority:        document.getElementById('tf-priority')?.value        || 'Medium',
      assigned_to:     assignedTo,
      due_date:        document.getElementById('tf-due_date')?.value        || '',
      project_id:      (document.getElementById('tf-project_id')?.value     || '').trim(),
      tags:            (document.getElementById('tf-tags')?.value           || '').trim(),
      estimated_hours: document.getElementById('tf-estimated_hours')?.value || '',
      actual_hours:    document.getElementById('tf-actual_hours')?.value    || '',
      pay_per_task:    document.getElementById('tf-pay_per_task')?.value    || '',
      billable:        document.getElementById('tf-billable')?.checked ? 'true' : 'false',
      notes:           document.getElementById('tf-notes')?.value           || '',
    };

    if (isEdit) {
      params.task_id = taskId;
      var paidEl = document.getElementById('tf-paid');
      if (paidEl) params.paid = paidEl.checked ? 'true' : 'false';
    } else {
      var user = window.WorkVolt && window.WorkVolt.user && window.WorkVolt.user();
      params.created_by = (user && user.user_id) || 'system';
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }

    try {
      await api(isEdit ? 'tasks/update' : 'tasks/create', params);
      setFormStatus(isEdit ? 'Task updated.' : 'Task created.', true);
      setTimeout(function() { window.tasksCloseModal(); loadData(); }, 700);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isEdit ? '<i class="fas fa-save text-sm"></i> Save Changes' : '<i class="fas fa-plus text-sm"></i> Create Task';
      }
    }
  };

  window.tasksQuickComplete = async function(taskId) {
    try {
      await api('tasks/complete', { task_id: taskId });
      window.WorkVolt?.toast('Task marked as done!', 'success');
      loadData();
    } catch(e) {
      window.WorkVolt?.toast(e.message, 'error');
    }
  };

  window.tasksQuickCancel = async function(taskId) {
    try {
      await api('tasks/update', { task_id: taskId, status: 'Cancelled' });
      window.WorkVolt?.toast('Task cancelled.', 'info');
      loadData();
    } catch(e) {
      window.WorkVolt?.toast(e.message, 'error');
    }
  };

  window.tasksQuickReopen = async function(taskId) {
    try {
      await api('tasks/reopen', { task_id: taskId });
      window.WorkVolt?.toast('Task reopened.', 'info');
      loadData();
    } catch(e) {
      window.WorkVolt?.toast(e.message, 'error');
    }
  };

  window.tasksConfirmDelete = function(taskId, taskTitle) {
    setModalContent(renderDeleteModal(taskId, taskTitle));
  };

  window.tasksSubmitDelete = async function(taskId) {
    var btn = document.getElementById('task-form-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Deleting…'; }
    try {
      await api('tasks/delete', { task_id: taskId });
      setFormStatus('Task deleted.', true);
      setTimeout(function() { window.tasksCloseModal(); loadData(); }, 700);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-sm"></i> Delete Permanently'; }
    }
  };


  // ── Boot ──────────────────────────────────────────────────────
  render();
};
