window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['settings'] = function(container) {

  // ── State ──────────────────────────────────────────────────────
  let savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  let activeTab   = 'connection';
  let usersCache  = [];
  let editingUser = null;
  
  // Get modules from parent window if available
  let modulesCache = [];
  try {
    if (window.parent && window.parent !== window && window.parent.INSTALLED_MODULES) {
      modulesCache = window.parent.INSTALLED_MODULES;
    } else if (window.INSTALLED_MODULES) {
      modulesCache = window.INSTALLED_MODULES;
    }
  } catch(e) {
    modulesCache = [];
  }
  
  // Get session from parent window (main.html)
  function getSessionId() {
    // Try parent window first (main.html has the session)
    try {
      if (window.parent && window.parent !== window && window.parent.WorkVolt) {
        const parentSession = window.parent.WorkVolt.session();
        if (parentSession) return parentSession;
      }
    } catch(e) {}
    
    // Fallback to sessionStorage
    return sessionStorage.getItem('wv_session') || '';
  }
  
  // Get API URL from parent
  function getApiUrl() {
    try {
      if (window.parent && window.parent !== window && window.parent.API_URL) {
        return window.parent.API_URL;
      }
    } catch(e) {}
    return savedUrl;
  }

  // ── API Helper ─────────────────────────────────────────────────
  async function api(path, params) {
    const url = new URL(getApiUrl());
    url.searchParams.set('path', path);
    
    // Session-based authentication (from parent window)
    const sessionId = getSessionId();
    if (sessionId) {
      url.searchParams.set('session_id', sessionId);
      console.log('API call with session:', path);
    } else {
      console.warn('No session for API call:', path);
    }
    
    if (params) {
      Object.entries(params).forEach(function(kv) {
        if (kv[1] !== undefined && kv[1] !== null && kv[1] !== '') {
          url.searchParams.set(kv[0], kv[1]);
        }
      });
    }
    
    const res  = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ... rest of your settings.js code remains the same ...
  // (Keep all your existing functions: renderProvision, renderStatus, roleBadge, 
  // activeBadge, setModalContent, setFormStatus, render, renderConnectionTab, 
  // renderUsersTab, renderUsersTable, renderUserForm, renderResetModal, 
  // renderDeleteModal, escMgrName, settingsManagerSearch, settingsSelectManager,
  // loadUsers, usersBackdropClick, usersOpenAdd, usersOpenEdit, usersCloseModal,
  // usersSubmitForm, usersResetPassword, usersSubmitReset, usersToggleActive,
  // usersConfirmDelete, usersSubmitDelete, renderAdminConfigTab, loadAdminConfig,
  // saveAdminConfig, renderModulesTab, setModuleStatus, loadModules, renderModuleLists,
  // modulesInstall, modulesEditRoles, modulesUninstall, settingsTab, toggleSecretVis,
  // toggleHowTo, settingsSave, settingsTestConnection, settingsDisconnect, etc.)

  // Just make sure all api() calls in your existing code will use the updated
  // api() function above that includes session_id automatically
  
  // ── Boot ──────────────────────────────────────────────────────
  render();
};
