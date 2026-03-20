// ================================================================
//  WORK VOLT — js/db-adapter.js
//
//  Abstract database adapter layer.
//  All page modules call WorkVolt.db.* — they never import a
//  specific database SDK directly.
//
//  To add a new provider:
//    1. Create js/adapters/myprovider.js implementing BaseAdapter
//    2. Register it in ADAPTERS below
//    3. Done — no page code changes needed
// ================================================================

// ── Base adapter interface ────────────────────────────────────────
// Every adapter must implement these methods.
class BaseAdapter {

  // Called once on boot with the stored credentials object
  // Must return { user: profileObject } or throw on failure
  async init(credentials) { throw new Error('init() not implemented'); }

  // Auth
  async login(email, password)       { throw new Error('login() not implemented'); }
  async logout()                     { throw new Error('logout() not implemented'); }
  async getSession()                 { throw new Error('getSession() not implemented'); }
  async getUser()                    { throw new Error('getUser() not implemented'); }
  async changePassword(newPassword)  { throw new Error('changePassword() not implemented'); }
  async sendPasswordReset(email)     { throw new Error('sendPasswordReset() not implemented'); }

  // CRUD — all adapters must support these
  async list(table, filters, options)     { throw new Error('list() not implemented'); }
  async get(table, id, idCol)             { throw new Error('get() not implemented'); }
  async create(table, row)               { throw new Error('create() not implemented'); }
  async update(table, id, patch, idCol)  { throw new Error('update() not implemented'); }
  async delete(table, id, idCol)         { throw new Error('delete() not implemented'); }

  // Config (key-value store for app settings)
  async configGet(key)          { throw new Error('configGet() not implemented'); }
  async configSet(key, value)   { throw new Error('configSet() not implemented'); }
  async configGetAll()          { throw new Error('configGetAll() not implemented'); }
}

// ── Adapter registry ──────────────────────────────────────────────
const ADAPTERS = {
  supabase:     () => import('./adapters/supabase.js').then(m => m.SupabaseAdapter),
  firebase:     () => import('./adapters/firebase.js').then(m => m.FirebaseAdapter),
  sheets:       () => import('./adapters/sheets.js').then(m => m.SheetsAdapter),
};

// ── Adapter metadata (for UI) ─────────────────────────────────────
const ADAPTER_INFO = {
  supabase: {
    label:       'Supabase',
    icon:        'fa-database',
    color:       '#3ecf8e',
    description: 'Recommended — free tier, built-in auth, real-time',
    fields: [
      { key: 'url',     label: 'Project URL',  placeholder: 'https://xxxx.supabase.co',  type: 'url'  },
      { key: 'anonKey', label: 'Anon Key',     placeholder: 'eyJhbGciOiJIUzI1NiIs...',  type: 'text' },
    ],
  },
  firebase: {
    label:       'Firebase',
    icon:        'fa-fire',
    color:       '#f5820d',
    description: 'Google Firebase / Firestore',
    fields: [
      { key: 'apiKey',    label: 'API Key',       placeholder: 'AIzaSy...',              type: 'text' },
      { key: 'projectId', label: 'Project ID',    placeholder: 'my-project-id',          type: 'text' },
      { key: 'appId',     label: 'App ID',        placeholder: '1:123:web:abc...',       type: 'text' },
    ],
  },
  sheets: {
    label:       'Google Sheets',
    icon:        'fa-table',
    color:       '#0f9d58',
    description: 'Legacy / archiving — uses Google Apps Script',
    fields: [
      { key: 'gasUrl', label: 'GAS Web App URL', placeholder: 'https://script.google.com/macros/s/.../exec', type: 'url' },
    ],
  },
};

// ── Active adapter singleton ──────────────────────────────────────
let _adapter = null;
let _adapterType = null;

// ── Bootstrap: load adapter from localStorage ─────────────────────
async function initAdapter() {
  const stored = _loadCredentials();
  if (!stored) return null; // Not configured yet

  const AdapterClass = await _loadAdapterClass(stored.provider);
  _adapter     = new AdapterClass();
  _adapterType = stored.provider;
  await _adapter.init(stored.credentials);
  return _adapter;
}

