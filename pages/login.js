window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['login'] = function(container) {
  
  // ── State ──────────────────────────────────────────────────────
  let mode = 'checking'; // 'checking' | 'demo' | 'first-admin' | 'login'
  let savedUrl = localStorage.getItem('wv_gas_url') || '';
  let savedSecret = localStorage.getItem('wv_api_secret') || '';
  
  // ── Check connection status ────────────────────────────────────
  async function checkStatus() {
    if (!savedUrl || !savedSecret) {
      mode = 'demo';
      render();
      return;
    }
    
    try {
      // Test connection
      const pingUrl = new URL(savedUrl);
      pingUrl.searchParams.set('path', 'ping');
      const pingRes = await fetch(pingUrl.toString(), { cache: 'no-cache' });
      const pingData = await pingRes.json();
      
      if (pingData.status !== 'ok') throw new Error('No connection');
      
      // Check if admin exists
      const adminUrl = new URL(savedUrl);
      adminUrl.searchParams.set('path', 'users/list');
      adminUrl.searchParams.set('token', savedSecret);
      adminUrl.searchParams.set('role', 'SuperAdmin');
      const adminRes = await fetch(adminUrl.toString(), { cache: 'no-cache' });
      const adminData = await adminRes.json();
      
      const hasAdmin = (adminData.rows || []).some(u => u.role === 'SuperAdmin');
      mode = hasAdmin ? 'login' : 'first-admin';
      
    } catch(e) {
      mode = 'demo';
    }
    render();
  }
  
  // ── Render ─────────────────────────────────────────────────────
  function render() {
    const content = {
      'checking': renderChecking,
      'demo': renderDemo,
      'first-admin': renderFirstAdmin,
      'login': renderLogin
    }[mode] || renderDemo;
    
    container.innerHTML = `
      <div class="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
        <div class="w-full max-w-md">
          <div class="flex flex-col items-center mb-8">
            <div class="w-16 h-16 bg-white/15 border border-white/30 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
              <i class="fas fa-bolt text-white text-3xl"></i>
            </div>
            <h1 class="text-3xl font-extrabold text-white tracking-tight">Work Volt</h1>
            <p class="text-blue-200 mt-1 text-sm font-medium">Power your operations</p>
          </div>
          ${content()}
        </div>
      </div>
    `;
  }
  
  function renderChecking() {
    return `
      <div class="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 text-center">
        <i class="fas fa-circle-notch fa-spin text-white text-2xl mb-3"></i>
        <p class="text-white/80 text-sm">Checking connection...</p>
      </div>
    `;
  }
  
  function renderDemo() {
    return `
      <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-center gap-2">
          <i class="fas fa-flask text-amber-500"></i>
          <span class="text-xs font-bold text-amber-700 uppercase tracking-wide">Demo Mode</span>
        </div>
        <div class="p-6">
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <i class="fas fa-user text-white text-xl"></i>
            </div>
            <h2 class="text-lg font-bold text-slate-800">Demo User</h2>
            <p class="text-xs text-slate-500">Experience Work Volt with sample data</p>
          </div>
          
          <div class="space-y-2 mb-6">
            <div class="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              <i class="fas fa-shield-alt text-blue-500"></i>
              <span>SuperAdmin privileges (simulated)</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              <i class="fas fa-eye text-green-500"></i>
              <span>View-only access to modules</span>
            </div>
          </div>
          
          <button onclick="enterDemoMode()" class="w-full btn-primary mb-3">
            <i class="fas fa-play text-sm"></i> Enter Demo Mode
          </button>
          
          <div class="text-center">
            <button onclick="showConnectSheet()" class="text-xs text-blue-600 hover:text-blue-800 font-semibold">
              <i class="fas fa-plug mr-1"></i>Connect Google Sheet
            </button>
          </div>
        </div>
      </div>
      
      <div class="mt-4 grid grid-cols-3 gap-2">
        ${renderDemoModule('tasks', 'fa-check-circle', 'Tasks', 'bg-blue-500')}
        ${renderDemoModule('payroll', 'fa-money-bill-wave', 'Payroll', 'bg-emerald-500')}
        ${renderDemoModule('crm', 'fa-address-book', 'CRM', 'bg-violet-500')}
        ${renderDemoModule('pipeline', 'fa-users', 'Pipeline', 'bg-indigo-500')}
        ${renderDemoModule('timesheets', 'fa-clock', 'Timesheets', 'bg-amber-500')}
        ${renderDemoModule('reports', 'fa-chart-pie', 'Reports', 'bg-rose-500')}
      </div>
    `;
  }
  
  function renderDemoModule(id, icon, label, color) {
    return `
      <button onclick="previewDemoModule('${id}')" 
        class="bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl p-3 text-center transition-all hover:scale-105 group">
        <div class="w-10 h-10 ${color} rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:shadow-lg transition-shadow">
          <i class="fas ${icon} text-white text-sm"></i>
        </div>
        <span class="text-[10px] font-semibold text-white/90">${label}</span>
      </button>
    `;
  }
  
  function renderFirstAdmin() {
    return `
      <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="bg-green-50 border-b border-green-100 px-6 py-3 flex items-center gap-2">
          <i class="fas fa-seedling text-green-500"></i>
          <span class="text-xs font-bold text-green-700 uppercase tracking-wide">First Time Setup</span>
        </div>
        <div class="p-6">
          <div class="text-center mb-6">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i class="fas fa-user-shield text-green-600 text-lg"></i>
            </div>
            <h2 class="text-lg font-bold text-slate-800">Create Admin Account</h2>
            <p class="text-xs text-slate-500 mt-1">No admin user found. Create the first SuperAdmin to continue.</p>
          </div>
          
          <div id="first-admin-status"></div>
          
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Email</label>
              <input id="fa-email" type="email" placeholder="admin@company.com" class="field text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Full Name</label>
              <input id="fa-name" type="text" placeholder="John Smith" class="field text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Password</label>
              <input id="fa-password" type="password" placeholder="Create a secure password" class="field text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Confirm Password</label>
              <input id="fa-confirm" type="password" placeholder="Confirm password" class="field text-sm">
            </div>
          </div>
          
          <button onclick="createFirstAdmin()" id="fa-btn" class="w-full btn-primary mt-4">
            <i class="fas fa-user-plus text-sm"></i> Create Admin & Login
          </button>
          
          <div class="mt-4 pt-4 border-t border-slate-100 text-center">
            <button onclick="disconnectSheet()" class="text-xs text-slate-400 hover:text-slate-600">
              Back to Demo Mode
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  function renderLogin() {
    return `
      <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="p-6">
          <div class="text-center mb-6">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i class="fas fa-lock text-blue-600 text-lg"></i>
            </div>
            <h2 class="text-lg font-bold text-slate-800">Welcome Back</h2>
            <p class="text-xs text-slate-500 mt-1">Sign in to your Work Volt workspace</p>
          </div>
          
          <div id="login-status"></div>
          
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Email</label>
              <input id="login-email" type="email" placeholder="you@company.com" class="field text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Password</label>
              <div class="relative">
                <input id="login-password" type="password" placeholder="Enter password" class="field text-sm pr-10">
                <button onclick="toggleLoginPassword()" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <i id="login-eye" class="fas fa-eye text-xs"></i>
                </button>
              </div>
            </div>
          </div>
          
          <div class="flex items-center justify-between mt-3 mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="login-remember" class="accent-blue-600 w-4 h-4 rounded">
              <span class="text-xs text-slate-600">Remember me</span>
            </label>
            <button onclick="showForgotPassword()" class="text-xs text-blue-600 hover:text-blue-800 font-semibold">Forgot password?</button>
          </div>
          
          <button onclick="doLogin()" id="login-btn" class="w-full btn-primary">
            <i class="fas fa-sign-in-alt text-sm"></i> Sign In
          </button>
          
          <div class="mt-4 pt-4 border-t border-slate-100 text-center">
            <button onclick="disconnectSheet()" class="text-xs text-slate-400 hover:text-slate-600">
              Switch to Demo Mode
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  // ── Actions ────────────────────────────────────────────────────
  window.enterDemoMode = function() {
    // Set demo user
    const demoUser = {
      user_id: 'DEMO-001',
      email: 'demo@workvolt.app',
      name: 'Demo User',
      role: 'SuperAdmin',
      department: 'Demonstration',
      job_title: 'Demo Administrator',
      active: true,
      _demo: true
    };
    
    localStorage.setItem('wv_demo_mode', 'true');
    localStorage.setItem('wv_user', JSON.stringify(demoUser));
    localStorage.setItem('wv_token', 'demo-token');
    
    // Load app
    window.location.reload();
  };
  
  window.previewDemoModule = function(moduleId) {
    // Store preview intent
    sessionStorage.setItem('wv_demo_preview', moduleId);
    enterDemoMode();
  };
  
    window.showConnectSheet = function() {
    // Set the module to settings
    sessionStorage.setItem('lastModule', 'settings');
    // Set a flag so boot sequence knows to go straight to settings
    localStorage.setItem('wv_goto_settings', 'true');
    // Navigate without reload
    window.location.hash = 'settings';
    // Hide login UI and show app
    document.getElementById('main-content').innerHTML = '';
    // Trigger the module load directly
    if (window.showModule) {
      window.showModule('settings');
    }
  };
  
  window.disconnectSheet = function() {
    localStorage.removeItem('wv_gas_url');
    localStorage.removeItem('wv_api_secret');
    savedUrl = '';
    savedSecret = '';
    mode = 'demo';
    render();
  };
  
  window.createFirstAdmin = async function() {
    const btn = document.getElementById('fa-btn');
    const status = document.getElementById('first-admin-status');
    const email = document.getElementById('fa-email').value.trim();
    const name = document.getElementById('fa-name').value.trim();
    const password = document.getElementById('fa-password').value;
    const confirm = document.getElementById('fa-confirm').value;
    
    if (!email || !password) {
      status.innerHTML = '<div class="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"><i class="fas fa-exclamation-circle mr-1"></i>Email and password required</div>';
      return;
    }
    if (password !== confirm) {
      status.innerHTML = '<div class="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"><i class="fas fa-exclamation-circle mr-1"></i>Passwords do not match</div>';
      return;
    }
    if (password.length < 6) {
      status.innerHTML = '<div class="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"><i class="fas fa-exclamation-circle mr-1"></i>Password must be at least 6 characters</div>';
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Creating...';
    
    try {
      const url = new URL(savedUrl);
      url.searchParams.set('path', 'users/create');
      url.searchParams.set('token', savedSecret);
      url.searchParams.set('email', email);
      url.searchParams.set('password', password);
      url.searchParams.set('role', 'SuperAdmin');
      url.searchParams.set('name', name || 'Super Admin');
      
      const res = await fetch(url.toString(), { cache: 'no-cache' });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      // Auto-login
      await doLoginWithCreds(email, password);
      
    } catch(e) {
      status.innerHTML = `<div class="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"><i class="fas fa-exclamation-circle mr-1"></i>${e.message}</div>`;
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus text-sm"></i> Create Admin & Login';
    }
  };
  
  window.doLogin = async function() {
    const btn = document.getElementById('login-btn');
    const status = document.getElementById('login-status');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;
    
    if (!email || !password) {
      status.innerHTML = '<div class="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"><i class="fas fa-exclamation-circle mr-1"></i>Enter email and password</div>';
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Signing in...';
    
    try {
      await doLoginWithCreds(email, password, remember);
    } catch(e) {
      status.innerHTML = `<div class="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"><i class="fas fa-exclamation-circle mr-1"></i>${e.message}</div>`;
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt text-sm"></i> Sign In';
    }
  };
  
    async function doLoginWithCreds(email, password, remember) {
    const hash = await sha256(password);
    
    // Try the dedicated login endpoint first
    try {
      const loginUrl = new URL(savedUrl);
      loginUrl.searchParams.set('path', 'users/login');
      loginUrl.searchParams.set('token', savedSecret);
      loginUrl.searchParams.set('email', email);
      loginUrl.searchParams.set('password_hash', hash);
      
      const loginRes = await fetch(loginUrl.toString(), { cache: 'no-cache' });
      const loginData = await loginRes.json();
      
      if (loginData.success && loginData.user) {
        localStorage.removeItem('wv_demo_mode');
        localStorage.setItem('wv_user', JSON.stringify(loginData.user));
        localStorage.setItem('wv_token', loginData.token || 'session-token');
        if (remember) localStorage.setItem('wv_remember', 'true');
        window.location.reload();
        return;
      }
    } catch(e) {
      // Fall back to client-side check
    }
    
    // Fallback: fetch all users and match (for older backends without login endpoint)
    const url = new URL(savedUrl);
    url.searchParams.set('path', 'users/list');
    url.searchParams.set('token', savedSecret);
    
    const res = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    
    const user = (data.rows || []).find(u => 
      u.email.toLowerCase() === email.toLowerCase() && 
      u.password_hash === hash &&
      String(u.active) === 'true'
    );
    
    if (!user) throw new Error('Invalid email or password');
    
    localStorage.removeItem('wv_demo_mode');
    localStorage.setItem('wv_user', JSON.stringify(user));
    localStorage.setItem('wv_token', remember ? 'persistent-token' : 'session-token');
    localStorage.setItem('wv_last_login', new Date().toISOString());
    
    window.location.reload();
  }
  
  window.toggleLoginPassword = function() {
    const inp = document.getElementById('login-password');
    const eye = document.getElementById('login-eye');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    eye.className = inp.type === 'password' ? 'fas fa-eye text-xs' : 'fas fa-eye-slash text-xs';
  };
  
  window.showForgotPassword = function() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      showToast('Enter your email first', 'warning');
      return;
    }
    // Trigger reset token
    const url = new URL(savedUrl);
    url.searchParams.set('path', 'users/reset-token');
    url.searchParams.set('token', savedSecret);
    url.searchParams.set('email', email);
    fetch(url.toString()).then(() => {
      showToast('If account exists, reset instructions sent', 'info');
    });
  };
  
  // SHA-256 helper
  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // ── Boot ───────────────────────────────────────────────────────
  checkStatus();
};
