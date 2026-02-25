window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['tasks'] = function(container) {

  // ── API matches the REAL GAS: uses API_URL + workvolt_token ──────
  var API_URL      = localStorage.getItem('wv_gas_url') || window.API_URL || '';
  var TOKEN        = localStorage.getItem('workvolt_token') || '';
  var currentUser  = null;
  try { currentUser = JSON.parse(localStorage.getItem('workvolt_user')) || window.WorkVolt.user(); } catch(e) {}
  currentUser = currentUser || window.WorkVolt?.user?.() || {};

  var tasksCache   = [];   // flat array, matches GAS { tasks: [...] }
  var usersCache   = [];
  var activeView   = sessionStorage.getItem('tasks_view') || 'kanban';

  var STATUSES   = ['Backlog','Todo','In Progress','Review','Done'];
  var PRIORITIES = ['Low','Medium','High','Urgent'];

  var STATUS_DOT = {
    'Backlog':     'bg-slate-400',
    'Todo':        'bg-blue-400',
    'In Progress': 'bg-amber-400',
    'Review':      'bg-purple-400',
    'Done':        'bg-green-400',
  };
  var STATUS_COLORS = {
    'Backlog':     'bg-slate-100 text-slate-600',
    'Todo':        'bg-blue-100 text-blue-700',
    'In Progress': 'bg-amber-100 text-amber-700',
    'Review':      'bg-purple-100 text-purple-700',
    'Done':        'bg-green-100 text-green-700',
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

  function isAdmin() {
    var role = currentUser?.role || '';
    return role === 'Admin' || role === 'SuperAdmin' || role === 'Manager';
  }

  // ================================================================
  //  API — mirrors the exact pattern from the original index.html
  // ================================================================
  async function api(path, params) {
    params = params || {};
    var url = new URL(API_URL);
    url.searchParams.append('path', path);
    if (TOKEN) url.searchParams.append('token', TOKEN);
    for (var key in params) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        url.searchParams.append(key, params[key]);
      }
    }
    var res  = await fetch(url.toString(), { method: 'GET', mode: 'cors', cache: 'no-cache' });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ================================================================
  //  HELPERS
  // ================================================================
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
    catch(e) { return d; }
  }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u){ return String(u.user_id) === String(uid); });
    return u ? (u.name || u.email) : String(uid);
  }
  function statusBadge(s) {
    var c = STATUS_COLORS[s] || 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold '+c+'">'+(s||'—')+'</span>';
  }
  function priorityBadge(p) {
    var c = PRIORITY_COLORS[p] || 'bg-slate-100 text-slate-500';
    var d = PRIORITY_DOT[p]   || 'bg-slate-400';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold '+c+'"><span class="w-1.5 h-1.5 rounded-full '+d+'"></span>'+(p||'—')+'</span>';
  }
  function toast(msg, type) {
    if (window.WorkVolt?.toast) window.WorkVolt.toast(msg, type||'info');
    else if (window.showToast) window.showToast(msg, type||'info');
  }

  // ================================================================
  //  MODAL PORTAL — appended directly to body, nothing can block it
  // ================================================================
  var PORTAL_ID = 'wv-tasks-portal';
  function getPortal() {
    var el = document.getElementById(PORTAL_ID);
    if (!el) { el = document.createElement('div'); el.id = PORTAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html) {
    var portal = getPortal();
    portal.innerHTML =
      '<div id="tm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.48);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem;">' +
        '<div id="tm-box" style="background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.25);width:100%;max-width:660px;max-height:90vh;overflow-y:auto;position:relative;z-index:9999;">' +
          html +
        '</div>' +
      '</div>';
    portal.querySelector('#tm-backdrop').addEventListener('click', function(e){
      if (e.target.id === 'tm-backdrop') closeModal();
    });
  }
  function closeModal() {
    var p = document.getElementById(PORTAL_ID);
    if (p) p.innerHTML = '';
  }
  function modalStatus(msg, ok) {
    var el = document.getElementById('tm-status');
    if (!el) return;
    el.innerHTML = msg
      ? '<div style="display:flex;align-items:center;gap:.5rem;padding:.75rem 1rem;border-radius:.625rem;font-size:.875rem;font-weight:500;margin-bottom:.75rem;' +
        (ok ? 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0">' : 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca">') +
        '<i class="fas '+(ok?'fa-check-circle':'fa-exclamation-circle')+'"></i><span>'+esc(msg)+'</span></div>'
      : '';
  }

  // ================================================================
  //  MAIN RENDER
  // ================================================================
  function render() {
    var isList   = activeView === 'list';
    var isKanban = activeView === 'kanban';

    container.innerHTML =
      '<div class="min-h-full bg-slate-50">' +

        '<div class="bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between gap-4 flex-wrap">' +
          '<div>' +
            '<h1 class="text-xl font-extrabold text-slate-900">Tasks</h1>' +
            '<p class="text-slate-500 text-sm mt-0.5" id="tasks-subtitle">Loading…</p>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<div class="flex items-center bg-slate-100 rounded-lg p-0.5">' +
              '<button id="btn-list"   class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors '+(isList  ?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700')+'"><i class="fas fa-list mr-1"></i>List</button>' +
              '<button id="btn-kanban" class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors '+(isKanban?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700')+'"><i class="fas fa-columns mr-1"></i>Kanban</button>' +
            '</div>' +
            '<button id="btn-new" class="btn-primary"><i class="fas fa-plus text-sm"></i> New Task</button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-3">' +
          '<select id="filter-status" class="field text-xs py-1.5 w-36">' +
            '<option value="">All Statuses</option>' +
            STATUSES.map(function(s){ return '<option value="'+s+'">'+s+'</option>'; }).join('') +
          '</select>' +
          '<select id="filter-priority" class="field text-xs py-1.5 w-36">' +
            '<option value="">All Priorities</option>' +
            PRIORITIES.map(function(p){ return '<option value="'+p+'">'+p+'</option>'; }).join('') +
          '</select>' +
          '<select id="filter-assignee" class="field text-xs py-1.5 w-40">' +
            '<option value="">All Assignees</option>' +
          '</select>' +
          '<button id="btn-clear" class="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"><i class="fas fa-times mr-1"></i>Clear</button>' +
          '<div class="ml-auto"><input id="task-search" type="text" placeholder="Search tasks…" class="field text-xs py-1.5 w-48"></div>' +
        '</div>' +

        '<div id="tasks-content" class="p-6">' +
          '<div class="flex items-center justify-center py-16 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>' +
        '</div>' +

      '</div>';

    // Listeners
    container.querySelector('#btn-list').addEventListener('click',   function(){ setView('list'); });
    container.querySelector('#btn-kanban').addEventListener('click', function(){ setView('kanban'); });
    container.querySelector('#btn-new').addEventListener('click',    function(){ openForm(null); });
    container.querySelector('#btn-clear').addEventListener('click',  function(){
      container.querySelector('#filter-status').value   = '';
      container.querySelector('#filter-priority').value = '';
      container.querySelector('#filter-assignee').value = '';
      container.querySelector('#task-search').value     = '';
      renderView(tasksCache);
    });
    container.querySelector('#filter-status').addEventListener('change',   renderFiltered);
    container.querySelector('#filter-priority').addEventListener('change', renderFiltered);
    container.querySelector('#filter-assignee').addEventListener('change', renderFiltered);
    container.querySelector('#task-search').addEventListener('input',      renderFiltered);

    // Event delegation for list rows & kanban cards
    container.querySelector('#tasks-content').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      var action = btn.dataset.action;
      var id     = btn.dataset.id;
      var task   = tasksCache.find(function(t){ return String(t.task_id) === String(id); });

      if (action === 'open')     openTaskDetail(id);
      if (action === 'complete') quickMove(id, 'Done');
      if (action === 'reopen')   quickMove(id, 'Todo');
      if (action === 'cancel')   quickMove(id, 'Backlog');
      if (action === 'edit')     openForm(task);
      if (action === 'delete')   openDeleteModal(id, task ? task.title : '');
    });

    loadData();
  }

  function setView(v) {
    activeView = v;
    sessionStorage.setItem('tasks_view', v);
    render();
  }


  // ================================================================
  //  LOAD DATA
  // ================================================================
  async function loadData() {
    if (!API_URL || !TOKEN) {
      document.getElementById('tasks-content').innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-slate-400">' +
          '<i class="fas fa-plug text-4xl mb-4"></i>' +
          '<p class="font-semibold text-slate-500 mt-2">Not connected — please log in</p>' +
        '</div>';
      var s = document.getElementById('tasks-subtitle'); if (s) s.textContent = '';
      return;
    }

    try {
      // Load tasks (GAS returns { tasks: [...] })
      var taskData = await api('tasks');
      tasksCache = taskData.tasks || [];

      // Load users for assignee dropdown (managers+ only, gracefully ignored otherwise)
      if (isAdmin()) {
        try {
          var userData = await api('users');
          usersCache = userData.users || [];
          populateAssigneeFilter();
        } catch(e) { /* non-admin — ignore */ }
      }

      var s = document.getElementById('tasks-subtitle');
      if (s) s.textContent = tasksCache.length + ' task' + (tasksCache.length !== 1 ? 's' : '');

      renderView(tasksCache);
    } catch(e) {
      document.getElementById('tasks-content').innerHTML =
        '<div class="flex flex-col items-center justify-center py-20 text-red-400">' +
          '<i class="fas fa-exclamation-circle text-4xl mb-4"></i>' +
          '<p class="font-semibold">'+esc(e.message)+'</p>' +
        '</div>';
    }
  }

  function populateAssigneeFilter() {
    var sel = container.querySelector('#filter-assignee');
    if (!sel) return;
    usersCache.forEach(function(u) {
      if (u.active === false) return;
      var opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.name || u.email;
      sel.appendChild(opt);
    });
  }

  function renderFiltered() {
    var status   = (container.querySelector('#filter-status')?.value   || '').toLowerCase();
    var priority = (container.querySelector('#filter-priority')?.value || '').toLowerCase();
    var assignee = container.querySelector('#filter-assignee')?.value  || '';
    var q        = (container.querySelector('#task-search')?.value     || '').toLowerCase().trim();

    var filtered = tasksCache.filter(function(t) {
      if (status   && (t.status   ||'').toLowerCase() !== status)   return false;
      if (priority && (t.priority ||'').toLowerCase() !== priority) return false;
      if (assignee && String(t.assigned_to) !== String(assignee))   return false;
      if (q && !(
        (t.title      ||'').toLowerCase().includes(q) ||
        (t.description||'').toLowerCase().includes(q)
      )) return false;
      return true;
    });

    renderView(filtered);
    var s = document.getElementById('tasks-subtitle');
    if (s) s.textContent = filtered.length + (q||status||priority||assignee ? ' of '+tasksCache.length : '') + ' task' + (filtered.length!==1?'s':'');
  }

  function renderView(tasks) {
    if (activeView === 'kanban') renderKanban(tasks);
    else renderList(tasks);
  }


  // ================================================================
  //  LIST VIEW
  // ================================================================
  function renderList(tasks) {
    var content = document.getElementById('tasks-content');
    if (!content) return;

    if (!tasks.length) {
      content.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-400"><i class="fas fa-check-circle text-4xl mb-4"></i><p class="font-semibold text-slate-500">No tasks found</p></div>';
      return;
    }

    var rows = tasks.map(function(t) {
      var overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Done';
      var isDone  = t.status === 'Done' || t.status === 'Backlog';

      var actions =
        '<div class="flex items-center gap-1">' +
        (!isDone
          ? '<button data-action="complete" data-id="'+t.task_id+'" title="Mark Done"    class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50"><i class="fas fa-check text-xs"></i></button>' +
            '<button data-action="cancel"   data-id="'+t.task_id+'" title="Move to Backlog" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50"><i class="fas fa-ban text-xs"></i></button>'
          : '<button data-action="reopen"   data-id="'+t.task_id+'" title="Reopen"       class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-undo text-xs"></i></button>') +
        '<button data-action="open"   data-id="'+t.task_id+'" title="Open detail"  class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50"><i class="fas fa-pencil text-xs"></i></button>' +
        (isAdmin()
          ? '<button data-action="delete" data-id="'+t.task_id+'" title="Delete" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>'
          : '') +
        '</div>';

      return '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">' +
        '<td class="px-4 py-3 max-w-xs cursor-pointer" data-action="open" data-id="'+t.task_id+'">' +
          '<div class="font-semibold text-slate-900 text-sm truncate">'+esc(t.title)+'</div>' +
          (t.description ? '<div class="text-xs text-slate-400 truncate mt-0.5">'+esc(t.description)+'</div>' : '') +
        '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">'+statusBadge(t.status)+'</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">'+priorityBadge(t.priority)+'</td>' +
        '<td class="px-4 py-3 text-xs whitespace-nowrap '+(overdue?'text-red-500 font-semibold':'text-slate-500')+'">'+(t.due_date ? fmtDate(t.due_date)+(overdue?' ⚠':'') : '—')+'</td>' +
        '<td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">'+esc(userName(t.assigned_to))+'</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">'+actions+'</td>' +
      '</tr>';
    }).join('');

    content.innerHTML =
      '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">' +
        '<div class="overflow-x-auto">' +
          '<table class="w-full text-left">' +
            '<thead><tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">' +
              '<th class="px-4 py-3">Task</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Priority</th>' +
              '<th class="px-4 py-3">Due</th><th class="px-4 py-3">Assigned To</th><th class="px-4 py-3">Actions</th>' +
            '</tr></thead>' +
            '<tbody>'+rows+'</tbody>' +
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

    var cols = STATUSES.map(function(status) {
      var colTasks = tasks.filter(function(t){ return t.status === status; });
      var cards = colTasks.map(function(t) {
        var overdue = t.due_date && new Date(t.due_date) < new Date() && status !== 'Done';
        return (
          '<div data-action="open" data-id="'+t.task_id+'" class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md cursor-pointer transition-shadow mb-2">' +
            '<div class="flex items-start justify-between gap-2 mb-2">' +
              '<p class="text-sm font-semibold text-slate-900 leading-snug">'+esc(t.title)+'</p>' +
              priorityBadge(t.priority) +
            '</div>' +
            (t.description ? '<p class="text-xs text-slate-400 mb-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+esc(t.description)+'</p>' : '') +
            '<div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">' +
              '<span class="text-xs '+(overdue?'text-red-500 font-semibold':'text-slate-400')+'">'+(t.due_date?'<i class="fas fa-calendar-alt mr-1"></i>'+fmtDate(t.due_date):'')+'</span>' +
              '<div class="flex items-center gap-1">' +
                (t.assigned_to ? '<span class="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">'+esc(userName(t.assigned_to))+'</span>' : '') +
                (t.pay_per_task > 0 ? '<span class="text-xs text-green-600 font-semibold ml-1"><i class="fas fa-dollar-sign"></i>'+t.pay_per_task+'</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="flex-shrink-0 w-72">' +
          '<div class="flex items-center gap-2 mb-3">' +
            '<span class="w-2.5 h-2.5 rounded-full '+(STATUS_DOT[status]||'bg-slate-400')+'"></span>' +
            '<span class="text-sm font-bold text-slate-700">'+status+'</span>' +
            '<span class="ml-auto text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">'+colTasks.length+'</span>' +
          '</div>' +
          '<div class="min-h-16 bg-slate-100/50 rounded-xl p-2">' +
            (cards || '<div class="text-xs text-slate-400 text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">No tasks</div>') +
          '</div>' +
        '</div>'
      );
    }).join('');

    content.innerHTML = '<div class="flex gap-4 overflow-x-auto pb-4" style="scrollbar-width:thin">'+cols+'</div>';
  }


  // ================================================================
  //  QUICK MOVE (complete / reopen / cancel)
  // ================================================================
  async function quickMove(taskId, newStatus) {
    try {
      // GAS uses tasks/move with { task_id, to_status }
      await api('tasks/move', { task_id: taskId, to_status: newStatus });
      toast(newStatus === 'Done' ? 'Task completed! 🎉' : 'Task moved to '+newStatus, 'success');
      loadData();
    } catch(e) {
      toast(e.message, 'error');
    }
  }


  // ================================================================
  //  TASK DETAIL PANEL (full-screen, matches old style)
  // ================================================================
  var tdpState = { task: null };

  async function openTaskDetail(taskId) {
    var portal = getPortal();
    portal.innerHTML =
      '<div id="tm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem;">' +
        '<div style="color:#fff;font-size:1rem;"><i class="fas fa-circle-notch fa-spin mr-2"></i>Loading…</div>' +
      '</div>';

    try {
      // Find in cache first — GAS task_id is a row number integer
      var task = tasksCache.find(function(t){ return String(t.task_id) === String(taskId); });
      if (!task) throw new Error('Task not found');

      tdpState.task = task;

      // Build assignee options for edit
      var assigneeOpts = '<option value="">Unassigned</option>';
      if (isAdmin() && usersCache.length) {
        assigneeOpts = usersCache.filter(function(u){ return u.active !== false; }).map(function(u){
          return '<option value="'+u.user_id+'"'+(String(u.user_id)===String(task.assigned_to)?' selected':'')+'>'+esc(u.name||u.email)+'</option>';
        }).join('');
      }

      var statusOpts = STATUSES.map(function(s){
        return '<option value="'+s+'"'+(task.status===s?' selected':'')+'>'+s+'</option>';
      }).join('');
      var priorityOpts = PRIORITIES.map(function(p){
        return '<option value="'+p+'"'+(task.priority===p?' selected':'')+'>'+p+'</option>';
      }).join('');

      var html =
        '<div style="display:flex;align-items:center;gap:.75rem;padding:1.25rem 1.5rem;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;">' +
          '<button id="tdp-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1rem;padding:4px 8px;border-radius:6px;"><i class="fas fa-arrow-left"></i></button>' +
          '<input id="tdp-title" value="'+esc(task.title)+'" style="flex:1;min-width:200px;font-size:1rem;font-weight:700;color:#0f172a;border:none;outline:none;background:transparent;" />' +
          '<select id="tdp-status" style="font-size:.8rem;border:1.5px solid #e2e8f0;border-radius:8px;padding:4px 8px;color:#475569;cursor:pointer;">'+statusOpts+'</select>' +
          '<select id="tdp-priority" style="font-size:.8rem;border:1.5px solid #e2e8f0;border-radius:8px;padding:4px 8px;color:#475569;cursor:pointer;">'+priorityOpts+'</select>' +
          '<input type="date" id="tdp-due" value="'+(task.due_date||'')+'" style="font-size:.8rem;border:1.5px solid #e2e8f0;border-radius:8px;padding:4px 8px;color:#475569;" />' +
          '<span id="tdp-save-badge" style="font-size:.75rem;color:#94a3b8;"><i class="fas fa-cloud"></i> <span id="tdp-save-txt">Saved</span></span>' +
          '<div style="display:flex;gap:.4rem;margin-left:auto;">' +
            '<button id="tdp-complete" style="display:flex;align-items:center;gap:.3rem;padding:.4rem .9rem;background:#16a34a;color:#fff;border:none;border-radius:.5rem;font-size:.8rem;font-weight:600;cursor:pointer;"><i class="fas fa-check"></i> Done</button>' +
            (isAdmin() ? '<button id="tdp-delete" style="display:flex;align-items:center;gap:.3rem;padding:.4rem .9rem;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:.5rem;font-size:.8rem;font-weight:600;cursor:pointer;"><i class="fas fa-trash"></i></button>' : '') +
            '<button id="tdp-close2" style="padding:.4rem .9rem;background:#f1f5f9;color:#475569;border:none;border-radius:.5rem;font-size:.8rem;font-weight:600;cursor:pointer;"><i class="fas fa-times"></i></button>' +
          '</div>' +
        '</div>' +

        '<div style="padding:1.5rem;display:grid;grid-template-columns:1fr 260px;gap:1.5rem;">' +

          '<div>' +
            '<div style="margin-bottom:1rem;">' +
              '<label style="display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem;">Description</label>' +
              '<textarea id="tdp-desc" rows="5" style="width:100%;padding:.6rem .875rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.875rem;font-family:inherit;resize:vertical;outline:none;" placeholder="Add a description…">'+esc(task.description||'')+'</textarea>' +
            '</div>' +
            '<div style="margin-bottom:1rem;">' +
              '<label style="display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem;">Notes</label>' +
              '<div id="tdp-status-msg"></div>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;flex-direction:column;gap:1rem;">' +
            '<div>' +
              '<label style="display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem;">Assigned To</label>' +
              (isAdmin() && usersCache.length
                ? '<select id="tdp-assignee" style="width:100%;padding:.6rem .875rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.875rem;font-family:inherit;">'+assigneeOpts+'</select>'
                : '<p style="font-size:.875rem;color:#475569;">'+esc(userName(task.assigned_to))+'</p>') +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem;">Est. Hours</label>' +
              '<input type="number" id="tdp-est" step="0.5" value="'+(task.estimated_hours||'')+'" style="width:100%;padding:.6rem .875rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.875rem;font-family:inherit;" />' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem;">Pay Per Task ($)</label>' +
              '<input type="number" id="tdp-pay" step="0.01" value="'+(task.pay_per_task||'')+'" style="width:100%;padding:.6rem .875rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.875rem;font-family:inherit;" />' +
            '</div>' +
            '<div>' +
              '<label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">' +
                '<input type="checkbox" id="tdp-billable"'+(String(task.billable)==='true'||task.billable===true?' checked':'')+' style="width:1rem;height:1rem;accent-color:#2563eb;">' +
                '<span style="font-size:.875rem;font-weight:500;color:#334155;">Billable</span>' +
              '</label>' +
            '</div>' +
            (task.status === 'Done'
              ? '<div><label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"><input type="checkbox" id="tdp-paid"'+(String(task.paid)==='true'||task.paid===true?' checked':'')+' style="width:1rem;height:1rem;accent-color:#16a34a;"><span style="font-size:.875rem;font-weight:500;color:#334155;">Paid</span></label></div>'
              : '') +
            '<div style="padding-top:.5rem;border-top:1px solid #f1f5f9;">' +
              '<button id="tdp-save-btn" class="btn-primary" style="width:100%;"><i class="fas fa-save text-sm"></i> Save Changes</button>' +
            '</div>' +
          '</div>' +

        '</div>';

      portal.querySelector('#tm-backdrop').innerHTML = '<div id="tdp-panel" style="background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.25);width:100%;max-width:820px;max-height:90vh;overflow-y:auto;z-index:9999;">'+html+'</div>';

      // Auto-save on field change
      var autoTimer = null;
      function schedSave() {
        var txt = document.getElementById('tdp-save-txt');
        if (txt) txt.textContent = 'Saving…';
        clearTimeout(autoTimer);
        autoTimer = setTimeout(function(){ saveTask(true); }, 1200);
      }

      ['tdp-title','tdp-desc'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', schedSave);
      });
      ['tdp-status','tdp-priority','tdp-due','tdp-assignee','tdp-est','tdp-pay','tdp-billable','tdp-paid'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', schedSave);
      });

      async function saveTask(silent) {
        var tid = tdpState.task.task_id;
        var params = {
          task_id:         tid,
          title:           document.getElementById('tdp-title')?.value    || '',
          description:     document.getElementById('tdp-desc')?.value     || '',
          status:          document.getElementById('tdp-status')?.value   || '',
          priority:        document.getElementById('tdp-priority')?.value || '',
          due_date:        document.getElementById('tdp-due')?.value      || '',
          assigned_to:     document.getElementById('tdp-assignee')?.value || '',
          estimated_hours: document.getElementById('tdp-est')?.value      || '',
          pay_per_task:    document.getElementById('tdp-pay')?.value      || '',
          billable:        document.getElementById('tdp-billable')?.checked ? 'true' : 'false',
        };
        var paidEl = document.getElementById('tdp-paid');
        if (paidEl) params.paid = paidEl.checked ? 'true' : 'false';

        try {
          await api('tasks/update', params);
          // update cache
          var idx = tasksCache.findIndex(function(t){ return String(t.task_id) === String(tid); });
          if (idx !== -1) {
            Object.assign(tasksCache[idx], {
              title: params.title, description: params.description,
              status: params.status, priority: params.priority,
              due_date: params.due_date, assigned_to: params.assigned_to,
              estimated_hours: params.estimated_hours, pay_per_task: params.pay_per_task,
              billable: params.billable,
            });
          }
          var txt = document.getElementById('tdp-save-txt');
          if (txt) txt.textContent = 'Saved ✓';
          if (!silent) toast('Task saved!', 'success');
        } catch(e) {
          var txt = document.getElementById('tdp-save-txt');
          if (txt) txt.textContent = 'Save failed';
          if (!silent) toast(e.message, 'error');
        }
      }

      document.getElementById('tdp-save-btn').addEventListener('click', function(){ saveTask(false); });

      document.getElementById('tdp-complete').addEventListener('click', function(){
        var st = document.getElementById('tdp-status');
        if (st) st.value = 'Done';
        saveTask(true).then(function(){
          toast('Task marked complete! 🎉', 'success');
          closeModal();
          loadData();
        });
      });

      document.getElementById('tdp-close').addEventListener('click',  closeModal);
      document.getElementById('tdp-close2').addEventListener('click', closeModal);

      if (isAdmin()) {
        document.getElementById('tdp-delete').addEventListener('click', function(){
          closeModal();
          openDeleteModal(task.task_id, task.title);
        });
      }

      portal.querySelector('#tm-backdrop').addEventListener('click', function(e){
        if (e.target.id === 'tm-backdrop') { closeModal(); }
      });

    } catch(e) {
      portal.innerHTML =
        '<div id="tm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;">' +
          '<div style="background:#fff;padding:2rem;border-radius:14px;text-align:center;max-width:400px;">' +
            '<i class="fas fa-exclamation-circle" style="color:#ef4444;font-size:2rem;margin-bottom:1rem;display:block;"></i>' +
            '<p style="font-weight:600;color:#334155;margin-bottom:.5rem;">Failed to load task</p>' +
            '<p style="font-size:.875rem;color:#94a3b8;margin-bottom:1.5rem;">'+esc(e.message)+'</p>' +
            '<button onclick="document.getElementById(\''+PORTAL_ID+'\').innerHTML=\'\'" style="padding:.5rem 1.25rem;background:#f1f5f9;border:none;border-radius:.5rem;cursor:pointer;font-weight:600;">Close</button>' +
          '</div>' +
        '</div>';
    }
  }


  // ================================================================
  //  CREATE / EDIT FORM MODAL
  // ================================================================
  async function openForm(task) {
    var isEdit = !!task;

    // Build assignee options
    var assigneeOpts = '<option value="">Unassigned</option>';
    if (isAdmin()) {
      if (!usersCache.length) {
        try { var ud = await api('users'); usersCache = ud.users || []; } catch(e){}
      }
      assigneeOpts = usersCache.filter(function(u){ return u.active !== false; }).map(function(u){
        var sel = isEdit && String(u.user_id) === String(task?.assigned_to) ? ' selected' : '';
        if (!isEdit && String(u.user_id) === String(currentUser?.user_id)) sel = ' selected';
        return '<option value="'+u.user_id+'"'+sel+'>'+esc(u.name||u.email)+' ('+u.role+')</option>';
      }).join('');
    } else {
      // Non-manager: assign to self
      assigneeOpts = '<option value="'+esc(currentUser?.user_id||'')+'" selected>'+esc(currentUser?.name||'Me')+'</option>';
    }

    var statusOpts = STATUSES.map(function(s){
      var sel = task ? (task.status===s?' selected':'') : (s==='Backlog'?' selected':'');
      return '<option value="'+s+'"'+sel+'>'+s+'</option>';
    }).join('');
    var priorityOpts = PRIORITIES.map(function(p){
      var sel = task ? (task.priority===p?' selected':'') : (p==='Medium'?' selected':'');
      return '<option value="'+p+'"'+sel+'>'+p+'</option>';
    }).join('');

    function v(f) { return task && task[f] != null ? esc(String(task[f])) : ''; }

    var html =
      '<div style="padding:1.25rem 1.5rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;">' +
        '<h3 style="font-weight:700;font-size:1rem;color:#0f172a;">'+(isEdit?'Edit Task':'New Task')+'</h3>' +
        '<button id="tm-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.1rem;padding:4px 8px;border-radius:6px;">✕</button>' +
      '</div>' +
      '<div style="padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:.875rem;">' +
        '<div id="tm-status"></div>' +

        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Title <span style="color:red">*</span></label><input id="tf-title" class="field text-sm" type="text" placeholder="Task title" value="'+v('title')+'"></div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label><textarea id="tf-desc" class="field text-sm" rows="3" style="resize:none" placeholder="Describe the task…">'+v('description')+'</textarea></div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</label><select id="tf-status" class="field text-sm">'+statusOpts+'</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Priority</label><select id="tf-priority" class="field text-sm">'+priorityOpts+'</select></div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Assigned To</label><select id="tf-assignee" class="field text-sm">'+assigneeOpts+'</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Due Date</label><input type="date" id="tf-due" class="field text-sm" value="'+v('due_date')+'"></div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Est. Hours</label><input type="number" id="tf-est" class="field text-sm" step="0.5" placeholder="0.0" value="'+v('estimated_hours')+'"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Pay Per Task ($)</label><input type="number" id="tf-pay" class="field text-sm" step="0.01" placeholder="0.00" value="'+v('pay_per_task')+'"></div>' +
        '</div>' +

        '<label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;"><input type="checkbox" id="tf-billable" style="width:1rem;height:1rem;accent-color:#2563eb;"'+(String(task?.billable)==='true'||task?.billable===true?' checked':'')+'>  <span class="text-sm font-medium text-slate-700">Billable to client</span></label>' +

        '<div style="display:flex;gap:.75rem;padding-top:.25rem;">' +
          '<button id="tm-cancel" class="btn-secondary" style="flex:1;">Cancel</button>' +
          (isEdit && isAdmin() ? '<button id="tm-del-btn" style="padding:.65rem 1rem;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:10px;font-size:.875rem;font-weight:600;cursor:pointer;"><i class="fas fa-trash text-xs"></i></button>' : '') +
          '<button id="tm-submit" class="btn-primary" style="flex:1;">'+(isEdit?'<i class="fas fa-save text-xs"></i> Save':'<i class="fas fa-plus text-xs"></i> Create Task')+'</button>' +
        '</div>' +
      '</div>';

    showModal(html);

    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);

    if (isEdit && isAdmin()) {
      document.getElementById('tm-del-btn').addEventListener('click', function(){
        closeModal();
        openDeleteModal(task.task_id, task.title);
      });
    }

    document.getElementById('tm-submit').addEventListener('click', function(){
      submitForm(isEdit ? task.task_id : null);
    });
  }

  async function submitForm(taskId) {
    var isEdit = taskId != null;
    var title  = (document.getElementById('tf-title')?.value || '').trim();
    if (!title) { modalStatus('Title is required.', false); return; }

    var btn = document.getElementById('tm-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Saving…'; }

    var params = {
      title:           title,
      description:     document.getElementById('tf-desc')?.value     || '',
      status:          document.getElementById('tf-status')?.value   || 'Backlog',
      priority:        document.getElementById('tf-priority')?.value || 'Medium',
      assigned_to:     document.getElementById('tf-assignee')?.value || currentUser?.user_id || '',
      due_date:        document.getElementById('tf-due')?.value      || '',
      estimated_hours: document.getElementById('tf-est')?.value      || '',
      pay_per_task:    document.getElementById('tf-pay')?.value      || '',
      billable:        document.getElementById('tf-billable')?.checked || false,
    };

    var path, successMsg;
    if (isEdit) {
      params.task_id = taskId;
      path       = 'tasks/update';
      successMsg = 'Task updated!';
    } else {
      // GAS createTask uses POST method flag
      params.method = 'POST';
      path       = 'tasks';
      successMsg = 'Task created!';
    }

    try {
      await api(path, params);
      modalStatus(successMsg, true);
      setTimeout(function(){ closeModal(); loadData(); }, 600);
    } catch(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = isEdit ? '<i class="fas fa-save text-xs"></i> Save' : '<i class="fas fa-plus text-xs"></i> Create Task'; }
    }
  }


  // ================================================================
  //  DELETE MODAL
  // ================================================================
  function openDeleteModal(taskId, taskTitle) {
    var html =
      '<div style="padding:1.25rem 1.5rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;">' +
        '<h3 style="font-weight:700;color:#b91c1c;">Delete Task</h3>' +
        '<button id="tm-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.1rem;padding:4px 8px;">✕</button>' +
      '</div>' +
      '<div style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem;">' +
        '<div style="display:flex;gap:.75rem;padding:1rem;background:#fef2f2;border:1px solid #fecaca;border-radius:.75rem;">' +
          '<i class="fas fa-exclamation-triangle" style="color:#ef4444;margin-top:.1rem;"></i>' +
          '<p style="font-size:.875rem;color:#b91c1c;">Permanently delete <strong>'+esc(taskTitle)+'</strong>? This cannot be undone.</p>' +
        '</div>' +
        '<div id="tm-status"></div>' +
        '<div style="display:flex;gap:.75rem;">' +
          '<button id="tm-cancel" class="btn-secondary" style="flex:1;">Cancel</button>' +
          '<button id="tm-confirm" style="flex:1;display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.65rem 1.25rem;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:.875rem;font-weight:600;cursor:pointer;">' +
            '<i class="fas fa-trash text-sm"></i> Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>';

    showModal(html);
    document.getElementById('tm-close').addEventListener('click', closeModal);
    document.getElementById('tm-cancel').addEventListener('click', closeModal);
    document.getElementById('tm-confirm').addEventListener('click', function(){
      submitDelete(taskId);
    });
  }

  async function submitDelete(taskId) {
    var btn = document.getElementById('tm-confirm');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Deleting…'; }
    try {
      // GAS deleteTask: path = 'tasks/delete', param = task_id (integer as string is fine, GAS uses .toString())
      await api('tasks/delete', { task_id: taskId });
      modalStatus('Task deleted.', true);
      setTimeout(function(){ closeModal(); loadData(); }, 600);
    } catch(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-sm"></i> Delete Permanently'; }
    }
  }


  // ── Boot ──────────────────────────────────────────────────────
  var old = document.getElementById(PORTAL_ID);
  if (old) old.innerHTML = '';
  render();
};
