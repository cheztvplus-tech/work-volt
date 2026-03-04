/**
 * ═════════════════════════════════════════════════════════════════
 *  WORK VOLT — auth.js
 *  Core authentication system with demo mode and admin initialization
 * ═════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
//  STATE & CONFIG
// ═══════════════════════════════════════════════════════════════════

let currentUser = null;
let currentToken = null;
let isConnected = false;
let isDemoMode = true;
let authState = {
  initialized: false,
  hasAdmins: false,
  needsProvisioning: false,
  sheetError: null,
};

// Demo mode fake admin
const DEMO_USER = {
  user_id: 'demo-001',
  email: 'demo@workvolt.local',
  name: 'Demo Mode',
  role: 'Admin',
  department: 'Demo',
  job_title: 'Demo Admin',
  phone: 'N/A',
  hourly_rate: 0,
  salary: 0,
  pay_type: 'salary',
  start_date: new Date().toISOString().split('T')[0],
  active: true,
  avatar_url: null,
  dashboard_layout: '[]',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  _isDemoMode: true,
};

// ═══════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Main boot sequence - called from index.html on load
 */
async function initAuth() {
  console.log('[AUTH] Initializing authentication system...');

  try {
    // Get API settings from localStorage
    const apiUrl = localStorage.getItem('wv_gas_url');
    const apiSecret = localStorage.getItem('wv_api_secret');

    if (!apiUrl || !apiSecret) {
      console.log('[AUTH] No Google Sheet connection found - entering demo mode');
      enterDemoMode();
      return;
    }

    // Try to connect to Google Sheet
    window.API_URL = apiUrl;
    window.API_SECRET_CLIENT = apiSecret;

    const status = await checkSheetConnection();

    if (!status.ok) {
      console.warn('[AUTH] Sheet connection failed:', status.message);
      enterDemoMode();
      return;
    }

    // Sheet is connected
    isConnected = true;
    isDemoMode = false;

    // Check if admins exist
    const usersData = await apiCall('users/list');
    const adminUsers = (usersData.users || []).filter(u => u.role === 'Admin' || u.role === 'SuperAdmin');

    if (adminUsers.length === 0) {
      console.log('[AUTH] No admin users found - showing provision form');
      authState.needsProvisioning = true;
      authState.hasAdmins = false;
      showAdminProvisionForm();
      return;
    }

    // Admins exist - show login form
    console.log('[AUTH] Admins found - showing login form');
    authState.hasAdmins = true;
    showLoginForm();

  } catch (error) {
    console.error('[AUTH] Fatal error during initialization:', error);
    enterDemoMode();
  }

  authState.initialized = true;
}

/**
 * Check if Google Sheet API is reachable
 */
async function checkSheetConnection() {
  try {
    const result = await apiCall('ping');
    return {
      ok: true,
      message: 'Connected to Google Sheet',
      version: result.version,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || 'Failed to connect to Google Sheet',
    };
  }
}

/**
 * Enter demo mode - bypass all auth, set demo user
 */
function enterDemoMode() {
  console.log('[AUTH] Entering demo mode');
  isDemoMode = true;
  isConnected = false;
  currentUser = { ...DEMO_USER };
  currentToken = 'demo-token-' + Date.now();

  // Store in session so it persists during demo
  sessionStorage.setItem('wv_demo_mode', 'true');
  sessionStorage.setItem('wv_current_user', JSON.stringify(currentUser));
  sessionStorage.setItem('wv_current_token', currentToken);

  authState.hasAdmins = false;
  authState.needsProvisioning = false;

  // Show app immediately with demo banner
  hideSplash();
  showApp();
  showDemoBanner();
}

/**
 * Show demo mode banner
 */
