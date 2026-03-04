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

const DEMO_DATA = {
  // Sample tasks
  tasks: [
    {
      task_id: 'task-001',
      title: 'Complete Q1 Financial Review',
      description: 'Prepare and review Q1 financial statements',
      status: 'in_progress',
      priority: 'high',
      assigned_to: 'demo-001',
      due_date: '2024-03-15',
      created_at: '2024-02-01',
    },
    {
      task_id: 'task-002',
      title: 'Update Client Presentation',
      description: 'Revise and finalize client presentation deck',
      status: 'pending',
      priority: 'medium',
      assigned_to: 'demo-001',
      due_date: '2024-03-20',
      created_at: '2024-02-05',
    },
    {
      task_id: 'task-003',
      title: 'Team Meeting Preparation',
      description: 'Prepare agenda and materials for team sync',
      status: 'completed',
      priority: 'medium',
      assigned_to: 'demo-001',
      due_date: '2024-02-28',
      created_at: '2024-02-10',
    },
  ],

  // Sample projects
  projects: [
    {
      project_id: 'proj-001',
      name: 'Website Redesign',
      description: 'Complete redesign of company website',
      status: 'active',
      progress: 65,
      start_date: '2024-01-15',
      end_date: '2024-04-30',
      manager_id: 'demo-001',
    },
    {
      project_id: 'proj-002',
      name: 'Mobile App Development',
      description: 'Native iOS and Android app',
      status: 'active',
      progress: 45,
      start_date: '2024-02-01',
      end_date: '2024-06-30',
      manager_id: 'demo-001',
    },
    {
      project_id: 'proj-003',
      name: 'API Integration',
      description: 'Third-party API integration',
      status: 'planning',
      progress: 15,
      start_date: '2024-03-01',
      end_date: '2024-05-31',
      manager_id: 'demo-001',
    },
  ],

  // Sample timesheets
  timesheets: [
    {
      timesheet_id: 'ts-001',
      user_id: 'demo-001',
      week_start: '2024-02-26',
      total_hours: 40,
      status: 'submitted',
      entries: [
        { day: 'Monday', hours: 8 },
        { day: 'Tuesday', hours: 8 },
        { day: 'Wednesday', hours: 8 },
        { day: 'Thursday', hours: 8 },
        { day: 'Friday', hours: 8 },
      ],
    },
  ],

  // Sample payroll
  payroll: [
    {
      payroll_id: 'pr-001',
      user_id: 'demo-001',
      period: '2024-02',
      gross_pay: 5000,
      deductions: 1200,
      net_pay: 3800,
      status: 'processed',
    },
  ],

  // Sample employees
  employees: [
    {
      user_id: 'emp-001',
      name: 'Alice Johnson',
      email: 'alice@company.com',
      role: 'Manager',
      department: 'Engineering',
      job_title: 'Senior Engineer',
      phone: '555-0101',
      hire_date: '2022-03-15',
      active: true,
    },
    {
      user_id: 'emp-002',
      name: 'Bob Smith',
      email: 'bob@company.com',
      role: 'Employee',
      department: 'Engineering',
      job_title: 'Junior Engineer',
      phone: '555-0102',
      hire_date: '2023-06-01',
      active: true,
    },
    {
      user_id: 'emp-003',
      name: 'Carol Williams',
      email: 'carol@company.com',
      role: 'Manager',
      department: 'Sales',
      job_title: 'Sales Manager',
      phone: '555-0103',
      hire_date: '2021-01-10',
      active: true,
    },
  ],

  // Sample reports
  reports: [
    {
      report_id: 'rpt-001',
      title: 'Monthly Performance Report',
      type: 'performance',
      created_date: '2024-02-28',
      period: 'February 2024',
    },
    {
      report_id: 'rpt-002',
      title: 'Revenue Analysis',
      type: 'financial',
      created_date: '2024-02-25',
      period: 'Q1 2024',
    },
  ],

  // Sample notifications
  notifications: [
    {
      notif_id: 'notif-001',
      title: 'Task Assigned',
      message: 'You have been assigned a new task: Complete Q1 Financial Review',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      read: false,
    },
    {
      notif_id: 'notif-002',
      title: 'Project Update',
      message: 'Website Redesign project is now 65% complete',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      read: true,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
//  DEMO MODULE FACTORY
// ═══════════════════════════════════════════════════════════════════

/**
 * Create demo data module
 * Usage: window.WorkVoltPages['tasks'] = DemoModule.create('tasks')
 */
const DemoModule = {
  /**
   * Create a demo module renderer
   */
  create: function(moduleName) {
    return function(container) {
      DemoModule.render(moduleName, container);
    };
  },

  /**
   * Main render function - handles all demo modules
   */
  render: function(moduleName, container) {
    container.innerHTML = '';

    // Remove any existing demo banner if not already present
    if (!document.getElementById('demo-module-banner')) {
      const banner = document.createElement('div');
      banner.id = 'demo-module-banner';
      banner.className = 'mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3';
      banner.innerHTML = `
        <i class="fas fa-flask-vial text-amber-600 mt-0.5 flex-shrink-0"></i>
        <div class="text-sm text-amber-700">
          <strong>Demo Mode:</strong> This module displays sample data for demonstration purposes only. 
          Connect a Google Sheet to view and manage real data.
        </div>
      `;
      container.parentElement.insertBefore(banner, container);
    }

    // Render based on module name
    switch (moduleName) {
      case 'dashboard':
        DemoModule.renderDashboard(container);
        break;
      case 'tasks':
        DemoModule.renderTasks(container);
        break;
      case 'projects':
        DemoModule.renderProjects(container);
        break;
      case 'timesheets':
        DemoModule.renderTimesheets(container);
        break;
      case 'payroll':
        DemoModule.renderPayroll(container);
        break;
      case 'employees':
        DemoModule.renderEmployees(container);
        break;
      case 'reports':
        DemoModule.renderReports(container);
        break;
      case 'notifications':
        DemoModule.renderNotifications(container);
        break;
      default:
        DemoModule.renderDefault(container, moduleName);
    }
  },

  /**
   * Dashboard demo
   */
  renderDashboard: function(container) {
    container.innerHTML = `
      <div class="space-y-6">
        <!-- Stats -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-lg p-6 border border-slate-200">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-slate-600 text-sm">Active Tasks</p>
                <p class="text-3xl font-bold text-slate-900">12</p>
              </div>
              <i class="fas fa-tasks text-blue-500 text-2xl opacity-20"></i>
            </div>
          </div>
          <div class="bg-white rounded-lg p-6 border border-slate-200">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-slate-600 text-sm">Active Projects</p>
                <p class="text-3xl font-bold text-slate-900">3</p>
              </div>
              <i class="fas fa-chart-line text-green-500 text-2xl opacity-20"></i>
            </div>
          </div>
          <div class="bg-white rounded-lg p-6 border border-slate-200">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-slate-600 text-sm">Team Members</p>
                <p class="text-3xl font-bold text-slate-900">8</p>
              </div>
              <i class="fas fa-users text-purple-500 text-2xl opacity-20"></i>
            </div>
          </div>
          <div class="bg-white rounded-lg p-6 border border-slate-200">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-slate-600 text-sm">Pending Reviews</p>
                <p class="text-3xl font-bold text-slate-900">5</p>
              </div>
              <i class="fas fa-clipboard-check text-amber-500 text-2xl opacity-20"></i>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-lg border border-slate-200 p-6">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Recent Tasks</h3>
            <div class="space-y-3">
              ${DEMO_DATA.tasks.map(task => `
                <div class="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                  <div class="w-2 h-2 rounded-full ${task.status === 'completed' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-300'} mt-1.5 flex-shrink-0"></div>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-slate-900 truncate">${task.title}</p>
                    <p class="text-xs text-slate-500">Due: ${task.due_date}</p>
                  </div>
                  <span class="text-xs font-medium px-2 py-1 rounded-full ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} flex-shrink-0">
                    ${task.priority}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bg-white rounded-lg border border-slate-200 p-6">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Project Progress</h3>
            <div class="space-y-4">
              ${DEMO_DATA.projects.map(project => `
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-medium text-slate-900 text-sm">${project.name}</span>
                    <span class="text-sm font-semibold text-slate-600">${project.progress}%</span>
                  </div>
                  <div class="w-full bg-slate-200 rounded-full h-2">
                    <div class="bg-blue-500 h-2 rounded-full transition-all" style="width: ${project.progress}%"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Tasks demo
   */
  renderTasks: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-900">Tasks</h2>
          <button class="btn-primary" disabled>
            <i class="fas fa-plus"></i> Add Task (Demo Only)
          </button>
        </div>
        ${DEMO_DATA.tasks.map(task => `
          <div class="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <h3 class="font-semibold text-slate-900">${task.title}</h3>
                <p class="text-slate-600 text-sm mt-1">${task.description}</p>
                <div class="flex items-center gap-4 mt-4">
                  <span class="text-xs font-medium px-2.5 py-1 rounded-full ${task.status === 'completed' ? 'bg-green-100 text-green-700' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}">
                    ${task.status.replace('_', ' ')}
                  </span>
                  <span class="text-xs font-medium px-2.5 py-1 rounded-full ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">
                    ${task.priority} priority
                  </span>
                  <span class="text-xs text-slate-500">Due: ${task.due_date}</span>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  /**
   * Projects demo
   */
  renderProjects: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-900">Projects</h2>
          <button class="btn-primary" disabled>
            <i class="fas fa-plus"></i> New Project (Demo Only)
          </button>
        </div>
        ${DEMO_DATA.projects.map(project => `
          <div class="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 class="font-semibold text-slate-900">${project.name}</h3>
                <p class="text-slate-600 text-sm mt-1">${project.description}</p>
              </div>
              <span class="text-xs font-medium px-2.5 py-1 rounded-full ${project.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}">
                ${project.status}
              </span>
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-600">Progress</span>
                <span class="font-semibold text-slate-900">${project.progress}%</span>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-2.5">
                <div class="bg-blue-500 h-2.5 rounded-full" style="width: ${project.progress}%"></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  /**
   * Timesheets demo
   */
  renderTimesheets: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-900">Timesheets</h2>
          <button class="btn-primary" disabled>
            <i class="fas fa-plus"></i> New Timesheet (Demo Only)
          </button>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div class="p-6 border-b border-slate-200">
            <h3 class="font-semibold text-slate-900">Week of Feb 26, 2024</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-slate-900">Day</th>
                  <th class="px-6 py-3 text-right text-sm font-semibold text-slate-900">Hours</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${DEMO_DATA.timesheets[0].entries.map(entry => `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 text-slate-900">${entry.day}</td>
                    <td class="px-6 py-3 text-right text-slate-900 font-medium">${entry.hours}h</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot class="bg-slate-50 border-t-2 border-slate-300">
                <tr>
                  <td class="px-6 py-3 font-semibold text-slate-900">Total</td>
                  <td class="px-6 py-3 text-right font-bold text-slate-900">${DEMO_DATA.timesheets[0].total_hours}h</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Payroll demo
   */
  renderPayroll: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-slate-900">Payroll</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-lg border border-slate-200 p-6">
            <p class="text-slate-600 text-sm mb-1">Gross Pay</p>
            <p class="text-3xl font-bold text-slate-900">$5,000</p>
          </div>
          <div class="bg-white rounded-lg border border-slate-200 p-6">
            <p class="text-slate-600 text-sm mb-1">Deductions</p>
            <p class="text-3xl font-bold text-red-600">-$1,200</p>
          </div>
          <div class="bg-white rounded-lg border border-slate-200 p-6">
            <p class="text-slate-600 text-sm mb-1">Net Pay</p>
            <p class="text-3xl font-bold text-green-600">$3,800</p>
          </div>
        </div>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <i class="fas fa-info-circle mr-2"></i>
          Latest period: February 2024 (Processed)
        </div>
      </div>
    `;
  },

  /**
   * Employees demo
   */
  renderEmployees: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-900">Employees</h2>
          <button class="btn-primary" disabled>
            <i class="fas fa-user-plus"></i> Add Employee (Demo Only)
          </button>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-slate-900">Department</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-slate-900">Title</th>
                  <th class="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${DEMO_DATA.employees.map(emp => `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4">
                      <div class="font-medium text-slate-900">${emp.name}</div>
                      <div class="text-xs text-slate-500">${emp.email}</div>
                    </td>
                    <td class="px-6 py-4 text-slate-900">${emp.department}</td>
                    <td class="px-6 py-4 text-slate-900">${emp.job_title}</td>
                    <td class="px-6 py-4">
                      <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">Active</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Reports demo
   */
  renderReports: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-bold text-slate-900">Reports</h2>
          <button class="btn-primary" disabled>
            <i class="fas fa-file-pdf"></i> Generate Report (Demo Only)
          </button>
        </div>
        ${DEMO_DATA.reports.map(report => `
          <div class="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="font-semibold text-slate-900">${report.title}</h3>
                <div class="flex items-center gap-4 mt-3">
                  <span class="text-xs text-slate-500">Type: ${report.type}</span>
                  <span class="text-xs text-slate-500">Period: ${report.period}</span>
                  <span class="text-xs text-slate-500">Created: ${report.created_date}</span>
                </div>
              </div>
              <i class="fas fa-file-pdf text-red-500 text-xl opacity-20"></i>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  /**
   * Notifications demo
   */
  renderNotifications: function(container) {
    container.innerHTML = `
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-slate-900">Notifications</h2>
        ${DEMO_DATA.notifications.map(notif => `
          <div class="bg-white rounded-lg border border-slate-200 p-4 ${notif.read ? '' : 'border-l-4 border-l-blue-500'}">
            <div class="flex items-start gap-3">
              <div class="w-2 h-2 rounded-full ${notif.read ? 'bg-slate-300' : 'bg-blue-500'} mt-1.5 flex-shrink-0"></div>
              <div class="flex-1">
                <h3 class="font-semibold text-slate-900">${notif.title}</h3>
                <p class="text-slate-600 text-sm mt-1">${notif.message}</p>
                <p class="text-xs text-slate-500 mt-2">${new Date(notif.timestamp).toLocaleString()}</p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  /**
   * Default demo for unknown modules
   */
  renderDefault: function(container, moduleName) {
    container.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <i class="fas fa-flask-vial text-6xl text-amber-300 opacity-20 mb-4"></i>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Demo Mode - ${moduleName}</h2>
        <p class="text-slate-600 mb-6">This module is available in demo mode to showcase the application.</p>
        <p class="text-sm text-slate-500">
          <i class="fas fa-info-circle mr-2"></i>
          Connect a Google Sheet in Settings to unlock full functionality and access real data.
        </p>
      </div>
    `;
  },
};

// ═══════════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════════

window.DemoModule = DemoModule;
