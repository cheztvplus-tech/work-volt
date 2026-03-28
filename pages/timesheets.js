window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['timesheets'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var db            = window.WorkVoltDB;
  var sheets        = {};
  var usersCache    = [];
  var projectsCache = [];
  var activeView    = sessionStorage.getItem('ts_view') || 'list';
  var filters       = { status: '', user_id: '', project_id: '', billable: '' };
  var _searchVal    = '';
  var _searchTimer  = null;
  var sortState     = { col: 'date', dir: 'desc' };

  // Live timer state
  var _timerEntry  = null;
  var _timerStart  = null;
  var _timerTick   = null;

  // Weekly view offset
  var _weekOffset  = 0;

  // ── Constants ─────────────────────────────────────────────────
  var STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected'];
  var STATUS_CONFIG = {
    'Draft':     { bg:'bg-slate-100',   text:'text-slate-600',  icon:'fa-pencil',       border:'border-slate-200'  },
    'Submitted': { bg:'bg-blue-100',    text:'text-blue-700',   icon:'fa-paper-plane',  border:'border-blue-300'   },
    'Approved':  { bg:'bg-green-100',   text:'text-green-700',  icon:'fa-check-circle', border:'border-green-300'  },
    'Rejected':  { bg:'bg-red-100',     text:'text-red-600',    icon:'fa-times-circle', border:'border-red-300'    },
  };
  var DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // ── Role helpers ──────────────────────────────────────────────
  function getRole()  { try { return window.WorkVolt.user().role || 'Employee'; } catch(e) { return 'Employee'; } }
  function isAdmin()  { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function myUserId() { try { return window.WorkVolt.user().id || ''; } catch(e) { return ''; } }
  function myName()   { try { return window.WorkVolt.user().name || ''; } catch(e) { return ''; } }

  // ── Utilities ─────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
    catch(e) { return d; }
  }
  function fmtDateInput(d) {
    if (!d) return '';
    try { return new Date(d).toISOString().split('T')[0]; } catch(e) { return ''; }
  }
  function fmtHours(h) {
    var n = parseFloat(h) || 0;
    if (!n) return '0h';
    var hrs = Math.floor(n), mins = Math.round((n - hrs) * 60);
    if (!mins) return hrs + 'h';
    return hrs + 'h ' + mins + 'm';
  }
  function fmtMoney(v) {
    return '$' + (parseFloat(v)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u) { return u.id === uid || u.user_id === uid; });
    return u ? (u.name || u.email || uid) : uid;
  }
  function userAvatar(uid, size) {
    size = size || 'w-7 h-7 text-[11px]';
    var colors = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
    var idx = uid ? (uid.charCodeAt(0) % colors.length) : 0;
    var init = (userName(uid)||'?').charAt(0).toUpperCase();
    return '<span class="' + size + ' ' + colors[idx] + ' rounded-full flex items-center justify-center font-bold flex-shrink-0" title="' + esc(userName(uid)) + '">' + init + '</span>';
  }
  function projectName(pid) {
    if (!pid) return '—';
    var p = projectsCache.find(function(p) { return p.id === pid; });
    return p ? (p.name || pid) : pid;
  }
  function calcHours(start, end, breakMins) {
    if (!start || !end) return 0;
    var s = parseTimeStr(normalizeTime(start)), e = parseTimeStr(normalizeTime(end));
    if (s === null || e === null) return 0;
    var diff = (e - s) / 60;
    // Only add 24h for genuine overnight shifts (end is strictly before start).
    // diff === 0 means same time — not overnight, just 0 hours.
    if (diff < 0) diff += 24;
    diff -= (parseFloat(breakMins) || 0) / 60;
    return Math.max(0, Math.round(diff * 100) / 100);
  }
  function parseTimeStr(t) {
    var m = String(t||'').match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (!m) return null;
    var h = parseInt(m[1]), min = parseInt(m[2]);
    var ampm = (m[3]||'').toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return h * 60 + min;
  }
  function normalizeTime(t) {
    if (!t) return '';
    var s = String(t);
    if (s.indexOf('T') !== -1) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          var h = d.getUTCHours(), m = d.getUTCMinutes();
          return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
        }
      } catch(e) {}
    }
    var m2 = s.match(/^(\d{1,2}):(\d{2})/);
    if (m2) return String(parseInt(m2[1])).padStart(2,'0') + ':' + m2[2];
    return '';
  }
  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }
  function getWeekStart(offset) {
    var d = new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay() + (offset * 7));
    return d;
  }
  function isoDate(d) { return d.toISOString().split('T')[0]; }
  function todayStr() { return isoDate(new Date()); }

  // ── Badges ────────────────────────────────────────────────────
  function statusBadge(s) {
    var c = STATUS_CONFIG[s] || STATUS_CONFIG['Draft'];
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + c.bg + ' ' + c.text + '">' +
      '<i class="fas ' + c.icon + ' text-[9px]"></i>' + esc(s||'Draft') + '</span>';
  }
  function billableBadge(b) {
    if (b === 'true' || b === true)
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><i class="fas fa-dollar-sign text-[9px]"></i>Billable</span>';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><i class="fas fa-ban text-[9px]"></i>Non-bill.</span>';
  }
  function overtimeBadge(r) {
    var h = parseFloat(r.total_hours)||0;
    if (h > 8)
      return '<span class="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200"><i class="fas fa-exclamation text-[9px]"></i>OT</span>';
    return '';
  }

  // ── Modal ─────────────────────────────────────────────────────
  var MODAL_ID = 'wv-ts-modal-portal';
  function getPortal() {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el = document.createElement('div'); el.id = MODAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html, maxWidth) {
    maxWidth = maxWidth || '640px';
    getPortal().innerHTML =
      '<div id="ts-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem">' +
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,.25);width:100%;max-width:' + maxWidth + ';max-height:92vh;overflow-y:auto;z-index:9999">' +
          html +
        '</div>' +
      '</div>';
    document.getElementById('ts-backdrop').addEventListener('click', function(e) {
      if (e.target.id === 'ts-backdrop') closeModal();
    });
  }
  function closeModal() { var p = document.getElementById(MODAL_ID); if (p) p.innerHTML = ''; }
  function modalStatus(msg, ok) {
    var el = document.getElementById('ts-modal-status');
    if (!el) return;
    el.innerHTML = msg ? '<div class="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium mb-2 ' +
      (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
      '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i><span>' + esc(msg) + '</span></div>' : '';
  }

  // ── Filtering + Sorting ───────────────────────────────────────
  function allEntries() { return Object.values(sheets); }

  function applyFilters(rows) {
    var me = myUserId();
    if (!isAdmin()) rows = rows.filter(function(r) { return r.user_id === me; });
    if (filters.status)     rows = rows.filter(function(r) { return r.status === filters.status; });
    if (filters.user_id)    rows = rows.filter(function(r) { return r.user_id === filters.user_id; });
    if (filters.project_id) rows = rows.filter(function(r) { return r.project_id === filters.project_id; });
    if (filters.billable)   rows = rows.filter(function(r) { return String(r.billable) === filters.billable; });
    if (_searchVal) {
      var q = _searchVal.toLowerCase();
      rows = rows.filter(function(r) {
        return (r.task||'').toLowerCase().includes(q) ||
               (r.description||'').toLowerCase().includes(q) ||
               userName(r.user_id).toLowerCase().includes(q) ||
               projectName(r.project_id).toLowerCase().includes(q);
      });
    }
    return rows;
  }

  function applySort(rows) {
    return rows.slice().sort(function(a, b) {
      var va = a[sortState.col] || '', vb = b[sortState.col] || '';
      if (sortState.col === 'date') {
        va = new Date(va||0).getTime(); vb = new Date(vb||0).getTime();
      } else if (sortState.col === 'total_hours') {
        va = parseFloat(va)||0; vb = parseFloat(vb)||0;
      } else {
        va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      }
      var cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortState.dir === 'desc' ? -cmp : cmp;
    });
  }

  // ── Stats ─────────────────────────────────────────────────────
  function calcStats(rows) {
    var totalHours = 0, billableHours = 0, pendingCount = 0, overtimeHours = 0;
    rows.forEach(function(r) {
      var h = parseFloat(r.total_hours)||0;
      totalHours += h;
      if (r.billable === 'true' || r.billable === true) billableHours += h;
      if (r.status === 'Submitted') pendingCount++;
      if (h > 8) overtimeHours += (h - 8);
    });
    return { totalHours:totalHours, billableHours:billableHours, pendingCount:pendingCount, overtimeHours:overtimeHours };
  }

  // ── Load data ─────────────────────────────────────────────────
  async function loadData() {
    var el = document.getElementById('ts-content');
    if (el) el.innerHTML = '<div class="flex items-center justify-center py-20 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mr-3"></i>Loading timesheets…</div>';

    try {
      var filter = isAdmin() ? {} : { user_id: myUserId() };
      var hasProjects = (window.INSTALLED_MODULES||[]).some(function(m){ return m.id==='projects'; });

      var results = await Promise.all([
        db.timesheets.list(filter),
        db.users.list(),
        hasProjects ? db.projects.list() : Promise.resolve([]),
      ]);

      sheets = {};
      results[0].forEach(function(r) { sheets[r.id] = r; });
      usersCache    = results[1];
      projectsCache = results[2];
      rerender();
    } catch(e) {
      toast('Failed to load timesheets: ' + e.message, 'error');
      if (el) el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-400"><i class="fas fa-exclamation-triangle text-3xl mb-3 text-amber-400"></i><p class="font-semibold">Could not load timesheets</p><p class="text-sm mt-1">' + esc(e.message) + '</p></div>';
    }
  }

  function rerender() {
    var filtered = applySort(applyFilters(allEntries()));
    renderStats(filtered);
    if (activeView === 'weekly')        renderWeekly(filtered);
    else if (activeView === 'calendar') renderCalendar(filtered);
    else                                renderList(filtered);
  }

  // ── Main shell ────────────────────────────────────────────────
  function render() {
    var userOpts = isAdmin()
      ? '<option value="">All Employees</option>' + usersCache.map(function(u) {
          var uid = u.id || u.user_id;
          return '<option value="' + esc(uid) + '"' + (filters.user_id===uid?' selected':'') + '>' + esc(u.name||u.email||uid) + '</option>';
        }).join('')
      : '';

    var projOpts = '<option value="">All Projects</option>' + projectsCache.map(function(p) {
      return '<option value="' + esc(p.id) + '"' + (filters.project_id===p.id?' selected':'') + '>' + esc(p.name||p.id) + '</option>';
    }).join('');

    container.innerHTML =
      '<div class="flex flex-col h-full" style="font-family:\'DM Sans\',sans-serif">' +

        // ── Header ─────────────────────────────────────────────
        '<div class="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">' +
          '<div class="flex items-center justify-between gap-4 mb-4">' +
            '<div>' +
              '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">' +
                '<span class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center"><i class="fas fa-clock text-amber-600 text-sm"></i></span>' +
                'Timesheets' +
              '</h1>' +
              '<p class="text-xs text-slate-400 mt-0.5">Track, submit and approve work hours</p>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<div id="ts-timer-pill" class="hidden items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">' +
                '<span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>' +
                '<span id="ts-timer-display" class="text-xs font-bold text-red-600 font-mono">00:00:00</span>' +
                '<button id="ts-timer-stop" class="text-xs font-bold text-red-600 hover:text-red-800 border-none bg-transparent cursor-pointer">Stop</button>' +
              '</div>' +
              '<button id="ts-timer-start-btn" class="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shadow-red-200">' +
                '<i class="fas fa-play text-[10px]"></i> Start Timer' +
              '</button>' +
              '<button id="ts-add-btn" class="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shadow-amber-200">' +
                '<i class="fas fa-plus text-[10px]"></i> Log Time' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div id="ts-stats-row" class="grid grid-cols-4 gap-3 mb-4"></div>' +

          '<div class="flex items-center gap-2 flex-wrap">' +
            '<div class="relative flex-1 min-w-[160px] max-w-xs">' +
              '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none"></i>' +
              '<input id="ts-search" type="text" placeholder="Search timesheets…" value="' + esc(_searchVal) + '" ' +
                'class="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:border-amber-400" style="font-family:inherit">' +
            '</div>' +
            '<select id="ts-filter-status" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-amber-400" style="font-family:inherit">' +
              '<option value="">All Statuses</option>' +
              STATUSES.map(function(s) { return '<option value="' + s + '"' + (filters.status===s?' selected':'') + '>' + s + '</option>'; }).join('') +
            '</select>' +
            (isAdmin() ? '<select id="ts-filter-user" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-amber-400" style="font-family:inherit">' + userOpts + '</select>' : '') +
            '<select id="ts-filter-project" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-amber-400" style="font-family:inherit">' + projOpts + '</select>' +
            '<select id="ts-filter-billable" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-amber-400" style="font-family:inherit">' +
              '<option value="">All Types</option>' +
              '<option value="true"'  + (filters.billable==='true' ?' selected':'') + '>Billable</option>' +
              '<option value="false"' + (filters.billable==='false'?' selected':'') + '>Non-Billable</option>' +
            '</select>' +
            '<div class="flex-1"></div>' +
            '<div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">' +
              [['list','fa-list'],['weekly','fa-calendar-week'],['calendar','fa-calendar-alt']].map(function(v) {
                return '<button data-view="' + v[0] + '" title="' + v[0] + '" class="w-8 h-7 rounded-lg flex items-center justify-center text-xs transition-all ' +
                  (activeView===v[0] ? 'bg-white shadow-sm text-amber-600 font-bold' : 'text-slate-500 hover:text-slate-700') + '">' +
                  '<i class="fas ' + v[1] + '"></i></button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div id="ts-content" class="flex-1 overflow-y-auto px-6 py-4">' +
          '<div class="flex items-center justify-center py-20 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mr-3"></i>Loading…</div>' +
        '</div>' +

      '</div>';

    // Bind events
    document.getElementById('ts-search').addEventListener('input', function() {
      clearTimeout(_searchTimer);
      var v = this.value;
      _searchTimer = setTimeout(function() { _searchVal = v; rerender(); }, 300);
    });
    document.getElementById('ts-filter-status').addEventListener('change', function() { filters.status = this.value; rerender(); });
    if (document.getElementById('ts-filter-user')) {
      document.getElementById('ts-filter-user').addEventListener('change', function() { filters.user_id = this.value; rerender(); });
    }
    document.getElementById('ts-filter-project').addEventListener('change', function() { filters.project_id = this.value; rerender(); });
    document.getElementById('ts-filter-billable').addEventListener('change', function() { filters.billable = this.value; rerender(); });

    document.querySelectorAll('[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activeView = this.dataset.view;
        sessionStorage.setItem('ts_view', activeView);
        render();
      });
    });

    document.getElementById('ts-add-btn').addEventListener('click', function() { openEntryForm(null); });
    document.getElementById('ts-timer-start-btn').addEventListener('click', function() { openTimerForm(); });
    var stopBtn = document.getElementById('ts-timer-stop');
    if (stopBtn) stopBtn.addEventListener('click', stopTimer);

    restoreTimer();
    loadData();
  }

  // ── Stats row ─────────────────────────────────────────────────
  function renderStats(rows) {
    var el = document.getElementById('ts-stats-row');
    if (!el) return;
    var s = calcStats(rows);
    function statCard(icon, iconBg, label, value, sub) {
      return '<div class="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">' +
        '<div class="w-9 h-9 ' + iconBg + ' rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas ' + icon + ' text-sm"></i></div>' +
        '<div><p class="text-xs text-slate-400 font-medium">' + label + '</p>' +
        '<p class="text-lg font-extrabold text-slate-900 leading-none mt-0.5">' + value + '</p>' +
        (sub ? '<p class="text-[10px] text-slate-400 mt-0.5">' + sub + '</p>' : '') + '</div></div>';
    }
    el.innerHTML =
      statCard('fa-clock',            'bg-amber-100 text-amber-600',  'Total Hours',      fmtHours(s.totalHours),    rows.length + ' entries') +
      statCard('fa-dollar-sign',      'bg-green-100 text-green-600',  'Billable Hours',   fmtHours(s.billableHours), s.totalHours ? Math.round(s.billableHours/s.totalHours*100)+'% of total' : '—') +
      statCard('fa-hourglass-half',   'bg-blue-100 text-blue-600',    'Pending Approval', s.pendingCount + ' entries', s.pendingCount ? 'awaiting review' : 'all clear') +
      statCard('fa-exclamation-triangle','bg-orange-100 text-orange-600','Overtime',      fmtHours(s.overtimeHours), s.overtimeHours > 0 ? 'above 8h/day' : 'no overtime');
  }

  // ── List View ─────────────────────────────────────────────────
  function renderList(rows) {
    var el = document.getElementById('ts-content');
    if (!el) return;

    if (!rows.length) {
      el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-300">' +
        '<i class="fas fa-clock text-5xl mb-4 opacity-30"></i>' +
        '<p class="font-semibold text-slate-500">No timesheet entries found</p>' +
        '<p class="text-sm mt-1">Log your first entry or clear your filters.</p></div>';
      return;
    }

    function thSort(col, label) {
      var active = sortState.col === col;
      var icon = active ? (sortState.dir==='asc'?'fa-sort-up':'fa-sort-down') : 'fa-sort';
      return '<th class="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap text-xs font-bold text-slate-500 uppercase tracking-wider" data-sort="' + col + '">' +
        '<span class="flex items-center gap-1">' + label + '<i class="fas ' + icon + ' text-[9px] ' + (active?'text-amber-500':'text-slate-300') + '"></i></span></th>';
    }

    var html =
      '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">' +
      '<table class="w-full text-sm border-collapse">' +
      '<thead class="bg-slate-50 border-b border-slate-200"><tr>' +
        thSort('date','Date') +
        (isAdmin() ? '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Employee</th>' : '') +
        thSort('project_id','Project') +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Task / Description</th>' +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Time</th>' +
        thSort('total_hours','Hours') +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Type</th>' +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Status</th>' +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Actions</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function(r) {
      var canEdit    = r.user_id === myUserId() || isAdmin();
      var canApprove = isAdmin() && r.status === 'Submitted';
      var hours = parseFloat(r.total_hours)||0;
      var isOT  = hours > 8;

      html +=
        '<tr class="border-t border-slate-100 hover:bg-amber-50/30 transition-colors group cursor-pointer ts-row" data-id="' + esc(r.id) + '">' +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            '<div class="flex flex-col">' +
              '<span class="text-xs font-bold text-slate-900">' + fmtDate(r.date) + '</span>' +
            '</div>' +
          '</td>' +
          (isAdmin() ? '<td class="px-4 py-3 whitespace-nowrap"><div class="flex items-center gap-2">' +
            userAvatar(r.user_id,'w-6 h-6 text-[10px]') +
            '<span class="text-xs text-slate-700 font-medium truncate" style="max-width:90px">' + esc(userName(r.user_id)) + '</span>' +
          '</div></td>' : '') +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            (r.project_id ? '<span class="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-semibold">' + esc(projectName(r.project_id)) + '</span>' : '<span class="text-xs text-slate-300">—</span>') +
          '</td>' +
          '<td class="px-4 py-3" style="max-width:220px">' +
            '<div class="font-semibold text-slate-900 text-xs truncate">' + esc(r.task||'—') + '</div>' +
            (r.description ? '<div class="text-[11px] text-slate-400 truncate mt-0.5">' + esc(r.description) + '</div>' : '') +
          '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500">' +
            (r.start_time && r.end_time
              ? '<span class="font-mono">' + esc(normalizeTime(r.start_time)) + ' – ' + esc(normalizeTime(r.end_time)) + '</span>' +
                (r.break_minutes ? '<div class="text-[10px] text-slate-400">' + r.break_minutes + 'm break</div>' : '')
              : '<span class="text-slate-300">—</span>') +
          '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="text-sm font-extrabold ' + (isOT?'text-orange-600':'text-slate-900') + '">' + fmtHours(hours) + '</span>' +
              overtimeBadge(r) +
            '</div>' +
          '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' + billableBadge(r.billable) + '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' + statusBadge(r.status||'Draft') + '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            '<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">' +
              (canEdit && (r.status==='Draft'||r.status==='Rejected')
                ? '<button class="ts-action w-7 h-7 rounded-lg border-none bg-transparent hover:bg-blue-50 hover:text-blue-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="edit" data-id="' + esc(r.id) + '" title="Edit"><i class="fas fa-pencil text-xs"></i></button>' : '') +
              (r.status==='Draft' && r.user_id===myUserId()
                ? '<button class="ts-action w-7 h-7 rounded-lg border-none bg-transparent hover:bg-amber-50 hover:text-amber-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="submit" data-id="' + esc(r.id) + '" title="Submit"><i class="fas fa-paper-plane text-xs"></i></button>' : '') +
              (canApprove
                ? '<button class="ts-action w-7 h-7 rounded-lg border-none bg-transparent hover:bg-green-50 hover:text-green-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="approve" data-id="' + esc(r.id) + '" title="Approve"><i class="fas fa-check text-xs"></i></button>' +
                  '<button class="ts-action w-7 h-7 rounded-lg border-none bg-transparent hover:bg-red-50 hover:text-red-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="reject" data-id="' + esc(r.id) + '" title="Reject"><i class="fas fa-times text-xs"></i></button>' : '') +
              (canEdit
                ? '<button class="ts-action w-7 h-7 rounded-lg border-none bg-transparent hover:bg-red-50 hover:text-red-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="delete" data-id="' + esc(r.id) + '" title="Delete"><i class="fas fa-trash text-xs"></i></button>' : '') +
            '</div>' +
          '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.ts-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('.ts-action')) return;
        var id = this.dataset.id;
        if (sheets[id]) openDetail(sheets[id]);
      });
    });

    el.querySelectorAll('.ts-action').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = this.dataset.id, action = this.dataset.action;
        if (action === 'edit')    openEntryForm(sheets[id]);
        if (action === 'submit')  updateStatus(id, 'Submitted');
        if (action === 'approve') updateStatus(id, 'Approved');
        if (action === 'reject')  openRejectModal(id);
        if (action === 'delete')  deleteEntry(id);
      });
    });

    el.querySelectorAll('[data-sort]').forEach(function(th) {
      th.addEventListener('click', function() {
        var col = this.dataset.sort;
        if (sortState.col === col) sortState.dir = sortState.dir==='asc'?'desc':'asc';
        else { sortState.col = col; sortState.dir = 'asc'; }
        rerender();
      });
    });
  }

  // ── Weekly View ───────────────────────────────────────────────
  function renderWeekly(rows) {
    var el = document.getElementById('ts-content');
    if (!el) return;

    var weekStart = getWeekStart(_weekOffset);
    var weekDays = [];
    for (var i=0; i<7; i++) {
      var d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }
    var weekEnd = weekDays[6];
    var weekLabel = MONTHS[weekStart.getMonth()] + ' ' + weekStart.getDate() + ' – ' +
      (weekEnd.getMonth()!==weekStart.getMonth() ? MONTHS[weekEnd.getMonth()] + ' ' : '') +
      weekEnd.getDate() + ', ' + weekEnd.getFullYear();

    var byDate = {};
    rows.forEach(function(r) { var d=(r.date||'').split('T')[0]; if(!byDate[d]) byDate[d]=[]; byDate[d].push(r); });

    var todayIso = todayStr();
    var html = '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">' +
      '<div class="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">' +
        '<button id="ts-week-prev" class="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 border-none bg-transparent cursor-pointer"><i class="fas fa-chevron-left text-xs"></i></button>' +
        '<span class="text-sm font-bold text-slate-800">' + esc(weekLabel) + '</span>' +
        '<div class="flex gap-2">' +
          '<button id="ts-week-today" class="text-xs px-3 py-1.5 bg-white border border-slate-200 hover:border-amber-400 text-slate-600 font-semibold rounded-lg cursor-pointer" style="border:1px solid #e2e8f0">Today</button>' +
          '<button id="ts-week-next" class="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 border-none bg-transparent cursor-pointer"><i class="fas fa-chevron-right text-xs"></i></button>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);min-height:400px">';

    weekDays.forEach(function(d) {
      var iso = isoDate(d);
      var dayEntries = byDate[iso] || [];
      var dayHours = dayEntries.reduce(function(s,r){ return s+(parseFloat(r.total_hours)||0); }, 0);
      var isToday  = iso === todayIso;
      var isWeekend = d.getDay()===0 || d.getDay()===6;

      html += '<div class="border-r border-slate-100 last:border-r-0 ' + (isWeekend?'bg-slate-50/50':'') + '">' +
        '<div class="px-3 py-2 border-b border-slate-100 ' + (isToday?'bg-amber-50':'bg-white') + '">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<div class="text-[10px] font-bold uppercase tracking-wider ' + (isToday?'text-amber-600':'text-slate-400') + '">' + DAYS[d.getDay()] + '</div>' +
              '<div class="text-lg font-extrabold ' + (isToday?'text-amber-600':'text-slate-800') + '">' + d.getDate() + '</div>' +
            '</div>' +
            (dayHours>0 ? '<span class="text-[10px] font-bold ' + (dayHours>8?'text-orange-600':'text-slate-500') + ' bg-slate-100 px-1.5 py-0.5 rounded">' + fmtHours(dayHours) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="p-2 flex flex-col gap-1.5">' +
          dayEntries.map(function(r) {
            var cfg = STATUS_CONFIG[r.status||'Draft'] || STATUS_CONFIG['Draft'];
            return '<div class="ts-week-card p-2 rounded-lg border cursor-pointer hover:shadow-sm transition-all ' + cfg.border + ' bg-white" data-id="' + esc(r.id) + '">' +
              '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-bold ' + cfg.text + '">' + esc(r.status||'Draft') + '</span><span class="text-[10px] font-bold text-slate-700">' + fmtHours(r.total_hours) + '</span></div>' +
              '<div class="text-[11px] font-semibold text-slate-800 truncate">' + esc(r.task||'—') + '</div>' +
              (r.project_id ? '<div class="text-[10px] text-purple-600 truncate mt-0.5">' + esc(projectName(r.project_id)) + '</div>' : '') +
            '</div>';
          }).join('') +
          '<button class="ts-week-add w-full mt-1 py-1.5 text-[10px] font-semibold text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg border border-dashed border-slate-200 hover:border-amber-300 transition-all border-none bg-transparent cursor-pointer" data-date="' + esc(iso) + '">' +
            '<i class="fas fa-plus text-[9px] mr-1"></i>Add' +
          '</button>' +
        '</div>' +
      '</div>';
    });

    html += '</div></div>';
    el.innerHTML = html;

    document.getElementById('ts-week-prev').addEventListener('click', function() { _weekOffset--; rerender(); });
    document.getElementById('ts-week-next').addEventListener('click', function() { _weekOffset++; rerender(); });
    document.getElementById('ts-week-today').addEventListener('click', function() { _weekOffset=0; rerender(); });

    el.querySelectorAll('.ts-week-card').forEach(function(card) {
      card.addEventListener('click', function() { var id=this.dataset.id; if(sheets[id]) openDetail(sheets[id]); });
    });
    el.querySelectorAll('.ts-week-add').forEach(function(btn) {
      btn.addEventListener('click', function() { openEntryForm(null, this.dataset.date); });
    });
  }

  // ── Calendar View ─────────────────────────────────────────────
  function renderCalendar(rows) {
    var el = document.getElementById('ts-content');
    if (!el) return;

    var now = new Date();
    var calYear = now.getFullYear(), calMonth = now.getMonth();

    var byDate = {};
    rows.forEach(function(r) { var d=(r.date||'').split('T')[0]; if(!byDate[d]) byDate[d]=[]; byDate[d].push(r); });

    function buildCalendar() {
      var firstDay = new Date(calYear, calMonth, 1).getDay();
      var daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
      var todayIso = todayStr();
      var cells = '';
      for (var i=0; i<firstDay; i++) cells += '<div class="min-h-[80px] border-r border-b border-slate-100 bg-slate-50/30"></div>';
      for (var day=1; day<=daysInMonth; day++) {
        var iso = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        var entries = byDate[iso] || [];
        var dayHours = entries.reduce(function(s,r){ return s+(parseFloat(r.total_hours)||0); }, 0);
        var isToday = iso === todayIso;
        cells += '<div class="min-h-[80px] border-r border-b border-slate-100 p-1.5 hover:bg-amber-50/30 transition-colors ' + (isToday?'bg-amber-50':'') + '">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<span class="text-xs font-bold ' + (isToday?'text-amber-600 bg-amber-100 w-5 h-5 rounded-full flex items-center justify-center':'text-slate-600') + '">' + day + '</span>' +
            (dayHours>0 ? '<span class="text-[9px] font-bold ' + (dayHours>8?'text-orange-500':'text-slate-400') + '">' + fmtHours(dayHours) + '</span>' : '') +
          '</div>' +
          entries.slice(0,2).map(function(r) {
            var cfg = STATUS_CONFIG[r.status||'Draft'];
            return '<div class="ts-cal-card text-[9px] font-semibold px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ' + cfg.bg + ' ' + cfg.text + '" data-id="' + esc(r.id) + '">' +
              esc(r.task||'Entry') + ' · ' + fmtHours(r.total_hours) + '</div>';
          }).join('') +
          (entries.length>2 ? '<div class="text-[9px] text-slate-400 font-semibold">+' + (entries.length-2) + ' more</div>' : '') +
          '<button class="ts-cal-add w-full mt-0.5 text-[9px] text-slate-300 hover:text-amber-500 border-none bg-transparent cursor-pointer text-left" data-date="' + esc(iso) + '">+ Add</button>' +
        '</div>';
      }
      return '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">' +
        '<div class="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">' +
          '<button id="ts-cal-prev" class="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 border-none bg-transparent cursor-pointer"><i class="fas fa-chevron-left text-xs"></i></button>' +
          '<span class="text-sm font-bold text-slate-800">' + MONTHS[calMonth] + ' ' + calYear + '</span>' +
          '<button id="ts-cal-next" class="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 border-none bg-transparent cursor-pointer"><i class="fas fa-chevron-right text-xs"></i></button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr)">' +
          DAYS.map(function(d) { return '<div class="px-2 py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">' + d + '</div>'; }).join('') +
          cells +
        '</div></div>';
    }

    el.innerHTML = buildCalendar();

    function bindCal() {
      el.querySelectorAll('.ts-cal-card').forEach(function(c) {
        c.addEventListener('click', function() { var id=this.dataset.id; if(sheets[id]) openDetail(sheets[id]); });
      });
      el.querySelectorAll('.ts-cal-add').forEach(function(b) {
        b.addEventListener('click', function() { openEntryForm(null, this.dataset.date); });
      });
      document.getElementById('ts-cal-prev').addEventListener('click', function() {
        calMonth--; if(calMonth<0){ calMonth=11; calYear--; } el.innerHTML=buildCalendar(); bindCal();
      });
      document.getElementById('ts-cal-next').addEventListener('click', function() {
        calMonth++; if(calMonth>11){ calMonth=0; calYear++; } el.innerHTML=buildCalendar(); bindCal();
      });
    }
    bindCal();
  }

  // ── Detail Modal ──────────────────────────────────────────────
  function openDetail(r) {
    var canEdit    = r.user_id === myUserId() || isAdmin();
    var canSubmit  = r.status === 'Draft' && r.user_id === myUserId();
    var canApprove = isAdmin() && r.status === 'Submitted';
    var hours = parseFloat(r.total_hours)||0;

    function metaRow(label, val) {
      return '<div class="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">' +
        '<span class="text-xs text-slate-400 font-medium">' + label + '</span>' +
        '<span class="text-xs font-semibold text-slate-700 text-right">' + val + '</span></div>';
    }

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-start gap-3">' +
        '<div class="flex-1">' +
          '<div class="flex items-center gap-2 flex-wrap mb-1.5">' +
            statusBadge(r.status||'Draft') + billableBadge(r.billable) + overtimeBadge(r) +
          '</div>' +
          '<h2 class="text-lg font-extrabold text-slate-900">' + esc(r.task||'Timesheet Entry') + '</h2>' +
          '<p class="text-sm text-slate-500 mt-0.5">' + fmtDate(r.date) + '</p>' +
        '</div>' +
        '<button id="ts-det-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 260px;min-height:320px">' +

        '<div class="px-6 py-5 border-r border-slate-100">' +
          (r.description ? '<div class="mb-4"><p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2">Description</p><p class="text-sm text-slate-700 leading-relaxed">' + esc(r.description) + '</p></div>' : '') +
          '<div class="bg-slate-50 rounded-xl p-4 mb-4">' +
            '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Hours Breakdown</p>' +
            '<div class="grid grid-cols-3 gap-3 text-center">' +
              '<div><div class="text-2xl font-extrabold text-slate-900">' + esc(normalizeTime(r.start_time)||'—') + '</div><div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">Start</div></div>' +
              '<div><div class="text-2xl font-extrabold text-amber-600">' + fmtHours(hours) + '</div><div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">Total</div></div>' +
              '<div><div class="text-2xl font-extrabold text-slate-900">' + esc(normalizeTime(r.end_time)||'—') + '</div><div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">End</div></div>' +
            '</div>' +
            (r.break_minutes ? '<div class="text-center mt-2 text-xs text-slate-400"><i class="fas fa-coffee mr-1"></i>' + esc(r.break_minutes) + ' min break deducted</div>' : '') +
          '</div>' +
          (hours>8 ? '<div class="flex gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-700 mb-4">' +
            '<i class="fas fa-exclamation-triangle text-orange-400 mt-0.5 flex-shrink-0"></i>' +
            '<div><strong>Overtime Detected:</strong> ' + fmtHours(hours-8) + ' above standard 8-hour day.' +
            (r.billable==='true'||r.billable===true ? ' Billable overtime applies.' : '') + '</div></div>' : '') +
          (r.notes ? '<div class="mt-4"><p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2">Notes</p><p class="text-sm text-slate-600">' + esc(r.notes) + '</p></div>' : '') +
          (r.approver_notes ? '<div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl"><p class="text-xs font-bold text-red-700 mb-1"><i class="fas fa-comment mr-1"></i>Reviewer Note</p><p class="text-xs text-red-600">' + esc(r.approver_notes) + '</p></div>' : '') +

          '<div class="flex flex-col gap-2 mt-6">' +
            (canEdit && (r.status==='Draft'||r.status==='Rejected') ? '<button id="ts-det-edit" class="btn-primary w-full text-sm"><i class="fas fa-pencil mr-1.5 text-xs"></i>Edit Entry</button>' : '') +
            (canSubmit ? '<button id="ts-det-submit" class="w-full text-sm py-2 px-4 font-bold rounded-xl border-none cursor-pointer" style="background:#f59e0b;color:#fff"><i class="fas fa-paper-plane mr-1.5 text-xs"></i>Submit for Approval</button>' : '') +
            (canApprove ? '<div class="flex gap-2">' +
              '<button id="ts-det-approve" class="flex-1 text-sm py-2 px-3 font-bold rounded-xl border-none cursor-pointer" style="background:#22c55e;color:#fff"><i class="fas fa-check mr-1 text-xs"></i>Approve</button>' +
              '<button id="ts-det-reject"  class="flex-1 text-sm py-2 px-3 font-bold rounded-xl border-none cursor-pointer" style="background:#ef4444;color:#fff"><i class="fas fa-times mr-1 text-xs"></i>Reject</button>' +
            '</div>' : '') +
            (isAdmin() ? '<button id="ts-det-delete" class="btn-secondary w-full text-sm text-red-500 hover:bg-red-50"><i class="fas fa-trash mr-1.5 text-xs"></i>Delete</button>' : '') +
          '</div>' +
        '</div>' +

        '<div class="px-5 py-5 bg-slate-50/50 flex flex-col">' +
          '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">Details</p>' +
          metaRow('Employee', '<span class="flex items-center gap-1.5">' + userAvatar(r.user_id,'w-5 h-5 text-[10px]') + esc(userName(r.user_id)) + '</span>') +
          metaRow('Date', fmtDate(r.date)) +
          metaRow('Project', r.project_id ? '<span class="bg-purple-50 text-purple-700 px-1.5 py-px rounded font-semibold text-xs">' + esc(projectName(r.project_id)) + '</span>' : '<span class="text-slate-300">—</span>') +
          metaRow('Status', statusBadge(r.status||'Draft')) +
          metaRow('Type', billableBadge(r.billable)) +
          metaRow('Hours', '<span class="font-bold ' + (hours>8?'text-orange-600':'text-slate-800') + '">' + fmtHours(hours) + '</span>') +
          (r.billable_rate ? metaRow('Rate', fmtMoney(r.billable_rate) + '/hr') : '') +
          (r.billable_rate ? metaRow('Billable Value', '<span class="text-green-600 font-bold">' + fmtMoney(hours*(parseFloat(r.billable_rate)||0)) + '</span>') : '') +
          metaRow('Created', fmtDate(r.created_at)) +
          (r.approved_by ? metaRow('Approved By', esc(userName(r.approved_by))) : '') +
        '</div>' +

      '</div>';

    showModal(html, '880px');
    document.getElementById('ts-det-close').addEventListener('click', closeModal);
    var eb=document.getElementById('ts-det-edit'), sb=document.getElementById('ts-det-submit');
    var ab=document.getElementById('ts-det-approve'), rb=document.getElementById('ts-det-reject');
    var db_=document.getElementById('ts-det-delete');
    if (eb) eb.addEventListener('click', function() { closeModal(); openEntryForm(r); });
    if (sb) sb.addEventListener('click', function() { closeModal(); updateStatus(r.id, 'Submitted'); });
    if (ab) ab.addEventListener('click', function() { closeModal(); updateStatus(r.id, 'Approved'); });
    if (rb) rb.addEventListener('click', function() { openRejectModal(r.id); });
    if (db_) db_.addEventListener('click', function() { closeModal(); deleteEntry(r.id); });
  }

  // ── Entry Form ────────────────────────────────────────────────
  function openEntryForm(entry, prefillDate) {
    var isEdit = !!entry;
    var r = entry || {};
    var today = isEdit ? (fmtDateInput(r.date)||todayStr()) : (prefillDate||todayStr());
    var uid = r.user_id || myUserId();
    // For timer-sourced entries start/end are exact — don't substitute defaults.
    var isFromTimer = r._timer_hours != null;
    var startVal = normalizeTime(r.start_time) || (isFromTimer ? '' : '09:00');
    var endVal   = normalizeTime(r.end_time)   || (isFromTimer ? '' : '17:00');

    var userSelectHtml = isAdmin()
      ? '<div><label class="ts-label">Employee</label>' +
        '<select id="tf-user" class="ts-input">' +
          usersCache.map(function(u) {
            var id = u.id||u.user_id;
            return '<option value="' + esc(id) + '"' + (uid===id?' selected':'') + '>' + esc(u.name||u.email||id) + '</option>';
          }).join('') +
        '</select></div>'
      : '<input type="hidden" id="tf-user" value="' + esc(uid) + '">';

    var projSelectHtml = '<select id="tf-project" class="ts-input"><option value="">No Project</option>' +
      projectsCache.map(function(p) {
        return '<option value="' + esc(p.id) + '"' + (r.project_id===p.id?' selected':'') + '>' + esc(p.name||p.id) + '</option>';
      }).join('') + '</select>';

    var html =
      '<style>.ts-label{display:block;font-size:.75rem;font-weight:700;color:#64748b;margin-bottom:.375rem;text-transform:uppercase;letter-spacing:.05em}' +
      '.ts-input{width:100%;padding:.55rem .75rem;border:1px solid #e2e8f0;border-radius:.625rem;font-size:.875rem;color:#1e293b;outline:none;font-family:inherit;background:#fff;box-sizing:border-box}' +
      '.ts-input:focus{border-color:#f59e0b;box-shadow:0 0 0 2px rgba(245,158,11,.15)}</style>' +
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900">' + (isEdit?'Edit Time Entry':'Log Time') + '</h3>' +
        '<button id="tf-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5">' +
        '<input type="hidden" id="tf-timer-hours" value="">' +
        '<div id="ts-modal-status"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">' +
          userSelectHtml +
          '<div><label class="ts-label">Date</label><input id="tf-date" type="date" class="ts-input" value="' + esc(today) + '"></div>' +
          '<div><label class="ts-label">Start Time</label><input id="tf-start" type="time" class="ts-input" value="' + esc(startVal) + '"></div>' +
          '<div><label class="ts-label">End Time</label><input id="tf-end" type="time" class="ts-input" value="' + esc(endVal) + '"></div>' +
          '<div><label class="ts-label">Break (minutes)</label><input id="tf-break" type="number" min="0" max="480" class="ts-input" value="' + esc(r.break_minutes||'0') + '" placeholder="0"></div>' +
          '<div><label class="ts-label">Total Hours (auto)</label>' +
            '<div class="ts-input flex items-center gap-2 font-bold text-amber-600" id="tf-hours-display" style="background:#fffbeb;border-color:#fde68a">' +
              '<i class="fas fa-clock text-xs"></i><span id="tf-hours-val">' + fmtHours(r.total_hours||0) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mt-4 grid grid-cols-2 gap-4">' +
          '<div><label class="ts-label">Project</label>' + projSelectHtml + '</div>' +
          '<div><label class="ts-label">Billable</label>' +
            '<select id="tf-billable" class="ts-input">' +
              '<option value="false"' + (r.billable!=='true'&&r.billable!==true?' selected':'') + '>Non-Billable</option>' +
              '<option value="true"'  + (r.billable==='true'||r.billable===true?' selected':'') + '>Billable</option>' +
            '</select>' +
          '</div>' +
          '<div class="col-span-2"><label class="ts-label">Task / Activity <span style="color:#ef4444">*</span></label>' +
            '<input id="tf-task" type="text" class="ts-input" value="' + esc(r.task||'') + '" placeholder="What did you work on?"></div>' +
          '<div class="col-span-2"><label class="ts-label">Description</label>' +
            '<textarea id="tf-desc" rows="2" class="ts-input" placeholder="Optional details…" style="resize:vertical">' + esc(r.description||'') + '</textarea></div>' +
          '<div class="col-span-2" id="tf-rate-row" style="display:' + (r.billable==='true'||r.billable===true?'block':'none') + '">' +
            '<label class="ts-label">Billable Rate ($/hr)</label>' +
            '<input id="tf-rate" type="number" min="0" class="ts-input" value="' + esc(r.billable_rate||'') + '" placeholder="0.00">' +
          '</div>' +
          '<div class="col-span-2"><label class="ts-label">Internal Notes</label>' +
            '<textarea id="tf-notes" rows="2" class="ts-input" placeholder="Private notes…" style="resize:vertical">' + esc(r.notes||'') + '</textarea></div>' +
        '</div>' +
        '<div class="flex gap-3 mt-5">' +
          '<button id="tf-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="tf-save" class="btn-primary flex-1"><i class="fas fa-save mr-1.5 text-xs"></i>' + (isEdit?'Save Changes':'Log Entry') + '</button>' +
        '</div>' +
      '</div>';

    showModal(html, '640px');

    // Restore timer-elapsed hours if present.
    // Set the hidden field AND the display BEFORE wiring up recalcHours so
    // the initial recalcHours() call below doesn't clobber the timer value.
    var hasTimerHours = r._timer_hours != null;
    if (hasTimerHours) {
      var tf = document.getElementById('tf-timer-hours');
      if (tf) tf.value = String(r._timer_hours);
      var tv = document.getElementById('tf-hours-val');
      if (tv) tv.textContent = fmtHours(r._timer_hours);
    }

    function recalcHours() {
      // If this entry came from the timer, the hidden field holds the authoritative
      // elapsed hours — only override it if the user manually changes the time inputs.
      var timerEl = document.getElementById('tf-timer-hours');
      var timerVal = timerEl ? parseFloat(timerEl.value) : NaN;
      var s = document.getElementById('tf-start').value;
      var e = document.getElementById('tf-end').value;
      var b = document.getElementById('tf-break').value;
      var h;
      if (!isNaN(timerVal) && timerVal >= 0 && s === startVal && e === endVal) {
        // Time inputs haven't been changed yet — keep the precise timer value.
        h = timerVal;
      } else {
        // User edited the times manually — clear timer override and recalculate.
        if (timerEl) timerEl.value = '';
        h = calcHours(s, e, b);
      }
      var el = document.getElementById('tf-hours-val');
      if (el) el.textContent = fmtHours(h);
    }
    document.getElementById('tf-start').addEventListener('change', recalcHours);
    document.getElementById('tf-end').addEventListener('change', recalcHours);
    document.getElementById('tf-break').addEventListener('input', recalcHours);
    // Only auto-run recalc on open when there is no timer value to preserve.
    if (!hasTimerHours) recalcHours();

    document.getElementById('tf-billable').addEventListener('change', function() {
      var rr = document.getElementById('tf-rate-row');
      if (rr) rr.style.display = this.value==='true' ? 'block' : 'none';
    });

    document.getElementById('tf-close').addEventListener('click', closeModal);
    document.getElementById('tf-cancel').addEventListener('click', closeModal);
    document.getElementById('tf-save').addEventListener('click', function() { submitForm(isEdit ? r.id : null); });
  }

  // ── Timer form ────────────────────────────────────────────────
  function openTimerForm() {
    var projSelectHtml = '<select id="timer-project" class="ts-input" style="border:1px solid #e2e8f0;border-radius:.625rem;padding:.5rem .75rem;font-size:.875rem;width:100%;font-family:inherit;margin-bottom:.75rem">' +
      '<option value="">No Project</option>' +
      projectsCache.map(function(p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.name||p.id) + '</option>';
      }).join('') + '</select>';

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>Start Timer</h3>' +
        '<button id="timer-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5">' +
        '<p class="text-xs text-slate-500 mb-4">The timer will run until you stop it. You\'ll be prompted to save the entry.</p>' +
        '<label style="display:block;font-size:.75rem;font-weight:700;color:#64748b;margin-bottom:.375rem;text-transform:uppercase;letter-spacing:.05em">Project</label>' +
        projSelectHtml +
        '<label style="display:block;font-size:.75rem;font-weight:700;color:#64748b;margin-bottom:.375rem;text-transform:uppercase;letter-spacing:.05em">Task</label>' +
        '<input id="timer-task" type="text" placeholder="Task description…" style="width:100%;padding:.55rem .75rem;border:1px solid #e2e8f0;border-radius:.625rem;font-size:.875rem;font-family:inherit;margin-bottom:1.25rem;box-sizing:border-box;outline:none">' +
        '<div class="flex gap-3">' +
          '<button id="timer-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="timer-go" class="flex-1 py-2.5 px-4 font-bold rounded-xl border-none cursor-pointer flex items-center justify-center gap-2" style="background:#ef4444;color:#fff"><i class="fas fa-play text-xs"></i>Start Timer</button>' +
        '</div>' +
      '</div>';

    showModal(html, '420px');
    document.getElementById('timer-close').addEventListener('click', closeModal);
    document.getElementById('timer-cancel').addEventListener('click', closeModal);
    document.getElementById('timer-go').addEventListener('click', function() {
      var task = document.getElementById('timer-task').value.trim();
      var proj = document.getElementById('timer-project').value;
      startTimer(task, proj);
      closeModal();
    });
  }

  function startTimer(task, projId) {
    _timerStart = new Date();
    _timerEntry = { task: task, project_id: projId, user_id: myUserId() };
    try { localStorage.setItem('wv_ts_timer_' + myUserId(), JSON.stringify({ start: _timerStart.toISOString(), task: task, project_id: projId })); } catch(e) {}
    updateTimerUI(true);
    _timerTick = setInterval(tickTimer, 1000);
  }

  function restoreTimer() {
    try {
      var saved = localStorage.getItem('wv_ts_timer_' + myUserId());
      if (!saved) return;
      var obj = JSON.parse(saved);
      _timerStart = new Date(obj.start);
      _timerEntry = { task: obj.task||'', project_id: obj.project_id||'', user_id: myUserId() };
      updateTimerUI(true);
      _timerTick = setInterval(tickTimer, 1000);
    } catch(e) {}
  }

  function tickTimer() {
    if (!_timerStart) return;
    var elapsed = Math.floor((Date.now() - _timerStart.getTime()) / 1000);
    var h=Math.floor(elapsed/3600), m=Math.floor((elapsed%3600)/60), s=elapsed%60;
    var el = document.getElementById('ts-timer-display');
    if (el) el.textContent = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }

  function stopTimer() {
    if (!_timerStart) return;
    clearInterval(_timerTick);
    var end = new Date();
    var elapsed = (end - _timerStart) / 3600000;
    var startStr = _timerStart.toTimeString().slice(0,5);
    var endStr   = end.toTimeString().slice(0,5);
    try { localStorage.removeItem('wv_ts_timer_' + myUserId()); } catch(e) {}
    updateTimerUI(false);
    var prefill = {
      task:        (_timerEntry&&_timerEntry.task)||'',
      project_id:  (_timerEntry&&_timerEntry.project_id)||'',
      user_id:     myUserId(),
      date:        isoDate(_timerStart),
      start_time:  startStr,
      end_time:    endStr,
      total_hours: Math.round(elapsed*100)/100,
      _timer_hours: elapsed,
    };
    _timerStart = null; _timerEntry = null;
    openEntryForm(prefill);
  }

  function updateTimerUI(running) {
    var pill = document.getElementById('ts-timer-pill');
    var startBtn = document.getElementById('ts-timer-start-btn');
    if (pill) { if(running) pill.classList.remove('hidden'); else pill.classList.add('hidden'); pill.style.display=running?'flex':'none'; }
    if (startBtn) startBtn.style.display = running ? 'none' : 'flex';
    var stopBtn = document.getElementById('ts-timer-stop');
    if (stopBtn) stopBtn.addEventListener('click', stopTimer);
  }

  // ── Reject Modal ──────────────────────────────────────────────
  function openRejectModal(id) {
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-red-600">Reject Timesheet</h3>' +
        '<button id="rj-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5">' +
        '<label style="display:block;font-size:.75rem;font-weight:700;color:#64748b;margin-bottom:.375rem;text-transform:uppercase;letter-spacing:.05em">Reason for rejection</label>' +
        '<textarea id="rj-reason" rows="3" placeholder="Explain why…" style="width:100%;padding:.55rem .75rem;border:1px solid #e2e8f0;border-radius:.625rem;font-size:.875rem;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box"></textarea>' +
        '<div id="ts-modal-status" class="mt-2"></div>' +
        '<div class="flex gap-3 mt-4">' +
          '<button id="rj-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="rj-confirm" class="flex-1 py-2.5 font-bold rounded-xl border-none cursor-pointer" style="background:#ef4444;color:#fff"><i class="fas fa-times mr-1"></i>Reject Entry</button>' +
        '</div>' +
      '</div>';
    showModal(html, '480px');
    document.getElementById('rj-close').addEventListener('click', closeModal);
    document.getElementById('rj-cancel').addEventListener('click', closeModal);
    document.getElementById('rj-confirm').addEventListener('click', function() {
      var reason = document.getElementById('rj-reason').value.trim();
      updateStatus(id, 'Rejected', reason);
    });
  }

  // ── DB Actions ────────────────────────────────────────────────
  async function submitForm(entryId) {
    var isEdit = !!entryId;
    var userEl = document.getElementById('tf-user');
    var userId = userEl ? (userEl.value || myUserId()) : myUserId();
    var date   = (document.getElementById('tf-date').value || '').trim();
    var start  = (document.getElementById('tf-start').value || '').trim();
    var end    = (document.getElementById('tf-end').value   || '').trim();
    var brk    = (document.getElementById('tf-break').value || '0').trim();
    var task   = (document.getElementById('tf-task').value  || '').trim();
    var desc   = (document.getElementById('tf-desc').value  || '').trim();
    var notes  = (document.getElementById('tf-notes').value || '').trim();
    var bill   = document.getElementById('tf-billable').value;
    var rate   = document.getElementById('tf-rate') ? (document.getElementById('tf-rate').value||'') : '';
    var projId = document.getElementById('tf-project') ? document.getElementById('tf-project').value : '';

    if (!date) { modalStatus('Date is required.', false); return; }
    if (!task) { modalStatus('Task is required.', false); return; }

    var timerEl = document.getElementById('tf-timer-hours');
    var timerVal = timerEl ? parseFloat(timerEl.value) : NaN;
    var hours = (!isNaN(timerVal) && timerVal >= 0) ? timerVal : calcHours(start, end, brk);

    var btn = document.getElementById('tf-save');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…'; }

    var patch = {
      user_id:       userId,
      date:          date,
      start_time:    start || null,
      end_time:      end   || null,
      break_minutes: parseInt(brk)||0,
      total_hours:   Math.round(hours*100)/100,
      project_id:    projId || null,
      task:          task,
      description:   desc   || null,
      notes:         notes  || null,
      billable:      bill === 'true',
      billable_rate: (bill === 'true' && rate) ? parseFloat(rate) : null,
      status:        isEdit ? (sheets[entryId]&&sheets[entryId].status)||'Draft' : 'Draft',
    };
    if (!isEdit) patch.created_by = myUserId();

    try {
      if (isEdit) {
        var updated = await db.timesheets.update(entryId, patch);
        sheets[entryId] = Object.assign({}, sheets[entryId], updated || patch);
        modalStatus('Entry saved!', true);
      } else {
        var created = await db.timesheets.create(patch);
        sheets[created.id] = created;
        modalStatus('Time logged!', true);
      }
      setTimeout(function() { closeModal(); rerender(); }, 600);
    } catch(e) {
      modalStatus(e.message, false);
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save mr-1.5 text-xs"></i>'+(isEdit?'Save Changes':'Log Entry'); }
    }
  }

  async function updateStatus(id, status, approverNotes) {
    var patch = { status: status };
    if (approverNotes) patch.approver_notes = approverNotes;
    if (status === 'Approved' || status === 'Rejected') patch.approved_by = myUserId();

    try {
      await db.timesheets.update(id, patch);
      if (sheets[id]) Object.assign(sheets[id], patch);
      toast(status==='Approved' ? 'Entry approved!' : status==='Rejected' ? 'Entry rejected.' : 'Status updated.',
            status==='Approved' ? 'success' : 'info');
      closeModal();
      rerender();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this timesheet entry? This cannot be undone.')) return;
    try {
      await db.timesheets.delete(id);
      delete sheets[id];
      toast('Entry deleted.', 'info');
      rerender();
    } catch(e) { toast(e.message, 'error'); }
  }

  // ── Boot ──────────────────────────────────────────────────────
  render();
};
