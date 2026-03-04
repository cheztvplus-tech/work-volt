window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['login'] = function(container) {
  
  let savedUrl = localStorage.getItem('wv_gas_url') || '';
  let savedSecret = localStorage.getItem('wv_api_secret') || '';
  let setupCode = '';
  
  // Fetch setup code from config
  async function loadSetupCode() {
    if (!savedUrl || !savedSecret) return;
    try {
      const url = new URL(savedUrl);
      url.searchParams.set('path', 'config/get-all');
      url.searchParams.set('token', savedSecret);
      const res = await fetch(url.toString(), { cache: 'no-cache' });
      const data = await res.json();
      setupCode = (data.settings && data.settings.setup_code) || '';
    } catch (e) {
      setupCode = '';
    }
  }
  
  async function checkFirstTimeSetup() {
    await loadSetupCode();
    
    if (!savedUrl || !savedSecret) {
      renderNoConnection();
      return;
    }
    
    try {
      const url = new URL(savedUrl);
      url.searchParams.set('path', 'users/list');
      url.searchParams.set('token', savedSecret);
      
      const res = await fetch(url.toString(), { cache: 'no-cache' });
      const data = await res.json();
      const users = data.rows || [];
      
      const hasAdmin = users.some(u => u.role === 'SuperAdmin' || u.role === 'Admin');
      
      if (hasAdmin) {
        renderLogin(users);
      } else {
        renderFirstTimeSetup();
      }
    } catch (e) {
      renderNoConnection();
    }
  }
  
  function renderNoConnection() {
    container.innerHTML = `
      <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div class="max-w-md w-full text-center">
          <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-bolt text-white text-3xl"></i>
          </div>
          <h1 class="text-2xl font-bold text-slate-900 mb-2">Work Volt</h1>
          <p class="text-slate-500 mb-6">No Google Sheet connected</p>
          <button onclick="goToSettings()" class="btn-primary w-full">
            <i class="fas fa-plug mr-2"></i>Connect Google Sheet
          </button>
        </div>
      </div>
    `;
  }
  
  function renderFirstTimeSetup() {
    const showCodeField = setupCode ? '' : 'hidden';
    
    container.innerHTML = `
      <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-white rounded-2xl shadow-lg p-6">
          <div class="text-center mb-6">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i class="fas fa-seedling text-green-600 text-xl"></i>
            </div>
            <h2 class="text-xl font-bold text-slate-900">First Time Setup</h2>
            <p class="text-sm text-slate-500 mt-1">Create your admin account</p>
          </div>
          
          <div id="setup-error" class="hidden mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          
          <div class="space-y-4">
            <div class="${showCodeField}">
              <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Setup Access Code</label>
              <input id="wv-code" type="password" placeholder="Enter setup code" class="field text-sm">
              <p class="text-xs text-slate-400 mt-1">Required for first setup</p>
            </div>
            
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Email</label>
              <input id="admin-email" type="email" value="admin@workvolt.app" class="field text-sm">
            </div>
            
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Admin Name</label>
              <input id="admin-name" type="text" placeholder="Full Name" class="field text-sm">
            </div>
            
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
              <input id="admin-pass" type="password" placeholder="Create password" class="field text-sm">
            </div>
          </div>
          
          <button onclick="createFirstAdmin()" id="setup-btn" class="btn-primary w-full mt-6">
            <i class="fas fa-user-plus mr-2"></i>Create Admin Account
          </button>
        </div>
      </div>
    `;
  }
  
  function renderLogin(users) {
    const savedUser = localStorage.getItem('wv_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        const stillExists = users.some(u => u.user_id === user.user_id && u.active === 'true');
        if (stillExists) {
          window.location.hash = 'dashboard';
          return;
        }
      } catch (e) {}
    }
    
    container.innerHTML = `
      <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-white rounded-2xl shadow-lg p-6">
          <div class="text-center mb-6">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <i class="fas fa-lock text-blue-600 text-xl"></i>
            </div>
            <h2 class="text-xl font-bold text-slate-900">Sign In</h2>
            <p class="text-sm text-slate-500 mt-1">Work Volt Workspace</p>
          </div>
          
          <div id="login-error" class="hidden mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg"></div>
          
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Email</label>
              <input id="login-email" type="email" placeholder="you@company.com" class="field text-sm">
            </div>
            
            <div>
              <label class="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
              <input id="login-pass" type="password" placeholder="Enter password" class="field text-sm">
            </div>
          </div>
          
          <button onclick="doLogin()" id="login-btn" class="btn-primary w-full mt-6">
            <i class="fas fa-sign-in-alt mr-2"></i>Sign In
          </button>
          
          <div class="mt-4 text-center">
            <button onclick="goToSettings()" class="text-xs text-slate-400 hover:text-slate-600">
              Reconnect Google Sheet
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  window.goToSettings = function() {
    sessionStorage.setItem('lastModule', 'settings');
    window.location.hash = 'settings';
    if (window.showModule) window.showModule('settings');
  };
  
  window.createFirstAdmin = async function() {
    const btn = document.getElementById('setup-btn');
    const error = document.getElementById('setup-error');
    const code = setupCode ? (document.getElementById('wv-code')?.value || '') : '';
    const email = document.getElementById('admin-email').value.trim();
    const name = document.getElementById('admin-name').value.trim();
    const password = document.getElementById('admin-pass').value;
    
    if (setupCode && code !== setupCode) {
      error.textContent = 'Invalid setup code';
      error.classList.remove('hidden');
      return;
    }
    
    if (!email || !password || !name) {
      error.textContent = 'Please fill in all fields';
      error.classList.remove('hidden');
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Creating...';
    
    try {
      const url = new URL(savedUrl);
      url.searchParams.set('path', 'users/create');
      url.searchParams.set('token', savedSecret);
      url.searchParams.set('email', email);
      url.searchParams.set('password', password);
      url.searchParams.set('role', 'Admin');
      url.searchParams.set('name', name);
      
      const res = await fetch(url.toString(), { cache: 'no-cache' });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      await doLoginWithCreds(email, password);
      
    } catch (e) {
      error.textContent = e.message;
      error.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus mr-2"></i>Create Admin Account';
    }
  };
  
  window.doLogin = async function() {
    const btn = document.getElementById('login-btn');
    const error = document.getElementById('login-error');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    
    if (!email || !password) {
      error.textContent = 'Please enter email and password';
      error.classList.remove('hidden');
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Signing in...';
    
    try {
      await doLoginWithCreds(email, password);
    } catch (e) {
      error.textContent = e.message;
      error.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Sign In';
    }
  };
  
  async function doLoginWithCreds(email, password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    try {
      const loginUrl = new URL(savedUrl);
      loginUrl.searchParams.set('path', 'users/login');
      loginUrl.searchParams.set('token', savedSecret);
      loginUrl.searchParams.set('email', email);
      loginUrl.searchParams.set('password_hash', hashHex);
      
      const res = await fetch(loginUrl.toString(), { cache: 'no-cache' });
      const data = await res.json();
      
      if (data.success && data.user) {
        localStorage.setItem('wv_user', JSON.stringify(data.user));
        localStorage.setItem('wv_token', data.token || 'token');
        window.location.reload();
        return;
      }
    } catch (e) {}
    
    const url = new URL(savedUrl);
    url.searchParams.set('path', 'users/list');
    url.searchParams.set('token', savedSecret);
    
    const res = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    
    const user = (data.rows || []).find(u => 
      u.email && u.email.toLowerCase() === email.toLowerCase() && 
      u.password_hash === hashHex &&
      u.active === 'true'
    );
    
    if (!user) throw new Error('Invalid email or password');
    
    localStorage.setItem('wv_user', JSON.stringify(user));
    localStorage.setItem('wv_token', 'session-token');
    window.location.reload();
  }
  
  checkFirstTimeSetup();
};
