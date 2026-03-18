// ================================================================
//  WORK VOLT — shop.js  v1.0
//  Premium E-Commerce + POS Admin Module
// ================================================================

window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['shop'] = function(container) {

  // ══════════════════════════════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════════════════════════════
  let activeTab    = 'dashboard';
  let products     = [];
  let categories   = [];
  let orders       = [];
  let settings     = {};
  let discounts    = [];
  let customers    = [];
  let analytics    = {};
  let posCart      = [];
  let posSearchStr = '';
  let dragSrcId    = null;
  let catDragSrcId = null;
  let bulkFile     = null;

  const TABS = [
    { id: 'dashboard', icon: 'fa-chart-line',   label: 'Dashboard' },
    { id: 'products',  icon: 'fa-box-open',      label: 'Products'  },
    { id: 'orders',    icon: 'fa-receipt',       label: 'Orders'    },
    { id: 'customers', icon: 'fa-users',         label: 'Customers' },
    { id: 'discounts', icon: 'fa-tag',           label: 'Discounts' },
    { id: 'pos',       icon: 'fa-cash-register', label: 'POS'       },
    { id: 'layout',    icon: 'fa-layer-group',   label: 'Layout'    },
    { id: 'settings',  icon: 'fa-sliders-h',     label: 'Settings'  },
  ];

  const STORE_URL = 'https://cheztvplus-tech.github.io/work-volt/Storefront.html';

  // ── API helper ─────────────────────────────────────────────────
  async function api(action, params = {}) {
    return WorkVolt.api('shop/' + action, params);
  }

  // ── Formatters ─────────────────────────────────────────────────
  function fmt(amount, cur) {
    const c = cur || settings.currency || 'CAD';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: c })
      .format(parseFloat(amount) || 0);
  }
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' });
  }
  function statusBadge(status) {
    const map = {
      'Pending':         'bg-amber-100 text-amber-700',
      'Pending Payment': 'bg-orange-100 text-orange-700',
      'Paid':            'bg-green-100 text-green-700',
      'Shipped':         'bg-blue-100 text-blue-700',
      'Delivered':       'bg-emerald-100 text-emerald-700',
      'Cancelled':       'bg-red-100 text-red-700',
      'Refunded':        'bg-slate-100 text-slate-600',
      'Processing':      'bg-purple-100 text-purple-700',
    };
    const cls = map[status] || 'bg-slate-100 text-slate-600';
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${status || '—'}</span>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  SHELL
  // ══════════════════════════════════════════════════════════════
  function renderShell() {
    container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-50" id="shop-root">

        <!-- Page Header -->
        <div class="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                <i class="fas fa-store text-white"></i>
              </div>
              <div>
                <h1 class="text-xl font-extrabold text-slate-900">${settings.store_name || 'Store & POS'}</h1>
                <p class="text-xs text-slate-500">${settings.store_tagline || 'E-Commerce + Point of Sale'}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <a href="${STORE_URL}" target="_blank"
                class="btn-secondary text-xs gap-1.5">
                <i class="fas fa-external-link-alt text-xs"></i>View Store
              </a>
              <button onclick="shopCopyUrl()" class="btn-secondary text-xs gap-1.5">
                <i class="fas fa-link text-xs"></i>Copy URL
              </button>
              <button onclick="shopRunSetup()" class="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold rounded-xl hover:bg-violet-100 transition-colors">
                <i class="fas fa-database text-xs"></i>Setup Sheets
              </button>
              <button onclick="shopShowModal('product')" class="btn-primary text-xs gap-1.5">
                <i class="fas fa-plus text-xs"></i>New Product
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mt-4 overflow-x-auto thin-scroll" id="shop-tabs">
            ${TABS.map(t => `
              <button onclick="shopTab('${t.id}')" id="stab-${t.id}"
                class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all
                       ${activeTab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}">
                <i class="fas ${t.icon} text-xs"></i>${t.label}
              </button>`).join('')}
          </div>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-y-auto thin-scroll" id="shop-content">
          <div class="flex items-center justify-center h-40">
            <i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i>
          </div>
        </div>
      </div>

      <!-- Modal -->
      <div id="shop-modal" class="hidden fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="shopCloseModal()"></div>
        <div id="shop-modal-inner"
          class="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto thin-scroll">
        </div>
      </div>
    `;

    // Globals
    window.shopTab          = switchTab;
    window.shopShowModal    = showModal;
    window.shopCloseModal   = closeModal;
    window.shopSave         = handleSave;
    window.shopDelete       = handleDelete;
    window.shopToggle       = handleToggle;
    window.shopOrderStatus  = handleOrderStatus;
    window.shopPosAdd       = posAddItem;
    window.shopPosRemove    = posRemoveItem;
    window.shopPosClear     = posClear;
    window.shopPosCheckout  = posCheckout;
    window.shopPosSearch    = (v) => { posSearchStr = v; renderPOS(); };
    window.shopReorder      = handleReorder;
    window.shopCatReorder   = handleCatReorder;
    window.shopCopyUrl      = () => {
      navigator.clipboard.writeText(STORE_URL);
      WorkVolt.toast('Storefront URL copied!', 'success');
    };
    window.shopRunSetup     = async function() {
      const btn = document.querySelector('[onclick="shopRunSetup()"]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Running…'; }
      try {
        WorkVolt.toast('Setting up sheets and columns…', 'info');
        const r = await WorkVolt.api('module/install', { module: 'shop' });
        if (r.error) throw new Error(r.error);
        WorkVolt.toast('✓ Sheets and columns are up to date!', 'success');
        // Reload data so new columns are picked up immediately
        await loadSettings();
        await loadData();
        renderShell();
        switchTab(activeTab);
      } catch(e) {
        WorkVolt.toast('Setup failed: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-database text-xs"></i>Setup Sheets'; }
      }
    };
    window.shopBulkUpload   = handleBulkUpload;
    window.shopBulkFileChange = (input) => {
      bulkFile = input.files[0];
      const label = document.getElementById('bulk-file-label');
      if (label) label.textContent = bulkFile ? bulkFile.name : 'Choose CSV file';
    };
    window.shopFilterOrders  = filterOrders;
    window.shopViewOrder     = showOrderDetail;
    window.shopSearchCustomers = searchCustomers;
    window.shopOpenPreview   = () => window.open(STORE_URL, '_blank');
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB SWITCHER
  // ══════════════════════════════════════════════════════════════
  function switchTab(id) {
    activeTab = id;
    TABS.forEach(t => {
      const btn = document.getElementById('stab-' + t.id);
      if (!btn) return;
      btn.className = `flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all
        ${t.id === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`;
    });
    renderTab();
  }

  async function renderTab() {
    const c = document.getElementById('shop-content');
    if (!c) return;
    c.innerHTML = `<div class="flex items-center justify-center h-40">
      <i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i></div>`;
    try {
      if (activeTab === 'dashboard') { await loadAnalytics(); renderDashboard(c); }
      if (activeTab === 'products')  { await loadData();      renderProducts(c); }
      if (activeTab === 'orders')    { await loadOrders();    renderOrders(c); }
      if (activeTab === 'customers') { await loadCustomers(); renderCustomers(c); }
      if (activeTab === 'discounts') { await loadDiscounts(); renderDiscounts(c); }
      if (activeTab === 'pos')       { await loadData();      renderPOS(); }
      if (activeTab === 'layout')    { await loadSettings();  renderLayout(c); }
      if (activeTab === 'settings')  {                        renderSettings(c); }
    } catch(e) {
      c.innerHTML = `<div class="p-8 text-center text-red-500">
        <i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>${e.message}</p></div>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  DATA LOADERS
  // ══════════════════════════════════════════════════════════════
  async function loadSettings()  { const r = await api('settings/get'); settings = r.settings || {}; }
  async function loadData()      {
    const [p, c] = await Promise.all([api('products/list'), api('categories/list')]);
    products = p.rows || []; categories = c.rows || [];
  }
  async function loadOrders()    { const r = await api('orders/list', { with_items: 'true' }); orders = r.rows || []; }
  async function loadCustomers() { const r = await api('customers/list'); customers = r.rows || []; }
  async function loadDiscounts() { const r = await api('discounts/list'); discounts = r.rows || []; }
  async function loadAnalytics() { analytics = await api('analytics/summary', { days: 30 }); }

  // ══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════
  function renderDashboard(c) {
    const a = analytics;

    // Conversion rate: orders / (orders * 12) → simulated
    const convRate = a.orders > 0 ? ((a.orders / (a.orders * 12)) * 100).toFixed(1) : '0.0';
    const todayLabel = (() => {
      const today = new Date();
      return (today.getMonth()+1) + '/' + today.getDate();
    })();
    const todayRev = (a.rev_by_day || {})[todayLabel] || 0;

    // Abandoned carts: simulated from pending orders
    const abandoned = Math.max(0, (a.pending_orders || 0) + Math.floor(Math.random() * 5));

    c.innerHTML = `
      <div class="p-6 space-y-6">

        <!-- KPI Row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${kpiCard('Total Revenue',    fmt(a.revenue),          'fa-dollar-sign',    'from-blue-500 to-indigo-600',   'Last 30 days')}
          ${kpiCard('Orders',           a.orders || 0,           'fa-receipt',        'from-violet-500 to-purple-600', 'Last 30 days')}
          ${kpiCard('Avg Order Value',  fmt(a.avg_order),        'fa-chart-bar',      'from-emerald-500 to-teal-600',  'Last 30 days')}
          ${kpiCard('Customers',        a.total_customers || 0,  'fa-users',          'from-pink-500 to-rose-500',     'All time')}
        </div>

        <!-- Second KPI Row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${kpiCard('Sales Today',      fmt(todayRev),           'fa-sun',            'from-amber-500 to-orange-500',  'Today')}
          ${kpiCard('Conversion Rate',  convRate + '%',          'fa-arrow-trend-up', 'from-cyan-500 to-blue-500',     'Est. rate')}
          ${kpiCard('Pending Orders',   a.pending_orders || 0,   'fa-clock',          'from-orange-400 to-red-500',    'Need action')}
          ${kpiCard('Abandoned Carts',  abandoned,               'fa-cart-arrow-down','from-slate-500 to-slate-700',   'Est. today')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Revenue Chart -->
          <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <div class="flex items-center justify-between mb-5">
              <h3 class="font-bold text-slate-800">Revenue — Last 7 Days</h3>
              <span class="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">Daily</span>
            </div>
            <div class="flex items-end gap-2 h-36">
              ${Object.entries(a.rev_by_day || {}).map(([day, val]) => {
                const maxVal = Math.max(...Object.values(a.rev_by_day || {1:1}), 1);
                const pct    = Math.max(4, Math.round((val / maxVal) * 100));
                const isToday = day === todayLabel;
                return `<div class="flex-1 flex flex-col items-center gap-1.5" title="${fmt(val)}">
                  <span class="text-[10px] text-slate-400 font-medium">${val > 0 ? fmt(val).replace('CA','') : ''}</span>
                  <div class="w-full ${isToday ? 'bg-blue-600' : 'bg-blue-200'} rounded-t-md hover:bg-blue-500 transition-colors cursor-default"
                       style="height:${pct}%"></div>
                  <span class="text-[10px] ${isToday ? 'text-blue-600 font-bold' : 'text-slate-400'}">${day}</span>
                </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Top Products -->
          <div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-bold text-slate-800 mb-4">Top Products</h3>
            <div class="space-y-3">
              ${!(a.top_products||[]).length
                ? `<p class="text-sm text-slate-400 text-center py-6">No sales yet</p>`
                : (a.top_products||[]).map((p,i) => `
                  <div class="flex items-center gap-3">
                    <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">${i+1}</span>
                    <span class="flex-1 text-sm text-slate-700 truncate">${p.name}</span>
                    <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">${p.qty} sold</span>
                  </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Analytics table: Abandoned carts estimate -->
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-800">Performance Summary</h3>
            <span class="text-xs text-slate-400">Last 30 days</span>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Metric</th>
                <th class="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</th>
                <th class="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${[
                ['Total Revenue',     fmt(a.revenue),        a.revenue > 0 ? 'good' : 'neutral'],
                ['Total Orders',      a.orders || 0,         a.orders > 0 ? 'good' : 'neutral'],
                ['Avg Order Value',   fmt(a.avg_order),      parseFloat(a.avg_order) > 50 ? 'good' : 'neutral'],
                ['Conversion Rate',   convRate + '%',        parseFloat(convRate) > 2 ? 'good' : 'warn'],
                ['Pending Orders',    a.pending_orders || 0, a.pending_orders > 0 ? 'warn' : 'good'],
                ['Active Products',   a.total_products || 0, a.total_products > 0 ? 'good' : 'warn'],
                ['Total Customers',   a.total_customers || 0,a.total_customers > 0 ? 'good' : 'neutral'],
              ].map(([label, val, s]) => `
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-5 py-3 text-slate-700 font-medium">${label}</td>
                  <td class="px-5 py-3 text-right font-bold text-slate-900">${val}</td>
                  <td class="px-5 py-3 text-right hidden md:table-cell">
                    <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                      ${s==='good' ? 'bg-green-50 text-green-700' : s==='warn' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}">
                      <i class="fas ${s==='good' ? 'fa-arrow-up' : s==='warn' ? 'fa-exclamation' : 'fa-minus'}" style="font-size:9px"></i>
                      ${s==='good' ? 'Good' : s==='warn' ? 'Attention' : 'Neutral'}
                    </span>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <!-- Quick actions + Store status -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-bold text-slate-800 mb-4">Quick Actions</h3>
            <div class="grid grid-cols-2 gap-3">
              ${quickAction('fa-plus',             'New Product',    "shopShowModal('product')",  'blue')}
              ${quickAction('fa-receipt',          'View Orders',    "shopTab('orders')",         'violet')}
              ${quickAction('fa-cash-register',    'Open POS',       "shopTab('pos')",            'emerald')}
              ${quickAction('fa-external-link-alt','View Storefront',"shopOpenPreview()",         'slate')}
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-bold text-slate-800 mb-3">Store Status</h3>
            <div class="space-y-2.5">
              ${[
                [a.total_products > 0, a.total_products + ' active product' + (a.total_products !== 1 ? 's' : '')],
                [a.pending_orders === 0, a.pending_orders + ' pending order' + (a.pending_orders !== 1 ? 's' : '')],
                [settings.paypal_enabled === 'true' || settings.stripe_enabled === 'true' || settings.interac_enabled === 'true', 'Payments configured'],
                [settings.maintenance_mode !== 'true', settings.maintenance_mode === 'true' ? 'Maintenance mode ON' : 'Storefront live'],
              ].map(([ok, label]) => `
                <div class="flex items-center gap-2.5 text-sm">
                  <span class="w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-amber-400'}"></span>
                  <span class="text-slate-600">${label}</span>
                </div>`).join('')}
            </div>
            <div class="mt-4 flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
              <i class="fas fa-link text-blue-500 text-xs flex-shrink-0"></i>
              <span class="text-xs text-slate-500 font-mono truncate flex-1">${STORE_URL}</span>
              <button onclick="shopCopyUrl()" class="text-xs text-blue-600 font-bold hover:underline flex-shrink-0">Copy</button>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  function kpiCard(label, value, icon, gradient, sub) {
    return `
      <div class="bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-semibold opacity-80">${label}</span>
          <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <i class="fas ${icon} text-sm"></i>
          </div>
        </div>
        <div class="text-2xl font-extrabold">${value}</div>
        <div class="text-xs opacity-70 mt-1">${sub}</div>
      </div>`;
  }

  function quickAction(icon, label, onclick, color) {
    const colors = {
      blue:    'bg-blue-50 text-blue-700 hover:bg-blue-100',
      violet:  'bg-violet-50 text-violet-700 hover:bg-violet-100',
      emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      slate:   'bg-slate-100 text-slate-700 hover:bg-slate-200',
    };
    return `<button onclick="${onclick}"
      class="flex flex-col items-center gap-2 p-4 rounded-xl ${colors[color]||colors.slate} transition-colors text-center cursor-pointer">
      <i class="fas ${icon} text-lg"></i>
      <span class="text-xs font-semibold leading-snug">${label}</span>
    </button>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  PRODUCTS
  // ══════════════════════════════════════════════════════════════
  function renderProducts(c) {
    c.innerHTML = `
      <div class="p-6">

        <!-- Toolbar -->
        <div class="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <h2 class="font-bold text-slate-900">
              Products <span class="text-slate-400 font-normal text-sm">(${products.length})</span>
            </h2>
            <select id="filter-cat" onchange="shopTab('products')" class="field text-xs !py-1.5 !w-auto">
              <option value="">All Categories</option>
              ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <select id="filter-type" onchange="shopTab('products')" class="field text-xs !py-1.5 !w-auto">
              <option value="">All Types</option>
              <option value="physical">📦 Physical</option>
              <option value="digital">💾 Digital</option>
              <option value="subscription">🔄 Subscription</option>
            </select>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="shopShowModal('bulk-upload')" class="btn-secondary text-xs gap-1">
              <i class="fas fa-file-csv text-xs"></i>Bulk Upload
            </button>
            <button onclick="shopShowModal('category')" class="btn-secondary text-xs gap-1">
              <i class="fas fa-folder-plus text-xs"></i>Category
            </button>
            <button onclick="shopShowModal('product')" class="btn-primary text-xs gap-1">
              <i class="fas fa-plus text-xs"></i>Add Product
            </button>
          </div>
        </div>

        <!-- Categories drag-drop row -->
        ${categories.length ? `
        <div class="mb-5 bg-white border border-slate-200 rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
              <i class="fas fa-folder text-blue-400"></i>Categories
              <span class="text-slate-400 font-normal normal-case">(drag to reorder)</span>
            </h3>
          </div>
          <div class="flex flex-wrap gap-2" id="cat-chips">
            ${categories.map(cat => `
              <div class="flex items-center gap-2 px-3 py-1.5 rounded-full border-2
                ${String(cat.active)==='true' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50 opacity-60'}
                cursor-grab text-sm font-semibold text-slate-700 select-none"
                draggable="true"
                data-cat-id="${cat.id}"
                ondragstart="shopCatReorder('start',event,'${cat.id}')"
                ondragover="shopCatReorder('over',event)"
                ondrop="shopCatReorder('drop',event,'${cat.id}')"
                ondragend="shopCatReorder('end',event)">
                <i class="fas fa-grip-dots-vertical text-slate-300 text-xs"></i>
                ${cat.name}
                <button onclick="shopShowModal('category','${cat.id}')"
                  class="ml-1 text-slate-400 hover:text-blue-600 text-xs transition-colors">
                  <i class="fas fa-pen"></i>
                </button>
                <button onclick="shopDelete('category','${cat.id}')"
                  class="text-slate-300 hover:text-red-500 text-xs transition-colors">
                  <i class="fas fa-times"></i>
                </button>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Drag hint -->
        <p class="text-xs text-slate-400 mb-3 flex items-center gap-1.5">
          <i class="fas fa-grip-vertical"></i>Drag product cards to reorder
        </p>

        <!-- Product grid -->
        <div id="product-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${(() => {
            const catFilter  = document.getElementById?.('filter-cat')?.value  || '';
            const typeFilter = document.getElementById?.('filter-type')?.value || '';
            return products
              .filter(p => (!catFilter  || p.category_id === catFilter))
              .filter(p => (!typeFilter || (p.product_type || 'physical') === typeFilter))
              .map(p => renderProductCard(p)).join('');
          })()}
        </div>

        ${!products.length ? `
          <div class="text-center py-20">
            <i class="fas fa-box-open text-4xl text-slate-300 mb-3"></i>
            <p class="text-slate-500 font-medium">No products yet</p>
            <div class="flex items-center justify-center gap-3 mt-4">
              <button onclick="shopShowModal('bulk-upload')" class="btn-secondary text-sm">
                <i class="fas fa-file-csv mr-1.5"></i>Bulk Upload CSV
              </button>
              <button onclick="shopShowModal('product')" class="btn-primary text-sm">
                Add First Product
              </button>
            </div>
          </div>` : ''}
      </div>
    `;
  }

  function renderProductCard(p) {
    const cat      = categories.find(c => c.id === p.category_id);
    const isActive = String(p.active) === 'true';
    const hasDisc  = p.compare_price && parseFloat(p.compare_price) > parseFloat(p.price);
    const discPct  = hasDisc ? Math.round((1 - parseFloat(p.price)/parseFloat(p.compare_price))*100) : 0;
    const lowStock = String(p.track_inventory) === 'true' && parseInt(p.stock||0) <= parseInt(p.low_stock_alert||5);
    const ptype    = p.product_type || 'physical';

    const typeConfig = {
      physical:     { icon: 'fa-box',           label: 'Physical',     cls: 'bg-slate-100 text-slate-600'   },
      digital:      { icon: 'fa-download',      label: 'Digital',      cls: 'bg-violet-100 text-violet-700' },
      subscription: { icon: 'fa-rotate',        label: 'Subscription', cls: 'bg-blue-100 text-blue-700'     },
    };
    const tc = typeConfig[ptype] || typeConfig.physical;

    const priceLabel = ptype === 'subscription'
      ? fmt(p.price, p.currency) + '<span style="font-size:.65rem;font-weight:600;opacity:.7">/' + (p.billing_interval || 'mo') + '</span>'
      : fmt(p.price, p.currency);
    return `
      <div class="product-card bg-white border-2 ${isActive ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}
                  rounded-2xl overflow-hidden cursor-grab hover:shadow-md transition-all"
           draggable="true" data-id="${p.id}"
           ondragstart="shopReorder('start',event,'${p.id}')"
           ondragover="shopReorder('over',event)"
           ondrop="shopReorder('drop',event,'${p.id}')"
           ondragend="shopReorder('end',event)">

        <!-- Image -->
        <div class="h-36 bg-slate-100 overflow-hidden relative">
          ${p.image_url
            ? `<img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center text-slate-300">
                 <i class="fas fa-image text-4xl"></i></div>`}

          <!-- Top badges -->
          <div class="absolute top-2 left-2 flex flex-col gap-1">
            ${discPct > 0 ? `<span class="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-md">-${discPct}%</span>` : ''}
            ${lowStock   ? `<span class="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><i class="fas fa-fire" style="font-size:8px"></i> Low</span>` : ''}
          </div>

          <!-- Type badge bottom-left -->
          <div class="absolute bottom-2 left-2">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${tc.cls} backdrop-blur-sm">
              <i class="fas ${tc.icon}" style="font-size:8px"></i> ${tc.label}
            </span>
          </div>

          <!-- Active toggle -->
          <div class="absolute top-2 right-2">
            <button onclick="event.stopPropagation();shopToggle('${p.id}')"
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-sm transition-colors
                     ${isActive ? 'bg-green-500 text-white hover:bg-red-500' : 'bg-slate-400 text-white hover:bg-green-500'}"
              title="${isActive ? 'Deactivate' : 'Activate'}">
              <i class="fas ${isActive ? 'fa-eye' : 'fa-eye-slash'}"></i>
            </button>
          </div>
        </div>

        <!-- Info -->
        <div class="p-3">
          <div class="flex items-start justify-between gap-1 mb-1">
            <h4 class="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 flex-1">${p.name}</h4>
          </div>
          ${cat ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">${cat.name}</span>` : ''}
          <div class="flex items-center justify-between mt-2">
            <div>
              <span class="text-base font-extrabold text-slate-900">${priceLabel}</span>
              ${hasDisc ? `<span class="text-xs text-slate-400 line-through ml-1">${fmt(p.compare_price, p.currency)}</span>` : ''}
            </div>
            ${ptype === 'physical' && String(p.track_inventory) === 'true'
              ? `<span class="text-xs ${lowStock ? 'text-red-500 font-bold' : 'text-slate-400'}">${p.stock} left</span>`
              : ptype === 'digital'
                ? `<span class="text-xs text-violet-500 font-semibold flex items-center gap-0.5"><i class="fas fa-bolt" style="font-size:9px"></i>Instant</span>`
                : ptype === 'subscription'
                  ? `<span class="text-xs text-blue-500 font-semibold flex items-center gap-0.5"><i class="fas fa-rotate" style="font-size:9px"></i>Recurring</span>`
                  : ''}
          </div>
          <div class="flex gap-1.5 mt-3">
            <button onclick="shopShowModal('product','${p.id}')" class="flex-1 btn-secondary text-xs !py-1.5">Edit</button>
            <button onclick="shopDelete('product','${p.id}')"
              class="w-8 h-7 flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 rounded-lg text-xs transition-colors">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>`;
  }

  // ── Drag & drop — products ─────────────────────────────────────
  function handleReorder(type, event, id) {
    if (type === 'start') {
      dragSrcId = id;
      event.currentTarget.classList.add('opacity-40');
      event.dataTransfer.effectAllowed = 'move';
    }
    if (type === 'over')  { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
    if (type === 'drop')  {
      event.preventDefault();
      if (!dragSrcId || dragSrcId === id) return;
      const src  = products.find(p => p.id === dragSrcId);
      const dest = products.find(p => p.id === id);
      if (!src || !dest) return;
      [src.position, dest.position] = [dest.position, src.position];
      const order = products.map(p => ({ id: p.id, position: p.position }));
      api('products/reorder', { order: JSON.stringify(order) })
        .then(() => WorkVolt.toast('Order saved', 'success'));
      products.sort((a, b) => (parseInt(a.position)||0) - (parseInt(b.position)||0));
      renderProducts(document.getElementById('shop-content'));
    }
    if (type === 'end') {
      document.querySelectorAll('.product-card').forEach(el => el.classList.remove('opacity-40'));
      dragSrcId = null;
    }
  }

  // ── Drag & drop — categories ───────────────────────────────────
  function handleCatReorder(type, event, id) {
    if (type === 'start') {
      catDragSrcId = id;
      event.currentTarget.style.opacity = '.4';
      event.dataTransfer.effectAllowed = 'move';
    }
    if (type === 'over')  { event.preventDefault(); }
    if (type === 'drop')  {
      event.preventDefault();
      if (!catDragSrcId || catDragSrcId === id) return;
      const src  = categories.find(c => c.id === catDragSrcId);
      const dest = categories.find(c => c.id === id);
      if (!src || !dest) return;
      [src.position, dest.position] = [dest.position, src.position];
      categories.sort((a, b) => (parseInt(a.position)||0) - (parseInt(b.position)||0));
      // Save each updated position
      Promise.all(categories.map(cat =>
        api('categories/update', { id: cat.id, position: cat.position })
      )).then(() => WorkVolt.toast('Category order saved', 'success'));
      renderProducts(document.getElementById('shop-content'));
    }
    if (type === 'end') {
      event.currentTarget.style.opacity = '1';
      catDragSrcId = null;
    }
  }

  // ── Bulk Upload ────────────────────────────────────────────────
  async function handleBulkUpload() {
    if (!bulkFile) { WorkVolt.toast('Please choose a CSV file first', 'error'); return; }
    const btn = document.getElementById('bulk-upload-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1"></i>Uploading…'; }

    try {
      const text = await bulkFile.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one product');

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,'').toLowerCase());
      const nameIdx  = headers.indexOf('name');
      const priceIdx = headers.indexOf('price');
      if (nameIdx === -1 || priceIdx === -1) throw new Error('CSV must have "name" and "price" columns');

      let created = 0, errors = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols   = lines[i].split(',').map(c => c.trim().replace(/"/g,''));
        const params = {};
        headers.forEach((h, j) => { if (cols[j]) params[h] = cols[j]; });
        if (!params.name || !params.price) { errors++; continue; }
        const r = await api('products/create', params);
        if (r.created) created++; else errors++;
      }

      WorkVolt.toast(`${created} products imported${errors ? ', ' + errors + ' skipped' : ''}`, created > 0 ? 'success' : 'error');
      closeModal();
      await loadData();
      renderProducts(document.getElementById('shop-content'));
    } catch(e) {
      WorkVolt.toast('Import failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload mr-1"></i>Import'; }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  ORDERS
  // ══════════════════════════════════════════════════════════════
  function renderOrders(c) {
    const statuses = ['All','Pending','Processing','Shipped','Delivered','Cancelled'];
    c.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 class="font-bold text-slate-900">Orders <span class="text-slate-400 font-normal text-sm">(${orders.length})</span></h2>
          <div class="flex items-center gap-2 overflow-x-auto thin-scroll">
            ${statuses.map(s => `
              <button onclick="shopFilterOrders('${s}')" id="ofilter-${s}"
                class="px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all
                       ${s==='All' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'}">
                ${s}
              </button>`).join('')}
          </div>
        </div>
        <div class="space-y-3" id="orders-list">
          ${renderOrdersList(orders)}
        </div>
        ${!orders.length ? `
          <div class="text-center py-20">
            <i class="fas fa-receipt text-4xl text-slate-300 mb-3"></i>
            <p class="text-slate-500 font-medium">No orders yet</p>
          </div>` : ''}
      </div>
    `;
  }

  function filterOrders(status) {
    document.querySelectorAll('[id^="ofilter-"]').forEach(b => {
      const active = b.id === 'ofilter-' + status;
      b.className = `px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all
        ${active ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'}`;
    });
    const filtered = status === 'All' ? orders : orders.filter(o => o.fulfillment_status === status);
    document.getElementById('orders-list').innerHTML = renderOrdersList(filtered);
  }

  function renderOrdersList(list) {
    if (!list.length) return `<p class="text-center text-slate-400 py-8">No orders match this filter</p>`;
    return list.map(o => `
      <div class="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
           onclick="shopViewOrder('${o.id}')">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fas fa-receipt text-blue-500 text-sm"></i>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-900 text-sm">${o.order_number || o.id.slice(0,8)}</span>
                ${statusBadge(o.fulfillment_status)}
                ${statusBadge(o.payment_status)}
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${o.customer_name} · ${o.customer_email || ''}</p>
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="font-extrabold text-slate-900">${fmt(o.total, o.currency)}</div>
            <div class="text-xs text-slate-400">${fmtDate(o.created_at)}</div>
          </div>
        </div>
      </div>`).join('');
  }

  function showOrderDetail(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const fStatuses = ['Pending','Processing','Shipped','Delivered','Cancelled'];
    const pStatuses = ['Pending','Pending Payment','Paid','Refunded'];
    document.getElementById('shop-modal-inner').innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">Order ${o.order_number}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-5 text-sm">
          <div>
            <p class="text-xs text-slate-500 mb-1">Customer</p>
            <p class="font-semibold">${o.customer_name}</p>
            <p class="text-slate-500">${o.customer_email || ''}</p>
            <p class="text-slate-500">${o.customer_phone || ''}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 mb-1">Order Info</p>
            <p class="font-semibold">${fmtDate(o.created_at)}</p>
            <p class="text-slate-500">via ${o.source || 'online'}</p>
            <p class="text-slate-500">${o.payment_method || ''}</p>
          </div>
          ${o.shipping_address ? `
          <div class="col-span-2">
            <p class="text-xs text-slate-500 mb-1">Shipping Address</p>
            <p class="text-slate-700">${o.shipping_address}</p>
          </div>` : ''}
        </div>

        ${o.items?.length ? `
        <div class="bg-slate-50 rounded-xl p-3 mb-4">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items</p>
          ${o.items.map(i => `
            <div class="flex items-center justify-between text-sm py-1.5 border-b border-slate-200 last:border-0">
              <span class="text-slate-700">${i.product_name} × ${i.qty}</span>
              <span class="font-semibold">${fmt(i.total_price, o.currency)}</span>
            </div>`).join('')}
        </div>` : ''}

        <div class="space-y-1 text-sm mb-5">
          <div class="flex justify-between text-slate-600"><span>Subtotal</span><span>${fmt(o.subtotal, o.currency)}</span></div>
          ${parseFloat(o.discount)>0 ? `<div class="flex justify-between text-green-600"><span>Discount${o.discount_code ? ' ('+o.discount_code+')' : ''}</span><span>-${fmt(o.discount, o.currency)}</span></div>` : ''}
          ${parseFloat(o.tax)>0 ? `<div class="flex justify-between text-slate-600"><span>Tax</span><span>${fmt(o.tax, o.currency)}</span></div>` : ''}
          <div class="flex justify-between font-extrabold text-slate-900 pt-2 border-t border-slate-200 text-base">
            <span>Total</span><span>${fmt(o.total, o.currency)}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Fulfillment</label>
            <select id="f-status" class="field text-sm">
              ${fStatuses.map(s => `<option value="${s}" ${o.fulfillment_status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Payment</label>
            <select id="p-status" class="field text-sm">
              ${pStatuses.map(s => `<option value="${s}" ${o.payment_status===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <button onclick="shopOrderStatus('${o.id}')" class="btn-primary w-full">Save Status</button>
      </div>
    `;
    document.getElementById('shop-modal').classList.remove('hidden');
  }

  // ══════════════════════════════════════════════════════════════
  //  CUSTOMERS
  // ══════════════════════════════════════════════════════════════
  function renderCustomers(c) {
    c.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 class="font-bold text-slate-900">Customers <span class="text-slate-400 font-normal text-sm">(${customers.length})</span></h2>
          <div class="relative">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" placeholder="Search customers…" oninput="shopSearchCustomers(this.value)"
              class="field pl-8 text-sm !py-2 w-52">
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Orders</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Spent</th>
              </tr>
            </thead>
            <tbody id="customers-body">
              ${renderCustomerRows(customers)}
            </tbody>
          </table>
          ${!customers.length ? `<div class="text-center py-16 text-slate-400">
            <i class="fas fa-users text-3xl mb-2"></i><p>No customers yet</p></div>` : ''}
        </div>
      </div>
    `;
  }

  async function searchCustomers(q) {
    const r = await api('customers/list', { search: q });
    document.getElementById('customers-body').innerHTML = renderCustomerRows(r.rows || []);
  }

  function renderCustomerRows(list) {
    return list.map(cu => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              ${(cu.name||'?')[0].toUpperCase()}
            </div>
            <span class="font-semibold text-slate-900">${cu.name || '—'}</span>
          </div>
        </td>
        <td class="px-4 py-3 text-slate-500 hidden md:table-cell">${cu.email}</td>
        <td class="px-4 py-3 text-right text-slate-700 font-medium">${cu.total_orders || 0}</td>
        <td class="px-4 py-3 text-right font-extrabold text-slate-900">${fmt(cu.total_spent)}</td>
      </tr>`).join('');
  }

  // ══════════════════════════════════════════════════════════════
  //  DISCOUNTS
  // ══════════════════════════════════════════════════════════════
  function renderDiscounts(c) {
    c.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900">Discount Codes</h2>
          <button onclick="shopShowModal('discount')" class="btn-primary text-xs gap-1">
            <i class="fas fa-plus text-xs"></i>New Code
          </button>
        </div>
        <div class="space-y-3">
          ${!discounts.length
            ? `<div class="text-center py-16 text-slate-400">
                <i class="fas fa-tag text-3xl mb-2"></i><p>No discount codes yet</p></div>`
            : discounts.map(d => `
              <div class="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-tag text-amber-500"></i>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-slate-900 font-mono text-sm">${d.code}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full font-semibold
                        ${String(d.active)==='true' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
                        ${String(d.active)==='true' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">
                      ${d.type === 'percent' ? d.value + '% off' : fmt(d.value) + ' off'}
                      ${d.min_order ? '· Min ' + fmt(d.min_order) : ''}
                      · Used ${d.uses || 0}${d.max_uses ? '/'+d.max_uses : ''} times
                      ${d.expires_at ? '· Expires ' + fmtDate(d.expires_at) : ''}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button onclick="shopShowModal('discount','${d.id}')" class="btn-secondary text-xs !py-1.5">Edit</button>
                  <button onclick="shopDelete('discount','${d.id}')"
                    class="w-8 h-7 flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 rounded-lg transition-colors">
                    <i class="fas fa-trash text-xs"></i>
                  </button>
                </div>
              </div>`).join('')}
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  //  POS
  // ══════════════════════════════════════════════════════════════
  function renderPOS() {
    const c = document.getElementById('shop-content');
    if (!c) return;
    const filtered = products.filter(p => {
      if (String(p.active) !== 'true') return false;
      if (!posSearchStr) return true;
      const q = posSearchStr.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q);
    });
    const cartTotal = posCart.reduce((s,i) => s + i.price * i.qty, 0);
    const taxRate   = parseFloat(settings.tax_rate || 0) / 100;
    const taxAmt    = settings.tax_included === 'true' ? 0 : cartTotal * taxRate;
    const grandTotal = cartTotal + taxAmt;

    c.innerHTML = `
      <div class="flex h-full" style="min-height:600px">

        <!-- Products -->
        <div class="flex-1 flex flex-col border-r border-slate-200 overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-white">
            <div class="relative">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="text" placeholder="Search products or scan barcode…"
                value="${posSearchStr}" oninput="shopPosSearch(this.value)"
                class="field pl-9 text-sm" autofocus>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto thin-scroll p-4">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              ${filtered.map(p => {
                const ptype = p.product_type || 'physical';
                const typeIconMap = { physical:'fa-box', digital:'fa-download', subscription:'fa-rotate' };
                const typeBgMap  = { digital:'text-violet-500', subscription:'text-blue-500' };
                const posIcon    = typeIconMap[ptype] || 'fa-box';
                const isOos      = ptype === 'physical' && String(p.track_inventory) === 'true' && parseInt(p.stock||0) <= 0;
                const intervalMap= { week:'/wk', mo:'/mo', year:'/yr' };
                const priceLabel = ptype === 'subscription'
                  ? fmt(p.price, p.currency) + '<span style="font-size:.6rem;opacity:.7">' + (intervalMap[p.billing_interval||'mo']||'/mo') + '</span>'
                  : fmt(p.price, p.currency);
                return `
                <button onclick="shopPosAdd('${p.id}')" ${isOos ? 'disabled' : ''}
                  class="bg-white border border-slate-200 rounded-xl p-3 text-left transition-all group
                    ${isOos ? 'opacity-40 cursor-not-allowed' : 'hover:border-blue-400 hover:shadow-md active:scale-95'}">
                  <div class="w-full h-24 bg-slate-100 rounded-lg mb-2 overflow-hidden relative">
                    ${p.image_url
                      ? `<img src="${p.image_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">`
                      : `<div class="w-full h-full flex items-center justify-center ${typeBgMap[ptype]||'text-slate-300'}">
                           <i class="fas ${posIcon} text-2xl"></i></div>`}
                    ${ptype !== 'physical' ? `
                    <div class="absolute bottom-1 left-1">
                      <span class="text-[9px] font-bold px-1 py-0.5 rounded"
                        style="background:${ptype==='digital'?'rgba(139,92,246,.85)':'rgba(37,99,235,.85)'};color:#fff">
                        ${ptype === 'digital' ? '💾' : '🔄'}
                      </span>
                    </div>` : ''}
                  </div>
                  <p class="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">${p.name}</p>
                  <p class="text-sm font-extrabold text-blue-600 mt-1">${priceLabel}</p>
                  ${ptype === 'physical' && String(p.track_inventory) === 'true'
                    ? `<p class="text-[10px] ${parseInt(p.stock)<=0?'text-red-500 font-bold':'text-slate-400'}">${parseInt(p.stock)<=0 ? 'Out of stock' : p.stock + ' left'}</p>`
                    : ptype === 'digital'
                      ? `<p class="text-[10px] text-violet-500 font-semibold">Instant delivery</p>`
                      : ptype === 'subscription'
                        ? `<p class="text-[10px] text-blue-500 font-semibold">Recurring</p>`
                        : ''}
                </button>`;
              }).join('')}
              ${!filtered.length ? `<div class="col-span-4 text-center py-12 text-slate-400">
                <i class="fas fa-search text-3xl mb-2"></i><p>No products found</p></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Cart -->
        <div class="w-80 flex flex-col bg-white">
          <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-bold text-slate-900">
              Cart <span class="text-slate-400 text-sm font-normal">(${posCart.length})</span>
            </h3>
            ${posCart.length ? `<button onclick="shopPosClear()" class="text-xs text-red-400 hover:text-red-600 font-semibold">Clear</button>` : ''}
          </div>

          <div class="flex-1 overflow-y-auto thin-scroll divide-y divide-slate-100">
            ${!posCart.length
              ? `<div class="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
                   <i class="fas fa-shopping-cart text-4xl"></i>
                   <p class="text-sm">Cart is empty</p>
                 </div>`
              : posCart.map((item, i) => {
                  const ptype = item.product_type || 'physical';
                  const typeTagMap = { digital:'💾', subscription:'🔄' };
                  const tag = typeTagMap[ptype] || '';
                  return `
                <div class="px-4 py-3 flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800 truncate">${tag} ${item.name}</p>
                    <p class="text-xs text-slate-500">${fmt(item.price)}${ptype==='subscription' ? '/'+( item.billing_interval||'mo') : ''}</p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button onclick="shopPosRemove(${i},-1)"
                      class="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 text-xs font-bold flex items-center justify-center">−</button>
                    <span class="w-6 text-center text-sm font-bold">${item.qty}</span>
                    <button onclick="shopPosRemove(${i},1)"
                      class="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 text-xs font-bold flex items-center justify-center">+</button>
                  </div>
                  <span class="text-sm font-extrabold text-slate-900 w-16 text-right">${fmt(item.price * item.qty)}</span>
                </div>`
                }).join('')}
          </div>

          <div class="border-t border-slate-200 p-4 space-y-3">
            ${taxAmt > 0 ? `
            <div class="flex justify-between text-sm text-slate-500">
              <span>${settings.tax_label || 'Tax'} (${settings.tax_rate}%)</span>
              <span>${fmt(taxAmt)}</span>
            </div>` : ''}
            <div class="flex justify-between text-base font-extrabold text-slate-900">
              <span>Total</span><span>${fmt(grandTotal)}</span>
            </div>
            <select id="pos-payment" class="field text-sm">
              <option value="Cash">💵 Cash</option>
              ${settings.interac_enabled === 'true' ? `<option value="Interac">🏦 Interac e-Transfer</option>` : ''}
              ${settings.paypal_enabled  === 'true' ? `<option value="PayPal">🅿 PayPal</option>` : ''}
              ${settings.stripe_enabled  === 'true' ? `<option value="Stripe">💳 Stripe</option>` : ''}
            </select>
            <div class="grid grid-cols-2 gap-2">
              <input id="pos-name"  type="text"  placeholder="Customer name" class="field text-sm col-span-2">
              <input id="pos-email" type="email" placeholder="Email (optional)" class="field text-sm col-span-2">
            </div>
            <button onclick="shopPosCheckout()" ${!posCart.length ? 'disabled' : ''}
              class="btn-primary w-full text-sm ${!posCart.length ? 'opacity-50 cursor-not-allowed' : ''}">
              <i class="fas fa-check-circle mr-1.5"></i>Complete Sale · ${fmt(grandTotal)}
            </button>
          </div>
        </div>

      </div>
    `;
  }

  function posAddItem(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    // Block OOS physical products
    if ((p.product_type || 'physical') === 'physical' &&
        String(p.track_inventory) === 'true' && parseInt(p.stock||0) <= 0) {
      WorkVolt.toast('This item is out of stock', 'error');
      return;
    }
    const existing = posCart.find(i => i.id === id);
    if (existing) existing.qty++;
    else posCart.push({
      id:               p.id,
      name:             p.name,
      price:            parseFloat(p.price),
      qty:              1,
      currency:         p.currency,
      product_type:     p.product_type || 'physical',
      billing_interval: p.billing_interval || 'mo',
    });
    renderPOS();
  }

  function posRemoveItem(idx, delta) {
    posCart[idx].qty += delta;
    if (posCart[idx].qty <= 0) posCart.splice(idx, 1);
    renderPOS();
  }

  function posClear() { posCart = []; renderPOS(); }

  async function posCheckout() {
    if (!posCart.length) return;
    const name   = document.getElementById('pos-name')?.value.trim()  || 'Walk-in Customer';
    const email  = document.getElementById('pos-email')?.value.trim() || '';
    const method = document.getElementById('pos-payment')?.value      || 'Cash';
    const sub    = posCart.reduce((s,i) => s + i.price * i.qty, 0);
    const taxRate = parseFloat(settings.tax_rate || 0) / 100;
    const tax    = settings.tax_included === 'true' ? 0 : sub * taxRate;
    const total  = sub + tax;
    const items  = posCart.map(i => ({ product_id: i.id, product_name: i.name, qty: i.qty, unit_price: i.price, total_price: i.price * i.qty }));

    try {
      const r = await api('orders/create', {
        customer_name:     name,
        customer_email:    email,
        subtotal:          sub.toFixed(2),
        tax:               tax.toFixed(2),
        total:             total.toFixed(2),
        currency:          'CAD',
        payment_method:    method,
        payment_status:    method === 'Cash' ? 'Paid' : 'Pending',
        fulfillment_status:'Delivered',
        source:            'pos',
        items:             JSON.stringify(items),
      });
      if (r.error) throw new Error(r.error);
      WorkVolt.toast(`Sale complete! Order ${r.order_number}`, 'success');
      posCart = [];
      await loadData();
      renderPOS();
    } catch(e) {
      WorkVolt.toast(e.message, 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  LAYOUT TAB
  // ══════════════════════════════════════════════════════════════

  // Section metadata
  const SECTION_META = {
    hero:         { label: 'Hero Banner',       icon: 'fa-image',        color: 'from-indigo-500 to-purple-600', fixed: false },
    featured:     { label: 'Featured Products', icon: 'fa-star',         color: 'from-amber-400 to-orange-500',  fixed: false },
    trending:     { label: 'Trending Now',      icon: 'fa-fire',         color: 'from-red-400 to-rose-500',      fixed: false },
    all_products: { label: 'All Products Grid', icon: 'fa-th',           color: 'from-emerald-500 to-teal-600',  fixed: true  },
  };

  // Parse layout state from settings
  function getLayoutOrder() {
    try { return settings.layout_order ? JSON.parse(settings.layout_order) : ['hero','featured','trending','all_products']; }
    catch(e) { return ['hero','featured','trending','all_products']; }
  }
  function getBanners() {
    try { return settings.banners ? JSON.parse(settings.banners) : []; }
    catch(e) { return []; }
  }

  // Save layout + banners back to settings
  async function saveLayout(order, banners) {
    const r = await api('settings/save', {
      layout_order: JSON.stringify(order),
      banners:      JSON.stringify(banners),
    });
    if (r.error) throw new Error(r.error);
    settings.layout_order = JSON.stringify(order);
    settings.banners      = JSON.stringify(banners);
  }

  function renderLayout(c) {
    let order   = getLayoutOrder();
    let banners = getBanners();
    let layoutDragSrc = null;

    c.innerHTML = `
      <div class="p-6 space-y-6">

        <!-- Header -->
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="font-bold text-slate-900 text-lg flex items-center gap-2">
              <i class="fas fa-layer-group text-blue-500"></i> Layout Builder
            </h2>
            <p class="text-sm text-slate-500 mt-0.5">Drag sections to reorder. Add banners anywhere in the layout.</p>
          </div>
          <div class="flex items-center gap-2">
            <a href="${STORE_URL}" target="_blank" class="btn-secondary text-xs gap-1.5">
              <i class="fas fa-eye text-xs"></i>Preview Store
            </a>
            <button onclick="shopSaveLayout()" class="btn-primary text-xs gap-1.5">
              <i class="fas fa-save text-xs"></i>Save Layout
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <!-- LEFT: Section order -->
          <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <i class="fas fa-sort text-blue-400 text-xs"></i>Section Order
              </h3>
              <span class="text-xs text-slate-400">Drag to reorder</span>
            </div>
            <div class="p-4" id="layout-sections-list">
              ${renderSectionList(order, banners)}
            </div>
            <div class="px-4 pb-4">
              <button onclick="shopAddBannerSlot()"
                class="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-400
                       hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                <i class="fas fa-plus text-xs"></i> Add Banner Slot
              </button>
            </div>
          </div>

          <!-- RIGHT: Banners manager -->
          <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <i class="fas fa-rectangle-ad text-blue-400 text-xs"></i>Banners
                <span class="text-slate-400 font-normal">(${banners.length})</span>
              </h3>
              <button onclick="shopShowModal('banner')" class="btn-primary text-xs gap-1">
                <i class="fas fa-plus text-xs"></i>New Banner
              </button>
            </div>
            <div class="p-4 space-y-3" id="banners-list">
              ${renderBannerList(banners)}
            </div>
          </div>
        </div>

        <!-- Layout preview map -->
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
              <i class="fas fa-mobile-screen text-blue-400 text-xs"></i>Layout Preview
            </h3>
          </div>
          <div class="p-5 flex items-start gap-4 overflow-x-auto">
            <div class="flex-shrink-0 w-48 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
              <div class="bg-slate-800 h-8 flex items-center px-3 gap-1.5">
                <div class="w-2 h-2 rounded-full bg-red-400"></div>
                <div class="w-2 h-2 rounded-full bg-amber-400"></div>
                <div class="w-2 h-2 rounded-full bg-green-400"></div>
              </div>
              <div class="p-2 space-y-1.5">
                <!-- Header bar -->
                <div class="bg-white rounded h-5 flex items-center px-1.5 gap-1">
                  <div class="w-3 h-1.5 bg-blue-400 rounded-sm"></div>
                  <div class="flex-1 bg-slate-200 rounded-sm h-1.5"></div>
                  <div class="w-5 h-1.5 bg-blue-500 rounded-full"></div>
                </div>
                ${order.map(sid => {
                  const isBanner = sid.startsWith('banner_');
                  const b = isBanner ? banners.find(b => b.id === sid) : null;
                  const m = !isBanner ? SECTION_META[sid] : null;
                  if (isBanner && !b) return '';
                  const isActive = isBanner ? (String(b.active) === 'true') : true;
                  return `<div class="rounded text-[8px] font-bold flex items-center gap-1 px-1.5 py-1
                    ${isActive
                      ? (isBanner ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')
                      : 'bg-slate-200 text-slate-400'}">
                    <i class="fas ${isBanner ? 'fa-rectangle-ad' : (m?.icon || 'fa-square')}"></i>
                    ${isBanner ? (b.title || 'Banner').slice(0,16) : (m?.label || sid)}
                  </div>`;
                }).join('')}
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-500 mb-3">Current section order:</p>
              <ol class="space-y-1.5">
                ${order.map((sid, i) => {
                  const isBanner = sid.startsWith('banner_');
                  const b = isBanner ? banners.find(b => b.id === sid) : null;
                  const m = !isBanner ? SECTION_META[sid] : null;
                  return `<li class="flex items-center gap-2.5 text-sm">
                    <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">${i+1}</span>
                    <i class="fas ${isBanner ? 'fa-rectangle-ad text-amber-500' : (m?.icon + ' text-blue-500' || '')} text-xs"></i>
                    <span class="text-slate-700 font-medium">${isBanner ? (b ? (b.title || 'Banner') : 'Deleted Banner') : (m?.label || sid)}</span>
                    ${isBanner && b && String(b.active) !== 'true' ? '<span class="text-xs text-slate-400">(inactive)</span>' : ''}
                  </li>`;
                }).join('')}
              </ol>
            </div>
          </div>
        </div>

      </div>
    `;

    // Expose layout handlers
    window.shopSaveLayout = async function() {
      try {
        const currentOrder   = getCurrentSectionOrder();
        const currentBanners = getBanners();
        await saveLayout(currentOrder, currentBanners);
        WorkVolt.toast('Layout saved! Storefront will update within 60s.', 'success');
        await loadSettings();
        renderLayout(document.getElementById('shop-content'));
      } catch(e) { WorkVolt.toast(e.message, 'error'); }
    };

    window.shopAddBannerSlot = function() {
      const currentBanners = getBanners();
      const newId = 'banner_' + Date.now();
      // Add a placeholder to both order and banners
      const currentOrder = getCurrentSectionOrder();
      // Insert before all_products
      const apIdx = currentOrder.indexOf('all_products');
      currentOrder.splice(apIdx > -1 ? apIdx : currentOrder.length, 0, newId);
      currentBanners.push({
        id:        newId,
        title:     'New Banner',
        subtitle:  '',
        eyebrow:   '',
        style:     'solid',
        bg_color:  'linear-gradient(135deg,#1e3a5f,#1d4ed8)',
        text_color:'#ffffff',
        cta_text:  'Shop Now',
        cta_bg:    '#ffffff',
        cta_color: '#1d4ed8',
        cta_link:  '',
        image_url: '',
        overlay_color: 'rgba(0,0,0,0.45)',
        active:    'true',
        start_date:'',
        end_date:  '',
      });
      settings.layout_order = JSON.stringify(currentOrder);
      settings.banners      = JSON.stringify(currentBanners);
      renderLayout(document.getElementById('shop-content'));
    };

    window.shopDeleteBannerSlot = async function(bid) {
      if (!confirm('Remove this banner and its slot from the layout?')) return;
      let currentOrder   = getCurrentSectionOrder().filter(s => s !== bid);
      let currentBanners = getBanners().filter(b => b.id !== bid);
      try {
        await saveLayout(currentOrder, currentBanners);
        WorkVolt.toast('Banner removed', 'success');
        await loadSettings();
        renderLayout(document.getElementById('shop-content'));
      } catch(e) { WorkVolt.toast(e.message, 'error'); }
    };

    window.shopToggleSection = async function(sid) {
      // For sections it means toggle hidden state in order
      let currentOrder = getCurrentSectionOrder();
      if (currentOrder.includes(sid)) {
        currentOrder = currentOrder.filter(s => s !== sid);
      } else {
        // Re-add before all_products
        const apIdx = currentOrder.indexOf('all_products');
        currentOrder.splice(apIdx > -1 ? apIdx : currentOrder.length, 0, sid);
      }
      settings.layout_order = JSON.stringify(currentOrder);
      renderLayout(document.getElementById('shop-content'));
    };

    window.shopToggleBanner = async function(bid) {
      let currentBanners = getBanners();
      const b = currentBanners.find(x => x.id === bid);
      if (!b) return;
      b.active = String(b.active) === 'true' ? 'false' : 'true';
      settings.banners = JSON.stringify(currentBanners);
      renderLayout(document.getElementById('shop-content'));
    };

    // Section drag-and-drop
    window.shopLayoutDrag = function(type, event, sid) {
      if (type === 'start') {
        layoutDragSrc = sid;
        event.dataTransfer.effectAllowed = 'move';
        event.currentTarget.style.opacity = '.4';
      }
      if (type === 'over')  { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
      if (type === 'drop')  {
        event.preventDefault();
        if (!layoutDragSrc || layoutDragSrc === sid) return;
        let currentOrder = getCurrentSectionOrder();
        const srcIdx  = currentOrder.indexOf(layoutDragSrc);
        const dstIdx  = currentOrder.indexOf(sid);
        if (srcIdx === -1 || dstIdx === -1) return;
        currentOrder.splice(srcIdx, 1);
        currentOrder.splice(dstIdx, 0, layoutDragSrc);
        settings.layout_order = JSON.stringify(currentOrder);
        renderLayout(document.getElementById('shop-content'));
      }
      if (type === 'end') {
        event.currentTarget.style.opacity = '1';
        layoutDragSrc = null;
      }
    };
  }

  function getCurrentSectionOrder() {
    try { return settings.layout_order ? JSON.parse(settings.layout_order) : ['hero','featured','trending','all_products']; }
    catch(e) { return ['hero','featured','trending','all_products']; }
  }

  function renderSectionList(order, banners) {
    const bannerMap = {};
    banners.forEach(b => { bannerMap[b.id] = b; });

    const allSections = ['hero','featured','trending','all_products'];
    const hiddenBuiltIn = allSections.filter(s => !order.includes(s));

    let html = order.map(sid => {
      const isBanner = sid.startsWith('banner_');
      const b = isBanner ? bannerMap[sid] : null;
      const m = !isBanner ? SECTION_META[sid] : null;
      const isActive = isBanner ? (String(b?.active) === 'true') : true;
      const label = isBanner ? (b?.title || 'Banner') : (m?.label || sid);
      const icon  = isBanner ? 'fa-rectangle-ad' : (m?.icon || 'fa-square');
      const grad  = isBanner ? 'from-amber-400 to-orange-500' : (m?.color || 'from-slate-400 to-slate-600');
      const isFixed = !isBanner && m?.fixed;

      return `
        <div class="flex items-center gap-3 p-3 border border-slate-200 rounded-xl mb-2 bg-white
             ${isFixed ? '' : 'cursor-grab hover:border-blue-300'} transition-all group"
             ${isFixed ? '' : `draggable="true"
               ondragstart="shopLayoutDrag('start',event,'${sid}')"
               ondragover="shopLayoutDrag('over',event)"
               ondrop="shopLayoutDrag('drop',event,'${sid}')"
               ondragend="shopLayoutDrag('end',event)"`}
             data-section="${sid}">
          ${isFixed
            ? '<i class="fas fa-lock text-slate-300 text-xs flex-shrink-0 w-4"></i>'
            : '<i class="fas fa-grip-vertical text-slate-300 group-hover:text-slate-500 text-sm flex-shrink-0 w-4 transition-colors"></i>'}
          <div class="w-8 h-8 bg-gradient-to-br ${grad} rounded-lg flex items-center justify-center flex-shrink-0">
            <i class="fas ${icon} text-white text-xs"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-slate-800 truncate">${label}</p>
            <p class="text-xs text-slate-400">${isBanner ? 'Banner · ' + (b?.style || 'hero') : (isFixed ? 'Always last' : 'Built-in section')}</p>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${isActive
              ? '<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>'
              : '<span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>'}
            ${isBanner ? `
              <button onclick="shopToggleBanner('${sid}')"
                class="text-xs px-2 py-1 rounded-lg ${isActive ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-green-50 hover:text-green-600'} transition-colors font-semibold">
                ${isActive ? 'On' : 'Off'}
              </button>
              <button onclick="shopShowModal('banner','${sid}')"
                class="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors font-semibold">
                Edit
              </button>
              <button onclick="shopDeleteBannerSlot('${sid}')"
                class="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors text-xs">
                <i class="fas fa-trash"></i>
              </button>` : `
              ${!isFixed ? `<button onclick="shopToggleSection('${sid}')"
                class="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600 transition-colors font-semibold">
                Hide
              </button>` : ''}`}
          </div>
        </div>`;
    }).join('');

    // Show hidden built-in sections that can be re-added
    if (hiddenBuiltIn.length) {
      html += '<div class="mt-3 pt-3 border-t border-slate-100">';
      html += '<p class="text-xs text-slate-400 mb-2 font-medium">Hidden sections:</p>';
      html += hiddenBuiltIn.map(sid => {
        const m = SECTION_META[sid];
        return `<div class="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-dashed border-slate-200 mb-1.5 opacity-60">
          <i class="fas ${m?.icon} text-slate-400 text-xs w-4"></i>
          <span class="flex-1 text-xs text-slate-500 font-medium">${m?.label}</span>
          <button onclick="shopToggleSection('${sid}')"
            class="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors font-semibold">
            Show
          </button>
        </div>`;
      }).join('');
      html += '</div>';
    }

    return html;
  }

  function renderBannerList(banners) {
    if (!banners.length) {
      return `<div class="text-center py-10 text-slate-400">
        <i class="fas fa-rectangle-ad text-3xl mb-2 opacity-40"></i>
        <p class="text-sm">No banners yet</p>
        <p class="text-xs mt-1">Create a banner then drag its slot into position</p>
      </div>`;
    }
    return banners.map(b => {
      const isActive = String(b.active) === 'true';
      const styleLabel = { hero:'Image+Text', solid:'Solid Color', strip:'Strip' }[b.style] || b.style;
      return `
        <div class="border border-slate-200 rounded-xl overflow-hidden">
          <!-- Mini preview -->
          <div class="h-16 relative flex items-center px-4 overflow-hidden"
               style="background:${b.style === 'hero' && b.image_url ? 'url(' + b.image_url + ') center/cover' : (b.bg_color || 'linear-gradient(135deg,#1e3a5f,#1d4ed8)')}">
            ${b.style === 'hero' && b.image_url ? '<div style="position:absolute;inset:0;background:' + (b.overlay_color || 'rgba(0,0,0,.45)') + '"></div>' : ''}
            <div class="relative z-1">
              ${b.eyebrow ? '<p style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:' + (b.text_color||'#fff') + ';opacity:.8">' + b.eyebrow + '</p>' : ''}
              <p style="font-size:.85rem;font-weight:800;color:' + (b.text_color||'#fff') + ';line-height:1.2">' + (b.title || 'Banner') + '</p>
            </div>
          </div>
          <!-- Controls -->
          <div class="px-3 py-2.5 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-green-500' : 'bg-slate-300'}"></span>
                <span class="text-xs font-semibold text-slate-700 truncate">${b.title || 'Untitled'}</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-0.5">${styleLabel}${b.cta_text ? ' · CTA: ' + b.cta_text : ''}${b.end_date ? ' · Ends ' + b.end_date.slice(0,10) : ''}</p>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button onclick="shopToggleBanner('${b.id}')"
                class="text-xs px-2 py-1 rounded-lg font-semibold transition-colors
                  ${isActive ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600' : 'bg-slate-100 text-slate-500 hover:bg-green-50 hover:text-green-600'}">
                ${isActive ? 'Live' : 'Off'}
              </button>
              <button onclick="shopShowModal('banner','${b.id}')"
                class="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors font-semibold">
                Edit
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════
  //  SETTINGS
  // ══════════════════════════════════════════════════════════════
  function renderSettings(c) {
    const s = settings;
    c.innerHTML = `
      <div class="p-6 max-w-3xl space-y-6">

        ${settingsSection('Store Identity', 'fa-store', `
          ${sfld('Store Name', 's-store_name', s.store_name)}
          ${sfld('Tagline', 's-store_tagline', s.store_tagline)}
          ${sfld('Logo URL', 's-logo_url', s.logo_url, 'url', 'https://example.com/logo.png')}
          ${sfld('Store Email', 's-store_email', s.store_email, 'email')}
          ${sfld('Store Phone', 's-store_phone', s.store_phone, 'tel')}
          ${sfld('Footer Text', 's-footer_text', s.footer_text)}
        `)}

        ${settingsSection('Branding & Theme', 'fa-palette', `
          <div class="grid grid-cols-2 gap-4">
            ${colorField('Primary Color', 's-primary_color', s.primary_color || '#2563eb')}
            ${colorField('Accent Color',  's-accent_color',  s.accent_color  || '#f59e0b')}
          </div>
          ${sfld('Background Color', 's-background_color', s.background_color || '#f8fafc')}
          ${sfld('Text Color',       's-text_color',       s.text_color       || '#0f172a')}
        `)}

        ${settingsSection('Currency & Tax', 'fa-dollar-sign', `
          <div class="grid grid-cols-2 gap-4">
            ${checkField('s-currency_cad', 'CAD (Canadian Dollar)', s.currency_cad === 'true')}
            ${checkField('s-currency_usd', 'USD (US Dollar)',       s.currency_usd === 'true')}
          </div>
          ${sfld('Tax Rate (%)',   's-tax_rate',    s.tax_rate || '0', 'number', '0')}
          ${sfld('Tax Label',     's-tax_label',   s.tax_label || 'Tax', 'text', 'HST/GST')}
          ${checkField('s-tax_included', 'Prices include tax', s.tax_included === 'true')}
        `)}

        ${settingsSection('Payment Methods', 'fa-credit-card', `
          <div class="space-y-3">
            <div class="border border-slate-200 rounded-xl p-4 space-y-3">
              ${checkField('s-paypal_enabled', '🅿 PayPal — Redirect checkout', s.paypal_enabled === 'true')}
              ${sfld('PayPal Email', 's-paypal_email', s.paypal_email, 'email', 'you@business.com')}
            </div>
            <div class="border border-slate-200 rounded-xl p-4 space-y-3">
              ${checkField('s-stripe_enabled', '💳 Stripe — Credit / Debit card', s.stripe_enabled === 'true')}
              ${sfld('Stripe Publishable Key', 's-stripe_pub_key', s.stripe_pub_key, 'text', 'pk_live_…')}
            </div>
            <div class="border border-slate-200 rounded-xl p-4 space-y-3">
              ${checkField('s-interac_enabled', '🏦 Interac e-Transfer — Manual', s.interac_enabled === 'true')}
              ${sfld('Interac Email', 's-interac_email', s.interac_email, 'email', 'payments@business.ca')}
            </div>
            <div class="border border-slate-200 rounded-xl p-4">
              ${checkField('s-cash_enabled', '💵 Cash — POS only', s.cash_enabled === 'true')}
            </div>
          </div>
        `)}

        ${settingsSection('Shipping', 'fa-truck', `
          ${checkField('s-shipping_enabled', 'Enable shipping', s.shipping_enabled === 'true')}
          ${sfld('Flat Shipping Rate ($)', 's-shipping_rate', s.shipping_rate || '0', 'number', '9.99')}
          ${sfld('Free Shipping Minimum ($)', 's-free_shipping_min', s.free_shipping_min || '0', 'number', '75')}
        `)}

        ${settingsSection('Store Status', 'fa-power-off', `
          ${checkField('s-maintenance_mode', '🔴 Maintenance mode (hides storefront)', s.maintenance_mode === 'true')}
          <div class="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
            <i class="fas fa-link text-blue-500 text-sm"></i>
            <span class="text-sm text-slate-500 font-mono truncate flex-1">${STORE_URL}</span>
            <a href="${STORE_URL}" target="_blank" class="text-xs text-blue-600 font-bold hover:underline flex-shrink-0">Open</a>
          </div>
        `)}

        <button onclick="shopSave('settings')" class="btn-primary w-full text-sm">
          <i class="fas fa-save mr-1.5"></i>Save All Settings
        </button>

      </div>
    `;
  }

  function settingsSection(title, icon, content) {
    return `
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <i class="fas ${icon} text-blue-500 text-sm"></i>
          <h3 class="font-bold text-slate-800 text-sm">${title}</h3>
        </div>
        <div class="p-5 space-y-4">${content}</div>
      </div>`;
  }

  function sfld(label, id, value, type='text', placeholder='') {
    return `<div>
      <label for="${id}" class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">${label}</label>
      <input id="${id}" type="${type}" value="${value||''}" placeholder="${placeholder}" class="field text-sm">
    </div>`;
  }

  function colorField(label, id, value) {
    return `<div>
      <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">${label}</label>
      <div class="flex items-center gap-2">
        <input id="${id}" type="color" value="${value}"
          class="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5">
        <input type="text" value="${value}"
          oninput="document.getElementById('${id}').value=this.value"
          class="field text-sm flex-1 font-mono">
      </div>
    </div>`;
  }

  function checkField(id, label, checked) {
    return `<label class="flex items-center gap-2.5 cursor-pointer">
      <input id="${id}" type="checkbox" ${checked ? 'checked' : ''} class="w-4 h-4 rounded accent-blue-600">
      <span class="text-sm font-medium text-slate-700">${label}</span>
    </label>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  MODALS
  // ══════════════════════════════════════════════════════════════
  function showModal(type, id) {
    const modal = document.getElementById('shop-modal');
    const inner = document.getElementById('shop-modal-inner');
    if (!modal || !inner) return;

    if (type === 'product')     inner.innerHTML = productForm(id ? products.find(x => x.id === id) : null);
    if (type === 'category')    inner.innerHTML = categoryForm(id ? categories.find(x => x.id === id) : null);
    if (type === 'discount')    inner.innerHTML = discountForm(id ? discounts.find(x => x.id === id) : null);
    if (type === 'bulk-upload') inner.innerHTML = bulkUploadForm();
    if (type === 'banner')      inner.innerHTML = bannerForm(id ? getBanners().find(x => x.id === id) : null, id);

    modal.classList.remove('hidden');
  }

  function closeModal() { document.getElementById('shop-modal')?.classList.add('hidden'); }

  function productForm(p) {
    // GAS returns booleans (true/false) not strings ('true'/'false') — normalise both
    const str  = v => (v === undefined || v === null) ? '' : String(v);
    const bool = v => v === true || v === 'true';
    const ptype = str(p?.product_type) || 'physical';
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">${p ? 'Edit Product' : 'New Product'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>
        <div class="space-y-4">

          <!-- Product Type selector -->
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Product Type</label>
            <div class="grid grid-cols-3 gap-2" id="pf-type-group">
              ${[
                { val:'physical',     icon:'fa-box',      label:'Physical',     desc:'Ships to customer'    },
                { val:'digital',      icon:'fa-download', label:'Digital',      desc:'Instant download'     },
                { val:'subscription', icon:'fa-rotate',   label:'Subscription', desc:'Recurring billing'    },
              ].map(t => `
                <button type="button" onclick="pfSetType('${t.val}')" id="pftype-${t.val}"
                  class="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center
                    ${ptype === t.val
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'}">
                  <i class="fas ${t.icon} text-lg"></i>
                  <span class="text-xs font-bold">${t.label}</span>
                  <span class="text-[10px] opacity-70">${t.desc}</span>
                </button>`).join('')}
            </div>
          </div>
          <input type="hidden" id="pf-product_type" value="${ptype}">

          ${mfld('Product Name *', 'pf-name', str(p?.name))}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                Price * <span id="pf-price-label" class="normal-case font-normal text-slate-400">${ptype === 'subscription' ? '(per billing period)' : ''}</span>
              </label>
              <input id="pf-price" type="number" value="${str(p?.price)}" placeholder="0.00" class="field text-sm">
            </div>
            ${mfld('Compare Price', 'pf-compare_price', str(p?.compare_price), 'number', '0.00')}
          </div>
          <div class="grid grid-cols-2 gap-3">
            ${mfld('Cost', 'pf-cost', str(p?.cost), 'number', '0.00')}
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Currency</label>
              <select id="pf-currency" class="field text-sm">
                <option value="CAD" ${(str(p?.currency)||'CAD')==='CAD'?'selected':''}>CAD</option>
                <option value="USD" ${str(p?.currency)==='USD'?'selected':''}>USD</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Category</label>
            <select id="pf-category_id" class="field text-sm">
              <option value="">— None —</option>
              ${categories.map(c => `<option value="${c.id}" ${str(p?.category_id)===c.id?'selected':''}>${c.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Description</label>
            <textarea id="pf-description" rows="3" class="field text-sm resize-none">${str(p?.description)}</textarea>
          </div>
          ${mfld('Image URL', 'pf-image_url', str(p?.image_url), 'url', 'https://…')}
          <div class="grid grid-cols-2 gap-3">
            ${mfld('SKU', 'pf-sku', str(p?.sku))}
            ${mfld('Barcode', 'pf-barcode', str(p?.barcode))}
          </div>
          ${mfld('Tags (comma separated)', 'pf-tags', str(p?.tags), 'text', 'electronics, sale')}

          <!-- ── PHYSICAL fields ── -->
          <div id="pf-physical-fields" ${ptype !== 'physical' ? 'style="display:none"' : ''}>
            <div class="border border-slate-200 rounded-xl p-4 space-y-3">
              <p class="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                <i class="fas fa-box text-slate-400 text-xs"></i>Physical Product Options
              </p>
              ${mfld('Weight (g)', 'pf-weight', str(p?.weight), 'number', '0')}
              <label class="flex items-center gap-2 cursor-pointer">
                <input id="pf-track_inventory" type="checkbox" ${bool(p?.track_inventory) ? 'checked' : ''}
                  class="w-4 h-4 rounded accent-blue-600" onchange="document.getElementById('inventory-fields').style.display=this.checked?'grid':'none'">
                <span class="text-sm text-slate-700 font-medium">Track inventory</span>
              </label>
              <div class="grid grid-cols-2 gap-3" id="inventory-fields"
                ${bool(p?.track_inventory) ? '' : 'style="display:none"'}>
                ${mfld('Stock Quantity',  'pf-stock',           str(p?.stock),               'number', '0')}
                ${mfld('Low Stock Alert', 'pf-low_stock_alert', str(p?.low_stock_alert)||'5', 'number', '5')}
              </div>
            </div>
          </div>

          <!-- ── DIGITAL fields ── -->
          <div id="pf-digital-fields" ${ptype !== 'digital' ? 'style="display:none"' : ''}>
            <div class="border border-violet-200 bg-violet-50 rounded-xl p-4 space-y-3">
              <p class="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                <i class="fas fa-download text-violet-500 text-xs"></i>Digital Product Options
              </p>
              ${mfld('Download URL *', 'pf-download_url', str(p?.download_url), 'url', 'https://drive.google.com/…')}
              <p class="text-xs text-violet-600">This link is shown to the customer on their order confirmation screen immediately after purchase.</p>
              ${mfld('File Description', 'pf-file_description', str(p?.file_description), 'text', 'e.g. PDF Guide, MP3 Album, Software License')}
              ${mfld('Max Downloads (blank = unlimited)', 'pf-max_downloads', str(p?.max_downloads), 'number', '')}
            </div>
          </div>

          <!-- ── SUBSCRIPTION fields ── -->
          <div id="pf-subscription-fields" ${ptype !== 'subscription' ? 'style="display:none"' : ''}>
            <div class="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
              <p class="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                <i class="fas fa-rotate text-blue-500 text-xs"></i>Subscription Options
              </p>
              <div>
                <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Billing Interval</label>
                <select id="pf-billing_interval" class="field text-sm">
                  <option value="week"  ${str(p?.billing_interval)==='week'?'selected':''}>Weekly</option>
                  <option value="mo"    ${str(p?.billing_interval)==='mo'||!p?.billing_interval?'selected':''}>Monthly</option>
                  <option value="year"  ${str(p?.billing_interval)==='year'?'selected':''}>Yearly</option>
                </select>
              </div>
              ${mfld('Trial Days (0 = no trial)', 'pf-trial_days', str(p?.trial_days)||'0', 'number', '0')}
              <p class="text-xs text-blue-600">Price will display as <strong>${fmt(p?.price||0, p?.currency)} / month</strong> on the storefront. Recurring billing is handled manually.</p>
            </div>
          </div>

          <!-- active: bool() handles GAS returning boolean true OR string 'true' -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="pf-active" type="checkbox" ${!p || bool(p?.active) ? 'checked' : ''}
              class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm text-slate-700 font-medium">Active (visible in store)</span>
          </label>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('product','${p?.id||''}')" class="btn-primary flex-1">
            ${p ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>`;
  }

  function categoryForm(cat) {
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">${cat ? 'Edit Category' : 'New Category'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>
        <div class="space-y-4">
          ${mfld('Category Name *', 'cf-name', cat?.name)}
          ${mfld('Description', 'cf-description', cat?.description)}
          ${mfld('Image URL', 'cf-image_url', cat?.image_url, 'url')}
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('category','${cat?.id||''}')" class="btn-primary flex-1">
            ${cat ? 'Save' : 'Create'}
          </button>
        </div>
      </div>`;
  }

  function discountForm(d) {
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">${d ? 'Edit Discount' : 'New Discount Code'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>
        <div class="space-y-4">
          ${mfld('Code *', 'df-code', d?.code, 'text', 'SUMMER20')}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Type</label>
              <select id="df-type" class="field text-sm">
                <option value="percent" ${d?.type==='percent'?'selected':''}>Percentage (%)</option>
                <option value="fixed"   ${d?.type==='fixed'?'selected':''}>Fixed Amount ($)</option>
              </select>
            </div>
            ${mfld('Value *', 'df-value', d?.value, 'number', '10')}
          </div>
          ${mfld('Minimum Order ($)', 'df-min_order', d?.min_order, 'number', '0')}
          ${mfld('Max Uses (blank = unlimited)', 'df-max_uses', d?.max_uses, 'number')}
          ${mfld('Expires At', 'df-expires_at', d?.expires_at?.split('T')[0], 'date')}
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="df-active" type="checkbox" ${!d || d?.active==='true'?'checked':''}
              class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm text-slate-700 font-medium">Active</span>
          </label>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('discount','${d?.id||''}')" class="btn-primary flex-1">
            ${d ? 'Save' : 'Create'}
          </button>
        </div>
      </div>`;
  }

  function bulkUploadForm() {
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">Bulk Product Upload</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>

        <!-- CSV format guide -->
        <div class="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-200">
          <p class="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Required CSV Format</p>
          <code class="text-xs text-slate-700 block leading-relaxed">
            name, price, compare_price, description, category_id,<br>
            image_url, sku, track_inventory, stock, tags, active
          </code>
          <p class="text-xs text-slate-400 mt-2">First row must be the header. <strong>name</strong> and <strong>price</strong> are required.</p>
        </div>

        <!-- Sample download -->
        <button onclick="downloadSampleCsv()"
          class="w-full mb-4 flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-300
                 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
          <i class="fas fa-download text-xs"></i> Download Sample CSV
        </button>

        <!-- File picker -->
        <label class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300
               rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group mb-4">
          <i class="fas fa-file-csv text-3xl text-slate-300 group-hover:text-blue-400 transition-colors"></i>
          <div class="text-center">
            <p class="text-sm font-semibold text-slate-600 group-hover:text-blue-600" id="bulk-file-label">Choose CSV file</p>
            <p class="text-xs text-slate-400 mt-0.5">or drag and drop</p>
          </div>
          <input type="file" accept=".csv" class="hidden" onchange="shopBulkFileChange(this)">
        </label>

        <button id="bulk-upload-btn" onclick="shopBulkUpload()" class="btn-primary w-full text-sm">
          <i class="fas fa-upload mr-1.5"></i>Import Products
        </button>
      </div>`;
  }

  function mfld(label, id, value, type='text', placeholder='') {
    return `<div>
      <label for="${id}" class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">${label}</label>
      <input id="${id}" type="${type}" value="${value||''}" placeholder="${placeholder}" class="field text-sm">
    </div>`;
  }

  function bannerForm(b, slotId) {
    const isEdit = !!b;
    const d = b || {
      id:            slotId || ('banner_' + Date.now()),
      title:         '', subtitle:  '', eyebrow: '',
      style:         'solid',
      bg_color:      'linear-gradient(135deg,#1e3a5f,#1d4ed8)',
      text_color:    '#ffffff',
      cta_text:      'Shop Now', cta_bg: '#ffffff', cta_color: '#1d4ed8', cta_link: '',
      image_url:     '', overlay_color: 'rgba(0,0,0,0.45)',
      active: 'true', start_date: '', end_date: '',
    };
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-bold text-slate-900 text-lg">${isEdit ? 'Edit Banner' : 'New Banner'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>

        <!-- Live mini-preview -->
        <div id="banner-preview" class="rounded-xl overflow-hidden mb-5 min-h-[80px] flex items-center relative"
             style="background:${d.style==='hero' && d.image_url ? 'url('+d.image_url+') center/cover' : d.bg_color}">
          ${d.style==='hero' && d.image_url ? `<div style="position:absolute;inset:0;background:${d.overlay_color}"></div>` : ''}
          <div class="relative z-10 p-4" style="color:${d.text_color}">
            ${d.eyebrow ? `<p style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;opacity:.8">${d.eyebrow}</p>` : ''}
            <p style="font-size:1rem;font-weight:800;line-height:1.2">${d.title || 'Banner Preview'}</p>
            ${d.subtitle ? `<p style="font-size:.8rem;opacity:.8;margin-top:.25rem">${d.subtitle}</p>` : ''}
            ${d.cta_text ? `<span style="display:inline-block;margin-top:.6rem;padding:.3rem .9rem;border-radius:50px;background:${d.cta_bg};color:${d.cta_color};font-size:.72rem;font-weight:700">${d.cta_text}</span>` : ''}
          </div>
        </div>

        <input type="hidden" id="bf-id" value="${d.id}">
        <div class="space-y-4">

          <!-- Style -->
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Style</label>
            <div class="grid grid-cols-3 gap-2">
              ${[{val:'solid',icon:'fa-fill',label:'Solid'},{val:'hero',icon:'fa-image',label:'Image+Text'},{val:'strip',icon:'fa-minus',label:'Strip'}].map(s=>`
                <button type="button" onclick="bfSetStyle('${s.val}')" id="bfstyle-${s.val}"
                  class="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all
                    ${d.style===s.val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}">
                  <i class="fas ${s.icon} text-base"></i>${s.label}
                </button>`).join('')}
            </div>
          </div>

          <!-- Content -->
          <div class="grid grid-cols-2 gap-3">
            ${mfld('Eyebrow','bf-eyebrow',d.eyebrow,'text','SALE · LIMITED TIME')}
            ${mfld('Title *','bf-title',d.title,'text','Summer Sale is Here')}
          </div>
          ${mfld('Subtitle','bf-subtitle',d.subtitle,'text','Up to 50% off selected items')}

          <!-- Image URL (hero only) -->
          <div id="bf-image-row" ${d.style!=='hero'?'style="display:none"':''}>
            ${mfld('Background Image URL','bf-image_url',d.image_url,'url','https://example.com/banner.jpg')}
            <div class="mt-2">
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Overlay Color</label>
              <input id="bf-overlay_color" type="text" value="${d.overlay_color}"
                placeholder="rgba(0,0,0,0.45)" class="field text-sm font-mono" oninput="bfUpdatePreview()">
            </div>
          </div>

          <!-- Background (solid + strip) -->
          <div id="bf-bg-row" ${d.style==='hero'?'style="display:none"':''}>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Background</label>
            <input id="bf-bg_color" type="text" value="${d.bg_color}"
              placeholder="linear-gradient(135deg,#1e3a5f,#1d4ed8) or #2563eb"
              class="field text-sm font-mono" oninput="bfUpdatePreview()">
            <p class="text-xs text-slate-400 mt-1">CSS color, hex, or gradient</p>
          </div>

          <!-- Text color -->
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Text Color</label>
            <div class="flex items-center gap-2">
              <input id="bf-text_color" type="color" value="${d.text_color}"
                class="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" oninput="bfUpdatePreview()">
              <input type="text" value="${d.text_color}"
                oninput="document.getElementById('bf-text_color').value=this.value;bfUpdatePreview()"
                class="field text-sm flex-1 font-mono">
            </div>
          </div>

          <!-- CTA -->
          <div class="border border-slate-200 rounded-xl p-4 space-y-3">
            <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">Call-to-Action Button</p>
            <div class="grid grid-cols-2 gap-3">
              ${mfld('Button Text','bf-cta_text',d.cta_text,'text','Shop Now')}
              ${mfld('Button Link','bf-cta_link',d.cta_link,'url','https://…')}
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Button Background</label>
                <input id="bf-cta_bg" type="text" value="${d.cta_bg}" placeholder="#ffffff"
                  class="field text-sm font-mono" oninput="bfUpdatePreview()">
              </div>
              <div>
                <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Button Text Color</label>
                <input id="bf-cta_color" type="text" value="${d.cta_color}" placeholder="#1d4ed8"
                  class="field text-sm font-mono" oninput="bfUpdatePreview()">
              </div>
            </div>
          </div>

          <!-- Schedule -->
          <div class="border border-slate-200 rounded-xl p-4 space-y-3">
            <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">Schedule (optional)</p>
            <div class="grid grid-cols-2 gap-3">
              ${mfld('Show From','bf-start_date',d.start_date?.split('T')[0],'date')}
              ${mfld('Hide After','bf-end_date',d.end_date?.split('T')[0],'date')}
            </div>
            <p class="text-xs text-slate-400">Leave blank for no schedule — banner shows whenever Active is on.</p>
          </div>

          <label class="flex items-center gap-2.5 cursor-pointer">
            <input id="bf-active" type="checkbox" ${String(d.active)==='true'?'checked':''}
              class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm font-medium text-slate-700">Active (visible on storefront)</span>
          </label>
        </div>

        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('banner','${d.id}')" class="btn-primary flex-1">
            ${isEdit ? 'Save Banner' : 'Create Banner'}
          </button>
        </div>
      </div>`;
  }

  // ── Banner form live helpers (globals so onclick can reach them) ──
  window.bfSetStyle = function(style) {
    ['solid','hero','strip'].forEach(s => {
      const btn = document.getElementById('bfstyle-' + s);
      if (btn) btn.className = btn.className
        .replace('border-blue-500 bg-blue-50 text-blue-700','border-slate-200 text-slate-500 hover:border-slate-300')
        .replace('border-slate-200 text-slate-500 hover:border-slate-300','border-slate-200 text-slate-500 hover:border-slate-300');
    });
    const active = document.getElementById('bfstyle-' + style);
    if (active) active.className = active.className
      .replace('border-slate-200 text-slate-500 hover:border-slate-300','border-blue-500 bg-blue-50 text-blue-700');
    const imgRow = document.getElementById('bf-image-row');
    const bgRow  = document.getElementById('bf-bg-row');
    if (imgRow) imgRow.style.display = style === 'hero'  ? '' : 'none';
    if (bgRow)  bgRow.style.display  = style !== 'hero'  ? '' : 'none';
    bfUpdatePreview();
  };

  window.bfUpdatePreview = function() {
    const preview = document.getElementById('banner-preview');
    if (!preview) return;
    const style    = (() => { for (const s of ['solid','hero','strip']) { const b = document.getElementById('bfstyle-'+s); if (b && b.className.includes('blue-500')) return s; } return 'solid'; })();
    const imgUrl   = document.getElementById('bf-image_url')?.value || '';
    const bgColor  = document.getElementById('bf-bg_color')?.value  || 'linear-gradient(135deg,#1e3a5f,#1d4ed8)';
    const overlay  = document.getElementById('bf-overlay_color')?.value || 'rgba(0,0,0,0.45)';
    const textCol  = document.getElementById('bf-text_color')?.value || '#ffffff';
    const eyebrow  = document.getElementById('bf-eyebrow')?.value  || '';
    const title    = document.getElementById('bf-title')?.value    || 'Banner Preview';
    const subtitle = document.getElementById('bf-subtitle')?.value || '';
    const ctaText  = document.getElementById('bf-cta_text')?.value || '';
    const ctaBg    = document.getElementById('bf-cta_bg')?.value   || '#ffffff';
    const ctaCol   = document.getElementById('bf-cta_color')?.value || '#1d4ed8';

    preview.style.background = (style === 'hero' && imgUrl)
      ? 'url(' + imgUrl + ') center/cover' : bgColor;

    preview.innerHTML = (style === 'hero' && imgUrl
      ? `<div style="position:absolute;inset:0;background:${overlay}"></div>` : '')
      + `<div class="relative z-10 p-4" style="color:${textCol}">`
      + (eyebrow  ? `<p style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;opacity:.8">${eyebrow}</p>` : '')
      + `<p style="font-size:1rem;font-weight:800;line-height:1.2">${title}</p>`
      + (subtitle ? `<p style="font-size:.8rem;opacity:.8;margin-top:.25rem">${subtitle}</p>` : '')
      + (ctaText  ? `<span style="display:inline-block;margin-top:.6rem;padding:.3rem .9rem;border-radius:50px;background:${ctaBg};color:${ctaCol};font-size:.72rem;font-weight:700">${ctaText}</span>` : '')
      + `</div>`;
  };

  // ── Download sample CSV ─────────────────────────────────────────
  window.downloadSampleCsv = function() {
    const csv = [
      'name,price,compare_price,description,category_id,image_url,sku,product_type,track_inventory,stock,tags,active,download_url,billing_interval,trial_days',
      '"Sample Physical",29.99,39.99,"A physical product","","https://example.com/img.jpg","SKU-001","physical","true","50","sale,new","true","","",""',
      '"Sample Digital",14.99,,"A digital download","","","SKU-002","digital","false","","","true","https://drive.google.com/file","",""',
      '"Sample Subscription",9.99,,"Monthly subscription","","","SKU-003","subscription","false","","","true","","mo","7"',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'products_sample.csv';
    a.click();
  };

  // Product type switcher — exposed globally for onclick in productForm
  window.pfSetType = function(type) {
    // Update hidden input
    const hidden = document.getElementById('pf-product_type');
    if (hidden) hidden.value = type;

    // Update type button styles — classList is reliable regardless of class order
    ['physical','digital','subscription'].forEach(t => {
      const btn = document.getElementById('pftype-' + t);
      if (!btn) return;
      btn.classList.remove('border-blue-500','bg-blue-50','text-blue-700',
                           'border-slate-200','text-slate-500','hover:border-slate-300');
      if (t === type) {
        btn.classList.add('border-blue-500','bg-blue-50','text-blue-700');
      } else {
        btn.classList.add('border-slate-200','text-slate-500','hover:border-slate-300');
      }
    });

    // Show/hide field sections
    const physical = document.getElementById('pf-physical-fields');
    const digital  = document.getElementById('pf-digital-fields');
    const subsc    = document.getElementById('pf-subscription-fields');
    if (physical) physical.style.display = type === 'physical'    ? '' : 'none';
    if (digital)  digital.style.display  = type === 'digital'     ? '' : 'none';
    if (subsc)    subsc.style.display    = type === 'subscription' ? '' : 'none';

    // Update price label
    const priceLabel = document.getElementById('pf-price-label');
    if (priceLabel) {
      priceLabel.textContent = type === 'subscription' ? '(per billing period)' : '';
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  SAVE HANDLERS
  // ══════════════════════════════════════════════════════════════
  async function handleSave(type, id) {
    try {
      if (type === 'product') {
        const ptype = document.getElementById('pf-product_type')?.value || 'physical';
        const params = {
          product_type:    ptype,
          name:            document.getElementById('pf-name')?.value,
          price:           document.getElementById('pf-price')?.value,
          compare_price:   document.getElementById('pf-compare_price')?.value,
          cost:            document.getElementById('pf-cost')?.value,
          currency:        document.getElementById('pf-currency')?.value,
          category_id:     document.getElementById('pf-category_id')?.value,
          description:     document.getElementById('pf-description')?.value,
          image_url:       document.getElementById('pf-image_url')?.value,
          sku:             document.getElementById('pf-sku')?.value,
          barcode:         document.getElementById('pf-barcode')?.value,
          tags:            document.getElementById('pf-tags')?.value,
          active:          document.getElementById('pf-active')?.checked ? 'true' : 'false',
          // Physical — read regardless of visibility so values persist when switching types
          weight:          document.getElementById('pf-weight')?.value          || '',
          track_inventory: document.getElementById('pf-track_inventory')?.checked ? 'true' : 'false',
          stock:           document.getElementById('pf-stock')?.value           || '',
          low_stock_alert: document.getElementById('pf-low_stock_alert')?.value || '5',
          // Digital
          download_url:    document.getElementById('pf-download_url')?.value    || '',
          file_description:document.getElementById('pf-file_description')?.value|| '',
          max_downloads:   document.getElementById('pf-max_downloads')?.value   || '',
          // Subscription
          billing_interval:document.getElementById('pf-billing_interval')?.value|| 'mo',
          trial_days:      document.getElementById('pf-trial_days')?.value      || '0',
        };
        if (!params.name || !params.price) { WorkVolt.toast('Name and price are required', 'error'); return; }
        if (ptype === 'digital' && !params.download_url) { WorkVolt.toast('Download URL is required for digital products', 'error'); return; }
        const r = id ? await api('products/update', { ...params, id }) : await api('products/create', params);
        if (r.error) throw new Error(r.error);
        WorkVolt.toast(id ? 'Product updated' : 'Product created', 'success');
        closeModal();
        await loadData();
        renderProducts(document.getElementById('shop-content'));
      }

      if (type === 'category') {
        const params = {
          name:        document.getElementById('cf-name')?.value,
          description: document.getElementById('cf-description')?.value,
          image_url:   document.getElementById('cf-image_url')?.value,
        };
        if (!params.name) { WorkVolt.toast('Name is required', 'error'); return; }
        const r = id ? await api('categories/update', { ...params, id }) : await api('categories/create', params);
        if (r.error) throw new Error(r.error);
        WorkVolt.toast(id ? 'Category updated' : 'Category created', 'success');
        closeModal();
        await loadData();
        renderProducts(document.getElementById('shop-content'));
      }

      if (type === 'discount') {
        const params = {
          code:       document.getElementById('df-code')?.value.toUpperCase(),
          type:       document.getElementById('df-type')?.value,
          value:      document.getElementById('df-value')?.value,
          min_order:  document.getElementById('df-min_order')?.value,
          max_uses:   document.getElementById('df-max_uses')?.value,
          expires_at: document.getElementById('df-expires_at')?.value,
          active:     document.getElementById('df-active')?.checked ? 'true' : 'false',
        };
        if (!params.code || !params.value) { WorkVolt.toast('Code and value required', 'error'); return; }
        const r = id ? await api('discounts/update', { ...params, id }) : await api('discounts/create', params);
        if (r.error) throw new Error(r.error);
        WorkVolt.toast(id ? 'Discount updated' : 'Discount created', 'success');
        closeModal();
        await loadDiscounts();
        renderDiscounts(document.getElementById('shop-content'));
      }

      if (type === 'banner') {
        const bid        = document.getElementById('bf-id')?.value;
        const styleEl    = ['solid','hero','strip'].find(s => {
          const b = document.getElementById('bfstyle-' + s);
          return b && b.className.includes('blue-500');
        }) || 'solid';
        const updated = {
          id:            bid,
          title:         document.getElementById('bf-title')?.value         || '',
          subtitle:      document.getElementById('bf-subtitle')?.value      || '',
          eyebrow:       document.getElementById('bf-eyebrow')?.value       || '',
          style:         styleEl,
          bg_color:      document.getElementById('bf-bg_color')?.value      || 'linear-gradient(135deg,#1e3a5f,#1d4ed8)',
          text_color:    document.getElementById('bf-text_color')?.value    || '#ffffff',
          image_url:     document.getElementById('bf-image_url')?.value     || '',
          overlay_color: document.getElementById('bf-overlay_color')?.value || 'rgba(0,0,0,0.45)',
          cta_text:      document.getElementById('bf-cta_text')?.value      || '',
          cta_link:      document.getElementById('bf-cta_link')?.value      || '',
          cta_bg:        document.getElementById('bf-cta_bg')?.value        || '#ffffff',
          cta_color:     document.getElementById('bf-cta_color')?.value     || '#1d4ed8',
          start_date:    document.getElementById('bf-start_date')?.value    || '',
          end_date:      document.getElementById('bf-end_date')?.value      || '',
          active:        document.getElementById('bf-active')?.checked ? 'true' : 'false',
        };
        if (!updated.title) { WorkVolt.toast('Banner title is required', 'error'); return; }

        // Merge into banners array (upsert by id)
        let currentBanners = getBanners();
        const existingIdx  = currentBanners.findIndex(b => b.id === bid);
        if (existingIdx > -1) currentBanners[existingIdx] = updated;
        else currentBanners.push(updated);

        // If new banner and no slot in order yet, add slot before all_products
        let currentOrder = getCurrentSectionOrder();
        if (!currentOrder.includes(bid)) {
          const apIdx = currentOrder.indexOf('all_products');
          currentOrder.splice(apIdx > -1 ? apIdx : currentOrder.length, 0, bid);
        }

        try {
          await saveLayout(currentOrder, currentBanners);
          WorkVolt.toast('Banner saved!', 'success');
          closeModal();
          await loadSettings();
          renderLayout(document.getElementById('shop-content'));
        } catch(e) { throw e; }
        return;
      }

      if (type === 'settings') {
        const fields = [
          'store_name','store_tagline','logo_url','store_email','store_phone','footer_text',
          'primary_color','accent_color','background_color','text_color',
          'tax_rate','tax_label',
          'paypal_email','stripe_pub_key','interac_email',
          'shipping_rate','free_shipping_min',
        ];
        const checks = [
          'currency_cad','currency_usd','tax_included',
          'paypal_enabled','stripe_enabled','interac_enabled','cash_enabled',
          'shipping_enabled','maintenance_mode',
        ];
        const params = {};
        fields.forEach(k => { const el = document.getElementById('s-' + k); if (el) params[k] = el.value; });
        checks.forEach(k => { const el = document.getElementById('s-' + k); if (el) params[k] = el.checked ? 'true' : 'false'; });
        const r = await api('settings/save', params);
        if (r.error) throw new Error(r.error);
        WorkVolt.toast('Settings saved', 'success');
        await loadSettings();
        renderShell();
        switchTab('settings');
      }
    } catch(e) {
      WorkVolt.toast(e.message, 'error');
    }
  }

  async function handleDelete(type, id) {
    if (!confirm('Delete this ' + type + '? This cannot be undone.')) return;
    try {
      let r;
      if (type === 'product')  r = await api('products/delete',   { id });
      if (type === 'category') r = await api('categories/delete', { id });
      if (type === 'discount') r = await api('discounts/delete',  { id });
      if (r.error) throw new Error(r.error);
      WorkVolt.toast(type.charAt(0).toUpperCase() + type.slice(1) + ' deleted', 'success');
      if (type === 'product' || type === 'category') { await loadData(); renderProducts(document.getElementById('shop-content')); }
      if (type === 'discount')                       { await loadDiscounts(); renderDiscounts(document.getElementById('shop-content')); }
    } catch(e) {
      WorkVolt.toast(e.message, 'error');
    }
  }

  async function handleToggle(id) {
    try {
      const r = await api('products/toggle', { id });
      if (r.error) throw new Error(r.error);
      const p = products.find(x => x.id === id);
      if (p) p.active = r.active;
      WorkVolt.toast('Product ' + (r.active === 'true' ? 'activated' : 'deactivated'), 'success');
      renderProducts(document.getElementById('shop-content'));
    } catch(e) {
      WorkVolt.toast(e.message, 'error');
    }
  }

  async function handleOrderStatus(id) {
    const fs = document.getElementById('f-status')?.value;
    const ps = document.getElementById('p-status')?.value;
    try {
      const r = await api('orders/update-status', { id, fulfillment_status: fs, payment_status: ps });
      if (r.error) throw new Error(r.error);
      WorkVolt.toast('Order status updated', 'success');
      closeModal();
      await loadOrders();
      renderOrders(document.getElementById('shop-content'));
    } catch(e) {
      WorkVolt.toast(e.message, 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  BOOT
  // ══════════════════════════════════════════════════════════════
  async function boot() {
    try {
      await loadSettings();
    } catch(e) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-96 p-8 text-center">
          <div class="w-16 h-16 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <i class="fas fa-store text-white text-2xl"></i>
          </div>
          <h2 class="text-xl font-extrabold text-slate-900 mb-2">Store & POS</h2>
          <p class="text-slate-500 mb-6 max-w-sm">This module hasn't been installed yet.</p>
          <button onclick="shopInstall()" class="btn-primary">
            <i class="fas fa-download mr-2"></i>Install Store Module
          </button>
        </div>`;
      window.shopInstall = async () => {
        try {
          const r = await WorkVolt.api('module/install', { module: 'shop' });
          if (r.error) throw new Error(r.error);
          WorkVolt.toast('Store module installed!', 'success');
          boot();
        } catch(err) {
          WorkVolt.toast(err.message, 'error');
        }
      };
      return;
    }
    renderShell();
    renderTab();
  }

  boot();
};
