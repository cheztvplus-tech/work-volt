// ================================================================
//  WORK VOLT — pages/financials.js
//  Full Financial Management Module UI — SUPABASE VERSION
//  All features preserved from Google Sheets version
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
    // Handle ISO dates from Supabase
    if (s.includes('T')) {
      const d = new Date(s);
      return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    // Already YYYY-MM-DD
    const d = new Date(s + 'T00:00:00');
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

  // ── Migration SQL (Non-destructive - for auto-provisioning) ────
const FIN_MIGRATION_SQL_NON_DESTRUCTIVE = `
create extension if not exists "uuid-ossp";

create table if not exists public.accounts (
  id              uuid primary key default uuid_generate_v4(),
  account_name    text not null,
  account_number  text,
  type            text not null default 'Asset',
  category        text,
  current_balance numeric(14,2) default 0,
  description     text,
  is_active       boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.invoices (
  id              uuid primary key default uuid_generate_v4(),
  invoice_number  text,
  customer        text not null,
  customer_email  text,
  issue_date      date,
  due_date        date,
  status          text default 'Draft',
  subtotal        numeric(14,2) default 0,
  tax_rate        numeric(5,2) default 0,
  tax_amount      numeric(14,2) default 0,
  total           numeric(14,2) default 0,
  balance_due     numeric(14,2) default 0,
  deposit_account text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.expenses (
  id               uuid primary key default uuid_generate_v4(),
  date             date not null,
  vendor           text,
  category         text,
  description      text,
  amount           numeric(12,2) not null default 0,
  paid_from        text,
  status           text default 'Pending',
  approved_by      text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.bills (
  id              uuid primary key default uuid_generate_v4(),
  bill_number     text,
  vendor          text not null,
  vendor_email    text,
  category        text,
  issue_date      date,
  due_date        date,
  amount          numeric(14,2) not null default 0,
  balance_due     numeric(14,2) default 0,
  status          text default 'Unpaid',
  recurring       boolean default false,
  recurring_day   int,
  monthly_payment numeric(14,2) default 0,
  paid_from       text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.budgets (
  id             uuid primary key default uuid_generate_v4(),
  year           int not null,
  month          int not null,
  category       text not null,
  budget_amount  numeric(14,2) not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.payments (
  id             uuid primary key default uuid_generate_v4(),
  reference_id   text not null,
  reference_type text not null,
  date           date not null,
  amount         numeric(14,2) not null,
  method         text,
  account        text,
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now()
);

-- ADD COLUMN IF NOT EXISTS guards for columns that may be missing on older installs
alter table public.invoices    add column if not exists deposit_account text;
alter table public.invoices    add column if not exists subtotal        numeric(14,2) default 0;
alter table public.invoices    add column if not exists tax_rate        numeric(5,2)  default 0;
alter table public.invoices    add column if not exists tax_amount      numeric(14,2) default 0;
alter table public.invoices    add column if not exists balance_due     numeric(14,2) default 0;
alter table public.expenses    add column if not exists paid_from       text;
alter table public.expenses    add column if not exists approved_by     text;
alter table public.bills       add column if not exists recurring       boolean default false;
alter table public.bills       add column if not exists recurring_day   int;
alter table public.bills       add column if not exists monthly_payment numeric(14,2) default 0;
alter table public.bills       add column if not exists paid_from       text;
alter table public.bills       add column if not exists balance_due     numeric(14,2) default 0;
alter table public.bills       add column if not exists vendor_email    text;
alter table public.accounts    add column if not exists is_active       boolean default true;
alter table public.accounts    add column if not exists current_balance numeric(14,2) default 0;

-- RLS
alter table public.accounts enable row level security;
alter table public.invoices  enable row level security;
alter table public.expenses  enable row level security;
alter table public.bills     enable row level security;
alter table public.budgets   enable row level security;
alter table public.payments  enable row level security;

drop policy if exists "Authenticated can manage accounts" on public.accounts;
drop policy if exists "Authenticated can manage invoices" on public.invoices;
drop policy if exists "Authenticated can manage expenses" on public.expenses;
drop policy if exists "Authenticated can manage bills"    on public.bills;
drop policy if exists "Authenticated can manage budgets"  on public.budgets;
drop policy if exists "Authenticated can create payments" on public.payments;
drop policy if exists "Authenticated can read payments"   on public.payments;

create policy "Authenticated can manage accounts" on public.accounts for all using (auth.role() = 'authenticated');
create policy "Authenticated can manage invoices" on public.invoices  for all using (auth.role() = 'authenticated');
create policy "Authenticated can manage expenses" on public.expenses  for all using (auth.role() = 'authenticated');
create policy "Authenticated can manage bills"    on public.bills     for all using (auth.role() = 'authenticated');
create policy "Authenticated can manage budgets"  on public.budgets   for all using (auth.role() = 'authenticated');
create policy "Authenticated can read payments"   on public.payments  for select using (auth.role() = 'authenticated');
create policy "Authenticated can create payments" on public.payments  for insert with check (auth.role() = 'authenticated');

-- Database helper functions used by the reports tab
create or replace function public.get_financial_dashboard()
returns jsonb as $$
declare
  v_monthly_revenue numeric; v_monthly_expenses numeric;
  v_outstanding_ar numeric; v_overdue_ar numeric; v_bills_due numeric;
  v_this_month text;
begin
  v_this_month := to_char(current_date, 'YYYY-MM');
  select coalesce(sum(total),0) into v_monthly_revenue from public.invoices where to_char(issue_date,'YYYY-MM') = v_this_month;
  select coalesce(sum(amount),0) into v_monthly_expenses from public.expenses where to_char(date,'YYYY-MM') = v_this_month and status = 'Approved';
  select coalesce(sum(balance_due),0) into v_outstanding_ar from public.invoices where status in ('Sent','Partial','Overdue');
  select coalesce(sum(balance_due),0) into v_overdue_ar from public.invoices where status = 'Overdue';
  select coalesce(sum(balance_due),0) into v_bills_due from public.bills where status in ('Unpaid','Partial');
  return jsonb_build_object(
    'monthly_revenue', v_monthly_revenue, 'monthly_expenses', v_monthly_expenses,
    'net_profit', v_monthly_revenue - v_monthly_expenses,
    'outstanding_ar', v_outstanding_ar, 'overdue_ar', v_overdue_ar, 'bills_due', v_bills_due,
    'total_invoices', (select count(*) from public.invoices),
    'total_expenses', (select count(*) from public.expenses where status = 'Approved')
  );
end;
$$ language plpgsql security definer;

create or replace function public.get_budget_vs_actual(p_year int, p_month int)
returns table (category text, budget numeric, actual numeric, variance numeric, status text) as $$
begin
  return query
  with actuals as (
    select e.category as cat, coalesce(sum(e.amount),0) as spent
    from public.expenses e
    where extract(year from e.date) = p_year and extract(month from e.date) = p_month
    group by e.category
  ),
  budgeted as (
    select b.category as cat, b.budget_amount as budg from public.budgets b
    where b.year = p_year and b.month = p_month
  )
  select coalesce(b.cat,a.cat),
    coalesce(b.budg,0), coalesce(a.spent,0),
    coalesce(b.budg,0) - coalesce(a.spent,0),
    case when coalesce(b.budg,0) = 0 then 'Unbudgeted'
         when coalesce(a.spent,0) > coalesce(b.budg,0) then 'Over Budget'
         when coalesce(a.spent,0) > coalesce(b.budg,0)*0.9 then 'Near Limit'
         else 'On Track' end
  from budgeted b full outer join actuals a on b.cat = a.cat
  where coalesce(b.budg,0) > 0 or coalesce(a.spent,0) > 0;
end;
$$ language plpgsql security definer;

create or replace function public.get_income_statement(p_start_date date, p_end_date date)
returns jsonb as $$
declare v_revenue numeric; v_expenses numeric;
begin
  select coalesce(sum(total),0) into v_revenue from public.invoices
    where status in ('Paid','Partial') and issue_date between p_start_date and p_end_date;
  select coalesce(sum(amount),0) into v_expenses from (
    select amount from public.expenses where status = 'Approved' and date between p_start_date and p_end_date
    union all
    select amount from public.bills where status = 'Paid' and issue_date between p_start_date and p_end_date
  ) x;
  return jsonb_build_object(
    'revenue', v_revenue, 'expenses', v_expenses, 'net_profit', v_revenue - v_expenses,
    'profit_margin', case when v_revenue > 0 then round(((v_revenue-v_expenses)/v_revenue)*100,2) else 0 end
  );
end;
$$ language plpgsql security definer;

create or replace function public.get_balance_sheet()
returns jsonb as $$
declare v_ar numeric; v_cash numeric; v_ap numeric;
begin
  select coalesce(sum(balance_due),0) into v_ar from public.invoices where status in ('Sent','Partial','Overdue');
  select coalesce(sum(current_balance),0) into v_cash from public.accounts where type = 'Asset' and is_active = true;
  select coalesce(sum(balance_due),0) into v_ap from public.bills where status in ('Unpaid','Partial','Overdue');
  return jsonb_build_object(
    'assets',      jsonb_build_object('cash', v_cash, 'accounts_receivable', v_ar, 'total', v_cash + v_ar),
    'liabilities', jsonb_build_object('accounts_payable', v_ap, 'total', v_ap),
    'equity',      jsonb_build_object('retained_earnings', v_cash + v_ar - v_ap, 'total', v_cash + v_ar - v_ap),
    'balanced', true
  );
end;
$$ language plpgsql security definer;
`;

// ── Migration SQL (Destructive - drops first for clean reinstall) ──
const FIN_MIGRATION_SQL_DESTRUCTIVE = `
drop table if exists public.payments cascade;
drop table if exists public.budgets cascade;
drop table if exists public.bills cascade;
drop table if exists public.expenses cascade;
drop table if exists public.invoices cascade;
drop table if exists public.accounts cascade;

` + FIN_MIGRATION_SQL_NON_DESTRUCTIVE;

function badge(status) {
  const cls = STATUS_COLORS[status] || 'bg-slate-100 text-slate-600';
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${status || '—'}</span>`;
}

// ── Schema cache refresh helper ───────────────────────────────
async function refreshSchemaCache() {
  let creds = null;
  try {
    creds = JSON.parse(localStorage.getItem('wv_db_config') || 'null');
  } catch(e) {}

  if (!creds || creds.provider !== 'supabase') {
    return Promise.reject(new Error('Schema refresh only works with Supabase'));
  }

  const adapter = window.WorkVoltDB;
  const client = adapter && adapter._client;

  if (!client) {
    return Promise.reject(new Error('Database client not available'));
  }

  const refreshQueries = [
    "select pg_notification_queue_usage();",
    "NOTIFY pgrst, 'reload schema';",
    "SELECT pg_stat_clear_snapshot();"
  ];

  return refreshQueries.reduce(function(chain, query) {
    return chain.then(function() {
      return client.rpc('exec_sql', { query: query })
        .catch(function() { return { error: null }; });
    });
  }, Promise.resolve());
}

// ── Main Fix Module function ──────────────────────────────────
async function fixModule(dropFirst) {
  dropFirst = dropFirst !== false;
  
  const statusEl = document.getElementById('fin-fix-status') || document.getElementById('fin-msg');
  const btn = document.getElementById('fin-fix-dropdown-btn') || document.getElementById('fin-fix-btn');
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> ' + (dropFirst ? 'Reinstalling…' : 'Fixing…');
  }
  
  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">' +
      '<i class="fas fa-circle-notch fa-spin"></i>' +
      (dropFirst ? 'Dropping and recreating financial tables…' : 'Creating missing tables/columns…') +
      '</div>';
  }

  const sqlToRun = dropFirst ? FIN_MIGRATION_SQL_DESTRUCTIVE : FIN_MIGRATION_SQL_NON_DESTRUCTIVE;
  
  let creds = null;
  try {
    creds = JSON.parse(localStorage.getItem('wv_db_config') || 'null');
  } catch(e) {}

  if (!creds || creds.provider !== 'supabase') {
    if (statusEl) {
      statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200">' +
        '<i class="fas fa-exclamation-circle"></i>Auto-fix only works with Supabase. Please run SQL manually.' +
        '</div>';
    }
    showSQLBlock();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-wrench text-xs"></i> Fix Module';
    }
    return Promise.reject(new Error('Not Supabase'));
  }

  const adapter = window.WorkVoltDB;
  const client = adapter && adapter._client;

  if (!client || typeof client.rpc !== 'function') {
    if (statusEl) {
      statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200">' +
        '<i class="fas fa-exclamation-circle"></i>Database client not available.' +
        '</div>';
    }
    showSQLBlock();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-wrench text-xs"></i> Fix Module';
    }
    return Promise.reject(new Error('No client'));
  }

  try {
    const res = await client.rpc('exec_sql', { query: sqlToRun });
    if (res.error) throw new Error(res.error.message || 'Migration failed');
    
    await refreshSchemaCache();
    
    if (statusEl) {
      statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-green-50 text-green-700 border border-green-200">' +
        '<i class="fas fa-check-circle"></i>Financials module fixed! Reloading page…' +
        '</div>';
    }
    toast('Financials module ' + (dropFirst ? 'reinstalled' : 'fixed') + ' successfully!', 'success');
    setTimeout(function() { window.location.reload(); }, 1500);
    
  } catch (err) {
    console.error('Fix module error:', err);
    if (statusEl) {
      const msg = err.message || 'Unknown error';
      if (msg.indexOf('exec_sql') !== -1 || msg.indexOf('function') !== -1 || msg.indexOf('does not exist') !== -1) {
        statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">' +
          '<i class="fas fa-exclamation-triangle"></i>Auto-fix requires an exec_sql helper. Run SQL manually below.' +
          '</div>';
      } else {
        statusEl.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200">' +
          '<i class="fas fa-exclamation-circle"></i>' + esc(msg) +
          '</div>';
      }
    }
    showSQLBlock();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-wrench text-xs"></i> Fix Module';
    }
  }
}

// ── Helper to show SQL block ───────────────────────────────────
function showSQLBlock() {
  const sqlBlock = document.getElementById('fin-sql-block');
  if (sqlBlock) sqlBlock.classList.remove('hidden');
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
window.WorkVoltPages.financials = async function(el) {
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

  // Bind SQL block buttons
  const copyBtn = document.getElementById('fin-copy-sql-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(FIN_MIGRATION_SQL_DESTRUCTIVE).then(function() {
        copyBtn.innerHTML = '<i class="fas fa-check mr-1"></i>Copied!';
        setTimeout(function() { copyBtn.innerHTML = '<i class="fas fa-copy mr-1"></i>Copy'; }, 2000);
      }).catch(function() {
        const pre = document.getElementById('fin-sql-pre');
        if (pre) {
          const range = document.createRange();
          range.selectNodeContents(pre);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
        }
      });
    });
  }

  const reloadBtn = document.getElementById('fin-reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function() { window.location.reload(); });
  }

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
  
  // Check if user is admin (adjust role check as needed)
  const isAdmin = () => {
    try { 
      const user = window.WorkVolt.user();
      return ['SuperAdmin','Admin'].includes(user?.role); 
    } catch(e) { 
      return false; 
    }
  };

  const actions = {
    invoices: `<button onclick="FinPage.newInvoice()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Invoice</button>`,
    expenses: `<button onclick="FinPage.newExpense()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Expense</button>`,
    bills:    `<button onclick="FinPage.newBill()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Bill</button>`,
    budgets:  `<button onclick="FinPage.newBudget()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>Set Budget</button>`,
    accounts: `<button onclick="FinPage.newAccount()" class="btn-fin-primary"><i class="fas fa-plus text-xs"></i>New Account</button>`,
  };
  
  el.innerHTML = (actions[state.tab] || '') + 
    
    `<style>
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

  // Bind Fix Module dropdown
  bindFixModuleDropdown();

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
    loadCrossModuleData(),
  ]);
  renderTab();
  updateHeaderActions();
}

// ── Refresh dashboard + reports in background after any data change ──
function refreshLinkedTabs() {
  // Always re-render the current tab first
  const c = document.getElementById('fin-content');

  // Re-render dashboard KPIs immediately (uses local state, no extra API call)
  if (state.tab === 'dashboard' && c) renderDashboard(c);

  // If on reports, re-render immediately from local state
  if (state.tab === 'reports' && c) {
    state.incomeStmt = null;
    renderReports(c);
  }

  // Always silently reload dashboard data in background so next visit is fresh
  loadDashboard();
}

// ── Data Loading Functions (Supabase via WorkVoltDB) ─────────────────
async function loadDashboard() {
  try {
    // Use the database function for dashboard data
    const { data, error } = await window.WorkVoltDB.getAdapter()._client
      .rpc('get_financial_dashboard');
    if (error) throw error;
    state.dashboard = data || {};
  } catch(e) {
    console.warn('Dashboard load error:', e);
    // Fallback to local calculation
    computeDashboardLocally();
  }
}

function computeDashboardLocally() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  
  const monthlyRevenue = state.invoices
    .filter(inv => inv.issue_date && inv.issue_date.startsWith(ym))
    .reduce((s,inv) => s + (parseFloat(inv.total)||0), 0);
    
  const monthlyExpenses = state.expenses
    .filter(e => e.date && e.date.startsWith(ym))
    .reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
    
  const outstandingAR = state.invoices
    .filter(inv => ['Sent','Partial','Overdue'].includes(inv.status))
    .reduce((s,inv) => s + (parseFloat(inv.balance_due)||0), 0);
    
  const overdueAR = state.invoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((s,inv) => s + (parseFloat(inv.balance_due)||0), 0);

  state.dashboard = {
    monthly_revenue: monthlyRevenue,
    monthly_expenses: monthlyExpenses,
    net_profit: monthlyRevenue - monthlyExpenses,
    outstanding_ar: outstandingAR,
    overdue_ar: overdueAR,
    total_invoices: state.invoices.length,
    total_expenses: state.expenses.length
  };
}

async function loadInvoices() {
  try {
    const data = await window.WorkVoltDB.invoices.list();
    state.invoices = data || [];
  } catch(e) {
    console.warn('Invoices load error:', e);
    state.invoices = [];
  }
}

async function loadExpenses() {
  try {
    const data = await window.WorkVoltDB.expenses.list();
    state.expenses = data || [];
  } catch(e) {
    console.warn('Expenses load error:', e);
    state.expenses = [];
  }
}

async function loadBills() {
  try {
    const data = await window.WorkVoltDB.bills.list();
    state.bills = data || [];
  } catch(e) {
    console.warn('Bills load error:', e);
    state.bills = [];
  }
}

async function loadBudgets() {
  try {
    const data = await window.WorkVoltDB.budgets.list();
    state.budgets = data || [];
    
    // Load budget vs actual for current month
    const now = new Date();
    try {
      const { data: vaData, error } = await window.WorkVoltDB.getAdapter()._client
        .rpc('get_budget_vs_actual', { 
          p_year: now.getFullYear(), 
          p_month: now.getMonth() + 1 
        });
      if (!error) state.budgetVA = { lines: vaData || [] };
    } catch(e) {
      // Fallback to local calculation
      computeBudgetVsActualLocally();
    }
  } catch(e) {
    console.warn('Budgets load error:', e);
    state.budgets = [];
  }
}

function computeBudgetVsActualLocally() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  
  const actuals = {};
  state.expenses.forEach(e => {
    if (e.date && e.date.startsWith(ym) && e.category) {
      actuals[e.category] = (actuals[e.category]||0) + (parseFloat(e.amount)||0);
    }
  });
  
  const lines = state.budgets.map(b => {
    const actual = actuals[b.category] || 0;
    const budget = parseFloat(b.budget_amount) || 0;
    const variance = budget - actual;
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    const status = pct > 100 ? 'Over Budget' : pct > 90 ? 'Near Limit' : 'On Track';
    return { 
      category: b.category, 
      budget, 
      actual, 
      variance, 
      status,
      year: b.year,
      month: b.month
    };
  });
  
  state.budgetVA = { lines };
}

async function loadAccounts() {
  try {
    console.log('Loading accounts...');
    const data = await window.WorkVoltDB.list('accounts', {}, { order: 'account_name', asc: true });
    console.log('Accounts loaded:', data);
    console.log('First account fields:', data?.[0] ? Object.keys(data[0]) : 'No accounts');
    state.accounts = data || [];
  } catch(e) {
    console.error('Accounts load error:', e);
    state.accounts = [];
  }
}

// ── Cross-module integration ──────────────────────────────────────
async function loadCrossModuleData() {
  const tryLoad = async (module, tableName) => {
    try {
      const data = await window.WorkVoltDB.list(tableName, {}, { order: 'created_at' });
      state.modules[module].installed = true;
      state.modules[module].data = data || [];
    } catch(e) {
      state.modules[module].installed = false;
    }
  };

  await Promise.allSettled([
    tryLoad('payroll', 'payroll_runs'),
    tryLoad('assets', 'assets'),
    tryLoad('tasks', 'tasks'),
  ]);
}

function calcPayrollNet(r) {
  if (r.net !== undefined && r.net !== null) return parseFloat(r.net) || 0;
  const gross = (parseFloat(r.gross) || 0) + (parseFloat(r.bonuses || r.bonus) || 0);
  const ded = (parseFloat(r.deductions) || 0) + (parseFloat(r.tax_total || r.tax) || 0);
  return Math.max(0, gross - ded);
}

async function loadReports() {
  try {
    // Use database functions for reports
    const adapter = window.WorkVoltDB.getAdapter()._client;
    const now = new Date();
    const startOfYear = `${now.getFullYear()}-01-01`;
    const endOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;
    
    // Income statement
    const { data: isData, error: isError } = await adapter
      .rpc('get_income_statement', { 
        p_start_date: startOfYear, 
        p_end_date: endOfMonth 
      });
    if (!isError) state.incomeStmt = isData;
    
    // Balance sheet
    const { data: bsData, error: bsError } = await adapter
      .rpc('get_balance_sheet');
    if (!bsError) state.balanceSheet = bsData;
    
    // Cashflow computed locally for now
    computeCashflowLocally();
  } catch(e) {
    console.warn('Reports load error:', e);
    computeReportsLocally();
  }
}

function computeReportsLocally() {
  // Income statement
  const revenue = state.invoices
    .filter(inv => ['Paid','Partial'].includes(inv.status))
    .reduce((s, inv) => s + (parseFloat(inv.total)||0), 0);
    
  const expenses = state.expenses
    .filter(e => e.status === 'Approved')
    .reduce((s, e) => s + (parseFloat(e.amount)||0), 0);
    
  const bills = state.bills
    .filter(b => b.status === 'Paid')
    .reduce((s, b) => s + (parseFloat(b.amount)||0), 0);
    
  const totalExpenses = expenses + bills;
  const net = revenue - totalExpenses;
  
  state.incomeStmt = {
    revenue,
    expenses: totalExpenses,
    net_profit: net,
    profit_margin: revenue > 0 ? (net / revenue * 100) : 0
  };
  
  // Balance sheet
  const ar = state.invoices
    .filter(inv => ['Sent','Partial','Overdue'].includes(inv.status))
    .reduce((s, inv) => s + (parseFloat(inv.balance_due)||0), 0);
    
  const cash = state.accounts
    .filter(a => a.type === 'Asset' && a.is_active !== false)
    .reduce((s, a) => s + (parseFloat(a.current_balance)||0), 0);
    
  const ap = state.bills
    .filter(b => ['Unpaid','Partial','Overdue'].includes(b.status))
    .reduce((s, b) => s + (parseFloat(b.balance_due)||0), 0);
    
  state.balanceSheet = {
    assets: { cash, accounts_receivable: ar, total: cash + ar },
    liabilities: { accounts_payable: ap, total: ap },
    equity: { retained_earnings: cash + ar - ap, total: cash + ar - ap },
    balanced: true
  };
  
  computeCashflowLocally();
}

function computeCashflowLocally() {
  const operatingIn = state.invoices
    .filter(inv => ['Paid','Partial','Sent'].includes(inv.status))
    .reduce((s, inv) => s + (parseFloat(inv.total)||0), 0);
    
  const operatingOut = state.expenses
    .filter(e => e.status === 'Approved')
    .reduce((s, e) => s + (parseFloat(e.amount)||0), 0)
    + state.bills
    .filter(b => b.status === 'Paid')
    .reduce((s, b) => s + (parseFloat(b.amount)||0), 0);
    
  state.cashflow = {
    operating: { inflow: operatingIn, outflow: operatingOut, net: operatingIn - operatingOut },
    investing: { net: 0 },
    financing: { net: 0 }
  };
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
  const monthRevenue = state.invoices
    .filter(inv => inv.issue_date && inv.issue_date.startsWith(ym))
    .reduce((s,inv) => s + (parseFloat(inv.total)||0), 0);

  const monthExpenses = state.expenses
    .filter(e => e.date && e.date.startsWith(ym) && e.status === 'Approved')
    .reduce((s,e) => s + (parseFloat(e.amount)||0), 0);

  const monthBills = state.bills
    .filter(b => (b.issue_date||b.due_date||'').startsWith(ym))
    .reduce((s,b) => s + (parseFloat(b.amount)||0), 0);

  // Cross-module costs
  const payrollCost = state.modules.payroll.installed
    ? state.modules.payroll.data.reduce((s,p) => s + calcPayrollNet(p), 0) : 0;
  const maintCost = state.modules.assets.installed
    ? state.modules.assets.data.reduce((s,m) => s + (parseFloat(m.purchase_value||0)), 0) : 0;
  const taskCost = state.modules.tasks.installed
    ? state.modules.tasks.data.reduce((s,t) => s + (parseFloat(t.pay_amount||0)), 0) : 0;

  const totalOutflows = monthExpenses + monthBills + payrollCost + maintCost + taskCost;
  const netProfit     = monthRevenue - totalOutflows;

  // AR metrics
  const outstandingAR = state.invoices
    .filter(inv => ['Sent','Partial','Unpaid'].includes(inv.status))
    .reduce((s,inv) => s + (parseFloat(inv.balance_due)||parseFloat(inv.total)||0), 0);
  const overdueAR = state.invoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((s,inv) => s + (parseFloat(inv.balance_due)||parseFloat(inv.total)||0), 0);
  const billsDue = state.bills
    .filter(b => ['Unpaid','Partial'].includes(b.status))
    .reduce((s,b) => s + (parseFloat(b.balance_due)||parseFloat(b.amount)||0), 0);
  const overdueBills = state.bills
    .filter(b => b.status === 'Overdue')
    .reduce((s,b) => s + (parseFloat(b.balance_due)||parseFloat(b.amount)||0), 0);

  // Expense breakdown
  const expBreakRaw = {};
  state.expenses.forEach(e => {
    if (e.category) expBreakRaw[e.category] = (expBreakRaw[e.category]||0) + (parseFloat(e.amount)||0);
  });
  if (payrollCost > 0) expBreakRaw['Payroll'] = (expBreakRaw['Payroll']||0) + payrollCost;
  if (maintCost > 0) expBreakRaw['Asset Maintenance'] = (expBreakRaw['Asset Maintenance']||0) + maintCost;
  if (taskCost > 0) expBreakRaw['Task Costs'] = (expBreakRaw['Task Costs']||0) + taskCost;
  if (monthBills > 0) expBreakRaw['Bills'] = (expBreakRaw['Bills']||0) + monthBills;

  // Build 6 months of trend data
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d2 = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}`,
      label: d2.toLocaleDateString('en-US', { month: 'short' }),
      isCurrent: i === 0
    });
  }

  months.forEach(m => {
    m.revenue = state.invoices
      .filter(inv => inv.issue_date && inv.issue_date.startsWith(m.key))
      .reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    
    m.expenses = state.expenses
      .filter(e => e.date && e.date.startsWith(m.key) && e.status === 'Approved')
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    
    m.expenses += state.bills
      .filter(b => ((b.issue_date || b.due_date || '')).startsWith(m.key))
      .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
  });

  const maxValue = Math.max(...months.map(m => Math.max(m.revenue, m.expenses)), 1);

  const trendChart = months.map(m => {
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

  const expBreak = Object.keys(expBreakRaw).length ? expBreakRaw : (d.expense_breakdown || {});

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
    try { 
      await window.WorkVoltDB.update('invoices', id, { status: 'Sent' }); 
      toast('Invoice sent!','success'); 
      await loadInvoices(); 
      renderInvoices(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
  window.FinPage._payInv = async (id) => {
    try { 
      const inv = state.invoices.find(r => r.id === id);
      await window.WorkVoltDB.update('invoices', id, { 
        status: 'Paid',
        balance_due: 0
      }); 
      toast('Invoice marked as paid!','success'); 
      await loadInvoices(); 
      renderInvoices(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
  window.FinPage._editInv = (id) => {
    const inv = state.invoices.find(r => r.id === id);
    if (inv) showInvoiceModal(inv);
  };
  window.FinPage._deleteInv = async (id) => {
    if (!confirm('Delete this invoice?')) return;
    try { 
      await window.WorkVoltDB.delete('invoices', id); 
      toast('Deleted','success'); 
      await loadInvoices(); 
      renderInvoices(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPENSES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderExpenses(c) {
  const f = state.filter.expenses;
  let rows = state.expenses;
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.search) { 
    const q = f.search.toLowerCase(); 
    rows = rows.filter(r => (r.vendor||'').toLowerCase().includes(q) || (r.description||'').toLowerCase().includes(q)); 
  }

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
    try { 
      await window.WorkVoltDB.update('expenses', id, { 
        status: 'Approved',
        approved_by: user()?.id,
        approved_by_name: user()?.name
      }); 
      toast('Approved','success'); 
      await loadExpenses(); 
      renderExpenses(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
  window.FinPage._rejectExp  = async (id) => {
    try { 
      await window.WorkVoltDB.update('expenses', id, { 
        status: 'Rejected',
        approved_by: user()?.id,
        approved_by_name: user()?.name
      }); 
      toast('Rejected','info'); 
      await loadExpenses(); 
      renderExpenses(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
  window.FinPage._editExp    = (id) => { 
    const e = state.expenses.find(r=>r.id===id); 
    if(e) showExpenseModal(e); 
  };
  window.FinPage._deleteExp  = async (id) => {
    if (!confirm('Delete this expense?')) return;
    try { 
      await window.WorkVoltDB.delete('expenses', id); 
      toast('Deleted','success'); 
      await loadExpenses(); 
      renderExpenses(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BILLS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderBills(c) {
  const f = state.filter.bills;
  let rows = state.bills;
  if (f.status) rows = rows.filter(r => r.status === f.status);
  if (f.search) { 
    const q = f.search.toLowerCase(); 
    rows = rows.filter(r => (r.vendor||'').toLowerCase().includes(q)); 
  }

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
            const isRecurring = b.recurring === true || b.recurring === 'true';
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
    const isRecurring = b?.recurring === true || b?.recurring === 'true';
    const monthlyAmt  = parseFloat(b?.monthly_payment) || 0;
    showPaymentModal(id, 'bill', isRecurring && monthlyAmt > 0 ? monthlyAmt : null);
  };
  window.FinPage._editBill   = (id) => { 
    const b = state.bills.find(r=>r.id===id); 
    if(b) showBillModal(b); 
  };
  window.FinPage._deleteBill = async (id) => {
    if (!confirm('Delete this bill?')) return;
    try { 
      await window.WorkVoltDB.delete('bills', id); 
      toast('Deleted','success'); 
      await loadBills(); 
      renderBills(c); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUDGETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderBudgets(c) {
  const bva  = state.budgetVA;
  const now  = new Date();
  const ym   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // Build lines from budget vs actual data
  let lines = bva?.lines || [];

  if (!lines.length && state.budgets.length) {
    computeBudgetVsActualLocally();
    lines = state.budgetVA?.lines || [];
  }

  // Unbudgeted categories
  const budgetedCats = new Set(lines.map(l => l.category));
  const unbudgeted   = {};
  state.expenses.forEach(e => {
    if (e.date && e.date.startsWith(ym) && e.category && !budgetedCats.has(e.category)) {
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
            ? state.modules.assets.data.reduce((s,m)=>s+(parseFloat(m.purchase_value||0)),0) : 0;
          const taskTotal    = state.modules.tasks.installed
            ? state.modules.tasks.data.reduce((s,t)=>s+(parseFloat(t.pay_amount||0)),0) : 0;

          const totalAllExpenses = baseExpenses + billsTotal + payrollTotal + maintTotal + taskTotal;
          const netProfit  = baseRevenue - totalAllExpenses;
          const profitMargin = baseRevenue > 0 ? (netProfit / baseRevenue * 100) : 0;

          // Build expense breakdown
          const expBreakdown = {};
          state.expenses.forEach(e => { 
            if(e.category) expBreakdown[e.category]=(expBreakdown[e.category]||0)+(parseFloat(e.amount)||0); 
          });
          if (billsTotal > 0)   expBreakdown['Bills & Payables']  = (expBreakdown['Bills & Payables']||0) + billsTotal;
          if (payrollTotal > 0) expBreakdown['Payroll']           = (expBreakdown['Payroll']||0) + payrollTotal;
          if (maintTotal > 0)   expBreakdown['Asset Maintenance'] = (expBreakdown['Asset Maintenance']||0) + maintTotal;
          if (taskTotal > 0)    expBreakdown['Task Costs']        = (expBreakdown['Task Costs']||0) + taskTotal;

          // Revenue breakdown
          const revBreakdown = {};
          state.invoices.forEach(inv => {
            const key = inv.customer || 'Uncategorised';
            revBreakdown[key] = (revBreakdown[key] || 0) + (parseFloat(inv.total) || 0);
          });
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
          ${reportLine('Cash', fmt.currency(bs.assets?.cash), 'text-slate-600')}
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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Operating Activities</p>
          ${reportLine('Inflows (Invoices & Receipts)', fmt.currency(cf.operating?.inflow), 'text-emerald-600')}
          ${reportLine('Outflows (Expenses & Bills)', fmt.currency(cf.operating?.outflow), 'text-red-500')}
          ${reportLine('Net Operating', fmt.currency(cf.operating?.net), 'font-bold text-slate-800')}
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Investing Activities</p>
          ${reportLine('Net Investing', fmt.currency(cf.investing?.net), 'font-bold text-slate-800')}
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Financing Activities</p>
          ${reportLine('Net Financing', fmt.currency(cf.financing?.net), 'font-bold text-slate-800')}
        </div>
      </div>
      <div class="mt-4 pt-4 border-t border-slate-100">
        ${(() => {
          const netCF = (cf.operating?.net || 0) + (cf.investing?.net || 0) + (cf.financing?.net || 0);
          return reportLine('Net Cash Flow', fmt.currency(netCF), `font-extrabold text-lg ${netCF >= 0 ? 'text-emerald-600' : 'text-red-500'}`);
        })()}
      </div>
    </div>

    // Bills Summary
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
      
      // FIXED: Calculate actual amount paid (amount - remaining balance) for ALL bills
      // This includes partial payments, not just fully paid bills
      const paid      = bills.reduce((s,b)=>{
        const billAmount = parseFloat(b.amount)||0;
        const remaining = parseFloat(b.balance_due)||0;
        return s + Math.max(0, billAmount - remaining); // Ensure non-negative
      },0);
      
      const unpaid    = bills.filter(b=>['Unpaid','Partial'].includes(b.status))
                            .reduce((s,b)=>s+(parseFloat(b.balance_due)||0),0);
      const overdue   = bills.filter(b=>b.status==='Overdue')
                            .reduce((s,b)=>s+(parseFloat(b.balance_due)||0),0);
      
      // Calculate how much is remaining on "Paid" bills (should be 0)
      const paidBillsRemaining = bills.filter(b=>b.status==='Paid')
                                      .reduce((s,b)=>s+(parseFloat(b.balance_due)||0),0);
      
      const byVendor  = {};
      bills.forEach(b=>{ if(b.vendor){ byVendor[b.vendor]=(byVendor[b.vendor]||0)+(parseFloat(b.amount)||0); } });
      const topVendors = Object.entries(byVendor).sort((a,b)=>b[1]-a[1]).slice(0,5);
      
      const vendorSection = topVendors.length ? collapsibleSection(
        `Top Vendors (${topVendors.length})`,
        topVendors.map(([v,a])=>reportLine(v,fmt.currency(a),'text-slate-600')).join(''),
        false
      ) : '';
      
      return reportLine('Total Bills',fmt.currency(total),'font-semibold text-slate-700')
        + reportLine('Total Paid',fmt.currency(paid),'text-emerald-600 font-semibold')
        + reportLine('Outstanding Balance',fmt.currency(unpaid),'text-amber-600')
        + reportLine('Overdue',fmt.currency(overdue),'font-semibold text-red-500')
        + (paidBillsRemaining > 0 ? reportLine('⚠️ Paid bills with balance',fmt.currency(paidBillsRemaining),'text-orange-500 text-xs') : '')
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

  // Assets
  if (mods.assets.installed) {
    const assets = mods.assets.data;
    const totalValue = assets.reduce((s,a) => s + (parseFloat(a.purchase_value || 0)), 0);
    sections.push(`
      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h3 class="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
          <span class="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center"><i class="fas fa-box text-orange-600 text-xs"></i></span>
          Assets
          <span class="ml-2 text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Connected</span>
        </h3>
        <div class="space-y-1">
          ${reportLine('Total Asset Value', fmt.currency(totalValue), 'font-semibold text-slate-800')}
          ${reportLine('Active Assets', String(assets.filter(a => a.status === 'Active').length), 'text-emerald-600')}
          ${reportLine('Total Assets', String(assets.length), 'text-slate-500')}
        </div>
      </div>`);
  }

  // Tasks
  if (mods.tasks.installed) {
    const tasks = mods.tasks.data;
    const totalCost  = tasks.reduce((s,t) => s + (parseFloat(t.pay_amount||0)), 0);
    const completed  = tasks.filter(t => t.status === 'Done').length;
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
// ACCOUNTS - Fixed with Debugging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function renderAccounts(c) {
  console.log('=== RENDER ACCOUNTS DEBUG ===');
  console.log('state.accounts:', state.accounts);
  console.log('state.accounts.length:', state.accounts?.length);
  console.log('First account (if any):', state.accounts?.[0]);
  
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

  // Group accounts by type
  const grouped = {};
  typeOrder.forEach(t => grouped[t] = []);
  
  (state.accounts || []).forEach(a => { 
    console.log('Processing account:', a.account_name, 'Type:', a.type, 'Balance:', a.current_balance);
    if (grouped[a.type]) grouped[a.type].push(a); 
  });

  // CORRECTED CALCULATION
  const assetTotal = (grouped['Asset'] || []).reduce((s, a) => {
    const bal = parseFloat(a.current_balance) || 0;
    return s + bal;
  }, 0);

  const liabilityTotal = (grouped['Liability'] || []).reduce((s, a) => {
    const bal = parseFloat(a.current_balance) || 0;
    // Use absolute value since liabilities should be positive (money owed)
    return s + Math.abs(bal);
  }, 0);

  // Net Worth = Assets - Liabilities
  const netWorth = assetTotal - liabilityTotal;
  
  console.log('Totals:', { assetTotal, liabilityTotal, netWorth });

  c.innerHTML = `
  <div class="p-6 max-w-5xl mx-auto fade-in space-y-5">

    <!-- Summary strip - ACCOUNT BALANCES -->
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Assets</p>
        <p class="text-xl font-extrabold text-emerald-600 mt-1">${fmt.currency(assetTotal)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Cash, bank accounts, receivables</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Liabilities</p>
        <p class="text-xl font-extrabold text-red-500 mt-1">${fmt.currency(liabilityTotal)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Credit cards, loans, payables</p>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Net Worth</p>
        <p class="text-xl font-extrabold ${netWorth >= 0 ? 'text-blue-600' : 'text-red-500'} mt-1">${fmt.currency(netWorth)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Assets minus liabilities</p>
      </div>
    </div>

    <!-- Account cards by type -->
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
              // Safely get balance with multiple fallback field names
              const rawBalance = a.current_balance ?? a.balance ?? a.amount ?? 0;
              const balance = parseFloat(rawBalance) || 0;
              const isPositive = balance >= 0;
              
              console.log('Rendering account card:', a.account_name, 'Raw:', rawBalance, 'Parsed:', balance);
              
              return `
                <div class="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                  <div class="flex items-start justify-between mb-3">
                    <div>
                      <p class="font-bold text-slate-800 text-sm">${a.account_name || 'Unnamed'}</p>
                      <p class="text-xs text-slate-400 mt-0.5">${a.account_number ? '#' + a.account_number + ' · ' : ''}${a.category || a.type || 'Unknown'}</p>
                    </div>
                    <div class="flex items-center gap-1">
                      ${a.is_active !== false
                        ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>'
                        : '<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Inactive</span>'}
                      <button onclick="FinPage._editAcc('${a.id}')" class="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fas fa-edit text-xs"></i></button>
                      <button onclick="FinPage._deleteAcc('${a.id}')" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                  </div>
                  
                  <!-- Account Balance Display -->
                  <div class="border-t border-slate-100 pt-3">
                    <div class="flex justify-between items-center">
                      <span class="text-xs text-slate-500">Current Balance</span>
                      <span class="text-lg font-extrabold ${isPositive ? 'text-emerald-600' : 'text-red-500'}">
                        ${fmt.currency(balance)}
                      </span>
                    </div>
                    ${a.description ? `<p class="text-[11px] text-slate-400 mt-2">${a.description}</p>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('')}

    <!-- Empty state -->
    ${!state.accounts.length ? `
      <div class="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200">
        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-university text-3xl text-slate-300"></i>
        </div>
        <p class="font-semibold text-slate-600 mb-2">No accounts set up yet</p>
        <p class="text-sm text-slate-400 mb-6 max-w-md mx-auto">
          Create accounts like "Business Checking", "Savings", or "Credit Card" to track your balances.
        </p>
        <button onclick="showAccountModal()" class="px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors shadow-sm">
          <i class="fas fa-plus mr-2"></i>Create First Account
        </button>
      </div>` : ''}
  </div>`;

  window.FinPage._editAcc = (id) => { 
    const a = state.accounts.find(r=>r.id===id); 
    if(a) showAccountModal(a); 
  };
  window.FinPage._deleteAcc = async (id) => {
    const a = state.accounts.find(r=>r.id===id);
    if (!confirm(`Delete account "${a?.account_name || id}"? This cannot be undone.`)) return;
    try { 
      await window.WorkVoltDB.delete('accounts', id); 
      toast('Account deleted','success'); 
      await loadAccounts(); 
      renderAccounts(document.getElementById('fin-content')); 
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER: Update Account Balance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateAccountBalance(accountName, amountChange) {
  if (!accountName) return;
  
  try {
    // Find the account by name
    const account = state.accounts.find(a => a.account_name === accountName);
    if (!account) {
      console.warn(`Account "${accountName}" not found for balance update`);
      return;
    }
    
    // Calculate new balance
    const currentBalance = parseFloat(account.current_balance) || 0;
    const newBalance = currentBalance + parseFloat(amountChange);
    
    // Update in database
    await window.WorkVoltDB.update('accounts', account.id, { 
      current_balance: newBalance.toFixed(2)
    });
    
    // Update local state immediately
    account.current_balance = newBalance.toFixed(2);
    
    console.log(`Updated ${accountName}: ${currentBalance} → ${newBalance} (${amountChange > 0 ? '+' : ''}${amountChange})`);
  } catch(e) {
    console.error('Failed to update account balance:', e);
    throw e;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODALS - Updated with Auto-Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Invoice Modal - Adds to account balance when created/sent
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
      ${sel('Status', 'status', ['Draft','Sent','Unpaid','Paid','Partial','Overdue'], inv?.status || 'Draft')}
      ${accountSel('Deposit To Account', 'deposit_account', inv?.deposit_account || '', ['Asset'])}
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <i class="fas fa-info-circle mr-1"></i>
        When saved as <strong>Sent</strong> or <strong>Paid</strong>, the total will be added to the selected account balance.
      </div>
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
    
    const sub = parseFloat(data.subtotal) || 0;
    const rate = parseFloat(data.tax_rate) || 0;
    data.tax_amount = (sub * rate / 100).toFixed(2);
    if (!data.total || parseFloat(data.total) === 0) data.total = (sub + parseFloat(data.tax_amount)).toFixed(2);
    
    // Set balance_due to total for new invoices
    if (!id) data.balance_due = data.total;
    
    try {
      const oldData = id ? state.invoices.find(i => i.id === id) : null;
      const oldStatus = oldData?.status;
      const oldDeposit = oldData?.deposit_account;
      const oldTotal = parseFloat(oldData?.total) || 0;
      
      if (id) { 
        await window.WorkVoltDB.update('invoices', id, data); 
        toast('Invoice updated','success'); 
        
        // Handle account balance changes for edits
        const newStatus = data.status;
        const newDeposit = data.deposit_account;
        const newTotal = parseFloat(data.total) || 0;
        
        // If status changed from Draft to Sent/Paid, add to account
        if (oldStatus === 'Draft' && ['Sent','Paid','Partial'].includes(newStatus) && newDeposit) {
          await updateAccountBalance(newDeposit, newTotal);
        }
        // If status changed from Sent/Paid to Draft, remove from account
        else if (['Sent','Paid','Partial'].includes(oldStatus) && newStatus === 'Draft' && oldDeposit) {
          await updateAccountBalance(oldDeposit, -oldTotal);
        }
        // If deposit account changed while active, transfer between accounts
        else if (['Sent','Paid','Partial'].includes(newStatus) && oldDeposit && newDeposit && oldDeposit !== newDeposit) {
          await updateAccountBalance(oldDeposit, -oldTotal);
          await updateAccountBalance(newDeposit, newTotal);
        }
        // If total changed while active, adjust the difference
        else if (['Sent','Paid','Partial'].includes(newStatus) && oldDeposit && newTotal !== oldTotal) {
          await updateAccountBalance(oldDeposit, newTotal - oldTotal);
        }
      }
      else { 
        await window.WorkVoltDB.create('invoices', data); 
        toast('Invoice created','success'); 
        
        // If creating as Sent/Paid, add to account balance immediately
        if (['Sent','Paid'].includes(data.status) && data.deposit_account) {
          await updateAccountBalance(data.deposit_account, parseFloat(data.total));
        }
      }
      
      closeModal();
      await loadInvoices();
      await loadAccounts(); // Refresh accounts to show updated balances
      const c = document.getElementById('fin-content'); 
      if(c) renderInvoices(c);
      refreshLinkedTabs();
    } catch(e) { 
      toast(e.message,'error'); 
    }
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
  setTimeout(() => window.FinPage._calcInvTotal?.(), 50);
}

// Expense Modal - Subtracts from account when approved
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
      <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
        <i class="fas fa-info-circle mr-1"></i>
        When marked as <strong>Approved</strong>, the amount will be deducted from the selected account.
      </div>
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveExpense(${exp ? `'${exp.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${exp ? 'Save Changes' : 'Log Expense'}</button>`
  );

  window.FinPage._saveExpense = async (id) => {
    const data = getForm('exp-form');
    if (!data.amount) { toast('Amount is required','error'); return; }
    
    if (!id) {
      data.employee_id = user()?.id;
      data.employee_name = user()?.name;
    }
    
    try {
      const oldData = id ? state.expenses.find(e => e.id === id) : null;
      const oldStatus = oldData?.status;
      const oldAccount = oldData?.paid_from;
      const oldAmount = parseFloat(oldData?.amount) || 0;
      
      if (id) { 
        await window.WorkVoltDB.update('expenses', id, data); 
        toast('Updated','success'); 
        
        // Handle account balance changes
        const newStatus = data.status;
        const newAccount = data.paid_from;
        const newAmount = parseFloat(data.amount) || 0;
        
        // If status changed to Approved, deduct from account
        if (oldStatus !== 'Approved' && newStatus === 'Approved' && newAccount) {
          await updateAccountBalance(newAccount, -newAmount);
        }
        // If status changed from Approved to something else, refund account
        else if (oldStatus === 'Approved' && newStatus !== 'Approved' && oldAccount) {
          await updateAccountBalance(oldAccount, oldAmount);
        }
        // If account changed while approved, transfer between accounts
        else if (newStatus === 'Approved' && oldAccount && newAccount && oldAccount !== newAccount) {
          await updateAccountBalance(oldAccount, oldAmount); // refund old
          await updateAccountBalance(newAccount, -newAmount); // deduct new
        }
        // If amount changed while approved, adjust the difference
        else if (newStatus === 'Approved' && oldAccount && newAmount !== oldAmount) {
          await updateAccountBalance(oldAccount, oldAmount - newAmount); // reverse old, apply new difference
        }
      }
      else { 
        await window.WorkVoltDB.create('expenses', data); 
        toast('Expense logged','success'); 
        
        // If creating as Approved, deduct immediately
        if (data.status === 'Approved' && data.paid_from) {
          await updateAccountBalance(data.paid_from, -parseFloat(data.amount));
        }
      }
      
      closeModal();
      await loadExpenses();
      await loadAccounts();
      const c = document.getElementById('fin-content'); 
      if(c) renderExpenses(c);
      refreshLinkedTabs();
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// Bill Modal - Subtracts from account when paid
function showBillModal(bill = null) {
  const today = new Date().toISOString().split('T')[0];
  const isRecurring = bill?.recurring === true || bill?.recurring === 'true';
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

      <div class="grid grid-cols-2 gap-3">
        ${field('Total Bill Amount ($)', 'amount', 'number', bill?.amount, 'step="0.01" min="0" oninput="FinPage._syncBillBalance()"')}
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Balance Due ($)</label>
          <input type="number" name="balance_due" step="0.01" min="0"
            value="${bill?.balance_due ?? bill?.amount ?? ''}"
            class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
          <p class="text-[10px] text-slate-400 mt-0.5">Remaining balance — reduces with each payment.</p>
        </div>
      </div>

      <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" name="recurring" id="bill-recurring-toggle" value="true"
            ${isRecurring ? 'checked' : ''}
            onchange="FinPage._toggleRecurring(this.checked)"
            class="w-4 h-4 accent-violet-600 rounded">
          <div>
            <span class="text-sm font-semibold text-slate-700">Recurring Monthly Bill</span>
            <p class="text-[11px] text-slate-400">Auto-due every month. Balance reduces by monthly payment each time Pay is clicked.</p>
          </div>
        </label>
      </div>

      <div id="bill-recurring-opts" class="${isRecurring ? '' : 'hidden'} space-y-3 pl-1">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Monthly Payment Amount ($)</label>
            <input type="number" name="monthly_payment" step="0.01" min="0"
              value="${bill?.monthly_payment || ''}"
              placeholder="e.g. 100.00"
              class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Due Day of Month</label>
            <input type="number" name="recurring_day" min="1" max="31"
              value="${bill?.recurring_day || ''}"
              placeholder="e.g. 15"
              class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white">
          </div>
        </div>
      </div>

      ${sel('Status', 'status', ['Unpaid','Partial','Paid','Overdue'], bill?.status || 'Unpaid')}
      <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
        <i class="fas fa-info-circle mr-1"></i>
        When marked as <strong>Paid</strong>, the amount will be deducted from the selected account.
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
        <textarea name="notes" rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">${bill?.notes||''}</textarea>
      </div>
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._saveBill(${bill ? `'${bill.id}'` : 'null'})" class="btn-primary" style="background:#10b981">${bill ? 'Save' : 'Add Bill'}</button>`
  );

  window.FinPage._syncBillBalance = () => {
    const amt = document.querySelector('#bill-form [name=amount]')?.value;
    const bal = document.querySelector('#bill-form [name=balance_due]');
    if (bal && !bal.value) bal.value = amt;
  };

  window.FinPage._toggleRecurring = (on) => {
    const opts = document.getElementById('bill-recurring-opts');
    if (opts) opts.classList.toggle('hidden', !on);
  };

  window.FinPage._saveBill = async (id) => {
    const data = getForm('bill-form');
    if (!data.vendor) { toast('Vendor is required','error'); return; }

    if (!id && (!data.balance_due || parseFloat(data.balance_due) === 0)) {
      data.balance_due = data.amount;
    }

    if (!data.recurring) data.recurring = 'false';

    try {
      const oldData = id ? state.bills.find(b => b.id === id) : null;
      const oldStatus = oldData?.status;
      const oldAccount = oldData?.paid_from;
      const oldAmount = parseFloat(oldData?.amount) || 0;
      
      if (id) { 
        await window.WorkVoltDB.update('bills', id, data); 
        toast('Updated','success'); 
        
        // Handle account balance changes
        const newStatus = data.status;
        const newAccount = data.paid_from;
        const newAmount = parseFloat(data.amount) || 0;
        
        // If status changed to Paid, deduct from account
        if (oldStatus !== 'Paid' && newStatus === 'Paid' && newAccount) {
          await updateAccountBalance(newAccount, -newAmount);
        }
        // If status changed from Paid to something else, refund account
        else if (oldStatus === 'Paid' && newStatus !== 'Paid' && oldAccount) {
          await updateAccountBalance(oldAccount, newAmount);
        }
        // If account changed while paid, transfer between accounts
        else if (newStatus === 'Paid' && oldAccount && newAccount && oldAccount !== newAccount) {
          await updateAccountBalance(oldAccount, newAmount); // refund old
          await updateAccountBalance(newAccount, -newAmount); // deduct new
        }
        // If amount changed while paid, adjust the difference
        else if (newStatus === 'Paid' && oldAccount && newAmount !== oldAmount) {
          await updateAccountBalance(oldAccount, oldAmount - newAmount);
        }
      }
      else { 
        await window.WorkVoltDB.create('bills', data); 
        toast('Bill added','success'); 
        
        // If creating as Paid, deduct immediately
        if (data.status === 'Paid' && data.paid_from) {
          await updateAccountBalance(data.paid_from, -parseFloat(data.amount));
        }
      }
      
      closeModal();
      await loadBills();
      await loadAccounts();
      const c = document.getElementById('fin-content'); 
      if(c) renderBills(c);
      refreshLinkedTabs();
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// Payment Modal - Fixed to not save bill fields to payments table
function showPaymentModal(refId, refType = 'bill', overrideAmount = null) {
  const today = new Date().toISOString().split('T')[0];
  const ref = refType === 'bill' ? state.bills.find(r => r.id === refId) : state.invoices.find(r => r.id === refId);
  const isRecurring = refType === 'bill' && (ref?.recurring === true || ref?.recurring === 'true');
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
      </div>` : ''}
      ${field('Payment Date', 'date', 'date', today)}
      ${field('Amount ($)', 'amount', 'number', payAmt, 'step="0.01" min="0"')}
      ${sel('Method', 'method', ['Bank Transfer','Cash','Credit Card','PayPal','Stripe','Check'], '')}
      ${accountSel('Pay From Account', 'account', ref?.paid_from || '', ['Asset','Liability'])}
      ${field('Reference / Notes', 'notes', 'text', '')}
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <i class="fas fa-info-circle mr-1"></i>
        This payment will be deducted from the selected account balance.
      </div>
      <input type="hidden" name="reference_id" value="${refId}">
      <input type="hidden" name="reference_type" value="${refType}">
    </form>`,
    `<button onclick="closeModal()" class="btn-secondary">Cancel</button>
     <button onclick="FinPage._savePayment()" class="btn-primary" style="background:#10b981">Record Payment</button>`
  );

  window.FinPage._savePayment = async () => {
    const data = getForm('pay-form');
    if (!data.amount) { toast('Amount required','error'); return; }
    
    const paymentAmount = parseFloat(data.amount) || 0;
    
    try {
      data.created_by = user()?.name || '';

      // Deduct from account balance
      if (data.account) {
        await updateAccountBalance(data.account, -paymentAmount);
      }

      // Calculate new balance for the bill/invoice
      let newBalance = 0;
      let newStatus = 'Paid';
      
      if (refType === 'bill') {
        if (isRecurring && ref) {
          newBalance = Math.max(0, balance - paymentAmount);
          newStatus = newBalance <= 0 ? 'Paid' : 'Partial';
          
          // Calculate next due date for recurring bills
          let nextDueDate = null;
          if (ref.recurring_day && newBalance > 0) {
            const now   = new Date();
            const year  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
            const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
            const day   = Math.min(parseInt(ref.recurring_day), new Date(year, month + 1, 0).getDate());
            nextDueDate = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          }
          
          // Update the bill with new balance and status
          await window.WorkVoltDB.update('bills', refId, { 
            balance_due: newBalance.toFixed(2), 
            status: newStatus,
            ...(nextDueDate && { due_date: nextDueDate })
          });
        } else {
          // Non-recurring bill
          newBalance = Math.max(0, balance - paymentAmount);
          newStatus = newBalance <= 0 ? 'Paid' : 'Partial';
          
          await window.WorkVoltDB.update('bills', refId, { 
            balance_due: newBalance.toFixed(2), 
            status: newStatus 
          });
        }
      } else if (refType === 'invoice') {
        // Invoice: reduce balance_due
        const inv = state.invoices.find(i => i.id === refId);
        newBalance = Math.max(0, (parseFloat(inv?.balance_due) || 0) - paymentAmount);
        newStatus = newBalance <= 0 ? 'Paid' : 'Partial';
        
        await window.WorkVoltDB.update('invoices', refId, { 
          balance_due: newBalance.toFixed(2), 
          status: newStatus 
        });
      }

      // Create the payment record - CLEAN DATA (no bill/invoice fields)
      const paymentData = {
        date: data.date,
        amount: data.amount,
        method: data.method,
        account: data.account,
        notes: data.notes,
        reference_id: data.reference_id,
        reference_type: data.reference_type,
        created_by: data.created_by
      };
      
      await window.WorkVoltDB.create('payments', paymentData);
      toast('Payment recorded','success');
      closeModal();
      await Promise.all([loadBills(), loadInvoices(), loadAccounts()]);
      const c = document.getElementById('fin-content');
      if (c) { 
        if (refType === 'bill') renderBills(c); 
        else renderInvoices(c); 
      }
      refreshLinkedTabs();
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// Budget Modal
function showBudgetModal(budget = null) {
  const now = new Date();
  const preCategory = budget?.category || null;
  const isEdit      = !!(budget?.id);

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
      if (id) { 
        await window.WorkVoltDB.update('budgets', id, data); 
        toast('Budget updated','success'); 
      }
      else { 
        await window.WorkVoltDB.create('budgets', data); 
        toast('Budget set','success'); 
      }
      closeModal();
      await loadBudgets();
      const c = document.getElementById('fin-content'); 
      if(c) renderBudgets(c);
      refreshLinkedTabs();
    } catch(e) { 
      toast(e.message,'error'); 
    }
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
    
    // Ensure current_balance is set
    if (!data.current_balance || data.current_balance === '') {
      data.current_balance = '0';
    }
    
    try {
      if (id) { 
        await window.WorkVoltDB.update('accounts', id, data); 
        toast('Updated','success'); 
      }
      else { 
        await window.WorkVoltDB.create('accounts', data); 
        toast('Account created','success'); 
      }
      closeModal();
      await loadAccounts();
      const c = document.getElementById('fin-content'); 
      if(c) renderAccounts(c);
    } catch(e) { 
      toast(e.message,'error'); 
    }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODAL UTILITIES
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
  const modalsRoot = document.getElementById('modals-root') || document.body;
  modalsRoot.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closeModal(); });
}
window.closeModal = () => { 
  const el = document.getElementById('fin-modal'); 
  if (el) el.remove(); 
};

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

function accountOptions(selectedName = '', types = null) {
  const accounts = state.accounts.filter(a =>
    a.is_active !== false && (!types || types.includes(a.type))
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
    return `<option value="${name}" ${name === selectedName ? 'selected' : ''}>${name}</option>`;
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

function dateVal(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('T')) return s.split('T')[0];
  try {
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  } catch(e) {}
  return '';
}

// Expense categories constant
const EXP_CATS = ['Salaries & Wages','Software & Subscriptions','Travel & Entertainment','Office Supplies','Marketing & Advertising','Professional Services','Rent & Utilities','Cost of Goods Sold','Other Expenses'];

// Expose globals
window.showInvoiceModal = showInvoiceModal;
window.showExpenseModal = showExpenseModal;
window.showBillModal    = showBillModal;
window.showBudgetModal  = showBudgetModal;
window.showAccountModal = showAccountModal;
window.showPaymentModal = showPaymentModal;  // ADDED: Expose payment modal
window.loadReports      = loadReports;

})();
