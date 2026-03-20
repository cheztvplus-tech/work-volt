// ================================================================
//  WORK VOLT — js/adapters/supabase.js
//  Supabase implementation of BaseAdapter
// ================================================================

const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

export class SupabaseAdapter extends BaseAdapter {

  constructor() {
    super();
    this._client = null;
  }

  // ── Load SDK dynamically ────────────────────────────────────────
  async _loadSDK() {
    if (window.supabase) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SUPABASE_SDK;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
      document.head.appendChild(s);
    });
  }

  // ── Init: validate credentials and create client ───────────────
  async init(credentials) {
    const { url, anonKey } = credentials;
    if (!url || !anonKey) throw new Error('Supabase URL and Anon Key are required.');

    // Basic URL format check
    if (!url.includes('supabase.co') && !url.includes('supabase.io')) {
      throw new Error('Invalid Supabase URL. It should look like: https://xxxx.supabase.co');
    }

    await this._loadSDK();
    this._client = window.supabase.createClient(url, anonKey);

    // Connectivity check — just verify the project is reachable.
    // We do NOT query any table here because RLS blocks unauthenticated reads.
    // Instead we hit the auth endpoint which is always public.
    try {
      const res = await fetch(url + '/auth/v1/settings', {
        headers: { 'apikey': anonKey }
      });
      if (!res.ok && res.status !== 404) {
        throw new Error('Could not reach Supabase project. Check your Project URL and Anon Key.');
      }
    } catch(e) {
      if (e.message.includes('Could not reach')) throw e;
      throw new Error('Could not connect to Supabase. Check your Project URL.');
    }

    return true;
  }

  // ── Auth ────────────────────────────────────────────────────────
  async login(email, password) {
    const { data, error } = await this._client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const { data: profile, error: pErr } = await this._client
      .from('users').select('*').eq('id', data.user.id).single();
    if (pErr) throw new Error('Could not load user profile: ' + pErr.message);
    if (!profile.active) throw new Error('Account deactivated. Contact your administrator.');

    await this._client.from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.user.id);

    return { user: profile, session: data.session };
  }

  async logout() {
    await this._client.auth.signOut();
  }

  async getSession() {
    const { data } = await this._client.auth.getSession();
    return data.session;
  }

  async getUser() {
    const { data: { user } } = await this._client.auth.getUser();
    if (!user) return null;
    const { data: profile } = await this._client.from('users').select('*').eq('id', user.id).single();
    return profile;
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

  // ── CRUD ────────────────────────────────────────────────────────
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
    const { data, error } = await this._client.from(table).update(patch).eq(idCol, id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async delete(table, id, idCol = 'id') {
    const { error } = await this._client.from(table).delete().eq(idCol, id);
    if (error) throw new Error(error.message);
    return true;
  }

  // ── Config ──────────────────────────────────────────────────────
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

  // ── Real-time (Supabase-specific bonus) ─────────────────────────
  subscribe(table, callback) {
    return this._client.channel('public:' + table)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }

  unsubscribe(channel) {
    this._client.removeChannel(channel);
  }
}
