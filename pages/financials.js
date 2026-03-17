// ================================================================
//  WORK VOLT — pages/financials.js
//  Full Financial Management Module UI
// ================================================================

(function() {
'use strict';

// ── Helpers ──────────────────────────────────────────────────────
const api   = (path, params) => window.WorkVolt.api(path, params);
const toast = (msg, type)    => window.WorkVolt.toast(msg, type || 'info');
const user  = ()             => window.WorkVolt.user();

const fmt = {
  currency: (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: (s) => {
    if (!s) return '—';
    // If it's already a full ISO string with time, parse directly; otherwise append time to avoid UTC midnight shift
    const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  pct:      (n) => (parseFloat(n) || 0).toFixed(1) + '%',
  num:      (n) => (parseFloat(n) || 0).toLocaleString('en-US'),
};

// Status badge colors
const STATUS_COLORS = {
  'Paid':        'bg-emerald-100 text-emerald-700',
  'Unpaid':      'bg-amber-100 text-amber-700',
  'Sent':        'bg-blue-100 text-blue-700',
  'Draft':       'bg-slate-100 text-slate-600',
  'Overdue':     'bg-red-100 text-red-700',
  'Partial':     'bg-orange-100 text-orange-700',
  'Approved':    'bg-emerald-100 text-emerald-700',
  'Pending':     'bg-amber-100 text-amber-700',
  'Rejected':    'bg-red-100 text-red-700',
  'On Track':    'bg-emerald-100 text-emerald-700',
  'Near Limit':  'bg-amber-100 text-amber-700',
  'Over Budget': 'bg-red-100 text-red-700',
};

function badge(status) {
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-600';
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${status || '—'}</span>`;
}

// ── State ─────────────────────────────────────────────────────────
let state = {
  tab:          'dashboard',
  dashboard:    null,
  invoices:     [],
  expenses:     [],
  bills:        [],
  budgets:      [],
  accounts:     [],
  costCenters:  [],
  incomeStmt:   null,
  balanceSheet: null,
  cashflow:     null,
  budgetVA:     null,
  loading:      {},
  filter: {
    invoices:  { status: '', search: '' },
    expenses:  { status: '', search: '' },
    bills:     { status: '', search: '' },
  },
  // Cross-module data (populated only if modules installed)
  modules: {
    payroll:  { installed: false, data: [] },
    assets:   { installed: false, data: [] },
    tasks:    { installed: false, data: [] },
  },
};

let container; // root DOM element

// ── Entry ──────────────────────────────────────────────────────────
window.WorkVoltPages = window.WorkVoltPages || {};
window.WorkVoltPages.financials = function(el) {
  container = el;
  render();
  loadAll();
};

// ── Shell ─────────────────────────────────────────────────────────
function render() {
  container.innerHTML = `
  <div class="flex flex-col h-full" style="font-family:'Plus Jakarta Sans',sans-serif;">

    <!-- Page header -->
    <div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 class="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-8 h-8 bg-emerald-500 rounded-lg">
            <i class="fas fa-chart-line text-white text-sm"></i>
          </span>
          Financials
        </h1>
        <p class="text-xs text-slate-500 mt-0.5">Financial management · accounting · reporting</p>
      </div>
      <div id="fin-header-actions" class="flex items-center gap-2"></div>
    </div>

    <!-- Tab bar -->
    <div class="bg-white border-b border-slate-200 px-6 flex items-center gap-1 overflow-x-auto flex-shrink-0" id="fin-tabs">
      ${[
        { id:'dashboard',  icon:'fa-th-large',           label:'Dashboard'   },
        { id:'invoices',   icon:'fa-file-invoice-dollar', label:'Invoices'    },
        { id:'expenses',   icon:'fa-receipt',             label:'Expenses'    },
        { id:'bills',      icon:'fa-file-alt',            label:'Bills'       },
        { id:'budgets',    icon:'fa-wallet',              label:'Budgets'     },
        { id:'reports',    icon:'fa-chart-pie',           label:'Reports'     },
        { id:'accounts',   icon:'fa-list',                label:'Accounts'    },
      ].map(t => `
        <button onclick="FinPage.tab('${t.id}')"
          class="fin-tab flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${state.tab === t.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}"
          data-tab="${t.id}">
          <i class="fas ${t.icon} text-xs"></i>${t.label}
        </button>
      `).join('')}
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto bg-slate-50" id="fin-content">
      <div class="flex items-center justify-center h-48">
        <i class="fas fa-circle-notch fa-spin text-emerald-500 text-2xl opacity-50"></i>
      </div>
    </div>
  </div>`;

  // expose tab switcher
  window.FinPage = { tab: switchTab, refresh: loadAll };
}

function switchTab(t) {
  state.tab = t;
  // update tab styles
  document.querySelectorAll('.fin-tab').forEach(el => {
    const active = el.dataset.tab === t;
    el.classList.toggle('border-emerald-500', active);
    el.classList.toggle('text-emerald-600', active);
    el.classList.toggle('border-transparent', !active);
    el.classList.toggle('text-slate-500', !active);
  });
  renderTab();
  updateHeaderActions();
}

function updateHeaderActions() {
  const el = document.getElementById('fin-header-actions');
  if (!el) return;
  const actions = {
    invoices: `<button onclick="FinPage.newInvoice()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Invoice</button>`,
    expenses: `<button onclick="FinPage.newExpense()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Expense</button>`,
    bills:    `<button onclick="FinPage.newBill()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Bill</button>`,
    budgets:  `<button onclick="FinPage.newBudget()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>Set Budget</button>`,
    accounts: `<button onclick="FinPage.newAccount()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Account</button>`,
  };
    el.innerHTML = (actions[state.tab] || '') + `
    <style>
      .btn-fin-primary{display:flex;align-items:center;gap:.4rem;padding:.5rem 1rem;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:.8125rem;font-weight:600;cursor:pointer;transition:background .15s;font-family:inherit}
      .btn-fin-primary:hover{background:#059669}
      .btn-fin-secondary{display:flex;align-items:center;gap:.4rem;padding:.5rem 1rem;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:.8125rem;font-weight:600;cursor:pointer;transition:background .15s;font-family:inherit}
      .btn-fin-secondary:hover{background:#e2e8f0}
      
      /* Collapsible sections */
      .collapsible-header{cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 0;user-select:none}
      .collapsible-header:hover{opacity:0.8}
      .collapsible-icon{transition:transform 0.2s;font-size:12px;color:#64748b}
      .collapsible-icon.open{transform:rotate(90deg)}
      .collapsible-content{overflow:hidden;transition:max-height 0.3s ease-out,max-width 0.3s ease-out}
      .collapsible-content.collapsed{max-height:0;max-width:0}
      .collapsible-content.expanded{max-height:500px;max-width:100%}
    </style>`;

  // Attach handlers
  window.FinPage.newInvoice = () => showInvoiceModal();
  window.FinPage.newExpense = () => showExpenseModal();
  window.FinPage.newBill    = () => showBillModal();
  window.FinPage.newBudget  = () => showBudgetModal();
  window.FinPage.newAccount = () => showAccountModal();
}

// ── Load all data ─────────────────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([
    loadDashboard(),
    loadInvoices(),
    loadExpenses(),
    loadBills(),
    loadBudgets(),
    loadAccounts(),
    loadCostCenters(),
    loadCrossModuleData(),
  ]);
  renderTab();
  updateHeaderActions();
}

// ── Refresh dashboard + reports in background after any data change ──
// Call this after every save so numbers update immediately without
// requiring a full page reload or manual tab switch.
function refreshLinkedTabs() {
  // Always re-render the current tab first
  const c = document.getElementById('fin-content');

  // Re-render dashboard KPIs immediately (uses local state, no extra API call)
  // We patch state.dashboard so the trend/KPI uses fresh invoice/expense data
  if (state.tab === 'dashboard' && c) renderDashboard(c);

  // If on reports, re-render immediately from local state
  if (state.tab === 'reports' && c) {
    // Reset so renderReports re-fetches cleanly
    state.incomeStmt = null;
    renderReports(c);
  }

  // Always silently reload dashboard data in background so next visit is fresh
  loadDashboard();
}

async function loadDashboard() {
  try { state.dashboard = await api('financials/dashboard'); } catch(e) {}
}
async function loadInvoices() {
  try { const d = await api('financials/invoices/list'); state.invoices = d.rows || []; } catch(e) {}
}
async function loadExpenses() {
  try { const d = await api('financials/expenses/list'); state.expenses = d.rows || []; } catch(e) {}
}
async function loadBills() {
  try { const d = await api('financials/bills/list'); state.bills = d.rows || []; } catch(e) {}
}
async function loadBudgets() {
  try {
    const now = new Date();
    const d = await api('financials/budget-vs-actual', {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0'),
    });
    state.budgetVA = d;
    const bd = await api('financials/budgets/list');
    state.budgets = bd.rows || [];
  } catch(e) {}
}
async function loadAccounts() {
  try { const d = await api('financials/accounts/list'); state.accounts = d.rows || []; } catch(e) {}
}
async function loadCostCenters() {
  try { const d = await api('financials/cost-centers/list'); state.costCenters = d.rows || []; } catch(e) {}
}

// ── Cross-module integration ──────────────────────────────────────
// Try each module; silently skip if not installed (api will throw)
async function loadCrossModuleData() {
  const tryLoad = async (module, apiPath) => {
    try {
      const d = await api(apiPath);
      // A valid response is anything that came back without an error key
      if (d && d.error) {
        console.warn('[Financials] ' + module + ' API error:', d.error);
        state.modules[module].installed = false;
        return;
      }
      state.modules[module].installed = true;
      state.modules[module].data = d.rows || d.items || (Array.isArray(d) ? d : []);
      console.log('[Financials] ' + module + ' loaded:', state.modules[module].data.length, 'records');
    } catch(e) {
      // Module not installed or network error — silent skip is fine
      console.warn('[Financials] ' + module + ' not available:', e.message || e);
      state.modules[module].installed = false;
    }
  };

  await Promise.allSettled([
    tryLoad('payroll', 'payroll/runs/list'),
    tryLoad('assets',  'assets/maintenance/list'),
    tryLoad('tasks',   'tasks/list'),
  ]);
}

