// ================================================================
//  WORK VOLT — pages/crm.js
//  Full CRM module: Contacts, Leads, Deals Pipeline, Activities
// ================================================================
window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['crm'] = function(container) {

  // ── Credentials (same pattern as projects.js) ──────────────────
  var savedUrl    = localStorage.getItem('wv_gas_url')    || '';
  var savedSecret = localStorage.getItem('wv_api_secret') || '';
  var myId        = (function() { try { return window.WorkVolt.user().user_id || ''; } catch(e) { return ''; } })();

  // ── API helper (same pattern as projects.js) ───────────────────
  function api(path, params) {
    if (!savedUrl || !savedSecret) return Promise.reject(new Error('Google Sheet not connected'));
    var url = new URL(savedUrl);
    url.searchParams.set('path',  path);
    url.searchParams.set('token', savedSecret);
    if (params) Object.keys(params).forEach(function(k) {
      if (params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
        url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { cache: 'no-cache' })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.error) throw new Error(d.error); return d; });
  }

  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }

  // ── State ──────────────────────────────────────────────────────
  var state = {
    tab:            'dashboard',
    contacts:       [],
    leads:          [],
    deals:          [],
    stages:         [],
    activities:     [],
    dashboard:      {},
    loading:        false,
    search:         '',
    filterStatus:   '',
    filterStage:    '',
    modalType:      null,
    editRecord:     null,
    contactDetail:  null,
    dealDetail:     null,
    stageForNewDeal: null,
    dragDealId:     null,
    dragFromStage:  null,
  };

  var PILL = {
    'Lead':       'bg-blue-100 text-blue-700',
    'Prospect':   'bg-indigo-100 text-indigo-700',
    'Customer':   'bg-green-100 text-green-700',
    'Churned':    'bg-red-100 text-red-700',
    'Partner':    'bg-purple-100 text-purple-700',
    'New':        'bg-slate-100 text-slate-600',
    'Contacted':  'bg-blue-100 text-blue-700',
    'Qualified':  'bg-indigo-100 text-indigo-700',
    'Proposal':   'bg-amber-100 text-amber-700',
    'Negotiation':'bg-orange-100 text-orange-700',
    'Won':        'bg-green-100 text-green-700',
    'Lost':       'bg-red-100 text-red-700',
  };

  function scoreColor(s) {
    s = parseFloat(s || 0);
    if (s >= 70) return 'text-green-600';
    if (s >= 40) return 'text-amber-500';
    return 'text-slate-400';
  }

  function fmt$(v) { return '$' + (parseFloat(v)||0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d)) return String(iso).substring(0, 10);
      var diff = Date.now() - d.getTime();
      if (diff < 60000)     return 'just now';
      if (diff < 3600000)   return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000)  return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch(e) { return String(iso).substring(0, 10); }
  }

  // ── Load data ──────────────────────────────────────────────────
  function loadAll() {
    state.loading = true;
    render();
    Promise.all([
      api('crm/dashboard').catch(function() { return {}; }),
      api('crm/contacts/list').catch(function() { return { rows: [] }; }),
      api('crm/leads/list', { converted: 'false' }).catch(function() { return { rows: [] }; }),
      api('crm/deals/list').catch(function() { return { rows: [] }; }),
      api('crm/stages/list').catch(function() { return { rows: [] }; }),
      api('crm/activities/list', { limit: '50' }).catch(function() { return { rows: [] }; }),
    ]).then(function(results) {
      state.dashboard  = results[0] || {};
      state.contacts   = results[1].rows || [];
      state.leads      = results[2].rows || [];
      state.deals      = results[3].rows || [];
      state.stages     = (results[4].rows && results[4].rows.length) ? results[4].rows : defaultStages();
      state.activities = results[5].rows || [];
      state.loading    = false;
      render();
    }).catch(function() {
      state.loading = false;
      state.stages = defaultStages();
      render();
    });
  }

  function defaultStages() {
    return [
      { id:'s1', name:'New',           order:'1', color:'#94a3b8', probability:'10' },
      { id:'s2', name:'Qualified',     order:'2', color:'#3b82f6', probability:'30' },
      { id:'s3', name:'Proposal Sent', order:'3', color:'#f59e0b', probability:'50' },
      { id:'s4', name:'Negotiation',   order:'4', color:'#f97316', probability:'70' },
      { id:'s5', name:'Won',           order:'5', color:'#10b981', probability:'100'},
      { id:'s6', name:'Lost',          order:'6', color:'#ef4444', probability:'0'  },
    ];
  }

  // ── Render ─────────────────────────────────────────────────────
  function render() {
    attachStyles();
    container.innerHTML =
      '<div class="flex flex-col bg-slate-50" style="min-height:100%">' +

        '<div class="bg-white border-b border-slate-200 px-6 py-4">' +
          '<div class="flex items-center justify-between flex-wrap gap-3">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">' +
                '<i class="fas fa-address-book text-white text-sm"></i>' +
              '</div>' +
              '<div>' +
                '<h1 class="text-lg font-bold text-slate-800">CRM</h1>' +
                '<p class="text-xs text-slate-400">Contacts · Leads · Pipeline · Activities</p>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              (state.tab === 'contacts'   ? '<button id="crm-add-btn" class="crm-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Add Contact</button>'  : '') +
              (state.tab === 'leads'      ? '<button id="crm-add-btn" class="crm-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Add Lead</button>'     : '') +
              (state.tab === 'pipeline'   ? '<button id="crm-add-btn" class="crm-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Add Deal</button>'     : '') +
              (state.tab === 'activities' ? '<button id="crm-add-btn" class="crm-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>Log Activity</button>' : '') +
              '<button id="crm-refresh-btn" class="crm-btn-ghost text-sm" title="Refresh"><i class="fas fa-sync-alt' + (state.loading ? ' fa-spin' : '') + '"></i></button>' +
            '</div>' +
          '</div>' +

          '<div class="flex gap-1 mt-4">' +
            ['dashboard','contacts','leads','pipeline','activities'].map(function(t) {
              var icons = { dashboard:'fa-th-large', contacts:'fa-users', leads:'fa-bolt', pipeline:'fa-columns', activities:'fa-history' };
              var active = state.tab === t;
              return '<button class="crm-tab ' + (active ? 'crm-tab-active' : 'crm-tab-inactive') + '" data-tab="' + t + '">' +
                '<i class="fas ' + icons[t] + ' mr-1.5"></i>' + t.charAt(0).toUpperCase() + t.slice(1) +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="flex-1 overflow-y-auto p-6">' +
          (state.loading ? renderLoading() :
           state.tab === 'dashboard'  ? renderDashboard()  :
           state.tab === 'contacts'   ? renderContacts()   :
           state.tab === 'leads'      ? renderLeads()      :
           state.tab === 'pipeline'   ? renderPipeline()   :
           renderActivities()) +
        '</div>' +

      '</div>' +
      (state.modalType ? renderModal() : '');

    bindEvents();
  }

  // ── Bind events ────────────────────────────────────────────────
  function bindEvents() {
    // Tabs
    container.querySelectorAll('.crm-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.tab = btn.dataset.tab;
        state.search = ''; state.filterStatus = ''; state.filterStage = '';
        render();
      });
    });

    // Add button
    var addBtn = container.querySelector('#crm-add-btn');
    if (addBtn) addBtn.addEventListener('click', function() {
      var map = { contacts:'add-contact', leads:'add-lead', pipeline:'add-deal', activities:'add-activity' };
      state.modalType = map[state.tab] || null;
      state.editRecord = null; state.stageForNewDeal = null;
      render();
    });

    // Refresh
    var refBtn = container.querySelector('#crm-refresh-btn');
    if (refBtn) refBtn.addEventListener('click', loadAll);

    // Search input
    var searchEl = container.querySelector('.crm-search');
    if (searchEl) searchEl.addEventListener('input', function() { state.search = this.value; render(); });

    // Filters
    var statusSel = container.querySelector('.crm-filter-status');
    if (statusSel) statusSel.addEventListener('change', function() { state.filterStatus = this.value; render(); });
    var stageSel = container.querySelector('.crm-filter-stage');
    if (stageSel) stageSel.addEventListener('change', function() { state.filterStage = this.value; render(); });

    // Contact row → view
    container.querySelectorAll('.crm-contact-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var c = state.contacts.find(function(x) { return x.id === row.dataset.id; });
        if (c) { state.contactDetail = c; state.modalType = 'view-contact'; render(); }
      });
    });

    // Edit contact
    container.querySelectorAll('.crm-edit-contact').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var c = state.contacts.find(function(x) { return x.id === btn.dataset.id; });
        if (c) { state.editRecord = c; state.modalType = 'edit-contact'; render(); }
      });
    });

    // Delete contact
    container.querySelectorAll('.crm-delete-contact').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!confirm('Delete this contact?')) return;
        api('crm/contacts/delete', { id: btn.dataset.id })
          .then(function() {
            state.contacts = state.contacts.filter(function(c) { return c.id !== btn.dataset.id; });
            toast('Contact deleted', 'success'); render();
          }).catch(function(err) { toast(err.message, 'error'); });
      });
    });

    // Convert lead
    container.querySelectorAll('.crm-convert-lead').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Convert this lead to a Contact + Deal?')) return;
        api('crm/leads/convert', { id: btn.dataset.id, converted_by: myId })
          .then(function() { toast('Lead converted!', 'success'); loadAll(); })
          .catch(function(err) { toast(err.message, 'error'); });
      });
    });

    // Delete lead
    container.querySelectorAll('.crm-delete-lead').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Delete this lead?')) return;
        api('crm/leads/delete', { id: btn.dataset.id })
          .then(function() {
            state.leads = state.leads.filter(function(l) { return l.id !== btn.dataset.id; });
            toast('Lead deleted', 'success'); render();
          }).catch(function(err) { toast(err.message, 'error'); });
      });
    });

    // Inline lead stage change
    container.querySelectorAll('.crm-lead-stage-select').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var id = sel.dataset.id;
        var newStage = sel.value;
        // Optimistic update in state
        var lead = state.leads.find(function(l) { return l.id === id; });
        if (lead) lead.stage = newStage;
        api('crm/leads/update', { id: id, stage: newStage })
          .then(function() { toast('Stage updated', 'success'); })
          .catch(function(err) {
            toast('Failed to update stage: ' + err.message, 'error');
            loadAll(); // revert on failure
          });
      });
    });

    // Deal card → view
    container.querySelectorAll('.crm-deal-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var d = state.deals.find(function(x) { return x.id === card.dataset.id; });
        if (d) { state.dealDetail = d; state.modalType = 'view-deal'; render(); }
      });
    });

    // Add deal to stage
    container.querySelectorAll('.crm-add-deal-stage').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.stageForNewDeal = btn.dataset.stage;
        state.modalType = 'add-deal'; state.editRecord = null; render();
      });
    });

    // Delete deal (from view modal)
    var delDealBtn = container.querySelector('#crm-delete-deal-btn');
    if (delDealBtn) delDealBtn.addEventListener('click', function() {
      if (!confirm('Delete this deal?')) return;
      var id = delDealBtn.dataset.id;
      api('crm/deals/delete', { id: id }).then(function() {
        state.deals = state.deals.filter(function(d) { return d.id !== id; });
        state.modalType = null; state.dealDetail = null;
        toast('Deal deleted', 'success'); render();
      }).catch(function(err) { toast(err.message, 'error'); });
    });

    // Dashboard quick-nav
    container.querySelectorAll('.crm-quicknav').forEach(function(btn) {
      btn.addEventListener('click', function() { state.tab = btn.dataset.tab; render(); });
    });

    // Drag & drop
    container.querySelectorAll('.crm-deal-card').forEach(function(card) {
      card.addEventListener('dragstart', function(e) {
        state.dragDealId    = card.dataset.id;
        state.dragFromStage = card.dataset.stage;
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', function() {
        container.querySelectorAll('.crm-drop-zone').forEach(function(z) { z.classList.add('hidden'); });
      });
    });

    container.querySelectorAll('.crm-stage-col').forEach(function(col) {
      col.addEventListener('dragover', function(e) {
        e.preventDefault();
        var zone = col.querySelector('.crm-drop-zone');
        if (zone) zone.classList.remove('hidden');
      });
      col.addEventListener('dragleave', function(e) {
        if (!col.contains(e.relatedTarget)) {
          var zone = col.querySelector('.crm-drop-zone');
          if (zone) zone.classList.add('hidden');
        }
      });
      col.addEventListener('drop', function(e) {
        e.preventDefault();
        var zone = col.querySelector('.crm-drop-zone');
        if (zone) zone.classList.add('hidden');
        var toStage = col.dataset.stage;
        if (!state.dragDealId || state.dragFromStage === toStage) return;
        var deal = state.deals.find(function(d) { return d.id === state.dragDealId; });
        if (!deal) return;
        deal.stage = toStage;
        var stageObj = state.stages.find(function(s) { return s.name === toStage; });
        if (stageObj) deal.probability = stageObj.probability;
        var dId = state.dragDealId;
        state.dragDealId = null; state.dragFromStage = null;
        render();
        api('crm/deals/update', { id: dId, stage: toStage, updated_by: myId })
          .catch(function(err) { toast('Stage update failed: ' + err.message, 'error'); });
      });
    });

    // Modal backdrop close
    var backdrop = container.querySelector('#crm-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) {
        state.modalType = null; state.editRecord = null;
        state.contactDetail = null; state.dealDetail = null;
        render();
      }
    });

    // Modal close X
    var closeBtn = container.querySelector('#crm-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function() {
      state.modalType = null; state.editRecord = null;
      state.contactDetail = null; state.dealDetail = null;
      render();
    });

    // Modal cancel
    var cancelBtn = container.querySelector('#crm-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function() {
      state.modalType = null; state.editRecord = null; render();
    });

    // Lead modal: contact link auto-fill + dupe warning
    var contactLink = container.querySelector('#crm-lead-contact-link');
    if (contactLink) {
      contactLink.addEventListener('change', function() {
        var sel = contactLink.options[contactLink.selectedIndex];
        if (!sel || !sel.value) return;
        var fields = ['email','phone','company','job_title'];
        fields.forEach(function(f) {
          var inp = container.querySelector('#crm-lead-' + f);
          if (inp && sel.dataset[f]) inp.value = sel.dataset[f];
        });
        // Also fill name from option text (strip company/email suffix)
        var nameInp = container.querySelector('#crm-lead-name');
        if (nameInp) {
          var c = state.contacts.find(function(x) { return x.id === sel.value; });
          if (c) nameInp.value = c.name;
        }
        container.querySelector('#crm-lead-dupe-warn').classList.add('hidden');
      });
    }
    // Dupe warning on email blur
    var leadEmailInp = container.querySelector('#crm-lead-email');
    if (leadEmailInp) {
      leadEmailInp.addEventListener('blur', function() {
        var val = leadEmailInp.value.trim().toLowerCase();
        if (!val) return;
        var linked = container.querySelector('#crm-lead-contact-link');
        if (linked && linked.value) return; // already linked, no warning needed
        var exists = state.contacts.find(function(c) { return c.email && c.email.toLowerCase() === val; });
        var warn = container.querySelector('#crm-lead-dupe-warn');
        if (warn) warn.classList.toggle('hidden', !exists);
      });
    }

    // Modal form submit
    var form = container.querySelector('#crm-modal-form');
    if (form) form.addEventListener('submit', function(e) {
      e.preventDefault();
      submitForm();
    });
  }

  // ── Form submit ────────────────────────────────────────────────
  function submitForm() {
    var form = container.querySelector('#crm-modal-form');
    if (!form) return;

    var data = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(function(el) {
      data[el.name] = el.value;
    });
    data.created_by = myId;

    var t = state.modalType;
    var submitBtn = container.querySelector('#crm-modal-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

    var apiPath = '';
    if (t === 'add-contact')  apiPath = 'crm/contacts/create';
    if (t === 'edit-contact') { apiPath = 'crm/contacts/update'; data.id = state.editRecord.id; }
    if (t === 'add-lead')     apiPath = 'crm/leads/create';
    if (t === 'add-deal')     apiPath = 'crm/deals/create';
    if (t === 'add-activity') apiPath = 'crm/activities/create';

    api(apiPath, data)
      .then(function() {
        toast('Saved successfully!', 'success');
        state.modalType = null; state.editRecord = null;
        loadAll();
      })
      .catch(function(err) {
        toast(err.message || 'Error saving', 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save'; }
      });
  }

  // ── Dashboard ──────────────────────────────────────────────────
  function renderDashboard() {
    var d = state.dashboard;
    var openDeals = state.deals.filter(function(x) { return x.stage !== 'Won' && x.stage !== 'Lost'; });
    var pipeVal   = openDeals.reduce(function(s,x) { return s + (parseFloat(x.value)||0); }, 0);

    var kpis = [
      { label:'Contacts',       value: d.contacts_total || state.contacts.length, icon:'fa-users',       color:'from-blue-500 to-blue-600'     },
      { label:'Open Leads',     value: d.leads_open     || state.leads.length,    icon:'fa-bolt',        color:'from-amber-400 to-orange-500'  },
      { label:'Open Deals',     value: d.deals_open     || openDeals.length,      icon:'fa-handshake',   color:'from-indigo-500 to-purple-600' },
      { label:'Pipeline Value', value: fmt$(d.pipeline_value || pipeVal),         icon:'fa-dollar-sign', color:'from-emerald-500 to-teal-600'  },
      { label:'Won Revenue',    value: fmt$(d.won_revenue || 0),                  icon:'fa-trophy',      color:'from-pink-500 to-rose-600'     },
      { label:'Conversion',     value: (d.conversion_rate || 0) + '%',           icon:'fa-chart-line',  color:'from-cyan-500 to-blue-500'     },
    ];

    var stageMap = {};
    openDeals.forEach(function(dl) {
      if (!stageMap[dl.stage]) stageMap[dl.stage] = { count:0, value:0 };
      stageMap[dl.stage].count++; stageMap[dl.stage].value += parseFloat(dl.value||0);
    });
    var totalPipeVal = Object.values(stageMap).reduce(function(s,v) { return s + v.value; }, 0);

    return '<div class="max-w-6xl mx-auto space-y-6">' +
      '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">' +
        kpis.map(function(k) {
          return '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">' +
            '<div class="w-8 h-8 rounded-lg bg-gradient-to-br ' + k.color + ' flex items-center justify-center mb-3">' +
              '<i class="fas ' + k.icon + ' text-white text-xs"></i></div>' +
            '<p class="text-2xl font-bold text-slate-800">' + k.value + '</p>' +
            '<p class="text-xs text-slate-500 mt-0.5">' + k.label + '</p></div>';
        }).join('') +
      '</div>' +

      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">' +
          '<h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-columns text-pink-500 text-sm"></i> Pipeline by Stage</h3>' +
          (state.stages.filter(function(s){return s.name!=='Lost';}).map(function(stage) {
            var info = stageMap[stage.name] || { count:0, value:0 };
            var pct  = totalPipeVal ? Math.round((info.value / totalPipeVal) * 100) : 0;
            return '<div class="mb-3"><div class="flex justify-between text-xs mb-1">' +
              '<span class="font-medium text-slate-600">' + esc(stage.name) + '</span>' +
              '<span class="text-slate-500">' + info.count + ' deal' + (info.count!==1?'s':'') + ' · ' + fmt$(info.value) + '</span></div>' +
              '<div class="h-2 bg-slate-100 rounded-full overflow-hidden">' +
                '<div class="h-full rounded-full" style="width:' + pct + '%;background:' + stage.color + '"></div></div></div>';
          }).join('') || '<p class="text-sm text-slate-400 text-center py-4">No open deals yet</p>') +
        '</div>' +

        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">' +
          '<h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-history text-pink-500 text-sm"></i> Recent Activities</h3>' +
          '<div class="space-y-3 max-h-64 overflow-y-auto">' +
            (state.activities.length ? state.activities.slice(0,10).map(function(a) {
              var tc = { Call:'bg-blue-500', Email:'bg-pink-500', Meeting:'bg-purple-500', Note:'bg-slate-400', Task:'bg-amber-500', Demo:'bg-cyan-500' };
              var ti = { Call:'fa-phone', Email:'fa-envelope', Meeting:'fa-calendar-check', Note:'fa-sticky-note', Task:'fa-check-square', Demo:'fa-desktop' };
              return '<div class="flex gap-3 items-start">' +
                '<div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs ' + (tc[a.type]||'bg-slate-400') + '">' +
                  '<i class="fas ' + (ti[a.type]||'fa-circle') + '"></i></div>' +
                '<div class="flex-1 min-w-0">' +
                  '<p class="text-sm font-medium text-slate-700 truncate">' + esc(a.subject||a.type) + '</p>' +
                  (a.body ? '<p class="text-xs text-slate-400">' + esc(a.body.substring(0,60)) + '</p>' : '') +
                '</div>' +
                '<span class="text-xs text-slate-400 flex-shrink-0">' + fmtDate(a.created_at) + '</span></div>';
            }).join('') : '<p class="text-sm text-slate-400 text-center py-4">No activities logged yet</p>') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">' +
        [
          { tab:'contacts',  icon:'fa-users',   label:'Manage Contacts', cls:'bg-blue-50 text-blue-600 border-blue-200'      },
          { tab:'leads',     icon:'fa-bolt',    label:'View Leads',      cls:'bg-amber-50 text-amber-600 border-amber-200'   },
          { tab:'pipeline',  icon:'fa-columns', label:'Sales Pipeline',  cls:'bg-purple-50 text-purple-600 border-purple-200'},
          { tab:'activities',icon:'fa-history', label:'All Activities',  cls:'bg-pink-50 text-pink-600 border-pink-200'      },
        ].map(function(q) {
          return '<button class="crm-quicknav flex items-center gap-3 p-4 rounded-xl border ' + q.cls + ' text-left hover:opacity-80 transition-opacity" data-tab="' + q.tab + '">' +
            '<i class="fas ' + q.icon + '"></i><span class="text-sm font-medium">' + q.label + '</span></button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  // ── Contacts ───────────────────────────────────────────────────
  function renderContacts() {
    var rows = state.contacts;
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function(r) {
        return (r.name||'').toLowerCase().indexOf(q) > -1 ||
               (r.email||'').toLowerCase().indexOf(q) > -1 ||
               (r.company||'').toLowerCase().indexOf(q) > -1;
      });
    }
    if (state.filterStatus) rows = rows.filter(function(r) { return r.status === state.filterStatus; });

    return '<div class="max-w-6xl mx-auto">' +
      '<div class="flex flex-wrap gap-3 mb-5">' +
        '<div class="relative flex-1 min-w-48">' +
          '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>' +
          '<input class="crm-search w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" type="text" placeholder="Search contacts…" value="' + esc(state.search) + '"></div>' +
        '<select class="crm-filter-status border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-600">' +
          '<option value="">All Statuses</option>' +
          ['Lead','Prospect','Customer','Churned','Partner'].map(function(s) {
            return '<option value="' + s + '" ' + (state.filterStatus===s?'selected':'') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
        '<span class="text-sm text-slate-500 self-center">' + rows.length + ' contact' + (rows.length!==1?'s':'') + '</span>' +
      '</div>' +
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">' +
        '<table class="w-full">' +
          '<thead><tr class="bg-slate-50 border-b border-slate-200">' +
            '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>' +
            '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Company</th>' +
            '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Email</th>' +
            '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>' +
            '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Score</th>' +
            '<th class="px-4 py-3"></th>' +
          '</tr></thead>' +
          '<tbody>' +
            (rows.length ? rows.map(function(c) {
              return '<tr class="crm-contact-row border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" data-id="' + esc(c.id) + '">' +
                '<td class="px-4 py-3"><div class="flex items-center gap-3">' +
                  '<div class="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">' + esc((c.name||'?').charAt(0).toUpperCase()) + '</div>' +
                  '<div><p class="font-medium text-slate-800 text-sm">' + esc(c.name) + '</p><p class="text-xs text-slate-400">' + esc(c.job_title||'') + '</p></div></div></td>' +
                '<td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">' + esc(c.company||'—') + '</td>' +
                '<td class="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">' + esc(c.email||'—') + '</td>' +
                '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (PILL[c.status]||'bg-slate-100 text-slate-600') + '">' + esc(c.status||'—') + '</span></td>' +
                '<td class="px-4 py-3 hidden md:table-cell"><span class="text-sm font-bold ' + scoreColor(c.lead_score) + '">' + (c.lead_score||0) + '</span></td>' +
                '<td class="px-4 py-3 text-right">' +
                  '<button class="crm-edit-contact text-slate-400 hover:text-slate-600 mr-2 text-xs" data-id="' + esc(c.id) + '"><i class="fas fa-edit"></i></button>' +
                  '<button class="crm-delete-contact text-slate-400 hover:text-red-500 text-xs" data-id="' + esc(c.id) + '"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
            }).join('') :
            '<tr><td colspan="6" class="px-4 py-12 text-center text-slate-400 text-sm"><i class="fas fa-users text-3xl mb-3 block opacity-30"></i>No contacts found.</td></tr>') +
          '</tbody></table></div></div>';
  }

  // ── Leads ──────────────────────────────────────────────────────
  function renderLeads() {
    var rows = state.leads;
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function(r) {
        return (r.name||'').toLowerCase().indexOf(q) > -1 || (r.company||'').toLowerCase().indexOf(q) > -1;
      });
    }
    if (state.filterStage) rows = rows.filter(function(r) { return r.stage === state.filterStage; });

    var LEAD_STAGES = ['New','Contacted','Qualified','Proposal','Negotiation'];

    return '<div class="max-w-6xl mx-auto">' +
      '<div class="flex flex-wrap gap-3 mb-5">' +
        '<div class="relative flex-1 min-w-48">' +
          '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>' +
          '<input class="crm-search w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" type="text" placeholder="Search leads\u2026" value="' + esc(state.search) + '"></div>' +
        '<select class="crm-filter-stage border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-600">' +
          '<option value="">All Stages</option>' +
          LEAD_STAGES.map(function(s) {
            return '<option value="' + s + '" ' + (state.filterStage===s?'selected':'') + '>' + s + '</option>';
          }).join('') +
        '</select>' +
        '<span class="text-sm text-slate-500 self-center">' + rows.length + ' lead' + (rows.length!==1?'s':'') + '</span>' +
      '</div>' +
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">' +
        '<table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">' +
          '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead</th>' +
          '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Linked Contact</th>' +
          '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stage</th>' +
          '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>' +
          '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Value</th>' +
          '<th class="px-4 py-3"></th>' +
        '</tr></thead><tbody>' +
          (rows.length ? rows.map(function(l) {
            var sc = parseFloat(l.lead_score||0);
            var linkedContact = null;
            if (l.contact_id) linkedContact = state.contacts.find(function(c) { return c.id === l.contact_id; });
            if (!linkedContact && l.email) linkedContact = state.contacts.find(function(c) { return c.email && c.email.toLowerCase() === l.email.toLowerCase(); });
            return '<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">' +
              '<td class="px-4 py-3"><div class="flex items-center gap-3">' +
                '<div class="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">' + esc((l.name||'?').charAt(0).toUpperCase()) + '</div>' +
                '<div><p class="font-medium text-slate-800 text-sm">' + esc(l.name) + '</p>' +
                '<p class="text-xs text-slate-400">' + esc(l.email||l.source||'') + '</p></div></div></td>' +
              '<td class="px-4 py-3 text-sm hidden md:table-cell">' +
                (linkedContact
                  ? '<span class=\"inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-xs text-green-700\"><i class=\"fas fa-link\" style=\"font-size:9px\"></i> ' + esc(linkedContact.name) + '</span>'
                  : '<span class=\"text-slate-400 text-xs italic\">No contact linked</span>') +
              '</td>' +
              '<td class="px-4 py-3">' +
                '<select class="crm-lead-stage-select crm-input" style="width:auto;padding:.2rem .5rem;font-size:.75rem" data-id="' + esc(l.id) + '">' +
                  LEAD_STAGES.map(function(s) { return '<option value="' + s + '" ' + (l.stage===s?'selected':'') + '>' + s + '</option>'; }).join('') +
                '</select>' +
              '</td>' +
              '<td class="px-4 py-3"><div class="flex items-center gap-2">' +
                '<div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ' + (sc>=70?'bg-green-500':sc>=40?'bg-amber-400':'bg-slate-300') + '" style="width:' + Math.min(sc,100) + '%"></div></div>' +
                '<span class="text-xs font-bold ' + scoreColor(l.lead_score) + '">' + (l.lead_score||0) + '</span></div></td>' +
              '<td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">' + (l.deal_value ? fmt$(l.deal_value) : '\u2014') + '</td>' +
              '<td class="px-4 py-3 text-right">' +
                '<button class="crm-convert-lead text-xs text-indigo-500 hover:text-indigo-700 mr-2 font-medium" data-id="' + esc(l.id) + '">Convert</button>' +
                '<button class="crm-delete-lead text-slate-400 hover:text-red-500 text-xs" data-id="' + esc(l.id) + '"><i class="fas fa-trash"></i></button>' +
              '</td></tr>';
          }).join('') :
          '<tr><td colspan="6" class="px-4 py-12 text-center text-slate-400 text-sm"><i class="fas fa-bolt text-3xl mb-3 block opacity-30"></i>No leads yet.</td></tr>') +
        '</tbody></table></div></div>';
  }

  // ── Pipeline ───────────────────────────────────────────────────
  function renderPipeline() {
    var stages = state.stages.slice().sort(function(a,b) { return parseInt(a.order||0)-parseInt(b.order||0); });
    var openDeals = state.deals.filter(function(d) { return d.stage !== 'Won' && d.stage !== 'Lost'; });
    var pipeVal   = openDeals.reduce(function(s,d) { return s + (parseFloat(d.value)||0); }, 0);

    return '<div>' +
      '<div class="flex flex-wrap gap-3 mb-5">' +
        '<div class="relative min-w-48">' +
          '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>' +
          '<input class="crm-search pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" type="text" placeholder="Search deals…" value="' + esc(state.search) + '"></div>' +
        '<div class="flex items-center gap-4 text-sm text-slate-600">' +
          '<span><strong>' + openDeals.length + '</strong> open deals</span>' +
          '<span><strong class="text-emerald-600">' + fmt$(pipeVal) + '</strong> pipeline</span></div>' +
      '</div>' +
      '<div class="flex gap-4 overflow-x-auto pb-4" style="min-height:500px">' +
        stages.map(function(stage) {
          var deals = state.deals.filter(function(d) { return d.stage === stage.name; });
          if (state.search) {
            var q = state.search.toLowerCase();
            deals = deals.filter(function(d) {
              return (d.deal_name||'').toLowerCase().indexOf(q) > -1 || (d.company||'').toLowerCase().indexOf(q) > -1;
            });
          }
          var stageVal = deals.reduce(function(s,d) { return s + (parseFloat(d.value)||0); }, 0);

          return '<div class="crm-stage-col flex-shrink-0 w-72 flex flex-col rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50" data-stage="' + esc(stage.name) + '">' +
            '<div class="px-3 py-3 flex items-center justify-between border-b border-slate-200" style="background:' + stage.color + '18;border-top:3px solid ' + stage.color + '">' +
              '<div class="flex items-center gap-2">' +
                '<span class="w-2.5 h-2.5 rounded-full" style="background:' + stage.color + '"></span>' +
                '<span class="text-sm font-semibold text-slate-700">' + esc(stage.name) + '</span>' +
                '<span class="text-xs bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-slate-500">' + deals.length + '</span></div>' +
              '<span class="text-xs font-medium text-slate-500">' + fmt$(stageVal) + '</span></div>' +
            '<div class="flex-1 p-2 space-y-2 overflow-y-auto" style="max-height:520px">' +
              deals.map(function(deal) {
                return '<div class="crm-deal-card bg-white rounded-lg border border-slate-200 p-3 cursor-grab shadow-sm hover:shadow-md transition-shadow" draggable="true" data-id="' + esc(deal.id) + '" data-stage="' + esc(stage.name) + '">' +
                  '<p class="font-medium text-slate-800 text-sm mb-1">' + esc(deal.deal_name) + '</p>' +
                  (deal.contact_name ? '<p class="text-xs text-slate-500 mb-1"><i class="fas fa-user w-3"></i> ' + esc(deal.contact_name) + '</p>' : '') +
                  (deal.company ? '<p class="text-xs text-slate-500 mb-2"><i class="fas fa-building w-3"></i> ' + esc(deal.company) + '</p>' : '') +
                  '<div class="flex items-center justify-between mt-2">' +
                    '<span class="text-sm font-bold text-slate-700">' + fmt$(deal.value) + '</span>' +
                    '<div class="flex items-center gap-1">' +
                      '<div class="w-14 h-1 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-emerald-400 rounded-full" style="width:' + (deal.probability||0) + '%"></div></div>' +
                      '<span class="text-xs text-slate-400">' + (deal.probability||0) + '%</span></div></div>' +
                  (deal.expected_close ? '<p class="text-xs text-slate-400 mt-1.5"><i class="fas fa-calendar-alt mr-1"></i>' + esc(deal.expected_close) + '</p>' : '') +
                '</div>';
              }).join('') +
              '<div class="crm-drop-zone hidden border-2 border-dashed border-pink-300 rounded-lg p-3 text-center text-xs text-pink-400 bg-pink-50">Drop here</div>' +
              (deals.length === 0 ? '<div class="p-4 text-center text-xs text-slate-400"><i class="fas fa-inbox text-xl mb-2 block opacity-30"></i>No deals</div>' : '') +
            '</div>' +
            '<div class="p-2 border-t border-slate-200">' +
              '<button class="crm-add-deal-stage w-full text-xs text-slate-500 hover:text-pink-500 hover:bg-pink-50 py-1.5 rounded-lg transition-colors" data-stage="' + esc(stage.name) + '">' +
                '<i class="fas fa-plus mr-1"></i> Add deal</button></div>' +
          '</div>';
        }).join('') +
      '</div></div>';
  }

  // ── Activities ─────────────────────────────────────────────────
  function renderActivities() {
    var rows = state.activities;
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function(r) {
        return (r.subject||'').toLowerCase().indexOf(q) > -1 || (r.body||'').toLowerCase().indexOf(q) > -1;
      });
    }
    var typeIcon  = { Call:'fa-phone', Email:'fa-envelope', Meeting:'fa-calendar-check', Note:'fa-sticky-note', Task:'fa-check-square', Demo:'fa-desktop' };
    var typeColor = { Call:'bg-blue-500', Email:'bg-pink-500', Meeting:'bg-purple-500', Note:'bg-slate-400', Task:'bg-amber-500', Demo:'bg-cyan-500' };

    return '<div class="max-w-3xl mx-auto">' +
      '<div class="flex gap-3 mb-5">' +
        '<div class="relative flex-1">' +
          '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>' +
          '<input class="crm-search w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" type="text" placeholder="Search activities…" value="' + esc(state.search) + '"></div>' +
        '<span class="text-sm text-slate-500 self-center">' + rows.length + ' activit' + (rows.length!==1?'ies':'y') + '</span>' +
      '</div>' +
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">' +
        (rows.length ? rows.map(function(a) {
          return '<div class="flex gap-4 p-4 hover:bg-slate-50 transition-colors">' +
            '<div class="w-9 h-9 rounded-full ' + (typeColor[a.type]||'bg-slate-400') + ' flex items-center justify-center flex-shrink-0 text-white text-xs">' +
              '<i class="fas ' + (typeIcon[a.type]||'fa-circle') + '"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center justify-between gap-2">' +
                '<p class="font-medium text-slate-700 text-sm">' + esc(a.subject||a.type) + '</p>' +
                '<span class="text-xs text-slate-400 flex-shrink-0">' + fmtDate(a.created_at) + '</span></div>' +
              (a.body ? '<p class="text-sm text-slate-500 mt-0.5">' + esc(a.body) + '</p>' : '') +
              '<span class="text-xs font-medium text-slate-500">' + esc(a.type) + '</span>' +
              (a.outcome ? ' <span class="text-xs text-slate-400">· ' + esc(a.outcome) + '</span>' : '') +
            '</div></div>';
        }).join('') :
        '<div class="p-12 text-center text-slate-400 text-sm"><i class="fas fa-history text-3xl mb-3 block opacity-30"></i>No activities logged yet.</div>') +
      '</div></div>';
  }

  // ── Modal ──────────────────────────────────────────────────────
  function renderModal() {
    var t = state.modalType;
    var r = state.editRecord || {};
    var title = '';
    var body  = '';
    var showForm = true;

    if (t === 'add-contact' || t === 'edit-contact') {
      title = t === 'edit-contact' ? 'Edit Contact' : 'Add Contact';
      body =
        '<div class="grid grid-cols-2 gap-3">' +
          '<div class="col-span-2"><label class="crm-label">Full Name *</label><input name="name" class="crm-input" value="' + esc(r.name||'') + '" placeholder="Jane Smith" required></div>' +
          '<div><label class="crm-label">Email</label><input name="email" type="email" class="crm-input" value="' + esc(r.email||'') + '" placeholder="jane@co.com"></div>' +
          '<div><label class="crm-label">Phone</label><input name="phone" class="crm-input" value="' + esc(r.phone||'') + '" placeholder="+1 555 0000"></div>' +
          '<div><label class="crm-label">Company</label><input name="company" class="crm-input" value="' + esc(r.company||'') + '" placeholder="Acme Corp"></div>' +
          '<div><label class="crm-label">Job Title</label><input name="job_title" class="crm-input" value="' + esc(r.job_title||'') + '" placeholder="CEO"></div>' +
          '<div><label class="crm-label">Status</label><select name="status" class="crm-input">' +
            ['Lead','Prospect','Customer','Churned','Partner'].map(function(s) { return '<option value="' + s + '" ' + (r.status===s?'selected':'') + '>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '<div><label class="crm-label">Source</label><select name="source" class="crm-input"><option value="">—</option>' +
            ['Website','Referral','Social','Cold Outreach','Event','Inbound','Other'].map(function(s) { return '<option value="' + s + '" ' + (r.source===s?'selected':'') + '>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="notes" rows="2" class="crm-input resize-none">' + esc(r.notes||'') + '</textarea></div>' +
        '</div>';
    }

    if (t === 'add-lead') {
      title = 'Add Lead';
      // Build contact options for linking
      var contactOpts = '<option value="">— New lead (no existing contact) —</option>' +
        state.contacts.map(function(c) {
          return '<option value="' + esc(c.id) + '" data-email="' + esc(c.email||'') + '" data-phone="' + esc(c.phone||'') + '" data-company="' + esc(c.company||'') + '" data-job_title="' + esc(c.job_title||'') + '">' +
            esc(c.name) + (c.company ? ' — ' + esc(c.company) : '') + (c.email ? ' (' + esc(c.email) + ')' : '') +
          '</option>';
        }).join('');
      body =
        '<div class="grid grid-cols-2 gap-3">' +
          '<div class="col-span-2">' +
            '<label class="crm-label">Link to Existing Contact</label>' +
            '<select id="crm-lead-contact-link" name="contact_id" class="crm-input">' + contactOpts + '</select>' +
            '<p class="text-xs text-slate-400 mt-1">Selecting a contact auto-fills the fields below and avoids duplicates.</p>' +
          '</div>' +
          '<div id="crm-lead-dupe-warn" class="col-span-2 hidden">' +
            '<div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">' +
              '<i class="fas fa-exclamation-triangle mr-1"></i> A contact with this email already exists. Consider linking above instead.' +
            '</div>' +
          '</div>' +
          '<div class="col-span-2"><label class="crm-label">Name *</label><input id="crm-lead-name" name="name" class="crm-input" placeholder="John Doe" required></div>' +
          '<div><label class="crm-label">Email</label><input id="crm-lead-email" name="email" type="email" class="crm-input"></div>' +
          '<div><label class="crm-label">Phone</label><input id="crm-lead-phone" name="phone" class="crm-input"></div>' +
          '<div><label class="crm-label">Company</label><input id="crm-lead-company" name="company" class="crm-input"></div>' +
          '<div><label class="crm-label">Job Title</label><input id="crm-lead-job_title" name="job_title" class="crm-input"></div>' +
          '<div><label class="crm-label">Stage</label><select name="stage" class="crm-input">' +
            ['New','Contacted','Qualified','Proposal','Negotiation'].map(function(s) { return '<option>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '<div><label class="crm-label">Source</label><select name="source" class="crm-input"><option value="">—</option>' +
            ['Website','Referral','Social','Cold Outreach','Event','Inbound','Other'].map(function(s) { return '<option>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '<div><label class="crm-label">Deal Value ($)</label><input name="deal_value" type="number" class="crm-input" placeholder="0"></div>' +
          '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="notes" rows="2" class="crm-input resize-none"></textarea></div>' +
        '</div>';
    }

    if (t === 'add-deal') {
      title = 'Add Deal';
      var defaultStage = state.stageForNewDeal || 'New';
      body =
        '<div class="grid grid-cols-2 gap-3">' +
          '<div class="col-span-2"><label class="crm-label">Deal Name *</label><input name="deal_name" class="crm-input" placeholder="Acme Corp — Q3 Contract" required></div>' +
          '<div><label class="crm-label">Contact Name</label><input name="contact_name" class="crm-input" placeholder="Jane Smith"></div>' +
          '<div><label class="crm-label">Company</label><input name="company" class="crm-input" placeholder="Acme Corp"></div>' +
          '<div><label class="crm-label">Stage</label><select name="stage" class="crm-input">' +
            state.stages.map(function(s) { return '<option value="' + esc(s.name) + '" ' + (s.name===defaultStage?'selected':'') + '>' + esc(s.name) + '</option>'; }).join('') +
          '</select></div>' +
          '<div><label class="crm-label">Value ($)</label><input name="value" type="number" class="crm-input" placeholder="0"></div>' +
          '<div><label class="crm-label">Probability (%)</label><input name="probability" type="number" min="0" max="100" class="crm-input" placeholder="10"></div>' +
          '<div><label class="crm-label">Expected Close</label><input name="expected_close" type="date" class="crm-input"></div>' +
          '<div class="col-span-2"><label class="crm-label">Description</label><textarea name="description" rows="2" class="crm-input resize-none"></textarea></div>' +
        '</div>';
    }

    if (t === 'add-activity') {
      title = 'Log Activity';
      body =
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="crm-label">Type</label><select name="type" class="crm-input">' +
            ['Call','Email','Meeting','Note','Task','Demo'].map(function(s) { return '<option>' + s + '</option>'; }).join('') +
          '</select></div>' +
          '<div><label class="crm-label">Subject *</label><input name="subject" class="crm-input" placeholder="Follow-up call" required></div>' +
          '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="body" rows="3" class="crm-input resize-none" placeholder="What was discussed…"></textarea></div>' +
          '<div><label class="crm-label">Outcome</label><input name="outcome" class="crm-input" placeholder="Positive / No answer…"></div>' +
          '<div><label class="crm-label">Date</label><input name="scheduled_at" type="date" class="crm-input"></div>' +
        '</div>';
    }

    if (t === 'view-contact') {
      showForm = false;
      var c = state.contactDetail || {};
      title = esc(c.name || 'Contact');
      var cActs  = state.activities.filter(function(a) { return a.contact_id === c.id; });
      var cDeals = state.deals.filter(function(d) { return d.contact_id === c.id; });
      body = '<div class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-3 text-sm">' +
          (c.email     ? '<div><span class="text-slate-400 text-xs block">Email</span><p class="font-medium">' + esc(c.email) + '</p></div>' : '') +
          (c.phone     ? '<div><span class="text-slate-400 text-xs block">Phone</span><p class="font-medium">' + esc(c.phone) + '</p></div>' : '') +
          (c.company   ? '<div><span class="text-slate-400 text-xs block">Company</span><p class="font-medium">' + esc(c.company) + '</p></div>' : '') +
          (c.job_title ? '<div><span class="text-slate-400 text-xs block">Title</span><p class="font-medium">' + esc(c.job_title) + '</p></div>' : '') +
          '<div><span class="text-slate-400 text-xs block">Status</span><p><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (PILL[c.status]||'bg-slate-100 text-slate-600') + '">' + esc(c.status||'—') + '</span></p></div>' +
          '<div><span class="text-slate-400 text-xs block">Lead Score</span><p class="font-bold ' + scoreColor(c.lead_score) + '">' + (c.lead_score||0) + ' / 100</p></div>' +
        '</div>' +
        (c.notes ? '<div class="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">' + esc(c.notes) + '</div>' : '') +
        (cDeals.length ? '<div><p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Deals (' + cDeals.length + ')</p>' +
          cDeals.map(function(d) {
            return '<div class="flex items-center justify-between py-2 border-b border-slate-100 text-sm">' +
              '<span class="font-medium text-slate-700">' + esc(d.deal_name) + '</span>' +
              '<div class="flex items-center gap-2"><span class="text-xs px-2 py-0.5 rounded-full ' + (PILL[d.stage]||'bg-slate-100 text-slate-600') + '">' + esc(d.stage) + '</span>' +
              '<span class="font-bold text-slate-700">' + fmt$(d.value) + '</span></div></div>';
          }).join('') + '</div>' : '') +
        (cActs.length ? '<div><p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Activity (' + cActs.length + ')</p>' +
          '<div class="space-y-2 max-h-40 overflow-y-auto">' +
          cActs.map(function(a) {
            return '<div class="flex gap-2 text-sm">' +
              '<span class="text-slate-400 text-xs mt-0.5 w-16 flex-shrink-0">' + fmtDate(a.created_at) + '</span>' +
              '<span class="font-medium text-slate-500">' + esc(a.type) + '</span>' +
              '<span class="text-slate-600">' + esc(a.subject||'') + '</span></div>';
          }).join('') + '</div></div>' : '') +
      '</div>';
    }

    if (t === 'view-deal') {
      showForm = false;
      var dl = state.dealDetail || {};
      title = esc(dl.deal_name || 'Deal');
      body = '<div class="space-y-3 text-sm">' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><span class="text-slate-400 text-xs block">Contact</span><p class="font-medium">' + esc(dl.contact_name||'—') + '</p></div>' +
          '<div><span class="text-slate-400 text-xs block">Company</span><p class="font-medium">' + esc(dl.company||'—') + '</p></div>' +
          '<div><span class="text-slate-400 text-xs block">Stage</span><p><span class="px-2 py-0.5 rounded-full text-xs font-medium ' + (PILL[dl.stage]||'bg-slate-100 text-slate-600') + '">' + esc(dl.stage||'—') + '</span></p></div>' +
          '<div><span class="text-slate-400 text-xs block">Value</span><p class="font-bold text-slate-800 text-lg">' + fmt$(dl.value) + '</p></div>' +
          '<div><span class="text-slate-400 text-xs block">Probability</span><p class="font-medium">' + (dl.probability||0) + '%</p></div>' +
          '<div><span class="text-slate-400 text-xs block">Expected Close</span><p class="font-medium">' + esc(dl.expected_close||'—') + '</p></div>' +
        '</div>' +
        (dl.description ? '<div class="bg-slate-50 rounded-lg p-3 text-slate-600">' + esc(dl.description) + '</div>' : '') +
        '<div class="pt-2"><button id="crm-delete-deal-btn" class="w-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg py-2 text-sm font-medium transition-colors" data-id="' + esc(dl.id) + '">Delete Deal</button></div>' +
      '</div>';
    }

    return '<div id="crm-modal-backdrop" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">' +
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">' +
        '<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">' +
          '<h2 class="font-bold text-slate-800">' + title + '</h2>' +
          '<button id="crm-modal-close" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>' +
        '</div>' +
        (showForm
          ? '<form id="crm-modal-form" class="px-6 py-5">' + body +
              '<div class="flex gap-3 mt-5 pt-4 border-t border-slate-100">' +
                '<button type="button" id="crm-modal-cancel" class="crm-btn-ghost flex-1">Cancel</button>' +
                '<button type="submit" id="crm-modal-submit" class="crm-btn-primary flex-1">Save</button>' +
              '</div></form>'
          : '<div class="px-6 py-5">' + body + '</div>') +
      '</div>' +
    '</div>';
  }

  function renderLoading() {
    return '<div class="flex items-center justify-center h-64"><i class="fas fa-circle-notch fa-spin text-3xl text-pink-400 opacity-60"></i></div>';
  }

  // ── Styles ─────────────────────────────────────────────────────
  function attachStyles() {
    if (document.getElementById('crm-styles')) return;
    var style = document.createElement('style');
    style.id = 'crm-styles';
    style.textContent = [
      '.crm-btn-primary{background:linear-gradient(135deg,#ec4899,#f43f5e);color:#fff;border:none;padding:.45rem 1rem;border-radius:.5rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:opacity .15s}',
      '.crm-btn-primary:hover{opacity:.88}',
      '.crm-btn-ghost{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:.45rem 1rem;border-radius:.5rem;font-size:.85rem;font-weight:500;cursor:pointer}',
      '.crm-btn-ghost:hover{background:#e2e8f0}',
      '.crm-label{display:block;font-size:.72rem;font-weight:600;color:#64748b;margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.04em}',
      '.crm-input{display:block;width:100%;padding:.45rem .65rem;border:1px solid #e2e8f0;border-radius:.5rem;font-size:.875rem;color:#1e293b;background:#fff;outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}',
      '.crm-input:focus{border-color:#f472b6;box-shadow:0 0 0 3px rgba(244,114,182,.15)}',
      '.crm-tab{padding:.5rem 1rem;font-size:.85rem;font-weight:500;border:none;background:transparent;cursor:pointer;border-bottom:2px solid transparent;transition:color .15s,border-color .15s}',
      '.crm-tab-active{border-bottom-color:#ec4899;color:#db2777}',
      '.crm-tab-inactive{color:#64748b}.crm-tab-inactive:hover{color:#334155}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Boot ───────────────────────────────────────────────────────
  render();
  loadAll();

};
