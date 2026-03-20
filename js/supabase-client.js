// ================================================================
//  WORK VOLT — supabase-client.js
//
//  ⚠️  REPLACE the two constants below with your Supabase project values:
//      Dashboard → Settings → API
//
//  Include this file BEFORE index.html and main.html scripts:
//  <script src="js/supabase-client.js"></script>
// ================================================================

const SUPABASE_URL    = 'https://jydhuundhfmjmukydlmj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5ZGh1dW5kaGZtam11a3lkbG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjcwNzIsImV4cCI6MjA4NzEwMzA3Mn0.-GqNMDPsu3mZ55DP5h31WAwMCDQn3eEg0y4LMT44UMY';

// ── Load Supabase SDK from CDN ───────────────────────────────────
// Add this to your HTML <head> before this script:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================================================================
//  AUTH HELPERS
// ================================================================
const Auth = {

  // Sign in with email + password
  async login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    // Fetch full profile from public.users
    const { data: profile, error: profileErr } = await db
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileErr) throw new Error(profileErr.message);
    if (!profile.active) throw new Error('Account deactivated. Contact your administrator.');

    // Update last_login
    await db.from('users').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);

    return { user: profile, session: data.session };
  },

  // Sign out
  async logout() {
    await db.auth.signOut();
  },

  // Get current session (persisted by Supabase automatically)
  async getSession() {
    const { data } = await db.auth.getSession();
    return data.session;
  },

  // Get current user profile
  async getUser() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data: profile } = await db.from('users').select('*').eq('id', user.id).single();
    return profile;
  },

  // Invite / create a new user (Admin only — uses Supabase Admin API)
  // For creating users from Settings page, use the Admin SDK on a secure edge function
  // OR use Supabase Dashboard → Authentication → Users → Add User
  // Then the trigger will auto-create the public.users profile

  // Change own password
  async changePassword(newPassword) {
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  // Send password reset email
  async sendPasswordReset(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/index.html'
    });
    if (error) throw new Error(error.message);
  },

  // Listen for auth state changes
  onAuthChange(callback) {
    return db.auth.onAuthStateChange(callback);
  }
};

