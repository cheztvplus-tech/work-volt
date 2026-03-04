window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['dashboard'] = function(container) {

  const user    = window.WorkVolt?.user() || { name: 'there', role: 'SuperAdmin' };
  const isAdmin = ['SuperAdmin', 'Admin'].includes(user.role);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // First name only
  const firstName = (user.name || 'there').split(' ')[0];

  // Installed add-on modules count
  const installedCount = (window.INSTALLED_MODULES || []).length;

  // Installed modules (add-ons from the store)
  const coreModules = (window.INSTALLED_MODULES || []).map(m => {
    const meta = {
      tasks:       { color: 'bg-violet-500',  desc: 'Manage and track team tasks'           },
      pipeline:    { color: 'bg-blue-500',    desc: 'Visualise your sales pipeline'          },
      payroll:     { color: 'bg-emerald-500', desc: 'Run payroll and manage compensation'    },
      timesheets:  { color: 'bg-amber-500',   desc: 'Log and approve work hours'             },
      financials:  { color: 'bg-cyan-500',    desc: 'Track revenue, costs and P&L'           },
      crm:         { color: 'bg-pink-500',    desc: 'Manage clients and relationships'       },
      projects:    { color: 'bg-orange-500',  desc: 'Plan and deliver projects on time'      },
      reports:     { color: 'bg-indigo-500',  desc: 'Insights and analytics across modules'  },
      assets:      { color: 'bg-teal-500',    desc: 'Track company equipment and tools'      },
      attendance:  { color: 'bg-indigo-500',  desc: 'Track check-ins, absences and hours'    },
      invoices:    { color: 'bg-emerald-500', desc: 'Create and track client invoices'       },
      inventory:   { color: 'bg-amber-500',   desc: 'Monitor stock levels and movements'     },
      scheduler:   { color: 'bg-blue-500',    desc: 'Build and publish shift rosters'        },
      expenses:    { color: 'bg-pink-500',    desc: 'Submit and approve expense claims'      },
      contracts:   { color: 'bg-violet-500',  desc: 'Store and manage contracts'             },
      helpdesk:    { color: 'bg-cyan-500',    desc: 'Internal support ticket system'         },
      recruitment: { color: 'bg-orange-500',  desc: 'Track hiring pipeline and candidates'   },
    }[m.id] || { color: 'bg-slate-500', desc: '' };
    return { id: m.id, label: m.label, icon: m.icon, ...meta };
  });

  // Steps checklist — dynamic based on real state
  const isSheetConnected = !!(localStorage.getItem('wv_gas_url') && localStorage.getItem('wv_api_secret'));

  const steps = [
    {
      done: true,
      icon: 'fa-bolt',
      title: 'Work Volt is running',
      desc: 'Your app is live and ready to configure.',
    },
    {
      done: isSheetConnected,
      icon: 'fa-table',
      title: 'Connect your Google Sheet',
      desc: 'Link your Sheet to power real data across all modules.',
      action: { label: 'Connect Sheet', module: 'settings' },
    },
    {
      done: installedCount > 0,
      icon: 'fa-store',
      title: 'Install your first module',
      desc: 'Visit the Module Store to add features to your sidebar.',
      action: { label: 'Open Store', module: 'store' },
    },
    {
      done: isSheetConnected,
      icon: 'fa-users',
      title: 'Invite your team',
      desc: 'Add users, assign roles and get everyone working.',
      action: { label: 'Manage Users', module: 'settings' },
    },
  ];

  const doneCount   = steps.filter(s => s.done).length;
  const progressPct = Math.round((doneCount / steps.length) * 100);

  container.innerHTML = `
    <div class="min-h-full bg-slate-50 fade-in">

      <!-- ══ HERO WELCOME ══════════════════════════════════════════════ -->
      <div class="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 md:px-10 pt-10 pb-6">

        <!-- Background glow blobs -->
        <div class="absolute inset-0 pointer-events-none">
          <div class="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2"></div>
          <div class="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl translate-y-1/2"></div>
        </div>

        <!-- Dot grid texture -->
        <div class="absolute inset-0 opacity-[0.04]"
          style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 28px 28px;"></div>

        <div class="relative max-w-3xl">
          <!-- Greeting -->
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
              <i class="fas fa-bolt text-blue-300 text-sm"></i>
            </div>
            <span class="text-blue-300 text-sm font-semibold tracking-wide">Work Volt Dashboard</span>
          </div>

          <h1 class="text-3xl md:text-4xl font-extrabold text-white mb-3 leading-tight">
            ${greeting}, ${firstName}! <span class="wave" style="display:inline-block">👋</span>
          </h1>

          <p class="text-slate-300 text-base md:text-lg leading-relaxed max-w-2xl mb-8">
            Welcome to <strong class="text-white">Work Volt</strong> — your all-in-one operations workspace, built on Google Sheets.
            Everything here is modular, flexible, and shaped around the way <em class="text-blue-200 not-italic font-semibold">your</em> team actually works.
          </p>

          <!-- Stats strip -->
          <div class="flex flex-wrap gap-4">
            <div class="flex items-center gap-2.5 bg-white/10 border border-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5">
              <i class="fas fa-cubes text-blue-300 text-sm"></i>
              <div>
                <p class="text-white font-bold text-lg leading-none">17</p>
                <p class="text-blue-200 text-xs mt-0.5">Available modules</p>
              </div>
            </div>
            <div class="flex items-center gap-2.5 bg-white/10 border border-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5">
              <i class="fas fa-store text-purple-300 text-sm"></i>
              <div>
                <p class="text-white font-bold text-lg leading-none">${installedCount}</p>
                <p class="text-blue-200 text-xs mt-0.5">Add-ons installed</p>
              </div>
            </div>
            <div class="flex items-center gap-2.5 bg-white/10 border border-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5">
              <i class="fas fa-tasks text-green-300 text-sm"></i>
              <div>
                <p class="text-white font-bold text-lg leading-none">${doneCount}/${steps.length}</p>
                <p class="text-blue-200 text-xs mt-0.5">Setup complete</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ MAIN CONTENT ══════════════════════════════════════════════ -->
      <div class="max-w-5xl mx-auto px-6 md:px-10 pb-16 space-y-6">

        <!-- ── Setup checklist card ── -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="px-6 pt-6 pb-4 border-b border-slate-100">
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-bold text-slate-900 flex items-center gap-2">
                <i class="fas fa-rocket text-blue-500 text-sm"></i>
                Get started
              </h2>
              <span class="text-xs font-semibold text-slate-500">${doneCount} of ${steps.length} done</span>
            </div>
            <!-- Progress bar -->
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                   style="width: ${progressPct}%"></div>
            </div>
          </div>
          <div class="divide-y divide-slate-100">
            ${steps.map(step => `
              <div class="flex items-start gap-4 px-6 py-4 ${step.done ? 'opacity-50' : ''}">
                <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                  ${step.done ? 'bg-green-100' : 'bg-slate-100'}">
                  <i class="fas ${step.done ? 'fa-check text-green-600' : step.icon + ' text-slate-400'} text-xs"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-slate-800 ${step.done ? 'line-through' : ''}">${step.title}</p>
                  <p class="text-xs text-slate-500 mt-0.5">${step.desc}</p>
                </div>
                ${!step.done && step.action ? `
                  <button onclick="window.WorkVolt.navigate('${step.action.module}')"
                    class="flex-shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                    ${step.action.label} →
                  </button>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- ── "Your workspace, your way" message ── -->
        <div class="relative bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-7 text-white overflow-hidden">
          <div class="absolute -right-6 -bottom-6 opacity-10">
            <i class="fas fa-bolt text-9xl"></i>
          </div>
          <div class="relative max-w-2xl">
            <h2 class="text-xl font-extrabold mb-3">Your workspace, your way.</h2>
            <p class="text-blue-100 text-sm leading-relaxed mb-4">
              Work Volt is designed to grow with you. Start with the modules your team needs today —
              Timesheets, Tasks, Payroll, CRM — and add more as you scale. Every module connects to your
              Google Sheet, so your data stays in one place you already own and control.
            </p>
            <p class="text-blue-100 text-sm leading-relaxed mb-5">
              No per-seat pricing. No vendor lock-in. Just a clean, powerful workspace
              that you configure once and your whole team benefits from immediately.
            </p>
            <div class="flex flex-wrap gap-3">
              <button onclick="window.WorkVolt.navigate('store')"
                class="flex items-center gap-2 bg-white text-blue-700 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors shadow-sm">
                <i class="fas fa-store text-sm"></i> Browse Module Store
              </button>
              <button onclick="window.WorkVolt.navigate('settings')"
                class="flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/25 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
                <i class="fas fa-table text-sm"></i> Connect Google Sheet
              </button>
            </div>
          </div>
        </div>

        <!-- ── Core modules grid ── -->
        <div>
          <h2 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <i class="fas fa-cubes text-slate-400 text-sm"></i>
            Installed modules
          </h2>
          ${coreModules.length === 0 ? `
            <div class="col-span-full bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
              <i class="fas fa-store text-slate-300 text-3xl mb-3"></i>
              <p class="text-slate-500 font-semibold text-sm">No modules installed yet</p>
              <p class="text-slate-400 text-xs mt-1 mb-4">Head to the Module Store to add features to your workspace</p>
              <button onclick="window.WorkVolt.navigate('store')" class="text-sm font-bold bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">Browse Module Store</button>
            </div>
          ` : `
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            ${coreModules.map(m => `
              <button onclick="window.WorkVolt.navigate('${m.id}')"
                class="group bg-white border border-slate-200 hover:border-blue-200 hover:shadow-md rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5">
                <div class="w-10 h-10 ${m.color} rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                  <i class="fas ${m.icon} text-white text-sm"></i>
                </div>
                <p class="text-sm font-bold text-slate-800">${m.label}</p>
                <p class="text-xs text-slate-400 mt-0.5 leading-snug">${m.desc}</p>
              </button>
            `).join('')}
          </div>
          `}
        </div>

        ${installedCount > 0 ? `
        <!-- ── Installed add-ons ── -->
        <div>
          <h2 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <i class="fas fa-puzzle-piece text-slate-400 text-sm"></i>
            Installed add-ons
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${(window.INSTALLED_MODULES || []).map(m => `
              <button onclick="window.WorkVolt.navigate('${m.id}')"
                class="group bg-white border border-slate-200 hover:border-blue-200 hover:shadow-md rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5">
                <div class="w-9 h-9 bg-gradient-to-br from-slate-600 to-slate-800 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                  <i class="fas ${m.icon} text-white text-sm"></i>
                </div>
                <p class="text-sm font-bold text-slate-800">${m.label}</p>
                <p class="text-xs text-slate-400 mt-0.5">v${m.version}</p>
              </button>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- ── Footer tip ── -->
        <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <i class="fas fa-lightbulb text-amber-500 mt-0.5 flex-shrink-0"></i>
          <p class="text-sm text-amber-800">
            <strong>Tip:</strong> This dashboard will update automatically once you connect your Google Sheet —
            showing live stats, recent activity and team summaries pulled straight from your data.
          </p>
        </div>

      </div>
    </div>

    <style>
      .wave { animation: wave 2.2s ease-in-out infinite; transform-origin: 70% 70%; }
      @keyframes wave {
        0%,100% { transform: rotate(0deg);   }
        15%      { transform: rotate(14deg);  }
        30%      { transform: rotate(-8deg);  }
        45%      { transform: rotate(14deg);  }
        60%      { transform: rotate(-4deg);  }
        75%      { transform: rotate(10deg);  }
      }
    </style>
  `;
};
