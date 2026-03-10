// ================================================================
//  WORK VOLT — pages/scheduler.js
//  Shift Scheduler UI Module  |  Version 2.0.0
//
//  Registered as: WorkVoltPages['scheduler']
//  Loaded by main.html when user navigates to #scheduler
//
//  TABS:
//   📊 Dashboard  — stats, KPI cards, dept hours chart
//   📅 Calendar   — week-view grid by employee × day
//   📋 Schedule   — list view of all shifts + CRUD
//   📝 Templates  — shift template management
//   📍 Locations  — work site management
//   🕐 Availability — employee day availability
//   🌴 Time Off   — leave requests (approve / reject)
//   🔄 Swaps      — shift swap requests
//   ⚙️ Overtime   — overtime rule settings
// ================================================================

window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['scheduler'] = function(container) {

  // ── State ─────────────────────────────────────────────────────
  var state = {
    tab:          'dashboard',
    scheduleRows: [],
    templates:    [],
    locations:    [],
    availability: [],
    timeoff:      [],
    swaps:        [],
    users:        [],
    stats:        {},
    weekStart:    _getMondayOf(new Date()),
    loading:      false,
  };

  // ── API shorthand ─────────────────────────────────────────────
  var api = window.WorkVolt.api.bind(window.WorkVolt);
  var toast = window.WorkVolt.toast.bind(window.WorkVolt);
  var me = window.WorkVolt.user();

  // ── Utility: timezone-safe local date helpers ─────────────────
  // IMPORTANT: Never use toISOString() for date-only values — it shifts
  // to UTC and can move the date back by 1 day in negative-offset timezones.
  // All date strings are kept as YYYY-MM-DD in LOCAL time.
  function _localDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }
  function _getMondayOf(d) {
    var day = d.getDay();                    // 0=Sun … 6=Sat
    var diff = (day === 0) ? -6 : 1 - day;  // roll back to Monday
    var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return _localDateStr(m);
  }
  function _addDays(dateStr, n) {
    // Parse YYYY-MM-DD without timezone conversion
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + n);
    return _localDateStr(d);
  }
  function _fmtDate(dateStr) {
    if (!dateStr) return '';
    try {
      var parts = String(dateStr).substring(0,10).split('-');
      var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch(e) { return dateStr; }
  }
  function _today() { return _localDateStr(new Date()); }
  // Format a time value from Google Sheets (may come back as a Date object
  // serialised to ISO string like "1899-12-30T13:00:00.000Z") into HH:MM
  function _fmtTime(val) {
    if (!val) return '';
    var s = String(val);
    // Already a clean HH:MM or HH:MM:SS
    if (/^\d{1,2}:\d{2}/.test(s)) return s.substring(0, 5);
    // ISO date-time string from Sheets time cell
    if (s.indexOf('T') !== -1) {
      var t = new Date(s);
      // Sheets stores times as offsets from 1899-12-30; read hours/minutes from UTC
      var hh = String(t.getUTCHours()).padStart(2, '0');
      var mm = String(t.getUTCMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    }
    return s;
  }

  // Status badge helper
  function _badge(status) {
    var map = {
      Scheduled:  'bg-blue-100 text-blue-700',
      Confirmed:  'bg-green-100 text-green-700',
      Completed:  'bg-slate-100 text-slate-600',
      Cancelled:  'bg-red-100 text-red-600',
      'No Show':  'bg-orange-100 text-orange-700',
      Pending:    'bg-amber-100 text-amber-700',
      Approved:   'bg-green-100 text-green-700',
      Rejected:   'bg-red-100 text-red-600',
      Draft:      'bg-slate-100 text-slate-500',
      Published:  'bg-blue-100 text-blue-700',
    };
    return '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + (map[status] || 'bg-slate-100 text-slate-500') + '">' + (status || '—') + '</span>';
  }

  // ── RENDER SHELL ──────────────────────────────────────────────
  function render() {
    container.innerHTML = `
      <div class="p-4 md:p-6 fade-in max-w-7xl mx-auto">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fas fa-calendar-alt text-white"></i>
            </div>
            <div>
              <h1 class="text-xl font-extrabold text-slate-900 leading-tight">Shift Scheduler</h1>
              <p class="text-xs text-slate-500" id="sch-subtitle">Loading…</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="schOpenAutoSchedule()" class="btn-secondary text-xs px-3 py-2 gap-1.5">
              <i class="fas fa-magic text-xs"></i> Auto-Schedule
            </button>
            <button onclick="schOpenCreateShift()" class="btn-primary text-xs px-3 py-2 gap-1.5">
              <i class="fas fa-plus text-xs"></i> New Shift
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 overflow-x-auto pb-1 mb-5 border-b border-slate-200">
          ${[
            ['dashboard',    'fa-th-large',      'Dashboard'],
            ['calendar',     'fa-calendar-week', 'Calendar'],
            ['schedule',     'fa-list',          'Schedule'],
            ['templates',    'fa-layer-group',   'Templates'],
            ['locations',    'fa-map-marker-alt','Locations'],
            ['availability', 'fa-user-clock',    'Availability'],
            ['timeoff',      'fa-plane-departure','Time Off'],
            ['swaps',        'fa-exchange-alt',  'Swaps'],
            ['overtime',     'fa-exclamation-triangle', 'Overtime'],
          ].map(function(t) {
            return '<button onclick="schTab(\'' + t[0] + '\')" id="sch-tab-' + t[0] + '" ' +
              'class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors ' +
              (state.tab === t[0] ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100') + '">' +
              '<i class="fas ' + t[1] + ' text-[11px]"></i>' + t[2] + '</button>';
          }).join('')}
        </div>

        <!-- Tab content -->
        <div id="sch-tab-content"></div>

      </div>

      <!-- Modal backdrop -->
      <div id="sch-modal-bg" class="hidden fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
           onclick="if(event.target===this)schCloseModal()">
        <div id="sch-modal" class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"></div>
      </div>
    `;

    // Expose globals
    window.schTab            = schTab;
    window.schOpenCreateShift = schOpenCreateShift;
    window.schCloseModal     = schCloseModal;
    window.schOpenAutoSchedule = schOpenAutoSchedule;

    loadAll();
  }

  // ── Load all data ─────────────────────────────────────────────
  async function loadAll() {
    try {
      var [usersRes, tplRes, locRes, statsRes] = await Promise.all([
        api('users/list', {}),
        api('scheduler/templates/list', {}),
        api('scheduler/locations/list', {}),
        api('scheduler/dashboard/stats', { date: _today() }),
      ]);
      state.users     = (usersRes.rows || usersRes.users || []).filter(function(u) { return u.status === 'Active' || u.active === 'true' || u.active === true; });
      state.templates = tplRes.rows || [];
      state.locations = locRes.rows || [];
      state.stats     = statsRes;

      var subtitle = document.getElementById('sch-subtitle');
      if (subtitle) subtitle.textContent = state.stats.scheduled_today + ' shifts today · ' + state.stats.week_total_shifts + ' this week';

    } catch(e) {
      toast('Failed to load scheduler data: ' + e.message, 'error');
    }
    renderTab();
  }

  // ── Tab switcher ──────────────────────────────────────────────
  function schTab(name) {
    state.tab = name;
    document.querySelectorAll('[id^="sch-tab-"]').forEach(function(b) {
      var tid = b.id.replace('sch-tab-', '');
      b.className = 'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors ' +
        (tid === name ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100');
    });
    renderTab();
  }

  async function renderTab() {
    var el = document.getElementById('sch-tab-content');
    if (!el) return;
    el.innerHTML = '<div class="flex items-center justify-center py-16"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-400"></i></div>';

    try {
      switch(state.tab) {
        case 'dashboard':    await renderDashboard(el);    break;
        case 'calendar':     await renderCalendar(el);     break;
        case 'schedule':     await renderSchedule(el);     break;
        case 'templates':    await renderTemplates(el);    break;
        case 'locations':    await renderLocations(el);    break;
        case 'availability': await renderAvailability(el); break;
        case 'timeoff':      await renderTimeOff(el);      break;
        case 'swaps':        await renderSwaps(el);        break;
        case 'overtime':     await renderOvertime(el);     break;
        default:             el.innerHTML = '<p class="text-slate-400 p-8">Unknown tab</p>';
      }
    } catch(e) {
      el.innerHTML = '<p class="text-red-500 p-6">Error: ' + e.message + '</p>';
    }
  }

  // ================================================================
  //  DASHBOARD TAB
  // ================================================================
  async function renderDashboard(el) {
    var s = state.stats;
    var deptRows = Object.entries(s.dept_hours || {}).sort(function(a,b){ return b[1]-a[1]; });
    var maxDeptH = deptRows.length ? deptRows[0][1] : 1;

    el.innerHTML = `
      <div class="space-y-5">

        <!-- KPI cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${[
            { label: 'Scheduled Today',  val: s.scheduled_today || 0,  icon: 'fa-user-clock',       color: 'blue' },
            { label: 'Open Shifts',      val: s.open_shifts || 0,      icon: 'fa-door-open',        color: 'amber' },
            { label: 'Overtime Risk',    val: s.overtime_risk || 0,    icon: 'fa-exclamation-circle',color: 'red' },
            { label: 'Absent Today',     val: s.absent_today || 0,     icon: 'fa-user-times',       color: 'slate' },
          ].map(function(k) {
            return '<div class="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">' +
              '<div class="w-10 h-10 bg-' + k.color + '-100 rounded-xl flex items-center justify-center flex-shrink-0">' +
                '<i class="fas ' + k.icon + ' text-' + k.color + '-500"></i>' +
              '</div>' +
              '<div>' +
                '<div class="text-2xl font-extrabold text-slate-900">' + k.val + '</div>' +
                '<div class="text-xs text-slate-500 font-medium">' + k.label + '</div>' +
              '</div></div>';
          }).join('')}
        </div>

        <!-- Pending approvals row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="bg-white rounded-2xl border border-slate-200 p-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Pending Swaps</div>
            <div class="text-3xl font-extrabold text-amber-600">${s.pending_swaps || 0}</div>
            <div class="text-xs text-slate-400 mt-1">awaiting approval</div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Time-Off Requests</div>
            <div class="text-3xl font-extrabold text-blue-600">${s.pending_timeoff || 0}</div>
            <div class="text-xs text-slate-400 mt-1">awaiting approval</div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Week Total Hours</div>
            <div class="text-3xl font-extrabold text-green-600">${s.week_total_hours || 0}h</div>
            <div class="text-xs text-slate-400 mt-1">across ${s.week_total_shifts || 0} shifts</div>
          </div>
        </div>

        <!-- Hours by department -->
        ${deptRows.length ? `
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Hours by Department — This Week</div>
          <div class="space-y-3">
            ${deptRows.map(function(d) {
              var pct = Math.round((d[1] / maxDeptH) * 100);
              return '<div>' +
                '<div class="flex items-center justify-between mb-1">' +
                  '<span class="text-sm font-semibold text-slate-700">' + d[0] + '</span>' +
                  '<span class="text-xs font-bold text-slate-500">' + d[1].toFixed(1) + 'h</span>' +
                '</div>' +
                '<div class="w-full bg-slate-100 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" style="width:' + pct + '%"></div></div>' +
              '</div>';
            }).join('')}
          </div>
        </div>` : ''}

        <!-- Quick actions -->
        <div class="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
          <div class="font-bold text-base mb-1">Quick Actions</div>
          <p class="text-blue-200 text-xs mb-4">Common scheduler tasks</p>
          <div class="flex flex-wrap gap-2">
            <button onclick="schTab('calendar')" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
              <i class="fas fa-calendar-week mr-1"></i> View Calendar
            </button>
            <button onclick="schOpenCreateShift()" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
              <i class="fas fa-plus mr-1"></i> Add Shift
            </button>
            <button onclick="schOpenAutoSchedule()" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
              <i class="fas fa-magic mr-1"></i> Auto-Schedule Week
            </button>
            <button onclick="schTab('timeoff')" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
              <i class="fas fa-plane-departure mr-1"></i> Time-Off Requests
            </button>
            <button onclick="schOpenPayrollExport()" class="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
              <i class="fas fa-file-export mr-1"></i> Export to Payroll
            </button>
          </div>
        </div>

      </div>
    `;
    window.schOpenPayrollExport = openPayrollExportModal;
  }

  // ================================================================
  //  CALENDAR TAB  (week grid: employee rows × day columns)
  // ================================================================
  async function renderCalendar(el) {
    var res = await api('scheduler/schedule/week', { week_start: state.weekStart });
    var rows   = res.rows || [];
    var days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dates  = days.map(function(_, i) { return _addDays(state.weekStart, i); });

    // Group by employee — sanitise date/time values from Sheets
    var empMap = {};
    rows.forEach(function(r) {
      // Normalise date (may be a full ISO string from Sheets)
      r._safeDate = String(r.date || '').substring(0, 10);
      // Normalise times (Sheets can return 1899-12-30T... Date objects)
      r._safeStart = _fmtTime(r.start_time);
      r._safeEnd   = _fmtTime(r.end_time);

      if (!empMap[r.employee_id]) empMap[r.employee_id] = { name: r.employee_name, shifts: {} };
      // Map to Mon=0 … Sun=6 using local date parsing to avoid UTC shift
      var parts = r._safeDate.split('-');
      var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      var di = (d.getDay() + 6) % 7;
      if (!empMap[r.employee_id].shifts[di]) empMap[r.employee_id].shifts[di] = [];
      empMap[r.employee_id].shifts[di].push(r);
    });
    var empList = Object.entries(empMap);

    el.innerHTML = `
      <div class="space-y-4">

        <!-- Week nav -->
        <div class="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3">
          <button onclick="schCalWeek(-1)" class="btn-secondary text-xs px-3 py-1.5 gap-1">
            <i class="fas fa-chevron-left text-xs"></i> Prev
          </button>
          <div class="text-sm font-bold text-slate-800">
            Week of ${_fmtDate(state.weekStart)} — ${_fmtDate(_addDays(state.weekStart, 6))}
          </div>
          <div class="flex gap-2">
            <button onclick="schCalToday()" class="btn-secondary text-xs px-3 py-1.5">Today</button>
            <button onclick="schCalWeek(1)" class="btn-secondary text-xs px-3 py-1.5 gap-1">
              Next <i class="fas fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>

        <!-- Publish bar -->
        <div class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <div class="flex items-center gap-2 text-amber-700 text-xs font-semibold">
            <i class="fas fa-info-circle"></i>
            Draft shifts are only visible to managers. Publish to notify staff.
          </div>
          <button onclick="schPublishWeek('${state.weekStart}')" class="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
            <i class="fas fa-paper-plane mr-1"></i> Publish Week
          </button>
        </div>

        <!-- Calendar grid -->
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs min-w-[700px]">
            <thead>
              <tr class="border-b border-slate-100">
                <th class="text-left px-4 py-3 text-slate-500 font-semibold w-36">Employee</th>
                ${days.map(function(d, i) {
                  var isToday = dates[i] === _today();
                  return '<th class="px-2 py-3 text-center font-semibold ' + (isToday ? 'text-blue-600 bg-blue-50' : 'text-slate-500') + '">' +
                    d + '<div class="text-[10px] font-normal ' + (isToday ? 'text-blue-400' : 'text-slate-300') + '">' + dates[i].substring(5) + '</div></th>';
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${empList.length === 0 ? '<tr><td colspan="8" class="text-center text-slate-400 py-12">No shifts scheduled this week.<br><button onclick="schOpenCreateShift()" class="mt-3 btn-primary text-xs px-4 py-2 inline-flex">+ Add Shift</button></td></tr>' : ''}
              ${empList.map(function(entry) {
                var empId = entry[0], emp = entry[1];
                return '<tr class="border-b border-slate-50 hover:bg-slate-50/50">' +
                  '<td class="px-4 py-2 font-semibold text-slate-700 whitespace-nowrap">' +
                    '<div class="flex items-center gap-2">' +
                      '<div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-600">' + (emp.name || '?')[0] + '</div>' +
                      (emp.name || empId) +
                    '</div></td>' +
                  days.map(function(_, i) {
                    var cellShifts = emp.shifts[i] || [];
                    var isToday    = dates[i] === _today();
                    return '<td class="px-1.5 py-2 text-center align-top ' + (isToday ? 'bg-blue-50/40' : '') + '">' +
                      cellShifts.map(function(s) {
                        var lc = s.lifecycle === 'Draft' ? 'border-dashed opacity-70' : '';
                        return '<div class="mb-1 px-2 py-1 rounded-lg border cursor-pointer text-left ' + lc + '" ' +
                          'style="background:#eff6ff;border-color:#bfdbfe;" ' +
                          'onclick="schOpenEditShift(\'' + s.id + '\')" title="' + s.shift_name + ' · ' + s.total_hours + 'h">' +
                          '<div class="font-bold text-blue-700 text-[10px]">' + (s.shift_name || 'Shift') + '</div>' +
                          '<div class="text-[10px] text-blue-500">' + (s._safeStart || s.start_time || '') + (s._safeEnd ? '–'+s._safeEnd : '') + '</div>' +
                          '<div class="text-[10px] text-slate-400">' + (s.location || '') + '</div>' +
                        '</div>';
                      }).join('') +
                      '<button onclick="schOpenCreateShiftOnDate(\'' + dates[i] + '\',\'' + empId + '\',\'' + (emp.name||'') + '\')" ' +
                        'class="w-full text-slate-200 hover:text-blue-400 hover:bg-blue-50 rounded py-0.5 transition text-[14px] leading-none">+</button>' +
                    '</td>';
                  }).join('') +
                '</tr>';
              }).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;

    window.schCalWeek = function(dir) {
      state.weekStart = _addDays(state.weekStart, dir * 7);
      renderTab();
    };
    window.schCalToday = function() {
      state.weekStart = _getMondayOf(new Date());
      renderTab();
    };
    window.schPublishWeek = async function(ws) {
      try {
        var r = await api('scheduler/schedule/publish', { week_start: ws });
        toast(r.published + ' shifts published', 'success');
        renderTab();
      } catch(e) { toast(e.message, 'error'); }
    };
    window.schOpenEditShift = function(id) {
      var shift = (state.scheduleRows || []).find(function(r) { return r.id === id; });
      openShiftModal(shift || { id: id });
    };
    window.schOpenCreateShiftOnDate = function(date, empId, empName) {
      openShiftModal({ date: date, employee_id: empId, employee_name: empName });
    };
  }

  // ================================================================
  //  SCHEDULE LIST TAB
  // ================================================================
  async function renderSchedule(el) {
    var res = await api('scheduler/schedule/list', {});
    state.scheduleRows = res.rows || [];

    // Filter controls
    var filterDate = '', filterStatus = '', filterEmp = '';

    var render = function() {
      var filtered = state.scheduleRows;
      if (filterDate)   filtered = filtered.filter(function(r) { return String(r.date) === filterDate; });
      if (filterStatus) filtered = filtered.filter(function(r) { return r.status === filterStatus; });
      if (filterEmp)    filtered = filtered.filter(function(r) { return r.employee_id === filterEmp || (r.employee_name||'').toLowerCase().includes(filterEmp.toLowerCase()); });

      var tbl = document.getElementById('sch-sched-table');
      if (!tbl) return;
      tbl.innerHTML = filtered.length === 0 ? `
        <tr><td colspan="9" class="text-center text-slate-400 py-12">
          No shifts found. <button onclick="schOpenCreateShift()" class="text-blue-600 font-semibold hover:underline">Add one</button>
        </td></tr>` :
        filtered.slice().sort(function(a,b){ return String(a.date) < String(b.date) ? 1 : -1; }).map(function(r) {
          var safeDate  = String(r.date || '').substring(0, 10);
          var safeStart = _fmtTime(r.start_time);
          var safeEnd   = _fmtTime(r.end_time);
          var timeStr   = safeStart ? (safeStart + (safeEnd ? ' – ' + safeEnd : '')) : '—';
          return '<tr class="border-b border-slate-50 hover:bg-slate-50 text-sm">' +
            '<td class="px-4 py-3 font-mono text-xs text-slate-400">' + safeDate + '</td>' +
            '<td class="px-4 py-3 font-semibold text-slate-800">' + (r.employee_name || r.employee_id || '—') + '</td>' +
            '<td class="px-4 py-3">' + (r.shift_name || '—') + '</td>' +
            '<td class="px-4 py-3 text-slate-500">' + timeStr + '</td>' +
            '<td class="px-4 py-3 text-slate-500">' + (r.total_hours ? r.total_hours + 'h' : '—') + '</td>' +
            '<td class="px-4 py-3">' + (r.location || '—') + '</td>' +
            '<td class="px-4 py-3">' + _badge(r.status) + '</td>' +
            '<td class="px-4 py-3">' + _badge(r.lifecycle) + '</td>' +
            '<td class="px-4 py-3">' +
              '<div class="flex gap-1">' +
                '<button onclick="schOpenEditShiftById(\'' + r.id + '\')" class="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="Edit"><i class="fas fa-pencil text-xs"></i></button>' +
                '<button onclick="schDeleteShift(\'' + r.id + '\')" class="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Delete"><i class="fas fa-trash text-xs"></i></button>' +
              '</div></td>' +
          '</tr>';
        }).join('');
    };

    el.innerHTML = `
      <div class="space-y-4">
        <!-- Filter bar -->
        <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Date</label>
            <input type="date" id="sch-filter-date" class="field w-auto text-xs" value="${filterDate}">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Status</label>
            <select id="sch-filter-status" class="field w-auto text-xs">
              <option value="">All</option>
              ${['Scheduled','Confirmed','Completed','Cancelled','No Show'].map(function(s){return '<option>'+s+'</option>';}).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Employee</label>
            <input type="text" id="sch-filter-emp" placeholder="Search name…" class="field w-40 text-xs">
          </div>
          <button onclick="schApplyFilters()" class="btn-primary text-xs px-3 py-2">Filter</button>
          <button onclick="schClearFilters()" class="btn-secondary text-xs px-3 py-2">Clear</button>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm min-w-[800px]">
            <thead>
              <tr class="border-b border-slate-100 text-xs text-slate-500 font-semibold">
                <th class="text-left px-4 py-3">Date</th>
                <th class="text-left px-4 py-3">Employee</th>
                <th class="text-left px-4 py-3">Shift</th>
                <th class="text-left px-4 py-3">Time</th>
                <th class="text-left px-4 py-3">Hours</th>
                <th class="text-left px-4 py-3">Location</th>
                <th class="text-left px-4 py-3">Status</th>
                <th class="text-left px-4 py-3">Lifecycle</th>
                <th class="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody id="sch-sched-table"></tbody>
          </table>
        </div>
      </div>
    `;

    render();

    window.schApplyFilters = function() {
      filterDate   = document.getElementById('sch-filter-date').value;
      filterStatus = document.getElementById('sch-filter-status').value;
      filterEmp    = document.getElementById('sch-filter-emp').value;
      render();
    };
    window.schClearFilters = function() {
      filterDate = filterStatus = filterEmp = '';
      document.getElementById('sch-filter-date').value   = '';
      document.getElementById('sch-filter-status').value = '';
      document.getElementById('sch-filter-emp').value    = '';
      render();
    };
    window.schOpenEditShiftById = function(id) {
      var shift = state.scheduleRows.find(function(r) { return r.id === id; });
      if (shift) openShiftModal(shift);
    };
    window.schDeleteShift = async function(id) {
      if (!confirm('Delete this shift?')) return;
      try {
        await api('scheduler/schedule/delete', { id: id });
        toast('Shift deleted', 'success');
        state.scheduleRows = state.scheduleRows.filter(function(r) { return r.id !== id; });
        render();
      } catch(e) { toast(e.message, 'error'); }
    };
  }

  // ================================================================
  //  SHIFT CREATE / EDIT MODAL
  //  Features:
  //   • Full-day toggle (no fixed times required)
  //   • Optional start/end/break
  //   • Repeat: None | This week | Whole month | Custom days of week
  // ================================================================
  function openShiftModal(shift) {
    shift = shift || {};
    var isEdit = !!shift.id;

    // Sanitise incoming time values from Sheets
    var safeStart = _fmtTime(shift.start_time) || '';
    var safeEnd   = _fmtTime(shift.end_time)   || '';
    var safeDate  = shift.date ? String(shift.date).substring(0,10) : _today();
    var isFullDay = !safeStart && !safeEnd && !isEdit ? false : (!safeStart && !safeEnd);

    var empOptions = state.users.map(function(u) {
      var sel = (u.user_id === shift.employee_id) ? 'selected' : '';
      return '<option value="' + u.user_id + '" data-name="' + (u.name || '') + '" ' + sel + '>' + (u.name || u.user_id) + '</option>';
    }).join('');
    var tplOptions = '<option value="">— No template —</option>' + state.templates.map(function(t) {
      return '<option value="' + t.id + '" data-start="' + t.start_time + '" data-end="' + t.end_time + '" data-break="' + t.break_minutes + '">' + t.shift_name + '</option>';
    }).join('');
    var locOptions = '<option value="">None</option>' + state.locations.map(function(l) {
      var sel = (l.location_name === shift.location) ? 'selected' : '';
      return '<option ' + sel + '>' + l.location_name + '</option>';
    }).join('');

    openModal(`
      <div class="p-5">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-calendar-plus text-white text-sm"></i>
          </div>
          <h3 class="font-bold text-slate-900">${isEdit ? 'Edit' : 'New'} Shift</h3>
        </div>

        <div class="space-y-3">

          <!-- Employee -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Employee <span class="text-red-400">*</span></label>
            <select id="sch-emp" class="field text-sm" required>
              <option value="">Select employee…</option>
              ${empOptions}
            </select>
          </div>

          <!-- Date (single) — hidden when repeat covers it -->
          <div id="sch-single-date-row">
            <label class="block text-xs font-semibold text-slate-600 mb-1">Date <span class="text-red-400">*</span></label>
            <input type="date" id="sch-date" class="field text-sm" value="${safeDate}" required>
          </div>

          <!-- Shift Template -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Shift Template <span class="text-slate-400 font-normal">(optional)</span></label>
            <select id="sch-tpl" class="field text-sm" onchange="schApplyTemplate(this)">
              ${tplOptions}
            </select>
          </div>

          <!-- Full-day toggle -->
          <label class="flex items-center gap-2.5 cursor-pointer select-none">
            <div class="relative">
              <input type="checkbox" id="sch-fullday" class="sr-only" ${isFullDay ? 'checked' : ''} onchange="schToggleFullDay(this.checked)">
              <div id="sch-fullday-track" class="w-9 h-5 rounded-full transition-colors ${isFullDay ? 'bg-blue-500' : 'bg-slate-300'}"></div>
              <div id="sch-fullday-thumb" class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isFullDay ? 'translate-x-4' : ''}"></div>
            </div>
            <span class="text-xs font-semibold text-slate-700">Full Day / No fixed hours</span>
            <span class="text-xs text-slate-400">(time fields optional)</span>
          </label>

          <!-- Time fields — collapsible -->
          <div id="sch-time-fields" class="${isFullDay ? 'hidden' : ''}">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Start</label>
                <input type="time" id="sch-start" class="field text-sm" value="${safeStart}">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">End</label>
                <input type="time" id="sch-end" class="field text-sm" value="${safeEnd}">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Break (min)</label>
                <input type="number" id="sch-break" class="field text-sm" value="${shift.break_minutes || 0}" min="0">
              </div>
            </div>
          </div>

          <!-- Location + Status -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Location</label>
              <select id="sch-loc" class="field text-sm">${locOptions}</select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Status</label>
              <select id="sch-status" class="field text-sm">
                ${['Scheduled','Confirmed','Completed','Cancelled','No Show'].map(function(s){
                  return '<option ' + (s===(shift.status||'Scheduled')?'selected':'') + '>' + s + '</option>';
                }).join('')}
              </select>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
            <textarea id="sch-notes" class="field text-sm" rows="2" placeholder="Optional notes…">${shift.notes || ''}</textarea>
          </div>

          ${!isEdit ? `
          <!-- ── REPEAT / BULK SCHEDULING ─────────────────────── -->
          <div class="border-t border-slate-100 pt-3">
            <label class="block text-xs font-semibold text-slate-600 mb-2">
              <i class="fas fa-redo text-slate-400 mr-1"></i>Repeat / Bulk Schedule
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 hover:border-blue-300 has-repeat-opt">
                <input type="radio" name="sch-repeat" value="none" checked class="accent-blue-600" onchange="schRepeatMode('none')">
                <span class="text-xs font-semibold text-slate-700">Single day</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 hover:border-blue-300">
                <input type="radio" name="sch-repeat" value="week" class="accent-blue-600" onchange="schRepeatMode('week')">
                <span class="text-xs font-semibold text-slate-700">Whole week</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 hover:border-blue-300">
                <input type="radio" name="sch-repeat" value="month" class="accent-blue-600" onchange="schRepeatMode('month')">
                <span class="text-xs font-semibold text-slate-700">Whole month</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 hover:border-blue-300">
                <input type="radio" name="sch-repeat" value="custom" class="accent-blue-600" onchange="schRepeatMode('custom')">
                <span class="text-xs font-semibold text-slate-700">Custom days</span>
              </label>
            </div>

            <!-- Week mode info -->
            <div id="sch-repeat-week" class="hidden mt-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700">
              <i class="fas fa-info-circle mr-1"></i>
              Will create a shift on every day of the week containing the selected date.
            </div>

            <!-- Month mode info -->
            <div id="sch-repeat-month" class="hidden mt-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-700">
              <i class="fas fa-info-circle mr-1"></i>
              Will create a shift on every day of the selected month.
              <label class="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" id="sch-skip-weekends" class="accent-indigo-600" checked>
                <span class="font-semibold">Skip weekends</span>
              </label>
            </div>

            <!-- Custom days of week -->
            <div id="sch-repeat-custom" class="hidden mt-2">
              <p class="text-xs text-slate-500 mb-2">Pick days of the week — shifts created from the selected date's week onward for a date range you choose:</p>
              <div class="flex flex-wrap gap-1.5 mb-2" id="sch-custom-days">
                ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(d,i){
                  return '<label class="cursor-pointer"><input type="checkbox" class="sr-only sch-dow" value="'+i+'">' +
                    '<span class="inline-block px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 sch-dow-label transition">' + d + '</span></label>';
                }).join('')}
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">From</label>
                  <input type="date" id="sch-custom-from" class="field text-xs" value="${safeDate}"></div>
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">To</label>
                  <input type="date" id="sch-custom-to" class="field text-xs" value="${_addDays(safeDate, 27)}"></div>
              </div>
            </div>
          </div>
          ` : ''}

          <div id="sch-shift-alert" class="hidden"></div>
        </div>

        <div class="flex gap-2 mt-5">
          <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button onclick="schSaveShift('${shift.id || ''}')" class="btn-primary flex-1 text-sm" id="sch-save-btn">
            <i class="fas fa-${isEdit ? 'save' : 'plus'} text-xs"></i>
            <span id="sch-save-label">${isEdit ? 'Save Changes' : 'Create Shift'}</span>
          </button>
        </div>
      </div>
    `);

    // ── Toggle full-day ──────────────────────────────────────────
    window.schToggleFullDay = function(checked) {
      document.getElementById('sch-time-fields').classList.toggle('hidden', checked);
      var track = document.getElementById('sch-fullday-track');
      var thumb = document.getElementById('sch-fullday-thumb');
      if (track) track.className = track.className.replace(checked ? 'bg-slate-300' : 'bg-blue-500', checked ? 'bg-blue-500' : 'bg-slate-300');
      if (thumb) thumb.classList.toggle('translate-x-4', checked);
    };

    // ── Repeat mode toggle ───────────────────────────────────────
    window.schRepeatMode = function(mode) {
      ['week','month','custom'].forEach(function(m) {
        var el = document.getElementById('sch-repeat-' + m);
        if (el) el.classList.toggle('hidden', m !== mode);
      });
      // Show/hide the single-date row label
      var sdRow = document.getElementById('sch-single-date-row');
      if (sdRow) {
        var lbl = sdRow.querySelector('label');
        if (lbl) lbl.textContent = (mode === 'week' || mode === 'month') ? 'Any date in the target week/month' :
                                    mode === 'custom' ? 'Reference date (week alignment)' : 'Date *';
      }
      // Update save button label
      var lbl = document.getElementById('sch-save-label');
      if (lbl) lbl.textContent = mode === 'none' ? 'Create Shift' : 'Create Shifts';
    };

    // ── Custom day-of-week label styling ─────────────────────────
    document.querySelectorAll('.sch-dow').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var lbl = this.parentElement.querySelector('.sch-dow-label');
        if (lbl) lbl.className = lbl.className.replace(
          this.checked ? 'border-slate-200 text-slate-600' : 'border-blue-500 bg-blue-50 text-blue-700',
          this.checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
        );
      });
    });

    // ── Apply template ───────────────────────────────────────────
    window.schApplyTemplate = function(sel) {
      var opt = sel.options[sel.selectedIndex];
      if (!opt || !opt.dataset.start) return;
      // Uncheck full-day if a template with times is applied
      document.getElementById('sch-fullday').checked = false;
      schToggleFullDay(false);
      document.getElementById('sch-start').value = opt.dataset.start;
      document.getElementById('sch-end').value   = opt.dataset.end;
      document.getElementById('sch-break').value = opt.dataset.break;
    };

    // ── Save ─────────────────────────────────────────────────────
    window.schSaveShift = async function(id) {
      var empSel   = document.getElementById('sch-emp');
      var empId    = empSel.value;
      var empName  = (empSel.options[empSel.selectedIndex] || {}).dataset?.name ||
                     (empSel.options[empSel.selectedIndex] || {}).text || '';
      var date     = document.getElementById('sch-date').value;
      var fullDay  = document.getElementById('sch-fullday').checked;

      if (!empId || !date) { toast('Employee and date are required', 'error'); return; }

      var alertEl = document.getElementById('sch-shift-alert');
      alertEl.className = 'hidden';

      var startTime = fullDay ? '' : (document.getElementById('sch-start') || {}).value || '';
      var endTime   = fullDay ? '' : (document.getElementById('sch-end')   || {}).value || '';
      var breakMin  = fullDay ? '0' : (document.getElementById('sch-break') || {}).value || '0';

      // Calculate hours only when we have valid times
      var totalHours = '';
      if (startTime && endTime) {
        var s = startTime.split(':').map(Number), e = endTime.split(':').map(Number);
        var sm = s[0]*60 + (s[1]||0), em = e[0]*60 + (e[1]||0);
        if (em <= sm) em += 1440;
        var calc = (em - sm - (parseInt(breakMin)||0)) / 60;
        if (calc > 0) totalHours = Math.round(calc * 100) / 100;
      }

      var tplSel   = document.getElementById('sch-tpl');
      var tplText  = (tplSel.options[tplSel.selectedIndex] || {}).text || '';
      var shiftName = (tplText && tplText !== '— No template —') ? tplText : (fullDay ? 'Full Day' : 'Custom');

      var baseParams = {
        employee_id:   empId,
        employee_name: empName,
        shift_name:    shiftName,
        start_time:    startTime,
        end_time:      endTime,
        break_minutes: breakMin,
        total_hours:   totalHours,
        location:      (document.getElementById('sch-loc') || {}).value || '',
        status:        (document.getElementById('sch-status') || {}).value || 'Scheduled',
        notes:         (document.getElementById('sch-notes') || {}).value || '',
        created_by:    me?.user_id || '',
      };

      // ── Edit path (single shift) ────────────────────────────
      if (id) {
        try {
          await api('scheduler/schedule/update', Object.assign({ id: id }, baseParams));
          toast('Shift updated', 'success');
          schCloseModal();
          renderTab();
        } catch(e) { toast(e.message, 'error'); }
        return;
      }

      // ── Determine dates to create ───────────────────────────
      var repeatEl = document.querySelector('input[name="sch-repeat"]:checked');
      var mode     = repeatEl ? repeatEl.value : 'none';
      var dates    = [];

      if (mode === 'none') {
        dates = [date];

      } else if (mode === 'week') {
        var wStart = _getMondayOf(new Date(date + 'T12:00:00'));
        for (var i = 0; i < 7; i++) dates.push(_addDays(wStart, i));

      } else if (mode === 'month') {
        var parts   = date.split('-');
        var y = parseInt(parts[0]), mo = parseInt(parts[1]);
        var skipWE  = document.getElementById('sch-skip-weekends').checked;
        var daysInMonth = new Date(y, mo, 0).getDate();
        for (var i = 1; i <= daysInMonth; i++) {
          var d = new Date(y, mo-1, i);
          if (skipWE && (d.getDay() === 0 || d.getDay() === 6)) continue;
          dates.push(_localDateStr(d));
        }

      } else if (mode === 'custom') {
        var selectedDows = Array.from(document.querySelectorAll('.sch-dow:checked')).map(function(cb){ return parseInt(cb.value); });
        if (!selectedDows.length) { toast('Select at least one day of week', 'error'); return; }
        var fromStr = document.getElementById('sch-custom-from').value;
        var toStr   = document.getElementById('sch-custom-to').value;
        var cur = fromStr;
        var safety = 0;
        while (cur <= toStr && safety++ < 400) {
          var parts = cur.split('-');
          var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
          var dow = (d.getDay() + 6) % 7; // Mon=0
          if (selectedDows.indexOf(dow) !== -1) dates.push(cur);
          cur = _addDays(cur, 1);
        }
      }

      if (!dates.length) { toast('No dates calculated — check your settings', 'error'); return; }

      var btn = document.getElementById('sch-save-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Creating…'; }

      // ── Single date ─────────────────────────────────────────
      if (dates.length === 1) {
        try {
          var res = await api('scheduler/schedule/create', Object.assign({ date: dates[0] }, baseParams));
          if (res.conflict) {
            alertEl.className = 'bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2';
            alertEl.textContent = res.error;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus text-xs"></i> Create Shift'; }
            return;
          }
          if (res.overtime_alert) {
            alertEl.className = 'bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-3 py-2';
            alertEl.textContent = '⚠️ ' + res.overtime_alert.alerts.join(' · ');
          }
          toast('Shift created', 'success');
          schCloseModal();
          renderTab();
        } catch(e) { toast(e.message, 'error'); if (btn) btn.disabled = false; }
        return;
      }

      // ── Bulk (multiple dates) via bulk-create ───────────────
      try {
        var shifts = dates.map(function(d) { return Object.assign({ date: d }, baseParams); });
        var res = await api('scheduler/schedule/bulk-create', { shifts: JSON.stringify(shifts) });
        var msg = res.created + ' shift' + (res.created !== 1 ? 's' : '') + ' created';
        if (res.conflicts && res.conflicts.length) msg += ' · ' + res.conflicts.length + ' skipped (conflict)';
        toast(msg, 'success');
        schCloseModal();
        renderTab();
      } catch(e) {
        toast(e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus text-xs"></i> Create Shifts'; }
      }
    };
  }

  function schOpenCreateShift()    { openShiftModal(); }
  window.schOpenCreateShift = schOpenCreateShift;

  // ================================================================
  //  AUTO-SCHEDULE MODAL
  // ================================================================
  function schOpenAutoSchedule() {
    var tplOptions = state.templates.map(function(t) {
      return '<option value="' + t.id + '">' + t.shift_name + ' (' + t.start_time + '–' + t.end_time + ')</option>';
    }).join('');
    var locOptions = '<option value="">No preference</option>' + state.locations.map(function(l) {
      return '<option>' + l.location_name + '</option>';
    }).join('');

    openModal(`
      <div class="p-5">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-magic text-white text-sm"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900">Auto-Schedule</h3>
            <p class="text-xs text-slate-500">Creates Draft shifts respecting availability & time-off</p>
          </div>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Week Starting (Monday)</label>
            <input type="date" id="as-week" class="field text-sm" value="${state.weekStart}">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Shift Template</label>
            <select id="as-tpl" class="field text-sm">${tplOptions}</select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Location (optional)</label>
            <select id="as-loc" class="field text-sm">${locOptions}</select>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700">
            <i class="fas fa-info-circle mr-1"></i>
            All active employees will be scheduled Mon–Sun, skipping approved time-off and unavailable days.
          </div>
          <div id="as-result" class="hidden"></div>
        </div>
        <div class="flex gap-2 mt-5">
          <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button onclick="schRunAutoSchedule()" class="btn-primary flex-1 text-sm">
            <i class="fas fa-magic text-xs"></i> Run Auto-Schedule
          </button>
        </div>
      </div>
    `);

    window.schRunAutoSchedule = async function() {
      var resultEl = document.getElementById('as-result');
      resultEl.className = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700';
      resultEl.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1"></i> Scheduling…';
      try {
        var res = await api('scheduler/auto-schedule', {
          week_start:         document.getElementById('as-week').value,
          shift_template_id:  document.getElementById('as-tpl').value,
          location:           document.getElementById('as-loc').value,
          created_by:         me?.user_id || 'auto',
        });
        resultEl.className = 'bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700';
        resultEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i> Created <strong>' + res.created + '</strong> shifts · Skipped <strong>' + res.skipped + '</strong>';
        toast(res.created + ' shifts auto-scheduled', 'success');
        setTimeout(function() { schCloseModal(); renderTab(); }, 1800);
      } catch(e) {
        resultEl.className = 'bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600';
        resultEl.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> ' + e.message;
      }
    };
  }
  window.schOpenAutoSchedule = schOpenAutoSchedule;

  // ================================================================
  //  PAYROLL EXPORT MODAL
  // ================================================================
  function openPayrollExportModal() {
    openModal(`
      <div class="p-5">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
            <i class="fas fa-file-export text-white text-sm"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900">Export to Payroll</h3>
            <p class="text-xs text-slate-500">Exports Completed/Confirmed shifts to payroll records</p>
          </div>
        </div>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Period Start</label>
              <input type="date" id="pe-start" class="field text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Period End</label>
              <input type="date" id="pe-end" class="field text-sm" value="${_today()}">
            </div>
          </div>
          <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" id="pe-mark" class="accent-blue-600" checked>
            Mark shifts as exported (prevents double-export)
          </label>
          <div id="pe-result" class="hidden"></div>
        </div>
        <div class="flex gap-2 mt-5">
          <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button onclick="schRunPayrollExport()" class="btn-primary flex-1 text-sm">
            <i class="fas fa-file-export text-xs"></i> Export
          </button>
        </div>
      </div>
    `);

    window.schRunPayrollExport = async function() {
      var resultEl = document.getElementById('pe-result');
      resultEl.className = 'bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs';
      resultEl.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1"></i> Exporting…';
      try {
        var res = await api('scheduler/payroll-export', {
          period_start: document.getElementById('pe-start').value,
          period_end:   document.getElementById('pe-end').value,
          mark_exported: document.getElementById('pe-mark').checked ? 'true' : 'false',
        });
        var summary = (res.employees || []).map(function(e) {
          return '<div class="flex justify-between py-1 border-b border-slate-100">' +
            '<span class="font-medium">' + e.employee_name + '</span>' +
            '<span class="text-green-700 font-bold">' + e.total_hours + 'h</span></div>';
        }).join('');
        resultEl.className = 'bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700';
        resultEl.innerHTML = '<div class="font-bold mb-2"><i class="fas fa-check-circle mr-1"></i> ' + res.total_shifts + ' shifts exported</div>' + summary;
      } catch(e) {
        resultEl.className = 'bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600';
        resultEl.innerHTML = e.message;
      }
    };
  }

  // ================================================================
  //  TEMPLATES TAB
  // ================================================================
  async function renderTemplates(el) {
    var res = await api('scheduler/templates/list', {});
    state.templates = res.rows || [];

    var renderList = function() {
      var tb = document.getElementById('sch-tpl-body');
      if (!tb) return;
      tb.innerHTML = state.templates.length === 0 ?
        '<tr><td colspan="6" class="text-center text-slate-400 py-8">No templates yet</td></tr>' :
        state.templates.map(function(t) {
          return '<tr class="border-b border-slate-50 hover:bg-slate-50 text-sm">' +
            '<td class="px-4 py-3 font-semibold text-slate-800">' +
              '<span class="inline-block w-2 h-2 rounded-full mr-2" style="background:' + (t.color||'#94a3b8') + '"></span>' + t.shift_name +
            '</td>' +
            '<td class="px-4 py-3 text-slate-600">' + (t.start_time||'') + ' – ' + (t.end_time||'') + '</td>' +
            '<td class="px-4 py-3 text-slate-500">' + (t.break_minutes||0) + ' min</td>' +
            '<td class="px-4 py-3 font-bold text-slate-700">' + (t.total_hours||'') + 'h</td>' +
            '<td class="px-4 py-3 text-slate-400 text-xs">' + (t.notes||'') + '</td>' +
            '<td class="px-4 py-3">' +
              '<div class="flex gap-1">' +
                '<button onclick="schEditTpl(\'' + t.id + '\')" class="p-1.5 rounded hover:bg-blue-50 text-blue-500"><i class="fas fa-pencil text-xs"></i></button>' +
                '<button onclick="schDeleteTpl(\'' + t.id + '\')" class="p-1.5 rounded hover:bg-red-50 text-red-400"><i class="fas fa-trash text-xs"></i></button>' +
              '</div></td>' +
          '</tr>';
        }).join('');
    };

    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-end">
          <button onclick="schAddTpl()" class="btn-primary text-xs px-3 py-2 gap-1.5">
            <i class="fas fa-plus text-xs"></i> New Template
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-100 text-xs text-slate-500 font-semibold">
              <th class="text-left px-4 py-3">Name</th>
              <th class="text-left px-4 py-3">Hours</th>
              <th class="text-left px-4 py-3">Break</th>
              <th class="text-left px-4 py-3">Total</th>
              <th class="text-left px-4 py-3">Notes</th>
              <th class="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody id="sch-tpl-body"></tbody>
          </table>
        </div>
      </div>
    `;
    renderList();

    var openTplModal = function(t) {
      t = t || {};
      openModal(`
        <div class="p-5">
          <h3 class="font-bold text-slate-900 mb-4">${t.id ? 'Edit' : 'New'} Shift Template</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Template Name</label>
              <input type="text" id="tpl-name" class="field text-sm" value="${t.shift_name||''}" placeholder="e.g. Morning"></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">Start Time</label>
                <input type="time" id="tpl-start" class="field text-sm" value="${t.start_time||'08:00'}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">End Time</label>
                <input type="time" id="tpl-end" class="field text-sm" value="${t.end_time||'16:00'}"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">Break (minutes)</label>
                <input type="number" id="tpl-break" class="field text-sm" value="${t.break_minutes||30}" min="0"></div>
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">Color</label>
                <input type="color" id="tpl-color" class="field text-sm h-9 p-1" value="${t.color||'#3b82f6'}"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <input type="text" id="tpl-notes" class="field text-sm" value="${t.notes||''}"></div>
          </div>
          <div class="flex gap-2 mt-4">
            <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
            <button onclick="schSaveTpl('${t.id||''}')" class="btn-primary flex-1 text-sm">Save</button>
          </div>
        </div>
      `);
      window.schSaveTpl = async function(id) {
        var p = {
          shift_name:    document.getElementById('tpl-name').value,
          start_time:    document.getElementById('tpl-start').value,
          end_time:      document.getElementById('tpl-end').value,
          break_minutes: document.getElementById('tpl-break').value,
          color:         document.getElementById('tpl-color').value,
          notes:         document.getElementById('tpl-notes').value,
        };
        // calc hours
        try {
          var s=p.start_time.split(':').map(Number), e=p.end_time.split(':').map(Number);
          var sm=s[0]*60+s[1], em=e[0]*60+e[1];
          if(em<=sm) em+=1440;
          p.total_hours = Math.round(((em-sm-(parseInt(p.break_minutes)||0))/60)*100)/100;
        } catch(_){}
        try {
          if (id) { await api('scheduler/templates/update', Object.assign({id:id}, p)); toast('Template updated','success'); }
          else    { await api('scheduler/templates/create', p); toast('Template created','success'); }
          schCloseModal();
          var r2 = await api('scheduler/templates/list', {});
          state.templates = r2.rows || [];
          renderList();
        } catch(e){ toast(e.message,'error'); }
      };
    };

    window.schAddTpl  = function() { openTplModal(); };
    window.schEditTpl = function(id) { openTplModal(state.templates.find(function(t){return t.id===id;})); };
    window.schDeleteTpl = async function(id) {
      if (!confirm('Delete this template?')) return;
      try { await api('scheduler/templates/delete', {id:id}); toast('Deleted','success');
        state.templates = state.templates.filter(function(t){return t.id!==id;}); renderList();
      } catch(e){ toast(e.message,'error'); }
    };
  }

  // ================================================================
  //  LOCATIONS TAB
  // ================================================================
  async function renderLocations(el) {
    var res = await api('scheduler/locations/list', {});
    state.locations = res.rows || [];

    var renderList = function() {
      var tb = document.getElementById('sch-loc-body');
      if (!tb) return;
      tb.innerHTML = state.locations.map(function(l) {
        return '<tr class="border-b border-slate-50 hover:bg-slate-50 text-sm">' +
          '<td class="px-4 py-3 font-semibold text-slate-800">' + (l.location_name||'') + '</td>' +
          '<td class="px-4 py-3 text-slate-500">' + (l.address||'—') + '</td>' +
          '<td class="px-4 py-3 text-slate-400 text-xs">' + (l.notes||'') + '</td>' +
          '<td class="px-4 py-3"><div class="flex gap-1">' +
            '<button onclick="schEditLoc(\'' + l.id + '\')" class="p-1.5 rounded hover:bg-blue-50 text-blue-500"><i class="fas fa-pencil text-xs"></i></button>' +
            '<button onclick="schDeleteLoc(\'' + l.id + '\')" class="p-1.5 rounded hover:bg-red-50 text-red-400"><i class="fas fa-trash text-xs"></i></button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="4" class="text-center text-slate-400 py-8">No locations yet</td></tr>';
    };

    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-end">
          <button onclick="schAddLoc()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i> Add Location</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-100 text-xs text-slate-500 font-semibold">
              <th class="text-left px-4 py-3">Location</th>
              <th class="text-left px-4 py-3">Address</th>
              <th class="text-left px-4 py-3">Notes</th>
              <th class="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody id="sch-loc-body"></tbody>
          </table>
        </div>
      </div>`;
    renderList();

    var openLocModal = function(l) {
      l = l || {};
      openModal(`
        <div class="p-5">
          <h3 class="font-bold text-slate-900 mb-4">${l.id?'Edit':'New'} Location</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Location Name</label>
              <input type="text" id="loc-name" class="field text-sm" value="${l.location_name||''}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Address</label>
              <input type="text" id="loc-addr" class="field text-sm" value="${l.address||''}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <input type="text" id="loc-notes" class="field text-sm" value="${l.notes||''}"></div>
          </div>
          <div class="flex gap-2 mt-4">
            <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
            <button onclick="schSaveLoc('${l.id||''}')" class="btn-primary flex-1 text-sm">Save</button>
          </div>
        </div>
      `);
      window.schSaveLoc = async function(id) {
        var p = { location_name: document.getElementById('loc-name').value, address: document.getElementById('loc-addr').value, notes: document.getElementById('loc-notes').value };
        try {
          if (id) { await api('scheduler/locations/update', Object.assign({id:id},p)); toast('Updated','success'); }
          else    { await api('scheduler/locations/create', p); toast('Created','success'); }
          schCloseModal();
          var r2 = await api('scheduler/locations/list', {}); state.locations = r2.rows||[]; renderList();
        } catch(e){ toast(e.message,'error'); }
      };
    };
    window.schAddLoc  = function() { openLocModal(); };
    window.schEditLoc = function(id){ openLocModal(state.locations.find(function(l){return l.id===id;})); };
    window.schDeleteLoc = async function(id) {
      if (!confirm('Delete location?')) return;
      try { await api('scheduler/locations/delete',{id:id}); toast('Deleted','success'); state.locations=state.locations.filter(function(l){return l.id!==id;}); renderList(); }
      catch(e){ toast(e.message,'error'); }
    };
  }

  // ================================================================
  //  AVAILABILITY TAB
  // ================================================================
  async function renderAvailability(el) {
    var res = await api('scheduler/availability/list', {});
    state.availability = res.rows || [];
    var DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    var TYPES = ['Available','Unavailable','Vacation','Training','Sick','Preferred'];

    var renderList = function() {
      var tb = document.getElementById('sch-av-body');
      if (!tb) return;
      tb.innerHTML = state.availability.map(function(a) {
        var empName = (state.users.find(function(u){return u.user_id===a.employee_id;})||{}).name || a.employee_name || a.employee_id;
        return '<tr class="border-b border-slate-50 hover:bg-slate-50 text-sm">' +
          '<td class="px-4 py-3 font-semibold text-slate-800">' + empName + '</td>' +
          '<td class="px-4 py-3">' + (a.day_of_week||'') + '</td>' +
          '<td class="px-4 py-3 text-slate-500">' + (a.available_start||'') + ' – ' + (a.available_end||'') + '</td>' +
          '<td class="px-4 py-3">' + _badge(a.availability_type) + '</td>' +
          '<td class="px-4 py-3"><div class="flex gap-1">' +
            '<button onclick="schEditAv(\'' + a.id + '\')" class="p-1.5 rounded hover:bg-blue-50 text-blue-500"><i class="fas fa-pencil text-xs"></i></button>' +
            '<button onclick="schDeleteAv(\'' + a.id + '\')" class="p-1.5 rounded hover:bg-red-50 text-red-400"><i class="fas fa-trash text-xs"></i></button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="5" class="text-center text-slate-400 py-8">No availability rules yet</td></tr>';
    };

    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">Define when each employee is available or unavailable. Used by auto-scheduler.</p>
          <button onclick="schAddAv()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i> Add Rule</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-100 text-xs text-slate-500 font-semibold">
              <th class="text-left px-4 py-3">Employee</th>
              <th class="text-left px-4 py-3">Day</th>
              <th class="text-left px-4 py-3">Window</th>
              <th class="text-left px-4 py-3">Type</th>
              <th class="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody id="sch-av-body"></tbody>
          </table>
        </div>
      </div>`;
    renderList();

    var openAvModal = function(a) {
      a = a || {};
      var empOpts = state.users.map(function(u){ return '<option value="'+u.user_id+'" '+(u.user_id===a.employee_id?'selected':'')+'>'+u.name+'</option>'; }).join('');
      openModal(`
        <div class="p-5">
          <h3 class="font-bold text-slate-900 mb-4">${a.id?'Edit':'New'} Availability Rule</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Employee</label>
              <select id="av-emp" class="field text-sm"><option value="">Select…</option>${empOpts}</select></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Day of Week</label>
              <select id="av-day" class="field text-sm">${DAYS.map(function(d){return '<option '+(d===a.day_of_week?'selected':'')+'>'+d+'</option>';}).join('')}</select></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">Available From</label>
                <input type="time" id="av-start" class="field text-sm" value="${a.available_start||'08:00'}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">Available To</label>
                <input type="time" id="av-end" class="field text-sm" value="${a.available_end||'18:00'}"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Type</label>
              <select id="av-type" class="field text-sm">${TYPES.map(function(t){return '<option '+(t===a.availability_type?'selected':'')+'>'+t+'</option>';}).join('')}</select></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <input type="text" id="av-notes" class="field text-sm" value="${a.notes||''}"></div>
          </div>
          <div class="flex gap-2 mt-4">
            <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
            <button onclick="schSaveAv('${a.id||''}')" class="btn-primary flex-1 text-sm">Save</button>
          </div>
        </div>
      `);
      window.schSaveAv = async function(id) {
        var empEl = document.getElementById('av-emp');
        var empName = empEl.options[empEl.selectedIndex]?.text || '';
        var p = { employee_id: empEl.value, employee_name: empName,
          day_of_week: document.getElementById('av-day').value,
          available_start: document.getElementById('av-start').value,
          available_end: document.getElementById('av-end').value,
          availability_type: document.getElementById('av-type').value,
          notes: document.getElementById('av-notes').value };
        try {
          if(id){ await api('scheduler/availability/update',Object.assign({id:id},p)); toast('Updated','success'); }
          else  { await api('scheduler/availability/create',p); toast('Created','success'); }
          schCloseModal(); var r2=await api('scheduler/availability/list',{}); state.availability=r2.rows||[]; renderList();
        } catch(e){ toast(e.message,'error'); }
      };
    };
    window.schAddAv  = function(){ openAvModal(); };
    window.schEditAv = function(id){ openAvModal(state.availability.find(function(a){return a.id===id;})); };
    window.schDeleteAv = async function(id){
      if(!confirm('Delete this rule?')) return;
      try{ await api('scheduler/availability/delete',{id:id}); toast('Deleted','success'); state.availability=state.availability.filter(function(a){return a.id!==id;}); renderList(); }
      catch(e){ toast(e.message,'error'); }
    };
  }

  // ================================================================
  //  TIME OFF TAB
  // ================================================================
  async function renderTimeOff(el) {
    var res = await api('scheduler/timeoff/list', {});
    state.timeoff = res.rows || [];
    var TYPES = ['Vacation','Sick','Personal','Unpaid','Training'];

    var renderList = function() {
      var tb = document.getElementById('sch-to-body');
      if (!tb) return;
      tb.innerHTML = state.timeoff.slice().sort(function(a,b){return String(b.created_at)>String(a.created_at)?1:-1;}).map(function(r) {
        return '<tr class="border-b border-slate-50 hover:bg-slate-50 text-sm">' +
          '<td class="px-4 py-3 font-semibold text-slate-800">' + (r.employee_name||r.employee_id||'—') + '</td>' +
          '<td class="px-4 py-3 text-slate-500">' + String(r.start_date).substring(0,10) + ' → ' + String(r.end_date).substring(0,10) + '</td>' +
          '<td class="px-4 py-3">' + (r.type||'—') + '</td>' +
          '<td class="px-4 py-3 text-slate-400 text-xs">' + (r.reason||'') + '</td>' +
          '<td class="px-4 py-3">' + _badge(r.status) + '</td>' +
          '<td class="px-4 py-3">' +
            (r.status==='Pending' ? '<div class="flex gap-1">' +
              '<button onclick="schApproveTO(\'' + r.id + '\')" class="bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-lg transition">Approve</button>' +
              '<button onclick="schRejectTO(\'' + r.id + '\')"  class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-2 py-1 rounded-lg transition">Reject</button>' +
            '</div>' : '<span class="text-xs text-slate-400">' + (r.approved_by||'') + '</span>') +
          '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-8">No time-off requests</td></tr>';
    };

    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-end">
          <button onclick="schAddTO()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i> New Request</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-100 text-xs text-slate-500 font-semibold">
              <th class="text-left px-4 py-3">Employee</th>
              <th class="text-left px-4 py-3">Dates</th>
              <th class="text-left px-4 py-3">Type</th>
              <th class="text-left px-4 py-3">Reason</th>
              <th class="text-left px-4 py-3">Status</th>
              <th class="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody id="sch-to-body"></tbody>
          </table>
        </div>
      </div>`;
    renderList();

    window.schApproveTO = async function(id){ try{ await api('scheduler/timeoff/approve',{id:id,approved_by:me?.name||me?.user_id||'Manager'}); toast('Approved','success'); var r=await api('scheduler/timeoff/list',{}); state.timeoff=r.rows||[]; renderList(); }catch(e){toast(e.message,'error');} };
    window.schRejectTO  = async function(id){ try{ await api('scheduler/timeoff/reject', {id:id,approved_by:me?.name||me?.user_id||'Manager'}); toast('Rejected','info');  var r=await api('scheduler/timeoff/list',{}); state.timeoff=r.rows||[]; renderList(); }catch(e){toast(e.message,'error');} };
    window.schAddTO = function(){
      var empOpts = state.users.map(function(u){ return '<option value="'+u.user_id+'" data-name="'+u.name+'">'+u.name+'</option>'; }).join('');
      openModal(`
        <div class="p-5">
          <h3 class="font-bold text-slate-900 mb-4">New Time-Off Request</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Employee</label>
              <select id="to-emp" class="field text-sm"><option value="">Select…</option>${empOpts}</select></div>
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                <input type="date" id="to-start" class="field text-sm" value="${_today()}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                <input type="date" id="to-end" class="field text-sm" value="${_today()}"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Type</label>
              <select id="to-type" class="field text-sm">${TYPES.map(function(t){return '<option>'+t+'</option>';}).join('')}</select></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Reason</label>
              <textarea id="to-reason" class="field text-sm" rows="2"></textarea></div>
          </div>
          <div class="flex gap-2 mt-4">
            <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
            <button onclick="schSaveTO()" class="btn-primary flex-1 text-sm">Submit Request</button>
          </div>
        </div>
      `);
      window.schSaveTO = async function(){
        var empEl=document.getElementById('to-emp');
        var p={ employee_id:empEl.value, employee_name:empEl.options[empEl.selectedIndex]?.dataset?.name||'',
          start_date:document.getElementById('to-start').value, end_date:document.getElementById('to-end').value,
          type:document.getElementById('to-type').value, reason:document.getElementById('to-reason').value };
        try{ await api('scheduler/timeoff/create',p); toast('Request submitted','success'); schCloseModal(); var r=await api('scheduler/timeoff/list',{}); state.timeoff=r.rows||[]; renderList(); }
        catch(e){toast(e.message,'error');}
      };
    };
  }

  // ================================================================
  //  SWAPS TAB
  // ================================================================
  async function renderSwaps(el) {
    var res = await api('scheduler/swaps/list', {});
    state.swaps = res.rows || [];

    var renderList = function() {
      var tb = document.getElementById('sch-sw-body');
      if (!tb) return;
      tb.innerHTML = state.swaps.map(function(r) {
        return '<tr class="border-b border-slate-50 hover:bg-slate-50 text-sm">' +
          '<td class="px-4 py-3 font-semibold text-slate-800">' + (r.requested_by_name||r.requested_by_id||'—') + '</td>' +
          '<td class="px-4 py-3 text-slate-500">' + String(r.swap_date||'').substring(0,10) + ' · ' + (r.shift_name||'') + '</td>' +
          '<td class="px-4 py-3">' + (r.replacement_name||r.replacement_id||'—') + '</td>' +
          '<td class="px-4 py-3">' + _badge(r.status) + '</td>' +
          '<td class="px-4 py-3">' +
            (r.status==='Pending'?'<div class="flex gap-1">'+
              '<button onclick="schApproveSwap(\'' + r.id + '\',\'' + r.schedule_id + '\',\'' + r.replacement_id + '\',\'' + (r.replacement_name||'').replace(/'/g,'') + '\')" class="bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-lg">Approve</button>'+
              '<button onclick="schRejectSwap(\'' + r.id + '\')" class="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-2 py-1 rounded-lg">Reject</button>'+
            '</div>':'<span class="text-xs text-slate-400">' + (r.manager_notes||'') + '</span>') +
          '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="text-center text-slate-400 py-8">No swap requests</td></tr>';
    };

    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-slate-500">Employees can request to swap shifts. Approve here to auto-reassign.</p>
          <button onclick="schAddSwap()" class="btn-primary text-xs px-3 py-2 gap-1.5"><i class="fas fa-plus text-xs"></i> Request Swap</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-100 text-xs text-slate-500 font-semibold">
              <th class="text-left px-4 py-3">Requested By</th>
              <th class="text-left px-4 py-3">Shift</th>
              <th class="text-left px-4 py-3">Replacement</th>
              <th class="text-left px-4 py-3">Status</th>
              <th class="text-left px-4 py-3">Actions</th>
            </tr></thead>
            <tbody id="sch-sw-body"></tbody>
          </table>
        </div>
      </div>`;
    renderList();

    window.schApproveSwap = async function(id, schedId, repId, repName){
      try{ await api('scheduler/swaps/approve',{id:id,schedule_id:schedId,replacement_id:repId,replacement_name:repName,manager_notes:'Approved'}); toast('Swap approved','success'); var r=await api('scheduler/swaps/list',{}); state.swaps=r.rows||[]; renderList(); }catch(e){toast(e.message,'error');}
    };
    window.schRejectSwap = async function(id){
      try{ await api('scheduler/swaps/reject',{id:id,manager_notes:'Rejected'}); toast('Swap rejected','info'); var r=await api('scheduler/swaps/list',{}); state.swaps=r.rows||[]; renderList(); }catch(e){toast(e.message,'error');}
    };
    window.schAddSwap = function(){
      var empOpts = state.users.map(function(u){ return '<option value="'+u.user_id+'" data-name="'+u.name+'">'+u.name+'</option>'; }).join('');
      openModal(`
        <div class="p-5">
          <h3 class="font-bold text-slate-900 mb-4">Request Shift Swap</h3>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Requesting Employee</label>
              <select id="sw-req" class="field text-sm"><option value="">Select…</option>${empOpts}</select></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Shift Date</label>
              <input type="date" id="sw-date" class="field text-sm" value="${_today()}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Shift Name</label>
              <input type="text" id="sw-shift" class="field text-sm" placeholder="e.g. Morning"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Replacement Employee</label>
              <select id="sw-rep" class="field text-sm"><option value="">Select…</option>${empOpts}</select></div>
          </div>
          <div class="flex gap-2 mt-4">
            <button onclick="schCloseModal()" class="btn-secondary flex-1 text-sm">Cancel</button>
            <button onclick="schSaveSwap()" class="btn-primary flex-1 text-sm">Submit</button>
          </div>
        </div>
      `);
      window.schSaveSwap = async function(){
        var reqEl=document.getElementById('sw-req'), repEl=document.getElementById('sw-rep');
        var p={ requested_by_id:reqEl.value, requested_by_name:reqEl.options[reqEl.selectedIndex]?.dataset?.name||'',
          replacement_id:repEl.value, replacement_name:repEl.options[repEl.selectedIndex]?.dataset?.name||'',
          swap_date:document.getElementById('sw-date').value, shift_name:document.getElementById('sw-shift').value };
        try{ await api('scheduler/swaps/create',p); toast('Swap requested','success'); schCloseModal(); var r=await api('scheduler/swaps/list',{}); state.swaps=r.rows||[]; renderList(); }
        catch(e){toast(e.message,'error');}
      };
    };
  }

  // ================================================================
  //  OVERTIME TAB
  // ================================================================
  async function renderOvertime(el) {
    var res = await api('scheduler/overtime/rules', {});
    var rules = res.rules || {};

    el.innerHTML = `
      <div class="max-w-lg space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <i class="fas fa-exclamation-triangle text-red-500"></i>
            </div>
            <div>
              <h3 class="font-bold text-slate-900">Overtime Rules</h3>
              <p class="text-xs text-slate-500">Alerts fire when limits are exceeded during shift creation</p>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Max Daily Hours</label>
              <div class="flex items-center gap-2">
                <input type="number" id="ot-daily" class="field text-sm w-24" value="${rules.max_daily_hours||12}" min="1" max="24">
                <span class="text-xs text-slate-400">hours per day</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Max Weekly Hours</label>
              <div class="flex items-center gap-2">
                <input type="number" id="ot-weekly" class="field text-sm w-24" value="${rules.max_weekly_hours||40}" min="1" max="168">
                <span class="text-xs text-slate-400">hours per week</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Min Rest Between Shifts</label>
              <div class="flex items-center gap-2">
                <input type="number" id="ot-rest" class="field text-sm w-24" value="${rules.min_rest_hours||8}" min="0">
                <span class="text-xs text-slate-400">hours</span>
              </div>
            </div>
            <div id="ot-status"></div>
            <button onclick="schSaveOT()" class="btn-primary w-full text-sm">
              <i class="fas fa-save text-xs"></i> Save Rules
            </button>
          </div>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700">
          <i class="fas fa-info-circle mr-1"></i>
          These rules are checked every time a shift is created. Managers will see an alert but can still proceed.
        </div>
      </div>
    `;

    window.schSaveOT = async function(){
      var statusEl = document.getElementById('ot-status');
      try{
        await api('scheduler/overtime/set-rules',{
          max_daily_hours:  document.getElementById('ot-daily').value,
          max_weekly_hours: document.getElementById('ot-weekly').value,
          min_rest_hours:   document.getElementById('ot-rest').value,
        });
        statusEl.innerHTML = '<div class="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl px-3 py-2 mb-2"><i class="fas fa-check-circle mr-1"></i> Rules saved</div>';
        toast('Overtime rules saved','success');
      }catch(e){
        statusEl.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-2">' + e.message + '</div>';
      }
    };
  }

  // ================================================================
  //  MODAL HELPERS
  // ================================================================
  function openModal(html) {
    document.getElementById('sch-modal').innerHTML = html;
    document.getElementById('sch-modal-bg').classList.remove('hidden');
  }
  function schCloseModal() {
    document.getElementById('sch-modal-bg').classList.add('hidden');
    document.getElementById('sch-modal').innerHTML = '';
  }
  window.schCloseModal = schCloseModal;

  // ── Boot ──────────────────────────────────────────────────────
  render();
};
