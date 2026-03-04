// ================================================================
//  WORK VOLT — pages/crm.js
//  Full CRM module: Contacts, Leads, Deals Pipeline, Activities
// ================================================================
window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['crm'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  const state = {
    tab:         'dashboard',   // dashboard | contacts | leads | pipeline | activities
    contacts:    [],
    leads:       [],
    deals:       [],
    stages:      [],
    activities:  [],
    dashboard:   {},
    loading:     false,
    search:      '',
    filterStatus: '',
    filterStage:  '',
    filterOwner:  '',
    contactDetail: null,    // contact being viewed
    dealDetail:    null,
    modalType:     null,    // 'add-contact' | 'add-lead' | 'add-deal' | 'add-activity' | 'edit-contact' | 'edit-deal' | 'view-contact'
    editRecord:    null,
    dragDealId:    null,
    dragFromStage: null,
  };

  const PILL = {
    'Lead':      'bg-blue-100 text-blue-700',
    'Prospect':  'bg-indigo-100 text-indigo-700',
    'Customer':  'bg-green-100 text-green-700',
    'Churned':   'bg-red-100 text-red-700',
    'Partner':   'bg-purple-100 text-purple-700',
    'New':       'bg-slate-100 text-slate-600',
    'Contacted': 'bg-blue-100 text-blue-700',
    'Qualified': 'bg-indigo-100 text-indigo-700',
    'Proposal':  'bg-amber-100 text-amber-700',
    'Negotiation':'bg-orange-100 text-orange-700',
    'Won':       'bg-green-100 text-green-700',
    'Lost':      'bg-red-100 text-red-700',
  };

  const SCORE_COLOR = s => {
    s = parseFloat(s || 0);
    if (s >= 70) return 'text-green-600';
    if (s >= 40) return 'text-amber-500';
    return 'text-slate-400';
  };

  const fmt$ = v => '$' + (parseFloat(v)||0).toLocaleString(undefined,{maximumFractionDigits:0});

  // ── API helpers ────────────────────────────────────────────────
  const api = (path, params = {}) => window.apiCall ? apiCall(path, params) : Promise.resolve({ rows: [], error: 'not_connected' });

  // ── Load data ──────────────────────────────────────────────────
  async function loadAll() {
    state.loading = true; render();
    try {
      const [db, contacts, leads, deals, stages, acts] = await Promise.all([
        api('crm/dashboard'),
        api('crm/contacts/list'),
        api('crm/leads/list', { converted: 'false' }),
        api('crm/deals/list'),
        api('crm/stages/list'),
        api('crm/activities/list', { limit: '50' }),
      ]);
      state.dashboard  = db;
      state.contacts   = contacts.rows  || [];
      state.leads      = leads.rows     || [];
      state.deals      = deals.rows     || [];
      state.stages     = stages.rows    || defaultStages();
      state.activities = acts.rows      || [];
    } catch(e) {
      state.contacts = []; state.deals = []; state.leads = []; state.stages = defaultStages();
    }
    state.loading = false; render();
  }

  function defaultStages() {
    return [
      { id:'s1', name:'New',           order:'1', color:'#94a3b8', probability:'10' },
      { id:'s2', name:'Qualified',     order:'2', color:'#3b82f6', probability:'30' },
      { id:'s3', name:'Proposal Sent', order:'3', color:'#f59e0b', probability:'50' },
      { id:'s4', name:'Negotiation',   order:'4', color:'#f97316', probability:'70' },
      { id:'s5', name:'Won',           order:'5', color:'#10b981', probability:'100' },
      { id:'s6', name:'Lost',          order:'6', color:'#ef4444', probability:'0' },
    ];
  }

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-50 fade-in" style="min-height:0">

        <!-- Header -->
        <div class="bg-white border-b border-slate-200 px-6 py-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                <i class="fas fa-address-book text-white text-sm"></i>
              </div>
              <div>
                <h1 class="text-lg font-bold text-slate-800">CRM</h1>
                <p class="text-xs text-slate-400">Contacts · Leads · Pipeline · Activities</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              ${state.tab === 'contacts'  ? `<button onclick="crmAction('add-contact')"  class="btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Add Contact</button>` : ''}
              ${state.tab === 'leads'     ? `<button onclick="crmAction('add-lead')"     class="btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Add Lead</button>` : ''}
              ${state.tab === 'pipeline'  ? `<button onclick="crmAction('add-deal')"     class="btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Add Deal</button>` : ''}
              ${state.tab === 'activities'? `<button onclick="crmAction('add-activity')" class="btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Log Activity</button>` : ''}
              <button onclick="crmAction('refresh')" class="btn-ghost text-sm" title="Refresh"><i class="fas fa-sync-alt ${state.loading ? 'fa-spin' : ''}"></i></button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mt-4 border-b border-slate-100 -mb-4">
            ${['dashboard','contacts','leads','pipeline','activities'].map(t => `
              <button onclick="crmTab('${t}')"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  state.tab === t
                    ? 'border-pink-500 text-pink-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }">
                ${t === 'dashboard' ? '<i class="fas fa-th-large mr-1.5"></i>' :
                  t === 'contacts'  ? '<i class="fas fa-users mr-1.5"></i>' :
                  t === 'leads'     ? '<i class="fas fa-funnel-dollar mr-1.5"></i>' :
                  t === 'pipeline'  ? '<i class="fas fa-columns mr-1.5"></i>' :
                  '<i class="fas fa-history mr-1.5"></i>'}
                ${t.charAt(0).toUpperCase() + t.slice(1)}
              </button>`).join('')}
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6" id="crm-body">
          ${state.loading ? renderLoading() :
            state.tab === 'dashboard'   ? renderDashboard()  :
            state.tab === 'contacts'    ? renderContacts()   :
            state.tab === 'leads'       ? renderLeads()      :
            state.tab === 'pipeline'    ? renderPipeline()   :
            renderActivities()}
        </div>
      </div>

      ${state.modalType ? renderModal() : ''}
    `;

    attachStyles();
    if (state.tab === 'pipeline') attachDrag();
    if (state.modalType) attachModalHandlers();
  }

  // ── Dashboard ──────────────────────────────────────────────────
  function renderDashboard() {
    const d = state.dashboard;
    const kpis = [
      { label: 'Contacts',        value: d.contacts_total   || state.contacts.length || 0,   icon: 'fa-users',          color: 'from-blue-500 to-blue-600' },
      { label: 'Open Leads',      value: d.leads_open       || state.leads.length || 0,      icon: 'fa-bolt',           color: 'from-amber-400 to-orange-500' },
      { label: 'Open Deals',      value: d.deals_open       || 0,                            icon: 'fa-handshake',      color: 'from-indigo-500 to-purple-600' },
      { label: 'Pipeline Value',  value: fmt$(d.pipeline_value || 0),                        icon: 'fa-dollar-sign',    color: 'from-emerald-500 to-teal-600' },
      { label: 'Won Revenue',     value: fmt$(d.won_revenue || 0),                           icon: 'fa-trophy',         color: 'from-pink-500 to-rose-600' },
      { label: 'Conversion Rate', value: (d.conversion_rate || 0) + '%',                    icon: 'fa-chart-line',     color: 'from-cyan-500 to-blue-500' },
    ];

    // Build pipeline summary from live deals
    const stageMap = {};
    state.deals.filter(d => d.stage !== 'Won' && d.stage !== 'Lost').forEach(deal => {
      if (!stageMap[deal.stage]) stageMap[deal.stage] = { count: 0, value: 0 };
      stageMap[deal.stage].count++;
      stageMap[deal.stage].value += parseFloat(deal.value || 0);
    });

    return `
      <div class="max-w-6xl mx-auto space-y-6">

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          ${kpis.map(k => `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${k.color} flex items-center justify-center mb-3">
                <i class="fas ${k.icon} text-white text-xs"></i>
              </div>
              <p class="text-2xl font-bold text-slate-800">${k.value}</p>
              <p class="text-xs text-slate-500 mt-0.5">${k.label}</p>
            </div>`).join('')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <!-- Pipeline by Stage -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <i class="fas fa-columns text-pink-500 text-sm"></i> Pipeline by Stage
            </h3>
            ${state.stages.filter(s => s.name !== 'Lost').map(stage => {
              const info = stageMap[stage.name] || { count: 0, value: 0 };
              const total = Object.values(stageMap).reduce((s, v) => s + v.value, 0);
              const pct = total ? Math.round((info.value / total) * 100) : 0;
              return `
                <div class="mb-3">
                  <div class="flex justify-between text-xs mb-1">
                    <span class="font-medium text-slate-600">${stage.name}</span>
                    <span class="text-slate-500">${info.count} deal${info.count !== 1 ? 's' : ''} · ${fmt$(info.value)}</span>
                  </div>
                  <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${stage.color}"></div>
                  </div>
                </div>`;
            }).join('')}
            ${Object.keys(stageMap).length === 0 ? '<p class="text-sm text-slate-400 text-center py-4">No open deals yet</p>' : ''}
          </div>

          <!-- Recent Activities -->
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <i class="fas fa-history text-pink-500 text-sm"></i> Recent Activities
            </h3>
            <div class="space-y-3 max-h-64 overflow-y-auto">
              ${state.activities.slice(0, 10).map(a => `
                <div class="flex gap-3 items-start">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs
                    ${a.type==='Call'?'bg-blue-500':a.type==='Email'?'bg-pink-500':a.type==='Meeting'?'bg-purple-500':'bg-slate-400'}">
                    <i class="fas ${a.type==='Call'?'fa-phone':a.type==='Email'?'fa-envelope':a.type==='Meeting'?'fa-calendar-check':'fa-sticky-note'}"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-slate-700 truncate">${a.subject || a.type}</p>
                    <p class="text-xs text-slate-400">${a.body ? a.body.substring(0,60) + (a.body.length>60?'…':'') : ''}</p>
                  </div>
                  <span class="text-xs text-slate-400 flex-shrink-0">${fmtDate(a.created_at)}</span>
                </div>`).join('')}
              ${state.activities.length === 0 ? '<p class="text-sm text-slate-400 text-center py-4">No activities logged yet</p>' : ''}
            </div>
          </div>
        </div>

        <!-- Quick links -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${[
            { tab:'contacts',  icon:'fa-users',         label:'Manage Contacts',  color:'bg-blue-50 text-blue-600 border-blue-200'   },
            { tab:'leads',     icon:'fa-bolt',          label:'View Leads',       color:'bg-amber-50 text-amber-600 border-amber-200' },
            { tab:'pipeline',  icon:'fa-columns',       label:'Sales Pipeline',   color:'bg-purple-50 text-purple-600 border-purple-200' },
            { tab:'activities',icon:'fa-history',       label:'All Activities',   color:'bg-pink-50 text-pink-600 border-pink-200' },
          ].map(q => `
            <button onclick="crmTab('${q.tab}')"
              class="flex items-center gap-3 p-4 rounded-xl border ${q.color} text-left hover:opacity-80 transition-opacity">
              <i class="fas ${q.icon}"></i>
              <span class="text-sm font-medium">${q.label}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  // ── Contacts ───────────────────────────────────────────────────
  function renderContacts() {
    let rows = state.contacts;
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(r =>
        (r.name||'').toLowerCase().includes(q) ||
        (r.email||'').toLowerCase().includes(q) ||
        (r.company||'').toLowerCase().includes(q));
    }
    if (state.filterStatus) rows = rows.filter(r => r.status === state.filterStatus);

    return `
      <div class="max-w-6xl mx-auto">
        <!-- Toolbar -->
        <div class="flex flex-wrap gap-3 mb-5">
          <div class="relative flex-1 min-w-48">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input id="crm-search" type="text" placeholder="Search contacts…" value="${escHtml(state.search)}"
              oninput="crmSearch(this.value)"
              class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-300 focus:border-pink-400 outline-none bg-white">
          </div>
          <select onchange="crmFilter('status',this.value)" class="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-300">
            <option value="">All Statuses</option>
            ${['Lead','Prospect','Customer','Churned','Partner'].map(s => `<option value="${s}" ${state.filterStatus===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <span class="text-sm text-slate-500 self-center">${rows.length} contact${rows.length!==1?'s':''}</span>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Company</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Email</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Score</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(c => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onclick="crmViewContact('${c.id}')">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        ${(c.name||'?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p class="font-medium text-slate-800 text-sm">${escHtml(c.name)}</p>
                        <p class="text-xs text-slate-400">${escHtml(c.job_title||'')}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">${escHtml(c.company||'—')}</td>
                  <td class="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">${escHtml(c.email||'—')}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${PILL[c.status]||'bg-slate-100 text-slate-600'}">${c.status||'—'}</span>
                  </td>
                  <td class="px-4 py-3 hidden md:table-cell">
                    <span class="text-sm font-bold ${SCORE_COLOR(c.lead_score)}">${c.lead_score||0}</span>
                  </td>
                  <td class="px-4 py-3 text-right" onclick="event.stopPropagation()">
                    <button onclick="crmEditContact('${c.id}')" class="text-slate-400 hover:text-slate-600 mr-2 text-xs"><i class="fas fa-edit"></i></button>
                    <button onclick="crmDeleteContact('${c.id}')" class="text-slate-400 hover:text-red-500 text-xs"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>`).join('') : `
                <tr><td colspan="6" class="px-4 py-12 text-center text-slate-400 text-sm">
                  <i class="fas fa-users text-3xl mb-3 block opacity-30"></i>
                  No contacts found. <button onclick="crmAction('add-contact')" class="text-pink-500 hover:underline">Add your first contact</button>
                </td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Leads ──────────────────────────────────────────────────────
  function renderLeads() {
    let rows = state.leads;
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(r => (r.name||'').toLowerCase().includes(q) || (r.company||'').toLowerCase().includes(q));
    }
    if (state.filterStage) rows = rows.filter(r => r.stage === state.filterStage);

    return `
      <div class="max-w-6xl mx-auto">
        <div class="flex flex-wrap gap-3 mb-5">
          <div class="relative flex-1 min-w-48">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input type="text" placeholder="Search leads…" value="${escHtml(state.search)}"
              oninput="crmSearch(this.value)"
              class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-300 focus:border-pink-400 outline-none bg-white">
          </div>
          <select onchange="crmFilter('stage',this.value)" class="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-300">
            <option value="">All Stages</option>
            ${['New','Contacted','Qualified','Proposal','Negotiation'].map(s => `<option value="${s}" ${state.filterStage===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <span class="text-sm text-slate-500 self-center">${rows.length} lead${rows.length!==1?'s':''}</span>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Company</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Value</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(l => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        ${(l.name||'?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p class="font-medium text-slate-800 text-sm">${escHtml(l.name)}</p>
                        <p class="text-xs text-slate-400">${escHtml(l.source||'')}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">${escHtml(l.company||'—')}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${PILL[l.stage]||'bg-slate-100 text-slate-600'}">${l.stage||'New'}</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${parseFloat(l.lead_score||0)>=70?'bg-green-500':parseFloat(l.lead_score||0)>=40?'bg-amber-400':'bg-slate-300'}"
                          style="width:${Math.min(l.lead_score||0,100)}%"></div>
                      </div>
                      <span class="text-xs font-bold ${SCORE_COLOR(l.lead_score)}">${l.lead_score||0}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">${l.deal_value ? fmt$(l.deal_value) : '—'}</td>
                  <td class="px-4 py-3 text-right">
                    <button onclick="crmConvertLead('${l.id}')" title="Convert to Contact+Deal"
                      class="text-xs text-indigo-500 hover:text-indigo-700 mr-2 font-medium">Convert</button>
                    <button onclick="crmDeleteLead('${l.id}')" class="text-slate-400 hover:text-red-500 text-xs"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>`).join('') : `
                <tr><td colspan="6" class="px-4 py-12 text-center text-slate-400 text-sm">
                  <i class="fas fa-bolt text-3xl mb-3 block opacity-30"></i>
                  No leads yet. <button onclick="crmAction('add-lead')" class="text-pink-500 hover:underline">Capture your first lead</button>
                </td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Pipeline (Kanban) ──────────────────────────────────────────
  function renderPipeline() {
    const stages = state.stages.sort((a,b) => parseInt(a.order||0) - parseInt(b.order||0));

    return `
      <div class="max-w-full">
        <!-- Search + stats bar -->
        <div class="flex flex-wrap gap-3 mb-5">
          <div class="relative min-w-48">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input type="text" placeholder="Search deals…" value="${escHtml(state.search)}"
              oninput="crmSearch(this.value)"
              class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-300 focus:border-pink-400 outline-none bg-white">
          </div>
          <div class="flex items-center gap-4 text-sm text-slate-600">
            <span><strong>${state.deals.filter(d=>d.stage!=='Won'&&d.stage!=='Lost').length}</strong> open deals</span>
            <span><strong class="text-emerald-600">${fmt$(state.deals.filter(d=>d.stage!=='Won'&&d.stage!=='Lost').reduce((s,d)=>s+parseFloat(d.value||0),0))}</strong> pipeline</span>
          </div>
        </div>

        <!-- Kanban board -->
        <div class="flex gap-4 overflow-x-auto pb-4" id="crm-board" style="min-height:500px">
          ${stages.map(stage => {
            let deals = state.deals.filter(d => d.stage === stage.name);
            if (state.search) {
              const q = state.search.toLowerCase();
              deals = deals.filter(d => (d.deal_name||'').toLowerCase().includes(q) || (d.company||'').toLowerCase().includes(q));
            }
            const stageValue = deals.reduce((s,d) => s + parseFloat(d.value||0), 0);

            return `
              <div class="crm-stage flex-shrink-0 w-72 flex flex-col rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50"
                data-stage="${escHtml(stage.name)}"
                ondragover="event.preventDefault()"
                ondrop="crmDrop('${escHtml(stage.name)}')">

                <!-- Stage header -->
                <div class="px-3 py-3 flex items-center justify-between border-b border-slate-200"
                  style="background: ${stage.color}18; border-top: 3px solid ${stage.color}">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${stage.color}"></span>
                    <span class="text-sm font-semibold text-slate-700">${escHtml(stage.name)}</span>
                    <span class="text-xs bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-slate-500">${deals.length}</span>
                  </div>
                  <span class="text-xs font-medium text-slate-500">${fmt$(stageValue)}</span>
                </div>

                <!-- Cards -->
                <div class="flex-1 p-2 space-y-2 overflow-y-auto crm-cards" style="max-height:520px">
                  ${deals.map(deal => `
                    <div class="crm-deal-card bg-white rounded-lg border border-slate-200 p-3 cursor-grab shadow-sm hover:shadow-md transition-shadow"
                      draggable="true"
                      ondragstart="crmDragStart('${deal.id}','${escHtml(stage.name)}')"
                      ondragend="crmDragEnd()"
                      onclick="crmViewDeal('${deal.id}')">
                      <p class="font-medium text-slate-800 text-sm mb-1">${escHtml(deal.deal_name)}</p>
                      ${deal.contact_name ? `<p class="text-xs text-slate-500 mb-1"><i class="fas fa-user w-3"></i> ${escHtml(deal.contact_name)}</p>` : ''}
                      ${deal.company ? `<p class="text-xs text-slate-500 mb-2"><i class="fas fa-building w-3"></i> ${escHtml(deal.company)}</p>` : ''}
                      <div class="flex items-center justify-between mt-2">
                        <span class="text-sm font-bold text-slate-700">${fmt$(deal.value)}</span>
                        <div class="flex items-center gap-1">
                          <div class="w-14 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full bg-emerald-400 rounded-full" style="width:${deal.probability||0}%"></div>
                          </div>
                          <span class="text-xs text-slate-400">${deal.probability||0}%</span>
                        </div>
                      </div>
                      ${deal.expected_close ? `<p class="text-xs text-slate-400 mt-1.5"><i class="fas fa-calendar-alt mr-1"></i>${deal.expected_close}</p>` : ''}
                    </div>`).join('')}

                  <!-- Drop zone placeholder -->
                  <div class="crm-drop-placeholder border-2 border-dashed border-slate-300 rounded-lg p-3 text-center text-xs text-slate-400 hidden">
                    Drop here
                  </div>
                  ${deals.length === 0 ? `
                    <div class="p-4 text-center text-xs text-slate-400">
                      <i class="fas fa-inbox text-xl mb-2 block opacity-30"></i>
                      No deals
                    </div>` : ''}
                </div>

                <!-- Add deal to stage -->
                <div class="p-2 border-t border-slate-200">
                  <button onclick="crmAddDealToStage('${escHtml(stage.name)}')"
                    class="w-full text-xs text-slate-500 hover:text-pink-500 hover:bg-pink-50 py-1.5 rounded-lg transition-colors">
                    <i class="fas fa-plus mr-1"></i> Add deal
                  </button>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Activities ─────────────────────────────────────────────────
  function renderActivities() {
    let rows = state.activities;
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(r => (r.subject||'').toLowerCase().includes(q) || (r.body||'').toLowerCase().includes(q));
    }

    const typeIcon = { Call:'fa-phone', Email:'fa-envelope', Meeting:'fa-calendar-check', Note:'fa-sticky-note', Task:'fa-check-square', Demo:'fa-desktop' };
    const typeColor = { Call:'bg-blue-500', Email:'bg-pink-500', Meeting:'bg-purple-500', Note:'bg-slate-400', Task:'bg-amber-500', Demo:'bg-cyan-500' };

    return `
      <div class="max-w-3xl mx-auto">
        <div class="flex gap-3 mb-5">
          <div class="relative flex-1">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input type="text" placeholder="Search activities…" value="${escHtml(state.search)}"
              oninput="crmSearch(this.value)"
              class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-300 focus:border-pink-400 outline-none bg-white">
          </div>
          <span class="text-sm text-slate-500 self-center">${rows.length} activit${rows.length!==1?'ies':'y'}</span>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          ${rows.length ? rows.map(a => `
            <div class="flex gap-4 p-4 hover:bg-slate-50 transition-colors">
              <div class="w-9 h-9 rounded-full ${typeColor[a.type]||'bg-slate-400'} flex items-center justify-center flex-shrink-0 text-white text-xs">
                <i class="fas ${typeIcon[a.type]||'fa-circle'}"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-slate-700 text-sm">${escHtml(a.subject||a.type)}</p>
                  <span class="text-xs text-slate-400 flex-shrink-0">${fmtDate(a.created_at)}</span>
                </div>
                ${a.body ? `<p class="text-sm text-slate-500 mt-0.5">${escHtml(a.body)}</p>` : ''}
                <div class="flex gap-3 mt-1 text-xs text-slate-400">
                  <span class="font-medium text-slate-500">${a.type}</span>
                  ${a.outcome ? `<span>· ${escHtml(a.outcome)}</span>` : ''}
                </div>
              </div>
            </div>`).join('') : `
            <div class="p-12 text-center text-slate-400 text-sm">
              <i class="fas fa-history text-3xl mb-3 block opacity-30"></i>
              No activities logged. <button onclick="crmAction('add-activity')" class="text-pink-500 hover:underline">Log your first activity</button>
            </div>`}
        </div>
      </div>`;
  }

  // ── Modals ─────────────────────────────────────────────────────
  function renderModal() {
    const t = state.modalType;
    const r = state.editRecord || {};

    let title = '', body = '';

    if (t === 'add-contact' || t === 'edit-contact') {
      title = t === 'edit-contact' ? 'Edit Contact' : 'Add Contact';
      body = `
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="form-label">Full Name *</label><input name="name" value="${escHtml(r.name||'')}" class="form-input" placeholder="Jane Smith" required></div>
          <div><label class="form-label">Email</label><input name="email" type="email" value="${escHtml(r.email||'')}" class="form-input" placeholder="jane@company.com"></div>
          <div><label class="form-label">Phone</label><input name="phone" value="${escHtml(r.phone||'')}" class="form-input" placeholder="+1 555 0000"></div>
          <div><label class="form-label">Company</label><input name="company" value="${escHtml(r.company||'')}" class="form-input" placeholder="Acme Corp"></div>
          <div><label class="form-label">Job Title</label><input name="job_title" value="${escHtml(r.job_title||'')}" class="form-input" placeholder="CEO"></div>
          <div><label class="form-label">Status</label>
            <select name="status" class="form-input">
              ${['Lead','Prospect','Customer','Churned','Partner'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Source</label>
            <select name="source" class="form-input">
              <option value="">—</option>
              ${['Website','Referral','Social','Cold Outreach','Event','Inbound','Other'].map(s=>`<option ${r.source===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2"><label class="form-label">Notes</label><textarea name="notes" rows="2" class="form-input resize-none" placeholder="Any notes…">${escHtml(r.notes||'')}</textarea></div>
        </div>`;
    }

    if (t === 'add-lead') {
      title = 'Add Lead';
      body = `
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="form-label">Name *</label><input name="name" class="form-input" placeholder="John Doe" required></div>
          <div><label class="form-label">Email</label><input name="email" type="email" class="form-input"></div>
          <div><label class="form-label">Phone</label><input name="phone" class="form-input"></div>
          <div><label class="form-label">Company</label><input name="company" class="form-input"></div>
          <div><label class="form-label">Job Title</label><input name="job_title" class="form-input"></div>
          <div><label class="form-label">Stage</label>
            <select name="stage" class="form-input">
              ${['New','Contacted','Qualified','Proposal','Negotiation'].map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Source</label>
            <select name="source" class="form-input">
              <option value="">—</option>
              ${['Website','Referral','Social','Cold Outreach','Event','Inbound','Other'].map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Deal Value ($)</label><input name="deal_value" type="number" class="form-input" placeholder="0"></div>
          <div><label class="form-label">Notes</label><textarea name="notes" rows="2" class="form-input resize-none col-span-2"></textarea></div>
        </div>`;
    }

    if (t === 'add-deal') {
      title = 'Add Deal';
      const stageDefault = state.pipelineStageForNew || 'New';
      body = `
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="form-label">Deal Name *</label><input name="deal_name" class="form-input" placeholder="Acme Corp — Q3 Contract" required></div>
          <div><label class="form-label">Contact Name</label><input name="contact_name" class="form-input" placeholder="Jane Smith"></div>
          <div><label class="form-label">Company</label><input name="company" class="form-input" placeholder="Acme Corp"></div>
          <div><label class="form-label">Stage</label>
            <select name="stage" class="form-input">
              ${state.stages.map(s=>`<option ${s.name===stageDefault?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Value ($)</label><input name="value" type="number" class="form-input" placeholder="0"></div>
          <div><label class="form-label">Probability (%)</label><input name="probability" type="number" min="0" max="100" class="form-input" placeholder="10"></div>
          <div><label class="form-label">Expected Close</label><input name="expected_close" type="date" class="form-input"></div>
          <div class="col-span-2"><label class="form-label">Description</label><textarea name="description" rows="2" class="form-input resize-none"></textarea></div>
        </div>`;
    }

    if (t === 'add-activity') {
      title = 'Log Activity';
      body = `
        <div class="grid grid-cols-2 gap-3">
          <div><label class="form-label">Type</label>
            <select name="type" class="form-input">
              ${['Call','Email','Meeting','Note','Task','Demo'].map(s=>`<option>${s}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Subject *</label><input name="subject" class="form-input" placeholder="Follow-up call" required></div>
          <div class="col-span-2"><label class="form-label">Notes / Body</label><textarea name="body" rows="3" class="form-input resize-none" placeholder="What was discussed…"></textarea></div>
          <div><label class="form-label">Outcome</label><input name="outcome" class="form-input" placeholder="Positive / No answer…"></div>
          <div><label class="form-label">Date</label><input name="scheduled_at" type="date" class="form-input"></div>
        </div>`;
    }

    if (t === 'view-contact') {
      const c = state.contactDetail || {};
      const cActivities = state.activities.filter(a => a.contact_id === c.id);
      const cDeals = state.deals.filter(d => d.contact_id === c.id);
      title = escHtml(c.name || 'Contact');
      body = `
        <div class="space-y-4">
          <!-- Info -->
          <div class="grid grid-cols-2 gap-3 text-sm">
            ${c.email    ? `<div><span class="text-slate-400 text-xs">Email</span><p class="font-medium">${escHtml(c.email)}</p></div>` : ''}
            ${c.phone    ? `<div><span class="text-slate-400 text-xs">Phone</span><p class="font-medium">${escHtml(c.phone)}</p></div>` : ''}
            ${c.company  ? `<div><span class="text-slate-400 text-xs">Company</span><p class="font-medium">${escHtml(c.company)}</p></div>` : ''}
            ${c.job_title? `<div><span class="text-slate-400 text-xs">Title</span><p class="font-medium">${escHtml(c.job_title)}</p></div>` : ''}
            <div><span class="text-slate-400 text-xs">Status</span>
              <p><span class="px-2 py-0.5 rounded-full text-xs font-medium ${PILL[c.status]||'bg-slate-100 text-slate-600'}">${c.status||'—'}</span></p>
            </div>
            <div><span class="text-slate-400 text-xs">Lead Score</span>
              <p class="font-bold ${SCORE_COLOR(c.lead_score)}">${c.lead_score||0} / 100</p>
            </div>
          </div>
          ${c.notes ? `<div class="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">${escHtml(c.notes)}</div>` : ''}

          <!-- Deals -->
          ${cDeals.length ? `
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Deals (${cDeals.length})</p>
              ${cDeals.map(d=>`
                <div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
                  <span class="font-medium text-slate-700">${escHtml(d.deal_name)}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs ${PILL[d.stage]||'bg-slate-100 text-slate-600'} px-2 py-0.5 rounded-full">${d.stage}</span>
                    <span class="font-bold text-slate-700">${fmt$(d.value)}</span>
                  </div>
                </div>`).join('')}
            </div>` : ''}

          <!-- Activity timeline -->
          ${cActivities.length ? `
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Activity (${cActivities.length})</p>
              <div class="space-y-2 max-h-40 overflow-y-auto">
                ${cActivities.map(a=>`
                  <div class="flex gap-2 text-sm">
                    <span class="text-slate-400 text-xs mt-0.5 w-16 flex-shrink-0">${fmtDate(a.created_at)}</span>
                    <span class="font-medium text-slate-500">${a.type}</span>
                    <span class="text-slate-600">${escHtml(a.subject||'')}</span>
                  </div>`).join('')}
              </div>
            </div>` : ''}
        </div>`;
    }

    if (t === 'view-deal') {
      const d = state.dealDetail || {};
      title = escHtml(d.deal_name || 'Deal');
      body = `
        <div class="space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div><span class="text-slate-400 text-xs">Contact</span><p class="font-medium">${escHtml(d.contact_name||'—')}</p></div>
            <div><span class="text-slate-400 text-xs">Company</span><p class="font-medium">${escHtml(d.company||'—')}</p></div>
            <div><span class="text-slate-400 text-xs">Stage</span>
              <p><span class="px-2 py-0.5 rounded-full text-xs font-medium ${PILL[d.stage]||'bg-slate-100 text-slate-600'}">${d.stage}</span></p>
            </div>
            <div><span class="text-slate-400 text-xs">Value</span><p class="font-bold text-slate-800 text-lg">${fmt$(d.value)}</p></div>
            <div><span class="text-slate-400 text-xs">Probability</span><p class="font-medium">${d.probability||0}%</p></div>
            <div><span class="text-slate-400 text-xs">Expected Close</span><p class="font-medium">${d.expected_close||'—'}</p></div>
          </div>
          ${d.description ? `<div class="bg-slate-50 rounded-lg p-3 text-slate-600">${escHtml(d.description)}</div>` : ''}
          <div class="flex gap-2 pt-2">
            <button onclick="crmDeleteDeal('${d.id}'); crmCloseModal();" class="btn-danger text-xs flex-1">Delete Deal</button>
          </div>
        </div>`;
    }

    return `
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick="crmCloseModal()">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 class="font-bold text-slate-800">${title}</h2>
            <button onclick="crmCloseModal()" class="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <form id="crm-form" class="px-6 py-5" onsubmit="crmSubmitForm(event)">
            ${body}
            ${t !== 'view-contact' && t !== 'view-deal' ? `
              <div class="flex gap-3 mt-5 pt-4 border-t border-slate-100">
                <button type="button" onclick="crmCloseModal()" class="btn-ghost flex-1">Cancel</button>
                <button type="submit" class="btn-primary flex-1">
                  ${t.startsWith('edit') ? 'Save Changes' : 'Create'}
                </button>
              </div>` : ''}
          </form>
        </div>
      </div>`;
  }

  // ── Loading ────────────────────────────────────────────────────
  function renderLoading() {
    return `<div class="flex items-center justify-center h-64">
      <i class="fas fa-circle-notch fa-spin text-3xl text-pink-400 opacity-60"></i>
    </div>`;
  }

  // ── Event Handlers ─────────────────────────────────────────────
  window.crmTab = (tab) => { state.tab = tab; state.search = ''; state.filterStatus = ''; state.filterStage = ''; render(); };
  window.crmSearch = (v) => { state.search = v; render(); };
  window.crmFilter = (key, v) => {
    if (key === 'status') state.filterStatus = v;
    if (key === 'stage')  state.filterStage  = v;
    render();
  };

  window.crmAction = (type) => {
    state.modalType = type; state.editRecord = null; state.pipelineStageForNew = null;
    render();
  };

  window.crmAddDealToStage = (stageName) => {
    state.pipelineStageForNew = stageName;
    state.modalType = 'add-deal';
    render();
  };

  window.crmCloseModal = () => { state.modalType = null; state.editRecord = null; state.contactDetail = null; state.dealDetail = null; render(); };

  window.crmViewContact = (id) => {
    const c = state.contacts.find(x => x.id === id);
    if (c) { state.contactDetail = c; state.modalType = 'view-contact'; render(); }
  };

  window.crmEditContact = (id) => {
    const c = state.contacts.find(x => x.id === id);
    if (c) { state.editRecord = c; state.modalType = 'edit-contact'; render(); }
  };

  window.crmViewDeal = (id) => {
    const d = state.deals.find(x => x.id === id);
    if (d) { state.dealDetail = d; state.modalType = 'view-deal'; render(); }
  };

  window.crmDeleteContact = async (id) => {
    if (!confirm('Delete this contact?')) return;
    await api('crm/contacts/delete', { id });
    state.contacts = state.contacts.filter(c => c.id !== id);
    render();
  };

  window.crmDeleteLead = async (id) => {
    if (!confirm('Delete this lead?')) return;
    await api('crm/leads/delete', { id });
    state.leads = state.leads.filter(l => l.id !== id);
    render();
  };

  window.crmDeleteDeal = async (id) => {
    if (!confirm('Delete this deal?')) return;
    await api('crm/deals/delete', { id });
    state.deals = state.deals.filter(d => d.id !== id);
  };

  window.crmConvertLead = async (id) => {
    if (!confirm('Convert this lead to a contact + deal?')) return;
    const user = window.currentUser || {};
    const res = await api('crm/leads/convert', { id, converted_by: user.user_id||'' });
    if (res.converted) {
      showToast('Lead converted successfully!', 'success');
      loadAll();
    }
  };

  window.crmSubmitForm = async (e) => {
    e.preventDefault();
    const form = document.getElementById('crm-form');
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    const user = window.currentUser || {};
    data.created_by = user.user_id || '';

    const t = state.modalType;
    try {
      let res;
      if (t === 'add-contact')  res = await api('crm/contacts/create', data);
      if (t === 'edit-contact') res = await api('crm/contacts/update', { ...data, id: state.editRecord.id });
      if (t === 'add-lead')     res = await api('crm/leads/create',    data);
      if (t === 'add-deal')     res = await api('crm/deals/create',    data);
      if (t === 'add-activity') res = await api('crm/activities/create', data);

      if (res && !res.error) {
        showToast('Saved!', 'success');
        state.modalType = null;
        loadAll();
      } else {
        showToast(res?.error || 'Error saving', 'error');
      }
    } catch(err) {
      showToast('Error saving record', 'error');
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────────
  window.crmDragStart = (id, stage) => {
    state.dragDealId = id; state.dragFromStage = stage;
    document.querySelectorAll('.crm-drop-placeholder').forEach(el => el.classList.remove('hidden'));
  };

  window.crmDragEnd = () => {
    document.querySelectorAll('.crm-drop-placeholder').forEach(el => el.classList.add('hidden'));
  };

  window.crmDrop = async (toStage) => {
    if (!state.dragDealId || state.dragFromStage === toStage) return;
    const deal = state.deals.find(d => d.id === state.dragDealId);
    if (!deal) return;

    // Optimistic update
    deal.stage = toStage;
    const stageObj = state.stages.find(s => s.name === toStage);
    if (stageObj) deal.probability = stageObj.probability || deal.probability;
    state.dragDealId = null; state.dragFromStage = null;
    render();

    // Persist
    const user = window.currentUser || {};
    await api('crm/deals/update', { id: deal.id, stage: toStage, probability: deal.probability, updated_by: user.user_id || '' });
  };

  function attachDrag() {
    document.querySelectorAll('.crm-stage').forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        col.querySelector('.crm-drop-placeholder')?.classList.remove('hidden');
      });
      col.addEventListener('dragleave', () => {
        col.querySelector('.crm-drop-placeholder')?.classList.add('hidden');
      });
    });
  }

  function attachModalHandlers() {
    setTimeout(() => {
      const first = document.querySelector('#crm-form input, #crm-form select, #crm-form textarea');
      if (first) first.focus();
    }, 50);
  }

  // ── Styles ─────────────────────────────────────────────────────
  function attachStyles() {
    if (document.getElementById('crm-styles')) return;
    const style = document.createElement('style');
    style.id = 'crm-styles';
    style.textContent = `
      .btn-primary { background: linear-gradient(135deg,#ec4899,#f43f5e); color:#fff; border:none; padding:0.45rem 1rem; border-radius:0.5rem; font-size:0.85rem; font-weight:600; cursor:pointer; transition:opacity .15s; }
      .btn-primary:hover { opacity:.88; }
      .btn-ghost   { background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; padding:0.45rem 1rem; border-radius:0.5rem; font-size:0.85rem; font-weight:500; cursor:pointer; transition:background .15s; }
      .btn-ghost:hover   { background:#e2e8f0; }
      .btn-danger  { background:#fee2e2; color:#dc2626; border:none; padding:0.45rem 1rem; border-radius:0.5rem; font-size:0.85rem; font-weight:600; cursor:pointer; }
      .btn-danger:hover { background:#fecaca; }
      .form-label  { display:block; font-size:0.75rem; font-weight:600; color:#64748b; margin-bottom:0.3rem; text-transform:uppercase; letter-spacing:.03em; }
      .form-input  { display:block; width:100%; padding:0.45rem 0.65rem; border:1px solid #e2e8f0; border-radius:0.5rem; font-size:0.875rem; color:#1e293b; background:#fff; outline:none; box-sizing:border-box; transition:border-color .15s, box-shadow .15s; }
      .form-input:focus { border-color:#f472b6; box-shadow:0 0 0 3px rgba(244,114,182,.15); }
      .crm-deal-card:active { opacity:.8; transform:scale(.98); }
      .fade-in { animation: fadeIn .2s ease; }
      @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
    `;
    document.head.appendChild(style);
  }

  // ── Utility ────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d)) return iso.substring(0,10);
      const diff = Date.now() - d.getTime();
      if (diff < 60000)    return 'just now';
      if (diff < 3600000)  return Math.floor(diff/60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
      if (diff < 604800000)return Math.floor(diff/86400000) + 'd ago';
      return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
    } catch(e) { return iso.substring(0,10); }
  }

  function showToast(msg, type) {
    const tc = document.getElementById('toast-container');
    if (!tc) return;
    const el = document.createElement('div');
    el.className = `px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white mb-2 transition-all ${type==='success'?'bg-emerald-500':'bg-red-500'}`;
    el.textContent = msg;
    tc.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ── Boot ───────────────────────────────────────────────────────
  render();
  loadAll();
};
