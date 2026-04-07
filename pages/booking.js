/* =============================================================
   WORK VOLT — pages/booking.js
   Full Booking Module — Admin Panel
   ============================================================= */

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  const state = {
    tab: 'dashboard',
    calView: 'week',
    calDate: new Date(),
    bookings: [],
    services: [],
    staff: [],
    customers: [],
    waitlist: [],
    settings: {},
    loading: false,
    bookingView: 'list', // list | kanban
    dragBooking: null,
  };

  const STATUS_COLORS = {
    pending:   { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b', border: '#fde68a' },
    confirmed: { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6', border: '#bfdbfe' },
    completed: { bg: '#d1fae5', text: '#065f46', dot: '#10b981', border: '#a7f3d0' },
    cancelled: { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444', border: '#fecaca' },
    waitlist:  { bg: '#f3e8ff', text: '#6b21a8', dot: '#a855f7', border: '#e9d5ff' },
  };

  const db = () => window.WorkVolt?.db || window.WorkVoltDB;
  const toast = (m, t='info') => window.WorkVolt?.toast(m, t);
  const user = () => window.WorkVolt?.user() || window.currentUser;

  // ── Entry point ──────────────────────────────────────────────
  window.WorkVoltPages = window.WorkVoltPages || {};
  window.WorkVoltPages.booking = async function (container) {
    container.innerHTML = renderShell();
    attachShellEvents();
    await loadAll();
    renderTab();
    startReminderPoller();
  };

  // ── Shell ────────────────────────────────────────────────────
  function renderShell() {
    return `
    <div id="bk-root" class="flex flex-col h-full min-h-screen bg-slate-50">
      <!-- Header -->
      <div class="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 class="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span class="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <i class="fas fa-calendar-check text-white text-sm"></i>
            </span>
            Booking Manager
          </h1>
          <p class="text-xs text-slate-400 mt-0.5 ml-11">Appointments · Services · Staff · Analytics</p>
        </div>
        <button onclick="BK.openNewBooking()" class="btn-primary gap-2 shadow-sm">
          <i class="fas fa-plus text-xs"></i> New Booking
        </button>
      </div>

      <!-- Tabs -->
      <div class="bg-white border-b border-slate-200 px-6 flex gap-1 flex-shrink-0 overflow-x-auto">
        ${['dashboard','calendar','bookings','services','staff','designer','settings'].map(t => `
          <button onclick="BK.switchTab('${t}')" id="bk-tab-${t}"
            class="bk-tab px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap
                   ${state.tab===t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
            <i class="fas ${tabIcon(t)} mr-1.5 text-xs"></i>${capitalize(t)}
          </button>`).join('')}
      </div>

      <!-- Content -->
      <div id="bk-content" class="flex-1 overflow-y-auto"></div>
    </div>`;
  }

  function tabIcon(t) {
    return { dashboard:'fa-chart-bar', calendar:'fa-calendar-week', bookings:'fa-list',
             services:'fa-concierge-bell', staff:'fa-users', designer:'fa-paint-brush', settings:'fa-sliders-h' }[t] || 'fa-circle';
  }

  function attachShellEvents() {
    window.BK = publicAPI();
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.bk-tab').forEach(btn => {
      const t = btn.id.replace('bk-tab-', '');
      btn.className = btn.className.replace(/border-blue-600 text-blue-600|border-transparent text-slate-500 hover:text-slate-700/g, '');
      btn.className += t === tab ? ' border-blue-600 text-blue-600' : ' border-transparent text-slate-500 hover:text-slate-700';
    });
    renderTab();
  }

  function renderTab() {
    const c = document.getElementById('bk-content');
    if (!c) return;
    c.innerHTML = '<div class="flex items-center justify-center h-40"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-400 opacity-60"></i></div>';
    requestAnimationFrame(() => {
      switch (state.tab) {
        case 'dashboard':  c.innerHTML = renderDashboard(); break;
        case 'calendar':   c.innerHTML = renderCalendar();  attachCalEvents(); break;
        case 'bookings':   c.innerHTML = renderBookings();  attachBookingListEvents(); break;
        case 'services':   c.innerHTML = renderServices();  break;
        case 'staff':      c.innerHTML = renderStaff();     break;
        case 'designer':   c.innerHTML = renderDesigner();  attachDesignerEvents(); break;
        case 'settings':   c.innerHTML = renderSettings();  break;
      }
    });
  }

  // ── Data Loading ─────────────────────────────────────────────
  async function loadAll() {
    try {
      const D = db();
      const [bookings, services, staff, customers, waitlist, settingsRows] = await Promise.all([
        D.list('bookings', {}, { order: 'start_time', asc: true }),
        D.list('booking_services', { active: true }, { order: 'name', asc: true }),
        D.list('booking_staff', { active: true }, { order: 'name', asc: true }),
        D.list('booking_customers', {}, { order: 'name', asc: true }),
        D.list('booking_waitlist', {}, { order: 'created_at' }),
        D.list('booking_settings'),
      ]);
      state.bookings  = bookings  || [];
      state.services  = services  || [];
      state.staff     = staff     || [];
      state.customers = customers || [];
      state.waitlist  = waitlist  || [];
      state.settings  = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]));
    } catch (e) {
      console.warn('Booking load error:', e.message);
      state.bookings = []; state.services = []; state.staff = [];
      state.customers = []; state.waitlist = []; state.settings = {};
    }
  }

  async function reload() { await loadAll(); renderTab(); }

  // ── DASHBOARD ────────────────────────────────────────────────
  function renderDashboard() {
    const now  = new Date();
    const mon  = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthB = state.bookings.filter(b => new Date(b.start_time) >= mon);
    const total  = state.bookings.length;
    const active = state.bookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length;
    const revenue = state.bookings.filter(b => b.payment_status === 'paid').reduce((s,b) => s + (+b.amount||0) + (+b.travel_fee||0), 0);
    const monthRev = monthB.filter(b => b.payment_status === 'paid').reduce((s,b) => s + (+b.amount||0) + (+b.travel_fee||0), 0);
    const cur = state.settings.currency || '$';

    // Top services
    const svcCount = {};
    state.bookings.forEach(b => { if(b.service_id) svcCount[b.service_id] = (svcCount[b.service_id]||0)+1; });
    const topServices = Object.entries(svcCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,cnt]) => ({
      svc: state.services.find(s=>s.id===id), cnt
    })).filter(x=>x.svc);

    // Busiest hours
    const hourCount = Array(24).fill(0);
    state.bookings.forEach(b => { if(b.start_time) hourCount[new Date(b.start_time).getHours()]++; });
    const maxHour = Math.max(...hourCount, 1);

    // Upcoming today
    const todayStr = now.toDateString();
    const todayBookings = state.bookings.filter(b => new Date(b.start_time).toDateString() === todayStr && b.status !== 'cancelled').slice(0,5);

    // Status breakdown
    const statusMap = { pending:0, confirmed:0, completed:0, cancelled:0 };
    state.bookings.forEach(b => { if(statusMap[b.status] !== undefined) statusMap[b.status]++; });

    return `<div class="p-6 space-y-6 fade-in">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${kpiCard('Total Bookings', total, 'fa-calendar', '#3b82f6', '')}
        ${kpiCard('Active', active, 'fa-clock', '#f59e0b', '')}
        ${kpiCard('Total Revenue', cur+fmt(revenue), 'fa-dollar-sign', '#10b981', '')}
        ${kpiCard('This Month', cur+fmt(monthRev), 'fa-chart-line', '#8b5cf6', '')}
      </div>

      <div class="grid lg:grid-cols-3 gap-6">
        <!-- Status Breakdown -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 mb-4 text-sm">Booking Status</h3>
          <div class="space-y-3">
            ${Object.entries(statusMap).map(([status,cnt]) => {
              const col = STATUS_COLORS[status] || STATUS_COLORS.pending;
              const pct = total > 0 ? Math.round((cnt/total)*100) : 0;
              return `<div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold capitalize" style="color:${col.text}">${status}</span>
                  <span class="text-xs text-slate-500">${cnt} (${pct}%)</span>
                </div>
                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${col.dot}"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Top Services -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 mb-4 text-sm">Top Services</h3>
          ${topServices.length ? `<div class="space-y-3">
            ${topServices.map(({svc,cnt}, i) => `
              <div class="flex items-center gap-3">
                <div class="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                     style="background:${svc.color||'#3b82f6'}">${i+1}</div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-slate-700 truncate">${esc(svc.name)}</p>
                  <p class="text-xs text-slate-400">${cnt} booking${cnt!==1?'s':''}</p>
                </div>
              </div>`).join('')}
          </div>` : '<p class="text-sm text-slate-400 text-center py-4">No bookings yet</p>'}
        </div>

        <!-- Busiest Hours -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 mb-4 text-sm">Busiest Hours</h3>
          <div class="flex items-end gap-0.5 h-24">
            ${hourCount.slice(7,21).map((cnt,i) => {
              const h = i+7;
              const pct = maxHour > 0 ? (cnt/maxHour)*100 : 0;
              return `<div class="flex-1 flex flex-col items-center gap-1 group relative">
                <div class="w-full rounded-t transition-all" style="height:${Math.max(pct,2)}%;background:#3b82f6;opacity:${0.3+pct/140}"></div>
                <span class="text-[8px] text-slate-300 group-hover:text-slate-500">${h}</span>
                <div class="hidden group-hover:block absolute -top-6 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded z-10 whitespace-nowrap">${cnt} bk</div>
              </div>`;
            }).join('')}
          </div>
          <p class="text-[10px] text-slate-400 mt-2 text-center">Hours 7AM–9PM</p>
        </div>
      </div>

      <!-- Today's Schedule -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-800 text-sm">Today's Schedule</h3>
          <button onclick="BK.switchTab('calendar')" class="text-xs text-blue-600 hover:underline font-medium">View calendar →</button>
        </div>
        ${todayBookings.length ? `<div class="divide-y divide-slate-100">
          ${todayBookings.map(b => {
            const svc = state.services.find(s=>s.id===b.service_id);
            const stf = state.staff.find(s=>s.id===b.staff_id);
            const cust = state.customers.find(c=>c.id===b.customer_id);
            const col = STATUS_COLORS[b.status]||STATUS_COLORS.pending;
            return `<div class="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div class="w-16 text-center flex-shrink-0">
                <p class="text-sm font-bold text-slate-800">${fmtTime(b.start_time)}</p>
                <p class="text-[10px] text-slate-400">${fmtTime(b.end_time)}</p>
              </div>
              <div class="w-1 h-10 rounded-full flex-shrink-0" style="background:${svc?.color||'#3b82f6'}"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 truncate">${esc(cust?.name||'Unknown Customer')}</p>
                <p class="text-xs text-slate-400">${esc(svc?.name||'Service')}${stf?' · '+esc(stf.name):''}</p>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold" style="background:${col.bg};color:${col.text}">${b.status}</span>
            </div>`;
          }).join('')}
        </div>` : `<div class="px-5 py-8 text-center text-sm text-slate-400">No bookings scheduled for today</div>`}
      </div>

      <!-- Waitlist -->
      ${state.waitlist.length ? `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span class="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center"><i class="fas fa-clock text-purple-500 text-[9px]"></i></span>
            Waitlist (${state.waitlist.length})
          </h3>
        </div>
        <div class="divide-y divide-slate-100">
          ${state.waitlist.slice(0,5).map(w => {
            const svc = state.services.find(s=>s.id===w.service_id);
            return `<div class="px-5 py-3 flex items-center gap-3">
              <div class="flex-1">
                <p class="text-sm font-semibold text-slate-700">${esc(w.customer_name)}</p>
                <p class="text-xs text-slate-400">${esc(svc?.name||'Service')} · ${w.requested_date||'Flexible'}</p>
              </div>
              <button onclick="BK.convertWaitlist('${w.id}')" class="text-xs text-blue-600 hover:underline font-medium">Book now</button>
              <button onclick="BK.deleteWaitlist('${w.id}')" class="text-xs text-red-400 hover:underline">Remove</button>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    </div>`;
  }

  function kpiCard(label, val, icon, color, sub) {
    return `<div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${color}1a">
          <i class="fas ${icon} text-sm" style="color:${color}"></i>
        </div>
      </div>
      <p class="text-2xl font-extrabold text-slate-900">${val}</p>
      <p class="text-xs text-slate-400 mt-1">${label}</p>
    </div>`;
  }

  // ── CALENDAR ─────────────────────────────────────────────────
  function renderCalendar() {
    return `<div class="p-4 md:p-6 fade-in">
      <!-- Cal Header -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <button onclick="BK.calNav(-1)" class="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors shadow-sm">
            <i class="fas fa-chevron-left text-xs text-slate-600"></i>
          </button>
          <button onclick="BK.calNav(1)" class="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors shadow-sm">
            <i class="fas fa-chevron-right text-xs text-slate-600"></i>
          </button>
          <button onclick="BK.calToday()" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">Today</button>
          <h2 class="text-sm font-bold text-slate-800 ml-1" id="bk-cal-label"></h2>
        </div>
        <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
          ${['day','week','month'].map(v => `
            <button onclick="BK.calSetView('${v}')" id="bk-calview-${v}"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${state.calView===v?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}">
              ${capitalize(v)}
            </button>`).join('')}
        </div>
      </div>
      <div id="bk-cal-grid" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"></div>
    </div>`;
  }

  function attachCalEvents() {
    renderCalGrid();
  }

  function renderCalGrid() {
    const grid = document.getElementById('bk-cal-grid');
    if (!grid) return;
    const label = document.getElementById('bk-cal-label');

    if (state.calView === 'week') {
      const week = getWeekDays(state.calDate);
      if (label) label.textContent = `${fmtDateShort(week[0])} – ${fmtDateShort(week[6])} ${week[0].getFullYear()}`;
      grid.innerHTML = renderWeekView(week);
    } else if (state.calView === 'day') {
      if (label) label.textContent = state.calDate.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
      grid.innerHTML = renderDayView(state.calDate);
    } else {
      if (label) label.textContent = state.calDate.toLocaleDateString('en-US', { month:'long', year:'numeric' });
      grid.innerHTML = renderMonthView(state.calDate);
    }
  }

  function renderWeekView(days) {
    const startH = 7, endH = 21, slots = (endH - startH) * 2;
    const bookingsByDay = {};
    days.forEach(d => { bookingsByDay[d.toDateString()] = []; });
    state.bookings.filter(b => b.status !== 'cancelled').forEach(b => {
      const ds = new Date(b.start_time).toDateString();
      if (bookingsByDay[ds] !== undefined) bookingsByDay[ds].push(b);
    });

    return `<div class="overflow-x-auto">
      <div style="min-width:600px">
        <!-- Day headers -->
        <div class="grid border-b border-slate-200" style="grid-template-columns:56px repeat(7,1fr)">
          <div class="border-r border-slate-100 p-2"></div>
          ${days.map(d => {
            const isToday = d.toDateString() === new Date().toDateString();
            return `<div class="p-2 text-center border-r border-slate-100 last:border-r-0 ${isToday?'bg-blue-50':''}">
              <p class="text-[10px] font-semibold uppercase text-slate-400">${d.toLocaleDateString('en-US',{weekday:'short'})}</p>
              <p class="text-lg font-extrabold ${isToday?'text-blue-600':'text-slate-700'} leading-tight">${d.getDate()}</p>
            </div>`;
          }).join('')}
        </div>
        <!-- Time grid -->
        <div class="relative overflow-y-auto" style="max-height:560px">
          ${Array.from({length:slots}).map((_,i) => {
            const h = startH + Math.floor(i/2);
            const m = i%2===0?'00':'30';
            const isHour = i%2===0;
            return `<div class="grid border-b border-slate-100 hover:bg-slate-50/50 transition-colors" style="grid-template-columns:56px repeat(7,1fr);min-height:32px">
              <div class="border-r border-slate-100 px-2 flex items-start pt-0.5">
                ${isHour?`<span class="text-[10px] text-slate-300 font-medium">${h}:00</span>`:''}
              </div>
              ${days.map(d => {
                const ds = d.toDateString();
                const slotTime = new Date(d); slotTime.setHours(h,+m,0,0);
                const slotEnd = new Date(slotTime.getTime() + 30*60000);
                const slotBookings = (bookingsByDay[ds]||[]).filter(b => {
                  const bs = new Date(b.start_time), be = new Date(b.end_time);
                  return bs >= slotTime && bs < slotEnd;
                });
                const isToday = d.toDateString() === new Date().toDateString();
                return `<div class="border-r border-slate-100 last:border-r-0 p-0.5 cursor-pointer ${isToday?'bg-blue-50/30':''}"
                  onclick="BK.openNewBooking('${slotTime.toISOString()}')">
                  ${slotBookings.map(b => {
                    const svc = state.services.find(s=>s.id===b.service_id);
                    const cust = state.customers.find(c=>c.id===b.customer_id);
                    const col = STATUS_COLORS[b.status]||STATUS_COLORS.pending;
                    return `<div onclick="event.stopPropagation();BK.openEditBooking('${b.id}')"
                      class="rounded px-1.5 py-0.5 mb-0.5 cursor-pointer text-[11px] font-semibold leading-tight truncate"
                      draggable="true"
                      ondragstart="BK.dragStart(event,'${b.id}')"
                      ondragend="BK.dragEnd(event)"
                      style="background:${col.bg};color:${col.text};border-left:2px solid ${col.dot}">
                      ${esc(cust?.name||'—')} · ${esc(svc?.name||'—')}
                    </div>`;
                  }).join('')}
                </div>`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  function renderDayView(date) {
    const startH = 7, endH = 21;
    const ds = date.toDateString();
    const dayBookings = state.bookings.filter(b => new Date(b.start_time).toDateString() === ds && b.status !== 'cancelled');

    return `<div class="overflow-y-auto" style="max-height:620px">
      ${Array.from({length:(endH-startH)*2}).map((_,i) => {
        const h = startH + Math.floor(i/2);
        const m = i%2===0?0:30;
        const slotTime = new Date(date); slotTime.setHours(h,m,0,0);
        const slotEnd = new Date(slotTime.getTime()+30*60000);
        const bks = dayBookings.filter(b => { const bs=new Date(b.start_time); return bs>=slotTime && bs<slotEnd; });
        return `<div class="flex border-b border-slate-100 hover:bg-slate-50 transition-colors min-h-[40px] cursor-pointer"
          onclick="BK.openNewBooking('${slotTime.toISOString()}')">
          <div class="w-16 flex-shrink-0 border-r border-slate-100 px-2 pt-1">
            ${m===0?`<span class="text-xs text-slate-300 font-medium">${h}:00</span>`:''}
          </div>
          <div class="flex-1 p-1 flex flex-wrap gap-1">
            ${bks.map(b => {
              const svc = state.services.find(s=>s.id===b.service_id);
              const cust = state.customers.find(c=>c.id===b.customer_id);
              const stf = state.staff.find(s=>s.id===b.staff_id);
              const col = STATUS_COLORS[b.status]||STATUS_COLORS.pending;
              return `<div onclick="event.stopPropagation();BK.openEditBooking('${b.id}')"
                class="rounded-lg px-3 py-1.5 cursor-pointer text-xs font-semibold"
                style="background:${col.bg};color:${col.text};border:1px solid ${col.border}">
                <span class="font-bold">${fmtTime(b.start_time)}</span> · ${esc(cust?.name||'—')} · ${esc(svc?.name||'—')}
                ${stf?`<span class="opacity-70"> · ${esc(stf.name)}</span>`:''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderMonthView(date) {
    const year = date.getFullYear(), month = date.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month+1, 0);
    const startDay = first.getDay();
    const totalCells = Math.ceil((startDay + last.getDate()) / 7) * 7;
    const today = new Date().toDateString();

    let cells = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startDay + 1;
      const d = dayNum > 0 && dayNum <= last.getDate() ? new Date(year, month, dayNum) : null;
      const ds = d ? d.toDateString() : null;
      const dayBks = ds ? state.bookings.filter(b => new Date(b.start_time).toDateString() === ds && b.status !== 'cancelled') : [];
      cells.push({ d, ds, dayBks, dayNum, isToday: ds === today });
    }

    return `<div>
      <div class="grid grid-cols-7 border-b border-slate-200">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
          `<div class="py-2 text-center text-xs font-bold text-slate-400 uppercase">${d}</div>`).join('')}
      </div>
      <div class="grid grid-cols-7">
        ${cells.map(cell => `
          <div class="border-b border-r border-slate-100 min-h-[80px] p-1.5 ${cell.d?'cursor-pointer hover:bg-slate-50':'bg-slate-50/50'} transition-colors"
            ${cell.d?`onclick="BK.openNewBooking('${cell.d.toISOString()}')"`:''}>
            ${cell.d ? `
              <p class="text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${cell.isToday?'bg-blue-600 text-white':'text-slate-600'}">${cell.dayNum}</p>
              ${cell.dayBks.slice(0,3).map(b => {
                const svc = state.services.find(s=>s.id===b.service_id);
                const col = STATUS_COLORS[b.status]||STATUS_COLORS.pending;
                return `<div onclick="event.stopPropagation();BK.openEditBooking('${b.id}')"
                  class="text-[10px] font-semibold rounded px-1 py-0.5 mb-0.5 truncate"
                  style="background:${col.bg};color:${col.text}">${fmtTime(b.start_time)} ${esc(svc?.name||'Booking')}</div>`;
              }).join('')}
              ${cell.dayBks.length>3?`<p class="text-[10px] text-slate-400 font-semibold">+${cell.dayBks.length-3} more</p>`:''}
            ` : ''}
          </div>`).join('')}
      </div>
    </div>`;
  }

  // ── BOOKINGS LIST ─────────────────────────────────────────────
  function renderBookings() {
    const view = state.bookingView;
    return `<div class="p-4 md:p-6 fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <input id="bk-search" type="text" placeholder="Search bookings…" class="field w-48 text-sm" oninput="BK.filterBookings()">
          <select id="bk-status-filter" class="field w-36 text-sm" onchange="BK.filterBookings()">
            <option value="">All Status</option>
            ${['pending','confirmed','completed','cancelled'].map(s=>`<option value="${s}">${capitalize(s)}</option>`).join('')}
          </select>
        </div>
        <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button onclick="BK.setBookingView('list')" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${view==='list'?'bg-white text-blue-600 shadow-sm':'text-slate-500'}">
            <i class="fas fa-list mr-1"></i>List
          </button>
          <button onclick="BK.setBookingView('kanban')" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${view==='kanban'?'bg-white text-blue-600 shadow-sm':'text-slate-500'}">
            <i class="fas fa-columns mr-1"></i>Kanban
          </button>
        </div>
      </div>
      <div id="bk-bookings-body">${view==='kanban'?renderKanban():renderBookingList(state.bookings)}</div>
    </div>`;
  }

  function renderBookingList(bookings) {
    if (!bookings.length) return `<div class="text-center py-16 text-slate-400"><i class="fas fa-calendar text-4xl mb-3 opacity-30"></i><p class="font-semibold">No bookings found</p></div>`;
    return `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 border-b border-slate-200">
          <tr>${['Customer','Service','Staff','Date & Time','Payment','Status',''].map(h=>`<th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">${h}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${bookings.map(b => {
            const svc = state.services.find(s=>s.id===b.service_id);
            const stf = state.staff.find(s=>s.id===b.staff_id);
            const cust = state.customers.find(c=>c.id===b.customer_id);
            const col = STATUS_COLORS[b.status]||STATUS_COLORS.pending;
            const cur = state.settings.currency||'$';
            return `<tr class="hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">${esc(cust?.name||'Unknown')}</p>
                <p class="text-xs text-slate-400">${esc(cust?.email||'')}</p>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${svc?.color||'#3b82f6'}"></span>
                  <span class="font-medium text-slate-700">${esc(svc?.name||'—')}</span>
                </span>
              </td>
              <td class="px-4 py-3 text-slate-600">${esc(stf?.name||'Unassigned')}</td>
              <td class="px-4 py-3">
                <p class="font-medium text-slate-700">${fmtDate(b.start_time)}</p>
                <p class="text-xs text-slate-400">${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}</p>
              </td>
              <td class="px-4 py-3">
                <p class="font-semibold text-slate-700">${cur}${fmt((+b.amount||0)+(+b.travel_fee||0))}</p>
                <p class="text-xs text-slate-400 capitalize">${b.payment_method||'free'} · ${b.payment_status||'unpaid'}</p>
              </td>
              <td class="px-4 py-3">
                <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold" style="background:${col.bg};color:${col.text}">${b.status}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                  <button onclick="BK.openEditBooking('${b.id}')" class="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-500 transition-colors" title="Edit"><i class="fas fa-edit text-xs"></i></button>
                  <button onclick="BK.confirmDelete('${b.id}','booking')" class="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 transition-colors" title="Delete"><i class="fas fa-trash text-xs"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function renderKanban() {
    const cols = ['pending','confirmed','completed','cancelled'];
    return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${cols.map(status => {
        const bks = state.bookings.filter(b=>b.status===status);
        const col = STATUS_COLORS[status];
        return `<div class="rounded-2xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-3 font-bold text-sm flex items-center justify-between" style="background:${col.bg};color:${col.text}">
            <span>${capitalize(status)}</span>
            <span class="text-xs opacity-70">${bks.length}</span>
          </div>
          <div class="p-2 space-y-2 min-h-[200px] bg-slate-50"
            ondragover="event.preventDefault()" ondrop="BK.dropOnStatus(event,'${status}')">
            ${bks.map(b => {
              const svc = state.services.find(s=>s.id===b.service_id);
              const cust = state.customers.find(c=>c.id===b.customer_id);
              return `<div class="bg-white rounded-xl border border-slate-200 p-3 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                draggable="true" ondragstart="BK.dragStart(event,'${b.id}')" ondragend="BK.dragEnd(event)"
                onclick="BK.openEditBooking('${b.id}')">
                <p class="text-sm font-bold text-slate-800 truncate">${esc(cust?.name||'Unknown')}</p>
                <p class="text-xs text-slate-500 mt-0.5">${esc(svc?.name||'—')}</p>
                <p class="text-xs text-slate-400 mt-1">${fmtDate(b.start_time)} ${fmtTime(b.start_time)}</p>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function attachBookingListEvents() {}

  function filterBookings() {
    const q = (document.getElementById('bk-search')?.value||'').toLowerCase();
    const st = document.getElementById('bk-status-filter')?.value||'';
    let list = state.bookings;
    if (st) list = list.filter(b => b.status === st);
    if (q) list = list.filter(b => {
      const cust = state.customers.find(c=>c.id===b.customer_id);
      const svc = state.services.find(s=>s.id===b.service_id);
      return (cust?.name||'').toLowerCase().includes(q) || (svc?.name||'').toLowerCase().includes(q);
    });
    const body = document.getElementById('bk-bookings-body');
    if (body && state.bookingView==='list') body.innerHTML = renderBookingList(list);
  }

  // ── SERVICES ─────────────────────────────────────────────────
  function renderServices() {
    return `<div class="p-4 md:p-6 fade-in">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-bold text-slate-700">${state.services.length} Services</h2>
        <button onclick="BK.openServiceModal()" class="btn-primary text-sm shadow-sm"><i class="fas fa-plus text-xs mr-1"></i>Add Service</button>
      </div>
      ${state.services.length ? `
      <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${state.services.map(svc => `
          <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style="background:${svc.color||'#3b82f6'}">
                  ${(svc.name||'?')[0].toUpperCase()}
                </div>
                <div>
                  <p class="font-bold text-slate-800">${esc(svc.name)}</p>
                  <p class="text-xs text-slate-400 capitalize">${esc(svc.category||'General')}</p>
                </div>
              </div>
              <div class="flex gap-1">
                <button onclick="BK.openServiceModal('${svc.id}')" class="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-400 transition-colors"><i class="fas fa-edit text-xs"></i></button>
                <button onclick="BK.confirmDelete('${svc.id}','service')" class="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 transition-colors"><i class="fas fa-trash text-xs"></i></button>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center mt-3">
              <div class="bg-slate-50 rounded-xl py-2">
                <p class="text-sm font-extrabold text-slate-800">${svc.duration}m</p>
                <p class="text-[10px] text-slate-400">Duration</p>
              </div>
              <div class="bg-slate-50 rounded-xl py-2">
                <p class="text-sm font-extrabold text-slate-800">${state.settings.currency||'$'}${fmt(svc.price)}</p>
                <p class="text-[10px] text-slate-400">Price</p>
              </div>
              <div class="bg-slate-50 rounded-xl py-2">
                <p class="text-sm font-extrabold ${svc.travel_enabled?'text-green-600':'text-slate-400'}">${svc.travel_enabled?'Yes':'No'}</p>
                <p class="text-[10px] text-slate-400">Travel</p>
              </div>
            </div>
            ${svc.description?`<p class="text-xs text-slate-400 mt-3 line-clamp-2">${esc(svc.description)}</p>`:''}
          </div>`).join('')}
      </div>` : `<div class="text-center py-16 text-slate-400"><i class="fas fa-concierge-bell text-4xl mb-3 opacity-30"></i><p class="font-semibold">No services yet</p><button onclick="BK.openServiceModal()" class="mt-3 text-sm text-blue-600 hover:underline">Add your first service →</button></div>`}
    </div>`;
  }

  // ── STAFF ─────────────────────────────────────────────────────
  function renderStaff() {
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return `<div class="p-4 md:p-6 fade-in">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-bold text-slate-700">${state.staff.length} Staff Members</h2>
        <button onclick="BK.openStaffModal()" class="btn-primary text-sm shadow-sm"><i class="fas fa-plus text-xs mr-1"></i>Add Staff</button>
      </div>
      ${state.staff.length ? `
      <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${state.staff.map(stf => {
          const avail = safeJson(stf.availability, {});
          const activeDays = days.filter(d => avail[d]);
          const bookingsCount = state.bookings.filter(b=>b.staff_id===stf.id && b.status!=='cancelled').length;
          return `<div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm" style="background:${stf.color||'#8b5cf6'}">
                  ${(stf.name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <p class="font-bold text-slate-800">${esc(stf.name)}</p>
                  <p class="text-xs text-slate-400">${esc(stf.email||'')}</p>
                </div>
              </div>
              <div class="flex gap-1">
                <button onclick="BK.openStaffModal('${stf.id}')" class="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-400 transition-colors"><i class="fas fa-edit text-xs"></i></button>
                <button onclick="BK.confirmDelete('${stf.id}','staff')" class="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 transition-colors"><i class="fas fa-trash text-xs"></i></button>
              </div>
            </div>
            <div class="flex gap-1 flex-wrap mb-3">
              ${days.map(d=>`<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${activeDays.includes(d)?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-300'}">${d}</span>`).join('')}
            </div>
            <div class="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
              <span><i class="fas fa-calendar-check text-slate-300 mr-1"></i>${bookingsCount} bookings</span>
              <span class="${stf.auto_assign?'text-green-600':'text-slate-400'}"><i class="fas fa-magic mr-1"></i>${stf.auto_assign?'Auto-assign on':'Auto-assign off'}</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : `<div class="text-center py-16 text-slate-400"><i class="fas fa-users text-4xl mb-3 opacity-30"></i><p class="font-semibold">No staff members yet</p><button onclick="BK.openStaffModal()" class="mt-3 text-sm text-blue-600 hover:underline">Add your first staff member →</button></div>`}
    </div>`;
  }

  // ── SETTINGS ─────────────────────────────────────────────────
  function discountCodeRow(c, i) {
    const cur = state.settings.currency || '$';
    return `<div class="flex gap-2 items-center flex-wrap bg-slate-50 rounded-xl p-2" data-discount="${i}">
      <input type="text" value="${esc(c.code||'')}" placeholder="CODE" class="field text-xs w-28 font-mono uppercase" data-dc-code="${i}" oninput="this.value=this.value.toUpperCase()">
      <select class="field text-xs w-28" data-dc-type="${i}">
        <option value="flat" ${(c.pct>0)?'':'selected'}>Flat (${cur})</option>
        <option value="pct" ${(c.pct>0)?'selected':''}>Percent (%)</option>
      </select>
      <input type="number" value="${c.pct>0?c.pct:(c.flat||'')}" placeholder="Value" class="field text-xs w-20" step="0.01" min="0" data-dc-value="${i}">
      <label class="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
        <input type="checkbox" ${c.active!==false?'checked':''} data-dc-active="${i}"> Active
      </label>
      <button onclick="this.closest('[data-discount]').remove()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
    </div>`;
  }

  function renderSettings() {
    const s = state.settings;
    return `<div class="p-4 md:p-6 fade-in max-w-2xl mx-auto">
      <div class="space-y-5">
        <!-- Business Hours -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><i class="fas fa-clock text-blue-400"></i>Business Hours</h3>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Opens</label>
              <input type="time" id="bk-s-open" value="${s.business_hours_start||'09:00'}" class="field text-sm"></div>
            <div><label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Closes</label>
              <input type="time" id="bk-s-close" value="${s.business_hours_end||'18:00'}" class="field text-sm"></div>
          </div>
          <div class="mt-4">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Business Days</label>
            <div class="flex gap-2 flex-wrap" id="bk-s-days">
              ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => {
                const active = (safeJson(s.business_days,'["Mon","Tue","Wed","Thu","Fri"]')||[]).includes(d);
                return `<button type="button" onclick="this.classList.toggle('bg-blue-600');this.classList.toggle('text-white');this.classList.toggle('bg-slate-100');this.classList.toggle('text-slate-500')"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${active?'bg-blue-600 text-white':'bg-slate-100 text-slate-500'}"
                  data-day="${d}">${d}</button>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Booking Settings -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><i class="fas fa-cog text-blue-400"></i>Booking Settings</h3>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Slot Interval</label>
              <select id="bk-s-interval" class="field text-sm">
                ${[15,30,60].map(v=>`<option value="${v}" ${s.slot_interval==v?'selected':''}>${v} minutes</option>`).join('')}
              </select>
            </div>
            <div><label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Currency Symbol</label>
              <input type="text" id="bk-s-currency" value="${esc(s.currency||'$')}" class="field text-sm" placeholder="$"></div>
          </div>
          <!-- Business Address (used for travel distance calc) -->
          <div class="mt-4">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Business Address <span class="font-normal text-slate-300 normal-case">(used for travel fee calculation)</span></label>
            <input type="text" id="bk-s-business-address" value="${esc(s.business_address||s.footer_address||'')}" class="field text-sm" placeholder="123 Main St, City, Province/State, Postal Code">
            <p class="text-[10px] text-slate-400 mt-1">Enter your full address so the booking page can automatically calculate travel distances from your location to your clients.</p>
          </div>
          <!-- Multi-service mode -->
          <div class="mt-4 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <input type="checkbox" id="bk-s-multi-service" class="rounded mt-0.5" ${s.multi_service_mode==='1'?'checked':''}>
            <div>
              <label for="bk-s-multi-service" class="text-sm font-bold text-blue-800 block cursor-pointer">Allow Multiple Services Per Booking</label>
              <p class="text-xs text-blue-600 mt-0.5">When enabled, customers can add several services to one booking session. Each service gets its own time slot stacked consecutively.</p>
            </div>
          </div>
        </div>

        <!-- Travel Settings -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><i class="fas fa-car text-blue-400"></i>Travel Fee Settings</h3>
          <div class="mb-4">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fee Mode</label>
            <div class="flex gap-2">
              <button type="button" onclick="BK.setTravelMode('flat')" class="flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${(s.travel_mode||'flat')==='flat'?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500'}" id="bk-travel-flat">
                <i class="fas fa-map-marker-alt mr-1"></i>Flat Rate Zones
              </button>
              <button type="button" onclick="BK.setTravelMode('per_km')" class="flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${s.travel_mode==='per_km'?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500'}" id="bk-travel-km">
                <i class="fas fa-road mr-1"></i>Per km/mile
              </button>
            </div>
          </div>
          <div id="bk-travel-flat-cfg" class="${(s.travel_mode||'flat')!=='per_km'?'':'hidden'}">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Zones</label>
            <div id="bk-zones-list" class="space-y-2 mb-2">
              ${(safeJson(s.travel_flat_zones,'[]')||[]).map((z,i)=>`
                <div class="flex gap-2 items-center" data-zone="${i}">
                  <input type="text" value="${esc(z.label)}" placeholder="Zone label" class="field text-xs flex-1" data-zone-label="${i}">
                  <input type="number" value="${z.max_km}" placeholder="Max km" class="field text-xs w-20" data-zone-km="${i}">
                  <input type="number" value="${z.fee}" placeholder="Fee" class="field text-xs w-20" data-zone-fee="${i}">
                  <button onclick="this.closest('[data-zone]').remove()" class="text-red-400 hover:text-red-600 text-xs px-1"><i class="fas fa-times"></i></button>
                </div>`).join('')}
            </div>
            <button onclick="BK.addZone()" type="button" class="text-xs text-blue-600 hover:underline font-semibold"><i class="fas fa-plus mr-1"></i>Add Zone</button>
          </div>
          <div id="bk-travel-km-cfg" class="${s.travel_mode==='per_km'?'':'hidden'}">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Rate per km/mile</label>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-slate-500">${s.currency||'$'}</span>
              <input type="number" id="bk-s-km-rate" value="${s.travel_per_km_rate||1.5}" step="0.1" class="field text-sm w-28">
              <span class="text-xs text-slate-400">per km</span>
            </div>
          </div>
        </div>

        <!-- Payment Settings -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
          <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2"><i class="fas fa-credit-card text-blue-400"></i>Payment Settings</h3>

          <!-- PayPal -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"><i class="fab fa-paypal text-blue-400 mr-1"></i>PayPal Business Email</label>
            <input type="email" id="bk-s-paypal" value="${esc(s.paypal_email||'')}" class="field text-sm" placeholder="business@paypal.com">
            <p class="text-xs text-slate-400 mt-1">Used to generate PayPal payment links.</p>
          </div>

          <!-- E-Transfer -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"><i class="fas fa-university text-green-500 mr-1"></i>E-Transfer Email</label>
            <input type="email" id="bk-s-etransfer" value="${esc(s.etransfer_email||'')}" class="field text-sm" placeholder="payments@yourbusiness.com">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">E-Transfer Instructions (shown to client)</label>
            <textarea id="bk-s-etransfer-msg" class="field text-sm resize-none" rows="2" placeholder="e.g. Use your booking reference as the message.">${esc(s.etransfer_message||'')}</textarea>
          </div>

          <!-- Deposit -->
          <div class="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
            <div class="flex items-center gap-2">
              <input type="checkbox" id="bk-s-deposit-req" class="rounded"
                onchange="document.getElementById('bk-s-deposit-cfg').classList.toggle('hidden',!this.checked)"
                ${s.deposit_required==='1'?'checked':''}>
              <label for="bk-s-deposit-req" class="text-sm font-bold text-amber-800">Require a Booking Deposit</label>
            </div>
            <div id="bk-s-deposit-cfg" class="${s.deposit_required==='1'?'':'hidden'} space-y-2">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Deposit Amount (${s.currency||'$'})</label>
                <input type="number" id="bk-s-deposit-amount" value="${s.deposit_amount||''}" class="field text-sm" step="0.01" min="0" placeholder="e.g. 25.00">
              </div>
              <p class="text-xs text-amber-700">Clients will be shown this deposit amount and instructed to pay it via their selected payment method before the booking is confirmed.</p>
            </div>
          </div>
        </div>

        <!-- Discount Codes -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-slate-800 text-sm flex items-center gap-2"><i class="fas fa-tag text-purple-400"></i>Discount / Coupon Codes</h3>
            <button onclick="BK.addDiscountCode()" type="button" class="text-xs text-blue-600 hover:underline font-semibold"><i class="fas fa-plus mr-1"></i>Add Code</button>
          </div>
          <div id="bk-discount-list" class="space-y-2 mb-2">
            ${(function(){
              try {
                const codes = JSON.parse(s.discount_codes || '[]');
                return codes.map((c,i) => discountCodeRow(c,i)).join('');
              } catch(e){ return ''; }
            })()}
          </div>
          <p class="text-[10px] text-slate-400 mt-2">Each code can offer a flat $ amount off or a % percentage discount. Clients enter the code during checkout.</p>
        </div>

        <button onclick="BK.saveSettings()" class="btn-primary w-full shadow-sm"><i class="fas fa-save text-sm mr-1"></i>Save Settings</button>
      </div>
    </div>`;
  }

  // ── MODALS ────────────────────────────────────────────────────
  function openNewBooking(startISO) {
    let defaultDate = '', defaultTime = '';
    if (startISO) {
      const d = new Date(startISO);
      defaultDate = d.toISOString().split('T')[0];
      defaultTime = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    showModal(bookingModalHTML(null, defaultDate, defaultTime));
    attachBookingModalEvents();
  }

  function openEditBooking(id) {
    const b = state.bookings.find(x=>x.id===id);
    if (!b) return;
    showModal(bookingModalHTML(b));
    attachBookingModalEvents();
  }

  function bookingModalHTML(b, defDate='', defTime='') {
    const isEdit = !!b;
    const cur = state.settings.currency || '$';
    const cust = b ? state.customers.find(c=>c.id===b.customer_id) : null;
    const svc  = b ? state.services.find(s=>s.id===b.service_id)   : null;

    return `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
        <h3 class="font-bold text-slate-900 text-base">${isEdit?'Edit Booking':'New Booking'}</h3>
        <button onclick="closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
      </div>
      <div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
        <div id="bk-modal-err" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>

        <!-- Customer -->
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Customer *</label>
          <select id="bk-m-customer" class="field text-sm" onchange="BK.onCustomerChange(this)">
            <option value="">— Select or create customer —</option>
            <option value="__new__">+ Add new customer</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${b?.customer_id===c.id?'selected':''}>${esc(c.name)} ${c.email?'('+esc(c.email)+')':''}</option>`).join('')}
          </select>
        </div>

        <!-- New Customer Fields (hidden by default) -->
        <div id="bk-new-cust" class="${isEdit?'hidden':''} space-y-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p class="text-xs font-bold text-blue-700">New Customer Details</p>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Name *</label><input id="bk-m-cname" type="text" class="field text-sm" placeholder="Full name" value="${esc(cust?.name||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Email</label><input id="bk-m-cemail" type="email" class="field text-sm" placeholder="email@..." value="${esc(cust?.email||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Phone</label><input id="bk-m-cphone" type="tel" class="field text-sm" placeholder="+1..." value="${esc(cust?.phone||'')}"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Address</label><input id="bk-m-caddr" type="text" class="field text-sm" placeholder="Address" value="${esc(cust?.address||'')}"></div>
          </div>
        </div>

        <!-- Service -->
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Service *</label>
          <select id="bk-m-service" class="field text-sm" onchange="BK.onServiceChange(this)">
            <option value="">— Select service —</option>
            ${state.services.map(s=>`<option value="${s.id}" data-duration="${s.duration}" data-price="${s.price}" data-travel="${s.travel_enabled?1:0}" ${b?.service_id===s.id?'selected':''}>${esc(s.name)} (${s.duration}min · ${cur}${fmt(s.price)})</option>`).join('')}
          </select>
        </div>

        <!-- Date & Time -->
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date *</label>
            <input id="bk-m-date" type="date" class="field text-sm" value="${b?b.start_time?.split('T')[0]:defDate}"></div>
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Time *</label>
            <input id="bk-m-time" type="time" class="field text-sm" value="${b?fmtTimeInput(b.start_time):defTime}"></div>
        </div>

        <!-- Staff -->
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Staff <span class="text-slate-300 font-normal normal-case">(optional)</span>
            <button type="button" onclick="BK.autoAssignStaff()" class="ml-2 text-blue-500 hover:underline text-[10px] font-semibold normal-case">⚡ Auto-assign</button>
          </label>
          <select id="bk-m-staff" class="field text-sm">
            <option value="">— Unassigned —</option>
            ${state.staff.map(s=>`<option value="${s.id}" ${b?.staff_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
          </select>
        </div>

        <!-- Travel -->
        <div id="bk-m-travel-section" class="${b?.travel_address?'':'hidden'}">
          <div class="flex items-center gap-2 mb-2">
            <input type="checkbox" id="bk-m-travel" class="rounded" onchange="BK.onTravelToggle(this)" ${b?.travel_address?'checked':''}>
            <label for="bk-m-travel" class="text-xs font-bold text-slate-600">Mobile/Travel Service</label>
          </div>
          <div id="bk-m-travel-fields" class="${b?.travel_address?'':'hidden'} space-y-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <input id="bk-m-travel-addr" type="text" class="field text-sm" placeholder="Customer's address" value="${esc(b?.travel_address||'')}">
            <div class="grid grid-cols-2 gap-2">
              <div><label class="block text-[10px] font-semibold text-slate-500 mb-1">Distance (km)</label>
                <input id="bk-m-travel-dist" type="number" class="field text-sm" placeholder="0" value="${b?.travel_distance||0}" oninput="BK.calcTravelFee()"></div>
              <div><label class="block text-[10px] font-semibold text-slate-500 mb-1">Travel Fee</label>
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-bold text-slate-500">${cur}</span>
                  <input id="bk-m-travel-fee" type="number" class="field text-sm" placeholder="0" value="${b?.travel_fee||0}" step="0.01">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recurring -->
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Recurring</label>
          <select id="bk-m-recurring" class="field text-sm" onchange="BK.onRecurringChange(this)">
            ${['none','daily','weekly','monthly'].map(v=>`<option value="${v}" ${b?.recurring===v?'selected':''}>${capitalize(v==='none'?'No Recurrence':v)}</option>`).join('')}
          </select>
          <div id="bk-m-rec-end" class="${(b?.recurring&&b.recurring!=='none')?'':'hidden'} mt-2">
            <label class="block text-[10px] font-semibold text-slate-500 mb-1">Recurring Until</label>
            <input id="bk-m-rec-end-date" type="date" class="field text-sm" value="${b?.recurring_end||''}">
          </div>
        </div>

        <!-- Payment -->
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Method</label>
          <select id="bk-m-payment" class="field text-sm" onchange="BK.onPaymentChange(this)">
            ${['pay_later','etransfer','paypal'].map(v=>`<option value="${v}" ${b?.payment_method===v?'selected':''}>${{'pay_later':'Pay Later','etransfer':'E-Transfer','paypal':'Pay Now (PayPal)'}[v]}</option>`).join('')}
          </select>
          <div id="bk-m-amount-row" class="${b?.payment_method&&b.payment_method!=='free'?'':'hidden'} mt-2 flex items-center gap-2">
            <span class="text-xs font-bold text-slate-500">${cur}</span>
            <input id="bk-m-amount" type="number" class="field text-sm" placeholder="0.00" step="0.01" value="${b?.amount||''}">
          </div>
          <div id="bk-m-paypal-link" class="hidden mt-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            PayPal link will be generated on save.
          </div>
        </div>

        <!-- Status (edit only) -->
        ${isEdit?`<div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
          <select id="bk-m-status" class="field text-sm">
            ${['pending','confirmed','completed','cancelled'].map(v=>`<option value="${v}" ${b.status===v?'selected':''}>${capitalize(v)}</option>`).join('')}
          </select>
        </div>`:''}

        <!-- Notes -->
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>
          <textarea id="bk-m-notes" class="field text-sm resize-none" rows="2" placeholder="Any additional notes…">${esc(b?.notes||'')}</textarea>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-slate-100 flex gap-3">
        <button onclick="closeModal()" class="btn-secondary flex-1">Cancel</button>
        <button onclick="BK.saveBooking('${b?.id||''}')" class="btn-primary flex-1"><i class="fas fa-save text-xs mr-1"></i>${isEdit?'Save Changes':'Create Booking'}</button>
      </div>
    </div>`;
  }

  function attachBookingModalEvents() {
    // Show travel section if service has travel enabled
    const svcSel = document.getElementById('bk-m-service');
    if (svcSel) {
      const svcId = svcSel.value;
      const svc = state.services.find(s=>s.id===svcId);
      const sec = document.getElementById('bk-m-travel-section');
      if (sec && svc?.travel_enabled) sec.classList.remove('hidden');
    }
  }

  function openServiceModal(id) {
    const svc = id ? state.services.find(s=>s.id===id) : null;
    const cur = state.settings.currency || '$';

    // Comprehensive FA icons grouped by category
    const faIcons = [
      // Beauty & Wellness
      'fa-cut','fa-spa','fa-leaf','fa-hand-sparkles','fa-magic','fa-paint-brush',
      // Health & Medical
      'fa-tooth','fa-heartbeat','fa-stethoscope','fa-user-md','fa-eye','fa-pills',
      'fa-syringe','fa-brain','fa-lungs','fa-bone','fa-ambulance','fa-hospital',
      // Fitness & Sport
      'fa-dumbbell','fa-running','fa-bicycle','fa-swimming-pool','fa-football-ball',
      'fa-golf-ball','fa-table-tennis','fa-skiing','fa-medal','fa-trophy',
      // Home & Repair
      'fa-home','fa-wrench','fa-hammer','fa-screwdriver','fa-tools','fa-broom',
      'fa-paint-roller','fa-couch','fa-lightbulb','fa-plug','fa-shower','fa-bath',
      // Technology
      'fa-laptop','fa-mobile-alt','fa-wifi','fa-code','fa-microchip','fa-print',
      'fa-camera','fa-video','fa-headphones','fa-tv',
      // Education & Business
      'fa-graduation-cap','fa-book','fa-chalkboard-teacher','fa-briefcase',
      'fa-chart-bar','fa-calculator','fa-pen-nib','fa-language','fa-music',
      // Food & Lifestyle
      'fa-utensils','fa-coffee','fa-wine-glass','fa-birthday-cake','fa-pizza-slice',
      // Transport & Delivery
      'fa-car-side','fa-truck','fa-shipping-fast','fa-map-marker-alt','fa-plane',
      // Pets & Kids
      'fa-dog','fa-cat','fa-baby','fa-baby-carriage','fa-paw',
      // Creative & Events
      'fa-gem','fa-star','fa-bolt','fa-hat-wizard','fa-theater-masks',
      'fa-camera-retro','fa-palette','fa-film','fa-microphone',
    ];
    const commonEmojis = [
      // Beauty
      '✂️','💆','🧖','💅','💄','🪮','💇','🧴','🧹','🪥',
      // Health
      '🦷','🩺','💊','🩻','🧠','👁️','💉','🩹','🏥',
      // Fitness
      '💪','🏋️','🧘','🚴','🏊','🤸','⚽','🎾','🏈','🥊',
      // Home
      '🏠','🔧','🔨','🪛','🪚','🧺','🛁','🚿','💡','🪴',
      // Tech
      '💻','📱','📷','🎥','🎧','📺','🖨️','⌨️',
      // Education
      '📚','🎓','✏️','📝','🏆','🎯','🌐','🎵','🎸',
      // Food
      '🍽️','☕','🍕','🎂','🥗','🍷',
      // Transport
      '🚗','✈️','🚀','📦','🗺️',
      // Pets & Kids
      '🐶','🐱','🐾','👶','🧸',
      // Other
      '💎','⭐','🔥','🌟','🌺','🎨','🙌','🌿','❤️','✨',
    ];

    showModal(`<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-slate-900">${svc?'Edit Service':'New Service'}</h3>
        <button onclick="closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
      </div>
      <div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[75vh]">
        <div id="svc-err" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>

        <!-- Name + Color -->
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2"><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Service Name *</label>
            <input id="svc-name" type="text" class="field text-sm" value="${esc(svc?.name||'')}"></div>
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Color</label>
            <input id="svc-color" type="color" class="field text-sm h-[42px] p-1 cursor-pointer" value="${svc?.color||'#3b82f6'}"
              oninput="const p=document.getElementById('svc-fa-preview');if(p)p.style.color=this.value"></div>
        </div>

        <!-- Category + Badge -->
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Category</label>
            <input id="svc-category" type="text" class="field text-sm" placeholder="e.g. Hair, Skin, Nails" value="${esc(svc?.category||'')}"></div>
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Badge</label>
            <select id="svc-badge" class="field text-sm">
              <option value="" ${!svc?.badge?'selected':''}>None</option>
              <option value="new" ${svc?.badge==='new'?'selected':''}>🆕 New</option>
              <option value="popular" ${svc?.badge==='popular'?'selected':''}>⭐ Popular</option>
            </select>
          </div>
        </div>

        <!-- Duration + Price -->
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Duration (min) *</label>
            <input id="svc-duration" type="number" class="field text-sm" value="${svc?.duration||60}" min="5" step="5"></div>
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Price (${cur})</label>
            <input id="svc-price" type="number" class="field text-sm" value="${svc?.price||0}" step="0.01" min="0"></div>
        </div>

        <!-- Short Description (card preview) -->
        <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Short Description <span class="font-normal text-slate-300 normal-case">(shown on card)</span></label>
          <textarea id="svc-desc" class="field text-sm resize-none" rows="2" placeholder="Brief summary shown on service card…">${esc(svc?.description||'')}</textarea></div>

        <!-- Long Description / About -->
        <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Full Description <span class="font-normal text-slate-300 normal-case">(optional, shown in detail view)</span></label>
          <textarea id="svc-long-desc" class="field text-sm resize-none" rows="4" placeholder="Detailed description of this service — what's included, benefits, what to expect…">${esc(svc?.long_description||'')}</textarea></div>

        <!-- Location Note + Info URL -->
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Location Note</label>
            <input id="svc-location-note" type="text" class="field text-sm" placeholder="e.g. Studio only, At your home" value="${esc(svc?.location_note||'')}"></div>
          <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">More Info URL</label>
            <input id="svc-info-url" type="url" class="field text-sm" placeholder="https://…" value="${esc(svc?.info_url||'')}"></div>
        </div>

        <!-- ── ICON SECTION ── -->
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
          <p class="text-xs font-bold text-slate-600 uppercase tracking-wide">Service Icon / Image</p>
          <p class="text-[10px] text-slate-400">Priority: Image URL → FontAwesome icon → Emoji → Auto-detected keyword icon</p>

          <!-- Image URL (highest priority) -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Image URL <span class="font-normal text-slate-300">(overrides icon)</span></label>
            <input id="svc-image-url" type="url" class="field text-sm" placeholder="https://… jpg, png, webp" value="${esc(svc?.image_url||'')}">
          </div>

          <!-- FontAwesome icon -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">FontAwesome Icon <span class="font-normal text-slate-300">(pick from grid or type class)</span></label>
            <div class="flex gap-2 mb-2">
              <input id="svc-icon-class" type="text" class="field text-sm flex-1 font-mono" placeholder="e.g. fas fa-cut"
                value="${esc(svc?.icon_class||'')}"
                oninput="const p=document.getElementById('svc-fa-preview');p.className=this.value||'fas fa-question text-slate-300';p.style.color=document.getElementById('svc-color').value||'#3b82f6'">
              <button type="button" onclick="document.getElementById('svc-icon-class').value='';const p=document.getElementById('svc-fa-preview');p.className='fas fa-question text-slate-300';p.style.color=''" class="px-3 py-1 text-xs text-red-400 hover:text-red-600 border border-slate-200 rounded-lg">Clear</button>
            </div>
            <!-- Icon grid — 8 cols, scrollable -->
            <div class="grid gap-1 p-2 bg-white border border-slate-200 rounded-xl overflow-y-auto" style="grid-template-columns:repeat(8,1fr);max-height:160px">
              ${faIcons.map(ic => `<button type="button" title="${ic.replace('fa-','')}"
                onclick="document.getElementById('svc-icon-class').value='fas ${ic}';const p=document.getElementById('svc-fa-preview');p.className='fas ${ic}';p.style.color=document.getElementById('svc-color').value||'#3b82f6';p.style.fontSize='1.75rem'"
                class="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors">
                <i class="fas ${ic}" style="font-size:1rem"></i>
              </button>`).join('')}
            </div>
            <!-- Live preview -->
            <div class="mt-2 flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2">
              <span class="text-xs text-slate-400 flex-shrink-0">Preview:</span>
              <i id="svc-fa-preview" class="${svc?.icon_class ? esc(svc.icon_class) : 'fas fa-question text-slate-300'}"
                style="font-size:1.75rem;color:${svc?.icon_class ? (svc?.color||'#3b82f6') : ''}"></i>
              <span class="text-xs text-slate-400 ml-1">← updates as you pick</span>
            </div>
            <p class="text-[10px] text-slate-400 mt-1">Color matches the service color picker above. <a href="https://fontawesome.com/icons" target="_blank" class="text-blue-500 hover:underline">Browse all FA icons ↗</a></p>
          </div>

          <!-- Emoji icon -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1.5">Emoji Icon <span class="font-normal text-slate-300">(fallback when no image or FA icon set)</span></label>
            <div class="flex gap-2 items-center mb-2">
              <input id="svc-icon-emoji" type="text" class="field text-sm w-20 text-center" style="font-size:1.4rem" placeholder="⭐" value="${esc(svc?.icon_emoji||'')}">
              <span class="text-xs text-slate-400">or pick:</span>
            </div>
            <div class="grid gap-0.5 p-2 bg-white border border-slate-200 rounded-xl overflow-y-auto" style="grid-template-columns:repeat(10,1fr);max-height:120px">
              ${commonEmojis.map(e=>`<button type="button" onclick="document.getElementById('svc-icon-emoji').value='${e}'" class="hover:bg-slate-100 rounded-lg flex items-center justify-center transition-colors" style="width:2rem;height:2rem;font-size:1.2rem">${e}</button>`).join('')}
            </div>
          </div>
        </div>

        <!-- Travel -->
        <div class="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div class="flex items-center gap-2 mb-3">
            <input type="checkbox" id="svc-travel" class="rounded" onchange="document.getElementById('svc-travel-cfg').classList.toggle('hidden',!this.checked)" ${svc?.travel_enabled?'checked':''}>
            <label for="svc-travel" class="text-sm font-bold text-amber-800">Enable Travel/Mobile Service</label>
          </div>
          <div id="svc-travel-cfg" class="${svc?.travel_enabled?'':'hidden'} space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Travel Fee Mode</label>
              <select id="svc-travel-mode" class="field text-sm">
                <option value="flat" ${(svc?.travel_mode||'flat')==='flat'?'selected':''}>Flat Rate Zones</option>
                <option value="per_km" ${svc?.travel_mode==='per_km'?'selected':''}>Per km/mile rate</option>
                <option value="custom" ${svc?.travel_mode==='custom'?'selected':''}>Custom (manual entry per booking)</option>
              </select>
            </div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Per km Rate Override (${cur})</label>
              <input id="svc-km-rate" type="number" class="field text-sm" step="0.1" placeholder="Leave blank to use global setting" value="${svc?.travel_per_km_rate||''}"></div>
          </div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-slate-100 flex gap-3">
        <button onclick="closeModal()" class="btn-secondary flex-1">Cancel</button>
        <button onclick="BK.saveService('${svc?.id||''}')" class="btn-primary flex-1"><i class="fas fa-save text-xs mr-1"></i>Save Service</button>
      </div>
    </div>`);
  }

  // STAFF MODAL
  function openStaffModal(id) {
  const stf = id ? state.staff.find(s=>s.id===id) : null;
  const avail = safeJson(stf?.availability, {});
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  
  // Get existing users who aren't already staff
  const existingStaffIds = state.staff.map(s => s.user_id).filter(Boolean);
  const availableUsers = []; // We'll populate this from users table
  
  // Load users for dropdown
  db().list('users', {}, { order: 'name', asc: true }).then(users => {
    const userSelect = document.getElementById('stf-user-select');
    if (userSelect) {
      const nonStaffUsers = users.filter(u => !existingStaffIds.includes(u.id) || u.id === stf?.user_id);
      userSelect.innerHTML = '<option value="">— Create new staff profile —</option>' +
        nonStaffUsers.map(u => {
          const roleBadge = u.role || 'Employee';
          return `<option value="${u.id}" data-email="${esc(u.email||'')}" data-name="${esc(u.name||'')}" ${stf?.user_id===u.id?'selected':''}>${esc(u.name||u.email||'Unknown')} (${roleBadge})</option>`;
        }).join('');
    }
  }).catch(() => {});
  
  showModal(`<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
    <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
      <h3 class="font-bold text-slate-900">${stf?'Edit Staff':'Add Staff Member'}</h3>
      <button onclick="closeModal()" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-times text-sm"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
      <div id="staff-err" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>
      
      <!-- Link to existing user -->
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Link to Existing User</label>
        <select id="stf-user-select" class="field text-sm" onchange="BK.onStaffUserChange(this)">
          <option value="">— Create new staff profile —</option>
        </select>
        <p class="text-[10px] text-slate-400 mt-1">Select a user to link this staff profile to their account</p>
      </div>
      
      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-2"><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Name *</label>
          <input id="stf-name" type="text" class="field text-sm" value="${esc(stf?.name||'')}" placeholder="Staff name"></div>
        <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Color</label>
          <input id="stf-color" type="color" class="field text-sm h-[42px] p-1 cursor-pointer" value="${stf?.color||'#8b5cf6'}"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
          <input id="stf-email" type="email" class="field text-sm" value="${esc(stf?.email||'')}" placeholder="staff@email.com"></div>
        <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
          <input id="stf-phone" type="tel" class="field text-sm" value="${esc(stf?.phone||'')}" placeholder="+1..."></div>
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Working Hours</label>
        <div class="space-y-2">
          ${days.map(d => {
            const da = avail[d] || {};
            return `<div class="flex items-center gap-2">
              <input type="checkbox" id="stf-day-${d}" class="rounded flex-shrink-0" ${da.enabled?'checked':''} onchange="document.getElementById('stf-hours-${d}').classList.toggle('hidden',!this.checked)">
              <label for="stf-day-${d}" class="text-xs font-semibold text-slate-600 w-8">${d}</label>
              <div id="stf-hours-${d}" class="flex gap-1 items-center ${da.enabled?'':'hidden'}">
                <input type="time" id="stf-start-${d}" value="${da.start||'09:00'}" class="field text-xs py-1 w-24">
                <span class="text-slate-300 text-xs">–</span>
                <input type="time" id="stf-end-${d}" value="${da.end||'18:00'}" class="field text-xs py-1 w-24">
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="stf-auto" class="rounded" ${stf?.auto_assign!==false?'checked':''}>
        <label for="stf-auto" class="text-sm text-slate-700 font-medium">Enable auto-assignment (⚡ Smart Assign)</label>
      </div>
    </div>
    <div class="px-6 py-4 border-t border-slate-100 flex gap-3">
      <button onclick="closeModal()" class="btn-secondary flex-1">Cancel</button>
      <button onclick="BK.saveStaff('${stf?.id||''}')" class="btn-primary flex-1"><i class="fas fa-save text-xs mr-1"></i>Save</button>
    </div>
  </div>`);
  }

  function onStaffUserChange(select) {
    const option = select.options[select.selectedIndex];
    if (option && option.value) {
      const nameEl = document.getElementById('stf-name');
      const emailEl = document.getElementById('stf-email');
      if (nameEl && option.dataset.name) nameEl.value = option.dataset.name;
      if (emailEl && option.dataset.email) emailEl.value = option.dataset.email;
    }
  }

  async function saveStaff(id) {
  const errEl = document.getElementById('staff-err');
  const name = document.getElementById('stf-name')?.value?.trim();
  const userId = document.getElementById('stf-user-select')?.value || null;
  
  if (!name) { 
    errEl.textContent = 'Name required.'; 
    errEl.classList.remove('hidden'); 
    return; 
  }
  
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const avail = {};
  days.forEach(d => {
    const enabled = document.getElementById(`stf-day-${d}`)?.checked;
    if (enabled) avail[d] = { 
      enabled: true, 
      start: document.getElementById(`stf-start-${d}`)?.value || '09:00', 
      end: document.getElementById(`stf-end-${d}`)?.value || '18:00' 
    };
  });
  
  const row = {
    user_id: userId || null,
    name, 
    color: document.getElementById('stf-color')?.value || '#8b5cf6',
    email: document.getElementById('stf-email')?.value || '',
    phone: document.getElementById('stf-phone')?.value || '',
    availability: JSON.stringify(avail),
    auto_assign: document.getElementById('stf-auto')?.checked !== false,
    active: true,
  };
  
  try {
    if (id) { 
      await db().update('booking_staff', id, row); 
      toast('Staff updated', 'success'); 
    } else { 
      const newStaff = await db().create('booking_staff', row);
      
      // Update user role to Contractor if linked
      if (userId) {
        try {
          const user = await db().get('users', userId);
          if (user && (!user.role || user.role === 'Employee')) {
            await db().update('users', userId, { role: 'Contractor' });
          }
        } catch(e) {
          console.log('Could not update user role:', e);
        }
      }
      
      toast('Staff member added', 'success'); 
    }
    closeModal(); 
    await reload();
  } catch(e) { 
    errEl.textContent = e.message; 
    errEl.classList.remove('hidden'); 
  }
  }

  // ── SAVE ACTIONS ─────────────────────────────────────────────
  async function saveBooking(id) {
    const errEl = document.getElementById('bk-modal-err');
    const show = (msg) => { errEl.textContent=msg; errEl.classList.remove('hidden'); };

    const custSel = document.getElementById('bk-m-customer')?.value;
    const date = document.getElementById('bk-m-date')?.value;
    const time = document.getElementById('bk-m-time')?.value;
    const serviceId = document.getElementById('bk-m-service')?.value;
    const staffId = document.getElementById('bk-m-staff')?.value || null;
    const notes = document.getElementById('bk-m-notes')?.value || '';
    const payMethod = document.getElementById('bk-m-payment')?.value || 'free';
    const amount = parseFloat(document.getElementById('bk-m-amount')?.value||0) || 0;
    const travelChecked = document.getElementById('bk-m-travel')?.checked;
    const travelAddr = document.getElementById('bk-m-travel-addr')?.value || '';
    const travelFee = parseFloat(document.getElementById('bk-m-travel-fee')?.value||0) || 0;
    const travelDist = parseFloat(document.getElementById('bk-m-travel-dist')?.value||0) || 0;
    const recurring = document.getElementById('bk-m-recurring')?.value || 'none';
    const recurringEnd = document.getElementById('bk-m-rec-end-date')?.value || null;
    const status = document.getElementById('bk-m-status')?.value || 'pending';

    if (!date || !time) return show('Please select a date and time.');
    if (!serviceId) return show('Please select a service.');

    // Customer: existing or new
    let customerId = custSel;
    if (custSel === '__new__' || (!custSel && !id)) {
      const cname = document.getElementById('bk-m-cname')?.value?.trim();
      if (!cname) return show('Please enter customer name or select existing.');
      try {
        const newCust = await db().create('booking_customers', {
          name: cname,
          email: document.getElementById('bk-m-cemail')?.value || null,
          phone: document.getElementById('bk-m-cphone')?.value || null,
          address: document.getElementById('bk-m-caddr')?.value || null,
        });
        customerId = newCust.id;
        // CRM integration
        try {
          await db().create('crm_contacts', { name: cname, email: document.getElementById('bk-m-cemail')?.value||null, phone: document.getElementById('bk-m-cphone')?.value||null, source: 'booking' });
        } catch(e) {}
      } catch(e) { return show('Could not create customer: ' + e.message); }
    }

    const svc = state.services.find(s=>s.id===serviceId);
    const dur = svc?.duration || 60;
    const startTime = new Date(`${date}T${time}:00`);
    const endTime   = new Date(startTime.getTime() + dur*60000);

    // Conflict check
    const conflict = state.bookings.find(b => {
      if (b.id === id) return false;
      if (b.status === 'cancelled') return false;
      if (staffId && b.staff_id !== staffId) return false;
      const bs = new Date(b.start_time), be = new Date(b.end_time);
      return startTime < be && endTime > bs;
    });
    if (conflict) {
      const cc = state.customers.find(c=>c.id===conflict.customer_id);
      return show(`Conflict: overlaps with "${cc?.name||'another booking'}" at ${fmtTime(conflict.start_time)}`);
    }

    const row = {
      customer_id: customerId,
      service_id: serviceId,
      staff_id: staffId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: id ? status : 'pending',
      payment_method: payMethod,
      payment_status: 'unpaid',
      amount: payMethod!=='free' ? amount : 0,
      travel_fee: travelChecked ? travelFee : 0,
      travel_address: travelChecked ? travelAddr : null,
      travel_distance: travelChecked ? travelDist : 0,
      notes,
      recurring,
      recurring_end: recurringEnd,
    };

    try {
      if (id) {
        await db().update('bookings', id, row);
        toast('Booking updated', 'success');
        // Notification: status changed
        if (user()) {
          try { await db().create('notifications', { user_id: user().id, title: 'Booking Updated', message: `Status: ${status}`, type: 'info', read: false }); } catch(e){}
        }
      } else {
        const created = await db().create('bookings', row);
        toast('Booking created!', 'success');
        // Notifications
        if (user()) {
          try {
            await db().create('notifications', { user_id: user().id, title: 'New Booking', message: `Booking confirmed for ${fmtDate(startTime.toISOString())} at ${fmtTime(startTime.toISOString())}`, type: 'success', read: false });
          } catch(e){}
        }
        // Finance integration: if paid
        if (payMethod==='paypal' && amount>0) {
          try { await db().create('financial_transactions', { type:'Income', amount: amount+travelFee, description: `Booking: ${svc?.name||'Service'}`, date: date, category: 'Bookings' }); } catch(e){}
        }
        // Tasks integration: create task for staff
        if (staffId) {
          try { await db().create('tasks', { title: `Booking: ${svc?.name||'Service'} on ${fmtDate(startTime.toISOString())}`, assigned_to: staffId, due_date: date, status: 'Todo', created_by: user()?.id }); } catch(e){}
        }
        // Timesheet integration
        if (staffId) {
          try { await db().create('timesheets', { employee_id: staffId, date, hours: (dur/60).toFixed(2), description: `Booking: ${svc?.name||'Service'}`, status: 'Pending' }); } catch(e){}
        }
        // Recurring bookings
        if (recurring !== 'none' && recurringEnd) {
          await createRecurringBookings(row, recurring, new Date(recurringEnd), startTime, endTime);
        }
        // PayPal link
        if (payMethod === 'paypal' && state.settings.paypal_email) {
          const ppLink = `https://www.paypal.com/paypalme/${encodeURIComponent(state.settings.paypal_email)}/${amount+travelFee}`;
          toast(`PayPal link: ${ppLink}`, 'info', 6000);
        }
      }
      closeModal();
      await reload();
    } catch(e) { show(e.message); }
  }

  async function createRecurringBookings(baseRow, recurring, endDate, firstStart, firstEnd) {
    const msMap = { daily: 86400000, weekly: 7*86400000, monthly: null };
    let cur = new Date(firstStart), curEnd = new Date(firstEnd);
    const limit = 52;
    let count = 0;
    while (count < limit) {
      if (recurring === 'monthly') { cur.setMonth(cur.getMonth()+1); curEnd.setMonth(curEnd.getMonth()+1); }
      else { cur = new Date(cur.getTime() + msMap[recurring]); curEnd = new Date(curEnd.getTime() + msMap[recurring]); }
      if (cur > endDate) break;
      try { await db().create('bookings', { ...baseRow, start_time: cur.toISOString(), end_time: curEnd.toISOString() }); } catch(e){}
      count++;
    }
  }

  async function saveService(id) {
    const errEl = document.getElementById('svc-err');
    const name = document.getElementById('svc-name')?.value?.trim();
    if (!name) { errEl.textContent='Service name required.'; errEl.classList.remove('hidden'); return; }
    const row = {
      name, color: document.getElementById('svc-color')?.value||'#3b82f6',
      category: document.getElementById('svc-category')?.value||'',
      badge: document.getElementById('svc-badge')?.value||'',
      duration: parseInt(document.getElementById('svc-duration')?.value)||60,
      price: parseFloat(document.getElementById('svc-price')?.value)||0,
      description: document.getElementById('svc-desc')?.value||'',
      long_description: document.getElementById('svc-long-desc')?.value||'',
      location_note: document.getElementById('svc-location-note')?.value||'',
      info_url: document.getElementById('svc-info-url')?.value||'',
      image_url: document.getElementById('svc-image-url')?.value||'',
      icon_class: document.getElementById('svc-icon-class')?.value||'',
      icon_emoji: document.getElementById('svc-icon-emoji')?.value||'',
      travel_enabled: document.getElementById('svc-travel')?.checked||false,
      travel_mode: document.getElementById('svc-travel-mode')?.value||'flat',
      travel_per_km_rate: parseFloat(document.getElementById('svc-km-rate')?.value)||0,
      active: true,
    };
    try {
      if (id) { await db().update('booking_services', id, row); toast('Service updated','success'); }
      else     { await db().create('booking_services', row); toast('Service created','success'); }
      closeModal(); await reload();
    } catch(e) { errEl.textContent=e.message; errEl.classList.remove('hidden'); }
  }

  async function saveSettings() {
    const open  = document.getElementById('bk-s-open')?.value||'09:00';
    const close = document.getElementById('bk-s-close')?.value||'18:00';
    const interval = document.getElementById('bk-s-interval')?.value||'30';
    const currency = document.getElementById('bk-s-currency')?.value||'$';
    const paypal = document.getElementById('bk-s-paypal')?.value||'';
    const kmRate = document.getElementById('bk-s-km-rate')?.value||'1.5';

    // Collect days
    const activeDays = Array.from(document.querySelectorAll('[data-day]')).filter(b=>b.classList.contains('bg-blue-600')).map(b=>b.dataset.day);

    // Collect zones
    const zones = [];
    document.querySelectorAll('[data-zone]').forEach(row => {
      const label = row.querySelector('[data-zone-label]')?.value||'';
      const km = parseFloat(row.querySelector('[data-zone-km]')?.value)||0;
      const fee = parseFloat(row.querySelector('[data-zone-fee]')?.value)||0;
      if (label) zones.push({ label, max_km: km, fee });
    });

    // Travel mode
    const tMode = document.getElementById('bk-travel-flat')?.classList.contains('border-blue-600') ? 'flat' : 'per_km';

    const etransferEmail = document.getElementById('bk-s-etransfer')?.value||'';
    const etransferMsg   = document.getElementById('bk-s-etransfer-msg')?.value||'';
    const depositReq     = document.getElementById('bk-s-deposit-req')?.checked ? '1' : '0';
    const depositAmt     = document.getElementById('bk-s-deposit-amount')?.value||'0';

    // Collect discount codes
    const discountCodes = [];
    document.querySelectorAll('[data-discount]').forEach(row => {
      const code   = row.querySelector('[data-dc-code]')?.value?.trim().toUpperCase() || '';
      const type   = row.querySelector('[data-dc-type]')?.value || 'flat';
      const val    = parseFloat(row.querySelector('[data-dc-value]')?.value) || 0;
      const active = row.querySelector('[data-dc-active]')?.checked !== false;
      if (code) discountCodes.push({
        code,
        flat: type === 'flat' ? val : 0,
        pct:  type === 'pct'  ? val : 0,
        active,
      });
    });

    const pairs = [
      ['business_hours_start', open], ['business_hours_end', close],
      ['slot_interval', interval], ['currency', currency],
      ['paypal_email', paypal], ['travel_mode', tMode],
      ['travel_per_km_rate', kmRate], ['travel_flat_zones', JSON.stringify(zones)],
      ['business_days', JSON.stringify(activeDays)],
      ['etransfer_email', etransferEmail],
      ['etransfer_message', etransferMsg],
      ['deposit_required', depositReq],
      ['deposit_amount', depositAmt],
      ['discount_codes', JSON.stringify(discountCodes)],
      ['business_address', document.getElementById('bk-s-business-address')?.value||''],
      ['multi_service_mode', document.getElementById('bk-s-multi-service')?.checked ? '1' : '0'],
    ];

    try {
      const D = db();
      await dsUpsertSettings(D, pairs);
      toast('Settings saved','success');
      await reload();
    } catch(e) { toast('Error saving settings: '+e.message,'error'); }
  }

  // ── DELETE ────────────────────────────────────────────────────
  function confirmDelete(id, type) {
    showModal(`<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
      <div class="px-6 py-5">
        <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-trash text-red-500"></i></div>
        <h3 class="font-bold text-slate-900 text-center mb-1">Delete ${capitalize(type)}?</h3>
        <p class="text-sm text-slate-500 text-center">This action cannot be undone.</p>
      </div>
      <div class="px-6 pb-5 flex gap-3">
        <button onclick="closeModal()" class="btn-secondary flex-1">Cancel</button>
        <button onclick="BK.doDelete('${id}','${type}')" class="btn-primary flex-1 !bg-red-600 hover:!bg-red-700">Delete</button>
      </div>
    </div>`);
  }

  async function doDelete(id, type) {
    const tableMap = { booking:'bookings', service:'booking_services', staff:'booking_staff', customer:'booking_customers', waitlist:'booking_waitlist' };
    try {
      await db().delete(tableMap[type]||'bookings', id);
      toast(`${capitalize(type)} deleted`,'success');
      closeModal(); await reload();
    } catch(e) { toast(e.message,'error'); }
  }

  // ── SMART FEATURES ────────────────────────────────────────────
  function autoAssignStaff() {
    const dateVal = document.getElementById('bk-m-date')?.value;
    const timeVal = document.getElementById('bk-m-time')?.value;
    if (!dateVal || !timeVal) { toast('Select date and time first','warning'); return; }
    const start = new Date(`${dateVal}T${timeVal}:00`);
    const svcId = document.getElementById('bk-m-service')?.value;
    const svc = state.services.find(s=>s.id===svcId);
    const dur = svc?.duration || 60;
    const end = new Date(start.getTime() + dur*60000);
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][start.getDay()];

    const available = state.staff.filter(stf => {
      if (!stf.auto_assign) return false;
      const avail = safeJson(stf.availability, {});
      if (!avail[dayName]?.enabled) return false;
      const stStart = new Date(`${dateVal}T${avail[dayName].start}:00`);
      const stEnd   = new Date(`${dateVal}T${avail[dayName].end}:00`);
      if (start < stStart || end > stEnd) return false;
      // Check no conflicts
      const hasConflict = state.bookings.some(b => {
        if (b.staff_id !== stf.id || b.status==='cancelled') return false;
        const bs=new Date(b.start_time), be=new Date(b.end_time);
        return start < be && end > bs;
      });
      return !hasConflict;
    });

    if (!available.length) { toast('No available staff for this slot','warning'); return; }
    // Pick least busy
    const best = available.sort((a,b) => {
      const ca = state.bookings.filter(x=>x.staff_id===a.id&&x.status!=='cancelled').length;
      const cb = state.bookings.filter(x=>x.staff_id===b.id&&x.status!=='cancelled').length;
      return ca-cb;
    })[0];
    const sel = document.getElementById('bk-m-staff');
    if (sel) { sel.value = best.id; toast(`Auto-assigned: ${best.name}`,'success'); }
  }

  function calcTravelFee() {
    const dist = parseFloat(document.getElementById('bk-m-travel-dist')?.value||0)||0;
    if (!dist) return;
    const mode = state.settings.travel_mode || 'flat';
    let fee = 0;
    if (mode === 'per_km') {
      fee = dist * (parseFloat(state.settings.travel_per_km_rate)||1.5);
    } else {
      const zones = safeJson(state.settings.travel_flat_zones, []);
      const zone = zones.sort((a,b)=>a.max_km-b.max_km).find(z=>dist<=z.max_km);
      fee = zone?.fee || 0;
    }
    const feeEl = document.getElementById('bk-m-travel-fee');
    if (feeEl) feeEl.value = fee.toFixed(2);
  }

  async function convertWaitlist(id) {
    const w = state.waitlist.find(x=>x.id===id);
    if (!w) return;
    const startISO = w.requested_date ? new Date(w.requested_date).toISOString() : new Date().toISOString();
    showModal(bookingModalHTML(null, w.requested_date||'', ''));
    // Pre-fill fields after render
    setTimeout(() => {
      const cname = document.getElementById('bk-m-cname'); if(cname) cname.value = w.customer_name||'';
      const cemail = document.getElementById('bk-m-cemail'); if(cemail) cemail.value = w.customer_email||'';
      const cphone = document.getElementById('bk-m-cphone'); if(cphone) cphone.value = w.customer_phone||'';
      const svcSel = document.getElementById('bk-m-service'); if(svcSel&&w.service_id) svcSel.value = w.service_id;
      const stfSel = document.getElementById('bk-m-staff'); if(stfSel&&w.staff_id) stfSel.value = w.staff_id;
      const custSel = document.getElementById('bk-m-customer'); if(custSel) custSel.value = '__new__';
      const newCust = document.getElementById('bk-new-cust'); if(newCust) newCust.classList.remove('hidden');
    }, 50);
    attachBookingModalEvents();
  }

  async function deleteWaitlist(id) {
    try { await db().delete('booking_waitlist', id); toast('Removed from waitlist','success'); await reload(); }
    catch(e) { toast(e.message,'error'); }
  }

  // ── SETTINGS HELPERS ─────────────────────────────────────────
  function setTravelMode(mode) {
    const flatBtn = document.getElementById('bk-travel-flat');
    const kmBtn   = document.getElementById('bk-travel-km');
    const flatCfg = document.getElementById('bk-travel-flat-cfg');
    const kmCfg   = document.getElementById('bk-travel-km-cfg');
    if (mode === 'flat') {
      flatBtn?.classList.add('border-blue-600','bg-blue-50','text-blue-700'); flatBtn?.classList.remove('border-slate-200','text-slate-500');
      kmBtn?.classList.add('border-slate-200','text-slate-500'); kmBtn?.classList.remove('border-blue-600','bg-blue-50','text-blue-700');
      flatCfg?.classList.remove('hidden'); kmCfg?.classList.add('hidden');
    } else {
      kmBtn?.classList.add('border-blue-600','bg-blue-50','text-blue-700'); kmBtn?.classList.remove('border-slate-200','text-slate-500');
      flatBtn?.classList.add('border-slate-200','text-slate-500'); flatBtn?.classList.remove('border-blue-600','bg-blue-50','text-blue-700');
      kmCfg?.classList.remove('hidden'); flatCfg?.classList.add('hidden');
    }
  }

  function addZone() {
    const list = document.getElementById('bk-zones-list');
    if (!list) return;
    const i = list.children.length;
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center';
    div.dataset.zone = i;
    div.innerHTML = `
      <input type="text" placeholder="Zone label" class="field text-xs flex-1" data-zone-label="${i}">
      <input type="number" placeholder="Max km" class="field text-xs w-20" data-zone-km="${i}">
      <input type="number" placeholder="Fee" class="field text-xs w-20" data-zone-fee="${i}">
      <button onclick="this.closest('[data-zone]').remove()" class="text-red-400 hover:text-red-600 text-xs px-1"><i class="fas fa-times"></i></button>`;
    list.appendChild(div);
  }

  // ── DRAG & DROP ───────────────────────────────────────────────
  function dragStart(e, id) { state.dragBooking = id; e.dataTransfer.effectAllowed = 'move'; }
  function dragEnd(e) { state.dragBooking = null; }
  async function dropOnStatus(e, status) {
    e.preventDefault();
    if (!state.dragBooking) return;
    try {
      await db().update('bookings', state.dragBooking, { status });
      toast(`Moved to ${status}`,'success');
      await reload();
    } catch(err) { toast(err.message,'error'); }
  }

  // ── REMINDER POLLER ───────────────────────────────────────────
  function startReminderPoller() {
    checkReminders();
    setInterval(checkReminders, 5*60000);
  }

  async function checkReminders() {
    if (!user()) return;
    const now = new Date();
    const soon = new Date(now.getTime() + 60*60000); // 1h window
    const upcoming = state.bookings.filter(b => {
      if (b.status !== 'confirmed') return false;
      const s = new Date(b.start_time);
      return s > now && s <= soon;
    });
    for (const b of upcoming) {
      const key = `bk_reminded_${b.id}`;
      if (sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, '1');
      const cust = state.customers.find(c=>c.id===b.customer_id);
      const svc  = state.services.find(s=>s.id===b.service_id);
      try {
        await db().create('notifications', {
          user_id: user().id,
          title: '⏰ Booking Reminder',
          message: `${svc?.name||'Booking'} with ${cust?.name||'customer'} at ${fmtTime(b.start_time)}`,
          type: 'info', read: false,
        });
      } catch(e) {}
    }
  }

  // ── MODAL HELPERS ─────────────────────────────────────────────
  function showModal(html) {
    const root = document.getElementById('modals-root') || document.body;
    root.innerHTML = `<div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 fade-in" id="bk-modal-overlay" onclick="if(event.target===this)closeModal()">${html}</div>`;
  }

  window.closeModal = function() {
    const root = document.getElementById('modals-root') || document.body;
    root.innerHTML = '';
  };

  // ── CALENDAR NAVIGATION ───────────────────────────────────────
  function calNav(dir) {
    if (state.calView === 'week')  { state.calDate = new Date(state.calDate.getTime() + dir*7*86400000); }
    else if (state.calView==='day') { state.calDate = new Date(state.calDate.getTime() + dir*86400000); }
    else { state.calDate = new Date(state.calDate.getFullYear(), state.calDate.getMonth()+dir, 1); }
    renderCalGrid();
  }

  function calToday() { state.calDate = new Date(); renderCalGrid(); }

  function calSetView(v) {
    state.calView = v;
    ['day','week','month'].forEach(x => {
      const btn = document.getElementById(`bk-calview-${x}`);
      if (!btn) return;
      btn.className = btn.className.replace(/bg-white text-blue-600 shadow-sm|text-slate-500 hover:text-slate-700/g,'');
      btn.className += x===v ? ' bg-white text-blue-600 shadow-sm' : ' text-slate-500 hover:text-slate-700';
    });
    renderCalGrid();
  }

  function setBookingView(v) {
    state.bookingView = v;
    switchTab('bookings');
  }

  // ── BOOKING MODAL EVENT HANDLERS ──────────────────────────────
  function onCustomerChange(sel) {
    const newCust = document.getElementById('bk-new-cust');
    if (!newCust) return;
    newCust.classList.toggle('hidden', sel.value !== '__new__');
  }

  function onServiceChange(sel) {
    const opt = sel.options[sel.selectedIndex];
    const travelEnabled = opt.dataset.travel === '1';
    const section = document.getElementById('bk-m-travel-section');
    if (section) section.classList.toggle('hidden', !travelEnabled);
    // Update amount
    const price = parseFloat(opt.dataset.price||0)||0;
    const amtEl = document.getElementById('bk-m-amount');
    if (amtEl && price > 0) amtEl.value = price.toFixed(2);
  }

  function onTravelToggle(cb) {
    const fields = document.getElementById('bk-m-travel-fields');
    if (fields) fields.classList.toggle('hidden', !cb.checked);
  }

  function onRecurringChange(sel) {
    const end = document.getElementById('bk-m-rec-end');
    if (end) end.classList.toggle('hidden', sel.value === 'none');
  }

  function onPaymentChange(sel) {
    const row = document.getElementById('bk-m-amount-row');
    const ppLink = document.getElementById('bk-m-paypal-link');
    if (row) row.classList.toggle('hidden', sel.value === 'free');
    if (ppLink) ppLink.classList.toggle('hidden', sel.value !== 'paypal');
  }

  // ── UTILITIES ─────────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(n) { return (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function capitalize(s) { return s?s[0].toUpperCase()+s.slice(1):s; }
  function safeJson(v, def) { try{ return JSON.parse(typeof v==='string'?v:JSON.stringify(v||def))||def; }catch(e){ return def; } }
  function fmtDate(iso) { if(!iso) return ''; return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function fmtDateShort(d) { return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  function fmtTime(iso) { if(!iso) return ''; return new Date(iso).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}); }
  function fmtTimeInput(iso) { if(!iso) return ''; const d=new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function getWeekDays(d) {
    const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - day);
    return Array.from({length:7},(_,i) => { const x=new Date(mon); x.setDate(mon.getDate()+i); return x; });
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  function publicAPI() {
    return {
      switchTab, openNewBooking, openEditBooking, openServiceModal,
      openStaffModal, saveBooking, saveService, saveStaff, saveSettings,
      confirmDelete, doDelete, autoAssignStaff, calcTravelFee,
      convertWaitlist, deleteWaitlist, setTravelMode, addZone,
      calNav, calToday, calSetView, setBookingView, filterBookings,
      dragStart, dragEnd, dropOnStatus,
      onCustomerChange, onServiceChange, onTravelToggle, onRecurringChange, onPaymentChange,
      onStaffUserChange,
      addDiscountCode: function() {
        const list = document.getElementById('bk-discount-list');
        if (!list) return;
        const i = list.children.length;
        const div = document.createElement('div');
        div.innerHTML = discountCodeRow({ code:'', flat:0, pct:0, active:true }, i);
        list.appendChild(div.firstElementChild);
      },
      reload,
      // Designer
      dsApply, dsSaveAll, dsReset, dsExport, dsPickPreset, dsUpdatePreview, dsUpdateInlinePreview,
      dsContentSave, dsContentSaveNow, dsAddNavLink, dsAddBanner, dsAddFooterLink,
      dsAddHighlight: function() {
        const list = document.getElementById('ds-highlights-list');
        if (!list) return;
        const i = list.children.length;
        const div = document.createElement('div');
        div.innerHTML = `<div class="flex gap-2 items-center" data-highlight="${i}">
          <input type="text" placeholder="e.g. Licensed & Insured" class="field text-xs flex-1" data-hl-text="${i}" oninput="BK.dsContentSave()">
          <button onclick="this.closest('[data-highlight]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
        </div>`;
        list.appendChild(div.firstElementChild);
      },
      dsAddGalleryImage: function() {
        const list = document.getElementById('ds-gallery-list');
        if (!list) return;
        const i = list.children.length;
        const div = document.createElement('div');
        div.innerHTML = `<div class="flex gap-2 items-center" data-gallery="${i}">
          <input type="url" placeholder="https://… image URL" class="field text-xs flex-1" data-gal-url="${i}" oninput="BK.dsContentSave()">
          <input type="text" placeholder="Alt text" class="field text-xs w-24" data-gal-alt="${i}" oninput="BK.dsContentSave()">
          <button onclick="this.closest('[data-gallery]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
        </div>`;
        list.appendChild(div.firstElementChild);
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PAGE DESIGNER
  // ═══════════════════════════════════════════════════════════════

  // Default design tokens
  const DS_DEFAULTS = {
    primary:       '#2563eb',
    primaryDark:   '#1d4ed8',
    primaryLight:  '#eff6ff',
    accent:        '#10b981',
    bg:            '#f8fafc',
    surface:       '#ffffff',
    border:        '#e2e8f0',
    text:          '#0f172a',
    textMuted:     '#64748b',
    headerBg:      '#ffffff',
    btnRadius:     '12px',
    cardRadius:    '20px',
    cardShadowPreset: 'soft',
    fontBody:      'Plus Jakarta Sans',
    fontHeading:   'Plus Jakarta Sans',
    calStyle:      'classic',
    stepStyle:     'dots',
    maxWidth:      '42rem',
    bizName:       '',
  };

  const FONT_OPTIONS = [
    'Plus Jakarta Sans','Inter','Poppins','Nunito','Lato','Raleway',
    'Montserrat','DM Sans','Outfit','Sora','Manrope','Figtree',
  ];

  const PRESETS = {
    default: { label:'Default', primary:'#2563eb', accent:'#10b981', bg:'#f8fafc', surface:'#ffffff', border:'#e2e8f0', text:'#0f172a', headerBg:'#ffffff', fontBody:'Plus Jakarta Sans', fontHeading:'Plus Jakarta Sans', calStyle:'classic', stepStyle:'dots', cardRadius:'20px', btnRadius:'12px', cardShadowPreset:'soft' },
    midnight: { label:'Midnight', primary:'#818cf8', accent:'#34d399', bg:'#0f172a', surface:'#1e293b', border:'#334155', text:'#f1f5f9', textMuted:'#94a3b8', headerBg:'#1e293b', fontBody:'Inter', fontHeading:'Sora', calStyle:'bubble', stepStyle:'numbers', cardRadius:'16px', btnRadius:'8px', cardShadowPreset:'heavy' },
    rose:     { label:'Rose', primary:'#e11d48', accent:'#f59e0b', bg:'#fff1f2', surface:'#ffffff', border:'#fecdd3', text:'#1c1917', headerBg:'#ffffff', fontBody:'Nunito', fontHeading:'Raleway', calStyle:'classic', stepStyle:'dots', cardRadius:'24px', btnRadius:'50px', cardShadowPreset:'medium' },
    forest:   { label:'Forest', primary:'#16a34a', accent:'#0ea5e9', bg:'#f0fdf4', surface:'#ffffff', border:'#bbf7d0', text:'#14532d', headerBg:'#ffffff', fontBody:'Lato', fontHeading:'Montserrat', calStyle:'minimal', stepStyle:'bar', cardRadius:'12px', btnRadius:'6px', cardShadowPreset:'flat' },
    lavender: { label:'Lavender', primary:'#7c3aed', accent:'#ec4899', bg:'#faf5ff', surface:'#ffffff', border:'#e9d5ff', text:'#1e1b4b', headerBg:'#ffffff', fontBody:'DM Sans', fontHeading:'Outfit', calStyle:'bubble', stepStyle:'dots', cardRadius:'20px', btnRadius:'12px', cardShadowPreset:'soft' },
    charcoal: { label:'Charcoal', primary:'#f59e0b', accent:'#06b6d4', bg:'#18181b', surface:'#27272a', border:'#3f3f46', text:'#fafafa', textMuted:'#a1a1aa', headerBg:'#27272a', fontBody:'Manrope', fontHeading:'Figtree', calStyle:'classic', stepStyle:'numbers', cardRadius:'8px', btnRadius:'4px', cardShadowPreset:'flat' },
  };

  let dsDesign = {};         // current working design
  let dsPreviewReady = false;

  function dsGetSaved() {
    try { return JSON.parse(state.settings.booking_page_design || '{}'); }
    catch(e) { return {}; }
  }

  function dsMerge(base, overrides) {
    return Object.assign({}, DS_DEFAULTS, base, overrides);
  }

  // ── Render Designer Tab ────────────────────────────────────────
  function renderDesigner() {
    dsDesign = dsMerge(dsGetSaved());
    const d = dsDesign;
    const cur = state.settings.currency || '$';
    const bookUrl = state.settings.book_page_url || (window.location.origin + '/book.html');

    return `<div class="flex flex-col lg:flex-row h-full min-h-[600px] fade-in" id="ds-root">

      <!-- Left Panel: Controls -->
      <div class="w-full lg:w-80 xl:w-96 flex-shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto" style="max-height:calc(100vh - 140px)">

        <!-- Panel header -->
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 class="font-bold text-slate-800 text-sm flex items-center gap-2">
            <i class="fas fa-paint-brush text-blue-400"></i> Page Designer
          </h2>
          <div class="flex gap-2">
            <button onclick="BK.dsReset()" class="text-xs text-slate-400 hover:text-red-500 transition-colors" title="Reset to defaults">
              <i class="fas fa-undo"></i>
            </button>
            <button onclick="BK.dsSaveAll()" class="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              <i class="fas fa-save mr-1"></i>Save
            </button>
          </div>
        </div>

        <div class="p-4 space-y-5">

          <!-- Presets -->
          <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Quick Presets</p>
            <div class="grid grid-cols-3 gap-2">
              ${Object.entries(PRESETS).map(([key, p]) => `
                <button onclick="BK.dsPickPreset('${key}')"
                  class="rounded-xl border-2 p-2 text-center transition-all hover:scale-105 ${dsDesign._preset===key?'border-blue-600 shadow-md':'border-slate-200'}"
                  style="background:${p.bg}">
                  <div class="w-6 h-6 rounded-full mx-auto mb-1 shadow-sm" style="background:${p.primary}"></div>
                  <p class="text-[10px] font-bold" style="color:${p.text}">${p.label}</p>
                </button>`).join('')}
            </div>
          </div>

          <!-- Colors -->
          <div class="space-y-3">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Colors</p>
            ${colorRow('Primary', 'primary', d.primary)}
            ${colorRow('Accent / Success', 'accent', d.accent)}
            ${colorRow('Background', 'bg', d.bg)}
            ${colorRow('Card Surface', 'surface', d.surface)}
            ${colorRow('Border', 'border', d.border)}
            ${colorRow('Text', 'text', d.text)}
            ${colorRow('Header Background', 'headerBg', d.headerBg)}
          </div>

          <!-- Typography -->
          <div class="space-y-3">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Typography</p>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Body Font</label>
              <select id="ds-fontBody" class="field text-sm" onchange="BK.dsApply()">
                ${FONT_OPTIONS.map(f=>`<option value="${f}" ${d.fontBody===f?'selected':''}>${f}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Heading Font</label>
              <select id="ds-fontHeading" class="field text-sm" onchange="BK.dsApply()">
                ${FONT_OPTIONS.map(f=>`<option value="${f}" ${d.fontHeading===f?'selected':''}>${f}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Shape & Shadow -->
          <div class="space-y-3">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Shape & Shadow</p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Card Radius</label>
                <select id="ds-cardRadius" class="field text-sm" onchange="BK.dsApply()">
                  ${[['4px','Sharp'],['8px','Slight'],['12px','Rounded'],['20px','Soft'],['28px','Pill']].map(([v,l])=>`<option value="${v}" ${d.cardRadius===v?'selected':''}>${l}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Button Radius</label>
                <select id="ds-btnRadius" class="field text-sm" onchange="BK.dsApply()">
                  ${[['4px','Square'],['8px','Slight'],['12px','Rounded'],['50px','Full Pill']].map(([v,l])=>`<option value="${v}" ${d.btnRadius===v?'selected':''}>${l}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Card Shadow</label>
              <div class="grid grid-cols-4 gap-1">
                ${[['flat','Flat'],['soft','Soft'],['medium','Medium'],['heavy','Heavy']].map(([v,l])=>`
                  <button onclick="document.getElementById('ds-cardShadowPreset').value='${v}';BK.dsApply()"
                    id="ds-shadow-${v}"
                    class="py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${d.cardShadowPreset===v?'border-blue-600 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500 hover:border-slate-300'}">
                    ${l}
                  </button>`).join('')}
              </div>
              <input type="hidden" id="ds-cardShadowPreset" value="${d.cardShadowPreset}">
            </div>
          </div>

          <!-- Calendar Style -->
          <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Calendar Style</p>
            <div class="grid grid-cols-3 gap-2">
              ${[['classic','Classic','fa-calendar'],['bubble','Bubble','fa-circle'],['minimal','Minimal','fa-minus']].map(([v,l,ic])=>`
                <button onclick="document.getElementById('ds-calStyle').value='${v}';BK.dsApply()"
                  class="rounded-xl border-2 p-3 transition-all ${d.calStyle===v?'border-blue-600 bg-blue-50':'border-slate-200 hover:border-slate-300'}">
                  <i class="fas ${ic} block text-lg mb-1 ${d.calStyle===v?'text-blue-600':'text-slate-400'}"></i>
                  <p class="text-[11px] font-bold ${d.calStyle===v?'text-blue-700':'text-slate-500'}">${l}</p>
                </button>`).join('')}
            </div>
            <input type="hidden" id="ds-calStyle" value="${d.calStyle}">
          </div>

          <!-- Step Indicator Style -->
          <div>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Step Indicator</p>
            <div class="grid grid-cols-3 gap-2">
              ${[['dots','Dots','fa-ellipsis-h'],['numbers','Numbers','fa-list-ol'],['bar','Bar','fa-grip-lines']].map(([v,l,ic])=>`
                <button onclick="document.getElementById('ds-stepStyle').value='${v}';BK.dsApply()"
                  class="rounded-xl border-2 p-3 transition-all ${d.stepStyle===v?'border-blue-600 bg-blue-50':'border-slate-200 hover:border-slate-300'}">
                  <i class="fas ${ic} block text-lg mb-1 ${d.stepStyle===v?'text-blue-600':'text-slate-400'}"></i>
                  <p class="text-[11px] font-bold ${d.stepStyle===v?'text-blue-700':'text-slate-500'}">${l}</p>
                </button>`).join('')}
            </div>
            <input type="hidden" id="ds-stepStyle" value="${d.stepStyle}">
          </div>

          <!-- Layout -->
          <div class="space-y-3">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Layout & Branding</p>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Page Width</label>
              <select id="ds-maxWidth" class="field text-sm" onchange="BK.dsApply()">
                ${[['36rem','Narrow (576px)'],['42rem','Default (672px)'],['48rem','Wide (768px)'],['56rem','Extra Wide (896px)']].map(([v,l])=>`<option value="${v}" ${d.maxWidth===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Business Name</label>
              <input type="text" id="ds-bizName" class="field text-sm" placeholder="Your Business Name" value="${esc(d.bizName||state.settings.business_name||'')}" oninput="BK.dsApply()">
            </div>
          </div>

          <!-- ── CONTENT: Hero ── -->
          <div class="space-y-3 border-t border-slate-100 pt-5">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <i class="fas fa-image text-blue-400"></i> Hero Banner
            </p>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Headline</label>
              <input type="text" id="ds-hero-title" class="field text-sm" placeholder="Book an Appointment"
                value="${esc(state.settings.hero_title||'Book an Appointment')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Subheading</label>
              <textarea id="ds-hero-subtitle" class="field text-sm resize-none" rows="2"
                placeholder="Short description shown below headline"
                oninput="BK.dsContentSave()">${esc(state.settings.hero_subtitle||'')}</textarea>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Badge Text</label>
              <input type="text" id="ds-hero-badge" class="field text-sm" placeholder="Accepting New Appointments"
                value="${esc(state.settings.hero_badge||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Background Image URL</label>
              <input type="url" id="ds-hero-image" class="field text-sm" placeholder="https://…/hero.jpg"
                value="${esc(state.settings.hero_image_url||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Hero Color (if no image)</label>
              <input type="color" id="ds-heroBg" value="${state.settings.hero_bg_color||'#1e3a8a'}"
                class="field text-sm h-9 p-0.5 cursor-pointer"
                onchange="BK.dsContentSave()">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">2nd CTA Label</label>
                <input type="text" id="ds-hero-cta2-label" class="field text-sm" placeholder="Learn More"
                  value="${esc(state.settings.hero_cta2_label||'')}"
                  oninput="BK.dsContentSave()">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">2nd CTA URL</label>
                <input type="url" id="ds-hero-cta2-url" class="field text-sm" placeholder="https://…"
                  value="${esc(state.settings.hero_cta2_url||'')}"
                  oninput="BK.dsContentSave()">
              </div>
            </div>
          </div>

          <!-- ── CONTENT: Nav Links ── -->
          <div class="space-y-3 border-t border-slate-100 pt-5">
            <div class="flex items-center justify-between">
              <p class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <i class="fas fa-link text-blue-400"></i> Header Nav Links
              </p>
              <button onclick="BK.dsAddNavLink()" type="button" class="text-xs text-blue-600 hover:underline font-semibold">+ Add</button>
            </div>
            <p class="text-[10px] text-slate-400">Links shown in the top navigation bar (desktop only)</p>
            <div id="ds-nav-links-list" class="space-y-2">
              ${(function(){
                try {
                  const links = JSON.parse(state.settings.nav_links||'[]');
                  return links.map((l,i) => dsNavLinkRow(l,i)).join('');
                } catch(e){ return ''; }
              })()}
            </div>
          </div>

          <!-- ── CONTENT: Promo Banners ── -->
          <div class="space-y-3 border-t border-slate-100 pt-5">
            <div class="flex items-center justify-between">
              <p class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <i class="fas fa-ad text-blue-400"></i> Promo Banners
              </p>
              <button onclick="BK.dsAddBanner()" type="button" class="text-xs text-blue-600 hover:underline font-semibold">+ Add</button>
            </div>
            <p class="text-[10px] text-slate-400">Clickable image banners shown below the hero</p>
            <div id="ds-banners-list" class="space-y-3">
              ${(function(){
                try {
                  const banners = JSON.parse(state.settings.promo_banners||'[]');
                  return banners.map((b,i) => dsBannerRow(b,i)).join('');
                } catch(e){ return ''; }
              })()}
            </div>
          </div>

          <!-- ── CONTENT: Footer ── -->
          <div class="space-y-3 border-t border-slate-100 pt-5">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <i class="fas fa-store text-blue-400"></i> Footer Info
            </p>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Address</label>
              <input type="text" id="ds-footer-address" class="field text-sm" placeholder="123 Main St, City"
                value="${esc(state.settings.footer_address||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Hours Text</label>
              <input type="text" id="ds-footer-hours" class="field text-sm" placeholder="Mon–Fri 9am–6pm"
                value="${esc(state.settings.footer_hours||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
              <input type="text" id="ds-footer-phone" class="field text-sm" placeholder="+1 (555) 000-0000"
                value="${esc(state.settings.footer_phone||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Home URL (back button on success)</label>
              <input type="url" id="ds-home-url" class="field text-sm" placeholder="https://yoursite.com"
                value="${esc(state.settings.home_url||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div class="flex items-center justify-between">
              <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Footer Links</p>
              <button onclick="BK.dsAddFooterLink()" type="button" class="text-xs text-blue-600 hover:underline font-semibold">+ Add</button>
            </div>
            <div id="ds-footer-links-list" class="space-y-2">
              ${(function(){
                try {
                  const links = JSON.parse(state.settings.footer_links||'[]');
                  return links.map((l,i) => dsFooterLinkRow(l,i)).join('');
                } catch(e){ return ''; }
              })()}
            </div>
          </div>

          <!-- ── CONTENT: About / Intro Section ── -->
          <div class="space-y-3 border-t border-slate-100 pt-5">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <i class="fas fa-info-circle text-blue-400"></i> About / Intro Section
            </p>
            <p class="text-[10px] text-slate-400">Shown between the hero banner and the booking form. Great for explaining your business and services.</p>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Section Title</label>
              <input type="text" id="ds-about-title" class="field text-sm" placeholder="About Us / Why Choose Us"
                value="${esc(state.settings.about_title||'')}"
                oninput="BK.dsContentSave()">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Body Text</label>
              <textarea id="ds-about-body" class="field text-sm resize-none" rows="4"
                placeholder="Introduce your business, what you specialize in, your experience, and what makes you different…"
                oninput="BK.dsContentSave()">${esc(state.settings.about_body||'')}</textarea>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-semibold text-slate-500">Bullet Highlights</label>
                <button onclick="BK.dsAddHighlight()" type="button" class="text-xs text-blue-600 hover:underline font-semibold">+ Add</button>
              </div>
              <p class="text-[10px] text-slate-400 mb-2">Short bullet points shown below the body text (e.g. "Licensed & Insured", "5 years experience")</p>
              <div id="ds-highlights-list" class="space-y-2">
                ${(function(){
                  try {
                    const hl = JSON.parse(state.settings.about_highlights||'[]');
                    return hl.map((h,i) => `<div class="flex gap-2 items-center" data-highlight="${i}">
                      <input type="text" value="${esc(h)}" placeholder="e.g. Licensed & Insured" class="field text-xs flex-1" data-hl-text="${i}" oninput="BK.dsContentSave()">
                      <button onclick="this.closest('[data-highlight]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
                    </div>`).join('');
                  } catch(e){ return ''; }
                })()}
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-semibold text-slate-500">Gallery Images</label>
                <button onclick="BK.dsAddGalleryImage()" type="button" class="text-xs text-blue-600 hover:underline font-semibold">+ Add</button>
              </div>
              <p class="text-[10px] text-slate-400 mb-2">Optional photo grid shown alongside the about text (square or portrait images work best)</p>
              <div id="ds-gallery-list" class="space-y-2">
                ${(function(){
                  try {
                    const gallery = JSON.parse(state.settings.about_gallery||'[]');
                    return gallery.map((g,i) => `<div class="flex gap-2 items-center" data-gallery="${i}">
                      <input type="url" value="${esc(g.url||'')}" placeholder="https://… image URL" class="field text-xs flex-1" data-gal-url="${i}" oninput="BK.dsContentSave()">
                      <input type="text" value="${esc(g.alt||'')}" placeholder="Alt text" class="field text-xs w-24" data-gal-alt="${i}" oninput="BK.dsContentSave()">
                      <button onclick="this.closest('[data-gallery]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
                    </div>`).join('');
                  } catch(e){ return ''; }
                })()}
              </div>
            </div>
          </div>

          <!-- ── SERVICE FIELDS: Image & Icon ── -->
          <div class="space-y-3 border-t border-slate-100 pt-5">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <i class="fas fa-concierge-bell text-blue-400"></i> Service Card Images & Icons
            </p>
            <p class="text-[10px] text-slate-400 leading-relaxed">Go to the <strong>Services</strong> tab and edit any service to set its image, icon, badge, description, and more.</p>
            <button onclick="BK.switchTab('services')" type="button" class="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
              <i class="fas fa-arrow-right text-[10px]"></i> Go to Services →
            </button>
          </div>

        </div>
      </div>

      <!-- Right Panel: Live Design Preview -->
      <div class="flex-1 flex flex-col bg-slate-100 overflow-hidden">
        <div class="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <span class="text-xs font-bold text-slate-600 flex items-center gap-2"><i class="fas fa-eye text-blue-400"></i> Live Design Preview</span>
          <a id="ds-open-tab" href="${esc(bookUrl)||'#'}" target="_blank" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm ${bookUrl?'':'opacity-40 pointer-events-none'}">
            <i class="fas fa-external-link-alt text-xs"></i> Open Booking Page
          </a>
        </div>
        <div class="flex-1 overflow-y-auto p-6 space-y-5">

          <!-- Live colour swatch preview -->
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="ds-live-preview">
            <!-- Mini hero -->
            <div class="p-6 flex items-end gap-4" id="ds-prev-hero" style="background:linear-gradient(135deg,${dsDesign.primary||'#1e3a8a'},${dsDesign.primary||'#2563eb'});min-height:120px">
              <div>
                <div class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-2 text-xs font-semibold" style="background:rgba(255,255,255,.15);color:#fff">
                  <span style="width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block"></span>
                  Accepting Appointments
                </div>
                <div class="text-xl font-extrabold text-white mb-1" id="ds-prev-title" style="font-family:'${dsDesign.fontHeading||'Plus Jakarta Sans'}',sans-serif">${esc(state.settings.hero_title||state.settings.business_name||'Book an Appointment')}</div>
                <div class="text-white/70 text-xs" id="ds-prev-subtitle" style="font-family:'${dsDesign.fontBody||'Plus Jakarta Sans'}',sans-serif">${esc(state.settings.hero_subtitle||'Schedule your visit in minutes')}</div>
              </div>
            </div>
            <!-- Mini service cards -->
            <div class="p-4" id="ds-prev-body" style="background:${dsDesign.bg||'#f8fafc'}">
              <p class="text-[10px] font-bold uppercase tracking-widest mb-3" style="color:${dsDesign.textMuted||'#64748b'}">Services</p>
              <div class="grid grid-cols-2 gap-2">
                ${state.services.slice(0,4).map(sv=>`
                  <div class="ds-mini-card rounded-xl p-3 border-2" style="background:${dsDesign.surface||'#fff'};border-color:${dsDesign.border||'#e2e8f0'};border-radius:${dsDesign.cardRadius||'20px'}">
                    <div class="ds-mini-card-icon w-8 h-8 rounded-lg mb-2 flex items-center justify-center text-white text-sm font-bold" style="background:${sv.color||dsDesign.primary||'#2563eb'}">${(sv.name||'?')[0]}</div>
                    <p class="ds-mini-card-name text-xs font-bold truncate" style="color:${dsDesign.text||'#0f172a'};font-family:'${dsDesign.fontBody||'Plus Jakarta Sans'}',sans-serif">${esc(sv.name)}</p>
                    <p class="ds-mini-card-sub text-[10px] mt-0.5" style="color:${dsDesign.textMuted||'#64748b'}">${sv.duration}min</p>
                  </div>`).join('')}
                ${state.services.length === 0 ? `<div class="col-span-2 text-center py-4 text-xs" style="color:${dsDesign.textMuted||'#94a3b8'}">Add services to preview cards</div>` : ''}
              </div>
              <!-- Mini button -->
              <div class="mt-4">
                <div id="ds-prev-btn" class="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white" style="background:${dsDesign.primary||'#2563eb'};border-radius:${dsDesign.btnRadius||'12px'};font-family:'${dsDesign.fontBody||'Plus Jakarta Sans'}',sans-serif">
                  <i class="fas fa-calendar-check text-xs"></i> Continue
                </div>
              </div>
            </div>
          </div>

          <!-- Colour palette display -->
          <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Active Palette</p>
            <div class="flex gap-2 flex-wrap" id="ds-palette-swatches">
              ${['primary','accent','bg','surface','text'].map(k => `
                <div class="flex flex-col items-center gap-1">
                  <div class="w-10 h-10 rounded-xl border border-slate-200 shadow-sm" id="ds-swatch-${k}" style="background:${dsDesign[k]||'#ccc'}"></div>
                  <span class="text-[9px] text-slate-400 font-semibold capitalize">${k}</span>
                </div>`).join('')}
            </div>
          </div>

          <!-- URL & export -->
          <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Deployment</p>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Public Booking Page URL</label>
              <div class="flex gap-2">
                <input type="text" id="ds-bookUrl" class="field text-xs flex-1" placeholder="https://yoursite.com/book.html" value="${esc(bookUrl)}"
                  oninput="document.getElementById('ds-open-tab').href=this.value||'#'">
              </div>
              <p class="text-[10px] text-slate-400 mt-1">Paste the URL where your book.html is hosted, then click "Open Booking Page" above to view it live.</p>
            </div>
            <button onclick="BK.dsExport()" class="btn-primary w-full text-xs !py-2.5 shadow-sm">
              <i class="fas fa-download mr-1"></i> Download Deployable book.html
            </button>
            <p class="text-[10px] text-slate-400 text-center">Design tokens baked in — upload to any web host</p>
          </div>

        </div>
      </div>
    </div>`;
  }

  function colorRow(label, key, val) {
    return `<div class="flex items-center justify-between gap-3">
      <label class="text-xs font-semibold text-slate-600 flex-1">${label}</label>
      <div class="flex items-center gap-2">
        <input type="color" id="ds-${key}" value="${val||'#000000'}"
          class="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5 flex-shrink-0"
          oninput="document.getElementById('ds-${key}-hex').value=this.value;BK.dsApply()"
          onchange="BK.dsApply()">
        <input type="text" id="ds-${key}-hex" value="${val||'#000000'}"
          class="field text-xs w-24 font-mono py-1.5"
          oninput="if(this.value.match(/^#[0-9a-fA-F]{6}$/)){document.getElementById('ds-${key}').value=this.value;BK.dsApply()}"
          maxlength="7">
      </div>
    </div>`;
  }

  function attachDesignerEvents() {
    // No iframe anymore — inline preview updates via dsApply()
    // Still call apply once to sync the preview panel on first load
    setTimeout(() => dsApply(), 50);
  }

  function dsPostToIframe(design) {
    // If the user has their book.html open in another tab and it's same-origin,
    // this will still work. No-op if no iframe present.
    const iframe = document.getElementById('ds-preview-iframe');
    if (!iframe) return;
    try { iframe.contentWindow.postMessage({ type: 'BK_DESIGN', design }, '*'); } catch(e) {}
  }

  function dsReadControls() {
    const g = id => document.getElementById(id)?.value || '';
    return {
      primary:          g('ds-primary'),
      accent:           g('ds-accent'),
      bg:               g('ds-bg'),
      surface:          g('ds-surface'),
      border:           g('ds-border'),
      text:             g('ds-text'),
      headerBg:         g('ds-headerBg'),
      fontBody:         g('ds-fontBody'),
      fontHeading:      g('ds-fontHeading'),
      cardRadius:       g('ds-cardRadius'),
      btnRadius:        g('ds-btnRadius'),
      cardShadowPreset: g('ds-cardShadowPreset'),
      calStyle:         g('ds-calStyle'),
      stepStyle:        g('ds-stepStyle'),
      maxWidth:         g('ds-maxWidth'),
      bizName:          g('ds-bizName'),
    };
  }

  function dsApply() {
    const vals = dsReadControls();
    dsDesign = dsMerge(dsDesign, vals);
    dsPostToIframe(dsDesign);

    // Inject Google Fonts into admin head so font previews actually render
    if (dsDesign.fontBody || dsDesign.fontHeading) {
      const families = [dsDesign.fontBody, dsDesign.fontHeading]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      const url = 'https://fonts.googleapis.com/css2?' +
        families.map(f => 'family=' + encodeURIComponent(f).replace(/%20/g,'+') + ':wght@400;500;600;700;800').join('&') +
        '&display=swap';
      let linkEl = document.getElementById('ds-admin-font-link');
      if (!linkEl) {
        linkEl = document.createElement('link');
        linkEl.id  = 'ds-admin-font-link';
        linkEl.rel = 'stylesheet';
        document.head.appendChild(linkEl);
      }
      linkEl.href = url;  // always set — no comparison needed
    }

    // Update shadow button highlights
    ['flat','soft','medium','heavy'].forEach(v => {
      const btn = document.getElementById('ds-shadow-' + v);
      if (!btn) return;
      const active = dsDesign.cardShadowPreset === v;
      btn.className = btn.className.replace(/border-blue-600 bg-blue-50 text-blue-700|border-slate-200 text-slate-500 hover:border-slate-300/g,'');
      btn.className += active ? ' border-blue-600 bg-blue-50 text-blue-700' : ' border-slate-200 text-slate-500 hover:border-slate-300';
    });

    // Update Calendar Style button states
    ['classic','bubble','minimal'].forEach(v => {
      const btn = document.querySelector('[onclick*="ds-calStyle"][onclick*="' + v + '"]');
      if (!btn) return;
      const active = dsDesign.calStyle === v;
      btn.className = btn.className.replace(/border-blue-600 bg-blue-50|border-slate-200 hover:border-slate-300/g,'');
      btn.className += active ? ' border-blue-600 bg-blue-50' : ' border-slate-200 hover:border-slate-300';
      const icon = btn.querySelector('i');
      const label = btn.querySelector('p');
      if (icon)  { icon.className  = icon.className.replace(/text-blue-600|text-slate-400/g,'');  icon.className  += active ? ' text-blue-600' : ' text-slate-400'; }
      if (label) { label.className = label.className.replace(/text-blue-700|text-slate-500/g,''); label.className += active ? ' text-blue-700' : ' text-slate-500'; }
    });

    // Update Step Indicator button states
    ['dots','numbers','bar'].forEach(v => {
      const btn = document.querySelector('[onclick*="ds-stepStyle"][onclick*="' + v + '"]');
      if (!btn) return;
      const active = dsDesign.stepStyle === v;
      btn.className = btn.className.replace(/border-blue-600 bg-blue-50|border-slate-200 hover:border-slate-300/g,'');
      btn.className += active ? ' border-blue-600 bg-blue-50' : ' border-slate-200 hover:border-slate-300';
      const icon = btn.querySelector('i');
      const label = btn.querySelector('p');
      if (icon)  { icon.className  = icon.className.replace(/text-blue-600|text-slate-400/g,'');  icon.className  += active ? ' text-blue-600' : ' text-slate-400'; }
      if (label) { label.className = label.className.replace(/text-blue-700|text-slate-500/g,''); label.className += active ? ' text-blue-700' : ' text-slate-500'; }
    });

    // Update live inline preview
    dsUpdateInlinePreview(dsDesign);
  }

  function dsUpdateInlinePreview(d) {
    const bodyFont    = "'" + (d.fontBody    || 'Plus Jakarta Sans') + "', sans-serif";
    const headingFont = "'" + (d.fontHeading || d.fontBody || 'Plus Jakarta Sans') + "', sans-serif";

    // Hero gradient
    const hero = document.getElementById('ds-prev-hero');
    if (hero) hero.style.background = 'linear-gradient(135deg,' + (d.primary||'#1e3a8a') + ',' + (d.primary||'#2563eb') + ')';

    // Body background
    const body = document.getElementById('ds-prev-body');
    if (body) body.style.background = d.bg || '#f8fafc';

    // Business name
    const titleEl = document.getElementById('ds-prev-title');
    if (titleEl) {
      if (d.bizName) titleEl.textContent = d.bizName;
      titleEl.style.fontFamily = headingFont;
    }

    // Subtitle
    const subEl = document.getElementById('ds-prev-subtitle');
    if (subEl) subEl.style.fontFamily = bodyFont;

    // Palette swatches
    ['primary','accent','bg','surface','text'].forEach(k => {
      const sw = document.getElementById('ds-swatch-' + k);
      if (sw && d[k]) sw.style.background = d[k];
    });

    // Mini service cards
    document.querySelectorAll('#ds-prev-body .ds-mini-card').forEach(card => {
      card.style.background   = d.surface   || '#fff';
      card.style.borderColor  = d.border    || '#e2e8f0';
      card.style.borderRadius = d.cardRadius || '20px';
    });
    document.querySelectorAll('#ds-prev-body .ds-mini-card-name').forEach(el => {
      el.style.color       = d.text || '#0f172a';
      el.style.fontFamily  = bodyFont;
    });
    document.querySelectorAll('#ds-prev-body .ds-mini-card-sub').forEach(el => {
      el.style.color = d.textMuted || '#64748b';
    });
    document.querySelectorAll('#ds-prev-body .ds-mini-card-icon').forEach(el => {
      el.style.background = d.primary || '#2563eb';
    });

    // Continue button
    const miniBtn = document.getElementById('ds-prev-btn');
    if (miniBtn) {
      miniBtn.style.background   = d.primary   || '#2563eb';
      miniBtn.style.borderRadius = d.btnRadius || '12px';
      miniBtn.style.fontFamily   = bodyFont;
    }

    // After fonts load, re-apply font-family so the browser actually switches
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (titleEl) titleEl.style.fontFamily = headingFont;
        if (subEl)   subEl.style.fontFamily   = bodyFont;
        if (miniBtn) miniBtn.style.fontFamily  = bodyFont;
        document.querySelectorAll('#ds-prev-body .ds-mini-card-name').forEach(el => {
          el.style.fontFamily = bodyFont;
        });
      });
    }
  }

// ═══════════════════════════════════════════════════════════════
//  UNIFIED SAVE: Design tokens + Content → ONE DB write
// ═══════════════════════════════════════════════════════════════

async function dsSaveAll() {
  // Cancel any pending debounced auto-save
  clearTimeout(_contentSaveTimer);

  // 1. Collect design tokens
  const vals = dsReadControls();
  dsDesign = dsMerge(dsDesign, vals);
  const bookUrl = document.getElementById('ds-bookUrl')?.value || '';

  // 2. Collect content fields
  const navLinks = [];
  document.querySelectorAll('[data-nav-link]').forEach(row => {
    const label  = row.querySelector('[data-nav-label]')?.value || '';
    const url    = row.querySelector('[data-nav-url]')?.value   || '#';
    const newTab = row.querySelector('[data-nav-newtab]')?.checked || false;
    if (label) navLinks.push({ label, url, new_tab: newTab });
  });

  const footerLinks = [];
  document.querySelectorAll('[data-footer-link]').forEach(row => {
    const label  = row.querySelector('[data-fl-label]')?.value  || '';
    const url    = row.querySelector('[data-fl-url]')?.value    || '#';
    const newTab = row.querySelector('[data-fl-newtab]')?.checked || false;
    if (label) footerLinks.push({ label, url, new_tab: newTab });
  });

  const banners = [];
  document.querySelectorAll('[data-banner]').forEach(row => {
    const title    = row.querySelector('[data-bn-title]')?.value    || '';
    const subtitle = row.querySelector('[data-bn-subtitle]')?.value || '';
    const image    = row.querySelector('[data-bn-image]')?.value    || '';
    const badge    = row.querySelector('[data-bn-badge]')?.value    || '';
    const url      = row.querySelector('[data-bn-url]')?.value      || '#';
    const height   = parseInt(row.querySelector('[data-bn-height]')?.value) || 180;
    const newTab   = row.querySelector('[data-bn-newtab]')?.checked || false;
    banners.push({ title, subtitle, image, badge, url, height, new_tab: newTab });
  });

  // About section
  const highlights = [];
  document.querySelectorAll('[data-highlight]').forEach(row => {
    const text = row.querySelector('[data-hl-text]')?.value || '';
    if (text.trim()) highlights.push(text.trim());
  });
  const gallery = [];
  document.querySelectorAll('[data-gallery]').forEach(row => {
    const url = row.querySelector('[data-gal-url]')?.value || '';
    const alt = row.querySelector('[data-gal-alt]')?.value || '';
    if (url.trim()) gallery.push({ url: url.trim(), alt });
  });

  const g = id => document.getElementById(id)?.value || '';

  // 3. Build all key-value pairs to persist
  const pairs = [
    ['booking_page_design', JSON.stringify(dsDesign)],
    ['hero_title',          g('ds-hero-title')],
    ['hero_subtitle',       g('ds-hero-subtitle')],
    ['hero_badge',          g('ds-hero-badge')],
    ['hero_image_url',      g('ds-hero-image')],
    ['hero_bg_color',       g('ds-heroBg')],
    ['hero_cta2_label',     g('ds-hero-cta2-label')],
    ['hero_cta2_url',       g('ds-hero-cta2-url')],
    ['footer_address',      g('ds-footer-address')],
    ['footer_hours',        g('ds-footer-hours')],
    ['footer_phone',        g('ds-footer-phone')],
    ['home_url',            g('ds-home-url')],
    ['nav_links',           JSON.stringify(navLinks)],
    ['footer_links',        JSON.stringify(footerLinks)],
    ['promo_banners',       JSON.stringify(banners)],
    ['about_title',         g('ds-about-title')],
    ['about_body',          g('ds-about-body')],
    ['about_highlights',    JSON.stringify(highlights)],
    ['about_gallery',       JSON.stringify(gallery)],
  ];
  if (bookUrl) pairs.push(['book_page_url', bookUrl]);

  try {
    const D = db();
    await dsUpsertSettings(D, pairs);
    // Update local state
    pairs.forEach(([k, v]) => { state.settings[k] = v; });
    toast('Settings saved!', 'success');
  } catch(e) {
    console.error('Save error:', e);
    toast('Save failed: ' + e.message, 'error');
  }
}

// Silent version for auto-save debounce
async function dsSaveAll_silent() {
  const vals = dsReadControls();
  dsDesign = dsMerge(dsDesign, vals);
  const bookUrl = document.getElementById('ds-bookUrl')?.value || '';

  const navLinks = [];
  document.querySelectorAll('[data-nav-link]').forEach(row => {
    const label  = row.querySelector('[data-nav-label]')?.value || '';
    const url    = row.querySelector('[data-nav-url]')?.value   || '#';
    const newTab = row.querySelector('[data-nav-newtab]')?.checked || false;
    if (label) navLinks.push({ label, url, new_tab: newTab });
  });
  
  const footerLinks = [];
  document.querySelectorAll('[data-footer-link]').forEach(row => {
    const label  = row.querySelector('[data-fl-label]')?.value  || '';
    const url    = row.querySelector('[data-fl-url]')?.value    || '#';
    const newTab = row.querySelector('[data-fl-newtab]')?.checked || false;
    if (label) footerLinks.push({ label, url, new_tab: newTab });
  });
  
  const banners = [];
  document.querySelectorAll('[data-banner]').forEach(row => {
    const title    = row.querySelector('[data-bn-title]')?.value    || '';
    const subtitle = row.querySelector('[data-bn-subtitle]')?.value || '';
    const image    = row.querySelector('[data-bn-image]')?.value    || '';
    const badge    = row.querySelector('[data-bn-badge]')?.value    || '';
    const url      = row.querySelector('[data-bn-url]')?.value      || '#';
    const height   = parseInt(row.querySelector('[data-bn-height]')?.value) || 180;
    const newTab   = row.querySelector('[data-bn-newtab]')?.checked || false;
    banners.push({ title, subtitle, image, badge, url, height, new_tab: newTab });
  });

  const highlights = [];
  document.querySelectorAll('[data-highlight]').forEach(row => {
    const text = row.querySelector('[data-hl-text]')?.value || '';
    if (text.trim()) highlights.push(text.trim());
  });
  const gallery = [];
  document.querySelectorAll('[data-gallery]').forEach(row => {
    const url = row.querySelector('[data-gal-url]')?.value || '';
    const alt = row.querySelector('[data-gal-alt]')?.value || '';
    if (url.trim()) gallery.push({ url: url.trim(), alt });
  });
  
  const g = id => document.getElementById(id)?.value || '';
  const pairs = [
    ['booking_page_design', JSON.stringify(dsDesign)],
    ['hero_title',          g('ds-hero-title')],
    ['hero_subtitle',       g('ds-hero-subtitle')],
    ['hero_badge',          g('ds-hero-badge')],
    ['hero_image_url',      g('ds-hero-image')],
    ['hero_bg_color',       g('ds-heroBg')],
    ['hero_cta2_label',     g('ds-hero-cta2-label')],
    ['hero_cta2_url',       g('ds-hero-cta2-url')],
    ['footer_address',      g('ds-footer-address')],
    ['footer_hours',        g('ds-footer-hours')],
    ['footer_phone',        g('ds-footer-phone')],
    ['home_url',            g('ds-home-url')],
    ['nav_links',           JSON.stringify(navLinks)],
    ['footer_links',        JSON.stringify(footerLinks)],
    ['promo_banners',       JSON.stringify(banners)],
    ['about_title',         g('ds-about-title')],
    ['about_body',          g('ds-about-body')],
    ['about_highlights',    JSON.stringify(highlights)],
    ['about_gallery',       JSON.stringify(gallery)],
  ];
  if (bookUrl) pairs.push(['book_page_url', bookUrl]);
  
  const D = db();
  await dsUpsertSettings(D, pairs);
  pairs.forEach(([k, v]) => { state.settings[k] = v; });
}

// ── Robust upsert helper ─────────────────────────────────────
// Serialized: only one save can run at a time to prevent duplicate-key
// errors from concurrent create attempts.
let _upsertInFlight = false;
async function dsUpsertSettings(D, pairs) {
  // Wait for any in-flight save to finish
  while (_upsertInFlight) {
    await new Promise(r => setTimeout(r, 50));
  }
  _upsertInFlight = true;
  try {
    // Fetch current rows fresh each time so we always have the latest IDs
    const existing = await D.list('booking_settings', {});
    const rowMap = {};
    (existing || []).forEach(r => { rowMap[r.key] = r.id; });

    // Run sequentially (not parallel) to avoid race conditions
    for (const [k, v] of pairs) {
      if (rowMap[k] !== undefined) {
        await D.update('booking_settings', rowMap[k], { value: v });
      } else {
        try {
          await D.create('booking_settings', { key: k, value: v });
        } catch(e) {
          // Row was created by a concurrent save between our list and now — fetch and update
          if (e.message && e.message.includes('duplicate')) {
            const fresh = await D.list('booking_settings', {});
            const row = (fresh || []).find(r => r.key === k);
            if (row) await D.update('booking_settings', row.id, { value: v });
          } else {
            throw e;
          }
        }
      }
    }
  } finally {
    _upsertInFlight = false;
  }
}

  function dsReset() {
    if (!confirm('Reset design tokens to defaults? (Content fields like hero text and about section will not be affected)')) return;
    dsDesign = Object.assign({}, DS_DEFAULTS);
    // Re-use dsPickPreset logic by directly setting DOM values
    const colorKeys = ['primary','accent','bg','surface','border','text','headerBg'];
    colorKeys.forEach(k => {
      const val = DS_DEFAULTS[k] || '';
      const picker = document.getElementById('ds-' + k);
      const hexEl  = document.getElementById('ds-' + k + '-hex');
      if (picker) picker.value = val;
      if (hexEl)  hexEl.value  = val;
    });
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setEl('ds-fontBody',         DS_DEFAULTS.fontBody);
    setEl('ds-fontHeading',      DS_DEFAULTS.fontHeading);
    setEl('ds-cardRadius',       DS_DEFAULTS.cardRadius);
    setEl('ds-btnRadius',        DS_DEFAULTS.btnRadius);
    setEl('ds-maxWidth',         DS_DEFAULTS.maxWidth);
    setEl('ds-cardShadowPreset', DS_DEFAULTS.cardShadowPreset);
    setEl('ds-calStyle',         DS_DEFAULTS.calStyle);
    setEl('ds-stepStyle',        DS_DEFAULTS.stepStyle);
    dsApply();
    toast('Design reset to defaults', 'info');
  }

  function dsPickPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;
    dsDesign = dsMerge({}, { ...preset, _preset: key });

    // Apply to existing DOM controls — no re-render, no data loss
    const colorKeys = ['primary','accent','bg','surface','border','text','headerBg'];
    colorKeys.forEach(k => {
      const val = preset[k] || DS_DEFAULTS[k] || '';
      const picker = document.getElementById('ds-' + k);
      const hexEl  = document.getElementById('ds-' + k + '-hex');
      if (picker) picker.value = val;
      if (hexEl)  hexEl.value  = val;
    });
    const setEl = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    setEl('ds-fontBody',         preset.fontBody         || DS_DEFAULTS.fontBody);
    setEl('ds-fontHeading',      preset.fontHeading      || DS_DEFAULTS.fontHeading);
    setEl('ds-cardRadius',       preset.cardRadius       || DS_DEFAULTS.cardRadius);
    setEl('ds-btnRadius',        preset.btnRadius        || DS_DEFAULTS.btnRadius);
    setEl('ds-maxWidth',         preset.maxWidth         || DS_DEFAULTS.maxWidth);
    setEl('ds-cardShadowPreset', preset.cardShadowPreset || DS_DEFAULTS.cardShadowPreset);
    setEl('ds-calStyle',         preset.calStyle         || DS_DEFAULTS.calStyle);
    setEl('ds-stepStyle',        preset.stepStyle        || DS_DEFAULTS.stepStyle);

    // Highlight active preset button
    document.querySelectorAll('#ds-root button[onclick*="dsPickPreset"]').forEach(btn => {
      btn.classList.remove('border-blue-600', 'shadow-md');
      btn.classList.add('border-slate-200');
    });
    const activeBtn = document.querySelector('[onclick="BK.dsPickPreset(\'' + key + '\')"]');
    if (activeBtn) { activeBtn.classList.remove('border-slate-200'); activeBtn.classList.add('border-blue-600','shadow-md'); }

    dsApply();
    toast('Preset applied — click Save to keep it', 'info');
  }

  function dsUpdatePreview(url) {
    // Legacy — just update the open-tab button href
    const openBtn = document.getElementById('ds-open-tab');
    if (openBtn && url) openBtn.href = url;
  }

  function dsSetDevice(device) { /* no-op: iframe preview removed */ }

  function dsExport() {
    toast('Preparing download…', 'info');
    fetch('book.html')
      .then(r => r.text())
      .then(html => {
        // Inject design tokens as inline CSS custom properties
        const tokenCSS = dsDesignToCSS(dsDesign);
        // Replace the token style block content
        html = html.replace(
          /<style id="bk-design-tokens">[\s\S]*?<\/style>/,
          `<style id="bk-design-tokens">\n    :root {\n${tokenCSS}\n    }\n  </style>`
        );
        // Bake in font imports
        if (dsDesign.fontBody || dsDesign.fontHeading) {
          const families = [dsDesign.fontBody, dsDesign.fontHeading].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
          const importUrl = `https://fonts.googleapis.com/css2?${families.map(f=>'family='+encodeURIComponent(f)+':wght@400;500;600;700;800').join('&')}&display=swap`;
          html = html.replace(
            'href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans',
            `href="${importUrl}"`
          );
        }
        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'book.html';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('book.html downloaded — deploy to any web host!', 'success');
      })
      .catch(() => toast('Could not fetch book.html. Make sure it\'s in the same folder.', 'error'));
  }

  function dsDesignToCSS(d) {
    const lines = [];
    const shadow = { flat:'none', soft:'0 2px 16px rgba(0,0,0,.05)', medium:'0 4px 24px rgba(0,0,0,.08)', heavy:'0 8px 40px rgba(0,0,0,.14)' };
    const add = (k,v) => { if(v) lines.push(`      ${k}: ${v};`); };
    add('--bk-primary',        d.primary);
    add('--bk-primary-dark',   dsShade(d.primary, -15));
    add('--bk-primary-light',  dsRgba(d.primary, 0.08));
    add('--bk-accent',         d.accent);
    add('--bk-bg',             d.bg);
    add('--bk-surface',        d.surface);
    add('--bk-border',         d.border);
    add('--bk-text',           d.text);
    add('--bk-text-muted',     d.textMuted || '#64748b');
    add('--bk-header-bg',      d.headerBg);
    add('--bk-btn-radius',     d.btnRadius);
    add('--bk-card-radius',    d.cardRadius);
    add('--bk-card-shadow',    shadow[d.cardShadowPreset] || shadow.soft);
    add('--bk-font-body',      d.fontBody ? `'${d.fontBody}', sans-serif` : '');
    add('--bk-font-heading',   d.fontHeading ? `'${d.fontHeading}', sans-serif` : '');
    add('--bk-max-width',      d.maxWidth);
    return lines.join('\n');
  }

  function dsShade(hex, pct) {
    try {
      let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      r = Math.max(0,Math.min(255, r+Math.round(r*pct/100)));
      g = Math.max(0,Math.min(255, g+Math.round(g*pct/100)));
      b = Math.max(0,Math.min(255, b+Math.round(b*pct/100)));
      return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
    } catch(e) { return hex || '#000'; }
  }

  function dsRgba(hex, alpha) {
    try {
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    } catch(e) { return hex || 'rgba(0,0,0,0.08)'; }
  }

  // ── CONTENT MANAGEMENT ────────────────────────────────────────

  function dsNavLinkRow(l, i) {
    return `<div class="flex gap-2 items-center" data-nav-link="${i}">
      <input type="text" value="${esc(l.label)}" placeholder="Label" class="field text-xs flex-1" data-nav-label="${i}" oninput="BK.dsContentSave()">
      <input type="text" value="${esc(l.url)}" placeholder="URL" class="field text-xs flex-1" data-nav-url="${i}" oninput="BK.dsContentSave()">
      <label class="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
        <input type="checkbox" ${l.new_tab?'checked':''} data-nav-newtab="${i}" onchange="BK.dsContentSave()">new tab
      </label>
      <button onclick="this.closest('[data-nav-link]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
    </div>`;
  }

  function dsFooterLinkRow(l, i) {
    return `<div class="flex gap-2 items-center" data-footer-link="${i}">
      <input type="text" value="${esc(l.label)}" placeholder="Label" class="field text-xs flex-1" data-fl-label="${i}" oninput="BK.dsContentSave()">
      <input type="text" value="${esc(l.url)}" placeholder="URL" class="field text-xs flex-1" data-fl-url="${i}" oninput="BK.dsContentSave()">
      <label class="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
        <input type="checkbox" ${l.new_tab?'checked':''} data-fl-newtab="${i}" onchange="BK.dsContentSave()">new tab
      </label>
      <button onclick="this.closest('[data-footer-link]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times text-xs"></i></button>
    </div>`;
  }

  function dsBannerRow(b, i) {
    return `<div class="border border-slate-200 rounded-xl p-3 space-y-2 bg-white" data-banner="${i}">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-slate-600">Banner ${i+1}</span>
        <button onclick="this.closest('[data-banner]').remove();BK.dsContentSave()" class="text-red-400 hover:text-red-600"><i class="fas fa-times text-xs"></i></button>
      </div>
      <input type="text" value="${esc(b.title||'')}" placeholder="Title" class="field text-xs" data-bn-title="${i}" oninput="BK.dsContentSave()">
      <input type="text" value="${esc(b.subtitle||'')}" placeholder="Subtitle (optional)" class="field text-xs" data-bn-subtitle="${i}" oninput="BK.dsContentSave()">
      <input type="url" value="${esc(b.image||'')}" placeholder="Image URL" class="field text-xs" data-bn-image="${i}" oninput="BK.dsContentSave()">
      <div class="grid grid-cols-2 gap-2">
        <input type="text" value="${esc(b.badge||'')}" placeholder="Badge label" class="field text-xs" data-bn-badge="${i}" oninput="BK.dsContentSave()">
        <input type="url" value="${esc(b.url||'')}" placeholder="Link URL" class="field text-xs" data-bn-url="${i}" oninput="BK.dsContentSave()">
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="text-[10px] text-slate-400">Height (px)</label>
          <input type="number" value="${b.height||180}" class="field text-xs" data-bn-height="${i}" oninput="BK.dsContentSave()"></div>
        <div class="flex items-end pb-0.5">
          <label class="text-[10px] text-slate-400 flex items-center gap-1">
            <input type="checkbox" ${b.new_tab?'checked':''} data-bn-newtab="${i}" onchange="BK.dsContentSave()"> Open in new tab
          </label>
        </div>
      </div>
    </div>`;
  }

  function dsAddNavLink() {
    const list = document.getElementById('ds-nav-links-list');
    if (!list) return;
    const i = list.children.length;
    const div = document.createElement('div');
    div.innerHTML = dsNavLinkRow({ label:'', url:'#', new_tab:false }, i);
    list.appendChild(div.firstElementChild);
  }

  function dsAddFooterLink() {
    const list = document.getElementById('ds-footer-links-list');
    if (!list) return;
    const i = list.children.length;
    const div = document.createElement('div');
    div.innerHTML = dsFooterLinkRow({ label:'', url:'#', new_tab:false }, i);
    list.appendChild(div.firstElementChild);
  }

  function dsAddBanner() {
    const list = document.getElementById('ds-banners-list');
    if (!list) return;
    const i = list.children.length;
    const div = document.createElement('div');
    div.innerHTML = dsBannerRow({ title:'', image:'', url:'#', height:180 }, i);
    list.appendChild(div.firstElementChild);
  }

  // Debounce timer — fires silently 1.2s after last keystroke in any content field
  let _contentSaveTimer = null;

  // Called on every keystroke/change — queues a silent background save
  function dsContentSave() {
    clearTimeout(_contentSaveTimer);
    _contentSaveTimer = setTimeout(async () => {
      try { await dsSaveAll_silent(); } catch(e) { /* silent — don't bother user */ }
    }, 1200);
  }

  // Backward-compat alias — Save button now calls dsSaveAll() directly
  async function dsContentSaveNow() { return dsSaveAll(); }

})();
