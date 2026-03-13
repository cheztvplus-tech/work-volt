window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['roles'] = function(container) {

  // ── Auth guard ─────────────────────────────────────────────────
  const user = window.WorkVolt?.user() || {};
  if (!['SuperAdmin', 'Admin'].includes(user.role)) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <i class="fas fa-lock text-4xl"></i>
        <p class="font-semibold">Access restricted to Admins only</p>
      </div>`;
    return;
  }

  // ── State ───────────────────────────────────────────────────────
  const savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  const savedSecret = localStorage.getItem('wv_api_secret') || '';
  const isConnected = !!(savedUrl && savedSecret);

  // All known roles
  const ALL_ROLES = ['SuperAdmin', 'Admin', 'Manager', 'Employee', 'Contractor'];

  // Role style config
  const ROLE_META = {
    SuperAdmin: { color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: 'fa-crown' },
    Admin:      { color: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-500',   icon: 'fa-shield-alt' },
    Manager:    { color: 'bg-indigo-100 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500', icon: 'fa-user-tie' },
    Employee:   { color: 'bg-green-100 text-green-700 border-green-200',    dot: 'bg-green-500',  icon: 'fa-user' },
    Contractor: { color: 'bg-amber-100 text-amber-700 border-amber-200',    dot: 'bg-amber-400',  icon: 'fa-user-clock' },
  };

  // Core fixed modules (always visible, dashboard always open to all)
  const CORE_MODULES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large',   fixedRoles: ALL_ROLES, fixed: true },
    { id: 'settings',  label: 'Settings',  icon: 'fa-cog',        fixedRoles: ['SuperAdmin','Admin'], fixed: true },
    { id: 'store',     label: 'Module Store', icon: 'fa-store',   fixedRoles: ['SuperAdmin','Admin'], fixed: true },
    { id: 'roles',     label: 'Role Permissions', icon: 'fa-shield-alt', fixedRoles: ['SuperAdmin','Admin'], fixed: true },
  ];

  // Add-on module catalogue (same as index.html ADDON_CATALOGUE)
  const ADDON_CATALOGUE = {
    notifications: { label: 'Notifications',        icon: 'fa-bell',               defaultRoles: ['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    tasks:         { label: 'Tasks',                 icon: 'fa-check-circle',       defaultRoles: ['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    pipeline:      { label: 'Pipeline',              icon: 'fa-users',              defaultRoles: ['SuperAdmin','Admin','Manager'] },
    payroll:       { label: 'Payroll',               icon: 'fa-money-bill-wave',    defaultRoles: ['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    timesheets:    { label: 'Timesheets',            icon: 'fa-clock',              defaultRoles: ['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    financials:    { label: 'Financials',            icon: 'fa-chart-line',         defaultRoles: ['SuperAdmin','Admin','Manager'] },
    crm:           { label: 'CRM',                   icon: 'fa-address-book',       defaultRoles: ['SuperAdmin','Admin','Manager'] },
    projects:      { label: 'Projects',              icon: 'fa-folder-open',        defaultRoles: ['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    reports:       { label: 'Reports',               icon: 'fa-chart-pie',          defaultRoles: ['SuperAdmin','Admin','Manager'] },
    assets:        { label: 'Assets',                icon: 'fa-box-open',           defaultRoles: ['SuperAdmin','Admin','Manager','Employee'] },
    attendance:    { label: 'Attendance Tracker',    icon: 'fa-calendar-check',     defaultRoles: ['SuperAdmin','Admin','Manager','Employee'] },
    invoices:      { label: 'Invoice Manager',       icon: 'fa-file-invoice-dollar',defaultRoles: ['SuperAdmin','Admin','Manager'] },
    inventory:     { label: 'Inventory Control',     icon: 'fa-warehouse',          defaultRoles: ['SuperAdmin','Admin','Manager'] },
    scheduler:     { label: 'Shift Scheduler',       icon: 'fa-calendar-alt',       defaultRoles: ['SuperAdmin','Admin','Manager'] },
    expenses:      { label: 'Expense Claims',        icon: 'fa-receipt',            defaultRoles: ['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    contracts:     { label: 'Contract Hub',          icon: 'fa-file-signature',     defaultRoles: ['SuperAdmin','Admin','Manager'] },
    helpdesk:      { label: 'Help Desk',             icon: 'fa-headset',            defaultRoles: ['SuperAdmin','Admin','Manager','Employee'] },
    recruitment:   { label: 'Recruitment Pipeline',  icon: 'fa-user-tie',           defaultRoles: ['SuperAdmin','Admin','Manager'] },
  };

  // Working copy of permissions: { moduleId: { role: bool } }
  let permissions = {};
  let usersCache  = [];
  let userOverrides = {}; // { userId: [moduleId, ...] }
  let activeTab   = 'matrix';
  let saving      = false;
  let loading     = true;
  let isDirty     = false;

  // ── API helper ─────────────────────────────────────────────────
  async function api(path, params = {}) {
    if (!isConnected) throw new Error('Not connected');
    const savedSheetId = localStorage.getItem('wv_sheet_id') || '';
    const url = new URL(savedUrl);
    url.searchParams.set('path', path);
    url.searchParams.set('token', savedSecret);
    url.searchParams.set('sheet_id', savedSheetId);
    url.searchParams.set('session_id', window.WorkVolt?.session() || '');
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res  = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ── Build default permissions from ADDON_CATALOGUE ─────────────
  function buildDefaultPermissions() {
    const perms = {};
    // Core modules are fixed — skip from matrix
    Object.entries(ADDON_CATALOGUE).forEach(([id, def]) => {
      perms[id] = {};
      ALL_ROLES.forEach(role => {
        perms[id][role] = def.defaultRoles.includes(role);
      });
    });
    return perms;
  }

  // ── Load permissions from config ────────────────────────────────
  async function loadPermissions() {
    loading = true;
    render();

    // Always start from defaults
    permissions = buildDefaultPermissions();

    if (!isConnected) {
      // Try localStorage fallback
      try {
        const local = JSON.parse(localStorage.getItem('wv_role_permissions') || 'null');
        if (local) permissions = local;
        const localOverrides = JSON.parse(localStorage.getItem('wv_user_overrides') || 'null');
        if (localOverrides) userOverrides = localOverrides;
      } catch(e) {}
      loading = false;
      render();
      return;
    }

    try {
      // Load from config sheet
      const data = await api('config/get-all');
      const settings = data.settings || {};

      if (settings.role_permissions) {
        try {
          const saved = JSON.parse(settings.role_permissions);
          // Merge saved over defaults (handles new modules added since last save)
          Object.keys(saved).forEach(id => {
            if (permissions[id]) permissions[id] = saved[id];
          });
        } catch(e) {}
      }

      if (settings.user_module_overrides) {
        try { userOverrides = JSON.parse(settings.user_module_overrides); } catch(e) {}
      }

      // Load users for the overrides tab
      const usersData = await api('users/list');
      usersCache = (usersData.rows || []).filter(u => String(u.active) === 'true');

    } catch(e) {
      window.WorkVolt?.toast('Could not load permissions: ' + e.message, 'error');
    }

    loading = false;
    isDirty = false;
    render();
  }

  // ── Save permissions ────────────────────────────────────────────
  async function savePermissions() {
    if (saving) return;
    saving = true;
    renderSaveBtn();

    const payload = JSON.stringify(permissions);
    const overridesPayload = JSON.stringify(userOverrides);

    // Always push to ADDON_CATALOGUE in memory so nav re-renders immediately
    applyPermissionsToApp();

    if (!isConnected) {
      // Persist to localStorage as fallback
      localStorage.setItem('wv_role_permissions', payload);
      localStorage.setItem('wv_user_overrides', overridesPayload);
      saving  = false;
      isDirty = false;
      renderSaveBtn();
      window.WorkVolt?.toast('Permissions saved locally (connect Sheet to sync globally)', 'info');
      return;
    }

    try {
      await api('config/set-key', { key: 'role_permissions', value: payload });
      await api('config/set-key', { key: 'user_module_overrides', value: overridesPayload });
      saving  = false;
      isDirty = false;
      renderSaveBtn();
      window.WorkVolt?.toast('Permissions saved successfully', 'success');
    } catch(e) {
      saving = false;
      renderSaveBtn();
      window.WorkVolt?.toast('Save failed: ' + e.message, 'error');
    }
  }

  // ── Apply saved permissions back into the live app ─────────────
  function applyPermissionsToApp() {
    // Push into index.html's live state so nav re-renders correctly
    if (typeof window._wvApplyPermissions === 'function') {
      window._wvApplyPermissions(permissions, userOverrides);
      return;
    }
    // Fallback: patch INSTALLED_MODULES directly
    if (!window.INSTALLED_MODULES) return;
    window.INSTALLED_MODULES.forEach(m => {
      if (permissions[m.id]) {
        m.allowed_roles = Object.entries(permissions[m.id])
          .filter(([, v]) => v).map(([r]) => r);
      }
    });
    if (typeof window.renderNav === 'function') window.renderNav();
  }

  // ── Toggle a cell ───────────────────────────────────────────────
  function togglePerm(moduleId, role) {
    // SuperAdmin always has access to everything — can't be unchecked
    if (role === 'SuperAdmin') return;
    if (!permissions[moduleId]) return;
    permissions[moduleId][role] = !permissions[moduleId][role];
    isDirty = true;
    renderMatrix();
    renderSaveBtn();
  }

  // ── Toggle entire row (all roles for a module) ──────────────────
  function toggleRow(moduleId) {
    const current = ALL_ROLES.filter(r => r !== 'SuperAdmin').every(r => permissions[moduleId][r]);
    ALL_ROLES.filter(r => r !== 'SuperAdmin').forEach(r => {
      permissions[moduleId][r] = !current;
    });
    isDirty = true;
    renderMatrix();
    renderSaveBtn();
  }

  // ── Toggle entire column (all modules for a role) ───────────────
  function toggleCol(role) {
    if (role === 'SuperAdmin') return;
    const ids = Object.keys(permissions);
    const current = ids.every(id => permissions[id][role]);
    ids.forEach(id => { permissions[id][role] = !current; });
    isDirty = true;
    renderMatrix();
    renderSaveBtn();
  }

  // ── User override helpers ───────────────────────────────────────
  function getUserModules(userId) {
    return userOverrides[userId] || null; // null = use role defaults
  }

  function setUserModule(userId, moduleId, enabled) {
    if (!userOverrides[userId]) {
      // Copy from role defaults
      const u = usersCache.find(x => (x.user_id || x.id) === userId);
      if (u) {
        userOverrides[userId] = Object.keys(permissions).filter(id => permissions[id][u.role]);
      } else {
        userOverrides[userId] = [];
      }
    }
    const list = userOverrides[userId];
    if (enabled && !list.includes(moduleId)) list.push(moduleId);
    if (!enabled) {
      const idx = list.indexOf(moduleId);
      if (idx !== -1) list.splice(idx, 1);
    }
    isDirty = true;
    renderOverrides();
    renderSaveBtn();
  }

  function clearUserOverride(userId) {
    delete userOverrides[userId];
    isDirty = true;
    renderOverrides();
    renderSaveBtn();
  }

  // ── Installed modules list (add-ons only) ───────────────────────
  function installedAddonIds() {
    return (window.INSTALLED_MODULES || []).map(m => m.id);
  }

  function allAddonEntries() {
    // Only show modules that are currently installed
    const installed = installedAddonIds();
    return installed
      .filter(id => ADDON_CATALOGUE[id])
      .map(id => ({ id, ...ADDON_CATALOGUE[id], installed: true }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────

  function render() {
    container.innerHTML = `
      <div class="min-h-full bg-slate-50 fade-in" id="roles-root">

        <!-- ── Header ── -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-8 py-5 sticky top-0 z-20">
          <div class="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                <i class="fas fa-shield-alt text-white text-sm"></i>
              </div>
              <div>
                <h1 class="text-lg font-extrabold text-slate-900 leading-none">Role Permissions</h1>
                <p class="text-xs text-slate-400 mt-0.5">Control which roles can access each module</p>
              </div>
            </div>
            <div id="roles-save-area" class="flex items-center gap-3"></div>
          </div>

          <!-- Tabs -->
          <div class="max-w-6xl mx-auto mt-4 flex gap-1 border-b border-transparent">
            ${[
              { id: 'matrix',    label: 'Permission Matrix', icon: 'fa-table-cells' },
              { id: 'overrides', label: 'User Overrides',    icon: 'fa-user-cog' },
              { id: 'preview',   label: 'Role Preview',      icon: 'fa-eye' },
            ].map(t => `
              <button onclick="window._rolesTabSwitch('${t.id}')"
                class="roles-tab flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors border-b-2 ${activeTab === t.id ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}"
                data-tab="${t.id}">
                <i class="fas ${t.icon} text-xs"></i>${t.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- ── Content ── -->
        <div class="max-w-6xl mx-auto px-6 md:px-8 py-6" id="roles-content">
          ${loading ? `
            <div class="flex items-center justify-center h-48 gap-3 text-slate-400">
              <i class="fas fa-circle-notch fa-spin text-2xl text-blue-400"></i>
              <span class="text-sm font-medium">Loading permissions…</span>
            </div>
          ` : renderTabContent()}
        </div>
      </div>`;

    // Wire tab switch globally
    window._rolesTabSwitch = function(tab) {
      activeTab = tab;
      render();
    };

    renderSaveBtn();

    // Wire cell clicks after render
    container.querySelectorAll('[data-toggle-cell]').forEach(el => {
      el.addEventListener('click', () => {
        const [mod, role] = el.dataset.toggleCell.split('|');
        togglePerm(mod, role);
      });
    });
    container.querySelectorAll('[data-toggle-row]').forEach(el => {
      el.addEventListener('click', () => toggleRow(el.dataset.toggleRow));
    });
    container.querySelectorAll('[data-toggle-col]').forEach(el => {
      el.addEventListener('click', () => toggleCol(el.dataset.toggleCol));
    });
    container.querySelectorAll('[data-override-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const [uid, mid] = el.dataset.overrideToggle.split('|');
        setUserModule(uid, mid, el.checked);
      });
    });
    container.querySelectorAll('[data-clear-override]').forEach(el => {
      el.addEventListener('click', () => clearUserOverride(el.dataset.clearOverride));
    });
  }

  function renderTabContent() {
    if (activeTab === 'matrix')    return renderMatrixHTML();
    if (activeTab === 'overrides') return renderOverridesHTML();
    if (activeTab === 'preview')   return renderPreviewHTML();
    return '';
  }

  // ── Re-render just the matrix without full page redraw ──────────
  function renderMatrix() {
    const el = document.getElementById('roles-matrix-body');
    if (!el) { render(); return; }
    el.innerHTML = matrixRowsHTML();
    // Re-wire clicks
    el.querySelectorAll('[data-toggle-cell]').forEach(el2 => {
      el2.addEventListener('click', () => {
        const [mod, role] = el2.dataset.toggleCell.split('|');
        togglePerm(mod, role);
      });
    });
    el.querySelectorAll('[data-toggle-row]').forEach(el2 => {
      el2.addEventListener('click', () => toggleRow(el2.dataset.toggleRow));
    });
  }

  // ── Re-render just the overrides panel ─────────────────────────
  function renderOverrides() {
    const el = document.getElementById('roles-overrides-body');
    if (!el) { render(); return; }
    el.innerHTML = overridesBodyHTML();
    el.querySelectorAll('[data-override-toggle]').forEach(el2 => {
      el2.addEventListener('click', () => {
        const [uid, mid] = el2.dataset.overrideToggle.split('|');
        setUserModule(uid, mid, el2.checked);
      });
    });
    el.querySelectorAll('[data-clear-override]').forEach(el2 => {
      el2.addEventListener('click', () => clearUserOverride(el2.dataset.clearOverride));
    });
  }

  function renderSaveBtn() {
    const el = document.getElementById('roles-save-area');
    if (!el) return;

    const connBadge = !isConnected
      ? `<span class="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5">
           <i class="fas fa-exclamation-triangle text-[10px]"></i>No Sheet — saves locally
         </span>`
      : '';

    el.innerHTML = `
      ${connBadge}
      ${isDirty ? `<span class="text-xs text-slate-400 font-medium">Unsaved changes</span>` : ''}
      <button onclick="window._rolesSave()"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all
          ${saving ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : isDirty ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}"
        ${saving || !isDirty ? 'disabled' : ''}>
        ${saving
          ? '<i class="fas fa-circle-notch fa-spin text-xs"></i> Saving…'
          : '<i class="fas fa-save text-xs"></i> Save Changes'}
      </button>`;

    window._rolesSave = savePermissions;
  }

  // ─────────────────────────────────────────────────────────────────
  //  MATRIX TAB
  // ─────────────────────────────────────────────────────────────────
  function renderMatrixHTML() {
    const addons = allAddonEntries();
    if (addons.length === 0) {
      return `
        <div class="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
          <i class="fas fa-store text-slate-300 text-3xl mb-3"></i>
          <p class="text-slate-500 font-semibold mb-1">No modules installed yet</p>
          <p class="text-slate-400 text-sm mb-4">Install modules from the Module Store first, then configure their role permissions here.</p>
          <button onclick="window.WorkVolt.navigate('store')"
            class="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
            <i class="fas fa-store text-xs"></i> Browse Module Store
          </button>
        </div>`;
    }

    return `
      <div class="space-y-4">

        <!-- Legend + info -->
        <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded bg-blue-500 inline-block"></span>Has access</div>
          <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded bg-slate-100 border border-slate-200 inline-block"></span>No access</div>
          <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded bg-purple-100 border border-purple-200 inline-block"></span>SuperAdmin (always on)</div>
        </div>

        <!-- Matrix table -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b border-slate-100 bg-slate-50">
                  <th class="text-left px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wide w-56">
                    Module
                  </th>
                  ${ALL_ROLES.map(role => {
                    const m = ROLE_META[role];
                    return `
                      <th class="text-center px-3 py-3.5 w-28 cursor-pointer select-none group"
                          data-toggle-col="${role}" title="Toggle all for ${role}">
                        <div class="flex flex-col items-center gap-1">
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${m.color}
                            group-hover:scale-105 transition-transform">
                            <i class="fas ${m.icon} text-[9px]"></i>${role}
                          </span>
                          <span class="text-[9px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">click to toggle all</span>
                        </div>
                      </th>`;
                  }).join('')}
                  <th class="text-center px-4 py-3.5 w-20 text-xs text-slate-400 font-medium">All</th>
                </tr>
              </thead>
              <tbody id="roles-matrix-body">
                ${matrixRowsHTML()}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Core modules note -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-500">
          <i class="fas fa-info-circle text-blue-400 mt-0.5 flex-shrink-0"></i>
          <div>
            <strong class="text-slate-700">Core modules are not shown here</strong> — Dashboard, Settings, Module Store, and Role Permissions have fixed access rules and cannot be changed.
            SuperAdmin always has access to every module and cannot be unchecked.
          </div>
        </div>
      </div>`;
  }

  function matrixRowsHTML() {
    const addons = allAddonEntries();
    return addons.map((mod, i) => {
      const rowAllOn = ALL_ROLES.filter(r => r !== 'SuperAdmin').every(r => permissions[mod.id]?.[r]);
      const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';

      return `
        <tr class="${rowBg} hover:bg-blue-50/30 transition-colors border-b border-slate-100 last:border-0">
          <td class="px-5 py-3">
            <div class="flex items-center gap-2.5">
              <i class="fas ${mod.icon} text-slate-400 text-xs w-3.5"></i>
              <span class="font-semibold text-slate-800 text-sm">${mod.label}</span>
            </div>
          </td>
          ${ALL_ROLES.map(role => {
            const checked = permissions[mod.id]?.[role] ?? false;
            const isSuper = role === 'SuperAdmin';
            if (isSuper) {
              return `<td class="text-center px-3 py-3">
                <div class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-purple-100 border border-purple-200" title="SuperAdmin always has access">
                  <i class="fas fa-crown text-purple-500 text-[10px]"></i>
                </div>
              </td>`;
            }
            return `<td class="text-center px-3 py-3">
              <button data-toggle-cell="${mod.id}|${role}"
                class="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all
                  ${checked
                    ? 'bg-blue-500 border-2 border-blue-500 hover:bg-blue-600 hover:border-blue-600'
                    : 'bg-white border-2 border-slate-200 hover:border-blue-300'}"
                title="${checked ? 'Revoke' : 'Grant'} ${role} access to ${mod.label}">
                ${checked ? `<i class="fas fa-check text-white text-[10px]"></i>` : ''}
              </button>
            </td>`;
          }).join('')}
          <td class="text-center px-4 py-3">
            <button data-toggle-row="${mod.id}"
              class="text-[10px] font-bold px-2 py-1 rounded-lg transition-colors
                ${rowAllOn ? 'text-red-500 hover:bg-red-50' : 'text-blue-500 hover:bg-blue-50'}">
              ${rowAllOn ? 'Revoke all' : 'Grant all'}
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────
  //  USER OVERRIDES TAB
  // ─────────────────────────────────────────────────────────────────
  function renderOverridesHTML() {
    if (!isConnected) {
      return `
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <i class="fas fa-plug text-amber-400 text-3xl mb-3"></i>
          <p class="font-bold text-amber-700 mb-1">Google Sheet not connected</p>
          <p class="text-amber-600 text-sm mb-4">User overrides require a Sheet connection to load the user list.</p>
          <button onclick="window.WorkVolt.navigate('settings')"
            class="inline-flex items-center gap-2 bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-amber-600 transition-colors">
            <i class="fas fa-plug text-xs"></i> Connect Sheet
          </button>
        </div>`;
    }

    return `
      <div class="space-y-4">
        <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
          <i class="fas fa-info-circle mt-0.5 flex-shrink-0"></i>
          <span>User overrides let you grant or restrict access to specific modules for individual users, 
          overriding their role's default permissions. Users without an override follow their role's settings.</span>
        </div>
        <div id="roles-overrides-body">
          ${overridesBodyHTML()}
        </div>
      </div>`;
  }

  function overridesBodyHTML() {
    if (usersCache.length === 0) {
      return `<div class="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
        <i class="fas fa-users text-3xl mb-3"></i>
        <p class="text-sm">No users loaded yet</p>
      </div>`;
    }

    const addons = allAddonEntries();
    const hasOverride = id => !!userOverrides[id];

    // Group users by role
    const byRole = {};
    usersCache.forEach(u => {
      const r = u.role || 'Employee';
      if (!byRole[r]) byRole[r] = [];
      byRole[r].push(u);
    });
    const roleOrder = ['SuperAdmin','Admin','Manager','Employee','Contractor'];

    return roleOrder.filter(r => byRole[r]).map(role => {
      const rm = ROLE_META[role];
      return `
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-4">
          <div class="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <i class="fas ${rm.icon} text-slate-400 text-xs"></i>
            <span class="text-xs font-bold text-slate-600 uppercase tracking-wide">${role}</span>
            <span class="text-xs text-slate-400">${byRole[role].length} user${byRole[role].length !== 1 ? 's' : ''}</span>
          </div>
          ${byRole[role].map(u => {
            const uid = u.user_id || u.id;
            const overridden = hasOverride(uid);
            const userMods = getUserModules(uid);
            const initials = (u.name || '?').charAt(0).toUpperCase();
            const colors = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
            const avatarCls = colors[(uid.charCodeAt ? uid.charCodeAt(0) : 0) % colors.length];

            return `
              <div class="border-b border-slate-100 last:border-0">
                <div class="px-5 py-3.5 flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl ${avatarCls} flex items-center justify-center font-bold text-sm flex-shrink-0">${initials}</div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold text-slate-900">${u.name || '—'}</p>
                      ${overridden ? `<span class="text-[10px] font-bold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded border border-orange-200">Custom</span>` : ''}
                    </div>
                    <p class="text-xs text-slate-400">${u.email || ''}</p>
                  </div>
                  ${overridden ? `
                    <button data-clear-override="${uid}"
                      class="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50">
                      <i class="fas fa-undo text-[10px]"></i> Reset to role defaults
                    </button>` : ''}
                  <button onclick="this.closest('.border-b').querySelector('.override-modules').classList.toggle('hidden')"
                    class="text-xs text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1">
                    <i class="fas fa-sliders-h text-[10px]"></i>
                    ${overridden ? 'Edit' : 'Override'}
                  </button>
                </div>

                <!-- Module toggles (collapsed by default) -->
                <div class="override-modules hidden px-5 pb-4">
                  <div class="bg-slate-50 rounded-xl p-3">
                    <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Module Access</p>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                      ${addons.map(mod => {
                        // Resolve current access: override > role default
                        const hasAccess = userMods !== null
                          ? userMods.includes(mod.id)
                          : (permissions[mod.id]?.[role] ?? false);
                        const isDefault = userMods === null;
                        return `
                          <label class="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${hasAccess ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-slate-200 hover:border-blue-200'}">
                            <input type="checkbox"
                              data-override-toggle="${uid}|${mod.id}"
                              ${hasAccess ? 'checked' : ''}
                              class="w-3.5 h-3.5 accent-blue-600 flex-shrink-0">
                            <i class="fas ${mod.icon} text-slate-400 text-[11px] w-3"></i>
                            <span class="text-xs font-medium text-slate-700 truncate">${mod.label}</span>
                            ${isDefault && hasAccess ? `<span class="ml-auto text-[9px] text-slate-300 flex-shrink-0">role</span>` : ''}
                          </label>`;
                      }).join('')}
                    </div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────
  //  ROLE PREVIEW TAB
  // ─────────────────────────────────────────────────────────────────
  function renderPreviewHTML() {
    const addons = allAddonEntries();
    const installedIds = installedAddonIds();

    return `
      <div class="space-y-4">
        <p class="text-sm text-slate-500">This shows exactly what each role will see in their sidebar after saving.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${ALL_ROLES.map(role => {
            const rm = ROLE_META[role];
            const accessibleAddons = addons.filter(m => permissions[m.id]?.[role]);
            const installedAccessible = accessibleAddons.filter(m => installedIds.includes(m.id));
            const notInstalledAccessible = accessibleAddons.filter(m => !installedIds.includes(m.id));

            // Core modules this role sees
            const coreVisible = CORE_MODULES.filter(c => c.fixedRoles.includes(role));

            return `
              <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <!-- Role header -->
                <div class="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-lg ${rm.dot} bg-opacity-20 flex items-center justify-center" style="background-color:transparent">
                      <span class="${rm.dot} w-2 h-2 rounded-full inline-block"></span>
                    </div>
                    <span class="font-bold text-slate-900 text-sm">${role}</span>
                  </div>
                  <span class="text-xs text-slate-400">${coreVisible.length + installedAccessible.length} visible</span>
                </div>

                <!-- Simulated sidebar -->
                <div class="p-3 space-y-0.5 bg-slate-50/50 min-h-[180px]">
                  <!-- Core modules -->
                  ${coreVisible.map(c => `
                    <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-100 text-xs font-medium text-slate-700">
                      <i class="fas ${c.icon} text-blue-400 w-3.5 text-center"></i>
                      ${c.label}
                      <span class="ml-auto text-[9px] text-slate-300 font-normal">core</span>
                    </div>`).join('')}

                  ${installedAccessible.length > 0 ? `
                    <div class="pt-1.5 pb-0.5 px-3">
                      <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Modules</p>
                    </div>
                    ${installedAccessible.map(m => `
                      <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-100 text-xs font-medium text-slate-700">
                        <i class="fas ${m.icon} text-slate-400 w-3.5 text-center"></i>
                        ${m.label}
                      </div>`).join('')}
                  ` : ''}

                ${installedAccessible.length === 0 && coreVisible.length > 0 ? `
                    <div class="px-3 py-2 text-xs text-slate-400 italic">No add-on modules</div>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Boot ────────────────────────────────────────────────────────
  render(); // Show loading state first
  loadPermissions();
};
