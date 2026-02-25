window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['settings'] = function(container) {

  // Load saved values
  let savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  let savedSecret = localStorage.getItem('wv_api_secret') || '';

  // Sync to global API_URL so apiCall() works immediately after save
  if (savedUrl)    window.API_URL = savedUrl;
  if (savedSecret) window.API_SECRET_CLIENT = savedSecret;

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

  function render(status) {
    const isConnected = !!(savedUrl && savedSecret);
    container.innerHTML = `
      <div class="min-h-full bg-slate-50">

        <!-- Header -->
        <div class="bg-white border-b border-slate-200 px-6 md:px-10 py-6">
          <h1 class="text-xl font-extrabold text-slate-900">Settings</h1>
          <p class="text-slate-500 text-sm mt-1">Configure your Work Volt workspace</p>
        </div>

        <div class="max-w-2xl mx-auto px-6 md:px-10 py-8 space-y-6">

          <!-- Connection card -->
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
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                  GAS Web App URL
                </label>
                <input id="settings-gas-url" type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value="${savedUrl}"
                  class="field font-mono text-xs">
                <p class="text-xs text-slate-400 mt-1.5">
                  Deploy your <code class="bg-slate-100 px-1 rounded">Code.gs</code> as a Web App and paste the URL here.
                </p>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                  API Secret
                </label>
                <div class="relative">
                  <input id="settings-secret" type="password"
                    placeholder="Your API_SECRET from Code.gs"
                    value="${savedSecret}"
                    class="field font-mono text-xs pr-10">
                  <button onclick="toggleSecretVis()" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <i id="secret-eye" class="fas fa-eye text-sm"></i>
                  </button>
                </div>
                <p class="text-xs text-slate-400 mt-1.5">
                  Must match <code class="bg-slate-100 px-1 rounded">API_SECRET</code> in your <code class="bg-slate-100 px-1 rounded">Code.gs</code>.
                </p>
              </div>

              <div class="flex gap-3 pt-1">
                <button onclick="settingsTestConnection()"
                  id="settings-test-btn"
                  class="btn-secondary flex-1">
                  <i class="fas fa-vial text-sm"></i> Test Connection
                </button>
                <button onclick="settingsSave()"
                  id="settings-save-btn"
                  class="btn-primary flex-1">
                  <i class="fas fa-save text-sm"></i> Save
                </button>
              </div>

            </div>
          </div>

          <!-- How to deploy card -->
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button onclick="toggleHowTo()" class="w-full px-6 py-4 flex items-center justify-between text-left">
              <h2 class="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <i class="fas fa-book text-slate-400 text-sm"></i>
                How to deploy your GAS backend
              </h2>
              <i id="howto-chevron" class="fas fa-chevron-down text-slate-400 text-xs transition-transform"></i>
            </button>
            <div id="howto-body" class="hidden px-6 pb-5 space-y-3 border-t border-slate-100 pt-4">
              ${[
                ['1', 'Go to <strong>script.google.com</strong> → New Project'],
                ['2', 'Create a new Google Sheet → copy the Sheet ID from its URL'],
                ['3', 'Paste all your <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">.gs</code> files into the Apps Script editor (one file each)'],
                ['4', 'Set <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">MASTER_SHEET_ID</code> and <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">API_SECRET</code> in <strong>Code.gs</strong>'],
                ['5', 'Click <strong>Deploy → New Deployment</strong>'],
                ['6', 'Type: <strong>Web App</strong> · Execute as: <strong>Me</strong> · Access: <strong>Anyone</strong>'],
                ['7', 'Copy the Web App URL → paste it above'],
                ['8', 'Paste your <code class="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 font-mono text-xs">API_SECRET</code> value above → Save'],
              ].map(([n, t]) => `
                <div class="flex gap-3">
                  <span class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">${n}</span>
                  <p class="text-sm text-slate-600 pt-0.5">${t}</p>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Danger zone -->
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
      </div>
    `;
  }

  // ── Actions ────────────────────────────────────────────────────
  window.toggleSecretVis = () => {
    const inp = document.getElementById('settings-secret');
    const eye = document.getElementById('secret-eye');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    eye.className = inp.type === 'password' ? 'fas fa-eye text-sm' : 'fas fa-eye-slash text-sm';
  };

  window.toggleHowTo = () => {
    const body = document.getElementById('howto-body');
    const chev = document.getElementById('howto-chevron');
    body.classList.toggle('hidden');
    chev.style.transform = body.classList.contains('hidden') ? '' : 'rotate(180deg)';
  };

  window.settingsSave = () => {
    const url    = document.getElementById('settings-gas-url').value.trim();
    const secret = document.getElementById('settings-secret').value.trim();
    if (!url)    return window.WorkVolt?.toast('Please enter the GAS URL', 'warning');
    if (!secret) return window.WorkVolt?.toast('Please enter the API Secret', 'warning');
    localStorage.setItem('wv_gas_url',    url);
    localStorage.setItem('wv_api_secret', secret);
    savedUrl    = url;
    savedSecret = secret;
    // Update global API_URL so apiCall() picks it up immediately
    window.API_URL = url;
    window.API_SECRET_CLIENT = secret;
    render({ ok: true, message: 'Settings saved. Testing connection…' });
    setTimeout(() => window.settingsTestConnection(), 400);
  };

  window.settingsTestConnection = async () => {
    const url    = document.getElementById('settings-gas-url')?.value.trim() || savedUrl;
    const secret = document.getElementById('settings-secret')?.value.trim()  || savedSecret;
    const btn    = document.getElementById('settings-test-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin text-sm"></i> Testing…'; }
    try {
      // Step 1 — ping
      const pingUrl = new URL(url);
      pingUrl.searchParams.set('path', 'ping');
      const pingRes  = await fetch(pingUrl.toString(), { cache: 'no-cache' });
      const pingData = await pingRes.json();
      if (pingData.status !== 'ok') throw new Error('Unexpected response from server');

      // Step 2 — provision USERS sheet (safe to call multiple times)
      const provUrl = new URL(url);
      provUrl.searchParams.set('path',  'setup/provision');
      provUrl.searchParams.set('token', secret);
      const provRes  = await fetch(provUrl.toString(), { cache: 'no-cache' });
      const provData = await provRes.json();

      if (provData.error) throw new Error(provData.error);

      if (provData.provisioned) {
        // First time — show temp password prominently
        render({
          ok: true,
          message: '✓ Connected! USERS sheet created.',
          provision: provData,
        });
      } else {
        // Already provisioned
        render({ ok: true, message: '✓ Connected successfully! Work Volt is linked to your Google Sheet.' });
      }

    } catch(e) {
      render({ ok: false, message: 'Connection failed: ' + e.message + '. Check the URL and try again.' });
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-vial text-sm"></i> Test Connection'; }
    }
  };

  window.settingsDisconnect = () => {
    localStorage.removeItem('wv_gas_url');
    localStorage.removeItem('wv_api_secret');
    savedUrl    = '';
    savedSecret = '';
    window.API_URL = '';
    render({ ok: false, message: 'Disconnected. Enter a new GAS URL to reconnect.' });
  };

  // ── Boot: load saved URL into global API_URL ──────────────────
  if (savedUrl) {
    window.API_URL = savedUrl;
    // Also patch the apiCall to use saved secret as token
    window.API_SECRET_CLIENT = savedSecret;
  }

  render();
};
