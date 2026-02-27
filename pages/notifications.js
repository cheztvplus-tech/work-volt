window.WorkVoltPages = window.WorkVoltPages || {};
delete window.WorkVoltPages['notifications'];

window.WorkVoltPages['notifications'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var myId        = (function() { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } })();
  var activeTab   = 'all';
  var typeFilter  = '';
  var allRows     = [];
  var prefs       = JSON.parse(localStorage.getItem('wv_notif_prefs_' + myId) || 'null');

  // ── API ────────────────────────────────────────────────────────
  function api(path, params) {
    if (!savedUrl || !savedSecret) return Promise.reject(new Error('Not connected'));
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

  // ── Config maps ────────────────────────────────────────────────
  var TYPE_CONFIG = {
    task_assigned:   { icon: 'fa-user-check',      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   label: 'Task Assigned',   tag: 'bg-blue-100 text-blue-700'   },
    status_change:   { icon: 'fa-exchange-alt',     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', label: 'Status Change',   tag: 'bg-purple-100 text-purple-700'},
    comment:         { icon: 'fa-comment',          color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', label: 'Comment',         tag: 'bg-violet-100 text-violet-700'},
    approval_needed: { icon: 'fa-dollar-sign',      color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Approval Needed', tag: 'bg-amber-100 text-amber-700'  },
    mention:         { icon: 'fa-at',              color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Mention',         tag: 'bg-indigo-100 text-indigo-700'},
    deadline_soon:   { icon: 'fa-clock',            color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Deadline Soon',   tag: 'bg-orange-100 text-orange-700'},
    payment_failed:  { icon: 'fa-exclamation-circle', color: 'text-red-600', bg: 'bg-red-50',    border: 'border-red-200',    label: 'Payment Failed',  tag: 'bg-red-100 text-red-700'      },
    system:          { icon: 'fa-bell',             color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200',  label: 'System',          tag: 'bg-slate-100 text-slate-600'  },
  };
  var PRIORITY_CONFIG = {
    critical: { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200',       label: 'Critical' },
    high:     { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', label: 'High'  },
    normal:   { dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-600 border-blue-200',     label: 'Normal'   },
    low:      { dot: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-500 border-slate-200', label: 'Low'      },
    silent:   { dot: 'bg-slate-300',  badge: 'bg-slate-50 text-slate-400 border-slate-200',  label: 'Silent'   },
  };

  // ── Helpers ────────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function timeAgo(d) {
    if (!d) return '';
    var diff = Math.floor((Date.now() - new Date(d)) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
    return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }
  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }

  // ── Render shell ───────────────────────────────────────────────
  function render() {
    container.innerHTML =
      '<div class="min-h-full bg-slate-50">' +

      // Header
      '<div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">' +
        '<div>' +
          '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">' +
            '<i class="fas fa-bell text-blue-500"></i>Notifications' +
          '</h1>' +
          '<p class="text-slate-400 text-xs mt-0.5" id="notif-subtitle">Loading…</p>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          '<button id="btn-mark-all-read" class="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-blue-200">' +
            '<i class="fas fa-check-double mr-1"></i>Mark all read' +
          '</button>' +
          '<button id="btn-delete-all" class="text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors border border-red-200">' +
            '<i class="fas fa-trash mr-1"></i>Delete all' +
          '</button>' +
          '<button id="btn-notif-prefs" class="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200">' +
            '<i class="fas fa-sliders-h mr-1"></i>Preferences' +
          '</button>' +
        '</div>' +
      '</div>' +

      // Tabs + type filter
      '<div class="bg-white border-b border-slate-200 px-6 flex items-center gap-6 overflow-x-auto">' +
        ['all','unread','archived'].map(function(tab) {
          var labels = { all:'All', unread:'Unread', archived:'Archived' };
          var active = activeTab === tab;
          return '<button data-tab="' + tab + '" class="notif-tab flex-shrink-0 py-3 text-sm font-semibold border-b-2 transition-all ' +
            (active ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '">' + labels[tab] + '</button>';
        }).join('') +
        '<div class="ml-auto flex items-center gap-2 py-2">' +
          '<select id="notif-type-filter" class="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white" style="font-family:inherit">' +
            '<option value="">All Types</option>' +
            Object.keys(TYPE_CONFIG).map(function(k) {
              return '<option value="' + k + '"' + (typeFilter===k?' selected':'') + '>' + TYPE_CONFIG[k].label + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +

      // Content
      '<div id="notif-content" class="p-6 max-w-3xl mx-auto">' +
        '<div class="flex items-center justify-center py-16 text-slate-300"><i class="fas fa-circle-notch fa-spin text-3xl"></i></div>' +
      '</div>' +

      '</div>';

    // Wire
    container.querySelectorAll('.notif-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { activeTab = this.dataset.tab; render(); loadData(); });
    });
    container.querySelector('#notif-type-filter').addEventListener('change', function() { typeFilter = this.value; renderList(); });
    container.querySelector('#btn-mark-all-read').addEventListener('click', doMarkAllRead);
    container.querySelector('#btn-delete-all').addEventListener('click', doDeleteAll);
    container.querySelector('#btn-notif-prefs').addEventListener('click', openPrefsModal);

    loadData();
  }

  // ── Load data ──────────────────────────────────────────────────
  function loadData() {
    var params = { user_id: myId, limit: 100 };
    if (activeTab === 'unread')   params.filter = 'unread';
    if (activeTab === 'archived') params.filter = 'archived';

    api('notifications/list', params)
      .then(function(data) {
        allRows = data.rows || [];
        var sub = container.querySelector('#notif-subtitle');
        if (sub) {
          var unread = data.unread || 0;
          sub.textContent = allRows.length + ' notification' + (allRows.length !== 1 ? 's' : '') +
            (unread ? ' · ' + unread + ' unread' : '');
        }
        renderList();
      })
      .catch(function(e) {
        var c = document.getElementById('notif-content');
        if (c) c.innerHTML = '<div class="text-center py-16 text-red-400"><i class="fas fa-exclamation-circle text-3xl mb-3 block"></i><p>' + esc(e.message) + '</p></div>';
      });
  }

  // ── Render list ────────────────────────────────────────────────
  function renderList() {
    var content = document.getElementById('notif-content');
    if (!content) return;

    var rows = typeFilter ? allRows.filter(function(r) { return r.type === typeFilter; }) : allRows;

    if (!rows.length) {
      content.innerHTML =
        '<div class="flex flex-col items-center justify-center py-24 text-slate-300">' +
          '<i class="fas fa-bell-slash text-5xl mb-4 opacity-30"></i>' +
          '<p class="font-semibold text-slate-500">No notifications</p>' +
          '<p class="text-sm mt-1">' + (activeTab === 'unread' ? 'You\'re all caught up!' : 'Nothing here yet.') + '</p>' +
        '</div>';
      return;
    }

    // Group by date
    var groups = {};
    var groupOrder = [];
    rows.forEach(function(r) {
      var d = r.created_at ? new Date(r.created_at) : new Date(0);
      var now = new Date();
      var key;
      var diffDays = Math.floor((now - d) / 86400000);
      if (diffDays === 0) key = 'Today';
      else if (diffDays === 1) key = 'Yesterday';
      else if (diffDays < 7) key = 'This Week';
      else key = 'Older';
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(r);
    });
    // Dedupe groupOrder
    groupOrder = groupOrder.filter(function(k, i) { return groupOrder.indexOf(k) === i; });

    var html = groupOrder.map(function(grpKey) {
      var grpRows = groups[grpKey];
      var items = grpRows.map(function(r) { return renderRow(r); }).join('');
      return '<div class="mb-6">' +
        '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 px-1">' + grpKey + '</p>' +
        '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">' +
          items +
        '</div>' +
      '</div>';
    }).join('');

    content.innerHTML = html;

    // Wire row actions
    content.querySelectorAll('[data-notif-id]').forEach(function(row) {
      row.addEventListener('click', function(e) {
        var id = this.dataset.notifId;
        var action = e.target.closest('[data-notif-action]');
        if (action) {
          e.stopPropagation();
          var act = action.dataset.notifAction;
          if (act === 'read')   doMarkRead(id, this);  // also archives
          if (act === 'delete') doDelete(id);
          return;
        }
        // Click row → mark read (auto-archives) + navigate to the related item
        var refType = this.dataset.refType;
        var refId   = this.dataset.refId;
        if (this.dataset.read !== 'true') doMarkRead(id, this);
        if (refType && refId && window.WorkVolt && window.WorkVolt.navigate) {
          if (refType === 'tasks' && refId) {
            if (window.WVTasks && window.WVTasks.openById) {
              window.WorkVolt.navigate(refType);
              setTimeout(function() { window.WVTasks.openById(refId); }, 100);
            } else {
              window._pendingOpenTaskId = refId;
              window.WorkVolt.navigate(refType);
            }
          } else {
            window.WorkVolt.navigate(refType);
          }
        }
      });
    });
  }

  function renderRow(r) {
    var tc  = TYPE_CONFIG[r.type] || TYPE_CONFIG.system;
    var pc  = PRIORITY_CONFIG[r.priority] || PRIORITY_CONFIG.normal;
    var cnt = parseInt(r.group_count) || 1;
    var unread = r.read !== 'true';

    return '<div data-notif-id="' + esc(r.id) + '" data-read="' + esc(r.read) + '" data-ref-type="' + esc(r.ref_type) + '" data-ref-id="' + esc(r.ref_id) + '" ' +
      'class="group flex items-start gap-4 px-4 py-3.5 cursor-pointer transition-all hover:bg-slate-50/80 ' + (unread ? 'bg-blue-50/30' : '') + '">' +

      // Priority dot + type icon
      '<div class="flex flex-col items-center gap-1.5 flex-shrink-0 pt-0.5">' +
        '<div class="w-9 h-9 rounded-xl ' + tc.bg + ' flex items-center justify-center flex-shrink-0 border ' + tc.border + '">' +
          '<i class="fas ' + tc.icon + ' text-sm ' + tc.color + '"></i>' +
        '</div>' +
        (unread ? '<span class="w-1.5 h-1.5 rounded-full ' + pc.dot + ' flex-shrink-0"></span>' : '<span class="w-1.5 h-1.5"></span>') +
      '</div>' +

      // Content
      '<div class="flex-1 min-w-0">' +
        '<div class="flex items-start gap-2 justify-between">' +
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-1.5 flex-wrap mb-0.5">' +
              '<span class="text-[10px] font-bold px-1.5 py-px rounded ' + tc.tag + '">' + tc.label + '</span>' +
              (r.priority === 'critical' || r.priority === 'high'
                ? '<span class="text-[10px] font-bold px-1.5 py-px rounded border ' + pc.badge + '">' + pc.label + '</span>'
                : '') +
              (cnt > 1 ? '<span class="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-px rounded">×' + cnt + '</span>' : '') +
            '</div>' +
            '<p class="text-sm font-' + (unread ? 'bold' : 'semibold') + ' text-slate-900 leading-snug">' + esc(r.title) + '</p>' +
            (r.body ? '<p class="text-xs text-slate-500 mt-0.5 line-clamp-2">' + esc(r.body) + '</p>' : '') +
          '</div>' +
          '<div class="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">' +
            '<span class="text-[10px] text-slate-400 whitespace-nowrap">' + timeAgo(r.created_at) + '</span>' +
            '<div class="flex gap-1">' +
              (unread ? '<button data-notif-action="read" title="Mark read (archives)" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-400 flex items-center justify-center text-[10px] transition-colors opacity-0 group-hover:opacity-100"><i class="fas fa-check"></i></button>' : '') +
              '<button data-notif-action="delete" title="Delete" class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-500 text-slate-400 flex items-center justify-center text-[10px] transition-colors opacity-0 group-hover:opacity-100"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Actions ────────────────────────────────────────────────────
  function doMarkRead(id, rowEl) {
    // Mark read AND archive in one go — read notifications move to Archived tab
    api('notifications/read', { id: id })
      .then(function() {
        return api('notifications/archive', { id: id });
      })
      .then(function() {
        // Remove from current list (unless we're viewing Archived tab, where it should stay)
        if (activeTab !== 'archived') {
          allRows = allRows.filter(function(r) { return r.id !== id; });
          renderList();
        } else {
          var r = allRows.find(function(r) { return r.id === id; });
          if (r) r.read = 'true';
          if (rowEl) { rowEl.classList.remove('bg-blue-50/30'); rowEl.dataset.read = 'true'; }
        }
        window.WVNotifications && window.WVNotifications.refreshBadge();
      })
      .catch(function() {});
  }
  function doMarkAllRead() {
    api('notifications/read-all', { user_id: myId })
      .then(function() {
        toast('All notifications marked as read', 'success');
        window.WVNotifications && window.WVNotifications.refreshBadge();
        loadData();
      })
      .catch(function(e) { toast(e.message, 'error'); });
  }
  function doDeleteAll() {
    if (!allRows.length) { toast('Nothing to delete', 'info'); return; }
    // Delete each visible notification
    var ids = allRows.map(function(r) { return r.id; });
    var promises = ids.map(function(id) { return api('notifications/delete', { id: id }).catch(function() {}); });
    Promise.all(promises).then(function() {
      allRows = [];
      renderList();
      window.WVNotifications && window.WVNotifications.refreshBadge();
      toast('All notifications deleted', 'info');
    });
  }
  function doDelete(id) {
    api('notifications/delete', { id: id })
      .then(function() { allRows = allRows.filter(function(r) { return r.id !== id; }); renderList(); })
      .catch(function(e) { toast(e.message, 'error'); });
  }

  // ── Preferences modal ──────────────────────────────────────────
  function openPrefsModal() {
    // Load prefs first
    api('notifications/prefs', { user_id: myId })
      .then(function(data) { prefs = data.prefs || {}; renderPrefsModal(); })
      .catch(function() { prefs = {}; renderPrefsModal(); });
  }
  function renderPrefsModal() {
    var p = prefs || {};
    function tog(key, label, sub) {
      var on = p[key] !== 'false';
      return '<div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">' +
        '<div>' +
          '<p class="text-sm font-semibold text-slate-800">' + label + '</p>' +
          (sub ? '<p class="text-xs text-slate-400">' + sub + '</p>' : '') +
        '</div>' +
        '<button type="button" data-pref="' + key + '" data-on="' + (on?'1':'0') + '" ' +
          'class="pref-toggle flex-shrink-0 w-10 h-6 rounded-full border-none cursor-pointer transition-all" ' +
          'style="background:' + (on?'#22c55e':'#cbd5e1') + ';position:relative">' +
          '<span class="pref-knob" style="position:absolute;top:2px;width:1.25rem;height:1.25rem;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .15s;left:' + (on?'calc(100% - 1.35rem)':'2px') + '"></span>' +
        '</button>' +
      '</div>';
    }

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><i class="fas fa-sliders-h text-blue-500"></i>Notification Preferences</h3>' +
        '<button id="pm-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-4 flex flex-col gap-0" style="max-height:70vh;overflow-y:auto">' +

        '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 mt-1">Notification Types</p>' +
        tog('task_assigned',   'Task Assigned',    'When a task is assigned to you') +
        tog('mention',         '@Mentions',         'When someone @mentions you in a comment') +
        tog('approval_needed', 'Approval Needed',  'When a billable task needs your approval') +
        tog('comment',         'Comments',          'When someone comments on your task') +
        tog('status_change',   'Status Changes',   'When a task status changes') +
        tog('deadline_soon',   'Deadline Soon',    'When a task due date is approaching') +
        tog('payment_failed',  'Payment Failed',   'Critical billing or payment alerts') +

        '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 mt-5">Display</p>' +
        tog('popup_enabled',   'Show Popups',       'Show toast popups for high-priority notifications') +
        tog('sound_enabled',   'Sound Alerts',      'Play a sound for critical notifications') +

        '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 mt-5">Quiet Hours</p>' +
        '<div class="flex items-center gap-3 py-3">' +
          '<div class="flex-1"><label class="block text-xs text-slate-500 mb-1 font-semibold">From</label>' +
          '<input id="pm-qh-start" type="time" class="field text-sm" value="' + esc(p.quiet_hours_start||'') + '"></div>' +
          '<div class="flex-1"><label class="block text-xs text-slate-500 mb-1 font-semibold">Until</label>' +
          '<input id="pm-qh-end" type="time" class="field text-sm" value="' + esc(p.quiet_hours_end||'') + '"></div>' +
        '</div>' +
        '<p class="text-xs text-slate-400 pb-3">During quiet hours, notifications are stored but no popups or sounds are shown.</p>' +

        '<div class="flex gap-3 mt-4 pb-2">' +
          '<button id="pm-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="pm-save"   class="btn-primary flex-1"><i class="fas fa-save mr-1 text-xs"></i>Save Preferences</button>' +
        '</div>' +
      '</div>';

    showModal(html, '480px');
    document.getElementById('pm-close').addEventListener('click', closeModal);
    document.getElementById('pm-cancel').addEventListener('click', closeModal);

    // Toggles
    document.querySelectorAll('.pref-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var on = this.dataset.on === '1'; on = !on;
        this.dataset.on = on ? '1' : '0';
        this.style.background = on ? '#22c55e' : '#cbd5e1';
        this.querySelector('.pref-knob').style.left = on ? 'calc(100% - 1.35rem)' : '2px';
        prefs[this.dataset.pref] = on ? 'true' : 'false';
      });
    });

    document.getElementById('pm-save').addEventListener('click', function() {
      prefs.quiet_hours_start = document.getElementById('pm-qh-start').value;
      prefs.quiet_hours_end   = document.getElementById('pm-qh-end').value;
      prefs.user_id = myId;
      // Save to localStorage immediately for client-side use
      localStorage.setItem('wv_notif_prefs_' + myId, JSON.stringify(prefs));
      // Sync to GAS
      api('notifications/save-prefs', prefs)
        .then(function() { toast('Preferences saved ✓', 'success'); closeModal(); })
        .catch(function(e) { toast(e.message, 'error'); });
    });
  }

  // ── Modal helpers ─────────────────────────────────────────────
  var MODAL_ID = 'wv-notif-modal';
  function showModal(html, maxWidth) {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el = document.createElement('div'); el.id = MODAL_ID; document.body.appendChild(el); }
    el.innerHTML =
      '<div id="nm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem">' +
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,.25);width:100%;max-width:' + (maxWidth||'560px') + ';max-height:90vh;overflow-y:auto;z-index:9999">' +
          html +
        '</div>' +
      '</div>';
    document.getElementById('nm-backdrop').addEventListener('click', function(e) { if (e.target.id === 'nm-backdrop') closeModal(); });
  }
  function closeModal() { var el = document.getElementById(MODAL_ID); if (el) el.innerHTML = ''; }

  render();
};
