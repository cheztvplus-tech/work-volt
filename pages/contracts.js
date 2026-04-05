// pages/contracts.js — Work Volt Contract Hub v3
// Changes from v2:
//   • All API calls now use WorkVoltDB directly (no server-side api() wrapper needed)
//   • Cloud storage: Google Drive, OneDrive, Dropbox, Supabase Storage pickers
//   • "Cloud Storage Setup" guide modal — per-provider step-by-step instructions
//   • Document preview panel (Google Drive iframe, PDF viewer, generic link)
//   • Recommended-approach banner shown when no provider is configured
(function () {
'use strict';

// ── Helpers ───────────────────────────────────────────────────
const db    = window.WorkVoltDB;
const toast = (m, t) => window.WorkVolt?.toast ? window.WorkVolt.toast(m, t||'info') : console.log(t, m);
const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt   = v => v ? new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtCurrency = (v, c='USD') => v ? new Intl.NumberFormat('en-US',{style:'currency',currency:c,minimumFractionDigits:0}).format(v) : '—';
const daysUntil   = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

// ── Constants ─────────────────────────────────────────────────
const STATUS_CONFIG = {
  'Draft':        { bg:'bg-slate-100',  text:'text-slate-600',  dot:'bg-slate-400' },
  'Under Review': { bg:'bg-amber-50',   text:'text-amber-700',  dot:'bg-amber-400' },
  'Negotiation':  { bg:'bg-orange-50',  text:'text-orange-700', dot:'bg-orange-400' },
  'Approval':     { bg:'bg-violet-50',  text:'text-violet-700', dot:'bg-violet-500' },
  'Signed':       { bg:'bg-blue-50',    text:'text-blue-700',   dot:'bg-blue-500' },
  'Active':       { bg:'bg-emerald-50', text:'text-emerald-700',dot:'bg-emerald-500' },
  'Expired':      { bg:'bg-red-50',     text:'text-red-600',    dot:'bg-red-400' },
  'Terminated':   { bg:'bg-rose-100',   text:'text-rose-700',   dot:'bg-rose-500' },
  'Archived':     { bg:'bg-gray-100',   text:'text-gray-500',   dot:'bg-gray-400' },
};
const LIFECYCLE      = ['Draft','Under Review','Negotiation','Approval','Signed','Active','Expired','Terminated','Archived'];
const CLAUSE_TYPES   = ['Payment Terms','Termination','Liability','Confidentiality','SLA','Renewal','Warranty','Indemnification','Force Majeure','Other'];
const DOC_TYPES      = ['Draft','Final Contract','Amendment','Annex','Termination Letter','NDA','Addendum'];
const RENEWAL_TYPES  = ['Auto Renewal','Manual Renewal','Negotiation','Termination'];
const FREQUENCIES    = ['One Time','Monthly','Quarterly','Semi-Annual','Annual','Milestone Based'];
const CATEGORIES     = ['Vendor','Client','Employment','Lease','NDA','Service Agreement','Partnership','License'];
const CURRENCIES     = ['USD','CAD','EUR','GBP','AUD','SGD','INR','AED'];
const PARTY_TYPES    = ['Company','Individual','Government','NGO','Partnership'];
const DEPARTMENTS    = ['Legal','HR','Finance','Sales','IT','Operations','Marketing','Procurement','Executive'];
const LINKED_MODULES = ['None','hr','finance','assets','projects','crm'];

// Config for each linkable module: which DB table to query and which field is the display name
const MODULE_CONFIG = {
  hr:       { table:'users',                nameField:'name',      idField:'id', label:'HR / Employees',    icon:'fa-users' },
  finance:  { table:'invoices',             nameField:'customer',  idField:'id', label:'Finance / Invoices', icon:'fa-file-invoice-dollar' },
  assets:   { table:'assets',               nameField:'asset_name',idField:'id', label:'Assets',             icon:'fa-boxes' },
  projects: { table:'projects',             nameField:'name',      idField:'id', label:'Projects',           icon:'fa-project-diagram' },
  crm:      { table:'crm_contacts',         nameField:'name',      idField:'id', label:'CRM / Contacts',     icon:'fa-address-book' },
};

// UUID validation helper — prevents non-UUID strings from reaching Supabase uuid columns
const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));

// ── Cloud storage provider config ─────────────────────────────
// Users set these keys via the "Cloud Storage Setup" modal.
// Values are persisted in localStorage so they survive page reloads.
const CS_KEY = 'wv_cloud_storage_cfg';
function getCsConfig()          { try { return JSON.parse(localStorage.getItem(CS_KEY)||'{}'); } catch(e){ return {}; } }
function saveCsConfig(cfg)      { localStorage.setItem(CS_KEY, JSON.stringify(cfg)); }

const PROVIDER_META = {
  google_drive: {
    label: 'Google Drive',
    icon:  'fab fa-google-drive',
    color: 'text-green-600',
    bg:    'bg-green-50',
    border:'border-green-200',
    recommended_for: 'Google Workspace users',
    steps: [
      'Go to <a href="https://console.cloud.google.com" target="_blank" class="text-blue-600 underline">console.cloud.google.com</a> and create (or select) a project.',
      'Enable the <strong>Google Picker API</strong> and <strong>Google Drive API</strong> for that project.',
      'Go to <strong>APIs &amp; Services → Credentials</strong> → Create OAuth 2.0 Client ID (Web application).',
      'Add your app domain to <strong>Authorised JavaScript origins</strong> (e.g. <code>http://localhost</code> for local dev).',
      'Copy the <strong>Client ID</strong> (ends in <code>.apps.googleusercontent.com</code>) and paste it below.',
      'Optionally create an <strong>API Key</strong> (restrict it to Google Picker API) for broader access.',
      'Save and click <strong>Test Connection</strong> — a Google sign-in popup should appear.',
    ],
    fields: [
      { key:'google_client_id', label:'OAuth Client ID', placeholder:'xxxx.apps.googleusercontent.com', type:'text' },
      { key:'google_api_key',   label:'API Key (optional)', placeholder:'AIzaSy…', type:'text' },
    ],
  },
  onedrive: {
    label: 'OneDrive / SharePoint',
    icon:  'fab fa-microsoft',
    color: 'text-blue-600',
    bg:    'bg-blue-50',
    border:'border-blue-200',
    recommended_for: 'Microsoft 365 / SharePoint users',
    steps: [
      'Go to <a href="https://portal.azure.com" target="_blank" class="text-blue-600 underline">portal.azure.com</a> → <strong>Azure Active Directory → App registrations → New registration</strong>.',
      'Set the Redirect URI to your app URL (Web platform).',
      'Under <strong>API Permissions</strong> add <strong>Microsoft Graph → Files.ReadWrite</strong> (Delegated).',
      'Copy the <strong>Application (client) ID</strong> shown on the app overview page.',
      'Paste it below and save.',
      'The OneDrive SDK is loaded automatically — no npm install needed.',
    ],
    fields: [
      { key:'onedrive_client_id', label:'Azure App (Client) ID', placeholder:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type:'text' },
    ],
  },
  dropbox: {
    label: 'Dropbox',
    icon:  'fab fa-dropbox',
    color: 'text-blue-500',
    bg:    'bg-sky-50',
    border:'border-sky-200',
    recommended_for: 'Teams already using Dropbox',
    steps: [
      'Go to <a href="https://www.dropbox.com/developers/apps" target="_blank" class="text-blue-600 underline">dropbox.com/developers/apps</a> → Create app.',
      'Choose <strong>Scoped access → Full Dropbox</strong> (or App folder).',
      'Under <strong>Permissions</strong> enable <code>files.content.read</code>.',
      'Copy the <strong>App key</strong> from the Settings tab.',
      'Paste it below — the Chooser widget loads from Dropbox\'s CDN, no install needed.',
    ],
    fields: [
      { key:'dropbox_app_key', label:'Dropbox App Key', placeholder:'abc123xyz…', type:'text' },
    ],
  },
  supabase: {
    label: 'Supabase Storage',
    icon:  'fas fa-database',
    color: 'text-teal-600',
    bg:    'bg-teal-50',
    border:'border-teal-200',
    recommended_for: 'Recommended — already built into your Supabase project',
    steps: [
      'In your Supabase dashboard go to <strong>Storage → Create bucket</strong>.',
      'Name it <code>contracts</code> and set it to <strong>Private</strong>.',
      'Run the storage RLS policies from the provided SQL script (the commented-out block at the bottom).',
      'That\'s it — no extra credentials needed. The existing Supabase connection is reused automatically.',
    ],
    fields: [], // no extra fields — uses existing Supabase client
  },
};

// ── State ─────────────────────────────────────────────────────
let state = {
  view: 'dashboard',
  contracts: [], parties: [], documents: [], clauses: [],
  milestones: [], renewals: [], financials: [], approvals: [], versions: [],
  selectedId: null,
  filter: { status:'', category:'', search:'' },
  listTab: 'all',
  detailTab: 'overview',
  previewDoc: null,   // document object being previewed
  linkedRecords: [],  // records loaded from the chosen linked module
  linkedRecordNames: {}, // cache: record_id → display name across all modules
};

let container;

// ── Boot ──────────────────────────────────────────────────────
async function init(el) {
  container = el;
  render();
  await Promise.all([loadContracts(), loadParties()]);
  render();
}

// ── Data loaders (direct Supabase via WorkVoltDB) ─────────────
async function loadContracts() {
  try { state.contracts = await db.list('contracts', {}, { order:'created_at' }); } catch(e) { state.contracts = []; }
}
async function loadParties() {
  try { state.parties = await db.list('contract_parties', {}, { order:'name', asc:true }); } catch(e) { state.parties = []; }
}
async function loadDocuments(cid) {
  try { state.documents  = await db.list('contract_documents',  { contract_id:cid }, { order:'created_at' }); } catch(e) { state.documents = []; }
}
async function loadClauses(cid) {
  try { state.clauses    = await db.list('contract_clauses',    { contract_id:cid }, { order:'created_at' }); } catch(e) { state.clauses = []; }
}
async function loadMilestones(cid) {
  try { state.milestones = await db.list('contract_milestones', { contract_id:cid }, { order:'date', asc:true }); } catch(e) { state.milestones = []; }
}
async function loadRenewals(cid) {
  const f = cid ? { contract_id:cid } : {};
  try { state.renewals   = await db.list('contract_renewals',   f, { order:'renewal_date', asc:true }); } catch(e) { state.renewals = []; }
}
async function loadFinancials(cid) {
  try { state.financials = await db.list('contract_financials', { contract_id:cid }, { order:'due_date', asc:true }); } catch(e) { state.financials = []; }
}
async function loadApprovals(cid) {
  const f = cid ? { contract_id:cid } : {};
  try { state.approvals  = await db.list('contract_approvals',  f, { order:'created_at' }); } catch(e) { state.approvals = []; }
}
async function loadVersions(cid) {
  try { state.versions   = await db.list('contract_versions',   { contract_id:cid }, { order:'created_at' }); } catch(e) { state.versions = []; }
}

