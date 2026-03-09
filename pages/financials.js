// ================================================================
//  WORK VOLT — pages/financials.js  v1.0.0
//  Cross-module feeds: Assets → expenses, Payroll → expenses,
//  Tasks (billable) → revenue, Timesheets (billable) → revenue
// ================================================================

(function() {
'use strict';

const api   = (path, params) => window.WorkVolt.api(path, params);
const toast = (msg, type)    => window.WorkVolt.toast(msg, type || 'info');
const user  = ()             => window.WorkVolt.user();

const fmt = {
  currency: n  => '$' + (parseFloat(n)||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }),
  date:     s  => s ? new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—',
  hours:    h  => { const n = parseFloat(h)||0; return n === Math.floor(n) ? n+'h' : n.toFixed(1)+'h'; },
  pct:      n  => (parseFloat(n)||0).toFixed(1)+'%',
};

const STATUS_COLORS = {
  'Paid':'bg-emerald-100 text-emerald-700','Unpaid':'bg-amber-100 text-amber-700',
  'Sent':'bg-blue-100 text-blue-700','Draft':'bg-slate-100 text-slate-600',
  'Overdue':'bg-red-100 text-red-700','Partial':'bg-orange-100 text-orange-700',
  'Approved':'bg-emerald-100 text-emerald-700','Pending':'bg-amber-100 text-amber-700',
  'Rejected':'bg-red-100 text-red-700','On Track':'bg-emerald-100 text-emerald-700',
  'Near Limit':'bg-amber-100 text-amber-700','Over Budget':'bg-red-100 text-red-700',
  'Invoiced':'bg-violet-100 text-violet-700',
};
const MODULE_BADGE = {
  assets:     '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700"><i class="fas fa-box-open text-[8px]"></i>Asset</span>',
  payroll:    '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700"><i class="fas fa-money-bill-wave text-[8px]"></i>Payroll</span>',
  tasks:      '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700"><i class="fas fa-check-circle text-[8px]"></i>Task</span>',
  timesheets: '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700"><i class="fas fa-clock text-[8px]"></i>Timesheet</span>',
};

function badge(status) {
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[status]||'bg-slate-100 text-slate-600'}">${status||'—'}</span>`;
}
function modBadge(mod) { return MODULE_BADGE[mod] || ''; }

// ── State ──────────────────────────────────────────────────────
let state = {
  tab: 'dashboard',
  dashboard: null,
  invoices: [], expenses: [], bills: [], budgets: [],
  accounts: [], costCenters: [], revenue: [],
  incomeStmt: null, balanceSheet: null, cashflow: null, budgetVA: null,
  crossSummary: null,
  filter: {
    invoices:  { status:'', search:'' },
    expenses:  { status:'', search:'', source:'' },
    bills:     { status:'', search:'' },
    revenue:   { source:'', status:'' },
  },
};
let container;

// ── Entry ──────────────────────────────────────────────────────
window.WorkVoltPages = window.WorkVoltPages || {};
window.WorkVoltPages.financials = function(el) {
  container = el;
  render();
  loadAll();
};

// ── Shell ──────────────────────────────────────────────────────
function render() {
  container.innerHTML = `
  <div class="flex flex-col h-full" style="font-family:'Plus Jakarta Sans',sans-serif;">
    <div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 class="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-8 h-8 bg-emerald-500 rounded-lg">
            <i class="fas fa-chart-line text-white text-sm"></i>
          </span>
          Financials
        </h1>
        <p class="text-xs text-slate-500 mt-0.5">Accounting · invoices · payroll · assets · billable work</p>
      </div>
      <div id="fin-header-actions" class="flex items-center gap-2"></div>
    </div>
    <div class="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto flex-shrink-0" id="fin-tabs">
      ${[
        {id:'dashboard', icon:'fa-th-large',             label:'Dashboard'},
        {id:'invoices',  icon:'fa-file-invoice-dollar',  label:'Invoices'},
        {id:'expenses',  icon:'fa-receipt',              label:'Expenses'},
        {id:'bills',     icon:'fa-file-alt',             label:'Bills'},
        {id:'revenue',   icon:'fa-hand-holding-usd',     label:'Billable Revenue'},
        {id:'budgets',   icon:'fa-wallet',               label:'Budgets'},
        {id:'reports',   icon:'fa-chart-pie',            label:'Reports'},
        {id:'accounts',  icon:'fa-list',                 label:'Accounts'},
      ].map(t=>`
        <button onclick="FinPage.tab('${t.id}')"
          class="fin-tab flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${state.tab===t.id?'border-emerald-500 text-emerald-600':'border-transparent text-slate-500 hover:text-slate-700'}"
          data-tab="${t.id}">
          <i class="fas ${t.icon} text-xs"></i>${t.label}
        </button>`).join('')}
    </div>
    <div class="flex-1 overflow-y-auto bg-slate-50" id="fin-content">
      <div class="flex items-center justify-center h-48">
        <i class="fas fa-circle-notch fa-spin text-emerald-500 text-2xl opacity-50"></i>
      </div>
    </div>
  </div>
  <style>
    .btn-fin{display:flex;align-items:center;gap:.4rem;padding:.5rem 1rem;border:none;border-radius:8px;font-size:.8125rem;font-weight:600;cursor:pointer;transition:background .15s;font-family:inherit}
    .btn-fin-primary{background:#10b981;color:#fff}.btn-fin-primary:hover{background:#059669}
    .btn-fin-secondary{background:#f1f5f9;color:#475569}.btn-fin-secondary:hover{background:#e2e8f0}
    .fin-input{width:100%;padding:.5rem .75rem;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.875rem;outline:none;font-family:inherit;background:#fff}
    .fin-input:focus{border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.12)}
  </style>`;
  window.FinPage = { tab: switchTab, refresh: loadAll };
}

function switchTab(t) {
  state.tab = t;
  document.querySelectorAll('.fin-tab').forEach(el => {
    const a = el.dataset.tab === t;
    el.classList.toggle('border-emerald-500', a); el.classList.toggle('text-emerald-600', a);
    el.classList.toggle('border-transparent', !a); el.classList.toggle('text-slate-500', !a);
  });
  updateHeaderActions();
  renderTab();
}

function updateHeaderActions() {
  const el = document.getElementById('fin-header-actions');
  if (!el) return;
  const map = {
    invoices: `<button onclick="showInvoiceModal()" class="btn-fin btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Invoice</button>`,
    expenses: `<button onclick="showExpenseModal()" class="btn-fin btn-fin-primary"><i class="fas fa-plus text-xs"></i>Log Expense</button>`,
    bills:    `<button onclick="showBillModal()"    class="btn-fin btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Bill</button>`,
    budgets:  `<button onclick="showBudgetModal()"  class="btn-fin btn-fin-primary"><i class="fas fa-plus text-xs"></i>Set Budget</button>`,
    accounts: `<button onclick="showAccountModal()" class="btn-fin btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Account</button>`,
    revenue:  `<button onclick="FinPage._syncAll()" class="btn-fin btn-fin-secondary"><i class="fas fa-sync-alt text-xs"></i>Refresh Feeds</button>`,
  };
  el.innerHTML = map[state.tab] || '';
  window.FinPage._syncAll = triggerFullSync;
}

