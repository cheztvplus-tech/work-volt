// ================================================================
//  WORK VOLT — pages/recruitment.js
//  Recruitment Pipeline Frontend Module
// ================================================================

window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['recruitment'] = function(container) {

  // ── Auth guard ─────────────────────────────────────────────────
  const user = window.WorkVolt?.user() || {};
  if (!['SuperAdmin', 'Admin', 'Manager'].includes(user.role)) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <i class="fas fa-lock text-4xl"></i>
        <p class="font-semibold">Access restricted to Admins and Managers</p>
      </div>`;
    return;
  }

  // ── State ───────────────────────────────────────────────────────
  let activeTab        = 'pipeline';   // pipeline | jobs | templates | metrics
  let jobs             = [];
  let selectedJobId    = null;
  let candidates       = [];
  let staleList        = [];
  let templates        = [];
  let dashData         = null;
  let sourceData       = null;
  let pipelineMetrics  = null;

  // Detail / panel state
  let detailCandidate  = null;
  let detailNotes      = [];
  let detailScorecards = [];
  let detailJob        = null;

  // Modal state
  let modalMode        = null; // 'addCandidate' | 'addJob' | 'editJob' | 'editCandidate' | 'scorecard' | 'template' | 'moveStage' | 'composeEmail'
  let modalData        = {};

  // Filters
  let filterStage  = '';
  let filterSearch = '';
  let filterSource = '';

  const STAGES = ['Applied','Screened','Qualified','Interview','Final Interview','Offer','Hired','Rejected'];

  const STAGE_COLORS = {
    Applied:         'bg-slate-100 text-slate-600',
    Screened:        'bg-blue-100 text-blue-700',
    Qualified:       'bg-indigo-100 text-indigo-700',
    Interview:       'bg-violet-100 text-violet-700',
    'Final Interview':'bg-purple-100 text-purple-700',
    Offer:           'bg-amber-100 text-amber-700',
    Hired:           'bg-emerald-100 text-emerald-700',
    Rejected:        'bg-red-100 text-red-600',
  };

  const STAGE_DOTS = {
    Applied:         'bg-slate-400',
    Screened:        'bg-blue-500',
    Qualified:       'bg-indigo-500',
    Interview:       'bg-violet-500',
    'Final Interview':'bg-purple-500',
    Offer:           'bg-amber-500',
    Hired:           'bg-emerald-500',
    Rejected:        'bg-red-500',
  };

  const SOURCES = ['Direct','LinkedIn','Indeed','Referral','Company Website','Recruiter','Other'];

  // ── API helper ─────────────────────────────────────────────────
  async function api(path, params = {}) {
    return window.WorkVolt.api('recruitment/' + path, params);
  }

  const toast = (msg, type = 'info') => window.WorkVolt.toast(msg, type);

  // ================================================================
  //  LOAD DATA
  // ================================================================
  async function loadAll() {
    renderShell();
    await Promise.all([loadJobs(), loadDashboard()]);
    if (jobs.length) {
      selectedJobId = selectedJobId || jobs[0]?.job_id;
      await loadCandidates();
    }
    render();
  }

  async function loadJobs() {
    try {
      const res = await api('jobs/list');
      jobs = res.rows || [];
    } catch(e) { toast('Failed to load jobs: ' + e.message, 'error'); }
  }

  async function loadCandidates() {
    if (!selectedJobId) { candidates = []; return; }
    try {
      const res = await api('candidates/list', {
        job_id: selectedJobId,
        stage:  filterStage,
        search: filterSearch,
        source: filterSource
      });
      candidates = res.rows || [];
    } catch(e) { toast('Failed to load candidates: ' + e.message, 'error'); }
  }

  async function loadDashboard() {
    try {
      const [dash, src, metrics] = await Promise.all([
        api('dashboard'),
        api('metrics/sources'),
        api('metrics/pipeline', { job_id: selectedJobId || '' })
      ]);
      dashData       = dash;
      sourceData     = src;
      pipelineMetrics = metrics;
      staleList = metrics.stale_candidates || [];
    } catch(e) { console.warn('Dashboard load error:', e.message); }
  }

  async function loadTemplates() {
    try {
      const res = await api('templates/list');
      templates = res.rows || [];
    } catch(e) { toast('Failed to load templates: ' + e.message, 'error'); }
  }

  async function openCandidateDetail(candidateId) {
    try {
      const [candRes, notesRes, scRes] = await Promise.all([
        api('candidates/get', { candidate_id: candidateId }),
        api('notes/list',     { candidate_id: candidateId }),
        api('scorecards/list',{ candidate_id: candidateId })
      ]);
      detailCandidate  = candRes.candidate;
      detailNotes      = notesRes.rows || [];
      detailScorecards = scRes.rows    || [];

      if (detailCandidate?.job_id) {
        const jRes = await api('jobs/get', { job_id: detailCandidate.job_id });
        detailJob = jRes.job || null;
      }

      renderDetailPanel();
    } catch(e) { toast('Could not load candidate: ' + e.message, 'error'); }
  }

  // ================================================================
  //  MAIN RENDER
  // ================================================================
  function renderShell() {
    container.innerHTML = `
      <div class="flex flex-col h-full">

        <!-- Page header -->
        <div class="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 class="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fas fa-user-tie text-blue-500"></i> Recruitment Pipeline
              </h1>
              <p class="text-sm text-slate-400 mt-0.5">Manage jobs, candidates, and your hiring funnel</p>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-add-job" class="btn-primary text-sm">
                <i class="fas fa-plus"></i> New Job
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mt-4" id="rec-tabs">
            ${['pipeline','jobs','templates','metrics'].map(t => `
              <button data-tab="${t}"
                class="tab-btn px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}">
                <i class="fas ${t === 'pipeline' ? 'fa-stream' : t === 'jobs' ? 'fa-briefcase' : t === 'templates' ? 'fa-envelope-open-text' : 'fa-chart-bar'} mr-1.5"></i>
                ${t.charAt(0).toUpperCase() + t.slice(1)}
              </button>`).join('')}
          </div>
        </div>

        <!-- Main area -->
        <div class="flex-1 overflow-hidden" id="rec-body">
          <div class="flex items-center justify-center h-40">
            <i class="fas fa-circle-notch fa-spin text-2xl text-blue-400 opacity-60"></i>
          </div>
        </div>

      </div>

      <!-- Detail panel overlay (candidates) -->
      <div id="rec-detail-panel" class="hidden fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 overflow-hidden">
      </div>
      <div id="rec-panel-overlay" class="hidden fixed inset-0 bg-black/30 z-40"></div>

      <!-- Modal -->
      <div id="rec-modal-overlay" class="hidden fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
        <div id="rec-modal-box" class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto thin-scroll"></div>
      </div>
    `;

    bindTabEvents();
    bindHeaderEvents();
  }

  function render() {
    const body = document.getElementById('rec-body');
    if (!body) return;
    switch (activeTab) {
      case 'pipeline':  renderPipeline(body);  break;
      case 'jobs':      renderJobsTab(body);    break;
      case 'templates': renderTemplatesTab(body); break;
      case 'metrics':   renderMetricsTab(body); break;
    }
  }

  // ================================================================
  //  PIPELINE TAB
  // ================================================================
  function renderPipeline(body) {
    const job = jobs.find(j => j.job_id === selectedJobId);
    const stageCounts = {};
    STAGES.forEach(s => { stageCounts[s] = 0; });
    candidates.forEach(c => { if (stageCounts[c.stage] !== undefined) stageCounts[c.stage]++; });

    // Group candidates by stage
    const byStage = {};
    STAGES.forEach(s => { byStage[s] = []; });
    let filtered = candidates;
    if (filterStage)  filtered = filtered.filter(c => c.stage === filterStage);
    if (filterSearch) filtered = filtered.filter(c =>
      (c.name + ' ' + c.email + ' ' + (c.source||'')).toLowerCase().includes(filterSearch.toLowerCase())
    );
    if (filterSource) filtered = filtered.filter(c => c.source === filterSource);
    filtered.forEach(c => { if (byStage[c.stage]) byStage[c.stage].push(c); });

    const staleIds = new Set(staleList.map(s => s.candidate_id));

    body.innerHTML = `
      <div class="flex flex-col h-full">

        <!-- Job selector + filters row -->
        <div class="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-3 flex-wrap">

          <!-- Job selector (closed jobs hidden) -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <i class="fas fa-briefcase text-slate-400 text-sm"></i>
            <select id="job-selector" class="field text-sm" style="max-width:220px">
              <option value="">— Select a job —</option>
              ${jobs.filter(j => j.status !== 'Closed').map(j => `
                <option value="${j.job_id}" ${j.job_id === selectedJobId ? 'selected' : ''}>
                  ${esc(j.title)} · ${j.candidate_count || 0} candidates
                </option>`).join('')}
            </select>
          </div>

          <!-- Selected job title displayed prominently -->
          ${job ? `
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-slate-300">|</span>
            <span class="font-extrabold text-slate-800 text-base truncate" style="max-width:320px" title="${esc(job.title)}">
              ${esc(job.title)}
            </span>
            ${job.department ? `<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">${esc(job.department)}</span>` : ''}
            ${job.status && job.status !== 'Open' ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">${esc(job.status)}</span>` : ''}
          </div>` : ''}

          <!-- Search -->
          <div class="relative">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input id="cand-search" type="text" value="${esc(filterSearch)}"
              placeholder="Search candidates…"
              class="field pl-8 text-sm" style="width:200px">
          </div>

          <!-- Stage filter -->
          <select id="stage-filter" class="field text-sm" style="width:150px">
            <option value="">All stages</option>
            ${STAGES.map(s => `<option value="${s}" ${filterStage === s ? 'selected':''}>${s}</option>`).join('')}
          </select>

          <!-- Source filter -->
          <select id="source-filter" class="field text-sm" style="width:140px">
            <option value="">All sources</option>
            ${SOURCES.map(s => `<option value="${s}" ${filterSource === s ? 'selected':''}>${s}</option>`).join('')}
          </select>

          ${selectedJobId ? `
            <button id="btn-add-candidate" class="btn-primary text-sm ml-auto flex-shrink-0">
              <i class="fas fa-user-plus"></i> Add Candidate
            </button>` : ''}
        </div>

        <!-- Stale alert banner -->
        ${staleList.length && !filterStage ? `
          <div class="mx-6 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-amber-700">
            <i class="fas fa-clock text-amber-500"></i>
            <span><strong>${staleList.length}</strong> candidate${staleList.length !== 1 ? 's' : ''} idle for 48+ hours</span>
            <button onclick="document.getElementById('stage-filter').value=''; window._recFilterStale && window._recFilterStale()" class="ml-auto text-amber-600 font-semibold hover:underline text-xs">View all</button>
          </div>` : ''}

        <!-- No job selected -->
        ${!selectedJobId ? `
          <div class="flex flex-col items-center justify-center flex-1 gap-3 text-slate-400">
            <i class="fas fa-briefcase text-4xl opacity-30"></i>
            <p class="font-semibold">Select a job to view its pipeline</p>
            <button id="btn-add-job-empty" class="btn-primary text-sm mt-2">
              <i class="fas fa-plus"></i> Create First Job
            </button>
          </div>` : `

        <!-- Kanban board -->
        <div class="flex-1 overflow-x-auto overflow-y-hidden px-4 py-4">
          <div class="flex gap-3 h-full" style="min-width: ${STAGES.length * 220}px">
            ${STAGES.map(stage => {
              const stageCands = byStage[stage] || [];
              const dot = STAGE_DOTS[stage] || 'bg-slate-400';
              const badge = STAGE_COLORS[stage] || 'bg-slate-100 text-slate-600';
              return `
                <div class="flex flex-col rounded-2xl bg-slate-50 border border-slate-200 flex-shrink-0" style="width:210px">
                  <!-- Column header -->
                  <div class="px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 ${dot}"></span>
                    <span class="text-xs font-bold text-slate-700 truncate flex-1">${stage}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full ${badge}">${stageCands.length}</span>
                  </div>

                  <!-- Cards scroll area -->
                  <div class="flex-1 overflow-y-auto thin-scroll p-2 space-y-2">
                    ${stageCands.length === 0 ? `
                      <div class="text-center py-8 text-slate-300 text-xs">No candidates</div>
                    ` : stageCands.map(c => {
                      const initials = (c.name || '?').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
                      const avatarColors = ['bg-blue-100 text-blue-600','bg-violet-100 text-violet-600','bg-emerald-100 text-emerald-600','bg-amber-100 text-amber-600','bg-rose-100 text-rose-600'];
                      const av = avatarColors[(c.candidate_id || '').charCodeAt(5) % avatarColors.length] || avatarColors[0];
                      const stale = staleIds.has(c.candidate_id);
                      const score = c.score_total ? parseFloat(c.score_total).toFixed(1) : null;
                      const isDisq = c.status === 'Disqualified';
                      return `
                        <div data-candidate-id="${c.candidate_id}"
                          class="cand-card bg-white rounded-xl border ${stale ? 'border-amber-300' : 'border-slate-200'} p-3 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all ${isDisq ? 'opacity-60' : ''}">
                          <div class="flex items-start gap-2 mb-2">
                            <div class="w-8 h-8 rounded-lg ${av} flex items-center justify-center text-xs font-bold flex-shrink-0">${initials}</div>
                            <div class="flex-1 min-w-0">
                              <p class="text-xs font-bold text-slate-800 truncate">${esc(c.name)}</p>
                              <p class="text-[10px] text-slate-400 truncate">${esc(c.email)}</p>
                            </div>
                          </div>
                          <div class="flex items-center gap-1 flex-wrap">
                            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">${esc(c.source || 'Direct')}</span>
                            ${score ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold">★ ${score}</span>` : ''}
                            ${stale ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600"><i class="fas fa-clock text-[8px]"></i> Idle</span>` : ''}
                            ${isDisq ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-500">Disqualified</span>` : ''}
                          </div>
                          ${parseInt(c.notes_count) > 0 ? `
                            <div class="mt-1.5 text-[10px] text-slate-400"><i class="fas fa-comment-dots mr-1"></i>${c.notes_count} note${c.notes_count != 1 ? 's' : ''}</div>
                          ` : ''}
                        </div>`;
                    }).join('')}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`}

      </div>`;

    // Events
    document.getElementById('job-selector')?.addEventListener('change', async e => {
      selectedJobId = e.target.value || null;
      filterStage = ''; filterSearch = ''; filterSource = '';
      await Promise.all([loadCandidates(), loadDashboard()]);
      render();
    });

    document.getElementById('cand-search')?.addEventListener('input', e => {
      filterSearch = e.target.value;
      render();
    });

    document.getElementById('stage-filter')?.addEventListener('change', e => {
      filterStage = e.target.value;
      render();
    });

    document.getElementById('source-filter')?.addEventListener('change', e => {
      filterSource = e.target.value;
      render();
    });

    document.getElementById('btn-add-candidate')?.addEventListener('click', () => openModal('addCandidate'));
    document.getElementById('btn-add-job-empty')?.addEventListener('click', () => openModal('addJob'));

    body.querySelectorAll('.cand-card').forEach(card => {
      card.addEventListener('click', () => {
        const cid = card.dataset.candidateId;
        openDetailPanel(cid);
      });
    });
  }

  // ================================================================
  //  JOBS TAB
  // ================================================================
  function renderJobsTab(body) {
    body.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-extrabold text-slate-800 text-base">All Job Postings</h2>
          <div class="flex gap-2">
            <button id="btn-add-job-tab" class="btn-primary text-sm"><i class="fas fa-plus"></i> New Job</button>
          </div>
        </div>

        ${jobs.length === 0 ? `
          <div class="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <i class="fas fa-briefcase text-4xl opacity-30"></i>
            <p class="font-semibold">No jobs yet</p>
            <button id="btn-add-job-zero" class="btn-primary text-sm mt-1"><i class="fas fa-plus"></i> Create First Job</button>
          </div>` : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${jobs.map(j => {
            const isOpen = j.status === 'Open';
            return `
              <div class="bg-white rounded-2xl border border-slate-200 p-5 card-hover">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <p class="font-extrabold text-slate-900 text-sm">${esc(j.title)}</p>
                    <p class="text-xs text-slate-400 mt-0.5">${esc(j.department || '—')} · ${esc(j.location || '—')}</p>
                  </div>
                  <span class="text-xs font-bold px-2.5 py-1 rounded-full ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                    ${j.status}
                  </span>
                </div>
                <div class="flex items-center gap-3 text-xs text-slate-500 mb-4">
                  <span><i class="fas fa-users mr-1 text-slate-300"></i>${j.candidate_count || 0} candidates</span>
                  <span><i class="fas fa-user-plus mr-1 text-slate-300"></i>${j.positions || 1} open</span>
                  <span><i class="fas fa-tag mr-1 text-slate-300"></i>${esc(j.type || 'Full-time')}</span>
                </div>
                ${j.salary_min || j.salary_max ? `
                  <p class="text-xs text-slate-400 mb-3">
                    <i class="fas fa-money-bill-wave mr-1 text-slate-300"></i>
                    ${j.salary_min ? fmtCurrency(j.salary_min) : '—'} – ${j.salary_max ? fmtCurrency(j.salary_max) : '—'}
                  </p>` : ''}
                <div class="flex gap-2">
                  <button data-view-job="${j.job_id}" class="btn-primary text-xs flex-1">
                    <i class="fas fa-stream"></i> Pipeline
                  </button>
                  <button data-edit-job="${j.job_id}" class="btn-secondary text-xs">
                    <i class="fas fa-pencil-alt"></i>
                  </button>
                  ${isOpen ? `
                    <button data-close-job="${j.job_id}" class="btn-secondary text-xs text-amber-600 hover:bg-amber-50">
                      <i class="fas fa-times-circle"></i>
                    </button>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>`}
      </div>`;

    body.querySelector('#btn-add-job-tab')?.addEventListener('click', () => openModal('addJob'));
    body.querySelector('#btn-add-job-zero')?.addEventListener('click', () => openModal('addJob'));

    body.querySelectorAll('[data-view-job]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedJobId = btn.dataset.viewJob;
        activeTab = 'pipeline';
        loadCandidates().then(render);
      });
    });

    body.querySelectorAll('[data-edit-job]').forEach(btn => {
      btn.addEventListener('click', () => {
        const j = jobs.find(x => x.job_id === btn.dataset.editJob);
        if (j) openModal('editJob', j);
      });
    });

    body.querySelectorAll('[data-close-job]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Close this job posting?')) return;
        try {
          await api('jobs/close', { job_id: btn.dataset.closeJob });
          toast('Job closed', 'success');
          await loadJobs();
          render();
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  }

  // ================================================================
  //  TEMPLATES TAB
  // ================================================================
  async function renderTemplatesTab(body) {
    if (!templates.length) await loadTemplates();

    body.innerHTML = `
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h2 class="font-extrabold text-slate-800 text-base">Email Templates</h2>
            <p class="text-xs text-slate-400 mt-0.5">Pre-built email copy per hiring stage — use merge tags like <code class="bg-slate-100 px-1 rounded">{{candidate.name}}</code></p>
          </div>
          <button id="btn-new-template" class="btn-primary text-sm"><i class="fas fa-plus"></i> New Template</button>
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700">
          <strong>Available merge tags:</strong>
          <code class="ml-2">{{candidate.name}}</code>
          <code class="ml-2">{{candidate.email}}</code>
          <code class="ml-2">{{candidate.stage}}</code>
          <code class="ml-2">{{job.title}}</code>
          <code class="ml-2">{{job.department}}</code>
          <code class="ml-2">{{job.location}}</code>
          <code class="ml-2">{{job.type}}</code>
        </div>

        ${templates.length === 0 ? `
          <div class="text-center py-16 text-slate-400">
            <i class="fas fa-envelope-open-text text-3xl opacity-30 mb-3"></i>
            <p class="font-semibold">No templates yet</p>
          </div>` : `
        <div class="space-y-3">
          ${templates.map(t => {
            const stageBadge = t.trigger_stage
              ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[t.trigger_stage] || 'bg-slate-100 text-slate-500'}">${t.trigger_stage}</span>`
              : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">No stage trigger</span>`;
            const active = String(t.is_active) === 'true';
            return `
              <div class="bg-white rounded-2xl border border-slate-200 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <p class="font-bold text-slate-800 text-sm">${esc(t.name)}</p>
                      ${stageBadge}
                      ${!active ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Inactive</span>` : ''}
                    </div>
                    <p class="text-xs font-semibold text-slate-500">Subject: ${esc(t.subject)}</p>
                    <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">${esc(t.body).substring(0, 140)}…</p>
                  </div>
                  <div class="flex gap-2 flex-shrink-0">
                    <button data-edit-tmpl="${t.template_id}" class="btn-secondary text-xs"><i class="fas fa-pencil-alt"></i></button>
                    <button data-del-tmpl="${t.template_id}" class="btn-secondary text-xs text-red-500 hover:bg-red-50"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`}
      </div>`;

    body.querySelector('#btn-new-template')?.addEventListener('click', () => openModal('template', {}));

    body.querySelectorAll('[data-edit-tmpl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = templates.find(x => x.template_id === btn.dataset.editTmpl);
        if (t) openModal('template', t);
      });
    });

    body.querySelectorAll('[data-del-tmpl]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this template?')) return;
        try {
          await api('templates/delete', { template_id: btn.dataset.delTmpl });
          toast('Template deleted', 'success');
          await loadTemplates();
          renderTemplatesTab(body);
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  }

  // ================================================================
  //  METRICS TAB
  // ================================================================
  function renderMetricsTab(body) {
    const s = dashData?.summary || {};
    const stageCounts = dashData?.stage_counts || {};
    const funnel      = dashData?.funnel      || [];
    const sources     = sourceData?.sources   || [];

    const statCard = (icon, label, value, sub, color) => `
      <div class="bg-white rounded-2xl border border-slate-200 p-5">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-9 h-9 rounded-xl ${color} bg-opacity-10 flex items-center justify-center">
            <i class="fas ${icon} ${color.replace('bg-','text-')} text-sm"></i>
          </div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">${label}</p>
        </div>
        <p class="text-2xl font-extrabold text-slate-900">${value ?? '—'}</p>
        ${sub ? `<p class="text-xs text-slate-400 mt-1">${sub}</p>` : ''}
      </div>`;

    body.innerHTML = `
      <div class="p-6 space-y-6">

        <!-- KPI row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${statCard('fa-briefcase','Open Jobs', s.open_jobs ?? 0, `${s.closed_jobs ?? 0} closed`, 'bg-blue-500')}
          ${statCard('fa-users','Active Candidates', s.active_candidates ?? 0, `${s.total_candidates ?? 0} total`, 'bg-violet-500')}
          ${statCard('fa-calendar-check','Hired This Month', s.hired_this_month ?? 0, 'Offer acceptance: ' + (s.offer_acceptance ?? 'N/A'), 'bg-emerald-500')}
          ${statCard('fa-stopwatch','Avg. Time to Hire', s.avg_time_to_hire ? s.avg_time_to_hire + ' days' : 'N/A', 'From applied to hired', 'bg-amber-500')}
        </div>

        <!-- Stage funnel + counts -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

          <!-- Stage breakdown -->
          <div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-extrabold text-slate-800 text-sm mb-4">Pipeline Breakdown</h3>
            <div class="space-y-2">
              ${STAGES.map(stage => {
                const count = stageCounts[stage] || 0;
                const max   = Math.max(...Object.values(stageCounts), 1);
                const pct   = Math.round((count / max) * 100);
                const badge = STAGE_COLORS[stage] || 'bg-slate-100 text-slate-600';
                const dot   = STAGE_DOTS[stage]   || 'bg-slate-400';
                return `
                  <div class="flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full flex-shrink-0 ${dot}"></span>
                    <span class="text-xs text-slate-600 w-28 flex-shrink-0">${stage}</span>
                    <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div class="h-full ${dot} rounded-full transition-all" style="width:${pct}%"></div>
                    </div>
                    <span class="text-xs font-bold text-slate-700 w-6 text-right">${count}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Conversion funnel -->
          <div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 class="font-extrabold text-slate-800 text-sm mb-4">Stage Conversion Rates</h3>
            ${funnel.length === 0 ? `<p class="text-xs text-slate-400">Not enough data yet.</p>` : `
            <div class="space-y-2">
              ${funnel.map(f => `
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-slate-500 w-28 truncate flex-shrink-0">${f.from} →</span>
                  <span class="text-slate-700 font-semibold">${f.to}</span>
                  <span class="ml-auto font-bold ${f.conversion === 'N/A' ? 'text-slate-400' : 'text-blue-600'}">${f.conversion}</span>
                </div>`).join('')}
            </div>`}
          </div>

        </div>

        <!-- Source quality -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 class="font-extrabold text-slate-800 text-sm mb-4">Source Quality</h3>
          ${sources.length === 0 ? `<p class="text-xs text-slate-400">No data yet.</p>` : `
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-slate-400 font-semibold uppercase tracking-wide border-b border-slate-100">
                  <th class="pb-2 text-left">Source</th>
                  <th class="pb-2 text-right">Applications</th>
                  <th class="pb-2 text-right">Hired</th>
                  <th class="pb-2 text-right">Quality Rate</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                ${sources.map(s => `
                  <tr>
                    <td class="py-2 font-medium text-slate-700">${esc(s.source)}</td>
                    <td class="py-2 text-right text-slate-600">${s.total}</td>
                    <td class="py-2 text-right text-emerald-600 font-semibold">${s.hired}</td>
                    <td class="py-2 text-right font-bold ${parseInt(s.quality_rate) >= 20 ? 'text-emerald-600' : 'text-slate-500'}">${s.quality_rate}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>

        <!-- Stale candidates -->
        ${staleList.length ? `
          <div class="bg-white rounded-2xl border border-amber-200 p-5">
            <h3 class="font-extrabold text-amber-700 text-sm mb-4 flex items-center gap-2">
              <i class="fas fa-exclamation-triangle text-amber-500"></i>
              Stale Candidates — Idle 48+ Hours
            </h3>
            <div class="space-y-2">
              ${staleList.map(c => `
                <div class="flex items-center gap-3 text-xs">
                  <span class="font-bold text-slate-700">${esc(c.name)}</span>
                  <span class="px-2 py-0.5 rounded-full ${STAGE_COLORS[c.stage] || 'bg-slate-100 text-slate-600'}">${c.stage}</span>
                  <span class="text-slate-400 ml-auto">${c.idle_hours}h idle</span>
                  <button data-stale-cid="${c.candidate_id}" class="btn-secondary text-[10px] py-1 px-2">View</button>
                </div>`).join('')}
            </div>
          </div>` : ''}

      </div>`;

    body.querySelectorAll('[data-stale-cid]').forEach(btn => {
      btn.addEventListener('click', () => openDetailPanel(btn.dataset.staleCid));
    });
  }

  // ================================================================
  //  CANDIDATE DETAIL PANEL
  // ================================================================
  function openDetailPanel(candidateId) {
    const panel   = document.getElementById('rec-detail-panel');
    const overlay = document.getElementById('rec-panel-overlay');
    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
    panel.innerHTML = `<div class="flex items-center justify-center h-32"><i class="fas fa-circle-notch fa-spin text-blue-400 text-xl"></i></div>`;
    overlay.onclick = closeDetailPanel;
    openCandidateDetail(candidateId);
  }

  function closeDetailPanel() {
    document.getElementById('rec-detail-panel')?.classList.add('hidden');
    document.getElementById('rec-panel-overlay')?.classList.add('hidden');
    detailCandidate = null;
  }

  function renderDetailPanel() {
    const panel = document.getElementById('rec-detail-panel');
    if (!panel || !detailCandidate) return;
    const c   = detailCandidate;
    const job = detailJob || {};
    const initials = (c.name || '?').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    const avgScore = c.score_total ? parseFloat(c.score_total).toFixed(1) : null;
    const stageBadge = STAGE_COLORS[c.stage] || 'bg-slate-100 text-slate-600';

    panel.innerHTML = `
      <div class="flex-shrink-0 border-b border-slate-100 bg-white px-5 py-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Candidate Profile</p>
          <button onclick="document.getElementById('rec-detail-panel').classList.add('hidden'); document.getElementById('rec-panel-overlay').classList.add('hidden')"
            class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>

        <!-- Identity -->
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-extrabold text-lg flex-shrink-0">${initials}</div>
          <div class="flex-1 min-w-0">
            <p class="font-extrabold text-slate-900">${esc(c.name)}</p>
            <p class="text-xs text-slate-400">${esc(c.email)}</p>
            ${c.phone ? `<p class="text-xs text-slate-400">${esc(c.phone)}</p>` : ''}
            <div class="flex items-center gap-2 mt-1.5 flex-wrap">
              <span class="text-xs font-bold px-2 py-0.5 rounded-full ${stageBadge}">${c.stage}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">${esc(c.source || 'Direct')}</span>
              ${avgScore ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">★ ${avgScore}</span>` : ''}
              ${c.status === 'Disqualified' ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Disqualified</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Job reference -->
        ${job.title ? `
          <div class="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
            <i class="fas fa-briefcase text-slate-300 mr-1.5"></i>
            <span class="font-semibold text-slate-600">${esc(job.title)}</span>
            ${job.department ? ` · ${esc(job.department)}` : ''}
          </div>` : ''}

        <!-- Quick links -->
        <div class="flex gap-2 mt-3 flex-wrap">
          ${c.resume_url ? `<a href="${esc(c.resume_url)}" target="_blank" class="btn-secondary text-xs"><i class="fas fa-file-pdf"></i> Resume</a>` : ''}
          ${c.linkedin_url ? `<a href="${esc(c.linkedin_url)}" target="_blank" class="btn-secondary text-xs"><i class="fab fa-linkedin"></i> LinkedIn</a>` : ''}
        </div>

        <!-- Action buttons -->
        <div class="flex gap-2 mt-3 flex-wrap">
          <button id="dp-move-stage" class="btn-primary text-xs flex-1"><i class="fas fa-arrow-right"></i> Move Stage</button>
          <button id="dp-compose" class="btn-secondary text-xs"><i class="fas fa-envelope"></i> Email</button>
          <button id="dp-scorecard" class="btn-secondary text-xs"><i class="fas fa-star"></i> Score</button>
          <button id="dp-edit-cand" class="btn-secondary text-xs"><i class="fas fa-pencil-alt"></i></button>
        </div>
      </div>

      <!-- Detail tabs -->
      <div class="flex gap-0 border-b border-slate-100 bg-white flex-shrink-0">
        ${['Notes','Scorecard'].map((t,i) => `
          <button data-detail-tab="${t.toLowerCase()}"
            class="detail-tab-btn flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${i===0 ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}">
            ${t}
          </button>`).join('')}
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto thin-scroll" id="dp-tab-content">
        ${renderDetailNotes()}
      </div>
    `;

    // Detail tab switching
    panel.querySelectorAll('.detail-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.detail-tab-btn').forEach(b => {
          b.classList.toggle('border-blue-500', b === btn);
          b.classList.toggle('text-blue-600',   b === btn);
          b.classList.toggle('border-transparent', b !== btn);
          b.classList.toggle('text-slate-400',  b !== btn);
        });
        const tc = document.getElementById('dp-tab-content');
        if (btn.dataset.detailTab === 'notes')     tc.innerHTML = renderDetailNotes();
        if (btn.dataset.detailTab === 'scorecard') tc.innerHTML = renderDetailScorecards();
        bindDetailTabEvents();
      });
    });

    panel.querySelector('#dp-move-stage')?.addEventListener('click', () => openModal('moveStage', { candidate: c, job }));
    panel.querySelector('#dp-compose')?.addEventListener('click', () => openModal('composeEmail', { candidate: c, job }));
    panel.querySelector('#dp-scorecard')?.addEventListener('click', () => openModal('scorecard', { candidate: c }));
    panel.querySelector('#dp-edit-cand')?.addEventListener('click', () => openModal('editCandidate', c));

    bindDetailTabEvents();
  }

  function renderDetailNotes() {
    const notes = detailNotes;
    return `
      <div class="p-4 space-y-3">
        <!-- Add note -->
        <div class="bg-slate-50 rounded-xl p-3">
          <textarea id="dp-note-input" rows="2"
            placeholder="Add a note…"
            class="field text-sm resize-none bg-white"></textarea>
          <div class="flex justify-end mt-2">
            <button id="dp-note-submit" class="btn-primary text-xs"><i class="fas fa-plus"></i> Add Note</button>
          </div>
        </div>

        ${notes.length === 0 ? `<p class="text-xs text-slate-400 text-center py-4">No notes yet</p>` :
          notes.map(n => `
            <div class="bg-white rounded-xl border border-slate-100 p-3" data-note-id="${n.note_id}">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold text-slate-700">${esc(n.author_name || 'Unknown')}</span>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-slate-400">${fmtDate(n.created_at)}</span>
                  <button data-del-note="${n.note_id}" class="text-slate-300 hover:text-red-400 transition-colors">
                    <i class="fas fa-times text-[10px]"></i>
                  </button>
                </div>
              </div>
              <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">${esc(n.content)}</p>
            </div>`).join('')}
      </div>`;
  }

  function renderDetailScorecards() {
    const scs = detailScorecards;
    return `
      <div class="p-4 space-y-3">
        ${scs.length === 0 ? `
          <p class="text-xs text-slate-400 text-center py-4">No scorecards yet</p>
          <div class="text-center">
            <button id="dp-sc-add" class="btn-primary text-xs"><i class="fas fa-star"></i> Add Scorecard</button>
          </div>` :
          scs.map(sc => {
            const dim = (label, val) => `
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-slate-400 w-24">${label}</span>
                <div class="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-400 rounded-full" style="width:${(parseFloat(val)||0)*20}%"></div>
                </div>
                <span class="text-[10px] font-bold text-slate-700 w-5 text-right">${parseFloat(val||0).toFixed(1)}</span>
              </div>`;
            return `
              <div class="bg-white rounded-xl border border-slate-100 p-3">
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <span class="text-xs font-bold text-slate-700">${esc(sc.reviewer_name || 'Reviewer')}</span>
                    <span class="text-[10px] text-slate-400 ml-2">${esc(sc.stage || '')}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-extrabold text-blue-600">★ ${parseFloat(sc.score_total||0).toFixed(1)}</span>
                    <button data-del-sc="${sc.scorecard_id}" class="text-slate-300 hover:text-red-400">
                      <i class="fas fa-times text-[10px]"></i>
                    </button>
                  </div>
                </div>
                <div class="space-y-1.5">
                  ${dim('Skills',        sc.score_skills)}
                  ${dim('Culture Fit',   sc.score_culture)}
                  ${dim('Communication', sc.score_communication)}
                  ${dim('Experience',    sc.score_experience)}
                </div>
                ${sc.recommendation ? `
                  <p class="text-[10px] mt-2 font-semibold text-slate-500 uppercase tracking-wide">
                    ${sc.recommendation === 'hire' ? '✅ Recommend Hire' : sc.recommendation === 'reject' ? '❌ Recommend Reject' : '⏸ Hold'}
                  </p>` : ''}
                ${sc.notes ? `<p class="text-[10px] text-slate-400 mt-1 leading-relaxed">${esc(sc.notes)}</p>` : ''}
              </div>`;
          }).join('')}
      </div>`;
  }

  function bindDetailTabEvents() {
    const panel = document.getElementById('rec-detail-panel');
    if (!panel) return;

    // Add note
    panel.querySelector('#dp-note-submit')?.addEventListener('click', async () => {
      const input = panel.querySelector('#dp-note-input');
      const content = (input?.value || '').trim();
      if (!content) return;
      try {
        await api('notes/add', {
          candidate_id: detailCandidate.candidate_id,
          job_id:       detailCandidate.job_id,
          author_id:    user.user_id || '',
          author_name:  user.name || user.email || 'Unknown',
          content
        });
        input.value = '';
        toast('Note added', 'success');
        const nRes = await api('notes/list', { candidate_id: detailCandidate.candidate_id });
        detailNotes = nRes.rows || [];
        document.getElementById('dp-tab-content').innerHTML = renderDetailNotes();
        bindDetailTabEvents();
      } catch(e) { toast(e.message, 'error'); }
    });

    // Delete note
    panel.querySelectorAll('[data-del-note]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this note?')) return;
        try {
          await api('notes/delete', { note_id: btn.dataset.delNote });
          toast('Note deleted', 'success');
          const nRes = await api('notes/list', { candidate_id: detailCandidate.candidate_id });
          detailNotes = nRes.rows || [];
          document.getElementById('dp-tab-content').innerHTML = renderDetailNotes();
          bindDetailTabEvents();
        } catch(e) { toast(e.message, 'error'); }
      });
    });

    // Delete scorecard
    panel.querySelectorAll('[data-del-sc]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this scorecard?')) return;
        try {
          await api('scorecards/delete', { scorecard_id: btn.dataset.delSc });
          toast('Scorecard deleted', 'success');
          const scRes = await api('scorecards/list', { candidate_id: detailCandidate.candidate_id });
          detailScorecards = scRes.rows || [];
          // refresh candidate scores
          const cRes = await api('candidates/get', { candidate_id: detailCandidate.candidate_id });
          detailCandidate = cRes.candidate;
          document.getElementById('dp-tab-content').innerHTML = renderDetailScorecards();
          bindDetailTabEvents();
        } catch(e) { toast(e.message, 'error'); }
      });
    });

    panel.querySelector('#dp-sc-add')?.addEventListener('click', () => openModal('scorecard', { candidate: detailCandidate }));
  }

  // ================================================================
  //  MODALS
  // ================================================================
  function openModal(mode, data = {}) {
    modalMode = mode;
    modalData = data;
    const overlay = document.getElementById('rec-modal-overlay');
    const box     = document.getElementById('rec-modal-box');
    overlay.classList.remove('hidden');
    if (mode === 'appAccess') {
      box.innerHTML = buildAppAccessHTML(data);
      bindAppAccessEvents(data);
    } else {
      box.innerHTML = buildModalHTML(mode, data);
      bindModalEvents(mode, data);
    }
  }

  function closeModal() {
    document.getElementById('rec-modal-overlay')?.classList.add('hidden');
    modalMode = null;
    modalData = {};
  }

  function buildModalHTML(mode, data) {
    const hdr = (title, icon) => `
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-extrabold text-slate-900 flex items-center gap-2">
          <i class="fas ${icon} text-blue-500 text-sm"></i> ${title}
        </h3>
        <button id="modal-close" class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700">
          <i class="fas fa-times text-sm"></i>
        </button>
      </div>`;

    const field = (id, label, type='text', value='', placeholder='', opts='') => `
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
        <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${placeholder}"
          class="field text-sm" ${opts}>
      </div>`;

    const textarea = (id, label, value='', rows=3) => `
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
        <textarea id="${id}" rows="${rows}" class="field text-sm resize-none">${esc(value)}</textarea>
      </div>`;

    const select = (id, label, options, value='') => `
      <div>
        <label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
        <select id="${id}" class="field text-sm">
          ${options.map(o => {
            const v = typeof o === 'object' ? o.value : o;
            const l = typeof o === 'object' ? o.label : o;
            return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`;
          }).join('')}
        </select>
      </div>`;

    if (mode === 'addJob' || mode === 'editJob') {
      const j = data || {};
      const isEdit = mode === 'editJob';
      return `
        ${hdr(isEdit ? 'Edit Job' : 'New Job Posting', 'fa-briefcase')}
        <div class="p-6 space-y-4">
          ${field('m-title',   'Job Title *',   'text',   j.title       || '', 'e.g. Senior Developer')}
          <div class="grid grid-cols-2 gap-3">
            ${field('m-dept',  'Department',    'text',   j.department  || '', 'Engineering')}
            ${field('m-loc',   'Location',      'text',   j.location    || '', 'Remote / City')}
          </div>
          <div class="grid grid-cols-2 gap-3">
            ${select('m-type', 'Job Type', ['Full-time','Part-time','Contract','Internship','Freelance'], j.type || 'Full-time')}
            ${select('m-status','Status', ['Open','On Hold','Closed'], j.status || 'Open')}
          </div>
          <div class="grid grid-cols-2 gap-3">
            ${field('m-salmin','Salary Min',    'number', j.salary_min  || '', '0')}
            ${field('m-salmax','Salary Max',    'number', j.salary_max  || '', '0')}
          </div>
          ${field('m-positions','Open Positions','number', j.positions || 1, '1')}
          ${textarea('m-desc', 'Job Description', j.description || '', 4)}
          ${textarea('m-req',  'Requirements',    j.requirements || '', 3)}
          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-submit" class="btn-primary flex-1">${isEdit ? 'Save Changes' : 'Create Job'}</button>
          </div>
        </div>`;
    }

    if (mode === 'addCandidate') {
      return `
        ${hdr('Add Candidate', 'fa-user-plus')}
        <div class="p-6 space-y-4">
          ${field('m-name',  'Full Name *',  'text',  '', 'Jane Smith')}
          ${field('m-email', 'Email',        'email', '', 'jane@example.com')}
          ${field('m-phone', 'Phone',        'tel',   '', '+1 555 000 0000')}
          ${select('m-source','Source', SOURCES, 'Direct')}
          ${field('m-resume',   'Resume URL',   'url', '', 'https://')}
          ${field('m-linkedin', 'LinkedIn URL', 'url', '', 'https://linkedin.com/in/')}
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Knockout Questions (optional)</label>
            <div class="bg-slate-50 rounded-xl p-3 space-y-2 text-xs text-slate-500">
              <p>Add pass/fail criteria — candidates who trigger a disqualifier will be flagged.</p>
              <div id="knockout-rows" class="space-y-2"></div>
              <button id="add-ko-row" class="btn-secondary text-xs mt-1"><i class="fas fa-plus"></i> Add Question</button>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-submit" class="btn-primary flex-1">Add Candidate</button>
          </div>
        </div>`;
    }

    if (mode === 'editCandidate') {
      const c = data || {};
      return `
        ${hdr('Edit Candidate', 'fa-user-edit')}
        <div class="p-6 space-y-4">
          ${field('m-name',     'Full Name *',  'text',  c.name     || '', 'Jane Smith')}
          ${field('m-email',    'Email',        'email', c.email    || '')}
          ${field('m-phone',    'Phone',        'tel',   c.phone    || '')}
          ${select('m-source',  'Source', SOURCES, c.source || 'Direct')}
          ${field('m-resume',   'Resume URL',   'url',   c.resume_url   || '')}
          ${field('m-linkedin', 'LinkedIn URL', 'url',   c.linkedin_url || '')}
          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-submit" class="btn-primary flex-1">Save Changes</button>
          </div>
        </div>`;
    }

    if (mode === 'moveStage') {
      const c = (data.candidate || {});
      const currentIdx = STAGES.indexOf(c.stage);
      return `
        ${hdr('Move Stage', 'fa-arrow-right')}
        <div class="p-6 space-y-4">
          <div class="bg-slate-50 rounded-xl p-3 text-sm">
            <p class="font-bold text-slate-800">${esc(c.name)}</p>
            <p class="text-xs text-slate-400 mt-0.5">Currently: <strong>${c.stage}</strong></p>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-2">Move to Stage</label>
            <div class="grid grid-cols-2 gap-2">
              ${STAGES.map((s, idx) => {
                const badge = STAGE_COLORS[s] || 'bg-slate-100 text-slate-600';
                const isCurrent = s === c.stage;
                return `
                  <button data-stage-pick="${s}"
                    class="stage-pick-btn text-left px-3 py-2.5 rounded-xl border-2 transition-all text-xs font-semibold
                      ${isCurrent ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-blue-300 text-slate-600'}">
                    <span class="w-2 h-2 rounded-full inline-block mr-1.5 ${STAGE_DOTS[s]}"></span>
                    ${s}
                  </button>`;
              }).join('')}
            </div>
          </div>
          ${textarea('m-reason', 'Reason / Notes (optional)', '', 2)}
          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-submit" class="btn-primary flex-1" disabled>Move Candidate</button>
          </div>
        </div>`;
    }

    if (mode === 'scorecard') {
      const c = (data.candidate || {});
      const slider = (id, label) => `
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-bold text-slate-600">${label}</label>
            <span id="${id}-val" class="text-xs font-extrabold text-blue-600">3</span>
          </div>
          <input id="${id}" type="range" min="1" max="5" step="0.5" value="3"
            class="w-full h-2 rounded accent-blue-600"
            oninput="document.getElementById('${id}-val').textContent = this.value">
        </div>`;
      return `
        ${hdr('Submit Scorecard', 'fa-star')}
        <div class="p-6 space-y-4">
          <div class="bg-slate-50 rounded-xl p-3 text-sm">
            <p class="font-bold text-slate-800">${esc(c.name || '')}</p>
            <p class="text-xs text-slate-400 mt-0.5">Stage: <strong>${c.stage || '—'}</strong></p>
          </div>
          ${slider('sc-skills',  'Skills (1–5)')}
          ${slider('sc-culture', 'Culture Fit (1–5)')}
          ${slider('sc-comm',    'Communication (1–5)')}
          ${slider('sc-exp',     'Experience Relevance (1–5)')}
          ${select('sc-rec', 'Recommendation', [
            { value: '', label: 'No recommendation' },
            { value: 'hire',   label: '✅ Recommend Hire' },
            { value: 'hold',   label: '⏸ Hold' },
            { value: 'reject', label: '❌ Recommend Reject' }
          ], '')}
          ${textarea('sc-notes', 'Additional Notes', '', 2)}
          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-submit" class="btn-primary flex-1">Submit Scorecard</button>
          </div>
        </div>`;
    }

    if (mode === 'composeEmail') {
      const c   = data.candidate || {};
      const job = data.job       || {};
      return `
        ${hdr('Compose Email', 'fa-envelope')}
        <div class="p-6 space-y-4">
          <div class="bg-slate-50 rounded-xl p-3 flex items-center gap-3 text-sm">
            <i class="fas fa-user text-slate-400"></i>
            <div>
              <p class="font-bold text-slate-700">${esc(c.name)}</p>
              <p class="text-xs text-slate-400">${esc(c.email)}</p>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Load Template</label>
            <select id="m-tmpl-pick" class="field text-sm">
              <option value="">— Select a template —</option>
              ${templates.map(t => `<option value="${t.template_id}">${esc(t.name)} ${t.trigger_stage ? '('+t.trigger_stage+')' : ''}</option>`).join('')}
            </select>
          </div>

          <div class="border-t border-slate-100 pt-3 space-y-3">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">To</label>
              <input id="m-to" type="email" value="${esc(c.email)}" class="field text-sm" readonly>
            </div>
            ${field('m-subject', 'Subject *', 'text', '', 'Email subject…')}
            ${textarea('m-body', 'Body *', '', 8)}
          </div>

          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            <i class="fas fa-info-circle mr-1"></i> Copy the composed email to send via your email client.
          </div>

          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-copy-email" class="btn-primary flex-1"><i class="fas fa-copy"></i> Copy Email</button>
          </div>
        </div>`;
    }

    if (mode === 'template') {
      const t = data || {};
      const isEdit = !!t.template_id;
      return `
        ${hdr(isEdit ? 'Edit Template' : 'New Template', 'fa-envelope-open-text')}
        <div class="p-6 space-y-4">
          ${field('m-tname', 'Template Name *', 'text', t.name || '', 'e.g. Interview Invite')}
          ${select('m-tstage', 'Stage Trigger (optional)', [
            { value: '', label: '— No trigger —' },
            ...STAGES.map(s => ({ value: s, label: s }))
          ], t.trigger_stage || '')}
          ${field('m-tsubject', 'Subject Line *', 'text', t.subject || '', 'Email subject…')}
          ${textarea('m-tbody', 'Body * (use {{candidate.name}}, {{job.title}}, etc.)', t.body || '', 10)}
          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="m-tactive" type="checkbox" class="w-4 h-4 accent-blue-600" ${String(t.is_active) !== 'false' ? 'checked' : ''}>
              <span class="text-sm font-semibold text-slate-700">Active</span>
            </label>
          </div>
          <div class="flex gap-3 pt-2">
            <button id="modal-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="modal-submit" class="btn-primary flex-1">${isEdit ? 'Save Changes' : 'Create Template'}</button>
          </div>
        </div>`;
    }

    return `<div class="p-6 text-slate-400 text-sm">Unknown modal: ${mode}</div>`;
  }

  // ── App Access modal — shown after choosing "Hired" ──────────────
  function buildAppAccessHTML(data) {
    const c = data.candidate || {};
    const initials = (c.name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    return `
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-extrabold text-slate-900 flex items-center gap-2">
          <i class="fas fa-user-shield text-emerald-500 text-sm"></i> App Access
        </h3>
        <button id="modal-close" class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700">
          <i class="fas fa-times text-sm"></i>
        </button>
      </div>
      <div class="p-6 space-y-5">

        <!-- Candidate summary -->
        <div class="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-extrabold flex-shrink-0">${initials}</div>
          <div>
            <p class="font-extrabold text-slate-900 text-sm">${esc(c.name || '')}</p>
            <p class="text-xs text-slate-400">${esc(c.email || '')}</p>
          </div>
          <span class="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
            <i class="fas fa-check-circle mr-1"></i>Hired
          </span>
        </div>

        <!-- Question -->
        <div class="text-center space-y-1">
          <p class="font-extrabold text-slate-800 text-base">Will this employee need app access?</p>
          <p class="text-xs text-slate-400">Choose whether this employee will have access to log into the app.</p>
        </div>

        <!-- Choice buttons -->
        <div class="grid grid-cols-2 gap-3">
          <button id="app-access-no"
            class="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-slate-600">
            <i class="fas fa-times-circle text-2xl text-slate-400"></i>
            <span class="font-extrabold text-sm">No</span>
            <span class="text-[11px] text-slate-400 text-center leading-tight">Add as Contractor<br>access disabled</span>
          </button>
          <button id="app-access-yes"
            class="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-600">
            <i class="fas fa-check-circle text-2xl text-blue-400"></i>
            <span class="font-extrabold text-sm">Yes</span>
            <span class="text-[11px] text-slate-400 text-center leading-tight">Add as Employee<br>open profile to complete</span>
          </button>
        </div>

        <div id="app-access-status" class="hidden text-sm text-center py-2"></div>

        <button id="modal-cancel" class="btn-secondary w-full text-sm">Cancel</button>
      </div>
    `;
  }

  // ================================================================
  //  APP ACCESS MODAL LOGIC
  // ================================================================
  function bindAppAccessEvents(data) {
    const box = document.getElementById('rec-modal-box');
    if (!box) return;

    const c      = data.candidate || {};
    const reason = data.reason    || '';

    box.querySelector('#modal-close')?.addEventListener('click', closeModal);
    box.querySelector('#modal-cancel')?.addEventListener('click', closeModal);
    document.getElementById('rec-modal-overlay').onclick = e => {
      if (e.target === document.getElementById('rec-modal-overlay')) closeModal();
    };

    const setStatus = (msg, ok) => {
      const el = box.querySelector('#app-access-status');
      if (!el) return;
      el.classList.remove('hidden');
      el.innerHTML = `<span class="${ok ? 'text-emerald-600' : 'text-red-500'}">${msg}</span>`;
    };

    const disableBtns = () => {
      ['#app-access-no', '#app-access-yes', '#modal-cancel'].forEach(sel => {
        const b = box.querySelector(sel);
        if (b) b.disabled = true;
      });
    };

    // Shared: call complete-hire (always creates the user in USERS sheet)
    async function doCompleteHire(role, active) {
      const tempPass = 'WV-' + Math.random().toString(36).slice(2, 8).toUpperCase()
                     + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

      const res = await api('candidates/complete-hire', {
        candidate_id: c.candidate_id,
        role,
        active,
        password:     tempPass,
        reason,
        moved_by:     user.user_id || '',
        mover_name:   user.name    || user.email || 'System'
      });

      if (res.error) throw new Error(res.error);
      return res;
    }

    // ── NO: create user as Contractor with active = false ──────────
    box.querySelector('#app-access-no')?.addEventListener('click', async () => {
      try {
        disableBtns();
        setStatus('<i class="fas fa-circle-notch fa-spin mr-1"></i>Processing…', true);

        const res = await doCompleteHire('Contractor', 'false');

        toast(`${c.name || 'Candidate'} hired — added as Contractor with access disabled`, 'success');
        closeModal();
        closeDetailPanel();
        await loadCandidates();
        await loadDashboard();
        render();
      } catch(e) { setStatus(e.message, false); }
    });

    // ── YES: create user with active = true, then open Edit User form
    box.querySelector('#app-access-yes')?.addEventListener('click', async () => {
      try {
        disableBtns();
        setStatus('<i class="fas fa-circle-notch fa-spin mr-1"></i>Processing…', true);

        const res = await doCompleteHire('Employee', 'true');
        const newUserId = res.user_account?.user_id || null;

        toast(`${c.name || 'Candidate'} hired — opening user profile…`, 'success');
        closeModal();
        closeDetailPanel();
        await loadCandidates();
        await loadDashboard();
        render();

        // Navigate to Settings → User Management → open Edit User form for the new user.
        // loadUsers() inside settingsTab is async with no callback, so we can't know
        // exactly when usersCache is ready. Instead we poll: call usersOpenEdit() every
        // 300ms and stop as soon as #user-modal-backdrop loses its 'hidden' class.
        setTimeout(() => {
          if (window.WorkVolt?.navigate) window.WorkVolt.navigate('settings');

          setTimeout(() => {
            if (typeof window.settingsTab === 'function') window.settingsTab('users');

            if (newUserId) {
              let attempts = 0;
              const tryOpen = () => {
                attempts++;
                if (typeof window.usersOpenEdit === 'function') {
                  window.usersOpenEdit(newUserId);
                }
                const backdrop = document.getElementById('user-modal-backdrop');
                if (backdrop && !backdrop.classList.contains('hidden')) {
                  // Modal opened successfully
                  window.WorkVolt?.toast(
                    'User created with access enabled. Complete the profile details here.',
                    'info'
                  );
                } else if (attempts < 25) {
                  setTimeout(tryOpen, 300); // loadUsers still running, retry in 300ms
                }
              };
              setTimeout(tryOpen, 600); // give loadUsers a head start
            }
          }, 400);
        }, 600);

      } catch(e) { setStatus(e.message, false); }
    });
  }
  function bindModalEvents(mode, data) {
    const box = document.getElementById('rec-modal-box');
    if (!box) return;

    box.querySelector('#modal-close')?.addEventListener('click',  closeModal);
    box.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

    // Close on overlay click
    document.getElementById('rec-modal-overlay').onclick = e => {
      if (e.target === document.getElementById('rec-modal-overlay')) closeModal();
    };

    // ── Stage pick for moveStage ──
    if (mode === 'moveStage') {
      let pickedStage = null;
      box.querySelectorAll('.stage-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          pickedStage = btn.dataset.stagePick;
          box.querySelectorAll('.stage-pick-btn').forEach(b => {
            b.classList.toggle('border-blue-400', b === btn);
            b.classList.toggle('bg-blue-50',      b === btn);
            b.classList.toggle('text-blue-700',   b === btn);
            b.classList.toggle('border-slate-200',b !== btn);
          });
          box.querySelector('#modal-submit').disabled = false;
        });
      });

      box.querySelector('#modal-submit')?.addEventListener('click', async () => {
        if (!pickedStage) return;
        const reason = box.querySelector('#m-reason')?.value?.trim() || '';

        // ── Intercept "Hired" → show app-access prompt first ──
        if (pickedStage === 'Hired') {
          closeModal();
          openModal('appAccess', { candidate: data.candidate, job: data.job, reason });
          return;
        }

        try {
          const res = await api('candidates/move-stage', {
            candidate_id: data.candidate.candidate_id,
            stage:        pickedStage,
            reason,
            moved_by:    user.user_id || '',
            mover_name:  user.name    || user.email || 'Unknown'
          });
          toast(`Moved to ${pickedStage}`, 'success');

          // Show email template suggestion if returned
          if (res.email_template) {
            toast(`📧 Tip: Email template "${res.email_template.name}" is available for this stage`, 'info', 5000);
          }

          closeModal();
          closeDetailPanel();
          await loadCandidates();
          await loadDashboard();
          render();
        } catch(e) { toast(e.message, 'error'); }
      });
    }

    // ── Knockout rows for addCandidate ──
    if (mode === 'addCandidate') {
      let koRows = [];
      const koContainer = box.querySelector('#knockout-rows');
      box.querySelector('#add-ko-row')?.addEventListener('click', () => {
        const idx = koRows.length;
        koRows.push({ question: '', disqualify_if: 'no' });
        const row = document.createElement('div');
        row.className = 'flex gap-2 items-center';
        row.innerHTML = `
          <input data-ko-q="${idx}" type="text" placeholder="Question…" class="field text-xs flex-1">
          <select data-ko-dq="${idx}" class="field text-xs" style="width:90px">
            <option value="yes">if Yes</option>
            <option value="no" selected>if No</option>
          </select>
          <button data-ko-del="${idx}" class="text-red-400 hover:text-red-600 text-xs px-1">✕</button>`;
        koContainer.appendChild(row);
        row.querySelector(`[data-ko-del="${idx}"]`).onclick = () => row.remove();
      });
    }

    // ── Scorecard submit ──
    if (mode === 'scorecard') {
      box.querySelector('#modal-submit')?.addEventListener('click', async () => {
        try {
          await api('scorecards/submit', {
            candidate_id:        data.candidate.candidate_id,
            job_id:              data.candidate.job_id || '',
            reviewer_id:         user.user_id || '',
            reviewer_name:       user.name || user.email || 'Unknown',
            stage:               data.candidate.stage,
            score_skills:        box.querySelector('#sc-skills')?.value || 3,
            score_culture:       box.querySelector('#sc-culture')?.value || 3,
            score_communication: box.querySelector('#sc-comm')?.value || 3,
            score_experience:    box.querySelector('#sc-exp')?.value || 3,
            recommendation:      box.querySelector('#sc-rec')?.value || '',
            notes:               box.querySelector('#sc-notes')?.value?.trim() || ''
          });
          toast('Scorecard submitted', 'success');
          closeModal();
          // Refresh detail panel if open
          if (detailCandidate?.candidate_id === data.candidate.candidate_id) {
            await openCandidateDetail(data.candidate.candidate_id);
          }
        } catch(e) { toast(e.message, 'error'); }
      });
    }

    // ── Add / Edit Job ──
    if (mode === 'addJob' || mode === 'editJob') {
      box.querySelector('#modal-submit')?.addEventListener('click', async () => {
        const title = box.querySelector('#m-title')?.value?.trim();
        if (!title) { toast('Job title is required', 'error'); return; }
        const params = {
          title,
          department:   box.querySelector('#m-dept')?.value?.trim(),
          location:     box.querySelector('#m-loc')?.value?.trim(),
          type:         box.querySelector('#m-type')?.value,
          status:       box.querySelector('#m-status')?.value,
          salary_min:   box.querySelector('#m-salmin')?.value,
          salary_max:   box.querySelector('#m-salmax')?.value,
          positions:    box.querySelector('#m-positions')?.value,
          description:  box.querySelector('#m-desc')?.value?.trim(),
          requirements: box.querySelector('#m-req')?.value?.trim(),
          created_by:   user.user_id || user.name || ''
        };
        try {
          if (mode === 'editJob') {
            await api('jobs/update', { ...params, job_id: data.job_id });
            toast('Job updated', 'success');
          } else {
            const res = await api('jobs/create', params);
            selectedJobId = res.job_id;
            toast('Job created', 'success');
          }
          closeModal();
          await loadJobs();
          if (activeTab === 'pipeline') {
            await loadCandidates();
            await loadDashboard();
          }
          render();
        } catch(e) { toast(e.message, 'error'); }
      });
    }

    // ── Add Candidate ──
    if (mode === 'addCandidate') {
      box.querySelector('#modal-submit')?.addEventListener('click', async () => {
        const name = box.querySelector('#m-name')?.value?.trim();
        if (!name) { toast('Name is required', 'error'); return; }

        // Collect knockout answers
        const koQs   = box.querySelectorAll('[data-ko-q]');
        const koDQs  = box.querySelectorAll('[data-ko-dq]');
        const answers = [];
        koQs.forEach((q, i) => {
          if (q.value.trim()) {
            answers.push({ question: q.value.trim(), disqualify_if: koDQs[i]?.value || 'no', answer: '' });
          }
        });

        try {
          await api('candidates/create', {
            name,
            job_id:           selectedJobId,
            email:            box.querySelector('#m-email')?.value?.trim(),
            phone:            box.querySelector('#m-phone')?.value?.trim(),
            source:           box.querySelector('#m-source')?.value,
            resume_url:       box.querySelector('#m-resume')?.value?.trim(),
            linkedin_url:     box.querySelector('#m-linkedin')?.value?.trim(),
            knockout_answers: answers.length ? JSON.stringify(answers) : ''
          });
          toast('Candidate added', 'success');
          closeModal();
          await loadCandidates();
          render();
        } catch(e) { toast(e.message, 'error'); }
      });
    }

    // ── Edit Candidate ──
    if (mode === 'editCandidate') {
      box.querySelector('#modal-submit')?.addEventListener('click', async () => {
        try {
          await api('candidates/update', {
            candidate_id: data.candidate_id,
            name:         box.querySelector('#m-name')?.value?.trim(),
            email:        box.querySelector('#m-email')?.value?.trim(),
            phone:        box.querySelector('#m-phone')?.value?.trim(),
            source:       box.querySelector('#m-source')?.value,
            resume_url:   box.querySelector('#m-resume')?.value?.trim(),
            linkedin_url: box.querySelector('#m-linkedin')?.value?.trim()
          });
          toast('Candidate updated', 'success');
          closeModal();
          await loadCandidates();
          if (detailCandidate?.candidate_id === data.candidate_id) {
            await openCandidateDetail(data.candidate_id);
          }
          render();
        } catch(e) { toast(e.message, 'error'); }
      });
    }

    // ── Template save ──
    if (mode === 'template') {
      box.querySelector('#modal-submit')?.addEventListener('click', async () => {
        const name    = box.querySelector('#m-tname')?.value?.trim();
        const subject = box.querySelector('#m-tsubject')?.value?.trim();
        const body_   = box.querySelector('#m-tbody')?.value?.trim();
        if (!name || !subject || !body_) { toast('Name, subject, and body are required', 'error'); return; }
        try {
          await api('templates/save', {
            template_id:   data.template_id || '',
            name,
            trigger_stage: box.querySelector('#m-tstage')?.value,
            subject,
            body:          body_,
            is_active:     box.querySelector('#m-tactive')?.checked ? 'true' : 'false'
          });
          toast('Template saved', 'success');
          closeModal();
          await loadTemplates();
          const body = document.getElementById('rec-body');
          if (body) renderTemplatesTab(body);
        } catch(e) { toast(e.message, 'error'); }
      });
    }

    // ── Compose email ──
    if (mode === 'composeEmail') {
      if (!templates.length) {
        loadTemplates().then(() => {
          const sel = box.querySelector('#m-tmpl-pick');
          if (sel) {
            sel.innerHTML = `<option value="">— Select a template —</option>` +
              templates.map(t => `<option value="${t.template_id}">${esc(t.name)}${t.trigger_stage ? ' ('+t.trigger_stage+')':''}</option>`).join('');
          }
        });
      }

      box.querySelector('#m-tmpl-pick')?.addEventListener('change', async e => {
        const tid = e.target.value;
        if (!tid) return;
        try {
          const res = await api('templates/preview', {
            template_id:  tid,
            candidate_id: data.candidate.candidate_id
          });
          const preview = res.preview || {};
          if (preview.subject) box.querySelector('#m-subject').value = preview.subject;
          if (preview.body)    box.querySelector('#m-body').value    = preview.body;
        } catch(err) { toast('Could not load template preview', 'error'); }
      });

      box.querySelector('#modal-copy-email')?.addEventListener('click', () => {
        const subject = box.querySelector('#m-subject')?.value?.trim();
        const body_   = box.querySelector('#m-body')?.value?.trim();
        const to      = box.querySelector('#m-to')?.value?.trim();
        if (!subject || !body_) { toast('Subject and body required', 'error'); return; }
        const full = `To: ${to}\nSubject: ${subject}\n\n${body_}`;
        navigator.clipboard?.writeText(full).then(() => {
          toast('Email copied to clipboard', 'success');
          closeModal();
        }).catch(() => toast('Could not copy — please select manually', 'error'));
      });
    }
  }

  // ================================================================
  //  GLOBAL BIND EVENTS
  // ================================================================
  function bindTabEvents() {
    document.getElementById('rec-tabs')?.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.toggle('bg-blue-600', b === btn);
          b.classList.toggle('text-white',  b === btn);
          b.classList.toggle('text-slate-500', b !== btn);
          b.classList.toggle('hover:bg-slate-100', b !== btn);
        });
        const body = document.getElementById('rec-body');
        if (!body) return;
        if (activeTab === 'templates') {
          await loadTemplates();
          renderTemplatesTab(body);
        } else if (activeTab === 'metrics') {
          await loadDashboard();
          renderMetricsTab(body);
        } else {
          render();
        }
      });
    });
  }

  function bindHeaderEvents() {
    document.getElementById('btn-add-job')?.addEventListener('click', () => openModal('addJob'));
  }

  // ================================================================
  //  UTILITIES
  // ================================================================
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch(e) { return '—'; }
  }

  function fmtCurrency(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  // ================================================================
  //  BOOT
  // ================================================================
  loadAll();
};