// ================================================================
//  GENERIC CRUD HELPER
//  Replaces apiCall() — same pattern, way simpler
// ================================================================
const DB = {

  // List rows with optional filters
  // filters: { column: value } — all are equality checks
  // Example: DB.list('tasks', { assignee: userId, status: 'Todo' })
  async list(table, filters = {}, options = {}) {
    let query = db.from(table).select(options.select || '*');

    Object.entries(filters).forEach(([col, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query = query.eq(col, val);
      }
    });

    if (options.order) query = query.order(options.order, { ascending: options.asc ?? false });
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Get single row by id
  async get(table, id, idCol = 'id') {
    const { data, error } = await db.from(table).select('*').eq(idCol, id).single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Insert a new row
  async create(table, row) {
    const { data, error } = await db.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Update a row by id
  async update(table, id, patch, idCol = 'id') {
    const { data, error } = await db.from(table).update(patch).eq(idCol, id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Delete a row by id
  async delete(table, id, idCol = 'id') {
    const { error } = await db.from(table).delete().eq(idCol, id);
    if (error) throw new Error(error.message);
    return true;
  },

  // Raw query builder (for complex queries)
  // Returns the Supabase query builder directly
  query(table) {
    return db.from(table);
  }
};

// ================================================================
//  MODULE-SPECIFIC HELPERS
//  Drop-in replacements for your GAS module actions
// ================================================================
const WorkVoltDB = {

  // ── Users ──────────────────────────────────────────────────────
  users: {
    list:       (filters = {}) => DB.list('users', filters, { order: 'name', asc: true }),
    get:        (id) => DB.get('users', id),
    update:     (id, patch) => DB.update('users', id, patch),
    deactivate: (id) => DB.update('users', id, { active: false }),
    reactivate: (id) => DB.update('users', id, { active: true }),
  },

  // ── Notifications ──────────────────────────────────────────────
  notifications: {
    list:       (userId) => DB.list('notifications', { user_id: userId }, { order: 'created_at' }),
    unreadCount: async (userId) => {
      const { count } = await db.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false);
      return count || 0;
    },
    create:   (row) => DB.create('notifications', row),
    markRead: (id)  => DB.update('notifications', id, { read: true }),
    delete:   (id)  => DB.delete('notifications', id),
  },

  // ── Tasks ──────────────────────────────────────────────────────
  tasks: {
    list:   (filters = {}) => DB.list('tasks', filters, { order: 'created_at' }),
    create: (row)  => DB.create('tasks', row),
    update: (id, patch) => DB.update('tasks', id, patch),
    delete: (id)   => DB.delete('tasks', id),
  },

  // ── Pipeline ──────────────────────────────────────────────────
  pipeline: {
    deals:        (filters = {}) => DB.list('pipeline_deals', filters, { order: 'created_at' }),
    stages:       ()             => DB.list('pipeline_stages', {}, { order: 'order', asc: true }),
    createDeal:   (row)          => DB.create('pipeline_deals', row),
    updateDeal:   (id, patch)    => DB.update('pipeline_deals', id, patch),
    deleteDeal:   (id)           => DB.delete('pipeline_deals', id),
  },

  // ── Payroll ───────────────────────────────────────────────────
  payroll: {
    employees:      (filters = {}) => DB.list('payroll_employees', filters),
    runs:           (filters = {}) => DB.list('payroll_runs', filters, { order: 'created_at' }),
    createEmployee: (row) => DB.create('payroll_employees', row),
    updateEmployee: (id, patch) => DB.update('payroll_employees', id, patch),
    deleteEmployee: (id) => DB.delete('payroll_employees', id),
    createRun:      (row) => DB.create('payroll_runs', row),
    updateRun:      (id, patch) => DB.update('payroll_runs', id, patch),
  },

  // ── Timesheets ────────────────────────────────────────────────
  timesheets: {
    list:    (filters = {}) => DB.list('timesheets', filters, { order: 'date' }),
    create:  (row)  => DB.create('timesheets', row),
    update:  (id, patch) => DB.update('timesheets', id, patch),
    delete:  (id)   => DB.delete('timesheets', id),
    approve: (id, approverId) => DB.update('timesheets', id, { status: 'Approved', approved_by: approverId }),
  },

  // ── Financials ────────────────────────────────────────────────
  financials: {
    transactions: (filters = {}) => DB.list('financial_transactions', filters, { order: 'date' }),
    categories:   ()             => DB.list('financial_categories'),
    create:       (row)          => DB.create('financial_transactions', row),
    update:       (id, patch)    => DB.update('financial_transactions', id, patch),
    delete:       (id)           => DB.delete('financial_transactions', id),
    summary: async () => {
      const rows = await DB.list('financial_transactions');
      const income  = rows.filter(r => r.type === 'Income').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const expense = rows.filter(r => r.type === 'Expense').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      return { income, expense, net: income - expense };
    }
  },

  // ── CRM ───────────────────────────────────────────────────────
  crm: {
    contacts:         (filters = {}) => DB.list('crm_contacts', filters, { order: 'name', asc: true }),
    interactions:     (contactId)    => DB.list('crm_interactions', { contact_id: contactId }, { order: 'date' }),
    createContact:    (row)  => DB.create('crm_contacts', row),
    updateContact:    (id, patch) => DB.update('crm_contacts', id, patch),
    deleteContact:    (id)   => DB.delete('crm_contacts', id),
    createInteraction:(row)  => DB.create('crm_interactions', row),
    deleteInteraction:(id)   => DB.delete('crm_interactions', id),
  },

  // ── Projects ──────────────────────────────────────────────────
  projects: {
    list:             (filters = {}) => DB.list('projects', filters, { order: 'created_at' }),
    milestones:       (projectId)    => DB.list('project_milestones', { project_id: projectId }, { order: 'due_date', asc: true }),
    create:           (row)  => DB.create('projects', row),
    update:           (id, patch) => DB.update('projects', id, patch),
    delete:           (id)   => DB.delete('projects', id),
    createMilestone:  (row)  => DB.create('project_milestones', row),
    updateMilestone:  (id, patch) => DB.update('project_milestones', id, patch),
    deleteMilestone:  (id)   => DB.delete('project_milestones', id),
  },

  // ── Assets ────────────────────────────────────────────────────
  assets: {
    list:   (filters = {}) => DB.list('assets', filters, { order: 'name', asc: true }),
    create: (row)  => DB.create('assets', row),
    update: (id, patch) => DB.update('assets', id, patch),
    delete: (id)   => DB.delete('assets', id),
  },

  // ── Attendance ────────────────────────────────────────────────
  attendance: {
    list:     (filters = {}) => DB.list('attendance', filters, { order: 'date' }),
    checkIn:  (employeeId, name) => DB.create('attendance', {
      employee_id: employeeId,
      employee_name: name,
      date: new Date().toISOString().split('T')[0],
      check_in: new Date().toISOString(),
      status: 'Present'
    }),
    checkOut: (id) => DB.update('attendance', id, { check_out: new Date().toISOString() }),
    create:   (row)  => DB.create('attendance', row),
    update:   (id, patch) => DB.update('attendance', id, patch),
    delete:   (id)   => DB.delete('attendance', id),
  },

  // ── Invoices ──────────────────────────────────────────────────
  invoices: {
    list:        (filters = {}) => DB.list('invoices', filters, { order: 'created_at' }),
    items:       (invoiceId)    => DB.list('invoice_items', { invoice_id: invoiceId }),
    create:      (row)  => DB.create('invoices', row),
    update:      (id, patch) => DB.update('invoices', id, patch),
    delete:      (id)   => DB.delete('invoices', id),
    createItem:  (row)  => DB.create('invoice_items', row),
    deleteItem:  (id)   => DB.delete('invoice_items', id),
  },

  // ── Inventory ─────────────────────────────────────────────────
  inventory: {
    items:       (filters = {}) => DB.list('inventory_items', filters, { order: 'name', asc: true }),
    movements:   (filters = {}) => DB.list('inventory_movements', filters, { order: 'created_at' }),
    lowStock: async () => {
      const { data, error } = await db.from('inventory_items').select('*').filter('quantity', 'lte', db.raw('reorder_point'));
      if (error) throw new Error(error.message);
      return data || [];
    },
    create:      (row)  => DB.create('inventory_items', row),
    update:      (id, patch) => DB.update('inventory_items', id, patch),
    delete:      (id)   => DB.delete('inventory_items', id),
    createMovement: (row) => DB.create('inventory_movements', row),
  },

  // ── Scheduler ─────────────────────────────────────────────────
  scheduler: {
    shifts: (filters = {}) => DB.list('scheduler_shifts', filters, { order: 'date', asc: true }),
    create: (row)  => DB.create('scheduler_shifts', row),
    update: (id, patch) => DB.update('scheduler_shifts', id, patch),
    delete: (id)   => DB.delete('scheduler_shifts', id),
  },

  // ── Expenses ──────────────────────────────────────────────────
  expenses: {
    list:    (filters = {}) => DB.list('expenses', filters, { order: 'date' }),
    create:  (row)  => DB.create('expenses', row),
    update:  (id, patch) => DB.update('expenses', id, patch),
    delete:  (id)   => DB.delete('expenses', id),
    approve: (id, approverId) => DB.update('expenses', id, { status: 'Approved', approved_by: approverId }),
    reject:  (id, approverId) => DB.update('expenses', id, { status: 'Rejected',  approved_by: approverId }),
  },

  // ── Contracts ─────────────────────────────────────────────────
  contracts: {
    list:    (filters = {}) => DB.list('contracts', filters, { order: 'created_at' }),
    expiring: async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      const { data, error } = await db.from('contracts').select('*')
        .eq('status', 'Active')
        .lte('end_date', soon.toISOString().split('T')[0]);
      if (error) throw new Error(error.message);
      return data || [];
    },
    create:  (row)  => DB.create('contracts', row),
    update:  (id, patch) => DB.update('contracts', id, patch),
    delete:  (id)   => DB.delete('contracts', id),
  },

  // ── Helpdesk ──────────────────────────────────────────────────
  helpdesk: {
    list:    (filters = {}) => DB.list('helpdesk_tickets', filters, { order: 'created_at' }),
    create:  (row)  => DB.create('helpdesk_tickets', row),
    update:  (id, patch) => DB.update('helpdesk_tickets', id, patch),
    delete:  (id)   => DB.delete('helpdesk_tickets', id),
    resolve: (id, resolution) => DB.update('helpdesk_tickets', id, {
      status: 'Resolved',
      resolution,
      resolved_at: new Date().toISOString()
    }),
  },

  // ── Recruitment ───────────────────────────────────────────────
  recruitment: {
    jobs:            (filters = {}) => DB.list('recruitment_jobs', filters),
    candidates:      (filters = {}) => DB.list('recruitment_candidates', filters, { order: 'created_at' }),
    createJob:       (row)  => DB.create('recruitment_jobs', row),
    updateJob:       (id, patch) => DB.update('recruitment_jobs', id, patch),
    deleteJob:       (id)   => DB.delete('recruitment_jobs', id),
    createCandidate: (row)  => DB.create('recruitment_candidates', row),
    updateCandidate: (id, patch) => DB.update('recruitment_candidates', id, patch),
    deleteCandidate: (id)   => DB.delete('recruitment_candidates', id),
  },

  // ── Config ────────────────────────────────────────────────────
  config: {
    get: async (key) => {
      const { data } = await db.from('config').select('value').eq('key', key).single();
      return data?.value || null;
    },
    set: async (key, value) => {
      const { error } = await db.from('config').upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    getAll: async () => {
      const { data, error } = await db.from('config').select('*');
      if (error) throw new Error(error.message);
      return Object.fromEntries((data || []).map(r => [r.key, r.value]));
    },
    getInstalledModules: async () => {
      const val = await WorkVoltDB.config.get('installed_modules');
      try { return JSON.parse(val) || []; } catch(e) { return []; }
    },
    saveInstalledModules: async (modules) => {
      await WorkVoltDB.config.set('installed_modules', JSON.stringify(modules));
    }
  },

};

// ================================================================
//  REAL-TIME SUBSCRIPTIONS (optional)
//  Use these to get live updates without polling
// ================================================================
const Realtime = {

  // Subscribe to a table's changes
  // Example: Realtime.subscribe('tasks', (payload) => console.log(payload))
  subscribe(table, callback) {
    return db.channel('public:' + table)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  },

  // Unsubscribe
  unsubscribe(channel) {
    db.removeChannel(channel);
  }
};

// Expose globally
window.db        = db;
window.Auth      = Auth;
window.DB        = DB;
window.WorkVoltDB = WorkVoltDB;
window.Realtime  = Realtime;
