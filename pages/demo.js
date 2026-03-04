/**
 * ═════════════════════════════════════════════════════════════════
 *  WORK VOLT — demo.js
 *  Demo mode module handler - shows sample data without database
 *  This single file handles ALL demo module displays
 * ═════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
//  SAMPLE DATA
// ═══════════════════════════════════════════════════════════════════

window.WorkVoltPages = window.WorkVoltPages || {};

// Demo content registry - add demo data for any module here
const DEMO_CONTENT = {
  tasks: {
    title: 'Tasks',
    icon: 'fa-check-circle',
    color: 'blue',
    description: 'Create, assign and track tasks with priority levels and billing.',
    stats: [
      { label: 'Active Tasks', value: '24', color: 'blue' },
      { label: 'Completed', value: '156', color: 'green' },
      { label: 'Overdue', value: '3', color: 'red' }
    ],
    sampleData: [
      { title: 'Website Redesign', assignee: 'Sarah Chen', priority: 'High', status: 'In Progress', due: 'Today' },
      { title: 'Q4 Financial Report', assignee: 'Mike Ross', priority: 'Medium', status: 'Pending', due: 'Tomorrow' },
      { title: 'Client Meeting Prep', assignee: 'You', priority: 'High', status: 'Done', due: 'Yesterday' },
      { title: 'Database Migration', assignee: 'Dev Team', priority: 'Low', status: 'In Progress', due: 'Next Week' }
    ]
  },
  
  payroll: {
    title: 'Payroll',
    icon: 'fa-money-bill-wave',
    color: 'emerald',
    description: 'Run payroll for hourly, salaried and pay-per-task employees.',
    stats: [
      { label: 'Next Run', value: 'Oct 15', color: 'emerald' },
      { label: 'Total Payroll', value: '$48,250', color: 'blue' },
      { label: 'Employees', value: '12', color: 'slate' }
    ],
    sampleData: [
      { name: 'Sarah Chen', type: 'Salary', amount: '$5,200', status: 'Pending' },
      { name: 'Mike Ross', type: 'Hourly', amount: '$3,840', status: 'Pending' },
      { name: 'Jessica Park', type: 'Hourly', amount: '$2,160', status: 'Processed' },
      { name: 'David Kim', type: 'Per Task', amount: '$1,450', status: 'Processed' }
    ]
  },
  
  crm: {
    title: 'CRM',
    icon: 'fa-address-book',
    color: 'violet',
    description: 'Manage contacts, companies and customer relationships.',
    stats: [
      { label: 'Contacts', value: '234', color: 'violet' },
      { label: 'Companies', value: '45', color: 'blue' },
      { label: 'Deals', value: '$1.2M', color: 'green' }
    ],
    sampleData: [
      { company: 'Acme Corp', contact: 'John Smith', stage: 'Negotiation', value: '$50K' },
      { company: 'TechStart Inc', contact: 'Lisa Wong', stage: 'Proposal', value: '$25K' },
      { company: 'Global Systems', contact: 'Robert Chen', stage: 'Qualified', value: '$75K' }
    ]
  },
  
  pipeline: {
    title: 'Pipeline',
    icon: 'fa-users',
    color: 'indigo',
    description: 'Visual sales pipeline to manage leads and deals.',
    kanban: true,
    columns: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed'],
    cards: [
      { title: 'Acme Corp Deal', value: '$50K', column: 'Negotiation' },
      { title: 'TechStart Partnership', value: '$25K', column: 'Proposal' },
      { title: 'New Lead from Web', value: '$10K', column: 'Lead' },
      { title: 'Global Systems RFP', value: '$75K', column: 'Qualified' }
    ]
  },
  
  timesheets: {
    title: 'Timesheets',
    icon: 'fa-clock',
    color: 'amber',
    description: 'Log and approve work hours with project tracking.',
    stats: [
      { label: 'Hours This Week', value: '164', color: 'amber' },
      { label: 'Pending Approval', value: '12', color: 'orange' },
      { label: 'Projects', value: '8', color: 'blue' }
    ]
  },
  
  reports: {
    title: 'Reports',
    icon: 'fa-chart-pie',
    color: 'rose',
    description: 'Auto-generated reports across all modules.',
    charts: true
  }
};

// Generic demo renderer
window.WorkVoltPages['demo'] = function(container) {
  const moduleId = sessionStorage.getItem('wv_demo_preview') || 'tasks';
  const demo = DEMO_CONTENT[moduleId] || DEMO_CONTENT.tasks;
  const isDemo = currentUser?._demo === true;
  
  function render() {
    container.innerHTML = `
      <div class="min-h-full bg-slate-50 p-6">
        ${renderBanner()}
        ${renderHeader()}
        ${demo.kanban ? renderKanban() : demo.charts ? renderCharts() : renderStandard()}
      </div>
    `;
  }
  
  function renderBanner() {
    if (!isDemo) return '';
    return `
      <div class="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-flask text-amber-500"></i>
          <span class="text-sm font-semibold text-amber-800">Demo Mode</span>
          <span class="text-xs text-amber-600">View-only preview. Connect your Google Sheet for full access.</span>
        </div>
        <button onclick="showConnectSheet()" class="text-xs font-semibold text-amber-700 bg-white border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100">
          Connect Sheet
        </button>
      </div>
    `;
  }
  
  function renderHeader() {
    return `
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 bg-${demo.color}-100 rounded-xl flex items-center justify-center">
            <i class="fas ${demo.icon} text-${demo.color}-600"></i>
          </div>
          <div>
            <h1 class="text-xl font-extrabold text-slate-900">${demo.title}</h1>
            <p class="text-xs text-slate-500">${demo.description}</p>
          </div>
        </div>
        ${demo.stats ? renderStats() : ''}
      </div>
    `;
  }
  
  function renderStats() {
    return `
      <div class="grid grid-cols-3 gap-3 mt-4">
        ${demo.stats.map(s => `
          <div class="bg-white border border-slate-200 rounded-xl p-3">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">${s.label}</p>
            <p class="text-lg font-extrabold text-${s.color}-600">${s.value}</p>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  function renderStandard() {
    if (!demo.sampleData) return '<p class="text-slate-400 text-sm">Sample data coming soon...</p>';
    
    return `
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-800 text-sm">Recent Items</h3>
          <span class="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">Demo Data</span>
        </div>
        <div class="divide-y divide-slate-100">
          ${demo.sampleData.map((item, i) => `
            <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors opacity-${90 - (i * 15)}">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                  <i class="fas ${demo.icon} text-xs"></i>
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-800">${item.title || item.name || item.company}</p>
                  <p class="text-[10px] text-slate-500">
                    ${item.assignee || item.contact || item.type || ''} 
                    ${item.priority ? '• ' + item.priority : ''}
                    ${item.stage ? '• ' + item.stage : ''}
                  </p>
                </div>
              </div>
              <div class="text-right">
                ${item.status ? `<span class="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">${item.status}</span>` : ''}
                ${item.value ? `<p class="text-sm font-bold text-slate-700">${item.value}</p>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  function renderKanban() {
    return `
      <div class="kanban-scroll overflow-x-auto pb-4">
        <div class="flex gap-4 min-w-max">
          ${demo.columns.map(col => `
            <div class="w-64 bg-slate-100 rounded-xl p-3">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-slate-600 uppercase tracking-wide">${col}</span>
                <span class="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                  ${demo.cards.filter(c => c.column === col).length}
                </span>
              </div>
              <div class="space-y-2">
                ${demo.cards.filter(c => c.column === col).map(card => `
                  <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                    <p class="text-sm font-semibold text-slate-800 mb-1">${card.title}</p>
                    <p class="text-xs text-slate-500">${card.value}</p>
                  </div>
                `).join('') || '<p class="text-xs text-slate-400 text-center py-4">No items</p>'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  function renderCharts() {
    return `
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white border border-slate-200 rounded-xl p-4 h-48 flex items-center justify-center">
          <div class="text-center text-slate-400">
            <i class="fas fa-chart-bar text-3xl mb-2"></i>
            <p class="text-xs">Sample Chart</p>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4 h-48 flex items-center justify-center">
          <div class="text-center text-slate-400">
            <i class="fas fa-chart-pie text-3xl mb-2"></i>
            <p class="text-xs">Sample Chart</p>
          </div>
        </div>
      </div>
    `;
  }
  
  window.showConnectSheet = function() {
    sessionStorage.setItem('lastModule', 'settings');
    window.location.hash = 'settings';
    window.location.reload();
  };
  
  render();
};

// Auto-register demo handlers for all demo modules
Object.keys(DEMO_CONTENT).forEach(moduleId => {
  window.WorkVoltPages[moduleId] = function(container) {
    sessionStorage.setItem('wv_demo_preview', moduleId);
    window.WorkVoltPages['demo'](container);
  };
});
