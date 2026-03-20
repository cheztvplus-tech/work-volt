window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['roles'] = function(container) {

  // ── Auth guard ─────────────────────────────────────────────────
  const user = window.WorkVolt?.user() || {};
  if (!['SuperAdmin','Admin'].includes(user.role)) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <i class="fas fa-lock text-4xl"></i>
        <p class="font-semibold">Access restricted to Admins only</p>
      </div>`;
    return;
  }

  // ── Guard: db must be ready ────────────────────────────────────
  const db = window.WorkVoltDB;
  if (!db) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
        <i class="fas fa-exclamation-circle text-4xl"></i>
        <p class="font-semibold">Database not initialised</p>
        <p class="text-xs text-slate-400">Refresh the page and try again</p>
      </div>`;
    return;
  }

  // ── Constants ──────────────────────────────────────────────────
  const ALL_ROLES = ['SuperAdmin','Admin','Manager','Employee','Contractor'];

  const ROLE_META = {
    SuperAdmin: { color:'bg-purple-100 text-purple-700 border-purple-200', dot:'bg-purple-500', icon:'fa-crown'     },
    Admin:      { color:'bg-blue-100 text-blue-700 border-blue-200',       dot:'bg-blue-500',   icon:'fa-shield-alt' },
    Manager:    { color:'bg-indigo-100 text-indigo-700 border-indigo-200', dot:'bg-indigo-500', icon:'fa-user-tie'  },
    Employee:   { color:'bg-green-100 text-green-700 border-green-200',    dot:'bg-green-500',  icon:'fa-user'      },
    Contractor: { color:'bg-amber-100 text-amber-700 border-amber-200',    dot:'bg-amber-400',  icon:'fa-user-clock'},
  };

  const CORE_MODULES = [
    { id:'dashboard', label:'Dashboard',        icon:'fa-th-large',   fixedRoles: ALL_ROLES,                 fixed:true },
    { id:'settings',  label:'Settings',         icon:'fa-cog',        fixedRoles: ['SuperAdmin','Admin'],     fixed:true },
    { id:'store',     label:'Module Store',     icon:'fa-store',      fixedRoles: ['SuperAdmin','Admin'],     fixed:true },
    { id:'roles',     label:'Role Permissions', icon:'fa-shield-alt', fixedRoles: ['SuperAdmin','Admin'],     fixed:true },
  ];

  // Full catalogue — all known modules even if not installed yet
  const ADDON_CATALOGUE = {
    notifications: { label:'Notifications',        icon:'fa-bell',                defaultRoles:ALL_ROLES },
    tasks:         { label:'Tasks',                icon:'fa-check-circle',        defaultRoles:ALL_ROLES },
    pipeline:      { label:'Pipeline',             icon:'fa-users',               defaultRoles:['SuperAdmin','Admin','Manager'] },
    payroll:       { label:'Payroll',              icon:'fa-money-bill-wave',     defaultRoles:ALL_ROLES },
    timesheets:    { label:'Timesheets',           icon:'fa-clock',               defaultRoles:ALL_ROLES },
    financials:    { label:'Financials',           icon:'fa-chart-line',          defaultRoles:['SuperAdmin','Admin','Manager'] },
    crm:           { label:'CRM',                  icon:'fa-address-book',        defaultRoles:['SuperAdmin','Admin','Manager'] },
    projects:      { label:'Projects',             icon:'fa-folder-open',         defaultRoles:ALL_ROLES },
    reports:       { label:'Reports',              icon:'fa-chart-pie',           defaultRoles:['SuperAdmin','Admin','Manager'] },
    assets:        { label:'Assets',               icon:'fa-box-open',            defaultRoles:['SuperAdmin','Admin','Manager','Employee'] },
    attendance:    { label:'Attendance Tracker',   icon:'fa-calendar-check',      defaultRoles:['SuperAdmin','Admin','Manager','Employee'] },
    invoices:      { label:'Invoice Manager',      icon:'fa-file-invoice-dollar', defaultRoles:['SuperAdmin','Admin','Manager'] },
    inventory:     { label:'Inventory Control',    icon:'fa-warehouse',           defaultRoles:['SuperAdmin','Admin','Manager'] },
    scheduler:     { label:'Shift Scheduler',      icon:'fa-calendar-alt',        defaultRoles:['SuperAdmin','Admin','Manager'] },
    expenses:      { label:'Expense Claims',       icon:'fa-receipt',             defaultRoles:ALL_ROLES },
    contracts:     { label:'Contract Hub',         icon:'fa-file-signature',      defaultRoles:['SuperAdmin','Admin','Manager'] },
    helpdesk:      { label:'Help Desk',            icon:'fa-headset',             defaultRoles:['SuperAdmin','Admin','Manager','Employee'] },
    recruitment:   { label:'Recruitment Pipeline', icon:'fa-user-tie',            defaultRoles:['SuperAdmin','Admin','Manager'] },
  };

  // ── State ──────────────────────────────────────────────────────
  let permissions   = {};   // { moduleId: { role: bool } }
  let usersCache    = [];
  let userOverrides = {};   // { userId: [moduleId, ...] }
  let activeTab     = 'matrix';
  let loading       = true;
  let isDirty       = false;
  let loadError     = '';

  // ── Helpers ────────────────────────────────────────────────────
  function buildDefaultPermissions() {
    const p = {};
    Object.entries(ADDON_CATALOGUE).forEach(([id, def]) => {
      p[id] = {};
      ALL_ROLES.forEach(r => { p[id][r] = def.defaultRoles.includes(r); });
    });
    return p;
  }

  function installedAddonIds() {
    return (window.INSTALLED_MODULES || []).map(m => m.id);
  }

  function allAddonEntries() {
    return Object.entries(ADDON_CATALOGUE).map(([id, def]) => ({ id, ...def }));
  }

  // ── Load ───────────────────────────────────────────────────────
  async function loadPermissions() {
    loading   = true;
    loadError = '';
    render();

    // Always start from defaults
    permissions = buildDefaultPermissions();

    try {
      // 1 — load saved role permissions from config table
      const settings = await db.config.getAll();

      if (settings && settings.role_permissions) {
        try {
          const saved = JSON.parse(settings.role_permissions);
          // Merge saved over defaults (so new modules get default access)
          Object.keys(saved).forEach(id => {
            if (permissions[id]) permissions[id] = saved[id];
          });
        } catch(e) {
          console.warn('roles.js: could not parse role_permissions JSON:', e.message);
        }
      }

      if (settings && settings.user_module_overrides) {
        try { userOverrides = JSON.parse(settings.user_module_overrides); } catch(e) {}
      }

      // 2 — load users (don't filter by active — fetch all, filter in JS)
      //     Avoids boolean type mismatch between Supabase boolean and filter value
      const rows = await db.users.list();
      usersCache = rows;

    } catch(e) {
      loadError = e.message;
      console.error('roles.js loadPermissions error:', e);
    }

    loading = false;
    render();
  }

  // ── Save ───────────────────────────────────────────────────────
  async function savePermissions() {
    await db.config.set('role_permissions',      JSON.stringify(permissions));
    await db.config.set('user_module_overrides', JSON.stringify(userOverrides));

    // Apply live to main.html nav immediately
    if (typeof window._wvApplyPermissions === 'function') {
      window._wvApplyPermissions(permissions, userOverrides);
    }
    isDirty = false;
  }

  function markDirty() {
    isDirty = true;
    const btn = document.getElementById('roles-save-btn');
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed'); }
    const indicator = document.getElementById('roles-dirty-indicator');
    if (indicator) indicator.classList.remove('hidden');
  }

  // ================================================================
  //  RENDER SHELL
  // ================================================================
  function render() {
    const tabs = [
      { id:'matrix',    label:'Permission Matrix', icon:'fa-table'    },
      { id:'overrides', label:'User Overrides',    icon:'fa-user-cog' },
      { id:'preview',   label:'Role Preview',      icon:'fa-eye'      },
    ];

    const tabNav = tabs.map(t => `
      <button onclick="rolesTab('${t.id}')"
        class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors
          ${activeTab===t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
        <i class="fas ${t.icon} text-xs"></i>${t.label}
      </button>`).join('');

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">

        <!-- Page header -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-xl font-extrabold text-slate-900">Role Permissions</h1>
            <p class="text-slate-500 text-sm mt-1">Control which roles can access each module. Changes take effect instantly after saving.</p>
          </div>
          <div class="flex items-center gap-3">
            <span id="roles-dirty-indicator" class="text-xs text-amber-600 font-medium flex items-center gap-1 ${isDirty?'':'hidden'}">
              <i class="fas fa-circle text-[8px]"></i>Unsaved changes
            </span>
            <button onclick="rolesSave()" id="roles-save-btn"
              class="btn-primary ${!isDirty?'opacity-50 cursor-not-allowed':''}" ${!isDirty?'disabled':''}>
              <i class="fas fa-save text-sm"></i> Save Changes
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 flex gap-1 overflow-x-auto">
          ${tabNav}
        </div>

        <!-- Status / error bar -->
        <div id="roles-status" class="px-6 md:px-10 pt-4">
          ${loadError ? `
            <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 bg-red-50 text-red-600 border border-red-200">
              <i class="fas fa-exclamation-circle"></i>
              <span>Failed to load permissions: ${loadError}. Showing defaults — your saved settings were not loaded.</span>
              <button onclick="loadPermissions()" class="ml-auto text-xs font-bold underline">Retry</button>
            </div>` : ''}
        </div>

        <!-- Content -->
        <div class="px-6 md:px-10 py-6">
          ${loading
            ? `<div class="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
                <i class="fas fa-circle-notch fa-spin text-3xl text-blue-500 opacity-60"></i>
                <p class="text-sm">Loading permissions…</p>
               </div>`
            : activeTab === 'matrix'    ? renderMatrixHTML()
            : activeTab === 'overrides' ? renderOverridesHTML()
            :                             renderPreviewHTML()
          }
        </div>

      </div>`;

    // Wire globals
    window.rolesTab  = function(tab) { activeTab = tab; render(); };
    window.rolesSave = async function() {
      const btn      = document.getElementById('roles-save-btn');
      const statusEl = document.getElementById('roles-status');
      if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }
      try {
        await savePermissions();
        statusEl.innerHTML = `
          <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 bg-green-50 text-green-700 border border-green-200">
            <i class="fas fa-check-circle"></i><span>Permissions saved and applied!</span>
          </div>`;
        setTimeout(() => { statusEl.innerHTML=''; }, 3000);
        render();
      } catch(e) {
        statusEl.innerHTML = `
          <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 bg-red-50 text-red-600 border border-red-200">
            <i class="fas fa-exclamation-circle"></i><span>${e.message}</span>
          </div>`;
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save text-sm"></i> Save Changes'; }
      }
    };
    window.rolesToggle = function(moduleId, role, checked) {
      if (!permissions[moduleId]) permissions[moduleId] = {};
      permissions[moduleId][role] = checked;
      markDirty();
    };
    window.rolesClearOverride = function(userId) {
      delete userOverrides[userId];
      markDirty();
      render();
    };
    window.rolesSetOverride = function(userId, moduleId, checked) {
      if (!userOverrides[userId]) {
        const u    = usersCache.find(u => (u.id||u.user_id)===userId);
        const role = u?.role || 'Employee';
        userOverrides[userId] = allAddonEntries()
          .filter(m => permissions[m.id]?.[role])
          .map(m => m.id);
      }
      if (checked && !userOverrides[userId].includes(moduleId)) {
        userOverrides[userId].push(moduleId);
      } else if (!checked) {
        userOverrides[userId] = userOverrides[userId].filter(id => id !== moduleId);
      }
      markDirty();
    };
    // Expose loadPermissions for retry button
    window.loadPermissions = loadPermissions;
  }

  // ================================================================
  //  MATRIX TAB — role × module grid
  // ================================================================
  function renderMatrixHTML() {
    const addons       = allAddonEntries();
    const installedIds = installedAddonIds();

    // Split into installed and not-installed groups
    const installed   = addons.filter(m => installedIds.includes(m.id));
    const notInstalled = addons.filter(m => !installedIds.includes(m.id));
    const displayList  = [...installed, ...notInstalled];

    return `
      <div class="space-y-4">

        <div class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <i class="fas fa-info-circle flex-shrink-0"></i>
          <span>
            Check a box to give that role access to the module. <strong>SuperAdmin</strong> always has full access.
            Greyed-out rows are modules not yet installed — you can still set permissions ahead of time.
          </span>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left min-w-[600px]">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Module</th>
                  ${ALL_ROLES.map(r => {
                    const rm = ROLE_META[r];
                    return `<th class="px-3 py-3 text-center whitespace-nowrap">
                      <span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border ${rm.color}">
                        <i class="fas ${rm.icon} text-[10px]"></i>${r}
                      </span>
                    </th>`;
                  }).join('')}
                  <th class="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${displayList.map(mod => {
                  const isInstalled = installedIds.includes(mod.id);
                  return `
                    <tr class="border-t border-slate-100 hover:bg-slate-50/80 transition-colors ${!isInstalled ? 'opacity-40' : ''}">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2.5">
                          <div class="w-7 h-7 rounded-lg ${isInstalled?'bg-blue-100':'bg-slate-100'} flex items-center justify-center flex-shrink-0">
                            <i class="fas ${mod.icon} ${isInstalled?'text-blue-600':'text-slate-400'} text-xs"></i>
                          </div>
                          <span class="text-sm font-semibold text-slate-800">${mod.label}</span>
                        </div>
                      </td>
                      ${ALL_ROLES.map(role => {
                        const checked  = permissions[mod.id]?.[role] ?? false;
                        const isSA     = role === 'SuperAdmin';
                        return `<td class="px-3 py-3 text-center">
                          <input type="checkbox" class="w-4 h-4 accent-blue-600 cursor-pointer"
                            ${checked ? 'checked'  : ''}
                            ${isSA    ? 'disabled' : ''}
                            ${isSA    ? 'title="SuperAdmin always has access"' : ''}
                            onchange="rolesToggle('${mod.id}','${role}',this.checked)">
                        </td>`;
                      }).join('')}
                      <td class="px-3 py-3 text-center">
                        ${isInstalled
                          ? `<span class="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">Installed</span>`
                          : `<span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">Not installed</span>`}
                      </td>
                    </tr>`;
                }).join('')}

                <!-- Core modules (read-only, always shown at bottom) -->
                <tr class="border-t-2 border-slate-200">
                  <td colspan="${ALL_ROLES.length + 2}" class="px-4 py-2 bg-slate-50">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Core modules — always fixed, cannot be changed</p>
                  </td>
                </tr>
                ${CORE_MODULES.map(mod => `
                  <tr class="border-t border-slate-100 bg-slate-50/50">
                    <td class="px-4 py-2.5">
                      <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <i class="fas ${mod.icon} text-slate-400 text-xs"></i>
                        </div>
                        <span class="text-sm font-medium text-slate-500">${mod.label}</span>
                      </div>
                    </td>
                    ${ALL_ROLES.map(role => {
                      const has = mod.fixedRoles.includes(role);
                      return `<td class="px-3 py-2.5 text-center">
                        <input type="checkbox" class="w-4 h-4 accent-slate-400" ${has?'checked':''} disabled>
                      </td>`;
                    }).join('')}
                    <td class="px-3 py-2.5 text-center">
                      <span class="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">Core</span>
                    </td>
                  </tr>`).join('')}

              </tbody>
            </table>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button onclick="rolesResetDefaults()" class="btn-secondary text-xs px-4 py-2">
            <i class="fas fa-undo text-xs mr-1"></i> Reset to defaults
          </button>
          <button onclick="rolesSave()" class="btn-primary text-sm px-6">
            <i class="fas fa-save text-xs mr-1"></i> Save Changes
          </button>
        </div>
      </div>`;
  }

  window.rolesResetDefaults = function() {
    if (!confirm('Reset all permissions to defaults? This will overwrite your current settings.')) return;
    permissions = buildDefaultPermissions();
    markDirty();
    render();
    window.WorkVolt?.toast('Permissions reset to defaults (not yet saved)', 'info');
  };

  // ================================================================
  //  USER OVERRIDES TAB
  // ================================================================
  function renderOverridesHTML() {
    const addons       = allAddonEntries();
    const installedIds = installedAddonIds();
    const installedAddons = addons.filter(m => installedIds.includes(m.id));

    // Only show active users — filter in JS to avoid boolean type issues
    const activeUsers  = usersCache.filter(u => u.active === true || u.active === 'true');

    if (!activeUsers.length) {
      return `
        <div class="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <i class="fas fa-users text-4xl opacity-30"></i>
          <p class="font-semibold">No users loaded</p>
          <p class="text-xs">
            ${loadError
              ? 'Users could not be loaded due to an error above.'
              : 'No active users found in your database.'}
          </p>
          <button onclick="loadPermissions()" class="text-xs text-blue-500 underline">Reload</button>
        </div>`;
    }

    const byRole = {};
    activeUsers.forEach(u => {
      const r = u.role || 'Employee';
      if (!byRole[r]) byRole[r] = [];
      byRole[r].push(u);
    });

    return `
      <div class="space-y-4">
        <div class="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <i class="fas fa-info-circle flex-shrink-0"></i>
          <span>
            Override individual users to give them access to specific modules regardless of their role permissions above.
            A user with an override gets exactly the modules you check here — role defaults are ignored for them.
          </span>
        </div>

        ${['SuperAdmin','Admin','Manager','Employee','Contractor'].filter(r => byRole[r]).map(role => {
          const rm = ROLE_META[role];
          return `
            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div class="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <i class="fas ${rm.icon} text-slate-400 text-xs"></i>
                <span class="text-xs font-bold text-slate-600 uppercase tracking-wide">${role}</span>
                <span class="text-xs text-slate-400 ml-1">${byRole[role].length} user${byRole[role].length!==1?'s':''}</span>
              </div>
              ${byRole[role].map(u => {
                const uid        = u.id || u.user_id;
                const overridden = !!userOverrides[uid];
                const userMods   = overridden ? userOverrides[uid] : null;
                const initials   = (u.name||u.email||'?').charAt(0).toUpperCase();
                const colors     = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
                const avatarCls  = colors[(uid.charCodeAt?uid.charCodeAt(0):0)%colors.length];

                return `
                  <div class="border-b border-slate-100 last:border-0">
                    <div class="px-5 py-3.5 flex items-center gap-3">
                      <div class="w-9 h-9 rounded-xl ${avatarCls} flex items-center justify-center font-bold text-sm flex-shrink-0">${initials}</div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <p class="text-sm font-semibold text-slate-900">${u.name||'—'}</p>
                          ${overridden ? `<span class="text-[10px] font-bold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded border border-orange-200">Custom</span>` : ''}
                        </div>
                        <p class="text-xs text-slate-400">${u.email||''}</p>
                      </div>
                      ${overridden ? `
                        <button onclick="rolesClearOverride('${uid}')"
                          class="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap">
                          <i class="fas fa-undo text-[10px]"></i> Reset to role
                        </button>` : ''}
                      <button onclick="this.closest('.border-b').querySelector('.override-panel').classList.toggle('hidden')"
                        class="text-xs text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1 whitespace-nowrap">
                        <i class="fas fa-sliders-h text-[10px]"></i>
                        ${overridden ? 'Edit access' : 'Override'}
                      </button>
                    </div>

                    <!-- Module toggles (collapsed by default) -->
                    <div class="override-panel hidden px-5 pb-4">
                      <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Module Access for ${u.name||u.email}</p>
                        ${installedAddons.length ? `
                          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                            ${installedAddons.map(mod => {
                              const hasAccess = userMods !== null
                                ? userMods.includes(mod.id)
                                : (permissions[mod.id]?.[role] ?? false);
                              return `
                                <label class="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors
                                  ${hasAccess ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' : 'bg-white border-slate-200 hover:border-blue-200'}">
                                  <input type="checkbox"
                                    ${hasAccess ? 'checked' : ''}
                                    onchange="rolesSetOverride('${uid}','${mod.id}',this.checked)"
                                    class="w-3.5 h-3.5 accent-blue-600 flex-shrink-0">
                                  <i class="fas ${mod.icon} text-slate-400 text-[11px] w-3 flex-shrink-0"></i>
                                  <span class="text-xs font-medium text-slate-700 truncate">${mod.label}</span>
                                  ${userMods === null ? `<span class="ml-auto text-[9px] text-slate-300 flex-shrink-0">role</span>` : ''}
                                </label>`;
                            }).join('')}
                          </div>` : `
                          <p class="text-xs text-slate-400">No modules installed yet. Install modules from the Module Store first.</p>`}
                      </div>
                    </div>
                  </div>`;
              }).join('')}
            </div>`;
        }).join('')}
      </div>`;
  }

  // ================================================================
  //  ROLE PREVIEW TAB
  // ================================================================
  function renderPreviewHTML() {
    const addons       = allAddonEntries();
    const installedIds = installedAddonIds();

    return `
      <div class="space-y-4">
        <p class="text-sm text-slate-500">This shows exactly what each role will see in their sidebar based on your current (unsaved) settings.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${ALL_ROLES.map(role => {
            const rm                  = ROLE_META[role];
            const coreVisible         = CORE_MODULES.filter(c => c.fixedRoles.includes(role));
            const accessibleAddons    = addons.filter(m => permissions[m.id]?.[role]);
            const installedAccessible = accessibleAddons.filter(m => installedIds.includes(m.id));

            return `
              <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div class="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="${rm.dot} w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"></span>
                    <span class="font-bold text-slate-900 text-sm">${role}</span>
                  </div>
                  <span class="text-xs text-slate-400">${coreVisible.length + installedAccessible.length} items visible</span>
                </div>
                <div class="p-3 space-y-0.5 bg-slate-50/50 min-h-[160px]">
                  ${coreVisible.map(c => `
                    <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-100 text-xs font-medium text-slate-700">
                      <i class="fas ${c.icon} text-blue-400 w-3.5 text-center flex-shrink-0"></i>
                      <span>${c.label}</span>
                      <span class="ml-auto text-[9px] text-slate-300">core</span>
                    </div>`).join('')}

                  ${installedAccessible.length > 0 ? `
                    <div class="pt-1.5 pb-0.5 px-3">
                      <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Modules</p>
                    </div>
                    ${installedAccessible.map(m => `
                      <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-100 text-xs font-medium text-slate-700">
                        <i class="fas ${m.icon} text-slate-400 w-3.5 text-center flex-shrink-0"></i>
                        <span>${m.label}</span>
                      </div>`).join('')}
                  ` : `<div class="px-3 py-2 text-xs text-slate-400 italic">No add-on modules visible</div>`}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Boot ────────────────────────────────────────────────────────
  render();          // Show loading spinner immediately
  loadPermissions(); // Fetch from Supabase
};
