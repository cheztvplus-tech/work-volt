window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['payroll'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var runsCache   = [];
  var empCache    = [];
  var usersCache  = [];
  var tsCache     = [];
  var auditCache  = [];
  var activeView  = sessionStorage.getItem('pr_view') || 'runs';
  var filters     = { status: '', employee_id: '', period: '' };
  var _searchVal  = '';
  var _searchTimer = null;
  var sortState   = { col: 'period_start', dir: 'desc' };
  var _liveTotal  = 0;

  // ── Constants ─────────────────────────────────────────────────
  var STATUSES   = ['Draft', 'Pending', 'Approved', 'Paid', 'Rejected', 'Void'];
  var PAY_TYPES  = ['Hourly', 'Salary', 'Contract'];

  var STATUS_CFG = {
    'Draft':    { bg:'bg-slate-100',   text:'text-slate-600',  icon:'fa-pencil',         dot:'#94a3b8', border:'border-l-slate-300' },
    'Pending':  { bg:'bg-amber-100',   text:'text-amber-700',  icon:'fa-hourglass-half', dot:'#f59e0b', border:'border-l-amber-400' },
    'Approved': { bg:'bg-green-100',   text:'text-green-700',  icon:'fa-check-circle',   dot:'#16a34a', border:'border-l-green-500' },
    'Paid':     { bg:'bg-blue-100',    text:'text-blue-700',   icon:'fa-dollar-sign',    dot:'#2563eb', border:'border-l-blue-500'  },
    'Rejected': { bg:'bg-red-100',     text:'text-red-700',    icon:'fa-times-circle',   dot:'#ef4444', border:'border-l-red-400'   },
    'Void':     { bg:'bg-red-100',     text:'text-red-600',    icon:'fa-ban',            dot:'#dc2626', border:'border-l-red-500'   },
  };

  // ── Role helpers ──────────────────────────────────────────────
  function getRole()    { try { return window.WorkVolt.user().role || 'Employee'; } catch(e) { return 'Employee'; } }
  function isAdmin()    { return ['SuperAdmin','Admin','Manager'].includes(getRole()); }
  function isPayAdmin() { return ['SuperAdmin','Admin'].includes(getRole()); }
  function myUserId()   { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } }
  function myName()     { try { return window.WorkVolt.user().name    || ''; } catch(e) { return ''; } }

  // ── API ───────────────────────────────────────────────────────
  // Routed through WorkVoltDB — no GAS dependency
  function api(path, params) {
    params = params || {};
    var db = window.WorkVolt.db;
    var id = params.id;
    var rest = Object.assign({}, params);
    delete rest.id;

    // ── Payroll runs ──────────────────────────────────────────
    if (path === 'payroll/runs/list')
      return db.list('payroll_runs', {}, { order: 'period_start' }).then(function(r){ return { rows: r }; });
    if (path === 'payroll/runs/create')
      return db.create('payroll_runs', Object.assign({}, params, { created_at: new Date().toISOString() }));
    if (path === 'payroll/runs/update')
      return db.update('payroll_runs', id, rest);

    // ── Payroll employees ─────────────────────────────────────
    if (path === 'payroll/employees/list')
      return db.list('payroll_employees', {}, { order: 'created_at' }).then(function(r){ return { rows: r }; });

    // ── Audit log ─────────────────────────────────────────────
    if (path === 'payroll/audit/list')
      return db.list('payroll_audit', {}, { order: 'created_at' }).then(function(r){ return { rows: r }; });

    // ── Users ─────────────────────────────────────────────────
    if (path === 'users/list')
      return db.list('users', {}, { order: 'name', asc: true }).then(function(r){ return { rows: r }; });

    // ── Timesheets ────────────────────────────────────────────
    if (path === 'timesheets/list')
      return db.list('timesheets', {}, { order: 'date' }).then(function(r){ return { rows: r }; });

    // ── Config ────────────────────────────────────────────────
    if (path === 'config/get-all')
      return db.config.getAll().then(function(settings){ return { settings: settings }; });
    if (path === 'config/set')
      return db.config.set(params.key, params.value);

    return Promise.reject(new Error('No API handler for: ' + path));
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
  function fmtDateTime(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); }
    catch(e) { return d; }
  }
  function genId(prefix) {
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    return prefix ? prefix + '-' + uuid : uuid;
  }

  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type||'info');
  }
  function userName(uid) {
    if (!uid) return '—';
    var u = usersCache.find(function(u){ return u.user_id===uid||u.id===uid; });
    return u ? (u.name||u.email||uid) : uid;
  }
  function userInitial(uid) { return (userName(uid)||'?').charAt(0).toUpperCase(); }
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

  // ── Tax config (loaded from admin settings) ───────────────────
  var _taxCfg = null;

  var _TAX_DEFAULTS = {
    USA: {
      country:'USA', tax_calculation_enabled:false, pay_periods_per_year:26,
      federal_use_brackets:true, federal_flat_rate:22,
      fica_ss_rate:6.2, fica_medicare_rate:1.45, additional_medicare_rate:0.9,
      state_tax_rate:5, state_tax_label:'State Income Tax',
      local_tax_rate:0, local_tax_label:'Local Tax',
      other_deduction_rate:0, other_deduction_label:'Other Deductions',
      currency:'USD', currency_symbol:'$',
    },
    Canada: {
      country:'Canada', tax_calculation_enabled:false, pay_periods_per_year:26,
      federal_use_brackets:true, federal_flat_rate:20.5,
      cpp_rate:5.95, cpp_max_annual:3867.50,
      ei_rate:1.66,  ei_max_annual:1049.12,
      provincial_tax_rate:9.15, provincial_tax_label:'Provincial Income Tax',
      additional_tax_rate:0, additional_tax_label:'Additional Tax',
      other_deduction_rate:0, other_deduction_label:'Other Deductions',
      currency:'CAD', currency_symbol:'$',
    },
  };

  var _taxVisibleRoles = null; // loaded from config; null = not yet loaded

  function loadTaxConfig() {
    // If settings.js already loaded config this session, use both caches
    if (window.WV_PAYROLL_TAX_CONFIG) {
      _taxCfg = window.WV_PAYROLL_TAX_CONFIG;
      if (window.WV_PAYROLL_TAX_VISIBLE_ROLES) {
        _taxVisibleRoles = window.WV_PAYROLL_TAX_VISIBLE_ROLES;
      }
      return Promise.resolve();
    }
    return api('config/get-all', {})
      .then(function(res) {
        var saved = res.settings && res.settings['payroll_tax_config'];
        if (saved) { try { _taxCfg = JSON.parse(saved); } catch(e) {} }
        var savedRoles = res.settings && res.settings['payroll_tax_visible_roles'];
        if (savedRoles) { try { _taxVisibleRoles = JSON.parse(savedRoles); } catch(e) {} }
      })
      .catch(function() {})
      .then(function() {
        if (!_taxCfg) _taxCfg = Object.assign({}, _TAX_DEFAULTS.USA);
        if (!_taxVisibleRoles) _taxVisibleRoles = ['SuperAdmin', 'Admin'];
        window.WV_PAYROLL_TAX_CONFIG = _taxCfg;
        window.WV_PAYROLL_TAX_VISIBLE_ROLES = _taxVisibleRoles;
      });
  }

  // Can the current user VIEW the tax rates panel?
  function canViewTaxRates() {
    var roles = _taxVisibleRoles || window.WV_PAYROLL_TAX_VISIBLE_ROLES || ['SuperAdmin', 'Admin'];
    return roles.includes(getRole());
  }

  function getTaxCfg() { return _taxCfg || _TAX_DEFAULTS.USA; }

  // Progressive bracket helper
  function _fromBrackets(grossPerPeriod, brackets, payPeriods) {
    var annual = grossPerPeriod * payPeriods, annualTax = 0, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      if (annual <= prev) break;
      annualTax += (Math.min(annual, brackets[i].max) - prev) * brackets[i].rate;
      prev = brackets[i].max;
    }
    return Math.round(annualTax / payPeriods * 100) / 100;
  }

  var _US_BRACKETS = [
    {max:11600,rate:.10},{max:47150,rate:.12},{max:100525,rate:.22},
    {max:191950,rate:.24},{max:243725,rate:.32},{max:609350,rate:.35},{max:Infinity,rate:.37}
  ];
  var _CA_BRACKETS = [
    {max:55867,rate:.15},{max:111733,rate:.205},{max:154906,rate:.26},
    {max:220000,rate:.29},{max:Infinity,rate:.33}
  ];

  // Returns a normalised result object with keys:
  //   federal, fica (SS+Med / CPP+EI), state (state+local / provincial+addl), other, total
  //   + country-specific detail keys for display
  function taxEnabled() {
    var cfg = getTaxCfg();
    // Must be explicitly true — missing/undefined/false all mean disabled
    return cfg.tax_calculation_enabled === true;
  }

  // Returns a zero-tax object when tax calc is disabled by admin
  var ZERO_TAXES = { federal:0, fica:0, state:0, other:0, total:0, cpp:0, ei:0, provincial:0, additional:0, ss:0, medicare:0, addlMed:0, local:0 };

  function estimateTaxes(gross) {
    if (!taxEnabled()) return Object.assign({}, ZERO_TAXES);
    var cfg = getTaxCfg();
    var rnd = function(v){ return Math.round(v*100)/100; };
    var periods = cfg.pay_periods_per_year || 26;

    if (cfg.country === 'Canada') {
      var fed = cfg.federal_use_brackets
        ? _fromBrackets(gross, _CA_BRACKETS, periods)
        : rnd(gross * (cfg.federal_flat_rate||20.5) / 100);

      var cppRate = (cfg.cpp_rate||5.95) / 100;
      var cpp = rnd(Math.min(gross * cppRate, (cfg.cpp_max_annual||3867.50) / periods));
      var eiRate  = (cfg.ei_rate||1.66) / 100;
      var ei  = rnd(Math.min(gross * eiRate,  (cfg.ei_max_annual ||1049.12) / periods));
      var prov  = rnd(gross * (cfg.provincial_tax_rate||9.15) / 100);
      var addl  = rnd(gross * (cfg.additional_tax_rate||0)    / 100);
      var other = rnd(gross * (cfg.other_deduction_rate||0)   / 100);
      return {
        federal: fed, cpp: cpp, ei: ei, provincial: prov, additional: addl, other: other,
        fica: rnd(cpp+ei), state: rnd(prov+addl),          // normalised aliases
        total: rnd(fed + cpp + ei + prov + addl + other),
      };
    } else {
      // USA
      var fed2 = cfg.federal_use_brackets
        ? _fromBrackets(gross, _US_BRACKETS, periods)
        : rnd(gross * (cfg.federal_flat_rate||22) / 100);
      var ss   = rnd(gross * (cfg.fica_ss_rate||6.2) / 100);
      var med  = rnd(gross * (cfg.fica_medicare_rate||1.45) / 100);
      var addlMed = (gross * periods) > 200000
        ? rnd((gross * periods - 200000) * ((cfg.additional_medicare_rate||0.9)/100) / periods)
        : 0;
      var fica2  = rnd(ss + med + addlMed);
      var state2 = rnd(gross * (cfg.state_tax_rate||5) / 100);
      var local  = rnd(gross * (cfg.local_tax_rate||0) / 100);
      var other2 = rnd(gross * (cfg.other_deduction_rate||0) / 100);
      return {
        federal: rnd(fed2), ss: ss, medicare: med, addlMed: addlMed,
        fica: fica2, state: rnd(state2+local), local: local, other: other2,
        total: rnd(fed2 + fica2 + state2 + local + other2),
      };
    }
  }

  function computeRun(p) {
    var hoursReg = parseFloat(p.hours_regular)||0;
    var hoursOT  = parseFloat(p.hours_ot)||0;
    var rate     = parseFloat(p.rate)||0;
    var bonuses  = parseFloat(p.bonuses)||0;
    var ded      = parseFloat(p.deductions)||0;
    var payType  = p.pay_type||'Hourly';
    var gross    = payType==='Salary' ? rate+bonuses : (hoursReg*rate)+(hoursOT*rate*1.5)+bonuses;
    var taxes    = estimateTaxes(gross);
    var rnd      = function(v){ return Math.round(v*100)/100; };
    var net      = rnd(Math.max(0, gross - ded - taxes.total));
    var cfg      = getTaxCfg();
    return {
      hours_regular: rnd(hoursReg), hours_ot: rnd(hoursOT),
      hours_total: rnd(hoursReg+hoursOT), rate: rnd(rate), gross: rnd(gross),
      bonuses: rnd(bonuses), deductions: rnd(ded),
      tax_federal: taxes.federal,
      tax_fica:    taxes.fica,
      tax_state:   taxes.state,
      tax_total:   taxes.total,
      net:         net,
      _taxes:      taxes,        // full breakdown for UI display
      _country:    cfg.country,
      _cfg:        cfg,
    };
  }
  // Legacy helpers for backward-compat with old sheet fields
  function calcGross(r) {
    if (r.gross !== undefined && r.gross !== '') return parseFloat(r.gross)||0;
    return (parseFloat(r.gross_salary)||0)+(parseFloat(r.bonus)||0)+(parseFloat(r.overtime_pay)||0)+(parseFloat(r.extra_pay)||0);
  }
  function calcDeductions(r) {
    var taxOn = taxEnabled();
    if (r.deductions !== undefined && r.deductions !== '') {
      var d = parseFloat(r.deductions)||0;
      var t = taxOn ? (parseFloat(r.tax_total)||parseFloat(r.tax)||0) : 0;
      return d + t;
    }
    var t2 = taxOn ? (parseFloat(r.tax)||0) : 0;
    return t2+(parseFloat(r.health_insurance)||0)+(parseFloat(r.pension)||0)+(parseFloat(r.other_deductions)||0);
  }
  function calcNet(r) {
    // Always recalculate when tax is enabled so deductions are reflected live,
    // regardless of what net value was stored when the run was created with taxes off.
    if (taxEnabled()) return Math.max(0, calcGross(r) - calcDeductions(r));
    if (r.net !== undefined && r.net !== '') return Math.max(0, parseFloat(r.net)||0);
    return Math.max(0, calcGross(r) - calcDeductions(r));
  }
  function isFlagReviewed(r) {
    return String(r.notes||'').indexOf('[flag_reviewed]') !== -1;
  }
  function markFlagReviewed(runId) {
    var r = runsCache.find(function(x){ return x.id===runId; });
    if (!r) return;
    var notes = String(r.notes||'');
    if (notes.indexOf('[flag_reviewed]') !== -1) return;
    var newNotes = notes ? notes+' [flag_reviewed]' : '[flag_reviewed]';
    api('payroll/runs/update', { id: runId, notes: newNotes })
      .then(function() {
        r.notes = newNotes;
        rerender();
      })
      .catch(function(e){ toast('Could not save review: '+e.message, 'error'); });
  }

  function detectAnomaly(run, allRuns) {
    var prev = allRuns.filter(function(r){
      return r.employee_id===run.employee_id && r.id!==run.id && r.status!=='Void' && r.status!=='Rejected';
    }).sort(function(a,b){ return new Date(b.period_start)-new Date(a.period_start); })[0];
    if (!prev) return null;
    var cur = calcNet(run), old = calcNet(prev);
    if (!old) return null;
    var pct = Math.abs((cur-old)/old)*100;
    if (pct>50) return { pct: Math.round(pct), dir: cur>old?'up':'down' };
    return null;
  }
  function hasOvertimeRisk(r) {
    var hrs = parseFloat(r.hours_total||r.overtime_hours)||0;
    if (!hrs) return false;
    // Calculate OT threshold based on pay period length (40hrs per week)
    var weeksInPeriod = 1;
    if (r.period_start && r.period_end) {
      var days = (new Date(r.period_end) - new Date(r.period_start)) / (1000*60*60*24) + 1;
      weeksInPeriod = Math.max(1, Math.round(days / 7));
    }
    return hrs > (40 * weeksInPeriod);
  }

  // ── Badges ────────────────────────────────────────────────────
  function statusBadge(s) {
    var c = STATUS_CFG[s]||STATUS_CFG['Draft'];
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold '+c.bg+' '+c.text+'">'+
      '<i class="fas '+c.icon+' text-[9px]"></i>'+esc(s||'Draft')+'</span>';
  }
  function anomalyBadge(anom) {
    if (!anom) return '';
    return '<span class="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200" title="Pay changed '+anom.pct+'% vs last period">'+
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
    w = w||'720px';
    getPortal().innerHTML =
      '<div id="pr-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto">'+
        '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 80px rgba(0,0,0,.3);width:100%;max-width:'+w+';max-height:92vh;overflow-y:auto;overflow-x:hidden;z-index:9999;position:relative">'+html+'</div>'+
      '</div>';
    document.getElementById('pr-backdrop').addEventListener('click',function(e){if(e.target.id==='pr-backdrop')closeModal();});
  }
  function closeModal() { var p=getPortal(); if(p) p.innerHTML=''; }
  function modalMsg(msg, ok) {
    var el=document.getElementById('pr-msg'); if(!el) return;
    el.innerHTML = msg ? '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium mb-3 '+
      (ok?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-600 border border-red-200')+'">'+
      '<i class="fas '+(ok?'fa-check-circle':'fa-exclamation-circle')+'"></i><span>'+esc(msg)+'</span></div>' : '';
  }
  
  function provisionTables() {
    return Promise.resolve();
  }
  // ── Load data ─────────────────────────────────────────────────
  function loadData() {
    var el = document.getElementById('pr-content');
    if (el) el.innerHTML = '<div class="flex items-center justify-center py-24 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mr-3"></i>Loading payroll…</div>';

    // Provision tables on first load, then continue regardless
    provisionTables().catch(function(){}).then(function() {

    // Load tax config FIRST, then fetch all payroll data — prevents race condition
    // where rerender() runs before tax settings are known (causes country flip + wrong deductions)
    loadTaxConfig().catch(function(){}).then(function() {
      updateCountryBadge();
      return Promise.all([
        api('payroll/runs/list', {}).catch(function(){ return {rows:[]}; }),
        api('payroll/employees/list', {}).catch(function(){ return {rows:[]}; }),
        api('users/list', {}).catch(function(){ return {rows:[]}; }),
        api('timesheets/list', {}).catch(function(){ return {rows:[]}; }),
        api('payroll/audit/list', {}).catch(function(){ return {rows:[]}; }),
      ]);
    }).then(function(res) {
      runsCache  = res[0].rows || [];
      empCache   = res[1].rows || [];
      usersCache = res[2].rows || [];
      tsCache    = res[3].rows || [];
      auditCache = res[4].rows || [];
      var now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      _liveTotal = runsCache
        .filter(function(r){ return (r.status==='Approved'||r.status==='Paid')&&(r.period_start||'')>=monthStart; })
        .reduce(function(s,r){ return s+calcNet(r); }, 0);
      rerender();
    }).catch(function(e) {
      if (el) el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-400"><i class="fas fa-exclamation-triangle text-3xl mb-3 text-amber-400"></i><p class="font-semibold">Could not load payroll</p><p class="text-sm mt-1">'+esc(e.message)+'</p></div>';
    });

    }); // end provisionTables wrapper
  }

  function rerender() {
    var filtered = applyFilters(runsCache.slice());
    var sorted   = applySort(filtered);
    renderStats(filtered);
    renderLiveCounter();
    // Populate tax rates panel for permitted roles (main admin view)
    var taxPanel = document.getElementById('pr-tax-rates-panel');
    if (taxPanel) taxPanel.innerHTML = renderTaxRatesPanel();
    if      (activeView==='employees') renderEmployees();
    else if (activeView==='summary')   renderSummary(filtered);
    else if (activeView==='audit')     renderAudit();
    else                               renderRuns(sorted);
  }

  // ── Filtering + Sorting ───────────────────────────────────────
  function applyFilters(rows) {
    if (!isAdmin()) rows = rows.filter(function(r){ return r.employee_id===myUserId(); });
    if (filters.status)      rows = rows.filter(function(r){ return r.status===filters.status; });
    if (filters.employee_id) rows = rows.filter(function(r){ return r.employee_id===filters.employee_id; });
    if (_searchVal) {
      var q = _searchVal.toLowerCase();
      rows = rows.filter(function(r){
        return (r.employee_name||'').toLowerCase().includes(q)||
               (r.id||'').toLowerCase().includes(q)||
               userName(r.employee_id).toLowerCase().includes(q);
      });
    }
    return rows;
  }
  function applySort(rows) {
    return rows.slice().sort(function(a,b){
      var va=a[sortState.col]||'', vb=b[sortState.col]||'';
      if (sortState.col==='net')          { va=calcNet(a);  vb=calcNet(b); }
      else if (sortState.col==='gross')   { va=calcGross(a); vb=calcGross(b); }
      else if (sortState.col==='period_start') { va=new Date(va||0).getTime(); vb=new Date(vb||0).getTime(); }
      else { va=String(va).toLowerCase(); vb=String(vb).toLowerCase(); }
      return (sortState.dir==='desc'?-1:1)*(va<vb?-1:va>vb?1:0);
    });
  }

  // ── Stats bar ─────────────────────────────────────────────────
  function renderStats(rows) {
    var el = document.getElementById('pr-stats'); if (!el) return;
    var totalNet  = rows.reduce(function(s,r){ return s+calcNet(r); }, 0);
    var pending   = rows.filter(function(r){ return r.status==='Pending'||r.status==='Draft'; });
    var paid      = rows.filter(function(r){ return r.status==='Paid'; });
    var anomalies = rows.filter(function(r){ return (detectAnomaly(r,runsCache)||hasOvertimeRisk(r)) && !isFlagReviewed(r); });
    function card(icon, iconCls, label, val, sub, alert) {
      return '<div class="bg-white border '+(alert?'border-red-300 bg-red-50/40':'border-slate-200')+' rounded-xl px-4 py-3 flex items-center gap-3">'+
        '<div class="w-9 h-9 '+iconCls+' rounded-xl flex items-center justify-center flex-shrink-0"><i class="fas '+icon+' text-sm"></i></div>'+
        '<div><p class="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">'+label+'</p>'+
        '<p class="text-xl font-black text-slate-900 leading-none mt-0.5">'+val+'</p>'+
        (sub?'<p class="text-[10px] text-slate-400 mt-0.5">'+sub+'</p>':'')+
        '</div></div>';
    }
    el.innerHTML =
      card('fa-dollar-sign','bg-emerald-100 text-emerald-600','Total Net Pay',fmtMoney(totalNet,0),rows.length+' run'+(rows.length!==1?'s':'')) +
      card('fa-hourglass-half','bg-amber-100 text-amber-600','Awaiting Action',pending.length,pending.length?'need review':'all clear',pending.length>0) +
      card('fa-check-circle','bg-blue-100 text-blue-600','Paid',paid.length+' runs',paid.length?fmtMoney(paid.reduce(function(s,r){return s+calcNet(r);},0),0)+' paid':'') +
      card('fa-exclamation-triangle','bg-red-100 text-red-500','Anomalies',anomalies.length+' flagged',anomalies.length?'review recommended':'none detected',anomalies.length>0);
  }
  function renderLiveCounter() {
    var el = document.getElementById('pr-live-total');
    if (el) el.textContent = fmtMoney(_liveTotal, 0);
  }
  function updateCountryBadge() {
    var el = document.getElementById('pr-country-badge');
    if (!el) return;
    var cfg = getTaxCfg();
    el.textContent = cfg.country === 'Canada' ? '🇨🇦 CA' : '🇺🇸 US';
    el.title = cfg.country === 'Canada'
      ? 'Canada — CPP/EI/Provincial rates active'
      : 'USA — IRS/FICA/State rates active';
  }

  // ── Tax Rates Info Panel (read-only, role-gated) ──────────────
  // Returns HTML string of a clean info card showing the configured rates.
  // Admins see an "Edit in Settings" link; other permitted roles see read-only.
  function renderTaxRatesPanel() {
    var cfg = getTaxCfg();
    if (!cfg || cfg.tax_calculation_enabled === false) return '';
    var isCA  = cfg.country === 'Canada';
    var admin = isAdmin();
    var yr    = new Date().getFullYear();

    function rateRow(label, value, unit) {
      unit = unit || '%';
      if (!value && value !== 0) return '';
      var v = parseFloat(value);
      if (!v && v !== 0) return '';
      return (
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid #f1f5f9">' +
          '<span style="font-size:.75rem;color:#64748b">' + label + '</span>' +
          '<span style="font-size:.75rem;font-weight:700;color:#1e293b;font-family:monospace">' +
            (unit === '%' ? v.toFixed(2) + '%' : unit + v.toFixed(2)) +
          '</span>' +
        '</div>'
      );
    }

    var ratesHtml = '';
    if (isCA) {
      ratesHtml = (
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">' +
          '<div>' +
            '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">Federal (CRA ' + yr + ')</p>' +
            rateRow(cfg.federal_use_brackets ? 'Progressive brackets' : 'Flat rate', cfg.federal_use_brackets ? null : cfg.federal_flat_rate) +
            (cfg.federal_use_brackets ? '<div style="font-size:.7rem;color:#60a5fa;font-weight:600;padding:.35rem 0">15% – 33% brackets</div>' : '') +
            rateRow('Pay periods / year', cfg.pay_periods_per_year, 'x ') +
          '</div>' +
          '<div>' +
            '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">CPP & EI</p>' +
            rateRow('CPP rate', cfg.cpp_rate) +
            rateRow('CPP max/year', cfg.cpp_max_annual, '$') +
            rateRow('EI rate', cfg.ei_rate) +
            rateRow('EI max/year', cfg.ei_max_annual, '$') +
          '</div>' +
          '<div>' +
            '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">' + (cfg.provincial_tax_label || 'Provincial Tax') + '</p>' +
            rateRow(cfg.provincial_tax_label || 'Provincial', cfg.provincial_tax_rate) +
            (parseFloat(cfg.additional_tax_rate || 0) ? rateRow(cfg.additional_tax_label || 'Additional', cfg.additional_tax_rate) : '') +
          '</div>' +
          (parseFloat(cfg.other_deduction_rate || 0) ?
            '<div>' +
              '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">' + (cfg.other_deduction_label || 'Other') + '</p>' +
              rateRow(cfg.other_deduction_label || 'Auto-deduction', cfg.other_deduction_rate) +
            '</div>' : '') +
        '</div>'
      );
    } else {
      ratesHtml = (
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">' +
          '<div>' +
            '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">Federal (IRS ' + yr + ')</p>' +
            (cfg.federal_use_brackets ? '<div style="font-size:.7rem;color:#60a5fa;font-weight:600;padding:.35rem 0">10% – 37% brackets</div>' : rateRow('Flat rate', cfg.federal_flat_rate)) +
            rateRow('Pay periods / year', cfg.pay_periods_per_year, 'x ') +
          '</div>' +
          '<div>' +
            '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">FICA</p>' +
            rateRow('Social Security', cfg.fica_ss_rate) +
            rateRow('Medicare', cfg.fica_medicare_rate) +
            rateRow('Addl. Medicare (>$200k)', cfg.additional_medicare_rate) +
          '</div>' +
          '<div>' +
            '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">' + (cfg.state_tax_label || 'State & Local') + '</p>' +
            rateRow(cfg.state_tax_label || 'State', cfg.state_tax_rate) +
            (parseFloat(cfg.local_tax_rate || 0) ? rateRow(cfg.local_tax_label || 'Local', cfg.local_tax_rate) : '') +
          '</div>' +
          (parseFloat(cfg.other_deduction_rate || 0) ?
            '<div>' +
              '<p style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:.4rem">' + (cfg.other_deduction_label || 'Other') + '</p>' +
              rateRow(cfg.other_deduction_label || 'Auto-deduction', cfg.other_deduction_rate) +
            '</div>' : '') +
        '</div>'
      );
    }

    return (
      '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:1rem;overflow:hidden;margin-bottom:.75rem">' +
        // Header
        '<div style="padding:.625rem 1rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">' +
          '<div style="display:flex;align-items:center;gap:.5rem">' +
            '<div style="width:1.75rem;height:1.75rem;background:#ecfdf5;border-radius:.5rem;display:flex;align-items:center;justify-content:center">' +
              '<i class="fas fa-percent" style="font-size:.6rem;color:#10b981"></i>' +
            '</div>' +
            '<span style="font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Tax Rates</span>' +
            '<span style="font-size:.65rem;font-weight:700;padding:.15rem .5rem;border-radius:9999px;background:' + (isCA ? '#fee2e2' : '#dbeafe') + ';color:' + (isCA ? '#b91c1c' : '#1d4ed8') + '">' +
              (isCA ? '🇨🇦 Canada' : '🇺🇸 USA') +
            '</span>' +
          '</div>' +
          (admin ?
            '<a href="#" onclick="if(window.settingsTab)window.settingsTab(&apos;modules&apos;);return false;" style="font-size:.7rem;font-weight:700;color:#10b981;text-decoration:none;display:flex;align-items:center;gap:.25rem">' +
              '<i class="fas fa-external-link-alt" style="font-size:.6rem"></i>Edit in Settings' +
            '</a>'
          :
            '<span style="font-size:.65rem;color:#94a3b8;font-style:italic">Read-only · Set by Admin</span>'
          ) +
        '</div>' +
        // Rates grid
        '<div style="padding:1rem">' +
          ratesHtml +
          '<p style="font-size:.65rem;color:#94a3b8;margin-top:.75rem;padding-top:.5rem;border-top:1px solid #f1f5f9">' +
            '<i class="fas fa-info-circle" style="margin-right:.25rem"></i>' +
            'These rates are applied automatically to every pay run. Contact your admin to request changes.' +
          '</p>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Main Shell ────────────────────────────────────────────────
  function render() {
    var empOpts = isAdmin()
      ? '<option value="">All Employees</option>' + usersCache.map(function(u){
          var uid=u.user_id||u.id;
          return '<option value="'+esc(uid)+'"'+(filters.employee_id===uid?' selected':'')+'>'+esc(u.name||u.email||uid)+'</option>';
        }).join('')
      : '';

    var VIEWS = [
      ['runs','fa-list-alt','Pay Runs'],
      ['employees','fa-users','Employees'],
      ['summary','fa-chart-bar','Summary'],
      ['audit','fa-history','Audit Log'],
    ];
    // Non-admins skip audit + employees views
    var visibleViews = isAdmin() ? VIEWS : VIEWS.slice(0,1);

    container.innerHTML =
      '<style>'+
        '.pr-section{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;overflow:hidden;margin-bottom:.75rem}'+
        '.pr-section-head{padding:.625rem 1rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:.5rem}'+
        '.pr-field label{display:block;font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem}'+
        '.pr-input{width:100%;padding:.5rem .75rem;border:1.5px solid #e2e8f0;border-radius:.625rem;font-size:.875rem;color:#1e293b;outline:none;font-family:inherit;background:#fff;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}'+
        '.pr-input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.12)}'+
        '.pr-input[readonly]{background:#f8fafc;color:#64748b;cursor:default}'+
        '.pr-input.error{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.1)}'+
        '.pr-calc{background:#f0fdf4;color:#064e3b;font-weight:700}'+
        '.net-pay-hero{background:linear-gradient(135deg,#064e3b,#065f46);border-radius:1rem;padding:1.25rem 1.5rem;color:#fff;display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem}'+
        '.net-pay-hero .amount{font-size:2.25rem;font-weight:900;letter-spacing:-.03em;line-height:1}'+
        '.pr-warn{display:flex;align-items:start;gap:.5rem;padding:.625rem .875rem;border-radius:.625rem;font-size:.75rem;font-weight:600;margin-bottom:.5rem}'+
        '.pr-warn.red{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b}'+
        '.pr-warn.amber{background:#fffbeb;border:1px solid #fcd34d;color:#92400e}'+
        '.pr-warn.blue{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}'+
        '.pr-tax-row{display:flex;justify-content:space-between;align-items:center;padding:.375rem 0;border-bottom:1px solid #f1f5f9;font-size:.75rem}'+
        '.pr-tax-row:last-child{border:none}'+
        '.sticky-header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:2px solid #e2e8f0;padding:.875rem 1.25rem;border-radius:1rem 1rem 0 0}'+
      '</style>'+

      '<div class="flex flex-col h-full" style="font-family:\'DM Sans\',sans-serif">'+

        // ── Header
        '<div class="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">'+
          '<div class="flex items-center justify-between gap-4 mb-3">'+
            '<div class="flex items-center gap-3">'+
              '<div class="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center"><i class="fas fa-money-bill-wave text-emerald-600 text-sm"></i></div>'+
              '<div>'+
                '<h1 class="text-xl font-extrabold text-slate-900 tracking-tight">Payroll</h1>'+
                '<p class="text-xs text-slate-400">Pay runs · approvals · employee compensation</p>'+
              '</div>'+
            '</div>'+
            '<div class="flex items-center gap-2">'+
              '<div class="hidden md:flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">'+
                '<span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>'+
                '<span class="text-xs font-semibold text-slate-500">Month payroll:</span>'+
                '<span id="pr-live-total" class="text-sm font-extrabold text-emerald-700">—</span>'+
              '</div>'+
              '<span id="pr-country-badge" class="hidden md:inline-flex items-center px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 cursor-default" title="Tax region">🇺🇸 US</span>'+
              (isPayAdmin()?'<button id="pr-run-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-white border-none cursor-pointer" style="background:#10b981"><i class="fas fa-plus text-[10px]"></i>New Pay Run</button>':'') +
              (isPayAdmin()?'<button id="pr-bulk-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 cursor-pointer"><i class="fas fa-bolt text-[10px]"></i>Bulk Run</button>':'') +
              (canViewTaxRates()?'<button id="pr-tax-settings-btn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 cursor-pointer"><i class="fas fa-sliders-h text-[10px]"></i>Tax Settings</button>':'') +
            '</div>'+
          '</div>'+
          '<div id="pr-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3"></div>'+
          (canViewTaxRates() ? '<div id="pr-tax-rates-panel" class="mb-3"></div>' : '')+
          '<div class="flex items-center gap-2 flex-wrap">'+
            '<div class="relative flex-1 min-w-[150px] max-w-xs">'+
              '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none"></i>'+
              '<input id="pr-search" type="text" placeholder="Search employee or run ID…" value="'+esc(_searchVal)+'" class="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:border-emerald-400" style="font-family:inherit">'+
            '</div>'+
            '<select id="pr-filter-status" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-emerald-400" style="font-family:inherit">'+
              '<option value="">All Statuses</option>'+
              STATUSES.map(function(s){ return '<option value="'+s+'"'+(filters.status===s?' selected':'')+'>'+s+'</option>'; }).join('')+
            '</select>'+
            (isAdmin()?'<select id="pr-filter-emp" class="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-600 focus:outline-none focus:border-emerald-400" style="font-family:inherit">'+empOpts+'</select>':'') +
            '<div class="flex-1"></div>'+
            '<div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1">'+
              visibleViews.map(function(v){
                return '<button data-view="'+v[0]+'" class="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold transition-all '+
                  (activeView===v[0]?'bg-white shadow-sm text-emerald-600':'text-slate-500 hover:text-slate-700')+'">'+
                  '<i class="fas '+v[1]+' text-[10px]"></i>'+v[2]+'</button>';
              }).join('')+
            '</div>'+
          '</div>'+
        '</div>'+

        '<div id="pr-content" class="flex-1 overflow-y-auto px-6 py-4"></div>'+
      '</div>';

    // Bind toolbar
    document.getElementById('pr-search').addEventListener('input', function(){
      clearTimeout(_searchTimer);
      var v = this.value;
      _searchTimer = setTimeout(function(){ _searchVal=v; rerender(); }, 280);
    });
    document.getElementById('pr-filter-status').addEventListener('change', function(){ filters.status=this.value; rerender(); });
    var fe = document.getElementById('pr-filter-emp');
    if (fe) fe.addEventListener('change', function(){ filters.employee_id=this.value; rerender(); });
    document.querySelectorAll('[data-view]').forEach(function(btn){
      btn.addEventListener('click', function(){
        activeView=this.dataset.view;
        sessionStorage.setItem('pr_view',activeView);
        render();
      });
    });
    var rb = document.getElementById('pr-run-btn');
    if (rb) rb.addEventListener('click', function(){ openRunForm(null); });
    var bb = document.getElementById('pr-bulk-btn');
    if (bb) bb.addEventListener('click', openBulkRunModal);
    var tb = document.getElementById('pr-tax-settings-btn');
    if (tb) tb.addEventListener('click', openTaxSettingsModal);

    loadData();
  }

  // ── Pay Runs List ─────────────────────────────────────────────
  function renderRuns(rows) {
    var el = document.getElementById('pr-content'); if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-slate-300"><i class="fas fa-money-check-alt text-5xl mb-4 opacity-30"></i><p class="font-semibold text-slate-500">No pay runs found</p>'+(isPayAdmin()?'<button onclick="document.getElementById(\'pr-run-btn\').click()" class="mt-4 px-4 py-2 text-sm font-bold text-white rounded-xl border-none cursor-pointer" style="background:#10b981">Create First Pay Run</button>':'')+' </div>';
      return;
    }

    // ── Employee self-view (non-admin) — card-based breakdown
    if (!isAdmin()) {
      renderSelfView(rows);
      return;
    }

    function th(col, lbl) {
      var active=sortState.col===col;
      return '<th class="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap" data-sort="'+col+'">'+
        '<span class="flex items-center gap-1">'+lbl+'<i class="fas '+(active?(sortState.dir==='asc'?'fa-sort-up':'fa-sort-down'):'fa-sort')+' text-[9px] '+(active?'text-emerald-500':'text-slate-300')+'"></i></span></th>';
    }

    var html =
      '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">'+
      '<table class="w-full text-sm border-collapse">'+
      '<thead class="bg-slate-50 border-b border-slate-200"><tr>'+
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Employee</th>'+
        th('period_start','Pay Period')+
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Earnings</th>'+
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Taxes & Ded.</th>'+
        th('net','Net Pay')+
        th('status','Status')+
        '<th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>'+
      '</tr></thead><tbody>';

    rows.forEach(function(r) {
      var gross = calcGross(r), ded = calcDeductions(r), net = calcNet(r);
      var anom  = detectAnomaly(r, runsCache);
      var cfg   = STATUS_CFG[r.status]||STATUS_CFG['Draft'];
      var canEdit    = isPayAdmin() && r.status!=='Paid' && r.status!=='Void';
      var canApprove = isPayAdmin() && r.status==='Pending';
      var canPay     = isPayAdmin() && r.status==='Approved';
      var otRisk     = hasOvertimeRisk(r);
      var netColor   = (r.status==='Approved'||r.status==='Paid')?'text-emerald-700':net<0?'text-red-600':'text-slate-900';

      html += '<tr class="border-t border-slate-100 hover:bg-emerald-50/20 transition-colors group cursor-pointer pr-row border-l-4 '+cfg.border+'" data-id="'+esc(r.id)+'">'+
        '<td class="px-4 py-3">'+
          '<div class="flex items-center gap-2">'+
            userAvatar(r.employee_id,'w-7 h-7 text-[11px]')+
            '<div>'+
              '<div class="text-xs font-bold text-slate-900 leading-snug">'+esc(r.employee_name||userName(r.employee_id))+'</div>'+
              '<div class="text-[10px] font-mono text-slate-400">'+esc(r.id)+'</div>'+
            '</div>'+
          '</div>'+
        '</td>'+
        '<td class="px-4 py-3 whitespace-nowrap">'+
          '<div class="text-xs font-bold text-slate-800">'+esc(periodLabel(r.period_start,r.period_end))+'</div>'+
          (r.pay_type?'<div class="text-[10px] text-slate-400">'+esc(r.pay_type)+'</div>':'')+
          (otRisk&&!isFlagReviewed(r)?'<div class="flex items-center gap-1 mt-0.5"><span class="text-[10px] text-orange-600 font-bold"><i class="fas fa-clock mr-0.5 text-[9px]"></i>OT flagged</span><button class="pr-flag-review text-[9px] font-bold text-orange-600 border border-orange-300 bg-orange-50 hover:bg-orange-100 rounded px-1.5 py-px cursor-pointer ml-1" data-id="'+esc(r.id)+'" title="Mark as reviewed">Reviewed</button></div>':'')+ 
        '</td>'+
        '<td class="px-4 py-3 whitespace-nowrap">'+
          '<div class="text-sm font-bold text-slate-900">'+fmtMoney(gross)+'</div>'+
          '<div class="text-[10px] text-slate-400 mt-0.5">'+
            (parseFloat(r.hours_total||r.overtime_hours||0)?fmtHours(r.hours_total||r.overtime_hours||0)+' hrs · ':'')+
            (parseFloat(r.rate||0)?fmtMoney(r.rate)+'/hr':'')+
          '</div>'+
          (parseFloat(r.bonuses||r.bonus)?'<div class="text-[10px] text-emerald-600 font-semibold">+Bonus '+fmtMoney(r.bonuses||r.bonus)+'</div>':'')+
        '</td>'+
        '<td class="px-4 py-3 whitespace-nowrap">'+
          '<div class="text-sm font-bold text-red-500">-'+fmtMoney(ded)+'</div>'+
          '<div class="text-[10px] text-slate-400 mt-0.5">'+
            (taxEnabled()&&parseFloat(r.tax_total||r.tax)?'Tax '+fmtMoney(r.tax_total||r.tax):'')+
          '</div>'+
        '</td>'+
        '<td class="px-4 py-3 whitespace-nowrap">'+
          '<div class="text-base font-extrabold '+netColor+'">'+fmtMoney(net)+'</div>'+
          (anom&&!isFlagReviewed(r)?'<div class="flex items-center gap-1 mt-0.5">'+anomalyBadge(anom)+'<button class="pr-flag-review text-[9px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded px-1.5 py-px cursor-pointer ml-1" data-id="'+esc(r.id)+'" title="Mark as reviewed">Reviewed</button></div>':'')+ 
          (net<0?'<div class="text-[10px] text-red-600 font-bold mt-0.5"><i class="fas fa-exclamation-triangle mr-0.5"></i>Net &lt; 0</div>':'')+
        '</td>'+
        '<td class="px-4 py-3 whitespace-nowrap">'+statusBadge(r.status||'Draft')+'</td>'+
        '<td class="px-4 py-3 whitespace-nowrap">'+
          '<div class="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">'+
            (canEdit?'<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-blue-50 hover:text-blue-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="edit" data-id="'+esc(r.id)+'" title="Edit"><i class="fas fa-pencil text-xs"></i></button>':'')+
            (r.status==='Draft'&&isPayAdmin()?'<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-amber-50 hover:text-amber-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="submit" data-id="'+esc(r.id)+'" title="Submit for Approval"><i class="fas fa-paper-plane text-xs"></i></button>':'')+
            (canApprove?'<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-green-50 hover:text-green-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="approve" data-id="'+esc(r.id)+'" title="Approve"><i class="fas fa-check text-xs"></i></button>':'')+
            (canPay?'<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-blue-50 hover:text-blue-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="pay" data-id="'+esc(r.id)+'" title="Mark Paid"><i class="fas fa-dollar-sign text-xs"></i></button>':'')+
            '<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-purple-50 hover:text-purple-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="payslip" data-id="'+esc(r.id)+'" title="View Payslip"><i class="fas fa-file-alt text-xs"></i></button>'+
            (isPayAdmin()?'<button class="pr-act w-7 h-7 rounded-lg border-none bg-transparent hover:bg-red-50 hover:text-red-600 text-slate-400 cursor-pointer flex items-center justify-center" data-action="void" data-id="'+esc(r.id)+'" title="Void"><i class="fas fa-ban text-xs"></i></button>':'')+
          '</div>'+
        '</td>'+
      '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('[data-sort]').forEach(function(th){
      th.addEventListener('click', function(){
        var col=this.dataset.sort;
        sortState = { col:col, dir:(sortState.col===col&&sortState.dir==='asc'?'desc':'asc') };
        rerender();
      });
    });
    el.querySelectorAll('.pr-row').forEach(function(row){
      row.addEventListener('click', function(e){
        if (e.target.closest('.pr-act')) return;
        if (e.target.closest('.pr-flag-review')) return;
        var run = runsCache.find(function(r){ return r.id===this.dataset.id; }.bind(this));
        if (run) openPayslip(run);
      });
    });
    el.querySelectorAll('.pr-flag-review').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        markFlagReviewed(this.dataset.id);
      });
    });
    el.querySelectorAll('.pr-act').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id=this.dataset.id, act=this.dataset.action;
        var run=runsCache.find(function(r){ return r.id===id; });
        if (act==='edit')    openRunForm(run);
        if (act==='submit')  updateRunStatus(id,'Pending');
        if (act==='approve') updateRunStatus(id,'Approved');
        if (act==='pay')     updateRunStatus(id,'Paid');
        if (act==='payslip') openPayslip(run);
        if (act==='void')    { if(confirm('Void this pay run? This cannot be undone.')) updateRunStatus(id,'Void'); }
      });
    });
  }

  // ── Employee Self-View ────────────────────────────────────────
  function renderSelfView(rows) {
    var el = document.getElementById('pr-content'); if (!el) return;
    var sorted = rows.slice().sort(function(a,b){ return new Date(b.period_start)-new Date(a.period_start); });
    var latest = sorted[0];
    var totalPaid = sorted.filter(function(r){ return r.status==='Paid'; }).reduce(function(s,r){ return s+calcNet(r); }, 0);
    var ytd = sorted.filter(function(r){
      var y = new Date().getFullYear();
      return r.period_start && new Date(r.period_start).getFullYear()===y && r.status==='Paid';
    }).reduce(function(s,r){ return s+calcNet(r); }, 0);

    var html = '<div class="max-w-2xl mx-auto space-y-4">';

    // Personal summary hero
    html += '<div class="bg-gradient-to-br from-slate-900 to-emerald-950 rounded-2xl p-6 text-white">'+
      '<p class="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">My Payroll</p>'+
      '<div class="flex items-end gap-4">'+
        '<div><p class="text-sm opacity-70">YTD Take-Home</p><p class="text-4xl font-black">'+fmtMoney(ytd,0)+'</p></div>'+
        '<div class="ml-auto text-right"><p class="text-sm opacity-70">Lifetime Paid</p><p class="text-xl font-bold">'+fmtMoney(totalPaid,0)+'</p></div>'+
      '</div>'+
    '</div>';

    // Latest payslip breakdown
    if (latest) {
      var g=calcGross(latest), d=calcDeductions(latest), n=calcNet(latest);
      html += '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">'+
        '<div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">'+
          '<div><p class="font-bold text-slate-900">Latest Pay Run</p>'+
          '<p class="text-xs text-slate-400">'+esc(periodLabel(latest.period_start,latest.period_end))+'</p></div>'+
          statusBadge(latest.status)+
        '</div>'+
        '<div class="p-5 grid grid-cols-3 gap-3 border-b border-slate-100">'+
          '<div class="text-center"><p class="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Gross</p><p class="text-xl font-black text-slate-900">'+fmtMoney(g,0)+'</p></div>'+
          '<div class="text-center border-x border-slate-100"><p class="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Deductions</p><p class="text-xl font-black text-red-500">-'+fmtMoney(d,0)+'</p></div>'+
          '<div class="text-center"><p class="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Net Pay</p><p class="text-xl font-black text-emerald-700">'+fmtMoney(n,0)+'</p></div>'+
        '</div>'+
        // Breakdown rows
        '<div class="px-5 py-3 space-y-0.5">'+
          _lineItem('Base / Rate', fmtMoney(parseFloat(latest.gross_salary||latest.gross)||0), '')+
          (parseFloat(latest.hours_total||latest.overtime_hours||0)?_lineItem('Hours', fmtHours(latest.hours_total||latest.overtime_hours||0)+' total', ''):'') +
          (parseFloat(latest.bonuses||latest.bonus)?_lineItem('Bonus', '+'+fmtMoney(latest.bonuses||latest.bonus), 'text-emerald-600'):'') +
          '<div class="border-t border-slate-100 mt-2 pt-2">'+
          (taxEnabled()&&parseFloat(latest.tax_federal||0)?_lineItem('Federal Tax', '-'+fmtMoney(latest.tax_federal), 'text-red-500'):'') +
          (taxEnabled()&&parseFloat(latest.tax_fica||0)?_lineItem('FICA (SS + Medicare)', '-'+fmtMoney(latest.tax_fica), 'text-red-500'):'') +
          (taxEnabled()&&parseFloat(latest.tax_state||0)?_lineItem('State Tax', '-'+fmtMoney(latest.tax_state), 'text-red-500'):'') +
          (parseFloat(latest.deductions||latest.other_deductions||0)?_lineItem('Other Deductions', '-'+fmtMoney(latest.deductions||latest.other_deductions||0), 'text-red-500'):'') +
          '</div>'+
        '</div>'+
        '<div class="px-5 py-4 bg-emerald-50 flex items-center justify-between border-t border-emerald-100">'+
          '<span class="text-sm font-extrabold text-emerald-800 uppercase tracking-wide">Net Pay</span>'+
          '<span class="text-2xl font-black text-emerald-700">'+fmtMoney(n)+'</span>'+
        '</div>'+
        '<div class="px-5 py-3 flex gap-2">'+
          '<button class="pr-payslip-btn flex-1 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 bg-white cursor-pointer" data-id="'+esc(latest.id)+'"><i class="fas fa-eye mr-1.5"></i>View Full Payslip</button>'+
          '<button class="pr-export-btn flex-1 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 bg-white cursor-pointer" data-id="'+esc(latest.id)+'"><i class="fas fa-download mr-1.5"></i>Export CSV</button>'+
        '</div>'+
      '</div>';
    }

    // History table
    html += '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">'+
      '<div class="px-5 py-3 border-b border-slate-100"><p class="font-bold text-slate-900 text-sm">Pay History</p></div>'+
      '<table class="w-full text-sm"><thead class="bg-slate-50"><tr>'+
        '<th class="px-4 py-2 text-left text-xs font-bold text-slate-400 uppercase">Period</th>'+
        '<th class="px-4 py-2 text-right text-xs font-bold text-slate-400 uppercase">Gross</th>'+
        '<th class="px-4 py-2 text-right text-xs font-bold text-slate-400 uppercase">Net</th>'+
        '<th class="px-4 py-2 text-left text-xs font-bold text-slate-400 uppercase">Status</th>'+
      '</tr></thead><tbody>';
    sorted.forEach(function(r){
      html += '<tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer pr-hist-row" data-id="'+esc(r.id)+'">'+
        '<td class="px-4 py-2.5 text-xs font-semibold text-slate-700">'+esc(periodLabel(r.period_start,r.period_end))+'</td>'+
        '<td class="px-4 py-2.5 text-right text-xs text-slate-600">'+fmtMoney(calcGross(r))+'</td>'+
        '<td class="px-4 py-2.5 text-right text-xs font-bold text-emerald-700">'+fmtMoney(calcNet(r))+'</td>'+
        '<td class="px-4 py-2.5">'+statusBadge(r.status)+'</td>'+
      '</tr>';
    });
    html += '</tbody></table></div>';

    // Tax rates panel — shown if this user's role has access
    if (canViewTaxRates()) {
      html += renderTaxRatesPanel();
    }

    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('.pr-payslip-btn').forEach(function(b){
      b.addEventListener('click', function(){ var r=runsCache.find(function(x){return x.id===b.dataset.id;}); if(r) openPayslip(r); });
    });
    el.querySelectorAll('.pr-export-btn').forEach(function(b){
      b.addEventListener('click', function(){ var r=runsCache.find(function(x){return x.id===b.dataset.id;}); if(r) exportPayslipCSV(r); });
    });
    el.querySelectorAll('.pr-hist-row').forEach(function(row){
      row.addEventListener('click', function(){ var r=runsCache.find(function(x){return x.id===row.dataset.id;}); if(r) openPayslip(r); });
    });
  }

  function _lineItem(label, val, valCls) {
    return '<div class="pr-tax-row"><span class="text-slate-500">'+esc(label)+'</span><span class="font-semibold '+(valCls||'text-slate-800')+'">'+esc(val)+'</span></div>';
  }

  // ── Employees View ────────────────────────────────────────────
  function renderEmployees() {
    var el = document.getElementById('pr-content'); if (!el) return;
    var empMap = {};
    empCache.forEach(function(e){ empMap[e.id]=e; });
    var people = usersCache.map(function(u) {
      var uid=u.user_id||u.id, emp=empMap[uid]||{};
      var empRuns=runsCache.filter(function(r){ return r.employee_id===uid; });
      var lastRun=empRuns.sort(function(a,b){ return new Date(b.period_start)-new Date(a.period_start); })[0];
      return { u:u, emp:emp, uid:uid, lastRun:lastRun, runCount:empRuns.length,
               totalPaid:empRuns.filter(function(r){return r.status==='Paid';}).reduce(function(s,r){return s+calcNet(r);},0) };
    });

    var html = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
    people.forEach(function(p) {
      var u=p.u, lr=p.lastRun;
      var anom = lr ? detectAnomaly(lr, runsCache) : null;
      html +=
        '<div class="pr-emp-card bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer" data-uid="'+esc(p.uid)+'">'+
          '<div class="flex items-start gap-3 mb-4">'+
            userAvatar(p.uid,'w-10 h-10 text-sm')+
            '<div class="flex-1 min-w-0">'+
              '<div class="font-bold text-slate-900 text-sm truncate">'+esc(u.name||u.email||p.uid)+'</div>'+
              '<div class="text-xs text-slate-400 truncate">'+esc(u.role||'—')+(u.department?' · '+esc(u.department):'')+'</div>'+
              (p.emp.pay_type?'<div class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-px rounded font-semibold inline-block mt-1">'+esc(p.emp.pay_type)+(p.emp.salary?' · $'+p.emp.salary+(p.emp.pay_type==='Hourly'?'/hr':''):'')+' </div>':'') +
            '</div>'+
            (anom?anomalyBadge(anom):'')+
          '</div>'+
          '<div class="grid grid-cols-2 gap-3 mb-3">'+
            '<div class="bg-slate-50 rounded-xl p-2.5 text-center"><div class="text-lg font-extrabold text-slate-900">'+p.runCount+'</div><div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Pay Runs</div></div>'+
            '<div class="bg-emerald-50 rounded-xl p-2.5 text-center"><div class="text-lg font-extrabold text-emerald-700">'+fmtMoney(p.totalPaid,0)+'</div><div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Paid</div></div>'+
          '</div>'+
          (lr?'<div class="flex items-center justify-between pt-3 border-t border-slate-100"><span class="text-[10px] text-slate-400">Last: '+esc(fmtDate(lr.period_start))+'</span>'+statusBadge(lr.status||'Draft')+'</div>':'<div class="pt-3 border-t border-slate-100 text-[10px] text-slate-400">No pay runs yet</div>')+
          (isPayAdmin()?'<button class="pr-emp-run w-full mt-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 border border-dashed border-emerald-300 rounded-xl transition-colors bg-transparent cursor-pointer" data-uid="'+esc(p.uid)+'" data-name="'+esc(u.name||u.email||p.uid)+'"><i class="fas fa-plus mr-1 text-[10px]"></i>New Pay Run</button>':'')+
        '</div>';
    });
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('.pr-emp-card').forEach(function(card){
      card.addEventListener('click', function(e){
        if (e.target.closest('.pr-emp-run')) return;
        filters.employee_id=this.dataset.uid; filters.status='';
        activeView='runs'; sessionStorage.setItem('pr_view','runs');
        render();
        setTimeout(function(){ var fe=document.getElementById('pr-filter-emp'); if(fe) fe.value=filters.employee_id; },100);
      });
    });
    el.querySelectorAll('.pr-emp-run').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        openRunForm(null, { employee_id:this.dataset.uid, employee_name:this.dataset.name });
      });
    });
  }

  // ── Summary View ──────────────────────────────────────────────
  function renderSummary(rows) {
    var el = document.getElementById('pr-content'); if (!el) return;
    var byEmp = {};
    rows.forEach(function(r){
      var eid=r.employee_id||'unknown';
      if (!byEmp[eid]) byEmp[eid]={ name:r.employee_name||userName(r.employee_id), runs:[], gross:0, deductions:0, net:0 };
      byEmp[eid].runs.push(r);
      byEmp[eid].gross      += calcGross(r);
      byEmp[eid].deductions += calcDeductions(r);
      byEmp[eid].net        += calcNet(r);
    });
    var totalGross=rows.reduce(function(s,r){return s+calcGross(r);},0);
    var totalDed  =rows.reduce(function(s,r){return s+calcDeductions(r);},0);
    var totalNet  =rows.reduce(function(s,r){return s+calcNet(r);},0);

    function sCard(label, icon, cls, val, sub) {
      return '<div class="'+cls+' rounded-2xl px-5 py-4 text-white">'+
        '<p class="text-xs font-bold opacity-70 uppercase tracking-widest mb-2"><i class="fas '+icon+' mr-1.5"></i>'+label+'</p>'+
        '<p class="text-3xl font-black leading-none">'+val+'</p>'+
        '<p class="text-xs opacity-60 mt-1.5">'+sub+'</p>'+
      '</div>';
    }

    var html =
      '<div class="grid grid-cols-3 gap-4 mb-6">'+
        sCard('Total Gross','fa-arrow-up','bg-slate-800',fmtMoney(totalGross,0),'All earnings before deductions')+
        sCard('Taxes & Deductions','fa-arrow-down','bg-red-700','-'+fmtMoney(totalDed,0),'Taxes, insurance, pension')+
        sCard('Total Net Pay','fa-check','bg-emerald-700',fmtMoney(totalNet,0),'Employee take-home')+
      '</div>'+

      // Export row
      '<div class="flex gap-2 mb-4">'+
        '<button id="pr-export-all" class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"><i class="fas fa-file-csv text-emerald-500"></i>Export CSV</button>'+
      '</div>'+

      '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">'+
        '<div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">'+
          '<p class="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Breakdown by Employee</p>'+
          '<span class="text-xs text-slate-400">'+Object.keys(byEmp).length+' employees</span>'+
        '</div>'+
        '<table class="w-full text-sm border-collapse">'+
          '<thead><tr class="border-b border-slate-100">'+
            '<th class="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>'+
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Gross</th>'+
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Tax & Ded.</th>'+
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Net Pay</th>'+
            '<th class="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Runs</th>'+
          '</tr></thead><tbody>';

    Object.entries(byEmp).forEach(function(entry){
      var eid=entry[0], d=entry[1];
      var pct=totalGross?Math.round(d.gross/totalGross*100):0;
      html +=
        '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">'+
          '<td class="px-5 py-3"><div class="flex items-center gap-2">'+userAvatar(eid,'w-6 h-6 text-[10px]')+'<span class="text-sm font-semibold text-slate-900">'+esc(d.name)+'</span></div></td>'+
          '<td class="px-5 py-3 text-right text-sm text-slate-700 font-semibold">'+fmtMoney(d.gross)+'</td>'+
          '<td class="px-5 py-3 text-right text-sm text-red-500 font-semibold">-'+fmtMoney(d.deductions)+'</td>'+
          '<td class="px-5 py-3 text-right">'+
            '<div class="text-sm font-extrabold text-emerald-700">'+fmtMoney(d.net)+'</div>'+
            '<div class="h-1.5 bg-slate-100 rounded-full mt-1" style="width:80px;margin-left:auto">'+
              '<div class="h-1.5 bg-emerald-500 rounded-full" style="width:'+pct+'%"></div>'+
            '</div>'+
          '</td>'+
          '<td class="px-5 py-3 text-right text-xs text-slate-500 font-semibold">'+d.runs.length+'</td>'+
        '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var exportBtn = document.getElementById('pr-export-all');
    if (exportBtn) exportBtn.addEventListener('click', function(){ exportSummaryCSV(rows); });
  }

  // ── Audit Log View ────────────────────────────────────────────
  function renderAudit() {
    var el = document.getElementById('pr-content'); if (!el) return;
    var logs = auditCache.slice().sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); });

    var ACTION_CFG = {
      'created':  { icon:'fa-plus',        cls:'bg-blue-100 text-blue-600'   },
      'updated':  { icon:'fa-pencil',      cls:'bg-amber-100 text-amber-600' },
      'approved': { icon:'fa-check',       cls:'bg-green-100 text-green-600' },
      'rejected': { icon:'fa-times',       cls:'bg-red-100 text-red-600'     },
      'paid':     { icon:'fa-dollar-sign', cls:'bg-emerald-100 text-emerald-600' },
      'deleted':  { icon:'fa-trash',       cls:'bg-red-100 text-red-600'     },
    };

    var html = '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">';
    if (!logs.length) {
      html += '<div class="p-12 text-center text-slate-400"><i class="fas fa-history text-3xl mb-3 opacity-30"></i><p class="font-semibold">No audit records yet</p></div>';
    } else {
      html += '<div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">'+
        '<p class="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Audit Log</p>'+
        '<span class="text-xs text-slate-400">'+logs.length+' events</span>'+
      '</div>';
      html += '<div class="divide-y divide-slate-100">';
      logs.forEach(function(log){
        var cfg = ACTION_CFG[log.action]||{icon:'fa-circle',cls:'bg-slate-100 text-slate-500'};
        var who = log.performed_by ? userName(log.performed_by) : '—';
        html +=
          '<div class="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">'+
            '<div class="w-7 h-7 rounded-full '+cfg.cls+' flex items-center justify-center flex-shrink-0 mt-0.5">'+
              '<i class="fas '+cfg.icon+' text-[10px]"></i>'+
            '</div>'+
            '<div class="flex-1 min-w-0">'+
              '<div class="flex items-center gap-2 flex-wrap">'+
                '<span class="text-xs font-bold text-slate-800 capitalize">'+esc(log.action)+'</span>'+
                '<span class="text-[10px] font-mono text-slate-400">'+esc(log.run_id||'')+'</span>'+
                (log.old_status&&log.new_status?'<span class="text-[10px] text-slate-400">'+esc(log.old_status)+' → '+esc(log.new_status)+'</span>':'')+
              '</div>'+
              '<div class="text-[11px] text-slate-500 mt-0.5">'+
                'By <span class="font-semibold">'+esc(who)+'</span>'+
                (log.note?' · <em>'+esc(log.note)+'</em>':'')+
              '</div>'+
            '</div>'+
            '<div class="text-[10px] text-slate-400 flex-shrink-0 text-right">'+esc(fmtDateTime(log.created_at))+'</div>'+
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // ── Pay Run Form ──────────────────────────────────────────────
  function openRunForm(run, prefill) {
    var isEdit = !!run;
    var r = run || prefill || {};

    // Timesheet autofill
    var tsHours = 0;
    if (r.employee_id && tsCache.length) {
      tsHours = tsCache
        .filter(function(t){ return (t.employee_id===r.employee_id||t.user_id===r.employee_id)&&t.status==='Approved'; })
        .reduce(function(s,t){ return s+(parseFloat(t.hours)||parseFloat(t.total_hours)||0); }, 0);
    }

    // Last pay period for "copy" feature
    var lastRun = null;
    if (r.employee_id) {
      lastRun = runsCache.filter(function(x){ return x.employee_id===r.employee_id&&x.id!==(r.id||''); })
        .sort(function(a,b){ return new Date(b.period_start)-new Date(a.period_start); })[0];
    }

    var userOpts = usersCache.map(function(u){
      var uid=u.user_id||u.id;
      return '<option value="'+esc(uid)+'" data-name="'+esc(u.name||u.email||uid)+'"'+(r.employee_id===uid?' selected':'')+'>'+esc(u.name||u.email||uid)+'</option>';
    }).join('');

    // Determine initial compute values — for new runs, pull rate from Users sheet
    var _initUser = !r.id ? usersCache.find(function(u){ return (u.user_id||u.id)===r.employee_id; }) : null;
    var _initPayType = (_initUser && _initUser.pay_type) || r.pay_type || '';
    var _initRate = _initPayType === 'Salary'
      ? ((_initUser && parseFloat(_initUser.salary)) || 0)
      : ((_initUser && parseFloat(_initUser.hourly_rate)) || 0);
    var initRate    = r.rate || r.salary || (_initRate || '');
    var initHrsReg  = r.hours_regular || '';
    var initHrsOT   = r.hours_ot || '';
    var initBonuses = r.bonuses || r.bonus || '';
    var initDed     = r.deductions || '';
    var initGross   = r.gross || '';
    var initNet     = r.net   || '';
    var initTaxFed  = r.tax_federal || '';
    var initTaxFica = r.tax_fica    || '';
    var initTaxSt   = r.tax_state   || '';
    var initTaxTot  = r.tax_total   || r.tax || '';

    var html =
      // ── Sticky header
      '<div class="sticky-header flex items-center justify-between">'+
        '<div class="flex items-center gap-2">'+
          '<div class="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center"><i class="fas fa-file-invoice-dollar text-emerald-600 text-sm"></i></div>'+
          '<div>'+
            '<h3 class="font-extrabold text-slate-900 text-base">'+(isEdit?'Edit Pay Run':'New Pay Run')+'</h3>'+
            (isEdit?'<p class="text-[11px] text-slate-400 font-mono">'+esc(run.id)+'</p>':'')+
          '</div>'+
        '</div>'+
        '<div class="flex items-center gap-2">'+
          (lastRun&&!isEdit?'<button id="prf-copy-last" class="flex items-center gap-1.5 text-xs font-bold text-slate-500 border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"><i class="fas fa-copy text-[10px]"></i>Copy Last Period</button>':'') +
          '<button id="prf-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>'+
        '</div>'+
      '</div>'+

      '<div class="px-6 py-5">'+
        '<div id="pr-msg"></div>'+
        '<div id="prf-warnings"></div>'+

        // ── SECTION 1: Employee & Period ──────────────────────────
        '<div class="pr-section">'+
          '<div class="pr-section-head"><i class="fas fa-user text-slate-400 text-xs"></i><span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Employee &amp; Pay Period</span></div>'+
          '<div class="p-4 grid grid-cols-2 gap-3">'+
            '<div class="col-span-2 pr-field"><label>Employee <span class="text-red-400">*</span></label>'+
              (isPayAdmin()
                ? '<select id="prf-emp" class="pr-input"><option value="">Select employee…</option>'+userOpts+'</select>'
                : '<input class="pr-input" readonly value="'+esc(r.employee_name||userName(r.employee_id)||myName())+'"><input type="hidden" id="prf-emp" value="'+esc(r.employee_id||myUserId())+'">')+
            '</div>'+
            '<div class="pr-field"><label>Period Start <span class="text-red-400">*</span></label><input id="prf-start" type="date" class="pr-input" value="'+esc(fmtDateInput(r.period_start)||'')+'"></div>'+
            '<div class="pr-field"><label>Period End <span class="text-red-400">*</span></label><input id="prf-end" type="date" class="pr-input" value="'+esc(fmtDateInput(r.period_end)||'')+'"></div>'+
            '<div class="pr-field"><label>Pay Type</label>'+
              '<select id="prf-paytype" class="pr-input">'+
                PAY_TYPES.map(function(pt){ return '<option'+((r.pay_type||_initPayType)===pt?' selected':'')+'>'+pt+'</option>'; }).join('')+
              '</select>'+
            '</div>'+
            '<div class="pr-field"><label>Rate ($/hr or salary)</label><input id="prf-rate" type="number" min="0" step="0.01" class="pr-input" value="'+esc(initRate)+'" placeholder="0.00"></div>'+
            (tsHours>0?
              '<div class="col-span-2 pr-warn blue"><i class="fas fa-clock text-xs mt-0.5"></i><span>'+fmtHours(tsHours)+' approved timesheet hours found for this employee. <button id="prf-ts-fill" class="underline font-bold cursor-pointer bg-transparent border-none text-blue-700">Autofill hours</button></span></div>':'')+
          '</div>'+
        '</div>'+

        // ── SECTION 2: Hours & Earnings ───────────────────────────
        '<div class="pr-section">'+
          '<div class="pr-section-head"><i class="fas fa-arrow-up text-emerald-500 text-xs"></i><span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Hours &amp; Earnings</span></div>'+
          '<div class="p-4 grid grid-cols-3 gap-3">'+
            '<div class="pr-field"><label>Regular Hours</label><input id="prf-hrs-reg" type="number" min="0" step="0.5" class="pr-input" value="'+esc(initHrsReg)+'" placeholder="0"></div>'+
            '<div class="pr-field"><label>Overtime Hours</label><input id="prf-hrs-ot" type="number" min="0" step="0.5" class="pr-input" value="'+esc(initHrsOT)+'" placeholder="0"></div>'+
            '<div class="pr-field"><label>Total Hours</label><input id="prf-hrs-total" type="number" class="pr-input pr-calc" readonly value="'+esc(r.hours_total||'')+'"></div>'+
            '<div class="pr-field"><label>Bonuses</label><input id="prf-bonuses" type="number" min="0" step="0.01" class="pr-input" value="'+esc(initBonuses)+'" placeholder="0.00"></div>'+
            '<div class="col-span-2 pr-field"><label>Gross Earnings</label>'+
              '<div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">'+
                '<span class="text-xs font-bold text-emerald-700 uppercase tracking-wider flex-1">Auto-calculated</span>'+
                '<span id="prf-gross-total" class="text-xl font-extrabold text-emerald-700">'+fmtMoney(parseFloat(initGross)||0)+'</span>'+
              '</div>'+
            '</div>'+
          '</div>'+
        '</div>'+

        // ── SECTION 3: Deductions ─────────────────────────────────
        '<div class="pr-section">'+
          '<div class="pr-section-head"><i class="fas fa-arrow-down text-red-400 text-xs"></i><span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Deductions</span></div>'+
          '<div class="p-4 grid grid-cols-2 gap-3">'+
            '<div class="pr-field"><label>Other Deductions</label><input id="prf-ded" type="number" min="0" step="0.01" class="pr-input" value="'+esc(initDed)+'" placeholder="0.00"></div>'+
            '<div class="pr-field"><label>Total Deductions</label>'+
              '<div class="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">'+
                '<span id="prf-ded-total" class="text-xl font-extrabold text-red-600 flex-1 text-right">-'+fmtMoney(0)+'</span>'+
              '</div>'+
            '</div>'+
          '</div>'+
          // Tax breakdown — shows disabled notice or live-updating rows based on admin config
          '<div class="mx-4 mb-4 border border-slate-200 rounded-xl overflow-hidden">'+
            (function(){
              var cfg = getTaxCfg();
              var isCA = cfg.country === 'Canada';
              var enabled = cfg.tax_calculation_enabled === true;
              var yr = new Date().getFullYear();

              if (!enabled) {
                // Admin turned off auto tax calc — show a clean notice instead of rows
                return (
                  '<div class="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">'+
                    '<i class="fas fa-calculator-alt text-slate-300 text-xs"></i>'+
                    '<span class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Taxes &amp; Deductions</span>'+
                  '</div>'+
                  '<div class="px-4 py-4 flex items-center gap-3 text-sm text-slate-400">'+
                    '<i class="fas fa-toggle-off text-slate-300 text-lg flex-shrink-0"></i>'+
                    '<div>'+
                      '<div class="font-semibold text-slate-500 text-xs">Auto tax calculation is off</div>'+
                      '<div class="text-[11px] mt-0.5">Taxes are not deducted automatically. Enter deductions manually above, or turn on tax calculation in Settings → Modules → Payroll Tax Settings.</div>'+
                    '</div>'+
                  '</div>'
                );
              }

              var rows = isCA ? [
                ['Federal Income Tax (CRA brackets)', 'prf-tax-fed'],
                ['CPP ('+(cfg.cpp_rate||5.95)+'%)', 'prf-tax-fica'],
                ['EI ('+(cfg.ei_rate||1.66)+'%)', 'prf-tax-fica2'],
                [(cfg.provincial_tax_label||'Provincial Tax'), 'prf-tax-state'],
                (parseFloat(cfg.additional_tax_rate||0) > 0 ? [(cfg.additional_tax_label||'Additional Tax'), 'prf-tax-addl'] : null),
                (parseFloat(cfg.other_deduction_rate||0) > 0 ? [(cfg.other_deduction_label||'Other Deductions'), 'prf-tax-other'] : null),
              ] : [
                ['Federal Income Tax (IRS brackets)', 'prf-tax-fed'],
                ['FICA — SS ('+(cfg.fica_ss_rate||6.2)+'%) + Medicare ('+(cfg.fica_medicare_rate||1.45)+'%)', 'prf-tax-fica'],
                [(cfg.state_tax_label||'State Income Tax')+' ('+(cfg.state_tax_rate||5)+'%)', 'prf-tax-state'],
                (parseFloat(cfg.local_tax_rate||0) > 0 ? [(cfg.local_tax_label||'Local Tax')+' ('+(cfg.local_tax_rate)+'%)', 'prf-tax-local'] : null),
                (parseFloat(cfg.other_deduction_rate||0) > 0 ? [(cfg.other_deduction_label||'Other Deductions')+' ('+(cfg.other_deduction_rate)+'%)', 'prf-tax-other'] : null),
              ];
              var rowsHtml = rows.filter(Boolean).map(function(r){
                return '<div class="pr-tax-row"><span class="text-slate-500">'+esc(r[0])+'</span><span id="'+r[1]+'" class="font-semibold text-red-500">$0.00</span></div>';
              }).join('');
              return (
                '<div class="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">'+
                  '<span class="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Estimated Taxes &amp; Deductions</span>'+
                  '<span class="text-[10px] text-slate-400">'+(isCA?'🇨🇦 CRA ':' 🇺🇸 IRS ')+yr+' · Admin rates</span>'+
                '</div>'+
                '<div class="px-4 py-2">'+
                  rowsHtml+
                  '<div class="pr-tax-row border-t-2 border-slate-200 mt-1 pt-1"><span class="font-bold text-slate-700">Total Tax &amp; Deductions</span><span id="prf-tax-total" class="font-extrabold text-red-600">$0.00</span></div>'+
                '</div>'
              );
            })() +
          '</div>'+
        '</div>'+

        // ── NET PAY HERO ───────────────────────────────────────────
        '<div class="net-pay-hero">'+
          '<div>'+
            '<div class="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Net Pay</div>'+
            '<div id="prf-net-pay" class="amount">'+fmtMoney(parseFloat(initNet)||0)+'</div>'+
            '<div id="prf-net-warn" class="hidden mt-1 text-xs font-bold text-red-300"><i class="fas fa-exclamation-triangle mr-1"></i>Net pay is negative</div>'+
          '</div>'+
          '<div class="text-right">'+
            '<div class="text-xs opacity-50 mb-1">Gross - Tax - Deductions</div>'+
            '<div id="prf-net-formula" class="text-sm font-bold opacity-70">—</div>'+
          '</div>'+
        '</div>'+

        // ── Notes ──────────────────────────────────────────────────
        '<div class="pr-field mb-5">'+
          '<label>Internal Notes</label>'+
          '<textarea id="prf-notes" rows="2" class="pr-input" placeholder="Any internal notes about this pay run…" style="resize:vertical">'+esc(r.notes||'')+'</textarea>'+
        '</div>'+

        '<div class="flex gap-3">'+
          '<button id="prf-cancel" class="btn-secondary flex-1 py-2.5">Cancel</button>'+
  
          '<button id="prf-save" class="btn-primary flex-1 py-2.5" style="background:#10b981"><i class="fas fa-save mr-1.5 text-xs"></i>'+(isEdit?'Save Changes':'Create Pay Run')+'</button>'+
        '</div>'+
      '</div>';

    showModal(html, '720px');

    // ── Live recalculator
    var calcIds = ['prf-rate','prf-hrs-reg','prf-hrs-ot','prf-bonuses','prf-ded'];

    function recalc() {
      var payType  = (document.getElementById('prf-paytype')||{}).value||'Hourly';
      var rate     = parseFloat((document.getElementById('prf-rate')||{}).value)||0;
      var hrsReg   = parseFloat((document.getElementById('prf-hrs-reg')||{}).value)||0;
      var hrsOT    = parseFloat((document.getElementById('prf-hrs-ot')||{}).value)||0;
      var bonuses  = parseFloat((document.getElementById('prf-bonuses')||{}).value)||0;
      var ded      = parseFloat((document.getElementById('prf-ded')||{}).value)||0;

      var hrsTotal = hrsReg + hrsOT;
      var htEl = document.getElementById('prf-hrs-total');
      if (htEl) htEl.value = hrsTotal || '';

      var computed = computeRun({ pay_type:payType, rate:rate, hours_regular:hrsReg, hours_ot:hrsOT, bonuses:bonuses, deductions:ded });

      var setTxt = function(id, val){ var e=document.getElementById(id); if(e) e.textContent=val; };
      setTxt('prf-gross-total', fmtMoney(computed.gross));
      setTxt('prf-tax-total',   fmtMoney(computed.tax_total));
      setTxt('prf-ded-total',   '-'+fmtMoney(computed.deductions+computed.tax_total));
      setTxt('prf-net-pay',     fmtMoney(computed.net));
      setTxt('prf-net-formula', fmtMoney(computed.gross)+' − '+fmtMoney(computed.tax_total)+' − '+fmtMoney(computed.deductions));

      // Populate per-country tax rows
      var tx = computed._taxes || {};
      var cfg2 = getTaxCfg();
      if (cfg2.country === 'Canada') {
        setTxt('prf-tax-fed',   fmtMoney(tx.federal||0));
        setTxt('prf-tax-fica',  fmtMoney(tx.cpp||0));    // CPP
        setTxt('prf-tax-fica2', fmtMoney(tx.ei||0));     // EI
        setTxt('prf-tax-state', fmtMoney(tx.provincial||0));
        setTxt('prf-tax-addl',  fmtMoney(tx.additional||0));
        setTxt('prf-tax-other', fmtMoney(tx.other||0));
      } else {
        setTxt('prf-tax-fed',   fmtMoney(tx.federal||0));
        setTxt('prf-tax-fica',  fmtMoney(tx.fica||0));
        setTxt('prf-tax-state', fmtMoney(tx.state||0));
        setTxt('prf-tax-local', fmtMoney(tx.local||0));
        setTxt('prf-tax-other', fmtMoney(tx.other||0));
      }

      var warn = document.getElementById('prf-net-warn');
      if (warn) warn.classList.toggle('hidden', computed.net >= 0);

      // OT warning
      updateWarnings(hrsOT, computed, payType, hrsReg, rate);
    }

    function updateWarnings(hrsOT, computed, payType, hrsReg, rate) {
      var wEl = document.getElementById('prf-warnings');
      if (!wEl) return;
      var warns = [];
      if (hrsOT > 0 && payType === 'Hourly') {
        warns.push('<div class="pr-warn amber"><i class="fas fa-clock text-xs mt-0.5"></i><span>Overtime detected: '+fmtHours(hrsOT)+' @ 1.5× rate ('+fmtMoney(rate*1.5)+'/hr)</span></div>');
      }
      if (computed.net <= 0 && computed.gross > 0) {
        warns.push('<div class="pr-warn red"><i class="fas fa-exclamation-triangle text-xs mt-0.5"></i><span>Net pay is zero or negative — review deductions</span></div>');
      }
      if (hrsReg > 60) {
        warns.push('<div class="pr-warn red"><i class="fas fa-exclamation-triangle text-xs mt-0.5"></i><span>Regular hours exceed 60 — please verify</span></div>');
      }
      wEl.innerHTML = warns.join('');
    }

    calcIds.forEach(function(id){
      var el2=document.getElementById(id);
      if (el2) el2.addEventListener('input', recalc);
    });
    var ptEl = document.getElementById('prf-paytype');
    if (ptEl) ptEl.addEventListener('change', recalc);

    // Run initial calc if editing
    if (isEdit || r.rate) recalc();

    // Copy last period
    var copyBtn = document.getElementById('prf-copy-last');
    if (copyBtn && lastRun) {
      copyBtn.addEventListener('click', function(){
        var setVal = function(id, v){ var e=document.getElementById(id); if(e&&v!==undefined&&v!=='') e.value=v; };
        setVal('prf-rate',    lastRun.rate||lastRun.salary||'');
        setVal('prf-hrs-reg', lastRun.hours_regular||'');
        setVal('prf-hrs-ot',  lastRun.hours_ot||'');
        setVal('prf-bonuses', lastRun.bonuses||lastRun.bonus||'');
        setVal('prf-ded',     lastRun.deductions||'');
        var ptEl2 = document.getElementById('prf-paytype');
        if (ptEl2 && lastRun.pay_type) ptEl2.value = lastRun.pay_type;
        recalc();
        toast('Copied from '+periodLabel(lastRun.period_start,lastRun.period_end), 'info');
      });
    }

    // Timesheet autofill
    var tsBtn = document.getElementById('prf-ts-fill');
    if (tsBtn) {
      tsBtn.addEventListener('click', function(){
        var hrsEl = document.getElementById('prf-hrs-reg');
        if (hrsEl) { hrsEl.value = tsHours.toFixed(1); recalc(); toast('Autofilled '+fmtHours(tsHours)+' from approved timesheets','info'); }
      });
    }

    // Employee change → auto-fill rate + pay_type from Users sheet data
    var empSel = document.getElementById('prf-emp');
    if (empSel && empSel.tagName==='SELECT') {
      empSel.addEventListener('change', function(){
        var uid = this.value;
        var empRecord = empCache.find(function(e){ return e.id===uid; });
        var userRecord = usersCache.find(function(u){ return (u.user_id||u.id)===uid; });
        var rateEl   = document.getElementById('prf-rate');
        var ptEl     = document.getElementById('prf-paytype');
        // Pay type: user record first, empCache fallback
        var payType = (userRecord && userRecord.pay_type) || (empRecord && empRecord.pay_type) || '';
        // Rate: hourly_rate for hourly/contractor, salary for salaried — user record first
        var rate = payType === 'Salary'
          ? (parseFloat(userRecord && userRecord.salary) || parseFloat(empRecord && empRecord.salary) || 0)
          : (parseFloat(userRecord && userRecord.hourly_rate) || parseFloat(empRecord && empRecord.salary) || 0);
        if (ptEl && payType) { ptEl.value = payType; }
        if (rateEl && rate)  { rateEl.value = rate; recalc(); }
        else if (rateEl && empRecord && empRecord.salary) { rateEl.value = empRecord.salary; recalc(); }
      });
    }

    document.getElementById('prf-close').addEventListener('click', closeModal);
    document.getElementById('prf-cancel').addEventListener('click', closeModal);

    // Preview payslip before saving

    document.getElementById('prf-save').addEventListener('click', function(){ submitRunForm(isEdit ? run.id : null); });

    // Keyboard: Escape to close
    var escHandler = function(e){ if(e.key==='Escape') { closeModal(); document.removeEventListener('keydown',escHandler); } };
    document.addEventListener('keydown', escHandler);
  }

  function buildFormParams(runId) {
    var empEl  = document.getElementById('prf-emp');
    var empId  = empEl ? empEl.value : myUserId();
    var empName = '';
    if (empEl && empEl.tagName==='SELECT') {
      var opt = empEl.options[empEl.selectedIndex];
      empName = opt ? opt.text : '';
    } else { empName = myName(); }
    var start = (document.getElementById('prf-start')||{}).value||'';
    if (!start || !empId) return null;
    var payType = (document.getElementById('prf-paytype')||{}).value||'Hourly';
    var rate    = parseFloat((document.getElementById('prf-rate')||{}).value)||0;
    var hrsReg  = parseFloat((document.getElementById('prf-hrs-reg')||{}).value)||0;
    var hrsOT   = parseFloat((document.getElementById('prf-hrs-ot')||{}).value)||0;
    var bonuses = parseFloat((document.getElementById('prf-bonuses')||{}).value)||0;
    var ded     = parseFloat((document.getElementById('prf-ded')||{}).value)||0;
    var computed = computeRun({ pay_type:payType, rate:rate, hours_regular:hrsReg, hours_ot:hrsOT, bonuses:bonuses, deductions:ded });
    return {
      employee_id:   empId,
      employee_name: empName,
      period_start:  start,
      period_end:    (document.getElementById('prf-end')||{}).value||'',
      pay_type:      payType,
      rate:          String(rate),
      hours_regular: String(hrsReg),
      hours_ot:      String(hrsOT),
      hours_total:   String(hrsReg+hrsOT),
      bonuses:       String(bonuses),
      deductions:    String(ded),
      tax_federal:   String(computed.tax_federal),
      tax_fica:      String(computed.tax_fica),
      tax_state:     String(computed.tax_state),
      tax_total:     String(computed.tax_total),
      gross:         String(computed.gross),
      net:           String(computed.net),
      notes:         (document.getElementById('prf-notes')||{}).value||'',
      // legacy compat fields
      gross_salary:  String(computed.gross),
      tax:           String(computed.tax_total),
      overtime_pay:  String(hrsOT*rate*1.5),
      overtime_hours: String(hrsOT),
    };
  }

  function submitRunForm(runId) {
    var isEdit = !!runId;
    var empEl  = document.getElementById('prf-emp');
    var empId  = empEl ? empEl.value : myUserId();
    var start  = (document.getElementById('prf-start')||{}).value||'';

    // Validation
    if (!empId) { modalMsg('Please select an employee.', false); return; }
    if (!start) { modalMsg('Period start date is required.', false); document.getElementById('prf-start').classList.add('error'); return; }
    if (!(document.getElementById('prf-end')||{}).value) { modalMsg('Period end date is required.', false); document.getElementById('prf-end').classList.add('error'); return; }

    var params = buildFormParams(runId);
    if (!params) { modalMsg('Please fill all required fields.', false); return; }

    var net = parseFloat(params.net)||0;
    if (net <= 0 && !confirm('Net pay is '+fmtMoney(net)+'. Save anyway?')) return;

    // Duplicate detection
    if (!isEdit) {
      var dup = runsCache.find(function(r){
        return r.employee_id===empId && r.period_start===start && r.status!=='Void' && r.status!=='Rejected';
      });
      if (dup && !confirm('A pay run for this employee and period already exists ('+dup.id+'). Create another?')) return;
    }

    if (!isEdit) { params.id = genId('PR'); params.created_by = myUserId(); params.status = 'Draft'; }
    else          params.id = runId;

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

  // ── Tax Settings Modal ───────────────────────────────────────────
  function openTaxSettingsModal() {
    var cfg    = getTaxCfg();
    var adm    = isPayAdmin();
    var isUSA  = cfg.country !== 'Canada';
    var taxOn  = cfg.tax_calculation_enabled === true;
    var ro     = !adm ? 'readonly' : '';
    var dis    = !adm ? 'disabled' : '';

    function field(label, id, val, placeholder, type) {
      type = type || 'number';
      return '<div class="pr-field">'+
        '<label>'+label+'</label>'+
        '<input id="ptaxm-'+id+'" type="'+type+'" class="pr-input" value="'+val+'" placeholder="'+(placeholder||'')+'" step="0.01" min="0" '+ro+'></div>';
    }
    function chk(label, id, checked) {
      return '<label class="flex items-center gap-2 text-sm cursor-pointer">'+
        '<input type="checkbox" id="ptaxm-'+id+'" '+(checked?'checked':'')+' '+dis+' class="w-4 h-4 accent-emerald-600 rounded">'+
        '<span class="text-slate-700">'+label+'</span></label>';
    }

    var usaFields =
      '<div class="grid grid-cols-2 gap-3">'+
        field('Federal Flat Rate (%)',       'federal_flat_rate',        cfg.federal_flat_rate||22,        '22') +
        field('FICA - SS Rate (%)',          'fica_ss_rate',             cfg.fica_ss_rate||6.2,            '6.2') +
        field('FICA - Medicare (%)',         'fica_medicare_rate',       cfg.fica_medicare_rate||1.45,     '1.45') +
        field("Add'l Medicare (%)",          'additional_medicare_rate', cfg.additional_medicare_rate||0.9,'0.9') +
        field('State Tax Rate (%)',          'state_tax_rate',           cfg.state_tax_rate||5,            '5') +
        field('State Tax Label',             'state_tax_label',          cfg.state_tax_label||'State Income Tax','State Income Tax','text') +
        field('Local Tax Rate (%)',          'local_tax_rate',           cfg.local_tax_rate||0,            '0') +
        field('Local Tax Label',             'local_tax_label',          cfg.local_tax_label||'Local Tax','Local Tax','text') +
        field('Other Deduction (%)',         'other_deduction_rate',     cfg.other_deduction_rate||0,      '0') +
        field('Other Deduction Label',       'other_deduction_label',    cfg.other_deduction_label||'Other Deductions','Other Deductions','text') +
        field('Pay Periods / Year',          'pay_periods_per_year',     cfg.pay_periods_per_year||26,     '26') +
      '</div>'+
      '<div class="mt-2">'+chk('Use progressive federal tax brackets (recommended)', 'federal_use_brackets', cfg.federal_use_brackets!==false)+'</div>';

    var caFields =
      '<div class="grid grid-cols-2 gap-3">'+
        field('Federal Flat Rate (%)',   'federal_flat_rate',      cfg.federal_flat_rate||20.5,   '20.5') +
        field('CPP Rate (%)',            'cpp_rate',               cfg.cpp_rate||5.95,            '5.95') +
        field('CPP Max Annual ($)',      'cpp_max_annual',         cfg.cpp_max_annual||3867.50,   '3867.50') +
        field('EI Rate (%)',             'ei_rate',                cfg.ei_rate||1.66,             '1.66') +
        field('EI Max Annual ($)',       'ei_max_annual',          cfg.ei_max_annual||1049.12,    '1049.12') +
        field('Provincial Tax (%)',      'provincial_tax_rate',    cfg.provincial_tax_rate||9.15, '9.15') +
        field('Provincial Tax Label',    'provincial_tax_label',   cfg.provincial_tax_label||'Provincial Income Tax','Provincial Income Tax','text') +
        field('Additional Tax (%)',      'additional_tax_rate',    cfg.additional_tax_rate||0,    '0') +
        field('Additional Tax Label',    'additional_tax_label',   cfg.additional_tax_label||'Additional Tax','Additional Tax','text') +
        field('Other Deduction (%)',     'other_deduction_rate',   cfg.other_deduction_rate||0,   '0') +
        field('Other Deduction Label',   'other_deduction_label',  cfg.other_deduction_label||'Other Deductions','Other Deductions','text') +
        field('Pay Periods / Year',      'pay_periods_per_year',   cfg.pay_periods_per_year||26,  '26') +
      '</div>'+
      '<div class="mt-2">'+chk('Use progressive federal tax brackets (recommended)', 'federal_use_brackets', cfg.federal_use_brackets!==false)+'</div>';

    var html =
      '<div class="sticky-header flex items-center justify-between">'+
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><i class="fas fa-sliders-h text-emerald-500"></i>Payroll Tax Settings</h3>'+
        '<button id="ptaxm-close" class="flex-shrink-0 w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>'+
      '</div>'+
      '<div class="px-6 py-5 space-y-5">'+
        '<div id="ptaxm-msg"></div>'+
        '<div class="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">'+
          '<div>'+
            '<div class="font-bold text-slate-800 text-sm">Auto-calculate taxes</div>'+
            '<div class="text-xs text-slate-500 mt-0.5">Automatically deduct taxes from every pay run</div>'+
          '</div>'+
          '<div class="flex items-center gap-2">'+
            '<span id="ptaxm-toggle-label" class="text-xs font-bold '+(taxOn?'text-emerald-600':'text-slate-400')+'">'+(taxOn?'Enabled':'Disabled')+'</span>'+
            '<label class="relative inline-flex items-center cursor-pointer">'+
              '<input type="checkbox" id="ptaxm-master-toggle" '+(taxOn?'checked':'')+' '+dis+' class="sr-only peer">'+
              '<div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 after:shadow-sm"></div>'+
            '</label>'+
          '</div>'+
        '</div>'+
        '<div>'+
          '<label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Country / Region</label>'+
          '<div class="grid grid-cols-2 gap-3">'+
            '<label class="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer '+(isUSA?'border-blue-500 bg-blue-50':'border-slate-200')+'">'+
              '<input type="radio" name="ptaxm_country" value="USA" '+(isUSA?'checked':'')+' id="ptaxm-country-usa" class="accent-blue-600" '+dis+'>'+
              '<div><div class="font-bold text-slate-800 text-sm">US United States</div><div class="text-[10px] text-slate-500">IRS · FICA · State</div></div>'+
            '</label>'+
            '<label class="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer '+(isUSA?'border-slate-200':'border-red-400 bg-red-50')+'">'+
              '<input type="radio" name="ptaxm_country" value="Canada" '+(isUSA?'':'checked')+' id="ptaxm-country-ca" class="accent-red-600" '+dis+'>'+
              '<div><div class="font-bold text-slate-800 text-sm">CA Canada</div><div class="text-[10px] text-slate-500">CRA · CPP · EI · Provincial</div></div>'+
            '</label>'+
          '</div>'+
        '</div>'+
        '<div id="ptaxm-fields">'+(isUSA ? usaFields : caFields)+'</div>'+
        '<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">'+
          '<i class="fas fa-exclamation-triangle mr-1.5"></i>'+
          '<strong>Note:</strong> Rates are estimates. Always verify with your tax authority '+(isUSA?'(IRS.gov).':'(CRA - canada.ca).')+
        '</div>'+
        (!adm ?
          '<div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700"><i class="fas fa-lock mr-1.5"></i>View only - contact an Admin to change tax settings.</div>' :
          '<button id="ptaxm-save" class="w-full py-2.5 text-sm font-bold text-white rounded-xl border-none cursor-pointer" style="background:#10b981"><i class="fas fa-save mr-1.5 text-xs"></i>Save Tax Settings</button>')+
      '</div>';

    showModal(html, '680px');
    document.getElementById('ptaxm-close').addEventListener('click', closeModal);

    var masterToggle = document.getElementById('ptaxm-master-toggle');
    if (masterToggle) masterToggle.addEventListener('change', function() {
      var lbl = document.getElementById('ptaxm-toggle-label');
      if (lbl) { lbl.textContent = this.checked ? 'Enabled' : 'Disabled'; lbl.className = 'text-xs font-bold '+(this.checked?'text-emerald-600':'text-slate-400'); }
    });

    ['ptaxm-country-usa','ptaxm-country-ca'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function() {
        var newCfg = Object.assign({}, this.value === 'Canada' ? _TAX_DEFAULTS.Canada : _TAX_DEFAULTS.USA);
        _taxCfg = newCfg; window.WV_PAYROLL_TAX_CONFIG = newCfg;
        closeModal(); openTaxSettingsModal();
      });
    });

    var saveBtn = document.getElementById('ptaxm-save');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      var btn     = this;
      var msgEl   = document.getElementById('ptaxm-msg');
      var country = (document.querySelector('input[name="ptaxm_country"]:checked')||{}).value || 'USA';
      var newIsUSA= country !== 'Canada';
      var toggle  = document.getElementById('ptaxm-master-toggle');
      var enabled = toggle ? toggle.checked : false;
      function gn(id,fb){ var el=document.getElementById('ptaxm-'+id); return el?(parseFloat(el.value)||0):(fb||0); }
      function gs(id,fb){ var el=document.getElementById('ptaxm-'+id); return el?(el.value||fb||''):(fb||''); }
      function gb(id)   { var el=document.getElementById('ptaxm-'+id); return el?el.checked:false; }
      var newCfg = newIsUSA ? {
        country:'USA', tax_calculation_enabled:enabled,
        pay_periods_per_year:gn('pay_periods_per_year',26), federal_use_brackets:gb('federal_use_brackets'),
        federal_flat_rate:gn('federal_flat_rate',22), fica_ss_rate:gn('fica_ss_rate',6.2),
        fica_medicare_rate:gn('fica_medicare_rate',1.45), additional_medicare_rate:gn('additional_medicare_rate',0.9),
        state_tax_rate:gn('state_tax_rate',5), state_tax_label:gs('state_tax_label','State Income Tax'),
        local_tax_rate:gn('local_tax_rate',0), local_tax_label:gs('local_tax_label','Local Tax'),
        other_deduction_rate:gn('other_deduction_rate',0), other_deduction_label:gs('other_deduction_label','Other Deductions'),
        currency:'USD', currency_symbol:'$'
      } : {
        country:'Canada', tax_calculation_enabled:enabled,
        pay_periods_per_year:gn('pay_periods_per_year',26), federal_use_brackets:gb('federal_use_brackets'),
        federal_flat_rate:gn('federal_flat_rate',20.5), cpp_rate:gn('cpp_rate',5.95),
        cpp_max_annual:gn('cpp_max_annual',3867.50), ei_rate:gn('ei_rate',1.66),
        ei_max_annual:gn('ei_max_annual',1049.12), provincial_tax_rate:gn('provincial_tax_rate',9.15),
        provincial_tax_label:gs('provincial_tax_label','Provincial Income Tax'),
        additional_tax_rate:gn('additional_tax_rate',0), additional_tax_label:gs('additional_tax_label','Additional Tax'),
        other_deduction_rate:gn('other_deduction_rate',0), other_deduction_label:gs('other_deduction_label','Other Deductions'),
        currency:'CAD', currency_symbol:'$'
      };
      btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Saving...';
      api('config/set', { key:'payroll_tax_config', value:JSON.stringify(newCfg) })
        .then(function() {
          _taxCfg=newCfg; window.WV_PAYROLL_TAX_CONFIG=newCfg;
          updateCountryBadge(); rerender();
          if(msgEl) msgEl.innerHTML='<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium mb-3 bg-green-50 text-green-700 border border-green-200"><i class="fas fa-check-circle"></i><span>Saved!</span></div>';
          btn.disabled=false; btn.innerHTML='<i class="fas fa-save mr-1.5 text-xs"></i>Save Tax Settings';
        })
        .catch(function(e) {
          if(msgEl) msgEl.innerHTML='<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium mb-3 bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle"></i><span>'+esc(e.message)+'</span></div>';
          btn.disabled=false; btn.innerHTML='<i class="fas fa-save mr-1.5 text-xs"></i>Save Tax Settings';
        });
    });
  }

  // ── Bulk Run Modal ────────────────────────────────────────────
  function openBulkRunModal() {
    var html =
      '<div class="sticky-header flex items-center justify-between">'+
        '<h3 class="font-extrabold text-slate-900 flex items-center gap-2"><i class="fas fa-bolt text-amber-500"></i>Bulk Pay Run</h3>'+
        '<button id="bulk-close" class="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 border-none bg-transparent cursor-pointer">✕</button>'+
      '</div>'+
      '<div class="px-6 py-5">'+
        '<div id="pr-msg"></div>'+
        '<p class="text-sm text-slate-600 mb-4">Generate Draft pay runs for multiple employees using their rates on record. You can edit each individually before approving.</p>'+
        '<div class="grid grid-cols-2 gap-3 mb-4">'+
          '<div class="pr-field"><label>Period Start <span class="text-red-400">*</span></label><input id="bulk-start" type="date" class="pr-input"></div>'+
          '<div class="pr-field"><label>Period End <span class="text-red-400">*</span></label><input id="bulk-end" type="date" class="pr-input"></div>'+
          '<div class="pr-field"><label style="display:block;margin-bottom:2px">Regular Hours</label><p style="font-size:10px;color:#94a3b8;margin:0 0 4px">optional — per employee</p><input id="bulk-hours" type="number" min="0" step="0.5" class="pr-input" placeholder="e.g. 80"></div>'+
          '<div class="pr-field"><label style="display:block;margin-bottom:2px">Overtime Hours</label><p style="font-size:10px;color:#94a3b8;margin:0 0 4px">optional</p><input id="bulk-hours-ot" type="number" min="0" step="0.5" class="pr-input" placeholder="e.g. 0"></div>'+
        '</div>'+
        '<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 max-h-48 overflow-y-auto">'+
          '<div class="flex items-center justify-between mb-2 px-1">'+
            '<span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Employees</span>'+
            '<button id="bulk-check-all" class="text-[10px] font-bold text-blue-600 cursor-pointer border-none bg-transparent">All</button>'+
          '</div>'+
          usersCache.map(function(u){
            var uid=u.user_id||u.id;
            var emp=empCache.find(function(e){return e.id===uid;})||{};
            // Resolve pay_type and rate from user record first (Users sheet), then empCache fallback
            var payType = u.pay_type || emp.pay_type || 'Hourly';
            var rate = payType==='Salary'
              ? (parseFloat(u.salary)||parseFloat(emp.salary)||0)
              : (parseFloat(u.hourly_rate)||parseFloat(emp.salary)||0);
            var rateLabel = rate ? (payType==='Salary' ? '$'+rate+'/yr' : '$'+rate+'/hr') : 'No rate set';
            return '<label class="flex items-center gap-3 py-1.5 cursor-pointer">'+
              '<input type="checkbox" class="bulk-emp-cb" value="'+esc(uid)+'" data-name="'+esc(u.name||u.email||uid)+'" data-rate="'+esc(rate)+'" data-paytype="'+esc(payType)+'" checked style="accent-color:#10b981">'+
              userAvatar(uid,'w-5 h-5 text-[10px]')+
              '<span class="text-sm text-slate-700 flex-1">'+esc(u.name||u.email||uid)+'</span>'+
              '<span class="text-xs '+(rate ? 'text-slate-400' : 'text-amber-500 font-semibold')+'">'+esc(payType)+' · '+esc(rateLabel)+'</span>'+
            '</label>';
          }).join('')+
        '</div>'+
        '<div class="flex gap-3">'+
          '<button id="bulk-cancel" class="btn-secondary flex-1">Cancel</button>'+
          '<button id="bulk-go" class="btn-primary flex-1" style="background:#10b981"><i class="fas fa-bolt mr-1.5 text-xs"></i>Generate Runs</button>'+
        '</div>'+
      '</div>';

    showModal(html, '540px');
    document.getElementById('bulk-close').addEventListener('click', closeModal);
    document.getElementById('bulk-cancel').addEventListener('click', closeModal);
    var checkAll = document.getElementById('bulk-check-all');
    if (checkAll) checkAll.addEventListener('click', function(){
      var all = document.querySelectorAll('.bulk-emp-cb');
      var anyUnchecked = Array.from(all).some(function(c){ return !c.checked; });
      all.forEach(function(c){ c.checked = anyUnchecked; });
    });
    document.getElementById('bulk-go').addEventListener('click', function() {
      var start   = document.getElementById('bulk-start').value;
      var end     = document.getElementById('bulk-end').value;
      if (!start) { modalMsg('Period start is required.', false); return; }
      if (!end)   { modalMsg('Period end is required.', false); return; }
      var selected = Array.from(document.querySelectorAll('.bulk-emp-cb:checked'));
      if (!selected.length) { modalMsg('Select at least one employee.', false); return; }
      var bulkHrs   = parseFloat(document.getElementById('bulk-hours').value)    || 0;
      var bulkHrsOT = parseFloat(document.getElementById('bulk-hours-ot').value) || 0;
      var btn=this; btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-xs mr-1"></i>Generating…';
      // Build all payloads first (unique IDs generated synchronously before any async calls)
      var payloads = selected.map(function(cb){
        var computed = computeRun({ pay_type:cb.dataset.paytype||'Hourly', rate:parseFloat(cb.dataset.rate)||0, hours_regular:bulkHrs, hours_ot:bulkHrsOT, bonuses:0, deductions:0 });
        return {
          id:            genId('PR'),
          employee_id:   cb.value,
          employee_name: cb.dataset.name,
          period_start:  start,
          period_end:    end,
          pay_type:      cb.dataset.paytype||'Hourly',
          rate:          String(parseFloat(cb.dataset.rate)||0),
          hours_regular: String(bulkHrs),
          hours_ot:      String(bulkHrsOT),
          hours_total:   String(computed.hours_total),
          gross:         String(computed.gross),
          net:           String(computed.net),
          tax_federal:   String(computed.tax_federal || 0),
          tax_fica:      String(computed.tax_fica    || 0),
          tax_state:     String(computed.tax_state   || 0),
          tax_total:     String(computed.tax_total   || 0),
          status:        'Draft',
          created_by:    myUserId(),
        };
      });
      // Run sequentially — failures are collected but do NOT abort the chain
      // so every employee always gets processed regardless of individual errors.
      var results = { ok: 0, fail: [] };
      payloads.reduce(function(chain, payload) {
        return chain.then(function() {
          return api('payroll/runs/create', payload)
            .then(function() { results.ok++; })
            .catch(function(e) { results.fail.push(payload.employee_name + ': ' + (e.message||'failed')); });
        });
      }, Promise.resolve()).then(function(){
        if (results.fail.length === 0) {
          toast('Created ' + results.ok + ' pay runs', 'success');
          closeModal(); loadData();
        } else if (results.ok > 0) {
          toast('Created ' + results.ok + ' of ' + payloads.length + ' pay runs', 'warning');
          modalMsg('Created ' + results.ok + ' pay run(s). Failed for: ' + results.fail.join('; '), false);
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt mr-1.5 text-xs"></i>Generate Runs';
          loadData();
        } else {
          modalMsg('All runs failed: ' + results.fail.join('; '), false);
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt mr-1.5 text-xs"></i>Generate Runs';
        }
      });
    });
  }

  // ── Payslip Modal ─────────────────────────────────────────────
  function openPayslip(r) {
    if (!r) return;
    var gross = calcGross(r), ded = calcDeductions(r), net = calcNet(r);
    var cfg   = STATUS_CFG[r.status]||STATUS_CFG['Draft'];
    var anom  = detectAnomaly(r, runsCache);
    var isPreview = r.id==='PREVIEW';

    // Audit trail for this run
    var runAudit = auditCache.filter(function(a){ return a.run_id===r.id; })
      .sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); });

    var html =
      // Dark header
      '<div class="bg-gradient-to-br from-slate-900 to-emerald-950 px-6 pt-6 pb-8 text-white relative">'+
        '<div class="absolute -right-4 -bottom-4 opacity-10"><i class="fas fa-money-bill-wave text-9xl"></i></div>'+
        (isPreview?'<div class="absolute top-4 left-4 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Preview</div>':'')+
        '<button id="ps-close" class="flex-shrink-0 w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-white hover:text-slate-600 transition-colors border-none bg-transparent cursor-pointer" style="position:absolute;top:1rem;right:1rem;z-index:10">✕</button>'+
        '<div class="text-xs font-bold uppercase tracking-widest opacity-60 mb-3">Payslip</div>'+
        '<div class="flex items-center gap-3 mb-4">'+
          '<div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-xl font-black">'+userInitial(r.employee_id)+'</div>'+
          '<div>'+
            '<div class="text-lg font-extrabold">'+esc(r.employee_name||userName(r.employee_id))+'</div>'+
            '<div class="text-xs opacity-70">'+esc(periodLabel(r.period_start,r.period_end))+(r.pay_type?' · '+esc(r.pay_type):'')+'</div>'+
            (r.id&&!isPreview?'<div class="text-[10px] font-mono opacity-50 mt-0.5">'+esc(r.id)+'</div>':'')+
          '</div>'+
        '</div>'+
        '<div class="bg-white/10 rounded-2xl px-5 py-4 text-center">'+
          '<div class="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Net Pay</div>'+
          '<div class="text-4xl font-black">'+fmtMoney(net)+'</div>'+
          '<div class="mt-2 flex items-center justify-center gap-2">'+statusBadge(r.status||'Draft')+'</div>'+
        '</div>'+
      '</div>'+

      // Three column: hours · earnings · deductions
      '<div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">'+
        '<div class="px-4 py-4 text-center">'+
          '<div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hours</div>'+
          '<div class="text-xl font-black text-slate-900">'+fmtHours(r.hours_total||r.overtime_hours||0)+'</div>'+
          (parseFloat(r.hours_ot||0)?'<div class="text-[10px] text-orange-500 font-semibold">'+fmtHours(r.hours_ot)+' OT</div>':'')+
        '</div>'+
        '<div class="px-4 py-4 text-center">'+
          '<div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gross</div>'+
          '<div class="text-xl font-black text-slate-900">'+fmtMoney(gross)+'</div>'+
          (r.rate?'<div class="text-[10px] text-slate-400">'+fmtMoney(r.rate)+'/hr</div>':'')+
        '</div>'+
        '<div class="px-4 py-4 text-center">'+
          '<div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Deductions</div>'+
          '<div class="text-xl font-black text-red-500">-'+fmtMoney(ded)+'</div>'+
        '</div>'+
      '</div>'+

      // Earnings + Deductions side by side
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">'+
        '<div class="px-5 py-4 border-r border-slate-100">'+
          '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><i class="fas fa-arrow-up text-emerald-500 text-[10px]"></i>Earnings</p>'+
          _lineItem('Base Salary', fmtMoney(r.gross_salary||r.gross||0), '')+
          (parseFloat(r.hours_ot||0)?_lineItem('Overtime ('+fmtHours(r.hours_ot)+' × '+fmtMoney(parseFloat(r.rate||0)*1.5)+'/hr)', fmtMoney((r.hours_ot||0)*(r.rate||0)*1.5), 'text-orange-600'):'') +
          (parseFloat(r.bonuses||r.bonus||0)?_lineItem('Bonus', fmtMoney(r.bonuses||r.bonus||0), 'text-emerald-600'):'') +
          '<div class="flex items-center justify-between mt-2 pt-2 border-t-2 border-slate-200">'+
            '<span class="text-xs font-extrabold text-slate-700 uppercase">Gross Total</span>'+
            '<span class="text-sm font-extrabold text-slate-900">'+fmtMoney(gross)+'</span>'+
          '</div>'+
        '</div>'+
        '<div class="px-5 py-4">'+
          '<p class="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><i class="fas fa-arrow-down text-red-400 text-[10px]"></i>Taxes &amp; Deductions</p>'+
          (function(){
            var cfg2 = getTaxCfg();
            var isCA = cfg2.country === 'Canada';
            var taxOn = cfg2.tax_calculation_enabled === true;
            var lines = '';
            // Only show tax breakdown lines if tax calculation is actively enabled
            if (taxOn) {
              if (isCA) {
                lines += (parseFloat(r.tax_federal||0)?_lineItem('Federal Tax (CRA)', '-'+fmtMoney(r.tax_federal), 'text-red-500'):'');
                lines += (parseFloat(r.tax_fica||0)?_lineItem('CPP + EI', '-'+fmtMoney(r.tax_fica), 'text-red-500'):'');
                lines += (parseFloat(r.tax_state||0)?_lineItem(cfg2.provincial_tax_label||'Provincial Tax', '-'+fmtMoney(r.tax_state), 'text-red-500'):'');
              } else {
                lines += (parseFloat(r.tax_federal||0)?_lineItem('Federal Tax (IRS)', '-'+fmtMoney(r.tax_federal), 'text-red-500'):'');
                lines += (parseFloat(r.tax_fica||0)?_lineItem('FICA (SS + Medicare)', '-'+fmtMoney(r.tax_fica), 'text-red-500'):'');
                lines += (parseFloat(r.tax_state||0)?_lineItem(cfg2.state_tax_label||'State Tax', '-'+fmtMoney(r.tax_state), 'text-red-500'):'');
              }
              // Fallback: old-style single tax field
              if (!parseFloat(r.tax_federal||0) && !parseFloat(r.tax_fica||0) && parseFloat(r.tax_total||r.tax||0)) {
                lines += _lineItem('Income Tax', '-'+fmtMoney(r.tax_total||r.tax||0), 'text-red-500');
              }
            }
            lines += (parseFloat(r.health_insurance||0)?_lineItem('Health Insurance', '-'+fmtMoney(r.health_insurance), 'text-red-500'):'');
            lines += (parseFloat(r.pension||0)?_lineItem('Pension / 401k', '-'+fmtMoney(r.pension), 'text-red-500'):'');
            lines += (parseFloat(r.deductions||r.other_deductions||0)?_lineItem(cfg2.other_deduction_label||'Other Deductions', '-'+fmtMoney(r.deductions||r.other_deductions||0), 'text-red-500'):'');
            return lines;
          })()
          '<div class="flex items-center justify-between mt-2 pt-2 border-t-2 border-slate-200">'+
            '<span class="text-xs font-extrabold text-slate-700 uppercase">Total Deductions</span>'+
            '<span class="text-sm font-extrabold text-red-600">-'+fmtMoney(ded)+'</span>'+
          '</div>'+
        '</div>'+
      '</div>'+

      // Anomaly + notes
      (anom&&!isFlagReviewed(r)?'<div class="mx-5 mb-2 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700"><i class="fas fa-exclamation-triangle text-red-400 mt-0.5 flex-shrink-0"></i><div class="flex-1"><strong>Anomaly:</strong> Net pay changed '+anom.pct+'% ('+anom.dir+') vs previous period. Review before approving.</div><button class="pr-flag-review flex-shrink-0 text-[10px] font-bold text-red-600 border border-red-300 bg-white hover:bg-red-50 rounded-lg px-2 py-1 cursor-pointer" data-id="'+esc(r.id)+'" title="Mark as reviewed">Mark Reviewed</button></div>':'')+
      (r.notes?'<div class="mx-5 mb-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600"><i class="fas fa-sticky-note text-slate-400 mr-1.5"></i>'+esc(r.notes)+'</div>':'')+

      // Audit mini-trail
      (runAudit.length&&!isPreview?
        '<div class="mx-5 mb-4">'+
          '<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">History</p>'+
          runAudit.slice(0,4).map(function(a){
            return '<div class="flex items-center gap-2 text-[10px] text-slate-500 py-0.5">'+
              '<i class="fas fa-circle text-[5px] text-slate-300"></i>'+
              '<span class="capitalize font-semibold text-slate-600">'+esc(a.action)+'</span>'+
              '<span>by '+esc(userName(a.performed_by)||'—')+'</span>'+
              '<span class="ml-auto text-slate-300">'+esc(fmtDate(a.created_at))+'</span>'+
            '</div>';
          }).join('')+
        '</div>':'') +

      // Actions
      '<div class="px-5 pb-5 flex gap-2 flex-wrap">'+
        (!isPreview&&isPayAdmin()&&r.status==='Draft'  ?'<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer" style="background:#f59e0b;color:#fff" data-action="submit"  data-id="'+esc(r.id)+'"><i class="fas fa-paper-plane mr-1.5 text-xs"></i>Submit</button>':'')+
        (!isPreview&&isPayAdmin()&&r.status==='Pending'?'<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer" style="background:#16a34a;color:#fff" data-action="approve" data-id="'+esc(r.id)+'"><i class="fas fa-check mr-1.5 text-xs"></i>Approve</button>':'')+
        (!isPreview&&isPayAdmin()&&r.status==='Approved'?'<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border-none cursor-pointer" style="background:#2563eb;color:#fff" data-action="pay" data-id="'+esc(r.id)+'"><i class="fas fa-dollar-sign mr-1.5 text-xs"></i>Mark Paid</button>':'')+
        (!isPreview&&isPayAdmin()&&r.status==='Draft'  ?'<button class="ps-act flex-1 py-2.5 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer" style="font-size:.875rem" data-action="edit" data-id="'+esc(r.id)+'"><i class="fas fa-pencil mr-1.5 text-xs"></i>Edit</button>':'')+
        (!isPreview?'<button id="ps-export" class="flex-1 py-2.5 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"><i class="fas fa-download mr-1.5 text-xs"></i>Export CSV</button>':'')+
      '</div>';

    showModal(html, '820px');
    document.getElementById('ps-close').addEventListener('click', closeModal);

    document.querySelectorAll('.ps-act').forEach(function(btn){
      btn.addEventListener('click', function(){
        var act=this.dataset.action, id=this.dataset.id;
        if (act==='submit')  { closeModal(); updateRunStatus(id,'Pending');  }
        if (act==='approve') { closeModal(); updateRunStatus(id,'Approved'); }
        if (act==='pay')     { closeModal(); updateRunStatus(id,'Paid');     }
        if (act==='edit')    { closeModal(); openRunForm(runsCache.find(function(r){ return r.id===id; })); }
      });
    });
    var expBtn = document.getElementById('ps-export');
    if (expBtn) expBtn.addEventListener('click', function(){ exportPayslipCSV(r); });
    // Wire flag review button inside payslip
    document.querySelectorAll('.pr-flag-review').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        markFlagReviewed(this.dataset.id);
        closeModal();
      });
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
        var msgs = { Paid:'Marked as paid!', Approved:'Run approved!', Void:'Run voided.', Pending:'Submitted for approval.' };
        toast(msgs[status]||'Status updated.', status==='Void'?'warning':'success');
        loadData();
      })
      .catch(function(e){ toast(e.message,'error'); });
  }

  // ── Export CSV ────────────────────────────────────────────────
  function exportPayslipCSV(r) {
    var rows = [
      ['Field','Value'],
      ['Run ID', r.id||''],
      ['Employee', r.employee_name||userName(r.employee_id)],
      ['Pay Period', periodLabel(r.period_start,r.period_end)],
      ['Pay Type', r.pay_type||''],
      ['Status', r.status||''],
      [''],
      ['Regular Hours', r.hours_regular||0],
      ['Overtime Hours', r.hours_ot||0],
      ['Total Hours', r.hours_total||0],
      ['Rate', r.rate||0],
      [''],
      ['Gross Earnings', calcGross(r)],
      ['Bonuses', r.bonuses||r.bonus||0],
      [''],
      ['Federal Tax', r.tax_federal||0],
      ['FICA', r.tax_fica||0],
      ['State Tax', r.tax_state||0],
      ['Total Tax', r.tax_total||r.tax||0],
      ['Other Deductions', r.deductions||r.other_deductions||0],
      ['Total Deductions', calcDeductions(r)],
      [''],
      ['NET PAY', calcNet(r)],
    ];
    var csv = rows.map(function(row){ return row.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = 'payslip-'+(r.employee_name||r.employee_id||'unknown').replace(/\s+/g,'-')+'-'+(r.period_start||'').replace(/\//g,'-')+'.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Payslip CSV downloaded','success');
  }

  function exportSummaryCSV(rows) {
    var headers = ['Employee','Period Start','Period End','Pay Type','Hours','Rate','Gross','Tax','Deductions','Net Pay','Status'];
    var data = rows.map(function(r){
      return [
        r.employee_name||userName(r.employee_id),
        r.period_start||'', r.period_end||'',
        r.pay_type||'',
        r.hours_total||r.overtime_hours||'',
        r.rate||'',
        calcGross(r), r.tax_total||r.tax||0,
        r.deductions||r.other_deductions||0,
        calcNet(r), r.status||'',
      ];
    });
    var csv = [headers].concat(data).map(function(row){
      return row.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = 'payroll-summary-'+new Date().toISOString().split('T')[0]+'.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Summary CSV downloaded','success');
  }

  // ── Boot ──────────────────────────────────────────────────────
  var old = document.getElementById(MODAL_ID);
  if (old) old.innerHTML = '';
  render();
};
