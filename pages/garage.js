// ================================================================
//  pages/garage.js  —  GarageOS Module for Work Volt
//
//  Architecture:
//    • One organization  = one garage (garage_id stored on users row)
//    • Private data      = repairs table (prices, clients, garage-scoped RLS)
//    • Shared data       = shared_repairs table (anonymized, no prices/client)
//
//  Registration (auto-runs when script loads):
//    WorkVoltPages.garage(container)
//
//  Depends on:
//    • window.WorkVoltDB  (from db-adapter.js)
//    • window.WorkVolt    (user(), toast(), navigate())
//    • Tailwind CSS + Font Awesome (already loaded in main.html)
// ================================================================

(function () {
  'use strict';

  // ── Shared DB client (anonymized data only — separate Supabase project) ──
  const SHARED_URL = 'https://mvpicqvmrheqssxbbzty.supabase.co';
  const SHARED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cGljcXZtcmhlcXNzeGJienR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU4NzIsImV4cCI6MjA5MTI2MTg3Mn0._8Cr0B3FNTA_X9HzQQFnmcM0Lcz7gltxJxCySREwWzU';

  // Lazily initialised — created once the Supabase SDK is available
  let _sharedClient = null;
  function getSharedClient() {
    if (_sharedClient) return _sharedClient;
    if (!window.supabase) throw new Error('Supabase SDK not loaded yet');
    _sharedClient = window.supabase.createClient(SHARED_URL, SHARED_KEY);
    return _sharedClient;
  }

  // ── Helpers ────────────────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const fmt = (n) =>
    parseFloat(n || 0).toLocaleString('en-CA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const today = () => new Date().toISOString().split('T')[0];
  const dateLabel = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-CA') : '—';

  // ── State ──────────────────────────────────────────────────────
  let _garage = null;       // { id, name, created_at }
  let _repairs = [];
  let _view = 'dashboard';  // dashboard | repairs | shared | team

  // ── Garage bootstrap ───────────────────────────────────────────
  async function loadGarage() {
    const user = WorkVolt.user();
    if (!user?.garage_id) return null;
    try {
      const rows = await WorkVoltDB.list('garages', { id: user.garage_id });
      return rows[0] || null;
    } catch (e) {
      return null;
    }
  }

  async function loadRepairs() {
    if (!_garage) return [];
    try {
      const rows = await WorkVoltDB.list('repairs', { garage_id: _garage.id }, { order: 'created_at' });
      return rows;
    } catch (e) {
      return [];
    }
  }

  // ── Save repair (private + optional shared) ────────────────────
  async function saveRepair(data, shareAnon) {
    const user = WorkVolt.user();
    const repairRow = {
      garage_id: _garage.id,
      vin:       data.vin.trim().toUpperCase(),
      vehicle:   { make: data.make, model: data.model, year: data.year, color: data.color },
      client:    { name: data.clientName, phone: data.clientPhone, email: data.clientEmail },
      repairs:   data.repairLines.filter(r => r.description.trim()),
      parts:     data.partLines.filter(p => p.name.trim()),
      total:     data.total,
      notes:     data.notes || '',
    };
    await WorkVoltDB.create('repairs', repairRow);

    if (shareAnon) {
      try {
        // CRITICAL: no prices, no client, no garage identity
        // Writes to the SHARED Supabase project (mvpicqvmrheqssxbbzty)
        const { error } = await getSharedClient()
          .from('shared_repairs')
          .insert({
            vin:         data.vin.trim().toUpperCase(),
            vehicle:     { make: data.make, model: data.model, year: data.year },
            repairs:     data.repairLines.filter(r => r.description.trim()).map(r => ({ description: r.description })),
            parts:       data.partLines.filter(p => p.name.trim()).map(p => ({ name: p.name, supplier: p.supplier })),
            serviced_at: today(),
          });
        if (error) throw new Error(error.message);
      } catch (e) {
        // Shared insert is non-fatal — private repair is already saved
        console.warn('Shared insert skipped:', e.message);
      }
    }
  }

  async function searchShared(vin) {
    try {
      const { data, error } = await getSharedClient()
        .from('shared_repairs')
        .select('*')
        .eq('vin', vin.trim().toUpperCase())
        .order('serviced_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    } catch (e) {
      console.warn('Shared search error:', e.message);
      return [];
    }
  }

  // ── Compute totals from form arrays ───────────────────────────
  function computeTotal(repairLines, partLines) {
    const labor = repairLines.reduce((s, r) => s + parseFloat(r.labor || 0), 0);
    const parts = partLines.reduce((s, p) => s + parseFloat(p.price || 0) * parseInt(p.qty || 1), 0);
    return { labor, parts, total: labor + parts };
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER — Shell with sub-nav tabs
  // ══════════════════════════════════════════════════════════════
  function renderShell(container) {
    container.innerHTML = `
      <div class="p-4 md:p-6 fade-in" id="garage-root">

        <!-- Module header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 class="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <i class="fas fa-warehouse text-blue-600"></i>
              Garage
              <span id="g-garage-name" class="text-base font-semibold text-slate-500 ml-1"></span>
            </h1>
            <p class="text-xs text-slate-400 mt-0.5">Multi-tenant garage management</p>
          </div>
          <div id="g-header-action"></div>
        </div>

        <!-- Sub-nav tabs -->
        <div class="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
          ${[
            { id: 'dashboard', icon: 'fa-th-large',      label: 'Dashboard' },
            { id: 'repairs',   icon: 'fa-wrench',        label: 'Repairs'   },
            { id: 'shared',    icon: 'fa-globe',         label: 'Shared History' },
            { id: 'team',      icon: 'fa-users',         label: 'Team'      },
          ].map(t => `
            <button onclick="GarageModule.switchTab('${t.id}')"
              data-tab="${t.id}"
              class="g-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-blue-600 transition-colors whitespace-nowrap -mb-px">
              <i class="fas ${t.icon} text-xs"></i>${t.label}
            </button>`).join('')}
        </div>

        <!-- Dynamic tab content -->
        <div id="g-tab-content"></div>
      </div>`;
  }

  function setActiveTab(tabId) {
    _view = tabId;
    document.querySelectorAll('.g-tab').forEach(btn => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('border-blue-600', active);
      btn.classList.toggle('text-blue-600', active);
      btn.classList.toggle('border-transparent', !active);
      btn.classList.toggle('text-slate-500', !active);
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  NO GARAGE — setup screen
  // ══════════════════════════════════════════════════════════════
  function renderSetup(container) {
    container.innerHTML = `
      <div class="p-4 md:p-8 fade-in">
        <div class="max-w-md mx-auto mt-8">
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

            <div class="px-6 py-5 border-b border-slate-100 bg-slate-50">
              <h2 class="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fas fa-warehouse text-blue-600"></i> Set up your Garage
              </h2>
              <p class="text-xs text-slate-400 mt-0.5">Creates an isolated workspace — only your team sees your data</p>
            </div>

            <div class="px-6 py-5 space-y-4">
              <!-- Toggle -->
              <div class="flex rounded-xl border border-slate-200 overflow-hidden mb-2">
                <button onclick="GarageModule._setupMode('create')" id="setup-tab-create"
                  class="flex-1 py-2 text-sm font-semibold bg-blue-600 text-white transition-colors">New Garage</button>
                <button onclick="GarageModule._setupMode('join')" id="setup-tab-join"
                  class="flex-1 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">Join Existing</button>
              </div>

              <div id="setup-create-fields">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Garage Name</label>
                <input id="setup-garage-name" class="field" placeholder="e.g. Montreal Auto Service">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 mt-3">Your Role</label>
                <select id="setup-role" class="field">
                  <option value="admin">Admin (Owner)</option>
                  <option value="employee">Employee</option>
                </select>
              </div>

              <div id="setup-join-fields" class="hidden">
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Garage ID</label>
                <input id="setup-garage-id" class="field font-mono text-xs" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
                <p class="text-xs text-slate-400 mt-1">Ask your admin for the Garage ID — you'll join as an employee.</p>
              </div>

              <div id="setup-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>

              <button onclick="GarageModule._submitSetup()" id="setup-submit" class="btn-primary w-full">
                <i class="fas fa-check text-sm"></i> Continue
              </button>
            </div>
          </div>
        </div>
      </div>`;

    window.GarageModule._setupMode = (mode) => {
      const isCreate = mode === 'create';
      $('#setup-create-fields').classList.toggle('hidden', !isCreate);
      $('#setup-join-fields').classList.toggle('hidden', isCreate);
      $('#setup-tab-create').className = `flex-1 py-2 text-sm font-semibold transition-colors ${isCreate ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`;
      $('#setup-tab-join').className   = `flex-1 py-2 text-sm font-semibold transition-colors ${!isCreate ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`;
    };
    window.GarageModule._currentSetupMode = 'create';
  }

  // ══════════════════════════════════════════════════════════════
  //  DASHBOARD TAB
  // ══════════════════════════════════════════════════════════════
  function renderDashboard() {
    setActiveTab('dashboard');
    const content = $('#g-tab-content');

    const totalRev   = _repairs.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const now        = new Date();
    const thisMonth  = _repairs.filter(r => {
      const d = new Date(r.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthRev   = thisMonth.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const avgTicket  = _repairs.length ? totalRev / _repairs.length : 0;
    const recent     = _repairs.slice(0, 5);

    content.innerHTML = `
      <div class="slide-up space-y-5">

        <!-- Private banner -->
        <div class="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <i class="fas fa-lock text-red-400"></i>
          <span>All repair data is <strong>private</strong> to <strong>${_garage?.name || 'your garage'}</strong>. Prices and client info never leave your workspace.</span>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${[
            { label: 'This Month', value: '$' + fmt(monthRev),   sub: thisMonth.length + ' orders', color: 'blue'  },
            { label: 'All-time Revenue', value: '$' + fmt(totalRev), sub: _repairs.length + ' total orders', color: 'slate' },
            { label: 'Avg Ticket',  value: '$' + fmt(avgTicket), sub: 'per repair order',  color: 'green' },
          ].map(s => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">${s.label}</p>
              <p class="text-2xl font-extrabold text-${s.color === 'green' ? 'emerald' : s.color}-600 mt-1">${s.value}</p>
              <p class="text-xs text-slate-400 mt-0.5">${s.sub}</p>
            </div>`).join('')}
        </div>

        <!-- Recent repairs table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-800 text-sm">Recent Repairs</h3>
            <span class="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 uppercase tracking-wide">Private</span>
          </div>
          ${recent.length === 0
            ? `<div class="text-center py-12 text-slate-400"><i class="fas fa-wrench text-3xl mb-3 block opacity-30"></i><p class="text-sm">No repairs yet</p></div>`
            : `<div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead><tr class="border-b border-slate-100">
                    <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Vehicle</th>
                    <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Client</th>
                    <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Total</th>
                    <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Date</th>
                  </tr></thead>
                  <tbody>
                    ${recent.map(r => `
                      <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3">
                          <p class="font-semibold text-slate-800">${r.vehicle?.year || ''} ${r.vehicle?.make || ''} ${r.vehicle?.model || ''}</p>
                          <p class="text-xs text-slate-400 font-mono">${r.vin || ''}</p>
                        </td>
                        <td class="px-4 py-3 text-slate-600">${r.client?.name || '—'}</td>
                        <td class="px-4 py-3 font-bold text-blue-600 font-mono">$${fmt(r.total)}</td>
                        <td class="px-4 py-3 text-slate-400 text-xs">${dateLabel(r.created_at)}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>`}
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  REPAIRS TAB
  // ══════════════════════════════════════════════════════════════
  function renderRepairs() {
    setActiveTab('repairs');
    $('#g-header-action').innerHTML = `
      <button onclick="GarageModule.openNewRepair()" class="btn-primary">
        <i class="fas fa-plus text-sm"></i> New Repair
      </button>`;

    const content = $('#g-tab-content');
    const totalRev = _repairs.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    const avgTicket = _repairs.length ? totalRev / _repairs.length : 0;

    content.innerHTML = `
      <div class="slide-up space-y-5">
        <div class="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <i class="fas fa-lock text-red-400"></i>
          <span>Prices and client info are <strong>private to ${_garage?.name}</strong> — never visible to other garages.</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${[
            { label: 'Total Revenue',  value: '$' + fmt(totalRev),  color: 'blue'    },
            { label: 'Repair Orders',  value: _repairs.length,       color: 'slate'   },
            { label: 'Avg Ticket',     value: '$' + fmt(avgTicket),  color: 'emerald' },
          ].map(s => `
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">${s.label}</p>
              <p class="text-2xl font-extrabold text-${s.color}-600 mt-1">${s.value}</p>
            </div>`).join('')}
        </div>

        <!-- Search -->
        <div class="relative max-w-xs">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input id="repairs-search" oninput="GarageModule._filterRepairs(this.value)"
            class="field pl-8" placeholder="Search VIN, vehicle, client…">
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-800 text-sm">All Repairs</h3>
            <span class="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 uppercase tracking-wide">Private</span>
          </div>
          <div id="repairs-table-wrap">
            ${buildRepairsTable(_repairs)}
          </div>
        </div>
      </div>`;
  }

  function buildRepairsTable(rows) {
    if (!rows.length) {
      return `<div class="text-center py-12 text-slate-400"><i class="fas fa-wrench text-3xl mb-3 block opacity-30"></i><p class="text-sm">No repairs found</p></div>`;
    }
    return `<div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-100">
          <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">VIN</th>
          <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Vehicle</th>
          <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Client</th>
          <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Services</th>
          <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Total</th>
          <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Date</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3 font-mono text-xs text-slate-400">${r.vin || '—'}</td>
              <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">${r.vehicle?.year || ''} ${r.vehicle?.make || ''} ${r.vehicle?.model || ''}</p>
                <p class="text-xs text-slate-400">${r.vehicle?.color || ''}</p>
              </td>
              <td class="px-4 py-3">
                <p class="text-slate-700">${r.client?.name || '—'}</p>
                <p class="text-xs text-slate-400">${r.client?.phone || ''}</p>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                ${(r.repairs || []).slice(0, 2).map(x => x.description).join(', ') || '—'}
              </td>
              <td class="px-4 py-3 font-bold text-blue-600 font-mono">$${fmt(r.total)}</td>
              <td class="px-4 py-3 text-xs text-slate-400">${dateLabel(r.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  SHARED HISTORY TAB
  // ══════════════════════════════════════════════════════════════
  function renderShared() {
    setActiveTab('shared');
    $('#g-header-action').innerHTML = '';
    const content = $('#g-tab-content');
    content.innerHTML = `
      <div class="slide-up space-y-5">
        <div class="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <i class="fas fa-globe text-emerald-500"></i>
          <span>Search anonymized vehicle repair history shared by all garages. <strong>No prices, no client info</strong> — repair intelligence only.</span>
        </div>

        <div class="flex gap-2 max-w-md">
          <input id="shared-vin-input" class="field font-mono uppercase" placeholder="Enter VIN number…" maxlength="17">
          <button onclick="GarageModule._searchShared()" class="btn-primary whitespace-nowrap">
            <i class="fas fa-search text-sm"></i> Search
          </button>
        </div>

        <div id="shared-results">
          <div class="text-center py-16 text-slate-300">
            <i class="fas fa-search text-4xl block mb-3"></i>
            <p class="text-sm text-slate-400">Enter a VIN to search shared history</p>
          </div>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  TEAM TAB
  // ══════════════════════════════════════════════════════════════
  async function renderTeam() {
    setActiveTab('team');
    $('#g-header-action').innerHTML = '';
    const content = $('#g-tab-content');
    content.innerHTML = `<div class="flex justify-center py-8"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i></div>`;

    let members = [];
    try {
      members = await WorkVoltDB.list('users', { garage_id: _garage.id });
    } catch (e) {}

    const user = WorkVolt.user();
    content.innerHTML = `
      <div class="slide-up space-y-5">
        <!-- Garage info card -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100">
            <h3 class="font-bold text-slate-800 text-sm">Garage Info</h3>
          </div>
          <div class="px-4 py-4 space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-slate-400 font-medium">Garage Name</span>
              <span class="font-semibold text-slate-800">${_garage.name}</span>
            </div>
            <div class="flex justify-between text-sm items-start gap-4">
              <span class="text-slate-400 font-medium whitespace-nowrap">Garage ID</span>
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs text-slate-500 break-all text-right">${_garage.id}</span>
                <button onclick="GarageModule._copyGarageId()" class="btn-secondary text-xs px-2 py-1 whitespace-nowrap">
                  <i class="fas fa-copy text-xs"></i>
                </button>
              </div>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-400 font-medium">Created</span>
              <span class="text-slate-600">${dateLabel(_garage.created_at)}</span>
            </div>
          </div>
        </div>

        <!-- Invite hint -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex gap-2.5">
          <i class="fas fa-info-circle mt-0.5 text-blue-400 flex-shrink-0"></i>
          <span>To invite a team member: share your <strong>Garage ID</strong> above. They register an account in Work Volt, then open the Garage module and choose <em>Join Existing Garage</em>.</span>
        </div>

        <!-- Members table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-slate-800 text-sm">Members</h3>
            <span class="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
              ${members.length} member${members.length !== 1 ? 's' : ''}
            </span>
          </div>
          ${members.length === 0
            ? `<div class="text-center py-10 text-slate-400 text-sm">No members found</div>`
            : `<table class="w-full text-sm">
                <thead><tr class="border-b border-slate-100">
                  <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Name</th>
                  <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Email</th>
                  <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Role</th>
                  <th class="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wide">Joined</th>
                </tr></thead>
                <tbody>
                  ${members.map(m => `
                    <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2.5">
                          <div class="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                            ${(m.name || m.email || '?').slice(0,2).toUpperCase()}
                          </div>
                          <span class="font-medium text-slate-800">${m.name || '—'} ${m.id === user?.id ? '<span class="text-xs text-slate-400">(you)</span>' : ''}</span>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-slate-500">${m.email || '—'}</td>
                      <td class="px-4 py-3">
                        <span class="text-xs font-bold px-2 py-1 rounded-full ${m.role === 'admin' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">
                          ${m.role || 'employee'}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-xs text-slate-400">${dateLabel(m.created_at)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  NEW REPAIR MODAL
  // ══════════════════════════════════════════════════════════════
  function openNewRepair() {
    const root = document.getElementById('modals-root');
    root.innerHTML = `
      <div id="repair-modal-bg" class="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
           onclick="if(event.target===this)GarageModule.closeModal()">
        <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto thin-scroll">

          <!-- Head -->
          <div class="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
            <div class="flex items-center gap-2">
              <h2 class="font-extrabold text-slate-900">New Repair Order</h2>
              <span class="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 uppercase">Private</span>
            </div>
            <button onclick="GarageModule.closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
              <i class="fas fa-times text-sm"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="px-6 py-5 space-y-5">
            <div id="repair-error" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>

            <!-- Vehicle -->
            <div>
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Vehicle</p>
              <div class="mb-3">
                <label class="block text-xs font-semibold text-slate-600 mb-1">VIN <span class="text-red-500">*</span></label>
                <input id="r-vin" class="field font-mono uppercase" placeholder="1HGBH41JXMN109186" maxlength="17">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">Make</label><input id="r-make" class="field" placeholder="Honda"></div>
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">Model</label><input id="r-model" class="field" placeholder="Civic"></div>
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">Year</label><input id="r-year" class="field" placeholder="2019" type="number"></div>
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">Color</label><input id="r-color" class="field" placeholder="Silver"></div>
              </div>
            </div>

            <!-- Client (private) -->
            <div class="border-t border-slate-100 pt-4">
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
                Client <span class="text-red-500 ml-1 font-bold normal-case">private — never shared</span>
              </p>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">Name</label><input id="r-client-name" class="field" placeholder="Jean Tremblay"></div>
                <div><label class="block text-xs font-semibold text-slate-600 mb-1">Phone</label><input id="r-client-phone" class="field" placeholder="+1 514 555-0101"></div>
                <div class="col-span-2"><label class="block text-xs font-semibold text-slate-600 mb-1">Email</label><input id="r-client-email" class="field" type="email" placeholder="jean@example.com"></div>
              </div>
            </div>

            <!-- Repair lines -->
            <div class="border-t border-slate-100 pt-4">
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Repair Lines</p>
              <div class="grid grid-cols-[1fr_110px] gap-2 mb-1.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Description</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Labour $</span>
              </div>
              <div id="repair-lines" class="space-y-2"></div>
              <button onclick="GarageModule._addRepairLine()" class="btn-secondary text-xs mt-2 px-3 py-1.5">
                <i class="fas fa-plus text-xs"></i> Add line
              </button>
            </div>

            <!-- Parts -->
            <div class="border-t border-slate-100 pt-4">
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Parts</p>
              <div class="grid grid-cols-[2fr_1fr_90px_60px] gap-2 mb-1.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Part Name</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Supplier</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Price $</span>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Qty</span>
              </div>
              <div id="part-lines" class="space-y-2"></div>
              <button onclick="GarageModule._addPartLine()" class="btn-secondary text-xs mt-2 px-3 py-1.5">
                <i class="fas fa-plus text-xs"></i> Add part
              </button>
            </div>

            <!-- Notes -->
            <div class="border-t border-slate-100 pt-4">
              <label class="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Internal Notes</label>
              <textarea id="r-notes" class="field" rows="2" placeholder="Technician notes, warranty info…"></textarea>
            </div>

            <!-- Total -->
            <div class="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex justify-between items-center">
              <div>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wide" id="total-breakdown">LABOUR: $0.00 · PARTS: $0.00</p>
                <p class="text-xs text-slate-500 font-semibold mt-0.5">TOTAL</p>
              </div>
              <p class="text-2xl font-extrabold text-blue-600 font-mono" id="total-display">$0.00</p>
            </div>

            <!-- Share toggle -->
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" id="r-share" class="mt-0.5" checked>
              <div>
                <p class="text-sm font-semibold text-slate-700">Share anonymized repair data</p>
                <p class="text-xs text-slate-400">No prices, no client info — contributes to shared VIN history across all garages</p>
              </div>
            </label>
          </div>

          <!-- Footer -->
          <div class="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
            <button onclick="GarageModule.closeModal()" class="btn-secondary">Cancel</button>
            <button onclick="GarageModule._submitRepair()" id="repair-submit-btn" class="btn-primary">
              <i class="fas fa-save text-sm"></i> Save Repair Order
            </button>
          </div>
        </div>
      </div>`;

    // seed first rows
    GarageModule._addRepairLine();
    GarageModule._addPartLine();
    GarageModule._recalcTotal();
  }

  function _repairLineHTML(i) {
    return `<div class="grid grid-cols-[1fr_110px] gap-2" data-repair-line="${i}">
      <input class="field r-desc" placeholder="Oil change, brake service…" oninput="GarageModule._recalcTotal()">
      <input class="field r-labor font-mono" type="number" min="0" step="0.01" placeholder="0.00" oninput="GarageModule._recalcTotal()">
    </div>`;
  }

  function _partLineHTML(i) {
    return `<div class="grid grid-cols-[2fr_1fr_90px_60px] gap-2" data-part-line="${i}">
      <input class="field p-name" placeholder="Oil filter" oninput="GarageModule._recalcTotal()">
      <input class="field p-supplier" placeholder="NAPA">
      <input class="field p-price font-mono" type="number" min="0" step="0.01" placeholder="0.00" oninput="GarageModule._recalcTotal()">
      <input class="field p-qty font-mono" type="number" min="1" value="1" oninput="GarageModule._recalcTotal()">
    </div>`;
  }

  let _rLineCount = 0, _pLineCount = 0;

  function _addRepairLine() {
    const container = document.getElementById('repair-lines');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', _repairLineHTML(_rLineCount++));
  }

  function _addPartLine() {
    const container = document.getElementById('part-lines');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', _partLineHTML(_pLineCount++));
  }

  function _recalcTotal() {
    const labor = Array.from(document.querySelectorAll('.r-labor')).reduce((s, el) => s + parseFloat(el.value || 0), 0);
    const parts = Array.from(document.querySelectorAll('[data-part-line]')).reduce((s, row) => {
      const price = parseFloat(row.querySelector('.p-price')?.value || 0);
      const qty   = parseInt(row.querySelector('.p-qty')?.value || 1);
      return s + price * qty;
    }, 0);
    const total = labor + parts;
    const bd = document.getElementById('total-breakdown');
    const td = document.getElementById('total-display');
    if (bd) bd.textContent = `LABOUR: $${fmt(labor)} · PARTS: $${fmt(parts)}`;
    if (td) td.textContent = `$${fmt(total)}`;
  }

  function _collectRepairForm() {
    const repairLines = Array.from(document.querySelectorAll('[data-repair-line]')).map(row => ({
      description: row.querySelector('.r-desc')?.value?.trim() || '',
      labor:       row.querySelector('.r-labor')?.value || '0',
    }));
    const partLines = Array.from(document.querySelectorAll('[data-part-line]')).map(row => ({
      name:     row.querySelector('.p-name')?.value?.trim() || '',
      supplier: row.querySelector('.p-supplier')?.value?.trim() || '',
      price:    row.querySelector('.p-price')?.value || '0',
      qty:      row.querySelector('.p-qty')?.value || '1',
    }));
    const { total, labor, parts } = computeTotal(repairLines, partLines);
    return {
      vin:         (document.getElementById('r-vin')?.value || '').trim(),
      make:        document.getElementById('r-make')?.value?.trim() || '',
      model:       document.getElementById('r-model')?.value?.trim() || '',
      year:        document.getElementById('r-year')?.value?.trim() || '',
      color:       document.getElementById('r-color')?.value?.trim() || '',
      clientName:  document.getElementById('r-client-name')?.value?.trim() || '',
      clientPhone: document.getElementById('r-client-phone')?.value?.trim() || '',
      clientEmail: document.getElementById('r-client-email')?.value?.trim() || '',
      notes:       document.getElementById('r-notes')?.value?.trim() || '',
      repairLines, partLines, total,
    };
  }

  async function _submitRepair() {
    const data = _collectRepairForm();
    const errEl = document.getElementById('repair-error');
    if (!data.vin) {
      errEl.textContent = 'VIN is required.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const btn = document.getElementById('repair-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…';

    const shareAnon = document.getElementById('r-share')?.checked ?? true;
    try {
      await saveRepair(data, shareAnon);
      WorkVolt.toast('Repair order saved!', 'success');
      closeModal();
      // Reload repairs list
      _repairs = await loadRepairs();
      if (_view === 'repairs')   renderRepairs();
      if (_view === 'dashboard') renderDashboard();
    } catch (e) {
      WorkVolt.toast(e.message || 'Failed to save', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save text-sm"></i> Save Repair Order';
    }
  }

  function closeModal() {
    document.getElementById('modals-root').innerHTML = '';
    _rLineCount = 0;
    _pLineCount = 0;
  }

  // ══════════════════════════════════════════════════════════════
  //  SETUP SUBMIT
  // ══════════════════════════════════════════════════════════════
  async function _submitSetup() {
    const errEl = document.getElementById('setup-error');
    errEl.classList.add('hidden');
    const mode   = document.getElementById('setup-join-fields').classList.contains('hidden') ? 'create' : 'join';
    const btn    = document.getElementById('setup-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Setting up…';
    const user   = WorkVolt.user();

    try {
      let garageId;
      if (mode === 'create') {
        const name = (document.getElementById('setup-garage-name')?.value || '').trim();
        const role = document.getElementById('setup-role')?.value || 'admin';
        if (!name) throw new Error('Garage name is required');
        const garage = await WorkVoltDB.create('garages', { name });
        garageId = garage.id;
        await WorkVoltDB.update('users', user.id, { garage_id: garageId, role });
      } else {
        const gid = (document.getElementById('setup-garage-id')?.value || '').trim();
        if (!gid) throw new Error('Garage ID is required');
        const rows = await WorkVoltDB.list('garages', { id: gid });
        if (!rows.length) throw new Error('Garage not found — double-check the ID');
        garageId = gid;
        await WorkVoltDB.update('users', user.id, { garage_id: garageId, role: 'employee' });
      }

      // Reload page — garage is now linked
      WorkVolt.toast('Garage ready!', 'success');
      WorkVolt.navigate('garage');
    } catch (e) {
      errEl.textContent = e.message || 'Setup failed';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check text-sm"></i> Continue';
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SHARED SEARCH
  // ══════════════════════════════════════════════════════════════
  async function _searchShared() {
    const vin = (document.getElementById('shared-vin-input')?.value || '').trim().toUpperCase();
    if (!vin) return;
    const resultsEl = document.getElementById('shared-results');
    resultsEl.innerHTML = `<div class="flex justify-center py-8"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i></div>`;
    const rows = await searchShared(vin);
    if (!rows.length) {
      resultsEl.innerHTML = `<div class="text-center py-12 text-slate-400"><i class="fas fa-inbox text-3xl block mb-3 opacity-30"></i><p class="text-sm">No shared history found for <span class="font-mono text-blue-500">${vin}</span></p></div>`;
      return;
    }
    resultsEl.innerHTML = `
      <p class="text-xs text-slate-400 mb-3">${rows.length} record${rows.length !== 1 ? 's' : ''} found for <span class="font-mono text-blue-600">${vin}</span></p>
      ${rows.map(r => `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p class="font-bold text-slate-800">${r.vehicle?.year || ''} ${r.vehicle?.make || ''} ${r.vehicle?.model || ''}</p>
              <p class="font-mono text-xs text-slate-400">${r.vin}</p>
            </div>
            <p class="text-xs text-slate-400 font-semibold">${r.serviced_at || ''}</p>
          </div>
          <div class="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Services</p>
              ${(r.repairs || []).map(rep => `<p class="text-sm text-slate-700 mb-1">• ${rep.description}</p>`).join('') || '<p class="text-sm text-slate-400">—</p>'}
            </div>
            <div>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Parts</p>
              ${(r.parts || []).map(p => `<p class="text-sm text-slate-500 mb-1">• ${p.name}${p.supplier ? ` — ${p.supplier}` : ''}</p>`).join('') || '<p class="text-sm text-slate-400">—</p>'}
            </div>
          </div>
        </div>`).join('')}`;
  }

  // ── Filter repairs table ──────────────────────────────────────
  function _filterRepairs(q) {
    const lower = q.toLowerCase();
    const filtered = lower
      ? _repairs.filter(r =>
          r.vin?.toLowerCase().includes(lower) ||
          r.vehicle?.make?.toLowerCase().includes(lower) ||
          r.vehicle?.model?.toLowerCase().includes(lower) ||
          r.client?.name?.toLowerCase().includes(lower))
      : _repairs;
    const wrap = document.getElementById('repairs-table-wrap');
    if (wrap) wrap.innerHTML = buildRepairsTable(filtered);
  }

  // ── Copy garage ID ────────────────────────────────────────────
  function _copyGarageId() {
    navigator.clipboard.writeText(_garage.id).then(() => WorkVolt.toast('Garage ID copied!', 'success'));
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API — exposed on window.GarageModule
  // ══════════════════════════════════════════════════════════════
  window.GarageModule = {
    switchTab(tabId) {
      _view = tabId;
      $('#g-header-action').innerHTML = '';
      if (tabId === 'dashboard') renderDashboard();
      if (tabId === 'repairs')   renderRepairs();
      if (tabId === 'shared')    renderShared();
      if (tabId === 'team')      renderTeam();
    },
    openNewRepair,
    closeModal,
    _addRepairLine,
    _addPartLine,
    _recalcTotal,
    _submitRepair,
    _submitSetup,
    _searchShared,
    _filterRepairs,
    _copyGarageId,
    _setupMode: () => {},       // overwritten by renderSetup
  };

  // ══════════════════════════════════════════════════════════════
  //  ENTRY POINT — called by Work Volt module loader
  // ══════════════════════════════════════════════════════════════
  window.WorkVoltPages = window.WorkVoltPages || {};
  window.WorkVoltPages.garage = async function (container) {
    _rLineCount = 0;
    _pLineCount = 0;
    _view = 'dashboard';

    // Loading state
    container.innerHTML = `<div class="flex flex-col items-center justify-center h-64 gap-3">
      <i class="fas fa-circle-notch fa-spin text-3xl text-blue-500 opacity-60"></i>
      <p class="text-sm text-slate-400">Loading garage…</p>
    </div>`;

    _garage  = await loadGarage();

    // User hasn't set up a garage yet
    if (!_garage) {
      renderSetup(container);
      return;
    }

    _repairs = await loadRepairs();

    // Render shell + default tab
    renderShell(container);
    const nameEl = document.getElementById('g-garage-name');
    if (nameEl) nameEl.textContent = '— ' + _garage.name;
    renderDashboard();
  };

})();
