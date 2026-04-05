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

// ================================================================
//  SUPABASE ADAPTER
// ================================================================
class SupabaseAdapter extends BaseAdapter {

  constructor() { super(); this._client = null; }

  async _loadSDK() {
    if (window.supabase) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
      document.head.appendChild(s);
    });
  }

  async init(credentials) {
    const { url, anonKey } = credentials;
    if (!url || !anonKey) throw new Error('Supabase URL and Anon Key are required.');
    if (!url.includes('supabase.co')) throw new Error('Invalid Supabase URL. Should be: https://xxxx.supabase.co');
    await this._loadSDK();
    this._client = window.supabase.createClient(url, anonKey);
    // Expose the live client globally so page modules (e.g. shop.js) can use
    // the already-authenticated client without creating a duplicate connection.
    window._wvSupabaseClient = this._client;
    // Verify connectivity — ping the auth settings endpoint (always public)
    try {
      const res = await fetch(url + '/auth/v1/settings', { headers: { apikey: anonKey } });
      if (!res.ok && res.status !== 404) throw new Error('Could not reach Supabase. Check your URL and Anon Key.');
    } catch(e) {
      if (e.message.includes('Could not reach')) throw e;
      throw new Error('Could not connect to Supabase. Check your Project URL.');
    }
    return true;
  }

  async login(email, password) {
    const { data, error } = await this._client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const { data: profile, error: pErr } = await this._client.from('users').select('*').eq('id', data.user.id).single();
    if (pErr) throw new Error('Could not load user profile: ' + pErr.message);
    if (profile.active === false || profile.active === 'false') throw new Error('Account deactivated. Contact your administrator.');
    await this._client.from('users').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);
    return { user: profile, session: data.session };
  }

  async logout() { if (this._client) await this._client.auth.signOut(); }

  async getSession() {
    if (!this._client) return null;
    const { data } = await this._client.auth.getSession();
    return data.session || null;
  }

  async getUser() {
    if (!this._client) return null;
    const { data: { user } } = await this._client.auth.getUser();
    if (!user) return null;
    const { data: profile } = await this._client.from('users').select('*').eq('id', user.id).single();
    return profile || null;
  }

  async changePassword(newPassword) {
    const { error } = await this._client.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }

  async sendPasswordReset(email) {
    const { error } = await this._client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html'
    });
    if (error) throw new Error(error.message);
  }

  async list(table, filters = {}, options = {}) {
    let query = this._client.from(table).select(options.select || '*');
    Object.entries(filters).forEach(([col, val]) => {
      if (val !== undefined && val !== null && val !== '') query = query.eq(col, val);
    });
    if (options.order) query = query.order(options.order, { ascending: options.asc ?? false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async get(table, id, idCol = 'id') {
    const { data, error } = await this._client.from(table).select('*').eq(idCol, id).single();
    if (error) throw new Error(error.message);
    return data;
  }

  async create(table, row) {
    const { data, error } = await this._client.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async update(table, id, patch, idCol = 'id') {
    const { data, error } = await this._client.from(table).update(patch).eq(idCol, id).select();
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  }

  async delete(table, id, idCol = 'id') {
    const { error } = await this._client.from(table).delete().eq(idCol, id);
    if (error) throw new Error(error.message);
    return true;
  }

  async configGet(key) {
    const { data } = await this._client.from('config').select('value').eq('key', key).single();
    return data?.value ?? null;
  }

  async configSet(key, value) {
    const { error } = await this._client.from('config')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async configGetAll() {
    const { data, error } = await this._client.from('config').select('*');
    if (error) throw new Error(error.message);
    return Object.fromEntries((data || []).map(r => [r.key, r.value]));
  }
}

// ================================================================
//  FIREBASE ADAPTER  (stub — not actively used)
// ================================================================
class FirebaseAdapter extends BaseAdapter {
  async init(credentials) { throw new Error('Firebase adapter not yet implemented.'); }
}

// ================================================================
//  SHEETS ADAPTER  (legacy — kept dormant, not shown in UI)
// ================================================================
class SheetsAdapter extends BaseAdapter {
  constructor() { super(); this._gasUrl = null; this._session = null; this._user = null; }

  async init(credentials) {
    const { gasUrl } = credentials;
    if (!gasUrl) throw new Error('GAS Web App URL is required.');
    this._gasUrl = gasUrl;
    const res = await fetch(gasUrl + '?path=ping', { cache: 'no-cache' });
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('GAS endpoint not responding correctly.');
    return true;
  }

  async _call(path, params = {}) {
    const url = new URL(this._gasUrl);
    url.searchParams.set('path', path);
    if (this._session) url.searchParams.set('session_id', this._session);
    Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    const res  = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async login(email, password) {
    const hash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
    )).map(b => b.toString(16).padStart(2,'0')).join('');
    const data = await this._call('auth/login', { email, password_hash: hash });
    this._session = data.session_id;
    this._user    = data.user;
    return { user: data.user, session: data.session_id };
  }

  async logout() {
    if (this._session) await this._call('auth/logout').catch(() => {});
    this._session = null; this._user = null;
  }

  async getSession() { return this._session || null; }
  async getUser()    { return this._user    || null; }
  async changePassword() { throw new Error('Password change not supported on Sheets adapter.'); }
  async sendPasswordReset() { throw new Error('Password reset not supported on Sheets adapter.'); }

  async list(table, filters = {}) {
    const data = await this._call(table + '/list', filters);
    return data.rows || [];
  }
  async create(table, row)              { return this._call(table + '/create', row); }
  async update(table, id, patch)        { return this._call(table + '/update', { id, ...patch }); }
  async delete(table, id)               { return this._call(table + '/delete', { id }); }
  async get(table, id)                  { return this._call(table + '/get', { id }); }
  async configGet(key)                  { const d = await this._call('config/get-all'); return (d.settings||{})[key] ?? null; }
  async configSet(key, value)           { return this._call('config/set-key', { key, value }); }
  async configGetAll()                  { const d = await this._call('config/get-all'); return d.settings || {}; }
}

// ── Adapter registry ──────────────────────────────────────────────
// All adapters are inlined above — no dynamic imports, works as a
// plain <script> tag with no build step required.
const ADAPTERS = {
  supabase: SupabaseAdapter,
  firebase: FirebaseAdapter,
  sheets:   SheetsAdapter,
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
  if (!stored) return null;
  const AdapterClass = ADAPTERS[stored.provider];
  if (!AdapterClass) throw new Error('Unknown database provider: ' + stored.provider);
  _adapter     = new AdapterClass();
  _adapterType = stored.provider;
  await _adapter.init(stored.credentials);
  return _adapter;
}

// ── Connect with new credentials (called from login page) ─────────
async function connectAdapter(provider, credentials) {
  const AdapterClass = ADAPTERS[provider];
  if (!AdapterClass) throw new Error('Unknown database provider: ' + provider);
  const instance = new AdapterClass();
  await instance.init(credentials);
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

   // ── NEW: Bills ──────────────────────────────────────────────────
  bills: {
    list:       (f={}) => getAdapter().list('bills', f, { order: 'due_date', asc: true }),
    create:     (row)  => getAdapter().create('bills', row),
    update:     (id,p) => getAdapter().update('bills', id, p),
    delete:     (id)   => getAdapter().delete('bills', id),
  },

  // ── NEW: Budgets ────────────────────────────────────────────────
  budgets: {
    list:       (f={}) => getAdapter().list('budgets', f, { order: 'category', asc: true }),
    create:     (row)  => getAdapter().create('budgets', row),
    update:     (id,p) => getAdapter().update('budgets', id, p),
    delete:     (id)   => getAdapter().delete('budgets', id),
  },

  // ── NEW: Accounts ───────────────────────────────────────────────
  accounts: {
    list:       (f={}) => getAdapter().list('accounts', f, { order: 'account_name', asc: true }),
    create:     (row)  => getAdapter().create('accounts', row),
    update:     (id,p) => getAdapter().update('accounts', id, p),
    delete:     (id)   => getAdapter().delete('accounts', id),
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
