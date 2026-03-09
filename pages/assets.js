window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['assets'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  var state = {
    tab:          'dashboard',
    assets:       [],
    categories:   [],
    types:        [],
    users:        [],
    assignments:  [],
    maintenance:  [],
    consumables:  [],
    depreciation: [],
    documents:    [],
    alerts:       [],
    dashboard:    {},
    loading:      false,
    search:       '',
    filterStatus: '',
    filterCat:    '',
    modal:        null,   // { type, data }
  };

  var api = WorkVolt.api;
  var toast = WorkVolt.toast;

  // ── Lifecycle / status config ──────────────────────────────────
  var STATUS_CFG = {
    'Available':   { cls: 'bg-emerald-100 text-emerald-700',  dot: 'bg-emerald-500' },
    'Assigned':    { cls: 'bg-blue-100 text-blue-700',        dot: 'bg-blue-500' },
    'Maintenance': { cls: 'bg-amber-100 text-amber-700',      dot: 'bg-amber-500' },
    'Retired':     { cls: 'bg-slate-100 text-slate-500',      dot: 'bg-slate-400' },
    'Disposed':    { cls: 'bg-red-100 text-red-600',          dot: 'bg-red-500' },
  };
  var CONDITION_CFG = {
    'New':     'bg-emerald-100 text-emerald-700',
    'Good':    'bg-blue-100 text-blue-700',
    'Fair':    'bg-amber-100 text-amber-700',
    'Damaged': 'bg-red-100 text-red-600',
  };
  var ALERT_LEVEL = {
    warning: { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: 'fa-triangle-exclamation text-amber-500' },
    error:   { cls: 'bg-red-50 border-red-200 text-red-800',       icon: 'fa-circle-exclamation text-red-500' },
    info:    { cls: 'bg-blue-50 border-blue-200 text-blue-800',    icon: 'fa-info-circle text-blue-500' },
  };

  // ── Helpers ────────────────────────────────────────────────────
  function badge(label, cfg) {
    cfg = cfg || {};
    var cls = cfg.cls || 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' + cls + '">'
      + (cfg.dot ? '<span class="w-1.5 h-1.5 rounded-full ' + cfg.dot + '"></span>' : '')
      + label + '</span>';
  }
  function statusBadge(s) { return badge(s || '—', STATUS_CFG[s] || {}); }
  function condBadge(c)   { return '<span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + (CONDITION_CFG[c] || 'bg-slate-100 text-slate-500') + '">' + (c || '—') + '</span>'; }
  function fmtDate(d)     { if (!d) return '—'; try { return new Date(d).toLocaleDateString(); } catch(e) { return d; } }
  function fmtMoney(v)    { var n = parseFloat(v); return isNaN(n) ? '—' : '$' + n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function esc(s)         { return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  // Resolve user display name from ID or raw string
  function getUserName(idOrName) {
    if (!idOrName) return '—';
    var u = state.users.find(function(u){ return (u.user_id||u.id||'') === idOrName; });
    if (u) return u.name || u.email || idOrName;
    return idOrName; // fallback: already a name or unknown
  }

  // Render a rich asset cell: name (bold) + id · SN sub-line
  function assetCell(assetId) {
    if (!assetId) return '<span class="text-slate-400">—</span>';
    var a = state.assets.find(function(a){ return a.asset_id === assetId; });
    if (!a) return '<span class="font-mono text-xs text-slate-500">' + esc(assetId) + '</span>';
    return '<div class="font-semibold text-slate-900">' + esc(a.asset_name) + '</div>'
      + '<div class="text-xs text-slate-400 font-mono mt-0.5">asset id: ' + esc(a.asset_id)
      + (a.serial_number ? ' · SN: ' + esc(a.serial_number) : '') + '</div>';
  }

  // Build an asset searchable combobox for modals (replaces plain text input)
  // Returns HTML string; id prefix used for the hidden input and visible input
  function assetComboField(label, presetId, required) {
    var presetAsset = presetId ? state.assets.find(function(a){ return a.asset_id === presetId; }) : null;
    var displayVal  = presetAsset ? presetAsset.asset_name + ' (' + presetAsset.asset_id + ')' : (presetId || '');
    return '<div class="relative">'
      + '<label class="block text-xs font-semibold text-slate-600 mb-1.5">' + label
      + (required ? ' <span class="text-red-500">*</span>' : '') + '</label>'
      + '<input id="f-asset_search" type="text" autocomplete="off" placeholder="Search or type asset ID..." class="field"'
      + ' value="' + esc(displayVal) + '">'
      + '<input type="hidden" id="f-asset_id" value="' + esc(presetId||'') + '">'
      + '<div id="asset-asset-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 z-[9999] bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto"></div>'
      + '</div>';
  }

  function emptyState(icon, msg, sub) {
    return '<div class="flex flex-col items-center justify-center py-20 text-center">'
      + '<div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">'
      + '<i class="fas ' + icon + ' text-slate-400 text-2xl"></i></div>'
      + '<p class="font-semibold text-slate-700 mb-1">' + msg + '</p>'
      + '<p class="text-sm text-slate-400">' + sub + '</p></div>';
  }

  function loader() {
    return '<div class="flex items-center justify-center py-16"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i></div>';
  }

  function tabBtn(id, icon, label) {
    var active = state.tab === id;
    return '<button onclick="assetTab(\'' + id + '\')" class="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all whitespace-nowrap '
      + (active ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-600 hover:bg-slate-100') + '">'
      + '<i class="fas ' + icon + ' text-' + (active ? 'white' : 'slate-400') + ' text-xs"></i>'
      + label + '</button>';
  }

  // ── Category / Type seed data (fallback if sheets not ready) ──
  var CAT_SEEDS = [
    'Computers','Vehicles','Office Equipment','Furniture',
    'Consumables','Tools','Networking','Electronics','Studio Equipment','Other'
  ];
  var TYPE_SEEDS = [
    {category:'Computers',        type:'Laptop'},
    {category:'Computers',        type:'Desktop'},
    {category:'Computers',        type:'Monitor'},
    {category:'Computers',        type:'Tablet'},
    {category:'Vehicles',         type:'Car'},
    {category:'Vehicles',         type:'Truck'},
    {category:'Vehicles',         type:'Forklift'},
    {category:'Vehicles',         type:'Van'},
    {category:'Office Equipment', type:'Printer'},
    {category:'Office Equipment', type:'Phone'},
    {category:'Office Equipment', type:'Scanner'},
    {category:'Furniture',        type:'Desk'},
    {category:'Furniture',        type:'Chair'},
    {category:'Furniture',        type:'Cabinet'},
    {category:'Consumables',      type:'Pen'},
    {category:'Consumables',      type:'Paper'},
    {category:'Consumables',      type:'Toner'},
    {category:'Tools',            type:'Power Drill'},
    {category:'Networking',       type:'Router'},
    {category:'Networking',       type:'Switch'},
    {category:'Electronics',      type:'Cell Phone'},
    {category:'Electronics',      type:'TV'},
    {category:'Electronics',      type:'Headphones'},
    {category:'Electronics',      type:'Keyboard'},
    {category:'Studio Equipment', type:'Microphone'},
    {category:'Studio Equipment', type:'Camera'},
    {category:'Studio Equipment', type:'Audio Interface'},
    {category:'Studio Equipment', type:'Lighting'},
    {category:'Studio Equipment', type:'Speaker'},
    {category:'Other',            type:'Other'},
  ];

  // ── Data loaders ───────────────────────────────────────────────
  async function loadAll() {
    state.loading = true;
    render();

    // Install sheets if missing, then load all data — each call isolated
    var [assets, cats, types, alerts, dash, usersRes] = await Promise.all([
      api('assets/list').catch(function(e){ if (e.message === 'Session expired') throw e; return {}; }),
      api('assets/categories').catch(function(e){ if (e.message === 'Session expired') throw e; return {}; }),
      api('assets/types').catch(function(e){ if (e.message === 'Session expired') throw e; return {}; }),
      api('assets/alerts').catch(function(e){ if (e.message === 'Session expired') throw e; return {}; }),
      api('assets/dashboard').catch(function(e){ if (e.message === 'Session expired') throw e; return {}; }),
      api('users/list').catch(function(e){ if (e.message === 'Session expired') throw e; return {}; }),
    ]);

    state.assets    = assets.rows   || [];
    state.alerts    = alerts.alerts || [];
    state.dashboard = dash          || {};
    state.users     = usersRes.users || usersRes.rows || [];

    // Use sheet data if available, otherwise use hardcoded seeds
    state.categories = (cats.rows && cats.rows.length)
      ? cats.rows
      : CAT_SEEDS.map(function(c, i) { return { category_id: 'CAT' + String(i+1).padStart(3,'0'), category: c }; });

    state.types = (types.rows && types.rows.length)
      ? types.rows
      : TYPE_SEEDS;

    state.loading = false;
    render();
  }

  async function loadAssignments() {
    try {
      var r = await api('assets/assignments/list');
      state.assignments = r.rows || [];
    } catch(e) { toast(e.message, 'error'); }
    render();
  }

  async function loadMaintenance() {
    try {
      var r = await api('assets/maintenance/list');
      state.maintenance = r.rows || [];
    } catch(e) { toast(e.message, 'error'); }
    render();
  }

  async function loadConsumables() {
    try {
      var r = await api('assets/consumables/list');
      state.consumables = r.rows || [];
    } catch(e) { toast(e.message, 'error'); }
    render();
  }

  async function loadDepreciation() {
    try {
      var r = await api('assets/depreciation/list');
      state.depreciation = r.rows || [];
    } catch(e) { toast(e.message, 'error'); }
    render();
  }

  async function loadDocuments() {
    try {
      var r = await api('assets/documents/list');
      state.documents = r.rows || [];
    } catch(e) { toast(e.message, 'error'); }
    render();
  }

  // ── Tab switch ─────────────────────────────────────────────────
  window.assetTab = function(tab) {
    state.tab = tab;
    state.search = '';
    state.filterStatus = '';
    state.filterCat = '';
    render();
    if (tab === 'assignments' && !state.assignments.length) loadAssignments();
    if (tab === 'maintenance' && !state.maintenance.length) loadMaintenance();
    if (tab === 'consumables' && !state.consumables.length) loadConsumables();
    if (tab === 'depreciation' && !state.depreciation.length) loadDepreciation();
    if (tab === 'documents'   && !state.documents.length)   loadDocuments();
  };

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    container.innerHTML = buildPage();
    bindEvents();
  }

  function buildPage() {
    var alertCount = state.alerts.length;
    return '<div class="flex flex-col h-full">'

      // ── Header
      + '<div class="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">'
      +   '<div class="flex items-center justify-between mb-4">'
      +     '<div>'
      +       '<h1 class="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">'
      +         '<div class="w-9 h-9 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl flex items-center justify-center shadow-sm">'
      +           '<i class="fas fa-box-open text-white text-sm"></i></div>Asset Management</h1>'
      +       '<p class="text-slate-500 text-sm mt-0.5 ml-11">Track, assign & maintain your company assets</p>'
      +     '</div>'
      +     '<div class="flex items-center gap-2">'
      +       (alertCount ? '<button onclick="assetTab(\'dashboard\')" class="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors">'
      +         '<i class="fas fa-triangle-exclamation"></i>' + alertCount + ' Alert' + (alertCount > 1 ? 's' : '') + '</button>' : '')
      +       '<button onclick="assetRunSetup()" class="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold rounded-xl hover:bg-violet-100 transition-colors"><i class="fas fa-database mr-1"></i>Setup Sheets</button>'
      +       '<button onclick="assetOpenModal(\'asset\',null)" class="btn-primary"><i class="fas fa-plus text-xs"></i>Add Asset</button>'
      +     '</div>'
      +   '</div>'

      // ── Tab bar
      +   '<div class="flex gap-1 overflow-x-auto thin-scroll pb-0.5">'
      +     tabBtn('dashboard',   'fa-chart-bar',        'Dashboard')
      +     tabBtn('assets',      'fa-box-open',         'Assets')
      +     tabBtn('assignments', 'fa-user-tag',         'Assignments')
      +     tabBtn('maintenance', 'fa-wrench',           'Maintenance')
      +     tabBtn('consumables', 'fa-cubes',            'Consumables')
      +     tabBtn('depreciation','fa-chart-line-down',  'Depreciation')
      +     tabBtn('documents',   'fa-file-alt',         'Documents')
      +   '</div>'
      + '</div>'

      // ── Content
      + '<div class="flex-1 overflow-y-auto thin-scroll">'
      +   (state.loading ? loader() : buildTab())
      + '</div>'

      // ── Modal
      + buildModal()
      + '</div>';
  }

  function buildTab() {
    switch(state.tab) {
      case 'dashboard':   return buildDashboard();
      case 'assets':      return buildAssets();
      case 'assignments': return buildAssignments();
      case 'maintenance': return buildMaintenance();
      case 'consumables': return buildConsumables();
      case 'depreciation':return buildDepreciation();
      case 'documents':   return buildDocuments();
      default:            return '';
    }
  }

  // ── DASHBOARD ──────────────────────────────────────────────────
  function buildDashboard() {
    var d  = state.dashboard;
    var stats = [
      { label:'Total Assets',        val: d.total            || 0, icon:'fa-box-open',         color:'from-slate-600 to-slate-800' },
      { label:'Assigned',            val: d.assigned         || 0, icon:'fa-user-tag',          color:'from-blue-500 to-blue-700' },
      { label:'Available',           val: d.available        || 0, icon:'fa-check-circle',      color:'from-emerald-500 to-teal-600' },
      { label:'In Maintenance',      val: d.maintenance      || 0, icon:'fa-wrench',            color:'from-amber-500 to-orange-500' },
      { label:'Retired',             val: d.retired          || 0, icon:'fa-archive',           color:'from-slate-400 to-slate-500' },
      { label:'Warranty Expiring',   val: d.warranty_expiring|| 0, icon:'fa-shield-exclamation',color:'from-red-500 to-rose-600' },
    ];

    var html = '<div class="p-6 space-y-6 fade-in">';

    // Stat cards
    html += '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">';
    stats.forEach(function(s) {
      html += '<div class="bg-white border border-slate-200 rounded-2xl p-4 card-hover">'
        + '<div class="w-9 h-9 bg-gradient-to-br ' + s.color + ' rounded-xl flex items-center justify-center mb-3">'
        + '<i class="fas ' + s.icon + ' text-white text-sm"></i></div>'
        + '<p class="text-2xl font-extrabold text-slate-900">' + s.val + '</p>'
        + '<p class="text-xs text-slate-500 font-medium mt-0.5">' + s.label + '</p>'
        + '</div>';
    });
    html += '</div>';

    // Alerts
    if (state.alerts.length) {
      html += '<div>'
        + '<h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">'
        + '<i class="fas fa-bell text-amber-500"></i>Active Alerts</h2>'
        + '<div class="space-y-2">';
      state.alerts.forEach(function(a) {
        var cfg = ALERT_LEVEL[a.level] || ALERT_LEVEL.info;
        html += '<div class="flex items-center gap-3 px-4 py-3 rounded-xl border ' + cfg.cls + '">'
          + '<i class="fas ' + cfg.icon + ' flex-shrink-0"></i>'
          + '<span class="text-sm font-medium flex-1">' + esc(a.message) + '</span>'
          + (a.date ? '<span class="text-xs opacity-60">' + fmtDate(a.date) + '</span>' : '')
          + '</div>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">'
        + '<i class="fas fa-check-circle text-emerald-500 text-lg"></i>'
        + '<p class="text-sm font-semibold text-emerald-700">All clear — no active alerts</p></div>';
    }

    // By category breakdown
    var byCat = d.by_category || {};
    var catKeys = Object.keys(byCat);
    if (catKeys.length) {
      html += '<div class="bg-white border border-slate-200 rounded-2xl p-5">'
        + '<h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Assets by Category</h2>'
        + '<div class="space-y-3">';
      var total = d.total || 1;
      catKeys.forEach(function(k) {
        var pct = Math.round((byCat[k] / total) * 100);
        html += '<div>'
          + '<div class="flex justify-between text-sm mb-1.5">'
          + '<span class="font-medium text-slate-700">' + esc(k) + '</span>'
          + '<span class="text-slate-500">' + byCat[k] + ' <span class="text-slate-400 text-xs">(' + pct + '%)</span></span>'
          + '</div>'
          + '<div class="h-2 bg-slate-100 rounded-full overflow-hidden">'
          + '<div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style="width:' + pct + '%"></div>'
          + '</div></div>';
      });
      html += '</div></div>';
    }

    // Maintenance cost
    if (d.total_maint_cost) {
      html += '<div class="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">'
        + '<div class="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">'
        + '<i class="fas fa-wrench text-white"></i></div>'
        + '<div><p class="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Maintenance Cost</p>'
        + '<p class="text-2xl font-extrabold text-slate-900">' + fmtMoney(d.total_maint_cost) + '</p></div>'
        + '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── ASSETS TABLE ───────────────────────────────────────────────
  function buildAssets() {
    var rows = state.assets.filter(function(r) {
      var q = state.search.toLowerCase();
      var matchQ  = !q || (r.asset_name||'').toLowerCase().includes(q)
                       || (r.asset_id||'').toLowerCase().includes(q)
                       || (r.serial_number||'').toLowerCase().includes(q)
                       || (r.brand||'').toLowerCase().includes(q);
      var matchS  = !state.filterStatus || r.status === state.filterStatus;
      var matchC  = !state.filterCat    || r.category === state.filterCat;
      return matchQ && matchS && matchC;
    });

    var catOptions = '<option value="">All Categories</option>'
      + state.categories.map(function(c){ return '<option value="' + esc(c.category) + '" ' + (state.filterCat===c.category?'selected':'') + '>' + esc(c.category) + '</option>'; }).join('');
    var statusOptions = '<option value="">All Statuses</option>'
      + ['Available','Assigned','Maintenance','Retired','Disposed'].map(function(s){
          return '<option value="' + s + '" ' + (state.filterStatus===s?'selected':'') + '>' + s + '</option>';
        }).join('');

    var html = '<div class="p-6 fade-in">'
      + '<div class="flex flex-col md:flex-row gap-3 mb-5">'
      + '<div class="relative flex-1"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>'
      + '<input id="asset-search" type="text" placeholder="Search assets..." value="' + esc(state.search) + '" class="field pl-9"></div>'
      + '<select id="asset-filter-cat" class="field md:w-48">' + catOptions + '</select>'
      + '<select id="asset-filter-status" class="field md:w-44">' + statusOptions + '</select>'
      + '</div>';

    if (!rows.length) {
      html += emptyState('fa-box-open', 'No assets found', 'Add your first asset or adjust your filters');
    } else {
      html += '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">'
        + '<div class="overflow-x-auto">'
        + '<table class="w-full text-sm">'
        + '<thead><tr class="border-b border-slate-100 bg-slate-50">'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Asset</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Category / Type</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Assigned To</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden xl:table-cell">Warranty</th>'
        + '<th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>'
        + '</tr></thead><tbody>';
      rows.forEach(function(r) {
        var nowMs = Date.now();
        var warnWar = r.warranty_expiry && (new Date(r.warranty_expiry) - nowMs) < 30*24*60*60*1000 && new Date(r.warranty_expiry) > nowMs;
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">'
          + '<td class="px-4 py-3.5"><div class="font-semibold text-slate-900">' + esc(r.asset_name) + '</div>'
          + '<div class="text-xs text-slate-400 font-mono mt-0.5">' + esc(r.asset_id) + (r.serial_number ? ' · SN: '+esc(r.serial_number) : '') + '</div></td>'
          + '<td class="px-4 py-3.5 hidden md:table-cell"><div class="text-slate-700">' + esc(r.category||'—') + '</div><div class="text-xs text-slate-400">' + esc(r.asset_type||'') + '</div></td>'
          + '<td class="px-4 py-3.5">' + statusBadge(r.status) + '<div class="mt-1">' + condBadge(r.condition) + '</div></td>'
          + '<td class="px-4 py-3.5 hidden lg:table-cell text-slate-600 text-sm">' + esc(getUserName(r.assigned_to)) + '</td>'
          + '<td class="px-4 py-3.5 hidden xl:table-cell text-sm ' + (warnWar?'text-amber-600 font-semibold':'text-slate-500') + '">'
          + (r.warranty_expiry ? (warnWar?'<i class="fas fa-triangle-exclamation mr-1"></i>':'')+fmtDate(r.warranty_expiry) : '—') + '</td>'
          + '<td class="px-4 py-3.5"><div class="flex items-center justify-end gap-1">'
          + '<button onclick="assetOpenModal(\'asset\',\'' + esc(r.asset_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit"><i class="fas fa-pen text-xs"></i></button>'
          + (r.status === 'Available' ? '<button onclick="assetOpenModal(\'assign\',\'' + esc(r.asset_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Assign"><i class="fas fa-user-plus text-xs"></i></button>' : '')
          + (r.status !== 'Retired' ? '<button onclick="assetRetire(\'' + esc(r.asset_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Retire"><i class="fas fa-archive text-xs"></i></button>' : '')
          + '</div></td></tr>';
      });
      html += '</tbody></table></div></div>';
    }
    html += '</div>';
    return html;
  }

  // ── ASSIGNMENTS ────────────────────────────────────────────────
  function buildAssignments() {
    if (!state.assignments.length && !state.loading) {
      return '<div class="p-6 fade-in">' + emptyState('fa-user-tag','No assignments yet','Assign an asset from the Assets tab') + '</div>';
    }
    var active   = state.assignments.filter(function(r){ return !r.return_date; });
    var returned = state.assignments.filter(function(r){ return !!r.return_date; });

    var html = '<div class="p-6 space-y-6 fade-in">';

    if (active.length) {
      html += '<div>'
        + '<h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">'
        + '<span class="w-2 h-2 rounded-full bg-blue-500"></span>Active Assignments (' + active.length + ')</h2>'
        + '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden"><div class="overflow-x-auto">'
        + '<table class="w-full text-sm"><thead><tr class="border-b border-slate-100 bg-slate-50">'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Asset</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Assigned To</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Date</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Condition Given</th>'
        + '<th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>'
        + '</tr></thead><tbody>';
      active.forEach(function(r) {
        var daysAssigned = r.assigned_date ? Math.floor((Date.now() - new Date(r.assigned_date)) / 86400000) : 0;
        var overdue = daysAssigned > 90;
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">'
          + '<td class="px-4 py-3.5">' + assetCell(r.asset_id) + '</td>'
          + '<td class="px-4 py-3.5 font-medium text-slate-700">' + esc(getUserName(r.assigned_to)) + '</td>'
          + '<td class="px-4 py-3.5 hidden md:table-cell text-slate-500">'
          + fmtDate(r.assigned_date)
          + '<span class="ml-2 text-xs ' + (overdue?'text-red-500 font-semibold':'text-slate-400') + '">(' + daysAssigned + 'd)</span></td>'
          + '<td class="px-4 py-3.5 hidden md:table-cell">' + condBadge(r.condition_given) + '</td>'
          + '<td class="px-4 py-3.5 text-right">'
          + '<button onclick="assetOpenModal(\'return\',\'' + esc(r.assignment_id) + '\')" class="text-xs font-bold px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded-xl transition-colors">'
          + '<i class="fas fa-undo mr-1"></i>Return</button></td></tr>';
      });
      html += '</tbody></table></div></div></div>';
    }

    if (returned.length) {
      html += '<div>'
        + '<h2 class="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">'
        + '<span class="w-2 h-2 rounded-full bg-slate-400"></span>Return History (' + returned.length + ')</h2>'
        + '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden"><div class="overflow-x-auto">'
        + '<table class="w-full text-sm"><thead><tr class="border-b border-slate-100 bg-slate-50">'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Asset</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Assigned To</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Assigned</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Returned</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Condition Returned</th>'
        + '</tr></thead><tbody>';
      returned.slice(0,30).forEach(function(r) {
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">'
          + '<td class="px-4 py-3.5">' + assetCell(r.asset_id) + '</td>'
          + '<td class="px-4 py-3 text-slate-600">' + esc(getUserName(r.assigned_to)) + '</td>'
          + '<td class="px-4 py-3 text-slate-500 hidden md:table-cell">' + fmtDate(r.assigned_date) + '</td>'
          + '<td class="px-4 py-3 text-slate-500 hidden md:table-cell">' + fmtDate(r.return_date) + '</td>'
          + '<td class="px-4 py-3 hidden lg:table-cell">' + condBadge(r.condition_returned) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div></div></div>';
    }

    html += '</div>';
    return html;
  }

  // ── MAINTENANCE ────────────────────────────────────────────────
  function buildMaintenance() {
    var MNT_STATUS = {
      'Scheduled':   'bg-blue-100 text-blue-700',
      'In Progress': 'bg-amber-100 text-amber-700',
      'Completed':   'bg-emerald-100 text-emerald-700',
      'Cancelled':   'bg-slate-100 text-slate-500',
    };
    var html = '<div class="p-6 fade-in">'
      + '<div class="flex items-center justify-between mb-5">'
      + '<p class="text-sm text-slate-500">' + state.maintenance.length + ' maintenance records</p>'
      + '<button onclick="assetOpenModal(\'maintenance\',null)" class="btn-primary text-sm"><i class="fas fa-plus text-xs"></i>Log Maintenance</button>'
      + '</div>';

    if (!state.maintenance.length) {
      html += emptyState('fa-wrench','No maintenance records','Log the first service, repair or inspection');
    } else {
      html += '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden"><div class="overflow-x-auto">'
        + '<table class="w-full text-sm"><thead><tr class="border-b border-slate-100 bg-slate-50">'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">ID</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Asset</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Type</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Date</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Cost</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Vendor</th>'
        + '<th class="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>'
        + '</tr></thead><tbody>';
      state.maintenance.forEach(function(r) {
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">'
          + '<td class="px-4 py-3 font-mono text-xs text-slate-500">' + esc(r.maintenance_id) + '</td>'
          + '<td class="px-4 py-3.5">' + assetCell(r.asset_id) + '</td>'
          + '<td class="px-4 py-3 text-slate-600">' + esc(r.type) + '</td>'
          + '<td class="px-4 py-3 text-slate-500 hidden md:table-cell">' + fmtDate(r.date) + '</td>'
          + '<td class="px-4 py-3 text-slate-700 font-medium hidden md:table-cell">' + fmtMoney(r.cost) + '</td>'
          + '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + (MNT_STATUS[r.status]||'bg-slate-100 text-slate-500') + '">' + esc(r.status) + '</span></td>'
          + '<td class="px-4 py-3 text-slate-500 hidden lg:table-cell">' + esc(r.vendor||'—') + '</td>'
          + '<td class="px-4 py-3 text-right">'
          + '<button onclick="assetOpenModal(\'maintenance\',\'' + esc(r.maintenance_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-pen text-xs"></i></button>'
          + '<button onclick="assetDeleteMaintenance(\'' + esc(r.maintenance_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>'
          + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }
    html += '</div>';
    return html;
  }

  // ── CONSUMABLES ────────────────────────────────────────────────
  function buildConsumables() {
    var html = '<div class="p-6 fade-in">'
      + '<div class="flex items-center justify-between mb-5">'
      + '<p class="text-sm text-slate-500">' + state.consumables.length + ' consumable items</p>'
      + '<button onclick="assetOpenModal(\'consumable\',null)" class="btn-primary text-sm"><i class="fas fa-plus text-xs"></i>Add Item</button>'
      + '</div>';

    if (!state.consumables.length) {
      html += emptyState('fa-cubes','No consumables yet','Track pens, paper, toner and other supplies');
    } else {
      html += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
      state.consumables.forEach(function(r) {
        var qty       = parseFloat(r.quantity)     || 0;
        var reorder   = parseFloat(r.reorder_level)|| 0;
        var isLow     = qty <= reorder;
        var pct       = reorder > 0 ? Math.min(Math.round((qty / (reorder * 3)) * 100), 100) : 100;
        var barColor  = isLow ? 'from-red-500 to-rose-500' : qty < reorder * 2 ? 'from-amber-400 to-orange-400' : 'from-emerald-500 to-teal-500';
        html += '<div class="bg-white border ' + (isLow?'border-red-200':'border-slate-200') + ' rounded-2xl p-5 card-hover">'
          + '<div class="flex items-start justify-between mb-3">'
          + '<div>'
          + '<p class="font-bold text-slate-900">' + esc(r.item_name) + '</p>'
          + '<p class="text-xs text-slate-400 mt-0.5">' + esc(r.item_id) + ' · ' + esc(r.category||'—') + '</p>'
          + '</div>'
          + (isLow ? '<span class="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-xl">LOW STOCK</span>' : '')
          + '</div>'
          + '<div class="flex items-end justify-between mb-2">'
          + '<div><p class="text-3xl font-extrabold text-slate-900">' + qty + '</p>'
          + '<p class="text-xs text-slate-400">Reorder at ' + reorder + '</p></div>'
          + '<div class="text-right"><p class="text-xs text-slate-400">Unit cost</p><p class="font-bold text-slate-700">' + fmtMoney(r.unit_cost) + '</p></div>'
          + '</div>'
          + '<div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">'
          + '<div class="h-full bg-gradient-to-r ' + barColor + ' rounded-full transition-all" style="width:' + pct + '%"></div>'
          + '</div>'
          + '<div class="flex items-center justify-between">'
          + '<p class="text-xs text-slate-400">Supplier: ' + esc(r.supplier||'—') + '</p>'
          + '<div class="flex gap-1">'
          + '<button onclick="assetOpenModal(\'consumable\',\'' + esc(r.item_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-pen text-xs"></i></button>'
          + '<button onclick="assetDeleteConsumable(\'' + esc(r.item_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>'
          + '</div></div>'
          + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ── DEPRECIATION ───────────────────────────────────────────────
  function buildDepreciation() {
    var html = '<div class="p-6 fade-in">'
      + '<div class="flex items-center justify-between mb-5">'
      + '<p class="text-sm text-slate-500">Asset depreciation values</p>'
      + '<button onclick="assetOpenModal(\'depreciation\',null)" class="btn-primary text-sm"><i class="fas fa-plus text-xs"></i>Add Depreciation</button>'
      + '</div>';

    if (!state.depreciation.length) {
      html += emptyState('fa-chart-line-down','No depreciation data','Add depreciation records for accounting');
    } else {
      html += '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden"><div class="overflow-x-auto">'
        + '<table class="w-full text-sm"><thead><tr class="border-b border-slate-100 bg-slate-50">'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Asset</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Method</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Purchase Price</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Useful Life</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Salvage Value</th>'
        + '<th class="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Current Value</th>'
        + '</tr></thead><tbody>';
      state.depreciation.forEach(function(r) {
        var purchase = parseFloat(r.purchase_price)||0;
        var current  = parseFloat(r.current_value) ||0;
        var pctLeft  = purchase > 0 ? Math.round((current/purchase)*100) : 0;
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">'
          + '<td class="px-4 py-3.5">' + assetCell(r.asset_id) + '</td>'
          + '<td class="px-4 py-3"><span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">' + esc(r.method) + '</span></td>'
          + '<td class="px-4 py-3 text-slate-700 font-medium">' + fmtMoney(r.purchase_price) + '</td>'
          + '<td class="px-4 py-3 text-slate-500">' + esc(r.useful_life_years) + ' yrs</td>'
          + '<td class="px-4 py-3 text-slate-500">' + fmtMoney(r.salvage_value) + '</td>'
          + '<td class="px-4 py-3"><div class="font-bold text-slate-900">' + fmtMoney(current) + '</div>'
          + '<div class="text-xs text-slate-400">' + pctLeft + '% of original</div></td>'
          + '</tr>';
      });
      html += '</tbody></table></div></div>';
    }
    html += '</div>';
    return html;
  }

  // ── DOCUMENTS ─────────────────────────────────────────────────
  function buildDocuments() {
    var html = '<div class="p-6 fade-in">'
      + '<div class="flex items-center justify-between mb-5">'
      + '<p class="text-sm text-slate-500">' + state.documents.length + ' documents linked</p>'
      + '<button onclick="assetOpenModal(\'document\',null)" class="btn-primary text-sm"><i class="fas fa-plus text-xs"></i>Add Document</button>'
      + '</div>';

    if (!state.documents.length) {
      html += emptyState('fa-file-alt','No documents yet','Link invoices, warranties and manuals to assets');
    } else {
      var DOC_ICON = { Invoice:'fa-file-invoice', Warranty:'fa-shield-check', Manual:'fa-book', Photo:'fa-image', Contract:'fa-file-signature' };
      html += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
      state.documents.forEach(function(r) {
        var icon = DOC_ICON[r.document_type] || 'fa-file-alt';
        html += '<div class="bg-white border border-slate-200 rounded-2xl p-4 card-hover flex items-center gap-4">'
          + '<div class="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">'
          + '<i class="fas ' + icon + ' text-white text-sm"></i></div>'
          + '<div class="flex-1 min-w-0">'
          + '<p class="font-semibold text-slate-900 text-sm">' + esc(r.document_type||'Document') + '</p>'
          + (function(){ var a = state.assets.find(function(a){ return a.asset_id === r.asset_id; });
              return '<p class="text-xs text-slate-700 font-medium mt-0.5">' + esc(a ? a.asset_name : r.asset_id) + '</p>'
                + '<p class="text-xs text-slate-400 font-mono">' + esc(r.asset_id) + '</p>'; })()
          + (r.notes ? '<p class="text-xs text-slate-500 mt-0.5 truncate">' + esc(r.notes) + '</p>' : '')
          + '</div>'
          + '<div class="flex items-center gap-1 flex-shrink-0">'
          + (r.link ? '<a href="' + esc(r.link) + '" target="_blank" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Open"><i class="fas fa-external-link-alt text-xs"></i></a>' : '')
          + '<button onclick="assetDeleteDoc(\'' + esc(r.doc_id) + '\')" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>'
          + '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ── MODAL BUILDER ──────────────────────────────────────────────
  function buildModal() {
    if (!state.modal) return '';
    var m = state.modal;
    var inner = '';

    if (m.type === 'asset') {
      var a = m.data || {};
      var isEdit = !!a.asset_id;
      var catOpts = state.categories.map(function(c){
        return '<option value="' + esc(c.category) + '" ' + (a.category===c.category?'selected':'') + '>' + esc(c.category) + '</option>';
      }).join('');
      var typeOpts = state.types.filter(function(t){ return !a.category || t.category === a.category; })
        .map(function(t){ return '<option value="' + esc(t.type) + '" ' + (a.asset_type===t.type?'selected':'') + '>' + esc(t.type) + '</option>'; }).join('');
      var lcOpts = ['Requested','Purchased','Received','Available','Assigned','Maintenance','Retired','Disposed']
        .map(function(l){ return '<option value="' + l + '" ' + (a.lifecycle_stage===l?'selected':'') + '>' + l + '</option>'; }).join('');
      var statusOpts = ['Available','Assigned','Maintenance','Retired','Disposed']
        .map(function(s){ return '<option value="' + s + '" ' + (a.status===s?'selected':'') + '>' + s + '</option>'; }).join('');
      var condOpts = ['New','Good','Fair','Damaged']
        .map(function(c){ return '<option value="' + c + '" ' + (a.condition===c?'selected':'') + '>' + c + '</option>'; }).join('');

      var userOpts = state.users.map(function(u) {
        var uid  = u.user_id || u.id || '';
        var name = u.name || u.email || uid;
        return '<option value="' + esc(uid) + '" ' + (a.assigned_to === uid ? 'selected' : '') + '>' + esc(name) + '</option>';
      }).join('');

      inner = modalHeader(isEdit ? 'Edit Asset' : 'Add Asset', 'fa-box-open')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + row2(field('asset_name','Asset Name',a.asset_name,'text','e.g. MacBook Pro 16"',true),
          '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Serial Number' +
          (a.category === 'Vehicles' ? ' <span class="text-slate-400 font-normal">(License Plate)</span>' : '') +
          '</label><input id="f-serial_number" type="text" value="' + esc(a.serial_number||'') + '" placeholder="' +
          (a.category === 'Vehicles' ? 'e.g. ABC-1234' : 'SN123456') + '" class="field"></div>'
        )
        + row2(
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Category</label><select id="f-category" class="field"><option value="">— Select —</option>' + catOpts + '</select></div>',
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Asset Type</label><select id="f-asset_type" class="field"><option value="">— Select —</option>' + typeOpts + '</select></div>'
          )
        + row2(field('brand','Brand',a.brand,'text','e.g. Apple'), field('model','Model',a.model,'text','e.g. M1'))
        + row2(field('purchase_date','Purchase Date',a.purchase_date,'date'), field('purchase_price','Purchase Price',a.purchase_price,'number','0.00'))
        + row2(field('supplier','Supplier',a.supplier,'text'), field('location','Location',a.location,'text','e.g. NY Office'))
        + row2(
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Status</label><select id="f-status" class="field">' + statusOpts + '</select></div>',
            field('warranty_expiry','Warranty Expiry',a.warranty_expiry,'date')
          )
        + row2(
            '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Condition</label><select id="f-condition" class="field">' + condOpts + '</select></div>',
            ''
          )
        + row2(
            '<div class="relative">'
            + '<label class="block text-xs font-semibold text-slate-600 mb-1.5">Assigned To</label>'
            + '<input id="f-assigned_to_name" type="text" autocomplete="off" placeholder="Search by name..." class="field"'
            + ' value="' + esc((function(){ var u = state.users.find(function(u){ return (u.user_id||u.id||'') === a.assigned_to; }); return u ? (u.name||u.email||'') : ''; })()) + '">'
            + '<input type="hidden" id="f-assigned_to" value="' + esc(a.assigned_to||'') + '">'
            + '<div id="asset-user-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 z-[9999] bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto"></div>'
            + '</div>',
            ''
          )
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>'
        + '<textarea id="f-notes" rows="2" class="field resize-none">' + esc(a.notes||'') + '</textarea></div>'
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveAsset(\'' + esc(a.asset_id||'') + '\')" class="btn-primary flex-1">'
        + (isEdit ? '<i class="fas fa-save text-xs"></i>Save' : '<i class="fas fa-plus text-xs"></i>Add Asset') + '</button>'
        + '</div>';
    }

    else if (m.type === 'assign') {
      var assignUserOpts = state.users.map(function(u) {
        var uid  = u.user_id || u.id || '';
        var name = u.name || u.email || uid;
        return '<option value="' + esc(uid) + '">' + esc(name) + '</option>';
      }).join('');
      inner = modalHeader('Assign Asset','fa-user-tag')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + '<div class="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 font-medium">'
        + '<i class="fas fa-box-open mr-2"></i>Asset: <strong>' + esc(m.assetId||'') + '</strong></div>'
        + '<div class="relative">'
        + '<label class="block text-xs font-semibold text-slate-600 mb-1.5">Assign To <span class="text-red-500">*</span></label>'
        + '<input id="f-assigned_to_name" type="text" autocomplete="off" placeholder="Search by name..." class="field">'
        + '<input type="hidden" id="f-assigned_to" value="">'
        + '<div id="asset-user-dropdown" class="hidden absolute left-0 right-0 top-full mt-1 z-[9999] bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto"></div>'
        + '</div>'
        + field('assigned_date','Assigned Date',new Date().toISOString().split('T')[0],'date')
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Condition Given</label>'
        + '<select id="f-condition_given" class="field"><option value="">— Select —</option>'
        + ['New','Good','Fair','Damaged'].map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join('')
        + '</select></div>'
        + field('notes','Notes','','text')
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveAssign(\'' + esc(m.assetId||'') + '\')" class="btn-primary flex-1"><i class="fas fa-user-check text-xs"></i>Assign</button>'
        + '</div>';
    }

    else if (m.type === 'return') {
      inner = modalHeader('Return Asset','fa-undo')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + field('return_date','Return Date',new Date().toISOString().split('T')[0],'date',null,true)
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Condition Returned</label>'
        + '<select id="f-condition_returned" class="field"><option value="">— Select —</option>'
        + ['New','Good','Fair','Damaged'].map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join('')
        + '</select></div>'
        + field('notes','Notes','','text')
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveReturn(\'' + esc(m.asnId||'') + '\')" class="btn-primary flex-1"><i class="fas fa-undo text-xs"></i>Confirm Return</button>'
        + '</div>';
    }

    else if (m.type === 'maintenance') {
      var r = m.data || {};
      var isEdit = !!r.maintenance_id;
      var mntTypeOpts = ['Repair','Inspection','Cleaning','Upgrade','Service']
        .map(function(t){ return '<option value="'+t+'" '+(r.type===t?'selected':'')+'>'+t+'</option>'; }).join('');
      var mntStatusOpts = ['Scheduled','In Progress','Completed','Cancelled']
        .map(function(s){ return '<option value="'+s+'" '+(r.status===s?'selected':'')+'>'+s+'</option>'; }).join('');
      inner = modalHeader(isEdit?'Edit Maintenance':'Log Maintenance','fa-wrench')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + assetComboField('Asset', r.asset_id, true)
        + row2('<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Type</label><select id="f-type" class="field">'+mntTypeOpts+'</select></div>',
               '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Status</label><select id="f-status" class="field">'+mntStatusOpts+'</select></div>')
        + row2(field('date','Date',r.date||new Date().toISOString().split('T')[0],'date'),
               field('cost','Cost',r.cost,'number','0.00'))
        + field('vendor','Vendor / Service Provider',r.vendor,'text')
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>'
        + '<textarea id="f-notes" rows="2" class="field resize-none">'+esc(r.notes||'')+'</textarea></div>'
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveMaintenance(\'' + esc(r.maintenance_id||'') + '\')" class="btn-primary flex-1">'
        + (isEdit?'<i class="fas fa-save text-xs"></i>Save':'<i class="fas fa-plus text-xs"></i>Log')+'</button>'
        + '</div>';
    }

    else if (m.type === 'consumable') {
      var r = m.data || {};
      var isEdit = !!r.item_id;
      inner = modalHeader(isEdit?'Edit Consumable':'Add Consumable','fa-cubes')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + row2(field('item_name','Item Name',r.item_name,'text','e.g. Ballpoint Pens',true),
               field('category','Category',r.category,'text','e.g. Office Supplies'))
        + row2(field('quantity','Quantity',r.quantity,'number','0'),
               field('reorder_level','Reorder Level',r.reorder_level,'number','0'))
        + row2(field('unit_cost','Unit Cost',r.unit_cost,'number','0.00'),
               field('supplier','Supplier',r.supplier,'text'))
        + field('notes','Notes',r.notes,'text')
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveConsumable(\'' + esc(r.item_id||'') + '\')" class="btn-primary flex-1">'
        + (isEdit?'<i class="fas fa-save text-xs"></i>Save':'<i class="fas fa-plus text-xs"></i>Add')+'</button>'
        + '</div>';
    }

    else if (m.type === 'depreciation') {
      var r = m.data || {};
      var methodOpts = ['Straight Line','Declining Balance']
        .map(function(m){ return '<option value="'+m+'" '+(r.method===m?'selected':'')+'>'+m+'</option>'; }).join('');
      inner = modalHeader('Add Depreciation Record','fa-chart-line-down')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + assetComboField('Asset', r.asset_id, true)
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Method</label>'
        + '<select id="f-method" class="field"><option value="">— Select —</option>'+methodOpts+'</select></div>'
        + row2(field('purchase_price','Purchase Price',r.purchase_price,'number','0.00'),
               field('useful_life_years','Useful Life (years)',r.useful_life_years,'number','3'))
        + field('salvage_value','Salvage Value',r.salvage_value,'number','0.00')
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveDepreciation()" class="btn-primary flex-1"><i class="fas fa-save text-xs"></i>Save</button>'
        + '</div>';
    }

    else if (m.type === 'document') {
      inner = modalHeader('Add Document','fa-file-alt')
        + '<div class="p-5 overflow-y-auto flex-1 space-y-4">'
        + assetComboField('Asset', '', true)
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">Document Type</label>'
        + '<select id="f-document_type" class="field"><option value="">— Select —</option>'
        + ['Invoice','Warranty','Manual','Photo','Contract','Other']
          .map(function(t){ return '<option value="'+t+'">'+t+'</option>'; }).join('')
        + '</select></div>'
        + field('link','Link (Google Drive URL)','','url','https://drive.google.com/...')
        + field('notes','Notes','','text')
        + '</div>'
        + '<div class="p-5 border-t border-slate-100 flex gap-3 flex-shrink-0">'
        + '<button onclick="assetCloseModal()" class="btn-secondary flex-1">Cancel</button>'
        + '<button onclick="assetSaveDocument()" class="btn-primary flex-1"><i class="fas fa-plus text-xs"></i>Add Document</button>'
        + '</div>';
    }

    return '<div class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 bg-black/50" onclick="assetCloseModal()">'
      + '<div class="bg-white w-full md:max-w-xl rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col slide-up" onclick="event.stopPropagation()">'
      + inner
      + '</div></div>';
  }

  // ── Modal helpers ──────────────────────────────────────────────
  function modalHeader(title, icon) {
    return '<div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">'
      + '<div class="flex items-center gap-3">'
      + '<div class="w-8 h-8 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl flex items-center justify-center">'
      + '<i class="fas ' + icon + ' text-white text-xs"></i></div>'
      + '<h3 class="font-extrabold text-slate-900">' + title + '</h3></div>'
      + '<button onclick="assetCloseModal()" class="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center text-slate-500 transition-colors">'
      + '<i class="fas fa-times text-xs"></i></button>'
      + '</div>';
  }

  function field(id, label, val, type, placeholder, required) {
    val = val || '';
    return '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">' + label + (required ? ' <span class="text-red-500">*</span>' : '') + '</label>'
      + '<input id="f-' + id + '" type="' + (type||'text') + '" value="' + esc(val) + '" '
      + (placeholder ? 'placeholder="' + esc(placeholder) + '"' : '') + ' class="field">'
      + '</div>';
  }

  function row2(a, b) {
    return '<div class="grid grid-cols-2 gap-3">' + a + b + '</div>';
  }

  function gv(id) {
    var el = document.getElementById('f-' + id);
    return el ? el.value.trim() : '';
  }

  // ── Actions ────────────────────────────────────────────────────
  window.assetOpenModal = function(type, id) {
    var data = null;
    if (type === 'asset' && id) {
      data = state.assets.find(function(a){ return a.asset_id === id; }) || null;
    } else if (type === 'maintenance' && id) {
      data = state.maintenance.find(function(r){ return r.maintenance_id === id; }) || null;
    } else if (type === 'consumable' && id) {
      data = state.consumables.find(function(r){ return r.item_id === id; }) || null;
    } else if (type === 'return') {
      state.modal = { type: 'return', asnId: id };
      render();
      return;
    } else if (type === 'assign') {
      state.modal = { type: 'assign', assetId: id };
      render();
      return;
    }
    state.modal = { type: type, data: data };
    render();
  };

  window.assetCloseModal = function() {
    state.modal = null;
    render();
  };

  window.assetSaveAsset = async function(existingId) {
    var status       = gv('status') || 'Available';
    var assignedTo   = gv('assigned_to');
    // Auto-set to Assigned if a user is selected
    if (assignedTo && status === 'Available') status = 'Assigned';
    // Lifecycle stage mirrors status
    var lcMap = {
      'Available':'Available','Assigned':'Assigned','Maintenance':'Maintenance',
      'Retired':'Retired','Disposed':'Disposed'
    };
    var params = {
      asset_name:      gv('asset_name'),
      category:        gv('category'),
      asset_type:      gv('asset_type'),
      brand:           gv('brand'),
      model:           gv('model'),
      serial_number:   gv('serial_number'),
      purchase_date:   gv('purchase_date'),
      purchase_price:  gv('purchase_price'),
      supplier:        gv('supplier'),
      location:        gv('location'),
      status:          status,
      condition:       gv('condition'),
      warranty_expiry: gv('warranty_expiry'),
      assigned_to:     assignedTo,
      lifecycle_stage: lcMap[status] || status,
      notes:           gv('notes'),
    };
    if (!params.asset_name) { toast('Asset name is required','error'); return; }
    try {
      if (existingId) {
        params.asset_id = existingId;
        await api('assets/update', params);
        toast('Asset updated','success');
      } else {
        await api('assets/create', params);
        toast('Asset added','success');
      }
      state.modal = null;
      await loadAll();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetSaveAssign = async function(assetId) {
    var params = {
      asset_id:        assetId,
      assigned_to:     gv('assigned_to'),
      assigned_date:   gv('assigned_date'),
      condition_given: gv('condition_given'),
      notes:           gv('notes'),
    };
    if (!params.assigned_to) { toast('Please enter who to assign to','error'); return; }
    try {
      await api('assets/assign', params);
      toast('Asset assigned','success');
      state.modal = null;
      await loadAll();
      await loadAssignments();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetSaveReturn = async function(asnId) {
    var asn = state.assignments.find(function(a){ return a.assignment_id === asnId; });
    var params = {
      assignment_id:      asnId,
      asset_id:           asn ? asn.asset_id : '',
      return_date:        gv('return_date'),
      condition_returned: gv('condition_returned'),
      notes:              gv('notes'),
    };
    try {
      await api('assets/return', params);
      toast('Asset returned','success');
      state.modal = null;
      await loadAll();
      await loadAssignments();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetRetire = async function(assetId) {
    if (!confirm('Retire asset ' + assetId + '? This will mark it as retired and unassign it.')) return;
    try {
      await api('assets/retire', { asset_id: assetId });
      toast('Asset retired','success');
      await loadAll();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetSaveMaintenance = async function(existingId) {
    var params = {
      asset_id: gv('asset_id'),
      type:     gv('type'),
      date:     gv('date'),
      cost:     gv('cost'),
      vendor:   gv('vendor'),
      status:   gv('status'),
      notes:    gv('notes'),
    };
    if (!params.asset_id) { toast('Asset ID is required','error'); return; }
    try {
      if (existingId) {
        params.maintenance_id = existingId;
        await api('assets/maintenance/update', params);
        toast('Maintenance record updated','success');
      } else {
        await api('assets/maintenance/create', params);
        toast('Maintenance logged','success');
      }
      state.modal = null;
      await loadMaintenance();
      await loadAll();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetDeleteMaintenance = async function(id) {
    if (!confirm('Delete this maintenance record?')) return;
    try {
      await api('assets/maintenance/delete', { maintenance_id: id });
      toast('Deleted','success');
      await loadMaintenance();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetSaveConsumable = async function(existingId) {
    var params = {
      item_name:     gv('item_name'),
      category:      gv('category'),
      quantity:      gv('quantity'),
      reorder_level: gv('reorder_level'),
      unit_cost:     gv('unit_cost'),
      supplier:      gv('supplier'),
      notes:         gv('notes'),
    };
    if (!params.item_name) { toast('Item name is required','error'); return; }
    try {
      if (existingId) {
        params.item_id = existingId;
        await api('assets/consumables/update', params);
        toast('Updated','success');
      } else {
        await api('assets/consumables/create', params);
        toast('Item added','success');
      }
      state.modal = null;
      await loadConsumables();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetDeleteConsumable = async function(id) {
    if (!confirm('Delete this consumable item?')) return;
    try {
      await api('assets/consumables/delete', { item_id: id });
      toast('Deleted','success');
      await loadConsumables();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetSaveDepreciation = async function() {
    var params = {
      asset_id:          gv('asset_id'),
      method:            gv('method'),
      purchase_price:    gv('purchase_price'),
      useful_life_years: gv('useful_life_years'),
      salvage_value:     gv('salvage_value'),
    };
    if (!params.asset_id || !params.method) { toast('Asset ID and method are required','error'); return; }
    try {
      await api('assets/depreciation/upsert', params);
      toast('Saved','success');
      state.modal = null;
      await loadDepreciation();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetSaveDocument = async function() {
    var params = {
      asset_id:      gv('asset_id'),
      document_type: gv('document_type'),
      link:          gv('link'),
      notes:         gv('notes'),
    };
    if (!params.asset_id) { toast('Asset ID is required','error'); return; }
    try {
      await api('assets/documents/create', params);
      toast('Document added','success');
      state.modal = null;
      await loadDocuments();
    } catch(e) { toast(e.message,'error'); }
  };

  window.assetDeleteDoc = async function(id) {
    if (!confirm('Remove this document?')) return;
    try {
      await api('assets/documents/delete', { doc_id: id });
      toast('Removed','success');
      await loadDocuments();
    } catch(e) { toast(e.message,'error'); }
  };

  // ── Bind events ────────────────────────────────────────────────
  function bindEvents() {
    var s = document.getElementById('asset-search');
    if (s) s.addEventListener('input', function(e) { state.search = e.target.value; render(); });

    var fc = document.getElementById('asset-filter-cat');
    if (fc) fc.addEventListener('change', function(e) { state.filterCat = e.target.value; render(); });

    var fs = document.getElementById('asset-filter-status');
    if (fs) fs.addEventListener('change', function(e) { state.filterStatus = e.target.value; render(); });

    // Category → filter types in asset modal
    var catSel = document.getElementById('f-category');
    if (catSel) {
      catSel.addEventListener('change', function(e) {
        var sel = e.target.value;
        var typeSel = document.getElementById('f-asset_type');
        if (typeSel) {
          var opts = '<option value="">— Select —</option>'
            + state.types.filter(function(t){ return !sel || t.category === sel; })
              .map(function(t){ return '<option value="'+esc(t.type)+'">'+esc(t.type)+'</option>'; }).join('');
          typeSel.innerHTML = opts;
        }
      });
    }

    // Asset searchable combobox (modals: maintenance, depreciation, document)
    var assetSearchEl  = document.getElementById('f-asset_search');
    var assetHiddenEl  = document.getElementById('f-asset_id');
    var assetDropEl    = document.getElementById('asset-asset-dropdown');
    if (assetSearchEl && assetHiddenEl && assetDropEl) {
      function showAssetDrop(query) {
        var trimmed = (query || '').trim().toLowerCase();
        var list = state.assets.filter(function(a) {
          if (a.status === 'Disposed') return false;
          return !trimmed
            || (a.asset_name||'').toLowerCase().includes(trimmed)
            || (a.asset_id||'').toLowerCase().includes(trimmed)
            || (a.serial_number||'').toLowerCase().includes(trimmed);
        }).slice(0, 30);
        if (!list.length) {
          assetDropEl.innerHTML = '<div class="px-4 py-3 text-sm text-slate-400 italic">No matching assets</div>';
        } else {
          assetDropEl.innerHTML = list.map(function(a) {
            return '<button type="button" data-aid="' + esc(a.asset_id) + '" data-aname="' + esc(a.asset_name + ' (' + a.asset_id + ')') + '"'
              + ' class="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-700 transition-colors">'
              + '<div class="font-semibold text-sm text-slate-800">' + esc(a.asset_name) + '</div>'
              + '<div class="text-xs text-slate-400 font-mono">' + esc(a.asset_id) + (a.serial_number ? ' · SN: '+esc(a.serial_number) : '') + '</div>'
              + '</button>';
          }).join('');
          assetDropEl.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('mousedown', function(ev) {
              ev.preventDefault();
              assetHiddenEl.value  = btn.dataset.aid;
              assetSearchEl.value  = btn.dataset.aname;
              assetDropEl.classList.add('hidden');
            });
          });
        }
        assetDropEl.classList.remove('hidden');
      }
      assetSearchEl.addEventListener('focus', function() { showAssetDrop(this.value); });
      assetSearchEl.addEventListener('input', function() {
        if (!this.value) assetHiddenEl.value = '';
        showAssetDrop(this.value);
      });
      assetSearchEl.addEventListener('blur', function() {
        // If typed text looks like a raw asset ID (starts with AST-), accept it directly
        setTimeout(function() {
          assetDropEl.classList.add('hidden');
          if (!assetHiddenEl.value && assetSearchEl.value.trim()) {
            assetHiddenEl.value = assetSearchEl.value.trim();
          }
        }, 200);
      });
    }

    // Assigned To — searchable autocomplete
    var nameEl   = document.getElementById('f-assigned_to_name');
    var hiddenEl = document.getElementById('f-assigned_to');
    var dropEl   = document.getElementById('asset-user-dropdown');
    if (nameEl && hiddenEl && dropEl) {
      function showUserDrop(query) {
        var trimmed = (query || '').trim().toLowerCase();
        var list = state.users.filter(function(u) {
          var uname = (u.name || u.email || '').toLowerCase();
          return !trimmed || uname.includes(trimmed);
        });
        if (!list.length) {
          dropEl.innerHTML = '<div class="px-4 py-3 text-sm text-slate-400 italic">'
            + (state.users.length === 0 ? 'No users loaded — check permissions' : 'No matching users found')
            + '</div>';
        } else {
          dropEl.innerHTML = list.map(function(u) {
            var uid  = u.user_id || u.id || '';
            var uname = u.name || u.email || uid;
            var role  = u.role  || '';
            return '<button type="button" data-uid="' + esc(uid) + '" data-name="' + esc(uname) + '"'
              + ' class="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition-colors">'
              + '<div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0">'
              + '<span class="text-[10px] font-bold text-white">' + esc((uname[0]||'U').toUpperCase()) + '</span></div>'
              + '<div class="flex-1 min-w-0"><div class="font-medium truncate">' + esc(uname) + '</div>'
              + (role ? '<div class="text-[10px] text-slate-400">' + esc(role) + '</div>' : '')
              + '</div></button>';
          }).join('');
          dropEl.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('mousedown', function(ev) {
              ev.preventDefault();
              hiddenEl.value = btn.dataset.uid;
              nameEl.value   = btn.dataset.name;
              dropEl.classList.add('hidden');
            });
          });
        }
        dropEl.classList.remove('hidden');
      }
      nameEl.addEventListener('focus', function() { showUserDrop(this.value); });
      nameEl.addEventListener('input', function() {
        if (!this.value) hiddenEl.value = '';
        showUserDrop(this.value);
      });
      nameEl.addEventListener('blur', function() {
        setTimeout(function() {
          dropEl.classList.add('hidden');
          // Auto-flip status to Assigned if a user was selected
          var statusSel = document.getElementById('f-status');
          if (hiddenEl.value && statusSel && statusSel.value === 'Available') {
            statusSel.value = 'Assigned';
          }
          // Auto-clear status back to Available if user was cleared
          if (!hiddenEl.value && !nameEl.value && statusSel && statusSel.value === 'Assigned') {
            statusSel.value = 'Available';
          }
        }, 200);
      });
      // Show all users immediately when the field is rendered and users are loaded
      if (state.users.length && nameEl === document.activeElement) {
        showUserDrop('');
      }
    }
  }

  // ── Setup Sheets ───────────────────────────────────────────────
  window.assetRunSetup = async function() {
    try {
      toast('Creating sheets...', 'info');
      await api('module/install', { module: 'assets' });
      toast('Sheets created!', 'success');
      await loadAll();
    } catch(e) { toast('Setup failed: ' + e.message, 'error'); }
  };

  // ── Boot ───────────────────────────────────────────────────────
  loadAll();
};
