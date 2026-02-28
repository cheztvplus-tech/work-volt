window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['payroll'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var runsCache   = [];
  var empCache    = [];
  var usersCache  = [];
  var tsCache     = [];   // timesheets (if module installed)
  var activeView  = sessionStorage.getItem('pr_view') || 'runs';  // runs | employees | summary
  var filters     = { status: '', employee_id: '', period: '' };
  var _searchVal  = '';
  var _searchTimer = null;
  var sortState   = { col: 'period_start', dir: 'desc' };
  var _liveTotal  = 0; // running payroll cost counter

  // ── Constants ─────────────────────────────────────────────────
  var STATUSES   = ['Draft', 'Pending', 'Approved', 'Paid', 'Void'];
  var PAY_TYPES  = ['Hourly', 'Salary', 'Contract'];
  var DEDUCTION_TYPES = ['Tax', 'Health Insurance', 'Pension', '401k', 'Garnishment', 'Other'];

  var STATUS_CFG = {
    'Draft':    { bg:'bg-slate-100',   text:'text-slate-600',  icon:'fa-pencil',        border:'border-slate-200',  dot:'#94a3b8' },
    'Pending':  { bg:'bg-amber-100',   text:'text-amber-700',  icon:'fa-hourglass-half',border:'border-amber-300',  dot:'#f59e0b' },
    'Approved': { bg:'bg-green-100',   text:'text-green-700',  icon:'fa-check-circle',  border:'border-green-300',  dot:'#16a34a' },
    'Paid':     { bg:'bg-blue-100',    text:'text-blue-700',   icon:'fa-dollar-sign',   border:'border-blue-300',   dot:'#2563eb' },
    'Rejected': { bg:'#fef2f2',        text:'#991b1b',         icon:'fa-times-circle',  border:'#fca5a5',           dot:'#ef4444' },
    'Void':     { bg:'bg-red-100',     text:'text-red-600',    icon:'fa-ban',           border:'border-red-300',    dot:'#dc2626' },
  };

  // ── Role helpers ──────────────────────────────────────────────
  function getRole()    { try { return window.WorkVolt.user().role || 'SuperAdmin'; } catch(e) { return 'SuperAdmin'; } }
  function isAdmin()    { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function isPayAdmin() { return ['SuperAdmin','Admin'].includes(getRole()); }
  function myUserId()   { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } }
  function myName()     { try { return window.WorkVolt.user().name || ''; } catch(e) { return ''; } }

  // ── API ───────────────────────────────────────────────────────
  function api(path, params) {
    if (!savedUrl || !savedSecret) return Promise.reject(new Error('Google Sheet not connected'));
    var url = new URL(savedUrl);
    url.searchParams.set('path',  path);
    url.searchParams.set('token', savedSecret);
    if (params) Object.keys(params).forEach(function(k) {
      if (params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
        url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { cache:'no-cache' })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.error) throw new Error(d.error); return d; });
  }

  // ── Utilities ─────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
    catch(e) { return d; }
  }
  function fmtDateInput(d) {
    if (!d) return '';
    try { return new Date(d).toISOString().split('T')[0]; } catch(e) { return ''; }
  }
  function fmtMoney(v, decimals) {
    var n = parseFloat(v) || 0;
    decimals = decimals !== undefined ? decimals : 2;
    return '$' + n.toLocaleString('en-US',{minimumFractionDigits:decimals, maximumFractionDigits:decimals});
  }
  function fmtHours(h) {
    var n = parseFloat(h)||0;
    return n % 1 === 0 ? n+'h' : n.toFixed(1)+'h';
  }
  function genId(prefix) {
    var d = new Date();
    var ds = String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + d.getFullYear();
    return (prefix||'PR') + '-' + ds + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  }
  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type||'info');
  }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u){ return u.user_id===uid||u.id===uid; });
    return u ? (u.name||u.email||uid) : uid;
  }
  function userInitial(uid) { return userName(uid).charAt(0).toUpperCase()||'?'; }
  function userAvatar(uid, sz) {
    sz = sz||'w-7 h-7 text-[11px]';
    var cols = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
    var i = uid ? uid.charCodeAt(0)%cols.length : 0;
    return '<span class="'+sz+' '+cols[i]+' rounded-full flex items-center justify-center font-bold flex-shrink-0">'+userInitial(uid)+'</span>';
  }
  function periodLabel(start, end) {
    if (!start) return '—';
    return fmtDate(start) + (end ? ' – ' + fmtDate(end) : '');
  }
  function calcGross(r) {
    var base     = parseFloat(r.gross_salary) || 0;
    var bonus    = parseFloat(r.bonus) || 0;
    var overtime = parseFloat(r.overtime_pay) || 0;
    var extra    = parseFloat(r.extra_pay) || 0;
    return base + bonus + overtime + extra;
  }
  function calcDeductions(r) {
    var tax      = parseFloat(r.tax) || 0;
    var health   = parseFloat(r.health_insurance) || 0;
    var pension  = parseFloat(r.pension) || 0;
    var other    = parseFloat(r.other_deductions) || 0;
    return tax + health + pension + other;
  }
  function calcNet(r) {
    return Math.max(0, calcGross(r) - calcDeductions(r));
  }
  function detectAnomaly(run, allRuns) {
    // Flag if net pay changed >50% vs last period for same employee
    var prev = allRuns.filter(function(r) {
      return r.employee_id === run.employee_id && r.id !== run.id && r.status !== 'Void';
    }).sort(function(a,b){ return new Date(b.period_start)-new Date(a.period_start); })[0];
    if (!prev) return null;
    var cur  = calcNet(run);
    var old  = calcNet(prev);
    if (!old) return null;
    var pct = Math.abs((cur - old) / old) * 100;
    if (pct > 50) return { pct: Math.round(pct), dir: cur > old ? 'up' : 'down' };
    return null;
  }

  // ── Badges ────────────────────────────────────────────────────
  function statusBadge(s) {
    var c = STATUS_CFG[s] || STATUS_CFG['Draft'];
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold '+c.bg+' '+c.text+'">' +
      '<i class="fas '+c.icon+' text-[9px]"></i>'+esc(s||'Draft')+'</span>';
  }
  function anomalyBadge(anom) {
    if (!anom) return '';
    return '<span class="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200" title="Pay changed '+anom.pct+'% vs last period">' +
      '<i class="fas fa-'+(anom.dir==='up'?'arrow-up':'arrow-down')+' text-[9px]"></i>'+anom.pct+'% change</span>';
  }

  // ── Modal helpers ─────────────────────────────────────────────
  var MODAL_ID = 'wv-pr-modal';
  function getPortal() {
    var el = document.getElementById(MODAL_ID);
    if (!el) { el=document.createElement('div'); el.id=MODAL_ID; document.body.appendChild(el); }
    return el;
  }
  function showModal(html, w) {
    w = w||'680px';
    getPortal().innerHTML =
      '<div id="pr-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem">' +
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,.25);width:100%;max-width:'+w+';max-height:92vh;overflow-y:auto;z-index:9999">'+html+'</div>' +
      '</div>';
    document.getElementById('pr-backdrop').addEventListener('click',function(e){if(e.target.id==='pr-backdrop')closeModal();});
  }
  function closeModal() { var p=getPortal(); if(p) p.innerHTML=''; }
  function modalMsg(msg, ok) {
    var el=document.getElementById('pr-msg'); if(!el) return;
    el.innerHTML = msg ? '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium mb-3 '+
      (ok?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-600 border border-red-200')+'">' +
      '<i class="fas '+(ok?'fa-check-circle':'fa-exclamation-circle')+'"></i><span>'+esc(msg)+'</span></div>' : '';
  }

  // ── Load data ─────────────────────────────────────────────────
  function loadData() {
    var el = document.getElementById('pr-content');
    if (el) el.innerHTML = '<div class="flex items-center justify-center py-24 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mr-3"></i>Loading payroll…</div>';

    var tasks = [
      api('payroll/runs/list', {}).catch(function(){ return {rows:[]}; }),
      api('payroll/employees/list', {}).catch(function(){ return {rows:[]}; }),
      api('users/list', {}).catch(function(){ return {rows:[]}; }),
      api('timesheets/list', {}).catch(function(){ return {rows:[]}; }),
    ];

    Promise.all(tasks).then(function(res) {
      runsCache  = res[0].rows || [];
      empCache   = res[1].rows || [];
      usersCache = res[2].rows || [];
      tsCache    = res[3].rows || [];

      // Compute live total (approved + paid runs this month)
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      _liveTotal = runsCache
        .filter(function(r){ return r.status==='Approved'||r.status==='Paid'; })
        .filter(function(r){ return (r.period_start||'') >= monthStart; })
        .reduce(function(s,r){ return s + calcNet(r); }, 0);

      rerender();
    }).catch(function(e) {
      if (el) el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-400"><i class="fas fa-exclamation-triangle text-3xl mb-3 text-amber-400"></i><p class="font-semibold">Could not load payroll data</p><p class="text-sm mt-1 text-center max-w-xs">'+esc(e.message)+'</p></div>';
    });
  }

  function rerender() {
    var filtered = applyFilters(runsCache.slice());
    var sorted   = applySort(filtered);
    renderStats(filtered);
    renderLiveCounter();
    if (activeView === 'employees') renderEmployees();
    else if (activeView === 'summary') renderSummary(filtered);
    else renderRuns(sorted);
  }

  // ── Filtering + Sorting ───────────────────────────────────────
  function applyFilters(rows) {
    if (!isAdmin()) {
      var me = myUserId();
      rows = rows.filter(function(r){ return r.employee_id === me; });
    }
    if (filters.status)      rows = rows.filter(function(r){ return r.status===filters.status; });
    if (filters.employee_id) rows = rows.filter(function(r){ return r.employee_id===filters.employee_id; });
    if (_searchVal) {
      var q = _searchVal.toLowerCase();
      rows = rows.filter(function(r){
        return (r.employee_name||'').toLowerCase().includes(q) ||
               (r.id||'').toLowerCase().includes(q) ||
               userName(r.employee_id).toLowerCase().includes(q);
      });
    }
    return rows;
  }
  function applySort(rows) {
    return rows.slice().sort(function(a,b){
      var va=a[sortState.col]||'', vb=b[sortState.col]||'';
      if (sortState.col==='net'||sortState.col==='gross') { va=calcNet(a); vb=calcNet(b); }
      else if (sortState.col==='period_start') { va=new Date(va||0).getTime(); vb=new Date(vb||0).getTime(); }
      else { va=String(va).toLowerCase(); vb=String(vb).toLowerCase(); }
      var c = va<vb?-1:va>vb?1:0;
      return sortState.dir==='desc'?-c:c;
    });
  }

  // ── Stats bar ─────────────────────────────────────────────────
  function renderStats(rows) {
    var el = document.getElementById('pr-stats');
    if (!el) return;
    var totalNet   = rows.reduce(function(s,r){ return s+calcNet(r); }, 0);
    var pendingCt  = rows.filter(function(r){ return r.status==='Pending'||r.status==='Draft'; }).length;
    var paidCt     = rows.filter(function(r){ return r.status==='Paid'; }).length;
    var anomalies  = rows.filter(function(r){ return detectAnomaly(r, runsCache); }).length;

    function card(icon, iconCls, label, val, sub, alert) {
      return '<div class="bg-white border '+(alert?'border-red-200 bg-red-50/30':'border-slate-200')+' rounded-xl px-4 py-3 flex items-center gap-3">' +
        '<div class="w-9 h-9 '+iconCls+' rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas '+icon+' text-sm"></i></div>' +
        '<div><p class="text-xs text-slate-400 font-medium">'+label+'</p>' +
        '<p class="text-lg font-extrabold text-slate-900 leading-none mt-0.5">'+val+'</p>' +
        (sub?'<p class="text-[10px] text-slate-400 mt-0.5">'+sub+'</p>':'')+
        '</div></div>';
    }
    el.innerHTML =
      card('fa-dollar-sign','bg-emerald-100 text-emerald-600','Total Net Pay',fmtMoney(totalNet,0),rows.length+' run'+(rows.length!==1?'s':'')) +
      card('fa-hourglass-half','bg-amber-100 text-amber-600','Awaiting Action',pendingCt+' runs',pendingCt?'need review':'all clear',pendingCt>0) +
      card('fa-check-circle','bg-blue-100 text-blue-600','Paid This View',paidCt+' runs',paidCt?fmtMoney(rows.filter(function(r){return r.status==='Paid';}).reduce(function(s,r){return s+calcNet(r);},0),0)+' paid':'') +
      card('fa-exclamation-triangle','bg-red-100 text-red-500','Pay Anomalies',anomalies+' flagged',anomalies?'review recommended':'none detected',anomalies>0);
  }

  function renderLiveCounter() {
    var el = document.getElementById('pr-live-total');
    if (el) el.textContent = fmtMoney(_liveTotal, 0);
  }

  // ── Main Shell ────────────────────────────────────────────────
  function render() {
    var empOpts = isAdmin()
      ? '<option value="">All Employees</option>' + usersCache.map(function(u){
          var uid=u.user_id||u.id;
          return '<option value="'+esc(uid)+'"'+(filters.employee_id===uid?' selected':'')+'>'+esc(u.name||u.email||uid)+'</option>';
        }).join('')
      : '';

    container.innerHTML =
      '<style>' +
        '.pr-section{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;overflow:hidden;margin-bottom:1rem}' +
        '.pr-section-head{padding:.75rem 1.25rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:between;gap:.5rem}' +
        '.pr-field label{display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem}' +
        '.pr-input{width:100%;padding:.5rem .75rem;border:1.5px solid #e2e8f0;border-radius:.625rem;font-size:.875rem;color:#1e293b;outline:none;font-family:inherit;background:#fff;box-sizing:border-box;transition:border-color .15s}' +
        '.pr-input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.1)}' +
        '.pr-input[readonly]{background:#f8fafc;color:#64748b;cursor:default}' +
        '.net-pay-box{background:linear-gradient(135deg,#064e3b,#065f46);border-radius:1rem;padding:1.5rem;color:#fff;text-align:center}' +
        '.net-pay-box .amount{font-size:2.5rem;font-weight:900;letter-spacing:-.02em;line-height:1}' +
        '.net-pay-box .label{font-size:.75rem;font-weight:600;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-top:.375rem}' +
      '</style>' +

      '<div class="flex flex-col h-full" style="font-family:\'DM Sans\',sans-serif">' +

        // ── Header
        '<div class="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">' +
          '<div class="flex items-center justify-between gap-4 mb-3">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center"><i class="fas fa-money-bill-wave text-emerald-600 text-sm"></i></div>' +
              '<div>' +
                '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Payroll</h1>' +
                '<p class="text-xs text-slate-400">Manage pay runs, approvals &amp; employee compensation</p>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              // Live total counter
              '<div class="hidden md:flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">' +
                '<span class="w-2 h-2 bg-emerald-500 rounded-full"></span>' +
                '<span class="text-xs font-semibold text-slate-500">Month payroll:</span>' +
                '<span id="pr-live-total" class="text-sm font-extrabold text-emerald-700">—</span>' +
              '</div>' +
              (isPayAdmin() ? '<button id="pr-run-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-white border-none cursor-pointer" style="background:#10b981"><i class="fas fa-play text-[10px]"></i>New Pay Run</button>' : '') +
              (isPayAdmin() ? '<button id="pr-bulk-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 cursor-pointer"><i class="fas fa-bolt text-[10px]"></i>Bulk Run</button>' : '') +
            '</div>' +
          '</div>' +

          // Stats
          '<div id="pr-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3"></div>' +

          // Toolbar
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<div class="relative flex-1 min-w-[150px] max-w-xs">' +
              '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none"></i>' +
              '<input id="pr-search" type="text" placeholder="Search employee or run…" value="'+esc(_searchVal)+'" ' +
                'class="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:border-emerald-400" style="font-family:inherit">' +
            '</div>' +
            '<select id="pr-filter-status" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-emerald-400" style="font-family:inherit">' +
              '<option value="">All Statuses</option>' +
              STATUSES.map(function(s){ return '<option value="'+s+'"'+(filters.status===s?' selected':'')+'>'+s+'</option>'; }).join('') +
            '</select>' +
            (isAdmin() ? '<select id="pr-filter-emp" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-emerald-400" style="font-family:inherit">'+empOpts+'</select>' : '') +
            '<div class="flex-1"></div>' +
            // View switcher
            '<div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">' +
              [['runs','fa-list-alt','Pay Runs'],['employees','fa-users','Employees'],['summary','fa-chart-bar','Summary']].map(function(v){
                return '<button data-view="'+v[0]+'" class="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold transition-all '+
                  (activeView===v[0]?'bg-white shadow-sm text-emerald-600':'text-slate-500 hover:text-slate-700')+'">' +
                  '<i class="fas '+v[1]+' text-[10px]"></i>'+v[2]+'</button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        // ── Content
        '<div id="pr-content" class="flex-1 overflow-y-auto px-6 py-4"></div>' +
      '</div>';

    // Bind toolbar
    document.getElementById('pr-search').addEventListener('input', function(){
      clearTimeout(_searchTimer);
      var v = this.value;
      _searchTimer = setTimeout(function(){ _searchVal=v; rerender(); }, 300);
    });
    document.getElementById('pr-filter-status').addEventListener('change', function(){ filters.status=this.value; rerender(); });
    var fe = document.getElementById('pr-filter-emp');
    if (fe) fe.addEventListener('change', function(){ filters.employee_id=this.value; rerender(); });

    document.querySelectorAll('[data-view]').forEach(function(btn){
      btn.addEventListener('click', function(){
        activeView = this.dataset.view;
        sessionStorage.setItem('pr_view', activeView);
        render();
      });
    });

    var rb = document.getElementById('pr-run-btn');
    if (rb) rb.addEventListener('click', function(){ openRunForm(null); });
    var bb = document.getElementById('pr-bulk-btn');
    if (bb) bb.addEventListener('click', openBulkRunModal);

    loadData();
  }

  // ── Pay Runs List View ────────────────────────────────────────
  function renderRuns(rows) {
    var el = document.getElementById('pr-content');
    if (!el) return;

    if (!rows.length) {
      el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-300"><i class="fas fa-money-check-alt text-5xl mb-4 opacity-30"></i><p class="font-semibold text-slate-500">No pay runs found</p><p class="text-sm mt-1">Create a new pay run to get started.</p></div>';
      return;
    }

    function th(col, lbl) {
      var active = sortState.col===col;
      var icon   = active?(sortState.dir==='asc'?'fa-sort-up':'fa-sort-down'):'fa-sort';
      return '<th class="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap" data-sort="'+col+'">' +
        '<span class="flex items-center gap-1">'+lbl+'<i class="fas '+icon+' text-[9px] '+(active?'text-emerald-500':'text-slate-300')+'"></i></span></th>';
    }

    var html =
      '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">' +
      '<table class="w-full text-sm border-collapse"><thead class="bg-slate-50 border-b border-slate-200"><tr>' +
        (isAdmin() ? '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Employee</th>' : '') +
        th('period_start','Pay Period') +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Earnings</th>' +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Deductions</th>' +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap">Net Pay</th>' +
        th('status','Status') +
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Actions</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function(r) {
      var gross   = calcGross(r);
      var ded     = calcDeductions(r);
      var net     = calcNet(r);
      var anom    = detectAnomaly(r, runsCache);
      var cfg     = STATUS_CFG[r.status] || STATUS_CFG['Draft'];
      var canEdit = isPayAdmin() && r.status !== 'Paid' && r.status !== 'Void';
      var canApprove = isPayAdmin() && r.status === 'Pending';
      var canPay     = isPayAdmin() && r.status === 'Approved';
      var netColor   = r.status==='Approved'||r.status==='Paid' ? 'text-emerald-700' : net<0 ? 'text-red-600' : 'text-slate-900';

      html += '<tr class="border-t border-slate-100 hover:bg-emerald-50/20 transition-colors group cursor-pointer pr-row" data-id="'+esc(r.id)+'" style="border-left:3px solid '+cfg.dot+'">' +
        (isAdmin() ? '<td class="px-4 py-3"><div class="flex items-center gap-2">'+userAvatar(r.employee_id,'w-6 h-6 text-[10px]')+'<div><div class="text-xs font-semibold text-slate-900 leading-snug">'+esc(r.employee_name||userName(r.employee_id))+'</div><div class="text-[10px] font-mono text-slate-400">'+esc(r.id)+'</div></div></div></td>' : '') +
        '<td class="px-4 py-3 whitespace-nowrap"><div class="text-xs font-bold text-slate-800">'+esc(periodLabel(r.period_start,r.period_end))+'</div>'+(r.pay_type?'<div class="text-[10px] text-slate-400">'+esc(r.pay_type)+'</div>':'')+
        '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">' +
          '<div class="text-sm font-bold text-slate-900">'+fmtMoney(gross)+'</div>' +
          '<div class="flex flex-col gap-0.5 mt-0.5">' +
            (parseFloat(r.gross_salary) ? '<div class="text-[10px] text-slate-400">Base: '+fmtMoney(r.gross_salary)+'</div>' : '') +
            (parseFloat(r.bonus)        ? '<div class="text-[10px] text-emerald-600 font-semibold">+Bonus: '+fmtMoney(r.bonus)+'</div>' : '') +
            (parseFloat(r.overtime_pay) ? '<div class="text-[10px] text-orange-600 font-semibold">+OT: '+fmtMoney(r.overtime_pay)+'</div>' : '') +
          '</div>' +
        '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">' +
          '<div class="text-sm font-bold text-red-500">-'+fmtMoney(ded)+'</div>' +
          '<div class="flex flex-col gap-0.5 mt-0.5">' +
            (parseFloat(r.tax)              ? '<div class="text-[10px] text-slate-400">Tax: '+fmtMoney(r.tax)+'</div>' : '') +
            (parseFloat(r.health_insurance) ? '<div class="text-[10px] text-slate-400">Health: '+fmtMoney(r.health_insurance)+'</div>' : '') +
            (parseFloat(r.pension)          ? '<div class="text-[10px] text-slate-400">Pension: '+fmtMoney(r.pension)+'</div>' : '') +
          '</div>' +
        '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">' +
          '<div class="text-base font-extrabold '+netColor+'">'+fmtMoney(net)+'</div>' +
          (anom ? '<div class="mt-0.5">'+anomalyBadge(anom)+'</div>' : '') +
          (net < 0 ? '<div class="text-[10px] text-red-600 font-bold mt-0.5"><i class="fas fa-exclamation-triangle mr-0.5"></i>Net &lt; 0</div>' : '') +
        '</td>' +
        '<td class="px-4 py-3 whitespace-nowrap">'+statusBadge(r.status||'Draft')+'</td>' +
        '<td class="px-4 py-3 whitespace-nowrap"><div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">' +
          (canEdit    ? '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-blue-50 hover:text-blue-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="edit"    data-id="'+esc(r.id)+'" title="Edit"><i class="fas fa-pencil text-xs"></i></button>' : '') +
          (r.status==='Draft' && isPayAdmin() ? '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-amber-50 hover:text-amber-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="submit" data-id="'+esc(r.id)+'" title="Submit"><i class="fas fa-paper-plane text-xs"></i></button>' : '') +
          (canApprove ? '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-green-50 hover:text-green-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="approve" data-id="'+esc(r.id)+'" title="Approve"><i class="fas fa-check text-xs"></i></button>' : '') +
          (canPay     ? '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-blue-50 hover:text-blue-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="pay" data-id="'+esc(r.id)+'" title="Mark Paid"><i class="fas fa-dollar-sign text-xs"></i></button>' : '') +
          '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-purple-50 hover:text-purple-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="payslip" data-id="'+esc(r.id)+'" title="View Payslip"><i class="fas fa-file-alt text-xs"></i></button>' +
          (isPayAdmin() ? '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-red-50 hover:text-red-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="void" data-id="'+esc(r.id)+'" title="Void"><i class="fas fa-ban text-xs"></i></button>' : '') +
        '</div></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;

    // Sort headers
    el.querySelectorAll('[data-sort]').forEach(function(th){
      th.addEventListener('click', function(){
        var col = this.dataset.sort;
        if (sortState.col===col) sortState.dir=sortState.dir==='asc'?'desc':'asc';
        else { sortState.col=col; sortState.dir='asc'; }
        rerender();
      });
    });

    // Row click → detail
    el.querySelectorAll('.pr-row').forEach(function(row){
      row.addEventListener('click', function(e){
        if (e.target.closest('.pr-act')) return;
        var run = runsCache.find(function(r){ return r.id===this.dataset.id; }.bind(this));
        if (run) openPayslip(run);
      });
    });

    // Action buttons
    el.querySelectorAll('.pr-act').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id  = this.dataset.id;
        var act = this.dataset.action;
        var run = runsCache.find(function(r){ return r.id===id; });
        if (act==='edit')    openRunForm(run);
        if (act==='submit')  updateRunStatus(id,'Pending');
        if (act==='approve') updateRunStatus(id,'Approved');
        if (act==='pay')     updateRunStatus(id,'Paid');
        if (act==='payslip') openPayslip(run);
        if (act==='void')    { if (confirm('Void this pay run? This cannot be undone.')) updateRunStatus(id,'Void'); }
      });
    });
  }

  // ── Employees View ────────────────────────────────────────────
  function renderEmployees() {
    var el = document.getElementById('pr-content');
    if (!el) return;

    // Merge users with payroll employee records
    var empMap = {};
    empCache.forEach(function(e){ empMap[e.id] = e; });

    var people = usersCache.map(function(u) {
      var uid = u.user_id||u.id;
      var emp = empMap[uid] || {};
      var empRuns = runsCache.filter(function(r){ return r.employee_id===uid; });
      var lastRun = empRuns.sort(function(a,b){ return new Date(b.period_start)-new Date(a.period_start); })[0];
      return { u:u, emp:emp, uid:uid, lastRun:lastRun, runCount:empRuns.length,
               totalPaid: empRuns.filter(function(r){ return r.status==='Paid'; }).reduce(function(s,r){ return s+calcNet(r);},0) };
    });

    var html = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
    people.forEach(function(p) {
      var u = p.u; var lastRun = p.lastRun;
      html +=
        '<div class="pr-emp-card bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer" data-uid="'+esc(p.uid)+'">' +
          '<div class="flex items-start gap-3 mb-4">' +
            userAvatar(p.uid, 'w-10 h-10 text-sm') +
            '<div class="flex-1 min-w-0">' +
              '<div class="font-bold text-slate-900 text-sm truncate">'+esc(u.name||u.email||p.uid)+'</div>' +
              '<div class="text-xs text-slate-400 truncate">'+esc(u.role||'—')+(u.department?' · '+esc(u.department):'')+'</div>' +
              (p.emp.pay_type ? '<div class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-px rounded font-semibold inline-block mt-1">'+esc(p.emp.pay_type)+'</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3 mb-3">' +
            '<div class="bg-slate-50 rounded-xl p-2.5 text-center"><div class="text-lg font-extrabold text-slate-900">'+p.runCount+'</div><div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Pay Runs</div></div>' +
            '<div class="bg-emerald-50 rounded-xl p-2.5 text-center"><div class="text-lg font-extrabold text-emerald-700">'+fmtMoney(p.totalPaid,0)+'</div><div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Paid</div></div>' +
          '</div>' +
          (lastRun
            ? '<div class="flex items-center justify-between pt-3 border-t border-slate-100"><span class="text-[10px] text-slate-400">Last run: '+esc(fmtDate(lastRun.period_start))+'</span>'+statusBadge(lastRun.status||'Draft')+'</div>'
            : '<div class="pt-3 border-t border-slate-100 text-[10px] text-slate-400">No pay runs yet</div>') +
          (isPayAdmin() ? '<button class="pr-emp-run w-full mt-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 border border-dashed border-emerald-300 rounded-xl transition-colors bg-transparent cursor-pointer" data-uid="'+esc(p.uid)+'" data-name="'+esc(u.name||u.email||p.uid)+'"><i class="fas fa-plus mr-1 text-[10px]"></i>New Pay Run</button>' : '') +
        '</div>';
    });
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('.pr-emp-card').forEach(function(card){
      card.addEventListener('click', function(e){
        if (e.target.closest('.pr-emp-run')) return;
        filters.employee_id = this.dataset.uid;
        filters.status = '';
        activeView = 'runs';
        sessionStorage.setItem('pr_view','runs');
        render();
        setTimeout(function(){ var fe=document.getElementById('pr-filter-emp'); if(fe) fe.value=filters.employee_id; },100);
      });
    });
    el.querySelectorAll('.pr-emp-run').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        openRunForm(null, { employee_id: this.dataset.uid, employee_name: this.dataset.name });
      });
    });
  }

  // ── Summary View ──────────────────────────────────────────────
  function renderSummary(rows) {
    var el = document.getElementById('pr-content');
    if (!el) return;

    // Group by employee
    var byEmp = {};
    rows.forEach(function(r){
      var eid = r.employee_id||'unknown';
      if (!byEmp[eid]) byEmp[eid] = { name:r.employee_name||userName(r.employee_id), runs:[], gross:0, deductions:0, net:0 };
      byEmp[eid].runs.push(r);
      byEmp[eid].gross      += calcGross(r);
      byEmp[eid].deductions += calcDeductions(r);
      byEmp[eid].net        += calcNet(r);
    });

    var totalGross = rows.reduce(function(s,r){ return s+calcGross(r); },0);
    var totalDed   = rows.reduce(function(s,r){ return s+calcDeductions(r); },0);
    var totalNet   = rows.reduce(function(s,r){ return s+calcNet(r); },0);

    var html =
      // Grand total banner
      '<div class="grid grid-cols-3 gap-4 mb-6">' +
        summaryCard('Total Gross','fa-arrow-up','bg-slate-900 text-white',fmtMoney(totalGross,0),'All earnings before deductions') +
        summaryCard('Total Deductions','fa-arrow-down','bg-red-600 text-white','-'+fmtMoney(totalDed,0),'Taxes, insurance, pension') +
        summaryCard('Total Net Pay','fa-check','bg-emerald-700 text-white',fmtMoney(totalNet,0),'Employee take-home') +
      '</div>' +

      // Per-employee table
      '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">' +
        '<div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">' +
          '<p class="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Breakdown by Employee</p>' +
          '<span class="text-xs text-slate-400">'+Object.keys(byEmp).length+' employees</span>' +
        '</div>' +
        '<table class="w-full text-sm border-collapse">' +
          '<thead><tr class="border-b border-slate-100">' +
            '<th class="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>' +
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Gross</th>' +
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Deductions</th>' +
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Net Pay</th>' +
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Runs</th>' +
          '</tr></thead><tbody>';

    Object.entries(byEmp).forEach(function(entry) {
      var eid = entry[0], d = entry[1];
      var pct = totalGross ? Math.round(d.gross/totalGross*100) : 0;
      html +=
        '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">' +
          '<td class="px-5 py-3"><div class="flex items-center gap-2">'+userAvatar(eid,'w-6 h-6 text-[10px]')+'<span class="text-sm font-semibold text-slate-900">'+esc(d.name)+'</span></div></td>' +
          '<td class="px-5 py-3 text-right text-sm text-slate-700 font-semibold">'+fmtMoney(d.gross)+'</td>' +
          '<td class="px-5 py-3 text-right text-sm text-red-500 font-semibold">-'+fmtMoney(d.deductions)+'</td>' +
          '<td class="px-5 py-3 text-right">' +
            '<div class="text-sm font-extrabold text-emerald-700">'+fmtMoney(d.net)+'</div>' +
            '<div class="h-1.5 bg-slate-100 rounded-full mt-1" style="width:80px;margin-left:auto">' +
              '<div class="h-1.5 bg-emerald-500 rounded-full" style="width:'+pct+'%"></div>' +
            '</div>' +
          '</td>' +
          '<td class="px-5 py-3 text-right text-xs text-slate-500 font-semibold">'+d.runs.length+'</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function summaryCard(label, icon, cls, val, sub) {
    return '<div class="'+cls+' rounded-2xl px-5 py-4">' +
      '<p class="text-xs font-bold opacity-70 uppercase tracking-widest mb-2">'+label+'</p>' +
      '<p class="text-3xl font-black leading-none">'+val+'</p>' +
      '<p class="text-xs opacity-60 mt-1.5">'+sub+'</p>' +
    '</div>';
  }

  // ── Pay Run Form (Create / Edit) ──────────────────────────────
  function openRunForm(run, prefill) {
    var isEdit = !!run;
    var r = run || prefill || {};

    // Try to autofill from timesheets for this employee
    var tsHours = 0;
    if (r.employee_id && tsCache.length) {
      tsHours = tsCache
        .filter(function(t){ return t.employee_id===r.employee_id||t.user_id===r.employee_id; })
        .filter(function(t){ return t.status==='Approved'; })
        .reduce(function(s,t){ return s+(parseFloat(t.hours)||parseFloat(t.total_hours)||0); }, 0);
    }

    var userOpts = usersCache.map(function(u){
      var uid=u.user_id||u.id;
      return '<option value="'+esc(uid)+'" data-name="'+esc(u.name||u.email||uid)+'"'+(r.employee_id===uid?' selected':'')+'>'+esc(u.name||u.email||uid)+'</option>';
    }).join('');

    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><i class="fas fa-file-invoice-dollar text-emerald-500"></i>'+(isEdit?'Edit Pay Run':'New Pay Run')+'</h3>' +
        '<button id="prf-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5">' +
        '<div id="pr-msg"></div>' +

        // ── SECTION: Employee + Period ──────────────────────────
        '<div class="pr-section mb-0">' +
          '<div class="pr-section-head"><i class="fas fa-user text-slate-400 mr-2"></i><span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Employee &amp; Pay Period</span></div>' +
          '<div class="p-4 grid grid-cols-2 gap-3">' +
            '<div class="col-span-2 pr-field"><label>Employee</label>' +
              (isPayAdmin()
                ? '<select id="prf-emp" class="pr-input"><option value="">Select employee…</option>'+userOpts+'</select>'
                : '<input class="pr-input" readonly value="'+esc(r.employee_name||userName(r.employee_id)||myName())+'"><input type="hidden" id="prf-emp" value="'+esc(r.employee_id||myUserId())+'">') +
            '</div>' +
            '<div class="pr-field"><label>Period Start</label><input id="prf-start" type="date" class="pr-input" value="'+esc(fmtDateInput(r.period_start)||'')+'"></div>' +
            '<div class="pr-field"><label>Period End</label><input id="prf-end" type="date" class="pr-input" value="'+esc(fmtDateInput(r.period_end)||'')+'"></div>' +
            '<div class="pr-field"><label>Pay Type</label>' +
              '<select id="prf-paytype" class="pr-input">' +
                PAY_TYPES.map(function(pt){ return '<option'+(r.pay_type===pt?' selected':'')+'>'+pt+'</option>'; }).join('') +
              '</select>' +
            '</div>' +
            (tsHours > 0
              ? '<div class="col-span-2 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs"><i class="fas fa-clock text-amber-500"></i><span class="text-amber-700 font-semibold">'+fmtHours(tsHours)+' approved timesheet hours found for this employee</span><button id="prf-ts-fill" class="ml-auto text-xs font-bold text-amber-700 underline border-none bg-transparent cursor-pointer">Autofill</button></div>'
              : '') +
          '</div>' +
        '</div>' +

        // ── SECTION: Earnings ──────────────────────────────────
        '<div class="pr-section">' +
          '<div class="pr-section-head"><i class="fas fa-arrow-up text-emerald-500 mr-2"></i><span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Earnings</span></div>' +
          '<div class="p-4 grid grid-cols-2 gap-3">' +
            '<div class="pr-field"><label>Base / Gross Salary</label><input id="prf-gross" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.gross_salary||'')+'" placeholder="0.00"></div>' +
            '<div class="pr-field"><label>Overtime Hours</label><input id="prf-ot-hours" type="number" min="0" step="0.5" class="pr-input" value="'+esc(r.overtime_hours||'')+'" placeholder="0"></div>' +
            '<div class="pr-field"><label>Overtime Rate ($/hr)</label><input id="prf-ot-rate" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.overtime_rate||'')+'" placeholder="0.00"></div>' +
            '<div class="pr-field"><label>Overtime Pay</label><input id="prf-ot-pay" type="number" min="0" step="0.01" class="pr-input pr-input-calc" value="'+esc(r.overtime_pay||'')+'" placeholder="auto-calculated" readonly></div>' +
            '<div class="pr-field"><label>Bonus</label><input id="prf-bonus" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.bonus||'')+'" placeholder="0.00"></div>' +
            '<div class="pr-field"><label>Extra / Commission</label><input id="prf-extra" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.extra_pay||'')+'" placeholder="0.00"></div>' +
          '</div>' +
          '<div class="px-4 pb-3"><div class="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">' +
            '<span class="text-xs font-bold text-emerald-700 uppercase tracking-wider">Gross Earnings</span>' +
            '<span id="prf-gross-total" class="text-lg font-extrabold text-emerald-700">'+fmtMoney(calcGross(r))+'</span>' +
          '</div></div>' +
        '</div>' +

        // ── SECTION: Deductions ────────────────────────────────
        '<div class="pr-section">' +
          '<div class="pr-section-head"><i class="fas fa-arrow-down text-red-400 mr-2"></i><span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Deductions</span></div>' +
          '<div class="p-4 grid grid-cols-2 gap-3">' +
            '<div class="pr-field"><label>Income Tax</label><input id="prf-tax" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.tax||'')+'" placeholder="0.00"></div>' +
            '<div class="pr-field"><label>Health Insurance</label><input id="prf-health" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.health_insurance||'')+'" placeholder="0.00"></div>' +
            '<div class="pr-field"><label>Pension / 401k</label><input id="prf-pension" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.pension||'')+'" placeholder="0.00"></div>' +
            '<div class="pr-field"><label>Other Deductions</label><input id="prf-other-ded" type="number" min="0" step="0.01" class="pr-input" value="'+esc(r.other_deductions||'')+'" placeholder="0.00"></div>' +
          '</div>' +
          '<div class="px-4 pb-3"><div class="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">' +
            '<span class="text-xs font-bold text-red-600 uppercase tracking-wider">Total Deductions</span>' +
            '<span id="prf-ded-total" class="text-lg font-extrabold text-red-600">-'+fmtMoney(calcDeductions(r))+'</span>' +
          '</div></div>' +
        '</div>' +

        // ── NET PAY BOX ────────────────────────────────────────
        '<div class="net-pay-box mb-4">' +
          '<div class="label">Net Pay</div>' +
          '<div class="amount" id="prf-net-pay">'+fmtMoney(calcNet(r))+'</div>' +
          '<div id="prf-net-warn" class="hidden mt-2 text-xs font-bold text-red-300"><i class="fas fa-exclamation-triangle mr-1"></i>Net pay is negative — check your figures</div>' +
        '</div>' +

        // ── Notes ──────────────────────────────────────────────
        '<div class="pr-field mb-4"><label>Notes</label>' +
          '<textarea id="prf-notes" rows="2" class="pr-input" placeholder="Internal payroll notes…" style="resize:vertical">'+esc(r.notes||'')+'</textarea>' +
        '</div>' +

        '<div class="flex gap-3">' +
          '<button id="prf-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="prf-save" class="btn-primary flex-1" style="background:#10b981"><i class="fas fa-save mr-1.5 text-xs"></i>'+(isEdit?'Save Changes':'Create Pay Run')+'</button>' +
        '</div>' +
      '</div>';

    showModal(html, '700px');

    // Live recalculator
    var calcIds = ['prf-gross','prf-bonus','prf-extra','prf-tax','prf-health','prf-pension','prf-other-ded','prf-ot-hours','prf-ot-rate'];
    function recalc() {
      // Overtime auto-calc
      var otHours = parseFloat(document.getElementById('prf-ot-hours').value)||0;
      var otRate  = parseFloat(document.getElementById('prf-ot-rate').value)||0;
      var otPay   = otHours * otRate;
      var otEl    = document.getElementById('prf-ot-pay');
      if (otEl) { otEl.value = otPay ? otPay.toFixed(2) : ''; }

      var tempR = {
        gross_salary:     parseFloat(document.getElementById('prf-gross').value)||0,
        bonus:            parseFloat(document.getElementById('prf-bonus').value)||0,
        overtime_pay:     otPay,
        extra_pay:        parseFloat(document.getElementById('prf-extra').value)||0,
        tax:              parseFloat(document.getElementById('prf-tax').value)||0,
        health_insurance: parseFloat(document.getElementById('prf-health').value)||0,
        pension:          parseFloat(document.getElementById('prf-pension').value)||0,
        other_deductions: parseFloat(document.getElementById('prf-other-ded').value)||0,
      };
      var gross = calcGross(tempR);
      var ded   = calcDeductions(tempR);
      var net   = Math.max(0, gross - ded);
      var rawNet= gross - ded;

      var gEl = document.getElementById('prf-gross-total');
      var dEl = document.getElementById('prf-ded-total');
      var nEl = document.getElementById('prf-net-pay');
      var wEl = document.getElementById('prf-net-warn');
      if (gEl) gEl.textContent = fmtMoney(gross);
      if (dEl) dEl.textContent = '-' + fmtMoney(ded);
      if (nEl) nEl.textContent = fmtMoney(net);
      if (wEl) wEl.classList.toggle('hidden', rawNet >= 0);
    }

    calcIds.forEach(function(id){
      var el2 = document.getElementById(id);
      if (el2) el2.addEventListener('input', recalc);
    });

    // Employee selector → update name
    var empSel = document.getElementById('prf-emp');
    if (empSel && empSel.tagName === 'SELECT') {
      empSel.addEventListener('change', function(){
        var opt = this.options[this.selectedIndex];
        // prefill ts hours for newly selected employee
      });
    }

    // Timesheet autofill
    var tsBtn = document.getElementById('prf-ts-fill');
    if (tsBtn) {
      tsBtn.addEventListener('click', function(){
        var grossEl = document.getElementById('prf-gross');
        if (grossEl && tsHours > 0) {
          // Try to find hourly rate from employee record
          var uid = (document.getElementById('prf-emp')||{}).value || r.employee_id;
          var emp = empCache.find(function(e){ return e.id===uid; });
          var rate = parseFloat((emp||{}).salary) || 0;
          if (rate) { grossEl.value = (tsHours * rate).toFixed(2); recalc(); toast('Autofilled '+fmtHours(tsHours)+' × $'+rate+'/hr','info'); }
          else { toast('No hourly rate on employee record — set salary first','warning'); }
        }
      });
    }

    document.getElementById('prf-close').addEventListener('click', closeModal);
    document.getElementById('prf-cancel').addEventListener('click', closeModal);
    document.getElementById('prf-save').addEventListener('click', function(){ submitRunForm(isEdit ? run.id : null); });
  }

  // ── Bulk Run Modal ────────────────────────────────────────────
  function openBulkRunModal() {
    var html =
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><i class="fas fa-bolt text-amber-500"></i>Bulk Pay Run</h3>' +
        '<button id="bulk-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>' +
      '</div>' +
      '<div class="px-6 py-5">' +
        '<div id="pr-msg"></div>' +
        '<p class="text-sm text-slate-600 mb-4">Generate a Draft pay run for every employee using their base salary on record. You can edit each run individually before approving.</p>' +
        '<div class="grid grid-cols-2 gap-3 mb-4">' +
          '<div class="pr-field"><label>Period Start</label><input id="bulk-start" type="date" class="pr-input"></div>' +
          '<div class="pr-field"><label>Period End</label><input id="bulk-end" type="date" class="pr-input"></div>' +
        '</div>' +
        '<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">' +
          usersCache.map(function(u){
            var uid=u.user_id||u.id;
            var emp=empCache.find(function(e){return e.id===uid;})||{};
            return '<label class="flex items-center gap-3 py-1.5 cursor-pointer">' +
              '<input type="checkbox" class="bulk-emp-cb" value="'+esc(uid)+'" data-name="'+esc(u.name||u.email||uid)+'" data-salary="'+esc(emp.salary||0)+'" checked style="accent-color:#10b981">' +
              userAvatar(uid,'w-5 h-5 text-[10px]') +
              '<span class="text-sm text-slate-700 flex-1">'+esc(u.name||u.email||uid)+'</span>' +
              '<span class="text-xs text-slate-400">'+esc(emp.pay_type||'')+(emp.salary?' · $'+emp.salary:'')+'</span>' +
            '</label>';
          }).join('') +
        '</div>' +
        '<div class="flex gap-3">' +
          '<button id="bulk-cancel" class="btn-secondary flex-1">Cancel</button>' +
          '<button id="bulk-go" class="btn-primary flex-1" style="background:#10b981"><i class="fas fa-bolt mr-1.5 text-xs"></i>Generate Runs</button>' +
        '</div>' +
      '</div>';

    showModal(html, '540px');
    document.getElementById('bulk-close').addEventListener('click', closeModal);
    document.getElementById('bulk-cancel').addEventListener('click', closeModal);
    document.getElementById('bulk-go').addEventListener('click', function() {
      var start = document.getElementById('bulk-start').value;
      var end   = document.getElementById('bulk-end').value;
      if (!start) { modalMsg('Period start is required.', false); return; }
      var selected = Array.from(document.querySelectorAll('.bulk-emp-cb:checked'));
      if (!selected.length) { modalMsg('Select at least one employee.', false); return; }
      var btn = this; btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Generating…';
      var creates = selected.map(function(cb){
        return api('payroll/runs/create', {
          id:            genId('PR'),
          employee_id:   cb.value,
          employee_name: cb.dataset.name,
          period_start:  start,
          period_end:    end||'',
          gross_salary:  cb.dataset.salary||'0',
          status:        'Draft',
          created_by:    myUserId(),
        });
      });
      Promise.all(creates).then(function(){
        toast('Created '+creates.length+' pay runs', 'success');
        closeModal();
        loadData();
      }).catch(function(e){ modalMsg(e.message, false); btn.disabled=false; btn.innerHTML='<i class="fas fa-bolt mr-1.5 text-xs"></i>Generate Runs'; });
    });
  }

  // ── Payslip Modal ─────────────────────────────────────────────
  function openPayslip(r) {
    if (!r) return;
    var gross = calcGross(r);
    var ded   = calcDeductions(r);
    var net   = calcNet(r);
    var cfg   = STATUS_CFG[r.status]||STATUS_CFG['Draft'];
    var anom  = detectAnomaly(r, runsCache);

    var lineItem = function(label, val, color, bold) {
      return '<div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">' +
        '<span class="text-xs text-slate-500">'+label+'</span>' +
        '<span class="text-xs font-'+(bold?'bold':'semibold')+' '+(color||'text-slate-800')+'">'+val+'</span>' +
      '</div>';
    };

    var html =
      // Header
      '<div class="bg-gradient-to-br from-slate-900 to-emerald-950 px-6 pt-6 pb-8 text-white relative overflow-hidden">' +
        '<div class="absolute -right-4 -bottom-4 opacity-10"><i class="fas fa-money-bill-wave text-9xl"></i></div>' +
        '<button id="ps-close" class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center border-none cursor-pointer text-white transition-colors"><i class="fas fa-times text-sm"></i></button>' +
        '<div class="text-xs font-bold uppercase tracking-widest opacity-60 mb-3">Payslip</div>' +
        '<div class="flex items-center gap-3 mb-4">' +
          '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-xl font-black">'+userInitial(r.employee_id)+'</div>' +
          '<div><div class="text-lg font-extrabold">'+esc(r.employee_name||userName(r.employee_id))+'</div>' +
          '<div class="text-xs opacity-70">'+esc(periodLabel(r.period_start,r.period_end))+(r.pay_type?' · '+esc(r.pay_type):'')+'</div></div>' +
        '</div>' +
        // Big net pay
        '<div class="bg-white/10 rounded-2xl px-5 py-4 text-center">' +
          '<div class="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Net Pay</div>' +
          '<div class="text-4xl font-black">'+fmtMoney(net)+'</div>' +
          '<div class="mt-2">'+statusBadge(r.status||'Draft')+'</div>' +
        '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">' +

        // Earnings column
        '<div class="px-5 py-5 border-r border-slate-100">' +
          '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><i class="fas fa-arrow-up text-emerald-500 text-[10px]"></i>Earnings</p>' +
          (parseFloat(r.gross_salary) ? lineItem('Base Salary', fmtMoney(r.gross_salary)) : '') +
          (parseFloat(r.overtime_pay) ? lineItem('Overtime ('+(r.overtime_hours||0)+'h × $'+(r.overtime_rate||0)+')', fmtMoney(r.overtime_pay), 'text-orange-600') : '') +
          (parseFloat(r.bonus)        ? lineItem('Bonus', fmtMoney(r.bonus), 'text-emerald-600') : '') +
          (parseFloat(r.extra_pay)    ? lineItem('Extra / Commission', fmtMoney(r.extra_pay), 'text-emerald-600') : '') +
          '<div class="flex items-center justify-between mt-2 pt-2 border-t-2 border-slate-200">' +
            '<span class="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Gross Total</span>' +
            '<span class="text-sm font-extrabold text-slate-900">'+fmtMoney(gross)+'</span>' +
          '</div>' +
        '</div>' +

        // Deductions column
        '<div class="px-5 py-5">' +
          '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><i class="fas fa-arrow-down text-red-400 text-[10px]"></i>Deductions</p>' +
          (parseFloat(r.tax)              ? lineItem('Income Tax', '-'+fmtMoney(r.tax), 'text-red-500') : '') +
          (parseFloat(r.health_insurance) ? lineItem('Health Insurance', '-'+fmtMoney(r.health_insurance), 'text-red-500') : '') +
          (parseFloat(r.pension)          ? lineItem('Pension / 401k', '-'+fmtMoney(r.pension), 'text-red-500') : '') +
          (parseFloat(r.other_deductions) ? lineItem('Other', '-'+fmtMoney(r.other_deductions), 'text-red-500') : '') +
          '<div class="flex items-center justify-between mt-2 pt-2 border-t-2 border-slate-200">' +
            '<span class="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Total Deductions</span>' +
            '<span class="text-sm font-extrabold text-red-600">-'+fmtMoney(ded)+'</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Anomaly + notes
      (anom ? '<div class="mx-5 mb-4 flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700"><i class="fas fa-exclamation-triangle text-red-400 mt-0.5 flex-shrink-0"></i><div><strong>Anomaly Detected:</strong> Net pay changed '+anom.pct+'% ('+anom.dir+') vs previous period. Review before approving.</div></div>' : '') +
      (r.notes ? '<div class="mx-5 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600"><i class="fas fa-sticky-note text-slate-400 mr-1.5"></i>'+esc(r.notes)+'</div>' : '') +

      // Actions
      '<div class="px-5 pb-5 flex gap-3">' +
        (isPayAdmin() && r.status==='Draft'   ? '<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer" style="background:#f59e0b;color:#fff" data-action="submit"  data-id="'+esc(r.id)+'"><i class="fas fa-paper-plane mr-1.5 text-xs"></i>Submit</button>' : '') +
        (isPayAdmin() && r.status==='Pending' ? '<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer" style="background:#16a34a;color:#fff" data-action="approve" data-id="'+esc(r.id)+'"><i class="fas fa-check mr-1.5 text-xs"></i>Approve</button>' : '') +
        (isPayAdmin() && r.status==='Approved'? '<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer" style="background:#2563eb;color:#fff" data-action="pay"     data-id="'+esc(r.id)+'"><i class="fas fa-dollar-sign mr-1.5 text-xs"></i>Mark Paid</button>' : '') +
        (isPayAdmin() && r.status==='Draft'   ? '<button class="ps-act flex-1 btn-secondary py-2.5 text-sm" data-action="edit" data-id="'+esc(r.id)+'"><i class="fas fa-pencil mr-1.5 text-xs"></i>Edit</button>' : '') +
        '<button id="ps-export" class="flex-1 btn-secondary py-2.5 text-sm"><i class="fas fa-download mr-1.5 text-xs"></i>Export CSV</button>' +
      '</div>';

    showModal(html, '800px');
    document.getElementById('ps-close').addEventListener('click', closeModal);

    document.querySelectorAll('.ps-act').forEach(function(btn){
      btn.addEventListener('click', function(){
        var act = this.dataset.action;
        var id  = this.dataset.id;
        if (act==='submit')  { closeModal(); updateRunStatus(id,'Pending'); }
        if (act==='approve') { closeModal(); updateRunStatus(id,'Approved'); }
        if (act==='pay')     { closeModal(); updateRunStatus(id,'Paid'); }
        if (act==='edit')    { closeModal(); openRunForm(r); }
      });
    });

    document.getElementById('ps-export').addEventListener('click', function(){ exportPayslipCSV(r); });
  }

  // ── Export CSV ────────────────────────────────────────────────
  function exportPayslipCSV(r) {
    var rows = [
      ['Field','Value'],
      ['Employee',r.employee_name||userName(r.employee_id)],
      ['Pay Period',periodLabel(r.period_start,r.period_end)],
      ['Pay Type',r.pay_type||''],
      ['Status',r.status||''],
      ['',''],
      ['Base Salary',calcGross({gross_salary:r.gross_salary,bonus:0,overtime_pay:0,extra_pay:0})],
      ['Overtime Pay',r.overtime_pay||0],
      ['Bonus',r.bonus||0],
      ['Extra Pay',r.extra_pay||0],
      ['Gross Earnings',calcGross(r)],
      ['',''],
      ['Income Tax',r.tax||0],
      ['Health Insurance',r.health_insurance||0],
      ['Pension/401k',r.pension||0],
      ['Other Deductions',r.other_deductions||0],
      ['Total Deductions',calcDeductions(r)],
      ['',''],
      ['NET PAY',calcNet(r)],
    ];
    var csv = rows.map(function(row){ return row.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var blob = new Blob([csv], { type:'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payslip-'+(r.employee_name||r.employee_id||'unknown').replace(/\s+/g,'-')+'-'+( r.period_start||'').replace(/\//g,'-')+'.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Payslip CSV downloaded','success');
  }

  // ── Submit form ───────────────────────────────────────────────
  function submitRunForm(runId) {
    var isEdit = !!runId;
    var empEl  = document.getElementById('prf-emp');
    var empId  = empEl ? empEl.value : myUserId();
    var empName = '';
    if (empEl && empEl.tagName === 'SELECT') {
      var opt = empEl.options[empEl.selectedIndex];
      empName = opt ? opt.text : '';
    } else {
      empName = myName();
    }

    var start = (document.getElementById('prf-start').value||'').trim();
    if (!start) { modalMsg('Period start is required.',false); return; }
    if (!empId) { modalMsg('Please select an employee.',false); return; }

    var otHours = parseFloat(document.getElementById('prf-ot-hours').value)||0;
    var otRate  = parseFloat(document.getElementById('prf-ot-rate').value)||0;
    var otPay   = otHours * otRate;

    var params = {
      employee_id:      empId,
      employee_name:    empName,
      period_start:     start,
      period_end:       (document.getElementById('prf-end').value||''),
      pay_type:         document.getElementById('prf-paytype').value||'Salary',
      gross_salary:     document.getElementById('prf-gross').value||'0',
      overtime_hours:   String(otHours),
      overtime_rate:    String(otRate),
      overtime_pay:     String(otPay),
      bonus:            document.getElementById('prf-bonus').value||'0',
      extra_pay:        document.getElementById('prf-extra').value||'0',
      tax:              document.getElementById('prf-tax').value||'0',
      health_insurance: document.getElementById('prf-health').value||'0',
      pension:          document.getElementById('prf-pension').value||'0',
      other_deductions: document.getElementById('prf-other-ded').value||'0',
      notes:            document.getElementById('prf-notes').value||'',
      status:           isEdit ? (runsCache.find(function(r){return r.id===runId;})||{}).status||'Draft' : 'Draft',
    };
    if (!isEdit) { params.id = genId('PR'); params.created_by = myUserId(); }
    else          params.id = runId;

    // Validation
    var gross = calcGross(params);
    var net   = calcNet(params);
    if (net < 0 && !confirm('Net pay is negative ('+fmtMoney(net)+'). Save anyway?')) return;

    // Duplicate detection (same employee + same period)
    if (!isEdit) {
      var dup = runsCache.find(function(r){
        return r.employee_id===empId && r.period_start===start && r.status!=='Void';
      });
      if (dup && !confirm('A pay run for this employee and period already exists ('+dup.id+'). Create another?')) return;
    }

    var btn = document.getElementById('prf-save');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving…'; }

    api(isEdit ? 'payroll/runs/update' : 'payroll/runs/create', params)
      .then(function(){
        toast(isEdit?'Pay run updated!':'Pay run created!','success');
        closeModal();
        loadData();
      })
      .catch(function(e){
        modalMsg(e.message, false);
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save mr-1.5 text-xs"></i>'+(isEdit?'Save Changes':'Create Pay Run'); }
      });
  }

  // ── Status actions ────────────────────────────────────────────
  function updateRunStatus(id, status) {
    var params = { id:id, status:status };
    if (status==='Approved'||status==='Paid') params.approved_by = myUserId();
    api('payroll/runs/update', params)
      .then(function(){
        var run = runsCache.find(function(r){ return r.id===id; });
        if (run) run.status = status;
        toast(status==='Paid'?'Marked as paid!':status==='Approved'?'Run approved!':status==='Void'?'Run voided.':'Status updated.', status==='Void'?'warning':'success');
        loadData();
      })
      .catch(function(e){ toast(e.message,'error'); });
  }

  // ── Boot ──────────────────────────────────────────────────────
  var old = document.getElementById(MODAL_ID);
  if (old) old.innerHTML = '';
  render();
};
