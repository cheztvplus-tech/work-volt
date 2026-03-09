window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['store'] = function(container) {

  // ── Store catalogue ────────────────────────────────────────────────
  const CATALOGUE = [
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'fa-bell',
      category: 'Productivity',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Full notification center with smart grouping, priority levels, bell alerts, popup toasts, persistent banners, and quiet hours. Wires directly into Tasks, approvals, and mentions.',
      tags: ['notifications', 'alerts', 'productivity'],
      color: '#3b82f6',
      gradient: 'from-blue-500 to-indigo-600',
      featured: true,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: 'fa-check-circle',
      category: 'Productivity',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Create, assign and track tasks across your team. Set priorities, due dates and follow progress in one place.',
      tags: ['tasks', 'productivity', 'team'],
      color: '#8b5cf6',
      gradient: 'from-violet-500 to-purple-600',
      featured: true,
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: 'fa-users',
      category: 'Sales',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Visualise and manage your sales pipeline with a Kanban board. Track deals from lead to close.',
      tags: ['sales', 'pipeline', 'deals'],
      color: '#3b82f6',
      gradient: 'from-blue-500 to-indigo-600',
      featured: true,
    },
    {
      id: 'payroll',
      label: 'Payroll',
      icon: 'fa-money-bill-wave',
      category: 'HR',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Run payroll, manage salaries, deductions and bonuses. Generate pay slips directly from your Sheet.',
      tags: ['payroll', 'hr', 'salary'],
      color: '#10b981',
      gradient: 'from-emerald-500 to-teal-600',
      featured: false,
    },
    {
      id: 'timesheets',
      label: 'Timesheets',
      icon: 'fa-clock',
      category: 'HR',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Log daily work hours, submit timesheets for approval and track billable vs non-billable time.',
      tags: ['time', 'hr', 'billing'],
      color: '#f59e0b',
      gradient: 'from-amber-500 to-orange-500',
      featured: false,
    },
    {
      id: 'financials',
      label: 'Financials',
      icon: 'fa-chart-line',
      category: 'Finance',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Track revenue, costs and profit & loss across periods. Visual dashboards powered by your Sheet data.',
      tags: ['finance', 'accounting', 'reporting'],
      color: '#06b6d4',
      gradient: 'from-cyan-500 to-blue-500',
      featured: true,
    },
    {
      id: 'crm',
      label: 'CRM',
      icon: 'fa-address-book',
      category: 'Sales',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Manage clients, contacts and interactions. Keep your relationship history in one searchable place.',
      tags: ['crm', 'clients', 'sales'],
      color: '#ec4899',
      gradient: 'from-pink-500 to-rose-500',
      featured: false,
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'fa-folder-open',
      category: 'Productivity',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'World-class project management with mission control header, List/Board/Calendar views, team workload, analytics panel, activity feed, and Focus Mode. Links directly with the Tasks module.',
      tags: ['projects', 'planning', 'team', 'tasks'],
      color: '#3b82f6',
      gradient: 'from-blue-500 to-indigo-600',
      featured: true,
      requires: ['tasks'],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: 'fa-chart-pie',
      category: 'Analytics',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Generate cross-module reports and analytics. Visualise KPIs, trends and summaries from your data.',
      tags: ['reports', 'analytics', 'kpi'],
      color: '#6366f1',
      gradient: 'from-indigo-500 to-violet-600',
      featured: false,
    },
    {
      id: 'assets',
      label: 'Assets',
      icon: 'fa-box-open',
      category: 'Operations',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Track company equipment, tools and assets. Assign items to employees and monitor status and condition.',
      tags: ['assets', 'equipment', 'operations'],
      color: '#64748b',
      gradient: 'from-slate-500 to-slate-700',
      featured: false,
    },
    {
      id: 'attendance',
      label: 'Attendance Tracker',
      icon: 'fa-calendar-check',
      category: 'HR',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Track daily check-ins, check-outs, absences and late arrivals. Full attendance history with export support.',
      tags: ['hr', 'time', 'tracking'],
      color: '#6366f1',
      gradient: 'from-indigo-500 to-purple-600',
      featured: false,
    },
    {
      id: 'invoices',
      label: 'Invoice Manager',
      icon: 'fa-file-invoice-dollar',
      category: 'Finance',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Create, send and track invoices. Manage payment status, overdue reminders and revenue summaries.',
      tags: ['finance', 'billing', 'clients'],
      color: '#10b981',
      gradient: 'from-emerald-500 to-teal-600',
      featured: true,
    },
    {
      id: 'inventory',
      label: 'Inventory Control',
      icon: 'fa-warehouse',
      category: 'Operations',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Monitor stock levels, set reorder points and track item movements across locations.',
      tags: ['stock', 'warehouse', 'operations'],
      color: '#f59e0b',
      gradient: 'from-amber-500 to-orange-500',
      featured: false,
    },
    {
      id: 'scheduler',
      label: 'Shift Scheduler',
      icon: 'fa-calendar-alt',
      category: 'HR',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Build weekly shift rosters, manage swaps and publish schedules directly to your team.',
      tags: ['shifts', 'roster', 'hr'],
      color: '#3b82f6',
      gradient: 'from-blue-500 to-cyan-500',
      featured: false,
    },
    {
      id: 'expenses',
      label: 'Expense Claims',
      icon: 'fa-receipt',
      category: 'Finance',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Submit and approve expense claims with receipt uploads, category tagging and budget tracking.',
      tags: ['expenses', 'reimbursement', 'finance'],
      color: '#ec4899',
      gradient: 'from-pink-500 to-rose-500',
      featured: true,
    },
    {
      id: 'contracts',
      label: 'Contract Hub',
      icon: 'fa-file-signature',
      category: 'Legal',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Store, track and manage contracts with expiry alerts, e-signature readiness and version history.',
      tags: ['legal', 'documents', 'compliance'],
      color: '#8b5cf6',
      gradient: 'from-violet-500 to-purple-600',
      featured: false,
    },
    {
      id: 'helpdesk',
      label: 'Help Desk',
      icon: 'fa-headset',
      category: 'Support',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Internal support ticketing system. Assign tickets, track resolution times and measure SLA compliance.',
      tags: ['support', 'tickets', 'it'],
      color: '#06b6d4',
      gradient: 'from-cyan-500 to-blue-500',
      featured: false,
    },
    {
      id: 'recruitment',
      label: 'Recruitment Pipeline',
      icon: 'fa-user-tie',
      category: 'HR',
      version: '1.0.0',
      author: 'Work Volt',
      description: 'Track job applications from sourcing to offer. Manage candidates, interviews and hiring decisions.',
      tags: ['hiring', 'hr', 'candidates'],
      color: '#f97316',
      gradient: 'from-orange-500 to-red-500',
      featured: false,
    },
  ];

  const CATEGORIES = ['All', 'HR', 'Finance', 'Sales', 'Productivity', 'Operations', 'Analytics', 'Legal', 'Support'];

  // ── State ──────────────────────────────────────────────────────────
  let activeCategory = 'All';
  let searchQuery    = '';
  let detailModule   = null;
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

  // ── Helpers ─────────────────────────────────────────────────────────
  function isInstalled(id) {
    return (window.INSTALLED_MODULES || []).some(m => m.id === id);
  }

  function getInstalled() {
    return window.INSTALLED_MODULES || [];
  }

  // ── Install ─────────────────────────────────────────────────────
  async function installModule(mod) {
    if (isInstalled(mod.id)) return;
    if (isComingSoon(mod)) return;

    const gasUrl    = window.API_URL || localStorage.getItem('wv_gas_url') || '';
    const apiSecret = window.API_SECRET_CLIENT || localStorage.getItem('wv_api_secret') || '';

    // Show installing state
    const btn = document.querySelector(`button[data-install="${mod.id}"]`);
    if (btn) { 
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Installing…'; 
    }

    if (!gasUrl) {
        window.WorkVolt?.toast('Please connect Google Sheet first', 'error');
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-download text-xs"></i> Install'; 
        }
        return;
    }

    const sessionId = window.WorkVolt?.session() || localStorage.getItem('wv_session') || '';
    
    try {
        // CRITICAL: Call GAS to install module on SERVER
        const url = new URL(gasUrl);
        url.searchParams.set('path', 'module/install');
        url.searchParams.set('token', apiSecret);  // FIX: include API secret for auth
        url.searchParams.set('session_id', sessionId);
        url.searchParams.set('sheet_id', localStorage.getItem('wv_sheet_id') || '');
        url.searchParams.set('module', mod.id);
        
        const res = await fetch(url.toString(), { cache: 'no-cache' });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        // Now reload modules from server to get the updated list
        const modulesRes = await fetch(
          `${gasUrl}?path=config/modules&token=${apiSecret}&session_id=${sessionId}&sheet_id=${localStorage.getItem('wv_sheet_id')}&_t=${Date.now()}`,
          { cache: 'no-cache' }
        );
        const modulesData = await modulesRes.json();
        
        if (modulesData.modules) {
            window.INSTALLED_MODULES = modulesData.modules;
            window.WorkVolt?.toast(`${mod.label} installed!`, 'success');
            if (typeof renderNav === 'function') renderNav();
            render();
        }

    } catch(e) {
        window.WorkVolt?.toast(`Install failed: ${e.message}`, 'error');
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-download text-xs"></i> Install'; 
        }
    }
  }

  // ── Uninstall ────────────────────────────────────────────────────
  async function uninstallModule(id) {
    const gasUrl    = window.API_URL || localStorage.getItem('wv_gas_url') || '';
    const apiSecret = window.API_SECRET_CLIENT || localStorage.getItem('wv_api_secret') || '';
    const sessionId = window.WorkVolt?.session() || localStorage.getItem('wv_session') || '';
    const sheetId   = localStorage.getItem('wv_sheet_id') || '';

    if (!gasUrl || !apiSecret) {
        window.WorkVolt?.toast('Not connected to server — please check Settings → Connection', 'error');
        return;
    }

    try {
        // Call GAS to uninstall
        const url = new URL(gasUrl);
        url.searchParams.set('path', 'module/uninstall');
        url.searchParams.set('token', apiSecret);
        url.searchParams.set('module', id);
        
        const res = await fetch(url.toString(), { cache: 'no-cache' });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        // Reload from server to get the updated list
        const modulesUrl = new URL(gasUrl);
        modulesUrl.searchParams.set('path', 'config/modules');
        modulesUrl.searchParams.set('token', apiSecret);
        modulesUrl.searchParams.set('_t', Date.now().toString());
        
        const modulesRes = await fetch(modulesUrl.toString(), { cache: 'no-cache' });
        const modulesData = await modulesRes.json();
        
        if (modulesData.modules) {
            window.INSTALLED_MODULES = modulesData.modules;
            if (typeof renderNav === 'function') renderNav();
            render();
            window.WorkVolt?.toast('Module removed', 'info');
        }
    } catch(e) {
        window.WorkVolt?.toast(`Uninstall failed: ${e.message}`, 'error');
        console.error('Uninstall error:', e);
    }
  }

  function filtered() {
    return CATALOGUE.filter(m => {
      const matchCat = activeCategory === 'All' || m.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q ||
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some(t => t.includes(q));
      return matchCat && matchSearch;
    });
  }

  // ── Render ──────────────────────────────────────────────────────────
  function render() {
    const list      = filtered();
    const installed = getInstalled();
    const featured  = CATALOGUE.filter(m => m.featured && !isInstalled(m.id));

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">

        <!-- ── Hero header ── -->
        <div class="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 md:px-10 pt-10 pb-6 relative overflow-hidden">
          <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle at 20% 50%, #6366f1 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f6 0%, transparent 40%)"></div>
          <div class="relative max-w-4xl mx-auto">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <i class="fas fa-store text-white text-lg"></i>
              </div>
              <div>
                <p class="text-blue-300 text-xs font-semibold tracking-widest uppercase">Work Volt</p>
                <h1 class="text-white text-2xl font-extrabold leading-tight">Module Store</h1>
              </div>
            </div>
            <p class="text-slate-300 text-sm max-w-lg mb-6">Extend your workspace with powerful add-on modules. Install once, appears in your sidebar instantly.</p>

            <!-- Search -->
            <div class="relative max-w-md">
              <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input id="store-search" type="text" placeholder="Search modules…"
                value="${searchQuery}"
                class="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all backdrop-blur-sm">
            </div>
          </div>
        </div>

        <div class="max-w-4xl mx-auto px-6 md:px-10 pb-16">

          <!-- ── Installed strip ── -->
          ${installed.length ? `
          <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-bold text-slate-900 flex items-center gap-2">
                <i class="fas fa-check-circle text-green-500 text-sm"></i>
                Installed (${installed.length})
              </h2>
            </div>
            <div class="flex flex-wrap gap-2">
              ${installed.map(m => `
                <div class="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <div class="w-7 h-7 bg-gradient-to-br ${CATALOGUE.find(c=>c.id===m.id)?.gradient||'from-slate-400 to-slate-500'} rounded-lg flex items-center justify-center">
                    <i class="fas ${m.icon} text-white text-xs"></i>
                  </div>
                  <span class="text-sm font-semibold text-slate-700">${m.label}</span>
                  <span class="text-xs text-slate-400">v${m.version}</span>
                  <button onclick="storeUninstall('${m.id}')" class="ml-1 text-slate-300 hover:text-red-400 transition-colors" title="Uninstall">
                    <i class="fas fa-times text-xs"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          <!-- ── Featured (only when no search/filter) ── -->
          ${!searchQuery && activeCategory === 'All' && featured.length ? `
          <div class="mb-8">
            <h2 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i class="fas fa-star text-amber-400 text-sm"></i> Featured Modules
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              ${featured.slice(0,3).map(m => renderFeaturedCard(m)).join('')}
            </div>
          </div>
          ` : ''}

          <!-- ── Category pills ── -->
          <div class="flex gap-2 overflow-x-auto pb-1 mb-5 hide-scrollbar">
            ${CATEGORIES.map(cat => `
              <button onclick="storeSetCategory('${cat}')"
                class="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'}">
                ${cat}
              </button>
            `).join('')}
          </div>

          <!-- ── Module grid ── -->
          ${list.length ? `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${list.map(m => renderCard(m)).join('')}
          </div>
          ` : `
          <div class="text-center py-20 text-slate-400">
            <i class="fas fa-search text-4xl mb-3 opacity-30"></i>
            <p class="font-semibold">No modules found</p>
            <p class="text-sm mt-1">Try a different search or category</p>
          </div>
          `}

        </div>
      </div>

      <!-- ── Detail modal ── -->
      <div id="store-modal" class="hidden fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 modal-overlay bg-black/50">
        <div id="store-modal-inner" class="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        </div>
      </div>
    `;

    // Bind events
    document.getElementById('store-search').addEventListener('input', e => {
      searchQuery = e.target.value;
      render();
    });

    // Re-focus search if was searching
    if (searchQuery) {
      const inp = document.getElementById('store-search');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }

    // Expose handlers to global scope
    window.storeSetCategory = (cat) => { activeCategory = cat; render(); };
    window.storeInstall     = (id) => { const m = CATALOGUE.find(c => c.id === id); if (m) installModule(m); };
    window.storeUninstall   = (id) => uninstallModule(id);
    window.storeOpenDetail  = (id) => openDetail(id);
    window.storeCloseModal  = () => document.getElementById('store-modal').classList.add('hidden');
  }

  function renderFeaturedCard(m) {
    const inst = isInstalled(m.id);
    return `
      <div class="group relative bg-gradient-to-br ${m.gradient} rounded-2xl p-5 text-white overflow-hidden cursor-pointer hover:shadow-xl transition-all hover:-translate-y-0.5"
           onclick="storeOpenDetail('${m.id}')">
        <div class="absolute -right-4 -bottom-4 opacity-10">
          <i class="fas ${m.icon} text-8xl"></i>
        </div>
        <span class="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-3 block">${m.category}</span>
        <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
          <i class="fas ${m.icon} text-white text-lg"></i>
        </div>
        <h3 class="font-bold text-base mb-1">${m.label}</h3>
        <p class="text-xs opacity-75 leading-relaxed line-clamp-2 mb-4">${m.description}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs opacity-60">v${m.version}</span>
          ${inst
            ? `<span class="text-xs bg-white/20 px-3 py-1 rounded-full font-semibold"><i class="fas fa-check mr-1"></i>Installed</span>`
            : isComingSoon(m)
              ? `<span class="text-xs bg-white/20 px-3 py-1 rounded-full font-semibold opacity-80"><i class="fas fa-clock mr-1"></i>Coming Soon</span>`
              : `<button onclick="event.stopPropagation();storeInstall('${m.id}')" class="text-xs bg-white text-slate-800 font-bold px-3 py-1 rounded-full hover:bg-blue-50 transition-colors">Install</button>`
          }
        </div>
      </div>
    `;
  }

  function renderCard(m) {
    const inst   = isInstalled(m.id);
    const coming = isComingSoon(m);
    return `
      <div class="group bg-white border border-slate-200 rounded-2xl p-5 transition-all cursor-pointer
                  ${coming ? 'opacity-75 hover:border-amber-200 hover:shadow-md' : 'hover:border-blue-200 hover:shadow-md'}"
           onclick="storeOpenDetail('${m.id}')">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-gradient-to-br ${m.gradient} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${coming ? 'opacity-60' : ''}">
            <i class="fas ${m.icon} text-white text-lg"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <h3 class="font-bold text-slate-900 text-sm">${m.label}</h3>
              <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">${m.category}</span>
              ${coming
                ? `<span class="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-semibold"><i class="fas fa-clock text-[8px] mr-0.5"></i>Coming Soon</span>`
                : m.featured ? `<span class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-semibold"><i class="fas fa-star text-[8px] mr-0.5"></i>Featured</span>` : ''
              }
            </div>
            <p class="text-xs text-slate-500 leading-relaxed line-clamp-2">${m.description}</p>
          </div>
        </div>
        <div class="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400">by ${m.author}</span>
            <span class="text-slate-200">·</span>
            <span class="text-xs text-slate-400">v${m.version}</span>
          </div>
          ${inst
            ? `<span class="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-xl">
                <i class="fas fa-check-circle text-xs"></i> Installed
               </span>`
            : coming
              ? `<span class="flex items-center gap-1.5 text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-xl">
                   <i class="fas fa-clock text-xs"></i> Coming Soon
                 </span>`
              : `<button onclick="event.stopPropagation();storeInstall('${m.id}')"
                   data-install="${m.id}"
                   class="flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white px-3 py-1.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all">
                   <i class="fas fa-download text-xs"></i> Install
                 </button>`
          }
        </div>
      </div>
    `;
  }

  function openDetail(id) {
    const m    = CATALOGUE.find(c => c.id === id);
    if (!m) return;
    const inst   = isInstalled(m.id);
    const coming = isComingSoon(m);
    const modal      = document.getElementById('store-modal');
    const modalInner = document.getElementById('store-modal-inner');

    modalInner.innerHTML = `
      <!-- Gradient header -->
      <div class="bg-gradient-to-br ${m.gradient} px-6 pt-6 pb-8 text-white relative overflow-hidden flex-shrink-0">
        <div class="absolute -right-6 -bottom-4 opacity-10">
          <i class="fas ${m.icon} text-9xl"></i>
        </div>
        <button onclick="storeCloseModal()" class="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors">
          <i class="fas fa-times text-sm"></i>
        </button>
        <div class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
          <i class="fas ${m.icon} text-2xl"></i>
        </div>
        <h2 class="text-xl font-extrabold mb-1">${m.label}</h2>
        <div class="flex items-center gap-2 text-xs opacity-80">
          <span>${m.category}</span>
          <span>·</span>
          <span>by ${m.author}</span>
          <span>·</span>
          <span>v${m.version}</span>
        </div>
      </div>

      <!-- Body -->
      <div class="p-6 overflow-y-auto flex-1">
        <p class="text-slate-600 text-sm leading-relaxed mb-5">${m.description}</p>

        <!-- Tags -->
        <div class="flex flex-wrap gap-2 mb-6">
          ${m.tags.map(t => `<span class="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-medium">#${t}</span>`).join('')}
        </div>

        <!-- What's included -->
        <div class="bg-slate-50 rounded-xl p-4 mb-6">
          <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">What's Included</h3>
          <ul class="space-y-2">
            <li class="flex items-center gap-2 text-sm text-slate-600"><i class="fas fa-check text-green-500 text-xs w-4"></i>Sidebar navigation entry</li>
            <li class="flex items-center gap-2 text-sm text-slate-600"><i class="fas fa-check text-green-500 text-xs w-4"></i>Full module UI page</li>
            <li class="flex items-center gap-2 text-sm text-slate-600"><i class="fas fa-check text-green-500 text-xs w-4"></i>Google Sheet integration ready</li>
            <li class="flex items-center gap-2 text-sm text-slate-600"><i class="fas fa-check text-green-500 text-xs w-4"></i>Role-based access control</li>
          </ul>
        </div>

        <!-- Action -->
        ${inst
          ? `<div class="flex gap-3">
               <div class="flex-1 flex items-center justify-center gap-2 bg-green-50 text-green-700 font-semibold rounded-xl py-3 text-sm">
                 <i class="fas fa-check-circle"></i> Installed
               </div>
               <button onclick="storeUninstall('${m.id}');storeCloseModal()"
                 class="px-4 py-3 bg-red-50 text-red-500 hover:bg-red-100 font-semibold rounded-xl text-sm transition-colors">
                 Remove
               </button>
             </div>`
          : coming
            ? `<div class="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 font-semibold rounded-xl py-3.5 text-sm">
                 <i class="fas fa-clock"></i> Coming Soon — Check back later!
               </div>`
            : `<button onclick="storeInstall('${m.id}');storeCloseModal()"
                 class="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 text-sm transition-all active:scale-[.98] shadow-lg shadow-blue-200">
                 <i class="fas fa-download"></i> Install Module
               </button>`
        }
      </div>
    `;

    modal.classList.remove('hidden');

    // Close on backdrop click
    modal.onclick = (e) => { if (e.target === modal) storeCloseModal(); };
  }

  // Initial render — probe pages first, then re-render with Coming Soon resolved
  render();
  probeAvailablePages().then(() => render());
};
