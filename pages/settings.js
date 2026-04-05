window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['settings'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  let activeTab    = 'users';
  let usersCache   = [];
  let editingUser  = null;
  let modulesCache = Array.isArray(window.INSTALLED_MODULES) ? [...window.INSTALLED_MODULES] : [];

  // ── Shorthand ──────────────────────────────────────────────────
  const db = window.WorkVoltDB;

  // ================================================================
  //  RENDER HELPERS
  // ================================================================
  function roleBadge(role) {
    const map = {
      SuperAdmin: 'bg-purple-100 text-purple-700',
      Admin:      'bg-blue-100 text-blue-700',
      Manager:    'bg-indigo-100 text-indigo-700',
      Employee:   'bg-green-100 text-green-700',
      Contractor: 'bg-amber-100 text-amber-700',
    };
    const cls = map[role] || 'bg-slate-100 text-slate-600';
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${role || '—'}</span>`;
  }

  function activeBadge(active) {
    return active === true || active === 'true'
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Active</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Inactive</span>`;
  }

  function setModalContent(html) {
    document.getElementById('user-modal').innerHTML = html;
    document.getElementById('user-modal-backdrop').classList.remove('hidden');
  }

  function setFormStatus(msg, ok) {
    const el = document.getElementById('user-form-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3
        ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}">
        <i class="fas ${ok ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${msg}</span>
      </div>`;
  }

  function setModuleStatus(msg, ok) {
    const el = document.getElementById('modules-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4
        ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}">
        <i class="fas ${ok ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${msg}</span>
      </div>`;
  }

  // ================================================================
  //  MAIN RENDER
  // ================================================================
  function render() {
    const tabs = [
      { id: 'users',        label: 'User Management', icon: 'fa-users' },
      { id: 'modules',      label: 'Modules',         icon: 'fa-store' },
      { id: 'admin-config', label: 'Admin Config',    icon: 'fa-sliders-h' },
      { id: 'database',     label: 'Database',        icon: 'fa-database' },
    ];

    const tabNav = tabs.map(t => `
      <button onclick="settingsTab('${t.id}')"
        class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors
          ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
        <i class="fas ${t.icon} text-xs"></i>${t.label}
      </button>`
    ).join('');

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 py-6">
          <h1 class="text-xl font-extrabold text-slate-900">Settings</h1>
          <p class="text-slate-500 text-sm mt-1">Configure your Work Volt workspace</p>
        </div>
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 flex gap-1 overflow-x-auto">
          ${tabNav}
        </div>
        <div id="settings-tab-content" class="max-w-4xl mx-auto px-6 md:px-10 py-8">
          ${activeTab === 'users'        ? renderUsersTab()       :
            activeTab === 'modules'      ? renderModulesTab()     :
            activeTab === 'admin-config' ? renderAdminConfigTab() :
                                           renderDatabaseTab()}
        </div>
      </div>`;

    if (activeTab === 'users')        loadUsers();
    if (activeTab === 'modules')      loadModules();
    if (activeTab === 'admin-config') loadAdminConfig();
  }

  window.settingsTab = function(tab) { activeTab = tab; render(); };

  // ================================================================
  //  DATABASE TAB — shows current provider info + switch option
  // ================================================================
  function renderDatabaseTab() {
    const providerType = window.getAdapterType ? window.getAdapterType() : 'unknown';
    const info = (window.ADAPTER_INFO || {})[providerType] || {};
    const colors = { supabase:'#3ecf8e', firebase:'#f5820d', sheets:'#0f9d58' };
    const hasServiceKey = !!window._wvSupabaseServiceKey;

    return `
      <div class="max-w-2xl space-y-6">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm flex-shrink-0"
                 style="background:${colors[providerType]||'#64748b'}">
              <i class="fas ${info.icon||'fa-database'}"></i>
            </div>
            <div class="flex-1">
              <h2 class="font-bold text-slate-900">Database Connection</h2>
              <p class="text-xs text-slate-500 mt-0.5">${info.label || providerType} — connected</p>
            </div>
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Connected
            </span>
          </div>
          <div class="px-6 py-5 space-y-4">
            <p class="text-sm text-slate-500">
              Your database credentials are saved in this browser. To switch to a different database provider,
              sign out and enter new credentials on the login page.
            </p>
            <div class="flex gap-3">
              <button onclick="window.WorkVolt.navigate('dashboard')" class="btn-secondary flex-1">
                <i class="fas fa-arrow-left text-sm"></i> Back to Dashboard
              </button>
              <button onclick="if(confirm('Sign out and switch database?')) { window.WorkVoltDB.auth.logout().then(()=>{ sessionStorage.clear(); window.location.href='index.html'; }); }"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-sm font-semibold transition-colors">
                <i class="fas fa-plug text-sm"></i> Switch Database
              </button>
            </div>
          </div>
        </div>

        ${providerType === 'supabase' ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fas fa-key text-amber-600 text-sm"></i>
            </div>
            <div class="flex-1">
              <h2 class="font-bold text-slate-900">Service Role Key</h2>
              <p class="text-xs text-slate-500 mt-0.5">Required to create user accounts from the Recruitment module</p>
            </div>
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${hasServiceKey ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
              <span class="w-1.5 h-1.5 rounded-full ${hasServiceKey ? 'bg-green-500' : 'bg-amber-500'}"></span>
              ${hasServiceKey ? 'Configured' : 'Not set'}
            </span>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div class="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <i class="fas fa-exclamation-triangle flex-shrink-0 mt-0.5"></i>
              <span>Find this in <strong>Supabase Dashboard → Project Settings → API → service_role key</strong>. Stored only in your browser, never sent anywhere except Supabase.</span>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Service Role Key</label>
              <input id="db-service-key" type="password" placeholder="eyJhbGciOiJIUzI1NiIs…"
                value="${hasServiceKey ? '••••••••••••••••' : ''}"
                class="field text-sm font-mono">
            </div>
            <div id="db-service-key-status"></div>
            <button onclick="saveServiceKey()" class="btn-primary w-full">
              <i class="fas fa-save text-sm"></i> Save Service Role Key
            </button>
          </div>
        </div>` : ''}
      </div>`;
  }

  window.saveServiceKey = function() {
    const input = document.getElementById('db-service-key');
    const statusEl = document.getElementById('db-service-key-status');
    const val = (input?.value || '').trim();

    if (!val || val.startsWith('•')) {
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle"></i><span>Please enter your Service Role Key.</span></div>`;
      return;
    }

    // Store in localStorage alongside existing credentials
    try {
      const stored = JSON.parse(localStorage.getItem('wv_db_config') || '{}');
      stored.credentials = stored.credentials || {};
      stored.credentials.serviceKey = val;
      localStorage.setItem('wv_db_config', JSON.stringify(stored));
      window._wvSupabaseServiceKey = val;
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-green-50 text-green-700 border border-green-200"><i class="fas fa-check-circle"></i><span>Service Role Key saved!</span></div>`;
      setTimeout(() => render(), 1500);
    } catch(e) {
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle"></i><span>${e.message}</span></div>`;
    }
  };

  // ================================================================
  //  USERS TAB
  // ================================================================
  function renderUsersTab() {
    return `
      <div>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Users</h2>
            <p class="text-sm text-slate-500" id="users-count">Loading…</p>
          </div>
          <button onclick="usersOpenAdd()" class="btn-primary">
            <i class="fas fa-user-plus text-sm"></i> Add User
          </button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div id="users-table-wrap">
            <div class="flex items-center justify-center py-16 text-slate-400">
              <i class="fas fa-circle-notch fa-spin text-2xl"></i>
            </div>
          </div>
        </div>
        <div id="user-modal-backdrop" class="hidden fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onclick="usersBackdropClick(event)">
          <div id="user-modal" class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto z-50"></div>
        </div>
      </div>`;
  }

  function renderUsersTable(users) {
    if (!users.length) {
      return `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
        <i class="fas fa-users text-3xl mb-3"></i><p class="text-sm">No users found</p></div>`;
    }
    const rows = users.map(u => {
      const initials = (u.name || u.email || '?').charAt(0).toUpperCase();
      const avatar = u.avatar_url
        ? `<img src="${u.avatar_url}" class="w-8 h-8 rounded-full object-cover">`
        : `<div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">${initials}</div>`;

      const uid = u.id || u.user_id;
      const toggleBtn = (u.active === true || u.active === 'true')
        ? `<button onclick="usersToggleActive('${uid}',false)" title="Deactivate" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"><i class="fas fa-user-slash text-xs"></i></button>`
        : `<button onclick="usersToggleActive('${uid}',true)"  title="Reactivate" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"><i class="fas fa-user-check text-xs"></i></button>`;

      return `
        <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3 min-w-0">
            <div class="flex items-center gap-3">${avatar}
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900 truncate">${u.name || '—'}</div>
                <div class="text-xs text-slate-500 truncate">${u.email || ''}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">${roleBadge(u.role)}</td>
          <td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">${u.department || '—'}</td>
          <td class="px-4 py-3 whitespace-nowrap">${activeBadge(u.active)}</td>
          <td class="px-4 py-3 whitespace-nowrap">
            <div class="flex items-center gap-1">
              <button onclick="usersOpenEdit('${uid}')" title="Edit" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-pencil text-xs"></i></button>
              <button onclick="usersResetPassword('${uid}','${(u.email||'').replace(/'/g,"\\'")}','${(u.name||'').replace(/'/g,"\\'")}' )" title="Reset password" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><i class="fas fa-key text-xs"></i></button>
              ${toggleBtn}
              <button onclick="usersConfirmDelete('${uid}','${(u.name||u.email||'').replace(/'/g,"\\'")}' )" title="Delete" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead><tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <th class="px-4 py-3">User</th>
            <th class="px-4 py-3">Role</th>
            <th class="px-4 py-3">Department</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderUserForm(user) {
    const isEdit   = !!user;
    const val      = f => (isEdit && user[f] != null ? String(user[f]).replace(/"/g,'&quot;') : '');
    const roles    = ['SuperAdmin','Admin','Manager','Employee','Contractor'];
    const payTypes = ['','hourly','salary','pay_per_task'];

    const roleOpts    = roles.map(r    => `<option value="${r}"${val('role')===r?' selected':''}>${r}</option>`).join('');
    const payTypeOpts = payTypes.map(p => `<option value="${p}"${val('pay_type')===p?' selected':''}>${p||'— Select —'}</option>`).join('');

    const passwordField = !isEdit ? `
      <div>
        <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
          Password <span class="text-red-500">*</span>
        </label>
        <input id="uf-password" type="password" placeholder="Temporary password" class="field text-sm">
        <p class="text-xs text-slate-400 mt-1">
          <i class="fas fa-info-circle mr-1"></i>
          This creates the user in Supabase Auth. They can change their password after logging in.
        </p>
      </div>` : '';

    return `
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-slate-900">${isEdit ? 'Edit User' : 'Add User'}</h3>
        <button onclick="usersCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100">
          <i class="fas fa-times text-sm"></i>
        </button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div id="user-form-status"></div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Full Name</label>
            <input id="uf-name" type="text" placeholder="Jane Smith" value="${val('name')}" class="field text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Email <span class="text-red-500">*</span></label>
            <input id="uf-email" type="email" placeholder="jane@company.com" value="${val('email')}" class="field text-sm" ${isEdit?'readonly':''}>
            ${isEdit?'<p class="text-xs text-slate-400 mt-1">Email cannot be changed after creation.</p>':''}
          </div>
        </div>
        ${passwordField}
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Role <span class="text-red-500">*</span></label>
            <select id="uf-role" class="field text-sm"><option value="">— Select —</option>${roleOpts}</select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Department</label>
            <input id="uf-department" type="text" placeholder="Engineering" value="${val('department')}" class="field text-sm">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Job Title</label>
            <input id="uf-job_title" type="text" placeholder="Software Engineer" value="${val('job_title')}" class="field text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Phone</label>
            <input id="uf-phone" type="tel" placeholder="+1 555 000 0000" value="${val('phone')}" class="field text-sm">
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Pay Type</label>
            <select id="uf-pay_type" class="field text-sm">${payTypeOpts}</select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Hourly Rate</label>
            <input id="uf-hourly_rate" type="number" placeholder="0.00" value="${val('hourly_rate')}" class="field text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Salary</label>
            <input id="uf-salary" type="number" placeholder="0.00" value="${val('salary')}" class="field text-sm">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Start Date</label>
            <input id="uf-start_date" type="date" value="${val('start_date')}" class="field text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Avatar URL</label>
            <input id="uf-avatar_url" type="url" placeholder="https://…" value="${val('avatar_url')}" class="field text-sm">
          </div>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="usersCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="usersSubmitForm('${isEdit ? (user.id||user.user_id) : ''}')" id="user-form-btn" class="btn-primary flex-1">
            <i class="fas ${isEdit?'fa-save':'fa-user-plus'} text-sm"></i>
            ${isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>`;
  }

  function renderResetModal(userId, email, name) {
    return `
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-slate-900">Reset Password</h3>
        <button onclick="usersCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div id="user-form-status"></div>
        <p class="text-sm text-slate-600">Set a new password for <strong>${name || email}</strong>.</p>
        <div>
          <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">New Password <span class="text-red-500">*</span></label>
          <input id="uf-new-password" type="password" placeholder="New password" class="field text-sm">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Confirm Password <span class="text-red-500">*</span></label>
          <input id="uf-confirm-password" type="password" placeholder="Confirm password" class="field text-sm">
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="usersCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="usersSubmitReset('${userId}')" id="user-form-btn" class="btn-primary flex-1">
            <i class="fas fa-key text-sm"></i> Set Password
          </button>
        </div>
      </div>`;
  }

  function renderDeleteModal(userId, displayName) {
    return `
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-red-700">Delete User</h3>
        <button onclick="usersCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
          <i class="fas fa-exclamation-triangle text-red-500 mt-0.5"></i>
          <p class="text-sm text-red-700">Permanently delete <strong>${displayName}</strong>? This cannot be undone.</p>
        </div>
        <div id="user-form-status"></div>
        <div class="flex gap-3 pt-1">
          <button onclick="usersCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="usersSubmitDelete('${userId}')" id="user-form-btn"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
            <i class="fas fa-trash text-sm"></i> Delete Permanently
          </button>
        </div>
      </div>`;
  }

  // ── Load users ──────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const rows = await db.users.list();
      usersCache = rows;
      const countEl = document.getElementById('users-count');
      if (countEl) countEl.textContent = `${rows.length} user${rows.length !== 1 ? 's' : ''}`;
      const wrap = document.getElementById('users-table-wrap');
      if (wrap) wrap.innerHTML = renderUsersTable(rows);
    } catch(e) {
      const wrap = document.getElementById('users-table-wrap');
      if (wrap) wrap.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-red-400">
          <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
          <p class="text-sm">${e.message}</p>
        </div>`;
    }
  }

  // ── User modal actions ──────────────────────────────────────────
  window.usersBackdropClick = function(e) {
    if (e.target === document.getElementById('user-modal-backdrop')) usersCloseModal();
  };

  window.usersOpenAdd = function() {
    editingUser = null;
    setModalContent(renderUserForm(null));
  };

  window.usersOpenEdit = function(userId) {
    editingUser = usersCache.find(u => (u.id||u.user_id) === userId) || null;
    if (!editingUser) return;
    setModalContent(renderUserForm(editingUser));
  };

  window.usersCloseModal = function() {
    document.getElementById('user-modal-backdrop')?.classList.add('hidden');
    document.getElementById('user-modal').innerHTML = '';
    editingUser = null;
  };

  window.usersSubmitForm = async function(userId) {
    const btn    = document.getElementById('user-form-btn');
    const isEdit = !!userId;
    const email  = document.getElementById('uf-email')?.value.trim() || '';
    const role   = document.getElementById('uf-role')?.value || '';
    const pw     = !isEdit ? (document.getElementById('uf-password')?.value || '') : null;

    if (!email) return setFormStatus('Email is required.', false);
    if (!role)  return setFormStatus('Role is required.', false);
    if (!isEdit && !pw) return setFormStatus('Password is required.', false);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }

    try {
      const patch = {
        name:        document.getElementById('uf-name')?.value.trim() || '',
        role,
        department:  document.getElementById('uf-department')?.value.trim() || '',
        job_title:   document.getElementById('uf-job_title')?.value.trim() || '',
        phone:       document.getElementById('uf-phone')?.value.trim() || '',
        pay_type:    document.getElementById('uf-pay_type')?.value || null,
        hourly_rate: document.getElementById('uf-hourly_rate')?.value || null,
        salary:      document.getElementById('uf-salary')?.value || null,
        start_date:  document.getElementById('uf-start_date')?.value || null,
        avatar_url:  document.getElementById('uf-avatar_url')?.value.trim() || '',
      };

      if (isEdit) {
        // Update existing profile in public.users
        await db.update('users', userId, patch);
        setFormStatus('User updated successfully.', true);
      } else {
        // New user: must be created via Supabase Auth Admin API
        // We call our Supabase edge function or use the service role
        // For now we update the profile row that the trigger created
        // Step 1: create auth user (requires service role — show instructions)
        setFormStatus(
          'To create users, go to <strong>Supabase → Authentication → Users → Add User</strong>, ' +
          'then come back and edit the row to set their role and details.',
          false
        );
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus text-sm"></i> Create User'; }
        return;
      }

      setTimeout(() => { usersCloseModal(); loadUsers(); }, 900);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isEdit
          ? '<i class="fas fa-save text-sm"></i> Save Changes'
          : '<i class="fas fa-user-plus text-sm"></i> Create User';
      }
    }
  };

  window.usersResetPassword = function(userId, email, name) {
    setModalContent(renderResetModal(userId, email, name));
  };

  window.usersSubmitReset = async function(userId) {
    const btn     = document.getElementById('user-form-btn');
    const newPass = document.getElementById('uf-new-password')?.value || '';
    const confirm = document.getElementById('uf-confirm-password')?.value || '';

    if (!newPass)           return setFormStatus('Please enter a new password.', false);
    if (newPass !== confirm) return setFormStatus('Passwords do not match.', false);
    if (newPass.length < 6)  return setFormStatus('Password must be at least 6 characters.', false);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }

    try {
      // Send reset email via Supabase Auth
      const user = usersCache.find(u => (u.id||u.user_id) === userId);
      if (!user) throw new Error('User not found');
      await db.auth.resetPassword(user.email);
      setFormStatus('Password reset email sent to ' + user.email, true);
      setTimeout(() => usersCloseModal(), 1500);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key text-sm"></i> Set Password'; }
    }
  };

  window.usersToggleActive = async function(userId, active) {
    try {
      await db.update('users', userId, { active });
      loadUsers();
    } catch(e) {
      window.WorkVolt?.toast(e.message, 'error');
    }
  };

  window.usersConfirmDelete = function(userId, displayName) {
    setModalContent(renderDeleteModal(userId, displayName));
  };

  window.usersSubmitDelete = async function(userId) {
    const btn = document.getElementById('user-form-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Deleting…'; }
    try {
      await db.delete('users', userId);
      setFormStatus('User deleted.', true);
      setTimeout(() => { usersCloseModal(); loadUsers(); }, 700);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-sm"></i> Delete Permanently'; }
    }
  };

  // ================================================================
  //  ADMIN CONFIG TAB
  // ================================================================
  function renderAdminConfigTab() {
    return `
      <div class="max-w-2xl space-y-6">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-sliders-h text-white text-sm"></i>
            </div>
            <div>
              <h2 class="font-bold text-slate-900">App Configuration</h2>
              <p class="text-xs text-slate-500">Stored in your Supabase config table</p>
            </div>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div id="admin-config-status"></div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">App Name</label>
              <input id="cfg-app_name" type="text" placeholder="Work Volt" class="field text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Default Currency</label>
              <select id="cfg-currency" class="field text-sm">
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Date Format</label>
              <select id="cfg-date_format" class="field text-sm">
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <button onclick="saveAdminConfig()" id="admin-config-save-btn" class="btn-primary w-full">
              <i class="fas fa-save text-sm"></i> Save Configuration
            </button>
          </div>
        </div>
      </div>`;
  }

  async function loadAdminConfig() {
    try {
      const settings = await db.config.getAll();
      if (settings.app_name)    { const el = document.getElementById('cfg-app_name');    if(el) el.value = settings.app_name; }
      if (settings.currency)    { const el = document.getElementById('cfg-currency');    if(el) el.value = settings.currency; }
      if (settings.date_format) { const el = document.getElementById('cfg-date_format'); if(el) el.value = settings.date_format; }
    } catch(e) { console.warn('Could not load admin config:', e.message); }
  }

  window.saveAdminConfig = async function() {
    const btn      = document.getElementById('admin-config-save-btn');
    const statusEl = document.getElementById('admin-config-status');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }
    statusEl.innerHTML = '';
    try {
      await db.config.set('app_name',    document.getElementById('cfg-app_name')?.value    || '');
      await db.config.set('currency',    document.getElementById('cfg-currency')?.value    || 'USD');
      await db.config.set('date_format', document.getElementById('cfg-date_format')?.value || 'MM/DD/YYYY');
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3 bg-green-50 text-green-700 border border-green-200"><i class="fas fa-check-circle"></i><span>Configuration saved!</span></div>`;
    } catch(e) {
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3 bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle"></i><span>${e.message}</span></div>`;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save text-sm"></i> Save Configuration'; }
  };

  // ================================================================
  //  MODULES TAB
  // ================================================================
  const ADDON_CATALOGUE = {
    notifications: { label:'Notifications',         icon:'fa-bell',               description:'Full notification center with bell alerts, unread counts and mark-as-read.' },
    tasks:         { label:'Tasks',                 icon:'fa-check-circle',       description:'Create, assign and track tasks with priority, billing and status tracking.' },
    pipeline:      { label:'Pipeline',              icon:'fa-users',              description:'Visual sales pipeline to manage leads and deals through custom stages.' },
    payroll:       { label:'Payroll',               icon:'fa-money-bill-wave',    description:'Run payroll for hourly, salaried and pay-per-task employees.' },
    timesheets:    { label:'Timesheets',            icon:'fa-clock',              description:'Log and approve work hours with project and task tracking.' },
    financials:    { label:'Financials',            icon:'fa-chart-line',         description:'Track income, expenses and financial KPIs in one place.' },
    crm:           { label:'CRM',                   icon:'fa-address-book',       description:'Manage contacts, companies and customer relationships.' },
    projects:      { label:'Projects',              icon:'fa-folder-open',        description:'Organise work into projects with milestones and team assignments.' },
    reports:       { label:'Reports',               icon:'fa-chart-pie',          description:'Auto-generated reports across all installed modules.' },
    assets:        { label:'Assets',                icon:'fa-box-open',           description:'Track company assets, assignments and maintenance schedules.' },
    attendance:    { label:'Attendance Tracker',    icon:'fa-calendar-check',     description:'Monitor employee check-ins, absences and leave requests.' },
    invoices:      { label:'Invoice Manager',       icon:'fa-file-invoice-dollar',description:'Create and send professional invoices, track payment status.' },
    inventory:     { label:'Inventory Control',     icon:'fa-warehouse',          description:'Manage stock levels, SKUs, suppliers and reorder points.' },
    scheduler:     { label:'Shift Scheduler',       icon:'fa-calendar-alt',       description:'Build and publish shift schedules for your team.' },
    expenses:      { label:'Expense Claims',        icon:'fa-receipt',            description:'Submit, review and reimburse employee expense claims.' },
    contracts:     { label:'Contract Hub',          icon:'fa-file-signature',     description:'Store and manage contracts with expiry reminders.' },
    helpdesk:      { label:'Help Desk',             icon:'fa-headset',            description:'Internal ticket system for employee IT and HR requests.' },
    recruitment:   { label:'Recruitment Pipeline',  icon:'fa-user-tie',           description:'Track candidates through your hiring pipeline.' },
  };

  function renderModulesTab() {
    return `
      <div>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Modules</h2>
            <p class="text-sm text-slate-500">Install or remove modules. Data is stored in your Supabase database.</p>
          </div>
          <button onclick="loadModules()" class="btn-secondary text-xs px-3 py-2">
            <i class="fas fa-sync-alt text-xs"></i> Refresh
          </button>
        </div>
        <div id="modules-status"></div>
        <div class="mb-6">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Installed</h3>
          <div id="modules-installed" class="space-y-2">
            <div class="flex items-center justify-center py-8 text-slate-400">
              <i class="fas fa-circle-notch fa-spin text-xl"></i>
            </div>
          </div>
        </div>
        <div>
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Available</h3>
          <div id="modules-available" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
        </div>
      </div>`;
  }

  async function loadModules() {
    try {
      modulesCache = await db.config.getInstalledModules();
      renderModuleLists();
    } catch(e) {
      setModuleStatus('Could not load modules: ' + e.message, false);
    }
  }

  function renderModuleLists() {
    const installedEl  = document.getElementById('modules-installed');
    const availableEl  = document.getElementById('modules-available');
    if (!installedEl || !availableEl) return;

    const installedIds = modulesCache.map(m => m.id);

    // Installed
    if (!modulesCache.length) {
      installedEl.innerHTML = '<p class="text-sm text-slate-400 py-4">No modules installed yet.</p>';
    } else {
      installedEl.innerHTML = modulesCache.map(m => {
        const def = ADDON_CATALOGUE[m.id] || {};
        return `
          <div class="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <div class="flex items-center gap-4">
              <div class="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <i class="fas ${def.icon||m.icon||'fa-layer-group'} text-blue-600 text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-slate-900 text-sm">${def.label||m.label}</div>
                <div class="text-xs text-slate-400 mt-0.5 truncate">${def.description||''}</div>
              </div>
              <button onclick="modulesUninstall('${m.id}')"
                class="text-xs text-red-500 hover:text-red-700 font-semibold bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg border border-red-200 transition-colors flex-shrink-0">
                Uninstall
              </button>
            </div>
          </div>`;
      }).join('');
    }

    // Available
    const available = Object.keys(ADDON_CATALOGUE).filter(id => !installedIds.includes(id));
    if (!available.length) {
      availableEl.innerHTML = '<p class="text-sm text-slate-400 py-4 col-span-2">All modules are installed!</p>';
    } else {
      availableEl.innerHTML = available.map(id => {
        const def = ADDON_CATALOGUE[id];
        return `
          <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <i class="fas ${def.icon} text-slate-500 text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-slate-900 text-sm">${def.label}</div>
                <div class="text-xs text-slate-500 mt-0.5 leading-relaxed">${def.description}</div>
              </div>
            </div>
            <button onclick="modulesInstall('${id}')" id="install-btn-${id}"
              class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
              <i class="fas fa-download text-xs"></i> Install
            </button>
          </div>`;
      }).join('');
    }
  }

  window.modulesInstall = async function(moduleId) {
    const btn = document.getElementById('install-btn-' + moduleId);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Installing…'; }
    setModuleStatus('', false);
    try {
      const def = ADDON_CATALOGUE[moduleId] || {};
      // Just register it in config — tables already exist from the SQL schema
      modulesCache.push({ id: moduleId, label: def.label, icon: def.icon, version: '1.0.0' });
      await db.config.saveInstalledModules(modulesCache);
      window.INSTALLED_MODULES = modulesCache;
      if (typeof window.renderNav === 'function') window.renderNav();
      setModuleStatus((def.label || moduleId) + ' installed successfully!', true);
      renderModuleLists();
    } catch(e) {
      setModuleStatus('Install failed: ' + e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download text-xs"></i> Install'; }
    }
  };

  window.modulesUninstall = async function(moduleId) {
    const def = ADDON_CATALOGUE[moduleId] || {};
    if (!confirm(`Uninstall ${def.label || moduleId}? Your data will be kept in Supabase.`)) return;
    setModuleStatus('', false);
    try {
      modulesCache = modulesCache.filter(m => m.id !== moduleId);
      await db.config.saveInstalledModules(modulesCache);
      window.INSTALLED_MODULES = modulesCache;
      if (typeof window.renderNav === 'function') window.renderNav();
      setModuleStatus((def.label || moduleId) + ' uninstalled. Data kept in Supabase.', true);
      renderModuleLists();
    } catch(e) {
      setModuleStatus('Uninstall failed: ' + e.message, false);
    }
  };

  // ── Boot ────────────────────────────────────────────────────────
  render();
};
