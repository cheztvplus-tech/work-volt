window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['reports'] = function (container) {

  const currentUser = window.WorkVolt?.user() || {};
  const db          = window.WorkVoltDB;
  const toast       = (m, t) => window.WorkVolt?.toast(m, t || 'info');
  const isAdmin     = currentUser.role === 'admin' || currentUser.role === 'owner';
  const isManager   = isAdmin || currentUser.role === 'manager';

  // ── State ───────────────────────────────────────────────────────
  let activeSection  = 'dashboard';   // dashboard | sales | financial | payroll | operations | custom
  let dateRange      = '30';          // 7 | 30 | 90 | 365 | custom
  let customFrom     = '';
  let customTo       = '';
  let drillData      = null;          // { title, rows, columns }
  let customBuilder  = { source: '', fields: [], filters: [], chartType: 'bar' };
  let cachedData     = {};
  let loading        = false;

  // ── Date helpers ────────────────────────────────────────────────
  function getDateBounds() {
    const now = new Date();
    if (dateRange === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    const from = new Date(now);
    from.setDate(from.getDate() - parseInt(dateRange || 30));
    return { from, to: now };
  }

  function inRange(dateStr) {
    if (!dateStr) return false;
    const { from, to } = getDateBounds();
    const d = new Date(dateStr);
    return d >= from && d <= to;
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function pct(a, b) {
    if (!b) return '—';
    const p = ((a - b) / b * 100).toFixed(1);
    return (p >= 0 ? '+' : '') + p + '%';
  }

  function groupByDay(rows, dateField, valueField) {
    const map = {};
    rows.forEach(r => {
      const d = (r[dateField] || '').slice(0, 10);
      if (!d) return;
      map[d] = (map[d] || 0) + parseFloat(r[valueField] || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }

  // ── Load all data ───────────────────────────────────────────────
  async function loadAll() {
    loading = true;
    renderShell();
    try {
      const [deals, transactions, invoices, payrollRuns, employees,
             tasks, projects, assets, expenses, timesheets] = await Promise.all([
        db.pipeline?.deals().catch(() => []),
        db.financials?.transactions().catch(() => []),
        db.invoices?.list().catch(() => []),
        db.payroll?.runs().catch(() => []),
        db.payroll?.employees().catch(() => []),
        db.tasks?.list().catch(() => []),
        db.projects?.list().catch(() => []),
        db.assets?.list().catch(() => []),
        db.expenses?.list().catch(() => []),
        db.timesheets?.list().catch(() => []),
      ]);
      cachedData = { deals, transactions, invoices, payrollRuns, employees,
                     tasks, projects, assets, expenses, timesheets };
    } catch(e) {
      toast('Some data failed to load: ' + e.message, 'warning');
    }
    loading = false;
    render();
  }

  // ── Compute insights ────────────────────────────────────────────
  function computeInsights() {
    const insights = [];
    const { deals = [], transactions = [], payrollRuns = [] } = cachedData;
    const { from } = getDateBounds();

    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - parseInt(dateRange || 30));

    const wonNow  = deals.filter(d => d.stage === 'closed_won' && inRange(d.updated_at));
    const wonPrev = deals.filter(d => d.stage === 'closed_won' && new Date(d.updated_at) >= prevFrom && new Date(d.updated_at) < from);
    const revNow  = wonNow.reduce((s, d) => s + (d.value || 0), 0);
    const revPrev = wonPrev.reduce((s, d) => s + (d.value || 0), 0);

    if (revNow > revPrev && revPrev > 0) {
      const pctChange = ((revNow - revPrev) / revPrev * 100).toFixed(0);
      insights.push({ icon: '📈', text: `Revenue up ${pctChange}% vs previous period`, type: 'positive' });
    } else if (revNow < revPrev && revPrev > 0) {
      const pctChange = ((revPrev - revNow) / revPrev * 100).toFixed(0);
      insights.push({ icon: '📉', text: `Revenue down ${pctChange}% vs previous period`, type: 'negative' });
    }

    const stuckDeals = deals.filter(d => {
      if (d.stage === 'closed_won' || d.stage === 'closed_lost') return false;
      const ref = d.last_activity_at || d.updated_at || d.created_at;
      return ref && (Date.now() - new Date(ref).getTime()) > 7 * 86400000;
    });
    if (stuckDeals.length > 0) {
      insights.push({ icon: '⚠️', text: `${stuckDeals.length} deal${stuckDeals.length > 1 ? 's' : ''} stuck for 7+ days`, type: 'warning' });
    }

    const unpaidInvoices = (cachedData.invoices || []).filter(i => i.status === 'Unpaid' || i.status === 'Overdue');
    if (unpaidInvoices.length > 0) {
      const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0);
      insights.push({ icon: '🧾', text: `${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? 's' : ''} totalling ${fmtMoney(unpaidTotal)}`, type: 'warning' });
    }

    const overdueTasks = (cachedData.tasks || []).filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Completed' && t.status !== 'Done');
    if (overdueTasks.length > 0) {
      insights.push({ icon: '✅', text: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`, type: 'warning' });
    }

    const topDeal = [...deals].filter(d => d.stage === 'closed_won').sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    if (topDeal) insights.push({ icon: '🏆', text: `Top deal: ${topDeal.title} — ${fmtMoney(topDeal.value)}`, type: 'info' });

    return insights;
  }

  // ================================================================
  //  RENDER SHELL
  // ================================================================
  function renderShell() {
    const navItems = [
      { id: 'dashboard',   label: 'Dashboard',   icon: 'fa-th-large'      },
      { id: 'sales',       label: 'Sales',        icon: 'fa-chart-line'    },
      { id: 'financial',   label: 'Financial',    icon: 'fa-dollar-sign'   },
      { id: 'payroll',     label: 'Payroll',      icon: 'fa-users'         },
      { id: 'operations',  label: 'Operations',   icon: 'fa-cogs'          },
      { id: 'custom',      label: 'Custom',       icon: 'fa-sliders-h'     },
    ].filter(n => {
      if (n.id === 'payroll' && !isManager) return false;
      return true;
    });

    const { from, to } = getDateBounds();

    container.innerHTML = `
    <div class="min-h-full bg-slate-50 flex flex-col" id="rp-root">

      <!-- Header -->
      <div class="bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        <div class="flex-1 min-w-0">
          <h1 class="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <i class="fas fa-chart-bar text-blue-500 text-base"></i> Reports & Analytics
          </h1>
        </div>

        <!-- Date range -->
        <div class="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 flex-wrap">
          ${[
            { v:'7',      l:'7 days'   },
            { v:'30',     l:'30 days'  },
            { v:'90',     l:'Quarter'  },
            { v:'365',    l:'Year'     },
            { v:'custom', l:'Custom'   },
          ].map(r => `
            <button onclick="_rpRange('${r.v}')"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${dateRange === r.v ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}">
              ${r.l}
            </button>`).join('')}
        </div>

        ${dateRange === 'custom' ? `
          <div class="flex items-center gap-2">
            <input type="date" value="${customFrom}" onchange="_rpCustomFrom(this.value)"
              class="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <span class="text-xs text-slate-400">→</span>
            <input type="date" value="${customTo}" onchange="_rpCustomTo(this.value)"
              class="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          </div>` : ''}

        <!-- Export -->
        <div class="flex items-center gap-2">
          <button onclick="_rpExportCSV()"
            class="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all">
            <i class="fas fa-download text-[10px]"></i> CSV
          </button>
          <button onclick="_rpPrint()"
            class="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all">
            <i class="fas fa-print text-[10px]"></i> Print
          </button>
        </div>

        <!-- Refresh -->
        <button onclick="_rpRefresh()"
          class="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all">
          <i class="fas fa-sync-alt text-xs ${loading ? 'fa-spin' : ''}"></i>
        </button>
      </div>

      <!-- Date subtitle -->
      <div class="bg-white border-b border-slate-100 px-5 py-2 flex items-center gap-2">
        <i class="fas fa-calendar-alt text-slate-300 text-xs"></i>
        <span class="text-xs text-slate-400">Showing data from <strong class="text-slate-600">${fmtDate(from)}</strong> to <strong class="text-slate-600">${fmtDate(to)}</strong></span>
      </div>

      <!-- Nav tabs -->
      <div class="bg-white border-b border-slate-200 px-5 flex items-center gap-0 overflow-x-auto flex-shrink-0">
        ${navItems.map(n => `
          <button onclick="_rpSection('${n.id}')"
            class="flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap
              ${activeSection === n.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'}">
            <i class="fas ${n.icon} text-[11px]"></i>${n.label}
          </button>`).join('')}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto" id="rp-content">
        ${loading
          ? `<div class="flex flex-col items-center justify-center py-32 gap-3 text-slate-400">
               <i class="fas fa-circle-notch fa-spin text-3xl text-blue-400 opacity-60"></i>
               <p class="text-sm font-medium">Loading report data…</p>
             </div>`
          : renderSection()
        }
      </div>
    </div>

    <!-- Drill-down modal -->
    <div id="rp-drill" class="${drillData ? '' : 'hidden'} fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
         onclick="if(event.target===this)_rpCloseDrill()">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        ${drillData ? renderDrillModal() : ''}
      </div>
    </div>`;

    if (!loading) attachCharts();
  }

  function render() { renderShell(); }

  // ================================================================
  //  SECTION ROUTER
  // ================================================================
  function renderSection() {
    switch(activeSection) {
      case 'dashboard':  return renderDashboard();
      case 'sales':      return renderSales();
      case 'financial':  return renderFinancial();
      case 'payroll':    return renderPayroll();
      case 'operations': return renderOperations();
      case 'custom':     return renderCustomBuilder();
      default:           return renderDashboard();
    }
  }

  // ================================================================
  //  DASHBOARD
  // ================================================================
  function renderDashboard() {
    const { deals = [], transactions = [], invoices = [], tasks = [], payrollRuns = [] } = cachedData;

    const wonDeals     = deals.filter(d => d.stage === 'closed_won' && inRange(d.updated_at));
    const lostDeals    = deals.filter(d => d.stage === 'closed_lost' && inRange(d.updated_at));
    const totalRev     = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
    const incomeRows   = transactions.filter(t => t.type === 'Income' && inRange(t.date));
    const expenseRows  = transactions.filter(t => t.type === 'Expense' && inRange(t.date));
    const totalIncome  = incomeRows.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const totalExpense = expenseRows.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const netProfit    = totalIncome - totalExpense;
    const tasksCompleted = tasks.filter(t => (t.status === 'Completed' || t.status === 'Done') && inRange(t.updated_at)).length;
    const unpaidInv    = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue');
    const unpaidVal    = unpaidInv.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

    const insights = computeInsights();
    const winRate  = (wonDeals.length + lostDeals.length) > 0
      ? Math.round(wonDeals.length / (wonDeals.length + lostDeals.length) * 100) : 0;

    // Revenue over time data
    const revByDay = groupByDay(wonDeals, 'updated_at', 'value');
    const incByDay = groupByDay(incomeRows, 'date', 'amount');

    return `
    <div class="p-5 space-y-5">

      <!-- Smart Insights -->
      ${insights.length ? `
        <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-3">
            <i class="fas fa-lightbulb text-yellow-300 text-sm"></i>
            <span class="text-xs font-bold text-white uppercase tracking-wider">Smart Insights</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            ${insights.map(ins => `
              <div class="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2">
                <span class="text-base">${ins.icon}</span>
                <span class="text-xs text-white/90 font-medium leading-snug">${ins.text}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[
          { label:'Total Revenue',   val: fmtMoney(totalRev),    sub: `${wonDeals.length} deals closed`,   icon:'fa-dollar-sign', grad:'from-emerald-500 to-teal-600',    drill:'won-deals'    },
          { label:'Net Profit',      val: fmtMoney(netProfit),   sub: `${fmtMoney(totalIncome)} income`,   icon:'fa-chart-line',  grad:'from-blue-500 to-blue-700',       drill:'transactions' },
          { label:'Unpaid Invoices', val: fmtMoney(unpaidVal),   sub: `${unpaidInv.length} outstanding`,   icon:'fa-file-invoice',grad:'from-amber-500 to-orange-600',    drill:'invoices'     },
          { label:'Tasks Completed', val: tasksCompleted,         sub: `Win rate ${winRate}%`,              icon:'fa-check-circle',grad:'from-violet-500 to-purple-700',   drill:'tasks'        },
        ].map(k => `
          <div class="rounded-2xl p-4 text-white bg-gradient-to-br ${k.grad} shadow-sm cursor-pointer hover:shadow-md transition-all hover:scale-[1.02]"
               onclick="_rpDrill('${k.drill}')">
            <div class="flex items-start justify-between mb-3">
              <i class="fas ${k.icon} text-xl opacity-80"></i>
              <i class="fas fa-expand-alt text-[10px] opacity-50"></i>
            </div>
            <p class="text-2xl font-extrabold leading-none">${k.val}</p>
            <p class="text-xs opacity-75 mt-1.5 font-medium">${k.label}</p>
            <p class="text-[10px] opacity-55 mt-0.5">${k.sub}</p>
          </div>`).join('')}
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Revenue trend -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900 text-sm">Revenue Trend</h3>
              <p class="text-[10px] text-slate-400 mt-0.5">Closed deal value over time</p>
            </div>
            <button onclick="_rpDrill('won-deals')" class="text-[10px] text-blue-500 hover:text-blue-700 font-semibold">View all →</button>
          </div>
          <div class="p-4">
            <div style="position:relative;height:180px;">
              <canvas id="rp-chart-rev-trend"></canvas>
            </div>
            ${revByDay.length === 0 ? `<p class="text-xs text-slate-400 text-center py-8">No closed deals in this period</p>` : ''}
          </div>
        </div>

        <!-- Income vs Expenses -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900 text-sm">Income vs Expenses</h3>
              <p class="text-[10px] text-slate-400 mt-0.5">Financial overview</p>
            </div>
            <button onclick="_rpSection('financial')" class="text-[10px] text-blue-500 hover:text-blue-700 font-semibold">Detail →</button>
          </div>
          <div class="p-4">
            <div style="position:relative;height:180px;">
              <canvas id="rp-chart-inc-exp"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Pipeline summary + Win/Loss -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <!-- Pipeline by stage -->
        <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Pipeline by Stage</h3>
          </div>
          <div class="p-4">
            <div style="position:relative;height:160px;">
              <canvas id="rp-chart-pipeline"></canvas>
            </div>
          </div>
        </div>

        <!-- Win / Loss donut -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Win / Loss Rate</h3>
          </div>
          <div class="p-4 flex flex-col items-center">
            <div style="position:relative;height:160px;width:160px;">
              <canvas id="rp-chart-winloss"></canvas>
            </div>
            <div class="flex gap-4 mt-3">
              <div class="text-center"><p class="text-lg font-extrabold text-emerald-600">${wonDeals.length}</p><p class="text-[10px] text-slate-400">Won</p></div>
              <div class="text-center"><p class="text-lg font-extrabold text-red-500">${lostDeals.length}</p><p class="text-[10px] text-slate-400">Lost</p></div>
              <div class="text-center"><p class="text-lg font-extrabold text-blue-600">${winRate}%</p><p class="text-[10px] text-slate-400">Win Rate</p></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick tables -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${renderTopDealsTable(wonDeals)}
        ${renderRecentTransactionsTable(transactions)}
      </div>
    </div>`;
  }

  function renderTopDealsTable(wonDeals) {
    const top = [...wonDeals].sort((a,b) => (b.value||0)-(a.value||0)).slice(0, 5);
    return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-sm">Top Closed Deals</h3>
          <button onclick="_rpDrill('won-deals')" class="text-[10px] text-blue-500 hover:text-blue-700 font-semibold">All →</button>
        </div>
        ${top.length ? `
          <div class="divide-y divide-slate-100">
            ${top.map((d,i) => `
              <div class="px-5 py-2.5 flex items-center gap-3">
                <span class="text-[10px] font-bold text-slate-300 w-4">${i+1}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold text-slate-800 truncate">${d.title || '—'}</p>
                  <p class="text-[10px] text-slate-400">${d.company || d.contact_name || '—'}</p>
                </div>
                <span class="text-sm font-extrabold text-emerald-600">${fmtMoney(d.value)}</span>
              </div>`).join('')}
          </div>` : `<p class="text-xs text-slate-400 text-center py-8">No closed deals in this period</p>`}
      </div>`;
  }

  function renderRecentTransactionsTable(transactions) {
    const recent = [...transactions].filter(t => inRange(t.date)).sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0, 5);
    return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-sm">Recent Transactions</h3>
          <button onclick="_rpDrill('transactions')" class="text-[10px] text-blue-500 hover:text-blue-700 font-semibold">All →</button>
        </div>
        ${recent.length ? `
          <div class="divide-y divide-slate-100">
            ${recent.map(t => `
              <div class="px-5 py-2.5 flex items-center gap-3">
                <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${t.type==='Income' ? 'bg-emerald-100' : 'bg-red-100'}">
                  <i class="fas ${t.type==='Income' ? 'fa-arrow-down text-emerald-600' : 'fa-arrow-up text-red-500'} text-[9px]"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold text-slate-800 truncate">${t.description || t.category || '—'}</p>
                  <p class="text-[10px] text-slate-400">${fmtDate(t.date)}</p>
                </div>
                <span class="text-sm font-extrabold ${t.type==='Income' ? 'text-emerald-600' : 'text-red-500'}">${t.type==='Income'?'+':'−'}${fmtMoney(t.amount)}</span>
              </div>`).join('')}
          </div>` : `<p class="text-xs text-slate-400 text-center py-8">No transactions in this period</p>`}
      </div>`;
  }

  // ================================================================
  //  SALES REPORT
  // ================================================================
  function renderSales() {
    const { deals = [] } = cachedData;
    const filtered   = deals.filter(d => inRange(d.created_at) || inRange(d.updated_at));
    const won        = filtered.filter(d => d.stage === 'closed_won');
    const lost       = filtered.filter(d => d.stage === 'closed_lost');
    const active     = filtered.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost');
    const totalRev   = won.reduce((s,d) => s+(d.value||0), 0);
    const pipeVal    = active.reduce((s,d) => s+(d.value||0), 0);
    const avgSize    = won.length ? totalRev / won.length : 0;
    const winRate    = (won.length+lost.length) ? Math.round(won.length/(won.length+lost.length)*100) : 0;

    // By rep
    const byRep = {};
    won.forEach(d => {
      const rep = d.assigned_to || 'Unassigned';
      if (!byRep[rep]) byRep[rep] = { count: 0, value: 0 };
      byRep[rep].count++;
      byRep[rep].value += (d.value || 0);
    });

    // By source
    const bySource = {};
    deals.forEach(d => {
      const src = d.source || 'Unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    });

    const STAGES = ['lead','qualified','discovery','proposal','negotiation','verbal','closed_won','closed_lost'];
    const stageLabels = { lead:'Lead', qualified:'Qualified', discovery:'Discovery', proposal:'Proposal', negotiation:'Negotiation', verbal:'Verbal', closed_won:'Won', closed_lost:'Lost' };
    const byStage = {};
    deals.forEach(d => { byStage[d.stage] = (byStage[d.stage] || 0) + 1; });

    return `
    <div class="p-5 space-y-5">

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[
          { label:'Revenue Won',    val: fmtMoney(totalRev), sub:`${won.length} deals`, icon:'fa-trophy',       clr:'text-emerald-600', bg:'bg-emerald-50', drill:'won-deals'  },
          { label:'Pipeline Value', val: fmtMoney(pipeVal),  sub:`${active.length} active`, icon:'fa-funnel-dollar', clr:'text-blue-600',    bg:'bg-blue-50',    drill:'active-deals'},
          { label:'Avg Deal Size',  val: fmtMoney(avgSize),  sub:'Won deals avg',        icon:'fa-chart-bar',     clr:'text-indigo-600',  bg:'bg-indigo-50',  drill:'won-deals'  },
          { label:'Win Rate',       val: winRate+'%',        sub:`${lost.length} lost`,  icon:'fa-percentage',    clr:'text-amber-600',   bg:'bg-amber-50',   drill:'lost-deals' },
        ].map(k => `
          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm cursor-pointer hover:border-blue-300 transition-all group" onclick="_rpDrill('${k.drill}')">
            <div class="w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center mb-3">
              <i class="fas ${k.icon} ${k.clr} text-base"></i>
            </div>
            <p class="text-xl font-extrabold text-slate-900">${k.val}</p>
            <p class="text-xs font-semibold text-slate-500 mt-0.5">${k.label}</p>
            <p class="text-[10px] text-slate-400">${k.sub}</p>
          </div>`).join('')}
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Revenue Over Time</h3>
            <p class="text-[10px] text-slate-400 mt-0.5">Closed deal value by date</p>
          </div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-sales-trend"></canvas></div></div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Deals by Stage</h3>
          </div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-by-stage"></canvas></div></div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Sales by Rep</h3>
          </div>
          <div class="p-4">
            ${Object.keys(byRep).length
              ? `<div style="position:relative;height:200px;"><canvas id="rp-chart-by-rep"></canvas></div>`
              : `<p class="text-xs text-slate-400 text-center py-12">No assignment data available</p>`}
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Lead Sources</h3>
          </div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-by-source"></canvas></div></div>
        </div>
      </div>

      <!-- Deals table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-sm">All Deals — ${filtered.length} records</h3>
          <button onclick="_rpDrill('all-deals')" class="text-xs text-blue-600 font-semibold hover:text-blue-800">Expand →</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <tr>
                <th class="px-4 py-3">Deal</th>
                <th class="px-4 py-3">Stage</th>
                <th class="px-4 py-3">Value</th>
                <th class="px-4 py-3">Source</th>
                <th class="px-4 py-3">Close Date</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.slice(0,10).map(d => `
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-2.5 font-semibold text-slate-800">${d.title||'—'}</td>
                  <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    d.stage==='closed_won' ? 'bg-emerald-100 text-emerald-700' :
                    d.stage==='closed_lost' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'
                  }">${stageLabels[d.stage]||d.stage}</span></td>
                  <td class="px-4 py-2.5 font-bold text-slate-700">${fmtMoney(d.value)}</td>
                  <td class="px-4 py-2.5 text-slate-500">${d.source||'—'}</td>
                  <td class="px-4 py-2.5 text-slate-400">${d.expected_close ? fmtDate(d.expected_close) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          ${filtered.length > 10 ? `<p class="text-[10px] text-slate-400 text-center py-3">Showing 10 of ${filtered.length} — <button class="text-blue-500 font-semibold" onclick="_rpDrill('all-deals')">view all</button></p>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ================================================================
  //  FINANCIAL REPORT
  // ================================================================
  function renderFinancial() {
    const { transactions = [], invoices = [], expenses = [] } = cachedData;
    const txFiltered   = transactions.filter(t => inRange(t.date));
    const income       = txFiltered.filter(t => t.type === 'Income');
    const expTx        = txFiltered.filter(t => t.type === 'Expense');
    const totalIncome  = income.reduce((s,t) => s+parseFloat(t.amount||0), 0);
    const totalExpense = expTx.reduce((s,t) => s+parseFloat(t.amount||0), 0);
    const netProfit    = totalIncome - totalExpense;
    const margin       = totalIncome ? ((netProfit/totalIncome)*100).toFixed(1) : 0;

    const unpaidInv    = invoices.filter(i => i.status==='Unpaid'||i.status==='Overdue');
    const unpaidTotal  = unpaidInv.reduce((s,i) => s+parseFloat(i.amount||0), 0);
    const paidInv      = invoices.filter(i => i.status==='Paid' && inRange(i.created_at));
    const paidTotal    = paidInv.reduce((s,i) => s+parseFloat(i.amount||0), 0);

    // By category
    const byCategory = {};
    txFiltered.forEach(t => {
      const cat = t.category || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
      if (t.type==='Income') byCategory[cat].income += parseFloat(t.amount||0);
      else byCategory[cat].expense += parseFloat(t.amount||0);
    });

    const expByMonth = {};
    expTx.forEach(t => {
      const m = (t.date||'').slice(0,7);
      expByMonth[m] = (expByMonth[m]||0) + parseFloat(t.amount||0);
    });
    const incByMonth = {};
    income.forEach(t => {
      const m = (t.date||'').slice(0,7);
      incByMonth[m] = (incByMonth[m]||0) + parseFloat(t.amount||0);
    });
    const months = [...new Set([...Object.keys(expByMonth), ...Object.keys(incByMonth)])].sort();

    return `
    <div class="p-5 space-y-5">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[
          { label:'Total Income',    val:fmtMoney(totalIncome),  sub:`${income.length} transactions`, icon:'fa-arrow-circle-down', clr:'text-emerald-600', bg:'bg-emerald-50', drill:'income'   },
          { label:'Total Expenses',  val:fmtMoney(totalExpense), sub:`${expTx.length} transactions`,  icon:'fa-arrow-circle-up',   clr:'text-red-500',     bg:'bg-red-50',     drill:'expenses' },
          { label:'Net Profit',      val:fmtMoney(netProfit),    sub:`${margin}% margin`,             icon:'fa-balance-scale',     clr:'text-blue-600',    bg:'bg-blue-50',    drill:'transactions'},
          { label:'Unpaid Invoices', val:fmtMoney(unpaidTotal),  sub:`${unpaidInv.length} invoices`,  icon:'fa-file-invoice',      clr:'text-amber-600',   bg:'bg-amber-50',   drill:'invoices' },
        ].map(k => `
          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm cursor-pointer hover:border-blue-300 transition-all" onclick="_rpDrill('${k.drill}')">
            <div class="w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center mb-3">
              <i class="fas ${k.icon} ${k.clr} text-base"></i>
            </div>
            <p class="text-xl font-extrabold text-slate-900">${k.val}</p>
            <p class="text-xs font-semibold text-slate-500 mt-0.5">${k.label}</p>
            <p class="text-[10px] text-slate-400">${k.sub}</p>
          </div>`).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Monthly Income vs Expenses</h3>
          </div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-monthly-fin"></canvas></div></div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Expenses by Category</h3>
          </div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-expense-cat"></canvas></div></div>
        </div>
      </div>

      <!-- Invoice status -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <h3 class="font-bold text-slate-900 text-sm">Invoice Summary</h3>
        </div>
        <div class="p-5 grid grid-cols-3 gap-4 text-center">
          <div><p class="text-2xl font-extrabold text-emerald-600">${fmtMoney(paidTotal)}</p><p class="text-xs text-slate-400 mt-1">Paid (${paidInv.length})</p></div>
          <div><p class="text-2xl font-extrabold text-amber-500">${fmtMoney(unpaidTotal)}</p><p class="text-xs text-slate-400 mt-1">Unpaid (${unpaidInv.filter(i=>i.status==='Unpaid').length})</p></div>
          <div><p class="text-2xl font-extrabold text-red-500">${fmtMoney(unpaidInv.filter(i=>i.status==='Overdue').reduce((s,i)=>s+parseFloat(i.amount||0),0))}</p><p class="text-xs text-slate-400 mt-1">Overdue (${unpaidInv.filter(i=>i.status==='Overdue').length})</p></div>
        </div>
        <div class="px-5 pb-5">
          <div style="position:relative;height:120px;"><canvas id="rp-chart-invoice-status"></canvas></div>
        </div>
      </div>

      <!-- Transactions table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-sm">Transactions — ${txFiltered.length} records</h3>
          <button onclick="_rpDrill('transactions')" class="text-xs text-blue-600 font-semibold">Expand →</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <tr><th class="px-4 py-3">Date</th><th class="px-4 py-3">Description</th><th class="px-4 py-3">Category</th><th class="px-4 py-3">Type</th><th class="px-4 py-3">Amount</th></tr>
            </thead>
            <tbody>
              ${txFiltered.slice(0,10).map(t => `
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-2.5 text-slate-400">${fmtDate(t.date)}</td>
                  <td class="px-4 py-2.5 font-semibold text-slate-800">${t.description||'—'}</td>
                  <td class="px-4 py-2.5 text-slate-500">${t.category||'—'}</td>
                  <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${t.type==='Income'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600'}">${t.type}</span></td>
                  <td class="px-4 py-2.5 font-bold ${t.type==='Income'?'text-emerald-600':'text-red-500'}">${t.type==='Income'?'+':'−'}${fmtMoney(t.amount)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ================================================================
  //  PAYROLL REPORT
  // ================================================================
  function renderPayroll() {
    if (!isManager) return `<div class="flex flex-col items-center justify-center py-32 gap-3 text-slate-400"><i class="fas fa-lock text-4xl opacity-30"></i><p class="font-semibold">Access restricted</p></div>`;
    const { payrollRuns = [], employees = [], timesheets = [] } = cachedData;
    const runsFiltered = payrollRuns.filter(r => inRange(r.created_at)||inRange(r.pay_date));
    const totalPayroll = runsFiltered.reduce((s,r) => s+parseFloat(r.total_amount||r.net_pay||0), 0);
    const totalDeductions = runsFiltered.reduce((s,r) => s+parseFloat(r.total_deductions||0), 0);
    const totalGross = runsFiltered.reduce((s,r) => s+parseFloat(r.gross_pay||r.total_gross||0), 0);
    const activeEmp  = employees.filter(e => e.status==='Active'||!e.status).length;
    const tsFiltered = timesheets.filter(t => inRange(t.date));
    const totalHours = tsFiltered.reduce((s,t) => s+parseFloat(t.hours||0), 0);
    const overtimeHours = tsFiltered.filter(t => parseFloat(t.hours||0)>8).reduce((s,t) => s+Math.max(0,parseFloat(t.hours||0)-8), 0);

    const payByEmp = {};
    runsFiltered.forEach(r => {
      const emp = r.employee_id || r.employee_name || 'Unknown';
      payByEmp[emp] = (payByEmp[emp]||0) + parseFloat(r.net_pay||r.total_amount||0);
    });

    const payByMonth = {};
    runsFiltered.forEach(r => {
      const m = (r.pay_date||r.created_at||'').slice(0,7);
      payByMonth[m] = (payByMonth[m]||0) + parseFloat(r.total_amount||r.net_pay||0);
    });

    return `
    <div class="p-5 space-y-5">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[
          { label:'Total Payroll',    val:fmtMoney(totalPayroll),    sub:`${runsFiltered.length} runs`,    icon:'fa-money-bill-wave', clr:'text-blue-600',    bg:'bg-blue-50'    },
          { label:'Total Gross',      val:fmtMoney(totalGross),      sub:'Before deductions',              icon:'fa-coins',           clr:'text-indigo-600',  bg:'bg-indigo-50'  },
          { label:'Total Deductions', val:fmtMoney(totalDeductions), sub:'Tax & other',                    icon:'fa-minus-circle',    clr:'text-red-500',     bg:'bg-red-50'     },
          { label:'Active Employees', val:activeEmp,                 sub:`${totalHours.toFixed(0)}h logged`,icon:'fa-users',          clr:'text-emerald-600', bg:'bg-emerald-50' },
        ].map(k => `
          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div class="w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center mb-3">
              <i class="fas ${k.icon} ${k.clr} text-base"></i>
            </div>
            <p class="text-xl font-extrabold text-slate-900">${k.val}</p>
            <p class="text-xs font-semibold text-slate-500 mt-0.5">${k.label}</p>
            <p class="text-[10px] text-slate-400">${k.sub}</p>
          </div>`).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100"><h3 class="font-bold text-slate-900 text-sm">Payroll Cost Over Time</h3></div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-payroll-trend"></canvas></div></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100"><h3 class="font-bold text-slate-900 text-sm">Hours Logged</h3></div>
          <div class="p-4">
            <div class="flex justify-around text-center mb-4">
              <div><p class="text-2xl font-extrabold text-blue-600">${totalHours.toFixed(0)}</p><p class="text-xs text-slate-400 mt-1">Total Hours</p></div>
              <div><p class="text-2xl font-extrabold text-amber-500">${overtimeHours.toFixed(0)}</p><p class="text-xs text-slate-400 mt-1">Overtime Hours</p></div>
              <div><p class="text-2xl font-extrabold text-slate-600">${tsFiltered.length}</p><p class="text-xs text-slate-400 mt-1">Timesheets</p></div>
            </div>
            <div style="position:relative;height:130px;"><canvas id="rp-chart-hours"></canvas></div>
          </div>
        </div>
      </div>

      <!-- Employees table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100"><h3 class="font-bold text-slate-900 text-sm">Employee List — ${employees.length} employees</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <tr><th class="px-4 py-3">Name</th><th class="px-4 py-3">Position</th><th class="px-4 py-3">Department</th><th class="px-4 py-3">Salary</th><th class="px-4 py-3">Status</th></tr>
            </thead>
            <tbody>
              ${employees.slice(0,10).map(e => `
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-2.5 font-semibold text-slate-800">${e.name||e.full_name||'—'}</td>
                  <td class="px-4 py-2.5 text-slate-500">${e.position||e.role||'—'}</td>
                  <td class="px-4 py-2.5 text-slate-500">${e.department||'—'}</td>
                  <td class="px-4 py-2.5 font-bold text-slate-700">${fmtMoney(e.salary||e.base_salary||0)}</td>
                  <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${(e.status||'Active')==='Active'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}">${e.status||'Active'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ================================================================
  //  OPERATIONS REPORT
  // ================================================================
  function renderOperations() {
    const { tasks = [], projects = [], assets = [], timesheets = [] } = cachedData;
    const tasksFiltered   = tasks.filter(t => inRange(t.created_at)||inRange(t.updated_at));
    const completed       = tasksFiltered.filter(t => t.status==='Completed'||t.status==='Done');
    const pending         = tasksFiltered.filter(t => t.status==='Pending'||t.status==='In Progress');
    const overdue         = tasks.filter(t => t.due_date && new Date(t.due_date)<new Date() && t.status!=='Completed' && t.status!=='Done');
    const projFiltered    = projects.filter(p => inRange(p.created_at)||inRange(p.updated_at));
    const projCompleted   = projFiltered.filter(p => p.status==='Completed'||p.status==='Done');
    const assetsActive    = assets.filter(a => a.status==='Active'||!a.status);
    const assetsMaint     = assets.filter(a => a.status==='Maintenance'||a.status==='Under Maintenance');

    const tasksByStatus = {};
    tasksFiltered.forEach(t => { const s=t.status||'Unknown'; tasksByStatus[s]=(tasksByStatus[s]||0)+1; });

    const tasksByPriority = {};
    tasksFiltered.forEach(t => { const p=t.priority||'Normal'; tasksByPriority[p]=(tasksByPriority[p]||0)+1; });

    const completionRate = tasksFiltered.length ? Math.round(completed.length/tasksFiltered.length*100) : 0;

    return `
    <div class="p-5 space-y-5">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${[
          { label:'Tasks Completed', val:completed.length,    sub:`${completionRate}% completion`,  icon:'fa-check-circle',  clr:'text-emerald-600', bg:'bg-emerald-50', drill:'tasks-completed' },
          { label:'Tasks Pending',   val:pending.length,      sub:`${overdue.length} overdue`,       icon:'fa-clock',         clr:'text-amber-500',   bg:'bg-amber-50',   drill:'tasks-pending'   },
          { label:'Projects',        val:projFiltered.length, sub:`${projCompleted.length} done`,    icon:'fa-project-diagram',clr:'text-blue-600',   bg:'bg-blue-50',    drill:'projects'        },
          { label:'Assets',          val:assets.length,       sub:`${assetsMaint.length} in maint.`, icon:'fa-box',           clr:'text-indigo-600',  bg:'bg-indigo-50',  drill:'assets'          },
        ].map(k => `
          <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm cursor-pointer hover:border-blue-300 transition-all" onclick="_rpDrill('${k.drill}')">
            <div class="w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center mb-3">
              <i class="fas ${k.icon} ${k.clr} text-base"></i>
            </div>
            <p class="text-xl font-extrabold text-slate-900">${k.val}</p>
            <p class="text-xs font-semibold text-slate-500 mt-0.5">${k.label}</p>
            <p class="text-[10px] text-slate-400">${k.sub}</p>
          </div>`).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100"><h3 class="font-bold text-slate-900 text-sm">Tasks by Status</h3></div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-task-status"></canvas></div></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100"><h3 class="font-bold text-slate-900 text-sm">Tasks by Priority</h3></div>
          <div class="p-4"><div style="position:relative;height:200px;"><canvas id="rp-chart-task-priority"></canvas></div></div>
        </div>
      </div>

      <!-- Projects table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-sm">Projects — ${projFiltered.length} records</h3>
          <button onclick="_rpDrill('projects')" class="text-xs text-blue-600 font-semibold">Expand →</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <tr><th class="px-4 py-3">Project</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Budget</th><th class="px-4 py-3">Start</th><th class="px-4 py-3">End</th></tr>
            </thead>
            <tbody>
              ${projFiltered.slice(0,8).map(p => `
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-2.5 font-semibold text-slate-800">${p.name||p.title||'—'}</td>
                  <td class="px-4 py-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    (p.status||'').includes('Complet')?'bg-emerald-100 text-emerald-700':
                    (p.status||'').includes('Progress')?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'
                  }">${p.status||'—'}</span></td>
                  <td class="px-4 py-2.5 font-bold text-slate-700">${fmtMoney(p.budget||0)}</td>
                  <td class="px-4 py-2.5 text-slate-400">${p.start_date?fmtDate(p.start_date):'—'}</td>
                  <td class="px-4 py-2.5 text-slate-400">${p.end_date?fmtDate(p.end_date):'—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ================================================================
  //  CUSTOM REPORT BUILDER
  // ================================================================
  function renderCustomBuilder() {
    const sources = [
      { id:'deals',        label:'Sales Deals'      },
      { id:'transactions', label:'Transactions'      },
      { id:'invoices',     label:'Invoices'          },
      { id:'tasks',        label:'Tasks'             },
      { id:'projects',     label:'Projects'          },
      { id:'employees',    label:'Employees'         },
      { id:'assets',       label:'Assets'            },
      { id:'expenses',     label:'Expenses'          },
      { id:'timesheets',   label:'Timesheets'        },
    ];

    const fieldMap = {
      deals:        ['title','company','contact_name','value','stage','source','expected_close','created_at'],
      transactions: ['date','description','category','type','amount'],
      invoices:     ['client_name','amount','status','due_date','created_at'],
      tasks:        ['title','status','priority','due_date','assigned_to'],
      projects:     ['name','status','budget','start_date','end_date'],
      employees:    ['name','position','department','salary','status'],
      assets:       ['name','category','value','status','purchase_date'],
      expenses:     ['description','amount','category','status','date'],
      timesheets:   ['employee_name','date','hours','status','notes'],
    };

    const availableFields = customBuilder.source ? (fieldMap[customBuilder.source] || []) : [];
    const srcData = cachedData[customBuilder.source === 'deals' ? 'deals' :
                               customBuilder.source === 'transactions' ? 'transactions' :
                               customBuilder.source === 'employees' ? 'employees' : customBuilder.source] || [];

    // Build preview
    const previewRows = srcData.filter(r => inRange(r.date||r.created_at||r.updated_at||'2000-01-01')).slice(0, 20);
    const selectedFields = customBuilder.fields.length ? customBuilder.fields : availableFields.slice(0, 4);

    return `
    <div class="p-5 space-y-5">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100">
          <h3 class="font-bold text-slate-900 text-sm flex items-center gap-2"><i class="fas fa-sliders-h text-blue-500 text-xs"></i> Custom Report Builder</h3>
          <p class="text-xs text-slate-400 mt-0.5">Build your own reports by selecting a data source, fields, and chart type</p>
        </div>
        <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">

          <!-- Step 1: Source -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">1. Data Source</label>
            <div class="space-y-1.5">
              ${sources.map(s => `
                <button onclick="_rpCustomSource('${s.id}')"
                  class="w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all
                    ${customBuilder.source===s.id ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-blue-300 bg-white'}">
                  ${s.label}
                </button>`).join('')}
            </div>
          </div>

          <!-- Step 2: Fields -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">2. Fields to Show</label>
            ${availableFields.length ? `
              <div class="space-y-1.5">
                ${availableFields.map(f => `
                  <button onclick="_rpCustomField('${f}')"
                    class="w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all
                      ${customBuilder.fields.includes(f) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:border-indigo-300 bg-white'}">
                    ${f.replace(/_/g,' ')}
                  </button>`).join('')}
              </div>` : `<p class="text-xs text-slate-400 py-4">Select a data source first</p>`}
          </div>

          <!-- Step 3: Chart type -->
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">3. Chart Type</label>
            <div class="space-y-1.5">
              ${[
                { v:'bar',   l:'Bar Chart',   ic:'fa-chart-bar'      },
                { v:'line',  l:'Line Chart',  ic:'fa-chart-line'     },
                { v:'pie',   l:'Pie Chart',   ic:'fa-chart-pie'      },
                { v:'table', l:'Table Only',  ic:'fa-table'          },
              ].map(c => `
                <button onclick="_rpCustomChart('${c.v}')"
                  class="w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all
                    ${customBuilder.chartType===c.v ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 text-slate-600 hover:border-purple-300 bg-white'}">
                  <i class="fas ${c.ic} text-[11px]"></i>${c.l}
                </button>`).join('')}
            </div>

            <div class="mt-4 flex gap-2">
              <button onclick="_rpRunCustom()"
                class="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2">
                <i class="fas fa-play text-[10px]"></i> Run Report
              </button>
              <button onclick="_rpCustomReset()"
                class="px-3 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-500 hover:text-red-500 hover:border-red-300 transition-colors">
                <i class="fas fa-undo text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview -->
      ${customBuilder.source ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-900 text-sm">Preview — ${previewRows.length} records</h3>
            <button onclick="_rpExportCustomCSV()" class="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
              <i class="fas fa-download text-[10px]"></i> Export CSV
            </button>
          </div>
          ${customBuilder.chartType !== 'table' ? `
            <div class="p-4 border-b border-slate-100">
              <div style="position:relative;height:200px;"><canvas id="rp-chart-custom"></canvas></div>
            </div>` : ''}
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <tr>${selectedFields.map(f=>`<th class="px-4 py-3">${f.replace(/_/g,' ')}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${previewRows.map(r => `
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    ${selectedFields.map(f => `<td class="px-4 py-2.5 text-slate-700">${r[f]!==undefined&&r[f]!==null?r[f]:'—'}</td>`).join('')}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
    </div>`;
  }

  // ================================================================
  //  DRILL-DOWN MODAL
  // ================================================================
  function renderDrillModal() {
    const { title, rows, columns } = drillData;
    return `
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <h3 class="font-bold text-slate-900">${title}</h3>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400">${rows.length} records</span>
          <button onclick="_rpExportDrillCSV()" class="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:border-blue-300 hover:text-blue-600 font-semibold text-slate-600 transition-colors">
            <i class="fas fa-download text-[10px]"></i> CSV
          </button>
          <button onclick="_rpCloseDrill()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 sticky top-0">
            <tr>${columns.map(c=>`<th class="px-4 py-3">${c.label}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="border-t border-slate-100 hover:bg-slate-50">
                ${columns.map(c => `<td class="px-4 py-2.5 text-slate-700">${c.render ? c.render(r) : (r[c.key]!==undefined&&r[c.key]!==null ? r[c.key] : '—')}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ================================================================
  //  DRILL DATA DEFINITIONS
  // ================================================================
  function getDrillData(type) {
    const { deals=[], transactions=[], invoices=[], tasks=[], projects=[], assets=[] } = cachedData;
    const cfg = {
      'won-deals': {
        title: 'Closed Won Deals',
        rows: deals.filter(d=>d.stage==='closed_won'),
        columns: [
          { key:'title',          label:'Deal'         },
          { key:'company',        label:'Company'      },
          { key:'contact_name',   label:'Contact'      },
          { key:'value',          label:'Value',        render: r => fmtMoney(r.value) },
          { key:'source',         label:'Source'       },
          { key:'expected_close', label:'Close Date',   render: r => r.expected_close ? fmtDate(r.expected_close) : '—' },
          { key:'updated_at',     label:'Won At',       render: r => r.updated_at ? fmtDate(r.updated_at) : '—' },
        ]
      },
      'lost-deals': {
        title: 'Closed Lost Deals',
        rows: deals.filter(d=>d.stage==='closed_lost'),
        columns: [
          { key:'title',   label:'Deal'    },
          { key:'company', label:'Company' },
          { key:'value',   label:'Value',   render: r => fmtMoney(r.value) },
          { key:'source',  label:'Source'  },
          { key:'stage',   label:'Stage'   },
        ]
      },
      'active-deals': {
        title: 'Active Deals',
        rows: deals.filter(d=>d.stage!=='closed_won'&&d.stage!=='closed_lost'),
        columns: [
          { key:'title',          label:'Deal'          },
          { key:'stage',          label:'Stage'         },
          { key:'value',          label:'Value',          render: r => fmtMoney(r.value) },
          { key:'expected_close', label:'Expected Close', render: r => r.expected_close ? fmtDate(r.expected_close) : '—' },
          { key:'contact_name',   label:'Contact'       },
        ]
      },
      'all-deals': {
        title: 'All Deals',
        rows: deals,
        columns: [
          { key:'title',   label:'Deal'  },
          { key:'stage',   label:'Stage' },
          { key:'value',   label:'Value', render: r=>fmtMoney(r.value) },
          { key:'company', label:'Company'},
          { key:'source',  label:'Source'},
        ]
      },
      'transactions': {
        title: 'All Transactions',
        rows: transactions.filter(t=>inRange(t.date)).sort((a,b)=>new Date(b.date)-new Date(a.date)),
        columns: [
          { key:'date',        label:'Date',    render: r=>fmtDate(r.date)  },
          { key:'description', label:'Description'                           },
          { key:'category',    label:'Category'                              },
          { key:'type',        label:'Type'                                  },
          { key:'amount',      label:'Amount',  render: r=>fmtMoney(r.amount)},
        ]
      },
      'income': {
        title: 'Income Transactions',
        rows: transactions.filter(t=>t.type==='Income'&&inRange(t.date)),
        columns: [
          { key:'date',        label:'Date',    render: r=>fmtDate(r.date)   },
          { key:'description', label:'Description'                            },
          { key:'category',    label:'Category'                               },
          { key:'amount',      label:'Amount',  render: r=>fmtMoney(r.amount) },
        ]
      },
      'expenses': {
        title: 'Expense Transactions',
        rows: transactions.filter(t=>t.type==='Expense'&&inRange(t.date)),
        columns: [
          { key:'date',        label:'Date',    render: r=>fmtDate(r.date)   },
          { key:'description', label:'Description'                            },
          { key:'category',    label:'Category'                               },
          { key:'amount',      label:'Amount',  render: r=>fmtMoney(r.amount) },
        ]
      },
      'invoices': {
        title: 'Invoices',
        rows: invoices,
        columns: [
          { key:'client_name', label:'Client'                                   },
          { key:'amount',      label:'Amount',   render: r=>fmtMoney(r.amount)  },
          { key:'status',      label:'Status'                                   },
          { key:'due_date',    label:'Due Date',  render: r=>r.due_date?fmtDate(r.due_date):'—' },
          { key:'created_at',  label:'Created',   render: r=>r.created_at?fmtDate(r.created_at):'—' },
        ]
      },
      'tasks': { title:'All Tasks', rows:tasks,
        columns:[{key:'title',label:'Task'},{key:'status',label:'Status'},{key:'priority',label:'Priority'},{key:'due_date',label:'Due',render:r=>r.due_date?fmtDate(r.due_date):'—'}]
      },
      'tasks-completed': { title:'Completed Tasks', rows:tasks.filter(t=>t.status==='Completed'||t.status==='Done'),
        columns:[{key:'title',label:'Task'},{key:'priority',label:'Priority'},{key:'updated_at',label:'Completed',render:r=>r.updated_at?fmtDate(r.updated_at):'—'}]
      },
      'tasks-pending': { title:'Pending Tasks', rows:tasks.filter(t=>t.status!=='Completed'&&t.status!=='Done'),
        columns:[{key:'title',label:'Task'},{key:'status',label:'Status'},{key:'priority',label:'Priority'},{key:'due_date',label:'Due',render:r=>r.due_date?fmtDate(r.due_date):'—'}]
      },
      'projects': { title:'Projects', rows:projects,
        columns:[{key:'name',label:'Project'},{key:'status',label:'Status'},{key:'budget',label:'Budget',render:r=>fmtMoney(r.budget||0)},{key:'start_date',label:'Start',render:r=>r.start_date?fmtDate(r.start_date):'—'},{key:'end_date',label:'End',render:r=>r.end_date?fmtDate(r.end_date):'—'}]
      },
      'assets': { title:'Assets', rows:assets,
        columns:[{key:'name',label:'Name'},{key:'category',label:'Category'},{key:'status',label:'Status'},{key:'value',label:'Value',render:r=>fmtMoney(r.value||0)},{key:'purchase_date',label:'Purchased',render:r=>r.purchase_date?fmtDate(r.purchase_date):'—'}]
      },
    };
    return cfg[type] || null;
  }

  // ================================================================
  //  CHART ENGINE (Chart.js via CDN)
  // ================================================================
  function attachCharts() {
    if (!window.Chart) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload = drawAllCharts;
      document.head.appendChild(s);
    } else {
      drawAllCharts();
    }
  }

  function makeChart(id, type, labels, datasets, opts = {}) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (canvas._chartInstance) canvas._chartInstance.destroy();
    const chart = new window.Chart(canvas, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: opts.legendPos || 'bottom', labels: { font: { size: 10 }, padding: 12, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => opts.money ? ' ' + fmtMoney(ctx.parsed.y ?? ctx.parsed) : ' ' + (ctx.parsed.y ?? ctx.parsed) } }
        },
        scales: ['bar','line'].includes(type) ? {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
          y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => opts.money ? fmtMoney(v) : v } }
        } : undefined,
        ...opts.extra
      }
    });
    canvas._chartInstance = chart;
  }

  const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#f97316','#14b8a6','#ec4899','#6366f1'];

  function drawAllCharts() {
    const { deals=[], transactions=[], invoices=[], tasks=[], payrollRuns=[], timesheets=[], expenses=[] } = cachedData;

    // ── Dashboard charts ──────────────────────────────────────────
    const wonDeals  = deals.filter(d => d.stage==='closed_won' && inRange(d.updated_at));
    const lostDeals = deals.filter(d => d.stage==='closed_lost' && inRange(d.updated_at));
    const revByDay  = groupByDay(wonDeals, 'updated_at', 'value');

    if (revByDay.length > 0) {
      makeChart('rp-chart-rev-trend', 'line',
        revByDay.map(([d]) => fmtDate(d)),
        [{ label:'Revenue', data: revByDay.map(([,v]) => v), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.08)', tension:0.4, fill:true, pointRadius:3 }],
        { money: true }
      );
    }

    const incTx = transactions.filter(t=>t.type==='Income'&&inRange(t.date));
    const expTx = transactions.filter(t=>t.type==='Expense'&&inRange(t.date));
    const incByDay = groupByDay(incTx, 'date', 'amount');
    const expByDay = groupByDay(expTx, 'date', 'amount');
    const allDays  = [...new Set([...incByDay.map(([d])=>d), ...expByDay.map(([d])=>d)])].sort();
    const incMap   = Object.fromEntries(incByDay);
    const expMap   = Object.fromEntries(expByDay);

    if (allDays.length > 0) {
      makeChart('rp-chart-inc-exp', 'bar',
        allDays.map(d => fmtDate(d)),
        [
          { label:'Income',   data: allDays.map(d=>incMap[d]||0), backgroundColor:'rgba(34,197,94,0.7)',  borderRadius:4 },
          { label:'Expenses', data: allDays.map(d=>expMap[d]||0), backgroundColor:'rgba(239,68,68,0.7)',  borderRadius:4 },
        ],
        { money: true }
      );
    }

    const STAGE_LABELS = { lead:'Lead', qualified:'Qualified', discovery:'Discovery', proposal:'Proposal', negotiation:'Negotiation', verbal:'Verbal', closed_won:'Won', closed_lost:'Lost' };
    const stageOrder = ['lead','qualified','discovery','proposal','negotiation','verbal','closed_won','closed_lost'];
    const byStage = {};
    deals.forEach(d => { byStage[d.stage]=(byStage[d.stage]||0)+1; });
    const stageLabelsArr = stageOrder.filter(s=>byStage[s]);
    makeChart('rp-chart-pipeline', 'bar',
      stageLabelsArr.map(s=>STAGE_LABELS[s]||s),
      [{ label:'Deals', data:stageLabelsArr.map(s=>byStage[s]||0), backgroundColor:COLORS, borderRadius:6 }],
      { legendPos:'none' }
    );

    makeChart('rp-chart-winloss', 'doughnut',
      ['Won','Lost'],
      [{ data:[wonDeals.length||0, lostDeals.length||0], backgroundColor:['#22c55e','#ef4444'], borderWidth:0, hoverOffset:4 }],
      { legendPos:'bottom' }
    );

    // ── Sales charts ──────────────────────────────────────────────
    if (revByDay.length > 0) {
      makeChart('rp-chart-sales-trend', 'line',
        revByDay.map(([d])=>fmtDate(d)),
        [{ label:'Revenue', data:revByDay.map(([,v])=>v), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.08)', tension:0.4, fill:true }],
        { money:true }
      );
    }

    makeChart('rp-chart-by-stage', 'bar',
      stageLabelsArr.map(s=>STAGE_LABELS[s]||s),
      [{ label:'Deals', data:stageLabelsArr.map(s=>byStage[s]||0), backgroundColor:COLORS, borderRadius:6 }],
      {}
    );

    const bySource = {};
    deals.forEach(d=>{const s=d.source||'Unknown'; bySource[s]=(bySource[s]||0)+1;});
    if (Object.keys(bySource).length) {
      makeChart('rp-chart-by-source', 'pie',
        Object.keys(bySource),
        [{ data:Object.values(bySource), backgroundColor:COLORS, borderWidth:0 }],
        {}
      );
    }

    const byRep = {};
    wonDeals.forEach(d=>{const r=d.assigned_to||'Unassigned'; if(!byRep[r])byRep[r]={count:0,value:0}; byRep[r].count++; byRep[r].value+=(d.value||0);});
    if (Object.keys(byRep).length) {
      makeChart('rp-chart-by-rep', 'bar',
        Object.keys(byRep),
        [{ label:'Revenue', data:Object.values(byRep).map(r=>r.value), backgroundColor:COLORS, borderRadius:6 }],
        { money:true }
      );
    }

    // ── Financial charts ──────────────────────────────────────────
    const months = [...new Set([...incTx.map(t=>t.date?.slice(0,7)), ...expTx.map(t=>t.date?.slice(0,7))].filter(Boolean))].sort();
    if (months.length) {
      const mIncMap = {}, mExpMap = {};
      incTx.forEach(t=>{const m=t.date?.slice(0,7); if(m) mIncMap[m]=(mIncMap[m]||0)+parseFloat(t.amount||0);});
      expTx.forEach(t=>{const m=t.date?.slice(0,7); if(m) mExpMap[m]=(mExpMap[m]||0)+parseFloat(t.amount||0);});
      makeChart('rp-chart-monthly-fin', 'bar', months,
        [
          {label:'Income',   data:months.map(m=>mIncMap[m]||0), backgroundColor:'rgba(34,197,94,0.75)', borderRadius:4},
          {label:'Expenses', data:months.map(m=>mExpMap[m]||0), backgroundColor:'rgba(239,68,68,0.75)',  borderRadius:4},
        ],
        {money:true}
      );
    }

    const catMap = {};
    expTx.forEach(t=>{const c=t.category||'Other'; catMap[c]=(catMap[c]||0)+parseFloat(t.amount||0);});
    if (Object.keys(catMap).length) {
      makeChart('rp-chart-expense-cat', 'doughnut',
        Object.keys(catMap),
        [{data:Object.values(catMap), backgroundColor:COLORS, borderWidth:0}],
        {money:true, legendPos:'right'}
      );
    }

    const invStatuses = {Paid:0, Unpaid:0, Overdue:0};
    (cachedData.invoices||[]).forEach(i=>{ if(invStatuses[i.status]!==undefined) invStatuses[i.status]++;});
    makeChart('rp-chart-invoice-status','bar',
      Object.keys(invStatuses),
      [{label:'Invoices', data:Object.values(invStatuses), backgroundColor:['#22c55e','#f59e0b','#ef4444'], borderRadius:6}],
      {legendPos:'none'}
    );

    // ── Payroll charts ────────────────────────────────────────────
    const payByMonth = {};
    (cachedData.payrollRuns||[]).filter(r=>inRange(r.pay_date||r.created_at)).forEach(r=>{
      const m=(r.pay_date||r.created_at||'').slice(0,7);
      if(m) payByMonth[m]=(payByMonth[m]||0)+parseFloat(r.total_amount||r.net_pay||0);
    });
    const payMonths = Object.keys(payByMonth).sort();
    if (payMonths.length) {
      makeChart('rp-chart-payroll-trend','line', payMonths,
        [{label:'Payroll', data:payMonths.map(m=>payByMonth[m]), borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)', tension:0.4, fill:true}],
        {money:true}
      );
    }

    const hoursByDay = groupByDay(timesheets.filter(t=>inRange(t.date)), 'date', 'hours');
    if (hoursByDay.length) {
      makeChart('rp-chart-hours','bar',
        hoursByDay.map(([d])=>fmtDate(d)),
        [{label:'Hours', data:hoursByDay.map(([,v])=>v), backgroundColor:'rgba(99,102,241,0.7)', borderRadius:4}],
        {}
      );
    }

    // ── Operations charts ─────────────────────────────────────────
    const taskStatus = {};
    (cachedData.tasks||[]).forEach(t=>{const s=t.status||'Unknown'; taskStatus[s]=(taskStatus[s]||0)+1;});
    if (Object.keys(taskStatus).length) {
      makeChart('rp-chart-task-status','doughnut',Object.keys(taskStatus),
        [{data:Object.values(taskStatus),backgroundColor:COLORS,borderWidth:0}],{}
      );
    }

    const taskPriority = {};
    (cachedData.tasks||[]).forEach(t=>{const p=t.priority||'Normal'; taskPriority[p]=(taskPriority[p]||0)+1;});
    if (Object.keys(taskPriority).length) {
      makeChart('rp-chart-task-priority','bar',Object.keys(taskPriority),
        [{label:'Tasks', data:Object.values(taskPriority), backgroundColor:COLORS, borderRadius:6}],
        {legendPos:'none'}
      );
    }

    // ── Custom builder chart ──────────────────────────────────────
    if (customBuilder.source && customBuilder.chartType !== 'table') {
      const srcData = (cachedData[customBuilder.source] || []).filter(r=>inRange(r.date||r.created_at||'2000-01-01'));
      const numField = (customBuilder.fields || []).find(f => srcData.some(r => typeof r[f] === 'number' || !isNaN(parseFloat(r[f]))));
      const labelField = (customBuilder.fields || []).find(f => f !== numField);
      if (numField && labelField) {
        const grouped = {};
        srcData.forEach(r => {
          const k = r[labelField] || 'Unknown';
          grouped[k] = (grouped[k]||0) + parseFloat(r[numField]||0);
        });
        makeChart('rp-chart-custom', customBuilder.chartType,
          Object.keys(grouped).slice(0,15),
          [{label:numField.replace(/_/g,' '), data:Object.values(grouped).slice(0,15), backgroundColor:COLORS, borderRadius:4, borderColor:'#3b82f6', tension:0.4}],
          {}
        );
      }
    }
  }

  // ================================================================
  //  EXPORT HELPERS
  // ================================================================
  function toCSV(rows, columns) {
    const header = columns.map(c=>c.label).join(',');
    const lines  = rows.map(r => columns.map(c => {
      const val = c.render ? c.render(r) : (r[c.key]??'');
      return `"${String(val).replace(/"/g,'""')}"`;
    }).join(','));
    return [header, ...lines].join('\n');
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  window._rpExportCSV = function() {
    const section = activeSection;
    let rows = [], cols = [];
    if (section === 'sales') {
      rows = (cachedData.deals||[]).filter(d=>inRange(d.created_at)||inRange(d.updated_at));
      cols = [{key:'title',label:'Deal'},{key:'stage',label:'Stage'},{key:'value',label:'Value'},{key:'company',label:'Company'},{key:'source',label:'Source'}];
    } else if (section === 'financial') {
      rows = (cachedData.transactions||[]).filter(t=>inRange(t.date));
      cols = [{key:'date',label:'Date'},{key:'description',label:'Description'},{key:'category',label:'Category'},{key:'type',label:'Type'},{key:'amount',label:'Amount'}];
    } else {
      toast('Switch to a specific report section to export', 'info');
      return;
    }
    downloadCSV(toCSV(rows, cols), `${section}-report-${new Date().toISOString().slice(0,10)}.csv`);
    toast('CSV exported!', 'success');
  };

  window._rpExportDrillCSV = function() {
    if (!drillData) return;
    downloadCSV(toCSV(drillData.rows, drillData.columns), `${drillData.title.toLowerCase().replace(/\s+/g,'-')}.csv`);
    toast('CSV exported!', 'success');
  };

  window._rpExportCustomCSV = function() {
    if (!customBuilder.source) return;
    const srcData = (cachedData[customBuilder.source]||[]).filter(r=>inRange(r.date||r.created_at||'2000-01-01'));
    const fields  = customBuilder.fields.length ? customBuilder.fields : Object.keys(srcData[0]||{}).slice(0,6);
    const cols    = fields.map(f=>({key:f,label:f.replace(/_/g,' ')}));
    downloadCSV(toCSV(srcData, cols), `custom-${customBuilder.source}-${new Date().toISOString().slice(0,10)}.csv`);
    toast('CSV exported!', 'success');
  };

  window._rpPrint = function() {
    window.print();
  };

  // ================================================================
  //  EVENT HANDLERS
  // ================================================================
  window._rpSection = function(s) { activeSection = s; render(); };
  window._rpRange   = function(r) { dateRange = r; if(r!=='custom'){customFrom='';customTo='';} render(); };
  window._rpCustomFrom = function(v) { customFrom = v; render(); };
  window._rpCustomTo   = function(v) { customTo = v; render(); };
  window._rpRefresh = function() { cachedData = {}; loadAll(); };

  window._rpDrill = function(type) {
    const data = getDrillData(type);
    if (!data) { toast('No data available', 'info'); return; }
    drillData = data;
    render();
  };

  window._rpCloseDrill = function() {
    drillData = null;
    render();
  };

  window._rpCustomSource = function(src) {
    customBuilder.source = src;
    customBuilder.fields = [];
    render();
  };

  window._rpCustomField = function(f) {
    const idx = customBuilder.fields.indexOf(f);
    if (idx >= 0) customBuilder.fields.splice(idx, 1);
    else customBuilder.fields.push(f);
    render();
  };

  window._rpCustomChart = function(t) {
    customBuilder.chartType = t;
    render();
  };

  window._rpRunCustom = function() {
    if (!customBuilder.source) { toast('Please select a data source first', 'warning'); return; }
    render();
    toast('Report generated!', 'success');
  };

  window._rpCustomReset = function() {
    customBuilder = { source:'', fields:[], filters:[], chartType:'bar' };
    render();
  };

  // ── Boot ────────────────────────────────────────────────────────
  container.innerHTML = `<div class="flex items-center justify-center h-64"><i class="fas fa-circle-notch fa-spin text-3xl text-blue-500 opacity-60"></i></div>`;
  loadAll();
};
