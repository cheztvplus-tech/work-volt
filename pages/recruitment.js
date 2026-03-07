window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['recruiting'] = function(container) {

  // ── Auth guard ─────────────────────────────────────────────────
  const user = window.WorkVolt?.user() || {};
  if (!['SuperAdmin', 'Admin', 'Manager'].includes(user.role)) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <i class="fas fa-lock text-4xl"></i>
        <p class="font-semibold">Access restricted</p>
      </div>`;
    return;
  }

  // ── Core Pipeline Configuration ────────────────────────────────
  const PIPELINE_STAGES = [
    { id: 'applied', label: 'Applied', icon: 'fa-inbox', color: 'bg-blue-50', borderColor: 'border-blue-200', bgDot: 'bg-blue-500', description: 'New applications', passCriteria: 'Complete application form', timeframe: '24h' },
    { id: 'screened', label: 'Screened', icon: 'fa-eye', color: 'bg-indigo-50', borderColor: 'border-indigo-200', bgDot: 'bg-indigo-500', description: 'Resume reviewed', passCriteria: 'Required skills match', timeframe: '48h' },
    { id: 'qualified', label: 'Qualified', icon: 'fa-check', color: 'bg-cyan-50', borderColor: 'border-cyan-200', bgDot: 'bg-cyan-500', description: 'Phone/video screening', passCriteria: 'Communication score ≥ 3', timeframe: '72h' },
    { id: 'interview', label: 'Interview', icon: 'fa-video', color: 'bg-emerald-50', borderColor: 'border-emerald-200', bgDot: 'bg-emerald-500', description: 'Full technical interview', passCriteria: 'Skills score ≥ 4', timeframe: '5 days' },
    { id: 'final', label: 'Final Round', icon: 'fa-handshake', color: 'bg-amber-50', borderColor: 'border-amber-200', bgDot: 'bg-amber-500', description: 'Executive/team interview', passCriteria: 'Culture fit score ≥ 3', timeframe: '5 days' },
    { id: 'offer', label: 'Offer', icon: 'fa-file-contract', color: 'bg-orange-50', borderColor: 'border-orange-200', bgDot: 'bg-orange-500', description: 'Offer extended', passCriteria: 'Reference check passed', timeframe: '3 days' },
    { id: 'hired', label: 'Hired', icon: 'fa-check-circle', color: 'bg-green-50', borderColor: 'border-green-200', bgDot: 'bg-green-600', description: 'Hired & onboarded', passCriteria: 'Offer accepted', timeframe: '1 day' },
    { id: 'rejected', label: 'Rejected', icon: 'fa-times', color: 'bg-red-50', borderColor: 'border-red-200', bgDot: 'bg-red-500', description: 'Not selected', passCriteria: 'N/A', timeframe: '—' },
  ];

  const REJECTION_REASON = [
    'Skills mismatch',
    'Experience gap',
    'Communication issues',
    'Cultural fit concerns',
    'Salary expectation mismatch',
    'Availability issues',
    'Failed assessments',
    'Other reason'
  ];

  const SCORING_CATEGORIES = [
    { id: 'skills', label: 'Technical Skills', icon: 'fa-code', description: 'Relevant technical abilities' },
    { id: 'experience', label: 'Experience Relevance', icon: 'fa-briefcase', description: 'Applicable past experience' },
    { id: 'culture', label: 'Culture Fit', icon: 'fa-heart', description: 'Team alignment & values' },
    { id: 'communication', label: 'Communication', icon: 'fa-comments', description: 'Clear & articulate expression' },
  ];

  const JOB_SOURCES = [
    'Career Website',
    'LinkedIn',
    'Indeed',
    'Referral',
    'Job Board',
    'Recruiter',
    'Social Media',
    'Other'
  ];

  // ── API Config ──────────────────────────────────────────────────
  const savedUrl = localStorage.getItem('wv_gas_url') || '';
  const savedSecret = localStorage.getItem('wv_api_secret') || '';
  const isConnected = !!(savedUrl && savedSecret);

  async function api(path, params = {}) {
    if (!isConnected) throw new Error('Not connected to backend');
    const url = new URL(savedUrl);
    url.searchParams.set('path', path);
    url.searchParams.set('token', savedSecret);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, JSON.stringify(v));
    });
    const res = await fetch(url.toString(), { cache: 'no-cache' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ── State ────────────────────────────────────────────────────────
  let candidates = []; // All candidate objects
  let jobs = [];       // All open positions
  let view = 'board'; // 'board' | 'list' | 'analytics'
  let activeJobId = null;
  let filterStage = null;
  let searchQuery = '';
  let selectedCandidateId = null;
  let editingCandidateId = null;
  let sortBy = 'dateAdded'; // 'dateAdded' | 'name' | 'score'
  let loading = true;

  // ── Load initial data ────────────────────────────────────────────
  async function loadData() {
    try {
      loading = true;
      if (isConnected) {
        const candResult = await api('recruitment/list/candidates');
        candidates = candResult.rows || [];
        const jobResult = await api('recruitment/list/jobs');
        jobs = jobResult.rows || [];
      }
    } catch (e) {
      console.log('Backend load error:', e.message);
      // Fall back to localStorage
      const stored = localStorage.getItem('wv_recruiting_data');
      if (stored) {
        const data = JSON.parse(stored);
        candidates = data.candidates || [];
        jobs = data.jobs || [];
      }
    } finally {
      loading = false;
      if (jobs.length === 0) initializeSampleData();
    }
  }

  function saveData() {
    // If connected to backend, data is auto-saved via API
    // Otherwise, save to localStorage for offline mode
    if (!isConnected) {
      localStorage.setItem('wv_recruiting_data', JSON.stringify({ candidates, jobs }));
    }
  }

  function initializeSampleData() {
    jobs = [
      {
        id: 'job1',
        title: 'Senior Frontend Engineer',
        department: 'Engineering',
        status: 'open',
        createdAt: new Date().toISOString(),
        requiredSkills: 'React, TypeScript, CSS',
        level: 'Senior',
        type: 'Full-time'
      },
      {
        id: 'job2',
        title: 'Product Manager',
        department: 'Product',
        status: 'open',
        createdAt: new Date().toISOString(),
        requiredSkills: 'Product Strategy, Analytics',
        level: 'Mid',
        type: 'Full-time'
      }
    ];

    candidates = [
      {
        id: 'cand1',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        phone: '555-0101',
        jobId: 'job1',
        source: 'LinkedIn',
        stage: 'qualified',
        appliedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        currentStageAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        scoreSkills: 4,
        scoreExperience: 4,
        scoreCulture: 3,
        scoreCommunication: 4,
        rejectionReason: '',
        notes: 'Strong React background, impressed with system design knowledge',
        interviewNotes: '[]',
        resume: 'Frontend Engineer with 6 years experience',
        avatar: '👩‍💼'
      },
      {
        id: 'cand2',
        name: 'Bob Smith',
        email: 'bob@example.com',
        phone: '555-0102',
        jobId: 'job1',
        source: 'Referral',
        stage: 'interview',
        appliedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        currentStageAt: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString(),
        scoreSkills: 5,
        scoreExperience: 4,
        scoreCulture: 4,
        scoreCommunication: 5,
        rejectionReason: '',
        notes: 'Referred by John Doe, excellent fit',
        interviewNotes: '[]',
        resume: 'Full-stack developer with leadership experience',
        avatar: '👨‍💼'
      }
    ];

    saveData();
  }

  // ── Utility functions ────────────────────────────────────────────
  function getStageIndex(stageId) {
    return PIPELINE_STAGES.findIndex(s => s.id === stageId);
  }

  function getStageLabel(stageId) {
    return PIPELINE_STAGES.find(s => s.id === stageId)?.label || stageId;
  }

  function getJobTitle(jobId) {
    return jobs.find(j => j.id === jobId)?.title || 'Unknown Position';
  }

  function timeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'now';
  }

  function calculateAverageScore(candidate) {
    if (!candidate) return 0;
    const scores = [
      parseFloat(candidate.scoreSkills) || 0,
      parseFloat(candidate.scoreExperience) || 0,
      parseFloat(candidate.scoreCulture) || 0,
      parseFloat(candidate.scoreCommunication) || 0
    ];
    return (scores.reduce((a, b) => a + b, 0) / 4).toFixed(1);
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getTimeInStage(candidate) {
    const now = Date.now();
    const stageTime = now - candidate.currentStageAt;
    const days = Math.floor(stageTime / (1000 * 60 * 60 * 24));
    return `${days}d`;
  }

  // ── Candidate operations ─────────────────────────────────────────
  function createCandidate(data) {
    if (isConnected) {
      api('recruitment/create/candidate', data).then(() => {
        loadData().then(() => renderBoard());
      }).catch(err => showToast('error', 'Failed to create candidate: ' + err.message));
      return;
    }
    
    const candidate = {
      id: 'cand_' + Date.now(),
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      jobId: data.jobId || null,
      source: data.source || 'Career Website',
      stage: 'applied',
      appliedAt: new Date().toISOString(),
      currentStageAt: new Date().toISOString(),
      scoreSkills: 0,
      scoreExperience: 0,
      scoreCulture: 0,
      scoreCommunication: 0,
      rejectionReason: '',
      notes: data.notes || '',
      interviewNotes: '[]',
      resume: data.resume || '',
      avatar: data.avatar || '👤'
    };
    candidates.push(candidate);
    saveData();
    return candidate;
  }

  function updateCandidate(id, updates) {
    if (isConnected) {
      api('recruitment/update/candidate', { id, ...updates }).catch(err => {
        showToast('error', 'Failed to update: ' + err.message);
      });
      return;
    }
    
    const idx = candidates.findIndex(c => c.id === id);
    if (idx >= 0) {
      candidates[idx] = { ...candidates[idx], ...updates };
      saveData();
    }
  }

  function moveCandidate(id, newStage, rejectionReason = null) {
    if (isConnected) {
      api('recruitment/move/candidate', { 
        id, 
        stage: newStage,
        rejectionReason: rejectionReason || ''
      }).catch(err => {
        showToast('error', 'Failed to move: ' + err.message);
      });
      return;
    }
    
    const now = new Date().toISOString();
    updateCandidate(id, {
      stage: newStage,
      currentStageAt: now,
      rejectionReason: rejectionReason || ''
    });
  }

  function deleteCandidate(id) {
    if (isConnected) {
      api('recruitment/delete/candidate', { id }).then(() => {
        loadData().then(() => renderBoard());
      }).catch(err => showToast('error', 'Failed to delete: ' + err.message));
      return;
    }
    
    candidates = candidates.filter(c => c.id !== id);
    saveData();
  }

  function rejectCandidate(id, reason) {
  if (isConnected) {
    api('recruitment/reject/candidate', { 
      id, 
      rejectionReason: reason || ''
    }).catch(err => {
      showToast('error', 'Failed to reject: ' + err.message);
    });
    return;
  }
  
  const now = new Date().toISOString();
  updateCandidate(id, {
    stage: 'rejected',
    currentStageAt: now,
    rejectionReason: reason || ''
  });
}

  // ── Views ────────────────────────────────────────────────────────

  function renderBoard() {
    const filteredCandidates = candidates.filter(c => {
      if (filterStage && c.stage !== filterStage) return false;
      if (!activeJobId || c.jobId === activeJobId) return true;
      return false;
    });

    const boardHTML = `
      <div class="p-6 space-y-4">
        <!-- Header & Controls -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Recruiting Pipeline</h1>
            <p class="text-sm text-slate-500 mt-1">Visual Kanban view • Drag to move candidates between stages</p>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="WorkVoltPages.recruiting.showNewCandidateModal()" class="btn-primary">
              <i class="fas fa-plus"></i> New Candidate
            </button>
            <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onclick="WorkVoltPages.recruiting.setView('board')" class="px-3 py-2 rounded-md text-sm font-medium ${view === 'board' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}" title="Kanban Board">
                <i class="fas fa-columns"></i>
              </button>
              <button onclick="WorkVoltPages.recruiting.setView('list')" class="px-3 py-2 rounded-md text-sm font-medium ${view === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}" title="List View">
                <i class="fas fa-list"></i>
              </button>
              <button onclick="WorkVoltPages.recruiting.setView('analytics')" class="px-3 py-2 rounded-md text-sm font-medium ${view === 'analytics' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}" title="Analytics">
                <i class="fas fa-chart-bar"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Job & Filter Controls -->
        <div class="flex flex-wrap gap-3 items-center">
          <select id="jobFilter" onchange="WorkVoltPages.recruiting.setActiveJob(this.value)" class="field px-3 py-2 flex-1 min-w-48">
            <option value="">All Positions</option>
            ${jobs.map(j => `<option value="${j.id}" ${activeJobId === j.id ? 'selected' : ''}>${j.title}</option>`).join('')}
          </select>
          <div class="flex gap-2">
            ${PIPELINE_STAGES.map(stage => `
              <button onclick="WorkVoltPages.recruiting.setFilterStage('${stage.id === filterStage ? null : stage.id}')" class="px-3 py-2 text-sm font-medium rounded-lg transition ${filterStage === stage.id ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'}">
                ${stage.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Kanban Board -->
        <div class="overflow-x-auto pb-6">
          <div class="flex gap-5 min-w-max">
            ${PIPELINE_STAGES.map(stage => {
              const stageCandidates = filteredCandidates.filter(c => c.stage === stage.id);
              return `
                <div class="w-80 flex-shrink-0">
                  <div class="bg-white border-l-4 ${stage.borderColor} rounded-lg overflow-hidden shadow-sm">
                    <!-- Stage Header -->
                    <div class="${stage.color} px-4 py-3 border-b border-slate-100">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="flex items-center justify-center w-6 h-6 rounded-full ${stage.bgDot} text-white text-xs font-bold">
                          <i class="fas ${stage.icon} text-xs"></i>
                        </span>
                        <h3 class="font-semibold text-slate-900">${stage.label}</h3>
                        <span class="ml-auto text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded">${stageCandidates.length}</span>
                      </div>
                      <p class="text-xs text-slate-600 ml-8">${stage.description}</p>
                    </div>

                    <!-- Stage Criteria & Timeframe -->
                    <div class="px-4 py-2 bg-slate-50 border-b border-slate-100">
                      <p class="text-xs text-slate-600"><strong>Pass:</strong> ${stage.passCriteria}</p>
                      <p class="text-xs text-slate-500 mt-1"><i class="fas fa-clock text-amber-500"></i> ${stage.timeframe}</p>
                    </div>

                    <!-- Candidates -->
                    <div class="p-3 space-y-2 bg-slate-50 min-h-96 overflow-y-auto">
                      ${stageCandidates.length === 0 ? `
                        <div class="flex flex-col items-center justify-center h-32 text-slate-400">
                          <i class="fas fa-inbox text-2xl mb-2 opacity-50"></i>
                          <p class="text-xs font-medium">No candidates</p>
                        </div>
                      ` : stageCandidates.map(cand => `
                        <div class="bg-white rounded-lg p-3 border border-slate-200 cursor-pointer hover:shadow-md transition" onclick="WorkVoltPages.recruiting.selectCandidate('${cand.id}')">
                          <div class="flex items-start gap-2 mb-2">
                            <span class="text-xl">${cand.avatar}</span>
                            <div class="flex-1 min-w-0">
                              <p class="text-sm font-semibold text-slate-900 truncate">${cand.name}</p>
                              <p class="text-xs text-slate-500">${getJobTitle(cand.jobId)}</p>
                            </div>
                          </div>

                          <!-- Score Summary -->
                          <div class="flex gap-1 mb-2">
                            ${[
                              { key: 'scoreSkills', label: 'Skills' },
                              { key: 'scoreExperience', label: 'Exp' },
                              { key: 'scoreCulture', label: 'Culture' },
                              { key: 'scoreCommunication', label: 'Comm' }
                            ].map(cat => {
                              const val = parseInt(cand[cat.key]) || 0;
                              const scoreColors = {
                                0: 'bg-slate-100',
                                1: 'bg-red-100 text-red-700',
                                2: 'bg-orange-100 text-orange-700',
                                3: 'bg-yellow-100 text-yellow-700',
                                4: 'bg-blue-100 text-blue-700',
                                5: 'bg-green-100 text-green-700'
                              };
                              return `<span class="text-xs font-bold px-1.5 py-0.5 rounded ${scoreColors[val]}">${val || '-'}</span>`;
                            }).join('')}
                          </div>

                          <!-- Meta -->
                          <div class="text-xs text-slate-500 space-y-0.5">
                            <div class="flex justify-between">
                              <span><i class="fas fa-link text-slate-400"></i> ${cand.source}</span>
                              <span><i class="fas fa-clock text-slate-400"></i> ${getTimeInStage(cand)}</span>
                            </div>
                            <div class="flex justify-between">
                              <span><i class="fas fa-calendar text-slate-400"></i> ${formatDate(cand.appliedAt)}</span>
                              <span class="font-semibold text-slate-700">Avg: ${calculateAverageScore(cand)}</span>
                            </div>
                          </div>

                          <!-- Quick Actions -->
                          <div class="flex gap-1 mt-2 pt-2 border-t border-slate-100">
                            ${stage.id !== 'hired' && stage.id !== 'rejected' ? `
                              <button onclick="event.stopPropagation(); WorkVoltPages.recruiting.showAdvanceModal('${cand.id}')" class="flex-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium transition" title="Move to next stage">
                                <i class="fas fa-arrow-right"></i> Advance
                              </button>
                            ` : ''}
                            <button onclick="event.stopPropagation(); WorkVoltPages.recruiting.editCandidate('${cand.id}')" class="flex-1 text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition" title="Edit details">
                              <i class="fas fa-edit"></i> Edit
                            </button>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Candidate Detail Panel -->
      ${selectedCandidateId ? renderCandidateDetailPanel() : ''}
    `;

    container.innerHTML = boardHTML;
  }

  function renderCandidateDetailPanel() {
    const cand = candidates.find(c => c.id === selectedCandidateId);
    if (!cand) return '';

    const avgScore = calculateAverageScore(cand);
    const stage = PIPELINE_STAGES.find(s => s.id === cand.stage);

    return `
      <div class="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center sm:justify-end" onclick="WorkVoltPages.recruiting.selectCandidate(null)">
        <div class="bg-white w-full sm:w-96 h-full sm:h-auto sm:rounded-lg shadow-2xl flex flex-col overflow-hidden" onclick="event.stopPropagation()">
          <!-- Header -->
          <div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold flex items-center gap-2">
                <span class="text-2xl">${cand.avatar}</span> ${cand.name}
              </h2>
              <p class="text-blue-100 text-sm mt-1">${getJobTitle(cand.jobId)}</p>
            </div>
            <button onclick="WorkVoltPages.recruiting.selectCandidate(null)" class="text-white hover:bg-white/20 p-2 rounded-lg transition">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="overflow-y-auto flex-1 p-6 space-y-4">
            <!-- Score Breakdown -->
            <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-slate-900">Overall Score</h3>
                <span class="text-2xl font-bold text-blue-600">${avgScore}/5</span>
              </div>
              <div class="space-y-2">
                ${SCORING_CATEGORIES.map(cat => {
                  const scoreKey = 'score' + cat.id.charAt(0).toUpperCase() + cat.id.slice(1);
                  const score = parseInt(cand[scoreKey]) || 0;
                  const percent = (score / 5) * 100;
                  return `
                    <div>
                      <div class="flex justify-between text-xs font-medium mb-1">
                        <span class="text-slate-700"><i class="fas ${cat.icon}"></i> ${cat.label}</span>
                        <span class="text-slate-600">${score}/5</span>
                      </div>
                      <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all" style="width: ${percent}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Current Stage -->
            <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p class="text-xs font-semibold text-slate-600 mb-2">CURRENT STAGE</p>
              <div class="flex items-center gap-3">
                <span class="flex items-center justify-center w-10 h-10 rounded-full ${stage.bgDot} text-white">
                  <i class="fas ${stage.icon}"></i>
                </span>
                <div>
                  <p class="font-semibold text-slate-900">${stage.label}</p>
                  <p class="text-xs text-slate-600">${getTimeInStage(cand)} in this stage</p>
                </div>
              </div>
            </div>

            <!-- Contact Info -->
            <div class="space-y-2">
              <p class="text-xs font-semibold text-slate-600 uppercase">CONTACT INFO</p>
              <div class="space-y-1">
                <p class="text-sm text-slate-700"><i class="fas fa-envelope text-blue-500 w-4"></i> <a href="mailto:${cand.email}" class="text-blue-600 hover:underline">${cand.email}</a></p>
                ${cand.phone ? `<p class="text-sm text-slate-700"><i class="fas fa-phone text-blue-500 w-4"></i> <a href="tel:${cand.phone}" class="text-blue-600 hover:underline">${cand.phone}</a></p>` : ''}
                <p class="text-sm text-slate-700"><i class="fas fa-link text-blue-500 w-4"></i> <span class="font-medium">${cand.source}</span></p>
              </div>
            </div>

            <!-- Timeline -->
            <div class="space-y-2">
              <p class="text-xs font-semibold text-slate-600 uppercase">TIMELINE</p>
              <div class="text-sm space-y-1">
                <p class="text-slate-700"><span class="text-slate-600">Applied:</span> ${formatDate(cand.appliedAt)}</p>
                <p class="text-slate-700"><span class="text-slate-600">In pipeline:</span> ${Math.floor((Date.now() - cand.appliedAt) / (1000 * 60 * 60 * 24))} days</p>
              </div>
            </div>

            <!-- Notes -->
            ${cand.notes ? `
              <div class="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <p class="text-xs font-semibold text-amber-900 mb-1"><i class="fas fa-sticky-note"></i> Notes</p>
                <p class="text-sm text-amber-900">${cand.notes}</p>
              </div>
            ` : ''}

            <!-- Resume -->
            ${cand.resume ? `
              <div class="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p class="text-xs font-semibold text-slate-700 mb-1"><i class="fas fa-file"></i> Resume</p>
                <p class="text-sm text-slate-700">${cand.resume}</p>
              </div>
            ` : ''}
          </div>

          <!-- Action Buttons -->
          <div class="border-t border-slate-200 p-4 bg-slate-50 space-y-3">
            ${cand.stage !== 'hired' && cand.stage !== 'rejected' ? `
              <button onclick="WorkVoltPages.recruiting.showAdvanceModal('${cand.id}')" class="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <i class="fas fa-arrow-right"></i> Move to Next Stage
              </button>
              <button onclick="WorkVoltPages.recruiting.showRejectModal('${cand.id}')" class="w-full px-4 py-2 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2">
                <i class="fas fa-times-circle"></i> Reject Candidate
              </button>
            ` : ''}
            <button onclick="WorkVoltPages.recruiting.editCandidate('${cand.id}')" class="w-full px-4 py-2 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition flex items-center justify-center gap-2">
              <i class="fas fa-edit"></i> Edit Details
            </button>
            <button onclick="WorkVoltPages.recruiting.deleteCandidate('${cand.id}')" class="w-full px-4 py-2 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition flex items-center justify-center gap-2">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderList() {
    const filteredCandidates = candidates
      .filter(c => {
        if (filterStage && c.stage !== filterStage) return false;
        if (activeJobId && c.jobId !== activeJobId) return false;
        if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'score') return calculateAverageScore(b) - calculateAverageScore(a);
        return b.appliedAt - a.appliedAt;
      });

    const listHTML = `
      <div class="p-6 space-y-4">
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Candidates</h1>
            <p class="text-sm text-slate-500 mt-1">List view with detailed information</p>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="WorkVoltPages.recruiting.showNewCandidateModal()" class="btn-primary">
              <i class="fas fa-plus"></i> New Candidate
            </button>
            <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onclick="WorkVoltPages.recruiting.setView('board')" class="px-3 py-2 rounded-md text-sm font-medium text-slate-600">
                <i class="fas fa-columns"></i>
              </button>
              <button onclick="WorkVoltPages.recruiting.setView('list')" class="px-3 py-2 rounded-md text-sm font-medium bg-white shadow-sm text-blue-600">
                <i class="fas fa-list"></i>
              </button>
              <button onclick="WorkVoltPages.recruiting.setView('analytics')" class="px-3 py-2 rounded-md text-sm font-medium text-slate-600">
                <i class="fas fa-chart-bar"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex flex-wrap gap-3 items-center">
          <input type="text" id="searchInput" placeholder="Search by name..." class="field flex-1 min-w-48" onkeyup="WorkVoltPages.recruiting.setSearchQuery(this.value)">
          <select id="jobFilter2" onchange="WorkVoltPages.recruiting.setActiveJob(this.value)" class="field px-3 py-2 flex-1 min-w-48">
            <option value="">All Positions</option>
            ${jobs.map(j => `<option value="${j.id}" ${activeJobId === j.id ? 'selected' : ''}>${j.title}</option>`).join('')}
          </select>
          <select onchange="WorkVoltPages.recruiting.setSortBy(this.value)" class="field px-3 py-2 flex-1 min-w-48">
            <option value="dateAdded">Sort by: Date Added</option>
            <option value="name">Sort by: Name</option>
            <option value="score">Sort by: Score</option>
          </select>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table class="w-full">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Candidate</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Position</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Stage</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Score</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Source</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Days in Pipeline</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${filteredCandidates.length === 0 ? `
                <tr>
                  <td colspan="7" class="px-4 py-8 text-center text-slate-500">
                    <i class="fas fa-inbox text-2xl mb-2 block opacity-50"></i>
                    No candidates found
                  </td>
                </tr>
              ` : filteredCandidates.map(cand => {
                const stage = PIPELINE_STAGES.find(s => s.id === cand.stage);
                const daysInPipeline = Math.floor((Date.now() - cand.appliedAt) / (1000 * 60 * 60 * 24));
                return `
                  <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="WorkVoltPages.recruiting.selectCandidate('${cand.id}')">
                    <td class="px-4 py-4 text-sm font-medium text-slate-900">
                      <div class="flex items-center gap-2">
                        <span class="text-lg">${cand.avatar}</span>
                        <div>
                          <p class="font-semibold">${cand.name}</p>
                          <p class="text-xs text-slate-500">${cand.email}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-4 text-sm text-slate-700">${getJobTitle(cand.jobId)}</td>
                    <td class="px-4 py-4 text-sm">
                      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full font-medium text-xs ${stage.color} border ${stage.borderColor}">
                        <i class="fas ${stage.icon}"></i> ${stage.label}
                      </span>
                    </td>
                    <td class="px-4 py-4 text-sm font-bold text-slate-900">${calculateAverageScore(cand)}/5</td>
                    <td class="px-4 py-4 text-sm text-slate-700">${cand.source}</td>
                    <td class="px-4 py-4 text-sm text-slate-700"><span class="font-medium">${daysInPipeline}</span> days</td>
                    <td class="px-4 py-4 text-sm">
                      <button onclick="event.stopPropagation(); WorkVoltPages.recruiting.editCandidate('${cand.id}')" class="text-blue-600 hover:text-blue-700 font-medium" title="Edit">
                        <i class="fas fa-edit"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Results Summary -->
        <div class="text-sm text-slate-600">
          Showing ${filteredCandidates.length} of ${candidates.length} candidates
        </div>
      </div>

      <!-- Candidate Detail Panel -->
      ${selectedCandidateId ? renderCandidateDetailPanel() : ''}
    `;

    container.innerHTML = listHTML;
  }

  function renderAnalytics() {
    // Calculate metrics
    const metrics = {
      totalCandidates: candidates.length,
      byStage: {},
      rejected: candidates.filter(c => c.stage === 'rejected').length,
      hired: candidates.filter(c => c.stage === 'hired').length,
      avgTimeInPipeline: 0,
      conversionRate: 0,
      bySource: {},
      avgScore: 0
    };

    // By stage
    PIPELINE_STAGES.forEach(stage => {
      metrics.byStage[stage.id] = candidates.filter(c => c.stage === stage.id).length;
    });

    // Average time
    if (candidates.length > 0) {
      const totalTime = candidates.reduce((sum, c) => sum + (Date.now() - c.appliedAt), 0);
      metrics.avgTimeInPipeline = Math.floor(totalTime / candidates.length / (1000 * 60 * 60 * 24));
    }

    // Conversion rate
    if (candidates.length > 0) {
      metrics.conversionRate = ((metrics.hired / candidates.length) * 100).toFixed(1);
    }

    // By source
    JOB_SOURCES.forEach(source => {
      metrics.bySource[source] = candidates.filter(c => c.source === source).length;
    });

    // Average score
    if (candidates.length > 0) {
      const totalScore = candidates.reduce((sum, c) => sum + parseFloat(calculateAverageScore(c)), 0);
      metrics.avgScore = (totalScore / candidates.length).toFixed(1);
    }

    const analyticsHTML = `
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Pipeline Analytics</h1>
            <p class="text-sm text-slate-500 mt-1">Recruitment metrics and insights</p>
          </div>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onclick="WorkVoltPages.recruiting.setView('board')" class="px-3 py-2 rounded-md text-sm font-medium text-slate-600">
              <i class="fas fa-columns"></i>
            </button>
            <button onclick="WorkVoltPages.recruiting.setView('list')" class="px-3 py-2 rounded-md text-sm font-medium text-slate-600">
              <i class="fas fa-list"></i>
            </button>
            <button onclick="WorkVoltPages.recruiting.setView('analytics')" class="px-3 py-2 rounded-md text-sm font-medium bg-white shadow-sm text-blue-600">
              <i class="fas fa-chart-bar"></i>
            </button>
          </div>
        </div>

        <!-- KPI Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-blue-700 uppercase mb-2">Total Candidates</p>
            <p class="text-3xl font-bold text-blue-900">${metrics.totalCandidates}</p>
          </div>
          <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-emerald-700 uppercase mb-2">Hired</p>
            <p class="text-3xl font-bold text-emerald-900">${metrics.hired}</p>
          </div>
          <div class="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-orange-700 uppercase mb-2">Rejected</p>
            <p class="text-3xl font-bold text-orange-900">${metrics.rejected}</p>
          </div>
          <div class="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-purple-700 uppercase mb-2">Conversion Rate</p>
            <p class="text-3xl font-bold text-purple-900">${metrics.conversionRate}%</p>
          </div>
        </div>

        <!-- Secondary KPIs -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-slate-600 uppercase mb-2">Avg Time in Pipeline</p>
            <p class="text-2xl font-bold text-slate-900">${metrics.avgTimeInPipeline} <span class="text-sm font-normal text-slate-600">days</span></p>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-slate-600 uppercase mb-2">Average Candidate Score</p>
            <p class="text-2xl font-bold text-slate-900">${metrics.avgScore} <span class="text-sm font-normal text-slate-600">/5</span></p>
          </div>
          <div class="bg-white border border-slate-200 rounded-lg p-4">
            <p class="text-xs font-semibold text-slate-600 uppercase mb-2">In Pipeline</p>
            <p class="text-2xl font-bold text-slate-900">${metrics.totalCandidates - metrics.hired - metrics.rejected}</p>
          </div>
        </div>

        <!-- Stage Funnel -->
        <div class="bg-white border border-slate-200 rounded-lg p-6">
          <h2 class="text-lg font-bold text-slate-900 mb-4">Pipeline Funnel</h2>
          <div class="space-y-3">
            ${PIPELINE_STAGES.map((stage, idx) => {
              const count = metrics.byStage[stage.id];
              const percent = candidates.length > 0 ? (count / candidates.length) * 100 : 0;
              const previousCount = idx === 0 ? candidates.length : metrics.byStage[PIPELINE_STAGES[idx - 1].id];
              const convRate = previousCount > 0 ? ((count / previousCount) * 100).toFixed(0) : 'N/A';
              return `
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-slate-900">${stage.label}</span>
                      <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">${count}</span>
                      ${convRate !== 'N/A' ? `<span class="text-xs text-slate-600">(${convRate}% conversion)</span>` : ''}
                    </div>
                  </div>
                  <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all" style="width: ${percent}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Source Quality -->
        <div class="bg-white border border-slate-200 rounded-lg p-6">
          <h2 class="text-lg font-bold text-slate-900 mb-4">Candidates by Source</h2>
          <div class="space-y-2">
            ${Object.entries(metrics.bySource).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([source, count]) => {
              const percent = (count / metrics.totalCandidates) * 100;
              const hired = candidates.filter(c => c.source === source && c.stage === 'hired').length;
              const quality = hired > 0 ? ((hired / count) * 100).toFixed(0) : '0';
              return `
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-slate-900">${source}</span>
                    <div class="flex gap-2 text-xs">
                      <span class="font-bold text-slate-900">${count}</span>
                      <span class="text-slate-600">Quality: ${quality}%</span>
                    </div>
                  </div>
                  <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div class="bg-gradient-to-r from-green-400 to-emerald-500 h-full" style="width: ${percent}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = analyticsHTML;
  }

  // ── Modal functions ─────────────────────────────────────────────

  function showNewCandidateModal() {
    const form = `
      <div class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onclick="if(event.target === this) WorkVoltPages.recruiting.closeModal()">
        <div class="bg-white rounded-lg shadow-2xl overflow-hidden max-w-2xl w-full max-h-96 overflow-y-auto" onclick="event.stopPropagation()">
          <div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between">
            <h2 class="text-lg font-bold"><i class="fas fa-plus-circle"></i> Add New Candidate</h2>
            <button onclick="WorkVoltPages.recruiting.closeModal()" class="hover:bg-white/20 p-2 rounded-lg transition">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <form onsubmit="WorkVoltPages.recruiting.submitNewCandidate(event)" class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Full Name *</label>
                <input type="text" name="name" class="field" required>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Email *</label>
                <input type="email" name="email" class="field" required>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Phone</label>
                <input type="tel" name="phone" class="field">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Position *</label>
                <select name="jobId" class="field" required>
                  <option value="">Select a position</option>
                  ${jobs.map(j => `<option value="${j.id}">${j.title}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Source *</label>
                <select name="source" class="field" required>
                  ${JOB_SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Avatar</label>
                <select name="avatar" class="field">
                  <option value="👤">👤 Generic</option>
                  <option value="👨‍💼">👨‍💼 Man (Business)</option>
                  <option value="👩‍💼">👩‍💼 Woman (Business)</option>
                  <option value="👨">👨 Man</option>
                  <option value="👩">👩 Woman</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Resume / Background</label>
              <textarea name="resume" class="field resize-none" rows="2" placeholder="Brief summary of qualifications..."></textarea>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Notes</label>
              <textarea name="notes" class="field resize-none" rows="2" placeholder="Internal notes..."></textarea>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="submit" class="btn-primary flex-1">
                <i class="fas fa-plus"></i> Create Candidate
              </button>
              <button type="button" onclick="WorkVoltPages.recruiting.closeModal()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('modal-container').innerHTML = form;
  }

  function showAdvanceModal(candId) {
    const cand = candidates.find(c => c.id === candId);
    const currentStageIdx = getStageIndex(cand.stage);
    const nextStages = PIPELINE_STAGES.slice(currentStageIdx + 1);

    const modal = `
      <div class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onclick="if(event.target === this) WorkVoltPages.recruiting.closeModal()">
        <div class="bg-white rounded-lg shadow-2xl overflow-hidden max-w-md w-full" onclick="event.stopPropagation()">
          <div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between">
            <h2 class="text-lg font-bold"><i class="fas fa-arrow-right"></i> Advance Candidate</h2>
            <button onclick="WorkVoltPages.recruiting.closeModal()" class="hover:bg-white/20 p-2 rounded-lg transition">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <div class="p-6 space-y-4">
            <div class="bg-slate-100 rounded-lg p-4">
              <p class="text-sm font-medium text-slate-900">${cand.name}</p>
              <p class="text-xs text-slate-600 mt-1">Current: ${getStageLabel(cand.stage)}</p>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Move to Stage *</label>
              <select id="advanceStage" class="field" required>
                ${nextStages.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Add Notes (optional)</label>
              <textarea id="advanceNotes" class="field resize-none" rows="3" placeholder="Interview notes, feedback, etc..."></textarea>
            </div>

            <div class="flex gap-3 pt-4">
              <button onclick="WorkVoltPages.recruiting.confirmAdvance('${candId}')" class="btn-primary flex-1">
                <i class="fas fa-check"></i> Advance
              </button>
              <button onclick="WorkVoltPages.recruiting.closeModal()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-container').innerHTML = modal;
  }

  function showRejectModal(candId) {
    const cand = candidates.find(c => c.id === candId);
    const modal = `
      <div class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onclick="if(event.target === this) WorkVoltPages.recruiting.closeModal()">
        <div class="bg-white rounded-lg shadow-2xl overflow-hidden max-w-md w-full" onclick="event.stopPropagation()">
          <div class="bg-gradient-to-r from-red-600 to-orange-600 px-6 py-4 text-white flex items-center justify-between">
            <h2 class="text-lg font-bold"><i class="fas fa-times-circle"></i> Reject Candidate</h2>
            <button onclick="WorkVoltPages.recruiting.closeModal()" class="hover:bg-white/20 p-2 rounded-lg transition">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <div class="p-6 space-y-4">
            <div class="bg-red-50 rounded-lg p-4 border border-red-200">
              <p class="text-sm font-medium text-red-900">${cand.name}</p>
              <p class="text-xs text-red-700 mt-1">This action cannot be undone</p>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Rejection Reason *</label>
              <select id="rejectReason" class="field" required>
                <option value="">Select a reason</option>
                ${REJECTION_REASON.map(r => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Feedback (optional)</label>
              <textarea id="rejectFeedback" class="field resize-none" rows="3" placeholder="Feedback to send to candidate..."></textarea>
            </div>

            <div class="flex gap-3 pt-4">
              <button onclick="WorkVoltPages.recruiting.confirmReject('${candId}')" class="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition">
                <i class="fas fa-times"></i> Reject
              </button>
              <button onclick="WorkVoltPages.recruiting.closeModal()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-container').innerHTML = modal;
  }

  function editCandidate(candId) {
    const cand = candidates.find(c => c.id === candId);
    const form = `
      <div class="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onclick="if(event.target === this) WorkVoltPages.recruiting.closeModal()">
        <div class="bg-white rounded-lg shadow-2xl overflow-hidden max-w-2xl w-full max-h-96 overflow-y-auto" onclick="event.stopPropagation()">
          <div class="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white flex items-center justify-between">
            <h2 class="text-lg font-bold"><i class="fas fa-edit"></i> Edit Candidate</h2>
            <button onclick="WorkVoltPages.recruiting.closeModal()" class="hover:bg-white/20 p-2 rounded-lg transition">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <form onsubmit="WorkVoltPages.recruiting.submitEditCandidate(event, '${candId}')" class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Full Name</label>
                <input type="text" name="name" class="field" value="${cand.name}">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Email</label>
                <input type="email" name="email" class="field" value="${cand.email}">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Phone</label>
                <input type="tel" name="phone" class="field" value="${cand.phone}">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-2">Position</label>
                <select name="jobId" class="field">
                  ${jobs.map(j => `<option value="${j.id}" ${cand.jobId === j.id ? 'selected' : ''}>${j.title}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Scoring -->
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p class="text-sm font-semibold text-slate-900 mb-3">Scoring</p>
              <div class="grid grid-cols-2 gap-4">
                ${SCORING_CATEGORIES.map(cat => {
                  const scoreKey = 'score' + cat.id.charAt(0).toUpperCase() + cat.id.slice(1);
                  const currentScore = parseInt(cand[scoreKey]) || 0;
                  return `
                    <div>
                      <label class="block text-xs font-semibold text-slate-700 mb-2">
                        <i class="fas ${cat.icon}"></i> ${cat.label}
                      </label>
                      <select name="${scoreKey}" class="field">
                        <option value="0" ${currentScore === 0 ? 'selected' : ''}>0 - Not rated</option>
                        <option value="1" ${currentScore === 1 ? 'selected' : ''}>1 - Poor</option>
                        <option value="2" ${currentScore === 2 ? 'selected' : ''}>2 - Fair</option>
                        <option value="3" ${currentScore === 3 ? 'selected' : ''}>3 - Good</option>
                        <option value="4" ${currentScore === 4 ? 'selected' : ''}>4 - Very Good</option>
                        <option value="5" ${currentScore === 5 ? 'selected' : ''}>5 - Excellent</option>
                      </select>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Resume / Background</label>
              <textarea name="resume" class="field resize-none" rows="2">${cand.resume}</textarea>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-2">Notes</label>
              <textarea name="notes" class="field resize-none" rows="2">${cand.notes}</textarea>
            </div>

            <div class="flex gap-3 pt-4">
              <button type="submit" class="btn-primary flex-1">
                <i class="fas fa-save"></i> Save Changes
              </button>
              <button type="button" onclick="WorkVoltPages.recruiting.closeModal()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('modal-container').innerHTML = form;
  }

  // ── Submit handlers ──────────────────────────────────────────────

  function submitNewCandidate(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      jobId: formData.get('jobId'),
      source: formData.get('source'),
      avatar: formData.get('avatar'),
      resume: formData.get('resume'),
      notes: formData.get('notes')
    };

    createCandidate(data);
    closeModal();
    showToast('success', `${data.name} added to pipeline!`);
    renderBoard();
  }

  function submitEditCandidate(e, candId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const updates = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      jobId: formData.get('jobId'),
      resume: formData.get('resume'),
      notes: formData.get('notes'),
      scoreSkills: parseInt(formData.get('scoreSkills')) || 0,
      scoreExperience: parseInt(formData.get('scoreExperience')) || 0,
      scoreCulture: parseInt(formData.get('scoreCulture')) || 0,
      scoreCommunication: parseInt(formData.get('scoreCommunication')) || 0
    };

    updateCandidate(candId, updates);
    closeModal();
    showToast('success', 'Candidate updated!');
    if (view === 'list') renderList();
    else if (view === 'board') renderBoard();
  }

  function confirmAdvance(candId) {
    const stage = document.getElementById('advanceStage').value;
    const notes = document.getElementById('advanceNotes').value;

    const cand = candidates.find(c => c.id === candId);
    moveCandidate(candId, stage);

    if (notes) {
      const notes = JSON.parse(cand.interviewNotes || '[]');
      notes.push({
        timestamp: Date.now(),
        stage: stage,
        text: notes
      });
      updateCandidate(candId, { interviewNotes: cand.interviewNotes });
    }

    closeModal();
    showToast('success', `${cand.name} moved to ${getStageLabel(stage)}!`);
    selectCandidate(null);
    if (view === 'board') renderBoard();
    else if (view === 'list') renderList();
  }

  function confirmReject(candId) {
    const reason = document.getElementById('rejectReason').value;
    const feedback = document.getElementById('rejectFeedback').value;

    const cand = candidates.find(c => c.id === candId);
    moveCandidate(candId, 'rejected', reason);

    if (feedback) {
      updateCandidate(candId, { notes: (cand.notes ? cand.notes + '\n\n' : '') + `Rejection Feedback: ${feedback}` });
    }

    closeModal();
    showToast('success', `${cand.name} rejected`);
    selectCandidate(null);
    if (view === 'board') renderBoard();
    else if (view === 'list') renderList();
  }

  // ── Initialization ───────────────────────────────────────────────

  loadData();

  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.id = 'modal-container';
  container.appendChild(modalContainer);

  // Render initial view
  renderBoard();

  // Export API
  window.WorkVoltPages.recruiting = {
    setView: (newView) => {
      view = newView;
      if (view === 'board') renderBoard();
      else if (view === 'list') renderList();
      else if (view === 'analytics') renderAnalytics();
    },
    setActiveJob: (jobId) => {
      activeJobId = jobId || null;
      if (view === 'board') renderBoard();
      else if (view === 'list') renderList();
    },
    setFilterStage: (stageId) => {
      filterStage = filterStage === stageId ? null : stageId;
      if (view === 'board') renderBoard();
      else if (view === 'list') renderList();
    },
    setSearchQuery: (query) => {
      searchQuery = query;
      renderList();
    },
    setSortBy: (sortType) => {
      sortBy = sortType;
      renderList();
    },
    selectCandidate: (id) => {
      selectedCandidateId = id;
      if (view === 'board') renderBoard();
      else if (view === 'list') renderList();
    },
    showNewCandidateModal,
    editCandidate,
    deleteCandidate: (id) => {
      if (confirm('Delete this candidate? This cannot be undone.')) {
        deleteCandidate(id);
        selectCandidate(null);
        showToast('success', 'Candidate deleted');
        if (view === 'board') renderBoard();
        else if (view === 'list') renderList();
      }
    },
    showAdvanceModal,
    confirmAdvance,
    showRejectModal,
    confirmReject,
    submitNewCandidate,
    submitEditCandidate,
    closeModal: () => {
      document.getElementById('modal-container').innerHTML = '';
    }
  };

  // Toast notification
  function showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

};