// Load records from the chosen module for the linked record picker
async function loadLinkedRecords(module) {
  const cfg = MODULE_CONFIG[module];
  if (!cfg) { state.linkedRecords = []; return; }
  try {
    const rows = await db.list(cfg.table, {}, { order: cfg.nameField, asc: true, limit: 200 });
    state.linkedRecords = rows;
    // Cache id → name using the explicit idField per module
    rows.forEach(r => {
      const id = r[cfg.idField];
      if (id) state.linkedRecordNames[id] = r[cfg.nameField] || id;
    });
  } catch(e) { state.linkedRecords = []; }
}

// ── Computed dashboard stats (from loaded contracts) ──────────
function computeDashboard() {
  const cs = state.contracts;
  const now = new Date();
  const in90 = new Date(); in90.setDate(in90.getDate()+90);
  const active = cs.filter(c=>c.status==='Active');
  return {
    total:              cs.length,
    active:             active.length,
    draft:              cs.filter(c=>c.status==='Draft').length,
    expiring_90:        active.filter(c=>c.end_date&&new Date(c.end_date)<=in90&&new Date(c.end_date)>=now).length,
    total_active_value: active.reduce((s,c)=>s+(parseFloat(c.value)||0),0),
    by_status:          cs.reduce((m,c)=>{ m[c.status]=(m[c.status]||0)+1; return m; },{}),
    by_type:            cs.reduce((m,c)=>{ if(c.category){ m[c.category]=(m[c.category]||0)+1; } return m; },{}),
    expiring_list:      active.filter(c=>c.end_date&&new Date(c.end_date)<=in90&&new Date(c.end_date)>=now),
  };
}

// ── Master render ─────────────────────────────────────────────
function render() {
  container.innerHTML = `
    <style>
      .ch-page { font-family:'Plus Jakarta Sans',sans-serif; }
      .ch-tab  { cursor:pointer; padding:.45rem 1rem; border-radius:8px; font-size:.8rem; font-weight:600; color:#64748b; transition:.15s; }
      .ch-tab:hover { background:#f1f5f9; color:#1e293b; }
      .ch-tab.active { background:#2563eb; color:#fff; }
      .ch-view-tab { cursor:pointer; padding:.5rem .875rem; border-bottom:2px solid transparent; font-size:.8rem; font-weight:600; color:#64748b; transition:.15s; white-space:nowrap; }
      .ch-view-tab.active { border-bottom-color:#2563eb; color:#2563eb; }
      .ch-view-tab:hover:not(.active) { color:#1e293b; }
      .ch-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; }
      .ch-stat-card { background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; padding:1.25rem 1.5rem; }
      .ch-badge { display:inline-flex; align-items:center; gap:.35rem; padding:.25rem .7rem; border-radius:999px; font-size:.72rem; font-weight:700; }
      .ch-btn { display:inline-flex; align-items:center; gap:.4rem; padding:.55rem 1.1rem; border-radius:9px; font-size:.8rem; font-weight:600; cursor:pointer; border:none; transition:.15s; }
      .ch-btn-primary   { background:#2563eb; color:#fff; }
      .ch-btn-primary:hover   { background:#1d4ed8; }
      .ch-btn-secondary { background:#f1f5f9; color:#475569; }
      .ch-btn-secondary:hover { background:#e2e8f0; }
      .ch-btn-danger    { background:#fef2f2; color:#dc2626; }
      .ch-btn-danger:hover    { background:#fee2e2; }
      .ch-btn-success   { background:#f0fdf4; color:#16a34a; }
      .ch-btn-success:hover   { background:#dcfce7; }
      .ch-btn-ghost     { background:transparent; color:#64748b; border:1.5px solid #e2e8f0; }
      .ch-btn-ghost:hover     { background:#f8fafc; }
      .ch-input { width:100%; padding:.55rem .8rem; border:1.5px solid #e2e8f0; border-radius:9px; font-size:.8rem; outline:none; font-family:inherit; transition:.15s; background:#fff; }
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
      .ch-provider-card { border:2px solid #e2e8f0; border-radius:12px; padding:1rem; cursor:pointer; transition:.15s; }
      .ch-provider-card:hover { border-color:#3b82f6; background:#fafbff; }
      .ch-provider-card.active { border-color:#2563eb; background:#eff6ff; }
      .ch-step-num { width:22px; height:22px; border-radius:50%; background:#2563eb; color:#fff; font-size:.65rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      code { background:#f1f5f9; padding:.1rem .35rem; border-radius:4px; font-size:.75rem; font-family:monospace; }
    </style>
    <div class="ch-page p-6 max-w-[1400px] mx-auto">
      ${renderHeader()}
      ${state.view === 'dashboard' ? renderDashboard() :
        state.view === 'list'      ? renderList()      :
        state.view === 'detail'    ? renderDetail()    :
        state.view === 'parties'   ? renderParties()   :
        state.view === 'approvals' ? renderApprovalsView() :
        state.view === 'renewals'  ? renderRenewalsView()  :
        state.view === 'cloud'     ? renderCloudSetup() :
        renderDashboard()}
    </div>`;
  bindEvents();
}

