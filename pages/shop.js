// ================================================================
//  WORK VOLT — shop.js  v2.0  (Supabase)
//  Premium E-Commerce + POS Admin Module
//
//  ⚠️  Requires shop_schema.sql to be run in Supabase first
// ================================================================

window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['shop'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  const sdb = window.supabase
    ? (() => {
        // Use the already-initialised Supabase client from db-adapter
        const cfg = JSON.parse(localStorage.getItem('wv_db_config')||'{}');
        return cfg.credentials
          ? window.supabase.createClient(cfg.credentials.url, cfg.credentials.anonKey)
          : null;
      })()
    : null;

  // Generic shop DB helper
  async function shopDB(table, action, data, filters) {
    if (!sdb) throw new Error('Supabase not connected');
    if (action === 'list') {
      let q = sdb.from(table).select('*');
      if (filters) Object.entries(filters).forEach(([k,v]) => { if (v) q = q.eq(k,v); });
      const { data: rows, error } = await q.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return rows || [];
    }
    if (action === 'create') {
      const { data: row, error } = await sdb.from(table).insert(data).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    if (action === 'update') {
      const { id, ...patch } = data;
      const { data: row, error } = await sdb.from(table).update(patch).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return row;
    }
    if (action === 'delete') {
      const { error } = await sdb.from(table).delete().eq('id', data.id);
      if (error) throw new Error(error.message);
      return true;
    }
    if (action === 'upsert') {
      const { error } = await sdb.from(table).upsert(data);
      if (error) throw new Error(error.message);
      return true;
    }
  }

  let activeTab  = 'dashboard';
  let products   = [];
  let categories = [];
  let orders     = [];
  let customers  = [];
  let discounts  = [];
  let settings   = {};
  let posCart    = [];
  let posSearchStr = '';

  const TABS = [
    { id:'dashboard', icon:'fa-chart-line',    label:'Dashboard' },
    { id:'products',  icon:'fa-box-open',       label:'Products'  },
    { id:'orders',    icon:'fa-receipt',        label:'Orders'    },
    { id:'customers', icon:'fa-users',          label:'Customers' },
    { id:'discounts', icon:'fa-tag',            label:'Discounts' },
    { id:'pos',       icon:'fa-cash-register',  label:'POS'       },
    { id:'settings',  icon:'fa-sliders-h',      label:'Settings'  },
  ];

  // ── Formatters ─────────────────────────────────────────────────
  function fmt(amount) {
    const c = settings.currency || 'USD';
    return new Intl.NumberFormat('en-US', { style:'currency', currency:c }).format(parseFloat(amount)||0);
  }
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function toast(msg,type) { window.WorkVolt?.toast(msg, type||'info'); }

  function statusBadge(status) {
    const map = {
      'Pending':'bg-amber-100 text-amber-700', 'Paid':'bg-green-100 text-green-700',
      'Shipped':'bg-blue-100 text-blue-700', 'Delivered':'bg-emerald-100 text-emerald-700',
      'Cancelled':'bg-red-100 text-red-700', 'Refunded':'bg-slate-100 text-slate-600',
    };
    const cls = map[status]||'bg-slate-100 text-slate-600';
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${esc(status||'—')}</span>`;
  }

  // ── Modal ──────────────────────────────────────────────────────
  function openModal(html) {
    document.getElementById('shop-modal-inner').innerHTML = html;
    document.getElementById('shop-modal').classList.remove('hidden');
  }
  function closeModal() {
    document.getElementById('shop-modal').classList.add('hidden');
    document.getElementById('shop-modal-inner').innerHTML = '';
  }
  window.shopCloseModal = closeModal;

  // ── Shell ──────────────────────────────────────────────────────
  function renderShell() {
    container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-50" id="shop-root">
        <div class="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                <i class="fas fa-store text-white"></i>
              </div>
              <div>
                <h1 class="text-xl font-extrabold text-slate-900">${esc(settings.store_name||'Store & POS')}</h1>
                <p class="text-xs text-slate-500">${esc(settings.store_tagline||'E-Commerce + Point of Sale')}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick="shopShowModal('product')" class="btn-primary text-xs gap-1.5">
                <i class="fas fa-plus text-xs"></i>New Product
              </button>
            </div>
          </div>
          <div class="flex gap-1 mt-4 overflow-x-auto thin-scroll">
            ${TABS.map(t => `
              <button onclick="shopTab('${t.id}')" id="stab-${t.id}"
                class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all
                  ${activeTab===t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}">
                <i class="fas ${t.icon} text-xs"></i>${t.label}
              </button>`).join('')}
          </div>
        </div>
        <div class="flex-1 overflow-y-auto thin-scroll p-6" id="shop-content">
          <div class="flex items-center justify-center h-40">
            <i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i>
          </div>
        </div>
      </div>

      <div id="shop-modal" class="hidden fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" onclick="shopCloseModal()"></div>
        <div id="shop-modal-inner" class="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"></div>
      </div>`;

    window.shopTab = switchTab;
    window.shopShowModal = showModal;
    switchTab(activeTab);
  }

  function switchTab(id) {
    activeTab = id;
    TABS.forEach(t => {
      const btn = document.getElementById('stab-'+t.id);
      if (btn) btn.className = `flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-all ${t.id===id?'bg-blue-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`;
    });
    renderTab();
  }

  async function renderTab() {
    const c = document.getElementById('shop-content');
    if (!c) return;
    c.innerHTML = `<div class="flex items-center justify-center h-40"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i></div>`;
    try {
      if (activeTab === 'dashboard') { await loadAll(); renderDashboard(c); }
      if (activeTab === 'products')  { await loadProducts(); renderProducts(c); }
      if (activeTab === 'orders')    { await loadOrders(); renderOrders(c); }
      if (activeTab === 'customers') { await loadCustomers(); renderCustomers(c); }
      if (activeTab === 'discounts') { await loadDiscounts(); renderDiscounts(c); }
      if (activeTab === 'pos')       { await loadProducts(); renderPOS(c); }
      if (activeTab === 'settings')  { await loadSettings(); renderSettings(c); }
    } catch(e) {
      c.innerHTML = `<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p>${e.message}</p>
        <p class="text-xs text-slate-400 mt-2">Make sure you've run shop_schema.sql in Supabase</p></div>`;
    }
  }

  // ── Loaders ────────────────────────────────────────────────────
  async function loadSettings() {
    const rows = await shopDB('shop_settings','list');
    settings = Object.fromEntries((rows||[]).map(r => [r.key, r.value]));
  }
  async function loadProducts()  { [products, categories] = await Promise.all([shopDB('shop_products','list'), shopDB('shop_categories','list')]); }
  async function loadOrders()    { orders    = await shopDB('shop_orders','list'); }
  async function loadCustomers() { customers = await shopDB('shop_customers','list'); }
  async function loadDiscounts() { discounts = await shopDB('shop_discounts','list'); }
  async function loadAll() { await Promise.all([loadSettings(), loadProducts(), loadOrders(), loadCustomers()]); }

  // ── DASHBOARD ─────────────────────────────────────────────────
  function renderDashboard(el) {
    const totalRevenue = orders.filter(o => o.payment_status==='Paid').reduce((s,o) => s+(parseFloat(o.total)||0), 0);
    const pendingOrders = orders.filter(o => o.status==='Pending').length;
    const lowStock = products.filter(p => p.track_stock && (p.stock||0) <= 5).length;
    const recentOrders = orders.slice(0, 5);

    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${[
            { label:'Total Revenue',   val:fmt(totalRevenue), icon:'fa-dollar-sign', color:'green' },
            { label:'Total Orders',    val:orders.length,     icon:'fa-receipt',     color:'blue'  },
            { label:'Products',        val:products.length,   icon:'fa-box-open',    color:'violet'},
            { label:'Low Stock',       val:lowStock,          icon:'fa-exclamation-triangle', color:'amber'},
          ].map(k => `
            <div class="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div class="w-11 h-11 bg-${k.color}-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <i class="fas ${k.icon} text-${k.color}-500 text-lg"></i>
              </div>
              <div>
                <div class="text-2xl font-extrabold text-slate-900">${k.val}</div>
                <div class="text-xs text-slate-500 font-medium">${k.label}</div>
              </div>
            </div>`).join('')}
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-900">Recent Orders</h3>
            <button onclick="shopTab('orders')" class="text-xs text-blue-600 hover:text-blue-800 font-semibold">View all →</button>
          </div>
          <div class="divide-y divide-slate-100">
            ${recentOrders.length ? recentOrders.map(o => `
              <div class="px-5 py-3 flex items-center gap-4">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-slate-900">${esc(o.order_number||o.id.slice(0,8))}</p>
                  <p class="text-xs text-slate-400">${esc(o.customer_name||'—')} · ${fmtDate(o.created_at)}</p>
                </div>
                <div class="text-sm font-bold text-slate-900">${fmt(o.total)}</div>
                ${statusBadge(o.status)}
              </div>`).join('')
            : '<div class="px-5 py-8 text-center text-slate-400 text-sm">No orders yet</div>'}
          </div>
        </div>
      </div>`;
  }

  // ── PRODUCTS ──────────────────────────────────────────────────
  function renderProducts(el) {
    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Products</h2>
            <p class="text-sm text-slate-500">${products.length} products · ${categories.length} categories</p>
          </div>
          <div class="flex gap-2">
            <button onclick="shopShowModal('category')" class="btn-secondary text-xs px-3 py-2"><i class="fas fa-folder-plus text-xs mr-1"></i>Category</button>
            <button onclick="shopShowModal('product')" class="btn-primary text-xs px-3 py-2"><i class="fas fa-plus text-xs mr-1"></i>Product</button>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${products.map(p => {
            const cat = categories.find(c => c.id === p.category_id);
            return `
              <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div class="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
                  ${p.image_url ? `<img src="${esc(p.image_url)}" class="w-full h-full object-cover">` : `<i class="fas fa-box-open text-3xl text-slate-300"></i>`}
                  <div class="absolute top-2 right-2 flex gap-1">
                    ${!p.active ? `<span class="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Hidden</span>` : ''}
                    ${p.featured ? `<span class="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Featured</span>` : ''}
                  </div>
                </div>
                <div class="p-4">
                  <p class="font-bold text-slate-900 truncate">${esc(p.name)}</p>
                  <p class="text-xs text-slate-400 mt-0.5">${esc(cat?.name||'Uncategorised')}</p>
                  <div class="flex items-center justify-between mt-3">
                    <div>
                      <span class="text-lg font-extrabold text-slate-900">${fmt(p.price)}</span>
                      ${p.compare_price ? `<span class="text-xs text-slate-400 line-through ml-1">${fmt(p.compare_price)}</span>` : ''}
                    </div>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${(p.stock||0)<=5?'bg-red-100 text-red-600':'bg-green-100 text-green-700'}">
                      ${p.track_stock ? (p.stock||0)+' in stock' : 'In stock'}
                    </span>
                  </div>
                  <div class="flex gap-2 mt-3">
                    <button onclick="shopEditProduct('${p.id}')" class="flex-1 btn-secondary text-xs py-1.5"><i class="fas fa-pencil text-xs mr-1"></i>Edit</button>
                    <button onclick="shopDeleteItem('product','${p.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-xs transition-colors"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>`;
          }).join('') || '<div class="col-span-3 text-center py-16 text-slate-400"><i class="fas fa-box-open text-4xl mb-3 opacity-30"></i><p>No products yet</p></div>'}
        </div>
      </div>`;

    window.shopEditProduct = id => showModal('product', products.find(p => p.id === id));
    window.shopDeleteItem  = async (type, id) => {
      if (!confirm('Delete this item?')) return;
      const tbl = type === 'product' ? 'shop_products' : 'shop_categories';
      await shopDB(tbl, 'delete', { id });
      toast('Deleted','info');
      switchTab(activeTab);
    };
  }

  // ── ORDERS ────────────────────────────────────────────────────
  function renderOrders(el) {
    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-slate-900">Orders <span class="text-sm font-normal text-slate-400 ml-2">${orders.length} total</span></h2>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <th class="px-4 py-3">Order</th><th class="px-4 py-3">Customer</th>
                <th class="px-4 py-3">Date</th><th class="px-4 py-3">Total</th>
                <th class="px-4 py-3">Status</th><th class="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                ${orders.map(o => `
                  <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-semibold text-slate-900">#${esc(o.order_number||o.id.slice(0,8))}</td>
                    <td class="px-4 py-3 text-sm text-slate-600">${esc(o.customer_name||'—')}</td>
                    <td class="px-4 py-3 text-xs text-slate-500">${fmtDate(o.created_at)}</td>
                    <td class="px-4 py-3 font-bold text-slate-900">${fmt(o.total)}</td>
                    <td class="px-4 py-3">${statusBadge(o.status)}</td>
                    <td class="px-4 py-3">
                      <button onclick="shopViewOrder('${o.id}')" class="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 hover:bg-blue-50 rounded-lg transition-colors">View</button>
                    </td>
                  </tr>`).join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-8">No orders yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    window.shopViewOrder = async id => {
      const order = orders.find(o => o.id === id);
      if (!order) return;
      let items = [];
      try { items = await shopDB('shop_order_items','list',null,{order_id:id}); } catch(e){}
      openModal(`
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-900">Order #${esc(order.order_number||order.id.slice(0,8))}</h3>
            <button onclick="shopCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div class="space-y-3 mb-4">
            <div class="flex justify-between text-sm"><span class="text-slate-500">Customer</span><span class="font-semibold">${esc(order.customer_name||'—')}</span></div>
            <div class="flex justify-between text-sm"><span class="text-slate-500">Date</span><span>${fmtDate(order.created_at)}</span></div>
            <div class="flex justify-between text-sm"><span class="text-slate-500">Status</span>${statusBadge(order.status)}</div>
            <div class="flex justify-between text-sm"><span class="text-slate-500">Payment</span><span>${esc(order.payment_status||'—')}</span></div>
          </div>
          ${items.length ? `
            <div class="border-t border-slate-100 pt-3 mb-3">
              <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Items</p>
              ${items.map(i => `<div class="flex justify-between text-sm py-1"><span>${esc(i.name)} × ${i.quantity}</span><span class="font-semibold">${fmt(i.total)}</span></div>`).join('')}
            </div>` : ''}
          <div class="border-t border-slate-100 pt-3 space-y-1.5">
            <div class="flex justify-between text-sm"><span class="text-slate-500">Subtotal</span><span>${fmt(order.subtotal)}</span></div>
            ${order.discount ? `<div class="flex justify-between text-sm text-green-600"><span>Discount</span><span>-${fmt(order.discount)}</span></div>` : ''}
            <div class="flex justify-between font-bold text-base"><span>Total</span><span>${fmt(order.total)}</span></div>
          </div>
          <div class="mt-4 flex gap-2">
            <select id="order-status-sel" class="field text-sm flex-1">
              ${['Pending','Processing','Paid','Shipped','Delivered','Cancelled','Refunded'].map(s => `<option value="${s}"${order.status===s?' selected':''}>${s}</option>`).join('')}
            </select>
            <button onclick="shopUpdateOrderStatus('${order.id}')" class="btn-primary text-xs px-4">Update</button>
          </div>
        </div>`);

      window.shopUpdateOrderStatus = async oid => {
        const status = document.getElementById('order-status-sel')?.value;
        await shopDB('shop_orders','update',{ id:oid, status });
        toast('Status updated','success');
        closeModal();
        loadOrders().then(() => renderOrders(document.getElementById('shop-content')));
      };
    };
  }

  // ── CUSTOMERS ─────────────────────────────────────────────────
  function renderCustomers(el) {
    el.innerHTML = `
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-slate-900">Customers <span class="text-sm font-normal text-slate-400 ml-2">${customers.length} total</span></h2>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <th class="px-4 py-3">Name</th><th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Orders</th><th class="px-4 py-3">Total Spent</th>
              </tr></thead>
              <tbody>
                ${customers.map(c => `
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-3 font-semibold text-slate-900">${esc(c.name)}</td>
                    <td class="px-4 py-3 text-sm text-slate-500">${esc(c.email||'—')}</td>
                    <td class="px-4 py-3 text-sm text-slate-700">${c.total_orders||0}</td>
                    <td class="px-4 py-3 font-bold text-slate-900">${fmt(c.total_spent)}</td>
                  </tr>`).join('') || '<tr><td colspan="4" class="text-center text-slate-400 py-8">No customers yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  // ── DISCOUNTS ─────────────────────────────────────────────────
  function renderDiscounts(el) {
    el.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-slate-900">Discounts</h2>
          <button onclick="shopShowModal('discount')" class="btn-primary text-xs px-3 py-2"><i class="fas fa-plus text-xs mr-1"></i>Add Code</button>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table class="w-full text-left">
            <thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
              <th class="px-4 py-3">Code</th><th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Value</th><th class="px-4 py-3">Uses</th>
              <th class="px-4 py-3">Status</th><th class="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              ${discounts.map(d => `
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-3 font-mono font-bold text-slate-900">${esc(d.code)}</td>
                  <td class="px-4 py-3 text-sm text-slate-600 capitalize">${esc(d.type)}</td>
                  <td class="px-4 py-3 font-semibold text-slate-900">${d.type==='percent'?d.value+'%':fmt(d.value)}</td>
                  <td class="px-4 py-3 text-sm text-slate-600">${d.uses||0}${d.max_uses?' / '+d.max_uses:''}</td>
                  <td class="px-4 py-3"><span class="text-xs font-semibold px-2 py-0.5 rounded-full ${d.active?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500'}">${d.active?'Active':'Inactive'}</span></td>
                  <td class="px-4 py-3">
                    <button onclick="shopDeleteDiscount('${d.id}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fas fa-trash text-xs"></i></button>
                  </td>
                </tr>`).join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-8">No discount codes yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    window.shopDeleteDiscount = async id => {
      if (!confirm('Delete this discount code?')) return;
      await shopDB('shop_discounts','delete',{id});
      toast('Deleted','info');
      loadDiscounts().then(() => renderDiscounts(document.getElementById('shop-content')));
    };
  }

  // ── POS ───────────────────────────────────────────────────────
  function renderPOS(el) {
    el = el || document.getElementById('shop-content');
    const filtered = posSearchStr
      ? products.filter(p => p.active && (p.name||'').toLowerCase().includes(posSearchStr.toLowerCase()))
      : products.filter(p => p.active);
    const subtotal = posCart.reduce((s,i) => s+(i.price*i.qty),0);

    el.innerHTML = `
      <div class="flex gap-4 h-[calc(100vh-240px)] min-h-[400px]">
        <!-- Products grid -->
        <div class="flex-1 flex flex-col gap-3">
          <input type="text" placeholder="Search products…" value="${esc(posSearchStr)}"
            oninput="window.shopPosSearch(this.value)"
            class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
          <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
            ${filtered.map(p => `
              <button onclick="shopPosAdd('${p.id}')"
                class="bg-white border border-slate-200 rounded-xl p-3 text-left hover:border-blue-400 hover:bg-blue-50 transition-all active:scale-95 ${(p.stock||0)===0&&p.track_stock?'opacity-50 cursor-not-allowed':''}">
                <div class="w-full h-16 bg-slate-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                  ${p.image_url ? `<img src="${esc(p.image_url)}" class="w-full h-full object-cover rounded-lg">` : `<i class="fas fa-box-open text-slate-300 text-xl"></i>`}
                </div>
                <p class="text-xs font-bold text-slate-800 truncate">${esc(p.name)}</p>
                <p class="text-sm font-extrabold text-blue-600 mt-0.5">${fmt(p.price)}</p>
                ${p.track_stock ? `<p class="text-[10px] text-slate-400">${p.stock||0} left</p>` : ''}
              </button>`).join('') || '<div class="col-span-3 text-center text-slate-400 py-8 text-sm">No products</div>'}
          </div>
        </div>

        <!-- Cart -->
        <div class="w-72 flex-shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-900">Cart <span class="text-slate-400 font-normal text-sm">(${posCart.length})</span></h3>
            <button onclick="shopPosClear()" class="text-xs text-slate-400 hover:text-red-500 transition-colors">Clear</button>
          </div>
          <div class="flex-1 overflow-y-auto p-3 space-y-2">
            ${posCart.length ? posCart.map((item, idx) => `
              <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold text-slate-800 truncate">${esc(item.name)}</p>
                  <p class="text-xs text-blue-600 font-bold">${fmt(item.price)}</p>
                </div>
                <div class="flex items-center gap-1">
                  <button onclick="shopPosQty(${idx},-1)" class="w-5 h-5 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-xs font-bold">−</button>
                  <span class="text-xs font-bold text-slate-800 w-5 text-center">${item.qty}</span>
                  <button onclick="shopPosQty(${idx},1)" class="w-5 h-5 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-xs font-bold">+</button>
                </div>
                <button onclick="shopPosRemove(${idx})" class="text-slate-300 hover:text-red-500 transition-colors ml-1"><i class="fas fa-times text-xs"></i></button>
              </div>`).join('')
            : '<div class="text-center text-slate-400 text-sm py-6">Cart is empty</div>'}
          </div>
          <div class="p-4 border-t border-slate-100 space-y-3">
            <div class="flex justify-between text-sm font-bold text-slate-900">
              <span>Total</span><span>${fmt(subtotal)}</span>
            </div>
            <button onclick="shopPosCheckout()" ${!posCart.length?'disabled':''} class="w-full btn-primary py-3 text-sm ${!posCart.length?'opacity-50 cursor-not-allowed':''}">
              <i class="fas fa-cash-register text-sm mr-1.5"></i>Checkout
            </button>
          </div>
        </div>
      </div>`;

    window.shopPosSearch = v => { posSearchStr = v; renderPOS(); };
    window.shopPosQty = (idx, delta) => {
      posCart[idx].qty = Math.max(1, (posCart[idx].qty||1) + delta);
      renderPOS();
    };
  }

  window.shopPosAdd = id => {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (p.track_stock && (p.stock||0) === 0) { toast('Out of stock','error'); return; }
    const existing = posCart.find(i => i.id === id);
    if (existing) existing.qty++;
    else posCart.push({ id, name:p.name, price:parseFloat(p.price)||0, qty:1 });
    renderPOS();
  };
  window.shopPosRemove = idx => { posCart.splice(idx,1); renderPOS(); };
  window.shopPosClear  = () => { posCart=[]; renderPOS(); };

  window.shopPosCheckout = async () => {
    if (!posCart.length) return;
    const subtotal = posCart.reduce((s,i) => s+(i.price*i.qty), 0);
    openModal(`
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-slate-900">Complete Sale</h3>
          <button onclick="shopCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
        </div>
        <div class="mb-4 space-y-1.5">
          ${posCart.map(i => `<div class="flex justify-between text-sm"><span>${esc(i.name)} × ${i.qty}</span><span class="font-semibold">${fmt(i.price*i.qty)}</span></div>`).join('')}
          <div class="flex justify-between font-extrabold text-base border-t border-slate-100 pt-2 mt-2"><span>Total</span><span>${fmt(subtotal)}</span></div>
        </div>
        <div class="space-y-3">
          <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Customer Name</label>
            <input id="pos-cname" type="text" class="field text-sm" placeholder="Walk-in customer"></div>
          <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Payment Method</label>
            <select id="pos-pay" class="field text-sm">
              <option>Cash</option><option>Card</option><option>Transfer</option>
            </select></div>
        </div>
        <div id="pos-status" class="mt-3"></div>
        <div class="flex gap-3 mt-4">
          <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
          <button onclick="shopConfirmCheckout()" class="btn-primary flex-1"><i class="fas fa-check text-xs mr-1"></i>Complete Sale</button>
        </div>
      </div>`);

    window.shopConfirmCheckout = async () => {
      const cname = document.getElementById('pos-cname')?.value || 'Walk-in';
      const pay   = document.getElementById('pos-pay')?.value || 'Cash';
      try {
        // Generate order number
        const orderNum = 'POS-' + Date.now().toString(36).toUpperCase();

        // Create customer if new
        let customerId = null;
        if (cname && cname !== 'Walk-in') {
          const existing = customers.find(c => c.name.toLowerCase() === cname.toLowerCase());
          if (existing) { customerId = existing.id; }
          else {
            const nc = await shopDB('shop_customers','create',{ name:cname, total_orders:1, total_spent:subtotal });
            customerId = nc.id;
          }
        }

        // Create order
        const order = await shopDB('shop_orders','create',{
          order_number: orderNum, customer_id: customerId, customer_name: cname,
          subtotal, total: subtotal, status: 'Paid', payment_status: 'Paid',
          fulfillment_status: 'Fulfilled', source: 'POS',
          notes: 'Payment: ' + pay,
        });

        // Create order items
        for (const item of posCart) {
          await shopDB('shop_order_items','create',{
            order_id: order.id, product_id: item.id,
            name: item.name, quantity: item.qty,
            price: item.price, total: item.price * item.qty,
          });
          // Decrement stock
          const p = products.find(x => x.id === item.id);
          if (p && p.track_stock) {
            await shopDB('shop_products','update',{ id:item.id, stock: Math.max(0,(p.stock||0)-item.qty) });
          }
        }

        posCart = [];
        toast('Sale complete! Order '+orderNum,'success');
        closeModal();
        switchTab('pos');
      } catch(e) {
        const s = document.getElementById('pos-status');
        if (s) s.innerHTML = `<p class="text-xs text-red-600 py-1">${e.message}</p>`;
      }
    };
  };

  // ── MODALS (product / category / discount forms) ──────────────
  function showModal(type, existing) {
    if (type === 'product') {
      const p   = existing || {};
      const isEdit = !!p.id;
      const catOpts = categories.map(c => `<option value="${c.id}"${p.category_id===c.id?' selected':''}>${esc(c.name)}</option>`).join('');

      openModal(`
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-900">${isEdit?'Edit Product':'New Product'}</h3>
            <button onclick="shopCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div id="prod-status"></div>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Name *</label>
              <input id="pf-name" type="text" class="field text-sm" placeholder="Product name" value="${esc(p.name||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>
              <textarea id="pf-desc" class="field text-sm" rows="2" placeholder="Optional">${esc(p.description||'')}</textarea></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Price *</label>
                <input id="pf-price" type="number" step="0.01" class="field text-sm" placeholder="0.00" value="${p.price||''}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Compare Price</label>
                <input id="pf-cprice" type="number" step="0.01" class="field text-sm" placeholder="0.00" value="${p.compare_price||''}"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Category</label>
                <select id="pf-cat" class="field text-sm"><option value="">— None —</option>${catOpts}</select></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Stock</label>
                <input id="pf-stock" type="number" class="field text-sm" placeholder="0" value="${p.stock||0}"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Image URL</label>
              <input id="pf-img" type="url" class="field text-sm" placeholder="https://…" value="${esc(p.image_url||'')}"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">SKU</label>
                <input id="pf-sku" type="text" class="field text-sm" placeholder="Optional" value="${esc(p.sku||'')}"></div>
              <div class="flex items-center gap-3 pt-5">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="pf-active" class="w-4 h-4 accent-blue-600" ${(p.active!==false)?'checked':''}> <span class="text-sm text-slate-700">Active</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="pf-featured" class="w-4 h-4 accent-amber-500" ${p.featured?'checked':''}> <span class="text-sm text-slate-700">Featured</span>
                </label>
              </div>
            </div>
          </div>
          <div class="flex gap-3 mt-4">
            <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
            <button onclick="shopSaveProduct('${p.id||''}')" class="btn-primary flex-1"><i class="fas fa-save text-xs mr-1"></i>${isEdit?'Save':'Create'}</button>
          </div>
        </div>`);

      window.shopSaveProduct = async id => {
        const name = document.getElementById('pf-name')?.value.trim();
        if (!name) { const s=document.getElementById('prod-status'); if(s) s.innerHTML='<p class="text-xs text-red-600 mb-2">Name is required.</p>'; return; }
        const data = {
          name, description: document.getElementById('pf-desc')?.value||'',
          price: parseFloat(document.getElementById('pf-price')?.value)||0,
          compare_price: parseFloat(document.getElementById('pf-cprice')?.value)||null,
          category_id: document.getElementById('pf-cat')?.value||null,
          stock: parseInt(document.getElementById('pf-stock')?.value)||0,
          image_url: document.getElementById('pf-img')?.value||null,
          sku: document.getElementById('pf-sku')?.value||null,
          active: document.getElementById('pf-active')?.checked,
          featured: document.getElementById('pf-featured')?.checked,
          track_stock: true,
        };
        if (id) data.id = id;
        await shopDB('shop_products', id?'update':'create', data);
        toast(id?'Product updated':'Product created','success');
        closeModal();
        loadProducts().then(() => renderProducts(document.getElementById('shop-content')));
      };
    }

    if (type === 'category') {
      openModal(`
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-900">New Category</h3>
            <button onclick="shopCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Name *</label>
              <input id="cf-name" type="text" class="field text-sm" placeholder="Category name"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>
              <input id="cf-desc" type="text" class="field text-sm" placeholder="Optional"></div>
          </div>
          <div class="flex gap-3 mt-4">
            <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
            <button onclick="shopSaveCategory()" class="btn-primary flex-1">Create</button>
          </div>
        </div>`);

      window.shopSaveCategory = async () => {
        const name = document.getElementById('cf-name')?.value.trim();
        if (!name) { toast('Name required','error'); return; }
        await shopDB('shop_categories','create',{ name, description:document.getElementById('cf-desc')?.value||'' });
        toast('Category created','success');
        closeModal();
        loadProducts().then(() => renderProducts(document.getElementById('shop-content')));
      };
    }

    if (type === 'discount') {
      openModal(`
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-900">New Discount Code</h3>
            <button onclick="shopCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Code *</label>
              <input id="df-code" type="text" class="field text-sm font-mono" placeholder="SUMMER20"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Type</label>
                <select id="df-type" class="field text-sm"><option value="percent">Percent (%)</option><option value="fixed">Fixed ($)</option></select></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Value *</label>
                <input id="df-value" type="number" step="0.01" class="field text-sm" placeholder="20"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Min Order</label>
                <input id="df-min" type="number" step="0.01" class="field text-sm" placeholder="0.00"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Max Uses</label>
                <input id="df-max" type="number" class="field text-sm" placeholder="Unlimited"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Expires</label>
              <input id="df-exp" type="date" class="field text-sm"></div>
          </div>
          <div class="flex gap-3 mt-4">
            <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
            <button onclick="shopSaveDiscount()" class="btn-primary flex-1">Create Code</button>
          </div>
        </div>`);

      window.shopSaveDiscount = async () => {
        const code = document.getElementById('df-code')?.value.trim().toUpperCase();
        if (!code) { toast('Code is required','error'); return; }
        await shopDB('shop_discounts','create',{
          code, type: document.getElementById('df-type')?.value,
          value: parseFloat(document.getElementById('df-value')?.value)||0,
          min_order: parseFloat(document.getElementById('df-min')?.value)||0,
          max_uses: parseInt(document.getElementById('df-max')?.value)||null,
          expires_at: document.getElementById('df-exp')?.value||null,
          active: true,
        });
        toast('Discount code created','success');
        closeModal();
        loadDiscounts().then(() => renderDiscounts(document.getElementById('shop-content')));
      };
    }
  }

  window.shopShowModal = showModal;

  // ── SETTINGS ─────────────────────────────────────────────────
  function renderSettings(el) {
    el.innerHTML = `
      <div class="max-w-2xl space-y-6">
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 class="font-bold text-slate-900 mb-4">Store Settings</h3>
          <div id="settings-status"></div>
          <div class="space-y-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Store Name</label>
              <input id="ss-name" type="text" class="field text-sm" placeholder="My Store" value="${esc(settings.store_name||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tagline</label>
              <input id="ss-tagline" type="text" class="field text-sm" placeholder="Great products for everyone" value="${esc(settings.store_tagline||'')}"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Currency</label>
                <select id="ss-currency" class="field text-sm">
                  ${['USD','CAD','EUR','GBP','AUD'].map(c => `<option value="${c}"${settings.currency===c?' selected':''}>${c}</option>`).join('')}
                </select></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tax Rate (%)</label>
                <input id="ss-tax" type="number" step="0.01" class="field text-sm" placeholder="0" value="${esc(settings.tax_rate||'')}"></div>
            </div>
          </div>
          <button onclick="shopSaveSettings()" class="btn-primary w-full mt-4 text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Settings
          </button>
        </div>
      </div>`;

    window.shopSaveSettings = async () => {
      const pairs = [
        ['store_name',   document.getElementById('ss-name')?.value||''],
        ['store_tagline',document.getElementById('ss-tagline')?.value||''],
        ['currency',     document.getElementById('ss-currency')?.value||'USD'],
        ['tax_rate',     document.getElementById('ss-tax')?.value||'0'],
      ];
      for (const [key,value] of pairs) {
        await shopDB('shop_settings','upsert',{ key, value, updated_at: new Date().toISOString() });
      }
      const s = document.getElementById('settings-status');
      if (s) s.innerHTML='<div class="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mb-3"><i class="fas fa-check-circle"></i>Settings saved!</div>';
      await loadSettings();
      toast('Settings saved','success');
    };
  }

  // ── Boot ──────────────────────────────────────────────────────
  if (!sdb) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500">
      <i class="fas fa-exclamation-circle text-3xl mb-3 text-amber-400"></i>
      <p class="font-semibold">Supabase not connected</p>
      <p class="text-xs mt-1">This module requires the Supabase adapter to be active</p>
    </div>`;
    return;
  }
  loadSettings().then(renderShell);
};
