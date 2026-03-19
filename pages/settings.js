window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['settings'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  let savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  let savedSecret = localStorage.getItem('wv_api_secret') || '';
  let activeTab   = 'connection';
  let usersCache  = [];
  let editingUser = null;
  
  // Only initialize modulesCache from global state if connected
  let modulesCache = (savedUrl && savedSecret && window.INSTALLED_MODULES) ? (Array.isArray(window.INSTALLED_MODULES) ? window.INSTALLED_MODULES : []) : [];
  
  // Connection mode: 'existing' or 'setup'
  let connectionMode = 'existing';

  if (savedUrl)    window.API_URL = savedUrl;
  if (savedSecret) window.API_SECRET_CLIENT = savedSecret;
  
  // CRITICAL: If not connected, ALWAYS keep modulesCache empty regardless of global state
  if (!savedUrl || !savedSecret) {
    modulesCache = [];
  }
  
  window.setConnectionMode = function(mode) {
    connectionMode = mode;
    var existingBtn = document.getElementById('mode-existing');
    var setupBtn = document.getElementById('mode-setup');
    var secretField = document.getElementById('secret-field');
    
    if (mode === 'existing') {
      existingBtn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
      existingBtn.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-200');
      setupBtn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
      setupBtn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200', 'hover:border-blue-300');
      secretField.classList.add('hidden');
    } else {
      setupBtn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
      setupBtn.classList.remove('bg-slate-100', 'text-slate-600', 'border-slate-200', 'hover:border-blue-300');
      existingBtn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
      existingBtn.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200');
      secretField.classList.remove('hidden');
    }
  };


// ================================================================
//  API HELPER - FIXED: Added session_id parameter with better detection
// ================================================================
async function api(path, params) {
  const url = new URL(savedUrl);
  url.searchParams.set('path',  path);
  url.searchParams.set('token', savedSecret);
  
  // FIXED: Add session_id for protected routes - try multiple sources
  let sessionId = '';
  
  // Try window.WorkVolt.session() if available
  if (window.WorkVolt && typeof window.WorkVolt.session === 'function') {
    try {
      sessionId = window.WorkVolt.session();
    } catch(e) {}
  }
  
  // Fallback to localStorage
  if (!sessionId) {
    sessionId = localStorage.getItem('wv_session') || '';
  }
  
  // Also try just 'session' key
  if (!sessionId) {
    sessionId = localStorage.getItem('session') || '';
  }
  
  if (sessionId) {
    url.searchParams.set('session_id', sessionId);
    console.log('Sending session:', sessionId.substring(0, 8) + '...'); // Debug log
  } else {
    console.warn('No session found for API call to:', path); // Debug log
  }
  
  if (params) {
    Object.entries(params).forEach(function(kv) {
      if (kv[1] !== undefined && kv[1] !== null && kv[1] !== '') {
        url.searchParams.set(kv[0], kv[1]);
      }
    });
  }
  
  console.log('API URL:', url.toString().replace(savedSecret, '***SECRET***')); // Debug log
  
  const res  = await fetch(url.toString(), { cache: 'no-cache' });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}


  // ================================================================
  //  RENDER HELPERS
  // ================================================================
  function renderProvision(provision) {
    if (!provision) return '';
    return (
      '<div class="mt-3 bg-white border border-amber-300 rounded-xl p-4">' +
        '<div class="flex items-center gap-2 mb-2">' +
          '<i class="fas fa-key text-amber-500"></i>' +
          '<span class="font-bold text-amber-700 text-sm">First-time credentials — save these now!</span>' +
        '</div>' +
        '<div class="space-y-1.5 font-mono text-xs">' +
          '<div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">' +
            '<span class="text-slate-500">Email</span>' +
            '<span class="font-semibold text-slate-800">' + provision.admin_email + '</span>' +
          '</div>' +
          '<div class="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">' +
            '<span class="text-amber-600">Temp password</span>' +
            '<span class="font-bold text-amber-800 tracking-wider">' + provision.temp_password + '</span>' +
          '</div>' +
        '</div>' +
        '<p class="text-xs text-amber-600 mt-2.5">' +
          '<i class="fas fa-exclamation-triangle mr-1"></i>' +
          'This password is shown <strong>once only</strong> — it is not stored anywhere. Copy it now.' +
        '</p>' +
      '</div>'
    );
  }

  function renderStatus(status) {
    if (!status) return '';
    const colorClass = status.ok
      ? 'bg-green-50 text-green-700 border border-green-200'
      : 'bg-red-50 text-red-600 border border-red-200';
    const iconClass = status.ok ? 'fa-check-circle' : 'fa-exclamation-circle';
    return (
      '<div class="px-4 py-3 rounded-xl text-sm font-medium ' + colorClass + '">' +
        '<div class="flex items-center gap-2">' +
          '<i class="fas ' + iconClass + '"></i>' +
          '<span>' + status.message + '</span>' +
        '</div>' +
        renderProvision(status.provision) +
      '</div>'
    );
  }

  function roleBadge(role) {
    var map = {
      SuperAdmin: 'bg-purple-100 text-purple-700',
      Admin:      'bg-blue-100 text-blue-700',
      Manager:    'bg-indigo-100 text-indigo-700',
      Employee:   'bg-green-100 text-green-700',
      Contractor: 'bg-amber-100 text-amber-700',
    };
    var cls = map[role] || 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + cls + '">' + (role || '—') + '</span>';
  }

  function activeBadge(active) {
    return String(active) === 'true'
      ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Active</span>'
      : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Inactive</span>';
  }

  function setModalContent(html) {
    document.getElementById('user-modal').innerHTML = html;
    document.getElementById('user-modal-backdrop').classList.remove('hidden');
  }

  function setFormStatus(msg, ok) {
    var el = document.getElementById('user-form-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = (
      '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3 ' +
      (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
        '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i>' +
        '<span>' + msg + '</span>' +
      '</div>'
    );
  }


  // ================================================================
  //  MAIN RENDER
  // ================================================================
  function render(connStatus) {
    var isConnected = !!(savedUrl && savedSecret);

    var tabNav = (
      '<button onclick="settingsTab(\'connection\')" ' +
        'class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ' +
        (activeTab === 'connection' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '">' +
        '<i class="fas fa-plug text-xs"></i>Connection</button>' +
      '<button onclick="settingsTab(\'users\')" ' +
        'class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ' +
        (activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '">' +
        '<i class="fas fa-users text-xs"></i>User Management</button>' +
      '<button onclick="settingsTab(\'admin-config\')" ' +
        'class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ' +
        (activeTab === 'admin-config' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '">' +
        '<i class="fas fa-sliders-h text-xs"></i>Admin Config</button>' +
      '<button onclick="settingsTab(\'modules\')" ' +
        'class="flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ' +
        (activeTab === 'modules' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700') + '">' +
        '<i class="fas fa-store text-xs"></i>Modules</button>'
    );

    container.innerHTML = `
      <div class="min-h-full bg-slate-50">

        <div class="bg-white border-b border-slate-200 px-6 md:px-10 py-6">
          <h1 class="text-xl font-extrabold text-slate-900">Settings</h1>
          <p class="text-slate-500 text-sm mt-1">Configure your Work Volt workspace</p>
        </div>

        <div class="bg-white border-b border-slate-200 px-6 md:px-10 flex gap-1">
          ${tabNav}
        </div>

        <div id="settings-tab-content" class="max-w-4xl mx-auto px-6 md:px-10 py-8">
          ${activeTab === 'connection' ? renderConnectionTab(connStatus, isConnected) : activeTab === 'users' ? renderUsersTab() : activeTab === 'admin-config' ? renderAdminConfigTab() : renderModulesTab()}
        </div>

      </div>
    `;

    if (activeTab === 'users')        loadUsers();
    if (activeTab === 'modules')      loadModules();
    if (activeTab === 'admin-config') loadAdminConfig();
  }


  // ================================================================
  //  CONNECTION TAB
  // ================================================================
  function renderConnectionTab(status, isConnected) {
    var howToSteps = [
      ['1', 'Go to <strong>script.google.com</strong> → New Project'],
      ['2', 'Create a new Google Sheet → copy the Sheet ID from its URL'],
      ['3', 'Paste all your <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">.gs</code> files into the Apps Script editor (one file each)'],
      ['4', 'Set <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">MASTER_SHEET_ID</code> and <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">API_SECRET</code> in <strong>Code.gs</strong>'],
      ['5', 'Click <strong>Deploy → New Deployment</strong>'],
      ['6', 'Type: <strong>Web App</strong> · Execute as: <strong>Me</strong> · Access: <strong>Anyone</strong>'],
      ['7', 'Copy the Web App URL → paste it above'],
      ['8', 'Paste your <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">API_SECRET</code> value above → Save'],
    ].map(function(s) {
      return '<div class="flex gap-3"><span class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">' + s[0] + '</span><p class="text-sm text-slate-600 pt-0.5">' + s[1] + '</p></div>';
    }).join('');

    return `
      <div class="max-w-2xl space-y-6">

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-plug text-white text-sm"></i>
            </div>
            <div>
              <h2 class="font-bold text-slate-900">Google Sheet Connection</h2>
              <p class="text-xs text-slate-500">Connect your GAS Web App to power all modules</p>
            </div>
            <div class="ml-auto">
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                ${isConnected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
                <span class="w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-400'}"></span>
                ${isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>
          <div class="px-6 py-5 space-y-4">
            ${renderStatus(status)}
            
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">GAS Web App URL</label>
              <input id="settings-gas-url" type="url" placeholder="https://script.google.com/macros/s/.../exec"
                value="${savedUrl}" class="field font-mono text-xs">
              <p class="text-xs text-slate-400 mt-1.5">Deploy your <code class="bg-slate-100 px-1 rounded">Code.gs</code> as a Web App and paste the URL here.</p>
            </div>
            
            <div class="flex gap-3 pt-1">
              <button onclick="settingsTestConnection()" id="settings-test-btn" class="btn-secondary flex-1">
                <i class="fas fa-vial text-sm"></i> Test Connection
              </button>
              <button onclick="settingsSave()" id="settings-save-btn" class="btn-primary flex-1">
                <i class="fas fa-save text-sm"></i> Save
              </button>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button onclick="toggleHowTo()" class="w-full px-6 py-4 flex items-center justify-between text-left">
            <h2 class="font-bold text-slate-900 flex items-center gap-2 text-sm">
              <i class="fas fa-book text-slate-400 text-sm"></i>
              How to deploy your GAS backend
            </h2>
            <i id="howto-chevron" class="fas fa-chevron-down text-slate-400 text-xs transition-transform"></i>
          </button>
          <div id="howto-body" class="hidden px-6 pb-5 space-y-3 border-t border-slate-100 pt-4">
            ${howToSteps}
          </div>
        </div>

        ${isConnected ? `
        <div class="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 flex items-center justify-between">
            <div>
              <h2 class="font-bold text-red-700 text-sm">Disconnect</h2>
              <p class="text-xs text-slate-500 mt-0.5">Remove the saved URL and secret from this browser</p>
            </div>
            <button onclick="settingsDisconnect()"
              class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors border border-red-200">
              Disconnect
            </button>
          </div>
        </div>` : ''}

      </div>
    `;
  }


  // ================================================================
  //  USERS TAB
  // ================================================================
  function renderUsersTab() {
    return `
      <div>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Users</h2>
            <p class="text-sm text-slate-500" id="users-count">Loading…</p>
          </div>
          <button onclick="usersOpenAdd()" class="btn-primary">
            <i class="fas fa-user-plus text-sm"></i> Add User
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div id="users-table-wrap">
            <div class="flex items-center justify-center py-16 text-slate-400">
              <i class="fas fa-circle-notch fa-spin text-2xl"></i>
            </div>
          </div>
        </div>

        <div id="user-modal-backdrop" class="hidden fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onclick="usersBackdropClick(event)">
          <div id="user-modal" class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto z-50"></div>
        </div>
      </div>
    `;
  }

  function renderUsersTable(users) {
    if (!users.length) {
      return (
        '<div class="flex flex-col items-center justify-center py-16 text-slate-400">' +
          '<i class="fas fa-users text-3xl mb-3"></i>' +
          '<p class="text-sm">No users found</p>' +
        '</div>'
      );
    }

    var rows = users.map(function(u) {
      var initials = u.name ? u.name.charAt(0).toUpperCase() : (u.email ? u.email.charAt(0).toUpperCase() : '?');
      var avatar = u.avatar_url
        ? '<img src="' + u.avatar_url + '" class="w-8 h-8 rounded-full object-cover">'
        : '<div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">' + initials + '</div>';

      var toggleBtn = String(u.active) === 'true'
        ? '<button onclick="usersToggleActive(\'' + u.user_id + '\',false)" title="Deactivate" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"><i class="fas fa-user-slash text-xs"></i></button>'
        : '<button onclick="usersToggleActive(\'' + u.user_id + '\',true)" title="Reactivate" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"><i class="fas fa-user-check text-xs"></i></button>';

      return (
        '<tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">' +
          '<td class="px-4 py-3 min-w-0">' +
            '<div class="flex items-center gap-3">' + avatar +
              '<div class="min-w-0">' +
                '<div class="text-sm font-semibold text-slate-900 truncate">' + (u.name || '—') + '</div>' +
                '<div class="text-xs text-slate-500 truncate">' + u.email + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' + roleBadge(u.role) + '</td>' +
          '<td class="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">' + (u.department || '—') + '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' + activeBadge(u.active) + '</td>' +
          '<td class="px-4 py-3 whitespace-nowrap">' +
            '<div class="flex items-center gap-1">' +
              '<button onclick="usersOpenEdit(\'' + u.user_id + '\')" title="Edit" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-pencil text-xs"></i></button>' +
              '<button onclick="usersResetPassword(\'' + u.user_id + '\',\'' + u.email + '\')" title="Reset password" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><i class="fas fa-key text-xs"></i></button>' +
              toggleBtn +
              '<button onclick="usersConfirmDelete(\'' + u.user_id + '\',\'' + (u.name || u.email).replace(/'/g, '') + '\')" title="Delete" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-xs"></i></button>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="overflow-x-auto">' +
        '<table class="w-full text-left">' +
          '<thead><tr class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">' +
            '<th class="px-4 py-3">User</th>' +
            '<th class="px-4 py-3">Role</th>' +
            '<th class="px-4 py-3">Department</th>' +
            '<th class="px-4 py-3">Status</th>' +
            '<th class="px-4 py-3">Actions</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderUserForm(user) {
    var isEdit    = !!user;
    var title     = isEdit ? 'Edit User' : 'Add User';
    var btnLabel  = isEdit ? '<i class="fas fa-save text-sm"></i> Save Changes' : '<i class="fas fa-user-plus text-sm"></i> Create User';
    var val       = function(f) { return isEdit && user[f] ? String(user[f]).replace(/"/g, '&quot;') : ''; };
    var roles     = ['SuperAdmin', 'Admin', 'Manager', 'Employee', 'Contractor'];
    var payTypes  = ['', 'hourly', 'salary', 'pay_per_task'];

    var roleOpts = roles.map(function(r) {
      return '<option value="' + r + '"' + (val('role') === r ? ' selected' : '') + '>' + r + '</option>';
    }).join('');

    var payTypeLabels = { '': '— Select —', 'hourly': 'Hourly', 'salary': 'Salary', 'pay_per_task': 'Pay Per Task' };
    var payOpts = payTypes.map(function(p) {
      return '<option value="' + p + '"' + (val('pay_type') === p ? ' selected' : '') + '>' + payTypeLabels[p] + '</option>';
    }).join('');

    var passwordField = !isEdit
      ? '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Password <span class="text-red-500">*</span></label>' +
        '<input id="uf-password" type="password" placeholder="Temporary password" class="field text-sm"></div>'
      : '';

    return (
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900">' + title + '</h3>' +
        '<button onclick="usersCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div id="user-form-status"></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Full Name</label>' +
          '<input id="uf-name" type="text" placeholder="Jane Smith" value="' + val('name') + '" class="field text-sm"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Email <span class="text-red-500">*</span></label>' +
          '<input id="uf-email" type="email" placeholder="jane@company.com" value="' + val('email') + '" class="field text-sm"></div>' +
        '</div>' +
        passwordField +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Role <span class="text-red-500">*</span></label>' +
          '<select id="uf-role" class="field text-sm"><option value="">— Select —</option>' + roleOpts + '</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Department</label>' +
          '<input id="uf-department" type="text" placeholder="Engineering" value="' + val('department') + '" class="field text-sm"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Job Title</label>' +
          '<input id="uf-job_title" type="text" placeholder="Software Engineer" value="' + val('job_title') + '" class="field text-sm"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Phone</label>' +
          '<input id="uf-phone" type="tel" placeholder="+1 555 000 0000" value="' + val('phone') + '" class="field text-sm"></div>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Pay Type</label>' +
          '<select id="uf-pay_type" class="field text-sm">' + payOpts + '</select></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Hourly Rate</label>' +
          '<input id="uf-hourly_rate" type="number" placeholder="0.00" value="' + val('hourly_rate') + '" class="field text-sm"></div>' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Salary</label>' +
          '<input id="uf-salary" type="number" placeholder="0.00" value="' + val('salary') + '" class="field text-sm"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Start Date</label>' +
          '<input id="uf-start_date" type="date" value="' + val('start_date') + '" class="field text-sm"></div>' +
          // Manager — searchable by name
          '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Manager</label>' +
            '<div class="relative">' +
              '<input id="uf-manager_id-search" type="text" placeholder="Search by name…" autocomplete="off"' +
                ' value="' + (isEdit && user.manager_id ? escMgrName(user.manager_id) : '') + '"' +
                ' oninput="settingsManagerSearch()"' +
                ' onfocus="settingsManagerSearch()"' +
                ' class="field text-sm">' +
              '<input type="hidden" id="uf-manager_id" value="' + val('manager_id') + '">' +
              '<div id="uf-manager_id-dropdown" class="hidden absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto thin-scroll"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Avatar URL</label>' +
        '<input id="uf-avatar_url" type="url" placeholder="https://…" value="' + val('avatar_url') + '" class="field text-sm"></div>' +
        '<div class="flex gap-3 pt-2">' +
          '<button onclick="usersCloseModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button onclick="usersSubmitForm(\'' + (isEdit ? user.user_id : '') + '\')" id="user-form-btn" class="btn-primary flex-1">' + btnLabel + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderResetModal(userId, email) {
    return (
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-slate-900">Reset Password</h3>' +
        '<button onclick="usersCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div id="user-form-status"></div>' +
        '<p class="text-sm text-slate-600">Set a new password for <strong>' + email + '</strong>.</p>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">New Password <span class="text-red-500">*</span></label>' +
        '<input id="uf-new-password" type="password" placeholder="New password" class="field text-sm"></div>' +
        '<div><label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Confirm Password <span class="text-red-500">*</span></label>' +
        '<input id="uf-confirm-password" type="password" placeholder="Confirm password" class="field text-sm"></div>' +
        '<div class="flex gap-3 pt-2">' +
          '<button onclick="usersCloseModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button onclick="usersSubmitReset(\'' + userId + '\')" id="user-form-btn" class="btn-primary flex-1"><i class="fas fa-key text-sm"></i> Set Password</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderDeleteModal(userId, displayName) {
    return (
      '<div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">' +
        '<h3 class="font-bold text-red-700">Delete User</h3>' +
        '<button onclick="usersCloseModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times text-sm"></i></button>' +
      '</div>' +
      '<div class="px-6 py-5 space-y-4">' +
        '<div class="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">' +
          '<i class="fas fa-exclamation-triangle text-red-500 mt-0.5"></i>' +
          '<p class="text-sm text-red-700">You are about to permanently delete <strong>' + displayName + '</strong>. This cannot be undone.</p>' +
        '</div>' +
        '<div id="user-form-status"></div>' +
        '<div class="flex gap-3 pt-1">' +
          '<button onclick="usersCloseModal()" class="btn-secondary flex-1">Cancel</button>' +
          '<button onclick="usersSubmitDelete(\'' + userId + '\')" id="user-form-btn" ' +
            'class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">' +
            '<i class="fas fa-trash text-sm"></i> Delete Permanently' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }


  // Helper — look up manager display name from usersCache for pre-filling the search field
  function escMgrName(managerId) {
    if (!managerId) return '';
    var u = usersCache.find(function(u) { return u.user_id === managerId; });
    return u ? (u.name || u.email) : '';
  }

  window.settingsManagerSearch = function() {
    var q  = (document.getElementById('uf-manager_id-search')?.value || '').toLowerCase().trim();
    var dd = document.getElementById('uf-manager_id-dropdown');
    if (!dd) return;

    var matches = usersCache.filter(function(u) {
      return String(u.active) !== 'false' && (
        (u.name  || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }).slice(0, 8);

    if (!matches.length) {
      dd.innerHTML = '<div class="px-4 py-3 text-xs text-slate-400">No users found</div>';
      dd.classList.remove('hidden');
      return;
    }

    dd.innerHTML = matches.map(function(u) {
      var initials = u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase();
      var display  = u.name || u.email;
      return (
        '<button type="button" onclick="settingsSelectManager(\'' + u.user_id + '\',\'' + (display).replace(/'/g, '') + '\')" ' +
          'class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">' +
          '<div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs flex-shrink-0">' + initials + '</div>' +
          '<div>' +
            '<div class="text-sm font-semibold text-slate-900">' + display + '</div>' +
            (u.name ? '<div class="text-xs text-slate-400">' + u.email + '</div>' : '') +
          '</div>' +
        '</button>'
      );
    }).join('');

    dd.classList.remove('hidden');
  };

  window.settingsSelectManager = function(userId, displayName) {
    var s = document.getElementById('uf-manager_id-search');
    var h = document.getElementById('uf-manager_id');
    var d = document.getElementById('uf-manager_id-dropdown');
    if (s) s.value = displayName;
    if (h) h.value = userId;
    if (d) d.classList.add('hidden');
  };

  // Close manager dropdown on outside click
  document.addEventListener('click', function(e) {
    var wrap = document.getElementById('uf-manager_id-search');
    var dd   = document.getElementById('uf-manager_id-dropdown');
    if (dd && wrap && !wrap.contains(e.target) && !dd.contains(e.target)) {
      dd.classList.add('hidden');
    }
  });


  // ================================================================
  async function loadUsers() {
    if (!savedUrl || !savedSecret) {
      document.getElementById('users-table-wrap').innerHTML =
        '<div class="flex flex-col items-center justify-center py-16 text-slate-400">' +
          '<i class="fas fa-plug text-3xl mb-3"></i>' +
          '<p class="text-sm font-medium">Connect your Google Sheet first</p>' +
          '<p class="text-xs mt-1">Go to the Connection tab to set up your GAS URL and secret.</p>' +
        '</div>';
      var countEl = document.getElementById('users-count');
      if (countEl) countEl.textContent = '';
      return;
    }
    try {
      var data = await api('users/list');
      usersCache = data.rows || [];
      var countEl = document.getElementById('users-count');      if (countEl) countEl.textContent = usersCache.length + ' user' + (usersCache.length !== 1 ? 's' : '');
      document.getElementById('users-table-wrap').innerHTML = renderUsersTable(usersCache);
    } catch(e) {
      document.getElementById('users-table-wrap').innerHTML =
        '<div class="flex flex-col items-center justify-center py-16 text-red-400">' +
          '<i class="fas fa-exclamation-circle text-3xl mb-3"></i>' +
          '<p class="text-sm">' + e.message + '</p>' +
        '</div>';
    }
  }

  window.usersBackdropClick = function(e) {
    if (e.target === document.getElementById('user-modal-backdrop')) window.usersCloseModal();
  };

  window.usersOpenAdd = function() {
    editingUser = null;
    setModalContent(renderUserForm(null));
  };

  window.usersOpenEdit = function(userId) {
    editingUser = usersCache.find(function(u) { return u.user_id === userId; }) || null;
    if (!editingUser) return;
    setModalContent(renderUserForm(editingUser));
  };

  window.usersCloseModal = function() {
    var backdrop = document.getElementById('user-modal-backdrop');
    var modal    = document.getElementById('user-modal');
    if (backdrop) backdrop.classList.add('hidden');
    if (modal)    modal.innerHTML = '';
    editingUser = null;
  };

  window.usersSubmitForm = async function(userId) {
    var btn    = document.getElementById('user-form-btn');
    var isEdit = !!(userId);

    var email    = (document.getElementById('uf-email')?.value || '').trim();
    var role     = document.getElementById('uf-role')?.value || '';
    var password = !isEdit ? (document.getElementById('uf-password')?.value || '') : null;

    if (!email)              return setFormStatus('Email is required.', false);
    if (!role)               return setFormStatus('Role is required.', false);
    if (!isEdit && !password) return setFormStatus('Password is required.', false);

    var params = {
      email:        email,
      role:         role,
      name:         (document.getElementById('uf-name')?.value || '').trim(),
      department:   (document.getElementById('uf-department')?.value || '').trim(),
      job_title:    (document.getElementById('uf-job_title')?.value || '').trim(),
      phone:        (document.getElementById('uf-phone')?.value || '').trim(),
      pay_type:     document.getElementById('uf-pay_type')?.value || '',
      hourly_rate:  document.getElementById('uf-hourly_rate')?.value || '',
      salary:       document.getElementById('uf-salary')?.value || '',
      start_date:   document.getElementById('uf-start_date')?.value || '',
      manager_id:   (document.getElementById('uf-manager_id')?.value || '').trim(),
      avatar_url:   (document.getElementById('uf-avatar_url')?.value || '').trim(),
    };

    if (!isEdit) params.password = password;
    else         params.user_id  = userId;

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }

    try {
      await api(isEdit ? 'users/update' : 'users/create', params);
      setFormStatus(isEdit ? 'User updated successfully.' : 'User created successfully.', true);
      setTimeout(function() { window.usersCloseModal(); loadUsers(); }, 900);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isEdit
          ? '<i class="fas fa-save text-sm"></i> Save Changes'
          : '<i class="fas fa-user-plus text-sm"></i> Create User';
      }
    }
  };

  window.usersResetPassword = function(userId, email) {
    setModalContent(renderResetModal(userId, email));
  };

  window.usersSubmitReset = async function(userId) {
    var btn     = document.getElementById('user-form-btn');
    var newPass = document.getElementById('uf-new-password')?.value || '';
    var confirm = document.getElementById('uf-confirm-password')?.value || '';

    if (!newPass)            return setFormStatus('Please enter a new password.', false);
    if (newPass !== confirm)  return setFormStatus('Passwords do not match.', false);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…'; }

    try {
      var user = usersCache.find(function(u) { return u.user_id === userId; });
      if (!user) throw new Error('User not found');
      var tokenData = await api('users/reset-token', { email: user.email });
      await api('users/set-password', { token: tokenData.token, password: newPass });
      setFormStatus('Password updated successfully.', true);
      setTimeout(function() { window.usersCloseModal(); }, 900);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key text-sm"></i> Set Password'; }
    }
  };

  window.usersToggleActive = async function(userId, active) {
    try {
      await api(active ? 'users/reactivate' : 'users/deactivate', { user_id: userId });
      loadUsers();
    } catch(e) {
      window.WorkVolt?.toast(e.message, 'error');
    }
  };

  window.usersConfirmDelete = function(userId, displayName) {
    setModalContent(renderDeleteModal(userId, displayName));
  };

  window.usersSubmitDelete = async function(userId) {
    var btn = document.getElementById('user-form-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Deleting…'; }
    try {
      await api('users/delete', { user_id: userId });
      setFormStatus('User deleted.', true);
      setTimeout(function() { window.usersCloseModal(); loadUsers(); }, 700);
    } catch(e) {
      setFormStatus(e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash text-sm"></i> Delete Permanently'; }
    }
  };


  // ================================================================
  //  ADMIN CONFIG TAB
  // ================================================================
  var adminConfigCache = {};

  function renderAdminConfigTab() {
    return `
      <div class="max-w-2xl space-y-6">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div class="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-id-card text-white text-sm"></i>
            </div>
            <div>
              <h2 class="font-bold text-slate-900">User ID Format</h2>
              <p class="text-xs text-slate-500">Choose how new User IDs are generated</p>
            </div>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div id="admin-config-status"></div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">ID Format</label>
              <div class="space-y-3" id="uid-format-options">
                <label class="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors">
                  <input type="radio" name="uid_format" value="wv6" class="mt-0.5 accent-indigo-600">
                  <div>
                    <div class="font-semibold text-slate-800 text-sm">WV + 6 digits <span class="ml-2 text-xs text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded">WV482931</span></div>
                    <div class="text-xs text-slate-400 mt-0.5">Short, readable ID — default format</div>
                  </div>
                </label>
                <label class="flex items-start gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors">
                  <input type="radio" name="uid_format" value="uuid" class="mt-0.5 accent-indigo-600">
                  <div>
                    <div class="font-semibold text-slate-800 text-sm">UUID <span class="ml-2 text-xs text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded">cf49fbed-2be7-4e55-95c0</span></div>
                    <div class="text-xs text-slate-400 mt-0.5">Legacy universally unique identifier</div>
                  </div>
                </label>
              </div>
              <p class="text-xs text-slate-400 mt-2.5"><i class="fas fa-info-circle mr-1"></i>This setting only affects <strong>new</strong> users created after saving. Existing IDs are not changed.</p>
            </div>
            <div class="pt-1">
              <button onclick="saveAdminConfig()" id="admin-config-save-btn" class="btn-primary w-full">
                <i class="fas fa-save text-sm"></i> Save Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function loadAdminConfig() {
    try {
      var res = await api('config/get-all', {});
      adminConfigCache = res.settings || {};
    } catch(e) {
      adminConfigCache = {};
    }
    // Set radio button to current value
    var fmt = adminConfigCache['user_id_format'] || 'wv6';
    document.querySelectorAll('input[name="uid_format"]').forEach(function(r) {
      r.checked = (r.value === fmt);
    });
  }

  window.saveAdminConfig = async function() {
    var btn = document.getElementById('admin-config-save-btn');
    var statusEl = document.getElementById('admin-config-status');
    var fmt = document.querySelector('input[name="uid_format"]:checked');
    if (!fmt) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Saving…';
    statusEl.innerHTML = '';
    try {
      await api('config/set', { key: 'user_id_format', value: fmt.value });
      adminConfigCache['user_id_format'] = fmt.value;
      statusEl.innerHTML = '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3 bg-green-50 text-green-700 border border-green-200"><i class="fas fa-check-circle"></i><span>Configuration saved!</span></div>';
    } catch(e) {
      statusEl.innerHTML = '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-3 bg-red-50 text-red-600 border border-red-200"><i class="fas fa-exclamation-circle"></i><span>' + e.message + '</span></div>';
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save text-sm"></i> Save Configuration';
  };


  // ================================================================
  //  MODULES TAB
  // ================================================================
  var ADDON_CATALOGUE = {
    notifications: { label: 'Notifications',         icon: 'fa-bell',               description: 'Full notification center with smart grouping, priority levels, bell alerts, popup toasts, persistent banners, and quiet hours.' },
    tasks:       { label: 'Tasks',                 icon: 'fa-check-circle',       description: 'Create, assign and track tasks with priority, billing and pay-per-task support.' },
    pipeline:    { label: 'Pipeline',              icon: 'fa-users',              description: 'Visual sales pipeline to manage leads and deals through custom stages.' },
    payroll:     { label: 'Payroll',               icon: 'fa-money-bill-wave',    description: 'Run payroll for hourly, salaried and pay-per-task employees.' },
    timesheets:  { label: 'Timesheets',            icon: 'fa-clock',              description: 'Log and approve work hours with project and task tracking.' },
    financials:  { label: 'Financials',            icon: 'fa-chart-line',         description: 'Track income, expenses and financial KPIs in one place.' },
    crm:         { label: 'CRM',                   icon: 'fa-address-book',       description: 'Manage contacts, companies and customer relationships.' },
    projects:    { label: 'Projects',              icon: 'fa-folder-open',        description: 'Organise work into projects with milestones and team assignments.' },
    reports:     { label: 'Reports',               icon: 'fa-chart-pie',          description: 'Auto-generated reports across all installed modules.' },
    assets:      { label: 'Assets',                icon: 'fa-box-open',           description: 'Track company assets, assignments and maintenance schedules.' },
    attendance:  { label: 'Attendance Tracker',    icon: 'fa-calendar-check',     description: 'Monitor employee check-ins, absences and leave requests.' },
    invoices:    { label: 'Invoice Manager',       icon: 'fa-file-invoice-dollar',description: 'Create and send professional invoices, track payment status.' },
    inventory:   { label: 'Inventory Control',     icon: 'fa-warehouse',          description: 'Manage stock levels, SKUs, suppliers and reorder points.' },
    scheduler:   { label: 'Shift Scheduler',       icon: 'fa-calendar-alt',       description: 'Build and publish shift schedules for your team.' },
    expenses:    { label: 'Expense Claims',        icon: 'fa-receipt',            description: 'Submit, review and reimburse employee expense claims.' },
    contracts:   { label: 'Contract Hub',          icon: 'fa-file-signature',     description: 'Store and manage contracts with expiry reminders.' },
    helpdesk:    { label: 'Help Desk',             icon: 'fa-headset',            description: 'Internal ticket system for employee IT and HR requests.' },
    recruitment: { label: 'Recruitment Pipeline',  icon: 'fa-user-tie',           description: 'Track candidates through your hiring pipeline.' },
  };

  function renderModulesTab() {
    return `
      <div>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Modules</h2>
            <p class="text-sm text-slate-500">Install or remove modules. Each module creates its own Sheet tab on first install.</p>
          </div>
          <button onclick="loadModules()" class="btn-secondary text-xs px-3 py-2">
            <i class="fas fa-sync-alt text-xs"></i> Refresh
          </button>
        </div>

        <div id="modules-status"></div>

        <!-- Installed -->
        <div class="mb-6">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Installed</h3>
          <div id="modules-installed" class="space-y-2">
            <div class="flex items-center justify-center py-8 text-slate-400">
              <i class="fas fa-circle-notch fa-spin text-xl"></i>
            </div>
          </div>
        </div>

        <!-- Module-specific settings (shown when relevant module is installed) -->
        <div id="module-settings-section"></div>

        <!-- Available -->
        <div>
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Available</h3>
          <div id="modules-available" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="flex items-center justify-center py-8 text-slate-400 col-span-2">
              <i class="fas fa-circle-notch fa-spin text-xl"></i>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function setModuleStatus(msg, ok) {
    var el = document.getElementById('modules-status');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = (
      '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 ' +
      (ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200') + '">' +
        '<i class="fas ' + (ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i>' +
        '<span>' + msg + '</span>' +
      '</div>'
    );
  }

  async function loadModules() {
    if (!savedUrl || !savedSecret) {
      modulesCache = []; // Clear cache when not connected
      var ins = document.getElementById('modules-installed');
      var avl = document.getElementById('modules-available');
      var msg = '<div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-slate-500 bg-slate-50 border border-slate-200"><i class="fas fa-plug text-slate-400"></i><span>Connect your Google Sheet first to manage modules.</span></div>';
      if (ins) ins.innerHTML = msg;
      if (avl) avl.innerHTML = '';
      return;
    }

    try {
      var data = await api('config/modules');
      modulesCache = data.modules || [];
      renderModuleLists();
    } catch(e) {
      setModuleStatus('Could not load modules: ' + e.message, false);
    }
  }

  function renderModuleLists() {
    // If not connected, don't render anything (loadModules should have already set the message)
    if (!savedUrl || !savedSecret) {
      return;
    }
    
    var installedEl  = document.getElementById('modules-installed');
    var availableEl  = document.getElementById('modules-available');
    if (!installedEl || !availableEl) return;

    var installedIds = modulesCache.map(function(m) { return m.id; });

    // ── Installed list ──
    if (!modulesCache.length) {
      installedEl.innerHTML = '<p class="text-sm text-slate-400 py-4">No modules installed yet.</p>';
    } else {
      installedEl.innerHTML = modulesCache.map(function(m) {
        var def = ADDON_CATALOGUE[m.id] || {};
        var roles = m.allowed_roles || def.roles || ['SuperAdmin','Admin','Manager','Employee','Contractor'];
        var roleChips = ['SuperAdmin','Admin','Manager','Employee','Contractor'].map(function(r) {
          var on = roles.includes(r);
          return '<span class="text-[10px] px-1.5 py-0.5 rounded font-semibold ' +
            (on ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400') + '">' + r + '</span>';
        }).join('');
        return (
          '<div class="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">' +
            '<div class="flex items-center gap-4">' +
              '<div class="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">' +
                '<i class="fas ' + (def.icon || m.icon || 'fa-layer-group') + ' text-blue-600 text-sm"></i>' +
              '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="font-semibold text-slate-900 text-sm">' + (def.label || m.label) + '</div>' +
                '<div class="flex items-center gap-1 mt-1 flex-wrap">' + roleChips + '</div>' +
              '</div>' +
              '<div class="flex items-center gap-2 flex-shrink-0">' +
                '<button onclick="modulesEditRoles(\'' + m.id + '\')" ' +
                  'class="text-xs text-blue-600 font-semibold bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg border border-blue-200 transition-colors">' +
                  '<i class="fas fa-users-cog mr-1"></i>Roles' +
                '</button>' +
                '<button onclick="modulesUninstall(\'' + m.id + '\')" ' +
                  'class="text-xs text-red-500 hover:text-red-700 font-semibold bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg border border-red-200 transition-colors">' +
                  'Uninstall' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    // ── Available list ──
    var available = Object.keys(ADDON_CATALOGUE).filter(function(id) {
      return !installedIds.includes(id);
    });

    if (!available.length) {
      availableEl.innerHTML = '<p class="text-sm text-slate-400 py-4 col-span-2">All available modules are installed!</p>';
    } else {
      availableEl.innerHTML = available.map(function(id) {
        var def = ADDON_CATALOGUE[id];
        return (
          '<div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">' +
            '<div class="flex items-start gap-3">' +
              '<div class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">' +
                '<i class="fas ' + def.icon + ' text-slate-500 text-sm"></i>' +
              '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="font-semibold text-slate-900 text-sm">' + def.label + '</div>' +
                '<div class="text-xs text-slate-500 mt-0.5 leading-relaxed">' + def.description + '</div>' +
              '</div>' +
            '</div>' +
            '<button onclick="modulesInstall(\'' + id + '\')" id="install-btn-' + id + '" ' +
              'class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">' +
              '<i class="fas fa-download text-xs"></i> Install' +
            '</button>' +
          '</div>'
        );
      }).join('');
    }
  }

  window.modulesInstall = async function(moduleId) {
    if (!savedUrl || !savedSecret) {
      setModuleStatus('You must connect your Google Sheet first to install modules.', false);
      return;
    }
    var btn = document.getElementById('install-btn-' + moduleId);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i> Installing…'; }
    setModuleStatus('', false);
    try {
      var data = await api('module/install', { module: moduleId });
      setModuleStatus((ADDON_CATALOGUE[moduleId]?.label || moduleId) + ' installed successfully! The sheet tab has been created.', true);
      // Refresh global INSTALLED_MODULES and re-render nav
      modulesCache.push({ id: moduleId, label: ADDON_CATALOGUE[moduleId]?.label, icon: ADDON_CATALOGUE[moduleId]?.icon, version: '1.0.0' });
      if (window.INSTALLED_MODULES !== undefined) {
        window.INSTALLED_MODULES = modulesCache;
        if (typeof renderNav === 'function') renderNav();
      }
      renderModuleLists();
    } catch(e) {
      setModuleStatus('Install failed: ' + e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download text-xs"></i> Install'; }
    }
  };

  window.modulesEditRoles = function(moduleId) {
    var m   = modulesCache.find(function(x) { return x.id === moduleId; });
    var def = ADDON_CATALOGUE[moduleId] || {};
    if (!m) return;
    var currentRoles = m.allowed_roles || def.roles || ['SuperAdmin','Admin','Manager','Employee','Contractor'];
    var ALL_ROLES = ['SuperAdmin','Admin','Manager','Employee','Contractor'];

    // Build modal HTML
    var checks = ALL_ROLES.map(function(r) {
      var checked = currentRoles.includes(r) ? ' checked' : '';
      var disabled = r === 'SuperAdmin' ? ' disabled' : ''; // SuperAdmin always has access
      return '<label class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">' +
        '<input type="checkbox" class="role-check w-4 h-4 accent-blue-600" value="' + r + '"' + checked + disabled + '>' +
        '<span class="text-sm font-medium text-slate-700">' + r + '</span>' +
        (r === 'SuperAdmin' ? '<span class="text-[10px] text-slate-400 ml-auto">Always enabled</span>' : '') +
      '</label>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'role-modal-backdrop';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:1.25rem;box-shadow:0 30px 70px rgba(0,0,0,0.25);width:100%;max-width:380px;overflow:hidden">' +
        '<div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">' +
          '<div>' +
            '<h3 class="font-extrabold text-slate-900 text-base">Module Access</h3>' +
            '<p class="text-xs text-slate-400 mt-0.5">Who can see <strong>' + (def.label || m.label) + '</strong> in the sidebar?</p>' +
          '</div>' +
          '<button id="role-modal-close" style="width:2rem;height:2rem;border-radius:.75rem;border:none;background:transparent;cursor:pointer;font-size:1rem;color:#94a3b8">✕</button>' +
        '</div>' +
        '<div class="px-4 py-3">' + checks + '</div>' +
        '<div class="px-5 py-4 border-t border-slate-100 flex gap-3">' +
          '<button id="role-modal-cancel" class="btn-secondary flex-1 text-sm">Cancel</button>' +
          '<button id="role-modal-save"   class="btn-primary flex-1 text-sm"><i class="fas fa-save text-xs mr-1"></i>Save</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    document.getElementById('role-modal-close').onclick  = function() { modal.remove(); };
    document.getElementById('role-modal-cancel').onclick = function() { modal.remove(); };
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    document.getElementById('role-modal-save').onclick = async function() {
      var selected = Array.from(modal.querySelectorAll('.role-check:checked')).map(function(c) { return c.value; });
      if (!selected.includes('SuperAdmin')) selected.unshift('SuperAdmin');
      if (!selected.length) return;

      // Save to modulesCache and persist to GAS
      m.allowed_roles = selected;
      try {
        await api('config/save-modules', { modules: JSON.stringify(modulesCache) });
        // Update ADDON_CATALOGUE in memory so nav re-renders correctly
        if (window.ADDON_CATALOGUE && window.ADDON_CATALOGUE[moduleId]) {
          window.ADDON_CATALOGUE[moduleId].roles = selected;
        }
        // Also update the index.html ADDON_CATALOGUE if accessible
        try {
          var topCat = window.parent ? window.parent.ADDON_CATALOGUE : null;
          if (topCat && topCat[moduleId]) topCat[moduleId].roles = selected;
        } catch(e) {}
        if (window.INSTALLED_MODULES !== undefined) {
          window.INSTALLED_MODULES = modulesCache;
          if (typeof renderNav === 'function') renderNav();
        }
        modal.remove();
        renderModuleLists();
        setModuleStatus('Access roles updated for ' + (def.label || m.label), true);
      } catch(e) {
        setModuleStatus('Failed to save roles: ' + e.message, false);
      }
    };
  };

  window.modulesUninstall = async function(moduleId) {
    if (!savedUrl || !savedSecret) {
      setModuleStatus('You must connect your Google Sheet first to uninstall modules.', false);
      return;
    }
    if (!confirm('Uninstall ' + (ADDON_CATALOGUE[moduleId]?.label || moduleId) + '? The sheet data will be kept but the module will be removed from the menu.')) return;
    setModuleStatus('', false);
    try {
      await api('module/uninstall', { module: moduleId });
      setModuleStatus((ADDON_CATALOGUE[moduleId]?.label || moduleId) + ' uninstalled. Sheet data has been kept.', true);
      modulesCache = modulesCache.filter(function(m) { return m.id !== moduleId; });
      if (window.INSTALLED_MODULES !== undefined) {
        window.INSTALLED_MODULES = modulesCache;
        if (typeof renderNav === 'function') renderNav();
      }
      renderModuleLists();
    } catch(e) {
      setModuleStatus('Uninstall failed: ' + e.message, false);
    }
  };


  // ================================================================
  //  CONNECTION ACTIONS
  // ================================================================
  window.settingsTab = function(tab) {
    activeTab = tab;
    render();
  };

  window.toggleSecretVis = function() {
    var inp = document.getElementById('settings-secret');
    var eye = document.getElementById('secret-eye');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    eye.className = inp.type === 'password' ? 'fas fa-eye text-sm' : 'fas fa-eye-slash text-sm';
  };

  window.toggleHowTo = function() {
    var body = document.getElementById('howto-body');
    var chev = document.getElementById('howto-chevron');
    body.classList.toggle('hidden');
    chev.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
  };

  window.settingsSave = function() {
    var url = document.getElementById('settings-gas-url').value.trim();

    if (!url) return window.WorkVolt?.toast('Please enter the GAS URL', 'warning');

    localStorage.setItem('wv_gas_url', url);
    savedUrl = url;
    window.API_URL = url;
    render({ ok: true, message: 'Settings saved. Testing connection…' });
    setTimeout(function() { window.settingsTestConnection(); }, 400);
  };

  window.settingsTestConnection = async function() {
    var url    = (document.getElementById('settings-gas-url')?.value || '').trim() || savedUrl;
    var secret = (document.getElementById('settings-secret')?.value  || '').trim() || savedSecret;
    var btn    = document.getElementById('settings-test-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Testing…'; }
    try {
      var pingUrl = new URL(url);
      pingUrl.searchParams.set('path', 'ping');
      var pingRes  = await fetch(pingUrl.toString(), { cache: 'no-cache' });
      var pingData = await pingRes.json();
      if (pingData.status !== 'ok') throw new Error('Unexpected response from server');

      // Check if admin exists (no secret needed for this)
      var usersUrl = new URL(url);
      usersUrl.searchParams.set('path', 'users/list');
      if (secret) {
        usersUrl.searchParams.set('token', secret);
      }
      var usersRes = await fetch(usersUrl.toString(), { cache: 'no-cache' });
      var usersData = await usersRes.json();
      var hasAdmin = (usersData.rows || []).some(function(u) { return u.role === 'SuperAdmin' || u.role === 'Admin'; });
      
      // If admin exists, no need for API secret - just save URL
      if (hasAdmin) {
        localStorage.setItem('wv_gas_url', url);
        savedUrl = url;
        window.API_URL = url;
        render({ ok: true, message: '✓ Connected successfully! Admins already set up. You can now login.' });
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-vial text-sm"></i> Test Connection'; }
        return;
      }
      
      // If no admin, use public setup/init — no secret needed
      var provUrl = new URL(url);
      provUrl.searchParams.set('path', 'setup/init');
      var provRes  = await fetch(provUrl.toString(), { cache: 'no-cache' });
      var provData = await provRes.json();
      if (provData.error) throw new Error(provData.error);

      if (provData.provisioned || !hasAdmin) {
        // First time setup - show admin creation form
        renderAdminSetupForm();
      } else {
        render({ ok: true, message: '✓ Connected successfully! Work Volt is linked to your Google Sheet.' });
      }
    } catch(e) {
      render({ ok: false, message: 'Connection failed: ' + e.message + '. Check the URL and try again.' });
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-vial text-sm"></i> Test Connection'; }
    }
  };

  window.settingsDisconnect = function() {
    localStorage.removeItem('wv_gas_url');
    localStorage.removeItem('wv_api_secret');
    savedUrl    = '';
    savedSecret = '';
    window.API_URL = '';
    render({ ok: false, message: 'Disconnected. Enter a new GAS URL to reconnect.' });
  };

  // ── ADMIN SETUP FORM ────────────────────────────────────────────
  function renderAdminSetupForm() {
    var adminSetupHtml = `
      <div class="max-w-2xl space-y-6">
        <div class="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-blue-100 flex items-center gap-3 bg-blue-50">
            <div class="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <i class="fas fa-user-shield text-white text-sm"></i>
            </div>
            <div>
              <h2 class="font-bold text-slate-900">Create Admin Accounts</h2>
              <p class="text-xs text-slate-500">Set up your Support and Customer admin accounts</p>
            </div>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div id="admin-setup-step-1">
              <p class="text-sm text-slate-600 mb-4">Creating Work Volt Support account...</p>
              <div class="flex items-center justify-center py-6">
                <i class="fas fa-circle-notch fa-spin text-2xl text-blue-600"></i>
              </div>
            </div>
            <div id="admin-setup-step-2" class="hidden space-y-4">
              <div id="admin-setup-error" class="hidden p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Admin Email</label>
                <input id="admin-email" type="email" placeholder="admin@company.com" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Admin Name</label>
                <input id="admin-name" type="text" placeholder="Full Name" class="field text-sm">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Password</label>
                <input id="admin-pass" type="password" placeholder="Password" class="field text-sm">
              </div>
              <button onclick="createCustomerAdminFromSettings()" class="btn-primary w-full">
                <i class="fas fa-user-tie text-sm mr-2"></i>Create Customer Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    var contentDiv = document.getElementById('settings-tab-content');
    if (contentDiv) {
      contentDiv.innerHTML = adminSetupHtml;
      setTimeout(function() {
        window.createSupportAdminFromSettings();
      }, 500);
    }
  }

  window.createSupportAdminFromSettings = async function() {
    if (!savedUrl) return;
    
    try {
      var apiUrl = new URL(savedUrl);
      apiUrl.searchParams.set('path', 'setup/create-admin');
      apiUrl.searchParams.set('email', 'sadmin@workvolt.app');
      apiUrl.searchParams.set('password', Math.random().toString(36).slice(-12));
      apiUrl.searchParams.set('role', 'SuperAdmin');
      apiUrl.searchParams.set('name', 'Work Volt Support');
      
      var res = await fetch(apiUrl.toString(), { cache: 'no-cache' });
      var data = await res.json();
      
      if (data.error && !data.error.includes('already exists')) {
        throw new Error(data.error);
      }
      
      // Show step 2
      document.getElementById('admin-setup-step-1').classList.add('hidden');
      document.getElementById('admin-setup-step-2').classList.remove('hidden');
      
    } catch(e) {
      var error = document.getElementById('admin-setup-error');
      if (error) {
        error.textContent = 'Setup error: ' + e.message;
        error.classList.remove('hidden');
      }
    }
  };

  window.createCustomerAdminFromSettings = async function() {
    var email = document.getElementById('admin-email').value.trim();
    var name = document.getElementById('admin-name').value.trim();
    var pass = document.getElementById('admin-pass').value;
    var error = document.getElementById('admin-setup-error');
    
    if (!email || !name || !pass) {
      error.textContent = 'Please fill in all fields';
      error.classList.remove('hidden');
      return;
    }
    
    if (!savedUrl) return;
    
    try {
      var apiUrl = new URL(savedUrl);
      apiUrl.searchParams.set('path', 'setup/create-admin');
      apiUrl.searchParams.set('email', email);
      apiUrl.searchParams.set('password', pass);
      apiUrl.searchParams.set('role', 'Admin');
      apiUrl.searchParams.set('name', name);
      
      var res = await fetch(apiUrl.toString(), { cache: 'no-cache' });
      var data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      // Go back to login
      currentUser = null;
      localStorage.removeItem('wv_user');
      window.location.reload();
      
    } catch(e) {
      error.textContent = e.message;
      error.classList.remove('hidden');
    }
  };


  // ── Boot ──────────────────────────────────────────────────────
  if (savedUrl) {
    window.API_URL = savedUrl;
  }
  if (savedSecret) {
    window.API_SECRET_CLIENT = savedSecret;
  }

  render();
};