// ── Data loading ──────────────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([
    loadDashboard(), loadInvoices(), loadExpenses(), loadBills(),
    loadBudgets(), loadAccounts(), loadCostCenters(), loadRevenue(), loadCrossModuleSummary(),
  ]);
  renderTab();
  updateHeaderActions();
}
async function loadDashboard()        { try { state.dashboard    = await api('financials/dashboard'); } catch(e){} }
async function loadInvoices()         { try { const d=await api('financials/invoices/list'); state.invoices=d.rows||[]; } catch(e){} }
async function loadExpenses()         { try { const d=await api('financials/expenses/list'); state.expenses=d.rows||[]; } catch(e){} }
async function loadBills()            { try { const d=await api('financials/bills/list');    state.bills=d.rows||[];    } catch(e){} }
async function loadRevenue()          { try { const d=await api('financials/revenue/list');  state.revenue=d.rows||[];  } catch(e){} }
async function loadAccounts()         { try { const d=await api('financials/accounts/list'); state.accounts=d.rows||[];} catch(e){} }
async function loadCostCenters()      { try { const d=await api('financials/cost-centers/list'); state.costCenters=d.rows||[]; } catch(e){} }
async function loadCrossModuleSummary(){ try { state.crossSummary=await api('financials/cross-module-summary'); } catch(e){} }
async function loadBudgets() {
  try {
    const now = new Date();
    state.budgetVA = await api('financials/budget-vs-actual', { year:String(now.getFullYear()), month:String(now.getMonth()+1).padStart(2,'0') });
    const d = await api('financials/budgets/list');
    state.budgets = d.rows || [];
  } catch(e) {}
}
async function loadReports() {
  try {
    const [is, bs, cf] = await Promise.allSettled([
      api('financials/income-statement'),
      api('financials/balance-sheet'),
      api('financials/cashflow'),
    ]);
    state.incomeStmt   = is.value;
    state.balanceSheet = bs.value;
    state.cashflow     = cf.value;
  } catch(e) {}
}

