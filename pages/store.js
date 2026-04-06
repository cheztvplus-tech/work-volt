window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['store'] = function(container) {

  const db = window.WorkVoltDB;

  // ── Module catalogue ───────────────────────────────────────────
  const CATALOGUE = [
    { id:'notifications', label:'Notifications',        icon:'fa-bell',               category:'Productivity', version:'1.0.0', description:'Full notification center with bell alerts, unread counts, and mark-as-read. Wires into Tasks and approvals.', tags:['notifications','alerts'], color:'#3b82f6', gradient:'from-blue-500 to-indigo-600', featured:true },
    { id:'tasks',         label:'Tasks',                icon:'fa-check-circle',       category:'Productivity', version:'1.0.0', description:'Create, assign and track tasks across your team. Set priorities, due dates and follow progress in one place.', tags:['tasks','productivity'], color:'#8b5cf6', gradient:'from-violet-500 to-purple-600', featured:true },
    { id:'pipeline',      label:'Pipeline',             icon:'fa-users',              category:'Sales',        version:'1.0.0', description:'Manage your sales pipeline with Kanban. Track deals from lead to close.', tags:['sales','pipeline'], color:'#3b82f6', gradient:'from-blue-500 to-indigo-600', featured:false },
    { id:'payroll',       label:'Payroll',              icon:'fa-money-bill-wave',    category:'HR',           version:'1.0.0', description:'Run payroll, manage salaries, deductions and bonuses for your team.', tags:['payroll','hr'], color:'#10b981', gradient:'from-emerald-500 to-teal-600', featured:false },
    { id:'timesheets',    label:'Timesheets',           icon:'fa-clock',              category:'HR',           version:'1.0.0', description:'Log daily hours, submit timesheets for approval and track billable time.', tags:['time','hr'], color:'#f59e0b', gradient:'from-amber-500 to-orange-500', featured:false },
    { id:'financials',    label:'Financials',           icon:'fa-chart-line',         category:'Finance',      version:'1.0.0', description:'Track revenue, costs and P&L. Visual dashboards for your financial data.', tags:['finance','accounting'], color:'#06b6d4', gradient:'from-cyan-500 to-blue-500', featured:true },
    { id:'crm',           label:'CRM',                  icon:'fa-address-book',       category:'Sales',        version:'1.0.0', description:'Manage clients, contacts and interactions. Keep your relationship history searchable.', tags:['crm','clients'], color:'#ec4899', gradient:'from-pink-500 to-rose-500', featured:true },
    { id:'projects',      label:'Projects',             icon:'fa-folder-open',        category:'Productivity', version:'1.0.0', description:'Project management with List, Board and Calendar views, team workload and analytics.', tags:['projects','planning'], color:'#3b82f6', gradient:'from-blue-500 to-indigo-600', featured:true, requires:['tasks'] },
    { id:'reports',       label:'Reports',              icon:'fa-chart-pie',          category:'Analytics',    version:'1.0.0', description:'Cross-module reports and analytics. Visualise KPIs and trends from your data.', tags:['reports','analytics'], color:'#6366f1', gradient:'from-indigo-500 to-violet-600', featured:false },
    { id:'assets',        label:'Assets',               icon:'fa-box-open',           category:'Operations',   version:'1.0.0', description:'Track equipment and assets. Assign items to employees and monitor status.', tags:['assets','equipment'], color:'#64748b', gradient:'from-slate-500 to-slate-700', featured:false },
    { id:'attendance',    label:'Attendance Tracker',   icon:'fa-calendar-check',     category:'HR',           version:'1.0.0', description:'Track daily check-ins, absences and late arrivals with full history.', tags:['hr','tracking'], color:'#6366f1', gradient:'from-indigo-500 to-purple-600', featured:false },
    { id:'invoices',      label:'Invoice Manager',      icon:'fa-file-invoice-dollar',category:'Finance',      version:'1.0.0', description:'Create, send and track invoices. Manage payment status and overdue reminders.', tags:['finance','billing'], color:'#10b981', gradient:'from-emerald-500 to-teal-600', featured:false },
    { id:'inventory',     label:'Inventory Control',    icon:'fa-warehouse',          category:'Operations',   version:'1.0.0', description:'Monitor stock levels, set reorder points and track item movements.', tags:['stock','warehouse'], color:'#f59e0b', gradient:'from-amber-500 to-orange-500', featured:false },
    { id:'scheduler',     label:'Shift Scheduler',      icon:'fa-calendar-alt',       category:'HR',           version:'1.0.0', description:'Build weekly shift rosters, manage swaps and publish schedules to your team.', tags:['hr','scheduling'], color:'#8b5cf6', gradient:'from-violet-500 to-purple-600', featured:false },
    { id:'expenses',      label:'Expense Claims',       icon:'fa-receipt',            category:'Finance',      version:'1.0.0', description:'Submit, review and reimburse employee expense claims with receipt tracking.', tags:['expenses','finance'], color:'#f97316', gradient:'from-orange-500 to-red-500', featured:false },
    { id:'contracts',     label:'Contract Hub',         icon:'fa-file-signature',     category:'Legal',        version:'1.0.0', description:'Store and manage contracts with expiry alerts and status tracking.', tags:['contracts','legal'], color:'#0ea5e9', gradient:'from-sky-500 to-blue-600', featured:false },
    { id:'helpdesk',      label:'Help Desk',            icon:'fa-headset',            category:'Operations',   version:'1.0.0', description:'Internal ticket system for IT and HR support requests.', tags:['helpdesk','support'], color:'#14b8a6', gradient:'from-teal-500 to-cyan-600', featured:false },
    { id:'recruitment',   label:'Recruitment Pipeline', icon:'fa-user-tie',           category:'HR',           version:'1.0.0', description:'Track candidates through your hiring pipeline from application to offer.', tags:['recruitment','hr'], color:'#a855f7', gradient:'from-purple-500 to-violet-600', featured:false },
    { id:'eshop',         label:'eShop',                icon:'fa-store',              category:'Commerce',     version:'1.0.0', description:'Full e-commerce engine + point of sale. Manage products, orders, customers and discounts. Deploys a live public storefront.', tags:['ecommerce','pos','store','orders'], color:'#0ea5e9', gradient:'from-sky-500 to-blue-600', featured:true },
    { id:'booking',       label:'Booking Manager',      icon:'fa-calendar-check',     category:'Commerce',     version:'1.0.0', description:'Full appointment & booking system. Services, staff scheduling, conflict detection, recurring bookings, travel fees, PayPal payments and a public booking page.', tags:['booking','appointments','scheduling','calendar'], color:'#2563eb', gradient:'from-blue-500 to-indigo-600', featured:true },
  ];

  const CATEGORIES = ['All', ...new Set(CATALOGUE.map(m => m.category))];

  // ── State ──────────────────────────────────────────────────────
  let installedIds   = [];
  let filterCategory = 'All';
  let searchQuery    = '';
  let activeModal    = null;
  let availablePages = null; // null = not yet probed, Set = probed

  // ── Auto-detect which pages exist by probing pages/{id}.js ──────────
  async function probeAvailablePages() {
    if (availablePages !== null) return;
    availablePages = new Set();
    await Promise.all(
      CATALOGUE.map(async m => {
        try {
          const res = await fetch(`pages/${m.id}.js`, { method: 'HEAD', cache: 'no-store' });
          if (res.ok) availablePages.add(m.id);
        } catch(e) { /* not available */ }
      })
    );
  }

  function isComingSoon(m) {
    if (availablePages === null) return false; // still probing — assume ready
    return !availablePages.has(m.id);
  }

  // ── Load installed modules ──────────────────────────────────────
  async function loadInstalled() {
    try {
      const mods = await db.config.getInstalledModules();
      installedIds = mods.map(m => m.id);
      window.INSTALLED_MODULES = mods;
    } catch(e) {
      installedIds = (window.INSTALLED_MODULES || []).map(m => m.id);
    }
    render();
  }

  // ── Render ──────────────────────────────────────────────────────
  function render() {
    const filtered = CATALOGUE.filter(m => {
      const matchCat    = filterCategory === 'All' || m.category === filterCategory;
      const matchSearch = !searchQuery
        || m.label.toLowerCase().includes(searchQuery.toLowerCase())
        || m.tags.some(t => t.includes(searchQuery.toLowerCase()));
      const notInstalled = !installedIds.includes(m.id);
      return matchCat && matchSearch && notInstalled;
    });

    const featured   = filtered.filter(m => m.featured);
    const others     = filtered.filter(m => !m.featured);
    const installed  = CATALOGUE.filter(m => installedIds.includes(m.id));

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">

        <!-- Header -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 py-6">
          <h1 class="text-xl font-extrabold text-slate-900">Module Store</h1>
          <p class="text-slate-500 text-sm mt-1">Add features to your workspace — all data stored in your own Supabase database</p>
        </div>

        <div class="max-w-5xl mx-auto px-6 md:px-10 py-8 space-y-8">

          <!-- Search + filter -->
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="relative flex-1">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="text" placeholder="Search modules…" id="store-search"
                value="${searchQuery}"
                oninput="storeSearch(this.value)"
                class="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
            </div>
            <div class="flex gap-2 flex-wrap">
              ${CATEGORIES.map(cat => `
                <button onclick="storeFilter('${cat}')"
                  class="px-3 py-2 rounded-xl text-xs font-semibold border transition-all
                    ${filterCategory===cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}">
                  ${cat}
                </button>`).join('')}
            </div>
          </div>

          <!-- Installed -->
          ${installed.length ? `
            <div>
              <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                Installed (${installed.length})
              </h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${installed.map(m => renderInstalledCard(m)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Featured -->
          ${featured.length && filterCategory === 'All' && !searchQuery ? `
            <div>
              <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">⭐ Featured</h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${featured.map(m => renderModuleCard(m, true)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- All available -->
          ${others.length ? `
            <div>
              <h2 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                ${filterCategory !== 'All' || searchQuery ? 'Results' : 'All Modules'}
              </h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                ${others.map(m => renderModuleCard(m, false)).join('')}
              </div>
            </div>
          ` : ''}

          ${!filtered.length ? `
            <div class="text-center py-16 text-slate-400">
              <i class="fas fa-search text-3xl mb-3"></i>
              <p class="font-medium">No modules match your search</p>
              <button onclick="storeFilter('All'); storeSearch('')" class="text-xs text-blue-500 mt-2 hover:underline">Clear filters</button>
            </div>
          ` : ''}

        </div>
      </div>

      <!-- Modal -->
      <div id="store-modal" class="hidden fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="storeCloseModal()">
        <div id="store-modal-content" class="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()"></div>
      </div>`;
  }

  function renderInstalledCard(m) {
    return `
      <div class="bg-white border border-green-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center flex-shrink-0 shadow-sm">
          <i class="fas ${m.icon} text-white text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-900 text-sm truncate">${m.label}</div>
          <div class="text-xs text-slate-400">${m.category} · v${m.version}</div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Installed</span>
          <button onclick="storeOpenUninstall('${m.id}')"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            <i class="fas fa-trash text-xs"></i>
          </button>
        </div>
      </div>`;
  }

  function renderModuleCard(m, featured) {
    const requiresMissing = (m.requires || []).filter(r => !installedIds.includes(r));
    const coming = isComingSoon(m);
    
    return `
      <div class="bg-white border ${coming ? 'border-amber-200' : 'border-slate-200'} rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col ${featured ? 'ring-1 ring-blue-100' : ''}">
        <div class="h-2 bg-gradient-to-r ${m.gradient}"></div>
        <div class="p-4 flex-1 flex flex-col gap-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} ${coming ? 'opacity-60' : ''} flex items-center justify-center flex-shrink-0 shadow-sm">
              <i class="fas ${m.icon} text-white text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-slate-900 text-sm">${m.label}</div>
              <div class="text-xs text-slate-400">${m.category} · v${m.version}</div>
            </div>
            ${coming 
              ? `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded border border-amber-200 flex-shrink-0">Coming Soon</span>`
              : featured ? `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded border border-amber-200 flex-shrink-0">Featured</span>` 
              : ''}
          </div>
          <p class="text-xs text-slate-500 leading-relaxed flex-1">${m.description}</p>
          ${requiresMissing.length ? `
            <div class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <i class="fas fa-exclamation-triangle mr-1"></i>
              Requires: ${requiresMissing.map(r => CATALOGUE.find(c=>c.id===r)?.label||r).join(', ')}
            </div>` : ''}
          ${coming 
            ? `<div class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">
                 <i class="fas fa-clock text-xs"></i> Coming Soon
               </div>`
            : `<button onclick="storeOpenInstall('${m.id}')"
                ${requiresMissing.length ? 'disabled' : ''}
                class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all
                  ${requiresMissing.length
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r ' + m.gradient + ' text-white hover:opacity-90 shadow-sm active:scale-[.98]'}">
                <i class="fas fa-download text-xs"></i> Install
              </button>`
          }
        </div>
      </div>`;
  }

  // ── Install modal ────────────────────────────────────────────────
  window.storeOpenInstall = function(moduleId) {
    const m = CATALOGUE.find(c => c.id === moduleId);
    if (!m) return;
    activeModal = moduleId;

    document.getElementById('store-modal-content').innerHTML = `
      <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center flex-shrink-0">
          <i class="fas ${m.icon} text-white"></i>
        </div>
        <div class="flex-1">
          <h3 class="font-bold text-slate-900">Install ${m.label}</h3>
          <p class="text-xs text-slate-400">${m.category} · v${m.version}</p>
        </div>
        <button onclick="storeCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
          <i class="fas fa-times text-sm"></i>
        </button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <p class="text-sm text-slate-600">${m.description}</p>
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex gap-2">
          <i class="fas fa-database mt-0.5 flex-shrink-0"></i>
          <span>This module uses the <strong>${m.label.toLowerCase().replace(' ','_')}</strong> tables already created in your Supabase database. No additional setup needed.</span>
        </div>
        <div id="store-install-error" class="hidden p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600"></div>
        <div class="flex gap-3 pt-1">
          <button onclick="storeCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="storeConfirmInstall('${moduleId}')" id="store-install-btn"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${m.gradient} hover:opacity-90 transition-all shadow-sm">
            <i class="fas fa-download text-xs"></i> Install Now
          </button>
        </div>
      </div>`;

    document.getElementById('store-modal').classList.remove('hidden');
  };

  window.storeConfirmInstall = async function(moduleId) {
    const btn   = document.getElementById('store-install-btn');
    const errEl = document.getElementById('store-install-error');
    const m     = CATALOGUE.find(c => c.id === moduleId);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Installing…'; }
    errEl.classList.add('hidden');

    try {
      // Load current modules, add new one, save back
      const current = await db.config.getInstalledModules();
      if (!current.find(x => x.id === moduleId)) {
        current.push({ id: moduleId, label: m.label, icon: m.icon, version: m.version });
        await db.config.saveInstalledModules(current);
        installedIds = current.map(x => x.id);
        window.INSTALLED_MODULES = current;
        if (typeof window.renderNav === 'function') window.renderNav();
      }

      // Show success
      document.getElementById('store-modal-content').innerHTML = `
        <div class="px-6 py-10 text-center">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-check text-green-600 text-2xl"></i>
          </div>
          <h3 class="font-bold text-slate-900 text-lg mb-2">${m.label} Installed!</h3>
          <p class="text-sm text-slate-500 mb-5">The module is now available in your sidebar.</p>
          <div class="flex gap-3 justify-center">
            <button onclick="storeCloseModal()" class="btn-secondary px-5">Close</button>
            <button onclick="storeCloseModal(); window.WorkVolt.navigate('${moduleId}');"
              class="btn-primary px-5"><i class="fas fa-arrow-right text-sm"></i> Open Module</button>
          </div>
        </div>`;

      window.WorkVolt?.toast(m.label + ' installed!', 'success');
      render();

    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download text-xs"></i> Install Now'; }
    }
  };

  // ── Uninstall modal ──────────────────────────────────────────────
  window.storeOpenUninstall = function(moduleId) {
    const m = CATALOGUE.find(c => c.id === moduleId);
    if (!m) return;

    document.getElementById('store-modal-content').innerHTML = `
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-red-700">Uninstall ${m.label}</h3>
        <button onclick="storeCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div class="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <i class="fas fa-triangle-exclamation text-amber-500 mt-0.5 flex-shrink-0"></i>
          <div class="text-sm text-amber-700">
            <p class="font-semibold mb-1">Your data is safe</p>
            <p>Uninstalling removes the module from your sidebar. All data remains in your Supabase database and can be restored by reinstalling.</p>
          </div>
        </div>
        <div class="flex gap-3">
          <button onclick="storeCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="storeConfirmUninstall('${moduleId}')" id="store-uninstall-btn"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
            <i class="fas fa-trash text-sm"></i> Uninstall
          </button>
        </div>
      </div>`;

    document.getElementById('store-modal').classList.remove('hidden');
  };

  window.storeConfirmUninstall = async function(moduleId) {
    const btn = document.getElementById('store-uninstall-btn');
    const m   = CATALOGUE.find(c => c.id === moduleId);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Removing…'; }

    try {
      const current = (await db.config.getInstalledModules()).filter(x => x.id !== moduleId);
      await db.config.saveInstalledModules(current);
      installedIds = current.map(x => x.id);
      window.INSTALLED_MODULES = current;
      if (typeof window.renderNav === 'function') window.renderNav();
      storeCloseModal();
      window.WorkVolt?.toast((m?.label || moduleId) + ' uninstalled.', 'info');
      render();
    } catch(e) {
      window.WorkVolt?.toast('Uninstall failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-sm"></i> Uninstall'; }
    }
  };

  window.storeCloseModal = function() {
    document.getElementById('store-modal').classList.add('hidden');
    document.getElementById('store-modal-content').innerHTML = '';
    activeModal = null;
  };

  // ── Filter / search handlers ─────────────────────────────────────
  window.storeFilter = function(cat) { filterCategory = cat; render(); };
  window.storeSearch = function(q)   { searchQuery    = q;   render(); };

  // ── Boot ────────────────────────────────────────────────────────
  render(); // Show initial empty state
  loadInstalled().then(() => {
    probeAvailablePages().then(() => render()); // Re-render with data
  });
};