// Calculate net pay from a payroll run record
// The payroll module stores computed net directly in r.net
// Fall back to gross - deductions for older records
function calcPayrollNet(r) {
  if (r.net !== undefined && r.net !== '') return parseFloat(r.net) || 0;
  const gross = (parseFloat(r.gross) || 0) + (parseFloat(r.bonuses || r.bonus) || 0);
  const ded   = (parseFloat(r.deductions) || 0) + (parseFloat(r.tax_total || r.tax) || 0);
  return Math.max(0, gross - ded);
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

// ── Render active tab ─────────────────────────────────────────────
function renderTab() {
  const c = document.getElementById('fin-content');
  if (!c) return;
  const tabs = {
    dashboard: renderDashboard,
    invoices:  renderInvoices,
    expenses:  renderExpenses,
    bills:     renderBills,
    budgets:   renderBudgets,
    reports:   renderReports,
    accounts:  renderAccounts,
  };
  (tabs[state.tab] || renderDashboard)(c);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderDashboard(c) {
  const d = state.dashboard || {};
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // ── Compute KPIs locally from state (reliable, always up-to-date) ──
  // Revenue: invoices paid or sent this month
  const monthRevenue = state.invoices
    .filter(inv => (inv.issue_date||'').startsWith(ym))
    .reduce((s,inv) => s + (parseFloat(inv.total)||0), 0);

  // Expenses: all approved/paid expenses this month
  const monthExpenses = state.expenses
    .filter(e => (e.date||'').startsWith(ym))
    .reduce((s,e) => s + (parseFloat(e.amount)||0), 0);

  // Bills paid this month also count as outflows
  const monthBills = state.bills
    .filter(b => ((b.issue_date||b.due_date||'').startsWith(ym)))
    .reduce((s,b) => s + (parseFloat(b.amount)||0), 0);

  // Cross-module costs this month
  const payrollCost = state.modules.payroll.installed
    ? state.modules.payroll.data.reduce((s,p) => s + calcPayrollNet(p), 0) : 0;
  const maintCost = state.modules.assets.installed
    ? state.modules.assets.data.reduce((s,m) => s + (parseFloat(m.cost||m.amount||0)), 0) : 0;
  const taskCost = state.modules.tasks.installed
    ? state.modules.tasks.data.reduce((s,t) => s + (parseFloat(t.cost||t.estimated_cost||0)), 0) : 0;

  const totalOutflows = monthExpenses + monthBills + payrollCost + maintCost + taskCost;
  const netProfit     = monthRevenue - totalOutflows;

  // AR metrics
  const outstandingAR = state.invoices
    .filter(inv => inv.status === 'Sent' || inv.status === 'Partial' || inv.status === 'Unpaid')
    .reduce((s,inv) => s + (parseFloat(inv.balance_due)||parseFloat(inv.total)||0), 0);
  const overdueAR = state.invoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((s,inv) => s + (parseFloat(inv.balance_due)||parseFloat(inv.total)||0), 0);
  const billsDue = state.bills
    .filter(b => b.status === 'Unpaid' || b.status === 'Partial')
    .reduce((s,b) => s + (parseFloat(b.balance_due)||parseFloat(b.amount)||0), 0);
  const overdueBills = state.bills
    .filter(b => b.status === 'Overdue')
    .reduce((s,b) => s + (parseFloat(b.balance_due)||parseFloat(b.amount)||0), 0);

  // Expense breakdown from all expenses
  const expBreakRaw = {};
  state.expenses.forEach(e => {
    if (e.category) expBreakRaw[e.category] = (expBreakRaw[e.category]||0) + (parseFloat(e.amount)||0);
  });
  if (payrollCost > 0)  expBreakRaw['Payroll']           = (expBreakRaw['Payroll']||0) + payrollCost;  if (maintCost > 0)    expBreakRaw['Asset Maintenance']  = (expBreakRaw['Asset Maintenance']||0) + maintCost;
  if (taskCost > 0)     expBreakRaw['Task Costs']         = (expBreakRaw['Task Costs']||0) + taskCost;
  if (monthBills > 0)   expBreakRaw['Bills']              = (expBreakRaw['Bills']||0) + monthBills;

  // ==========================================
  // NEW TREND CHART - Simple and Reliable
  // ==========================================
  
  // Build 6 months of data
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d2 = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}`,
      label: d2.toLocaleDateString('en-US', { month: 'short' }),
      isCurrent: i === 0
    });
  }

  // Fill in the numbers from invoices/expenses/bills
  months.forEach(m => {
    m.revenue = state.invoices
      .filter(inv => (inv.issue_date || '').startsWith(m.key))
      .reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    
    m.expenses = state.expenses
      .filter(e => (e.date || '').startsWith(m.key))
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    m.expenses += state.bills
      .filter(b => ((b.issue_date || b.due_date || '')).startsWith(m.key))
      .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
  });

  // Find the highest value for scaling (minimum 1 to avoid divide by zero)
  const maxValue = Math.max(...months.map(m => Math.max(m.revenue, m.expenses)), 1);

  // Build the chart HTML - simple flex layout
  const trendChart = months.map(m => {
    // Calculate heights (0-100% scale)
    const revPct = m.revenue > 0 ? Math.max((m.revenue / maxValue) * 100, 5) : 0;
    const expPct = m.expenses > 0 ? Math.max((m.expenses / maxValue) * 100, 5) : 0;
    
    return `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:40px;">
        <div style="width:100%; height:80px; display:flex; align-items:flex-end; justify-content:center; gap:2px;">
          <div style="width:8px; height:${revPct}%; background:${m.isCurrent ? '#059669' : '#10b981'}; border-radius:2px 2px 0 0;" title="Revenue: ${fmt.currency(m.revenue)}"></div>
          <div style="width:8px; height:${expPct}%; background:${m.isCurrent ? '#dc2626' : '#f87171'}; border-radius:2px 2px 0 0;" title="Expenses: ${fmt.currency(m.expenses)}"></div>
        </div>
        <span style="font-size:10px; color:${m.isCurrent ? '#334155' : '#94a3b8'}; font-weight:${m.isCurrent ? 'bold' : 'normal'};">${m.label}</span>
      </div>
    `;
  }).join('');

  const expBreak = (d.expense_breakdown && Object.keys(d.expense_breakdown).length) ? d.expense_breakdown : expBreakRaw;

  // Bottom summary always uses current-month computed values (reliable)
  const trendSummary = `
    <div class="text-center">
      <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wide">This Month Revenue</p>
      <p class="text-sm font-extrabold text-emerald-600">${fmt.currency(monthRevenue)}</p>
    </div>
    <div class="text-center">
      <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wide">This Month Expenses</p>
      <p class="text-sm font-extrabold text-red-500">${fmt.currency(totalOutflows)}</p>
    </div>
    <div class="text-center">
      <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wide">This Month Profit</p>
      <p class="text-sm font-extrabold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-500'}">${fmt.currency(netProfit)}</p>
    </div>`;

  // Expense breakdown list
  const expEntries = Object.entries(expBreak).sort((a,b) => b[1]-a[1]).slice(0,6);
  const totalExpBreak = expEntries.reduce((s,[,v]) => s+v, 0) || 1;
  const expList = expEntries.length ? expEntries.map(([cat, amt]) => {
    const pct = Math.round((amt / totalExpBreak) * 100);
    return `
      <div class="mb-2">
        <div class="flex justify-between text-xs mb-1">
          <span class="text-slate-600 font-medium truncate">${cat}</span>
          <span class="text-slate-700 font-semibold ml-2">${fmt.currency(amt)}</span>
        </div>
        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full bg-emerald-400" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('') : '<p class="text-xs text-slate-400">No expense data yet</p>';

  c.innerHTML = `
  <div class="p-6 space-y-5 max-w-7xl mx-auto fade-in">

    <!-- KPI row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${kpi('Monthly Revenue',  fmt.currency(monthRevenue),  '', 'fa-arrow-trend-up',   'bg-emerald-50 text-emerald-600', 'this month')}
      ${kpi('Monthly Expenses', fmt.currency(totalOutflows), '', 'fa-arrow-trend-down', 'bg-red-50 text-red-500',         'all outflows')}
      ${kpi('Net Profit',       fmt.currency(netProfit),     '', 'fa-chart-line',       netProfit >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500', 'this month')}
      ${kpi('Outstanding AR',   fmt.currency(outstandingAR), '', 'fa-file-invoice',     'bg-amber-50 text-amber-600',     'receivable')}
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${kpi('Overdue AR',    fmt.currency(overdueAR),   '', 'fa-exclamation-circle', 'bg-red-50 text-red-500',     'needs attention')}
      ${kpi('Bills Due',     fmt.currency(billsDue),    '', 'fa-file-alt',           'bg-violet-50 text-violet-600','to pay')}
      ${kpi('Overdue Bills', fmt.currency(overdueBills),'', 'fa-clock',              'bg-orange-50 text-orange-500', 'overdue')}
      ${kpi('Total Invoices', String(state.invoices.length), '', 'fa-list',  'bg-slate-100 text-slate-600', 'all time')}
    </div>

    <!-- Charts row -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

      <!-- Revenue vs Expenses trend -->
      <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-slate-800 text-sm">Revenue vs Expenses — 6 Month Trend</h3>
          <div class="flex items-center gap-3 text-xs text-slate-500">
            <span class="flex items-center gap-1"><span class="w-3 h-1.5 rounded bg-emerald-400 inline-block"></span>Revenue</span>
            <span class="flex items-center gap-1"><span class="w-3 h-1.5 rounded bg-red-400 inline-block"></span>Expenses</span>
          </div>
        </div>
        <div style="display:flex; align-items:flex-end; gap:8px; padding:0 8px; height:100px;">
          ${trendChart}
        </div>
        <div class="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
          ${trendSummary}
        </div>
      </div>

      <!-- Expense breakdown -->
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-bold text-slate-800 text-sm mb-4">Expense Breakdown</h3>
        ${expList}
      </div>
    </div>

    <!-- Quick actions -->
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h3 class="font-bold text-slate-800 text-sm mb-3">Quick Actions</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${quickAction('fa-file-invoice-dollar','New Invoice','invoices','emerald')}
        ${quickAction('fa-receipt','Log Expense','expenses','blue')}
        ${quickAction('fa-file-alt','Add Bill','bills','violet')}
        ${quickAction('fa-chart-pie','View Reports','reports','amber')}
      </div>
    </div>

    <!-- Recent invoices + overdue bills -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-slate-800 text-sm">Recent Invoices</h3>
          <button onclick="FinPage.tab('invoices')" class="text-xs text-emerald-600 font-semibold hover:underline">View all</button>
        </div>
        <div class="space-y-2">
          ${state.invoices.slice(0,5).map(inv => `
            <div class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p class="text-sm font-semibold text-slate-700">${inv.invoice_number || '—'}</p>
                <p class="text-xs text-slate-400">${inv.customer || '—'}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold text-slate-800">${fmt.currency(inv.total)}</p>
                ${badge(inv.status)}
              </div>
            </div>`).join('') || '<p class="text-xs text-slate-400">No invoices yet</p>'}
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-slate-800 text-sm">Recent Expenses</h3>
          <button onclick="FinPage.tab('expenses')" class="text-xs text-emerald-600 font-semibold hover:underline">View all</button>
        </div>
        <div class="space-y-2">
          ${state.expenses.slice(0,5).map(e => `
            <div class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p class="text-sm font-semibold text-slate-700">${e.description || e.vendor || '—'}</p>
                <p class="text-xs text-slate-400">${e.category || '—'} · ${fmt.date(e.date)}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold text-slate-800">${fmt.currency(e.amount)}</p>
                ${badge(e.status)}
              </div>
            </div>`).join('') || '<p class="text-xs text-slate-400">No expenses yet</p>'}
        </div>
      </div>
    </div>

  </div>`;
}

function kpi(label, value, _key, icon, iconCls, sub) {
  return `
    <div class="bg-white rounded-xl border border-slate-200 p-4 card-hover">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">${label}</p>
          <p class="text-xl font-extrabold text-slate-900 mt-1">${value}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${sub}</p>
        </div>
        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls}">
          <i class="fas ${icon} text-sm"></i>
        </div>
      </div>
    </div>`;
}

function quickAction(icon, label, tab, color) {
  const colors = { emerald:'bg-emerald-50 text-emerald-600 hover:bg-emerald-100', blue:'bg-blue-50 text-blue-600 hover:bg-blue-100', violet:'bg-violet-50 text-violet-600 hover:bg-violet-100', amber:'bg-amber-50 text-amber-600 hover:bg-amber-100' };
  return `
    <button onclick="FinPage.tab('${tab}')" class="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 ${colors[color]} transition-colors">
      <i class="fas ${icon} text-lg"></i>
      <span class="text-xs font-semibold">${label}</span>
    </button>`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVOICES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderInvoices(c) {
  const f = state.filter.invoices;
  let rows = state.invoices;
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.search) {
    const q = f.search.toLowerCase();
    rows = rows.filter(r => (r.customer||'').toLowerCase().includes(q) || (r.invoice_number||'').toLowerCase().includes(q));
  }

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-48">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" placeholder="Search invoices..." value="${f.search}"
          oninput="FinPage._filterInv({search:this.value})"
          class="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
      </div>
      <select onchange="FinPage._filterInv({status:this.value})" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <option value="">All Statuses</option>
        ${['Draft','Sent','Paid','Partial','Overdue'].map(s => `<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Invoice #</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Customer</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Issue Date</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Due Date</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Balance Due</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(inv => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors" data-id="${inv.id}">
              <td class="px-4 py-3 font-semibold text-slate-800">${inv.invoice_number || '—'}</td>
              <td class="px-4 py-3 text-slate-600">${inv.customer || '—'}</td>
              <td class="px-4 py-3 text-slate-500 hidden md:table-cell">${fmt.date(inv.issue_date)}</td>
              <td class="px-4 py-3 text-slate-500 hidden md:table-cell">${fmt.date(inv.due_date)}</td>
              <td class="px-4 py-3 text-right font-bold text-slate-800">${fmt.currency(inv.total)}</td>
              <td class="px-4 py-3 text-right text-slate-600 hidden lg:table-cell">${fmt.currency(inv.balance_due)}</td>
              <td class="px-4 py-3 text-center">${badge(inv.status)}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  ${inv.status === 'Draft' ? `<button onclick="FinPage._sendInv('${inv.id}')" class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-semibold transition-colors">Send</button>` : ''}
                  ${(inv.status === 'Sent' || inv.status === 'Overdue' || inv.status === 'Partial') ? `<button onclick="FinPage._payInv('${inv.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold transition-colors">Mark Paid</button>` : ''}
                  <button onclick="FinPage._editInv('${inv.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="FinPage._deleteInv('${inv.id}')" class="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><i class="fas fa-trash text-xs"></i></button>
                </div>
              </td>
            </tr>`).join('') : `
            <tr><td colspan="8" class="px-4 py-12 text-center text-slate-400">
              <i class="fas fa-file-invoice-dollar text-3xl mb-2 block opacity-30"></i>
              No invoices found. <button onclick="showInvoiceModal()" class="text-emerald-600 font-semibold hover:underline">Create one</button>
            </td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  window.FinPage._filterInv = (updates) => {
    Object.assign(state.filter.invoices, updates);
    renderInvoices(c);
  };
  window.FinPage._sendInv = async (id) => {
    try { await api('financials/invoices/send', {id}); toast('Invoice sent!','success'); await loadInvoices(); renderInvoices(c); } catch(e) { toast(e.message,'error'); }
  };
  window.FinPage._payInv = async (id) => {
    try { await api('financials/invoices/mark-paid', {id}); toast('Invoice marked as paid!','success'); await loadInvoices(); renderInvoices(c); } catch(e) { toast(e.message,'error'); }
  };
  window.FinPage._editInv = (id) => {
    const inv = state.invoices.find(r => r.id === id);
    if (inv) showInvoiceModal(inv);
  };
  window.FinPage._deleteInv = async (id) => {
    if (!confirm('Delete this invoice?')) return;
    try { await api('financials/invoices/delete', {id}); toast('Deleted','success'); await loadInvoices(); renderInvoices(c); } catch(e) { toast(e.message,'error'); }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPENSES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderExpenses(c) {
  const f = state.filter.expenses;
  let rows = state.expenses;
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.search) { const q = f.search.toLowerCase(); rows = rows.filter(r => (r.vendor||'').toLowerCase().includes(q) || (r.description||'').toLowerCase().includes(q)); }

  const categories = ['Salaries & Wages','Software & Subscriptions','Travel & Entertainment','Office Supplies','Marketing & Advertising','Professional Services','Rent & Utilities','Other Expenses'];

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-48">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" placeholder="Search expenses..." value="${f.search}"
          oninput="FinPage._filterExp({search:this.value})"
          class="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
      </div>
      <select onchange="FinPage._filterExp({status:this.value})" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <option value="">All Statuses</option>
        ${['Pending','Approved','Rejected'].map(s => `<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Vendor</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Category</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Description</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Amount</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(e => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 text-slate-500">${fmt.date(e.date)}</td>
              <td class="px-4 py-3 font-medium text-slate-800">${e.vendor || '—'}</td>
              <td class="px-4 py-3 text-slate-600 hidden md:table-cell">${e.category || '—'}</td>
              <td class="px-4 py-3 text-slate-500 hidden lg:table-cell max-w-xs truncate">${e.description || '—'}</td>
              <td class="px-4 py-3 text-right font-bold text-slate-800">${fmt.currency(e.amount)}</td>
              <td class="px-4 py-3 text-center">${badge(e.status)}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  ${e.status === 'Pending' ? `
                    <button onclick="FinPage._approveExp('${e.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold">Approve</button>
                    <button onclick="FinPage._rejectExp('${e.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 font-semibold">Reject</button>
                  ` : ''}
                  <button onclick="FinPage._editExp('${e.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="FinPage._deleteExp('${e.id}')" class="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><i class="fas fa-trash text-xs"></i></button>
                </div>
              </td>
            </tr>`).join('') : `
            <tr><td colspan="7" class="px-4 py-12 text-center text-slate-400">
              <i class="fas fa-receipt text-3xl mb-2 block opacity-30"></i>
              No expenses found. <button onclick="showExpenseModal()" class="text-emerald-600 font-semibold hover:underline">Log one</button>
            </td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  window.FinPage._filterExp  = (u) => { Object.assign(state.filter.expenses, u); renderExpenses(c); };
  window.FinPage._approveExp = async (id) => {
    try { await api('financials/expenses/approve', {id, approved_by: user()?.name || ''}); toast('Approved','success'); await loadExpenses(); renderExpenses(c); } catch(e) { toast(e.message,'error'); }
  };
  window.FinPage._rejectExp  = async (id) => {
    try { await api('financials/expenses/reject', {id, approved_by: user()?.name || ''}); toast('Rejected','info'); await loadExpenses(); renderExpenses(c); } catch(e) { toast(e.message,'error'); }
  };
  window.FinPage._editExp    = (id) => { const e = state.expenses.find(r=>r.id===id); if(e) showExpenseModal(e); };
  window.FinPage._deleteExp  = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try { await api('financials/expenses/delete',{id}); toast('Deleted','success'); await loadExpenses(); renderExpenses(c); } catch(e) { toast(e.message,'error'); }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BILLS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderBills(c) {
  const f = state.filter.bills;
  let rows = state.bills;
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.search) { const q = f.search.toLowerCase(); rows = rows.filter(r => (r.vendor||'').toLowerCase().includes(q)); }

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in">
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="relative flex-1 min-w-48">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input type="text" placeholder="Search bills..." value="${f.search}"
          oninput="FinPage._filterBill({search:this.value})"
          class="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
      </div>
      <select onchange="FinPage._filterBill({status:this.value})" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <option value="">All Statuses</option>
        ${['Unpaid','Partial','Paid','Overdue'].map(s => `<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Bill #</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Vendor</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Category</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Next Due</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Balance</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Monthly</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(b => {
            const isRecurring = b.recurring === 'true' || b.recurring === true;
            const balance = parseFloat(b.balance_due) || parseFloat(b.amount) || 0;
            const monthly = parseFloat(b.monthly_payment) || 0;
            const recurringBadge = isRecurring
              ? `<span class="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-600"><i class="fas fa-sync-alt text-[8px]"></i> Day ${b.recurring_day||'—'}</span>`
              : '';
            return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 font-semibold text-slate-800">${b.bill_number || '—'}</td>
              <td class="px-4 py-3 text-slate-600">${b.vendor || '—'}${recurringBadge}</td>
              <td class="px-4 py-3 text-slate-500 hidden md:table-cell">${b.category || '—'}</td>
              <td class="px-4 py-3 text-slate-500 hidden md:table-cell">${fmt.date(b.due_date)}</td>
              <td class="px-4 py-3 text-right font-bold text-slate-800">${fmt.currency(b.amount)}</td>
              <td class="px-4 py-3 text-right hidden lg:table-cell ${balance > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}">${fmt.currency(balance)}</td>
              <td class="px-4 py-3 text-right text-slate-500 hidden lg:table-cell">${monthly > 0 ? fmt.currency(monthly)+'/mo' : '—'}</td>
              <td class="px-4 py-3 text-center">${badge(b.status)}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  ${b.status !== 'Paid' ? `<button onclick="FinPage._payBill('${b.id}')" class="px-2 py-1 text-xs bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 font-semibold">Pay</button>` : ''}
                  <button onclick="FinPage._editBill('${b.id}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="FinPage._deleteBill('${b.id}')" class="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><i class="fas fa-trash text-xs"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('') : `
            <tr><td colspan="9" class="px-4 py-12 text-center text-slate-400">
              <i class="fas fa-file-alt text-3xl mb-2 block opacity-30"></i>
              No bills found. <button onclick="showBillModal()" class="text-emerald-600 font-semibold hover:underline">Add one</button>
            </td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  window.FinPage._filterBill = (u) => { Object.assign(state.filter.bills, u); renderBills(c); };
  window.FinPage._payBill    = (id) => {
    const b = state.bills.find(r => r.id === id);
    const isRecurring = b?.recurring === 'true' || b?.recurring === true;
    const monthlyAmt  = parseFloat(b?.monthly_payment) || 0;
    // For recurring bills pre-fill the monthly payment amount, not the full balance
    showPaymentModal(id, 'bill', isRecurring && monthlyAmt > 0 ? monthlyAmt : null);
  };
  window.FinPage._editBill   = (id) => { const b = state.bills.find(r=>r.id===id); if(b) showBillModal(b); };
  window.FinPage._deleteBill = async (id) => {
    if (!confirm('Delete this bill?')) return;
    try { await api('financials/bills/delete',{id}); toast('Deleted','success'); await loadBills(); renderBills(c); } catch(e) { toast(e.message,'error'); }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUDGETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderBudgets(c) {
  const bva  = state.budgetVA;
  const now  = new Date();
  const ym   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // Build lines: prefer server data, but always compute actuals locally as fallback
  // so the table is never blank just because the GAS route isn't set up yet
  let lines = bva?.lines || [];

  if (!lines.length && state.budgets.length) {
    // Compute actuals from local expense + bill state for this month
    const localActuals = {};
    state.expenses.forEach(e => {
      if ((e.date||'').startsWith(ym) && e.category) {
        localActuals[e.category] = (localActuals[e.category]||0) + (parseFloat(e.amount)||0);
      }
    });
    state.bills.forEach(b => {
      if (((b.issue_date||b.due_date)||'').startsWith(ym) && b.category) {
        localActuals[b.category] = (localActuals[b.category]||0) + (parseFloat(b.amount)||0);
      }
    });
    lines = state.budgets.map(b => {
      const actual   = localActuals[b.category] || 0;
      const budget   = parseFloat(b.budget_amount) || 0;
      const variance = budget - actual;
      const pct      = budget > 0 ? (actual / budget) * 100 : 0;
      const status   = pct > 100 ? 'Over Budget' : pct > 90 ? 'Near Limit' : 'On Track';
      return { category: b.category, budget, actual, variance, status };
    });
  }

  // Unbudgeted categories that have expenses this month (so you know what to budget)
  const budgetedCats = new Set(lines.map(l => l.category));
  const unbudgeted   = {};
  state.expenses.forEach(e => {
    if ((e.date||'').startsWith(ym) && e.category && !budgetedCats.has(e.category)) {
      unbudgeted[e.category] = (unbudgeted[e.category]||0) + (parseFloat(e.amount)||0);
    }
  });

  c.innerHTML = `
  <div class="p-6 max-w-7xl mx-auto fade-in space-y-5">

    <!-- How it works explainer -->
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
      <p class="font-bold mb-1"><i class="fas fa-info-circle mr-1.5"></i>How Budgets Work</p>
      <p class="text-xs text-blue-700 leading-relaxed">
        Set a spending limit per <strong>expense category</strong> for the current month (e.g. Rent & Utilities: $2,000).
        The <strong>Actual</strong> column fills in automatically from your logged expenses.
        <strong>Variance</strong> shows how much budget you have left (green) or have gone over (red).
        Budgets are per-month — you'll need to set them each month, or copy them forward.
      </p>
    </div>

    <div class="flex items-center justify-between">
      <h2 class="text-base font-bold text-slate-800">
        Budget vs Actual — ${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}
      </h2>
      <button onclick="showBudgetModal()" class="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors">
        <i class="fas fa-plus text-xs"></i>Set Budget
      </button>
    </div>

    ${lines.length ? `
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50 border-b border-slate-200">
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Category</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Budget</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actual</th>
          <th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Remaining</th>
          <th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide w-36">Usage</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
          <th class="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
        </tr></thead>
        <tbody>
          ${lines.map(l => {
            const pct = l.budget > 0 ? Math.min(100, Math.round((l.actual/l.budget)*100)) : 0;
            const barColor = pct > 100 ? 'bg-red-500' : pct > 90 ? 'bg-amber-400' : 'bg-emerald-400';
            return `
              <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-800">${l.category}</td>
                <td class="px-4 py-3 text-right text-slate-600">${fmt.currency(l.budget)}</td>
                <td class="px-4 py-3 text-right font-semibold text-slate-800">${fmt.currency(l.actual)}</td>
                <td class="px-4 py-3 text-right font-semibold ${l.variance >= 0 ? 'text-emerald-600':'text-red-500'}">
                  ${l.variance >= 0 ? '+' : ''}${fmt.currency(l.variance)}
                </td>
                <td class="px-4 py-3 w-36">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div class="${barColor} h-full rounded-full transition-all" style="width:${pct}%"></div>
                    </div>
                    <span class="text-xs text-slate-500 w-8 text-right">${pct}%</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-center">${badge(l.status)}</td>
                <td class="px-4 py-3 text-center">
                  <button onclick="FinPage._editBudget('${l.category}')" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
                    <i class="fas fa-edit text-xs"></i>
                  </button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : `
    <div class="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <i class="fas fa-wallet text-4xl text-slate-200 mb-3 block"></i>
      <p class="font-semibold text-slate-600 mb-1">No budgets set for this month</p>
      <p class="text-sm text-slate-400 mb-4">Click "Set Budget" to set a spending limit for any expense category.<br>
      Example: set Rent & Utilities to $2,000 — it will track against your actual logged expenses automatically.</p>
      <button onclick="showBudgetModal()" class="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors">
        <i class="fas fa-plus mr-2"></i>Set Your First Budget
      </button>
    </div>`}

    <!-- Unbudgeted spending this month -->
    ${Object.keys(unbudgeted).length ? `
    <div class="bg-white rounded-xl border border-amber-200 p-5">
      <h3 class="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
        <i class="fas fa-exclamation-circle text-amber-500 text-sm"></i>
        Unbudgeted Spending This Month
        <span class="text-xs font-normal text-slate-400">— categories with expenses but no budget set</span>
      </h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${Object.entries(unbudgeted).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => `
          <div class="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <span class="text-xs font-medium text-slate-700 truncate">${cat}</span>
            <div class="flex items-center gap-2 ml-2 flex-shrink-0">
              <span class="text-xs font-bold text-amber-700">${fmt.currency(amt)}</span>
              <button onclick="showBudgetModal({category:'${cat}'})" class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded hover:bg-emerald-100 transition-colors">
                + Budget
              </button>
            </div>
          </div>`).join('')}
      </div>
    </div>` : ''}

  </div>`;

  window.FinPage._editBudget = (category) => {
    const b = state.budgets.find(r => r.category === category);
    showBudgetModal(b);
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderReports(c) {
  if (!state.incomeStmt) {
    c.innerHTML = `<div class="flex items-center justify-center h-48"><i class="fas fa-circle-notch fa-spin text-emerald-500 text-2xl opacity-50"></i></div>`;
    Promise.all([loadReports(), loadCrossModuleData()]).then(() => renderReports(c));
    return;
  }
  const is = state.incomeStmt || {};
  const bs = state.balanceSheet || {};
  const cf = state.cashflow || {};

  c.innerHTML = `
  <div class="p-6 max-w-5xl mx-auto fade-in space-y-5">

    <!-- Income Statement -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
          <i class="fas fa-chart-line text-emerald-600 text-xs"></i>
        </span>
        Income Statement
      </h3>
      <div class="space-y-1">
        ${(()=>{
          const baseRevenue  = parseFloat(is.revenue)  || state.invoices.reduce((s,inv)=>s+(parseFloat(inv.total)||0),0);
          const baseExpenses = parseFloat(is.expenses) || state.expenses.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
          const billsTotal   = state.bills.reduce((s,b)=>s+(parseFloat(b.amount)||0),0);

          // Cross-module costs
          const payrollTotal = state.modules.payroll.installed
            ? state.modules.payroll.data.reduce((s,p)=>s+calcPayrollNet(p),0) : 0;
          const maintTotal   = state.modules.assets.installed
            ? state.modules.assets.data.reduce((s,m)=>s+(parseFloat(m.cost||m.amount||0)),0) : 0;
          const taskTotal    = state.modules.tasks.installed
            ? state.modules.tasks.data.reduce((s,t)=>s+(parseFloat(t.cost||t.estimated_cost||0)),0) : 0;

          const totalAllExpenses = baseExpenses + billsTotal + payrollTotal + maintTotal + taskTotal;
          const netProfit  = baseRevenue - totalAllExpenses;
          const profitMargin = baseRevenue > 0 ? (netProfit / baseRevenue * 100) : 0;

          // Build expense breakdown from server + local data
          const expBreakdown = { ...(is.expense_breakdown || {}) };
          if (!Object.keys(expBreakdown).length) {
            state.expenses.forEach(e => { if(e.category) expBreakdown[e.category]=(expBreakdown[e.category]||0)+(parseFloat(e.amount)||0); });
          }
          if (billsTotal > 0)   expBreakdown['Bills & Payables']  = (expBreakdown['Bills & Payables']||0) + billsTotal;
          if (payrollTotal > 0) expBreakdown['Payroll']           = (expBreakdown['Payroll']||0) + payrollTotal;
          if (maintTotal > 0)   expBreakdown['Asset Maintenance'] = (expBreakdown['Asset Maintenance']||0) + maintTotal;
          if (taskTotal > 0)    expBreakdown['Task Costs']        = (expBreakdown['Task Costs']||0) + taskTotal;

          // Revenue breakdown by source
          const revBreakdown = { ...(is.revenue_breakdown || {}) };
          if (!Object.keys(revBreakdown).length) {
            state.invoices.forEach(inv => {
              const key = inv.customer || 'Uncategorised';
              revBreakdown[key] = (revBreakdown[key] || 0) + (parseFloat(inv.total) || 0);
            });
          }
          const revLines = Object.entries(revBreakdown).sort((a,b) => b[1]-a[1])
            .map(([src, amt]) => reportLine(src, fmt.currency(amt), 'text-slate-600')).join('');

          const revenueSection = collapsibleSection(
            `Revenue (${Object.keys(revBreakdown).length} sources)`,
            revLines,
            false
          );

          return revenueSection
            + reportLine('Total Revenue', fmt.currency(baseRevenue), 'font-semibold text-emerald-600')
            + '<div class="h-px bg-slate-100 my-2"></div>'
            + '<p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Operating Expenses</p>'
            + Object.entries(expBreakdown).map(([cat, amt]) => reportLine(cat, fmt.currency(amt), 'text-slate-600')).join('')
            + reportLine('Total Expenses', fmt.currency(totalAllExpenses), 'font-semibold text-red-500')
            + '<div class="h-px bg-slate-100 my-2"></div>'
            + reportLine('Net Profit / (Loss)', fmt.currency(netProfit), `font-extrabold text-lg ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`)
            + reportLine('Profit Margin', fmt.pct(profitMargin), 'text-slate-500 text-sm');
        })()}
      </div>
    </div>

    <!-- Balance Sheet -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
          <i class="fas fa-balance-scale text-blue-600 text-xs"></i>
        </span>
        Balance Sheet
        ${bs.balanced ? '<span class="ml-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Balanced</span>' : ''}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Assets</p>
          ${reportLine('Accounts Receivable', fmt.currency(bs.assets?.accounts_receivable), 'text-slate-600')}
          ${reportLine('Total Assets', fmt.currency(bs.assets?.total), 'font-bold text-slate-800')}
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Liabilities</p>
          ${reportLine('Accounts Payable', fmt.currency(bs.liabilities?.accounts_payable), 'text-slate-600')}
          ${reportLine('Total Liabilities', fmt.currency(bs.liabilities?.total), 'font-bold text-slate-800')}
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Equity</p>
          ${reportLine('Retained Earnings', fmt.currency(bs.equity?.retained_earnings), 'text-slate-600')}
          ${reportLine('Total Equity', fmt.currency(bs.equity?.total), 'font-bold text-slate-800')}
        </div>
      </div>
    </div>

    <!-- Cash Flow -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
          <i class="fas fa-water text-violet-600 text-xs"></i>
        </span>
        Cash Flow Statement
      </h3>
      ${(()=>{
        // If server didn't return cashflow inflows, compute from invoices (Paid + Sent = received/expected)
        const invoiceInflow = state.invoices
          .filter(inv => inv.status === 'Paid' || inv.status === 'Partial' || inv.status === 'Sent')
          .reduce((s, inv) => s + (parseFloat(inv.status === 'Partial' ? (inv.total - (inv.balance_due||0)) : inv.total) || 0), 0);
        const localOutflow = state.expenses.reduce((s,e)=>s+(parseFloat(e.amount)||0),0) + state.bills.filter(b=>b.status==='Paid').reduce((s,b)=>s+(parseFloat(b.amount)||0),0);
        const cfInflow  = (cf.operating?.inflow  != null && cf.operating.inflow  !== '') ? parseFloat(cf.operating.inflow)  : invoiceInflow;
        const cfOutflow = (cf.operating?.outflow != null && cf.operating.outflow !== '') ? parseFloat(cf.operating.outflow) : localOutflow;
        const cfNet     = cfInflow - cfOutflow;
        return `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Operating Activities</p>
          ${reportLine('Inflows (Invoices & Receipts)', fmt.currency(cfInflow), 'text-emerald-600')}
          ${reportLine('Outflows (Expenses & Bills)', fmt.currency(cfOutflow), 'text-red-500')}
          ${reportLine('Net Operating', fmt.currency(cfNet), 'font-bold text-slate-800')}
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Investing Activities</p>
          ${reportLine('Net Investing', fmt.currency(cf.investing?.net), 'font-bold text-slate-800')}
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Financing Activities</p>
          ${reportLine('Net Financing', fmt.currency(cf.financing?.net), 'font-bold text-slate-800')}
        </div>
      </div>`;
      })()}
      ${(()=>{
        const invoiceInflow2 = state.invoices
          .filter(inv => inv.status === 'Paid' || inv.status === 'Partial' || inv.status === 'Sent')
          .reduce((s, inv) => s + (parseFloat(inv.status === 'Partial' ? (inv.total - (inv.balance_due||0)) : inv.total) || 0), 0);
        const localOutflow2 = state.expenses.reduce((s,e)=>s+(parseFloat(e.amount)||0),0) + state.bills.filter(b=>b.status==='Paid').reduce((s,b)=>s+(parseFloat(b.amount)||0),0);
        const cfInflow2  = (cf.operating?.inflow  != null && cf.operating.inflow  !== '') ? parseFloat(cf.operating.inflow)  : invoiceInflow2;
        const cfOutflow2 = (cf.operating?.outflow != null && cf.operating.outflow !== '') ? parseFloat(cf.operating.outflow) : localOutflow2;
        const cfNet2     = cfInflow2 - cfOutflow2;
        const netCashFlow = cfNet2 + (parseFloat(cf.investing?.net) || 0) + (parseFloat(cf.financing?.net) || 0);
        return `<div class="mt-4 pt-4 border-t border-slate-100">
          ${reportLine('Net Cash Flow', fmt.currency(netCashFlow), `font-extrabold text-lg ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`)}
        </div>`;
      })()}
    </div>

        <!-- Bills Summary -->
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
        <span class="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
          <i class="fas fa-file-alt text-amber-600 text-xs"></i>
        </span>
        Bills Summary
      </h3>
      <div class="space-y-1">
        ${(()=>{
          const bills = state.bills;
          const total     = bills.reduce((s,b)=>s+(parseFloat(b.amount)||0),0);
          const paid      = bills.filter(b=>b.status==='Paid').reduce((s,b)=>s+(parseFloat(b.amount)||0),0);
          const unpaid    = bills.filter(b=>b.status==='Unpaid'||b.status==='Partial').reduce((s,b)=>s+(parseFloat(b.balance_due)||0),0);
          const overdue   = bills.filter(b=>b.status==='Overdue').reduce((s,b)=>s+(parseFloat(b.balance_due)||0),0);
          const byVendor  = {};
          bills.forEach(b=>{ if(b.vendor){ byVendor[b.vendor]=(byVendor[b.vendor]||0)+(parseFloat(b.amount)||0); } });
          const topVendors = Object.entries(byVendor).sort((a,b)=>b[1]-a[1]).slice(0,5);
          
          const vendorSection = topVendors.length ? collapsibleSection(
            `Top Vendors (${topVendors.length})`,
            topVendors.map(([v,a])=>reportLine(v,fmt.currency(a),'text-slate-600')).join(''),
            false
          ) : '';
          
          return reportLine('Total Bills',fmt.currency(total),'font-semibold text-slate-700')
            + reportLine('Paid',fmt.currency(paid),'text-emerald-600')
            + reportLine('Outstanding',fmt.currency(unpaid),'text-amber-600')
            + reportLine('Overdue',fmt.currency(overdue),'font-semibold text-red-500')
            + (topVendors.length ? '<div class="h-px bg-slate-100 my-2"></div>' + vendorSection : '');
        })()}
      </div>
    </div>

    <!-- Cross-Module Financial Impact -->
    ${renderCrossModuleReport()}

    <div class="text-center">
      <button onclick="Promise.all([loadReports(),loadCrossModuleData()]).then(()=>renderReports(document.getElementById('fin-content')))" class="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg font-semibold transition-colors">
        <i class="fas fa-sync-alt mr-2"></i>Refresh Reports
      </button>
    </div>
  </div>`;
}

function renderCrossModuleReport() {
  const mods = state.modules;
  const sections = [];

  // Payroll
  if (mods.payroll.installed) {
    const payments = mods.payroll.data;
    const totalPayroll = payments.reduce((s,p) => s + calcPayrollNet(p), 0);
    const pending = payments.filter(p => p.status === 'Pending' || p.status === 'Draft')
                            .reduce((s,p) => s + calcPayrollNet(p), 0);
    const paid    = payments.filter(p => p.status === 'Paid')
                            .reduce((s,p) => s + calcPayrollNet(p), 0);
    sections.push(`
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
          <span class="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center"><i class="fas fa-users text-blue-600 text-xs"></i></span>
          Payroll Impact
          <span class="ml-2 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Connected</span>
        </h3>
        <div class="space-y-1">
          ${reportLine('Total Net Payroll', fmt.currency(totalPayroll), 'font-semibold text-red-500')}
          ${reportLine('Paid', fmt.currency(paid), 'text-emerald-600')}
          ${reportLine('Pending / Draft', fmt.currency(pending), 'text-amber-600')}
          ${reportLine('Pay Runs', String(payments.length), 'text-slate-500')}
        </div>
        ${totalPayroll > 0 ? `<p class="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100"><i class="fas fa-info-circle mr-1"></i>Payroll costs are deducted in the Net Profit calculation.</p>` : ''}
      </div>`);
  }

  // Assets (maintenance costs)
  if (mods.assets.installed) {
    const maintenance = mods.assets.data;
    const totalMaint = maintenance.reduce((s,m) => s + (parseFloat(m.cost || m.amount || 0)), 0);
    const scheduled  = maintenance.filter(m => m.status === 'Scheduled').length;
    sections.push(`
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
          <span class="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center"><i class="fas fa-tools text-orange-600 text-xs"></i></span>
          Asset Maintenance Costs
          <span class="ml-2 text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Connected</span>
        </h3>
        <div class="space-y-1">
          ${reportLine('Total Maintenance Cost', fmt.currency(totalMaint), 'font-semibold text-red-500')}
          ${reportLine('Scheduled Tasks', String(scheduled), 'text-amber-600')}
          ${reportLine('Maintenance Records', String(maintenance.length), 'text-slate-500')}
        </div>
        ${totalMaint > 0 ? `<p class="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100"><i class="fas fa-info-circle mr-1"></i>Maintenance costs are deducted in the Net Profit calculation.</p>` : ''}
      </div>`);
  }

  // Tasks (costs)
  if (mods.tasks.installed) {
    const tasks = mods.tasks.data;
    const totalCost  = tasks.reduce((s,t) => s + (parseFloat(t.cost||t.estimated_cost||0)), 0);
    const completed  = tasks.filter(t => t.status === 'Completed' || t.status === 'Done').length;
    const inProgress = tasks.filter(t => t.status === 'In Progress').length;
    sections.push(`
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
          <span class="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center"><i class="fas fa-tasks text-teal-600 text-xs"></i></span>
          Task Costs
          <span class="ml-2 text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">Connected</span>
        </h3>
        <div class="space-y-1">
          ${reportLine('Total Task Cost', fmt.currency(totalCost), 'font-semibold text-red-500')}
          ${reportLine('Total Tasks', String(tasks.length), 'text-slate-500')}
          ${reportLine('Completed', String(completed), 'text-emerald-600')}
          ${reportLine('In Progress', String(inProgress), 'text-amber-600')}
        </div>
        ${totalCost > 0 ? `<p class="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100"><i class="fas fa-info-circle mr-1"></i>Task costs are deducted in the Net Profit calculation.</p>` : ''}
      </div>`);
  }

  if (!sections.length) return '';
  return `<div class="space-y-5">${sections.join('')}</div>`;
}

function reportLine(label, value, cls = '') {
  return `
    <div class="flex items-center justify-between py-1.5">
      <span class="text-sm text-slate-600">${label}</span>
      <span class="text-sm font-semibold ${cls}">${value}</span>
    </div>`;
}

function collapsibleSection(title, content, defaultOpen = true) {
  // Use a deterministic ID based on title to avoid duplicates on re-renders
  const id = 'collapsible-' + title.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `
    <div style="margin-bottom:8px;">
      <div class="collapsible-header" onclick="window.toggleCollapsibleSection('${id}', this)" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 0;user-select:none;">
        <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${title}</span>
        <i class="fas fa-chevron-right collapsible-icon ${defaultOpen ? 'open' : ''}" style="transition:transform 0.2s;font-size:12px;color:#64748b;${defaultOpen ? 'transform:rotate(90deg);' : ''}"></i>
      </div>
      <div id="${id}" class="collapsible-content" style="padding-left:12px;border-left:2px solid #e2e8f0;overflow:hidden;transition:max-height 0.3s ease-out;${defaultOpen ? 'max-height:500px;' : 'max-height:0;'}">
        ${content}
      </div>
    </div>`;
}

// Define globally once - check if already defined to avoid re-creating
if (!window.toggleCollapsibleSection) {
  window.toggleCollapsibleSection = function(id, header) {
    const content = document.getElementById(id);
    const icon = header.querySelector('.collapsible-icon');
    if (!content || !icon) return;
    
    const isExpanded = content.style.maxHeight !== '0px' && content.style.maxHeight !== '';
    
    if (isExpanded) {
      content.style.maxHeight = '0px';
      icon.style.transform = 'rotate(0deg)';
    } else {
      content.style.maxHeight = '500px';
      icon.style.transform = 'rotate(90deg)';
    }
  };
}
  
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACCOUNTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderAccounts(c) {
  const typeOrder  = ['Asset','Liability','Equity','Revenue','Expense'];
  const typeColors = {
    Asset:     'bg-blue-50 text-blue-700 border-blue-200',
    Liability: 'bg-red-50 text-red-700 border-red-200',
    Equity:    'bg-violet-50 text-violet-700 border-violet-200',
    Revenue:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    Expense:   'bg-amber-50 text-amber-700 border-amber-200',
  };
  const typeIcons = {
    Asset: 'fa-university', Liability: 'fa-credit-card',
    Equity: 'fa-scale-balanced', Revenue: 'fa-arrow-trend-up', Expense: 'fa-arrow-trend-down',
  };

  // Check if ANY invoices have a deposit_account assigned yet
  const anyInvoiceAssigned = state.invoices.some(i => i.deposit_account && i.deposit_account !== '');
  const anyExpenseAssigned = state.expenses.some(e => e.paid_from && e.paid_from !== '');
  const anyBillAssigned    = state.bills.some(b => b.paid_from && b.paid_from !== '');

  // Compute activity per account name from live transaction data
  function accountActivity(accountName) {
    // If no invoices have deposit_account set yet, distribute all invoice revenue
    // to the first Asset account (so the dashboard shows something useful)
    const assetAccounts = state.accounts.filter(a => a.type === 'Asset' && a.is_active !== 'false');
    const isFirstAsset  = !anyInvoiceAssigned && assetAccounts.length > 0 && assetAccounts[0].account_name === accountName;

    const invoiceIn = anyInvoiceAssigned
      ? state.invoices.filter(i => i.deposit_account === accountName).reduce((s,i) => s + (parseFloat(i.total)||0), 0)
      : (isFirstAsset ? state.invoices.reduce((s,i) => s + (parseFloat(i.total)||0), 0) : 0);

    const expenseOut = anyExpenseAssigned
      ? state.expenses.filter(e => e.paid_from === accountName).reduce((s,e) => s + (parseFloat(e.amount)||0), 0)
      : 0;

    const billOut = anyBillAssigned
      ? state.bills.filter(b => b.paid_from === accountName && b.status === 'Paid').reduce((s,b) => s + (parseFloat(b.amount)||0), 0)
      : 0;

    return { invoiceIn, expenseOut, billOut, net: invoiceIn - expenseOut - billOut };
  }

  const grouped = {};
  typeOrder.forEach(t => grouped[t] = []);
  state.accounts.forEach(a => { if (grouped[a.type]) grouped[a.type].push(a); });

  // Summary bar — totals across Asset accounts
  const assetAccounts = grouped['Asset'] || [];
  const totalInflows  = assetAccounts.reduce((s,a) => s + accountActivity(a.account_name).invoiceIn, 0);
  const totalOutflows = assetAccounts.reduce((s,a) => {
    const act = accountActivity(a.account_name);
    return s + act.expenseOut + act.billOut;
  }, 0);

  c.innerHTML = `
  <div class="p-6 max-w-5xl mx-auto fade-in space-y-5">

    <!-- Unassigned warning — shown when invoices/expenses haven't been linked to accounts yet -->
    ${(!anyInvoiceAssigned && state.invoices.length > 0) ? `
    <div class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
      <i class="fas fa-exclamation-triangle text-amber-500 mt-0.5 flex-shrink-0"></i>
      <div>
        <p class="font-semibold">Your invoices aren't linked to an account yet.</p>
        <p class="text-xs mt-1 text-amber-700">Edit each invoice and pick a "Deposit To Account" so the inflows show on the correct account. For now, all invoice revenue is shown on your first Asset account as a placeholder.</p>
      </div>
    </div>` : ''}
    ${(!anyExpenseAssigned && state.expenses.length > 0) ? `
    <div class="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
      <i class="fas fa-info-circle text-blue-500 mt-0.5 flex-shrink-0"></i>
      <div>
        <p class="font-semibold">Expenses aren't linked to an account yet.</p>
        <p class="text-xs mt-1 text-blue-700">Edit each expense and pick a "Paid From Account" so outflows are tracked per account.</p>
      </div>
    </div>` : ''}

    <!-- Summary strip -->
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Inflows</p>
        <p class="text-xl font-extrabold text-emerald-600 mt-1">${fmt.currency(totalInflows)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${anyInvoiceAssigned ? 'From invoices → assigned accounts' : 'All invoices (none assigned yet)'}</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Outflows</p>
        <p class="text-xl font-extrabold text-red-500 mt-1">${fmt.currency(totalOutflows)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${anyExpenseAssigned ? 'Expenses + paid bills' : 'Assign expenses to see per-account'}</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Net Position</p>
        <p class="text-xl font-extrabold ${totalInflows - totalOutflows >= 0 ? 'text-blue-600' : 'text-red-500'} mt-1">${fmt.currency(totalInflows - totalOutflows)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Inflows minus outflows</p>
      </div>
    </div>

    <!-- Account cards -->
    ${typeOrder.map(type => {
      const rows = grouped[type] || [];
      if (!rows.length) return '';
      return `
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${typeColors[type]}">
              <i class="fas ${typeIcons[type]} text-[10px]"></i>${type}
            </span>
            <span class="text-xs text-slate-400">${rows.length} account${rows.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${rows.map(a => {
              const act = accountActivity(a.account_name);
              const hasActivity = act.invoiceIn > 0 || act.expenseOut > 0 || act.billOut > 0;
              return `
                <div class="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                  <div class="flex items-start justify-between mb-3">
                    <div>
                      <p class="font-bold text-slate-800 text-sm">${a.account_name}</p>
                      <p class="text-xs text-slate-400 mt-0.5">${a.account_number ? '#' + a.account_number + ' · ' : ''}${a.category || a.type}</p>
                    </div>
                    <div class="flex items-center gap-1">
                      ${a.is_active !== 'false'
                        ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>'
                        : '<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>'}
                      <button onclick="FinPage._editAcc('${a.id}')" class="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fas fa-edit text-xs"></i></button>
                      <button onclick="FinPage._deleteAcc('${a.id}')" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                  </div>
                  ${hasActivity ? `
                  <div class="space-y-1 border-t border-slate-100 pt-3">
                    ${act.invoiceIn  > 0 ? `<div class="flex justify-between text-xs"><span class="text-slate-500">Invoice deposits</span><span class="font-semibold text-emerald-600">+${fmt.currency(act.invoiceIn)}</span></div>` : ''}
                    ${act.expenseOut > 0 ? `<div class="flex justify-between text-xs"><span class="text-slate-500">Expenses paid</span><span class="font-semibold text-red-500">−${fmt.currency(act.expenseOut)}</span></div>` : ''}
                    ${act.billOut    > 0 ? `<div class="flex justify-between text-xs"><span class="text-slate-500">Bills paid</span><span class="font-semibold text-red-500">−${fmt.currency(act.billOut)}</span></div>` : ''}
                    <div class="flex justify-between text-xs pt-1 border-t border-slate-100">
                      <span class="font-bold text-slate-600">Net</span>
                      <span class="font-extrabold ${act.net >= 0 ? 'text-blue-600' : 'text-red-500'}">${act.net >= 0 ? '+' : ''}${fmt.currency(act.net)}</span>
                    </div>
                  </div>` : `
                  <p class="text-[11px] text-slate-300 border-t border-slate-100 pt-2 mt-1">No transactions linked yet — assign this account in invoices, expenses or bills.</p>`}
                  ${a.description ? `<p class="text-[11px] text-slate-400 mt-2">${a.description}</p>` : ''}
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('')}

    ${!state.accounts.length ? `
      <div class="text-center py-16 text-slate-400">
        <i class="fas fa-university text-4xl mb-3 block opacity-20"></i>
        <p class="font-semibold text-slate-500 mb-1">No accounts set up yet</p>
        <p class="text-sm mb-4">Add your bank accounts, credit cards and cash accounts. Then assign them when creating invoices, expenses and bills.</p>
        <button onclick="showAccountModal()" class="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors">
          <i class="fas fa-plus mr-2"></i>Add First Account
        </button>
      </div>` : ''}
  </div>`;

  window.FinPage._editAcc = (id) => { const a = state.accounts.find(r=>r.id===id); if(a) showAccountModal(a); };
  window.FinPage._deleteAcc = async (id) => {
    const a = state.accounts.find(r=>r.id===id);
    if (!confirm(`Delete account "${a?.account_name || id}"? This cannot be undone.`)) return;
    try { await api('financials/accounts/delete', {id}); toast('Account deleted','success'); await loadAccounts(); renderAccounts(document.getElementById('fin-content')); } catch(e) { toast(e.message,'error'); }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODALS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function modal(title, body, footer) {
  closeModal();
  const el = document.createElement('div');
  el.id = 'fin-modal';
  el.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm';
  el.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-[slideUp_.25s_cubic-bezier(.16,1,.3,1)]">
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 class="font-bold text-slate-900 text-base">${title}</h3>
        <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <i class="fas fa-times text-sm"></i>
        </button>
      </div>
      <div class="p-5 overflow-y-auto flex-1 space-y-4">${body}</div>
      <div class="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">${footer}</div>
    </div>`;
  document.getElementById('modals-root').appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closeModal(); });
}
window.closeModal = () => { const el = document.getElementById('fin-modal'); if (el) el.remove(); };

function field(label, name, type='text', value='', extra='') {
  return `
    <div>
      <label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
      <input type="${type}" name="${name}" value="${value || ''}" ${extra}
        class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white transition-all">
    </div>`;
}

function sel(label, name, options, value='') {
  const opts = options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return `<option value="${v}" ${v===value?'selected':''}>${l}</option>`;
  }).join('');
  return `
    <div>
      <label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
      <select name="${name}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
        ${opts}
      </select>
    </div>`;
}

function getForm(id) {
  const form = document.getElementById(id);
  if (!form) return {};
  return Object.fromEntries(new FormData(form).entries());
}

// Build account <option> list from state.accounts, filtered by type(s)
// Falls back to sensible defaults if no accounts are set up yet
function accountOptions(selectedName = '', types = null) {
  const accounts = state.accounts.filter(a =>
    a.is_active !== 'false' && (!types || types.includes(a.type))
  );
  const fallback = [
    { account_name: 'Cash & Bank',       type: 'Asset' },
    { account_name: 'Business Checking', type: 'Asset' },
    { account_name: 'Business Savings',  type: 'Asset' },
    { account_name: 'Credit Card',       type: 'Liability' },
    { account_name: 'Petty Cash',        type: 'Asset' },
  ];
  const list = accounts.length ? accounts : fallback;
  return list.map(a => {
    const name = a.account_name;
    return `<option value="${name}" ${name === selectedName ? 'selected' : ''}>${name}${a.type ? ' — ' + a.type : ''}</option>`;
  }).join('');
}

function accountSel(label, name, selectedName = '', types = null) {
  return `
    <div>
      <label class="block text-xs font-semibold text-slate-600 mb-1">${label}</label>
      <select name="${name}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
        <option value="">— Select Account —</option>
        ${accountOptions(selectedName, types)}
      </select>
    </div>`;
}

// Normalize any date string to YYYY-MM-DD for <input type="date"> value attributes
function dateVal(s) {
  if (!s) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO timestamp: 2025-03-01T00:00:00.000Z  →  2025-03-01
  if (s.includes('T')) return s.split('T')[0];
  // Fallback: try parsing
  try {
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  } catch(e) {}
  return '';
}

// Invoice Modal
function showInvoiceModal(inv = null) {
  const isEdit = !!inv;
  const today  = new Date().toISOString().split('T')[0];
  modal(
    isEdit ? 'Edit Invoice' : 'New Invoice',
    `<form id="inv-form" class="space-y-3">
      ${field('Customer Name', 'customer', 'text', inv?.customer)}
      ${field('Customer Email', 'customer_email', 'email', inv?.customer_email)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Issue Date', 'issue_date', 'date', dateVal(inv?.issue_date) || today)}
        ${field('Due Date', 'due_date', 'date', dateVal(inv?.due_date))}
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${field('Subtotal ($)', 'subtotal', 'number', inv?.subtotal, 'step="0.01" min="0" oninput="FinPage._calcInvTotal()"')}
        ${field('Tax Rate (%)', 'tax_rate', 'number', inv?.tax_rate || '0', 'step="0.1" min="0" max="100" oninput="FinPage._calcInvTotal()"')}
      </div>
      <div id="inv-tax-preview" class="text-xs text-slate-500 -mt-1 px-1"></div>
      ${field('Total ($)', 'total', 'number', inv?.total, 'step="0.01" min="0" readonly style="background:#f8fafc;cursor:default"')}
      ${sel('Status', 'status', ['Draft','Sent','Unpaid','Paid'], inv?.status || 'Draft')}
      ${accountSel('Deposit To Account', 'deposit_account', inv?.deposit_account || '', ['Asset'])}
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
        <textarea name="notes" rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">${inv?.notes || ''}</textarea>
      </div>
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveInvoice(${isEdit ? `'${inv.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${isEdit ? 'Save Changes' : 'Create Invoice'}</button>`
  );

  window.FinPage._saveInvoice = async (id) => {
    const data = getForm('inv-form');
    if (!data.customer) { toast('Customer is required','error'); return; }
    if (!data.total)    { toast('Total is required','error'); return; }
    // Compute tax_amount from subtotal + tax_rate
    const sub = parseFloat(data.subtotal) || 0;
    const rate = parseFloat(data.tax_rate) || 0;
    data.tax_amount = (sub * rate / 100).toFixed(2);
    if (!data.total || parseFloat(data.total) === 0) data.total = (sub + parseFloat(data.tax_amount)).toFixed(2);
    try {
      if (id) { data.id = id; await api('financials/invoices/update', data); toast('Invoice updated','success'); }
      else { await api('financials/invoices/create', data); toast('Invoice created','success'); }
      closeModal();
      await loadInvoices();
      const c = document.getElementById('fin-content'); if(c) renderInvoices(c);
      refreshLinkedTabs();
    } catch(e) { toast(e.message,'error'); }
  };

  window.FinPage._calcInvTotal = () => {
    const sub  = parseFloat(document.querySelector('#inv-form [name=subtotal]')?.value) || 0;
    const rate = parseFloat(document.querySelector('#inv-form [name=tax_rate]')?.value) || 0;
    const tax  = sub * rate / 100;
    const total = sub + tax;
    const totalEl = document.querySelector('#inv-form [name=total]');
    if (totalEl) totalEl.value = total.toFixed(2);
    const preview = document.getElementById('inv-tax-preview');
    if (preview) preview.textContent = rate > 0 ? `Tax (${rate}%): $${tax.toFixed(2)}  →  Total: $${total.toFixed(2)}` : '';
  };
  // Run once to initialize total if editing
  setTimeout(() => window.FinPage._calcInvTotal?.(), 50);
}

// Expense Modal
const EXP_CATS = ['Salaries & Wages','Software & Subscriptions','Travel & Entertainment','Office Supplies','Marketing & Advertising','Professional Services','Rent & Utilities','Cost of Goods Sold','Other Expenses'];

function showExpenseModal(exp = null) {
  const today = new Date().toISOString().split('T')[0];
  modal(
    exp ? 'Edit Expense' : 'Log Expense',
    `<form id="exp-form" class="space-y-3">
      ${field('Date', 'date', 'date', dateVal(exp?.date) || today)}
      ${field('Vendor', 'vendor', 'text', exp?.vendor)}
      ${sel('Category', 'category', EXP_CATS, exp?.category || EXP_CATS[0])}
      ${field('Description', 'description', 'text', exp?.description)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Amount ($)', 'amount', 'number', exp?.amount, 'step="0.01" min="0"')}
        ${accountSel('Paid From Account', 'paid_from', exp?.paid_from || '', ['Asset','Liability'])}
      </div>
      ${sel('Status', 'status', ['Pending','Approved','Rejected'], exp?.status || 'Pending')}
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveExpense(${exp ? `'${exp.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${exp ? 'Save Changes' : 'Log Expense'}</button>`
  );

  window.FinPage._saveExpense = async (id) => {
    const data = getForm('exp-form');
    if (!data.amount) { toast('Amount is required','error'); return; }
    try {
      if (id) { data.id = id; await api('financials/expenses/update', data); toast('Updated','success'); }
      else { await api('financials/expenses/create', data); toast('Expense logged','success'); }
      closeModal();
      await loadExpenses();
      const c = document.getElementById('fin-content'); if(c) renderExpenses(c);
      refreshLinkedTabs();
    } catch(e) { toast(e.message,'error'); }
  };
}

// Bill Modal
function showBillModal(bill = null) {
  const today = new Date().toISOString().split('T')[0];
  const isRecurring = bill?.recurring === 'true' || bill?.recurring === true;
  modal(
    bill ? 'Edit Bill' : 'New Bill',
    `<form id="bill-form" class="space-y-3">
      ${field('Vendor', 'vendor', 'text', bill?.vendor)}
      ${field('Vendor Email', 'vendor_email', 'email', bill?.vendor_email)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Issue Date', 'issue_date', 'date', dateVal(bill?.issue_date) || today)}
        ${field('Due Date', 'due_date', 'date', dateVal(bill?.due_date))}
      </div>
      ${sel('Category', 'category', EXP_CATS, bill?.category || EXP_CATS[0])}
      ${accountSel('Pay From Account', 'paid_from', bill?.paid_from || '', ['Asset','Liability'])}

      <!-- Total amount & balance -->
      <div class="grid grid-cols-2 gap-3">
        ${field('Total Bill Amount ($)', 'amount', 'number', bill?.amount, 'step="0.01" min="0" oninput="FinPage._syncBillBalance()"')}
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Balance Due ($)</label>
          <input type="number" name="balance_due" step="0.01" min="0"
            value="${bill?.balance_due ?? bill?.amount ?? ''}"
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
          <p class="text-[10px] text-slate-400 mt-0.5">Remaining balance — auto-filled from total, reduces with each payment.</p>
        </div>
      </div>

      <!-- Recurring toggle -->
      <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="recurring" id="bill-recurring-toggle" value="true"
            ${isRecurring ? 'checked' : ''}
            onchange="FinPage._toggleRecurring(this.checked)"
            class="w-4 h-4 accent-violet-600 rounded">
          <div>
            <span class="text-sm font-semibold text-slate-700">Recurring Monthly Bill</span>
            <p class="text-[11px] text-slate-400">Auto-due every month on a set day. Balance reduces by monthly payment each time Pay is clicked.</p>
          </div>
        </label>
      </div>

      <!-- Recurring options — shown only when toggle is on -->
      <div id="bill-recurring-opts" class="${isRecurring ? '' : 'hidden'} space-y-3 pl-1">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Monthly Payment Amount ($)</label>
            <input type="number" name="monthly_payment" step="0.01" min="0"
              value="${bill?.monthly_payment || ''}"
              placeholder="e.g. 100.00"
              class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white">
            <p class="text-[10px] text-slate-400 mt-0.5">Amount deducted from balance each month.</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Due Day of Month</label>
            <input type="number" name="recurring_day" min="1" max="31"
              value="${bill?.recurring_day || ''}"
              placeholder="e.g. 15"
              class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white">
            <p class="text-[10px] text-slate-400 mt-0.5">Bill re-activates on this day each month.</p>
          </div>
        </div>
        ${bill?.recurring_day ? `<p class="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          <i class="fas fa-sync-alt mr-1"></i>Next due date will be automatically set to day <strong>${bill.recurring_day}</strong> of next month when marked paid.
        </p>` : ''}
      </div>

      ${sel('Status', 'status', ['Unpaid','Partial','Paid','Overdue'], bill?.status || 'Unpaid')}
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
        <textarea name="notes" rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">${bill?.notes||''}</textarea>
      </div>
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveBill(${bill ? `'${bill.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${bill ? 'Save' : 'Add Bill'}</button>`
  );

  // Sync balance_due to match amount when amount changes and balance_due is empty
  window.FinPage._syncBillBalance = () => {
    const amt = document.querySelector('#bill-form [name=amount]')?.value;
    const bal = document.querySelector('#bill-form [name=balance_due]');
    if (bal && !bal.value) bal.value = amt;
  };

  // Show/hide recurring options
  window.FinPage._toggleRecurring = (on) => {
    const opts = document.getElementById('bill-recurring-opts');
    if (opts) opts.classList.toggle('hidden', !on);
  };

  window.FinPage._saveBill = async (id) => {
    const data = getForm('bill-form');
    if (!data.vendor) { toast('Vendor is required','error'); return; }

    // Ensure balance_due defaults to amount on creation
    if (!id && (!data.balance_due || parseFloat(data.balance_due) === 0)) {
      data.balance_due = data.amount;
    }

    // If recurring checkbox is unchecked it won't appear in getForm — default to false
    if (!data.recurring) data.recurring = 'false';

    try {
      if (id) { data.id = id; await api('financials/bills/update', data); toast('Updated','success'); }
      else { await api('financials/bills/create', data); toast('Bill added','success'); }
      closeModal();
      await loadBills();
      const c = document.getElementById('fin-content'); if(c) renderBills(c);
      refreshLinkedTabs();
    } catch(e) { toast(e.message,'error'); }
  };
}

// Payment Modal
function showPaymentModal(refId, refType = 'bill', overrideAmount = null) {
  const today = new Date().toISOString().split('T')[0];
  const ref = refType === 'bill' ? state.bills.find(r => r.id === refId) : state.invoices.find(r => r.id === refId);
  const isRecurring = refType === 'bill' && (ref?.recurring === 'true' || ref?.recurring === true);
  const payAmt = overrideAmount ?? ref?.balance_due ?? '';
  const balance = parseFloat(ref?.balance_due) || parseFloat(ref?.amount) || 0;
  const monthly = parseFloat(ref?.monthly_payment) || 0;

  modal(
    'Record Payment',
    `<form id="pay-form" class="space-y-3">
      <div class="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
        Recording payment for: <span class="font-bold text-slate-800">${ref ? (ref.bill_number || ref.invoice_number || ref.vendor || ref.customer) : refId}</span>
        ${ref ? `— Balance: <span class="font-bold text-red-500">${fmt.currency(balance)}</span>` : ''}
        ${isRecurring && monthly > 0 ? `<span class="ml-2 text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full"><i class="fas fa-sync-alt mr-1"></i>Monthly: ${fmt.currency(monthly)}</span>` : ''}
      </div>
      ${isRecurring && monthly > 0 ? `
      <div class="p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700">
        <i class="fas fa-info-circle mr-1"></i>
        This is a recurring bill. Paying <strong>${fmt.currency(monthly)}</strong> will reduce the balance to <strong>${fmt.currency(Math.max(0, balance - monthly))}</strong>.
        ${ref?.recurring_day ? `Next due date will be set to day <strong>${ref.recurring_day}</strong> of next month.` : ''}
      </div>` : ''}
      ${field('Payment Date', 'date', 'date', today)}
      ${field('Amount ($)', 'amount', 'number', payAmt, 'step="0.01" min="0"')}
      ${sel('Method', 'method', ['Bank Transfer','Cash','Credit Card','PayPal','Stripe','Check'], '')}
      ${accountSel('Pay From Account', 'account', ref?.paid_from || '', ['Asset','Liability'])}
      ${field('Reference / Notes', 'notes', 'text', '')}
      <input type="hidden" name="reference_id" value="${refId}">
      <input type="hidden" name="reference_type" value="${refType}">
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._savePayment()" class="btn-primary" style="background:#10b981">Record Payment</button>`
  );

  window.FinPage._savePayment = async () => {
    const data = getForm('pay-form');
    if (!data.amount) { toast('Amount required','error'); return; }
    try {
      data.created_by = user()?.name || '';

      // For recurring bills: compute new balance and next due date before saving
      if (isRecurring && refType === 'bill' && ref) {
        const paid       = parseFloat(data.amount) || 0;
        const newBalance = Math.max(0, balance - paid);
        data.balance_due = newBalance.toFixed(2);
        data.status      = newBalance <= 0 ? 'Paid' : 'Partial';

        // Advance due date to recurring_day of next month
        if (ref.recurring_day && newBalance > 0) {
          const now   = new Date();
          const year  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
          const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
          const day   = Math.min(parseInt(ref.recurring_day), new Date(year, month + 1, 0).getDate());
          data.due_date = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        }

        // Save bill update first (balance + new due date)
        await api('financials/bills/update', { id: refId, balance_due: data.balance_due, status: data.status, due_date: data.due_date });
      }

      await api('financials/payments/create', data);
      toast('Payment recorded','success');
      closeModal();
      await Promise.all([loadBills(), loadInvoices()]);
      const c = document.getElementById('fin-content');
      if (c) { if (refType === 'bill') renderBills(c); else renderInvoices(c); }
      refreshLinkedTabs();
    } catch(e) { toast(e.message,'error'); }
  };
}

// Budget Modal
function showBudgetModal(budget = null) {
  const now = new Date();
  // Allow passing {category:'...'} as a shortcut from the unbudgeted panel
  const preCategory = budget?.category || null;
  const isEdit      = !!(budget?.id);

  // Categories already budgeted this month (so user knows what's taken)
  const taken = new Set(state.budgets.map(b => b.category));

  const catOpts = EXP_CATS.map(cat => {
    const isTaken = taken.has(cat) && cat !== preCategory;
    return `<option value="${cat}" ${cat === (preCategory || EXP_CATS[0]) ? 'selected' : ''} ${isTaken ? 'disabled' : ''}>
      ${cat}${isTaken ? ' (already set)' : ''}
    </option>`;
  }).join('');

  modal(
    isEdit ? 'Edit Budget' : 'Set Budget',
    `<form id="budget-form" class="space-y-3">
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
        <i class="fas fa-info-circle mr-1 text-slate-400"></i>
        Set how much you plan to spend in a category this month. Your actual logged expenses will be compared against it automatically.
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${field('Year', 'year', 'number', budget?.year || now.getFullYear(), 'min="2020" max="2099"')}
        ${field('Month (01-12)', 'month', 'text', budget?.month || String(now.getMonth()+1).padStart(2,'0'))}
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Expense Category</label>
        <select name="category" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
          ${catOpts}
        </select>
      </div>
      ${field('Budget Amount ($)', 'budget_amount', 'number', budget?.budget_amount, 'step="0.01" min="0" placeholder="e.g. 2000.00"')}
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Notes (optional)</label>
        <textarea name="notes" rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">${budget?.notes||''}</textarea>
      </div>
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveBudget(${isEdit ? `'${budget.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${isEdit ? 'Save' : 'Set Budget'}</button>`
  );

  window.FinPage._saveBudget = async (id) => {
    const data = getForm('budget-form');
    if (!data.budget_amount) { toast('Amount required','error'); return; }
    try {
      if (id) { data.id = id; await api('financials/budgets/update', data); toast('Budget updated','success'); }
      else { await api('financials/budgets/create', data); toast('Budget set','success'); }
      closeModal();
      await loadBudgets();
      const c = document.getElementById('fin-content'); if(c) renderBudgets(c);
      refreshLinkedTabs();
    } catch(e) { toast(e.message,'error'); }
  };
}

// Account Modal
function showAccountModal(acc = null) {
  modal(
    acc ? 'Edit Account' : 'New Account',
    `<form id="acc-form" class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        ${field('Account Name', 'account_name', 'text', acc?.account_name)}
        ${sel('Type', 'type', [
          { value: 'Asset',     label: 'Asset — Bank / Cash' },
          { value: 'Liability', label: 'Liability — Credit Card / Loan' },
          { value: 'Equity',    label: 'Equity' },
          { value: 'Revenue',   label: 'Revenue' },
          { value: 'Expense',   label: 'Expense' },
        ], acc?.type || 'Asset')}
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${field('Account Number (optional)', 'account_number', 'text', acc?.account_number)}
        ${field('Current Balance ($)', 'current_balance', 'number', acc?.current_balance || '0', 'step="0.01"')}
      </div>
      ${field('Category (e.g. Checking, Savings, Visa)', 'category', 'text', acc?.category)}
      ${field('Description', 'description', 'text', acc?.description)}
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <i class="fas fa-info-circle mr-1"></i>
        <strong>Asset</strong> accounts (bank, cash) receive invoice deposits and are debited for expenses/bills.
        <strong>Liability</strong> accounts (credit cards) are used as payment sources and tracked as money owed.
      </div>
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveAccount(${acc ? `'${acc.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${acc ? 'Save' : 'Create'}</button>`
  );

  window.FinPage._saveAccount = async (id) => {
    const data = getForm('acc-form');
    if (!data.account_name) { toast('Name required','error'); return; }
    try {
      if (id) { data.id = id; await api('financials/accounts/update', data); toast('Updated','success'); }
      else { await api('financials/accounts/create', data); toast('Account created','success'); }
      closeModal();
      await loadAccounts();
      const c = document.getElementById('fin-content'); if(c) renderAccounts(c);
    } catch(e) { toast(e.message,'error'); }
  };
}

// Expose globals used in HTML
window.showInvoiceModal = showInvoiceModal;
window.showExpenseModal = showExpenseModal;
window.showBillModal    = showBillModal;
window.showBudgetModal  = showBudgetModal;
window.showAccountModal = showAccountModal;
window.loadReports      = loadReports;

})();
