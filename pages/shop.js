// ================================================================
//  WORK VOLT — shop.js
//  E-Commerce + POS Admin Module
//  Register in store.js CATALOGUE and nav in main.html:
//    { id: 'shop', label: 'Store & POS', icon: 'fa-store', ... }
// ================================================================

window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['shop'] = function(container) {

  // ══════════════════════════════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════════════════════════════
  let activeTab     = 'dashboard';
  let products      = [];
  let categories    = [];
  let orders        = [];
  let settings      = {};
  let discounts     = [];
  let customers     = [];
  let analytics     = {};
  let posCart       = [];
  let posSearchStr  = '';
  let dragSrcId     = null;
  let modalOpen     = false;

  const TABS = [
    { id: 'dashboard', icon: 'fa-chart-line',        label: 'Dashboard' },
    { id: 'products',  icon: 'fa-box-open',           label: 'Products' },
    { id: 'orders',    icon: 'fa-receipt',            label: 'Orders' },
    { id: 'customers', icon: 'fa-users',              label: 'Customers' },
    { id: 'discounts', icon: 'fa-tag',                label: 'Discounts' },
    { id: 'pos',       icon: 'fa-cash-register',      label: 'POS' },
    { id: 'settings',  icon: 'fa-sliders-h',          label: 'Settings' },
  ];

  // ── API helper ────────────────────────────────────────────────
  async function api(action, params = {}) {
    return WorkVolt.api('shop/' + action, params);
  }

  // ── Currency formatter ────────────────────────────────────────
  function fmt(amount, cur) {
    const c = cur || settings.currency || 'CAD';
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: c }).format(parseFloat(amount) || 0);
  }

  // ── Date formatter ────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── Status badge ──────────────────────────────────────────────
  function statusBadge(status, type) {
    const map = {
      'Pending':        'bg-amber-100 text-amber-700',
      'Pending Payment':'bg-orange-100 text-orange-700',
      'Paid':           'bg-green-100 text-green-700',
      'Shipped':        'bg-blue-100 text-blue-700',
      'Delivered':      'bg-emerald-100 text-emerald-700',
      'Cancelled':      'bg-red-100 text-red-700',
      'Refunded':       'bg-slate-100 text-slate-600',
      'Processing':     'bg-purple-100 text-purple-700',
    };
    const cls = map[status] || 'bg-slate-100 text-slate-600';
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${status || '—'}</span>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  SHELL RENDER
  // ══════════════════════════════════════════════════════════════
  function renderShell() {
    const storeUrl = window.API_URL || localStorage.getItem('wv_gas_url') || '';
    container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-50" id="shop-root">

        <!-- ── Page Header ── -->
        <div class="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                <i class="fas fa-store text-white"></i>
              </div>
              <div>
                <h1 class="text-xl font-extrabold text-slate-900">${settings.store_name || 'Store & POS'}</h1>
                <p class="text-xs text-slate-500">${settings.store_tagline || 'E-Commerce + Point of Sale'}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              ${storeUrl ? `<a href="${storeUrl}" target="_blank" class="btn-secondary text-xs gap-1.5"><i class="fas fa-external-link-alt text-xs"></i>View Store</a>` : ''}
              <button onclick="shopShowModal('product')" class="btn-primary text-xs gap-1.5"><i class="fas fa-plus text-xs"></i>New Product</button>
            </div>
          </div>

          <!-- ── Tabs ── -->
          <div class="flex gap-1 mt-4 overflow-x-auto thin-scroll" id="shop-tabs">
            ${TABS.map(t => `
              <button onclick="shopTab('${t.id}')" id="stab-${t.id}"
                class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all
                       ${activeTab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}">
                <i class="fas ${t.icon} text-xs"></i>${t.label}
              </button>`).join('')}
          </div>
        </div>

        <!-- ── Tab Content ── -->
        <div class="flex-1 overflow-y-auto thin-scroll" id="shop-content">
          <div class="flex items-center justify-center h-40">
            <i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i>
          </div>
        </div>
      </div>

      <!-- ── Modal ── -->
      <div id="shop-modal" class="hidden fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="shopCloseModal()"></div>
        <div id="shop-modal-inner" class="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto thin-scroll"></div>
      </div>
    `;

    // Expose globals
    window.shopTab        = switchTab;
    window.shopShowModal  = showModal;
    window.shopCloseModal = closeModal;
    window.shopSave       = handleSave;
    window.shopDelete     = handleDelete;
    window.shopToggle     = handleToggle;
    window.shopOrderStatus= handleOrderStatus;
    window.shopPosAdd     = posAddItem;
    window.shopPosRemove  = posRemoveItem;
    window.shopPosClear   = posClear;
    window.shopPosCheckout= posCheckout;
    window.shopPosSearch  = (v) => { posSearchStr = v; renderPOS(); };
    window.shopReorder    = handleReorder;
    window.shopCopyUrl    = () => { const u = window.API_URL || localStorage.getItem('wv_gas_url') || ''; navigator.clipboard.writeText(u); WorkVolt.toast('Storefront URL copied!', 'success'); };
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
    c.innerHTML = `<div class="flex items-center justify-center h-40"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i></div>`;
    try {
      if (activeTab === 'dashboard') { await loadAnalytics(); renderDashboard(c); }
      if (activeTab === 'products')  { await loadData(); renderProducts(c); }
      if (activeTab === 'orders')    { await loadOrders(); renderOrders(c); }
      if (activeTab === 'customers') { await loadCustomers(); renderCustomers(c); }
      if (activeTab === 'discounts') { await loadDiscounts(); renderDiscounts(c); }
      if (activeTab === 'pos')       { await loadData(); renderPOS(); }
      if (activeTab === 'settings')  { renderSettings(c); }
    } catch(e) {
      c.innerHTML = `<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>${e.message}</p></div>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  DATA LOADERS
  // ══════════════════════════════════════════════════════════════
  async function loadSettings()  { const r = await api('settings/get'); settings = r.settings || {}; }
  async function loadData()      { const [p, c] = await Promise.all([api('products/list'), api('categories/list')]); products = p.rows || []; categories = c.rows || []; }
  async function loadOrders()    { const r = await api('orders/list', { with_items: 'true' }); orders = r.rows || []; }
  async function loadCustomers() { const r = await api('customers/list'); customers = r.rows || []; }
  async function loadDiscounts() { const r = await api('discounts/list'); discounts = r.rows || []; }
  async function loadAnalytics() { const r = await api('analytics/summary', { days: 30 }); analytics = r; }

  // ══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════
  function renderDashboard(c) {
    const a = analytics;
    const storeUrl = window.API_URL || localStorage.getItem('wv_gas_url') || '';
    c.innerHTML = `
      <div class="p-6 space-y-6 slide-up">

        <!-- KPI Row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${kpiCard('Total Revenue', fmt(a.revenue), 'fa-dollar-sign', 'from-blue-500 to-indigo-600', 'Last 30 days')}
          ${kpiCard('Orders', a.orders || 0, 'fa-receipt', 'from-violet-500 to-purple-600', 'Last 30 days')}
          ${kpiCard('Avg Order', fmt(a.avg_order), 'fa-chart-bar', 'from-emerald-500 to-teal-600', 'Last 30 days')}
          ${kpiCard('Customers', a.total_customers || 0, 'fa-users', 'from-pink-500 to-rose-500', 'All time')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Revenue chart -->
          <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-bold text-slate-800 mb-4">Revenue — Last 7 Days</h3>
            <div class="flex items-end gap-2 h-32">
              ${Object.entries(a.rev_by_day || {}).map(([day, val]) => {
                const maxVal = Math.max(...Object.values(a.rev_by_day || {1:1}), 1);
                const pct = Math.max(4, Math.round((val / maxVal) * 100));
                return `<div class="flex-1 flex flex-col items-center gap-1">
                  <span class="text-[10px] text-slate-500 font-medium">${val > 0 ? fmt(val).replace('CA','') : ''}</span>
                  <div class="w-full bg-blue-500 rounded-t-md transition-all hover:bg-blue-600 cursor-default" style="height:${pct}%" title="${fmt(val)}"></div>
                  <span class="text-[10px] text-slate-400">${day}</span>
                </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Top products -->
          <div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-bold text-slate-800 mb-4">Top Products</h3>
            <div class="space-y-3">
              ${(a.top_products || []).length === 0
                ? `<p class="text-sm text-slate-400 text-center py-4">No sales yet</p>`
                : (a.top_products || []).map((p, i) => `
                  <div class="flex items-center gap-3">
                    <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">${i+1}</span>
                    <span class="flex-1 text-sm text-slate-700 truncate">${p.name}</span>
                    <span class="text-xs font-semibold text-slate-500">${p.qty} sold</span>
                  </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- Quick actions -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${quickAction('fa-box-open', 'Manage Products', "shopTab('products')", 'blue')}
          ${quickAction('fa-receipt', 'View Orders', "shopTab('orders')", 'violet')}
          ${quickAction('fa-cash-register', 'Open POS', "shopTab('pos')", 'emerald')}
          ${storeUrl
            ? quickAction('fa-external-link-alt', 'View Storefront', `window.open('${storeUrl}','_blank')`, 'slate')
            : quickAction('fa-sliders-h', 'Setup Store', "shopTab('settings')", 'slate')}
        </div>

        <!-- Status summary -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 class="font-bold text-slate-800 mb-3">Store Status</h3>
          <div class="flex flex-wrap gap-4 text-sm">
            <div class="flex items-center gap-2 text-slate-600">
              <span class="w-2 h-2 rounded-full ${a.total_products > 0 ? 'bg-green-500' : 'bg-slate-300'}"></span>
              <span>${a.total_products || 0} active products</span>
            </div>
            <div class="flex items-center gap-2 text-slate-600">
              <span class="w-2 h-2 rounded-full ${(a.pending_orders > 0) ? 'bg-amber-500' : 'bg-slate-300'}"></span>
              <span>${a.pending_orders || 0} pending orders</span>
            </div>
            <div class="flex items-center gap-2 text-slate-600">
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
              <span>Storefront live</span>
            </div>
          </div>
          <div class="mt-3 flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <i class="fas fa-link text-blue-500 text-sm"></i>
            <span class="text-sm text-slate-600 font-mono truncate flex-1">${storeUrl}</span>
            <button onclick="shopCopyUrl()" class="text-xs text-blue-600 font-semibold hover:underline">Copy</button>
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
    const colors = { blue:'bg-blue-50 text-blue-700 hover:bg-blue-100', violet:'bg-violet-50 text-violet-700 hover:bg-violet-100', emerald:'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', slate:'bg-slate-100 text-slate-700 hover:bg-slate-200' };
    return `<button onclick="${onclick}" class="flex flex-col items-center gap-2 p-4 rounded-xl ${colors[color]||colors.slate} transition-colors text-center cursor-pointer">
      <i class="fas ${icon} text-lg"></i>
      <span class="text-xs font-semibold">${label}</span>
    </button>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  PRODUCTS
  // ══════════════════════════════════════════════════════════════
  function renderProducts(c) {
    c.innerHTML = `
      <div class="p-6 slide-up">
        <!-- Toolbar -->
        <div class="flex items-center justify-between gap-3 mb-5">
          <div class="flex items-center gap-3">
            <h2 class="font-bold text-slate-900">Products <span class="text-slate-400 font-normal text-sm">(${products.length})</span></h2>
            <select id="filter-cat" onchange="shopTab('products')" class="field text-xs !py-1.5 !w-auto">
              <option value="">All Categories</option>
              ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="shopShowModal('category')" class="btn-secondary text-xs"><i class="fas fa-folder-plus mr-1"></i>Category</button>
            <button onclick="shopShowModal('product')" class="btn-primary text-xs"><i class="fas fa-plus mr-1"></i>Add Product</button>
          </div>
        </div>

        <!-- Drag & drop hint -->
        <p class="text-xs text-slate-400 mb-3 flex items-center gap-1.5"><i class="fas fa-grip-vertical"></i>Drag cards to reorder</p>

        <!-- Product grid -->
        <div id="product-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${products.map(p => renderProductCard(p)).join('')}
        </div>

        ${products.length === 0 ? `
          <div class="text-center py-20">
            <i class="fas fa-box-open text-4xl text-slate-300 mb-3"></i>
            <p class="text-slate-500 font-medium">No products yet</p>
            <button onclick="shopShowModal('product')" class="btn-primary mt-4 text-sm">Add First Product</button>
          </div>` : ''}
      </div>
    `;
    initDragDrop();
  }

  function renderProductCard(p) {
    const cat = categories.find(c => c.id === p.category_id);
    const isActive = String(p.active) === 'true';
    return `
      <div class="product-card bg-white border-2 ${isActive ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-60'}
                  rounded-2xl overflow-hidden cursor-grab hover:shadow-md transition-all"
           draggable="true"
           data-id="${p.id}"
           ondragstart="shopReorder('start', event, '${p.id}')"
           ondragover="shopReorder('over', event)"
           ondrop="shopReorder('drop', event, '${p.id}')"
           ondragend="shopReorder('end', event)">
        <!-- Image -->
        <div class="h-36 bg-slate-100 overflow-hidden relative">
          ${p.image_url
            ? `<img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center text-slate-300"><i class="fas fa-image text-4xl"></i></div>`}
          <div class="absolute top-2 right-2 flex gap-1">
            <button onclick="event.stopPropagation();shopToggle('${p.id}')"
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-sm transition-colors
                     ${isActive ? 'bg-green-500 text-white hover:bg-red-500' : 'bg-slate-400 text-white hover:bg-green-500'}"
              title="${isActive ? 'Deactivate' : 'Activate'}">
              <i class="fas ${isActive ? 'fa-eye' : 'fa-eye-slash'}"></i>
            </button>
          </div>
          <div class="absolute top-2 left-2">
            <i class="fas fa-grip-dots-vertical text-white/60 text-sm"></i>
          </div>
        </div>
        <!-- Info -->
        <div class="p-3">
          <div class="flex items-start justify-between gap-1 mb-1">
            <h4 class="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">${p.name}</h4>
          </div>
          ${cat ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">${cat.name}</span>` : ''}
          <div class="flex items-center justify-between mt-2">
            <div>
              <span class="text-base font-extrabold text-slate-900">${fmt(p.price, p.currency)}</span>
              ${p.compare_price && parseFloat(p.compare_price) > parseFloat(p.price)
                ? `<span class="text-xs text-slate-400 line-through ml-1">${fmt(p.compare_price, p.currency)}</span>` : ''}
            </div>
            ${p.track_inventory === 'true' ? `<span class="text-xs ${parseInt(p.stock) <= parseInt(p.low_stock_alert||5) ? 'text-red-500 font-semibold' : 'text-slate-400'}">${p.stock} left</span>` : ''}
          </div>
          <div class="flex gap-1.5 mt-3">
            <button onclick="shopShowModal('product','${p.id}')" class="flex-1 btn-secondary text-xs !py-1.5">Edit</button>
            <button onclick="shopDelete('product','${p.id}')" class="w-8 h-7 flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 rounded-lg text-xs transition-colors">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>`;
  }

  // ── Drag & drop for product reorder ───────────────────────────
  function initDragDrop() {}  // event wired via HTML attrs

  function handleReorder(type, event, id) {
    if (type === 'start') {
      dragSrcId = id;
      event.currentTarget.classList.add('opacity-40');
      event.dataTransfer.effectAllowed = 'move';
    }
    if (type === 'over') {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
    if (type === 'drop') {
      event.preventDefault();
      if (!dragSrcId || dragSrcId === id) return;
      // Swap positions
      const src  = products.find(p => p.id === dragSrcId);
      const dest = products.find(p => p.id === id);
      if (!src || !dest) return;
      const tmp    = src.position;
      src.position  = dest.position;
      dest.position = tmp;
      // Rebuild order array
      const order = products.map((p, i) => ({ id: p.id, position: p.position }));
      api('products/reorder', { order: JSON.stringify(order) }).then(() => {
        WorkVolt.toast('Order saved', 'success');
      });
      // Re-render
      products.sort((a, b) => (parseInt(a.position)||0) - (parseInt(b.position)||0));
      renderProducts(document.getElementById('shop-content'));
    }
    if (type === 'end') {
      document.querySelectorAll('.product-card').forEach(el => el.classList.remove('opacity-40'));
      dragSrcId = null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  ORDERS
  // ══════════════════════════════════════════════════════════════
  function renderOrders(c) {
    const statuses = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    c.innerHTML = `
      <div class="p-6 slide-up">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900">Orders <span class="text-slate-400 font-normal text-sm">(${orders.length})</span></h2>
          <div class="flex items-center gap-2 overflow-x-auto thin-scroll">
            ${statuses.map(s => `
              <button onclick="shopFilterOrders('${s}')" id="ofilter-${s}"
                class="px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${s==='All' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'}">
                ${s}
              </button>`).join('')}
          </div>
        </div>

        <div class="space-y-3" id="orders-list">
          ${renderOrdersList(orders)}
        </div>

        ${orders.length === 0 ? `
          <div class="text-center py-20">
            <i class="fas fa-receipt text-4xl text-slate-300 mb-3"></i>
            <p class="text-slate-500 font-medium">No orders yet</p>
          </div>` : ''}
      </div>
    `;
    window.shopFilterOrders = (status) => {
      document.querySelectorAll('[id^="ofilter-"]').forEach(b => {
        const isActive = b.id === 'ofilter-' + status;
        b.className = `px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${isActive ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'}`;
      });
      const filtered = status === 'All' ? orders : orders.filter(o => o.fulfillment_status === status);
      document.getElementById('orders-list').innerHTML = renderOrdersList(filtered);
    };
    window.shopViewOrder = (id) => showOrderDetail(id);
  }

  function renderOrdersList(list) {
    if (!list.length) return `<p class="text-center text-slate-400 py-8">No orders match this filter</p>`;
    return list.map(o => `
      <div class="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
           onclick="shopViewOrder('${o.id}')">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <i class="fas fa-receipt text-blue-500 text-sm"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900 text-sm">${o.order_number || o.id.slice(0,8)}</span>
                ${statusBadge(o.fulfillment_status)}
                ${statusBadge(o.payment_status)}
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${o.customer_name} · ${o.customer_email || ''}</p>
            </div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-slate-900">${fmt(o.total, o.currency)}</div>
            <div class="text-xs text-slate-400">${fmtDate(o.created_at)}</div>
          </div>
        </div>
      </div>`).join('');
  }

  function showOrderDetail(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    const fStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    const pStatuses = ['Pending', 'Pending Payment', 'Paid', 'Refunded'];
    document.getElementById('shop-modal-inner').innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">Order ${o.order_number}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center"><i class="fas fa-times text-sm"></i></button>
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

        <!-- Items -->
        ${o.items && o.items.length ? `
        <div class="bg-slate-50 rounded-xl p-3 mb-4">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items</p>
          ${o.items.map(i => `
            <div class="flex items-center justify-between text-sm py-1.5 border-b border-slate-200 last:border-0">
              <span class="text-slate-700">${i.product_name} × ${i.qty}</span>
              <span class="font-semibold">${fmt(i.total_price, o.currency)}</span>
            </div>`).join('')}
        </div>` : ''}

        <!-- Totals -->
        <div class="space-y-1 text-sm mb-5">
          <div class="flex justify-between text-slate-600"><span>Subtotal</span><span>${fmt(o.subtotal, o.currency)}</span></div>
          ${parseFloat(o.discount)>0 ? `<div class="flex justify-between text-green-600"><span>Discount ${o.discount_code ? '('+o.discount_code+')' : ''}</span><span>-${fmt(o.discount, o.currency)}</span></div>` : ''}
          ${parseFloat(o.tax)>0 ? `<div class="flex justify-between text-slate-600"><span>Tax</span><span>${fmt(o.tax, o.currency)}</span></div>` : ''}
          <div class="flex justify-between font-extrabold text-slate-900 pt-2 border-t border-slate-200 text-base"><span>Total</span><span>${fmt(o.total, o.currency)}</span></div>
        </div>

        <!-- Status controls -->
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
      <div class="p-6 slide-up">
        <div class="flex items-center justify-between mb-5">
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
          ${customers.length === 0 ? `<div class="text-center py-16 text-slate-400"><i class="fas fa-users text-3xl mb-2"></i><p>No customers yet</p></div>` : ''}
        </div>
      </div>
    `;
    window.shopSearchCustomers = async (q) => {
      const r = await api('customers/list', { search: q });
      document.getElementById('customers-body').innerHTML = renderCustomerRows(r.rows || []);
    };
  }

  function renderCustomerRows(list) {
    return list.map(cu => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">${(cu.name||'?')[0].toUpperCase()}</div>
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
      <div class="p-6 slide-up">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900">Discount Codes</h2>
          <button onclick="shopShowModal('discount')" class="btn-primary text-xs"><i class="fas fa-plus mr-1"></i>New Code</button>
        </div>
        <div class="space-y-3">
          ${discounts.length === 0
            ? `<div class="text-center py-16 text-slate-400"><i class="fas fa-tag text-3xl mb-2"></i><p>No discount codes yet</p></div>`
            : discounts.map(d => `
              <div class="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <i class="fas fa-tag text-amber-500"></i>
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-slate-900 font-mono text-sm">${d.code}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full ${String(d.active)==='true' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">${String(d.active)==='true'?'Active':'Inactive'}</span>
                    </div>
                    <p class="text-xs text-slate-500">${d.type === 'percent' ? d.value + '% off' : fmt(d.value) + ' off'}
                      ${d.min_order ? '· Min order ' + fmt(d.min_order) : ''}
                      · Used ${d.uses || 0}${d.max_uses ? '/'+d.max_uses : ''} times
                      ${d.expires_at ? '· Expires '+fmtDate(d.expires_at) : ''}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button onclick="shopShowModal('discount','${d.id}')" class="btn-secondary text-xs !py-1.5">Edit</button>
                  <button onclick="shopDelete('discount','${d.id}')" class="w-8 h-7 flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 rounded-lg transition-colors">
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
    const cartTotal = posCart.reduce((s, i) => s + (i.price * i.qty), 0);

    c.innerHTML = `
      <div class="flex h-full" style="min-height:600px">

        <!-- Products side -->
        <div class="flex-1 flex flex-col border-r border-slate-200 overflow-hidden">
          <!-- Search bar -->
          <div class="p-4 border-b border-slate-200 bg-white">
            <div class="relative">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="text" placeholder="Search products or scan barcode…"
                value="${posSearchStr}"
                oninput="shopPosSearch(this.value)"
                class="field pl-9 text-sm" autofocus>
            </div>
          </div>
          <!-- Grid -->
          <div class="flex-1 overflow-y-auto thin-scroll p-4">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              ${filtered.map(p => `
                <button onclick="shopPosAdd('${p.id}')"
                  class="bg-white border border-slate-200 rounded-xl p-3 text-left hover:border-blue-400 hover:shadow-md active:scale-95 transition-all group">
                  <div class="w-full h-24 bg-slate-100 rounded-lg mb-2 overflow-hidden">
                    ${p.image_url
                      ? `<img src="${p.image_url}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">`
                      : `<div class="w-full h-full flex items-center justify-center text-slate-300"><i class="fas fa-box text-2xl"></i></div>`}
                  </div>
                  <p class="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">${p.name}</p>
                  <p class="text-sm font-extrabold text-blue-600 mt-1">${fmt(p.price, p.currency)}</p>
                  ${p.track_inventory === 'true' ? `<p class="text-[10px] text-slate-400">${p.stock} left</p>` : ''}
                </button>`).join('')}
              ${filtered.length === 0 ? `<div class="col-span-4 text-center py-12 text-slate-400"><i class="fas fa-search text-3xl mb-2"></i><p>No products found</p></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Cart side -->
        <div class="w-80 flex flex-col bg-white">
          <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 class="font-bold text-slate-900">Cart <span class="text-slate-400 text-sm font-normal">(${posCart.length})</span></h3>
            ${posCart.length > 0 ? `<button onclick="shopPosClear()" class="text-xs text-red-400 hover:text-red-600 font-semibold">Clear</button>` : ''}
          </div>

          <!-- Cart items -->
          <div class="flex-1 overflow-y-auto thin-scroll divide-y divide-slate-100">
            ${posCart.length === 0
              ? `<div class="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
                   <i class="fas fa-shopping-cart text-4xl"></i>
                   <p class="text-sm">Cart is empty</p>
                 </div>`
              : posCart.map((item, i) => `
                <div class="px-4 py-3 flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800 truncate">${item.name}</p>
                    <p class="text-xs text-slate-500">${fmt(item.price)}</p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button onclick="shopPosRemove(${i}, -1)" class="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 text-xs font-bold flex items-center justify-center">−</button>
                    <span class="w-6 text-center text-sm font-bold">${item.qty}</span>
                    <button onclick="shopPosRemove(${i}, 1)" class="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 text-xs font-bold flex items-center justify-center">+</button>
                  </div>
                  <span class="text-sm font-extrabold text-slate-900 w-16 text-right">${fmt(item.price * item.qty)}</span>
                </div>`).join('')}
          </div>

          <!-- Totals + checkout -->
          <div class="border-t border-slate-200 p-4 space-y-3">
            <div class="flex justify-between text-base font-extrabold text-slate-900">
              <span>Total</span>
              <span>${fmt(cartTotal)}</span>
            </div>
            <!-- Payment method -->
            <select id="pos-payment" class="field text-sm">
              <option value="Cash">💵 Cash</option>
              ${settings.interac_enabled === 'true' ? `<option value="Interac">🏦 Interac e-Transfer</option>` : ''}
              ${settings.paypal_enabled === 'true' ? `<option value="PayPal">🅿 PayPal</option>` : ''}
              ${settings.stripe_enabled === 'true' ? `<option value="Stripe">💳 Stripe</option>` : ''}
            </select>
            <div class="grid grid-cols-2 gap-2">
              <input id="pos-name" type="text" placeholder="Customer name" class="field text-sm col-span-2">
              <input id="pos-email" type="email" placeholder="Email (optional)" class="field text-sm col-span-2">
            </div>
            <button onclick="shopPosCheckout()" ${posCart.length === 0 ? 'disabled' : ''}
              class="btn-primary w-full text-sm">
              <i class="fas fa-check-circle mr-1.5"></i>Complete Sale
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function posAddItem(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const existing = posCart.find(i => i.id === id);
    if (existing) {
      existing.qty++;
    } else {
      posCart.push({ id: p.id, name: p.name, price: parseFloat(p.price), qty: 1, currency: p.currency });
    }
    renderPOS();
  }

  function posRemoveItem(idx, delta) {
    posCart[idx].qty += delta;
    if (posCart[idx].qty <= 0) posCart.splice(idx, 1);
    renderPOS();
  }

  function posClear() {
    posCart = [];
    renderPOS();
  }

  async function posCheckout() {
    if (!posCart.length) return;
    const name    = document.getElementById('pos-name')?.value.trim() || 'Walk-in Customer';
    const email   = document.getElementById('pos-email')?.value.trim() || '';
    const method  = document.getElementById('pos-payment')?.value || 'Cash';
    const total   = posCart.reduce((s, i) => s + i.price * i.qty, 0);
    const items   = posCart.map(i => ({ product_id: i.id, product_name: i.name, qty: i.qty, unit_price: i.price, total_price: i.price * i.qty }));

    try {
      const r = await api('orders/create', {
        customer_name:     name,
        customer_email:    email,
        subtotal:          total.toFixed(2),
        tax:               '0',
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
      // Refresh products (inventory may have changed)
      await loadData();
      renderPOS();
    } catch(e) {
      WorkVolt.toast(e.message, 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SETTINGS
  // ══════════════════════════════════════════════════════════════
  function renderSettings(c) {
    const s = settings;
    c.innerHTML = `
      <div class="p-6 slide-up max-w-3xl space-y-6">

        <!-- Store Identity -->
        ${settingsSection('Store Identity', 'fa-store', `
          ${sfld('Store Name', 's-store_name', s.store_name, 'text')}
          ${sfld('Tagline', 's-store_tagline', s.store_tagline, 'text')}
          ${sfld('Logo URL', 's-logo_url', s.logo_url, 'url', 'https://drive.google.com/...')}
          ${sfld('Store Email', 's-store_email', s.store_email, 'email')}
          ${sfld('Store Phone', 's-store_phone', s.store_phone, 'tel')}
          ${sfld('Footer Text', 's-footer_text', s.footer_text, 'text')}
        `)}

        <!-- Branding -->
        ${settingsSection('Branding & Theme', 'fa-palette', `
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Primary Color</label>
              <div class="flex items-center gap-2">
                <input id="s-primary_color" type="color" value="${s.primary_color||'#2563eb'}" class="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5">
                <input type="text" value="${s.primary_color||'#2563eb'}" oninput="document.getElementById('s-primary_color').value=this.value" class="field text-sm flex-1 font-mono">
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Accent Color</label>
              <div class="flex items-center gap-2">
                <input id="s-accent_color" type="color" value="${s.accent_color||'#1d4ed8'}" class="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5">
                <input type="text" value="${s.accent_color||'#1d4ed8'}" oninput="document.getElementById('s-accent_color').value=this.value" class="field text-sm flex-1 font-mono">
              </div>
            </div>
          </div>
          ${sfld('Background Color', 's-background_color', s.background_color||'#f8fafc', 'text')}
        `)}

        <!-- Currency & Tax -->
        ${settingsSection('Currency & Tax', 'fa-dollar-sign', `
          <div class="grid grid-cols-2 gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="s-currency_cad" type="checkbox" ${s.currency_cad==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
              <span class="text-sm font-medium text-slate-700">CAD (Canadian Dollar)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="s-currency_usd" type="checkbox" ${s.currency_usd==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
              <span class="text-sm font-medium text-slate-700">USD (US Dollar)</span>
            </label>
          </div>
          ${sfld('Tax Rate (%)', 's-tax_rate', s.tax_rate||'0', 'number', '0')}
          ${sfld('Tax Label', 's-tax_label', s.tax_label||'Tax', 'text', 'GST/HST')}
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="s-tax_included" type="checkbox" ${s.tax_included==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm font-medium text-slate-700">Prices include tax</span>
          </label>
        `)}

        <!-- Payments -->
        ${settingsSection('Payment Methods', 'fa-credit-card', `
          <!-- PayPal -->
          <div class="border border-slate-200 rounded-xl p-4 space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input id="s-paypal_enabled" type="checkbox" ${s.paypal_enabled==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
              <div class="flex items-center gap-2">
                <span class="text-base">🅿</span>
                <span class="text-sm font-semibold text-slate-800">PayPal</span>
                <span class="text-xs text-slate-400">Redirect checkout</span>
              </div>
            </label>
            ${sfld('PayPal Email', 's-paypal_email', s.paypal_email, 'email', 'you@business.com')}
          </div>
          <!-- Stripe -->
          <div class="border border-slate-200 rounded-xl p-4 space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input id="s-stripe_enabled" type="checkbox" ${s.stripe_enabled==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
              <div class="flex items-center gap-2">
                <span class="text-base">💳</span>
                <span class="text-sm font-semibold text-slate-800">Stripe</span>
                <span class="text-xs text-slate-400">Requires Stripe.js integration</span>
              </div>
            </label>
            ${sfld('Stripe Publishable Key', 's-stripe_pub_key', s.stripe_pub_key, 'text', 'pk_live_...')}
          </div>
          <!-- Interac -->
          <div class="border border-slate-200 rounded-xl p-4 space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input id="s-interac_enabled" type="checkbox" ${s.interac_enabled==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
              <div class="flex items-center gap-2">
                <span class="text-base">🏦</span>
                <span class="text-sm font-semibold text-slate-800">Interac e-Transfer</span>
                <span class="text-xs text-slate-400">Manual confirmation</span>
              </div>
            </label>
            ${sfld('Interac Email', 's-interac_email', s.interac_email, 'email', 'payments@yourbusiness.ca')}
          </div>
          <!-- Cash -->
          <label class="flex items-center gap-3 cursor-pointer border border-slate-200 rounded-xl p-4">
            <input id="s-cash_enabled" type="checkbox" ${s.cash_enabled==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
            <div class="flex items-center gap-2">
              <span class="text-base">💵</span>
              <span class="text-sm font-semibold text-slate-800">Cash</span>
              <span class="text-xs text-slate-400">POS only</span>
            </div>
          </label>
        `)}

        <!-- Shipping -->
        ${settingsSection('Shipping', 'fa-truck', `
          <label class="flex items-center gap-2 cursor-pointer mb-3">
            <input id="s-shipping_enabled" type="checkbox" ${s.shipping_enabled==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm font-medium text-slate-700">Enable shipping</span>
          </label>
          ${sfld('Flat Shipping Rate', 's-shipping_rate', s.shipping_rate||'0', 'number', '9.99')}
          ${sfld('Free Shipping Minimum ($)', 's-free_shipping_min', s.free_shipping_min||'0', 'number', '75')}
        `)}

        <!-- Maintenance -->
        ${settingsSection('Store Status', 'fa-power-off', `
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="s-maintenance_mode" type="checkbox" ${s.maintenance_mode==='true'?'checked':''} class="w-4 h-4 rounded accent-red-600">
            <span class="text-sm font-medium text-slate-700">Maintenance mode (hides storefront)</span>
          </label>
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

  function sfld(label, id, value, type = 'text', placeholder = '') {
    return `<div>
      <label for="${id}" class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">${label}</label>
      <input id="${id}" type="${type}" value="${value||''}" placeholder="${placeholder}" class="field text-sm">
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  MODALS
  // ══════════════════════════════════════════════════════════════
  function showModal(type, id) {
    const modal = document.getElementById('shop-modal');
    const inner = document.getElementById('shop-modal-inner');
    if (!modal || !inner) return;

    if (type === 'product') {
      const p = id ? products.find(x => x.id === id) : null;
      inner.innerHTML = productForm(p);
    }
    if (type === 'category') {
      const cat = id ? categories.find(x => x.id === id) : null;
      inner.innerHTML = categoryForm(cat);
    }
    if (type === 'discount') {
      const d = id ? discounts.find(x => x.id === id) : null;
      inner.innerHTML = discountForm(d);
    }
    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('shop-modal')?.classList.add('hidden');
  }

  function productForm(p) {
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">${p ? 'Edit Product' : 'New Product'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center"><i class="fas fa-times text-sm"></i></button>
        </div>
        <div class="space-y-4" id="product-form-status"></div>
        <div class="space-y-4">
          ${mfld('Product Name *', 'pf-name', p?.name, 'text')}
          <div class="grid grid-cols-2 gap-3">
            ${mfld('Price *', 'pf-price', p?.price, 'number', '0.00')}
            ${mfld('Compare Price', 'pf-compare_price', p?.compare_price, 'number', '0.00')}
          </div>
          <div class="grid grid-cols-2 gap-3">
            ${mfld('Cost', 'pf-cost', p?.cost, 'number', '0.00')}
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Currency</label>
              <select id="pf-currency" class="field text-sm">
                <option value="CAD" ${p?.currency==='CAD'||!p?'selected':''}>CAD</option>
                <option value="USD" ${p?.currency==='USD'?'selected':''}>USD</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Category</label>
            <select id="pf-category_id" class="field text-sm">
              <option value="">— None —</option>
              ${categories.map(c => `<option value="${c.id}" ${p?.category_id===c.id?'selected':''}>${c.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Description</label>
            <textarea id="pf-description" rows="2" class="field text-sm resize-none">${p?.description||''}</textarea>
          </div>
          ${mfld('Image URL', 'pf-image_url', p?.image_url, 'url', 'https://drive.google.com/...')}
          <div class="grid grid-cols-2 gap-3">
            ${mfld('SKU', 'pf-sku', p?.sku, 'text')}
            ${mfld('Barcode', 'pf-barcode', p?.barcode, 'text')}
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="pf-track_inventory" type="checkbox" ${p?.track_inventory==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
              <span class="text-sm text-slate-700 font-medium">Track inventory</span>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3" id="inventory-fields" ${p?.track_inventory==='true'?'':'style="display:none"'}>
            ${mfld('Stock Quantity', 'pf-stock', p?.stock, 'number', '0')}
            ${mfld('Low Stock Alert', 'pf-low_stock_alert', p?.low_stock_alert||'5', 'number', '5')}
          </div>
          ${mfld('Tags (comma separated)', 'pf-tags', p?.tags, 'text', 'electronics, sale, new')}
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="pf-active" type="checkbox" ${!p || p?.active==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm text-slate-700 font-medium">Active (visible in store)</span>
          </label>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('product','${p?.id||''}')" class="btn-primary flex-1">${p ? 'Save Changes' : 'Create Product'}</button>
        </div>
      </div>
    `;
  }

  function categoryForm(cat) {
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">${cat ? 'Edit Category' : 'New Category'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center"><i class="fas fa-times text-sm"></i></button>
        </div>
        <div class="space-y-4">
          ${mfld('Category Name *', 'cf-name', cat?.name, 'text')}
          ${mfld('Description', 'cf-description', cat?.description, 'text')}
          ${mfld('Image URL', 'cf-image_url', cat?.image_url, 'url')}
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('category','${cat?.id||''}')" class="btn-primary flex-1">${cat ? 'Save' : 'Create'}</button>
        </div>
      </div>`;
  }

  function discountForm(d) {
    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-bold text-slate-900 text-lg">${d ? 'Edit Discount' : 'New Discount Code'}</h2>
          <button onclick="shopCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center"><i class="fas fa-times text-sm"></i></button>
        </div>
        <div class="space-y-4">
          ${mfld('Code *', 'df-code', d?.code, 'text', 'SUMMER20')}
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Type</label>
              <select id="df-type" class="field text-sm">
                <option value="percent" ${d?.type==='percent'?'selected':''}>Percentage (%)</option>
                <option value="fixed" ${d?.type==='fixed'?'selected':''}>Fixed Amount ($)</option>
              </select>
            </div>
            ${mfld('Value *', 'df-value', d?.value, 'number', '10')}
          </div>
          ${mfld('Minimum Order ($)', 'df-min_order', d?.min_order, 'number', '0')}
          ${mfld('Max Uses (blank = unlimited)', 'df-max_uses', d?.max_uses, 'number')}
          ${mfld('Expires At', 'df-expires_at', d?.expires_at?.split('T')[0], 'date')}
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="df-active" type="checkbox" ${!d || d?.active==='true'?'checked':''} class="w-4 h-4 rounded accent-blue-600">
            <span class="text-sm text-slate-700 font-medium">Active</span>
          </label>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopSave('discount','${d?.id||''}')" class="btn-primary flex-1">${d ? 'Save' : 'Create'}</button>
        </div>
      </div>`;
  }

  function mfld(label, id, value, type = 'text', placeholder = '') {
    return `<div>
      <label for="${id}" class="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">${label}</label>
      <input id="${id}" type="${type}" value="${value||''}" placeholder="${placeholder}" class="field text-sm">
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  SAVE HANDLERS
  // ══════════════════════════════════════════════════════════════
  async function handleSave(type, id) {
    try {
      if (type === 'product') {
        const params = {
          name:             document.getElementById('pf-name')?.value,
          price:            document.getElementById('pf-price')?.value,
          compare_price:    document.getElementById('pf-compare_price')?.value,
          cost:             document.getElementById('pf-cost')?.value,
          currency:         document.getElementById('pf-currency')?.value,
          category_id:      document.getElementById('pf-category_id')?.value,
          description:      document.getElementById('pf-description')?.value,
          image_url:        document.getElementById('pf-image_url')?.value,
          sku:              document.getElementById('pf-sku')?.value,
          barcode:          document.getElementById('pf-barcode')?.value,
          track_inventory:  document.getElementById('pf-track_inventory')?.checked ? 'true' : 'false',
          stock:            document.getElementById('pf-stock')?.value,
          low_stock_alert:  document.getElementById('pf-low_stock_alert')?.value,
          tags:             document.getElementById('pf-tags')?.value,
          active:           document.getElementById('pf-active')?.checked ? 'true' : 'false',
        };
        if (!params.name || !params.price) { WorkVolt.toast('Name and price are required', 'error'); return; }
        let r;
        if (id) { r = await api('products/update', { ...params, id }); }
        else    { r = await api('products/create', params); }
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
        let r;
        if (id) r = await api('categories/update', { ...params, id });
        else    r = await api('categories/create', params);
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
        let r;
        if (id) r = await api('discounts/update', { ...params, id });
        else    r = await api('discounts/create', params);
        if (r.error) throw new Error(r.error);
        WorkVolt.toast(id ? 'Discount updated' : 'Discount created', 'success');
        closeModal();
        await loadDiscounts();
        renderDiscounts(document.getElementById('shop-content'));
      }

      if (type === 'settings') {
        // Collect all settings fields
        const fieldIds = [
          'store_name','store_tagline','logo_url','store_email','store_phone','footer_text',
          'primary_color','accent_color','background_color',
          'tax_rate','tax_label',
          'paypal_email','stripe_pub_key','interac_email',
          'shipping_rate','free_shipping_min',
        ];
        const checkIds = [
          'currency_cad','currency_usd','tax_included',
          'paypal_enabled','stripe_enabled','interac_enabled','cash_enabled',
          'shipping_enabled','maintenance_mode',
        ];
        const params = {};
        fieldIds.forEach(k => {
          const el = document.getElementById('s-' + k);
          if (el) params[k] = el.value;
        });
        checkIds.forEach(k => {
          const el = document.getElementById('s-' + k);
          if (el) params[k] = el.checked ? 'true' : 'false';
        });
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
      if (type === 'product')  r = await api('products/delete', { id });
      if (type === 'category') r = await api('categories/delete', { id });
      if (type === 'discount') r = await api('discounts/delete', { id });
      if (r.error) throw new Error(r.error);
      WorkVolt.toast(type.charAt(0).toUpperCase() + type.slice(1) + ' deleted', 'success');
      if (type === 'product' || type === 'category') { await loadData(); renderProducts(document.getElementById('shop-content')); }
      if (type === 'discount') { await loadDiscounts(); renderDiscounts(document.getElementById('shop-content')); }
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
      // Not installed — show install prompt
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-96 p-8 text-center">
          <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <i class="fas fa-store text-white text-2xl"></i>
          </div>
          <h2 class="text-xl font-extrabold text-slate-900 mb-2">Store & POS</h2>
          <p class="text-slate-500 mb-6 max-w-sm">This module hasn't been installed yet. Install it to create your online store and POS system.</p>
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
