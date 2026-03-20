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

  // ── State ───────────────────────────────────────────────────────
  const db       = window.WorkVoltDB;
  const ALL_ROLES = ['SuperAdmin','Admin','Manager','Employee','Contractor'];

  const ROLE_META = {
    SuperAdmin: { color:'bg-purple-100 text-purple-700 border-purple-200', dot:'bg-purple-500', icon:'fa-crown' },
    Admin:      { color:'bg-blue-100 text-blue-700 border-blue-200',       dot:'bg-blue-500',   icon:'fa-shield-alt' },
    Manager:    { color:'bg-indigo-100 text-indigo-700 border-indigo-200', dot:'bg-indigo-500', icon:'fa-user-tie' },
    Employee:   { color:'bg-green-100 text-green-700 border-green-200',    dot:'bg-green-500',  icon:'fa-user' },
    Contractor: { color:'bg-amber-100 text-amber-700 border-amber-200',    dot:'bg-amber-400',  icon:'fa-user-clock' },
  };

  const CORE_MODULES = [
    { id:'dashboard', label:'Dashboard',        icon:'fa-th-large',   fixedRoles: ALL_ROLES,                       fixed:true },
    { id:'settings',  label:'Settings',         icon:'fa-cog',        fixedRoles: ['SuperAdmin','Admin'],           fixed:true },
    { id:'store',     label:'Module Store',     icon:'fa-store',      fixedRoles: ['SuperAdmin','Admin'],           fixed:true },
    { id:'roles',     label:'Role Permissions', icon:'fa-shield-alt', fixedRoles: ['SuperAdmin','Admin'],           fixed:true },
  ];

  const ADDON_CATALOGUE = {
    notifications: { label:'Notifications',        icon:'fa-bell',               defaultRoles:['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    tasks:         { label:'Tasks',                icon:'fa-check-circle',       defaultRoles:['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    pipeline:      { label:'Pipeline',             icon:'fa-users',              defaultRoles:['SuperAdmin','Admin','Manager'] },
    payroll:       { label:'Payroll',              icon:'fa-money-bill-wave',    defaultRoles:['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    timesheets:    { label:'Timesheets',           icon:'fa-clock',              defaultRoles:['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    financials:    { label:'Financials',           icon:'fa-chart-line',         defaultRoles:['SuperAdmin','Admin','Manager'] },
    crm:           { label:'CRM',                  icon:'fa-address-book',       defaultRoles:['SuperAdmin','Admin','Manager'] },
    projects:      { label:'Projects',             icon:'fa-folder-open',        defaultRoles:['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    reports:       { label:'Reports',              icon:'fa-chart-pie',          defaultRoles:['SuperAdmin','Admin','Manager'] },
    assets:        { label:'Assets',               icon:'fa-box-open',           defaultRoles:['SuperAdmin','Admin','Manager','Employee'] },
    attendance:    { label:'Attendance Tracker',   icon:'fa-calendar-check',     defaultRoles:['SuperAdmin','Admin','Manager','Employee'] },
    invoices:      { label:'Invoice Manager',      icon:'fa-file-invoice-dollar',defaultRoles:['SuperAdmin','Admin','Manager'] },
    inventory:     { label:'Inventory Control',    icon:'fa-warehouse',          defaultRoles:['SuperAdmin','Admin','Manager'] },
    scheduler:     { label:'Shift Scheduler',      icon:'fa-calendar-alt',       defaultRoles:['SuperAdmin','Admin','Manager'] },
    expenses:      { label:'Expense Claims',       icon:'fa-receipt',            defaultRoles:['SuperAdmin','Admin','Manager','Employee','Contractor'] },
    contracts:     { label:'Contract Hub',         icon:'fa-file-signature',     defaultRoles:['SuperAdmin','Admin','Manager'] },
    helpdesk:      { label:'Help Desk',            icon:'fa-headset',            defaultRoles:['SuperAdmin','Admin','Manager','Employee'] },
    recruitment:   { label:'Recruitment Pipeline', icon:'fa-user-tie',           defaultRoles:['SuperAdmin','Admin','Manager'] },
  };

  let permissions   = {};
  let usersCache    = [];
  let userOverrides = {};
  let activeTab     = 'matrix';
  let loading       = true;
  let isDirty       = false;

  // ── Helpers ─────────────────────────────────────────────────────
  function buildDefaultPermissions() {
    const perms = {};
    Object.entries(ADDON_CATALOGUE).forEach(([id, def]) => {
      perms[id] = {};
      ALL_ROLES.forEach(role => { perms[id][role] = def.defaultRoles.includes(role); });
    });
    return perms;
  }

  function allAddonEntries() {
    return Object.entries(ADDON_CATALOGUE).map(([id, def]) => ({ id, ...def }));
  }

  function installedAddonIds() {
    return (window.INSTALLED_MODULES || []).map(m => m.id);
  }

  function hasOverride(userId) {
    return !!userOverrides[userId];
  }

  function getUserModules(userId) {
    return userOverrides[userId] || null;
  }

  // ── Load ────────────────────────────────────────────────────────
  async function loadPermissions() {
    loading = true;
    render();
    permissions = buildDefaultPermissions();

    try {
      const settings = await db.config.getAll();

      if (settings.role_permissions) {
        try {
          const saved = JSON.parse(settings.role_permissions);
          Object.keys(saved).forEach(id => {
            if (permissions[id]) permissions[id] = saved[id];
          });
        } catch(e) {}
      }

      if (settings.user_module_overrides) {
        try { userOverrides = JSON.parse(settings.user_module_overrides); } catch(e) {}
      }

      const rows = await db.users.list({ active: true });
      usersCache = rows;

    } catch(e) {
      console.warn('Could not load permissions:', e.message);
    }

    loading = false;
    render();
  }

  // ── Save ────────────────────────────────────────────────────────
  async function savePermissions() {
    await db.config.set('role_permissions',      JSON.stringify(permissions));
    await db.config.set('user_module_overrides', JSON.stringify(userOverrides));

    // Push to main.html runtime
    if (typeof window._wvApplyPermissions === 'function') {
      window._wvApplyPermissions(permissions, userOverrides);
    }
    isDirty = false;
  }

  // ================================================================
  //  RENDER
  // ================================================================
  function render() {
    const tabs = [
      { id:'matrix',    label:'Permission Matrix', icon:'fa-table' },
      { id:'overrides', label:'User Overrides',    icon:'fa-user-cog' },
      { id:'preview',   label:'Role Preview',      icon:'fa-eye' },
    ];

    const tabNav = tabs.map(t => `
      <button onclick="rolesTab('${t.id}')"
        class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors
          ${activeTab===t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
        <i class="fas ${t.icon} text-xs"></i>${t.label}
      </button>`
    ).join('');

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-xl font-extrabold text-slate-900">Role Permissions</h1>
            <p class="text-slate-500 text-sm mt-1">Control which roles can access each module</p>
          </div>
          <div class="flex items-center gap-3">
            ${isDirty ? `<span class="text-xs text-amber-600 font-medium flex items-center gap-1"><i class="fas fa-circle text-[8px]"></i>Unsaved changes</span>` : ''}
            <button onclick="rolesSave()" id="roles-save-btn"
              class="btn-primary ${!isDirty ? 'opacity-50 cursor-not-allowed' : ''}" ${!isDirty ? 'disabled' : ''}>
              <i class="fas fa-save text-sm"></i> Save Changes
            </button>
          </div>
        </div>

        <div class="bg-white border-b border-slate-200 px-6 md:px-10 flex gap-1 overflow-x-auto">
          ${tabNav}
        </div>

        <div id="roles-status" class="px-6 md:px-10 pt-4"></div>

        <div class="px-6 md:px-10 py-6">
          ${loading
            ? `<div class="flex items-center justify-center py-24"><i class="fas fa-circle-notch fa-spin text-3xl text-blue-500 opacity-60"></i></div>`
            : activeTab === 'matrix'    ? renderMatrixHTML()
            : activeTab === 'overrides' ? renderOverridesHTML()
            :                             renderPreviewHTML()
          }
        </div>
      </div>`;
  }

  window.rolesTab = function(tab) { activeTab = tab; render(); };

  window.rolesSave = async function() {
    const btn = document.getElementById('roles-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }
    const statusEl = document.getElementById('roles-status');
    try {
      await savePermissions();
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 bg-green-50 text-green-700 border border-green-200"><i class="fas fa-check-circle"></i><span>Permissions saved!</span></div>`;
      setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
      render();
    } catch(e) {
      statusEl.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle"></i><span>${e.message}</span></div>`;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save text-sm"></i> Save Changes'; }
    }
  };

  // ================================================================
  //  MATRIX TAB
  // ================================================================
  function renderMatrixHTML() {
    const addons       = allAddonEntries();
    const installedIds = installedAddonIds();

    return `
      <div class="space-y-3">
        <div class="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          <i class="fas fa-info-circle flex-shrink-0"></i>
          <span>Toggle which roles can see each module. <strong>SuperAdmin</strong> always has access to everything.</span>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide w-48">Module</th>
                  ${ALL_ROLES.map(r => {
                    const rm = ROLE_META[r];
                    return `<th class="px-3 py-3 text-center">
                      <span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border ${rm.color}">
                        <i class="fas ${rm.icon} text-[10px]"></i>${r}
                      </span>
                    </th>`;
                  }).join('')}
                  <th class="px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                ${addons.map(mod => {
                  const isInstalled = installedIds.includes(mod.id);
                  return `
                    <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors ${!isInstalled ? 'opacity-50' : ''}">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2.5">
                          <div class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <i class="fas ${mod.icon} text-slate-500 text-xs"></i>
                          </div>
                          <span class="text-sm font-semibold text-slate-800">${mod.label}</span>
                        </div>
                      </td>
                      ${ALL_ROLES.map(role => {
                        const checked  = permissions[mod.id]?.[role] ?? false;
                        const disabled = role === 'SuperAdmin';
                        return `<td class="px-3 py-3 text-center">
                          <input type="checkbox" class="w-4 h-4 accent-blue-600 cursor-pointer"
                            data-module="${mod.id}" data-role="${role}"
                            ${checked   ? 'checked'  : ''}
                            ${disabled  ? 'disabled' : ''}
                            onchange="rolesToggle('${mod.id}','${role}',this.checked)">
                        </td>`;
                      }).join('')}
                      <td class="px-3 py-3 text-center">
                        ${isInstalled
                          ? `<span class="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Installed</span>`
                          : `<span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">Not installed</span>`}
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  window.rolesToggle = function(moduleId, role, checked) {
    if (!permissions[moduleId]) permissions[moduleId] = {};
    permissions[moduleId][role] = checked;
    isDirty = true;
    // Update save button
    const btn = document.getElementById('roles-save-btn');
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed'); }
    const dirtyEl = document.querySelector('[data-dirty-indicator]');
    // Re-render header area only
    const header = container.querySelector('.flex.items-start.justify-between');
    if (header) {
      const dirtySpan = header.querySelector('.text-amber-600');
      if (!dirtySpan) {
        const span = document.createElement('span');
        span.className = 'text-xs text-amber-600 font-medium flex items-center gap-1';
        span.innerHTML = '<i class="fas fa-circle text-[8px]"></i>Unsaved changes';
        btn?.parentElement?.insertBefore(span, btn);
      }
    }
  };

  // ================================================================
  //  USER OVERRIDES TAB
  // ================================================================
  function renderOverridesHTML() {
    const addons = allAddonEntries().filter(m => installedAddonIds().includes(m.id));

    if (!usersCache.length) {
      return `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
        <i class="fas fa-users text-3xl mb-3"></i>
        <p class="text-sm">No users found</p>
      </div>`;
    }

    const byRole = {};
    usersCache.forEach(u => {
      const r = u.role || 'Employee';
      if (!byRole[r]) byRole[r] = [];
      byRole[r].push(u);
    });

    return `
      <div class="space-y-3">
        <div class="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <i class="fas fa-info-circle flex-shrink-0"></i>
          <span>Override individual users to give them access to specific modules regardless of their role.</span>
        </div>
        ${['SuperAdmin','Admin','Manager','Employee','Contractor'].filter(r => byRole[r]).map(role => {
          const rm = ROLE_META[role];
          return `
            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-4">
              <div class="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <i class="fas ${rm.icon} text-slate-400 text-xs"></i>
                <span class="text-xs font-bold text-slate-600 uppercase tracking-wide">${role}</span>
                <span class="text-xs text-slate-400">${byRole[role].length} user${byRole[role].length !== 1 ? 's' : ''}</span>
              </div>
              ${byRole[role].map(u => {
                const uid       = u.id || u.user_id;
                const overridden = hasOverride(uid);
                const userMods  = getUserModules(uid);
                const initials  = (u.name||'?').charAt(0).toUpperCase();
                const colors    = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
                const avatarCls = colors[(uid.charCodeAt?uid.charCodeAt(0):0) % colors.length];

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
                          class="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50">
                          <i class="fas fa-undo text-[10px]"></i> Reset
                        </button>` : ''}
                      <button onclick="this.closest('.border-b').querySelector('.override-modules').classList.toggle('hidden')"
                        class="text-xs text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1">
                        <i class="fas fa-sliders-h text-[10px]"></i>
                        ${overridden ? 'Edit' : 'Override'}
                      </button>
                    </div>
                    <div class="override-modules hidden px-5 pb-4">
                      <div class="bg-slate-50 rounded-xl p-3">
                        <p class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Module Access</p>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                          ${addons.map(mod => {
                            const hasAccess = userMods !== null
                              ? userMods.includes(mod.id)
                              : (permissions[mod.id]?.[role] ?? false);
                            return `
                              <label class="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${hasAccess ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-slate-200 hover:border-blue-200'}">
                                <input type="checkbox"
                                  data-override-uid="${uid}" data-override-mod="${mod.id}"
                                  ${hasAccess ? 'checked' : ''}
                                  onchange="rolesSetOverride('${uid}','${mod.id}',this.checked)"
                                  class="w-3.5 h-3.5 accent-blue-600 flex-shrink-0">
                                <i class="fas ${mod.icon} text-slate-400 text-[11px] w-3"></i>
                                <span class="text-xs font-medium text-slate-700 truncate">${mod.label}</span>
                              </label>`;
                          }).join('')}
                        </div>
                      </div>
                    </div>
                  </div>`;
              }).join('')}
            </div>`;
        }).join('')}
      </div>`;
  }

  window.rolesSetOverride = function(userId, moduleId, checked) {
    if (!userOverrides[userId]) {
      // Init from current role permissions
      const u    = usersCache.find(u => (u.id||u.user_id) === userId);
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
    isDirty = true;
    const btn = document.getElementById('roles-save-btn');
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed'); }
  };

  window.rolesClearOverride = function(userId) {
    delete userOverrides[userId];
    isDirty = true;
    render();
  };

  // ================================================================
  //  PREVIEW TAB
  // ================================================================
  function renderPreviewHTML() {
    const addons       = allAddonEntries();
    const installedIds = installedAddonIds();

    return `
      <div class="space-y-4">
        <p class="text-sm text-slate-500">This shows exactly what each role will see in their sidebar.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${ALL_ROLES.map(role => {
            const rm                  = ROLE_META[role];
            const accessibleAddons    = addons.filter(m => permissions[m.id]?.[role]);
            const installedAccessible = accessibleAddons.filter(m => installedIds.includes(m.id));
            const coreVisible         = CORE_MODULES.filter(c => c.fixedRoles.includes(role));

            return `
              <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div class="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="${rm.dot} w-2.5 h-2.5 rounded-full inline-block"></span>
                    <span class="font-bold text-slate-900 text-sm">${role}</span>
                  </div>
                  <span class="text-xs text-slate-400">${coreVisible.length + installedAccessible.length} visible</span>
                </div>
                <div class="p-3 space-y-0.5 bg-slate-50/50 min-h-[180px]">
                  ${coreVisible.map(c => `
                    <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-slate-100 text-xs font-medium text-slate-700">
                      <i class="fas ${c.icon} text-blue-400 w-3.5 text-center"></i>
                      ${c.label}
                      <span class="ml-auto text-[9px] text-slate-300">core</span>
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
                  ` : `<div class="px-3 py-2 text-xs text-slate-400 italic">No add-on modules</div>`}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Boot ────────────────────────────────────────────────────────
  render();
  loadPermissions();
};
