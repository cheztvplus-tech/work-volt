// ================================================================
//  WORK VOLT — shop.js  v2.1  (Supabase — fixed)
//  Premium E-Commerce + POS Admin Module
//
//  ⚠️  Requires shop_schema.sql to be run in Supabase first
// ================================================================

window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['shop'] = function(container) {

  // ── Supabase client ────────────────────────────────────────────
  // Self-contained: works whether db-adapter has already loaded the
  // SDK or not. Tries the shared client first, then builds its own.
  let _sdb = null;

  async function getOrCreateSDB() {
  if (_sdb) return _sdb;

  // 1. Use the client already created by db-adapter.js (best case)
  if (window._wvSupabaseClient) {
    _sdb = window._wvSupabaseClient;
    return _sdb;
  }

  // 2. Read credentials from localStorage
  const cfg = JSON.parse(localStorage.getItem('wv_db_config') || '{}');
  const creds = cfg.credentials;
  if (!creds?.url || !creds?.anonKey) {
    throw new Error('No Supabase credentials found. Please configure the database in Settings.');
  }

  // 3. Load the SDK if not already present (with timeout)
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Failed to load Supabase SDK: timeout after 10s. Check if CDN is blocked.'));
      }, 10000);
      
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      s.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load Supabase SDK from CDN'));
      };
      document.head.appendChild(s);
    });
  }

  // 4. Create and cache the client
  _sdb = window.supabase.createClient(creds.url, creds.anonKey);
  window._wvSupabaseClient = _sdb; // share with other modules
  return _sdb;
}

  // Tables without created_at — skip ordering for these
  const NO_CREATED_AT = new Set(['shop_settings', 'shop_categories', 'shop_customers']);

  async function shopDB(table, action, data, filters) {
    const sdb = await getOrCreateSDB();
    if (action === 'list') {
      let q = sdb.from(table).select('*');
      if (filters) Object.entries(filters).forEach(([k,v]) => { if (v !== undefined && v !== null) q = q.eq(k,v); });
      if (!NO_CREATED_AT.has(table)) q = q.order('created_at', { ascending: false });
      const { data: rows, error } = await q;
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
      const { error } = await sdb.from(table).upsert(data, { onConflict: 'key' });
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
      if (activeTab === 'dashboard') { await loadAll();       renderDashboard(c); }
      if (activeTab === 'products')  { await loadProducts();  renderProducts(c);  }
      if (activeTab === 'orders')    { await loadOrders();    renderOrders(c);    }
      if (activeTab === 'customers') { await loadCustomers(); renderCustomers(c); }
      if (activeTab === 'discounts') { await loadDiscounts(); renderDiscounts(c); }
      if (activeTab === 'pos')       { await loadProducts();  renderPOS(c);       }
      if (activeTab === 'settings')  { await loadSettings();  renderSettings(c);  }
    } catch(e) {
      console.error('[Shop renderTab]', e);
      c.innerHTML = `
        <div class="p-8 text-center">
          <i class="fas fa-exclamation-circle text-2xl mb-2 text-red-400"></i>
          <p class="font-semibold text-red-600">${e.message}</p>
          <p class="text-xs text-slate-400 mt-2">Check the browser console. Make sure shop_schema.sql has been run in Supabase.</p>
          <button onclick="shopTab('${activeTab}')" class="mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg">Retry</button>
        </div>`;
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

  // ── MODALS (product / category / discount / banner forms) ──────────────
  function showModal(type, existing, editIdx) {
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
              <input id="pf-name" name="product_name" type="text" class="field text-sm" placeholder="Product name" value="${esc(p.name||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>
              <textarea id="pf-desc" name="description" class="field text-sm" rows="2" placeholder="Optional">${esc(p.description||'')}</textarea></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Price *</label>
                <input id="pf-price" name="price" type="number" step="0.01" class="field text-sm" placeholder="0.00" value="${p.price||''}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Compare Price</label>
                <input id="pf-cprice" name="compare_price" type="number" step="0.01" class="field text-sm" placeholder="0.00" value="${p.compare_price||''}"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Category</label>
                <select id="pf-cat" name="category_id" class="field text-sm"><option value="">— None —</option>${catOpts}</select></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Stock</label>
                <input id="pf-stock" name="stock" type="number" class="field text-sm" placeholder="0" value="${p.stock||0}"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Image URL</label>
              <input id="pf-img" name="image_url" type="url" class="field text-sm" placeholder="https://…" value="${esc(p.image_url||'')}"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">SKU</label>
                <input id="pf-sku" name="sku" type="text" class="field text-sm" placeholder="Optional" value="${esc(p.sku||'')}"></div>
              <div class="flex items-center gap-3 pt-5">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="pf-active" name="active" class="w-4 h-4 accent-blue-600" ${(p.active!==false)?'checked':''}> <span class="text-sm text-slate-700">Active</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="pf-featured" name="featured" class="w-4 h-4 accent-amber-500" ${p.featured?'checked':''}> <span class="text-sm text-slate-700">Featured</span>
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
              <input id="cf-name" name="category_name" type="text" class="field text-sm" placeholder="Category name"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Description</label>
              <input id="cf-desc" name="description" type="text" class="field text-sm" placeholder="Optional"></div>
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
              <input id="df-code" name="discount_code" type="text" class="field text-sm font-mono" placeholder="SUMMER20"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Type</label>
                <select id="df-type" name="discount_type" class="field text-sm"><option value="percent">Percent (%)</option><option value="fixed">Fixed ($)</option></select></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Value *</label>
                <input id="df-value" name="discount_value" type="number" step="0.01" class="field text-sm" placeholder="20"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Min Order</label>
                <input id="df-min" name="min_order" type="number" step="0.01" class="field text-sm" placeholder="0.00"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Max Uses</label>
                <input id="df-max" name="max_uses" type="number" class="field text-sm" placeholder="Unlimited"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Expires</label>
              <input id="df-exp" name="expires_at" type="date" class="field text-sm"></div>
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
    
    // THIS WAS THE PROBLEM - this code was outside the function!
    // Now it's properly inside showModal()
    if (type === 'banner') {
      const b   = existing || {};
      const idx = editIdx !== undefined ? editIdx : -1;
      const isEdit = idx >= 0;

      openModal(`
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-900">${isEdit?'Edit Banner':'New Banner'}</h3>
            <button onclick="shopCloseModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Banner ID (unique, no spaces)</label>
                <input id="bf-id" name="banner_id" type="text" class="field text-sm font-mono" placeholder="summer_sale" value="${esc(b.id||'')}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Style</label>
                <select id="bf-style" name="banner_style" class="field text-sm">
                  ${['hero','solid','strip'].map(s=>`<option value="${s}"${(b.style||'hero')===s?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
                </select></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Title</label>
              <input id="bf-title" name="banner_title" type="text" class="field text-sm" placeholder="Summer Sale — 20% off everything" value="${esc(b.title||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Eyebrow (small text above title)</label>
              <input id="bf-eyebrow" name="banner_eyebrow" type="text" class="field text-sm" placeholder="Limited time" value="${esc(b.eyebrow||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Subtitle</label>
              <input id="bf-subtitle" name="banner_subtitle" type="text" class="field text-sm" placeholder="Free shipping on all orders this weekend" value="${esc(b.subtitle||'')}"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">CTA Button Text</label>
                <input id="bf-cta" name="cta_text" type="text" class="field text-sm" placeholder="Shop Now" value="${esc(b.cta_text||'')}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">CTA Link</label>
                <input id="bf-ctalink" name="cta_link" type="url" class="field text-sm" placeholder="https://…" value="${esc(b.cta_link||'')}"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Background Image URL (hero style)</label>
              <input id="bf-img" name="banner_image" type="url" class="field text-sm" placeholder="https://…" value="${esc(b.image_url||'')}"></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Background Colour / Gradient</label>
                <input id="bf-bg" name="bg_color" type="text" class="field text-sm font-mono" placeholder="#1e3a5f or linear-gradient(…)" value="${esc(b.bg_color||'')}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Text Colour</label>
                <input id="bf-color" name="text_color" type="text" class="field text-sm font-mono" placeholder="#ffffff" value="${esc(b.text_color||'#ffffff')}"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Start Date (optional)</label>
                <input id="bf-start" name="start_date" type="date" class="field text-sm" value="${esc(b.start_date||'')}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">End Date (optional)</label>
                <input id="bf-end" name="end_date" type="date" class="field text-sm" value="${esc(b.end_date||'')}"></div>
            </div>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="bf-active" name="banner_active" class="w-4 h-4 accent-blue-600" ${(b.active===true||b.active==='true')?'checked':''}>
                <span class="text-sm text-slate-700">Active</span>
              </label>
            </div>
          </div>
          <div class="flex gap-3 mt-4">
            <button onclick="shopCloseModal()" class="btn-secondary flex-1">Cancel</button>
            <button onclick="shopSaveBanner(${idx})" class="btn-primary flex-1"><i class="fas fa-save text-xs mr-1"></i>${isEdit?'Save':'Create'}</button>
          </div>
        </div>`);

      window.shopSaveBanner = async function(editIndex) {
        const id = document.getElementById('bf-id')?.value.trim().replace(/\\s+/g,'_');
        if (!id) { toast('Banner ID is required','error'); return; }
        const banner = {
          id,
          style:      document.getElementById('bf-style')?.value    || 'hero',
          title:      document.getElementById('bf-title')?.value    || '',
          eyebrow:    document.getElementById('bf-eyebrow')?.value  || '',
          subtitle:   document.getElementById('bf-subtitle')?.value || '',
          cta_text:   document.getElementById('bf-cta')?.value      || '',
          cta_link:   document.getElementById('bf-ctalink')?.value  || '',
          image_url:  document.getElementById('bf-img')?.value      || '',
          bg_color:   document.getElementById('bf-bg')?.value       || '',
          text_color: document.getElementById('bf-color')?.value    || '#ffffff',
          start_date: document.getElementById('bf-start')?.value    || null,
          end_date:   document.getElementById('bf-end')?.value      || null,
          active:     document.getElementById('bf-active')?.checked,
        };
        let banners = [];
        try { banners = JSON.parse(settings.banners||'[]'); } catch(e){}
        if (editIndex >= 0) banners[editIndex] = banner;
        else banners.push(banner);
        await shopDB('shop_settings','upsert',{ key:'banners', value: JSON.stringify(banners), updated_at: new Date().toISOString() });
        await loadSettings();
        toast(editIndex >= 0 ? 'Banner updated' : 'Banner created','success');
        closeModal();
        renderSettingsPanel();
      };
    }
  }  // <- showModal function ends here

  window.shopShowModal = showModal;

  // ── SETTINGS ─────────────────────────────────────────────────
  let settingsSubTab = 'store';

  function renderSettings(el) {
    const sfUrl = settings.storefront_url || '';
    const tabs = [
      { id:'store',      label:'Store',      icon:'fa-store' },
      { id:'storefront', label:'Storefront', icon:'fa-globe' },
      { id:'appearance', label:'Appearance', icon:'fa-palette' },
      { id:'shipping',   label:'Shipping',   icon:'fa-truck' },
      { id:'payments',   label:'Payments',   icon:'fa-credit-card' },
    ];

    el.innerHTML = `
      <div class="max-w-3xl space-y-4">
        <!-- Sub-tab bar -->
        <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
          ${tabs.map(t => `
            <button onclick="shopSettingsTab('${t.id}')" id="stab-s-${t.id}"
              class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all flex-1 justify-center
                ${settingsSubTab===t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}">
              <i class="fas ${t.icon}"></i><span class="hidden sm:inline">${t.label}</span>
            </button>`).join('')}
        </div>

        <div id="settings-status"></div>
        <div id="settings-panel"></div>
      </div>`;

    window.shopSettingsTab = id => {
      settingsSubTab = id;
      tabs.forEach(t => {
        const b = document.getElementById('stab-s-' + t.id);
        if (b) b.className = 'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all flex-1 justify-center '
          + (t.id === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700');
      });
      renderSettingsPanel();
    };

    renderSettingsPanel();
  }

  function renderSettingsPanel() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    if (settingsSubTab === 'store') {
      panel.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 class="font-bold text-slate-900">Store Identity</h3>
          <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Store Name</label>
            <input id="ss-name" type="text" class="field text-sm" placeholder="My Store" value="${esc(settings.store_name||'')}"></div>
          <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tagline</label>
            <input id="ss-tagline" type="text" class="field text-sm" placeholder="Great products, fast shipping" value="${esc(settings.store_tagline||'')}"></div>
          <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Logo URL</label>
            <input id="ss-logo" type="url" class="field text-sm" placeholder="https://…/logo.png" value="${esc(settings.logo_url||'')}"></div>
          <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Footer Text</label>
            <input id="ss-footer" type="text" class="field text-sm" placeholder="© 2025 My Store" value="${esc(settings.footer_text||'')}"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Currency</label>
              <select id="ss-currency" class="field text-sm">
                ${['USD','CAD','EUR','GBP','AUD'].map(c => `<option value="${c}"${settings.currency===c?' selected':''}>${c}</option>`).join('')}
              </select></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tax Rate (%)</label>
              <input id="ss-tax" type="number" step="0.01" class="field text-sm" placeholder="0" value="${esc(settings.tax_rate||'')}"></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Tax Label (e.g. HST, GST, VAT)</label>
              <input id="ss-taxlabel" type="text" class="field text-sm" placeholder="Tax" value="${esc(settings.tax_label||'')}"></div>
            <div class="flex items-center gap-3 pt-5">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ss-taxinc" class="w-4 h-4 accent-blue-600" ${settings.tax_included==='true'?'checked':''}>
                <span class="text-sm text-slate-700">Tax included in price</span>
              </label>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="ss-maintenance" class="w-4 h-4 accent-red-500" ${settings.maintenance_mode==='true'?'checked':''}>
              <span class="text-sm font-semibold text-red-600">Maintenance Mode (store offline)</span>
            </label>
          </div>
          <button onclick="shopSaveSettings('store')" class="btn-primary w-full mt-2 text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Store Settings
          </button>
        </div>`;
    }

    if (settingsSubTab === 'storefront') {
      const sfUrl = settings.storefront_url || '';
      panel.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="font-bold text-slate-900">Storefront URL</h3>
              <p class="text-xs text-slate-500 mt-0.5">The public URL where your customers shop. Stored in your database — works regardless of filename.</p>
            </div>
            ${sfUrl ? `<a href="${esc(sfUrl)}" target="_blank" class="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 flex-shrink-0"><i class="fas fa-external-link-alt text-xs"></i>Open Store</a>` : ''}
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Storefront URL</label>
            <input id="ss-sfurl" type="url" class="field text-sm" placeholder="https://yourname.github.io/yourrepo/storefront.html"
              value="${esc(sfUrl)}">
            <p class="text-[11px] text-slate-400 mt-1">Paste the full URL to your storefront file here. Saving it enables the Open Store button above.</p>
          </div>
          <button onclick="shopSaveSettings('storefront')" class="btn-primary w-full text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Storefront URL
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 mt-4">
          <h3 class="font-bold text-slate-900">Layout Order</h3>
          <p class="text-xs text-slate-500">Drag sections in the storefront or set the order manually. Enter section IDs comma-separated.</p>
          <div>
            <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Section order (comma-separated IDs)</label>
            <input id="ss-layout" type="text" class="field text-sm font-mono"
              placeholder="hero,featured,trending,all_products"
              value="${esc(settings.layout_order ? JSON.parse(settings.layout_order||'[]').join(',') : 'hero,featured,trending,all_products')}">
            <p class="text-[11px] text-slate-400 mt-1">Built-in IDs: <code>hero</code> · <code>featured</code> · <code>trending</code> · <code>all_products</code>. Add <code>banner_YOURID</code> to insert a banner at that position.</p>
          </div>
          <button onclick="shopSaveSettings('layout')" class="btn-primary w-full text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Layout
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 mt-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900">Banners</h3>
              <p class="text-xs text-slate-500 mt-0.5">Promotional banners shown between layout sections.</p>
            </div>
            <button onclick="shopShowModal('banner')" class="btn-secondary text-xs px-3 py-1.5"><i class="fas fa-plus text-xs mr-1"></i>Add Banner</button>
          </div>
          ${renderBannerList()}
        </div>`;
    }

    if (settingsSubTab === 'appearance') {
      panel.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 class="font-bold text-slate-900">Theme Colours</h3>
          <p class="text-xs text-slate-500">These override the default CSS variables in storefront.html in real time.</p>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Primary Colour</label>
              <div class="flex gap-2"><input type="color" id="ss-primary" class="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5" value="${settings.primary_color||'#2563eb'}">
              <input type="text" id="ss-primary-t" class="field text-sm flex-1 font-mono" value="${esc(settings.primary_color||'#2563eb')}" oninput="document.getElementById('ss-primary').value=this.value"></div></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Accent Colour</label>
              <div class="flex gap-2"><input type="color" id="ss-accent" class="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5" value="${settings.accent_color||'#f59e0b'}">
              <input type="text" id="ss-accent-t" class="field text-sm flex-1 font-mono" value="${esc(settings.accent_color||'#f59e0b')}" oninput="document.getElementById('ss-accent').value=this.value"></div></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Background</label>
              <div class="flex gap-2"><input type="color" id="ss-bg" class="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5" value="${settings.background_color||'#f8fafc'}">
              <input type="text" id="ss-bg-t" class="field text-sm flex-1 font-mono" value="${esc(settings.background_color||'#f8fafc')}" oninput="document.getElementById('ss-bg').value=this.value"></div></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Text Colour</label>
              <div class="flex gap-2"><input type="color" id="ss-text" class="w-10 h-9 rounded border border-slate-200 cursor-pointer p-0.5" value="${settings.text_color||'#0f172a'}">
              <input type="text" id="ss-text-t" class="field text-sm flex-1 font-mono" value="${esc(settings.text_color||'#0f172a')}" oninput="document.getElementById('ss-text').value=this.value"></div></div>
          </div>
          <button onclick="shopSaveSettings('appearance')" class="btn-primary w-full mt-2 text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Appearance
          </button>
        </div>`;

      // Sync colour picker ↔ text input
      ['primary','accent','bg','text'].forEach(k => {
        const picker = document.getElementById('ss-'+k);
        const txt    = document.getElementById('ss-'+k+'-t');
        if (picker && txt) picker.addEventListener('input', () => { txt.value = picker.value; });
      });
    }

    if (settingsSubTab === 'shipping') {
      panel.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 class="font-bold text-slate-900">Shipping</h3>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="ss-shipenabled" class="w-4 h-4 accent-blue-600" ${settings.shipping_enabled==='true'?'checked':''}>
              <span class="text-sm text-slate-700 font-semibold">Enable shipping charges</span>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Flat Shipping Rate</label>
              <input id="ss-shiprate" type="number" step="0.01" class="field text-sm" placeholder="9.99" value="${esc(settings.shipping_rate||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Free Shipping Minimum</label>
              <input id="ss-freemin" type="number" step="0.01" class="field text-sm" placeholder="75.00" value="${esc(settings.free_shipping_min||'')}"></div>
          </div>
          <button onclick="shopSaveSettings('shipping')" class="btn-primary w-full mt-2 text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Shipping
          </button>
        </div>`;
    }

    if (settingsSubTab === 'payments') {
      panel.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 class="font-bold text-slate-900">Payment Methods</h3>
          <p class="text-xs text-slate-500">Enable the methods you accept. Customers will only see enabled options at checkout.</p>

          <div class="space-y-3">
            <div class="p-3 border border-slate-200 rounded-xl space-y-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ss-paypal" class="w-4 h-4 accent-blue-600" ${settings.paypal_enabled==='true'?'checked':''}>
                <span class="text-sm font-semibold">🅿 PayPal</span>
              </label>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">PayPal Client ID (optional — for redirect flow)</label>
                <input id="ss-paypalid" type="text" class="field text-sm" placeholder="AYour-PayPal-Client-ID" value="${esc(settings.paypal_client_id||'')}"></div>
            </div>

            <div class="p-3 border border-slate-200 rounded-xl">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ss-stripe" class="w-4 h-4 accent-blue-600" ${settings.stripe_enabled==='true'?'checked':''}>
                <span class="text-sm font-semibold">💳 Credit / Debit Card (Stripe)</span>
              </label>
            </div>

            <div class="p-3 border border-slate-200 rounded-xl space-y-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ss-interac" class="w-4 h-4 accent-blue-600" ${settings.interac_enabled==='true'?'checked':''}>
                <span class="text-sm font-semibold">🏦 Interac e-Transfer</span>
              </label>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Interac Destination Email</label>
                <input id="ss-interacemail" type="email" class="field text-sm" placeholder="payments@yourstore.com" value="${esc(settings.interac_email||'')}"></div>
              <div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Instructions shown to customer (optional)</label>
                <textarea id="ss-interacmsg" class="field text-sm" rows="2" placeholder="Send to payments@yourstore.com with your order number">${esc(settings.interac_message||'')}</textarea></div>
            </div>

            <div class="p-3 border border-slate-200 rounded-xl">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ss-cash" class="w-4 h-4 accent-blue-600" ${settings.cash_enabled==='true'?'checked':''}>
                <span class="text-sm font-semibold">💵 Cash on Pickup</span>
              </label>
            </div>
          </div>

          <button onclick="shopSaveSettings('payments')" class="btn-primary w-full text-sm">
            <i class="fas fa-save text-xs mr-1"></i>Save Payment Settings
          </button>
        </div>`;
    }
  }

  function renderBannerList() {
    let banners = [];
    try { banners = JSON.parse(settings.banners||'[]'); } catch(e){}
    if (!banners.length) return '<p class="text-xs text-slate-400 py-2">No banners yet. Add one above and place its ID in the layout order.</p>';
    return '<div class="space-y-2">' + banners.map((b,i) => `
      <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-slate-900 truncate">${esc(b.title||'(no title)')}</p>
          <p class="text-xs text-slate-400">ID: <code class="font-mono">${esc(b.id)}</code> · Style: ${esc(b.style||'hero')} · ${b.active==='true'||b.active===true?'<span class="text-green-600">Active</span>':'<span class="text-slate-400">Inactive</span>'}</p>
        </div>
        <button onclick="shopEditBanner(${i})" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 text-xs"><i class="fas fa-pencil"></i></button>
        <button onclick="shopDeleteBanner(${i})" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs"><i class="fas fa-trash"></i></button>
      </div>`).join('') + '</div>';
  }

  window.shopSaveSettings = async (section) => {
    let pairs = [];

    if (section === 'store') {
      pairs = [
        ['store_name',      document.getElementById('ss-name')?.value||''],
        ['store_tagline',   document.getElementById('ss-tagline')?.value||''],
        ['logo_url',        document.getElementById('ss-logo')?.value||''],
        ['footer_text',     document.getElementById('ss-footer')?.value||''],
        ['currency',        document.getElementById('ss-currency')?.value||'USD'],
        ['tax_rate',        document.getElementById('ss-tax')?.value||'0'],
        ['tax_label',       document.getElementById('ss-taxlabel')?.value||''],
        ['tax_included',    document.getElementById('ss-taxinc')?.checked ? 'true' : 'false'],
        ['maintenance_mode',document.getElementById('ss-maintenance')?.checked ? 'true' : 'false'],
      ];
    }
    if (section === 'storefront') {
      const rawLayout = document.getElementById('ss-layout')?.value||'hero,featured,trending,all_products';
      const layoutArr = rawLayout.split(',').map(s=>s.trim()).filter(Boolean);
      pairs = [
        ['storefront_url', document.getElementById('ss-sfurl')?.value||''],
        ['layout_order',   JSON.stringify(layoutArr)],
      ];
    }
    if (section === 'layout') {
      const rawLayout = document.getElementById('ss-layout')?.value||'hero,featured,trending,all_products';
      const layoutArr = rawLayout.split(',').map(s=>s.trim()).filter(Boolean);
      pairs = [['layout_order', JSON.stringify(layoutArr)]];
    }
    if (section === 'appearance') {
      pairs = [
        ['primary_color',    document.getElementById('ss-primary-t')?.value || document.getElementById('ss-primary')?.value || ''],
        ['accent_color',     document.getElementById('ss-accent-t')?.value  || document.getElementById('ss-accent')?.value  || ''],
        ['background_color', document.getElementById('ss-bg-t')?.value      || document.getElementById('ss-bg')?.value      || ''],
        ['text_color',       document.getElementById('ss-text-t')?.value    || document.getElementById('ss-text')?.value    || ''],
      ];
    }
    if (section === 'shipping') {
      pairs = [
        ['shipping_enabled',  document.getElementById('ss-shipenabled')?.checked ? 'true' : 'false'],
        ['shipping_rate',     document.getElementById('ss-shiprate')?.value||'0'],
        ['free_shipping_min', document.getElementById('ss-freemin')?.value||'0'],
      ];
    }
    if (section === 'payments') {
      pairs = [
        ['paypal_enabled',   document.getElementById('ss-paypal')?.checked    ? 'true' : 'false'],
        ['paypal_client_id', document.getElementById('ss-paypalid')?.value    || ''],
        ['stripe_enabled',   document.getElementById('ss-stripe')?.checked    ? 'true' : 'false'],
        ['interac_enabled',  document.getElementById('ss-interac')?.checked   ? 'true' : 'false'],
        ['interac_email',    document.getElementById('ss-interacemail')?.value || ''],
        ['interac_message',  document.getElementById('ss-interacmsg')?.value  || ''],
        ['cash_enabled',     document.getElementById('ss-cash')?.checked      ? 'true' : 'false'],
      ];
    }

    for (const [key,value] of pairs) {
      await shopDB('shop_settings','upsert',{ key, value, updated_at: new Date().toISOString() });
    }
    await loadSettings();
    const s = document.getElementById('settings-status');
    if (s) {
      s.innerHTML='<div class="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mb-3"><i class="fas fa-check-circle"></i>Settings saved! The storefront will pick up changes within 60 seconds.</div>';
      setTimeout(()=>{ if(s) s.innerHTML=''; }, 5000);
    }
    toast('Settings saved','success');
    // Re-render to reflect new values
    renderSettingsPanel();
  };

  window.shopEditBanner = idx => {
    let banners = [];
    try { banners = JSON.parse(settings.banners||'[]'); } catch(e){}
    showModal('banner', banners[idx], idx);
  };

  window.shopDeleteBanner = async idx => {
    if (!confirm('Delete this banner?')) return;
    let banners = [];
    try { banners = JSON.parse(settings.banners||'[]'); } catch(e){}
    banners.splice(idx,1);
    await shopDB('shop_settings','upsert',{ key:'banners', value: JSON.stringify(banners), updated_at: new Date().toISOString() });
    await loadSettings();
    toast('Banner deleted','info');
    renderSettingsPanel();
  };

  // ── Boot ──────────────────────────────────────────────────────
(async () => {
  // Show a loading indicator while we boot
  container.innerHTML = `
    <div class="flex items-center justify-center h-64" id="shop-boot-msg">
      <div class="text-center">
        <i class="fas fa-circle-notch fa-spin text-3xl text-blue-500 mb-3"></i>
        <p class="text-sm text-slate-500">Connecting to database…</p>
        <p class="text-xs text-slate-400 mt-2" id="shop-boot-detail">Initializing…</p>
      </div>
    </div>`;

  const setDetail = (msg) => {
    const el = document.getElementById('shop-boot-detail');
    if (el) el.textContent = msg;
  };

  // Helper: timeout wrapper for promises
  const withTimeout = (promise, ms, label) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      )
    ]);
  };

  try {
    // Check if we have credentials first (fast fail)
    const cfg = JSON.parse(localStorage.getItem('wv_db_config') || '{}');
    if (!cfg.credentials?.url || !cfg.credentials?.anonKey) {
      throw new Error('No Supabase credentials found. Please configure the database in Settings.');
    }

    setDetail('Loading Supabase SDK…');
    
    // Initialize Supabase with timeout
    await withTimeout(getOrCreateSDB(), 15000, 'Database connection');
    
    setDetail('Loading settings…');
    
    // Load settings with timeout
    await withTimeout(loadSettings(), 10000, 'Settings load');
    
    setDetail('Rendering…');
    renderShell();
    
  } catch(e) {
    console.error('[Shop boot]', e);
    
    // Determine user-friendly message
    let title = 'Failed to load shop';
    let message = e.message;
    let isConfigError = false;
    
    if (e.message.includes('credentials') || e.message.includes('No Supabase')) {
      title = 'Database not configured';
      message = 'Please configure your Supabase credentials in Settings first.';
      isConfigError = true;
    } else if (e.message.includes('timed out')) {
      title = 'Connection timed out';
      message = 'The database is taking too long to respond. Check your internet connection and Supabase status.';
    } else if (e.message.includes('Failed to load Supabase SDK')) {
      title = 'Failed to load database SDK';
      message = 'Could not load Supabase from CDN. Check if CDN is blocked by your network.';
    } else if (e.message.includes('shop_settings') || e.message.includes('relation') || e.message.includes('does not exist')) {
      title = 'Database schema missing';
      message = 'The shop tables are not set up. Please run shop_schema.sql in your Supabase SQL Editor.';
    }
    
    container.innerHTML = `
      <div class="p-8 text-center">
        <i class="fas fa-${isConfigError ? 'plug' : 'exclamation-circle'} text-3xl mb-3 ${isConfigError ? 'text-amber-400' : 'text-red-400'}"></i>
        <p class="font-semibold text-slate-700">${title}</p>
        <p class="text-xs text-slate-500 mt-2 font-mono bg-slate-50 rounded p-2 max-w-md mx-auto">${esc(message)}</p>
        ${e.message.includes('timed out') || e.message.includes('Failed to load') ? `
          <button onclick="window.WorkVolt?.navigate('shop')" class="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
            <i class="fas fa-redo text-xs mr-1"></i>Retry
          </button>
        ` : ''}
        ${isConfigError ? `
          <button onclick="window.WorkVolt?.navigate('settings')" class="mt-3 px-4 py-2 bg-slate-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-700">
            <i class="fas fa-cog text-xs mr-1"></i>Open Settings
          </button>
        ` : ''}
      </div>`;
  }
})();

};
