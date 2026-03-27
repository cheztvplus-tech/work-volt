// ================================================================
//  WORK VOLT — pages/crm.js
//  CRM: Contacts · Leads · Pipeline · Price Submissions · Activities
//
//  Backend: Supabase via WorkVoltDB adapter (db-adapter.js)
//  All api() calls replaced with WorkVoltDB.* equivalents.
//  No features removed — full parity with the GAS version.
// ================================================================
window.WorkVoltPages = window.WorkVoltPages || {};

window.WorkVoltPages['crm'] = function(container) {

  var myId = (function() { try { return window.WorkVolt.user().user_id || null; } catch(e) { return null; } })();
  var db   = window.WorkVoltDB;

  function toast(msg, type) {
    if (window.WorkVolt && window.WorkVolt.toast) window.WorkVolt.toast(msg, type || 'info');
  }

  // ── State ──────────────────────────────────────────────────────
  var S = {
    tab: 'dashboard',
    contacts: [], leads: [], deals: [], stages: [], activities: [],
    quotes: [], pendingQuotes: [],
    dashboard: {},
    loading: false,
    search: '', filterStatus: '', filterStage: '', filterQuoteStatus: '',
    modal: null, editRec: null,
    contactDetail: null, dealDetail: null, quoteDetail: null,
    stageForDeal: null,
    dragId: null, dragFromStage: null,
  };

  // ── Helpers ────────────────────────────────────────────────────
  var PILL = {
    'Lead':'bg-blue-100 text-blue-700','Prospect':'bg-indigo-100 text-indigo-700',
    'Customer':'bg-green-100 text-green-700','Churned':'bg-red-100 text-red-700',
    'Partner':'bg-purple-100 text-purple-700','New':'bg-slate-100 text-slate-600',
    'Contacted':'bg-blue-100 text-blue-700','Qualified':'bg-indigo-100 text-indigo-700',
    'Proposal':'bg-amber-100 text-amber-700','Negotiation':'bg-orange-100 text-orange-700',
    'Won':'bg-green-100 text-green-700','Lost':'bg-red-100 text-red-700',
  };

  var QSTATUS_CLS = {
    'Draft':'bg-slate-100 text-slate-600',
    'Submitted':'bg-blue-100 text-blue-700',
    'Pending Approval':'bg-amber-100 text-amber-700',
    'Approved':'bg-emerald-100 text-emerald-700',
    'Rejected':'bg-red-100 text-red-700',
    'Sent to Client':'bg-indigo-100 text-indigo-700',
    'Accepted':'bg-green-100 text-green-700',
    'Declined':'bg-red-100 text-red-600',
    'Negotiating':'bg-purple-100 text-purple-700',
  };

  var QFLOW = ['Draft','Submitted','Pending Approval','Approved','Sent to Client','Accepted'];

  function qStatusRank(s) { return QFLOW.indexOf(s); }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmt$(v) { return '$'+(parseFloat(v)||0).toLocaleString(undefined,{maximumFractionDigits:0}); }
  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d=new Date(iso); if(isNaN(d)) return String(iso).substring(0,10);
      var diff=Date.now()-d.getTime();
      if(diff<60000) return 'just now';
      if(diff<3600000) return Math.floor(diff/60000)+'m ago';
      if(diff<86400000) return Math.floor(diff/3600000)+'h ago';
      if(diff<604800000) return Math.floor(diff/86400000)+'d ago';
      return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
    } catch(e){ return String(iso).substring(0,10); }
  }
  function scoreColor(s){ s=parseFloat(s||0); return s>=70?'text-green-600':s>=40?'text-amber-500':'text-slate-400'; }

  // ── Quote ID generator ─────────────────────────────────────────
  function genQuoteId() {
    var d = new Date();
    var pad = function(n,l){ return String(n).padStart(l,'0'); };
    return 'Q-' + d.getFullYear() + pad(d.getMonth()+1,2) + pad(d.getDate(),2) +
           '-' + pad(Math.floor(Math.random()*10000),4);
  }

  // ── Computed totals for a quote data object ────────────────────
  function calcQuoteTotal(sub, discPct, taxPct) {
    sub     = parseFloat(sub)     || 0;
    discPct = parseFloat(discPct) || 0;
    taxPct  = parseFloat(taxPct)  || 0;
    return sub * (1 - discPct / 100) * (1 + taxPct / 100);
  }

  // ── Load ───────────────────────────────────────────────────────
  function loadAll() {
    S.loading = true; render();
    Promise.all([
      db.crm.contacts().catch(function(){ return []; }),
      db.list('crm_leads', { converted: false }, { order: 'created_at' }).catch(function(){ return []; }),
      db.pipeline.deals().catch(function(){ return []; }),
      db.pipeline.stages().catch(function(){ return []; }),
      db.list('crm_activities', {}, { order: 'created_at', limit: 50 }).catch(function(){ return []; }),
      db.list('crm_quotes', {}, { order: 'created_at' }).catch(function(){ return []; }),
    ]).then(function(res) {
      S.contacts   = res[0] || [];
      S.leads      = res[1] || [];
      S.deals      = res[2] || [];
      var rawStages = (res[3] && res[3].length) ? res[3] : defaultStages();
      // Deduplicate by name — prevents double columns if DB returns stages already merged with defaults
      var seenStageNames = {};
      S.stages = rawStages.filter(function(st) {
        if (seenStageNames[st.name]) return false;
        seenStageNames[st.name] = true;
        return true;
      });
      S.activities = res[4] || [];
      S.quotes     = res[5] || [];

      // Pending approval queue — quotes that need manager review
      S.pendingQuotes = S.quotes.filter(function(q) { return q.status === 'Pending Approval'; });

      // Build simple dashboard aggregates client-side (no extra round-trip)
      var openDeals = S.deals.filter(function(d){ return d.stage!=='Won'&&d.stage!=='Lost'; });
      S.dashboard = {
        contacts_total: S.contacts.length,
        leads_open:     S.leads.length,
        deals_open:     openDeals.length,
        pipeline_value: openDeals.reduce(function(s,d){ return s+(parseFloat(d.value)||0); }, 0),
      };

      S.loading = false; render();
    }).catch(function(e){ console.error(e); S.loading=false; S.stages=defaultStages(); render(); });
  }

  function defaultStages(){
    return [
      {id:'s1',name:'Lead',order:'1',color:'#94a3b8',probability:'10'},
      {id:'s2',name:'Qualified',order:'2',color:'#3b82f6',probability:'30'},
      {id:'s3',name:'Proposal',order:'3',color:'#f59e0b',probability:'50'},
      {id:'s4',name:'Negotiation',order:'4',color:'#f97316',probability:'70'},
      {id:'s5',name:'Won',order:'5',color:'#10b981',probability:'100'},
      {id:'s6',name:'Lost',order:'6',color:'#ef4444',probability:'0'},
    ];
  }

  // ── Render shell ───────────────────────────────────────────────
  function render(){
    attachStyles();
    var TABS = ['dashboard','contacts','leads','pipeline','quotes','activities'];
    var ICONS = {dashboard:'fa-th-large',contacts:'fa-users',leads:'fa-bolt',pipeline:'fa-columns',quotes:'fa-file-invoice-dollar',activities:'fa-history'};
    var LABELS = {dashboard:'Dashboard',contacts:'Contacts',leads:'Leads',pipeline:'Pipeline',quotes:'Price Submissions',activities:'Activities'};
    var ADD_LABELS = {contacts:'Add Contact',leads:'Add Lead',pipeline:'Add Deal',quotes:'New Quote',activities:'Log Activity'};

    container.innerHTML =
      '<div class="flex flex-col bg-slate-50" style="min-height:100%">'+

        '<div class="bg-white border-b border-slate-200 px-6 py-4">'+
          '<div class="flex items-center justify-between flex-wrap gap-3">'+
            '<div class="flex items-center gap-3">'+
              '<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">'+
                '<i class="fas fa-address-book text-white text-sm"></i></div>'+
              '<div>'+
                '<h1 class="text-lg font-bold text-slate-800">CRM</h1>'+
                '<p class="text-xs text-slate-400">Contacts · Leads · Pipeline · Price Submissions</p>'+
              '</div>'+
            '</div>'+
            '<div class="flex items-center gap-2">'+
              (ADD_LABELS[S.tab] ? '<button id="crm-add-btn" class="crm-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>'+ADD_LABELS[S.tab]+'</button>' : '')+
              '<button id="crm-refresh-btn" class="crm-btn-ghost text-sm"><i class="fas fa-sync-alt'+(S.loading?' fa-spin':'')+'"></i></button>'+
            '</div>'+
          '</div>'+
          '<div class="flex gap-1 mt-4 overflow-x-auto">'+
            TABS.map(function(t){
              var active = S.tab===t;
              var badge = (t==='quotes'&&S.pendingQuotes.length) ? ' <span class="ml-1 bg-amber-400 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">'+S.pendingQuotes.length+'</span>' : '';
              return '<button class="crm-tab flex-shrink-0 '+(active?'crm-tab-active':'crm-tab-inactive')+'" data-tab="'+t+'">'+
                '<i class="fas '+ICONS[t]+' mr-1.5"></i>'+LABELS[t]+badge+'</button>';
            }).join('')+
          '</div>'+
        '</div>'+

        '<div class="flex-1 overflow-y-auto p-6">'+
          (S.loading ? '<div class="flex items-center justify-center h-64"><i class="fas fa-circle-notch fa-spin text-3xl text-pink-400 opacity-60"></i></div>' :
           S.tab==='dashboard'  ? renderDashboard() :
           S.tab==='contacts'   ? renderContacts()  :
           S.tab==='leads'      ? renderLeads()      :
           S.tab==='pipeline'   ? renderPipeline()  :
           S.tab==='quotes'     ? renderQuotes()    :
           renderActivities())+
        '</div>'+

      '</div>'+
      (S.modal ? renderModal() : '');

    bindEvents();
  }

  // ── Dashboard ──────────────────────────────────────────────────
  function renderDashboard(){
    var d=S.dashboard;
    var openDeals=S.deals.filter(function(x){return x.stage!=='Won'&&x.stage!=='Lost';});
    var pipeVal=openDeals.reduce(function(s,x){return s+(parseFloat(x.value)||0);},0);
    var acceptedVal=S.quotes.filter(function(q){return q.status==='Accepted';}).reduce(function(s,q){return s+(parseFloat(q.total)||0);},0);

    var kpis=[
      {label:'Contacts',    value:d.contacts_total||S.contacts.length, icon:'fa-users',               color:'from-blue-500 to-blue-600'},
      {label:'Open Leads',  value:d.leads_open||S.leads.length,        icon:'fa-bolt',                color:'from-amber-400 to-orange-500'},
      {label:'Open Deals',  value:d.deals_open||openDeals.length,      icon:'fa-handshake',           color:'from-indigo-500 to-purple-600'},
      {label:'Pipeline',    value:fmt$(d.pipeline_value||pipeVal),      icon:'fa-dollar-sign',         color:'from-emerald-500 to-teal-600'},
      {label:'Quotes Pending',value:S.pendingQuotes.length,            icon:'fa-clock',               color:'from-amber-400 to-orange-500'},
      {label:'Accepted Rev',value:fmt$(acceptedVal),                    icon:'fa-trophy',              color:'from-pink-500 to-rose-600'},
    ];

    var stageMap={};
    openDeals.forEach(function(dl){
      if(!stageMap[dl.stage]) stageMap[dl.stage]={count:0,value:0};
      stageMap[dl.stage].count++; stageMap[dl.stage].value+=parseFloat(dl.value||0);
    });
    var totalPV=Object.values(stageMap).reduce(function(s,v){return s+v.value;},0);

    return '<div class="max-w-6xl mx-auto space-y-6">'+
      '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">'+
        kpis.map(function(k){
          return '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">'+
            '<div class="w-8 h-8 rounded-lg bg-gradient-to-br '+k.color+' flex items-center justify-center mb-3">'+
              '<i class="fas '+k.icon+' text-white text-xs"></i></div>'+
            '<p class="text-2xl font-bold text-slate-800">'+k.value+'</p>'+
            '<p class="text-xs text-slate-500 mt-0.5">'+k.label+'</p></div>';
        }).join('')+
      '</div>'+

      '<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">'+
        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">'+
          '<h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-columns text-pink-500 text-sm"></i> Pipeline</h3>'+
          (S.stages.filter(function(s){return s.name!=='Lost';}).map(function(stage){
            var info=stageMap[stage.name]||{count:0,value:0};
            var pct=totalPV?Math.round((info.value/totalPV)*100):0;
            return '<div class="mb-3"><div class="flex justify-between text-xs mb-1">'+
              '<span class="font-medium text-slate-600">'+esc(stage.name)+'</span>'+
              '<span class="text-slate-500">'+info.count+' · '+fmt$(info.value)+'</span></div>'+
              '<div class="h-2 bg-slate-100 rounded-full overflow-hidden">'+
                '<div class="h-full rounded-full" style="width:'+pct+'%;background:'+stage.color+'"></div></div></div>';
          }).join('')||'<p class="text-sm text-slate-400 text-center py-4">No open deals</p>')+
        '</div>'+

        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">'+
          '<h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-file-invoice-dollar text-pink-500 text-sm"></i> Quote Funnel</h3>'+
          (function(){
            if(!S.quotes.length) return '<p class="text-sm text-slate-400 text-center py-4">No quotes yet</p>';
            var total=S.quotes.length;
            return QFLOW.map(function(stage){
              var count=S.quotes.filter(function(q){return q.status===stage;}).length;
              var pct=total?Math.round((count/total)*100):0;
              var colors={'Draft':'#94a3b8','Submitted':'#3b82f6','Pending Approval':'#f59e0b','Approved':'#10b981','Sent to Client':'#6366f1','Accepted':'#ec4899'};
              return '<div class="mb-2.5"><div class="flex justify-between text-xs mb-1">'+
                '<span class="font-medium text-slate-600">'+stage+'</span>'+
                '<span class="text-slate-500">'+count+'</span></div>'+
                '<div class="h-2 bg-slate-100 rounded-full overflow-hidden">'+
                  '<div class="h-full rounded-full" style="width:'+pct+'%;background:'+(colors[stage]||'#94a3b8')+'"></div></div></div>';
            }).join('');
          })()+
        '</div>'+

        '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">'+
          '<h3 class="font-semibold text-slate-700 mb-4 flex items-center gap-2"><i class="fas fa-history text-pink-500 text-sm"></i> Recent Activity</h3>'+
          '<div class="space-y-3 max-h-64 overflow-y-auto">'+
            (S.activities.length ? S.activities.slice(0,8).map(function(a){
              var tc={Call:'bg-blue-500',Email:'bg-pink-500',Meeting:'bg-purple-500',Note:'bg-slate-400',Task:'bg-amber-500',Demo:'bg-cyan-500'};
              var ti={Call:'fa-phone',Email:'fa-envelope',Meeting:'fa-calendar-check',Note:'fa-sticky-note',Task:'fa-check-square',Demo:'fa-desktop'};
              return '<div class="flex gap-3 items-start">'+
                '<div class="w-7 h-7 rounded-full '+(tc[a.type]||'bg-slate-400')+' flex items-center justify-center flex-shrink-0 text-white text-xs">'+
                  '<i class="fas '+(ti[a.type]||'fa-circle')+'"></i></div>'+
                '<div class="flex-1 min-w-0">'+
                  '<p class="text-sm font-medium text-slate-700 truncate">'+esc(a.subject||a.type)+'</p>'+
                  (a.body?'<p class="text-xs text-slate-400">'+esc(a.body.substring(0,50))+'</p>':'')+
                '</div>'+
                '<span class="text-xs text-slate-400 flex-shrink-0">'+fmtDate(a.created_at)+'</span></div>';
            }).join('') : '<p class="text-sm text-slate-400 text-center py-4">No activities yet</p>')+
          '</div>'+
        '</div>'+
      '</div>'+

      '<div class="grid grid-cols-2 md:grid-cols-5 gap-3">'+
        [{tab:'contacts',icon:'fa-users',label:'Contacts',cls:'bg-blue-50 text-blue-600 border-blue-200'},
         {tab:'leads',icon:'fa-bolt',label:'Leads',cls:'bg-amber-50 text-amber-600 border-amber-200'},
         {tab:'pipeline',icon:'fa-columns',label:'Pipeline',cls:'bg-purple-50 text-purple-600 border-purple-200'},
         {tab:'quotes',icon:'fa-file-invoice-dollar',label:'Price Submissions',cls:'bg-pink-50 text-pink-600 border-pink-200'},
         {tab:'activities',icon:'fa-history',label:'Activities',cls:'bg-slate-50 text-slate-600 border-slate-200'},
        ].map(function(q){
          return '<button class="crm-quicknav flex items-center gap-2 p-3 rounded-xl border '+q.cls+' text-left hover:opacity-80 transition-opacity text-sm font-medium" data-tab="'+q.tab+'">'+
            '<i class="fas '+q.icon+'"></i>'+q.label+'</button>';
        }).join('')+
      '</div>'+
    '</div>';
  }

  // ── Contacts ───────────────────────────────────────────────────
  function renderContacts(){
    var rows=S.contacts;
    if(S.search){var q=S.search.toLowerCase(); rows=rows.filter(function(r){return (r.name||'').toLowerCase().indexOf(q)>-1||(r.email||'').toLowerCase().indexOf(q)>-1||(r.company||'').toLowerCase().indexOf(q)>-1;});}
    if(S.filterStatus) rows=rows.filter(function(r){return r.status===S.filterStatus;});
    return '<div class="max-w-6xl mx-auto">'+
      toolbar(S.search,[
        selEl('crm-filter-status','All Statuses',['Lead','Prospect','Customer','Churned','Partner'],S.filterStatus),
        '<span class="text-sm text-slate-500 self-center">'+rows.length+' contact'+(rows.length!==1?'s':'')+'</span>',
      ],'Search contacts…')+
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">'+
        '<table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">'+
          th('Name')+th('Company','hidden md:table-cell')+th('Email','hidden lg:table-cell')+th('Status')+th('Score','hidden md:table-cell')+'<th class="px-4 py-3"></th>'+
        '</tr></thead><tbody>'+
          (rows.length ? rows.map(function(c){
            return '<tr class="crm-contact-row border-b border-slate-100 hover:bg-slate-50 cursor-pointer" data-id="'+esc(c.id)+'">'+
              '<td class="px-4 py-3">'+avatar(c.name,'from-pink-400 to-rose-500')+esc(c.name)+'<br><span class="text-xs text-slate-400">'+esc(c.job_title||'')+'</span></td>'+
              '<td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">'+esc(c.company||'—')+'</td>'+
              '<td class="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">'+esc(c.email||'—')+'</td>'+
              '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-medium '+(PILL[c.status]||'bg-slate-100 text-slate-600')+'">'+esc(c.status||'—')+'</span></td>'+
              '<td class="px-4 py-3 hidden md:table-cell"><span class="text-sm font-bold '+scoreColor(c.lead_score)+'">'+( c.lead_score||0)+'</span></td>'+
              '<td class="px-4 py-3 text-right">'+
                '<button class="crm-edit-contact text-slate-400 hover:text-slate-600 mr-2 text-xs" data-id="'+esc(c.id)+'"><i class="fas fa-edit"></i></button>'+
                '<button class="crm-del-contact text-slate-400 hover:text-red-500 text-xs" data-id="'+esc(c.id)+'"><i class="fas fa-trash"></i></button>'+
              '</td></tr>';
          }).join('') : empty('fa-users','No contacts found.'))+
        '</tbody></table></div></div>';
  }

  // ── Leads ──────────────────────────────────────────────────────
  function renderLeads(){
    var LSTAGES=['New','Contacted','Qualified','Proposal','Negotiation'];
    var rows=S.leads;
    if(S.search){var q=S.search.toLowerCase(); rows=rows.filter(function(r){return (r.name||'').toLowerCase().indexOf(q)>-1||(r.company||'').toLowerCase().indexOf(q)>-1;});}
    if(S.filterStage) rows=rows.filter(function(r){return r.stage===S.filterStage;});
    return '<div class="max-w-6xl mx-auto">'+
      toolbar(S.search,[
        selEl('crm-filter-stage','All Stages',LSTAGES,S.filterStage),
        '<span class="text-sm text-slate-500 self-center">'+rows.length+' lead'+(rows.length!==1?'s':'')+'</span>',
      ],'Search leads…')+
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">'+
        '<table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">'+
          th('Lead')+th('Linked Contact','hidden md:table-cell')+th('Stage')+th('Score')+th('Value','hidden md:table-cell')+'<th class="px-4 py-3"></th>'+
        '</tr></thead><tbody>'+
          (rows.length ? rows.map(function(l){
            var sc=parseFloat(l.lead_score||0);
            var linked=null;
            if(l.contact_id) linked=S.contacts.find(function(c){return c.id===l.contact_id;});
            if(!linked&&l.email) linked=S.contacts.find(function(c){return c.email&&c.email.toLowerCase()===(l.email||'').toLowerCase();});
            return '<tr class="border-b border-slate-100 hover:bg-slate-50">'+
              '<td class="px-4 py-3">'+avatar(l.name,'from-amber-400 to-orange-500')+esc(l.name)+'<br><span class="text-xs text-slate-400">'+esc(l.email||l.source||'')+'</span></td>'+
              '<td class="px-4 py-3 hidden md:table-cell">'+(linked?'<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-xs text-green-700"><i class="fas fa-link" style="font-size:9px"></i>'+esc(linked.name)+'</span>':'<span class="text-slate-400 text-xs italic">None</span>')+'</td>'+
              '<td class="px-4 py-3"><select class="crm-lead-stage crm-input py-0.5 text-xs" style="width:auto;padding:.2rem .5rem" data-id="'+esc(l.id)+'">'+
                LSTAGES.map(function(s){return '<option '+(l.stage===s?'selected':'')+'>'+s+'</option>';}).join('')+
              '</select></td>'+
              '<td class="px-4 py-3"><div class="flex items-center gap-2">'+
                '<div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full '+(sc>=70?'bg-green-500':sc>=40?'bg-amber-400':'bg-slate-300')+'" style="width:'+Math.min(sc,100)+'%"></div></div>'+
                '<span class="text-xs font-bold '+scoreColor(l.lead_score)+'">'+( l.lead_score||0)+'</span></div></td>'+
              '<td class="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">'+(l.deal_value?fmt$(l.deal_value):'—')+'</td>'+
              '<td class="px-4 py-3 text-right">'+
                '<button class="crm-convert-lead text-xs text-indigo-500 hover:text-indigo-700 font-medium mr-2" data-id="'+esc(l.id)+'">Convert</button>'+
                '<button class="crm-del-lead text-slate-400 hover:text-red-500 text-xs" data-id="'+esc(l.id)+'"><i class="fas fa-trash"></i></button>'+
              '</td></tr>';
          }).join('') : empty('fa-bolt','No leads yet.'))+
        '</tbody></table></div></div>';
  }

  // ── Pipeline ───────────────────────────────────────────────────
  function renderPipeline(){
    var stages=S.stages.slice().sort(function(a,b){return parseInt(a.order||0)-parseInt(b.order||0);});
    var openDeals=S.deals.filter(function(d){return d.stage!=='Won'&&d.stage!=='Lost';});
    var pipeVal=openDeals.reduce(function(s,d){return s+(parseFloat(d.value)||0);},0);
    return '<div>'+
      '<div class="flex flex-wrap gap-3 mb-5">'+
        '<div class="relative min-w-48"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>'+
          '<input class="crm-search pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" type="text" placeholder="Search deals…" value="'+esc(S.search)+'"></div>'+
        '<span class="text-sm text-slate-600 self-center"><strong>'+openDeals.length+'</strong> open · <strong class="text-emerald-600">'+fmt$(pipeVal)+'</strong></span>'+
      '</div>'+
      '<div class="flex gap-4 overflow-x-auto pb-4" style="min-height:500px">'+
        stages.map(function(stage){
          var deals=S.deals.filter(function(d){return d.stage===stage.name;});
          if(S.search){var q=S.search.toLowerCase(); deals=deals.filter(function(d){return (d.deal_name||'').toLowerCase().indexOf(q)>-1||(d.company||'').toLowerCase().indexOf(q)>-1;});}
          var sv=deals.reduce(function(s,d){return s+(parseFloat(d.value)||0);},0);
          return '<div class="crm-stage-col flex-shrink-0 w-72 flex flex-col rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50" data-stage="'+esc(stage.name)+'">'+
            '<div class="px-3 py-3 flex items-center justify-between border-b border-slate-200" style="background:'+stage.color+'18;border-top:3px solid '+stage.color+'">'+
              '<div class="flex items-center gap-2">'+
                '<span class="w-2.5 h-2.5 rounded-full" style="background:'+stage.color+'"></span>'+
                '<span class="text-sm font-semibold text-slate-700">'+esc(stage.name)+'</span>'+
                '<span class="text-xs bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-slate-500">'+deals.length+'</span>'+
              '</div>'+
              '<span class="text-xs font-medium text-slate-500">'+fmt$(sv)+'</span>'+
            '</div>'+
            '<div class="flex-1 p-2 space-y-2 overflow-y-auto" style="max-height:520px">'+
              deals.map(function(deal){
                var dqCount=S.quotes.filter(function(q){return q.deal_id===deal.id;}).length;
                var dqActive=S.quotes.filter(function(q){return q.deal_id===deal.id&&(q.status==='Pending Approval'||q.status==='Submitted');}).length;
                return '<div class="crm-deal-card bg-white rounded-lg border border-slate-200 p-3 cursor-grab shadow-sm hover:shadow-md transition-shadow" draggable="true" data-id="'+esc(deal.id)+'" data-stage="'+esc(stage.name)+'">'+
                  '<p class="font-medium text-slate-800 text-sm mb-1">'+esc(deal.deal_name)+'</p>'+
                  (deal.contact_name?'<p class="text-xs text-slate-500 mb-0.5"><i class="fas fa-user w-3"></i> '+esc(deal.contact_name)+'</p>':'')+
                  (deal.company?'<p class="text-xs text-slate-500 mb-2"><i class="fas fa-building w-3"></i> '+esc(deal.company)+'</p>':'')+
                  '<div class="flex items-center justify-between mt-2">'+
                    '<span class="text-sm font-bold text-slate-700">'+fmt$(deal.value)+'</span>'+
                    '<div class="flex items-center gap-1">'+
                      '<div class="w-14 h-1 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-emerald-400 rounded-full" style="width:'+(deal.probability||0)+'%"></div></div>'+
                      '<span class="text-xs text-slate-400">'+(deal.probability||0)+'%</span>'+
                    '</div>'+
                  '</div>'+
                  (dqCount?'<div class="mt-2 flex items-center gap-1.5">'+
                    '<i class="fas fa-file-invoice-dollar text-xs '+(dqActive?'text-amber-500':'text-slate-400')+'"></i>'+
                    '<span class="text-xs '+(dqActive?'text-amber-600 font-medium':'text-slate-400')+'">'+dqCount+' quote'+(dqCount!==1?'s':'')+(dqActive?' · '+dqActive+' pending':'')+' </span>'+
                    '<button class="crm-deal-view-quotes text-xs text-indigo-500 hover:underline" data-deal-id="'+esc(deal.id)+'">view</button>'+
                  '</div>':'')+
                  (deal.expected_close?'<p class="text-xs text-slate-400 mt-1.5"><i class="fas fa-calendar-alt mr-1"></i>'+esc(deal.expected_close)+'</p>':'')+
                '</div>';
              }).join('')+
              '<div class="crm-drop-zone hidden border-2 border-dashed border-pink-300 rounded-lg p-3 text-center text-xs text-pink-400 bg-pink-50">Drop here</div>'+
              (deals.length===0?'<div class="p-4 text-center text-xs text-slate-400"><i class="fas fa-inbox text-xl mb-2 block opacity-30"></i>No deals</div>':'')+
            '</div>'+
            '<div class="p-2 border-t border-slate-200">'+
              '<button class="crm-add-deal-stage w-full text-xs text-slate-500 hover:text-pink-500 hover:bg-pink-50 py-1.5 rounded-lg transition-colors" data-stage="'+esc(stage.name)+'">'+
                '<i class="fas fa-plus mr-1"></i> Add deal</button>'+
            '</div>'+
          '</div>';
        }).join('')+
      '</div></div>';
  }

  // ── Price Submissions ──────────────────────────────────────────
  function renderQuotes(){
    var QSTATUSES=['Draft','Submitted','Pending Approval','Approved','Rejected','Sent to Client','Accepted','Declined','Negotiating'];
    var rows=S.quotes;
    if(S.filterQuoteStatus) rows=rows.filter(function(r){return r.status===S.filterQuoteStatus;});
    if(S.search){var q=S.search.toLowerCase(); rows=rows.filter(function(r){return (r.deal_name||'').toLowerCase().indexOf(q)>-1||(r.contact_name||'').toLowerCase().indexOf(q)>-1||(r.id||'').toLowerCase().indexOf(q)>-1;});}

    var totalVal=S.quotes.reduce(function(s,r){return s+(parseFloat(r.total)||0);},0);
    var acceptedVal=S.quotes.filter(function(r){return r.status==='Accepted';}).reduce(function(s,r){return s+(parseFloat(r.total)||0);},0);

    return '<div class="max-w-6xl mx-auto space-y-5">'+
      '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">'+
        [{label:'Total Quotes',value:S.quotes.length,icon:'fa-file-invoice-dollar',color:'from-indigo-500 to-purple-600'},
         {label:'Pending Approval',value:S.pendingQuotes.length,icon:'fa-clock',color:'from-amber-400 to-orange-500'},
         {label:'Total Quoted',value:fmt$(totalVal),icon:'fa-dollar-sign',color:'from-blue-500 to-blue-600'},
         {label:'Accepted Revenue',value:fmt$(acceptedVal),icon:'fa-trophy',color:'from-emerald-500 to-teal-600'},
        ].map(function(k){
          return '<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-3">'+
            '<div class="w-9 h-9 rounded-lg bg-gradient-to-br '+k.color+' flex items-center justify-center flex-shrink-0">'+
              '<i class="fas '+k.icon+' text-white text-xs"></i></div>'+
            '<div><p class="text-xl font-bold text-slate-800">'+k.value+'</p><p class="text-xs text-slate-500">'+k.label+'</p></div></div>';
        }).join('')+
      '</div>'+

      (S.pendingQuotes.length?
        '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">'+
          '<div class="flex items-center gap-3">'+
            '<div class="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center text-white text-sm flex-shrink-0"><i class="fas fa-clock"></i></div>'+
            '<div><p class="font-semibold text-amber-800 text-sm">'+S.pendingQuotes.length+' quote'+(S.pendingQuotes.length!==1?'s':'')+' awaiting your approval</p>'+
            '<p class="text-xs text-amber-600">Review, approve or reject before they expire</p></div>'+
          '</div>'+
          '<button class="crm-quote-status-btn text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg border border-amber-300" data-status="Pending Approval">View Queue →</button>'+
        '</div>'
      :'')+

      toolbar(S.search,[
        selEl('crm-filter-qstatus','All Statuses',QSTATUSES,S.filterQuoteStatus),
        '<span class="text-sm text-slate-500 self-center">'+rows.length+' quote'+(rows.length!==1?'s':'')+'</span>',
      ],'Search quotes…')+

      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">'+
        '<table class="w-full"><thead><tr class="bg-slate-50 border-b border-slate-200">'+
          th('Quote ID')+th('Deal / Client','hidden md:table-cell')+th('Status')+th('Total')+th('Discount','hidden lg:table-cell')+th('Valid Until','hidden lg:table-cell')+'<th class="px-4 py-3"></th>'+
        '</tr></thead><tbody>'+
          (rows.length ? rows.map(function(q){
            var dp=parseFloat(q.discount_pct||0);
            return '<tr class="crm-quote-row border-b border-slate-100 hover:bg-slate-50 cursor-pointer" data-id="'+esc(q.id)+'">'+
              '<td class="px-4 py-3"><p class="font-mono text-sm font-medium text-slate-800">'+esc(q.id)+'</p><p class="text-xs text-slate-400">v'+esc(q.version||'1')+' · '+fmtDate(q.created_at)+'</p></td>'+
              '<td class="px-4 py-3 hidden md:table-cell"><p class="text-sm font-medium text-slate-700">'+esc(q.deal_name||'—')+'</p><p class="text-xs text-slate-400">'+esc(q.contact_name||q.company||'')+'</p></td>'+
              '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-medium '+(QSTATUS_CLS[q.status]||'bg-slate-100 text-slate-600')+'">'+esc(q.status)+'</span></td>'+
              '<td class="px-4 py-3"><p class="text-sm font-bold text-slate-800">'+fmt$(q.total)+'</p><p class="text-xs text-slate-400">'+esc(q.currency||'USD')+'</p></td>'+
              '<td class="px-4 py-3 hidden lg:table-cell">'+(dp>0?'<span class="text-xs font-semibold '+(dp>=10?'text-amber-600':'text-slate-600')+'">'+dp+'%'+(dp>=10?' ⚠':'')+'</span>':'<span class="text-xs text-slate-400">—</span>')+'</td>'+
              '<td class="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">'+esc(q.valid_until||'—')+'</td>'+
              '<td class="px-4 py-3 text-right text-xs">'+quoteActionBtns(q)+'</td>'+
            '</tr>';
          }).join('') : empty('fa-file-invoice-dollar','No price submissions yet.'))+
        '</tbody></table></div></div>';
  }

  function quoteActionBtns(q){
    var b='';
    if(q.status==='Draft') b+='<button class="crm-q-action text-blue-500 hover:text-blue-700 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="submit">Submit</button>';
    if(q.status==='Pending Approval'){
      b+='<button class="crm-q-action text-emerald-600 hover:text-emerald-800 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="approve">Approve</button>';
      b+='<button class="crm-q-action text-red-500 hover:text-red-700 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="reject">Reject</button>';
    }
    if(q.status==='Approved') b+='<button class="crm-q-action text-indigo-500 hover:text-indigo-700 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="send">Send to Client</button>';
    if(q.status==='Sent to Client'){
      b+='<button class="crm-q-action text-emerald-600 hover:text-emerald-800 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="accept">Accepted</button>';
      b+='<button class="crm-q-action text-purple-500 hover:text-purple-700 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="negotiate">Negotiating</button>';
      b+='<button class="crm-q-action text-red-500 hover:text-red-700 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="decline">Declined</button>';
    }
    if(q.status==='Rejected'||q.status==='Declined'||q.status==='Negotiating') b+='<button class="crm-q-action text-purple-500 hover:text-purple-700 font-medium mr-2" data-id="'+esc(q.id)+'" data-action="revise">Revise</button>';
    b+='<button class="crm-q-action text-slate-400 hover:text-red-500" data-id="'+esc(q.id)+'" data-action="delete"><i class="fas fa-trash"></i></button>';
    return b;
  }

  // ── Activities ─────────────────────────────────────────────────
  function renderActivities(){
    var rows=S.activities;
    if(S.search){var q=S.search.toLowerCase(); rows=rows.filter(function(r){return (r.subject||'').toLowerCase().indexOf(q)>-1||(r.body||'').toLowerCase().indexOf(q)>-1;});}
    var ti={Call:'fa-phone',Email:'fa-envelope',Meeting:'fa-calendar-check',Note:'fa-sticky-note',Task:'fa-check-square',Demo:'fa-desktop'};
    var tc={Call:'bg-blue-500',Email:'bg-pink-500',Meeting:'bg-purple-500',Note:'bg-slate-400',Task:'bg-amber-500',Demo:'bg-cyan-500'};
    return '<div class="max-w-3xl mx-auto">'+
      toolbar(S.search,['<span class="text-sm text-slate-500 self-center">'+rows.length+' activit'+(rows.length!==1?'ies':'y')+'</span>'],'Search activities…')+
      '<div class="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">'+
        (rows.length ? rows.map(function(a){
          return '<div class="flex gap-4 p-4 hover:bg-slate-50">'+
            '<div class="w-9 h-9 rounded-full '+(tc[a.type]||'bg-slate-400')+' flex items-center justify-center flex-shrink-0 text-white text-xs">'+
              '<i class="fas '+(ti[a.type]||'fa-circle')+'"></i></div>'+
            '<div class="flex-1 min-w-0">'+
              '<div class="flex items-center justify-between gap-2">'+
                '<p class="font-medium text-slate-700 text-sm">'+esc(a.subject||a.type)+'</p>'+
                '<span class="text-xs text-slate-400 flex-shrink-0">'+fmtDate(a.created_at)+'</span></div>'+
              (a.body?'<p class="text-sm text-slate-500 mt-0.5">'+esc(a.body)+'</p>':'')+
              '<span class="text-xs font-medium text-slate-500">'+esc(a.type)+'</span>'+
              (a.outcome?' <span class="text-xs text-slate-400">· '+esc(a.outcome)+'</span>':'')+
            '</div></div>';
        }).join('') : empty('fa-history','No activities logged yet.'))+
      '</div></div>';
  }

  // ── Modal ──────────────────────────────────────────────────────
  function renderModal(){
    var t=S.modal, r=S.editRec||{}, title='', body='', showForm=true;

    if(t==='add-contact'||t==='edit-contact'){
      title=t==='edit-contact'?'Edit Contact':'Add Contact';
      body='<div class="grid grid-cols-2 gap-3">'+
        '<div class="col-span-2">'+fld('Full Name *','name',r.name,'','required')+'</div>'+
        fld('Email','email',r.email,'email')+fld('Phone','phone',r.phone)+
        fld('Company','company',r.company)+fld('Job Title','job_title',r.job_title)+
        sel('Status','status',['Lead','Prospect','Customer','Churned','Partner'],r.status)+
        sel('Source','source',['','Website','Referral','Social','Cold Outreach','Event','Inbound','Other'],r.source)+
        '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="notes" rows="2" class="crm-input resize-none">'+esc(r.notes||'')+'</textarea></div>'+
      '</div>';
    }

    if(t==='add-lead'){
      title='Add Lead';
      var cOpts='<option value="">— No existing contact —</option>'+S.contacts.map(function(c){
        return '<option value="'+esc(c.id)+'" data-email="'+esc(c.email||'')+'" data-phone="'+esc(c.phone||'')+'" data-company="'+esc(c.company||'')+'" data-job_title="'+esc(c.job_title||'')+'">'+esc(c.name)+(c.company?' — '+esc(c.company):'')+'</option>';
      }).join('');
      body='<div class="grid grid-cols-2 gap-3">'+
        '<div class="col-span-2"><label class="crm-label">Link to Existing Contact</label>'+
          '<select id="crm-lead-link" name="contact_id" class="crm-input">'+cOpts+'</select>'+
          '<p class="text-xs text-slate-400 mt-1">Selecting a contact auto-fills fields below.</p></div>'+
        '<div id="crm-dupe-warn" class="col-span-2 hidden"><div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700"><i class="fas fa-exclamation-triangle mr-1"></i>Email matches an existing contact — consider linking above.</div></div>'+
        '<div class="col-span-2">'+fld('Name *','name','','','required')+'</div>'+
        fld('Email','email','','email')+fld('Phone','phone','')+
        fld('Company','company','')+fld('Job Title','job_title','')+
        sel('Stage','stage',['New','Contacted','Qualified','Proposal','Negotiation'],'')+
        sel('Source','source',['','Website','Referral','Social','Cold Outreach','Event','Inbound','Other'],'')+
        fld('Deal Value ($)','deal_value','','number')+
        '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="notes" rows="2" class="crm-input resize-none"></textarea></div>'+
      '</div>';
    }

    if(t==='add-deal'){
      title='Add Deal';
      var ds=S.stageForDeal||'New';
      body='<div class="grid grid-cols-2 gap-3">'+
        '<div class="col-span-2">'+fld('Deal Name *','deal_name','','','required')+'</div>'+
        fld('Contact Name','contact_name','')+fld('Company','company','')+
        '<div><label class="crm-label">Stage</label><select name="stage" class="crm-input">'+
          S.stages.map(function(s){return '<option value="'+esc(s.name)+'" '+(s.name===ds?'selected':'')+'>'+esc(s.name)+'</option>';}).join('')+
        '</select></div>'+
        fld('Value ($)','value','','number')+fld('Probability (%)','probability','','number')+
        fld('Expected Close','expected_close','','date')+
        '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="notes" rows="2" class="crm-input resize-none"></textarea></div>'+
      '</div>';
    }

    if(t==='add-activity'){
      title='Log Activity';
      body='<div class="grid grid-cols-2 gap-3">'+
        sel('Type','type',['Call','Email','Meeting','Note','Task','Demo'],'')+
        fld('Subject *','subject','','','required')+
        '<div class="col-span-2"><label class="crm-label">Notes</label><textarea name="body" rows="3" class="crm-input resize-none" placeholder="What was discussed…"></textarea></div>'+
        fld('Outcome','outcome','')+fld('Date','scheduled_at','','date')+
      '</div>';
    }

    if(t==='add-quote'){
      title='New Price Submission';
      var dOpts='<option value="">— Select a Deal * —</option>'+
        S.deals.filter(function(d){return d.stage!=='Won'&&d.stage!=='Lost';}).map(function(d){
          return '<option value="'+esc(d.id)+'" data-name="'+esc(d.deal_name)+'" data-contact_name="'+esc(d.contact_name||'')+'" data-contact_id="'+esc(d.contact_id||'')+'" data-company="'+esc(d.company||'')+'">'+
            esc(d.deal_name)+(d.company?' — '+esc(d.company):'')+'</option>';
        }).join('');
      body='<div class="grid grid-cols-2 gap-3">'+
        '<div class="col-span-2"><label class="crm-label">Deal *</label>'+
          '<select id="crm-q-deal" name="deal_id" class="crm-input" required>'+dOpts+'</select></div>'+
        '<div class="col-span-2">'+fld('Subtotal ($) *','subtotal','','number','required step=0.01 placeholder="0.00"')+'</div>'+
        '<div><label class="crm-label">Discount (%)</label>'+
          '<input id="crm-q-disc" name="discount_pct" type="number" min="0" max="100" step="0.1" class="crm-input" placeholder="0">'+
          '<p id="crm-q-disc-warn" class="text-xs text-amber-600 mt-1 hidden"><i class="fas fa-exclamation-triangle mr-1"></i>≥10% requires manager approval</p></div>'+
        '<div id="crm-q-reason-wrap">'+fld('Discount Reason','discount_reason','','','placeholder="Volume deal, loyalty…"')+'</div>'+
        fld('Tax (%)','tax_pct','','number')+
        '<div><label class="crm-label">Currency</label><select name="currency" class="crm-input">'+
          ['USD','EUR','GBP','CAD','AUD'].map(function(c){return '<option>'+c+'</option>';}).join('')+
        '</select></div>'+
        fld('Valid Until','valid_until','','date')+
        '<div id="crm-q-total-display" class="flex items-center justify-end col-span-2 gap-2">'+
          '<span class="text-xs text-slate-500">Estimated Total:</span>'+
          '<span id="crm-q-total" class="text-xl font-bold text-emerald-600">$0.00</span></div>'+
        '<div class="col-span-2"><label class="crm-label">Line Items / Breakdown</label>'+
          '<textarea name="line_items" rows="3" class="crm-input resize-none" placeholder="10x Widget Pro @ $500&#10;Setup fee @ $200"></textarea></div>'+
        '<div class="col-span-2"><label class="crm-label">Internal Notes (for manager)</label>'+
          '<textarea name="notes" rows="2" class="crm-input resize-none" placeholder="Why this discount?"></textarea></div>'+
      '</div>';
    }

    if(t==='approve-quote'||t==='reject-quote'){
      var isApprove=t==='approve-quote';
      var q=S.quoteDetail||{};
      title=isApprove?'Approve Quote':'Reject Quote';
      showForm=true;
      body='<div class="space-y-4">'+
        '<div class="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">'+
          '<div><span class="text-slate-400 text-xs block">Quote</span><p class="font-mono font-medium">'+esc(q.id||'')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Version</span><p class="font-medium">v'+esc(q.version||'1')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Deal</span><p class="font-medium">'+esc(q.deal_name||'—')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Total</span><p class="text-lg font-bold text-emerald-600">'+fmt$(q.total)+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Discount</span><p class="font-semibold '+(parseFloat(q.discount_pct||0)>=10?'text-amber-600':'text-slate-700')+'">'+( q.discount_pct||0)+'%</p></div>'+
          (q.discount_reason?'<div><span class="text-slate-400 text-xs block">Reason</span><p class="font-medium">'+esc(q.discount_reason)+'</p></div>':'')+
        '</div>'+
        (q.notes?'<div class="bg-blue-50 rounded-lg p-3 text-xs text-blue-700"><i class="fas fa-comment mr-1"></i>'+esc(q.notes)+'</div>':'')+
        '<div><label class="crm-label">'+(isApprove?'Approval Note (optional)':'Rejection Reason *')+'</label>'+
          '<textarea name="review_note" rows="3" class="crm-input resize-none" '+(isApprove?'':'required')+' placeholder="'+(isApprove?'Any conditions or comments…':'Why is this being rejected?')+'"></textarea></div>'+
      '</div>';
    }

    if(t==='view-quote'){
      showForm=false;
      var q=S.quoteDetail||{};
      title='Quote '+esc(q.id||'');
      var rank=qStatusRank(q.status);
      body='<div class="space-y-4 text-sm">'+
        '<div class="flex items-center gap-1 flex-wrap text-xs">'+
          QFLOW.map(function(s,i){
            var cur=q.status===s;
            var done=rank>i||(rank===-1&&['Accepted','Declined','Negotiating'].indexOf(q.status)>-1);
            return '<span class="px-2 py-0.5 rounded-full font-medium '+(cur?'bg-indigo-500 text-white':done?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-400')+'">'+s+'</span>'+
              (i<QFLOW.length-1?'<span class="text-slate-300">›</span>':'');
          }).join('')+
          (q.status==='Rejected'?'<span class="px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Rejected</span>':'')+
          (q.status==='Declined'?'<span class="px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Declined</span>':'')+
          (q.status==='Negotiating'?'<span class="px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-600">Negotiating</span>':'')+
        '</div>'+
        '<div class="grid grid-cols-2 gap-3">'+
          '<div><span class="text-slate-400 text-xs block">Deal</span><p class="font-medium">'+esc(q.deal_name||'—')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Client</span><p class="font-medium">'+esc(q.contact_name||q.company||'—')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Version</span><p class="font-medium">v'+esc(q.version||'1')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Status</span><p><span class="px-2 py-0.5 rounded-full text-xs font-medium '+(QSTATUS_CLS[q.status]||'bg-slate-100 text-slate-600')+'">'+esc(q.status)+'</span></p></div>'+
          '<div><span class="text-slate-400 text-xs block">Subtotal</span><p class="font-medium">'+fmt$(q.subtotal)+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Discount</span><p class="font-semibold '+(parseFloat(q.discount_pct||0)>=10?'text-amber-600':'text-slate-700')+'">'+( q.discount_pct||0)+'%'+(q.discount_reason?' — '+esc(q.discount_reason):'')+'</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Tax</span><p class="font-medium">'+(q.tax_pct||0)+'%</p></div>'+
          '<div><span class="text-slate-400 text-xs block">Total</span><p class="text-lg font-bold text-emerald-600">'+fmt$(q.total)+' '+esc(q.currency||'USD')+'</p></div>'+
          (q.valid_until?'<div><span class="text-slate-400 text-xs block">Valid Until</span><p class="font-medium">'+esc(q.valid_until)+'</p></div>':'')+
          (q.submitted_by?'<div><span class="text-slate-400 text-xs block">Submitted By</span><p class="font-medium">'+esc(q.submitted_by)+'</p></div>':'')+
          (q.reviewed_by?'<div><span class="text-slate-400 text-xs block">Reviewed By</span><p class="font-medium">'+esc(q.reviewed_by)+'</p></div>':'')+
        '</div>'+
        (q.line_items?'<div><span class="text-slate-400 text-xs block mb-1">Line Items</span><div class="bg-slate-50 rounded-lg p-3 text-slate-600 text-xs whitespace-pre-wrap font-mono">'+esc(q.line_items)+'</div></div>':'')+
        (q.notes?'<div class="bg-blue-50 rounded-lg p-3 text-xs text-blue-700"><i class="fas fa-info-circle mr-1"></i>'+esc(q.notes)+'</div>':'')+
        (q.review_note?'<div class="bg-'+(q.status==='Rejected'?'red':'emerald')+'-50 rounded-lg p-3 text-xs"><strong>'+(q.status==='Rejected'?'Rejection':'Approval')+' note:</strong> '+esc(q.review_note)+'</div>':'')+
        '<div class="flex flex-wrap gap-2 pt-2">'+quoteActionBtns(q)+'</div>'+
      '</div>';
    }


    if(t==='view-deal'){
      showForm=false;
      var d=S.dealDetail||{};
      title=esc(d.deal_name||'Deal');
      var dActs=S.activities.filter(function(a){return a.deal_id===d.id;});
      var dQuotes=S.quotes.filter(function(q){return q.deal_id===d.id;});
      var stg=S.stages.find(function(s){return s.name===d.stage;})||{};
      body='<div class="space-y-4 text-sm">'+
        '<div class="grid grid-cols-2 gap-3">'+
          (d.stage?'<div><span class="text-slate-400 text-xs block">Stage</span><p><span class="px-2 py-0.5 rounded-full text-xs font-medium '+(PILL[d.stage]||'bg-slate-100 text-slate-600')+'">'+esc(d.stage)+'</span></p></div>':'')+
          (d.value?'<div><span class="text-slate-400 text-xs block">Value</span><p class="text-lg font-bold text-emerald-600">'+fmt$(d.value)+'</p></div>':'')+
          (d.contact_name?'<div><span class="text-slate-400 text-xs block">Contact</span><p class="font-medium">'+esc(d.contact_name)+'</p></div>':'')+
          (d.company?'<div><span class="text-slate-400 text-xs block">Company</span><p class="font-medium">'+esc(d.company)+'</p></div>':'')+
          (d.probability!==undefined?'<div><span class="text-slate-400 text-xs block">Probability</span><p class="font-medium">'+esc(d.probability)+'%</p></div>':'')+
          (d.expected_close?'<div><span class="text-slate-400 text-xs block">Expected Close</span><p class="font-medium">'+esc(d.expected_close)+'</p></div>':'')+
        '</div>'+
        (d.notes?'<div class="bg-slate-50 rounded-lg p-3 text-slate-600">'+esc(d.notes)+'</div>':'')+
        (dQuotes.length?'<div><p class="text-xs font-semibold text-slate-500 uppercase mb-2">Quotes ('+dQuotes.length+')</p>'+
          dQuotes.map(function(q){return '<div class="flex items-center justify-between py-2 border-b border-slate-100">'+
            '<span class="font-mono text-xs text-slate-600">'+esc(q.id)+'</span>'+
            '<div class="flex items-center gap-2"><span class="px-2 py-0.5 rounded-full text-xs font-medium '+(QSTATUS_CLS[q.status]||'bg-slate-100 text-slate-600')+'">'+esc(q.status)+'</span>'+
            '<span class="font-bold text-sm">'+fmt$(q.total)+'</span></div></div>';}).join('')+'</div>':'')+
        (dActs.length?'<div><p class="text-xs font-semibold text-slate-500 uppercase mb-2">Activities ('+dActs.length+')</p>'+
          '<div class="space-y-2 max-h-40 overflow-y-auto">'+
          dActs.map(function(a){return '<div class="flex gap-2 text-xs"><span class="text-slate-400 w-14 flex-shrink-0">'+fmtDate(a.created_at)+'</span><span class="font-medium text-slate-500">'+esc(a.type)+'</span><span class="text-slate-600">'+esc(a.subject||'')+'</span></div>';}).join('')+
          '</div></div>':'')+
      '</div>';
    }

    if(t==='view-contact'){
      showForm=false;
      var c=S.contactDetail||{};
      title=esc(c.name||'Contact');
      var cActs=S.activities.filter(function(a){return a.contact_id===c.id;});
      var cDeals=S.deals.filter(function(d){return d.contact_id===c.id;});
      body='<div class="space-y-4 text-sm">'+
        '<div class="grid grid-cols-2 gap-3">'+
          (c.email?'<div><span class="text-slate-400 text-xs block">Email</span><p class="font-medium">'+esc(c.email)+'</p></div>':'')+
          (c.phone?'<div><span class="text-slate-400 text-xs block">Phone</span><p class="font-medium">'+esc(c.phone)+'</p></div>':'')+
          (c.company?'<div><span class="text-slate-400 text-xs block">Company</span><p class="font-medium">'+esc(c.company)+'</p></div>':'')+
          (c.job_title?'<div><span class="text-slate-400 text-xs block">Title</span><p class="font-medium">'+esc(c.job_title)+'</p></div>':'')+
          '<div><span class="text-slate-400 text-xs block">Status</span><p><span class="px-2 py-0.5 rounded-full text-xs font-medium '+(PILL[c.status]||'bg-slate-100 text-slate-600')+'">'+esc(c.status||'—')+'</span></p></div>'+
          '<div><span class="text-slate-400 text-xs block">Score</span><p class="font-bold '+scoreColor(c.lead_score)+'">'+(c.lead_score||0)+'/100</p></div>'+
        '</div>'+
        (c.notes?'<div class="bg-slate-50 rounded-lg p-3 text-slate-600">'+esc(c.notes)+'</div>':'')+
        (cDeals.length?'<div><p class="text-xs font-semibold text-slate-500 uppercase mb-2">Deals ('+cDeals.length+')</p>'+
          cDeals.map(function(d){return '<div class="flex items-center justify-between py-2 border-b border-slate-100">'+
            '<span class="font-medium text-slate-700">'+esc(d.deal_name)+'</span>'+
            '<div class="flex items-center gap-2"><span class="text-xs px-2 py-0.5 rounded-full '+(PILL[d.stage]||'bg-slate-100 text-slate-600')+'">'+esc(d.stage)+'</span>'+
            '<span class="font-bold">'+fmt$(d.value)+'</span></div></div>';}).join('')+'</div>':'')+
        (cActs.length?'<div><p class="text-xs font-semibold text-slate-500 uppercase mb-2">Activities ('+cActs.length+')</p>'+
          '<div class="space-y-2 max-h-40 overflow-y-auto">'+
          cActs.map(function(a){return '<div class="flex gap-2 text-xs"><span class="text-slate-400 w-14 flex-shrink-0">'+fmtDate(a.created_at)+'</span><span class="font-medium text-slate-500">'+esc(a.type)+'</span><span class="text-slate-600">'+esc(a.subject||'')+'</span></div>';}).join('')+
          '</div></div>':'')+
      '</div>';
    }

    return '<div id="crm-modal-bg" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">'+
      '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">'+
        '<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">'+
          '<h2 class="font-bold text-slate-800">'+title+'</h2>'+
          '<button id="crm-modal-x" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>'+
        '</div>'+
        (showForm
          ? '<form id="crm-modal-form" class="px-6 py-5">'+body+
              '<div class="flex gap-3 mt-5 pt-4 border-t border-slate-100">'+
                '<button type="button" id="crm-modal-cancel" class="crm-btn-ghost flex-1">Cancel</button>'+
                '<button type="submit" id="crm-modal-submit" class="crm-btn-primary flex-1">Save</button>'+
              '</div></form>'
          : '<div class="px-6 py-5">'+body+'</div>')+
      '</div></div>';
  }

  // ── Bind events ────────────────────────────────────────────────
  function bindEvents(){
    container.querySelectorAll('.crm-tab').forEach(function(btn){
      btn.addEventListener('click',function(){S.tab=btn.dataset.tab;S.search='';S.filterStatus='';S.filterStage='';S.filterQuoteStatus='';render();});
    });
    var addBtn=container.querySelector('#crm-add-btn');
    if(addBtn) addBtn.addEventListener('click',function(){
      var map={contacts:'add-contact',leads:'add-lead',pipeline:'add-deal',quotes:'add-quote',activities:'add-activity'};
      S.modal=map[S.tab]||null; S.editRec=null; S.stageForDeal=null; render();
    });
    var rb=container.querySelector('#crm-refresh-btn');
    if(rb) rb.addEventListener('click',loadAll);
    var si=container.querySelector('.crm-search');
    if(si) si.addEventListener('input',function(){S.search=this.value;render();});
    var sf=container.querySelector('.crm-filter-status');
    if(sf) sf.addEventListener('change',function(){S.filterStatus=this.value;render();});
    var stf=container.querySelector('.crm-filter-stage');
    if(stf) stf.addEventListener('change',function(){S.filterStage=this.value;render();});
    var qsf=container.querySelector('.crm-filter-qstatus');
    if(qsf) qsf.addEventListener('change',function(){S.filterQuoteStatus=this.value;render();});
    container.querySelectorAll('.crm-quote-status-btn').forEach(function(btn){
      btn.addEventListener('click',function(){S.filterQuoteStatus=btn.dataset.status;render();});
    });
    container.querySelectorAll('.crm-quicknav').forEach(function(btn){
      btn.addEventListener('click',function(){S.tab=btn.dataset.tab;render();});
    });

    // Contact row
    container.querySelectorAll('.crm-contact-row').forEach(function(row){
      row.addEventListener('click',function(){
        var c=S.contacts.find(function(x){return x.id===row.dataset.id;});
        if(c){S.contactDetail=c;S.modal='view-contact';render();}
      });
    });
    container.querySelectorAll('.crm-edit-contact').forEach(function(btn){
      btn.addEventListener('click',function(e){e.stopPropagation();
        var c=S.contacts.find(function(x){return x.id===btn.dataset.id;});
        if(c){S.editRec=c;S.modal='edit-contact';render();}
      });
    });
    container.querySelectorAll('.crm-del-contact').forEach(function(btn){
      btn.addEventListener('click',function(e){e.stopPropagation();
        if(!confirm('Delete this contact?')) return;
        db.crm.deleteContact(btn.dataset.id).then(function(){
          S.contacts=S.contacts.filter(function(c){return c.id!==btn.dataset.id;});
          toast('Contact deleted','success'); render();
        }).catch(function(err){toast(err.message,'error');});
      });
    });

    // Lead stage inline
    container.querySelectorAll('.crm-lead-stage').forEach(function(sel){
      sel.addEventListener('change',function(){
        var id=sel.dataset.id, ns=sel.value;
        var lead=S.leads.find(function(l){return l.id===id;}); if(lead) lead.stage=ns;
        db.update('crm_leads', id, { stage: ns })
          .then(function(){toast('Stage updated','success');})
          .catch(function(err){toast(err.message,'error'); loadAll();});
      });
    });

    // Convert lead → Contact + Deal (client-side logic)
    container.querySelectorAll('.crm-convert-lead').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!confirm('Convert lead to Contact + Deal?')) return;
        var lead = S.leads.find(function(l){ return l.id === btn.dataset.id; });
        if(!lead){ toast('Lead not found','error'); return; }

        // 1. Create contact
        db.crm.createContact({
          name: lead.name, email: lead.email, phone: lead.phone,
          company: lead.company, job_title: lead.job_title,
          status: 'Lead', source: lead.source, notes: lead.notes,
          lead_score: lead.lead_score, created_by: myId || null,
        }).then(function(contact){
          // 2. Create deal
          return db.pipeline.createDeal({
            deal_name: lead.name + (lead.company ? ' — ' + lead.company : ''),
            contact_id: contact.id, contact_name: lead.name,
            company: lead.company, stage: 'Qualified',
            value: lead.deal_value || 0, probability: 30,
            created_by: myId || null,
          }).then(function(){
            // 3. Mark lead as converted
            return db.update('crm_leads', lead.id, {
              converted: true,
              converted_by: myId || null,
              converted_at: new Date().toISOString(),
              contact_id: contact.id,
            });
          });
        }).then(function(){
          toast('Lead converted!','success'); loadAll();
        }).catch(function(err){ toast(err.message,'error'); });
      });
    });

    container.querySelectorAll('.crm-del-lead').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!confirm('Delete this lead?')) return;
        db.delete('crm_leads', btn.dataset.id).then(function(){
          S.leads=S.leads.filter(function(l){return l.id!==btn.dataset.id;});
          toast('Lead deleted','success'); render();
        }).catch(function(err){toast(err.message,'error');});
      });
    });

    // Deal card → view-deal is informational; just open contact's detail for now
    container.querySelectorAll('.crm-deal-card').forEach(function(card){
      card.addEventListener('click',function(){
        var d=S.deals.find(function(x){return x.id===card.dataset.id;});
        if(d){S.dealDetail=d;S.modal='view-deal';render();}
      });
    });
    container.querySelectorAll('.crm-deal-view-quotes').forEach(function(btn){
      btn.addEventListener('click',function(e){e.stopPropagation();
        S.tab='quotes'; S.filterQuoteStatus=''; S.search='';
        var deal=S.deals.find(function(d){return d.id===btn.dataset.dealId;});
        if(deal) S.search=deal.deal_name||'';
        render();
      });
    });
    container.querySelectorAll('.crm-add-deal-stage').forEach(function(btn){
      btn.addEventListener('click',function(){S.stageForDeal=btn.dataset.stage;S.modal='add-deal';S.editRec=null;render();});
    });

    // Drag & drop pipeline
    container.querySelectorAll('.crm-deal-card').forEach(function(card){
      card.addEventListener('dragstart',function(e){S.dragId=card.dataset.id;S.dragFromStage=card.dataset.stage;e.dataTransfer.effectAllowed='move';});
      card.addEventListener('dragend',function(){container.querySelectorAll('.crm-drop-zone').forEach(function(z){z.classList.add('hidden');});});
    });
    container.querySelectorAll('.crm-stage-col').forEach(function(col){
      col.addEventListener('dragover',function(e){e.preventDefault();var z=col.querySelector('.crm-drop-zone');if(z)z.classList.remove('hidden');});
      col.addEventListener('dragleave',function(e){if(!col.contains(e.relatedTarget)){var z=col.querySelector('.crm-drop-zone');if(z)z.classList.add('hidden');}});
      col.addEventListener('drop',function(e){
        e.preventDefault();var z=col.querySelector('.crm-drop-zone');if(z)z.classList.add('hidden');
        var toStage=col.dataset.stage;
        if(!S.dragId||S.dragFromStage===toStage) return;
        var deal=S.deals.find(function(d){return d.id===S.dragId;});
        if(!deal) return;
        deal.stage=toStage;
        var stg=S.stages.find(function(s){return s.name===toStage;});
        if(stg) deal.probability=stg.probability;
        var dId=S.dragId; S.dragId=null; S.dragFromStage=null; render();
        db.pipeline.updateDeal(dId, { stage: toStage, updated_by: myId || null })
          .catch(function(err){toast('Stage update failed: '+err.message,'error');});
      });
    });

    // Quote row → view
    container.querySelectorAll('.crm-quote-row').forEach(function(row){
      row.addEventListener('click',function(){
        var q=S.quotes.find(function(x){return x.id===row.dataset.id;})||S.pendingQuotes.find(function(x){return x.id===row.dataset.id;});
        if(q){S.quoteDetail=q;S.modal='view-quote';render();}
      });
    });

    // Quote action buttons
    container.querySelectorAll('.crm-q-action').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var id=btn.dataset.id, action=btn.dataset.action;
        var q=S.quotes.find(function(x){return x.id===id;})||S.pendingQuotes.find(function(x){return x.id===id;});

        if(action==='delete'){
          if(!confirm('Delete this quote?')) return;
          db.delete('crm_quotes', id, 'id').then(function(){
            S.quotes=S.quotes.filter(function(x){return x.id!==id;});
            S.pendingQuotes=S.pendingQuotes.filter(function(x){return x.id!==id;});
            S.modal=null; S.quoteDetail=null; toast('Quote deleted','success'); render();
          }).catch(function(err){toast(err.message,'error');});
          return;
        }
        if(action==='submit'){
          if(!confirm('Submit for approval?')) return;
          var needsApproval = parseFloat((q||{}).discount_pct||0) >= 10;
          var newStatus = needsApproval ? 'Pending Approval' : 'Approved';
          db.update('crm_quotes', id, {
            status: newStatus,
            submitted_by: myId || null,
            submitted_at: new Date().toISOString(),
          }, 'id').then(function(){
            toast(needsApproval ? 'Submitted — awaiting manager approval' : 'Auto-approved!','success');
            loadAll();
          }).catch(function(err){toast(err.message,'error');});
          return;
        }
        if(action==='approve'){S.quoteDetail=q;S.modal='approve-quote';render();return;}
        if(action==='reject'){ S.quoteDetail=q;S.modal='reject-quote';render();return;}
        if(action==='send'){
          if(!confirm('Mark as sent to client?')) return;
          db.update('crm_quotes', id, {
            status: 'Sent to Client',
            sent_by: myId || null,
            sent_at: new Date().toISOString(),
          }, 'id').then(function(){
            toast('Sent — deal stage updated','success'); loadAll();
          }).catch(function(err){toast(err.message,'error');});
          return;
        }
        if(action==='accept'){
          if(!confirm('Mark as Accepted? This will move the deal to Won.')) return;

          // Step 1 — mark quote accepted
          // Step 2 — move deal to Won
          // These are the core CRM actions and must always succeed.
          db.update('crm_quotes', id, { status: 'Accepted' }, 'id')
            .then(function(){
              if(q && q.deal_id) return db.pipeline.updateDeal(q.deal_id, { stage: 'Won' });
            })
            .then(function(){
              toast('Quote accepted — deal moved to Won!','success');
              loadAll();

              // Step 3 — auto-create invoice in Financials (best-effort, isolated)
              // Runs in its own chain so any failure here NEVER affects the CRM outcome above.
              try {
                var today  = new Date().toISOString().split('T')[0];
                var due    = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
                var sub    = parseFloat(q.subtotal || q.total || 0);
                var taxPct = parseFloat(q.tax_pct || 0);
                var taxAmt = parseFloat((sub * taxPct / 100).toFixed(2));
                var total  = parseFloat(q.total || (sub + taxAmt) || 0);
                // Structured tag stored in notes — lets Financials show a CRM badge
                // without requiring a schema change or a dependency on the CRM module.
                var crmTag = '[CRM] Deal: ' + esc(q.deal_name || '') +
                             ' | Quote: '  + esc(id) +
                             (q.deal_id ? ' | deal_id:' + q.deal_id : '');
                var invoiceData = {
                  customer:       q.contact_name || q.company || q.deal_name || 'CRM Client',
                  customer_email: '',
                  issue_date:     today,
                  due_date:       due,
                  status:         'Sent',
                  subtotal:       sub,
                  tax_rate:       taxPct,
                  tax_amount:     taxAmt,
                  total:          total,
                  balance_due:    total,
                  notes:          crmTag,
                };
                db.create('invoices', invoiceData)
                  .then(function(){
                    toast('Invoice created in Financials','success');
                  })
                  .catch(function(err){
                    // Financials module may not be installed — log quietly, don't alarm the user.
                    console.warn('[CRM] Invoice auto-create skipped (Financials not available):', err && err.message);
                  });
              } catch(e) {
                console.warn('[CRM] Invoice auto-create error:', e);
              }
            })
            .catch(function(err){toast(err.message,'error');});
          return;
        }
        if(action==='decline'){
          db.update('crm_quotes', id, { status: 'Declined' }, 'id')
            .then(function(){ toast('Quote declined','info'); loadAll(); })
            .catch(function(err){toast(err.message,'error');});
          return;
        }
        if(action==='negotiate'){
          db.update('crm_quotes', id, { status: 'Negotiating' }, 'id')
            .then(function(){ toast('Marked as Negotiating','info'); loadAll(); })
            .catch(function(err){toast(err.message,'error');});
          return;
        }
        if(action==='revise'){S.quoteDetail=q;S.modal='add-quote';S.editRec=q;render();return;}
      });
    });

    // Quote deal selector → fill hidden fields
    var qdeal=container.querySelector('#crm-q-deal');
    if(qdeal) qdeal.addEventListener('change',function(){
      var opt=qdeal.options[qdeal.selectedIndex];
      if(!opt||!opt.value) return;
      var form=container.querySelector('#crm-modal-form');
      if(!form) return;
      ['deal_name','contact_id','contact_name','company'].forEach(function(f){
        var inp=form.querySelector('input[name="'+f+'"]');
        if(!inp){inp=document.createElement('input');inp.type='hidden';inp.name=f;form.appendChild(inp);}
        inp.value=opt.dataset[f]||'';
      });
    });

    // Quote live total calculator
    function recalcTotal(){
      var sub=parseFloat((container.querySelector('input[name="subtotal"]')||{}).value||0);
      var disc=parseFloat((container.querySelector('#crm-q-disc')||{}).value||0);
      var tax=parseFloat((container.querySelector('input[name="tax_pct"]')||{}).value||0);
      var total=calcQuoteTotal(sub,disc,tax);
      var el=container.querySelector('#crm-q-total');
      if(el) el.textContent='$'+total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      var warn=container.querySelector('#crm-q-disc-warn');
      var reasonWrap=container.querySelector('#crm-q-reason-wrap');
      if(warn) warn.classList.toggle('hidden',disc<10);
      if(reasonWrap){ var lbl=reasonWrap.querySelector('.crm-label'); if(lbl) lbl.textContent='Discount Reason'+(disc>=10?' *':'');}
    }
    ['input[name="subtotal"]','#crm-q-disc','input[name="tax_pct"]'].forEach(function(sel){
      var el=container.querySelector(sel);
      if(el) el.addEventListener('input',recalcTotal);
    });

    // Lead contact link auto-fill
    var ll=container.querySelector('#crm-lead-link');
    if(ll) ll.addEventListener('change',function(){
      var opt=ll.options[ll.selectedIndex];
      if(!opt||!opt.value) return;
      var c=S.contacts.find(function(x){return x.id===opt.value;});
      if(!c) return;
      var nameEl=container.querySelector('input[name="name"]');
      if(nameEl) nameEl.value=c.name||'';
      ['email','phone','company','job_title'].forEach(function(f){
        var el=container.querySelector('input[name="'+f+'"]');
        if(el&&c[f]) el.value=c[f];
      });
      container.querySelector('#crm-dupe-warn')&&container.querySelector('#crm-dupe-warn').classList.add('hidden');
    });
    var emailEl=container.querySelector('input[name="email"]');
    if(emailEl&&S.modal==='add-lead') emailEl.addEventListener('blur',function(){
      var val=emailEl.value.trim().toLowerCase();
      if(!val) return;
      var lkEl=container.querySelector('#crm-lead-link');
      if(lkEl&&lkEl.value) return;
      var exists=S.contacts.find(function(c){return (c.email||'').toLowerCase()===val;});
      var warn=container.querySelector('#crm-dupe-warn');
      if(warn) warn.classList.toggle('hidden',!exists);
    });

    // Modal close
    var bg=container.querySelector('#crm-modal-bg');
    if(bg) bg.addEventListener('click',function(e){if(e.target===bg){S.modal=null;S.editRec=null;S.contactDetail=null;S.dealDetail=null;S.quoteDetail=null;render();}});
    var mx=container.querySelector('#crm-modal-x');
    if(mx) mx.addEventListener('click',function(){S.modal=null;S.editRec=null;S.contactDetail=null;S.dealDetail=null;S.quoteDetail=null;render();});
    var mc=container.querySelector('#crm-modal-cancel');
    if(mc) mc.addEventListener('click',function(){S.modal=null;S.editRec=null;render();});

    var form=container.querySelector('#crm-modal-form');
    if(form) form.addEventListener('submit',function(e){e.preventDefault();submitForm();});
  }

  // ── Form submit ────────────────────────────────────────────────
  function submitForm(){
    var form=container.querySelector('#crm-modal-form');
    if(!form) return;

    // Collect ALL form values into a raw bag
    var raw={};
    form.querySelectorAll('input[name],select[name],textarea[name]').forEach(function(el){ raw[el.name]=el.value; });

    // Helper: pick only the listed keys from raw, coercing empty strings on
    // uuid-typed fields to null so Postgres never receives "" for a UUID column.
    var UUID_FIELDS = ['created_by','contact_id','deal_id','lead_id','submitted_by',
                       'reviewed_by','sent_by','converted_by','updated_by','owner'];
    function pick(keys){
      var obj={};
      keys.forEach(function(k){
        var v = raw[k];
        if(v===undefined) return;            // field not in form — skip entirely
        if(UUID_FIELDS.indexOf(k)>-1 && (v===''||v===null)) { obj[k]=null; return; }
        obj[k]=v;
      });
      obj.created_by = myId || null;         // always stamp who created
      return obj;
    }

    var t=S.modal;
    var sb=container.querySelector('#crm-modal-submit');
    if(sb){sb.disabled=true;sb.textContent='Saving…';}

    var p;

    // ── Contacts ──
    if(t==='add-contact'){
      p = db.crm.createContact(pick([
        'name','email','phone','company','job_title','status','source','notes'
      ]));
    }
    if(t==='edit-contact'){
      p = db.crm.updateContact(S.editRec.id, pick([
        'name','email','phone','company','job_title','status','source','notes'
      ]));
    }

    // ── Leads ──
    if(t==='add-lead'){
      p = db.create('crm_leads', pick([
        'name','email','phone','company','job_title',
        'stage','lead_score','source','deal_value','notes','contact_id'
      ]));
    }

    // ── Deals ──
    if(t==='add-deal'){
      p = db.pipeline.createDeal(pick([
        'deal_name','contact_name','contact_id','company',
        'stage','value','probability','expected_close','notes'
      ]));
    }

    // ── Activities ──
    if(t==='add-activity'){
      var actData = pick([
        'type','subject','body','outcome','scheduled_at','contact_id','deal_id','lead_id'
      ]);
      // Coerce optional fields — empty strings break timestamptz and uuid columns in Postgres
      if(!actData.scheduled_at) actData.scheduled_at = null;
      if(!actData.contact_id)   actData.contact_id   = null;
      if(!actData.deal_id)      actData.deal_id       = null;
      if(!actData.lead_id)      actData.lead_id       = null;
      if(!actData.outcome)      actData.outcome       = null;
      p = db.create('crm_activities', actData);
    }

    // ── Quotes ──
    if(t==='add-quote'){
      var sub    = parseFloat(raw.subtotal)     || 0;
      var disc   = parseFloat(raw.discount_pct) || 0;
      var tax    = parseFloat(raw.tax_pct)      || 0;
      var qdata  = pick([
        'deal_id','deal_name','contact_id','contact_name','company',
        'subtotal','discount_pct','discount_reason','tax_pct','currency',
        'line_items','valid_until','notes'
      ]);
      // Coerce numeric fields — empty strings cause "invalid input syntax for type numeric" in Postgres
      qdata.subtotal     = sub;
      qdata.discount_pct = disc;
      qdata.tax_pct      = tax;
      qdata.total = calcQuoteTotal(sub, disc, tax);
      if(S.editRec && S.editRec.id) {
        qdata.version = (parseInt(S.editRec.version || 1) + 1);
        qdata.status  = 'Draft';
        qdata.id      = genQuoteId();
      } else {
        qdata.id      = genQuoteId();
        qdata.version = 1;
        qdata.status  = 'Draft';
      }
      p = db.create('crm_quotes', qdata);
    }

    // ── Approve / Reject ──
    if(t==='approve-quote'){
      p = db.update('crm_quotes', S.quoteDetail.id, {
        status: 'Approved',
        review_note: raw.review_note || null,
        reviewed_by: myId || null,
        reviewed_at: new Date().toISOString(),
      }, 'id');
    }
    if(t==='reject-quote'){
      p = db.update('crm_quotes', S.quoteDetail.id, {
        status: 'Rejected',
        review_note: raw.review_note || null,
        reviewed_by: myId || null,
        reviewed_at: new Date().toISOString(),
      }, 'id');
    }

    if(!p){ toast('Unknown form action','error'); if(sb){sb.disabled=false;sb.textContent='Save';} return; }

    p.then(function(){
      toast('Saved!','success');
      S.modal=null; S.editRec=null; S.quoteDetail=null;
      loadAll();
    }).catch(function(err){
      toast(err.message||'Error saving','error');
      if(sb){sb.disabled=false;sb.textContent='Save';}
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────
  function toolbar(searchVal, extras, placeholder){
    return '<div class="flex flex-wrap gap-3 mb-5">'+
      '<div class="relative flex-1 min-w-48">'+
        '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>'+
        '<input class="crm-search w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" type="text" placeholder="'+esc(placeholder)+'" value="'+esc(searchVal||'')+'">'+
      '</div>'+
      extras.join('')+
    '</div>';
  }
  function selEl(cls,placeholder,opts,val){
    return '<select class="'+cls+' border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-600">'+
      '<option value="">'+placeholder+'</option>'+
      opts.map(function(o){return '<option value="'+o+'" '+(val===o?'selected':'')+'>'+o+'</option>';}).join('')+
    '</select>';
  }
  function th(label,extra){return '<th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider'+(extra?' '+extra:'')+'">'+label+'</th>';}
  function empty(icon,msg){return '<tr><td colspan="10" class="px-4 py-12 text-center text-slate-400 text-sm"><i class="fas '+icon+' text-3xl mb-3 block opacity-30"></i>'+msg+'</td></tr>';}
  function avatar(name,gradient){return '<div class="inline-flex w-8 h-8 rounded-full bg-gradient-to-br '+gradient+' items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0">'+esc((name||'?').charAt(0).toUpperCase())+'</div>';}
  function fld(label,name,val,type,extra){return '<div><label class="crm-label">'+label+'</label><input name="'+name+'" type="'+(type||'text')+'" class="crm-input" value="'+esc(val||'')+'" '+(extra||'')+'></div>';}
  function sel(label,name,opts,val){return '<div><label class="crm-label">'+label+'</label><select name="'+name+'" class="crm-input">'+opts.map(function(o){return '<option value="'+esc(o)+'" '+(val===o?'selected':'')+'>'+esc(o||'—')+'</option>';}).join('')+'</select></div>';}

  // ── Styles ─────────────────────────────────────────────────────
  function attachStyles(){
    if(document.getElementById('crm-styles')) return;
    var s=document.createElement('style'); s.id='crm-styles';
    s.textContent=[
      '.crm-btn-primary{background:linear-gradient(135deg,#ec4899,#f43f5e);color:#fff;border:none;padding:.45rem 1rem;border-radius:.5rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:opacity .15s}',
      '.crm-btn-primary:hover{opacity:.88}.crm-btn-primary:disabled{opacity:.5}',
      '.crm-btn-ghost{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:.45rem 1rem;border-radius:.5rem;font-size:.85rem;font-weight:500;cursor:pointer}',
      '.crm-btn-ghost:hover{background:#e2e8f0}',
      '.crm-label{display:block;font-size:.72rem;font-weight:600;color:#64748b;margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.04em}',
      '.crm-input{display:block;width:100%;padding:.45rem .65rem;border:1px solid #e2e8f0;border-radius:.5rem;font-size:.875rem;color:#1e293b;background:#fff;outline:none;box-sizing:border-box;transition:border-color .15s}',
      '.crm-input:focus{border-color:#f472b6;box-shadow:0 0 0 3px rgba(244,114,182,.15)}',
      '.crm-tab{padding:.5rem 1rem;font-size:.83rem;font-weight:500;border:none;background:transparent;cursor:pointer;border-bottom:2px solid transparent;transition:color .15s,border-color .15s;white-space:nowrap}',
      '.crm-tab-active{border-bottom-color:#ec4899;color:#db2777}',
      '.crm-tab-inactive{color:#64748b}.crm-tab-inactive:hover{color:#334155}',
    ].join('');
    document.head.appendChild(s);
  }

  render();
  loadAll();
};