// ── Connect with new credentials (called from login page) ─────────
async function connectAdapter(provider, credentials) {
  const AdapterClass = await _loadAdapterClass(provider);
  const instance = new AdapterClass();
  await instance.init(credentials); // throws if invalid
  _adapter     = instance;
  _adapterType = provider;
  _saveCredentials(provider, credentials);
  return instance;
}

// ── Disconnect ────────────────────────────────────────────────────
function disconnectAdapter() {
  _adapter     = null;
  _adapterType = null;
  localStorage.removeItem('wv_db_config');
}

// ── Get active adapter (throws if not connected) ──────────────────
function getAdapter() {
  if (!_adapter) throw new Error('No database connected. Please log in.');
  return _adapter;
}

function getAdapterType() { return _adapterType; }

// ── Internal helpers ──────────────────────────────────────────────
async function _loadAdapterClass(provider) {
  const factory = ADAPTERS[provider];
  if (!factory) throw new Error('Unknown database provider: ' + provider);
  return await factory();
}

function _saveCredentials(provider, credentials) {
  localStorage.setItem('wv_db_config', JSON.stringify({ provider, credentials }));
}

function _loadCredentials() {
  try {
    const raw = localStorage.getItem('wv_db_config');
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// ── WorkVoltDB — the unified API all pages use ───────────────────
// This object never changes regardless of which adapter is active.
const WorkVoltDB = {

  // ── Raw CRUD (for custom queries) ──────────────────────────────
  list:   (table, filters, options) => getAdapter().list(table, filters, options),
  get:    (table, id, idCol)        => getAdapter().get(table, id, idCol),
  create: (table, row)              => getAdapter().create(table, row),
  update: (table, id, patch, idCol) => getAdapter().update(table, id, patch, idCol),
  delete: (table, id, idCol)        => getAdapter().delete(table, id, idCol),

  // ── Auth ────────────────────────────────────────────────────────
  auth: {
    login:         (email, password) => getAdapter().login(email, password),
    logout:        ()                => getAdapter().logout(),
    getSession:    ()                => getAdapter().getSession(),
    getUser:       ()                => getAdapter().getUser(),
    changePassword:(pwd)             => getAdapter().changePassword(pwd),
    resetPassword: (email)           => getAdapter().sendPasswordReset(email),
  },

  // ── Config ──────────────────────────────────────────────────────
  config: {
    get:    (key)        => getAdapter().configGet(key),
    set:    (key, value) => getAdapter().configSet(key, value),
    getAll: ()           => getAdapter().configGetAll(),
    getInstalledModules: async () => {
      const val = await getAdapter().configGet('installed_modules');
      try { return JSON.parse(val) || []; } catch(e) { return []; }
    },
    saveInstalledModules: (modules) =>
      getAdapter().configSet('installed_modules', JSON.stringify(modules)),
  },

  // ── Module helpers ───────────────────────────────────────────────
  users: {
    list:       (f={}) => getAdapter().list('users', f, { order: 'name', asc: true }),
    get:        (id)   => getAdapter().get('users', id),
    update:     (id,p) => getAdapter().update('users', id, p),
    deactivate: (id)   => getAdapter().update('users', id, { active: false }),
    reactivate: (id)   => getAdapter().update('users', id, { active: true }),
  },

  notifications: {
    list:     (userId) => getAdapter().list('notifications', { user_id: userId }, { order: 'created_at' }),
    create:   (row)    => getAdapter().create('notifications', row),
    markRead: (id)     => getAdapter().update('notifications', id, { read: true }),
    delete:   (id)     => getAdapter().delete('notifications', id),
    unreadCount: async (userId) => {
      const rows = await getAdapter().list('notifications', { user_id: userId, read: false });
      return rows.length;
    },
  },

  tasks: {
    list:   (f={}) => getAdapter().list('tasks', f, { order: 'created_at' }),
    create: (row)  => getAdapter().create('tasks', row),
    update: (id,p) => getAdapter().update('tasks', id, p),
    delete: (id)   => getAdapter().delete('tasks', id),
  },

  pipeline: {
    deals:      (f={}) => getAdapter().list('pipeline_deals', f, { order: 'created_at' }),
    stages:     ()     => getAdapter().list('pipeline_stages', {}, { order: 'order', asc: true }),
    createDeal: (row)  => getAdapter().create('pipeline_deals', row),
    updateDeal: (id,p) => getAdapter().update('pipeline_deals', id, p),
    deleteDeal: (id)   => getAdapter().delete('pipeline_deals', id),
  },

  payroll: {
    employees:      (f={}) => getAdapter().list('payroll_employees', f),
    runs:           (f={}) => getAdapter().list('payroll_runs', f, { order: 'created_at' }),
    createEmployee: (row)  => getAdapter().create('payroll_employees', row),
    updateEmployee: (id,p) => getAdapter().update('payroll_employees', id, p),
    deleteEmployee: (id)   => getAdapter().delete('payroll_employees', id),
    createRun:      (row)  => getAdapter().create('payroll_runs', row),
    updateRun:      (id,p) => getAdapter().update('payroll_runs', id, p),
  },

  timesheets: {
    list:    (f={}) => getAdapter().list('timesheets', f, { order: 'date' }),
    create:  (row)  => getAdapter().create('timesheets', row),
    update:  (id,p) => getAdapter().update('timesheets', id, p),
    delete:  (id)   => getAdapter().delete('timesheets', id),
    approve: (id, approverId) => getAdapter().update('timesheets', id, { status: 'Approved', approved_by: approverId }),
  },

  financials: {
    transactions: (f={}) => getAdapter().list('financial_transactions', f, { order: 'date' }),
    categories:   ()     => getAdapter().list('financial_categories'),
    create:       (row)  => getAdapter().create('financial_transactions', row),
    update:       (id,p) => getAdapter().update('financial_transactions', id, p),
    delete:       (id)   => getAdapter().delete('financial_transactions', id),
    summary: async () => {
      const rows    = await getAdapter().list('financial_transactions');
      const income  = rows.filter(r => r.type === 'Income').reduce((s,r) => s + (+r.amount||0), 0);
      const expense = rows.filter(r => r.type === 'Expense').reduce((s,r) => s + (+r.amount||0), 0);
      return { income, expense, net: income - expense };
    },
  },

  crm: {
    contacts:          (f={}) => getAdapter().list('crm_contacts', f, { order: 'name', asc: true }),
    interactions:      (cid)  => getAdapter().list('crm_interactions', { contact_id: cid }, { order: 'date' }),
    createContact:     (row)  => getAdapter().create('crm_contacts', row),
    updateContact:     (id,p) => getAdapter().update('crm_contacts', id, p),
    deleteContact:     (id)   => getAdapter().delete('crm_contacts', id),
    createInteraction: (row)  => getAdapter().create('crm_interactions', row),
    deleteInteraction: (id)   => getAdapter().delete('crm_interactions', id),
  },

  projects: {
    list:            (f={}) => getAdapter().list('projects', f, { order: 'created_at' }),
    milestones:      (pid)  => getAdapter().list('project_milestones', { project_id: pid }, { order: 'due_date', asc: true }),
    create:          (row)  => getAdapter().create('projects', row),
    update:          (id,p) => getAdapter().update('projects', id, p),
    delete:          (id)   => getAdapter().delete('projects', id),
    createMilestone: (row)  => getAdapter().create('project_milestones', row),
    updateMilestone: (id,p) => getAdapter().update('project_milestones', id, p),
    deleteMilestone: (id)   => getAdapter().delete('project_milestones', id),
  },

  assets: {
    list:   (f={}) => getAdapter().list('assets', f, { order: 'name', asc: true }),
    create: (row)  => getAdapter().create('assets', row),
    update: (id,p) => getAdapter().update('assets', id, p),
    delete: (id)   => getAdapter().delete('assets', id),
  },

  attendance: {
    list:     (f={}) => getAdapter().list('attendance', f, { order: 'date' }),
    checkIn:  (employeeId, name) => getAdapter().create('attendance', {
      employee_id: employeeId, employee_name: name,
      date: new Date().toISOString().split('T')[0],
      check_in: new Date().toISOString(), status: 'Present'
    }),
    checkOut: (id)   => getAdapter().update('attendance', id, { check_out: new Date().toISOString() }),
    create:   (row)  => getAdapter().create('attendance', row),
    update:   (id,p) => getAdapter().update('attendance', id, p),
    delete:   (id)   => getAdapter().delete('attendance', id),
  },

  invoices: {
    list:       (f={}) => getAdapter().list('invoices', f, { order: 'created_at' }),
    items:      (iid)  => getAdapter().list('invoice_items', { invoice_id: iid }),
    create:     (row)  => getAdapter().create('invoices', row),
    update:     (id,p) => getAdapter().update('invoices', id, p),
    delete:     (id)   => getAdapter().delete('invoices', id),
    createItem: (row)  => getAdapter().create('invoice_items', row),
    deleteItem: (id)   => getAdapter().delete('invoice_items', id),
  },

  inventory: {
    items:          (f={}) => getAdapter().list('inventory_items', f, { order: 'name', asc: true }),
    movements:      (f={}) => getAdapter().list('inventory_movements', f, { order: 'created_at' }),
    create:         (row)  => getAdapter().create('inventory_items', row),
    update:         (id,p) => getAdapter().update('inventory_items', id, p),
    delete:         (id)   => getAdapter().delete('inventory_items', id),
    createMovement: (row)  => getAdapter().create('inventory_movements', row),
    lowStock: async () => {
      const rows = await getAdapter().list('inventory_items');
      return rows.filter(r => parseFloat(r.quantity) <= parseFloat(r.reorder_point));
    },
  },

  scheduler: {
    shifts: (f={}) => getAdapter().list('scheduler_shifts', f, { order: 'date', asc: true }),
    create: (row)  => getAdapter().create('scheduler_shifts', row),
    update: (id,p) => getAdapter().update('scheduler_shifts', id, p),
    delete: (id)   => getAdapter().delete('scheduler_shifts', id),
  },

  expenses: {
    list:    (f={}) => getAdapter().list('expenses', f, { order: 'date' }),
    create:  (row)  => getAdapter().create('expenses', row),
    update:  (id,p) => getAdapter().update('expenses', id, p),
    delete:  (id)   => getAdapter().delete('expenses', id),
    approve: (id, approverId) => getAdapter().update('expenses', id, { status: 'Approved', approved_by: approverId }),
    reject:  (id, approverId) => getAdapter().update('expenses', id, { status: 'Rejected',  approved_by: approverId }),
  },

  contracts: {
    list:    (f={}) => getAdapter().list('contracts', f, { order: 'created_at' }),
    create:  (row)  => getAdapter().create('contracts', row),
    update:  (id,p) => getAdapter().update('contracts', id, p),
    delete:  (id)   => getAdapter().delete('contracts', id),
    expiring: async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      const rows = await getAdapter().list('contracts', { status: 'Active' });
      return rows.filter(r => r.end_date && new Date(r.end_date) <= soon);
    },
  },

  helpdesk: {
    list:    (f={}) => getAdapter().list('helpdesk_tickets', f, { order: 'created_at' }),
    create:  (row)  => getAdapter().create('helpdesk_tickets', row),
    update:  (id,p) => getAdapter().update('helpdesk_tickets', id, p),
    delete:  (id)   => getAdapter().delete('helpdesk_tickets', id),
    resolve: (id, resolution) => getAdapter().update('helpdesk_tickets', id, {
      status: 'Resolved', resolution, resolved_at: new Date().toISOString()
    }),
  },

  recruitment: {
    jobs:            (f={}) => getAdapter().list('recruitment_jobs', f),
    candidates:      (f={}) => getAdapter().list('recruitment_candidates', f, { order: 'created_at' }),
    createJob:       (row)  => getAdapter().create('recruitment_jobs', row),
    updateJob:       (id,p) => getAdapter().update('recruitment_jobs', id, p),
    deleteJob:       (id)   => getAdapter().delete('recruitment_jobs', id),
    createCandidate: (row)  => getAdapter().create('recruitment_candidates', row),
    updateCandidate: (id,p) => getAdapter().update('recruitment_candidates', id, p),
    deleteCandidate: (id)   => getAdapter().delete('recruitment_candidates', id),
  },
};

// ── Expose globally ───────────────────────────────────────────────
window.WorkVoltDB     = WorkVoltDB;
window.initAdapter    = initAdapter;
window.connectAdapter = connectAdapter;
window.disconnectAdapter = disconnectAdapter;
window.getAdapterType = getAdapterType;
window.ADAPTER_INFO   = ADAPTER_INFO;
window.BaseAdapter    = BaseAdapter;
