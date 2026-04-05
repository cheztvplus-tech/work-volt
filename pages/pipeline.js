window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['pipeline'] = function (container) {

  // ── Auth ────────────────────────────────────────────────────────
  const currentUser = window.WorkVolt?.user() || {};
  const db          = window.WorkVoltDB;
  const toast       = (m, t) => window.WorkVolt?.toast(m, t || 'info');

  // ── Stage definitions ───────────────────────────────────────────
  const STAGES = [
    { id: 'lead',             label: 'Lead',             color: '#6366f1', bg: '#eef2ff', prob: 10,  icon: 'fa-star',            required: ['title','contact_name','source'] },
    { id: 'qualified',        label: 'Qualified',        color: '#8b5cf6', bg: '#f5f3ff', prob: 25,  icon: 'fa-check-circle',    required: ['contact_email','budget'] },
    { id: 'discovery',        label: 'Discovery',        color: '#3b82f6', bg: '#eff6ff', prob: 40,  icon: 'fa-search',          required: ['contact_email'] },
    { id: 'proposal',         label: 'Proposal Sent',    color: '#0ea5e9', bg: '#f0f9ff', prob: 55,  icon: 'fa-file-alt',        required: ['value','expected_close'] },
    { id: 'negotiation',      label: 'Negotiation',      color: '#f59e0b', bg: '#fffbeb', prob: 70,  icon: 'fa-handshake',       required: ['value','notes'] },
    { id: 'verbal',           label: 'Verbal Agreement', color: '#f97316', bg: '#fff7ed', prob: 85,  icon: 'fa-comments',        required: ['value','expected_close'] },
    { id: 'closed_won',       label: 'Closed Won',       color: '#22c55e', bg: '#f0fdf4', prob: 100, icon: 'fa-trophy',          required: ['value','payment_method'] },
    { id: 'closed_lost',      label: 'Closed Lost',      color: '#ef4444', bg: '#fef2f2', prob: 0,   icon: 'fa-times-circle',    required: [] },
  ];

  const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));

  // ── State ───────────────────────────────────────────────────────
  let deals        = [];
  let users        = [];
  let activeView   = 'kanban';   // kanban | list | forecast
  let filterMine   = false;
  let filterHigh   = false;
  let filterStuck  = false;
  let filterClose  = false;
  let searchQ      = '';
  let openDealId   = null;
  let dragDealId   = null;
  let dragOrigin   = null;

  // ── Currency ────────────────────────────────────────────────────
  const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ── Stuck detection (5 days) ────────────────────────────────────
  function isStuck(deal) {
    if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return false;
    const ref  = deal.last_activity_at || deal.updated_at || deal.created_at;
    if (!ref) return false;
    return (Date.now() - new Date(ref).getTime()) > 5 * 86400000;
  }

  // ── Lead score ──────────────────────────────────────────────────
  function leadScore(deal) {
    let s = 0;
    if (deal.contact_email)     s += 10;
    if (deal.budget)            s += 15;
    if (deal.expected_close)    s += 10;
    if (deal.value > 5000)      s += 20;
    if (deal.value > 20000)     s += 15;
    const stageIdx = STAGES.findIndex(x => x.id === deal.stage);
    s += (stageIdx >= 0 ? stageIdx : 0) * 5;
    if (deal.notes?.length > 30) s += 5;
    return Math.min(s, 100);
  }

  function scoreLabel(score) {
    if (score >= 70) return { label: '🔥 Hot',  cls: 'bg-red-100 text-red-700 border-red-200' };
    if (score >= 40) return { label: '🌤 Warm', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return               { label: '❄️ Cold',   cls: 'bg-blue-100 text-blue-600 border-blue-200' };
  }

  // ── Load ────────────────────────────────────────────────────────
  async function load() {
    try {
      [deals, users] = await Promise.all([
        db.pipeline.deals(),
        db.users.list().catch(() => []),
      ]);
    } catch (e) {
      toast('Failed to load pipeline: ' + e.message, 'error');
      deals = []; users = [];
    }
    render();
  }

  // ── Filter deals ────────────────────────────────────────────────
  function filtered() {
    let list = [...deals];
    if (searchQ)      list = list.filter(d => (d.title + d.contact_name + d.company).toLowerCase().includes(searchQ.toLowerCase()));
    if (filterMine)   list = list.filter(d => d.assigned_to === currentUser.id);
    if (filterHigh)   list = list.filter(d => (d.value || 0) >= 10000);
    if (filterClose)  list = list.filter(d => {
      if (!d.expected_close) return false;
      const days = (new Date(d.expected_close) - Date.now()) / 86400000;
      return days >= 0 && days <= 7;
    });
    if (filterStuck)  list = list.filter(d => isStuck(d));
    return list;
  }

  // ── Metrics ─────────────────────────────────────────────────────
  function metrics(list) {
    const active   = list.filter(d => d.stage !== 'closed_lost');
    const won      = list.filter(d => d.stage === 'closed_won');
    const total    = active.reduce((s, d) => s + (d.value || 0), 0);
    const weighted = active.reduce((s, d) => s + (d.value || 0) * (STAGE_MAP[d.stage]?.prob || 0) / 100, 0);
    const closed   = list.filter(d => d.stage === 'closed_won' || d.stage === 'closed_lost').length;
    const winRate  = closed ? Math.round(won.length / closed * 100) : 0;
    const avgSize  = won.length ? won.reduce((s, d) => s + (d.value || 0), 0) / won.length : 0;
    return { total, weighted, winRate, avgSize, wonCount: won.length, activeCount: active.length };
  }

  // ================================================================
  //  MAIN RENDER
  // ================================================================
  function render() {
    const list = filtered();
    const m    = metrics(list);

    const viewBtns = [
      { id: 'kanban',   icon: 'fa-columns',    label: 'Kanban'   },
      { id: 'list',     icon: 'fa-list',        label: 'List'     },
      { id: 'forecast', icon: 'fa-chart-line',  label: 'Forecast' },
    ].map(v => `
      <button onclick="_pvView('${v.id}')"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
          ${activeView === v.id ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}">
        <i class="fas ${v.icon} text-[11px]"></i>${v.label}
      </button>`).join('');

    const filterBtns = [
      { key: 'filterMine',  label: 'My Deals',          icon: 'fa-user'           },
      { key: 'filterHigh',  label: 'High Value',         icon: 'fa-dollar-sign'    },
      { key: 'filterClose', label: 'Closing This Week',  icon: 'fa-calendar'       },
      { key: 'filterStuck', label: 'Stuck',              icon: 'fa-exclamation-triangle' },
    ].map(f => {
      const on = f.key === 'filterMine'  ? filterMine  :
                 f.key === 'filterHigh'  ? filterHigh  :
                 f.key === 'filterClose' ? filterClose : filterStuck;
      return `<button onclick="_pvFilter('${f.key}')"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
          ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}">
        <i class="fas ${f.icon} text-[10px]"></i>${f.label}
      </button>`;
    }).join('');

    container.innerHTML = `
    <div class="min-h-full bg-slate-50 flex flex-col" id="pv-root">

      <!-- Header -->
      <div class="bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-3 flex-wrap sticky top-0 z-20">
        <div class="flex-1 min-w-0">
          <h1 class="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <i class="fas fa-filter text-blue-500 text-base"></i> Sales Pipeline
          </h1>
        </div>

        <!-- View toggle -->
        <div class="flex items-center gap-0.5 bg-slate-100 rounded-xl p-1">${viewBtns}</div>

        <!-- Search -->
        <div class="relative">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input id="pv-search" type="text" placeholder="Search deals…" value="${searchQ}"
            oninput="_pvSearch(this.value)"
            class="pl-8 pr-3 py-1.5 bg-slate-100 border border-transparent rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white w-44 transition-all">
        </div>

        <button onclick="_pvOpenAdd()"
          class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
          <i class="fas fa-plus"></i> Add Deal
        </button>
      </div>

      <!-- Metrics bar -->
      <div class="bg-white border-b border-slate-100 px-5 py-3 flex items-center gap-4 overflow-x-auto flex-shrink-0">
        ${[
          { label: 'Pipeline Value',   val: fmt(m.total),    icon: 'fa-database',   clr: 'text-blue-600'  },
          { label: 'Weighted Value',   val: fmt(m.weighted), icon: 'fa-balance-scale', clr: 'text-indigo-600' },
          { label: 'Win Rate',         val: m.winRate + '%', icon: 'fa-trophy',     clr: 'text-green-600' },
          { label: 'Avg Deal Size',    val: fmt(m.avgSize),  icon: 'fa-chart-bar',  clr: 'text-amber-600' },
          { label: 'Active Deals',     val: m.activeCount,   icon: 'fa-circle-notch', clr: 'text-slate-500' },
        ].map(stat => `
          <div class="flex items-center gap-2.5 min-w-max pr-4 border-r border-slate-100 last:border-0">
            <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
              <i class="fas ${stat.icon} ${stat.clr} text-sm"></i>
            </div>
            <div>
              <p class="text-xs text-slate-400 font-medium leading-none mb-0.5">${stat.label}</p>
              <p class="text-sm font-extrabold text-slate-900">${stat.val}</p>
            </div>
          </div>`).join('')}
      </div>

      <!-- Filter bar -->
      <div class="bg-white border-b border-slate-100 px-5 py-2.5 flex items-center gap-2 overflow-x-auto flex-shrink-0">
        <span class="text-xs text-slate-400 font-semibold mr-1 whitespace-nowrap">Quick filters:</span>
        ${filterBtns}
        ${(filterMine||filterHigh||filterClose||filterStuck||searchQ) ? `
          <button onclick="_pvClearFilters()" class="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap">
            <i class="fas fa-times text-[10px]"></i> Clear
          </button>` : ''}
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden">
        ${activeView === 'kanban'   ? renderKanban(list)   :
          activeView === 'list'     ? renderList(list)     :
                                      renderForecast(list) }
      </div>
    </div>

    <!-- Deal detail panel (if open) -->
    <div id="pv-panel-backdrop" class="${openDealId ? '' : 'hidden'} fixed inset-0 bg-black/40 z-40 flex justify-end" onclick="_pvPanelBackdrop(event)">
      <div id="pv-panel" class="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        ${openDealId ? renderDealPanel(deals.find(d => d.id === openDealId)) : ''}
      </div>
    </div>`;

    _initDrag();
  }

  // ================================================================
  //  KANBAN
  // ================================================================
  function renderKanban(list) {
    const activeStages = STAGES.filter(s => s.id !== 'closed_lost');

    return `
    <div class="flex gap-3 p-4 overflow-x-auto h-full" style="align-items:start">
      ${activeStages.map(stage => {
        const stageDeals = list.filter(d => d.stage === stage.id);
        const stageVal   = stageDeals.reduce((s, d) => s + (d.value || 0), 0);

        return `
          <div class="flex-shrink-0 w-64 flex flex-col rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm"
               style="border-top: 3px solid ${stage.color}">
            <div class="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between"
                 style="background:${stage.bg}">
              <div class="flex items-center gap-2">
                <i class="fas ${stage.icon} text-xs" style="color:${stage.color}"></i>
                <span class="text-xs font-bold text-slate-800">${stage.label}</span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style="background:${stage.color}">${stageDeals.length}</span>
              </div>
              <span class="text-[10px] font-semibold text-slate-500">${fmt(stageVal)}</span>
            </div>
            <div class="flex-1 p-2 space-y-2 min-h-[60px] kanban-col" data-stage="${stage.id}"
                 ondragover="event.preventDefault()"
                 ondrop="_pvDrop(event,'${stage.id}')">
              ${stageDeals.map(d => renderDealCard(d)).join('')}
            </div>
            <div class="p-2 border-t border-slate-100">
              <button onclick="_pvOpenAdd('${stage.id}')"
                class="w-full text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1">
                <i class="fas fa-plus text-[10px]"></i> Add deal
              </button>
            </div>
          </div>`;
      }).join('')}

      <!-- Closed Lost column -->
      ${(() => {
        const lostDeals = list.filter(d => d.stage === 'closed_lost');
        return `
          <div class="flex-shrink-0 w-64 flex flex-col rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm opacity-60"
               style="border-top: 3px solid #ef4444">
            <div class="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between bg-red-50">
              <div class="flex items-center gap-2">
                <i class="fas fa-times-circle text-xs text-red-500"></i>
                <span class="text-xs font-bold text-slate-800">Closed Lost</span>
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">${lostDeals.length}</span>
              </div>
            </div>
            <div class="flex-1 p-2 space-y-2 min-h-[60px] kanban-col" data-stage="closed_lost"
                 ondragover="event.preventDefault()"
                 ondrop="_pvDrop(event,'closed_lost')">
              ${lostDeals.map(d => renderDealCard(d)).join('')}
            </div>
          </div>`;
      })()}
    </div>`;
  }

  function renderDealCard(deal) {
    const stage  = STAGE_MAP[deal.stage] || STAGES[0];
    const score  = leadScore(deal);
    const sl     = scoreLabel(score);
    const stuck  = isStuck(deal);
    const daysAgo = deal.last_activity_at
      ? Math.floor((Date.now() - new Date(deal.last_activity_at)) / 86400000)
      : null;

    return `
      <div class="deal-card bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group select-none"
           draggable="true"
           data-deal-id="${deal.id}"
           onclick="_pvOpenDeal('${deal.id}')"
           ondragstart="_pvDragStart(event,'${deal.id}','${deal.stage}')">
        ${stuck ? `<div class="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-2"><i class="fas fa-exclamation-triangle"></i> Stuck deal</div>` : ''}
        <div class="flex items-start justify-between gap-2 mb-2">
          <p class="text-xs font-bold text-slate-900 leading-snug line-clamp-2">${deal.title || 'Untitled'}</p>
          <span class="text-[10px] font-bold border px-1.5 py-0.5 rounded-full flex-shrink-0 ${sl.cls}">${sl.label}</span>
        </div>
        ${deal.company ? `<p class="text-[10px] text-slate-400 mb-1.5 flex items-center gap-1"><i class="fas fa-building text-[9px]"></i>${deal.company}</p>` : ''}
        <div class="flex items-center justify-between mt-2">
          <span class="text-sm font-extrabold text-slate-800">${fmt(deal.value)}</span>
          ${deal.expected_close ? `<span class="text-[10px] text-slate-400"><i class="fas fa-calendar text-[9px] mr-1"></i>${new Date(deal.expected_close).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>` : ''}
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex items-center gap-1">
            <div class="w-1.5 h-1.5 rounded-full" style="background:${stage.color}"></div>
            <span class="text-[10px] text-slate-400 font-medium">${stage.prob}% prob.</span>
          </div>
          ${daysAgo !== null ? `<span class="text-[10px] text-slate-300">${daysAgo}d ago</span>` : ''}
        </div>
        <!-- Progress bar -->
        <div class="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all" style="width:${stage.prob}%;background:${stage.color}"></div>
        </div>
      </div>`;
  }

  // ================================================================
  //  LIST VIEW
  // ================================================================
  function renderList(list) {
    if (!list.length) return `<div class="flex flex-col items-center justify-center py-24 text-slate-400 gap-3"><i class="fas fa-inbox text-4xl opacity-30"></i><p class="font-semibold">No deals found</p></div>`;

    const rows = list.map(deal => {
      const stage = STAGE_MAP[deal.stage] || STAGES[0];
      const score = leadScore(deal);
      const sl    = scoreLabel(score);
      const stuck = isStuck(deal);

      return `
        <tr class="border-t border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer" onclick="_pvOpenDeal('${deal.id}')">
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              ${stuck ? `<i class="fas fa-exclamation-triangle text-amber-500 text-xs" title="Stuck deal"></i>` : ''}
              <div>
                <p class="text-sm font-semibold text-slate-900">${deal.title || 'Untitled'}</p>
                ${deal.company ? `<p class="text-xs text-slate-400">${deal.company}</p>` : ''}
              </div>
            </div>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style="background:${stage.bg};color:${stage.color};border-color:${stage.color}33">
              <i class="fas ${stage.icon} text-[10px]"></i>${stage.label}
            </span>
          </td>
          <td class="px-4 py-3 text-sm font-bold text-slate-800">${fmt(deal.value)}</td>
          <td class="px-4 py-3 text-xs text-slate-500">${deal.expected_close ? new Date(deal.expected_close).toLocaleDateString() : '—'}</td>
          <td class="px-4 py-3"><span class="text-xs border px-2 py-0.5 rounded-full font-semibold ${sl.cls}">${sl.label}</span></td>
          <td class="px-4 py-3 text-xs text-slate-400">${deal.contact_name || '—'}</td>
          <td class="px-4 py-3">
            <div class="flex items-center gap-1">
              <button onclick="event.stopPropagation();_pvOpenDeal('${deal.id}')" class="w-7 h-7 rounded-lg hover:bg-blue-100 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"><i class="fas fa-expand-alt text-xs"></i></button>
              <button onclick="event.stopPropagation();_pvConfirmDelete('${deal.id}')" class="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"><i class="fas fa-trash text-xs"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="p-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th class="px-4 py-3">Deal</th>
                  <th class="px-4 py-3">Stage</th>
                  <th class="px-4 py-3">Value</th>
                  <th class="px-4 py-3">Close Date</th>
                  <th class="px-4 py-3">Score</th>
                  <th class="px-4 py-3">Contact</th>
                  <th class="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  // ================================================================
  //  FORECAST VIEW
  // ================================================================
  function renderForecast(list) {
    const now       = new Date();
    const monthEnd  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const active    = list.filter(d => d.stage !== 'closed_lost');

    const closing   = active.filter(d => {
      if (!d.expected_close) return false;
      const c = new Date(d.expected_close);
      return c >= now && c <= monthEnd;
    });

    const nextMonth = active.filter(d => {
      if (!d.expected_close) return false;
      const c   = new Date(d.expected_close);
      const nm  = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const ns  = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return c >= ns && c <= nm;
    });

    const overdue   = active.filter(d => d.expected_close && new Date(d.expected_close) < now);
    const won       = list.filter(d => d.stage === 'closed_won');

    const closingVal   = closing.reduce((s, d) => s + (d.value || 0), 0);
    const closingW     = closing.reduce((s, d) => s + (d.value || 0) * (STAGE_MAP[d.stage]?.prob || 0) / 100, 0);
    const nextMonthVal = nextMonth.reduce((s, d) => s + (d.value || 0), 0);
    const wonVal       = won.reduce((s, d) => s + (d.value || 0), 0);

    const stageBreakdown = STAGES.filter(s => s.id !== 'closed_lost').map(s => {
      const sDeals = active.filter(d => d.stage === s.id);
      const sVal   = sDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const sWVal  = sDeals.reduce((sum, d) => sum + (d.value || 0) * s.prob / 100, 0);
      return { ...s, count: sDeals.length, val: sVal, weighted: sWVal };
    });

    const maxVal = Math.max(...stageBreakdown.map(s => s.val), 1);

    return `
      <div class="p-4 space-y-4">

        <!-- Summary cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${[
            { label: 'Closing This Month',  val: fmt(closingVal),  sub: fmt(closingW) + ' weighted',  icon: 'fa-calendar-check', clr: 'from-blue-500 to-blue-700' },
            { label: 'Next Month Pipeline', val: fmt(nextMonthVal), sub: nextMonth.length + ' deals',   icon: 'fa-calendar-plus',  clr: 'from-indigo-500 to-indigo-700' },
            { label: 'Won This Year',       val: fmt(wonVal),       sub: won.length + ' deals closed', icon: 'fa-trophy',         clr: 'from-green-500 to-green-700' },
            { label: 'Overdue Deals',       val: overdue.length,    sub: fmt(overdue.reduce((s,d)=>s+(d.value||0),0)), icon: 'fa-clock', clr: 'from-red-500 to-red-600' },
          ].map(c => `
            <div class="rounded-2xl p-4 text-white bg-gradient-to-br ${c.clr} shadow-sm">
              <i class="fas ${c.icon} text-2xl opacity-80 mb-3"></i>
              <p class="text-2xl font-extrabold leading-none">${c.val}</p>
              <p class="text-xs opacity-80 mt-1">${c.label}</p>
              <p class="text-[11px] opacity-60 mt-0.5">${c.sub}</p>
            </div>`).join('')}
        </div>

        <!-- Stage funnel -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-sm">Pipeline Funnel</h3>
            <p class="text-xs text-slate-400 mt-0.5">Deal value by stage (bar = total, fill = weighted)</p>
          </div>
          <div class="p-5 space-y-3">
            ${stageBreakdown.filter(s => s.count > 0).map(s => `
              <div class="flex items-center gap-3">
                <div class="w-32 flex-shrink-0 flex items-center gap-2">
                  <i class="fas ${s.icon} text-xs" style="color:${s.color}"></i>
                  <span class="text-xs font-semibold text-slate-700 truncate">${s.label}</span>
                </div>
                <div class="flex-1 relative">
                  <div class="h-6 rounded-lg overflow-hidden bg-slate-100">
                    <div class="h-full rounded-lg opacity-30 transition-all" style="width:${(s.val/maxVal*100).toFixed(1)}%;background:${s.color}"></div>
                    <div class="h-full rounded-lg absolute top-0 left-0 transition-all" style="width:${(s.weighted/maxVal*100).toFixed(1)}%;background:${s.color}"></div>
                  </div>
                </div>
                <div class="w-28 flex-shrink-0 text-right">
                  <p class="text-xs font-bold text-slate-800">${fmt(s.val)}</p>
                  <p class="text-[10px] text-slate-400">${s.count} deal${s.count!==1?'s':''} · ${fmt(s.weighted)} wtd</p>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Deals closing this month -->
        ${closing.length ? `
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="font-bold text-slate-900 text-sm">Closing This Month</h3>
              <span class="text-xs text-slate-400">${closing.length} deal${closing.length!==1?'s':''}</span>
            </div>
            <div class="divide-y divide-slate-100">
              ${closing.map(d => {
                const stage = STAGE_MAP[d.stage] || STAGES[0];
                const daysLeft = Math.ceil((new Date(d.expected_close) - Date.now()) / 86400000);
                return `
                  <div class="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors" onclick="_pvOpenDeal('${d.id}')">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${stage.bg}">
                      <i class="fas ${stage.icon} text-xs" style="color:${stage.color}"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-slate-900 truncate">${d.title}</p>
                      <p class="text-xs text-slate-400">${d.company || d.contact_name || '—'}</p>
                    </div>
                    <div class="text-right flex-shrink-0">
                      <p class="text-sm font-bold text-slate-800">${fmt(d.value)}</p>
                      <p class="text-[11px] ${daysLeft<=3?'text-red-500 font-bold':'text-slate-400'}">${daysLeft}d left</p>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>` : ''}
      </div>`;
  }

  // ================================================================
  //  DEAL PANEL
  // ================================================================
  function renderDealPanel(deal) {
    if (!deal) return '<div class="flex items-center justify-center h-64 text-slate-400"><p>Deal not found</p></div>';

    const stage    = STAGE_MAP[deal.stage] || STAGES[0];
    const score    = leadScore(deal);
    const sl       = scoreLabel(score);
    const stuck    = isStuck(deal);
    const activity = deal._activity || [];
    const notes    = deal.notes || '';

    const assignedUser = users.find(u => u.id === deal.assigned_to);
    const stageSelect  = STAGES.map(s =>
      `<option value="${s.id}" ${deal.stage===s.id?'selected':''}>${s.label}</option>`
    ).join('');

    return `
      <!-- Panel Header -->
      <div class="sticky top-0 bg-white border-b border-slate-200 z-10 flex-shrink-0">
        <div class="flex items-center gap-3 px-5 py-4">
          <button onclick="_pvClosePanel()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
            <i class="fas fa-times text-sm"></i>
          </button>
          <div class="flex-1 min-w-0">
            <h2 class="font-extrabold text-slate-900 text-base truncate">${deal.title || 'Untitled Deal'}</h2>
            <p class="text-xs text-slate-400">${deal.company || ''}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${stuck ? `<span class="text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-lg flex items-center gap-1"><i class="fas fa-exclamation-triangle text-[10px]"></i>Stuck</span>` : ''}
            <span class="text-xs border px-2 py-1 rounded-full font-semibold ${sl.cls}">${sl.label}</span>
          </div>
        </div>

        <!-- Stage ribbon -->
        <div class="flex overflow-x-auto px-3 pb-3 gap-1.5">
          ${STAGES.filter(s=>s.id!=='closed_lost').map(s => {
            const isCurrent = deal.stage === s.id;
            const isPast    = STAGES.findIndex(x=>x.id===deal.stage) > STAGES.findIndex(x=>x.id===s.id);
            return `
              <button onclick="_pvChangeStage('${deal.id}','${s.id}')"
                class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border
                  ${isCurrent ? 'text-white border-transparent shadow-sm' : isPast ? 'border-transparent opacity-60' : 'border-slate-200 text-slate-500 hover:border-blue-300'}"
                style="${isCurrent ? `background:${s.color}` : isPast ? `background:${s.bg};color:${s.color}` : ''}">
                <i class="fas ${s.icon} text-[9px]"></i>${s.label}
              </button>`;
          }).join('')}
          <button onclick="_pvChangeStage('${deal.id}','closed_lost')"
            class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all
              ${deal.stage==='closed_lost' ? 'bg-red-500 text-white border-transparent' : 'border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500'}">
            <i class="fas fa-times-circle text-[9px]"></i>Lost
          </button>
        </div>
      </div>

      <!-- Panel Body -->
      <div class="flex-1 p-5 space-y-5 overflow-y-auto">

        <!-- Key figures -->
        <div class="grid grid-cols-3 gap-3">
          ${[
            { label:'Value',       val: fmt(deal.value),       icon:'fa-dollar-sign', clr:'text-green-600'  },
            { label:'Probability', val: stage.prob + '%',      icon:'fa-percentage',  clr:'text-blue-600'   },
            { label:'Weighted',    val: fmt((deal.value||0)*stage.prob/100), icon:'fa-balance-scale', clr:'text-indigo-600' },
          ].map(k => `
            <div class="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
              <i class="fas ${k.icon} ${k.clr} text-sm mb-1"></i>
              <p class="text-sm font-extrabold text-slate-900">${k.val}</p>
              <p class="text-[10px] text-slate-400">${k.label}</p>
            </div>`).join('')}
        </div>

        <!-- Details form -->
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-900">Deal Details</h3>
            <button onclick="_pvSaveDeal('${deal.id}')" id="pv-save-btn"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors">
              <i class="fas fa-save text-[10px]"></i> Save
            </button>
          </div>
          <div class="p-4 grid grid-cols-2 gap-3" id="pv-detail-form" data-deal-id="${deal.id}">
            ${[
              { key:'title',          label:'Deal Title',        type:'text',   full:true  },
              { key:'company',        label:'Company',           type:'text'               },
              { key:'contact_name',   label:'Contact Name',      type:'text'               },
              { key:'contact_email',  label:'Contact Email',     type:'email'              },
              { key:'value',          label:'Deal Value ($)',     type:'number'             },
              { key:'budget',         label:'Client Budget ($)',  type:'number'             },
              { key:'expected_close', label:'Expected Close',     type:'date'               },
              { key:'source',         label:'Lead Source',        type:'text'               },
              { key:'payment_method', label:'Payment Method',     type:'text'               },
            ].map(f => `
              <div class="${f.full ? 'col-span-2' : ''}">
                <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">${f.label}</label>
                <input data-field="${f.key}" type="${f.type}" value="${deal[f.key]||''}"
                  class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 focus:bg-white font-medium text-slate-800">
              </div>`).join('')}
            <div class="col-span-2">
              <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Assigned To</label>
              <select data-field="assigned_to" class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50">
                <option value="">— Unassigned —</option>
                ${users.map(u=>`<option value="${u.id}" ${deal.assigned_to===u.id?'selected':''}>${u.name||u.email}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2"><i class="fas fa-sticky-note text-amber-500 text-xs"></i>Notes</h3>
            <button onclick="_pvSaveNotes('${deal.id}')" class="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">Save</button>
          </div>
          <div class="p-4">
            <textarea id="pv-notes-${deal.id}" rows="4" placeholder="Add notes about this deal…"
              class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-slate-50 focus:bg-white transition-all font-medium text-slate-700">${notes}</textarea>
          </div>
        </div>

        <!-- Integrations -->
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2"><i class="fas fa-plug text-blue-500 text-xs"></i>Module Actions</h3>
          </div>
          <div class="p-4 grid grid-cols-2 gap-2">
            ${[
              { label:'Create CRM Contact',    icon:'fa-address-book',        clr:'blue',   fn:`_pvIntegration('crm','${deal.id}')` },
              { label:'Generate Invoice',      icon:'fa-file-invoice-dollar', clr:'green',  fn:`_pvIntegration('invoice','${deal.id}')` },
              { label:'Create Contract',       icon:'fa-file-signature',      clr:'indigo', fn:`_pvIntegration('contract','${deal.id}')` },
              { label:'Add Follow-up Task',    icon:'fa-check-circle',        clr:'amber',  fn:`_pvIntegration('task','${deal.id}')` },
              { label:'Send Notification',     icon:'fa-bell',                clr:'purple', fn:`_pvIntegration('notify','${deal.id}')` },
            ].map(a => `
              <button onclick="${a.fn}"
                class="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:border-${a.clr}-300 hover:bg-${a.clr}-50 text-slate-700 hover:text-${a.clr}-700 transition-all text-xs font-semibold group">
                <i class="fas ${a.icon} text-slate-400 group-hover:text-${a.clr}-500 text-sm"></i>${a.label}
              </button>`).join('')}
          </div>
        </div>

        <!-- Activity Timeline -->
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2"><i class="fas fa-stream text-slate-400 text-xs"></i>Activity Timeline</h3>
            <button onclick="_pvAddActivity('${deal.id}')" class="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1">
              <i class="fas fa-plus text-[10px]"></i> Log
            </button>
          </div>
          <div class="p-4" id="pv-timeline-${deal.id}">
            ${renderTimeline(deal)}
          </div>
        </div>

        <!-- Danger zone -->
        <div class="border border-red-200 rounded-2xl p-4 flex items-center justify-between bg-red-50">
          <div>
            <p class="text-sm font-bold text-red-700">Delete Deal</p>
            <p class="text-xs text-red-500">This action cannot be undone.</p>
          </div>
          <button onclick="_pvConfirmDelete('${deal.id}')"
            class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors">
            <i class="fas fa-trash text-[10px] mr-1"></i>Delete
          </button>
        </div>
      </div>`;
  }

  function renderTimeline(deal) {
    let events = [];
    try { events = JSON.parse(deal.timeline || '[]'); } catch(e) {}

    if (!events.length) return `<p class="text-xs text-slate-400 text-center py-4">No activity yet. Log calls, emails, and notes to track progress.</p>`;

    const icons = {
      'call':     { icon:'fa-phone',       clr:'text-green-600',  bg:'bg-green-100'  },
      'email':    { icon:'fa-envelope',    clr:'text-blue-600',   bg:'bg-blue-100'   },
      'note':     { icon:'fa-sticky-note', clr:'text-amber-600',  bg:'bg-amber-100'  },
      'stage':    { icon:'fa-arrow-right', clr:'text-indigo-600', bg:'bg-indigo-100' },
      'meeting':  { icon:'fa-calendar',    clr:'text-purple-600', bg:'bg-purple-100' },
      'task':     { icon:'fa-check',       clr:'text-teal-600',   bg:'bg-teal-100'   },
    };

    return `
      <div class="space-y-3">
        ${[...events].reverse().map(ev => {
          const meta = icons[ev.type] || icons['note'];
          return `
            <div class="flex gap-3">
              <div class="flex-shrink-0 w-7 h-7 rounded-full ${meta.bg} flex items-center justify-center mt-0.5">
                <i class="fas ${meta.icon} ${meta.clr} text-[10px]"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-slate-800">${ev.text || ev.type}</p>
                <p class="text-[10px] text-slate-400">${ev.user || 'System'} · ${new Date(ev.at||Date.now()).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // ================================================================
  //  ADD ACTIVITY MODAL
  // ================================================================
  function _pvAddActivity(dealId) {
    const modal = document.getElementById('pv-modal') || (() => {
      const d = document.createElement('div');
      d.id = 'pv-modal';
      document.body.appendChild(d);
      return d;
    })();

    modal.innerHTML = `
      <div class="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
           onclick="if(event.target===this)document.getElementById('pv-modal').innerHTML=''">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-900">Log Activity</h3>
            <button onclick="document.getElementById('pv-modal').innerHTML=''" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Activity Type</label>
              <div class="grid grid-cols-3 gap-2" id="pv-act-types">
                ${[
                  { v:'call',    l:'Call',    ic:'fa-phone'         },
                  { v:'email',   l:'Email',   ic:'fa-envelope'      },
                  { v:'meeting', l:'Meeting', ic:'fa-calendar'      },
                  { v:'note',    l:'Note',    ic:'fa-sticky-note'   },
                  { v:'task',    l:'Task',    ic:'fa-check-circle'  },
                ].map(t => `
                  <button onclick="this.closest('#pv-act-types').querySelectorAll('button').forEach(b=>b.classList.remove('ring-2','ring-blue-500','bg-blue-50','text-blue-700'));this.classList.add('ring-2','ring-blue-500','bg-blue-50','text-blue-700');window._pvActType='${t.v}'"
                    class="flex flex-col items-center gap-1 p-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:border-blue-300 transition-colors">
                    <i class="fas ${t.ic} text-sm"></i>${t.l}
                  </button>`).join('')}
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
              <textarea id="pv-act-text" rows="3" placeholder="What happened?"
                class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
            </div>
            <div class="flex gap-3">
              <button onclick="document.getElementById('pv-modal').innerHTML=''" class="btn-secondary flex-1">Cancel</button>
              <button onclick="_pvSubmitActivity('${dealId}')" class="btn-primary flex-1"><i class="fas fa-save text-xs"></i> Log Activity</button>
            </div>
          </div>
        </div>
      </div>`;
    window._pvActType = 'note';
  }

  window._pvSubmitActivity = async function(dealId) {
    const text = document.getElementById('pv-act-text')?.value.trim();
    if (!text) { toast('Please add a description', 'warning'); return; }
    const type = window._pvActType || 'note';
    try {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) return;
      let events = [];
      try { events = JSON.parse(deal.timeline || '[]'); } catch(e) {}
      events.push({ type, text, user: currentUser.name || currentUser.email, at: new Date().toISOString() });
      await db.pipeline.updateDeal(dealId, {
        timeline: JSON.stringify(events),
        last_activity_at: new Date().toISOString()
      });
      deal.timeline = JSON.stringify(events);
      deal.last_activity_at = new Date().toISOString();
      document.getElementById('pv-modal').innerHTML = '';
      const tl = document.getElementById(`pv-timeline-${dealId}`);
      if (tl) tl.innerHTML = renderTimeline(deal);
      toast('Activity logged', 'success');
    } catch(e) { toast(e.message, 'error'); }
  };

  // ================================================================
  //  ADD / EDIT DEAL MODAL
  // ================================================================
  function _pvOpenAddModal(defaultStage) {
    const modal = document.getElementById('pv-modal') || (() => {
      const d = document.createElement('div');
      d.id = 'pv-modal';
      document.body.appendChild(d);
      return d;
    })();

    const stageOpts = STAGES.map(s => `<option value="${s.id}" ${s.id===defaultStage?'selected':''}>${s.label}</option>`).join('');
    const userOpts  = users.map(u => `<option value="${u.id}" ${u.id===currentUser.id?'selected':''}>${u.name||u.email}</option>`).join('');

    modal.innerHTML = `
      <div class="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
           onclick="if(event.target===this)document.getElementById('pv-modal').innerHTML=''">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <h3 class="font-bold text-slate-900">New Deal</h3>
            <button onclick="document.getElementById('pv-modal').innerHTML=''" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div class="p-5 space-y-4">
            <div id="pv-add-status"></div>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Deal Title <span class="text-red-500">*</span></label>
                <input id="pv-new-title" type="text" placeholder="e.g. Website Redesign — Acme Corp" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Company</label>
                <input id="pv-new-company" type="text" placeholder="Acme Corp" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Contact Name</label>
                <input id="pv-new-contact_name" type="text" placeholder="Jane Smith" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Contact Email</label>
                <input id="pv-new-contact_email" type="email" placeholder="jane@acme.com" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Deal Value ($)</label>
                <input id="pv-new-value" type="number" placeholder="0" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Stage</label>
                <select id="pv-new-stage" class="field text-sm">${stageOpts}</select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Expected Close</label>
                <input id="pv-new-expected_close" type="date" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Lead Source</label>
                <input id="pv-new-source" type="text" placeholder="Referral / Inbound / Cold" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Assigned To</label>
                <select id="pv-new-assigned_to" class="field text-sm">
                  <option value="">— Unassigned —</option>
                  ${userOpts}
                </select>
              </div>
            </div>
            <div class="flex gap-3 pt-1">
              <button onclick="document.getElementById('pv-modal').innerHTML=''" class="btn-secondary flex-1">Cancel</button>
              <button onclick="_pvSubmitAdd()" id="pv-add-btn" class="btn-primary flex-1"><i class="fas fa-plus text-xs"></i> Create Deal</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  window._pvSubmitAdd = async function() {
    const btn   = document.getElementById('pv-add-btn');
    const title = document.getElementById('pv-new-title')?.value.trim();
    const statusEl = document.getElementById('pv-add-status');

    if (!title) {
      statusEl.innerHTML = `<div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">Deal title is required.</div>`;
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Creating…'; }

    try {
      const row = {
        title,
        company:        document.getElementById('pv-new-company')?.value.trim()       || '',
        contact_name:   document.getElementById('pv-new-contact_name')?.value.trim()  || '',
        contact_email:  document.getElementById('pv-new-contact_email')?.value.trim() || '',
        value:          parseFloat(document.getElementById('pv-new-value')?.value)     || 0,
        stage:          document.getElementById('pv-new-stage')?.value                || 'lead',
        expected_close: document.getElementById('pv-new-expected_close')?.value       || null,
        source:         document.getElementById('pv-new-source')?.value.trim()        || '',
        assigned_to:    document.getElementById('pv-new-assigned_to')?.value          || null,
        created_by:     currentUser.id,
        timeline: JSON.stringify([{ type:'stage', text:`Deal created in ${document.getElementById('pv-new-stage')?.value || 'lead'}`, user: currentUser.name||currentUser.email, at: new Date().toISOString() }]),
        last_activity_at: new Date().toISOString(),
      };

      const created = await db.pipeline.createDeal(row);
      deals.unshift(created);
      document.getElementById('pv-modal').innerHTML = '';
      toast('Deal created!', 'success');
      render();

      // Auto-create CRM contact if CRM is installed
      _tryAutoIntegrations(created, 'create');
    } catch(e) {
      statusEl.innerHTML = `<div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">${e.message}</div>`;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus text-xs"></i> Create Deal'; }
    }
  };

  // ================================================================
  //  INTEGRATIONS
  // ================================================================
  async function _tryAutoIntegrations(deal, trigger) {
    const installed = (window.INSTALLED_MODULES || []).map(m => m.id);

    if (trigger === 'won') {
      if (installed.includes('notifications')) {
        try {
          await db.notifications.create({
            user_id: deal.assigned_to || currentUser.id,
            title:   '🏆 Deal Closed Won!',
            message: `"${deal.title}" was marked as Closed Won — ${fmt(deal.value)}`,
            type:    'pipeline',
            read:    false,
            created_at: new Date().toISOString(),
          });
        } catch(e) {}
      }
    }
  }

  window._pvIntegration = async function(type, dealId) {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const installed = (window.INSTALLED_MODULES || []).map(m => m.id);

    try {
      if (type === 'crm') {
        if (!installed.includes('crm')) { toast('CRM module not installed', 'warning'); return; }
        await db.crm.createContact({
          name:    deal.contact_name || deal.company || deal.title,
          email:   deal.contact_email || '',
          company: deal.company || '',
          source:  'Pipeline: ' + deal.title,
          created_at: new Date().toISOString(),
        });
        toast('CRM contact created!', 'success');
      } else if (type === 'invoice') {
        if (!installed.includes('invoices')) { toast('Invoice module not installed', 'warning'); return; }
        await db.invoices.create({
          client_name:  deal.contact_name || deal.company || '',
          client_email: deal.contact_email || '',
          amount:       deal.value || 0,
          status:       'Draft',
          deal_id:      deal.id,
          description:  'Invoice for: ' + deal.title,
          created_at:   new Date().toISOString(),
          due_date:     deal.expected_close || null,
        });
        toast('Invoice created (Draft)!', 'success');
      } else if (type === 'contract') {
        if (!installed.includes('contracts')) { toast('Contracts module not installed', 'warning'); return; }
        await db.contracts.create({
          title:       'Contract: ' + deal.title,
          client_name: deal.contact_name || deal.company || '',
          value:       deal.value || 0,
          status:      'Draft',
          start_date:  new Date().toISOString().split('T')[0],
          end_date:    deal.expected_close || null,
          deal_id:     deal.id,
          created_at:  new Date().toISOString(),
        });
        toast('Contract created (Draft)!', 'success');
      } else if (type === 'task') {
        if (!installed.includes('tasks')) { toast('Tasks module not installed', 'warning'); return; }
        await db.tasks.create({
          title:       'Follow up: ' + deal.title,
          assigned_to: deal.assigned_to || currentUser.id,
          due_date:    (() => { const d=new Date(); d.setDate(d.getDate()+2); return d.toISOString().split('T')[0]; })(),
          status:      'Pending',
          priority:    'High',
          deal_id:     deal.id,
          created_at:  new Date().toISOString(),
        });
        toast('Follow-up task created!', 'success');
      } else if (type === 'notify') {
        if (!installed.includes('notifications')) { toast('Notifications module not installed', 'warning'); return; }
        await db.notifications.create({
          user_id:    deal.assigned_to || currentUser.id,
          title:      'Deal Update: ' + deal.title,
          message:    `Pipeline deal "${deal.title}" needs attention.`,
          type:       'pipeline',
          read:       false,
          created_at: new Date().toISOString(),
        });
        toast('Notification sent!', 'success');
      }
    } catch(e) { toast(e.message, 'error'); }
  };

  // ================================================================
  //  CHANGE STAGE
  // ================================================================
  window._pvChangeStage = async function(dealId, newStage) {
    try {
      const deal     = deals.find(d => d.id === dealId);
      const oldStage = deal?.stage;
      if (!deal || oldStage === newStage) return;

      let events = [];
      try { events = JSON.parse(deal.timeline || '[]'); } catch(e) {}
      events.push({
        type: 'stage',
        text: `Stage changed: ${STAGE_MAP[oldStage]?.label || oldStage} → ${STAGE_MAP[newStage]?.label || newStage}`,
        user: currentUser.name || currentUser.email,
        at:   new Date().toISOString(),
      });

      await db.pipeline.updateDeal(dealId, {
        stage:            newStage,
        timeline:         JSON.stringify(events),
        last_activity_at: new Date().toISOString(),
      });

      deal.stage            = newStage;
      deal.timeline         = JSON.stringify(events);
      deal.last_activity_at = new Date().toISOString();

      // Auto integrations on close
      if (newStage === 'closed_won') {
        _tryAutoIntegrations(deal, 'won');
      }

      toast(`Moved to ${STAGE_MAP[newStage]?.label || newStage}`, 'success');

      // Re-render panel if open
      if (openDealId === dealId) {
        const panel = document.getElementById('pv-panel');
        if (panel) panel.innerHTML = renderDealPanel(deal);
      }
      render();
    } catch(e) { toast(e.message, 'error'); }
  };

  // ================================================================
  //  SAVE DEAL DETAILS
  // ================================================================
  window._pvSaveDeal = async function(dealId) {
    const btn  = document.getElementById('pv-save-btn');
    const form = document.getElementById('pv-detail-form');
    if (!form) return;

    const patch = {};
    form.querySelectorAll('[data-field]').forEach(el => {
      const key = el.dataset.field;
      const val = el.value;
      patch[key] = (el.type === 'number' && val !== '') ? parseFloat(val) : (val || null);
    });

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i>'; }
    try {
      await db.pipeline.updateDeal(dealId, patch);
      const deal = deals.find(d => d.id === dealId);
      if (deal) Object.assign(deal, patch);
      toast('Deal saved!', 'success');
      render();
    } catch(e) {
      toast(e.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save text-[10px]"></i> Save'; }
  };

  window._pvSaveNotes = async function(dealId) {
    const val = document.getElementById(`pv-notes-${dealId}`)?.value || '';
    try {
      await db.pipeline.updateDeal(dealId, { notes: val });
      const deal = deals.find(d => d.id === dealId);
      if (deal) deal.notes = val;
      toast('Notes saved!', 'success');
    } catch(e) { toast(e.message, 'error'); }
  };

  // ================================================================
  //  DELETE
  // ================================================================
  window._pvConfirmDelete = function(dealId) {
    const deal = deals.find(d => d.id === dealId);
    if (!confirm(`Delete "${deal?.title || 'this deal'}"? This cannot be undone.`)) return;
    db.pipeline.deleteDeal(dealId)
      .then(() => {
        deals = deals.filter(d => d.id !== dealId);
        openDealId = null;
        toast('Deal deleted', 'success');
        render();
      })
      .catch(e => toast(e.message, 'error'));
  };

  // ================================================================
  //  DRAG & DROP
  // ================================================================
  function _initDrag() {}

  window._pvDragStart = function(event, dealId, stageId) {
    dragDealId = dealId;
    dragOrigin = stageId;
    event.dataTransfer.effectAllowed = 'move';
  };

  window._pvDrop = async function(event, targetStage) {
    event.preventDefault();
    if (!dragDealId || dragOrigin === targetStage) { dragDealId = null; return; }
    await window._pvChangeStage(dragDealId, targetStage);
    dragDealId = null;
    dragOrigin = null;
  };

  // ================================================================
  //  PANEL OPEN / CLOSE
  // ================================================================
  window._pvOpenDeal = function(dealId) {
    openDealId = dealId;
    render();
  };

  window._pvClosePanel = function() {
    openDealId = null;
    render();
  };

  window._pvPanelBackdrop = function(event) {
    if (event.target === document.getElementById('pv-panel-backdrop')) {
      openDealId = null;
      render();
    }
  };

  // ================================================================
  //  CONTROLS
  // ================================================================
  window._pvView          = function(v) { activeView = v; render(); };
  window._pvSearch        = function(v) { searchQ = v; render(); };
  window._pvFilter        = function(key) {
    if (key === 'filterMine')  filterMine  = !filterMine;
    if (key === 'filterHigh')  filterHigh  = !filterHigh;
    if (key === 'filterClose') filterClose = !filterClose;
    if (key === 'filterStuck') filterStuck = !filterStuck;
    render();
  };
  window._pvClearFilters  = function() { filterMine=filterHigh=filterClose=filterStuck=false; searchQ=''; render(); };
  window._pvOpenAdd       = function(stage) { _pvOpenAddModal(stage || 'lead'); };

  // ── Boot ────────────────────────────────────────────────────────
  container.innerHTML = `<div class="flex items-center justify-center h-64"><i class="fas fa-circle-notch fa-spin text-3xl text-blue-500 opacity-60"></i></div>`;
  load();
};
