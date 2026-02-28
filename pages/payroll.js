window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['payroll'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var runsCache   = {};      // keyed by id
  var empCache    = [];      // payroll employees list
  var usersCache  = [];      // WV users
  var tsCache     = [];      // timesheets (for autofill)
  var activeView  = sessionStorage.getItem('payroll_view') || 'runs';
  var filters     = { status: '', employee_id: '', period: '', search: '' };
  var sortState   = { col: 'period_start', dir: 'desc' };
  var _searchTimer = null;
  var _searchVal   = '';
  var _liveTotal   = 0;   // running payroll cost counter

  // ── Constants ─────────────────────────────────────────────────
  var STATUSES = ['Draft', 'Pending', 'Approved', 'Paid', 'Rejected'];
  var PAY_TYPES = ['Hourly', 'Salary', 'Contract'];

  var STATUS_CFG = {
    'Draft':    { bg:'#f1f5f9', text:'#64748b', border:'#cbd5e1', icon:'fa-pencil',       dot:'#94a3b8' },
    'Pending':  { bg:'#fffbeb', text:'#92400e', border:'#fcd34d', icon:'fa-clock',         dot:'#f59e0b' },
    'Approved': { bg:'#f0fdf4', text:'#166534', border:'#86efac', icon:'fa-check-circle',  dot:'#22c55e' },
    'Paid':     { bg:'#eff6ff', text:'#1e40af', border:'#93c5fd', icon:'fa-circle-dollar-to-slot', dot:'#3b82f6' },
    'Rejected': { bg:'#fef2f2', text:'#991b1b', border:'#fca5a5', icon:'fa-times-circle',  dot:'#ef4444' },
  };

  var TAX_BRACKETS = [
    { max: 11600,  rate: 0.10 },
    { max: 47150,  rate: 0.12 },
    { max: 100525, rate: 0.22 },
    { max: 191950, rate: 0.24 },
    { max: 243725, rate: 0.32 },
    { max: 609350, rate: 0.35 },
    { max: Infinity, rate: 0.37 },
  ];

  var MODAL_ID = 'wv-payroll-modal';

  // ── Role helpers ───────────────────────────────────────────────
  function getRole()   { try { return window.WorkVolt.user().role || 'SuperAdmin'; } catch(e) { return 'SuperAdmin'; } }
  function isAdmin()   { return ['SuperAdmin','Admin'].includes(getRole()); }
  function isPayroll() { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function myUserId()  { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } }

  // ── API ────────────────────────────────────────────────────────
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

  // ── Utilities ─────────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtMoney(v) {
    var n = parseFloat(v) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
    catch(e) { return d; }
  }
  function fmtPeriod(start, end) {
    if (!start && !end) return '—';
    return fmtDate(start) + ' – ' + fmtDate(end);
  }
  function genId() { return 'PAY-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase(); }
  function toast(msg, type) { if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info'); }

  function userName(uid) {
    if (!uid) return '—';
    var u = empCache.find(function(e) { return e.id === uid || e.user_id === uid; })
         || usersCache.find(function(u) { return u.user_id === uid || u.id === uid; });
    return u ? (u.name || u.email || uid) : uid;
  }
  function userInitials(name) {
    return (name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  }
  function avatarColors(name) {
    var colors = [
      ['#dbeafe','#1e40af'],['#fce7f3','#9d174d'],['#d1fae5','#065f46'],
      ['#fef3c7','#92400e'],['#ede9fe','#5b21b6'],['#ffedd5','#9a3412'],
    ];
    var idx = (name||'').charCodeAt(0) % colors.length;
    return colors[idx];
  }
  function avatar(name, size) {
    size = size || 36;
    var c = avatarColors(name);
    var ini = userInitials(name);
    return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+c[0]+';color:'+c[1]+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:'+Math.round(size*.35)+'px;flex-shrink:0;font-family:inherit">'+ini+'</div>';
  }

  // ── Tax Calculator ─────────────────────────────────────────────
  function calcFederalTax(annualGross) {
    var tax = 0; var prev = 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      var b = TAX_BRACKETS[i];
      if (annualGross <= prev) break;
      var taxable = Math.min(annualGross, b.max) - prev;
      tax += taxable * b.rate;
      prev = b.max;
    }
    return tax;
  }
  function calcTaxes(gross, payPeriods) {
    payPeriods = payPeriods || 26; // biweekly default
    var annual = gross * payPeriods;
    var annualFed = calcFederalTax(annual);
    var perPeriodFed = annualFed / payPeriods;
    var fica = gross * 0.0765; // Social Security + Medicare
    var state = gross * 0.05;  // approximate state (5%)
    return {
      federal: Math.round(perPeriodFed * 100) / 100,
      fica:    Math.round(fica         * 100) / 100,
      state:   Math.round(state        * 100) / 100,
      total:   Math.round((perPeriodFed + fica + state) * 100) / 100,
    };
  }
  function calcOvertimeHours(regular, total) {
    regular = parseFloat(regular) || 0;
    total   = parseFloat(total)   || 0;
    return Math.max(0, total - regular);
  }
  function calcGross(emp, hoursRegular, hoursOT, salary, bonuses) {
    hoursRegular = parseFloat(hoursRegular) || 0;
    hoursOT      = parseFloat(hoursOT)      || 0;
    bonuses      = parseFloat(bonuses)      || 0;
    var base = 0;
    if (emp && emp.pay_type === 'Salary') {
      base = parseFloat(emp.salary) || parseFloat(salary) || 0;
    } else {
      var rate = parseFloat((emp && emp.salary) || salary || 0);
      base = (hoursRegular * rate) + (hoursOT * rate * 1.5);
    }
    return Math.round((base + bonuses) * 100) / 100;
  }

  // ── Status Badge ──────────────────────────────────────────────
  function statusBadge(s) {
    var c = STATUS_CFG[s] || STATUS_CFG['Draft'];
    return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700;background:'+c.bg+';color:'+c.text+';border:1.5px solid '+c.border+'">' +
      '<i class="fas '+c.icon+'" style="font-size:9px"></i>'+esc(s)+'</span>';
  }

  // ── Anomaly Detection ─────────────────────────────────────────
  function detectAnomalies(run, prev) {
    var warnings = [];
    if (!run) return warnings;
    var gross = parseFloat(run.gross) || 0;
    var net   = parseFloat(run.net)   || 0;
    var hours = parseFloat(run.hours_total) || 0;
    if (net < 0) warnings.push({ level:'error', msg:'Net pay is negative — check deductions' });
    if (hours > 60) warnings.push({ level:'warning', msg:'Unusual hours: ' + hours + 'h logged this period' });
    if (prev) {
      var prevGross = parseFloat(prev.gross) || 0;
      if (prevGross > 0) {
        var change = ((gross - prevGross) / prevGross) * 100;
        if (Math.abs(change) > 50) {
          warnings.push({ level:'warning', msg:'Gross pay changed ' + (change>0?'+':'') + Math.round(change) + '% vs last period' });
        }
      }
    }
    if (!run.employee_id) warnings.push({ level:'error', msg:'No employee assigned' });
    if (!run.period_start || !run.period_end) warnings.push({ level:'error', msg:'Pay period dates missing' });
    return warnings;
  }

  // ── Modal Portal ──────────────────────────────────────────────
  function getPortal() {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el = document.createElement('div'); el.id = MODAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html) { getPortal().innerHTML = html; }
  function closeModal()    { getPortal().innerHTML = ''; }

  // ── Filters & Sort ─────────────────────────────────────────────
  function applyFilters(rows) {
    return rows.filter(function(r) {
      if (filters.status      && r.status      !== filters.status)      return false;
      if (filters.employee_id && r.employee_id !== filters.employee_id) return false;
      if (_searchVal) {
        var q = _searchVal.toLowerCase();
        var h = (r.employee_name||'') + ' ' + (r.id||'') + ' ' + (r.status||'') + ' ' + (r.period_start||'');
        if (!h.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }
  function applySort(rows) {
    return rows.slice().sort(function(a, b) {
      var v = sortState.col;
      var av = a[v] || '', bv = b[v] || '';
      var num = ['gross','net','hours_total','hours_regular','hours_ot'];
      if (num.includes(v)) {
        av = parseFloat(av) || 0; bv = parseFloat(bv) || 0;
      }
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }

  // ── Live Total ────────────────────────────────────────────────
  function calcLiveTotal(runs) {
    return Object.values(runs).reduce(function(s,r) {
      return s + (parseFloat(r.net) || 0);
    }, 0);
  }
  function updateLiveTicker(val) {
    var el = document.getElementById('payroll-live-total');
    if (el) el.textContent = fmtMoney(val);
  }

  // ── Load Data ─────────────────────────────────────────────────
  function loadData() {
    var main = container.querySelector('#payroll-main');
    if (main) main.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:12px;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i> Loading payroll data…</div>';

    var promises = [
      api('payroll/runs/list').catch(function() { return { rows:[] }; }),
      api('payroll/employees/list').catch(function() { return { rows:[] }; }),
      api('users/list').catch(function() { return { rows:[] }; }),
    ];

    // Optionally pull timesheets for autofill
    if (localStorage.getItem('wv_module_timesheets')) {
      promises.push(api('timesheets/list').catch(function() { return { rows:[] }; }));
    } else {
      promises.push(Promise.resolve({ rows:[] }));
    }

    return Promise.all(promises).then(function(results) {
      var runs = results[0].rows || [];
      var emps = results[1].rows || [];
      var users = results[2].rows || [];
      tsCache = results[3].rows || [];

      runsCache = {};
      runs.forEach(function(r) { runsCache[r.id] = r; });
      empCache   = emps;
      usersCache = users;
      _liveTotal = calcLiveTotal(runsCache);
      rerender();
    }).catch(function(err) {
      if (main) main.innerHTML = '<div style="padding:3rem;text-align:center;color:#ef4444"><i class="fas fa-exclamation-circle" style="font-size:2rem;display:block;margin-bottom:1rem"></i>' + esc(err.message) + '</div>';
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN RENDER
  // ═══════════════════════════════════════════════════════════════
  function render() {
    container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
      #payroll-root { font-family:'DM Sans',sans-serif; }
      #payroll-root * { box-sizing:border-box; }
      .pr-input { width:100%; padding:.55rem .875rem; border:1.5px solid #e2e8f0; border-radius:10px; font-size:.875rem; outline:none; transition:border-color .15s, box-shadow .15s; font-family:'DM Sans',sans-serif; background:#fff; color:#1e293b; }
      .pr-input:focus { border-color:#10b981; box-shadow:0 0 0 3px rgba(16,185,129,.12); }
      .pr-label { display:block; font-size:.75rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:.4rem; }
      .pr-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:16px; overflow:hidden; }
      .pr-section-head { font-size:.7rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; padding:.75rem 1.25rem .4rem; }
      .pr-btn { display:inline-flex; align-items:center; gap:.4rem; padding:.55rem 1.1rem; border-radius:10px; font-size:.875rem; font-weight:700; cursor:pointer; border:none; transition:all .15s; font-family:'DM Sans',sans-serif; }
      .pr-btn-green  { background:#10b981; color:#fff; }
      .pr-btn-green:hover  { background:#059669; }
      .pr-btn-slate  { background:#f1f5f9; color:#475569; border:1.5px solid #e2e8f0; }
      .pr-btn-slate:hover  { background:#e2e8f0; }
      .pr-btn-red    { background:#fef2f2; color:#dc2626; border:1.5px solid #fecaca; }
      .pr-btn-red:hover    { background:#fee2e2; }
      .pr-btn-amber  { background:#fffbeb; color:#b45309; border:1.5px solid #fcd34d; }
      .pr-btn-amber:hover  { background:#fef3c7; }
      .pr-btn-blue   { background:#eff6ff; color:#1d4ed8; border:1.5px solid #bfdbfe; }
      .pr-btn-blue:hover   { background:#dbeafe; }
      .pr-row { display:flex; align-items:center; gap:1rem; padding:.875rem 1.25rem; border-bottom:1px solid #f1f5f9; transition:background .12s; cursor:pointer; }
      .pr-row:hover { background:#f8fafc; }
      .pr-row:last-child { border-bottom:none; }
      .pr-sort-btn { background:none; border:none; cursor:pointer; color:#94a3b8; font-size:.7rem; padding:0; }
      .pr-sort-btn.active { color:#10b981; }
      .net-pay-display { font-family:'DM Mono',monospace; font-size:2.5rem; font-weight:700; color:#0f172a; letter-spacing:-1px; }
      .ticker-val { font-family:'DM Mono',monospace; font-weight:700; }
      .warning-pill { display:flex; align-items:center; gap:.5rem; padding:.4rem .75rem; border-radius:8px; font-size:.75rem; font-weight:600; }
      .warning-pill.error { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
      .warning-pill.warning { background:#fffbeb; color:#b45309; border:1px solid #fcd34d; }
      .pr-breakdown-row { display:flex; justify-content:space-between; align-items:center; padding:.4rem 0; font-size:.875rem; border-bottom:1px solid #f8fafc; }
      .pr-breakdown-row:last-child { border-bottom:none; }
      .pr-th { padding:.6rem 1rem; text-align:left; font-size:.7rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; white-space:nowrap; }
      .pr-td { padding:.75rem 1rem; vertical-align:middle; }
      .tab-btn { padding:.5rem 1rem; font-size:.8rem; font-weight:700; border:none; background:none; cursor:pointer; color:#94a3b8; border-bottom:2.5px solid transparent; transition:all .15s; font-family:'DM Sans',sans-serif; }
      .tab-btn.active { color:#0f172a; border-bottom-color:#10b981; }
    </style>

    <div id="payroll-root">
      <!-- ── Frozen header ───────────────────────────────────────── -->
      <div style="background:#fff;border-bottom:1.5px solid #e2e8f0;padding:.75rem 1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;position:sticky;top:0;z-index:20">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
            <h1 style="font-size:1.25rem;font-weight:800;color:#0f172a;margin:0;white-space:nowrap">
              <i class="fas fa-money-bill-wave" style="color:#10b981;margin-right:.4rem"></i>Payroll
            </h1>
            <!-- Live payroll ticker -->
            <div style="display:flex;align-items:center;gap:.4rem;background:#f0fdf4;border:1.5px solid #86efac;border-radius:9999px;padding:.25rem .75rem">
              <span style="width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;animation:pulse 2s infinite"></span>
              <span style="font-size:.7rem;font-weight:700;color:#166534">Live total:</span>
              <span id="payroll-live-total" class="ticker-val" style="font-size:.75rem;color:#166534">${fmtMoney(_liveTotal)}</span>
            </div>
          </div>
        </div>
        <!-- Tabs -->
        <div style="display:flex;border-bottom:2px solid #e2e8f0;gap:.5rem">
          <button class="tab-btn ${activeView==='runs'?'active':''}" onclick="payrollSetView('runs')"><i class="fas fa-list-alt" style="margin-right:.35rem"></i>Pay Runs</button>
          <button class="tab-btn ${activeView==='employees'?'active':''}" onclick="payrollSetView('employees')"><i class="fas fa-users" style="margin-right:.35rem"></i>Employees</button>
          <button class="tab-btn ${activeView==='summary'?'active':''}" onclick="payrollSetView('summary')"><i class="fas fa-chart-bar" style="margin-right:.35rem"></i>Summary</button>
        </div>
        <!-- Actions -->
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${isPayroll() ? '<button class="pr-btn pr-btn-green" onclick="payrollNewRun()"><i class="fas fa-plus"></i> New Pay Run</button>' : ''}
          <button class="pr-btn pr-btn-slate" onclick="payrollExportCSV()" title="Export CSV"><i class="fas fa-download"></i></button>
        </div>
      </div>

      <!-- ── Filter bar ──────────────────────────────────────────── -->
      <div style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;padding:.625rem 1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
        <div style="position:relative;flex:1;min-width:180px;max-width:260px">
          <i class="fas fa-search" style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:#cbd5e1;font-size:.75rem;pointer-events:none"></i>
          <input type="text" placeholder="Search employee, ID…" class="pr-input" style="padding-left:2.25rem;height:36px"
            oninput="payrollSearch(this.value)" value="${esc(_searchVal)}">
        </div>
        <select class="pr-input" style="height:36px;width:auto" onchange="payrollFilter('status',this.value)">
          <option value="">All Statuses</option>
          ${STATUSES.map(function(s){ return '<option value="'+s+'"'+(filters.status===s?' selected':'')+'>'+s+'</option>'; }).join('')}
        </select>
        <select class="pr-input" style="height:36px;width:auto" onchange="payrollFilter('employee_id',this.value)">
          <option value="">All Employees</option>
          ${empCache.map(function(e){ return '<option value="'+e.id+'"'+(filters.employee_id===e.id?' selected':'')+'>'+esc(e.name||e.email)+'</option>'; }).join('')}
        </select>
        ${filters.status || filters.employee_id || _searchVal ? '<button class="pr-btn pr-btn-slate" style="height:36px;font-size:.75rem" onclick="payrollClearFilters()"><i class="fas fa-times"></i> Clear</button>' : ''}
      </div>

      <!-- ── Main content ────────────────────────────────────────── -->
      <div id="payroll-main" style="padding:1.5rem">
        <div style="display:flex;align-items:center;justify-content:center;height:200px;gap:12px;color:#94a3b8">
          <i class="fas fa-spinner fa-spin"></i> Loading…
        </div>
      </div>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>`;

    // Wire globals
    window.payrollSetView     = setView;
    window.payrollFilter      = function(key, val) { filters[key] = val; rerender(); };
    window.payrollClearFilters= clearFilters;
    window.payrollSearch      = function(val) {
      _searchVal = val;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(rerender, 280);
    };
    window.payrollNewRun      = openRunForm;
    window.payrollExportCSV   = exportCSV;
    window.payrollOpenRun     = openRunDetail;
    window.payrollEditRun     = openEditRun;
    window.payrollDeleteRun   = deleteRun;
    window.payrollApprove     = approveRun;
    window.payrollReject      = rejectRun;
    window.payrollMarkPaid    = markPaid;
    window.payrollSubmitForm  = submitRunForm;
    window.payrollPreviewSlip = previewPayslip;
    window.payrollAutofillTS  = autofillFromTimesheets;
    window.payrollSortCol     = function(col) {
      if (sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else { sortState.col = col; sortState.dir = 'desc'; }
      rerender();
    };
    window.payrollNewEmployee = openEmployeeForm;
    window.payrollEditEmp     = openEditEmployee;
    window.payrollSubmitEmp   = submitEmployeeForm;
    window.payrollDeleteEmp   = deleteEmployee;
    window.payrollCloseModal  = closeModal;
    window.payrollRecalc      = recalcFormLive;

    loadData();
  }

  function setView(v) {
    activeView = v;
    sessionStorage.setItem('payroll_view', v);
    // Update tab underlines
    container.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.textContent.trim().toLowerCase().startsWith(v));
    });
    rerender();
  }

  function clearFilters() {
    filters = { status:'', employee_id:'', period:'', search:'' };
    _searchVal = '';
    var inp = container.querySelector('input[type=text]');
    if (inp) inp.value = '';
    rerender();
  }

  // ═══════════════════════════════════════════════════════════════
  //  RERENDER
  // ═══════════════════════════════════════════════════════════════
  function rerender() {
    var main = container.querySelector('#payroll-main');
    if (!main) return;
    _liveTotal = calcLiveTotal(runsCache);
    updateLiveTicker(_liveTotal);

    if (activeView === 'runs')      main.innerHTML = renderRunsView();
    else if (activeView === 'employees') main.innerHTML = renderEmployeesView();
    else if (activeView === 'summary')   main.innerHTML = renderSummaryView();
  }

  // ═══════════════════════════════════════════════════════════════
  //  RUNS LIST VIEW
  // ═══════════════════════════════════════════════════════════════
  function renderRunsView() {
    var rows = applySort(applyFilters(Object.values(runsCache)));
    if (!rows.length) return emptyState('fa-money-bill-wave', 'No pay runs yet', isPayroll() ? 'Click <strong>New Pay Run</strong> to create your first payroll entry.' : 'No payroll records found.');

    var sortIcon = function(col) {
      if (sortState.col !== col) return '<i class="fas fa-sort pr-sort-btn"></i>';
      return '<i class="fas fa-sort-'+(sortState.dir==='asc'?'up':'down')+' pr-sort-btn active"></i>';
    };

    // Stats strip
    var total      = rows.length;
    var approved   = rows.filter(function(r){return r.status==='Approved';}).length;
    var paid       = rows.filter(function(r){return r.status==='Paid';}).length;
    var pending    = rows.filter(function(r){return r.status==='Pending';}).length;
    var totalNet   = rows.reduce(function(s,r){return s+(parseFloat(r.net)||0);},0);
    var totalGross = rows.reduce(function(s,r){return s+(parseFloat(r.gross)||0);},0);

    return `
    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.5rem">
      ${statCard('fa-file-invoice-dollar','#6366f1','Total Runs', total + ' runs', '')}
      ${statCard('fa-check-circle','#10b981','Approved', approved, fmtMoney(totalNet) + ' net')}
      ${statCard('fa-circle-dollar-to-slot','#3b82f6','Paid Out', paid, '')}
      ${statCard('fa-clock','#f59e0b','Pending', pending + ' awaiting', '')}
      ${statCard('fa-coins','#0f172a','Gross Payroll', fmtMoney(totalGross), '')}
    </div>

    <!-- Table -->
    <div class="pr-card">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
            <th class="pr-th"><button class="pr-sort-btn ${sortState.col==='employee_name'?'active':''}" onclick="payrollSortCol('employee_name')">Employee ${sortIcon('employee_name')}</button></th>
            <th class="pr-th"><button class="pr-sort-btn ${sortState.col==='period_start'?'active':''}" onclick="payrollSortCol('period_start')">Pay Period ${sortIcon('period_start')}</button></th>
            <th class="pr-th"><button class="pr-sort-btn ${sortState.col==='gross'?'active':''}" onclick="payrollSortCol('gross')">Gross ${sortIcon('gross')}</button></th>
            <th class="pr-th">Deductions</th>
            <th class="pr-th"><button class="pr-sort-btn ${sortState.col==='net'?'active':''}" onclick="payrollSortCol('net')">Net Pay ${sortIcon('net')}</button></th>
            <th class="pr-th">Status</th>
            <th class="pr-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(function(r) {
            var empName = r.employee_name || userName(r.employee_id) || '—';
            var deductions = (parseFloat(r.deductions)||0) + (parseFloat(r.tax_total)||0);
            var warnings = detectAnomalies(r, null);
            var hasError = warnings.some(function(w){return w.level==='error';});
            return '<tr style="border-bottom:1px solid #f1f5f9;transition:background .1s;cursor:pointer" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'" onclick="payrollOpenRun(\''+r.id+'\')">'+
              '<td class="pr-td">'+
                '<div style="display:flex;align-items:center;gap:.625rem">'+
                  avatar(empName, 32)+
                  '<div>'+
                    '<div style="font-weight:700;font-size:.875rem;color:#0f172a">'+esc(empName)+'</div>'+
                    '<div style="font-size:.7rem;color:#94a3b8">'+esc(r.id||'')+'</div>'+
                  '</div>'+
                  (hasError ? '<i class="fas fa-exclamation-triangle" style="color:#ef4444;font-size:.75rem;margin-left:4px" title="Has errors"></i>' : '')+
                '</div>'+
              '</td>'+
              '<td class="pr-td" style="font-size:.8rem;color:#475569">'+esc(fmtPeriod(r.period_start,r.period_end))+'</td>'+
              '<td class="pr-td" style="font-family:\'DM Mono\',monospace;font-size:.875rem;font-weight:600">'+fmtMoney(r.gross)+'</td>'+
              '<td class="pr-td" style="font-family:\'DM Mono\',monospace;font-size:.875rem;color:#ef4444">–'+fmtMoney(deductions)+'</td>'+
              '<td class="pr-td"><span style="font-family:\'DM Mono\',monospace;font-size:.95rem;font-weight:800;color:#0f172a">'+fmtMoney(r.net)+'</span></td>'+
              '<td class="pr-td">'+statusBadge(r.status||'Draft')+'</td>'+
              '<td class="pr-td" onclick="event.stopPropagation()">'+
                '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'+
                  (isPayroll() && r.status==='Draft' ? '<button class="pr-btn pr-btn-amber" style="padding:.3rem .65rem;font-size:.75rem" onclick="payrollEditRun(\''+r.id+'\')"><i class="fas fa-pencil"></i></button>' : '')+
                  (isPayroll() && r.status==='Pending' ? '<button class="pr-btn pr-btn-green" style="padding:.3rem .65rem;font-size:.75rem" onclick="payrollApprove(\''+r.id+'\')"><i class="fas fa-check"></i></button>' : '')+
                  (isPayroll() && r.status==='Pending' ? '<button class="pr-btn pr-btn-red" style="padding:.3rem .65rem;font-size:.75rem" onclick="payrollReject(\''+r.id+'\')"><i class="fas fa-times"></i></button>' : '')+
                  (isAdmin()   && r.status==='Approved'? '<button class="pr-btn pr-btn-blue" style="padding:.3rem .65rem;font-size:.75rem" onclick="payrollMarkPaid(\''+r.id+'\')"><i class="fas fa-circle-dollar-to-slot"></i></button>' : '')+
                  '<button class="pr-btn pr-btn-slate" style="padding:.3rem .65rem;font-size:.75rem" onclick="payrollPreviewSlip(\''+r.id+'\')"><i class="fas fa-eye"></i></button>'+
                '</div>'+
              '</td>'+
            '</tr>';
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  EMPLOYEES VIEW
  // ═══════════════════════════════════════════════════════════════
  function renderEmployeesView() {
    if (!empCache.length) return emptyState('fa-users', 'No employees set up', isAdmin() ? 'Click <strong>New Pay Run</strong> and add employee details, or add employees directly.' : '');
    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
      ${empCache.map(function(e) {
        var name = e.name || e.email || '—';
        var dept = e.department || '—';
        var payLabel = e.pay_type === 'Salary' ? fmtMoney(e.salary) + '/yr' : fmtMoney(e.salary) + '/hr';
        return '<div class="pr-card" style="padding:1.25rem;transition:box-shadow .15s;cursor:pointer" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.07)\'" onmouseout="this.style.boxShadow=\'\'">'+
          '<div style="display:flex;align-items:flex-start;gap:.875rem;margin-bottom:1rem">'+
            avatar(name, 44)+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-weight:800;font-size:.9rem;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(name)+'</div>'+
              '<div style="font-size:.75rem;color:#94a3b8;margin-top:2px">'+esc(e.role||'Employee')+'  ·  '+esc(dept)+'</div>'+
              (e.status==='Inactive'?'<span style="font-size:.65rem;background:#fef2f2;color:#dc2626;border-radius:9999px;padding:1px 7px;font-weight:700;margin-top:4px;display:inline-block">Inactive</span>':'')+
            '</div>'+
          '</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.75rem">'+
            '<div style="background:#f8fafc;border-radius:8px;padding:.5rem">'+
              '<div style="color:#94a3b8;font-weight:700;text-transform:uppercase;font-size:.6rem;letter-spacing:.05em">Pay Type</div>'+
              '<div style="font-weight:700;color:#0f172a;margin-top:2px">'+esc(e.pay_type||'Hourly')+'</div>'+
            '</div>'+
            '<div style="background:#f0fdf4;border-radius:8px;padding:.5rem">'+
              '<div style="color:#94a3b8;font-weight:700;text-transform:uppercase;font-size:.6rem;letter-spacing:.05em">Rate</div>'+
              '<div style="font-weight:800;color:#059669;font-family:\'DM Mono\',monospace;margin-top:2px">'+payLabel+'</div>'+
            '</div>'+
          '</div>'+
          (isAdmin() ?
          '<div style="display:flex;gap:.4rem;margin-top:1rem">'+
            '<button class="pr-btn pr-btn-slate" style="flex:1;font-size:.75rem;justify-content:center" onclick="payrollEditEmp(\''+e.id+'\')"><i class="fas fa-pencil"></i> Edit</button>'+
            '<button class="pr-btn pr-btn-red" style="padding:.4rem .7rem;font-size:.75rem" onclick="payrollDeleteEmp(\''+e.id+'\')"><i class="fas fa-trash"></i></button>'+
          '</div>' : '')+
        '</div>';
      }).join('')}
      ${isAdmin() ? '<div class="pr-card" style="padding:1.25rem;display:flex;align-items:center;justify-content:center;cursor:pointer;border-style:dashed;min-height:120px;color:#94a3b8;transition:all .15s" onmouseover="this.style.borderColor=\'#10b981\';this.style.color=\'#10b981\'" onmouseout="this.style.borderColor=\'#cbd5e1\';this.style.color=\'#94a3b8\'" onclick="payrollNewEmployee()"><div style="text-align:center"><i class="fas fa-plus" style="font-size:1.5rem;display:block;margin-bottom:.5rem"></i><span style="font-weight:700;font-size:.8rem">Add Employee</span></div></div>' : ''}
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  SUMMARY / ANALYTICS VIEW
  // ═══════════════════════════════════════════════════════════════
  function renderSummaryView() {
    var runs = Object.values(runsCache);
    if (!runs.length) return emptyState('fa-chart-bar', 'No payroll data yet', '');

    // By status
    var byStatus = {};
    STATUSES.forEach(function(s) { byStatus[s] = { count:0, gross:0, net:0 }; });
    runs.forEach(function(r) {
      var s = r.status || 'Draft';
      if (!byStatus[s]) byStatus[s] = { count:0, gross:0, net:0 };
      byStatus[s].count++;
      byStatus[s].gross += parseFloat(r.gross) || 0;
      byStatus[s].net   += parseFloat(r.net)   || 0;
    });

    // By employee
    var byEmp = {};
    runs.forEach(function(r) {
      var eid = r.employee_id || 'unknown';
      if (!byEmp[eid]) byEmp[eid] = { name: r.employee_name || userName(eid), count:0, gross:0, net:0 };
      byEmp[eid].count++;
      byEmp[eid].gross += parseFloat(r.gross) || 0;
      byEmp[eid].net   += parseFloat(r.net)   || 0;
    });
    var empList = Object.values(byEmp).sort(function(a,b){return b.gross-a.gross;});
    var maxGross = empList[0] ? empList[0].gross : 1;

    var totalGross = runs.reduce(function(s,r){return s+(parseFloat(r.gross)||0);},0);
    var totalNet   = runs.reduce(function(s,r){return s+(parseFloat(r.net)||0);},0);
    var totalDed   = totalGross - totalNet;

    return `
    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem">
      ${statCard('fa-coins','#0f172a','Total Gross',fmtMoney(totalGross), runs.length + ' runs')}
      ${statCard('fa-minus-circle','#ef4444','Total Deductions','– '+fmtMoney(totalDed),'')}
      ${statCard('fa-check-circle','#10b981','Total Net Payroll',fmtMoney(totalNet),'')}
      ${statCard('fa-users','#6366f1','Employees Paid', Object.keys(byEmp).length, '')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      <!-- By status -->
      <div class="pr-card" style="padding:1.25rem">
        <div style="font-weight:800;font-size:.875rem;color:#0f172a;margin-bottom:1rem">Runs by Status</div>
        ${STATUSES.map(function(s) {
          var d = byStatus[s];
          if (!d.count) return '';
          var c = STATUS_CFG[s] || STATUS_CFG['Draft'];
          return '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.625rem">'+
            '<span style="width:10px;height:10px;border-radius:50%;background:'+c.dot+';flex-shrink:0"></span>'+
            '<span style="flex:1;font-size:.8rem;font-weight:600;color:#374151">'+s+'</span>'+
            '<span style="font-size:.8rem;font-weight:700;color:#0f172a">'+d.count+' runs</span>'+
            '<span style="font-family:\'DM Mono\',monospace;font-size:.75rem;color:#64748b;min-width:80px;text-align:right">'+fmtMoney(d.net)+' net</span>'+
          '</div>';
        }).join('')}
      </div>

      <!-- By employee -->
      <div class="pr-card" style="padding:1.25rem">
        <div style="font-weight:800;font-size:.875rem;color:#0f172a;margin-bottom:1rem">Gross by Employee</div>
        ${empList.slice(0,8).map(function(e) {
          var pct = Math.round((e.gross / maxGross) * 100);
          return '<div style="margin-bottom:.75rem">'+
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">'+
              '<span style="font-size:.8rem;font-weight:600;color:#374151">'+esc(e.name)+'</span>'+
              '<span style="font-family:\'DM Mono\',monospace;font-size:.75rem;font-weight:700;color:#0f172a">'+fmtMoney(e.gross)+'</span>'+
            '</div>'+
            '<div style="height:5px;background:#e2e8f0;border-radius:9999px">'+
              '<div style="height:5px;width:'+pct+'%;background:#10b981;border-radius:9999px;transition:width .4s"></div>'+
            '</div>'+
          '</div>';
        }).join('')}
      </div>
    </div>`;
  }

  // ── Stat card helper ──────────────────────────────────────────
  function statCard(icon, color, label, value, sub) {
    return '<div class="pr-card" style="padding:1rem 1.25rem">'+
      '<div style="display:flex;align-items:center;gap:.625rem;margin-bottom:.5rem">'+
        '<div style="width:28px;height:28px;border-radius:8px;background:'+color+'18;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+
          '<i class="fas '+icon+'" style="font-size:.75rem;color:'+color+'"></i>'+
        '</div>'+
        '<span style="font-size:.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">'+esc(label)+'</span>'+
      '</div>'+
      '<div style="font-family:\'DM Mono\',monospace;font-size:1.1rem;font-weight:800;color:#0f172a">'+esc(String(value))+'</div>'+
      (sub?'<div style="font-size:.7rem;color:#94a3b8;margin-top:2px">'+esc(sub)+'</div>':'')+
    '</div>';
  }

  function emptyState(icon, title, body) {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 2rem;text-align:center;color:#94a3b8">'+
      '<i class="fas '+icon+'" style="font-size:2.5rem;margin-bottom:1rem;opacity:.3"></i>'+
      '<div style="font-weight:800;font-size:1rem;color:#475569;margin-bottom:.5rem">'+title+'</div>'+
      '<div style="font-size:.85rem;max-width:320px;line-height:1.6">'+body+'</div>'+
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════
  //  RUN DETAIL MODAL  (Who | How much | Why)
  // ═══════════════════════════════════════════════════════════════
  function openRunDetail(id) {
    var r = runsCache[id];
    if (!r) return;
    var empName  = r.employee_name || userName(r.employee_id) || '—';
    var gross    = parseFloat(r.gross)       || 0;
    var ded      = parseFloat(r.deductions)  || 0;
    var taxes    = parseFloat(r.tax_total)   || 0;
    var bonuses  = parseFloat(r.bonuses)     || 0;
    var net      = parseFloat(r.net)         || 0;
    var hoursReg = parseFloat(r.hours_regular) || 0;
    var hoursOT  = parseFloat(r.hours_ot)   || 0;
    var rate     = parseFloat(r.rate)        || 0;
    var warnings = detectAnomalies(r, null);
    var status   = r.status || 'Draft';
    var sc       = STATUS_CFG[status] || STATUS_CFG['Draft'];

    showModal(`
    <div style="position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem" onclick="if(event.target===this)payrollCloseModal()">
      <div style="background:#fff;border-radius:20px;width:100%;max-width:680px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.18);font-family:'DM Sans',sans-serif">

        <!-- Header with status bar -->
        <div style="padding:1.5rem 1.75rem 1.25rem;border-bottom:1.5px solid #f1f5f9;position:sticky;top:0;background:#fff;border-radius:20px 20px 0 0;z-index:2">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
            <div style="display:flex;align-items:center;gap:.875rem">
              ${avatar(empName, 48)}
              <div>
                <div style="font-weight:800;font-size:1.05rem;color:#0f172a">${esc(empName)}</div>
                <div style="font-size:.75rem;color:#94a3b8;margin-top:2px">${esc(r.id||'')} · ${esc(fmtPeriod(r.period_start, r.period_end))}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem">
              ${statusBadge(status)}
              <button onclick="payrollCloseModal()" style="background:#f1f5f9;border:none;width:32px;height:32px;border-radius:8px;cursor:pointer;color:#64748b;font-size:.875rem"><i class="fas fa-times"></i></button>
            </div>
          </div>
        </div>

        <div style="padding:1.5rem 1.75rem">

          <!-- ⚠ Anomaly warnings -->
          ${warnings.length ? '<div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.25rem">'
            + warnings.map(function(w){ return '<div class="warning-pill '+w.level+'"><i class="fas fa-'+(w.level==='error'?'exclamation-circle':'triangle-exclamation')+'"></i>'+esc(w.msg)+'</div>'; }).join('')
          + '</div>' : ''}

          <!-- ⚡ NET PAY — The #1 answer: How much? -->
          <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px;padding:1.5rem;margin-bottom:1.5rem;text-align:center">
            <div style="font-size:.7rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.4rem">Net Pay</div>
            <div class="net-pay-display" style="color:#fff">${fmtMoney(net)}</div>
            <div style="font-size:.75rem;color:#64748b;margin-top:.4rem">${esc(fmtPeriod(r.period_start, r.period_end))}</div>
          </div>

          <!-- EARNINGS breakdown -->
          <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:.6rem">Earnings</div>
          <div class="pr-card" style="padding:.25rem 1rem;margin-bottom:1rem">
            ${hoursReg ? `<div class="pr-breakdown-row"><span style="color:#475569">Regular Hours <span style="color:#94a3b8">(${hoursReg}h × ${fmtMoney(rate)})</span></span><span style="font-weight:700;font-family:'DM Mono',monospace">${fmtMoney(hoursReg*rate)}</span></div>` : ''}
            ${hoursOT  ? `<div class="pr-breakdown-row"><span style="color:#f97316"><i class="fas fa-clock" style="font-size:.7rem;margin-right:.3rem"></i>Overtime <span style="color:#94a3b8">(${hoursOT}h × ${fmtMoney(rate*1.5)})</span></span><span style="font-weight:700;font-family:'DM Mono',monospace;color:#f97316">${fmtMoney(hoursOT*rate*1.5)}</span></div>` : ''}
            ${bonuses   ? `<div class="pr-breakdown-row"><span style="color:#10b981"><i class="fas fa-gift" style="font-size:.7rem;margin-right:.3rem"></i>Bonuses</span><span style="font-weight:700;font-family:'DM Mono',monospace;color:#10b981">+${fmtMoney(bonuses)}</span></div>` : ''}
            <div class="pr-breakdown-row" style="font-weight:800"><span>Gross Pay</span><span style="font-family:'DM Mono',monospace">${fmtMoney(gross)}</span></div>
          </div>

          <!-- DEDUCTIONS breakdown -->
          <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:.6rem">Deductions & Taxes</div>
          <div class="pr-card" style="padding:.25rem 1rem;margin-bottom:1rem">
            ${r.tax_federal ? `<div class="pr-breakdown-row"><span style="color:#475569">Federal Income Tax</span><span style="font-weight:600;font-family:'DM Mono',monospace;color:#ef4444">–${fmtMoney(r.tax_federal)}</span></div>` : ''}
            ${r.tax_fica    ? `<div class="pr-breakdown-row"><span style="color:#475569">FICA (SS + Medicare)</span><span style="font-weight:600;font-family:'DM Mono',monospace;color:#ef4444">–${fmtMoney(r.tax_fica)}</span></div>` : ''}
            ${r.tax_state   ? `<div class="pr-breakdown-row"><span style="color:#475569">State Tax (est.)</span><span style="font-weight:600;font-family:'DM Mono',monospace;color:#ef4444">–${fmtMoney(r.tax_state)}</span></div>` : ''}
            ${ded           ? `<div class="pr-breakdown-row"><span style="color:#475569">Other Deductions</span><span style="font-weight:600;font-family:'DM Mono',monospace;color:#ef4444">–${fmtMoney(ded)}</span></div>` : ''}
            <div class="pr-breakdown-row" style="font-weight:800;color:#ef4444"><span>Total Deductions</span><span style="font-family:'DM Mono',monospace">–${fmtMoney(taxes+ded)}</span></div>
          </div>

          <!-- NET = Gross - Deductions divider -->
          <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;margin-bottom:1.5rem">
            <i class="fas fa-equals" style="color:#10b981"></i>
            <span style="font-weight:700;color:#0f172a;flex:1">Net Pay</span>
            <span style="font-family:'DM Mono',monospace;font-size:1.1rem;font-weight:800;color:#059669">${fmtMoney(net)}</span>
          </div>

          <!-- Notes -->
          ${r.notes ? '<div style="font-size:.8rem;color:#64748b;background:#f8fafc;border-radius:10px;padding:.75rem 1rem;margin-bottom:1.25rem;border-left:3px solid #cbd5e1"><i class="fas fa-sticky-note" style="margin-right:.4rem"></i>'+esc(r.notes)+'</div>' : ''}
          ${r.paid_at ? '<div style="font-size:.75rem;color:#64748b;text-align:center;margin-bottom:1rem"><i class="fas fa-check-circle" style="color:#10b981;margin-right:.35rem"></i>Paid on '+esc(fmtDate(r.paid_at))+'</div>' : ''}

          <!-- Actions -->
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end;padding-top:.75rem;border-top:1.5px solid #f1f5f9">
            <button class="pr-btn pr-btn-slate" onclick="payrollPreviewSlip('${r.id}')"><i class="fas fa-eye"></i> Preview Payslip</button>
            ${isPayroll() && (status==='Draft'||status==='Rejected') ? '<button class="pr-btn pr-btn-amber" onclick="payrollCloseModal();payrollEditRun(\''+r.id+'\')"><i class="fas fa-pencil"></i> Edit</button>' : ''}
            ${isPayroll() && status==='Draft' ? '<button class="pr-btn pr-btn-green" onclick="payrollCloseModal();payrollApprove(\''+r.id+'\')"><i class="fas fa-paper-plane"></i> Submit</button>' : ''}
            ${isPayroll() && status==='Pending' ? '<button class="pr-btn pr-btn-green" onclick="payrollCloseModal();payrollApprove(\''+r.id+'\')"><i class="fas fa-check"></i> Approve</button>' : ''}
            ${isPayroll() && status==='Pending' ? '<button class="pr-btn pr-btn-red" onclick="payrollCloseModal();payrollReject(\''+r.id+'\')"><i class="fas fa-times"></i> Reject</button>' : ''}
            ${isAdmin()   && status==='Approved' ? '<button class="pr-btn pr-btn-blue" onclick="payrollCloseModal();payrollMarkPaid(\''+r.id+'\')"><i class="fas fa-circle-dollar-to-slot"></i> Mark Paid</button>' : ''}
          </div>

        </div>
      </div>
    </div>`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  NEW / EDIT RUN FORM
  // ═══════════════════════════════════════════════════════════════
  function openRunForm(prefill) {
    prefill = prefill || {};
    var today = new Date().toISOString().split('T')[0];
    var periodStart = prefill.period_start || getPeriodStart();
    var periodEnd   = prefill.period_end   || getPeriodEnd();

    showModal(`
    <div style="position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem" onclick="if(event.target===this)payrollCloseModal()">
      <div style="background:#fff;border-radius:20px;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.18);font-family:'DM Sans',sans-serif">

        <div style="padding:1.25rem 1.5rem;border-bottom:1.5px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;border-radius:20px 20px 0 0;z-index:2">
          <div style="font-weight:800;font-size:1rem;color:#0f172a"><i class="fas fa-plus-circle" style="color:#10b981;margin-right:.5rem"></i>${prefill.id ? 'Edit Pay Run' : 'New Pay Run'}</div>
          <button onclick="payrollCloseModal()" style="background:#f1f5f9;border:none;width:32px;height:32px;border-radius:8px;cursor:pointer;color:#64748b"><i class="fas fa-times"></i></button>
        </div>

        <form id="payroll-run-form" style="padding:1.5rem" onsubmit="payrollSubmitForm(event,'${prefill.id||''}')">

          <!-- ── FROZEN: WHO + WHEN ─────────────────────────────── -->
          <div style="background:#f8fafc;border-radius:12px;padding:1rem;margin-bottom:1.25rem;border:1.5px solid #e2e8f0">
            <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:.75rem">Who & When</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.875rem">
              <div style="grid-column:1/-1">
                <label class="pr-label">Employee *</label>
                <select name="employee_id" class="pr-input" required onchange="payrollAutofillEmp(this.value)">
                  <option value="">Select employee…</option>
                  ${empCache.map(function(e){ return '<option value="'+e.id+'"'+(prefill.employee_id===e.id?' selected':'')+'>'+esc(e.name||e.email)+'</option>'; }).join('')}
                </select>
              </div>
              <div>
                <label class="pr-label">Period Start *</label>
                <input type="date" name="period_start" class="pr-input" value="${prefill.period_start||periodStart}" required>
              </div>
              <div>
                <label class="pr-label">Period End *</label>
                <input type="date" name="period_end" class="pr-input" value="${prefill.period_end||periodEnd}" required>
              </div>
              <div>
                <label class="pr-label">Pay Type</label>
                <select name="pay_type" class="pr-input" id="pr-pay-type-sel" onchange="payrollRecalc()">
                  ${PAY_TYPES.map(function(t){ return '<option value="'+t+'"'+(prefill.pay_type===t?' selected':'')+'>'+t+'</option>'; }).join('')}
                </select>
              </div>
            </div>
          </div>

          <!-- ── HOURS ──────────────────────────────────────────── -->
          <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:.625rem">Hours</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.875rem;margin-bottom:1.25rem">
            <div>
              <label class="pr-label">Regular Hours</label>
              <input type="number" name="hours_regular" class="pr-input" min="0" max="999" step="0.5" value="${prefill.hours_regular||''}" placeholder="80" oninput="payrollRecalc()" tabindex="0">
            </div>
            <div>
              <label class="pr-label">OT Hours <span style="color:#f97316;font-size:.65rem">(×1.5)</span></label>
              <input type="number" name="hours_ot" class="pr-input" min="0" step="0.5" value="${prefill.hours_ot||''}" placeholder="0" oninput="payrollRecalc()">
            </div>
            <div>
              <label class="pr-label">Hourly Rate / Salary</label>
              <div style="position:relative">
                <span style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:.875rem">$</span>
                <input type="number" name="rate" class="pr-input" style="padding-left:1.75rem" min="0" step="0.01" value="${prefill.rate||''}" placeholder="0.00" oninput="payrollRecalc()">
              </div>
            </div>
          </div>

          ${tsCache.length ? '<button type="button" class="pr-btn pr-btn-blue" style="margin-bottom:1.25rem;font-size:.75rem" onclick="payrollAutofillTS()"><i class="fas fa-clock"></i> Autofill from Timesheets</button>' : ''}

          <!-- ── EARNINGS PREVIEW ───────────────────────────────── -->
          <div id="pr-earnings-preview" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:1rem;margin-bottom:1.25rem">
            <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#059669;margin-bottom:.625rem">Live Calculation</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;text-align:center">
              <div><div style="font-size:.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Regular</div><div id="pr-calc-regular" style="font-family:'DM Mono',monospace;font-weight:800;font-size:.95rem;color:#0f172a">$0.00</div></div>
              <div><div style="font-size:.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Overtime</div><div id="pr-calc-ot" style="font-family:'DM Mono',monospace;font-weight:800;font-size:.95rem;color:#f97316">$0.00</div></div>
              <div><div style="font-size:.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Gross</div><div id="pr-calc-gross" style="font-family:'DM Mono',monospace;font-weight:800;font-size:.95rem;color:#0f172a">$0.00</div></div>
            </div>
          </div>

          <!-- ── DEDUCTIONS & BONUSES ───────────────────────────── -->
          <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;margin-bottom:.625rem">Deductions & Bonuses</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.875rem;margin-bottom:1.25rem">
            <div>
              <label class="pr-label">Additional Deductions</label>
              <div style="position:relative">
                <span style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:.875rem">$</span>
                <input type="number" name="deductions" class="pr-input" style="padding-left:1.75rem" min="0" step="0.01" value="${prefill.deductions||''}" placeholder="0.00" oninput="payrollRecalc()">
              </div>
            </div>
            <div>
              <label class="pr-label">Bonuses / Extras</label>
              <div style="position:relative">
                <span style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:.875rem">$</span>
                <input type="number" name="bonuses" class="pr-input" style="padding-left:1.75rem" min="0" step="0.01" value="${prefill.bonuses||''}" placeholder="0.00" oninput="payrollRecalc()">
              </div>
            </div>
          </div>

          <!-- ── TAX PREVIEW ────────────────────────────────────── -->
          <div id="pr-tax-preview" style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:1rem;margin-bottom:1.25rem">
            <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#991b1b;margin-bottom:.625rem"><i class="fas fa-file-invoice" style="margin-right:.35rem"></i>Estimated Taxes</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;text-align:center">
              <div><div style="font-size:.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase">Federal</div><div id="pr-tax-fed" style="font-family:'DM Mono',monospace;font-weight:700;font-size:.85rem;color:#dc2626">$0.00</div></div>
              <div><div style="font-size:.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase">FICA</div><div id="pr-tax-fica" style="font-family:'DM Mono',monospace;font-weight:700;font-size:.85rem;color:#dc2626">$0.00</div></div>
              <div><div style="font-size:.65rem;color:#94a3b8;font-weight:700;text-transform:uppercase">State (est.)</div><div id="pr-tax-state" style="font-family:'DM Mono',monospace;font-weight:700;font-size:.85rem;color:#dc2626">$0.00</div></div>
            </div>
          </div>

          <!-- ── NET PAY RESULT ─────────────────────────────────── -->
          <div style="background:#0f172a;border-radius:14px;padding:1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#475569">Net Pay</div>
              <div id="pr-net-display" class="net-pay-display">$0.00</div>
            </div>
            <div id="pr-net-alert" style="display:none;background:#ef4444;color:#fff;border-radius:8px;padding:.4rem .75rem;font-size:.75rem;font-weight:700"><i class="fas fa-exclamation-triangle"></i> Negative!</div>
          </div>

          <!-- Hidden computed fields (populated by recalc) -->
          <input type="hidden" name="gross">
          <input type="hidden" name="net">
          <input type="hidden" name="tax_federal">
          <input type="hidden" name="tax_fica">
          <input type="hidden" name="tax_state">
          <input type="hidden" name="tax_total">
          <input type="hidden" name="hours_total">

          <!-- Notes -->
          <div style="margin-bottom:1.25rem">
            <label class="pr-label">Notes</label>
            <textarea name="notes" class="pr-input" rows="2" placeholder="Any additional notes…" style="resize:vertical">${esc(prefill.notes||'')}</textarea>
          </div>

          <!-- ── Validation errors ───────────────────────────────── -->
          <div id="pr-form-errors" style="display:none;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.8rem;color:#dc2626"></div>

          <!-- Actions -->
          <div style="display:flex;gap:.5rem;justify-content:flex-end;padding-top:.75rem;border-top:1.5px solid #f1f5f9">
            <button type="button" class="pr-btn pr-btn-slate" onclick="payrollCloseModal()">Cancel</button>
            <button type="submit" class="pr-btn pr-btn-green" id="pr-save-btn"><i class="fas fa-save"></i> Save as Draft</button>
            <button type="button" class="pr-btn" style="background:#10b981;color:#fff" onclick="payrollSubmitAndApprove(event,'${prefill.id||''}')"><i class="fas fa-paper-plane"></i> Save & Submit</button>
          </div>
        </form>
      </div>
    </div>`);

    // Wire employee autofill
    window.payrollAutofillEmp = function(empId) {
      var emp = empCache.find(function(e){ return e.id === empId; });
      if (!emp) return;
      var form = document.getElementById('payroll-run-form');
      if (!form) return;
      if (emp.pay_type) form.elements['pay_type'].value = emp.pay_type;
      if (emp.salary)   form.elements['rate'].value     = emp.salary;
      recalcFormLive();
    };

    window.payrollSubmitAndApprove = function(e, id) {
      var btn = document.getElementById('pr-save-btn');
      if (btn) btn.setAttribute('data-submit-approve', '1');
      var evt = new Event('submit', { bubbles: true, cancelable: true });
      document.getElementById('payroll-run-form').dispatchEvent(evt);
    };

    // If editing, auto-fill emp
    if (prefill.employee_id) {
      setTimeout(function() {
        var sel = document.querySelector('[name=employee_id]');
        if (sel) sel.dispatchEvent(new Event('change'));
      }, 50);
    }

    // Initial recalc
    setTimeout(recalcFormLive, 80);
  }

  function openEditRun(id) {
    var r = runsCache[id];
    if (!r) return;
    openRunForm(r);
  }

  // ── Live recalculation ────────────────────────────────────────
  function recalcFormLive() {
    var form = document.getElementById('payroll-run-form');
    if (!form) return;
    var hoursReg = parseFloat(form.elements['hours_regular']?.value) || 0;
    var hoursOT  = parseFloat(form.elements['hours_ot']?.value)      || 0;
    var rate     = parseFloat(form.elements['rate']?.value)          || 0;
    var ded      = parseFloat(form.elements['deductions']?.value)    || 0;
    var bonuses  = parseFloat(form.elements['bonuses']?.value)       || 0;
    var payType  = form.elements['pay_type']?.value || 'Hourly';

    var regPay = hoursReg * rate;
    var otPay  = hoursOT  * rate * 1.5;
    var gross  = (payType === 'Salary') ? rate + bonuses : regPay + otPay + bonuses;
    var taxes  = calcTaxes(gross);
    var totalDed = ded + taxes.total;
    var net    = gross - totalDed;
    var hoursTotal = hoursReg + hoursOT;

    // Update live display
    var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    set('pr-calc-regular', fmtMoney(regPay));
    set('pr-calc-ot',      fmtMoney(otPay));
    set('pr-calc-gross',   fmtMoney(gross));
    set('pr-tax-fed',      fmtMoney(taxes.federal));
    set('pr-tax-fica',     fmtMoney(taxes.fica));
    set('pr-tax-state',    fmtMoney(taxes.state));
    set('pr-net-display',  fmtMoney(net));

    var alert = document.getElementById('pr-net-alert');
    if (alert) alert.style.display = net < 0 ? 'block' : 'none';

    // Persist to hidden fields
    var setHidden = function(name, val) {
      var el = form.elements[name]; if (el) el.value = val;
    };
    setHidden('gross',       gross.toFixed(2));
    setHidden('net',         net.toFixed(2));
    setHidden('tax_federal', taxes.federal.toFixed(2));
    setHidden('tax_fica',    taxes.fica.toFixed(2));
    setHidden('tax_state',   taxes.state.toFixed(2));
    setHidden('tax_total',   taxes.total.toFixed(2));
    setHidden('hours_total', hoursTotal.toFixed(2));
  }

  // ── Autofill from timesheets ──────────────────────────────────
  function autofillFromTimesheets() {
    var form = document.getElementById('payroll-run-form');
    if (!form || !tsCache.length) return;
    var empId = form.elements['employee_id']?.value;
    var pStart = form.elements['period_start']?.value;
    var pEnd   = form.elements['period_end']?.value;

    var matching = tsCache.filter(function(t) {
      if (empId && t.user_id !== empId) return false;
      if (pStart && t.date < pStart) return false;
      if (pEnd   && t.date > pEnd)   return false;
      return t.status === 'Approved';
    });

    var totalH = matching.reduce(function(s,t){ return s + (parseFloat(t.total_hours)||0); }, 0);
    var otH    = matching.reduce(function(s,t){
      var h = parseFloat(t.total_hours)||0;
      return s + Math.max(0, h-8);
    }, 0);
    var regH = Math.max(0, totalH - otH);

    if (form.elements['hours_regular']) form.elements['hours_regular'].value = regH.toFixed(1);
    if (form.elements['hours_ot'])      form.elements['hours_ot'].value      = otH.toFixed(1);
    recalcFormLive();
    toast('Autofilled from ' + matching.length + ' approved timesheet entries', 'success');
  }

  // ── Submit run form ───────────────────────────────────────────
  function submitRunForm(e, editId) {
    e.preventDefault();
    recalcFormLive();

    var form   = document.getElementById('payroll-run-form');
    var errDiv = document.getElementById('pr-form-errors');
    var data   = new FormData(form);
    var params = {};
    data.forEach(function(v, k) { params[k] = v; });

    // Validation
    var errors = [];
    if (!params.employee_id) errors.push('Please select an employee.');
    if (!params.period_start || !params.period_end) errors.push('Pay period dates are required.');
    if (params.period_start && params.period_end && params.period_start > params.period_end) errors.push('Period start must be before end date.');
    if (parseFloat(params.net) < 0) errors.push('Net pay is negative — check deductions and hours.');

    if (errors.length) {
      errDiv.style.display = 'block';
      errDiv.innerHTML = '<i class="fas fa-exclamation-circle" style="margin-right:.4rem"></i>' + errors.join(' ');
      return;
    }
    errDiv.style.display = 'none';

    // Find employee name
    var emp = empCache.find(function(e){ return e.id === params.employee_id; });
    params.employee_name = emp ? (emp.name || emp.email) : '';

    var btn = document.getElementById('pr-save-btn');
    var submitAndApprove = btn && btn.getAttribute('data-submit-approve') === '1';

    var action = editId
      ? api('payroll/runs/update', Object.assign({ id:editId }, params)).then(function(d) {
          runsCache[editId] = Object.assign(runsCache[editId]||{}, params, { id:editId });
          return d;
        })
      : api('payroll/runs/create', Object.assign({ id: params.id || genId(), status:'Draft' }, params)).then(function(d) {
          var newId = d.id || params.id;
          runsCache[newId] = Object.assign({ id:newId, status:'Draft' }, params);
          return d;
        });

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    action.then(function(d) {
      closeModal();
      _liveTotal = calcLiveTotal(runsCache);
      updateLiveTicker(_liveTotal);
      rerender();
      toast(editId ? 'Pay run updated' : 'Pay run created', 'success');
      if (submitAndApprove) {
        var rid = editId || d.id;
        if (rid) setTimeout(function(){ approveRun(rid); }, 400);
      }
    }).catch(function(err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save as Draft'; }
      errDiv.style.display = 'block';
      errDiv.textContent = err.message;
    });
  }

  // ── Quick actions ─────────────────────────────────────────────
  function approveRun(id) {
    api('payroll/runs/update', { id:id, status:'Approved' }).then(function() {
      if (runsCache[id]) runsCache[id].status = 'Approved';
      rerender(); toast('Pay run approved', 'success');
    }).catch(function(err){ toast(err.message, 'error'); });
  }
  function rejectRun(id) {
    var reason = prompt('Reason for rejection (optional):') || '';
    api('payroll/runs/update', { id:id, status:'Rejected', notes: reason }).then(function() {
      if (runsCache[id]) { runsCache[id].status = 'Rejected'; if (reason) runsCache[id].notes = reason; }
      rerender(); toast('Pay run rejected', 'warning');
    }).catch(function(err){ toast(err.message, 'error'); });
  }
  function markPaid(id) {
    var now = new Date().toISOString();
    api('payroll/runs/update', { id:id, status:'Paid', paid_at: now }).then(function() {
      if (runsCache[id]) { runsCache[id].status = 'Paid'; runsCache[id].paid_at = now; }
      _liveTotal = calcLiveTotal(runsCache);
      updateLiveTicker(_liveTotal);
      rerender(); toast('Marked as paid 💸', 'success');
    }).catch(function(err){ toast(err.message, 'error'); });
  }
  function deleteRun(id) {
    if (!confirm('Delete this pay run? This cannot be undone.')) return;
    api('payroll/runs/delete', { id:id }).then(function() {
      delete runsCache[id];
      _liveTotal = calcLiveTotal(runsCache);
      updateLiveTicker(_liveTotal);
      rerender(); toast('Pay run deleted', 'info');
    }).catch(function(err){ toast(err.message, 'error'); });
  }

  // ── Payslip preview ───────────────────────────────────────────
  function previewPayslip(id) {
    var r = runsCache[id];
    if (!r) return;
    var empName = r.employee_name || userName(r.employee_id) || '—';
    var gross   = parseFloat(r.gross)||0;
    var taxes   = parseFloat(r.tax_total)||0;
    var ded     = parseFloat(r.deductions)||0;
    var net     = parseFloat(r.net)||0;
    var today   = fmtDate(new Date().toISOString());

    showModal(`
    <div style="position:fixed;inset:0;z-index:1001;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem" onclick="if(event.target===this)payrollCloseModal()">
      <div style="background:#fff;border-radius:16px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.22);font-family:'DM Sans',sans-serif">
        <div id="payslip-printable">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:1.5rem;color:#fff;text-align:center">
            <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.15em;color:#64748b;margin-bottom:.25rem">Pay Slip</div>
            <div style="font-size:1.1rem;font-weight:800">${esc(empName)}</div>
            <div style="font-size:.75rem;color:#94a3b8;margin-top:.25rem">${esc(fmtPeriod(r.period_start, r.period_end))}</div>
          </div>
          <!-- Rows -->
          <div style="padding:1.25rem">
            <table style="width:100%;font-size:.85rem;border-collapse:collapse">
              <tr><td style="padding:.4rem 0;color:#64748b">Regular Pay</td><td style="text-align:right;font-family:'DM Mono',monospace;font-weight:600">${fmtMoney(parseFloat(r.hours_regular||0)*parseFloat(r.rate||0))}</td></tr>
              ${parseFloat(r.hours_ot) ? '<tr><td style="padding:.4rem 0;color:#f97316">Overtime Pay</td><td style="text-align:right;font-family:\'DM Mono\',monospace;font-weight:600;color:#f97316">'+fmtMoney(parseFloat(r.hours_ot)*parseFloat(r.rate||0)*1.5)+'</td></tr>' : ''}
              ${parseFloat(r.bonuses) ? '<tr><td style="padding:.4rem 0;color:#10b981">Bonuses</td><td style="text-align:right;font-family:\'DM Mono\',monospace;font-weight:600;color:#10b981">+'+fmtMoney(r.bonuses)+'</td></tr>' : ''}
              <tr style="border-top:1.5px solid #e2e8f0"><td style="padding:.6rem 0;font-weight:700">Gross Pay</td><td style="text-align:right;font-family:'DM Mono',monospace;font-weight:700">${fmtMoney(gross)}</td></tr>
              ${r.tax_federal ? '<tr><td style="padding:.4rem 0;color:#ef4444">Federal Tax</td><td style="text-align:right;font-family:\'DM Mono\',monospace;color:#ef4444">–'+fmtMoney(r.tax_federal)+'</td></tr>' : ''}
              ${r.tax_fica    ? '<tr><td style="padding:.4rem 0;color:#ef4444">FICA</td><td style="text-align:right;font-family:\'DM Mono\',monospace;color:#ef4444">–'+fmtMoney(r.tax_fica)+'</td></tr>' : ''}
              ${r.tax_state   ? '<tr><td style="padding:.4rem 0;color:#ef4444">State Tax</td><td style="text-align:right;font-family:\'DM Mono\',monospace;color:#ef4444">–'+fmtMoney(r.tax_state)+'</td></tr>' : ''}
              ${ded           ? '<tr><td style="padding:.4rem 0;color:#ef4444">Deductions</td><td style="text-align:right;font-family:\'DM Mono\',monospace;color:#ef4444">–'+fmtMoney(ded)+'</td></tr>' : ''}
            </table>
            <!-- Net -->
            <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:1rem;margin-top:.75rem;display:flex;align-items:center;justify-content:space-between">
              <span style="font-weight:800;color:#0f172a">NET PAY</span>
              <span style="font-family:'DM Mono',monospace;font-size:1.3rem;font-weight:800;color:#059669">${fmtMoney(net)}</span>
            </div>
            <div style="text-align:center;font-size:.7rem;color:#94a3b8;margin-top:.75rem">Generated ${today} · ${statusBadge(r.status||'Draft')}</div>
          </div>
        </div>
        <div style="padding:.875rem 1.25rem;border-top:1.5px solid #f1f5f9;display:flex;gap:.5rem;justify-content:flex-end">
          <button class="pr-btn pr-btn-slate" onclick="payrollCloseModal()">Close</button>
          <button class="pr-btn pr-btn-green" onclick="window.print()"><i class="fas fa-print"></i> Print / Save PDF</button>
        </div>
      </div>
    </div>`);
  }

  // ── Employee form ─────────────────────────────────────────────
  function openEmployeeForm(prefill) {
    prefill = prefill || {};
    showModal(`
    <div style="position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem" onclick="if(event.target===this)payrollCloseModal()">
      <div style="background:#fff;border-radius:20px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.18);font-family:'DM Sans',sans-serif">
        <div style="padding:1.25rem 1.5rem;border-bottom:1.5px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:800;font-size:1rem;color:#0f172a">${prefill.id ? 'Edit Employee' : 'Add Employee'}</div>
          <button onclick="payrollCloseModal()" style="background:#f1f5f9;border:none;width:32px;height:32px;border-radius:8px;cursor:pointer;color:#64748b"><i class="fas fa-times"></i></button>
        </div>
        <form id="payroll-emp-form" style="padding:1.5rem" onsubmit="payrollSubmitEmp(event,'${prefill.id||''}')">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.875rem">
            <div style="grid-column:1/-1"><label class="pr-label">Full Name *</label><input type="text" name="name" class="pr-input" required value="${esc(prefill.name||'')}"></div>
            <div style="grid-column:1/-1"><label class="pr-label">Email</label><input type="email" name="email" class="pr-input" value="${esc(prefill.email||'')}"></div>
            <div><label class="pr-label">Role</label><input type="text" name="role" class="pr-input" value="${esc(prefill.role||'')}" placeholder="e.g. Developer"></div>
            <div><label class="pr-label">Department</label><input type="text" name="department" class="pr-input" value="${esc(prefill.department||'')}"></div>
            <div>
              <label class="pr-label">Pay Type</label>
              <select name="pay_type" class="pr-input">
                ${PAY_TYPES.map(function(t){ return '<option value="'+t+'"'+(prefill.pay_type===t?' selected':'')+'>'+t+'</option>'; }).join('')}
              </select>
            </div>
            <div><label class="pr-label">Rate / Salary ($)</label><input type="number" name="salary" class="pr-input" min="0" step="0.01" value="${esc(prefill.salary||'')}"></div>
            <div><label class="pr-label">Start Date</label><input type="date" name="start_date" class="pr-input" value="${esc(prefill.start_date||'')}"></div>
            <div>
              <label class="pr-label">Status</label>
              <select name="status" class="pr-input">
                <option value="Active"   ${prefill.status==='Active'  ?'selected':''}>Active</option>
                <option value="Inactive" ${prefill.status==='Inactive'?'selected':''}>Inactive</option>
              </select>
            </div>
          </div>
          <div id="pr-emp-errors" style="display:none;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:.75rem 1rem;margin-top:1rem;font-size:.8rem;color:#dc2626"></div>
          <div style="display:flex;gap:.5rem;justify-content:flex-end;padding-top:1rem;border-top:1.5px solid #f1f5f9;margin-top:1rem">
            <button type="button" class="pr-btn pr-btn-slate" onclick="payrollCloseModal()">Cancel</button>
            <button type="submit" class="pr-btn pr-btn-green" id="pr-emp-save-btn"><i class="fas fa-save"></i> Save Employee</button>
          </div>
        </form>
      </div>
    </div>`);
  }

  function openEditEmployee(id) {
    var emp = empCache.find(function(e){ return e.id===id; });
    if (emp) openEmployeeForm(emp);
  }

  function submitEmployeeForm(e, editId) {
    e.preventDefault();
    var form   = document.getElementById('payroll-emp-form');
    var errDiv = document.getElementById('pr-emp-errors');
    var data   = new FormData(form);
    var params = {};
    data.forEach(function(v,k){ params[k]=v; });
    if (!params.name) { errDiv.style.display='block'; errDiv.textContent='Name is required.'; return; }
    errDiv.style.display='none';

    var btn = document.getElementById('pr-emp-save-btn');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; }

    var action = editId
      ? api('payroll/employees/update', Object.assign({ id:editId }, params)).then(function() {
          var idx = empCache.findIndex(function(e){ return e.id===editId; });
          if (idx>-1) empCache[idx] = Object.assign(empCache[idx], params);
        })
      : api('payroll/employees/create', Object.assign({ id: genId() }, params)).then(function(d) {
          empCache.push(Object.assign({ id: d.id||params.id }, params));
        });

    action.then(function() {
      closeModal(); rerender(); toast('Employee saved', 'success');
    }).catch(function(err) {
      if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Save Employee'; }
      errDiv.style.display='block'; errDiv.textContent=err.message;
    });
  }

  function deleteEmployee(id) {
    if (!confirm('Remove this employee from payroll? Pay run records will be kept.')) return;
    api('payroll/employees/delete', { id:id }).then(function() {
      empCache = empCache.filter(function(e){ return e.id!==id; });
      rerender(); toast('Employee removed', 'info');
    }).catch(function(err){ toast(err.message,'error'); });
  }

  // ── Export CSV ────────────────────────────────────────────────
  function exportCSV() {
    var rows = applySort(applyFilters(Object.values(runsCache)));
    var headers = ['ID','Employee','Period Start','Period End','Regular Hrs','OT Hrs','Rate','Gross','Deductions','Tax Total','Net Pay','Status','Paid At','Notes'];
    var lines = [headers.join(',')];
    rows.forEach(function(r) {
      lines.push([
        r.id, r.employee_name||'', r.period_start, r.period_end,
        r.hours_regular||0, r.hours_ot||0, r.rate||0,
        r.gross||0, r.deductions||0, r.tax_total||0, r.net||0,
        r.status, r.paid_at||'', '"'+(r.notes||'').replace(/"/g,'""')+'"'
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type:'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll-export-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    toast('CSV exported', 'success');
  }

  // ── Period helpers ────────────────────────────────────────────
  function getPeriodStart() {
    var d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  }
  function getPeriodEnd() {
    var d = new Date();
    d.setMonth(d.getMonth()+1, 0);
    return d.toISOString().split('T')[0];
  }

  // ── Boot ──────────────────────────────────────────────────────
  render();
};
