// ================================================================
//  WORK VOLT — js/adapters/sheets.js
//  Google Sheets / GAS adapter — legacy + archiving use
// ================================================================

export class SheetsAdapter extends BaseAdapter {

  constructor() {
    super();
    this._gasUrl = null;
    this._session = null;
    this._user = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────
  async _call(path, params = {}) {
    const url = new URL(this._gasUrl);
    url.searchParams.set('path', path);
    if (this._session) url.searchParams.set('session_id', this._session);
    url.searchParams.set('_t', Date.now());
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res  = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ── Init ────────────────────────────────────────────────────────
  async init(credentials) {
    const { gasUrl } = credentials;
    if (!gasUrl) throw new Error('GAS Web App URL is required.');
    this._gasUrl = gasUrl;

    // Ping to verify connectivity
    const data = await this._call('ping');
    if (data.status !== 'ok') throw new Error('Could not reach the Google Apps Script endpoint.');
    return true;
  }

  // ── Auth ────────────────────────────────────────────────────────
  async login(email, password) {
    // Hash password SHA-256 (same as original index.html)
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');

    const data = await this._call('auth/login', { email, password_hash: hash });
    if (!data.success) throw new Error(data.error || 'Login failed');

    this._session = data.session_id;
    this._user    = data.user;
    return { user: data.user, session: data.session_id };
  }

  async logout() {
    try { await this._call('auth/logout'); } catch(e) {}
    this._session = null;
    this._user    = null;
  }

  async getSession() {
    if (!this._session) return null;
    try {
      const data = await this._call('auth/check-session');
      return data.valid ? this._session : null;
    } catch(e) { return null; }
  }

  async getUser() {
    return this._user;
  }

  async changePassword(newPassword) {
    if (!this._user?.email) throw new Error('Not logged in');
    const tokenData = await this._call('users/reset-token', { email: this._user.email });
    await this._call('users/set-password', { token: tokenData.token, password: newPassword });
  }

  async sendPasswordReset(email) {
    // GAS doesn't send emails natively — just returns the token
    // In production you'd hook this up to an email service
    await this._call('users/reset-token', { email });
  }

  // ── CRUD ────────────────────────────────────────────────────────
  // Maps adapter interface to GAS module paths
  // table name → module/action pattern

  _moduleFromTable(table) {
    const MAP = {
      users:                    'users',
      notifications:            'notifications',
      tasks:                    'tasks',
      pipeline_deals:           'pipeline',
      pipeline_stages:          'pipeline',
      payroll_employees:        'payroll',
      payroll_runs:             'payroll',
      timesheets:               'timesheets',
      financial_transactions:   'financials',
      financial_categories:     'financials',
      crm_contacts:             'crm',
      crm_interactions:         'crm',
      projects:                 'projects',
      project_milestones:       'projects',
      assets:                   'assets',
      attendance:               'attendance',
      invoices:                 'invoices',
      invoice_items:            'invoices',
      inventory_items:          'inventory',
      inventory_movements:      'inventory',
      scheduler_shifts:         'scheduler',
      expenses:                 'expenses',
      contracts:                'contracts',
      helpdesk_tickets:         'helpdesk',
      recruitment_jobs:         'recruitment',
      recruitment_candidates:   'recruitment',
      config:                   'config',
    };
    return MAP[table] || table;
  }

  async list(table, filters = {}, options = {}) {
    const module = this._moduleFromTable(table);
    const data   = await this._call(module + '/list', filters);
    return data.rows || [];
  }

  async get(table, id, idCol = 'id') {
    const rows = await this.list(table, { [idCol]: id });
    return rows[0] || null;
  }

  async create(table, row) {
    const module = this._moduleFromTable(table);
    const data   = await this._call(module + '/create', row);
    return { id: data.id, ...row };
  }

  async update(table, id, patch, idCol = 'id') {
    const module = this._moduleFromTable(table);
    await this._call(module + '/update', { [idCol]: id, ...patch });
    return { [idCol]: id, ...patch };
  }

  async delete(table, id, idCol = 'id') {
    const module = this._moduleFromTable(table);
    await this._call(module + '/delete', { [idCol]: id });
    return true;
  }

  // ── Config ──────────────────────────────────────────────────────
  async configGet(key) {
    const data = await this._call('config/get-all');
    return data.settings?.[key] ?? null;
  }

  async configSet(key, value) {
    await this._call('config/set-key', { key, value });
  }

  async configGetAll() {
    const data = await this._call('config/get-all');
    return data.settings || {};
  }
}