function renderTab() {
  const c = document.getElementById('fin-content');
  if (!c) return;
  ({dashboard:renderDashboard,invoices:renderInvoices,expenses:renderExpenses,bills:renderBills,revenue:renderRevenue,budgets:renderBudgets,reports:renderReports,accounts:renderAccounts}[state.tab]||renderDashboard)(c);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderDashboard(c) {
  const d   = state.dashboard || {};
  const cs  = state.crossSummary || { expenses:{assets:0,payroll:0,manual:0}, revenue:{tasks:0,timesheets:0} };
  const trend = d.monthly_trend || [];
  const expBreak = d.expense_breakdown || {};
  const maxBar = Math.max(...trend.map(t => Math.max(t.total_revenue||0, t.expenses||0)), 1);

  const trendBars = trend.map(t => {
    const revH = Math.round(((t.total_revenue||0)/maxBar)*100);
    const expH = Math.round(((t.expenses||0)/maxBar)*100);
    const label = (t.month||'').substring(5);
    return `<div class="flex flex-col items-center gap-1 flex-1">
      <div class="w-full flex items-end justify-center gap-0.5 h-16">
        <div class="w-3 rounded-t bg-emerald-400" style="height:${revH}%;min-height:2px" title="Revenue ${fmt.currency(t.total_revenue)}"></div>
        <div class="w-3 rounded-t bg-red-400"     style="height:${expH}%;min-height:2px" title="Expenses ${fmt.currency(t.expenses)}"></div>
      </div>
      <span class="text-[10px] text-slate-400 font-medium">${label}</span>
    </div>`;
  }).join('');

  const expEntries = Object.entries(expBreak).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const expTotal = expEntries.reduce((s,[,v])=>s+v,0)||1;
  const expList = expEntries.map(([cat,amt])=>{
    const pct = Math.round((amt/expTotal)*100);
    return `<div class="mb-2">
      <div class="flex justify-between text-xs mb-1"><span class="text-slate-600 font-medium truncate">${cat}</span><span class="text-slate-700 font-semibold ml-2">${fmt.currency(amt)}</span></div>
      <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full bg-emerald-400" style="width:${pct}%"></div></div>
    </div>`;
  }).join('') || '<p class="text-xs text-slate-400">No expense data yet</p>';

  c.innerHTML = `
  <div class="p-6 space-y-5 max-w-7xl mx-auto fade-in">

    <!-- KPI row 1 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${kpi('Invoice Revenue',   fmt.currency(d.month_revenue),     'fa-file-invoice',     'bg-emerald-50 text-emerald-600', 'paid invoices · month')}
      ${kpi('Billable Revenue',  fmt.currency(d.month_billable_rev), 'fa-hand-holding-usd', 'bg-blue-50 text-blue-600',     'tasks + timesheets · month')}
      ${kpi('Total Revenue',     fmt.currency(d.month_total_rev),    'fa-arrow-trend-up',   'bg-teal-50 text-teal-600',     'combined · month')}
      ${kpi('Net Profit',        fmt.currency(d.month_profit),       'fa-chart-line',       (d.month_profit||0)>=0?'bg-blue-50 text-blue-600':'bg-red-50 text-red-500', 'this month')}
    </div>
    <!-- KPI row 2 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${kpi('Total Expenses',    fmt.currency(d.month_expenses),  'fa-receipt',            'bg-red-50 text-red-500',       'this month')}
      ${kpi('Outstanding AR',    fmt.currency(d.outstanding_ar),  'fa-file-invoice-dollar','bg-amber-50 text-amber-600',   'receivable')}
      ${kpi('Bills Due',         fmt.currency(d.bills_due),       'fa-file-alt',           'bg-violet-50 text-violet-600', 'payable')}
      ${kpi('Overdue',           fmt.currency((d.overdue_ar||0)+(d.overdue_bills||0)), 'fa-exclamation-circle','bg-red-50 text-red-500','AR + bills')}
    </div>

    <!-- Cross-module breakdown -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- Expense sources -->
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <i class="fas fa-receipt text-red-400 text-xs"></i>Expense Sources
        </h3>
        <div class="space-y-2.5">
          ${expSourceBar('Asset Purchases',  cs.expenses.assets,  (cs.expenses.assets+cs.expenses.payroll+cs.expenses.manual)||1, 'bg-orange-400', 'fa-box-open text-orange-500')}
          ${expSourceBar('Payroll Runs',     cs.expenses.payroll, (cs.expenses.assets+cs.expenses.payroll+cs.expenses.manual)||1, 'bg-violet-400', 'fa-money-bill-wave text-violet-500')}
          ${expSourceBar('Manual Expenses',  cs.expenses.manual,  (cs.expenses.assets+cs.expenses.payroll+cs.expenses.manual)||1, 'bg-slate-400',  'fa-receipt text-slate-500')}
        </div>
      </div>
      <!-- Revenue sources -->
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <i class="fas fa-hand-holding-usd text-emerald-400 text-xs"></i>Revenue Sources
        </h3>
        <div class="space-y-2.5">
          ${expSourceBar('Paid Invoices',      d.month_revenue||0,     (d.month_total_rev||0)||1, 'bg-emerald-400', 'fa-file-invoice text-emerald-500')}
          ${expSourceBar('Billable Tasks',     cs.revenue.tasks,       (d.month_total_rev||0)||1, 'bg-blue-400',    'fa-check-circle text-blue-500')}
          ${expSourceBar('Billable Timesheets',cs.revenue.timesheets,  (d.month_total_rev||0)||1, 'bg-teal-400',    'fa-clock text-teal-500')}
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-slate-800 text-sm">Revenue vs Expenses — 6 Month Trend</h3>
          <div class="flex items-center gap-3 text-xs text-slate-500">
            <span class="flex items-center gap-1"><span class="w-3 h-1.5 rounded bg-emerald-400 inline-block"></span>Revenue</span>
            <span class="flex items-center gap-1"><span class="w-3 h-1.5 rounded bg-red-400 inline-block"></span>Expenses</span>
          </div>
        </div>
        <div class="flex items-end gap-1 h-24 px-2">${trendBars||'<p class="text-xs text-slate-400 m-auto">No trend data</p>'}</div>
        <div class="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
          ${trend.slice(-1).map(t=>`
            <div class="text-center"><p class="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Revenue</p><p class="text-sm font-extrabold text-emerald-600">${fmt.currency(t.total_revenue)}</p></div>
            <div class="text-center"><p class="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Expenses</p><p class="text-sm font-extrabold text-red-500">${fmt.currency(t.expenses)}</p></div>
            <div class="text-center"><p class="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Profit</p><p class="text-sm font-extrabold ${(t.profit||0)>=0?'text-blue-600':'text-red-500'}">${fmt.currency(t.profit)}</p></div>
          `).join('')||'<div class="col-span-3 text-center text-xs text-slate-400">No data</div>'}
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-bold text-slate-800 text-sm mb-4">Expense Breakdown</h3>
        ${expList}
      </div>
    </div>

    <!-- Quick actions -->
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h3 class="font-bold text-slate-800 text-sm mb-3">Quick Actions</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${qa('fa-file-invoice-dollar','New Invoice',  'invoices','emerald')}
        ${qa('fa-receipt',            'Log Expense',  'expenses','red')}
        ${qa('fa-file-alt',           'Add Bill',     'bills',   'violet')}
        ${qa('fa-hand-holding-usd',   'View Revenue', 'revenue', 'blue')}
      </div>
    </div>

  </div>`;
}

function kpi(label, value, icon, iconCls, sub) {
  return `<div class="bg-white rounded-xl border border-slate-200 p-4 card-hover">
    <div class="flex items-start justify-between">
      <div><p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">${label}</p>
        <p class="text-xl font-extrabold text-slate-900 mt-1">${value}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${sub}</p></div>
      <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls}">
        <i class="fas ${icon} text-sm"></i></div>
    </div></div>`;
}
function qa(icon, label, tab, color) {
  const cls = {emerald:'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',red:'bg-red-50 text-red-600 hover:bg-red-100',violet:'bg-violet-50 text-violet-600 hover:bg-violet-100',blue:'bg-blue-50 text-blue-600 hover:bg-blue-100'}[color];
  return `<button onclick="FinPage.tab('${tab}')" class="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 ${cls} transition-colors">
    <i class="fas ${icon} text-lg"></i><span class="text-xs font-semibold">${label}</span></button>`;
}
function expSourceBar(label, val, total, barColor, iconCls) {
  const pct = total > 0 ? Math.min(100, Math.round((val/total)*100)) : 0;
  return `<div>
    <div class="flex items-center justify-between text-xs mb-1">
      <span class="flex items-center gap-1.5 text-slate-600"><i class="fas ${iconCls} text-[10px]"></i>${label}</span>
      <span class="font-bold text-slate-700">${fmt.currency(val)} <span class="text-slate-400 font-normal">(${pct}%)</span></span>
    </div>
    <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="${barColor} h-full rounded-full" style="width:${pct}%"></div></div>
  </div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVOICES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderInvoices(c) {
  const f = state.filter.invoices;
  let rows = state.invoices;
  if (f.status) rows = rows.filter(r=>r.status===f.status);
  if (f.search) { const q=f.search.toLowerCase(); rows=rows.filter(r=>(r.customer||'').toLowerCase().includes(q)||(r.invoice_number||'').toLowerCase().includes(q)); }

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-48"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" placeholder="Search invoices..." value="${f.search}" oninput="FinPage._fi({search:this.value})" class="fin-input pl-8"></div>
      <select onchange="FinPage._fi({status:this.value})" class="fin-input w-auto">
        <option value="">All Statuses</option>
        ${['Draft','Sent','Paid','Partial','Overdue'].map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          ${['Invoice #','Customer','Issue Date','Due Date','Total','Balance Due','Status','Actions'].map(h=>`<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide ${h==='Actions'?'text-center':''}">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(inv=>`
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 font-semibold text-slate-800">${inv.invoice_number||'—'}</td>
              <td class="px-4 py-3 text-slate-600">${inv.customer||'—'}</td>
              <td class="px-4 py-3 text-slate-500">${fmt.date(inv.issue_date)}</td>
              <td class="px-4 py-3 text-slate-500">${fmt.date(inv.due_date)}</td>
              <td class="px-4 py-3 text-right font-bold text-slate-800">${fmt.currency(inv.total)}</td>
              <td class="px-4 py-3 text-right text-slate-600">${fmt.currency(inv.balance_due)}</td>
              <td class="px-4 py-3">${badge(inv.status)}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  ${inv.status==='Draft'?`<button onclick="FinPage._sendInv('${inv.id}')" class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-semibold">Send</button>`:''}
                  ${(inv.status==='Sent'||inv.status==='Overdue'||inv.status==='Partial')?`<button onclick="FinPage._payInv('${inv.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold">Mark Paid</button>`:''}
                  <button onclick="FinPage._editInv('${inv.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="FinPage._delInv('${inv.id}')"  class="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded"><i class="fas fa-trash text-xs"></i></button>
                </div>
              </td>
            </tr>`).join('') : `<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400"><i class="fas fa-file-invoice-dollar text-3xl mb-2 block opacity-30"></i>No invoices. <button onclick="showInvoiceModal()" class="text-emerald-600 font-semibold hover:underline">Create one</button></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
  window.FinPage._fi      = u => { Object.assign(state.filter.invoices, u); renderInvoices(c); };
  window.FinPage._sendInv = async id => { try { await api('financials/invoices/send',{id}); toast('Sent','success'); await loadInvoices(); renderInvoices(c); } catch(e){toast(e.message,'error');} };
  window.FinPage._payInv  = async id => { try { await api('financials/invoices/mark-paid',{id}); toast('Marked paid','success'); await loadInvoices(); renderInvoices(c); } catch(e){toast(e.message,'error');} };
  window.FinPage._editInv = id => { const inv=state.invoices.find(r=>r.id===id); if(inv) showInvoiceModal(inv); };
  window.FinPage._delInv  = async id => { if(!confirm('Delete invoice?')) return; try { await api('financials/invoices/delete',{id}); toast('Deleted','success'); await loadInvoices(); renderInvoices(c); } catch(e){toast(e.message,'error');} };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPENSES  (manual + cross-module)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderExpenses(c) {
  const f = state.filter.expenses;
  let rows = state.expenses;
  if (f.status) rows = rows.filter(r=>r.status===f.status);
  if (f.source) rows = rows.filter(r=>(r.source_module||'manual')===f.source);
  if (f.search) { const q=f.search.toLowerCase(); rows=rows.filter(r=>(r.vendor||'').toLowerCase().includes(q)||(r.description||'').toLowerCase().includes(q)); }

  const bySource = { assets:0, payroll:0, manual:0 };
  state.expenses.forEach(r=>{ const m=r.source_module||'manual'; bySource[m]=(bySource[m]||0)+(parseFloat(r.amount)||0); });

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <!-- Source summary pills -->
    <div class="flex flex-wrap gap-2 mb-4">
      ${sourcePill('All', '', f.source==='', 'slate', '_fe')}
      ${sourcePill('Asset Purchases', 'assets', f.source==='assets', 'orange', '_fe', bySource.assets)}
      ${sourcePill('Payroll', 'payroll', f.source==='payroll', 'violet', '_fe', bySource.payroll)}
      ${sourcePill('Manual', 'manual', f.source==='manual', 'slate', '_fe', bySource.manual)}
    </div>
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-48"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" placeholder="Search expenses..." value="${f.search}" oninput="FinPage._fe({search:this.value})" class="fin-input pl-8"></div>
      <select onchange="FinPage._fe({status:this.value})" class="fin-input w-auto">
        <option value="">All Statuses</option>
        ${['Pending','Approved','Rejected'].map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          ${['Date','Vendor / Source','Category','Description','Source','Amount','Status','Actions'].map(h=>`<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(e => {
            const isCrossModule = e.source_module && e.source_module !== '';
            return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors ${isCrossModule?'bg-slate-50/50':''}">
              <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${fmt.date(e.date)}</td>
              <td class="px-4 py-3 font-medium text-slate-800">${e.vendor||'—'}</td>
              <td class="px-4 py-3 text-slate-600">${e.category||'—'}</td>
              <td class="px-4 py-3 text-slate-500 max-w-xs truncate">${e.description||'—'}</td>
              <td class="px-4 py-3">${modBadge(e.source_module)||'<span class="text-xs text-slate-400">Manual</span>'}</td>
              <td class="px-4 py-3 text-right font-bold text-slate-800">${fmt.currency(e.amount)}</td>
              <td class="px-4 py-3">${badge(e.status)}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  ${!isCrossModule && e.status==='Pending' ? `
                    <button onclick="FinPage._appExp('${e.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold">Approve</button>
                    <button onclick="FinPage._rejExp('${e.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 font-semibold">Reject</button>
                  ` : ''}
                  ${!isCrossModule ? `<button onclick="FinPage._editExp('${e.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"><i class="fas fa-edit text-xs"></i></button>` : ''}
                  ${isCrossModule ? '<span class="text-[10px] text-slate-400 italic">auto-synced</span>' : `<button onclick="FinPage._delExp('${e.id}')" class="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded"><i class="fas fa-trash text-xs"></i></button>`}
                </div>
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400"><i class="fas fa-receipt text-3xl mb-2 block opacity-30"></i>No expenses. <button onclick="showExpenseModal()" class="text-emerald-600 font-semibold hover:underline">Log one</button></td></tr>`}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-slate-400 mt-3 flex items-center gap-1"><i class="fas fa-info-circle"></i>Auto-synced entries come from Assets (purchases), and Payroll (runs). Edit them in their source modules.</p>
  </div>`;

  window.FinPage._fe      = u => { Object.assign(state.filter.expenses, u); renderExpenses(c); };
  window.FinPage._appExp  = async id => { try { await api('financials/expenses/approve',{id,approved_by:user()?.name||''}); toast('Approved','success'); await loadExpenses(); renderExpenses(c); } catch(e){toast(e.message,'error');} };
  window.FinPage._rejExp  = async id => { try { await api('financials/expenses/reject', {id,approved_by:user()?.name||''}); toast('Rejected','info');   await loadExpenses(); renderExpenses(c); } catch(e){toast(e.message,'error');} };
  window.FinPage._editExp = id => { const e=state.expenses.find(r=>r.id===id); if(e) showExpenseModal(e); };
  window.FinPage._delExp  = async id => { if(!confirm('Delete?')) return; try { await api('financials/expenses/delete',{id}); toast('Deleted','success'); await loadExpenses(); renderExpenses(c); } catch(e){toast(e.message,'error');} };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BILLS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderBills(c) {
  const f = state.filter.bills;
  let rows = state.bills;
  if (f.status) rows=rows.filter(r=>r.status===f.status);
  if (f.search) { const q=f.search.toLowerCase(); rows=rows.filter(r=>(r.vendor||'').toLowerCase().includes(q)); }

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-48"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" placeholder="Search bills..." value="${f.search}" oninput="FinPage._fb({search:this.value})" class="fin-input pl-8"></div>
      <select onchange="FinPage._fb({status:this.value})" class="fin-input w-auto">
        <option value="">All Statuses</option>
        ${['Unpaid','Partial','Paid','Overdue'].map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          ${['Bill #','Vendor','Category','Due Date','Amount','Balance','Status','Actions'].map(h=>`<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(b=>`
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 font-semibold text-slate-800">${b.bill_number||'—'}</td>
              <td class="px-4 py-3 text-slate-600">${b.vendor||'—'}</td>
              <td class="px-4 py-3 text-slate-500">${b.category||'—'}</td>
              <td class="px-4 py-3 text-slate-500">${fmt.date(b.due_date)}</td>
              <td class="px-4 py-3 text-right font-bold text-slate-800">${fmt.currency(b.amount)}</td>
              <td class="px-4 py-3 text-right text-slate-600">${fmt.currency(b.balance_due)}</td>
              <td class="px-4 py-3">${badge(b.status)}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  ${b.status!=='Paid'?`<button onclick="FinPage._payBill('${b.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold">Pay</button>`:''}
                  <button onclick="FinPage._editBill('${b.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="FinPage._delBill('${b.id}')"  class="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded"><i class="fas fa-trash text-xs"></i></button>
                </div>
              </td>
            </tr>`).join('') : `<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400"><i class="fas fa-file-alt text-3xl mb-2 block opacity-30"></i>No bills. <button onclick="showBillModal()" class="text-emerald-600 font-semibold hover:underline">Add one</button></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
  window.FinPage._fb       = u => { Object.assign(state.filter.bills, u); renderBills(c); };
  window.FinPage._payBill  = id => showPaymentModal(id, 'bill');
  window.FinPage._editBill = id => { const b=state.bills.find(r=>r.id===id); if(b) showBillModal(b); };
  window.FinPage._delBill  = async id => { if(!confirm('Delete bill?')) return; try { await api('financials/bills/delete',{id}); toast('Deleted','success'); await loadBills(); renderBills(c); } catch(e){toast(e.message,'error');} };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BILLABLE REVENUE (tasks + timesheets feed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderRevenue(c) {
  const f = state.filter.revenue;
  let rows = state.revenue;
  if (f.source) rows=rows.filter(r=>r.source_module===f.source);
  if (f.status) rows=rows.filter(r=>r.status===f.status);

  const totalAmt   = rows.reduce((s,r)=>s+(parseFloat(r.amount)||0), 0);
  const totalHours = rows.reduce((s,r)=>s+(parseFloat(r.hours)||0), 0);
  const taskRows   = rows.filter(r=>r.source_module==='tasks');
  const tsRows     = rows.filter(r=>r.source_module==='timesheets');

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <!-- Summary KPIs -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      ${kpi('Total Billable',fmt.currency(totalAmt),'fa-hand-holding-usd','bg-emerald-50 text-emerald-600',rows.length+' entries')}
      ${kpi('From Tasks',fmt.currency(taskRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0)),'fa-check-circle','bg-blue-50 text-blue-600',taskRows.length+' tasks')}
      ${kpi('From Timesheets',fmt.currency(tsRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0)),'fa-clock','bg-teal-50 text-teal-600',tsRows.length+' entries')}
      ${kpi('Total Hours',fmt.hours(totalHours),'fa-stopwatch','bg-amber-50 text-amber-600','billable hours')}
    </div>

    <!-- Filter pills -->
    <div class="flex flex-wrap gap-2 mb-4">
      ${sourcePill('All Sources', '', f.source==='', 'slate', '_fr')}
      ${sourcePill('Tasks', 'tasks', f.source==='tasks', 'blue', '_fr')}
      ${sourcePill('Timesheets', 'timesheets', f.source==='timesheets', 'teal', '_fr')}
      <div class="ml-auto">
        <select onchange="FinPage._fr({status:this.value})" class="fin-input w-auto text-xs">
          <option value="">All Statuses</option>
          ${['Pending','Approved','Invoiced'].map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          ${['Date','Source','Description','Employee','Project','Hours','Rate','Amount','Status','Actions'].map(h=>`<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(r=>`
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${fmt.date(r.date)}</td>
              <td class="px-4 py-3">${modBadge(r.source_module)}</td>
              <td class="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">${r.description||'—'}</td>
              <td class="px-4 py-3 text-slate-600">${r.employee||'—'}</td>
              <td class="px-4 py-3 text-slate-500">${r.project||'—'}</td>
              <td class="px-4 py-3 text-slate-600">${r.hours?fmt.hours(r.hours):'—'}</td>
              <td class="px-4 py-3 text-slate-600">${r.rate?fmt.currency(r.rate)+'/hr':'—'}</td>
              <td class="px-4 py-3 text-right font-bold text-emerald-700">${fmt.currency(r.amount)}</td>
              <td class="px-4 py-3">${badge(r.status)}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  ${r.status==='Approved'?`<button onclick="FinPage._invoiceRev('${r.id}')" class="px-2 py-1 text-xs bg-violet-50 text-violet-600 rounded hover:bg-violet-100 font-semibold">Invoice</button>`:''}
                  ${r.status==='Pending'?`<button onclick="FinPage._approveRev('${r.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold">Approve</button>`:''}
                  <span class="text-[10px] text-slate-400 italic">auto-synced</span>
                </div>
              </td>
            </tr>`).join('') : `
            <tr><td colspan="10" class="px-4 py-12 text-center text-slate-400">
              <i class="fas fa-hand-holding-usd text-3xl mb-2 block opacity-30"></i>
              No billable revenue synced yet. Mark tasks or timesheets as billable and approve them — they'll appear here automatically.
            </td></tr>`}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-slate-400 mt-3 flex items-center gap-1"><i class="fas fa-info-circle"></i>Revenue entries are auto-created when billable tasks are completed or billable timesheet entries are approved. Use "Invoice" to convert to a formal invoice.</p>
  </div>`;

  window.FinPage._fr = u => { Object.assign(state.filter.revenue, u); renderRevenue(c); };
  window.FinPage._approveRev = async id => {
    try { await api('financials/revenue/update',{id,status:'Approved'}); toast('Approved','success'); await loadRevenue(); renderRevenue(c); } catch(e){toast(e.message,'error');}
  };
  window.FinPage._invoiceRev = async id => {
    const rev = state.revenue.find(r=>r.id===id);
    if (!rev) return;
    try {
      // Create an invoice from this billable entry
      const d = await api('financials/invoices/create', {
        customer:    rev.client || rev.employee || 'Client',
        issue_date:  new Date().toISOString().split('T')[0],
        due_date:    '',
        total:       rev.amount,
        subtotal:    rev.amount,
        notes:       rev.description,
        status:      'Draft',
      });
      await api('financials/revenue/update',{id,status:'Invoiced'});
      toast('Invoice '+d.invoice_number+' created','success');
      await Promise.all([loadInvoices(), loadRevenue()]);
      renderRevenue(c);
    } catch(e) { toast(e.message,'error'); }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUDGETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderBudgets(c) {
  const lines = state.budgetVA?.lines || [];
  const now = new Date();
  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-base font-bold text-slate-800">Budget vs Actual — ${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}</h2>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          ${['Category','Budget','Actual','Variance','Progress','Status',''].map(h=>`<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${lines.length ? lines.map(l=>{
            const pct=l.budget>0?Math.min(100,Math.round((l.actual/l.budget)*100)):0;
            const bc=pct>100?'bg-red-500':pct>90?'bg-amber-400':'bg-emerald-400';
            return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 font-medium text-slate-800">${l.category}</td>
              <td class="px-4 py-3 text-right text-slate-600">${fmt.currency(l.budget)}</td>
              <td class="px-4 py-3 text-right font-semibold text-slate-800">${fmt.currency(l.actual)}</td>
              <td class="px-4 py-3 text-right font-semibold ${l.variance>=0?'text-emerald-600':'text-red-500'}">${l.variance>=0?'+':''}${fmt.currency(l.variance)}</td>
              <td class="px-4 py-3 w-32"><div class="flex items-center gap-2"><div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="${bc} h-full rounded-full" style="width:${pct}%"></div></div><span class="text-xs text-slate-500 w-8 text-right">${pct}%</span></div></td>
              <td class="px-4 py-3">${badge(l.status)}</td>
              <td class="px-4 py-3"><button onclick="FinPage._editBudget('${l.category}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"><i class="fas fa-edit text-xs"></i></button></td>
            </tr>`;
          }).join('') : `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-400"><i class="fas fa-wallet text-3xl mb-2 block opacity-30"></i>No budgets set. <button onclick="showBudgetModal()" class="text-emerald-600 font-semibold hover:underline">Set one</button></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
  window.FinPage._editBudget = cat => { const b=state.budgets.find(r=>r.category===cat); showBudgetModal(b); };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderReports(c) {
  if (!state.incomeStmt) {
    c.innerHTML = `<div class="flex items-center justify-center h-48"><i class="fas fa-circle-notch fa-spin text-emerald-500 text-2xl opacity-50"></i></div>`;
    loadReports().then(() => renderReports(c));
    return;
  }
  const is = state.incomeStmt || {}, bs = state.balanceSheet || {}, cf = state.cashflow || {};
  const isRev = is.revenue || {}, isExp = is.expenses || {};

  c.innerHTML = `
  <div class="p-6 max-w-5xl mx-auto fade-in space-y-5">

    <!-- Income Statement -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center"><i class="fas fa-chart-line text-emerald-600 text-xs"></i></span>
        Income Statement
      </h3>
      <div class="space-y-0.5">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Revenue</p>
        ${rl('Invoice Revenue (paid)',       fmt.currency(isRev.invoices),       'text-emerald-600')}
        ${rl('Billable Tasks Revenue',       fmt.currency(isRev.billable_tasks), 'text-blue-600 flex items-center gap-1', modBadge('tasks'))}
        ${rl('Billable Timesheet Revenue',   fmt.currency(isRev.billable_hours), 'text-teal-600 flex items-center gap-1', modBadge('timesheets'))}
        ${rl('Total Revenue',               fmt.currency(isRev.total),          'font-bold text-slate-800')}
        <div class="h-px bg-slate-100 my-2"></div>
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Operating Expenses</p>
        ${Object.entries(isExp.by_category||{}).map(([cat,amt])=>rl(cat, fmt.currency(amt), 'text-slate-600')).join('')}
        <div class="h-px bg-slate-50 my-1"></div>
        ${rl('From Asset Purchases', fmt.currency(isExp.from_assets),  'text-orange-600 text-xs', modBadge('assets'))}
        ${rl('From Payroll Runs',    fmt.currency(isExp.from_payroll), 'text-violet-600 text-xs', modBadge('payroll'))}
        ${rl('Total Expenses',       fmt.currency(isExp.total),        'font-bold text-slate-800')}
        <div class="h-px bg-slate-100 my-2"></div>
        ${rl('Net Profit / (Loss)', fmt.currency(is.net_profit), `font-extrabold text-xl ${(is.net_profit||0)>=0?'text-emerald-600':'text-red-500'}`)}
        ${rl('Profit Margin',       fmt.pct(is.profit_margin),  'text-slate-500 text-sm')}
      </div>
    </div>

    <!-- Balance Sheet -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center"><i class="fas fa-balance-scale text-blue-600 text-xs"></i></span>
        Balance Sheet
        ${bs.balanced?'<span class="ml-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Balanced</span>':''}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Assets</p>
          ${rl('Accounts Receivable', fmt.currency(bs.assets?.accounts_receivable), 'text-slate-600')}
          ${rl('Total Assets',        fmt.currency(bs.assets?.total),              'font-bold text-slate-800')}</div>
        <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Liabilities</p>
          ${rl('Accounts Payable', fmt.currency(bs.liabilities?.accounts_payable), 'text-slate-600')}
          ${rl('Total Liabilities', fmt.currency(bs.liabilities?.total),           'font-bold text-slate-800')}</div>
        <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Equity</p>
          ${rl('Retained Earnings', fmt.currency(bs.equity?.retained_earnings), 'text-slate-600')}
          ${rl('Total Equity',      fmt.currency(bs.equity?.total),             'font-bold text-slate-800')}</div>
      </div>
    </div>

    <!-- Cash Flow -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center"><i class="fas fa-water text-violet-600 text-xs"></i></span>
        Cash Flow Statement
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Operating Activities</p>
          ${rl('Inflows (invoices + billable)', fmt.currency(cf.operating?.inflow),  'text-emerald-600')}
          ${rl('Outflows (expenses)',           fmt.currency(cf.operating?.outflow), 'text-red-500')}
          ${rl('Net Operating',                fmt.currency(cf.operating?.net),     'font-bold text-slate-800')}</div>
        <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Investing</p>${rl('Net Investing',fmt.currency(0),'font-bold text-slate-800')}</div>
        <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Financing</p>${rl('Net Financing',fmt.currency(0),'font-bold text-slate-800')}</div>
      </div>
      <div class="mt-4 pt-4 border-t border-slate-100">
        ${rl('Net Cash Flow', fmt.currency(cf.net_cash_flow), `font-extrabold text-lg ${(cf.net_cash_flow||0)>=0?'text-emerald-600':'text-red-500'}`)}
      </div>
    </div>

    <div class="text-center">
      <button onclick="loadReports().then(()=>renderReports(document.getElementById('fin-content')))" class="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg font-semibold">
        <i class="fas fa-sync-alt mr-2"></i>Refresh Reports
      </button>
    </div>
  </div>`;
}

function rl(label, value, cls='', prefix='') {
  return `<div class="flex items-center justify-between py-1.5">
    <span class="text-sm text-slate-600 flex items-center gap-1.5">${prefix}${label}</span>
    <span class="text-sm font-semibold ${cls}">${value}</span>
  </div>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACCOUNTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderAccounts(c) {
  const typeOrder = ['Asset','Liability','Equity','Revenue','Expense'];
  const grouped = {}; typeOrder.forEach(t=>grouped[t]=[]);
  state.accounts.forEach(a=>{ if(grouped[a.type]) grouped[a.type].push(a); });
  const tColors = {Asset:'bg-blue-50 text-blue-700',Liability:'bg-red-50 text-red-700',Equity:'bg-violet-50 text-violet-700',Revenue:'bg-emerald-50 text-emerald-700',Expense:'bg-amber-50 text-amber-700'};

  c.innerHTML = `
  <div class="p-6 max-w-5xl mx-auto fade-in space-y-4">
    ${typeOrder.map(type=>{
      const rows=grouped[type]||[];
      if(!rows.length) return '';
      return `<div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-full text-xs font-bold ${tColors[type]}">${type}</span>
          <span class="text-xs text-slate-400">${rows.length} accounts</span>
        </div>
        <table class="w-full text-sm"><tbody>
          ${rows.map(a=>`
            <tr class="border-b border-slate-50 last:border-0 hover:bg-slate-50">
              <td class="px-4 py-3 font-mono text-xs text-slate-400 w-20">${a.account_number}</td>
              <td class="px-4 py-3 font-semibold text-slate-800">${a.account_name}</td>
              <td class="px-4 py-3 text-slate-500">${a.category}</td>
              <td class="px-4 py-3 text-slate-400 text-xs truncate max-w-xs">${a.description||'—'}</td>
              <td class="px-4 py-3 text-center">${a.is_active!=='false'?'<span class="text-xs text-emerald-600 font-semibold">Active</span>':'<span class="text-xs text-slate-400">Inactive</span>'}</td>
              <td class="px-4 py-3 text-center"><button onclick="FinPage._editAcc('${a.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"><i class="fas fa-edit text-xs"></i></button></td>
            </tr>`).join('')}
        </tbody></table>
      </div>`;
    }).join('')}
    ${!state.accounts.length?`<div class="text-center py-12 text-slate-400"><i class="fas fa-list text-3xl mb-2 block opacity-30"></i>No accounts. They seed automatically on install.</div>`:''}
  </div>`;
  window.FinPage._editAcc = id => { const a=state.accounts.find(r=>r.id===id); if(a) showAccountModal(a); };
}

// ── Helper: source filter pill ─────────────────────────────────
function sourcePill(label, value, active, color, fnKey, amount) {
  const colors = { slate:'bg-slate-100 text-slate-600', orange:'bg-orange-100 text-orange-700', violet:'bg-violet-100 text-violet-700', blue:'bg-blue-100 text-blue-700', teal:'bg-teal-100 text-teal-700' };
  const ac = active ? `ring-2 ring-offset-1 ring-${color}-400` : '';
  return `<button onclick="FinPage['${fnKey}']({source:'${value}'})" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${colors[color]||colors.slate} ${ac} transition-all">
    ${label}${amount!==undefined?` <span class="font-bold">${fmt.currency(amount)}</span>`:''}
  </button>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODALS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function modal(title, body, footer) {
  closeModal();
  const el = document.createElement('div');
  el.id = 'fin-modal';
  el.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm';
  el.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-[slideUp_.25s_cubic-bezier(.16,1,.3,1)]" style="font-family:'Plus Jakarta Sans',sans-serif">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 class="font-bold text-slate-900 text-base">${title}</h3>
        <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"><i class="fas fa-times text-sm"></i></button>
      </div>
      <div class="p-5 overflow-y-auto flex-1 space-y-3">${body}</div>
      <div class="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">${footer}</div>
    </div>`;
  document.getElementById('modals-root').appendChild(el);
  el.addEventListener('click', e => { if (e.target===el) closeModal(); });
}
window.closeModal = () => { const el=document.getElementById('fin-modal'); if(el) el.remove(); };

function fi(label, name, type='text', value='', extra='') {
  return `<div><label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
    <input type="${type}" name="${name}" value="${value||''}" ${extra} class="fin-input"></div>`;
}
function fs(label, name, options, value='') {
  const opts = options.map(o=>{const v=typeof o==='string'?o:o.value,l=typeof o==='string'?o:o.label;return `<option value="${v}" ${v===value?'selected':''}>${l}</option>`;}).join('');
  return `<div><label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
    <select name="${name}" class="fin-input">${opts}</select></div>`;
}
function getForm(id) {
  const f=document.getElementById(id); return f?Object.fromEntries(new FormData(f).entries()):{};
}

const EXP_CATS = ['Salaries & Wages','Software & Subscriptions','Travel & Entertainment','Office Supplies','Marketing & Advertising','Professional Services','Rent & Utilities','Cost of Goods Sold','Equipment','Other Expenses'];

function showInvoiceModal(inv=null) {
  const today = new Date().toISOString().split('T')[0];
  modal(inv?'Edit Invoice':'New Invoice',
    `<form id="inv-form" class="space-y-3">
      ${fi('Customer Name','customer','text',inv?.customer)}
      ${fi('Customer Email','customer_email','email',inv?.customer_email)}
      <div class="grid grid-cols-2 gap-3">${fi('Issue Date','issue_date','date',inv?.issue_date||today)}${fi('Due Date','due_date','date',inv?.due_date)}</div>
      <div class="grid grid-cols-2 gap-3">${fi('Subtotal ($)','subtotal','number',inv?.subtotal,'step="0.01" min="0"')}${fi('Tax Rate (%)','tax_rate','number',inv?.tax_rate||'0','step="0.1" min="0" max="100"')}</div>
      ${fi('Total ($)','total','number',inv?.total,'step="0.01" min="0"')}
      ${fs('Status','status',['Draft','Sent','Unpaid','Paid'],inv?.status||'Draft')}
      <div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label><textarea name="notes" rows="2" class="fin-input">${inv?.notes||''}</textarea></div>
    </form>`,
    `<button onclick="closeModal()" class="btn-fin btn-fin-secondary">Cancel</button>
     <button onclick="FinPage._saveInv(${inv?`'${inv.id}'`:'null'})" class="btn-fin btn-fin-primary">${inv?'Save':'Create Invoice'}</button>`
  );
  window.FinPage._saveInv = async id => {
    const data=getForm('inv-form');
    if(!data.customer||!data.total){toast('Customer and total required','error');return;}
    try {
      if(id){data.id=id;await api('financials/invoices/update',data);toast('Updated','success');}
      else {await api('financials/invoices/create',data);toast('Invoice created','success');}
      closeModal(); await loadInvoices();
      const c=document.getElementById('fin-content');if(c)renderInvoices(c);
    } catch(e){toast(e.message,'error');}
  };
}

function showExpenseModal(exp=null) {
  const today=new Date().toISOString().split('T')[0];
  modal(exp?'Edit Expense':'Log Expense',
    `<form id="exp-form" class="space-y-3">
      ${fi('Date','date','date',exp?.date||today)}
      ${fi('Vendor','vendor','text',exp?.vendor)}
      ${fs('Category','category',EXP_CATS,exp?.category||EXP_CATS[0])}
      ${fi('Description','description','text',exp?.description)}
      <div class="grid grid-cols-2 gap-3">${fi('Amount ($)','amount','number',exp?.amount,'step="0.01" min="0"')}${fi('Paid From','paid_from','text',exp?.paid_from||'Cash & Bank')}</div>
      ${fs('Status','status',['Pending','Approved','Rejected'],exp?.status||'Pending')}
    </form>`,
    `<button onclick="closeModal()" class="btn-fin btn-fin-secondary">Cancel</button>
     <button onclick="FinPage._saveExp(${exp?`'${exp.id}'`:'null'})" class="btn-fin btn-fin-primary">${exp?'Save':'Log Expense'}</button>`
  );
  window.FinPage._saveExp = async id => {
    const data=getForm('exp-form');
    if(!data.amount){toast('Amount required','error');return;}
    try {
      if(id){data.id=id;await api('financials/expenses/update',data);toast('Updated','success');}
      else {await api('financials/expenses/create',data);toast('Expense logged','success');}
      closeModal(); await loadExpenses();
      const c=document.getElementById('fin-content');if(c)renderExpenses(c);
    } catch(e){toast(e.message,'error');}
  };
}

function showBillModal(bill=null) {
  const today=new Date().toISOString().split('T')[0];
  modal(bill?'Edit Bill':'New Bill',
    `<form id="bill-form" class="space-y-3">
      ${fi('Vendor','vendor','text',bill?.vendor)}
      ${fi('Vendor Email','vendor_email','email',bill?.vendor_email)}
      <div class="grid grid-cols-2 gap-3">${fi('Issue Date','issue_date','date',bill?.issue_date||today)}${fi('Due Date','due_date','date',bill?.due_date)}</div>
      ${fs('Category','category',EXP_CATS,bill?.category||EXP_CATS[0])}
      ${fi('Amount ($)','amount','number',bill?.amount,'step="0.01" min="0"')}
      ${fs('Status','status',['Unpaid','Partial','Paid','Overdue'],bill?.status||'Unpaid')}
      <div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label><textarea name="notes" rows="2" class="fin-input">${bill?.notes||''}</textarea></div>
    </form>`,
    `<button onclick="closeModal()" class="btn-fin btn-fin-secondary">Cancel</button>
     <button onclick="FinPage._saveBill(${bill?`'${bill.id}'`:'null'})" class="btn-fin btn-fin-primary">${bill?'Save':'Add Bill'}</button>`
  );
  window.FinPage._saveBill = async id => {
    const data=getForm('bill-form');
    if(!data.vendor||!data.amount){toast('Vendor and amount required','error');return;}
    try {
      if(id){data.id=id;await api('financials/bills/update',data);toast('Updated','success');}
      else {await api('financials/bills/create',data);toast('Bill added','success');}
      closeModal(); await loadBills();
      const c=document.getElementById('fin-content');if(c)renderBills(c);
    } catch(e){toast(e.message,'error');}
  };
}

function showPaymentModal(refId, refType='bill') {
  const today=new Date().toISOString().split('T')[0];
  const ref = refType==='bill' ? state.bills.find(r=>r.id===refId) : state.invoices.find(r=>r.id===refId);
  modal('Record Payment',
    `<form id="pay-form" class="space-y-3">
      <div class="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
        Payment for: <span class="font-bold text-slate-800">${ref?(ref.bill_number||ref.invoice_number||ref.vendor||ref.customer):refId}</span>
        ${ref?` — Balance: <span class="font-bold text-red-500">${fmt.currency(ref.balance_due)}</span>`:''}
      </div>
      ${fi('Date','date','date',today)}
      ${fi('Amount ($)','amount','number',ref?.balance_due||'','step="0.01" min="0"')}
      ${fs('Method','method',['Bank Transfer','Cash','Credit Card','PayPal','Stripe','Check'],'')}
      ${fi('Account','account','text','Cash & Bank')}
      ${fi('Reference / Notes','notes','text','')}
      <input type="hidden" name="reference_id" value="${refId}">
      <input type="hidden" name="reference_type" value="${refType}">
    </form>`,
    `<button onclick="closeModal()" class="btn-fin btn-fin-secondary">Cancel</button>
     <button onclick="FinPage._savePay()" class="btn-fin btn-fin-primary">Record Payment</button>`
  );
  window.FinPage._savePay = async () => {
    const data=getForm('pay-form');
    if(!data.amount){toast('Amount required','error');return;}
    data.created_by=user()?.name||'';
    try {
      await api('financials/payments/create',data); toast('Payment recorded','success'); closeModal();
      await Promise.all([loadBills(),loadInvoices()]);
      const c=document.getElementById('fin-content');if(c){if(refType==='bill')renderBills(c);else renderInvoices(c);}
    } catch(e){toast(e.message,'error');}
  };
}

function showBudgetModal(budget=null) {
  const now=new Date();
  modal(budget?'Edit Budget':'Set Budget',
    `<form id="budget-form" class="space-y-3">
      <div class="grid grid-cols-2 gap-3">${fi('Year','year','number',budget?.year||now.getFullYear(),'min="2020" max="2099"')}${fi('Month (01-12)','month','text',budget?.month||String(now.getMonth()+1).padStart(2,'0'))}</div>
      ${fs('Category','category',EXP_CATS,budget?.category||EXP_CATS[0])}
      ${fi('Budget Amount ($)','budget_amount','number',budget?.budget_amount,'step="0.01" min="0"')}
      <div><label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label><textarea name="notes" rows="2" class="fin-input">${budget?.notes||''}</textarea></div>
    </form>`,
    `<button onclick="closeModal()" class="btn-fin btn-fin-secondary">Cancel</button>
     <button onclick="FinPage._saveBudget(${budget?`'${budget.id}'`:'null'})" class="btn-fin btn-fin-primary">${budget?'Save':'Set Budget'}</button>`
  );
  window.FinPage._saveBudget = async id => {
    const data=getForm('budget-form');
    if(!data.budget_amount){toast('Amount required','error');return;}
    try {
      if(id){data.id=id;await api('financials/budgets/update',data);toast('Updated','success');}
      else {await api('financials/budgets/create',data);toast('Budget set','success');}
      closeModal(); await loadBudgets();
      const c=document.getElementById('fin-content');if(c)renderBudgets(c);
    } catch(e){toast(e.message,'error');}
  };
}

function showAccountModal(acc=null) {
  modal(acc?'Edit Account':'New Account',
    `<form id="acc-form" class="space-y-3">
      <div class="grid grid-cols-2 gap-3">${fi('Account Number','account_number','text',acc?.account_number)}${fs('Type','type',['Asset','Liability','Equity','Revenue','Expense'],acc?.type||'Asset')}</div>
      ${fi('Account Name','account_name','text',acc?.account_name)}
      ${fi('Category','category','text',acc?.category)}
      ${fi('Description','description','text',acc?.description)}
    </form>`,
    `<button onclick="closeModal()" class="btn-fin btn-fin-secondary">Cancel</button>
     <button onclick="FinPage._saveAcc(${acc?`'${acc.id}'`:'null'})" class="btn-fin btn-fin-primary">${acc?'Save':'Create'}</button>`
  );
  window.FinPage._saveAcc = async id => {
    const data=getForm('acc-form');
    if(!data.account_name){toast('Name required','error');return;}
    try {
      if(id){data.id=id;await api('financials/accounts/update',data);toast('Updated','success');}
      else {await api('financials/accounts/create',data);toast('Account created','success');}
      closeModal(); await loadAccounts();
      const c=document.getElementById('fin-content');if(c)renderAccounts(c);
    } catch(e){toast(e.message,'error');}
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CROSS-MODULE SYNC  (called from other modules)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Called by assets.js when an asset with a purchase_price is saved
window.FinSync = window.FinSync || {};

window.FinSync.onAssetSaved = async function(asset) {
  if (!asset || !asset.purchase_price || parseFloat(asset.purchase_price) <= 0) return;
  try {
    await api('financials/sync/asset-purchase', {
      asset_id:       asset.asset_id || asset.id,
      asset_name:     asset.asset_name || asset.name,
      purchase_price: asset.purchase_price,
      purchase_date:  asset.purchase_date,
      supplier:       asset.supplier || asset.vendor,
    });
  } catch(e) { console.warn('[FinSync] asset-purchase:', e.message); }
};

// Called by assets.js when an asset is deleted
window.FinSync.onAssetDeleted = async function(assetId) {
  try { await api('financials/sync/remove', { source_id: 'asset:'+assetId }); } catch(e) {}
};

// Called by payroll.js when a payroll run is saved/approved
window.FinSync.onPayrollRun = async function(run) {
  if (!run || !run.gross || parseFloat(run.gross) <= 0) return;
  try {
    await api('financials/sync/payroll-run', {
      run_id:        run.id || run.run_id,
      employee_id:   run.employee_id,
      employee_name: run.employee_name,
      gross:         run.gross,
      net:           run.net,
      period_start:  run.period_start || run.start,
      period_end:    run.period_end   || run.end,
      tax_total:     run.tax_total    || run.tax,
      deductions:    run.deductions,
    });
  } catch(e) { console.warn('[FinSync] payroll-run:', e.message); }
};

// Called by payroll.js when a run is deleted
window.FinSync.onPayrollDeleted = async function(runId) {
  try { await api('financials/sync/remove', { source_id: 'payroll:'+runId }); } catch(e) {}
};

// Called by tasks.js when a billable task is completed/saved
window.FinSync.onTaskSaved = async function(task) {
  if (!task || task.billable !== 'true' && task.billable !== true) return;
  if (!task.billable_rate || parseFloat(task.billable_rate) <= 0) return;
  try {
    await api('financials/sync/task-billable', {
      task_id:          task.id || task.task_id,
      title:            task.title,
      assignee:         task.assignee,
      billable_rate:    task.billable_rate,
      billable_pay_type:task.billable_pay_type || 'per_hour',
      actual_hours:     task.actual_hours || task.hours_actual,
      project:          task.project,
      client:           task.client,
      status:           task.status,
      due_date:         task.due_date,
    });
  } catch(e) { console.warn('[FinSync] task-billable:', e.message); }
};

// Called by tasks.js when a billable task is deleted
window.FinSync.onTaskDeleted = async function(taskId) {
  try { await api('financials/sync/remove', { source_id: 'task:'+taskId }); } catch(e) {}
};

// Called by timesheets.js when a billable entry is approved
window.FinSync.onTimesheetApproved = async function(entry) {
  if (!entry || entry.billable !== 'true' && entry.billable !== true) return;
  if (!entry.billable_rate || parseFloat(entry.billable_rate) <= 0) return;
  try {
    await api('financials/sync/timesheet-billable', {
      entry_id:      entry.id,
      user_id:       entry.user_id,
      date:          entry.date,
      total_hours:   entry.total_hours,
      billable_rate: entry.billable_rate,
      project_id:    entry.project_id,
      task:          entry.task,
      description:   entry.description,
      status:        entry.status || 'Approved',
      employee_name: entry.employee_name || entry.user_id,
    });
  } catch(e) { console.warn('[FinSync] timesheet-billable:', e.message); }
};

// Called by timesheets.js when a billable entry is deleted
window.FinSync.onTimesheetDeleted = async function(entryId) {
  try { await api('financials/sync/remove', { source_id: 'timesheet:'+entryId }); } catch(e) {}
};

// Manual full refresh of cross-module data
async function triggerFullSync() {
  toast('Refreshing data feeds...', 'info');
  await Promise.all([loadExpenses(), loadRevenue(), loadCrossModuleSummary()]);
  renderTab();
  toast('Feeds refreshed', 'success');
}

// ── Global expose ──────────────────────────────────────────────
window.showInvoiceModal = showInvoiceModal;
window.showExpenseModal = showExpenseModal;
window.showBillModal    = showBillModal;
window.showBudgetModal  = showBudgetModal;
window.showAccountModal = showAccountModal;
window.loadReports      = loadReports;

})();
