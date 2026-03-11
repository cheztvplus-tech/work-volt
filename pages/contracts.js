// pages/contracts.js — Work Volt Contract Hub (Full v2)
(function() {
'use strict';

// ── Helpers ───────────────────────────────────────────────────
const api  = (path, p) => window.WorkVolt.api('contracts/' + path, p);
const toast = (m,t)    => window.WorkVolt.toast(m, t || 'info');
const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt   = v => v ? new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtCurrency = (v,c='USD') => v ? new Intl.NumberFormat('en-US',{style:'currency',currency:c,minimumFractionDigits:0}).format(v) : '—';
const daysUntil = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;

const STATUS_CONFIG = {
  'Draft':        { bg:'bg-slate-100',   text:'text-slate-600',  dot:'bg-slate-400' },
  'Under Review': { bg:'bg-amber-50',    text:'text-amber-700',  dot:'bg-amber-400' },
  'Negotiation':  { bg:'bg-orange-50',   text:'text-orange-700', dot:'bg-orange-400' },
  'Approval':     { bg:'bg-violet-50',   text:'text-violet-700', dot:'bg-violet-500' },
  'Signed':       { bg:'bg-blue-50',     text:'text-blue-700',   dot:'bg-blue-500' },
  'Active':       { bg:'bg-emerald-50',  text:'text-emerald-700',dot:'bg-emerald-500' },
  'Expired':      { bg:'bg-red-50',      text:'text-red-600',    dot:'bg-red-400' },
  'Terminated':   { bg:'bg-rose-100',    text:'text-rose-700',   dot:'bg-rose-500' },
  'Archived':     { bg:'bg-gray-100',    text:'text-gray-500',   dot:'bg-gray-400' },
};

const LIFECYCLE = ['Draft','Under Review','Negotiation','Approval','Signed','Active','Expired','Terminated','Archived'];

const CLAUSE_TYPES   = ['Payment Terms','Termination','Liability','Confidentiality','SLA','Renewal','Warranty','Indemnification','Force Majeure','Other'];
const DOC_TYPES      = ['Draft','Final Contract','Amendment','Annex','Termination Letter','NDA','Addendum'];
const RENEWAL_TYPES  = ['Auto Renewal','Manual Renewal','Negotiation','Termination'];
const FREQUENCIES    = ['One Time','Monthly','Quarterly','Semi-Annual','Annual','Milestone Based'];
const CATEGORIES     = ['Vendor','Client','Employment','Lease','NDA','Service Agreement','Partnership','License'];
const CURRENCIES     = ['USD','CAD','EUR','GBP','AUD','SGD','INR','AED'];
const PARTY_TYPES    = ['Company','Individual','Government','NGO','Partnership'];
const DEPARTMENTS    = ['Legal','HR','Finance','Sales','IT','Operations','Marketing','Procurement','Executive'];
const LINKED_MODULES = ['None','hr','finance','assets','projects','crm'];

// ── State ─────────────────────────────────────────────────────
let state = {
  view: 'dashboard',  // dashboard | list | detail | parties | approvals | renewals | versions
  contracts: [], types: [], parties: [], documents: [], clauses: [],
  milestones: [], renewals: [], financials: [], approvals: [], versions: [],
  dashboard: null, alerts: null,
  selectedId: null,
  loading: false,
  filter: { status:'', category:'', search:'' },
  listTab: 'all',  // all | active | expiring | draft
};

let container;

// ── Boot ──────────────────────────────────────────────────────
async function init(el) {
  container = el;
  render();
  await loadDashboard();
  await loadContracts();
  await loadAlerts();
  render();
}

async function loadDashboard() {
  try { state.dashboard = await api('dashboard'); } catch(e) {}
}
async function loadContracts() {
  try {
    const d = await api('list');
    state.contracts = d.rows || [];
  } catch(e) { state.contracts = []; }
}
async function loadAlerts() {
  try { state.alerts = await api('alerts'); } catch(e) {}
}
async function loadParties() {
  try { const d = await api('parties/list'); state.parties = d.rows || []; } catch(e) {}
}
async function loadDocuments(cid) {
  try { const d = await api('documents/list',{contract_id:cid}); state.documents = d.rows || []; } catch(e) {}
}
async function loadClauses(cid) {
  try { const d = await api('clauses/list',{contract_id:cid}); state.clauses = d.rows || []; } catch(e) {}
}
async function loadMilestones(cid) {
  try { const d = await api('milestones/list',{contract_id:cid}); state.milestones = d.rows || []; } catch(e) {}
}
async function loadRenewals(cid) {
  try { const d = await api(cid ? 'renewals/list' : 'renewals/upcoming', cid ? {contract_id:cid} : {}); state.renewals = d.rows || []; } catch(e) {}
}
async function loadFinancials(cid) {
  try { const d = await api('financials/list',{contract_id:cid}); state.financials = d.rows || []; } catch(e) {}
}
async function loadApprovals(cid) {
  try { const d = await api('approvals/list', cid ? {contract_id:cid} : {}); state.approvals = d.rows || []; } catch(e) {}
}
async function loadVersions(cid) {
  try { const d = await api('versions/list',{contract_id:cid}); state.versions = d.rows || []; } catch(e) {}
}

// ── Master render ─────────────────────────────────────────────
function render() {
  container.innerHTML = `
    <style>
      .ch-page { font-family:'Plus Jakarta Sans',sans-serif; }
      .ch-tab  { cursor:pointer; padding:.45rem 1rem; border-radius:8px; font-size:.8rem; font-weight:600; color:#64748b; transition:.15s; }
      .ch-tab:hover { background:#f1f5f9; color:#1e293b; }
      .ch-tab.active { background:#2563eb; color:#fff; }
      .ch-view-tab { cursor:pointer; padding:.5rem .875rem; border-bottom:2px solid transparent; font-size:.8rem; font-weight:600; color:#64748b; transition:.15s; }
      .ch-view-tab.active { border-bottom-color:#2563eb; color:#2563eb; }
      .ch-view-tab:hover:not(.active) { color:#1e293b; }
      .ch-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; }
      .ch-stat-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; padding:1.25rem 1.5rem; }
      .ch-badge { display:inline-flex; align-items:center; gap:.35rem; padding:.25rem .7rem; border-radius:999px; font-size:.72rem; font-weight:700; }
      .ch-btn { display:inline-flex; align-items:center; gap:.4rem; padding:.55rem 1.1rem; border-radius:9px; font-size:.8rem; font-weight:600; cursor:pointer; border:none; transition:.15s; }
      .ch-btn-primary { background:#2563eb; color:#fff; }
      .ch-btn-primary:hover { background:#1d4ed8; }
      .ch-btn-secondary { background:#f1f5f9; color:#475569; }
      .ch-btn-secondary:hover { background:#e2e8f0; }
      .ch-btn-danger { background:#fef2f2; color:#dc2626; }
      .ch-btn-danger:hover { background:#fee2e2; }
      .ch-btn-success { background:#f0fdf4; color:#16a34a; }
      .ch-btn-success:hover { background:#dcfce7; }
      .ch-input { width:100%; padding:.55rem .8rem; border:1.5px solid #e2e8f0; border-radius:9px; font-size:.8rem; outline:none; font-family:inherit; transition:.15s; }
      .ch-input:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
      .ch-label { display:block; font-size:.72rem; font-weight:700; color:#475569; margin-bottom:.3rem; text-transform:uppercase; letter-spacing:.05em; }
      .ch-table { width:100%; border-collapse:collapse; }
      .ch-table th { padding:.65rem 1rem; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; text-align:left; border-bottom:1.5px solid #f1f5f9; }
      .ch-table td { padding:.75rem 1rem; font-size:.8rem; color:#334155; border-bottom:1px solid #f8fafc; }
      .ch-table tr:hover td { background:#fafbff; }
      .ch-lifecycle-step { display:flex; flex-direction:column; align-items:center; gap:.25rem; flex:1; position:relative; }
      .ch-lifecycle-step::after { content:''; position:absolute; top:12px; left:calc(50% + 12px); right:calc(-50% + 12px); height:2px; background:#e2e8f0; }
      .ch-lifecycle-step:last-child::after { display:none; }
      .ch-lifecycle-dot { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.6rem; z-index:1; }
      .ch-section-header { display:flex; align-items:center; justify-content:space-between; padding:.875rem 1.25rem; border-bottom:1.5px solid #f1f5f9; }
      .alert-pill { display:inline-flex; align-items:center; gap:.35rem; padding:.3rem .75rem; border-radius:999px; font-size:.72rem; font-weight:700; }
    </style>
    <div class="ch-page p-6 max-w-[1400px] mx-auto">
      ${renderHeader()}
      ${state.view === 'dashboard' ? renderDashboard() :
        state.view === 'list'      ? renderList() :
        state.view === 'detail'    ? renderDetail() :
        state.view === 'parties'   ? renderParties() :
        state.view === 'approvals' ? renderApprovalsView() :
        state.view === 'renewals'  ? renderRenewalsView() :
        renderDashboard()}
    </div>`;
  bindEvents();
}

// ── Header ────────────────────────────────────────────────────
function renderHeader() {
  const views = [
    {id:'dashboard', icon:'fa-th-large',       label:'Overview'},
    {id:'list',      icon:'fa-file-signature',  label:'Contracts'},
    {id:'parties',   icon:'fa-building',        label:'Parties'},
    {id:'approvals', icon:'fa-check-double',    label:'Approvals'},
    {id:'renewals',  icon:'fa-redo',            label:'Renewals'},
  ];
  const alertCount = ((state.alerts?.expiring||[]).length + (state.alerts?.renewals||[]).length + (state.alerts?.approvals||[]).length);
  return `
    <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md">
          <i class="fas fa-file-signature text-white text-base"></i>
        </div>
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 leading-none">Contract Hub</h1>
          <p class="text-xs text-slate-500 mt-0.5 font-medium">Full lifecycle contract management</p>
        </div>
        ${alertCount > 0 ? `<span class="alert-pill bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle text-[10px]"></i>${alertCount} Alert${alertCount>1?'s':''}</span>` : ''}
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
          ${views.map(v=>`<button class="ch-tab ${state.view===v.id?'active':''}" data-nav="${v.id}"><i class="fas ${v.icon} mr-1.5"></i>${v.label}</button>`).join('')}
        </div>
        <button class="ch-btn ch-btn-primary" id="ch-new-contract">
          <i class="fas fa-plus"></i>New Contract
        </button>
      </div>
    </div>`;
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  const d  = state.dashboard || {};
  const al = state.alerts || {};
  const contracts = state.contracts;

  const kpis = [
    { label:'Total Contracts',    value: d.total||0,           icon:'fa-file-signature', color:'text-blue-600',    bg:'bg-blue-50' },
    { label:'Active',             value: d.active||0,          icon:'fa-check-circle',   color:'text-emerald-600', bg:'bg-emerald-50' },
    { label:'Expiring (90d)',     value: d.expiring_90||0,     icon:'fa-clock',          color:'text-amber-600',   bg:'bg-amber-50' },
    { label:'Pending Approvals',  value: d.pending_approvals||0,icon:'fa-hourglass-half',color:'text-violet-600',  bg:'bg-violet-50' },
    { label:'Active Value',       value: fmtCurrency(d.total_active_value||0), icon:'fa-dollar-sign', color:'text-teal-600', bg:'bg-teal-50' },
    { label:'Draft',              value: d.draft||0,           icon:'fa-edit',           color:'text-slate-600',   bg:'bg-slate-100' },
  ];

  // By status mini chart
  const byStatus = d.by_status || {};
  const totalForPct = Object.values(byStatus).reduce((s,v)=>s+v,0) || 1;

  // By category
  const byCat = d.by_type || {};

  // Recent contracts
  const recent = [...contracts].sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,6);

  // Alerts section
  const expiring  = al.expiring  || [];
  const renewalAl = al.renewals  || [];
  const appAl     = al.approvals || [];

  return `
    <!-- KPI Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      ${kpis.map(k=>`
        <div class="ch-stat-card flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500 leading-tight">${k.label}</span>
            <div class="w-7 h-7 ${k.bg} rounded-lg flex items-center justify-center">
              <i class="fas ${k.icon} ${k.color} text-xs"></i>
            </div>
          </div>
          <p class="text-2xl font-extrabold text-slate-900">${k.value}</p>
        </div>`).join('')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
      <!-- Status breakdown -->
      <div class="ch-card overflow-hidden">
        <div class="ch-section-header">
          <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-chart-pie mr-2 text-blue-500"></i>By Status</h3>
        </div>
        <div class="p-4 space-y-2.5">
          ${LIFECYCLE.map(s=>{
            const count = byStatus[s]||0;
            const pct   = Math.round((count/totalForPct)*100);
            const cfg   = STATUS_CONFIG[s]||{};
            return count > 0 ? `
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-semibold text-slate-600">${s}</span>
                <span class="text-xs font-bold text-slate-800">${count}</span>
              </div>
              <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full ${cfg.dot||'bg-blue-400'}" style="width:${pct}%"></div>
              </div>
            </div>` : '';
          }).join('')}
          ${Object.values(byStatus).every(v=>!v) ? '<p class="text-xs text-slate-400 text-center py-4">No data yet</p>' : ''}
        </div>
      </div>

      <!-- By category -->
      <div class="ch-card overflow-hidden">
        <div class="ch-section-header">
          <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-tags mr-2 text-indigo-500"></i>By Category</h3>
        </div>
        <div class="p-4 space-y-2">
          ${Object.keys(byCat).length ? Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-600 font-medium">${k}</span>
              <span class="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${v}</span>
            </div>`).join('') : '<p class="text-xs text-slate-400 text-center py-6">No contracts yet</p>'}
        </div>
      </div>

      <!-- Alerts -->
      <div class="ch-card overflow-hidden">
        <div class="ch-section-header">
          <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-bell mr-2 text-amber-500"></i>Alerts</h3>
        </div>
        <div class="p-4 space-y-2 max-h-64 overflow-y-auto">
          ${expiring.map(c=>`
            <div class="flex items-start gap-2.5 p-2.5 bg-red-50 rounded-lg border border-red-100">
              <i class="fas fa-clock text-red-500 text-xs mt-0.5"></i>
              <div>
                <p class="text-xs font-bold text-red-700">${esc(c.title)}</p>
                <p class="text-[11px] text-red-500">Expires ${fmt(c.end_date)}</p>
              </div>
            </div>`).join('')}
          ${renewalAl.map(r=>`
            <div class="flex items-start gap-2.5 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
              <i class="fas fa-redo text-amber-500 text-xs mt-0.5"></i>
              <div>
                <p class="text-xs font-bold text-amber-700">Renewal due ${fmt(r.renewal_date)}</p>
                <p class="text-[11px] text-amber-500">${r.type}</p>
              </div>
            </div>`).join('')}
          ${appAl.map(a=>`
            <div class="flex items-start gap-2.5 p-2.5 bg-violet-50 rounded-lg border border-violet-100">
              <i class="fas fa-hourglass-half text-violet-500 text-xs mt-0.5"></i>
              <div>
                <p class="text-xs font-bold text-violet-700">Approval pending</p>
                <p class="text-[11px] text-violet-500">${esc(a.approver)} · ${esc(a.role)}</p>
              </div>
            </div>`).join('')}
          ${!expiring.length && !renewalAl.length && !appAl.length ? `
            <div class="text-center py-6">
              <i class="fas fa-check-circle text-2xl text-emerald-300 mb-2"></i>
              <p class="text-xs text-slate-400 font-medium">No active alerts</p>
            </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Recent Contracts -->
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header">
        <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-history mr-2 text-slate-500"></i>Recent Contracts</h3>
        <button class="ch-btn ch-btn-secondary text-xs py-1.5" data-nav="list">View All</button>
      </div>
      <div class="overflow-x-auto">
        <table class="ch-table">
          <thead><tr>
            <th>Title</th><th>Category</th><th>Party</th><th>Value</th><th>End Date</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${recent.length ? recent.map(c=>{
              const cfg = STATUS_CONFIG[c.status]||{};
              const d   = daysUntil(c.end_date);
              return `<tr>
                <td><span class="font-semibold text-slate-800 cursor-pointer hover:text-blue-600" data-detail="${c.id}">${esc(c.title)}</span></td>
                <td><span class="text-slate-500">${esc(c.category||'—')}</span></td>
                <td class="text-slate-500">${esc(c.party_id||'—')}</td>
                <td class="font-semibold">${fmtCurrency(c.value, c.currency)}</td>
                <td>${c.end_date ? `<span class="${d!==null&&d<=30?'text-red-600 font-bold':''}">${fmt(c.end_date)}</span>` : '—'}</td>
                <td><span class="ch-badge ${cfg.bg||''} ${cfg.text||''}"><span class="w-1.5 h-1.5 rounded-full ${cfg.dot||'bg-slate-400'}"></span>${c.status||'—'}</span></td>
                <td><button class="ch-btn ch-btn-secondary py-1 text-xs" data-detail="${c.id}">Open</button></td>
              </tr>`;
            }).join('') : `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">No contracts yet — create your first one</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── CONTRACTS LIST ────────────────────────────────────────────
function renderList() {
  const tabs = [
    {id:'all',      label:'All'},
    {id:'active',   label:'Active'},
    {id:'expiring', label:'Expiring Soon'},
    {id:'draft',    label:'Drafts'},
    {id:'approval', label:'In Approval'},
  ];

  let rows = state.contracts;
  if (state.listTab === 'active')   rows = rows.filter(r=>r.status==='Active');
  if (state.listTab === 'draft')    rows = rows.filter(r=>r.status==='Draft');
  if (state.listTab === 'approval') rows = rows.filter(r=>r.status==='Approval');
  if (state.listTab === 'expiring') {
    const in90 = new Date(); in90.setDate(in90.getDate()+90);
    rows = rows.filter(r=>r.status==='Active'&&r.end_date&&new Date(r.end_date)<=in90&&new Date(r.end_date)>=new Date());
  }
  if (state.filter.status)   rows = rows.filter(r=>r.status===state.filter.status);
  if (state.filter.category) rows = rows.filter(r=>r.category===state.filter.category);
  if (state.filter.search) {
    const q = state.filter.search.toLowerCase();
    rows = rows.filter(r=>(r.title||'').toLowerCase().includes(q)||(r.party_id||'').toLowerCase().includes(q)||(r.owner||'').toLowerCase().includes(q));
  }

  return `
    <!-- Tabs + Filters -->
    <div class="ch-card overflow-hidden mb-4">
      <div class="flex items-center gap-0 border-b border-slate-100 px-4 overflow-x-auto">
        ${tabs.map(t=>`<button class="ch-view-tab ${state.listTab===t.id?'active':''} whitespace-nowrap" data-list-tab="${t.id}">${t.label}
          ${t.id!=='all'?`<span class="ml-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            ${t.id==='active'?state.contracts.filter(r=>r.status==='Active').length:
              t.id==='draft'?state.contracts.filter(r=>r.status==='Draft').length:
              t.id==='approval'?state.contracts.filter(r=>r.status==='Approval').length:
              (() => { const in90=new Date();in90.setDate(in90.getDate()+90);return state.contracts.filter(r=>r.status==='Active'&&r.end_date&&new Date(r.end_date)<=in90&&new Date(r.end_date)>=new Date()).length; })()
            }</span>`:''}
        </button>`).join('')}
      </div>
      <div class="p-4 flex flex-wrap gap-3">
        <div class="relative flex-1 min-w-[200px]">
          <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" placeholder="Search contracts…" class="ch-input pl-8" id="ch-search" value="${esc(state.filter.search)}">
        </div>
        <select class="ch-input w-40" id="ch-filter-status">
          <option value="">All Statuses</option>
          ${LIFECYCLE.map(s=>`<option value="${s}" ${state.filter.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <select class="ch-input w-40" id="ch-filter-cat">
          <option value="">All Categories</option>
          ${CATEGORIES.map(c=>`<option value="${c}" ${state.filter.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Table -->
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header">
        <h3 class="text-sm font-bold text-slate-800">${rows.length} contract${rows.length!==1?'s':''}</h3>
        <button class="ch-btn ch-btn-primary" id="ch-new-contract"><i class="fas fa-plus"></i>New</button>
      </div>
      <div class="overflow-x-auto">
        <table class="ch-table">
          <thead><tr>
            <th>Title</th><th>Category</th><th>Owner</th><th>Department</th>
            <th>Value</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map(c=>{
              const cfg = STATUS_CONFIG[c.status]||{};
              const d   = daysUntil(c.end_date);
              const expWarn = d!==null && d<=30 && c.status==='Active';
              return `<tr>
                <td>
                  <div class="flex items-center gap-2">
                    ${expWarn?'<i class="fas fa-exclamation-circle text-red-400 text-xs" title="Expiring soon"></i>':''}
                    <span class="font-semibold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors" data-detail="${c.id}">${esc(c.title)}</span>
                  </div>
                </td>
                <td>${c.category?`<span class="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${esc(c.category)}</span>`:'—'}</td>
                <td class="text-slate-500 text-xs">${esc(c.owner||'—')}</td>
                <td class="text-slate-500 text-xs">${esc(c.department||'—')}</td>
                <td class="font-semibold text-sm">${fmtCurrency(c.value, c.currency)}</td>
                <td class="text-xs text-slate-500">${fmt(c.start_date)}</td>
                <td class="text-xs ${expWarn?'text-red-600 font-bold':''}">${fmt(c.end_date)}</td>
                <td><span class="ch-badge ${cfg.bg||''} ${cfg.text||''}"><span class="w-1.5 h-1.5 rounded-full ${cfg.dot||'bg-slate-400'}"></span>${c.status||'—'}</span></td>
                <td>
                  <div class="flex gap-1">
                    <button class="ch-btn ch-btn-secondary py-1 text-xs" data-detail="${c.id}"><i class="fas fa-eye"></i></button>
                    <button class="ch-btn ch-btn-secondary py-1 text-xs" data-edit="${c.id}"><i class="fas fa-pen"></i></button>
                    <button class="ch-btn ch-btn-danger py-1 text-xs" data-delete="${c.id}"><i class="fas fa-trash"></i></button>
                  </div>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="9" class="text-center py-12 text-slate-400 text-sm"><i class="fas fa-file-signature text-3xl mb-3 block opacity-30"></i>No contracts found</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── DETAIL VIEW ───────────────────────────────────────────────
function renderDetail() {
  const c = state.contracts.find(x=>x.id===state.selectedId);
  if (!c) return `<div class="text-center py-20"><p class="text-slate-400">Contract not found.</p></div>`;

  const cfg = STATUS_CONFIG[c.status]||{};
  const curIdx = LIFECYCLE.indexOf(c.status);

  const detailTabs = [
    {id:'overview',    label:'Overview',    icon:'fa-info-circle'},
    {id:'documents',   label:'Documents',   icon:'fa-folder-open'},
    {id:'clauses',     label:'Clauses',     icon:'fa-gavel'},
    {id:'milestones',  label:'Milestones',  icon:'fa-flag'},
    {id:'financials',  label:'Financials',  icon:'fa-dollar-sign'},
    {id:'approvals',   label:'Approvals',   icon:'fa-check-double'},
    {id:'renewals',    label:'Renewals',    icon:'fa-redo'},
    {id:'versions',    label:'Versions',    icon:'fa-code-branch'},
  ];

  const detailTab = state.detailTab || 'overview';

  return `
    <!-- Back + Title -->
    <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <button class="ch-btn ch-btn-secondary py-1.5" data-nav="list"><i class="fas fa-arrow-left"></i>Back</button>
        <div>
          <h2 class="text-lg font-extrabold text-slate-900">${esc(c.title)}</h2>
          <p class="text-xs text-slate-500 mt-0.5">${esc(c.category||'')} ${c.department?`· ${esc(c.department)}`:''} ${c.owner?`· Owner: ${esc(c.owner)}`:''}</p>
        </div>
        <span class="ch-badge ${cfg.bg||''} ${cfg.text||''}"><span class="w-1.5 h-1.5 rounded-full ${cfg.dot||'bg-slate-400'}"></span>${c.status}</span>
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-secondary" data-edit="${c.id}"><i class="fas fa-pen"></i>Edit</button>
        ${curIdx < LIFECYCLE.length-1 ? `<button class="ch-btn ch-btn-primary" data-advance="${c.id}"><i class="fas fa-arrow-right"></i>Advance to ${LIFECYCLE[curIdx+1]||''}</button>` : ''}
      </div>
    </div>

    <!-- Lifecycle bar -->
    <div class="ch-card p-4 mb-5 overflow-x-auto">
      <div class="flex min-w-[700px]">
        ${LIFECYCLE.map((s,i)=>{
          const done    = i < curIdx;
          const current = i === curIdx;
          const cfg2    = STATUS_CONFIG[s]||{};
          return `<div class="ch-lifecycle-step">
            <div class="ch-lifecycle-dot ${done?'bg-emerald-500':current?cfg2.dot||'bg-blue-500':'border-2 border-slate-200 bg-white'}">
              ${done?'<i class="fas fa-check text-white text-[8px]"></i>':current?'<div class="w-2 h-2 bg-white rounded-full"></div>':''}
            </div>
            <span class="text-[10px] font-bold ${current?'text-blue-600':done?'text-emerald-600':'text-slate-400'} text-center leading-tight">${s}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Detail tabs -->
    <div class="ch-card overflow-hidden">
      <div class="flex border-b border-slate-100 overflow-x-auto">
        ${detailTabs.map(t=>`<button class="ch-view-tab ${detailTab===t.id?'active':''} whitespace-nowrap" data-detail-tab="${t.id}"><i class="fas ${t.icon} mr-1.5"></i>${t.label}</button>`).join('')}
      </div>
      <div class="p-5">
        ${detailTab === 'overview'   ? renderOverviewTab(c) :
          detailTab === 'documents'  ? renderDocumentsTab(c) :
          detailTab === 'clauses'    ? renderClausesTab(c) :
          detailTab === 'milestones' ? renderMilestonesTab(c) :
          detailTab === 'financials' ? renderFinancialsTab(c) :
          detailTab === 'approvals'  ? renderDetailApprovalsTab(c) :
          detailTab === 'renewals'   ? renderDetailRenewalsTab(c) :
          detailTab === 'versions'   ? renderVersionsTab(c) : ''}
      </div>
    </div>`;
}

function renderOverviewTab(c) {
  const party = state.parties.find(p=>p.id===c.party_id);
  const fields = [
    ['Title',        c.title],
    ['Category',     c.category],
    ['Type',         c.type_id],
    ['Status',       c.status],
    ['Owner',        c.owner],
    ['Department',   c.department],
    ['Party',        party ? `${party.name} (${party.type})` : c.party_id],
    ['Start Date',   fmt(c.start_date)],
    ['End Date',     fmt(c.end_date)],
    ['Contract Value',fmtCurrency(c.value, c.currency)],
    ['Currency',     c.currency],
    ['Renewal Type', c.renewal_type],
    ['Renewal Date', fmt(c.renewal_date)],
    ['Notice Period',c.notice_period_days ? c.notice_period_days+' days' : '—'],
    ['Linked Module',c.linked_module],
    ['Linked Record',c.linked_record_id],
    ['Notes',        c.notes],
    ['Created',      fmt(c.created_at)],
    ['Updated',      fmt(c.updated_at)],
  ];
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
      ${fields.filter(([,v])=>v&&v!=='—').map(([l,v])=>`
        <div class="border-b border-slate-50 pb-3">
          <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${l}</p>
          <p class="text-sm font-semibold text-slate-800">${esc(v)}</p>
        </div>`).join('')}
    </div>`;
}

function renderDocumentsTab(c) {
  const docs = state.documents;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-folder-open mr-2 text-amber-500"></i>${docs.length} Documents</h4>
      <button class="ch-btn ch-btn-primary" id="add-doc"><i class="fas fa-plus"></i>Add Document</button>
    </div>
    <div id="doc-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label class="ch-label">Type</label><select class="ch-input" id="doc-type">${DOC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="ch-label">Title</label><input class="ch-input" id="doc-title" placeholder="Document title"></div>
        <div><label class="ch-label">File URL</label><input class="ch-input" id="doc-url" placeholder="https://..."></div>
        <div><label class="ch-label">Version</label><input class="ch-input" id="doc-version" placeholder="1.0"></div>
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-doc"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-doc">Cancel</button>
      </div>
    </div>
    ${docs.length ? `<div class="space-y-2">
      ${docs.map(d=>`<div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <i class="fas fa-file-alt text-blue-500 text-xs"></i>
          </div>
          <div>
            <p class="text-sm font-bold text-slate-800">${esc(d.title||d.doc_type)}</p>
            <p class="text-xs text-slate-400">${esc(d.doc_type)} · v${esc(d.version||'1.0')} · ${fmt(d.created_at)}</p>
          </div>
        </div>
        <div class="flex gap-2">
          ${d.file_url?`<a href="${esc(d.file_url)}" target="_blank" class="ch-btn ch-btn-secondary py-1 text-xs"><i class="fas fa-external-link-alt"></i>Open</a>`:''}
          <button class="ch-btn ch-btn-danger py-1 text-xs" data-del-doc="${d.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('')}
    </div>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-folder-open text-2xl mb-2 block opacity-30"></i>No documents yet</div>`}`;
}

function renderClausesTab(c) {
  const clauses = state.clauses;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-gavel mr-2 text-violet-500"></i>${clauses.length} Clauses</h4>
      <button class="ch-btn ch-btn-primary" id="add-clause"><i class="fas fa-plus"></i>Add Clause</button>
    </div>
    <div id="clause-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div><label class="ch-label">Type</label><select class="ch-input" id="clause-type">${CLAUSE_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="ch-label">Title</label><input class="ch-input" id="clause-title" placeholder="Clause title"></div>
        <div><label class="ch-label">Critical?</label><select class="ch-input" id="clause-critical"><option value="false">No</option><option value="true">Yes — Critical</option></select></div>
      </div>
      <div class="mb-3"><label class="ch-label">Description</label><textarea class="ch-input h-20 resize-none" id="clause-desc" placeholder="Clause description…"></textarea></div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-clause"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-clause">Cancel</button>
      </div>
    </div>
    ${clauses.length ? `<div class="space-y-2">
      ${clauses.map(cl=>`<div class="p-3.5 rounded-xl border ${cl.is_critical==='true'?'border-red-200 bg-red-50':'border-slate-100 bg-slate-50'}">
        <div class="flex items-start justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold ${cl.is_critical==='true'?'bg-red-100 text-red-700':'bg-violet-50 text-violet-700'} px-2 py-0.5 rounded-full">${esc(cl.clause_type)}</span>
            ${cl.is_critical==='true'?'<span class="text-xs font-bold text-red-600"><i class="fas fa-exclamation-triangle"></i> Critical</span>':''}
          </div>
          <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-del-clause="${cl.id}"><i class="fas fa-trash"></i></button>
        </div>
        <p class="text-sm font-semibold text-slate-800 mb-1">${esc(cl.title)}</p>
        <p class="text-xs text-slate-600 leading-relaxed">${esc(cl.description||'')}</p>
      </div>`).join('')}
    </div>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-gavel text-2xl mb-2 block opacity-30"></i>No clauses yet</div>`}`;
}

function renderMilestonesTab(c) {
  const milestones = state.milestones;
  const STATUS_M = ['Pending','In Progress','Completed','Overdue'];
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-flag mr-2 text-teal-500"></i>${milestones.length} Milestones</h4>
      <button class="ch-btn ch-btn-primary" id="add-milestone"><i class="fas fa-plus"></i>Add Milestone</button>
    </div>
    <div id="milestone-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label class="ch-label">Event</label><input class="ch-input" id="ms-event" placeholder="e.g. Renewal Reminder"></div>
        <div><label class="ch-label">Date</label><input type="date" class="ch-input" id="ms-date"></div>
        <div><label class="ch-label">Assigned To</label><input class="ch-input" id="ms-assigned" placeholder="Name"></div>
        <div><label class="ch-label">Notify Days Before</label><input type="number" class="ch-input" id="ms-notify" placeholder="7" value="7"></div>
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-milestone"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-milestone">Cancel</button>
      </div>
    </div>
    ${milestones.length ? `<div class="space-y-2">
      ${milestones.map(m=>{
        const d = daysUntil(m.date);
        return `<div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.status==='Completed'?'bg-emerald-100 text-emerald-600':d!==null&&d<0?'bg-red-100 text-red-600':'bg-blue-50 text-blue-600'}">
              <i class="fas ${m.status==='Completed'?'fa-check':d!==null&&d<0?'fa-exclamation':'fa-flag'}"></i>
            </div>
            <div>
              <p class="text-sm font-bold text-slate-800">${esc(m.event)}</p>
              <p class="text-xs text-slate-400">${fmt(m.date)} ${m.assigned_to?`· ${esc(m.assigned_to)}`:''}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${d!==null?`<span class="text-xs font-semibold ${d<0?'text-red-600':d<=7?'text-amber-600':'text-slate-500'}">${d<0?`${Math.abs(d)}d overdue`:d===0?'Today':`In ${d}d`}</span>`:''}
            <button class="ch-btn ch-btn-success py-0.5 px-2 text-xs" data-complete-ms="${m.id}"><i class="fas fa-check"></i></button>
            <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-del-ms="${m.id}"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('')}
    </div>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-flag text-2xl mb-2 block opacity-30"></i>No milestones yet</div>`}`;
}

function renderFinancialsTab(c) {
  const fin = state.financials;
  const total = fin.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  return `
    <div class="flex justify-between items-center mb-4">
      <div>
        <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-dollar-sign mr-2 text-emerald-500"></i>${fin.length} Payment Terms</h4>
        ${fin.length?`<p class="text-xs text-slate-500 mt-0.5">Total: <strong>${fmtCurrency(total, c.currency)}</strong></p>`:''}
      </div>
      <button class="ch-btn ch-btn-primary" id="add-financial"><i class="fas fa-plus"></i>Add Payment Term</button>
    </div>
    <div id="financial-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <div><label class="ch-label">Payment Type</label><input class="ch-input" id="fin-type" placeholder="e.g. Service Fee"></div>
        <div><label class="ch-label">Amount</label><input type="number" class="ch-input" id="fin-amount" placeholder="0"></div>
        <div><label class="ch-label">Currency</label><select class="ch-input" id="fin-currency">${CURRENCIES.map(cu=>`<option ${cu===c.currency?'selected':''}>${cu}</option>`).join('')}</select></div>
        <div><label class="ch-label">Frequency</label><select class="ch-input" id="fin-frequency">${FREQUENCIES.map(f=>`<option>${f}</option>`).join('')}</select></div>
        <div><label class="ch-label">Due Date</label><input type="date" class="ch-input" id="fin-due"></div>
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-financial"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-financial">Cancel</button>
      </div>
    </div>
    ${fin.length ? `<table class="ch-table">
      <thead><tr><th>Type</th><th>Amount</th><th>Frequency</th><th>Due Date</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${fin.map(f=>`<tr>
          <td class="font-semibold">${esc(f.payment_type)}</td>
          <td>${fmtCurrency(f.amount, f.currency||c.currency)}</td>
          <td>${esc(f.frequency)}</td>
          <td>${fmt(f.due_date)}</td>
          <td>${f.status?`<span class="ch-badge ${f.status==='Paid'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}">${esc(f.status)}</span>`:'—'}</td>
          <td><button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-del-fin="${f.id}"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-dollar-sign text-2xl mb-2 block opacity-30"></i>No payment terms yet</div>`}`;
}

function renderDetailApprovalsTab(c) {
  const apps = state.approvals;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-check-double mr-2 text-violet-500"></i>${apps.length} Approvals</h4>
      <button class="ch-btn ch-btn-primary" id="add-approval"><i class="fas fa-plus"></i>Request Approval</button>
    </div>
    <div id="approval-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="ch-label">Approver Name</label><input class="ch-input" id="app-approver" placeholder="Full name"></div>
        <div><label class="ch-label">Role</label><input class="ch-input" id="app-role" placeholder="e.g. Legal, Finance"></div>
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-approval"><i class="fas fa-save"></i>Send for Approval</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-approval">Cancel</button>
      </div>
    </div>
    ${apps.length ? `<div class="space-y-2">
      ${apps.map(a=>{
        const cfg2 = {Pending:{bg:'bg-amber-50',text:'text-amber-700',icon:'fa-hourglass-half'},Approved:{bg:'bg-emerald-50',text:'text-emerald-700',icon:'fa-check-circle'},Rejected:{bg:'bg-red-50',text:'text-red-600',icon:'fa-times-circle'}}[a.status]||{bg:'bg-slate-50',text:'text-slate-700',icon:'fa-circle'};
        return `<div class="flex items-start justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 ${cfg2.bg} rounded-full flex items-center justify-center">
              <i class="fas ${cfg2.icon} ${cfg2.text} text-sm"></i>
            </div>
            <div>
              <p class="text-sm font-bold text-slate-800">${esc(a.approver)}</p>
              <p class="text-xs text-slate-400">${esc(a.role||'—')} ${a.approved_at?`· ${fmt(a.approved_at)}`:''}</p>
              ${a.comments?`<p class="text-xs text-slate-600 mt-1 italic">"${esc(a.comments)}"</p>`:''}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="ch-badge ${cfg2.bg} ${cfg2.text}">${a.status}</span>
            ${a.status==='Pending'?`
              <button class="ch-btn ch-btn-success py-0.5 px-2 text-xs" data-approve-app="${a.id}"><i class="fas fa-check"></i>Approve</button>
              <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-reject-app="${a.id}"><i class="fas fa-times"></i>Reject</button>`:''}
            <button class="ch-btn ch-btn-secondary py-0.5 px-2 text-xs" data-del-app="${a.id}"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('')}
    </div>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-check-double text-2xl mb-2 block opacity-30"></i>No approvals yet</div>`}`;
}

function renderDetailRenewalsTab(c) {
  const renewals = state.renewals;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-redo mr-2 text-teal-500"></i>${renewals.length} Renewals</h4>
      <button class="ch-btn ch-btn-primary" id="add-renewal"><i class="fas fa-plus"></i>Add Renewal</button>
    </div>
    <div id="renewal-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label class="ch-label">Renewal Date</label><input type="date" class="ch-input" id="ren-date"></div>
        <div><label class="ch-label">Type</label><select class="ch-input" id="ren-type">${RENEWAL_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="ch-label">New Value</label><input type="number" class="ch-input" id="ren-value" placeholder="Optional"></div>
        <div><label class="ch-label">Notes</label><input class="ch-input" id="ren-notes" placeholder="Optional"></div>
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-renewal"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-renewal">Cancel</button>
      </div>
    </div>
    ${renewals.length ? `<table class="ch-table">
      <thead><tr><th>Renewal Date</th><th>Type</th><th>New Value</th><th>Status</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${renewals.map(r=>`<tr>
          <td>${fmt(r.renewal_date)}</td>
          <td>${esc(r.type)}</td>
          <td>${r.new_value?fmtCurrency(r.new_value,c.currency):'—'}</td>
          <td><span class="ch-badge ${r.status==='Completed'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}">${esc(r.status)}</span></td>
          <td class="text-xs text-slate-400">${esc(r.notes||'—')}</td>
          <td>
            ${r.status==='Pending'?`<button class="ch-btn ch-btn-success py-0.5 px-2 text-xs" data-complete-ren="${r.id}"><i class="fas fa-check"></i>Done</button>`:''}
            <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs ml-1" data-del-ren="${r.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-redo text-2xl mb-2 block opacity-30"></i>No renewals yet</div>`}`;
}

function renderVersionsTab(c) {
  const vers = state.versions;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-code-branch mr-2 text-blue-500"></i>${vers.length} Versions</h4>
      <button class="ch-btn ch-btn-primary" id="add-version"><i class="fas fa-plus"></i>Add Version</button>
    </div>
    <div id="version-form" class="hidden ch-card p-4 mb-4 bg-slate-50 border-dashed">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label class="ch-label">Version No.</label><input class="ch-input" id="ver-num" placeholder="e.g. 1.1"></div>
        <div><label class="ch-label">Title</label><input class="ch-input" id="ver-title" placeholder="Version title"></div>
        <div><label class="ch-label">Changed By</label><input class="ch-input" id="ver-by" placeholder="Name"></div>
        <div><label class="ch-label">File URL</label><input class="ch-input" id="ver-url" placeholder="https://..."></div>
      </div>
      <div class="mb-3"><label class="ch-label">Change Summary</label><textarea class="ch-input h-16 resize-none" id="ver-summary" placeholder="What changed in this version…"></textarea></div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-version"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-version">Cancel</button>
      </div>
    </div>
    ${vers.length ? `<div class="space-y-2">
      ${vers.map((v,i)=>`<div class="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50">
        <div class="w-8 h-8 ${i===0?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
          v${esc(v.version||'?')}
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-0.5">
            <p class="text-sm font-bold text-slate-800">${esc(v.title||'Untitled')}</p>
            ${i===0?'<span class="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">Latest</span>':''}
          </div>
          <p class="text-xs text-slate-400">${esc(v.changed_by||'—')} · ${fmt(v.created_at)}</p>
          ${v.change_summary?`<p class="text-xs text-slate-600 mt-1">${esc(v.change_summary)}</p>`:''}
          ${v.file_url?`<a href="${esc(v.file_url)}" target="_blank" class="text-xs text-blue-600 hover:underline mt-1 inline-block"><i class="fas fa-external-link-alt mr-1"></i>Open File</a>`:''}
        </div>
        <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-del-ver="${v.id}"><i class="fas fa-trash"></i></button>
      </div>`).join('')}
    </div>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-code-branch text-2xl mb-2 block opacity-30"></i>No versions yet</div>`}`;
}

// ── PARTIES VIEW ──────────────────────────────────────────────
function renderParties() {
  const parties = state.parties;
  return `
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header">
        <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-building mr-2 text-blue-500"></i>${parties.length} Contract Parties</h3>
        <button class="ch-btn ch-btn-primary" id="add-party"><i class="fas fa-plus"></i>Add Party</button>
      </div>
      <div id="party-form" class="hidden p-4 bg-slate-50 border-b border-slate-100">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div><label class="ch-label">Name</label><input class="ch-input" id="party-name" placeholder="Company/Person name"></div>
          <div><label class="ch-label">Type</label><select class="ch-input" id="party-type">${PARTY_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
          <div><label class="ch-label">Email</label><input class="ch-input" id="party-email" type="email" placeholder="email@example.com"></div>
          <div><label class="ch-label">Phone</label><input class="ch-input" id="party-phone" placeholder="+1 ..."></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div><label class="ch-label">Contact Person</label><input class="ch-input" id="party-contact" placeholder="Primary contact"></div>
          <div><label class="ch-label">Country</label><input class="ch-input" id="party-country" placeholder="Country"></div>
          <div><label class="ch-label">Address</label><input class="ch-input" id="party-address" placeholder="Address"></div>
        </div>
        <div class="flex gap-2">
          <button class="ch-btn ch-btn-primary" id="save-party"><i class="fas fa-save"></i>Save Party</button>
          <button class="ch-btn ch-btn-secondary" id="cancel-party">Cancel</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="ch-table">
          <thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Phone</th><th>Contact</th><th>Country</th><th>Actions</th></tr></thead>
          <tbody>
            ${parties.length ? parties.map(p=>`<tr>
              <td class="font-semibold text-slate-800">${esc(p.name)}</td>
              <td><span class="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">${esc(p.type)}</span></td>
              <td class="text-slate-500 text-xs">${esc(p.email||'—')}</td>
              <td class="text-slate-500 text-xs">${esc(p.phone||'—')}</td>
              <td class="text-slate-500 text-xs">${esc(p.contact_person||'—')}</td>
              <td class="text-slate-500 text-xs">${esc(p.country||'—')}</td>
              <td><button class="ch-btn ch-btn-danger py-1 text-xs" data-del-party="${p.id}"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('') : `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">No parties yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── APPROVALS VIEW ────────────────────────────────────────────
function renderApprovalsView() {
  const apps = state.approvals;
  const pending  = apps.filter(a=>a.status==='Pending');
  const approved = apps.filter(a=>a.status==='Approved');
  const rejected = apps.filter(a=>a.status==='Rejected');
  return `
    <div class="grid grid-cols-3 gap-4 mb-5">
      ${[['Pending',pending,'bg-amber-50 border-amber-200','text-amber-700','fa-hourglass-half'],
         ['Approved',approved,'bg-emerald-50 border-emerald-200','text-emerald-700','fa-check-circle'],
         ['Rejected',rejected,'bg-red-50 border-red-200','text-red-700','fa-times-circle']].map(([label,rows,bg,tc,icon])=>`
        <div class="ch-card border ${bg} p-4">
          <div class="flex items-center gap-2 mb-1">
            <i class="fas ${icon} ${tc}"></i>
            <span class="text-sm font-bold ${tc}">${label}</span>
          </div>
          <p class="text-3xl font-extrabold ${tc}">${rows.length}</p>
        </div>`).join('')}
    </div>
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800">All Approvals</h3></div>
      <table class="ch-table">
        <thead><tr><th>Contract</th><th>Approver</th><th>Role</th><th>Status</th><th>Date</th><th>Comments</th><th>Actions</th></tr></thead>
        <tbody>
          ${apps.length ? apps.map(a=>{
            const contract = state.contracts.find(c=>c.id===a.contract_id);
            const cfg2 = {Pending:{bg:'bg-amber-50',text:'text-amber-700'},Approved:{bg:'bg-emerald-50',text:'text-emerald-700'},Rejected:{bg:'bg-red-50',text:'text-red-600'}}[a.status]||{};
            return `<tr>
              <td><span class="font-semibold text-slate-800 text-xs">${esc(contract?.title||a.contract_id)}</span></td>
              <td class="font-semibold text-sm">${esc(a.approver)}</td>
              <td class="text-xs text-slate-500">${esc(a.role||'—')}</td>
              <td><span class="ch-badge ${cfg2.bg||''} ${cfg2.text||''}">${a.status}</span></td>
              <td class="text-xs text-slate-400">${a.approved_at?fmt(a.approved_at):'—'}</td>
              <td class="text-xs text-slate-500 max-w-[120px] truncate">${esc(a.comments||'—')}</td>
              <td>
                ${a.status==='Pending'?`
                  <button class="ch-btn ch-btn-success py-0.5 px-2 text-xs" data-approve-app="${a.id}"><i class="fas fa-check"></i></button>
                  <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs ml-1" data-reject-app="${a.id}"><i class="fas fa-times"></i></button>`:'—'}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="7" class="text-center py-10 text-slate-400 text-sm">No approvals yet</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ── RENEWALS VIEW ─────────────────────────────────────────────
function renderRenewalsView() {
  const renewals = state.renewals;
  return `
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header">
        <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-redo mr-2 text-teal-500"></i>Upcoming Renewals</h3>
      </div>
      <table class="ch-table">
        <thead><tr><th>Contract</th><th>Renewal Date</th><th>Type</th><th>New Value</th><th>Status</th><th>Days Left</th></tr></thead>
        <tbody>
          ${renewals.length ? renewals.map(r=>{
            const contract = state.contracts.find(c=>c.id===r.contract_id);
            const d = daysUntil(r.renewal_date);
            return `<tr>
              <td><span class="font-semibold text-slate-800 cursor-pointer hover:text-blue-600" data-detail="${r.contract_id}">${esc(contract?.title||r.contract_id)}</span></td>
              <td>${fmt(r.renewal_date)}</td>
              <td>${esc(r.type)}</td>
              <td>${r.new_value?fmtCurrency(r.new_value):'—'}</td>
              <td><span class="ch-badge ${r.status==='Completed'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}">${esc(r.status)}</span></td>
              <td><span class="text-sm font-bold ${d!==null&&d<=7?'text-red-600':d!==null&&d<=30?'text-amber-600':'text-slate-600'}">${d!==null?(d<0?`${Math.abs(d)}d overdue`:d===0?'Today':`${d}d`):'—'}</span></td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">No upcoming renewals</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ── CONTRACT FORM MODAL ───────────────────────────────────────
function openContractForm(existing) {
  const c   = existing || {};
  const isEdit = !!c.id;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-start justify-center p-4 pt-10';
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" id="modal-overlay"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
        <h3 class="text-base font-extrabold text-slate-900">${isEdit?'Edit':'New'} Contract</h3>
        <button id="close-modal" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2"><label class="ch-label">Contract Title *</label><input class="ch-input" id="f-title" value="${esc(c.title||'')}" placeholder="e.g. IT Support Agreement 2026"></div>
        <div><label class="ch-label">Category</label><select class="ch-input" id="f-category">${CATEGORIES.map(x=>`<option ${c.category===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label class="ch-label">Status</label><select class="ch-input" id="f-status">${LIFECYCLE.map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="ch-label">Party (ID or Name)</label><input class="ch-input" id="f-party" value="${esc(c.party_id||'')}" placeholder="Party ID or name"></div>
        <div><label class="ch-label">Owner</label><input class="ch-input" id="f-owner" value="${esc(c.owner||'')}" placeholder="Internal owner name"></div>
        <div><label class="ch-label">Department</label><select class="ch-input" id="f-dept"><option value="">Select…</option>${DEPARTMENTS.map(d=>`<option ${c.department===d?'selected':''}>${d}</option>`).join('')}</select></div>
        <div><label class="ch-label">Contract Value</label><input type="number" class="ch-input" id="f-value" value="${esc(c.value||'')}" placeholder="0"></div>
        <div><label class="ch-label">Currency</label><select class="ch-input" id="f-currency">${CURRENCIES.map(cu=>`<option ${c.currency===cu?'selected':''}>${cu}</option>`).join('')}</select></div>
        <div><label class="ch-label">Start Date</label><input type="date" class="ch-input" id="f-start" value="${c.start_date?c.start_date.slice(0,10):''}"></div>
        <div><label class="ch-label">End Date</label><input type="date" class="ch-input" id="f-end" value="${c.end_date?c.end_date.slice(0,10):''}"></div>
        <div><label class="ch-label">Renewal Type</label><select class="ch-input" id="f-renewal-type"><option value="">None</option>${RENEWAL_TYPES.map(r=>`<option ${c.renewal_type===r?'selected':''}>${r}</option>`).join('')}</select></div>
        <div><label class="ch-label">Renewal Date</label><input type="date" class="ch-input" id="f-renewal-date" value="${c.renewal_date?c.renewal_date.slice(0,10):''}"></div>
        <div><label class="ch-label">Notice Period (days)</label><input type="number" class="ch-input" id="f-notice" value="${esc(c.notice_period_days||'')}" placeholder="30"></div>
        <div><label class="ch-label">Link to Module</label><select class="ch-input" id="f-linked-mod">${LINKED_MODULES.map(m=>`<option ${c.linked_module===m?'selected':''}>${m}</option>`).join('')}</select></div>
        <div><label class="ch-label">Linked Record ID</label><input class="ch-input" id="f-linked-rec" value="${esc(c.linked_record_id||'')}" placeholder="Optional record ID"></div>
        <div class="md:col-span-2"><label class="ch-label">Notes</label><textarea class="ch-input h-20 resize-none" id="f-notes" placeholder="Additional notes…">${esc(c.notes||'')}</textarea></div>
      </div>
      <div class="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 rounded-b-2xl">
        <button class="ch-btn ch-btn-primary flex-1" id="modal-save"><i class="fas fa-save"></i>${isEdit?'Update':'Create'} Contract</button>
        <button class="ch-btn ch-btn-secondary px-6" id="close-modal2">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#close-modal').addEventListener('click', close);
  modal.querySelector('#close-modal2').addEventListener('click', close);
  modal.querySelector('#modal-overlay').addEventListener('click', close);

  modal.querySelector('#modal-save').addEventListener('click', async () => {
    const title = modal.querySelector('#f-title').value.trim();
    if (!title) { toast('Title is required','error'); return; }
    const payload = {
      title, category: modal.querySelector('#f-category').value,
      status: modal.querySelector('#f-status').value,
      party_id: modal.querySelector('#f-party').value.trim(),
      owner: modal.querySelector('#f-owner').value.trim(),
      department: modal.querySelector('#f-dept').value,
      value: modal.querySelector('#f-value').value,
      currency: modal.querySelector('#f-currency').value,
      start_date: modal.querySelector('#f-start').value,
      end_date: modal.querySelector('#f-end').value,
      renewal_type: modal.querySelector('#f-renewal-type').value,
      renewal_date: modal.querySelector('#f-renewal-date').value,
      notice_period_days: modal.querySelector('#f-notice').value,
      linked_module: modal.querySelector('#f-linked-mod').value !== 'None' ? modal.querySelector('#f-linked-mod').value : '',
      linked_record_id: modal.querySelector('#f-linked-rec').value.trim(),
      notes: modal.querySelector('#f-notes').value.trim(),
      created_by: window.WorkVolt.user()?.name || '',
    };
    if (isEdit) payload.id = c.id;
    try {
      await api(isEdit ? 'update' : 'create', payload);
      toast(isEdit ? 'Contract updated' : 'Contract created', 'success');
      close();
      await loadContracts();
      await loadDashboard();
      render();
    } catch(e) { toast(e.message,'error'); }
  });
}

// ── Event Binding ─────────────────────────────────────────────
function bindEvents() {
  const el = container;

  el.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', async () => {
    state.view = b.dataset.nav;
    if (state.view === 'parties')   { await loadParties(); }
    if (state.view === 'approvals') { await loadApprovals(); }
    if (state.view === 'renewals')  { await loadRenewals(null); }
    render();
  }));

  el.querySelectorAll('[data-list-tab]').forEach(b => b.addEventListener('click', () => {
    state.listTab = b.dataset.listTab;
    render();
  }));

  // Open detail
  el.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.detail;
    state.selectedId = id;
    state.view = 'detail';
    state.detailTab = 'overview';
    await Promise.all([loadDocuments(id),loadClauses(id),loadMilestones(id),loadRenewals(id),loadFinancials(id),loadApprovals(id),loadVersions(id),loadParties()]);
    render();
  }));

  el.querySelectorAll('[data-detail-tab]').forEach(b => b.addEventListener('click', () => {
    state.detailTab = b.dataset.detailTab;
    render();
  }));

  // New / edit
  el.querySelectorAll('#ch-new-contract').forEach(b => b.addEventListener('click', () => openContractForm()));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const c = state.contracts.find(x=>x.id===b.dataset.edit);
    openContractForm(c);
  }));

  // Delete contract
  el.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this contract? This cannot be undone.')) return;
    try {
      await api('delete', {id: b.dataset.delete});
      toast('Contract deleted','success');
      state.view = 'list';
      await loadContracts(); await loadDashboard();
      render();
    } catch(e) { toast(e.message,'error'); }
  }));

  // Advance lifecycle
  el.querySelectorAll('[data-advance]').forEach(b => b.addEventListener('click', async () => {
    try {
      const r = await api('advance-status', {id: b.dataset.advance});
      toast(`Status → ${r.new_status}`,'success');
      await loadContracts();
      const idx = state.contracts.findIndex(c=>c.id===b.dataset.advance);
      if (idx>=0) state.contracts[idx].status = r.new_status;
      render();
    } catch(e) { toast(e.message,'error'); }
  }));

  // Search & filter
  const searchEl = el.querySelector('#ch-search');
  if (searchEl) searchEl.addEventListener('input', e => { state.filter.search = e.target.value; render(); });
  const statusEl = el.querySelector('#ch-filter-status');
  if (statusEl) statusEl.addEventListener('change', e => { state.filter.status = e.target.value; render(); });
  const catEl = el.querySelector('#ch-filter-cat');
  if (catEl) catEl.addEventListener('change', e => { state.filter.category = e.target.value; render(); });

  // ── Documents ─────────────────────────────────────────────
  bindToggle(el, '#add-doc', '#doc-form');
  bindToggle(el, '#cancel-doc', '#doc-form', true);
  el.querySelector('#save-doc')?.addEventListener('click', async () => {
    const d = {
      contract_id: state.selectedId,
      doc_type: el.querySelector('#doc-type').value,
      title: el.querySelector('#doc-title').value.trim(),
      file_url: el.querySelector('#doc-url').value.trim(),
      version: el.querySelector('#doc-version').value.trim(),
      uploaded_by: window.WorkVolt.user()?.name||'',
    };
    await api('documents/create', d);
    await loadDocuments(state.selectedId);
    render();
  });
  el.querySelectorAll('[data-del-doc]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('documents/delete',{id:b.dataset.delDoc});
    await loadDocuments(state.selectedId); render();
  }));

  // ── Clauses ───────────────────────────────────────────────
  bindToggle(el, '#add-clause', '#clause-form');
  bindToggle(el, '#cancel-clause', '#clause-form', true);
  el.querySelector('#save-clause')?.addEventListener('click', async () => {
    await api('clauses/create', {
      contract_id: state.selectedId,
      clause_type: el.querySelector('#clause-type').value,
      title: el.querySelector('#clause-title').value.trim(),
      description: el.querySelector('#clause-desc').value.trim(),
      is_critical: el.querySelector('#clause-critical').value,
    });
    await loadClauses(state.selectedId); render();
  });
  el.querySelectorAll('[data-del-clause]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('clauses/delete',{id:b.dataset.delClause});
    await loadClauses(state.selectedId); render();
  }));

  // ── Milestones ────────────────────────────────────────────
  bindToggle(el, '#add-milestone', '#milestone-form');
  bindToggle(el, '#cancel-milestone', '#milestone-form', true);
  el.querySelector('#save-milestone')?.addEventListener('click', async () => {
    await api('milestones/create', {
      contract_id: state.selectedId,
      event: el.querySelector('#ms-event').value.trim(),
      date: el.querySelector('#ms-date').value,
      assigned_to: el.querySelector('#ms-assigned').value.trim(),
      notify_days_before: el.querySelector('#ms-notify').value,
      status: 'Pending',
    });
    await loadMilestones(state.selectedId); render();
  });
  el.querySelectorAll('[data-complete-ms]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('milestones/update',{id:b.dataset.completeMilestone||b.dataset.completeMs,status:'Completed'});
    await loadMilestones(state.selectedId); render();
  }));
  el.querySelectorAll('[data-del-ms]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('milestones/delete',{id:b.dataset.delMs});
    await loadMilestones(state.selectedId); render();
  }));

  // ── Financials ────────────────────────────────────────────
  bindToggle(el, '#add-financial', '#financial-form');
  bindToggle(el, '#cancel-financial', '#financial-form', true);
  el.querySelector('#save-financial')?.addEventListener('click', async () => {
    await api('financials/create', {
      contract_id: state.selectedId,
      payment_type: el.querySelector('#fin-type').value.trim(),
      amount: el.querySelector('#fin-amount').value,
      currency: el.querySelector('#fin-currency').value,
      frequency: el.querySelector('#fin-frequency').value,
      due_date: el.querySelector('#fin-due').value,
      status: 'Pending',
    });
    await loadFinancials(state.selectedId); render();
  });
  el.querySelectorAll('[data-del-fin]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('financials/delete',{id:b.dataset.delFin});
    await loadFinancials(state.selectedId); render();
  }));

  // ── Approvals ─────────────────────────────────────────────
  bindToggle(el, '#add-approval', '#approval-form');
  bindToggle(el, '#cancel-approval', '#approval-form', true);
  el.querySelector('#save-approval')?.addEventListener('click', async () => {
    await api('approvals/create', {
      contract_id: state.selectedId,
      approver: el.querySelector('#app-approver').value.trim(),
      role: el.querySelector('#app-role').value.trim(),
    });
    await loadApprovals(state.selectedId); render();
  });
  el.querySelectorAll('[data-approve-app]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('approvals/approve',{id:b.dataset.approveApp});
    toast('Approved','success');
    if (state.view==='detail') await loadApprovals(state.selectedId);
    else await loadApprovals();
    render();
  }));
  el.querySelectorAll('[data-reject-app]').forEach(b=>b.addEventListener('click', async ()=>{
    const comments = prompt('Reason for rejection (optional):') || '';
    await api('approvals/reject',{id:b.dataset.rejectApp, comments});
    toast('Rejected','info');
    if (state.view==='detail') await loadApprovals(state.selectedId);
    else await loadApprovals();
    render();
  }));
  el.querySelectorAll('[data-del-app]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('approvals/delete',{id:b.dataset.delApp});
    if (state.view==='detail') await loadApprovals(state.selectedId);
    else await loadApprovals();
    render();
  }));

  // ── Renewals ──────────────────────────────────────────────
  bindToggle(el, '#add-renewal', '#renewal-form');
  bindToggle(el, '#cancel-renewal', '#renewal-form', true);
  el.querySelector('#save-renewal')?.addEventListener('click', async () => {
    await api('renewals/create', {
      contract_id: state.selectedId,
      renewal_date: el.querySelector('#ren-date').value,
      type: el.querySelector('#ren-type').value,
      new_value: el.querySelector('#ren-value').value,
      notes: el.querySelector('#ren-notes').value.trim(),
    });
    await loadRenewals(state.selectedId); render();
  });
  el.querySelectorAll('[data-complete-ren]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('renewals/update',{id:b.dataset.completeRen,status:'Completed'});
    await loadRenewals(state.selectedId); render();
  }));
  el.querySelectorAll('[data-del-ren]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('renewals/delete',{id:b.dataset.delRen});
    await loadRenewals(state.selectedId); render();
  }));

  // ── Versions ──────────────────────────────────────────────
  bindToggle(el, '#add-version', '#version-form');
  bindToggle(el, '#cancel-version', '#version-form', true);
  el.querySelector('#save-version')?.addEventListener('click', async () => {
    await api('versions/create', {
      contract_id: state.selectedId,
      version: el.querySelector('#ver-num').value.trim(),
      title: el.querySelector('#ver-title').value.trim(),
      changed_by: el.querySelector('#ver-by').value.trim(),
      file_url: el.querySelector('#ver-url').value.trim(),
      change_summary: el.querySelector('#ver-summary').value.trim(),
    });
    await loadVersions(state.selectedId); render();
  });
  el.querySelectorAll('[data-del-ver]').forEach(b=>b.addEventListener('click', async ()=>{
    await api('versions/delete',{id:b.dataset.delVer});
    await loadVersions(state.selectedId); render();
  }));

  // ── Parties ───────────────────────────────────────────────
  bindToggle(el, '#add-party', '#party-form');
  bindToggle(el, '#cancel-party', '#party-form', true);
  el.querySelector('#save-party')?.addEventListener('click', async () => {
    await api('parties/create', {
      name: el.querySelector('#party-name').value.trim(),
      type: el.querySelector('#party-type').value,
      email: el.querySelector('#party-email').value.trim(),
      phone: el.querySelector('#party-phone').value.trim(),
      contact_person: el.querySelector('#party-contact').value.trim(),
      country: el.querySelector('#party-country').value.trim(),
      address: el.querySelector('#party-address').value.trim(),
    });
    await loadParties(); render();
  });
  el.querySelectorAll('[data-del-party]').forEach(b=>b.addEventListener('click', async ()=>{
    if (!confirm('Remove this party?')) return;
    await api('parties/delete',{id:b.dataset.delParty});
    await loadParties(); render();
  }));
}

function bindToggle(el, triggerSel, targetSel, hide) {
  const trigger = el.querySelector(triggerSel);
  const target  = el.querySelector(targetSel);
  if (!trigger || !target) return;
  trigger.addEventListener('click', () => {
    if (hide) target.classList.add('hidden');
    else target.classList.toggle('hidden');
  });
}

// ── Register page ─────────────────────────────────────────────
window.WorkVoltPages = window.WorkVoltPages || {};
window.WorkVoltPages.contracts = init;

})();