// ── Header ────────────────────────────────────────────────────
function renderHeader() {
  const views = [
    {id:'dashboard', icon:'fa-th-large',      label:'Overview'},
    {id:'list',      icon:'fa-file-signature', label:'Contracts'},
    {id:'parties',   icon:'fa-building',       label:'Parties'},
    {id:'approvals', icon:'fa-check-double',   label:'Approvals'},
    {id:'renewals',  icon:'fa-redo',           label:'Renewals'},
    {id:'cloud',     icon:'fa-cloud',          label:'Cloud Storage'},
  ];
  const cfg = getCsConfig();
  const anyConnected = Object.keys(PROVIDER_META).some(k=>cfg[k+'_enabled']);
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
        ${anyConnected ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700"><i class="fas fa-cloud text-[9px]"></i>Cloud Storage Active</span>` : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 cursor-pointer" data-nav="cloud"><i class="fas fa-exclamation-circle text-[9px]"></i>Set up Cloud Storage</span>`}
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          ${views.map(v=>`<button class="ch-tab ${state.view===v.id?'active':''}" data-nav="${v.id}"><i class="fas ${v.icon} mr-1.5"></i>${v.label}</button>`).join('')}
        </div>
        <button class="ch-btn ch-btn-primary" id="ch-new-contract"><i class="fas fa-plus"></i>New Contract</button>
      </div>
    </div>`;
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDashboard() {
  const d  = computeDashboard();
  const cs = state.contracts;
  const recent = [...cs].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,6);
  const totalForPct = Object.values(d.by_status).reduce((s,v)=>s+v,0)||1;
  const kpis = [
    {label:'Total',          value:d.total,                          icon:'fa-file-signature',color:'text-blue-600',   bg:'bg-blue-50'},
    {label:'Active',         value:d.active,                         icon:'fa-check-circle',  color:'text-emerald-600',bg:'bg-emerald-50'},
    {label:'Expiring (90d)', value:d.expiring_90,                    icon:'fa-clock',         color:'text-amber-600',  bg:'bg-amber-50'},
    {label:'Active Value',   value:fmtCurrency(d.total_active_value),icon:'fa-dollar-sign',   color:'text-teal-600',   bg:'bg-teal-50'},
    {label:'Drafts',         value:d.draft,                          icon:'fa-edit',          color:'text-slate-600',  bg:'bg-slate-100'},
    {label:'Pending Approvals',value:state.approvals.filter(a=>a.status==='Pending').length,icon:'fa-hourglass-half',color:'text-violet-600',bg:'bg-violet-50'},
  ];
  return `
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      ${kpis.map(k=>`<div class="ch-stat-card flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 leading-tight">${k.label}</span>
          <div class="w-7 h-7 ${k.bg} rounded-lg flex items-center justify-center"><i class="fas ${k.icon} ${k.color} text-xs"></i></div>
        </div>
        <p class="text-2xl font-extrabold text-slate-900">${k.value}</p>
      </div>`).join('')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
      <div class="ch-card overflow-hidden">
        <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800"><i class="fas fa-chart-pie mr-2 text-blue-500"></i>By Status</h3></div>
        <div class="p-4 space-y-2.5">
          ${LIFECYCLE.map(s=>{
            const count=d.by_status[s]||0; if(!count) return '';
            const pct=Math.round((count/totalForPct)*100); const cfg=STATUS_CONFIG[s]||{};
            return `<div><div class="flex items-center justify-between mb-1"><span class="text-xs font-semibold text-slate-600">${s}</span><span class="text-xs font-bold text-slate-800">${count}</span></div><div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${cfg.dot||'bg-blue-400'}" style="width:${pct}%"></div></div></div>`;
          }).join('')}
          ${!cs.length?'<p class="text-xs text-slate-400 text-center py-4">No data yet</p>':''}
        </div>
      </div>
      <div class="ch-card overflow-hidden">
        <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800"><i class="fas fa-tags mr-2 text-indigo-500"></i>By Category</h3></div>
        <div class="p-4 space-y-2">
          ${Object.keys(d.by_type).length ? Object.entries(d.by_type).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-600 font-medium">${k}</span>
              <span class="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${v}</span>
            </div>`).join('') : '<p class="text-xs text-slate-400 text-center py-6">No contracts yet</p>'}
        </div>
      </div>
      <div class="ch-card overflow-hidden">
        <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800"><i class="fas fa-bell mr-2 text-amber-500"></i>Expiring Soon</h3></div>
        <div class="p-4 space-y-2 max-h-64 overflow-y-auto">
          ${d.expiring_list.map(c=>{
            const days=daysUntil(c.end_date);
            return `<div class="flex items-start gap-2.5 p-2.5 bg-red-50 rounded-lg border border-red-100">
              <i class="fas fa-clock text-red-500 text-xs mt-0.5"></i>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-red-700 truncate">${esc(c.title)}</p>
                <p class="text-[11px] text-red-500">Expires ${fmt(c.end_date)} · ${days<=0?'Overdue':`${days}d left`}</p>
              </div>
              <button class="ch-btn ch-btn-secondary py-0.5 px-2 text-[10px]" data-detail="${c.id}">View</button>
            </div>`;
          }).join('')}
          ${!d.expiring_list.length?`<div class="text-center py-6"><i class="fas fa-check-circle text-2xl text-emerald-300 mb-2"></i><p class="text-xs text-slate-400 font-medium">No contracts expiring soon</p></div>`:''}
        </div>
      </div>
    </div>
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header">
        <h3 class="text-sm font-bold text-slate-800"><i class="fas fa-history mr-2 text-slate-500"></i>Recent Contracts</h3>
        <button class="ch-btn ch-btn-secondary text-xs py-1.5" data-nav="list">View All</button>
      </div>
      <div class="overflow-x-auto">
        <table class="ch-table">
          <thead><tr><th>Title</th><th>Category</th><th>Value</th><th>End Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${recent.length ? recent.map(c=>{
              const cfg=STATUS_CONFIG[c.status]||{};
              const dv=daysUntil(c.end_date);
              return `<tr>
                <td><span class="font-semibold text-slate-800 cursor-pointer hover:text-blue-600" data-detail="${c.id}">${esc(c.title)}</span></td>
                <td>${c.category?`<span class="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${esc(c.category)}</span>`:'—'}</td>
                <td class="font-semibold">${fmtCurrency(c.value,c.currency)}</td>
                <td>${c.end_date?`<span class="${dv!==null&&dv<=30?'text-red-600 font-bold':''}">${fmt(c.end_date)}</span>`:'—'}</td>
                <td><span class="ch-badge ${cfg.bg||''} ${cfg.text||''}"><span class="w-1.5 h-1.5 rounded-full ${cfg.dot||'bg-slate-400'}"></span>${c.status||'—'}</span></td>
                <td><button class="ch-btn ch-btn-secondary py-1 text-xs" data-detail="${c.id}">Open</button></td>
              </tr>`;
            }).join('') : `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">No contracts yet — create your first one</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── LIST VIEW ─────────────────────────────────────────────────
function renderList() {
  const tabs = [
    {id:'all',label:'All'},{id:'active',label:'Active'},{id:'expiring',label:'Expiring Soon'},
    {id:'draft',label:'Drafts'},{id:'approval',label:'In Approval'},
  ];
  let rows = state.contracts;
  if (state.listTab==='active')   rows=rows.filter(r=>r.status==='Active');
  if (state.listTab==='draft')    rows=rows.filter(r=>r.status==='Draft');
  if (state.listTab==='approval') rows=rows.filter(r=>r.status==='Approval');
  if (state.listTab==='expiring') {
    const in90=new Date(); in90.setDate(in90.getDate()+90);
    rows=rows.filter(r=>r.status==='Active'&&r.end_date&&new Date(r.end_date)<=in90&&new Date(r.end_date)>=new Date());
  }
  if (state.filter.status)   rows=rows.filter(r=>r.status===state.filter.status);
  if (state.filter.category) rows=rows.filter(r=>r.category===state.filter.category);
  if (state.filter.search) {
    const q=state.filter.search.toLowerCase();
    rows=rows.filter(r=>(r.title||'').toLowerCase().includes(q)||(r.party_id||'').toLowerCase().includes(q)||(r.owner||'').toLowerCase().includes(q));
  }
  const count = id => {
    if(id==='active')   return state.contracts.filter(r=>r.status==='Active').length;
    if(id==='draft')    return state.contracts.filter(r=>r.status==='Draft').length;
    if(id==='approval') return state.contracts.filter(r=>r.status==='Approval').length;
    if(id==='expiring') { const in90=new Date();in90.setDate(in90.getDate()+90); return state.contracts.filter(r=>r.status==='Active'&&r.end_date&&new Date(r.end_date)<=in90&&new Date(r.end_date)>=new Date()).length; }
    return null;
  };
  return `
    <div class="ch-card overflow-hidden mb-4">
      <div class="flex items-center border-b border-slate-100 px-4 overflow-x-auto">
        ${tabs.map(t=>`<button class="ch-view-tab ${state.listTab===t.id?'active':''}" data-list-tab="${t.id}">${t.label}${count(t.id)!==null?`<span class="ml-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">${count(t.id)}</span>`:''}</button>`).join('')}
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
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header">
        <h3 class="text-sm font-bold text-slate-800">${rows.length} contract${rows.length!==1?'s':''}</h3>
        <button class="ch-btn ch-btn-primary" id="ch-new-contract"><i class="fas fa-plus"></i>New</button>
      </div>
      <div class="overflow-x-auto">
        <table class="ch-table">
          <thead><tr><th>Title</th><th>Category</th><th>Owner</th><th>Value</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(c=>{
              const cfg=STATUS_CONFIG[c.status]||{};
              const dv=daysUntil(c.end_date);
              const warn=dv!==null&&dv<=30&&c.status==='Active';
              return `<tr>
                <td><div class="flex items-center gap-2">${warn?'<i class="fas fa-exclamation-circle text-red-400 text-xs"></i>':''}<span class="font-semibold text-slate-800 cursor-pointer hover:text-blue-600" data-detail="${c.id}">${esc(c.title)}</span></div></td>
                <td>${c.category?`<span class="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${esc(c.category)}</span>`:'—'}</td>
                <td class="text-slate-500 text-xs">${esc(c.owner||'—')}</td>
                <td class="font-semibold text-sm">${fmtCurrency(c.value,c.currency)}</td>
                <td class="text-xs text-slate-500">${fmt(c.start_date)}</td>
                <td class="text-xs ${warn?'text-red-600 font-bold':''}">${fmt(c.end_date)}</td>
                <td><span class="ch-badge ${cfg.bg||''} ${cfg.text||''}"><span class="w-1.5 h-1.5 rounded-full ${cfg.dot||'bg-slate-400'}"></span>${c.status||'—'}</span></td>
                <td><div class="flex gap-1">
                  <button class="ch-btn ch-btn-secondary py-1 text-xs" data-detail="${c.id}"><i class="fas fa-eye"></i></button>
                  <button class="ch-btn ch-btn-secondary py-1 text-xs" data-edit="${c.id}"><i class="fas fa-pen"></i></button>
                  <button class="ch-btn ch-btn-danger py-1 text-xs" data-delete="${c.id}"><i class="fas fa-trash"></i></button>
                </div></td>
              </tr>`;
            }).join('') : `<tr><td colspan="8" class="text-center py-12 text-slate-400 text-sm"><i class="fas fa-file-signature text-3xl mb-3 block opacity-30"></i>No contracts found</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── DETAIL VIEW ───────────────────────────────────────────────
function renderDetail() {
  const c = state.contracts.find(x=>x.id===state.selectedId);
  if (!c) return `<div class="text-center py-20"><p class="text-slate-400">Contract not found.</p></div>`;
  const cfg    = STATUS_CONFIG[c.status]||{};
  const curIdx = LIFECYCLE.indexOf(c.status);
  const tabs   = [
    {id:'overview',   label:'Overview',   icon:'fa-info-circle'},
    {id:'documents',  label:'Documents',  icon:'fa-folder-open'},
    {id:'clauses',    label:'Clauses',    icon:'fa-gavel'},
    {id:'milestones', label:'Milestones', icon:'fa-flag'},
    {id:'financials', label:'Financials', icon:'fa-dollar-sign'},
    {id:'approvals',  label:'Approvals',  icon:'fa-check-double'},
    {id:'renewals',   label:'Renewals',   icon:'fa-redo'},
    {id:'versions',   label:'Versions',   icon:'fa-code-branch'},
  ];
  return `
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
        ${curIdx < LIFECYCLE.length-1 ? `<button class="ch-btn ch-btn-primary" data-advance="${c.id}"><i class="fas fa-arrow-right"></i>Advance to ${LIFECYCLE[curIdx+1]}</button>` : ''}
      </div>
    </div>
    <div class="ch-card p-4 mb-5 overflow-x-auto">
      <div class="flex min-w-[700px]">
        ${LIFECYCLE.map((s,i)=>{
          const done=i<curIdx; const current=i===curIdx; const cfg2=STATUS_CONFIG[s]||{};
          return `<div class="ch-lifecycle-step">
            <div class="ch-lifecycle-dot ${done?'bg-emerald-500':current?cfg2.dot||'bg-blue-500':'border-2 border-slate-200 bg-white'}">
              ${done?'<i class="fas fa-check text-white text-[8px]"></i>':current?'<div class="w-2 h-2 bg-white rounded-full"></div>':''}
            </div>
            <span class="text-[10px] font-bold ${current?'text-blue-600':done?'text-emerald-600':'text-slate-400'} text-center leading-tight">${s}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="ch-card overflow-hidden">
      <div class="flex border-b border-slate-100 overflow-x-auto">
        ${tabs.map(t=>`<button class="ch-view-tab ${state.detailTab===t.id?'active':''}" data-detail-tab="${t.id}"><i class="fas ${t.icon} mr-1.5"></i>${t.label}</button>`).join('')}
      </div>
      <div class="p-5">
        ${state.detailTab==='overview'   ? renderOverviewTab(c)         :
          state.detailTab==='documents'  ? renderDocumentsTab(c)        :
          state.detailTab==='clauses'    ? renderClausesTab(c)          :
          state.detailTab==='milestones' ? renderMilestonesTab(c)       :
          state.detailTab==='financials' ? renderFinancialsTab(c)       :
          state.detailTab==='approvals'  ? renderDetailApprovalsTab(c)  :
          state.detailTab==='renewals'   ? renderDetailRenewalsTab(c)   :
          state.detailTab==='versions'   ? renderVersionsTab(c)         : ''}
      </div>
    </div>`;
}

function renderOverviewTab(c) {
  const party   = state.parties.find(p=>p.id===c.party_id);
  const modCfg  = c.linked_module ? MODULE_CONFIG[c.linked_module] : null;
  const recName = c.linked_record_id ? (state.linkedRecordNames[c.linked_record_id] || c.linked_record_id) : null;

  const fields = [
    ['Title',c.title],['Category',c.category],['Status',c.status],
    ['Owner',c.owner],['Department',c.department],
    ['Party',party?`${party.name} (${party.type})`:c.party_id],
    ['Start Date',fmt(c.start_date)],['End Date',fmt(c.end_date)],
    ['Contract Value',fmtCurrency(c.value,c.currency)],['Currency',c.currency],
    ['Renewal Type',c.renewal_type],['Renewal Date',fmt(c.renewal_date)],
    ['Notice Period',c.notice_period_days?c.notice_period_days+' days':''],
    ['Notes',c.notes],['Created',fmt(c.created_at)],['Updated',fmt(c.updated_at)],
  ];

  const linkedModuleHtml = modCfg ? `
    <div class="border-b border-slate-50 pb-3">
      <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Linked Module</p>
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700">
        <i class="fas ${modCfg.icon} text-[10px]"></i>${esc(modCfg.label)}
      </span>
    </div>` : '';

  const linkedRecordHtml = recName ? `
    <div class="border-b border-slate-50 pb-3">
      <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Linked Record</p>
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-700">
        <i class="fas fa-link text-[10px]"></i>${esc(recName)}
      </span>
    </div>` : '';

  return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
    ${fields.filter(([,v])=>v&&v!=='—').map(([l,v])=>`
      <div class="border-b border-slate-50 pb-3">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${l}</p>
        <p class="text-sm font-semibold text-slate-800">${esc(v)}</p>
      </div>`).join('')}
    ${linkedModuleHtml}
    ${linkedRecordHtml}
  </div>`;
}

// ── DOCUMENTS TAB (with cloud storage pickers) ────────────────
function renderDocumentsTab(c) {
  const docs = state.documents;
  const cfg  = getCsConfig();
  const anyEnabled = Object.keys(PROVIDER_META).some(k=>cfg[k+'_enabled']);

  // If no provider is set up yet → show recommendation banner
  const recommendBanner = !anyEnabled ? `
    <div class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
      <i class="fas fa-lightbulb text-amber-500 mt-0.5 text-sm"></i>
      <div class="flex-1">
        <p class="text-sm font-bold text-amber-800 mb-0.5">💡 Recommended: Connect a Cloud Storage provider</p>
        <p class="text-xs text-amber-700 mb-2">Store actual contract files on Google Drive, OneDrive, Dropbox, or Supabase Storage — and link them here for one-click access and inline previews. For most teams, <strong>Supabase Storage</strong> is the easiest since it reuses your existing database connection with zero extra setup.</p>
        <button class="ch-btn ch-btn-secondary py-1 text-xs" data-nav="cloud"><i class="fas fa-cloud mr-1.5"></i>Set Up Cloud Storage</button>
      </div>
    </div>` : '';

  // Provider picker buttons — only show enabled ones + always show URL paste
  const pickerButtons = `
    <div class="flex flex-wrap gap-2 mb-3">
      ${cfg.google_drive_enabled ? `<button class="ch-btn ch-btn-secondary text-xs py-1.5" id="pick-gdrive"><i class="fab fa-google-drive text-green-600 mr-1"></i>Google Drive</button>` : ''}
      ${cfg.onedrive_enabled     ? `<button class="ch-btn ch-btn-secondary text-xs py-1.5" id="pick-onedrive"><i class="fab fa-microsoft text-blue-600 mr-1"></i>OneDrive</button>` : ''}
      ${cfg.dropbox_enabled      ? `<button class="ch-btn ch-btn-secondary text-xs py-1.5" id="pick-dropbox"><i class="fab fa-dropbox text-sky-500 mr-1"></i>Dropbox</button>` : ''}
      ${cfg.supabase_enabled     ? `<button class="ch-btn ch-btn-secondary text-xs py-1.5" id="pick-upload"><i class="fas fa-upload text-teal-600 mr-1"></i>Upload File</button><input type="file" id="doc-file-input" class="hidden" accept=".pdf,.doc,.docx,.xlsx,.png,.jpg">` : ''}
    </div>`;

  return `
    ${recommendBanner}
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-folder-open mr-2 text-amber-500"></i>${docs.length} Documents</h4>
      <button class="ch-btn ch-btn-primary" id="add-doc"><i class="fas fa-plus"></i>Add Document</button>
    </div>

    <div id="doc-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
      ${pickerButtons}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label class="ch-label">Type</label><select class="ch-input" id="doc-type">${DOC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="ch-label">Title</label><input class="ch-input" id="doc-title" placeholder="Document title"></div>
        <div class="md:col-span-2"><label class="ch-label">File URL <span class="normal-case font-normal">(or use a picker above)</span></label><input class="ch-input" id="doc-url" placeholder="https://drive.google.com/… or any link"></div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <div><label class="ch-label">Version</label><input class="ch-input" id="doc-version" placeholder="1.0"></div>
        <input type="hidden" id="doc-provider">
        <input type="hidden" id="doc-file-id">
      </div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-doc"><i class="fas fa-save"></i>Save Document</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-doc">Cancel</button>
      </div>
    </div>

    <!-- Preview panel -->
    ${state.previewDoc ? renderDocPreview(state.previewDoc) : ''}

    ${docs.length ? `<div class="space-y-2">
      ${docs.map(d=>{
        const providerIcon = {
          google_drive:'fab fa-google-drive text-green-600',
          onedrive:'fab fa-microsoft text-blue-600',
          dropbox:'fab fa-dropbox text-sky-500',
          supabase:'fas fa-database text-teal-600',
        }[d.storage_provider] || 'fas fa-link text-slate-400';
        return `<div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
              <i class="${providerIcon} text-sm"></i>
            </div>
            <div>
              <p class="text-sm font-bold text-slate-800">${esc(d.title||d.doc_type||'Untitled')}</p>
              <p class="text-xs text-slate-400">${esc(d.doc_type||'')} · v${esc(d.version||'1.0')} · ${fmt(d.created_at)}</p>
            </div>
          </div>
          <div class="flex gap-2">
            ${d.file_url ? `
              <button class="ch-btn ch-btn-secondary py-1 text-xs" data-preview-doc='${JSON.stringify({id:d.id,title:d.title||d.doc_type,file_url:d.file_url,storage_provider:d.storage_provider,storage_file_id:d.storage_file_id}).replace(/'/g,"&#39;")}'>
                <i class="fas fa-eye"></i>Preview
              </button>
              <a href="${esc(d.file_url)}" target="_blank" class="ch-btn ch-btn-secondary py-1 text-xs"><i class="fas fa-external-link-alt"></i>Open</a>` : ''}
            <button class="ch-btn ch-btn-danger py-1 text-xs" data-del-doc="${d.id}"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('')}
    </div>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-folder-open text-2xl mb-2 block opacity-30"></i>No documents yet</div>`}`;
}

function renderDocPreview(doc) {
  let previewHtml = '';
  if (doc.storage_provider === 'google_drive' && doc.storage_file_id) {
    previewHtml = `<iframe src="https://drive.google.com/file/d/${esc(doc.storage_file_id)}/preview" class="w-full" style="height:500px;border:none;border-radius:8px;" allowfullscreen></iframe>`;
  } else if (doc.storage_provider === 'onedrive' && doc.file_url) {
    const embedUrl = doc.file_url.replace('view.aspx','preview.aspx');
    previewHtml = `<iframe src="${esc(embedUrl)}" class="w-full" style="height:500px;border:none;border-radius:8px;"></iframe>`;
  } else if (doc.file_url && (doc.file_url.endsWith('.pdf') || doc.storage_provider === 'supabase')) {
    previewHtml = `<iframe src="${esc(doc.file_url)}" class="w-full" style="height:500px;border:none;border-radius:8px;"></iframe>`;
  } else {
    previewHtml = `<div class="text-center py-10"><i class="fas fa-file-alt text-3xl text-slate-300 mb-3"></i><p class="text-sm text-slate-500 mb-3">Inline preview not available for this file type.</p><a href="${esc(doc.file_url||'#')}" target="_blank" class="ch-btn ch-btn-primary"><i class="fas fa-external-link-alt"></i>Open in new tab</a></div>`;
  }
  return `
    <div class="ch-card overflow-hidden mb-4">
      <div class="ch-section-header">
        <h4 class="text-sm font-bold text-slate-800"><i class="fas fa-eye mr-2 text-blue-500"></i>${esc(doc.title||'Preview')}</h4>
        <button class="ch-btn ch-btn-secondary py-1 text-xs" id="close-preview"><i class="fas fa-times"></i>Close</button>
      </div>
      <div class="p-3">${previewHtml}</div>
    </div>`;
}

function renderClausesTab(c) {
  const clauses = state.clauses;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-gavel mr-2 text-violet-500"></i>${clauses.length} Clauses</h4>
      <button class="ch-btn ch-btn-primary" id="add-clause"><i class="fas fa-plus"></i>Add Clause</button>
    </div>
    <div id="clause-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
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

function renderMilestonesTab() {
  const milestones = state.milestones;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-flag mr-2 text-teal-500"></i>${milestones.length} Milestones</h4>
      <button class="ch-btn ch-btn-primary" id="add-milestone"><i class="fas fa-plus"></i>Add Milestone</button>
    </div>
    <div id="milestone-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
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
        const dv=daysUntil(m.date);
        return `<div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.status==='Completed'?'bg-emerald-100 text-emerald-600':dv!==null&&dv<0?'bg-red-100 text-red-600':'bg-blue-50 text-blue-600'}">
              <i class="fas ${m.status==='Completed'?'fa-check':dv!==null&&dv<0?'fa-exclamation':'fa-flag'}"></i>
            </div>
            <div>
              <p class="text-sm font-bold text-slate-800">${esc(m.event)}</p>
              <p class="text-xs text-slate-400">${fmt(m.date)} ${m.assigned_to?`· ${esc(m.assigned_to)}`:''}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${dv!==null?`<span class="text-xs font-semibold ${dv<0?'text-red-600':dv<=7?'text-amber-600':'text-slate-500'}">${dv<0?Math.abs(dv)+'d overdue':dv===0?'Today':'In '+dv+'d'}</span>`:''}
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
        ${fin.length?`<p class="text-xs text-slate-500 mt-0.5">Total: <strong>${fmtCurrency(total,c.currency)}</strong></p>`:''}
      </div>
      <button class="ch-btn ch-btn-primary" id="add-financial"><i class="fas fa-plus"></i>Add Payment Term</button>
    </div>
    <div id="financial-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
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
          <td>${fmtCurrency(f.amount,f.currency||c.currency)}</td>
          <td>${esc(f.frequency)}</td>
          <td>${fmt(f.due_date)}</td>
          <td>${f.status?`<span class="ch-badge ${f.status==='Paid'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}">${esc(f.status)}</span>`:'—'}</td>
          <td><button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-del-fin="${f.id}"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-dollar-sign text-2xl mb-2 block opacity-30"></i>No payment terms yet</div>`}`;
}

function renderDetailApprovalsTab() {
  const apps = state.approvals;
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-check-double mr-2 text-violet-500"></i>${apps.length} Approvals</h4>
      <button class="ch-btn ch-btn-primary" id="add-approval"><i class="fas fa-plus"></i>Request Approval</button>
    </div>
    <div id="approval-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
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
        const aMap={Pending:{bg:'bg-amber-50',text:'text-amber-700',icon:'fa-hourglass-half'},Approved:{bg:'bg-emerald-50',text:'text-emerald-700',icon:'fa-check-circle'},Rejected:{bg:'bg-red-50',text:'text-red-600',icon:'fa-times-circle'}};
        const ac=aMap[a.status]||{bg:'bg-slate-50',text:'text-slate-700',icon:'fa-circle'};
        return `<div class="flex items-start justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 ${ac.bg} rounded-full flex items-center justify-center"><i class="fas ${ac.icon} ${ac.text} text-sm"></i></div>
            <div>
              <p class="text-sm font-bold text-slate-800">${esc(a.approver)}</p>
              <p class="text-xs text-slate-400">${esc(a.role||'—')} ${a.approved_at?`· ${fmt(a.approved_at)}`:''}</p>
              ${a.comments?`<p class="text-xs text-slate-600 mt-1 italic">"${esc(a.comments)}"</p>`:''}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="ch-badge ${ac.bg} ${ac.text}">${a.status}</span>
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
    <div id="renewal-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
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
      <thead><tr><th>Date</th><th>Type</th><th>New Value</th><th>Status</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${renewals.map(r=>`<tr>
          <td>${fmt(r.renewal_date)}</td>
          <td>${esc(r.type)}</td>
          <td>${r.new_value?fmtCurrency(r.new_value,c.currency):'—'}</td>
          <td><span class="ch-badge ${r.status==='Completed'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}">${esc(r.status)}</span></td>
          <td class="text-xs text-slate-400">${esc(r.notes||'—')}</td>
          <td><div class="flex gap-1">
            ${r.status==='Pending'?`<button class="ch-btn ch-btn-success py-0.5 px-2 text-xs" data-complete-ren="${r.id}"><i class="fas fa-check"></i>Done</button>`:''}
            <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs" data-del-ren="${r.id}"><i class="fas fa-trash"></i></button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="text-center py-10 text-slate-400 text-sm"><i class="fas fa-redo text-2xl mb-2 block opacity-30"></i>No renewals yet</div>`}`;
}

function renderVersionsTab() {
  const vers = state.versions;
  const cfg  = getCsConfig();
  const anyEnabled = Object.keys(PROVIDER_META).some(k=>cfg[k+'_enabled']);
  return `
    <div class="flex justify-between items-center mb-4">
      <h4 class="text-sm font-bold text-slate-700"><i class="fas fa-code-branch mr-2 text-blue-500"></i>${vers.length} Versions</h4>
      <button class="ch-btn ch-btn-primary" id="add-version"><i class="fas fa-plus"></i>Add Version</button>
    </div>
    <div id="version-form" class="hidden ch-card p-4 mb-4 bg-slate-50">
      ${anyEnabled&&cfg.supabase_enabled?`<div class="flex gap-2 mb-3"><button class="ch-btn ch-btn-secondary text-xs py-1.5" id="ver-upload"><i class="fas fa-upload text-teal-600 mr-1"></i>Upload File</button><input type="file" id="ver-file-input" class="hidden"></div>`:''}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div><label class="ch-label">Version No.</label><input class="ch-input" id="ver-num" placeholder="e.g. 1.1"></div>
        <div><label class="ch-label">Title</label><input class="ch-input" id="ver-title" placeholder="Version title"></div>
        <div><label class="ch-label">Changed By</label><input class="ch-input" id="ver-by" placeholder="Name"></div>
        <div><label class="ch-label">File URL</label><input class="ch-input" id="ver-url" placeholder="https://…"></div>
        <input type="hidden" id="ver-provider">
      </div>
      <div class="mb-3"><label class="ch-label">Change Summary</label><textarea class="ch-input h-16 resize-none" id="ver-summary" placeholder="What changed…"></textarea></div>
      <div class="flex gap-2">
        <button class="ch-btn ch-btn-primary" id="save-version"><i class="fas fa-save"></i>Save</button>
        <button class="ch-btn ch-btn-secondary" id="cancel-version">Cancel</button>
      </div>
    </div>
    ${vers.length ? `<div class="space-y-2">
      ${vers.map((v,i)=>`<div class="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50">
        <div class="w-8 h-8 ${i===0?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500'} rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">v${esc(v.version||'?')}</div>
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
          <div><label class="ch-label">Phone</label><input class="ch-input" id="party-phone" placeholder="+1 …"></div>
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
  const apps     = state.approvals;
  const pending  = apps.filter(a=>a.status==='Pending');
  const approved = apps.filter(a=>a.status==='Approved');
  const rejected = apps.filter(a=>a.status==='Rejected');
  return `
    <div class="grid grid-cols-3 gap-4 mb-5">
      ${[['Pending',pending,'bg-amber-50 border-amber-200','text-amber-700','fa-hourglass-half'],
         ['Approved',approved,'bg-emerald-50 border-emerald-200','text-emerald-700','fa-check-circle'],
         ['Rejected',rejected,'bg-red-50 border-red-200','text-red-700','fa-times-circle']].map(([label,rows,bg,tc,icon])=>`
        <div class="ch-card border ${bg} p-4">
          <div class="flex items-center gap-2 mb-1"><i class="fas ${icon} ${tc}"></i><span class="text-sm font-bold ${tc}">${label}</span></div>
          <p class="text-3xl font-extrabold ${tc}">${rows.length}</p>
        </div>`).join('')}
    </div>
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800">All Approvals</h3></div>
      <table class="ch-table">
        <thead><tr><th>Contract</th><th>Approver</th><th>Role</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${apps.length ? apps.map(a=>{
            const contract=state.contracts.find(c=>c.id===a.contract_id);
            const aMap={Pending:{bg:'bg-amber-50',text:'text-amber-700'},Approved:{bg:'bg-emerald-50',text:'text-emerald-700'},Rejected:{bg:'bg-red-50',text:'text-red-600'}};
            const ac=aMap[a.status]||{};
            return `<tr>
              <td><span class="font-semibold text-slate-800 text-xs">${esc(contract?.title||a.contract_id)}</span></td>
              <td class="font-semibold text-sm">${esc(a.approver)}</td>
              <td class="text-xs text-slate-500">${esc(a.role||'—')}</td>
              <td><span class="ch-badge ${ac.bg||''} ${ac.text||''}">${a.status}</span></td>
              <td class="text-xs text-slate-400">${a.approved_at?fmt(a.approved_at):'—'}</td>
              <td>${a.status==='Pending'?`
                <button class="ch-btn ch-btn-success py-0.5 px-2 text-xs" data-approve-app="${a.id}"><i class="fas fa-check"></i></button>
                <button class="ch-btn ch-btn-danger py-0.5 px-2 text-xs ml-1" data-reject-app="${a.id}"><i class="fas fa-times"></i></button>`:'—'}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">No approvals yet</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ── RENEWALS VIEW ─────────────────────────────────────────────
function renderRenewalsView() {
  const renewals = state.renewals;
  return `
    <div class="ch-card overflow-hidden">
      <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800"><i class="fas fa-redo mr-2 text-teal-500"></i>Upcoming Renewals</h3></div>
      <table class="ch-table">
        <thead><tr><th>Contract</th><th>Renewal Date</th><th>Type</th><th>New Value</th><th>Status</th><th>Days Left</th></tr></thead>
        <tbody>
          ${renewals.length ? renewals.map(r=>{
            const contract=state.contracts.find(c=>c.id===r.contract_id);
            const dv=daysUntil(r.renewal_date);
            return `<tr>
              <td><span class="font-semibold text-slate-800 cursor-pointer hover:text-blue-600" data-detail="${r.contract_id}">${esc(contract?.title||r.contract_id)}</span></td>
              <td>${fmt(r.renewal_date)}</td>
              <td>${esc(r.type)}</td>
              <td>${r.new_value?fmtCurrency(r.new_value):'—'}</td>
              <td><span class="ch-badge ${r.status==='Completed'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}">${esc(r.status)}</span></td>
              <td><span class="text-sm font-bold ${dv!==null&&dv<=7?'text-red-600':dv!==null&&dv<=30?'text-amber-600':'text-slate-600'}">${dv!==null?(dv<0?Math.abs(dv)+'d overdue':dv===0?'Today':dv+'d'):'—'}</span></td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">No upcoming renewals</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ── CLOUD STORAGE SETUP VIEW ──────────────────────────────────
function renderCloudSetup() {
  const cfg = getCsConfig();
  const selProvider = state.cloudProvider || 'supabase'; // default to recommended
  const meta = PROVIDER_META[selProvider];

  const providerCards = Object.entries(PROVIDER_META).map(([key, m]) => {
    const isEnabled = cfg[key+'_enabled'];
    const isSelected = selProvider === key;
    return `<div class="ch-provider-card ${isSelected?'active':''}" data-select-provider="${key}">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <i class="${m.icon} ${m.color} text-lg"></i>
          <span class="text-sm font-bold text-slate-800">${m.label}</span>
        </div>
        ${isEnabled ? '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><i class="fas fa-check-circle"></i>Connected</span>' : ''}
        ${key==='supabase'?'<span class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">⭐ Recommended</span>':''}
      </div>
      <p class="text-xs text-slate-500">${m.recommended_for}</p>
    </div>`;
  }).join('');

  // Setup steps for the selected provider
  const steps = meta.steps.map((s, i) => `
    <div class="flex items-start gap-3">
      <span class="ch-step-num">${i+1}</span>
      <p class="text-sm text-slate-700 leading-relaxed">${s}</p>
    </div>`).join('');

  // Credential fields
  const fields = meta.fields.map(f => `
    <div>
      <label class="ch-label">${f.label}</label>
      <input type="${f.type}" class="ch-input" id="cs-field-${f.key}" value="${esc(cfg[f.key]||'')}" placeholder="${esc(f.placeholder)}">
    </div>`).join('');

  const isCurrentlyEnabled = cfg[selProvider+'_enabled'];

  return `
    <div class="mb-6">
      <h2 class="text-lg font-extrabold text-slate-900 mb-1">Cloud Storage Setup</h2>
      <p class="text-sm text-slate-500">Connect a cloud storage provider to attach and preview real contract files directly inside the Contract Hub. Files stay in your chosen service — Work Volt only stores the link and provider metadata.</p>
    </div>

    <!-- Recommended approach banner -->
    <div class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl mb-6 flex items-start gap-3">
      <i class="fas fa-star text-blue-500 mt-0.5"></i>
      <div>
        <p class="text-sm font-bold text-blue-900 mb-1">⭐ Our recommendation for most teams: Supabase Storage</p>
        <p class="text-xs text-blue-700">Since you already have Supabase connected as your database, Supabase Storage reuses the same project and connection — no extra accounts, no OAuth setup, just create a bucket and go. Choose Google Drive or OneDrive only if your team already stores files there.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Provider selector -->
      <div class="space-y-3">
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Choose Provider</h3>
        ${providerCards}
      </div>

      <!-- Setup guide + credential form -->
      <div class="lg:col-span-2 ch-card overflow-hidden">
        <div class="ch-section-header">
          <div class="flex items-center gap-2">
            <i class="${meta.icon} ${meta.color} text-lg"></i>
            <h3 class="text-sm font-bold text-slate-800">${meta.label} Setup Guide</h3>
          </div>
          ${isCurrentlyEnabled ? `<span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200"><i class="fas fa-check-circle"></i>Connected</span>` : `<span class="text-xs text-slate-400">Not configured</span>`}
        </div>
        <div class="p-5">
          <!-- Steps -->
          <div class="space-y-3 mb-6">
            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Setup Steps</h4>
            ${steps}
          </div>

          ${meta.fields.length ? `
          <!-- Credentials form -->
          <div class="border-t border-slate-100 pt-5 mb-5">
            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Your Credentials</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              ${fields}
            </div>
          </div>` : `
          <!-- Supabase: no extra credentials needed -->
          <div class="border-t border-slate-100 pt-5 mb-5">
            <div class="p-3 bg-teal-50 border border-teal-200 rounded-lg">
              <p class="text-xs font-bold text-teal-800 mb-1"><i class="fas fa-info-circle mr-1"></i>No extra credentials needed</p>
              <p class="text-xs text-teal-700">Supabase Storage reuses the database connection you already set up. Just make sure you've created the <code>contracts</code> bucket in your Supabase dashboard (Storage → New bucket → name: <code>contracts</code>, Private).</p>
            </div>
          </div>`}

          <!-- Enable / Disable toggle -->
          <div class="flex items-center gap-3">
            <button class="ch-btn ch-btn-primary" id="cs-save">
              <i class="fas fa-${isCurrentlyEnabled?'check':'plug'}"></i>
              ${isCurrentlyEnabled ? 'Update & Keep Connected' : `Connect ${meta.label}`}
            </button>
            ${isCurrentlyEnabled ? `<button class="ch-btn ch-btn-danger" id="cs-disconnect"><i class="fas fa-unlink"></i>Disconnect</button>` : ''}
            <span class="text-xs text-slate-400" id="cs-status-msg"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- All providers status summary -->
    <div class="ch-card overflow-hidden mt-6">
      <div class="ch-section-header"><h3 class="text-sm font-bold text-slate-800">Connection Status</h3></div>
      <div class="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
        ${Object.entries(PROVIDER_META).map(([key,m])=>{
          const enabled = cfg[key+'_enabled'];
          return `<div class="p-4 text-center">
            <i class="${m.icon} ${enabled?m.color:'text-slate-300'} text-xl mb-2 block"></i>
            <p class="text-xs font-bold ${enabled?'text-slate-800':'text-slate-400'}">${m.label}</p>
            <p class="text-[10px] font-semibold mt-1 ${enabled?'text-emerald-600':'text-slate-300'}">${enabled?'● Connected':'○ Not set up'}</p>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── CONTRACT FORM MODAL ───────────────────────────────────────
function openContractForm(existing) {
  const c = existing || {};
  const isEdit = !!c.id;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-start justify-center p-4 pt-10';
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" id="modal-overlay"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
        <h3 class="text-base font-extrabold text-slate-900">${isEdit?'Edit':'New'} Contract</h3>
        <button id="close-modal" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2"><label class="ch-label">Contract Title *</label><input class="ch-input" id="f-title" value="${esc(c.title||'')}" placeholder="e.g. IT Support Agreement 2026"></div>
        <div><label class="ch-label">Category</label><select class="ch-input" id="f-category">${CATEGORIES.map(x=>`<option ${c.category===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label class="ch-label">Status</label><select class="ch-input" id="f-status">${LIFECYCLE.map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="ch-label">Party</label><select class="ch-input" id="f-party">
          <option value="">— None —</option>
          ${state.parties.map(p=>`<option value="${esc(p.id)}" ${c.party_id===p.id?'selected':''}>${esc(p.name)} (${esc(p.type)})</option>`).join('')}
        </select></div>
        <div><label class="ch-label">Owner</label><input class="ch-input" id="f-owner" value="${esc(c.owner||'')}" placeholder="Internal owner name"></div>
        <div><label class="ch-label">Department</label><select class="ch-input" id="f-dept"><option value="">Select…</option>${DEPARTMENTS.map(d=>`<option ${c.department===d?'selected':''}>${d}</option>`).join('')}</select></div>
        <div><label class="ch-label">Contract Value</label><input type="number" class="ch-input" id="f-value" value="${esc(c.value||'')}" placeholder="0"></div>
        <div><label class="ch-label">Currency</label><select class="ch-input" id="f-currency">${CURRENCIES.map(cu=>`<option ${c.currency===cu?'selected':''}>${cu}</option>`).join('')}</select></div>
        <div><label class="ch-label">Start Date</label><input type="date" class="ch-input" id="f-start" value="${c.start_date?String(c.start_date).slice(0,10):''}"></div>
        <div><label class="ch-label">End Date</label><input type="date" class="ch-input" id="f-end" value="${c.end_date?String(c.end_date).slice(0,10):''}"></div>
        <div><label class="ch-label">Renewal Type</label><select class="ch-input" id="f-renewal-type"><option value="">None</option>${RENEWAL_TYPES.map(r=>`<option ${c.renewal_type===r?'selected':''}>${r}</option>`).join('')}</select></div>
        <div><label class="ch-label">Renewal Date</label><input type="date" class="ch-input" id="f-renewal-date" value="${c.renewal_date?String(c.renewal_date).slice(0,10):''}"></div>
        <div><label class="ch-label">Notice Period (days)</label><input type="number" class="ch-input" id="f-notice" value="${esc(c.notice_period_days||'')}" placeholder="30"></div>
        <div><label class="ch-label">Link to Module</label><select class="ch-input" id="f-linked-mod">
          <option value="None" ${!c.linked_module||c.linked_module==='None'?'selected':''}>None</option>
          ${Object.entries(MODULE_CONFIG).map(([key,m])=>`<option value="${key}" ${c.linked_module===key?'selected':''}>${m.label}</option>`).join('')}
        </select></div>
        <div id="f-linked-rec-wrap">
          <label class="ch-label">Linked Record</label>
          <div id="f-linked-rec-loading" class="hidden text-xs text-slate-400 py-2"><i class="fas fa-spinner fa-spin mr-1"></i>Loading records…</div>
          <select class="ch-input" id="f-linked-rec-select" style="display:${c.linked_module&&c.linked_module!=='None'?'block':'none'}">
            <option value="">— Select a record —</option>
          </select>
          <input class="ch-input" id="f-linked-rec-input" placeholder="No module selected" style="display:${c.linked_module&&c.linked_module!=='None'?'none':'block'}" disabled>
          <input type="hidden" id="f-linked-rec" value="${esc(isUUID(c.linked_record_id) ? c.linked_record_id : '')}">
          <input type="hidden" id="f-linked-rec-name" value="${esc(isUUID(c.linked_record_id) ? (state.linkedRecordNames[c.linked_record_id] || '') : '')}">
        </div>
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

  // ── Linked module → record picker ────────────────────────────
  const modSelect    = modal.querySelector('#f-linked-mod');
  const recSelect    = modal.querySelector('#f-linked-rec-select');
  const recInput     = modal.querySelector('#f-linked-rec-input');
  const recHidden    = modal.querySelector('#f-linked-rec');
  const recNameHid   = modal.querySelector('#f-linked-rec-name');
  const recLoading   = modal.querySelector('#f-linked-rec-loading');

  async function populateRecordPicker(module, currentId) {
    if (!module || module === 'None') {
      recSelect.style.display = 'none';
      recInput.style.display  = 'block';
      recSelect.innerHTML     = '<option value="">— Select a record —</option>';
      recHidden.value         = '';
      recNameHid.value        = '';
      return;
    }
    recLoading.classList.remove('hidden');
    recSelect.style.display = 'none';
    recInput.style.display  = 'none';
    await loadLinkedRecords(module);
    recLoading.classList.add('hidden');

    const cfg = MODULE_CONFIG[module];
    recSelect.innerHTML = '<option value="">— Select a record —</option>' +
      state.linkedRecords.map(r => {
        const id   = r[cfg.idField];
        const name = r[cfg.nameField] || id;
        const sel  = id === currentId ? 'selected' : '';
        return `<option value="${esc(id)}" data-name="${esc(name)}" ${sel}>${esc(name)}</option>`;
      }).join('');

    recSelect.style.display = 'block';

    // If editing and we have a currentId, pre-select it
    if (currentId) {
      recHidden.value  = currentId;
      const opt = recSelect.querySelector(`option[value="${CSS.escape(currentId)}"]`);
      recNameHid.value = opt ? opt.dataset.name : state.linkedRecordNames[currentId] || currentId;
    }
  }

  recSelect.addEventListener('change', () => {
    const opt = recSelect.options[recSelect.selectedIndex];
    recHidden.value  = opt.value;
    recNameHid.value = opt.dataset?.name || opt.text;
  });

  modSelect.addEventListener('change', () => {
    populateRecordPicker(modSelect.value, null);
  });

  // Populate on open if module is already set
  if (c.linked_module && c.linked_module !== 'None') {
    populateRecordPicker(c.linked_module, c.linked_record_id);
  }

  modal.querySelector('#modal-save').addEventListener('click', async () => {
    const title = modal.querySelector('#f-title').value.trim();
    if (!title) { toast('Title is required','error'); return; }
        // Get raw values from form
    let rawPartyId  = modal.querySelector('#f-party').value || null;
    let rawRecordId = modal.querySelector('#f-linked-rec').value.trim() || null;

    // DEBUG: Log what we're getting
    console.log('Party ID from form:', rawPartyId, '| isUUID:', isUUID(rawPartyId));
    console.log('Linked Record ID from form:', rawRecordId, '| isUUID:', isUUID(rawRecordId));

    // Strict UUID validation - reject non-UUID values like "Maxo"
    if (rawPartyId && !isUUID(rawPartyId)) {
        console.error('Invalid party_id (not a UUID):', rawPartyId);
        toast('Invalid party selected - please choose again from dropdown', 'error');
        rawPartyId = null;
    }
    if (rawRecordId && !isUUID(rawRecordId)) {
        console.error('Invalid linked_record_id (not a UUID):', rawRecordId);
        rawRecordId = null;
    }

    const payload = {
      title, category: modal.querySelector('#f-category').value,
      status: modal.querySelector('#f-status').value,
      party_id: rawPartyId,  // Already validated above
      owner: modal.querySelector('#f-owner').value.trim(),
      department: modal.querySelector('#f-dept').value,
      value: modal.querySelector('#f-value').value || null,
      currency: modal.querySelector('#f-currency').value,
      start_date: modal.querySelector('#f-start').value || null,
      end_date: modal.querySelector('#f-end').value || null,
      renewal_type: modal.querySelector('#f-renewal-type').value || null,
      renewal_date: modal.querySelector('#f-renewal-date').value || null,
      notice_period_days: modal.querySelector('#f-notice').value || null,
      linked_module: modal.querySelector('#f-linked-mod').value !== 'None' ? modal.querySelector('#f-linked-mod').value : null,
      linked_record_id: rawRecordId,
      notes: modal.querySelector('#f-notes').value.trim() || null,
      created_by: window.WorkVolt?.user?.()?.id || null,
    };
    try {
      console.log('FULL PAYLOAD being sent to database:', JSON.stringify(payload, null, 2));
      if (isEdit) {
        const updated = await db.update('contracts', c.id, payload);
        const idx = state.contracts.findIndex(x=>x.id===c.id);
        if (idx>=0) state.contracts[idx] = { ...state.contracts[idx], ...updated };
      } else {
        const created = await db.create('contracts', payload);
        state.contracts.unshift(created);
      }
      // Cache the record name so the overview tab can display it without a reload
      const recId   = payload.linked_record_id;
      const recName = modal.querySelector('#f-linked-rec-name')?.value;
      if (recId && recName) state.linkedRecordNames[recId] = recName;
      toast(isEdit ? 'Contract updated' : 'Contract created','success');
      close();
      render();
    } catch(e) { toast(e.message,'error'); }
  });
}

// ── Cloud storage helpers ─────────────────────────────────────
async function uploadToSupabase(file, contractId) {
  const client = window._wvSupabaseClient;
  if (!client) throw new Error('Supabase client not available');
  const path = `${contractId}/${Date.now()}_${file.name}`;
  const { data, error } = await client.storage.from('contracts').upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = client.storage.from('contracts').getPublicUrl(path);
  return { storage_provider:'supabase', storage_file_id:data.path, file_url:publicUrl, title:file.name };
}

function loadGooglePickerSDK(clientId, apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => {
      window.gapi.load('auth2,picker', () => {
        window.gapi.auth2.init({ client_id: clientId, apiKey }).then(resolve).catch(reject);
      });
    };
    s.onerror = () => reject(new Error('Failed to load Google API'));
    document.head.appendChild(s);
  });
}

function openGoogleDrivePicker(cfg, onPicked) {
  loadGooglePickerSDK(cfg.google_client_id, cfg.google_api_key).then(() => {
    const auth2 = window.gapi.auth2.getAuthInstance();
    auth2.signIn().then(user => {
      const token = user.getAuthResponse().access_token;
      const picker = new window.google.picker.PickerBuilder()
        .addView(new window.google.picker.DocsView().setIncludeFolders(true))
        .setOAuthToken(token)
        .setCallback(data => {
          if (data.action === window.google.picker.Action.PICKED) {
            const f = data.docs[0];
            onPicked({ storage_provider:'google_drive', storage_file_id:f.id, file_url:`https://drive.google.com/file/d/${f.id}/view`, title:f.name, storage_mime_type:f.mimeType });
          }
        }).build();
      picker.setVisible(true);
    }).catch(e => toast('Google sign-in failed: '+e.message,'error'));
  }).catch(e => toast(e.message,'error'));
}

function loadOneDriveSDK() {
  return new Promise((resolve, reject) => {
    if (window.OneDrive) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://js.live.net/v7.2/OneDrive.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load OneDrive SDK'));
    document.head.appendChild(s);
  });
}

function openOneDrivePicker(cfg, onPicked) {
  loadOneDriveSDK().then(() => {
    window.OneDrive.open({
      clientId: cfg.onedrive_client_id,
      action: 'share', multiSelect: false,
      advanced: { filter: '.pdf,.docx,.doc,.xlsx', redirectUri: window.location.origin },
      success: files => {
        const f = files.value[0];
        onPicked({ storage_provider:'onedrive', storage_file_id:f.id, file_url:f['@microsoft.graph.downloadUrl']||f.webUrl, title:f.name });
      },
      cancel: ()=>{}, error: e => toast('OneDrive error: '+e,'error'),
    });
  }).catch(e => toast(e.message,'error'));
}

function loadDropboxSDK(appKey) {
  return new Promise((resolve, reject) => {
    if (window.Dropbox) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://www.dropbox.com/static/api/2/dropins.js';
    s.id = 'dropboxjs';
    s.dataset.appKey = appKey;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Dropbox SDK'));
    document.head.appendChild(s);
  });
}

function openDropboxPicker(cfg, onPicked) {
  loadDropboxSDK(cfg.dropbox_app_key).then(() => {
    window.Dropbox.choose({
      success: files => {
        const f = files[0];
        onPicked({ storage_provider:'dropbox', storage_file_id:f.id, file_url:f.link, title:f.name });
      },
      linkType:'preview', multiselect:false,
      extensions:['.pdf','.docx','.doc','.xlsx','.png','.jpg'],
    });
  }).catch(e => toast(e.message,'error'));
}

// ── Event Binding ─────────────────────────────────────────────
function bindEvents() {
  const el = container;

  // Navigation
  el.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', async () => {
    state.view = b.dataset.nav;
    if (state.view==='parties')   await loadParties();
    if (state.view==='approvals') await loadApprovals();
    if (state.view==='renewals')  await loadRenewals();
    render();
  }));

  el.querySelectorAll('[data-list-tab]').forEach(b => b.addEventListener('click', () => {
    state.listTab = b.dataset.listTab; render();
  }));

  // Open detail
  el.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.detail;
    state.selectedId = id; state.view = 'detail'; state.detailTab = 'overview'; state.previewDoc = null;
    await Promise.all([loadDocuments(id),loadClauses(id),loadMilestones(id),loadRenewals(id),loadFinancials(id),loadApprovals(id),loadVersions(id),loadParties()]);
    // Pre-load the linked record name for the overview tab
    const contract = state.contracts.find(x=>x.id===id);
    if (contract?.linked_module && contract.linked_module !== 'None' && contract.linked_record_id && !state.linkedRecordNames[contract.linked_record_id]) {
      await loadLinkedRecords(contract.linked_module);
    }
    render();
  }));

  el.querySelectorAll('[data-detail-tab]').forEach(b => b.addEventListener('click', () => {
    state.detailTab = b.dataset.detailTab; state.previewDoc = null; render();
  }));

  // New / edit
  el.querySelectorAll('#ch-new-contract').forEach(b => b.addEventListener('click', async () => {
    if (!state.parties.length) await loadParties();
    openContractForm();
  }));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
    if (!state.parties.length) await loadParties();
    openContractForm(state.contracts.find(x=>x.id===b.dataset.edit));
  }));

  // Delete contract
  el.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this contract? This cannot be undone.')) return;
    try {
      await db.delete('contracts', b.dataset.delete);
      state.contracts = state.contracts.filter(c=>c.id!==b.dataset.delete);
      toast('Contract deleted','success');
      state.view = 'list'; render();
    } catch(e) { toast(e.message,'error'); }
  }));

  // Advance lifecycle
  el.querySelectorAll('[data-advance]').forEach(b => b.addEventListener('click', async () => {
    try {
      const c = state.contracts.find(x=>x.id===b.dataset.advance);
      if (!c) return;
      const idx = LIFECYCLE.indexOf(c.status);
      if (idx<0||idx>=LIFECYCLE.length-1) return;
      const newStatus = LIFECYCLE[idx+1];
      const updated = await db.update('contracts', c.id, { status:newStatus });
      const si = state.contracts.findIndex(x=>x.id===c.id);
      if (si>=0) state.contracts[si] = { ...state.contracts[si], ...updated };
      toast(`Status → ${newStatus}`,'success'); render();
    } catch(e) { toast(e.message,'error'); }
  }));

  // Search & filter
  el.querySelector('#ch-search')?.addEventListener('input', e => { state.filter.search=e.target.value; render(); });
  el.querySelector('#ch-filter-status')?.addEventListener('change', e => { state.filter.status=e.target.value; render(); });
  el.querySelector('#ch-filter-cat')?.addEventListener('change', e => { state.filter.category=e.target.value; render(); });

  // ── Document preview ────────────────────────────────────────
  el.querySelectorAll('[data-preview-doc]').forEach(b => b.addEventListener('click', () => {
    try { state.previewDoc = JSON.parse(b.dataset.previewDoc); } catch(e){ state.previewDoc=null; }
    render();
  }));
  el.querySelector('#close-preview')?.addEventListener('click', () => { state.previewDoc=null; render(); });

  // ── Documents ───────────────────────────────────────────────
  bindToggle(el, '#add-doc', '#doc-form');
  bindToggle(el, '#cancel-doc', '#doc-form', true);

  const fillDocForm = result => {
    const u=el.querySelector('#doc-url'); if(u) u.value=result.file_url||'';
    const t=el.querySelector('#doc-title'); if(t&&!t.value) t.value=result.title||'';
    const p=el.querySelector('#doc-provider'); if(p) p.value=result.storage_provider||'';
    const fi=el.querySelector('#doc-file-id'); if(fi) fi.value=result.storage_file_id||'';
  };

  el.querySelector('#pick-gdrive')?.addEventListener('click', () => {
    const cfg=getCsConfig(); openGoogleDrivePicker(cfg, fillDocForm);
  });
  el.querySelector('#pick-onedrive')?.addEventListener('click', () => {
    const cfg=getCsConfig(); openOneDrivePicker(cfg, fillDocForm);
  });
  el.querySelector('#pick-dropbox')?.addEventListener('click', () => {
    const cfg=getCsConfig(); openDropboxPicker(cfg, fillDocForm);
  });
  el.querySelector('#pick-upload')?.addEventListener('click', () => {
    el.querySelector('#doc-file-input')?.click();
  });
  el.querySelector('#doc-file-input')?.addEventListener('change', async e => {
    const file=e.target.files[0]; if(!file) return;
    toast('Uploading…','info');
    try { fillDocForm(await uploadToSupabase(file,state.selectedId)); toast('Uploaded!','success'); }
    catch(err) { toast(err.message,'error'); }
  });

  el.querySelector('#save-doc')?.addEventListener('click', async () => {
    const url=el.querySelector('#doc-url')?.value.trim();
    const title=el.querySelector('#doc-title')?.value.trim();
    if (!url&&!title) { toast('Please add a title or file URL','error'); return; }
    try {
      const row = {
        contract_id: state.selectedId,
        doc_type: el.querySelector('#doc-type')?.value,
        title, file_url: url,
        storage_provider: el.querySelector('#doc-provider')?.value||'url',
        storage_file_id:  el.querySelector('#doc-file-id')?.value||null,
        version: el.querySelector('#doc-version')?.value||'1.0',
        uploaded_by: window.WorkVolt?.user?.()?.name||'',
      };
      const created = await db.create('contract_documents', row);
      state.documents.unshift(created);
      toast('Document saved','success'); render();
    } catch(e) { toast(e.message,'error'); }
  });

  el.querySelectorAll('[data-del-doc]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_documents',b.dataset.delDoc); state.documents=state.documents.filter(d=>d.id!==b.dataset.delDoc); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Clauses ─────────────────────────────────────────────────
  bindToggle(el,'#add-clause','#clause-form');
  bindToggle(el,'#cancel-clause','#clause-form',true);
  el.querySelector('#save-clause')?.addEventListener('click', async ()=>{
    try {
      const created=await db.create('contract_clauses',{
        contract_id:state.selectedId,
        clause_type:el.querySelector('#clause-type').value,
        title:el.querySelector('#clause-title').value.trim(),
        description:el.querySelector('#clause-desc').value.trim(),
        is_critical:el.querySelector('#clause-critical').value,
      });
      state.clauses.push(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-del-clause]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_clauses',b.dataset.delClause); state.clauses=state.clauses.filter(c=>c.id!==b.dataset.delClause); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Milestones ───────────────────────────────────────────────
  bindToggle(el,'#add-milestone','#milestone-form');
  bindToggle(el,'#cancel-milestone','#milestone-form',true);
  el.querySelector('#save-milestone')?.addEventListener('click', async ()=>{
    try {
      const created=await db.create('contract_milestones',{
        contract_id:state.selectedId,
        event:el.querySelector('#ms-event').value.trim(),
        date:el.querySelector('#ms-date').value||null,
        assigned_to:el.querySelector('#ms-assigned').value.trim(),
        notify_days_before:el.querySelector('#ms-notify').value||7,
        status:'Pending',
      });
      state.milestones.push(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-complete-ms]').forEach(b=>b.addEventListener('click', async ()=>{
    try {
      const updated=await db.update('contract_milestones',b.dataset.completeMs,{status:'Completed'});
      const idx=state.milestones.findIndex(m=>m.id===b.dataset.completeMs);
      if(idx>=0) state.milestones[idx]={...state.milestones[idx],...updated};
      render();
    } catch(e){ toast(e.message,'error'); }
  }));
  el.querySelectorAll('[data-del-ms]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_milestones',b.dataset.delMs); state.milestones=state.milestones.filter(m=>m.id!==b.dataset.delMs); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Financials ───────────────────────────────────────────────
  bindToggle(el,'#add-financial','#financial-form');
  bindToggle(el,'#cancel-financial','#financial-form',true);
  el.querySelector('#save-financial')?.addEventListener('click', async ()=>{
    try {
      const c=state.contracts.find(x=>x.id===state.selectedId);
      const created=await db.create('contract_financials',{
        contract_id:state.selectedId,
        payment_type:el.querySelector('#fin-type').value.trim(),
        amount:el.querySelector('#fin-amount').value||null,
        currency:el.querySelector('#fin-currency').value,
        frequency:el.querySelector('#fin-frequency').value,
        due_date:el.querySelector('#fin-due').value||null,
        status:'Pending',
      });
      state.financials.push(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-del-fin]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_financials',b.dataset.delFin); state.financials=state.financials.filter(f=>f.id!==b.dataset.delFin); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Approvals ────────────────────────────────────────────────
  bindToggle(el,'#add-approval','#approval-form');
  bindToggle(el,'#cancel-approval','#approval-form',true);
  el.querySelector('#save-approval')?.addEventListener('click', async ()=>{
    try {
      const created=await db.create('contract_approvals',{
        contract_id:state.selectedId,
        approver:el.querySelector('#app-approver').value.trim(),
        role:el.querySelector('#app-role').value.trim(),
        status:'Pending',
      });
      state.approvals.push(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-approve-app]').forEach(b=>b.addEventListener('click', async ()=>{
    try {
      const updated=await db.update('contract_approvals',b.dataset.approveApp,{status:'Approved',approved_at:new Date().toISOString()});
      const idx=state.approvals.findIndex(a=>a.id===b.dataset.approveApp);
      if(idx>=0) state.approvals[idx]={...state.approvals[idx],...updated};
      toast('Approved','success'); render();
    } catch(e){ toast(e.message,'error'); }
  }));
  el.querySelectorAll('[data-reject-app]').forEach(b=>b.addEventListener('click', async ()=>{
    const comments=prompt('Reason for rejection (optional):')||'';
    try {
      const updated=await db.update('contract_approvals',b.dataset.rejectApp,{status:'Rejected',comments,approved_at:new Date().toISOString()});
      const idx=state.approvals.findIndex(a=>a.id===b.dataset.rejectApp);
      if(idx>=0) state.approvals[idx]={...state.approvals[idx],...updated};
      toast('Rejected','info'); render();
    } catch(e){ toast(e.message,'error'); }
  }));
  el.querySelectorAll('[data-del-app]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_approvals',b.dataset.delApp); state.approvals=state.approvals.filter(a=>a.id!==b.dataset.delApp); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Renewals ─────────────────────────────────────────────────
  bindToggle(el,'#add-renewal','#renewal-form');
  bindToggle(el,'#cancel-renewal','#renewal-form',true);
  el.querySelector('#save-renewal')?.addEventListener('click', async ()=>{
    try {
      const created=await db.create('contract_renewals',{
        contract_id:state.selectedId,
        renewal_date:el.querySelector('#ren-date').value||null,
        type:el.querySelector('#ren-type').value,
        new_value:el.querySelector('#ren-value').value||null,
        notes:el.querySelector('#ren-notes').value.trim()||null,
        status:'Pending',
      });
      state.renewals.push(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-complete-ren]').forEach(b=>b.addEventListener('click', async ()=>{
    try {
      const updated=await db.update('contract_renewals',b.dataset.completeRen,{status:'Completed'});
      const idx=state.renewals.findIndex(r=>r.id===b.dataset.completeRen);
      if(idx>=0) state.renewals[idx]={...state.renewals[idx],...updated};
      render();
    } catch(e){ toast(e.message,'error'); }
  }));
  el.querySelectorAll('[data-del-ren]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_renewals',b.dataset.delRen); state.renewals=state.renewals.filter(r=>r.id!==b.dataset.delRen); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Versions ─────────────────────────────────────────────────
  bindToggle(el,'#add-version','#version-form');
  bindToggle(el,'#cancel-version','#version-form',true);
  el.querySelector('#ver-upload')?.addEventListener('click',()=>el.querySelector('#ver-file-input')?.click());
  el.querySelector('#ver-file-input')?.addEventListener('change', async e=>{
    const file=e.target.files[0]; if(!file) return;
    toast('Uploading…','info');
    try {
      const result=await uploadToSupabase(file,state.selectedId);
      const u=el.querySelector('#ver-url'); if(u) u.value=result.file_url;
      const p=el.querySelector('#ver-provider'); if(p) p.value=result.storage_provider;
      toast('Uploaded!','success');
    } catch(err){ toast(err.message,'error'); }
  });
  el.querySelector('#save-version')?.addEventListener('click', async ()=>{
    try {
      const created=await db.create('contract_versions',{
        contract_id:state.selectedId,
        version:el.querySelector('#ver-num').value.trim(),
        title:el.querySelector('#ver-title').value.trim(),
        changed_by:el.querySelector('#ver-by').value.trim(),
        file_url:el.querySelector('#ver-url').value.trim()||null,
        storage_provider:el.querySelector('#ver-provider')?.value||null,
        change_summary:el.querySelector('#ver-summary').value.trim()||null,
      });
      state.versions.unshift(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-del-ver]').forEach(b=>b.addEventListener('click', async ()=>{
    try { await db.delete('contract_versions',b.dataset.delVer); state.versions=state.versions.filter(v=>v.id!==b.dataset.delVer); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Parties ──────────────────────────────────────────────────
  bindToggle(el,'#add-party','#party-form');
  bindToggle(el,'#cancel-party','#party-form',true);
  el.querySelector('#save-party')?.addEventListener('click', async ()=>{
    try {
      const created=await db.create('contract_parties',{
        name:el.querySelector('#party-name').value.trim(),
        type:el.querySelector('#party-type').value,
        email:el.querySelector('#party-email').value.trim()||null,
        phone:el.querySelector('#party-phone').value.trim()||null,
        contact_person:el.querySelector('#party-contact').value.trim()||null,
        country:el.querySelector('#party-country').value.trim()||null,
        address:el.querySelector('#party-address').value.trim()||null,
      });
      state.parties.push(created); render();
    } catch(e){ toast(e.message,'error'); }
  });
  el.querySelectorAll('[data-del-party]').forEach(b=>b.addEventListener('click', async ()=>{
    if(!confirm('Remove this party?')) return;
    try { await db.delete('contract_parties',b.dataset.delParty); state.parties=state.parties.filter(p=>p.id!==b.dataset.delParty); render(); }
    catch(e){ toast(e.message,'error'); }
  }));

  // ── Cloud Storage Setup ───────────────────────────────────────
  el.querySelectorAll('[data-select-provider]').forEach(b=>b.addEventListener('click',()=>{
    state.cloudProvider=b.dataset.selectProvider; render();
  }));

  el.querySelector('#cs-save')?.addEventListener('click',()=>{
    const provider = state.cloudProvider||'supabase';
    const meta     = PROVIDER_META[provider];
    const cfg      = getCsConfig();
    // Save all field values for this provider
    meta.fields.forEach(f=>{
      const input=el.querySelector(`#cs-field-${f.key}`);
      if(input) cfg[f.key]=input.value.trim();
    });
    cfg[provider+'_enabled'] = true;
    saveCsConfig(cfg);
    const msg=el.querySelector('#cs-status-msg');
    if(msg){ msg.textContent='✓ Saved!'; msg.className='text-xs text-emerald-600 font-bold'; setTimeout(()=>{msg.textContent='';},3000); }
    toast(`${meta.label} connected`,'success');
    render();
  });

  el.querySelector('#cs-disconnect')?.addEventListener('click',()=>{
    const provider=state.cloudProvider||'supabase';
    const cfg=getCsConfig();
    cfg[provider+'_enabled']=false;
    PROVIDER_META[provider].fields.forEach(f=>{ delete cfg[f.key]; });
    saveCsConfig(cfg);
    toast(`${PROVIDER_META[provider].label} disconnected`,'info');
    render();
  });
}

function bindToggle(el, triggerSel, targetSel, hide) {
  const trigger=el.querySelector(triggerSel);
  const target =el.querySelector(targetSel);
  if(!trigger||!target) return;
  trigger.addEventListener('click',()=>{
    if(hide) target.classList.add('hidden');
    else target.classList.toggle('hidden');
  });
}

// ── Register page ─────────────────────────────────────────────
window.WorkVoltPages = window.WorkVoltPages || {};
window.WorkVoltPages.contracts = init;

})();