function showDemoBanner() {
  const banner = document.createElement('div');
  banner.id = 'demo-mode-banner';
  banner.className = 'fixed top-0 left-0 right-0 z-[999] bg-amber-500 text-white px-4 py-2.5 text-center font-medium text-sm';
  banner.innerHTML = `
    <div class="flex items-center justify-center gap-2">
      <i class="fas fa-flask-vial"></i>
      <span>Demo Mode Active — All data is sample only and not stored</span>
    </div>
  `;
  document.body.insertBefore(banner, document.body.firstChild);

  // Adjust body padding to account for banner
  document.body.style.paddingTop = '2.5rem';
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN FORM
// ═══════════════════════════════════════════════════════════════════

/**
 * Show login form overlay
 */
function showLoginForm() {
  const overlay = document.createElement('div');
  overlay.id = 'login-overlay';
  overlay.className = 'fixed inset-0 z-[1000] bg-slate-900/80 flex items-center justify-center';
  overlay.innerHTML = `
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <!-- Header -->
        <div class="text-center space-y-2">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full">
            <i class="fas fa-bolt text-blue-600 text-2xl"></i>
          </div>
          <h1 class="text-2xl font-bold text-slate-900">Work Volt</h1>
          <p class="text-slate-500 text-sm">Sign in to your account</p>
        </div>

        <!-- Form -->
        <form id="login-form" class="space-y-4">
          <div>
            <label for="login-email" class="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <input
              type="email"
              id="login-email"
              class="field w-full"
              placeholder="your@email.com"
              required
              autocomplete="email"
            />
          </div>
          <div>
            <label for="login-password" class="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <input
              type="password"
              id="login-password"
              class="field w-full"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          <!-- Error message -->
          <div id="login-error" class="hidden bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"></div>

          <!-- Submit button -->
          <button
            type="submit"
            id="login-submit"
            class="btn-primary w-full"
          >
            <i class="fas fa-sign-in-alt"></i>
            Sign In
          </button>
        </form>

        <!-- Demo mode fallback -->
        <div class="pt-4 border-t border-slate-200">
          <button
            type="button"
            onclick="enterDemoMode()"
            class="btn-secondary w-full"
          >
            <i class="fas fa-flask-vial"></i>
            Try Demo Mode
          </button>
          <p class="text-xs text-slate-500 text-center mt-2">Demo mode shows sample data with read-only access</p>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Attach form handler
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Focus email field
  setTimeout(() => document.getElementById('login-email').focus(), 100);
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  if (!email || !password) {
    showLoginError('Email and password are required');
    return;
  }

  // Disable button during request
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Signing in...';

  try {
    const result = await apiCall('users/login', { email, password });

    if (!result.user || !result.token) {
      showLoginError('Login failed - no user data returned');
      return;
    }

    // Success - set current user and token
    currentUser = result.user;
    currentToken = result.token;
    isConnected = true;
    isDemoMode = false;

    // Store in session
    sessionStorage.setItem('wv_current_user', JSON.stringify(currentUser));
    sessionStorage.setItem('wv_current_token', currentToken);
    sessionStorage.removeItem('wv_demo_mode');

    // Close overlay and show app
    document.getElementById('login-overlay').remove();
    hideSplash();
    showApp();

    showToast(`Welcome back, ${currentUser.name}!`, 'success');

  } catch (error) {
    showLoginError(error.message || 'Login failed. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  }
}

/**
 * Show login error message
 */
function showLoginError(message) {
  const errorEl = document.getElementById('login-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

// ═════════════════════════════════════════════════════════════════════
//  ADMIN PROVISION FORM (First-time setup)
// ═════════════════════════════════════════════════════════════════════

/**
 * Show admin provision form
 */
function showAdminProvisionForm() {
  const overlay = document.createElement('div');
  overlay.id = 'provision-overlay';
  overlay.className = 'fixed inset-0 z-[1000] bg-slate-900/80 flex items-center justify-center';
  overlay.innerHTML = `
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <!-- Header -->
        <div class="text-center space-y-2">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full">
            <i class="fas fa-shield-halved text-purple-600 text-2xl"></i>
          </div>
          <h1 class="text-2xl font-bold text-slate-900">Create Admin Account</h1>
          <p class="text-slate-600 text-sm">This is your first admin user. Set up your credentials now.</p>
        </div>

        <!-- Info banner -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <i class="fas fa-info-circle mr-2"></i>
          <span>Only one admin account will be created now. You can add more users after login.</span>
        </div>

        <!-- Form -->
        <form id="provision-form" class="space-y-4">
          <div>
            <label for="provision-name" class="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
            <input
              type="text"
              id="provision-name"
              class="field w-full"
              placeholder="Your name"
              required
            />
          </div>
          <div>
            <label for="provision-email" class="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <input
              type="email"
              id="provision-email"
              class="field w-full"
              placeholder="admin@company.com"
              required
              autocomplete="email"
            />
          </div>
          <div>
            <label for="provision-password" class="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <input
              type="password"
              id="provision-password"
              class="field w-full"
              placeholder="••••••••"
              required
              autocomplete="new-password"
              minlength="8"
            />
            <p class="text-xs text-slate-500 mt-1">At least 8 characters</p>
          </div>
          <div>
            <label for="provision-confirm" class="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
            <input
              type="password"
              id="provision-confirm"
              class="field w-full"
              placeholder="••••••••"
              required
              autocomplete="new-password"
            />
          </div>

          <!-- Error message -->
          <div id="provision-error" class="hidden bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"></div>

          <!-- Submit button -->
          <button
            type="submit"
            id="provision-submit"
            class="btn-primary w-full"
          >
            <i class="fas fa-user-plus"></i>
            Create Admin Account
          </button>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Attach form handler
  document.getElementById('provision-form').addEventListener('submit', handleProvision);

  // Focus name field
  setTimeout(() => document.getElementById('provision-name').focus(), 100);
}

/**
 * Handle admin provision form submission
 */
async function handleProvision(e) {
  e.preventDefault();

  const name = document.getElementById('provision-name').value.trim();
  const email = document.getElementById('provision-email').value.trim();
  const password = document.getElementById('provision-password').value;
  const confirm = document.getElementById('provision-confirm').value;
  const errorEl = document.getElementById('provision-error');
  const submitBtn = document.getElementById('provision-submit');

  // Validation
  if (!name || !email || !password) {
    showProvisionError('All fields are required');
    return;
  }

  if (password.length < 8) {
    showProvisionError('Password must be at least 8 characters');
    return;
  }

  if (password !== confirm) {
    showProvisionError('Passwords do not match');
    return;
  }

  // Disable button during request
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Creating...';

  try {
    const result = await apiCall('users/provision', {
      name,
      email,
      password,
    });

    if (!result.user || !result.token) {
      showProvisionError('Provision failed - no response');
      return;
    }

    // Success - set current user and token
    currentUser = result.user;
    currentToken = result.token;
    isConnected = true;
    isDemoMode = false;
    authState.hasAdmins = true;
    authState.needsProvisioning = false;

    // Store in session
    sessionStorage.setItem('wv_current_user', JSON.stringify(currentUser));
    sessionStorage.setItem('wv_current_token', currentToken);
    sessionStorage.removeItem('wv_demo_mode');

    // Close overlay and show app
    document.getElementById('provision-overlay').remove();
    hideSplash();
    showApp();

    showToast(`Welcome, ${currentUser.name}! Admin account created.`, 'success');

  } catch (error) {
    showProvisionError(error.message || 'Failed to create admin account. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Admin Account';
  }
}

/**
 * Show provision error message
 */
function showProvisionError(message) {
  const errorEl = document.getElementById('provision-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

// ═════════════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═════════════════════════════════════════════════════════════════════

/**
 * Logout current user
 */
function logout() {
  currentUser = null;
  currentToken = null;
  isDemoMode = false;
  isConnected = false;

  // Clear session
  sessionStorage.removeItem('wv_current_user');
  sessionStorage.removeItem('wv_current_token');
  sessionStorage.removeItem('wv_demo_mode');

  // Reload page to show login form again
  location.reload();
}

/**
 * Get current user
 */
function getUser() {
  return currentUser;
}

/**
 * Get current token
 */
function getToken() {
  return currentToken;
}

/**
 * Check if currently in demo mode
 */
function inDemoMode() {
  return isDemoMode;
}

/**
 * Check if connected to Google Sheet
 */
function isSheetConnected() {
  return isConnected;
}

// ═════════════════════════════════════════════════════════════════════
//  API HELPER (minimal - full apiCall in index.html)
// ═════════════════════════════════════════════════════════════════════

/**
 * Simple API call for auth-related requests
 */
async function apiCall(path, params = {}) {
  // Demo mode - return demo responses
  if (isDemoMode) {
    return handleDemoApiCall(path, params);
  }

  // Real API call
  if (!window.API_URL || !window.API_SECRET_CLIENT) {
    throw new Error('API not configured');
  }

  const url = new URL(window.API_URL);
  url.searchParams.set('path', path);
  url.searchParams.set('token', window.API_SECRET_CLIENT);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), { cache: 'no-cache' });
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Handle demo mode API calls
 */
function handleDemoApiCall(path, params) {
  if (path === 'ping') {
    return { status: 'ok', version: '1.0.0-demo' };
  }

  if (path === 'users/login') {
    // Demo login - accept any credentials
    return {
      user: { ...DEMO_USER, email: params.email },
      token: 'demo-token-' + Date.now(),
    };
  }

  if (path === 'users/list') {
    return { users: [] };
  }

  if (path === 'users/provision') {
    return {
      user: {
        user_id: 'admin-001',
        email: params.email,
        name: params.name,
        role: 'Admin',
        department: 'Management',
        job_title: 'System Admin',
        phone: '',
        hourly_rate: 0,
        salary: 0,
        pay_type: 'salary',
        start_date: new Date().toISOString().split('T')[0],
        active: true,
        avatar_url: null,
        dashboard_layout: '[]',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      token: 'auth-token-' + Date.now(),
    };
  }

  return {};
}

// ═════════════════════════════════════════════════════════════════════
//  RESTORE SESSION ON PAGE RELOAD
// ═════════════════════════════════════════════════════════════════════

/**
 * Restore user session from sessionStorage if available
 */
function restoreSession() {
  const demoMode = sessionStorage.getItem('wv_demo_mode');
  const savedUser = sessionStorage.getItem('wv_current_user');
  const savedToken = sessionStorage.getItem('wv_current_token');

  if (demoMode === 'true') {
    isDemoMode = true;
    currentUser = { ...DEMO_USER };
    currentToken = savedToken || 'demo-token';
    return;
  }

  if (savedUser && savedToken) {
    try {
      currentUser = JSON.parse(savedUser);
      currentToken = savedToken;
      isConnected = true;
      isDemoMode = false;
      return;
    } catch (e) {
      console.error('[AUTH] Failed to restore session:', e);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
//  EXPORT GLOBALS
// ═════════════════════════════════════════════════════════════════════

window.Auth = {
  init: initAuth,
  logout,
  getUser,
  getToken,
  inDemoMode,
  isSheetConnected,
  restoreSession,
};
