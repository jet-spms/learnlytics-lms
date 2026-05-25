/**
 * ui.js — DOM rendering utilities
 *
 * v3 changes:
 *  CHANGE 1: showBulkUploadModal() REMOVED; "Bulk Upload" button removed from dashboard
 *  CHANGE 2: renderBatchDashboard() gets "📅 Attendance" button instead of bulk upload
 *  CHANGE 3: renderStudentProfile() passes context (holidays) to Calc functions
 *  CHANGE 4: _renderExamTab() completely rewritten — 3-module tabs, each with 7 parameters;
 *            module cleared only when ALL appeared parameters are cleared
 *  CHANGE 5: renderProfileTab() gets "mock-interview" tab
 *  CHANGE 6: renderStudentProfile() adds Mock Interview tab
 *  CHANGE 7: renderAttendanceDashboard() — new batch-level attendance view
 *  CHANGE 8: Presentation data references updated (single source of truth)
 */

const UI = (() => {

  // ─── Aliases from extracted modules (ui-icons.js, ui-helpers.js) ──────────
  const _FI    = UIIcons._FI;
  const _ICONS = UIIcons._ICONS;
  const { _localDateStr, escHtml, scoreBar, piColor, fmt, fmtDate, capitalize,
          _makeAvatarBg, _makeInitials, _avatarHTML } = UIHelpers;

  // ─── Aliases from ui-calendar.js, ui-timetable.js (Phase 4A) ─────────────
  const { renderCalendar, showCalendarEventModal, _calExpandEvents, _calFmtTime } = UICalendar;
  const { renderTimetable, showTimetableClassModal } = UITimetable;

  // ─── Aliases from ui-mock.js (Phase 4A) ──────────────────────────────────
  const { MOCK_PARAMS_CONFIG, getMockParamsConfig,
          renderMockManual, renderMockAI, renderMockHistory,
          mockManualSlideOver, mockAISlideOver } = UIMock;

  // ─── Aliases from ui-student-portal.js (Phase 4B) ────────────────────────
  const { renderStudentTopbar, renderStudentProfileDrawerContent, renderStudentSidebar,
          renderStudentDashboard, renderStudentAttendance, renderStudentTestScores,
          renderStudentMockHistory, renderStudentPlacement, renderStudentSettings,
          showCreateStudentLoginModal } = UIStudentPortal;

  // ─── Aliases from ui-nav-sidebar.js (Phase 4C) ───────────────────────────
  const { setNavSection, setNavMode, toggleNavGroup,
          renderNavSidebar, renderSidebar, toggleSidebar,
          openNavFlyout, closeNavFlyout } = UINavSidebar;

  // ─── Local helpers (depend on _ICONS — not extracted) ─────────────────────

  function el(tag, cls, html = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function alertIcons(alerts) {
    if (!alerts.length) return '';
    return `<span class="alert-dot" title="${alerts.map(a => a.message).join('\n')}">${_ICONS.flag} ${alerts.length}</span>`;
  }

  /** Get context object (holidays + scoringConfig) for a batch */
  function _batchContext(batchId) {
    const batch = Storage.getBatch(batchId);
    return { holidays: batch?.holidays || [], scoringConfig: ScoringConfig.load() };
  }

  // ─── Batch Dashboard ───────────────────────────────────────────────────────

  /**
   * CHANGE 1 + 2: Removed Bulk Upload button; added Attendance button.
   * Calc functions now receive context (holidays).
   */
  function renderBatchDashboard(batch) {
    const main      = document.getElementById('main-content');
    const students  = batch.students || [];
    const context   = { holidays: batch.holidays || [], scoringConfig: ScoringConfig.load() };
    const stats     = Calc.batchStats(students, context);
    const ranked    = Calc.rankStudents(students, context);
    const sortState = { col: 'rank', dir: 'asc' };
    const isArchived = !!batch.archived;

    // P1: build extra batch meta line
    const metaParts = [];
    if (batch.batchCode) metaParts.push(`Code: <strong>${batch.batchCode}</strong>`);
    if (batch.startDate) metaParts.push(`Start: <strong>${fmtDate(batch.startDate)}</strong>`);
    if (batch.endDate)   metaParts.push(`End: <strong>${fmtDate(batch.endDate)}</strong>`);
    const statusLabel = {
      active: 'Active', upcoming: 'Upcoming',
      completed: 'Completed', archived: 'Archived'
    }[batch.status || 'active'] || batch.status;

    // P1: capacity display
    const capacityUsed = students.length;
    const capacityMax  = batch.capacity || 0;
    const capacityStat = capacityMax > 0
      ? statCard('Capacity', `${capacityUsed} / ${capacityMax}`, _ICONS.users,
          capacityUsed >= capacityMax ? 'bad' : capacityUsed >= capacityMax * 0.9 ? 'warn' : 'good')
      : statCard('Students', students.length, _ICONS.users, 'neutral');

    // P2: instructor panel
    const instructors    = batch.instructors || [];
    const primaries      = instructors.filter(i => i.role === 'primary');
    const assistants     = instructors.filter(i => i.role === 'assistant');
    const substitutes    = instructors.filter(i => i.role === 'substitute');
    const instrPanelHTML = _instrPanelHTML(primaries, assistants, substitutes, batch.substitutions || []);

    // Meeting link: resolve trainer-specific link for current user
    const _dashCu          = (typeof Storage !== 'undefined') ? Storage.getCurrentUser() : null;
    const _dashMeetingLink = _dashCu ? ((batch.meetingLinks || {})[_dashCu.id] || '') : '';

    main.innerHTML = `
      <div class="dash-page-header">
        <div class="dash-page-header__top">
          <div class="dash-page-header__title-block">
            <div class="dash-page-header__title-row">
              <h1 class="dash-page-title">${batch.name}</h1>
              <span class="batch-status-badge batch-status--${batch.status || 'active'}">${statusLabel}</span>
            </div>
            ${batch.description ? `<p class="dash-page-desc">${batch.description}</p>` : ''}
          </div>
          <div class="dash-page-header__actions">
            ${isArchived
              ? `<button class="btn btn-outline" id="btn-unarchive-batch">Unarchive</button>`
              : _dashMeetingLink
                ? `<button class="btn btn-primary dash-meeting-btn" id="btn-start-meeting">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="width:1rem;height:1rem"><path d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
                     Start Meeting
                   </button>
                   <button class="btn btn-ghost btn-sm dash-edit-link" id="btn-edit-batch" title="Edit batch settings">${_ICONS.pencil}</button>`
                : `<button class="btn btn-outline" id="btn-edit-batch">${_ICONS.pencil} Edit Batch</button>`
            }
          </div>
        </div>
        <div class="dash-page-header__meta">
          ${batch.batchCode ? `<span class="dash-meta-pill"><span class="dash-meta-key">Code</span><span class="dash-meta-val">${batch.batchCode}</span></span>` : ''}
          ${batch.startDate ? `<span class="dash-meta-pill"><span class="dash-meta-key">Start</span><span class="dash-meta-val">${fmtDate(batch.startDate)}</span></span>` : ''}
          ${batch.endDate   ? `<span class="dash-meta-pill"><span class="dash-meta-key">End</span><span class="dash-meta-val">${fmtDate(batch.endDate)}</span></span>` : ''}
          ${capacityMax > 0 ? `<span class="dash-meta-pill"><span class="dash-meta-key">Capacity</span><span class="dash-meta-val">${capacityUsed} / ${capacityMax}</span></span>` : ''}
        </div>
      </div>

      ${isArchived ? '<div class="archived-banner">This batch is archived and is in read-only mode.</div>' : ''}

      <div class="stats-grid">
        ${statCard('Avg Attendance',  fmt(stats.avgAttendance) + '%', _ICONS.calendar, stats.avgAttendance >= 75 ? 'good' : stats.avgAttendance >= 60 ? 'warn' : 'bad')}
        ${statCard('Avg Final Score', fmt(stats.avgFinalScore), _ICONS.chartBar, piColor(stats.avgFinalScore))}
        ${capacityStat}
        ${statCard('Red Flags',       stats.redFlags,                _ICONS.flag,  stats.redFlags > 0 ? 'bad' : 'good')}
      </div>

      ${students.length >= 3 ? topBottomRow(stats) : ''}

      <div class="card table-card">
        <div class="card-header table-card-header">
          <div class="card-header__left">
            <h2 class="card-title">Students</h2>
            <span class="table-count-badge">${students.length} enrolled</span>
          </div>
          <div class="card-header__right">
            <input type="text" class="search-input" id="student-search" placeholder="Search by name or ID…">
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="student-table">
            <thead>
              <tr>
                <th class="sortable" data-col="rank">#</th>
                <th class="sortable" data-col="name">Name</th>
                <th class="sortable" data-col="attendance">Attendance</th>
                <th class="sortable" data-col="academic">Academic</th>
                <th class="sortable" data-col="presentation">Presentation</th>
                <th class="sortable" data-col="finalScore">Final Score</th>
                <th>Category</th>
                <th>Alerts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="student-tbody"></tbody>
          </table>
          ${!students.length ? '<div class="empty-state">No students yet. Add your first student to get started.</div>' : ''}
        </div>
      </div>`;

    renderStudentTable(ranked, batch.id, context);
    bindTableSort(sortState, ranked, batch.id, context);
    bindStudentSearch(ranked, batch.id, context);
  }

  /** P2: Renders the instructor info panel card for the batch dashboard. */
  function _instrPanelHTML(primaries, assistants, substitutes, substitutions) {
    if (!primaries.length && !assistants.length && !substitutes.length) return '';

    const primaryItems = primaries.map(i => `
      <div class="instr-chip instr-chip--primary">
        ${_makeInitials(i.name) !== '?' ? `<span class="instr-avatar">${_makeInitials(i.name)}</span>` : ''}
        <span class="instr-name">${i.name}</span>
        <span class="instr-role-badge instr-role--primary">Primary</span>
      </div>`).join('');

    const assistantItems = assistants.map(i => `
      <div class="instr-chip instr-chip--assistant">
        <span class="instr-avatar instr-avatar--asst">${_makeInitials(i.name)}</span>
        <span class="instr-name">${i.name}</span>
        <span class="instr-role-badge instr-role--assistant">Assistant</span>
      </div>`).join('');

    const substituteItems = substitutes.map(i => {
      const subs = substitutions.filter(s => s.instructorId === i.id);
      const subDates = subs.map(s => `${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}`).join(', ');
      return `
        <div class="instr-chip instr-chip--substitute">
          <span class="instr-avatar instr-avatar--sub">${_makeInitials(i.name)}</span>
          <span class="instr-name">${i.name}</span>
          <span class="instr-role-badge instr-role--substitute">Substitute</span>
          ${subDates ? `<span class="instr-sub-dates">${subDates}</span>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="card instr-panel">
        <div class="instr-panel-header">
          <span class="instr-panel-title"><span class="title-icon" aria-hidden="true">${_ICONS.users}</span> Instructors</span>
        </div>
        <div class="instr-panel-body">
          ${primaryItems}
          ${assistantItems}
          ${substituteItems}
        </div>
      </div>`;
  }

  function statCard(label, value, icon, type) {
    return `<div class="stat-card stat-card--${type}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-body">
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    </div>`;
  }

  function topBottomRow(stats) {
    const medalClass = ['podium-rank--gold', 'podium-rank--silver', 'podium-rank--bronze'];
    const top = stats.top3.map((s, i) => `
      <div class="podium-item" data-action="view" data-sid="${s.id}"
           role="button" tabindex="0" title="View ${escHtml(s.name)}'s profile">
        <span class="podium-rank ${medalClass[i] || ''}">#${s.rank}</span>
        ${_avatarHTML(s.name, 'sm')}
        <span class="podium-name">${s.name}</span>
        <span class="podium-pi pi--${piColor(s._finalScore)}">${fmt(s._finalScore)}</span>
      </div>`).join('');
    const bot = stats.bottom3.map(s => `
      <div class="podium-item podium-item--low" data-action="view" data-sid="${s.id}"
           role="button" tabindex="0" title="View ${escHtml(s.name)}'s profile">
        <span class="podium-rank">#${s.rank}</span>
        ${_avatarHTML(s.name, 'sm')}
        <span class="podium-name">${s.name}</span>
        <span class="podium-pi pi--${piColor(s._finalScore)}">${fmt(s._finalScore)}</span>
      </div>`).join('');
    return `<div class="podium-row">
      <div class="card podium-card">
        <h3 class="podium-title"><span class="title-icon" aria-hidden="true">${_ICONS.award}</span> Top Performers</h3>
        <div class="podium-list">${top}</div>
      </div>
      <div class="card podium-card">
        <h3 class="podium-title"><span class="title-icon" aria-hidden="true">${_ICONS.warning}</span> Needs Attention</h3>
        <div class="podium-list">${bot}</div>
      </div>
    </div>`;
  }

  function renderStudentTable(ranked, batchId, context = {}) {
    const tbody   = document.getElementById('student-tbody');
    if (!tbody) return;
    const user    = Storage.getCurrentUser();
    const isAdmin = user && user.role === 'admin';
    tbody.innerHTML = '';
    ranked.forEach(s => {
      const m      = Calc.allMetrics(s, context);
      const alerts = Calc.getAlerts(s, context);
      const cat    = Calc.placementCategory(s, context);
      const catBadgeClass = cat === 'A' ? 'cat-badge--a' : cat === 'B' ? 'cat-badge--b' : cat === 'C' ? 'cat-badge--c' : 'cat-badge--none';
      const tr     = el('tr', alerts.length ? 'row-flagged' : '');
      tr.innerHTML = `
        <td class="rank-cell">${s.rank}</td>
        <td class="name-cell"><strong>${s.name}</strong></td>
        <td>${fmt(m.attendance)}% ${scoreBar(m.attendance)}</td>
        <td>${fmt(m.academic)}% ${scoreBar(m.academic)}</td>
        <td>${fmt(m.presentation)}% ${scoreBar(m.presentation)}</td>
        <td><strong class="pi-value pi--${piColor(m.finalScore)}">${fmt(m.finalScore)}</strong></td>
        <td><span class="cat-badge ${catBadgeClass}">${cat}</span></td>
        <td>${alertIcons(alerts)}</td>
        <td class="actions-cell">
          <button class="btn-icon" data-action="view"   data-sid="${s.id}" data-bid="${batchId}" title="View Profile">${_ICONS.eye}</button>
          <button class="btn-icon" data-action="edit"   data-sid="${s.id}" data-bid="${batchId}" title="Edit">${_ICONS.pencil}</button>
          <button class="btn-icon btn-icon--danger" data-action="delete" data-sid="${s.id}" data-bid="${batchId}" title="Delete">${_ICONS.trash}</button>
          ${isAdmin ? `<button class="btn-icon btn-icon--transfer" data-action="transfer" data-sid="${s.id}" data-bid="${batchId}" title="Transfer Student">${_ICONS.arrowDown}</button>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function bindTableSort(state, ranked, batchId, context = {}) {
    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (state.col === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.col = col; state.dir = 'asc'; }
        document.querySelectorAll('.sortable').forEach(t => t.classList.remove('sort-asc','sort-desc'));
        th.classList.add(state.dir === 'asc' ? 'sort-asc' : 'sort-desc');
        const sorted = [...ranked].sort((a, b) => {
          let va, vb;
          if      (col === 'rank') { va = a.rank; vb = b.rank; }
          else if (col === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
          else if (col === 'finalScore') { va = a._finalScore; vb = b._finalScore; }
          else { va = Calc.allMetrics(a, context)[col]; vb = Calc.allMetrics(b, context)[col]; }
          return (va < vb ? -1 : va > vb ? 1 : 0) * (state.dir === 'asc' ? 1 : -1);
        });
        renderStudentTable(sorted, batchId, context);
      });
    });
  }

  function bindStudentSearch(ranked, batchId, context = {}) {
    const inp = document.getElementById('student-search');
    if (!inp) return;
    inp.addEventListener('input', () => {
      const q = inp.value.toLowerCase();
      renderStudentTable(ranked.filter(s =>
        s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q)
      ), batchId, context);
    });
  }

  // ─── CHANGE 7: Attendance Dashboard ───────────────────────────────────────

  /**
   * Renders the batch-level attendance dashboard with:
   * - Holiday management (add/remove)
   * - Date-wise attendance table
   * - Sunday auto-highlighted as Week Off
   */
  function renderAttendanceDashboard(batch) {
    const main     = document.getElementById('main-content');
    const students = batch.students || [];
    const holidays = batch.holidays || [];
    const dateRows = Calc.batchAttendanceByDate(students, holidays, batch.quickClassDates || null);

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Attendance Dashboard</h1>
          <p class="view-sub">${batch.name} &nbsp;·&nbsp; ${students.length} students</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" id="btn-back-to-batch" data-bid="${batch.id}">← Back to Batch</button>
        </div>
      </div>

      <!-- Holiday Management -->
      <div class="card att-holiday-card">
        <h3 class="card-title">🗓 Holidays &amp; Week Offs</h3>
        <p class="tab-hint">Sundays are automatically treated as Week Off. Add custom holidays below.</p>
        <div class="att-holiday-form">
          <input type="date" id="holiday-date-inp" class="form-input form-input--sm">
          <input type="text" id="holiday-reason-inp" class="form-input" placeholder="Holiday name / reason" style="max-width:240px">
          <button class="btn btn-primary btn-sm" id="btn-add-holiday" data-bid="${batch.id}">+ Add Holiday</button>
        </div>
        <div class="att-holiday-list" id="att-holiday-list">
          ${_holidayListHTML(holidays, batch.id)}
        </div>
      </div>

      <!-- Date-wise Attendance Table -->
      <div class="card">
        <h3 class="card-title">Day-wise Attendance Log</h3>
        ${!dateRows.length
          ? '<p class="empty-hint">No sessions recorded yet. Use Quick Class to mark attendance.</p>'
          : `<div class="table-wrap">
              <table class="data-table att-date-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Status</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Total</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  ${dateRows.map(row => {
                    let rowCls = '', statusLabel = 'Working Day', statusCls = 'att-status-working';
                    if (row.isSunday)      { rowCls = 'att-row-weekend'; statusLabel = 'Week Off (Sunday)'; statusCls = 'att-status-off'; }
                    else if (row.holiday)  { rowCls = 'att-row-holiday'; statusLabel = row.holiday.reason; statusCls = 'att-status-holiday'; }
                    const pctColor = parseFloat(row.pct) >= 75 ? 'text-good' : parseFloat(row.pct) >= 50 ? '' : 'text-bad';
                    return `<tr class="${rowCls}">
                      <td><strong>${fmtDate(row.date)}</strong></td>
                      <td>${row.dayName}</td>
                      <td><span class="${statusCls}">${statusLabel}</span></td>
                      <td class="text-good"><strong>${row.present + row.late}</strong></td>
                      <td class="text-bad">${row.absent}</td>
                      <td>${row.total}</td>
                      <td class="${pctColor}"><strong>${row.pct}%</strong></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`}
      </div>`;
  }

  function _holidayListHTML(holidays, batchId) {
    if (!holidays.length) return '<p class="empty-hint">No custom holidays added yet. Sundays are automatically excluded.</p>';
    return holidays.map(h => `
      <div class="att-holiday-item">
        <span class="att-h-date">${fmtDate(h.date)}</span>
        <span class="att-h-reason">${h.reason}</span>
        <button class="btn-icon btn-icon--danger" data-action="delete-holiday" data-date="${h.date}" data-bid="${batchId}" title="Remove">${_ICONS.trash}</button>
      </div>`).join('');
  }

  // ─── Quick Class Mode — v5 ─────────────────────────────────────────────────
  // Replaced Present/Speaking/Presentation toggles with Present / Late / Absent
  // 3-state status buttons. Absent shows optional remark dropdown.
  // Multi-day leave entry added for batch-level absence ranges.

  function renderQuickClass(batch) {
    const main     = document.getElementById('main-content');
    const students = batch.students || [];
    const today    = _localDateStr();
    // sessionState: { [sid]: { status } }
    const sessionState = {};
    students.forEach(s => { sessionState[s.id] = { status: 'present' }; });

    // Chevron SVG for dropdown
    const _svgChevron = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="qc-sel-chevron"><polyline points="6 9 12 15 18 9"/></svg>`;
    const _svgCheck   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:.8rem;height:.8rem;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`;

    // Status label map
    const _STATUS_LABELS = { present: 'Present', late: 'Late', absent: 'Absent', '': '—' };

    main.innerHTML = `
      <div class="view-header">
        <div>
          <p class="view-sub">${escHtml(batch.name)}</p>
          <div class="qc-date-nav">
            <button class="btn-date-nav" id="btn-date-prev" title="Previous day">&#8592;</button>
            <input type="date" id="session-date" value="${today}" class="inline-date">
            <button class="btn-date-nav" id="btn-date-next" title="Next day">&#8594;</button>
            <span class="session-date-hint" id="session-date-hint"></span>
          </div>
        </div>
        <div class="header-actions">
          <div class="bulk-status-group">
            <button class="btn btn-outline btn-sm" id="btn-mark-all-present">All Present</button>
            <button class="btn btn-outline btn-sm" id="btn-mark-all-late">All Late</button>
            <button class="btn btn-outline btn-sm" id="btn-mark-all-absent">All Absent</button>
            <button class="btn btn-outline btn-sm" id="btn-clear-all-status">Clear</button>
          </div>
          <button class="btn btn-outline btn-sm" id="btn-multi-leave">${_ICONS.clipboard} Multi-day Leave</button>
          <button class="btn btn-outline" id="btn-cancel-quick">Cancel</button>
          <button class="btn btn-primary" id="btn-save-session">Save Session</button>
        </div>
      </div>

      <!-- Live summary strip -->
      <div class="qc-summary-bar" id="qc-summary-bar">
        <span class="qc-sum qc-sum--present"><span id="qc-cnt-present">0</span> Present</span>
        <span class="qc-sum-sep">·</span>
        <span class="qc-sum qc-sum--late"><span id="qc-cnt-late">0</span> Late</span>
        <span class="qc-sum-sep">·</span>
        <span class="qc-sum qc-sum--absent"><span id="qc-cnt-absent">0</span> Absent</span>
        <span class="qc-sum-sep">·</span>
        <span class="qc-sum qc-sum--unmarked"><span id="qc-cnt-unmarked">0</span> Unmarked</span>
      </div>

      <!-- Multi-day leave panel (hidden by default) -->
      <div class="card qc-multileave-panel" id="qc-multileave-panel" style="display:none">
        <h3 class="card-title">Multi-day Leave Entry</h3>
        <p class="tab-hint">Mark a student absent for a date range. Sundays and holidays are skipped automatically.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>Student</label>
            <select id="ml-student" class="form-input">
              ${students.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Start Date</label>
            <input type="date" id="ml-start" class="form-input">
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input type="date" id="ml-end" class="form-input">
          </div>
          <div class="form-group">
            <label>Leave Reason</label>
            <input type="text" id="ml-reason" class="form-input" placeholder="e.g. Sick leave">
          </div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-save-multileave">Save Leave Range</button>
          <button class="btn btn-outline" id="btn-cancel-multileave">Cancel</button>
        </div>
      </div>

      <!-- Student list -->
      <div class="qc-list" id="quick-grid">
        <div class="qc-list-header">
          <span class="qc-col-num">#</span>
          <span class="qc-col-info">Student</span>
          <span class="qc-col-status">Status</span>
        </div>
        ${students.length ? students.map((s, i) => {
          const phone = (s.phone || s.contactPhone || s.mobile || '').trim();
          return `
          <div class="qc-row" id="qc-${s.id}" data-sid="${s.id}">
            <span class="qc-row-num">${i + 1}</span>
            <div class="qc-row-avatar">${escHtml(s.name.charAt(0).toUpperCase())}</div>
            <div class="qc-row-info">
              <span class="qc-row-name">${escHtml(s.name)}</span>
              ${phone ? `<span class="qc-row-phone">${escHtml(phone)}</span>` : ''}
            </div>
            <div class="qc-status-select" id="qc-sel-${s.id}" data-sid="${s.id}" data-status="present">
              <span class="qc-sel-label" id="qc-sel-label-${s.id}">Present</span>
              ${_svgChevron}
            </div>
          </div>`;
        }).join('') : '<div class="empty-state" style="padding:2rem">No students in this batch.</div>'}
      </div>`;

    // Date hint: check Sunday / holiday / future
    const dateInp = document.getElementById('session-date');
    const hint    = document.getElementById('session-date-hint');
    function updateDateHint() {
      const val = dateInp.value;
      const d   = new Date(val + 'T12:00:00');
      if (val > today) {
        hint.textContent = '⚠ Future date — cannot mark attendance';
        hint.className   = 'session-date-hint hint-warn';
      } else if (d.getDay() === 0) {
        hint.textContent = '⚠ Sunday — Week Off';
        hint.className   = 'session-date-hint hint-warn';
      } else {
        const holiday = (batch.holidays || []).find(h => h.date === val);
        if (holiday) {
          hint.textContent = `⚠ Holiday: ${holiday.reason}`;
          hint.className   = 'session-date-hint hint-warn';
        } else {
          hint.textContent = '';
          hint.className   = 'session-date-hint';
        }
      }
    }
    dateInp.addEventListener('change', updateDateHint);
    updateDateHint();

    // Prev / Next date navigation — skip Sundays and holidays
    function _stepDate(direction) {
      const cur = new Date(dateInp.value + 'T12:00:00');
      for (let i = 0; i < 14; i++) {          // max 14 steps to avoid infinite loop
        cur.setDate(cur.getDate() + direction);
        const iso = cur.toISOString().split('T')[0];
        if (iso > today) continue;             // never go into the future
        if (cur.getDay() === 0) continue;      // skip Sunday
        if ((batch.holidays || []).some(h => h.date === iso)) continue; // skip holidays
        dateInp.value = iso;
        dateInp.dispatchEvent(new Event('change'));
        return;
      }
    }
    document.getElementById('btn-date-prev').addEventListener('click', () => _stepDate(-1));
    document.getElementById('btn-date-next').addEventListener('click', () => {
      // Disable next if already on today
      if (dateInp.value >= today) {
        showToast('Cannot go beyond today.', 'error'); return;
      }
      _stepDate(1);
    });

    // Live summary bar
    function _updateSummary() {
      let present = 0, late = 0, absent = 0, unmarked = 0;
      students.forEach(s => {
        const st = sessionState[s.id].status;
        if (st === 'present')  present++;
        else if (st === 'late') late++;
        else if (st === 'absent') absent++;
        else unmarked++;
      });
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('qc-cnt-present',  present);
      set('qc-cnt-late',     late);
      set('qc-cnt-absent',   absent);
      set('qc-cnt-unmarked', unmarked);
    }

    // Dirty tracking — set true whenever faculty changes any status without saving;
    // cleared when session data is (re)loaded for a date.
    let _isDirty    = false;
    let _currentDate = today;

    // Pre-populate session state from stored records whenever the date changes.
    // If a record exists for the selected date, show the stored status.
    // If no record exists, default to 'present' for today; leave unselected (no status) for past dates.
    function loadSessionForDate(date) {
      _isDirty     = false;
      _currentDate = date;
      _closeDropdown();
      students.forEach(s => {
        const existing = (s.sessions || []).find(r => r.date === date);
        if (existing) {
          const st = existing.status || (existing.present ? 'present' : 'absent');
          sessionState[s.id].status = st;
        } else if (date === today) {
          sessionState[s.id].status = 'present';
        } else {
          sessionState[s.id].status = '';
        }
        updateQuickCard(s.id, sessionState[s.id]);
      });
      _updateSummary();
    }
    // Date change — guard against unsaved changes before switching dates
    dateInp.addEventListener('change', () => {
      const newDate = dateInp.value;
      if (_isDirty) {
        showConfirm(
          'You have unsaved changes for this date. Discard them and switch dates?',
          () => loadSessionForDate(newDate),   // confirmed → discard & load new date
          () => { dateInp.value = _currentDate; updateDateHint(); }  // cancelled → restore
        );
      } else {
        loadSessionForDate(newDate);
      }
    });
    loadSessionForDate(today); // populate on first render

    // ── Dropdown logic — single open at a time, event delegation ──────────────
    function _openDropdown(sid) {
      _closeDropdown(); // close any already-open one
      const trigger = document.getElementById(`qc-sel-${sid}`);
      if (!trigger) return;
      const current = sessionState[sid].status;
      const options = [
        { val: 'present', label: 'Present' },
        { val: 'late',    label: 'Late'    },
        { val: 'absent',  label: 'Absent'  },
      ];
      const menu = document.createElement('div');
      menu.className = 'qc-dropdown';
      menu.id = 'qc-dropdown-open';
      menu.dataset.sid = sid;
      menu.innerHTML = options.map(o => `
        <div class="qc-dropdown-item${o.val === current ? ' qc-dropdown-item--active' : ''}"
             data-val="${o.val}" data-sid="${sid}">
          <span class="qc-dropdown-check">${o.val === current ? _svgCheck : ''}</span>
          ${escHtml(o.label)}
        </div>`).join('');
      // Position below the trigger
      const tr = trigger.getBoundingClientRect();
      menu.style.top   = (tr.bottom + window.scrollY + 4) + 'px';
      menu.style.left  = (tr.left  + window.scrollX)     + 'px';
      menu.style.minWidth = tr.width + 'px';
      document.body.appendChild(menu);
      trigger.classList.add('qc-sel--open');
      requestAnimationFrame(() => menu.classList.add('qc-dropdown--visible'));
    }

    function _closeDropdown() {
      const existing = document.getElementById('qc-dropdown-open');
      if (!existing) return;
      const sid = existing.dataset.sid;
      document.getElementById(`qc-sel-${sid}`)?.classList.remove('qc-sel--open');
      existing.remove();
    }

    // Clicks on the list — open/close dropdown trigger only
    // (item selection is handled by the document capture listener below,
    //  because the dropdown menu is appended to <body>, not inside #quick-grid)
    document.getElementById('quick-grid').addEventListener('click', e => {
      // Toggle dropdown on trigger click
      const trigger = e.target.closest('.qc-status-select');
      if (trigger) {
        const sid = trigger.dataset.sid;
        const open = document.getElementById('qc-dropdown-open');
        if (open && open.dataset.sid === sid) { _closeDropdown(); return; }
        _openDropdown(sid);
        return;
      }
    });

    // Document-level capture listener — handles both item selection and outside-click close.
    // Must live here (not on #quick-grid) because the dropdown menu is a direct child of
    // <body> and click events on its items never bubble through #quick-grid.
    document.addEventListener('click', e => {
      if (!document.getElementById('quick-grid')) return; // navigated away, ignore

      // ① Item selected — update state, re-render card, close menu
      const item = e.target.closest('.qc-dropdown-item');
      if (item) {
        const sid = item.dataset.sid;
        const val = item.dataset.val;
        // Guard: ensure sid exists in sessionState before writing (prevents stale events)
        if (!sid || !val || !sessionState[sid]) return;
        _isDirty = true;
        sessionState[sid].status = val;
        updateQuickCard(sid, sessionState[sid]);
        _updateSummary();
        _closeDropdown();
        return;
      }

      // ② Outside click — close the dropdown if open
      if (!e.target.closest('.qc-status-select') && !e.target.closest('#qc-dropdown-open')) {
        _closeDropdown();
      }
    }, { capture: true });

    // Bulk status buttons
    const _bulkApply = (status) => {
      _isDirty = true;
      _closeDropdown();
      students.forEach(s => {
        sessionState[s.id].status = status;
        updateQuickCard(s.id, sessionState[s.id]);
      });
      _updateSummary();
    };
    document.getElementById('btn-mark-all-present').addEventListener('click', () => _bulkApply('present'));
    document.getElementById('btn-mark-all-late').addEventListener('click',    () => _bulkApply('late'));
    document.getElementById('btn-mark-all-absent').addEventListener('click',  () => _bulkApply('absent'));
    document.getElementById('btn-clear-all-status').addEventListener('click', () => _bulkApply(''));

    // Multi-day leave toggle
    document.getElementById('btn-multi-leave').addEventListener('click', () => {
      const panel = document.getElementById('qc-multileave-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // Multi-day leave save
    document.getElementById('btn-save-multileave').addEventListener('click', () => {
      const sid    = document.getElementById('ml-student').value;
      const start  = document.getElementById('ml-start').value;
      const end    = document.getElementById('ml-end').value;
      const reason = document.getElementById('ml-reason').value.trim();
      if (!sid || !start || !end) { showToast('Please fill in all leave fields.', 'error'); return; }
      if (!reason) { showToast('Please enter a reason for the leave.', 'error'); return; }
      if (start > end) { showToast('Start date must be before end date.', 'error'); return; }
      const _leaveResult = Storage.saveAbsentRange(batch.id, sid, start, end, reason, batch.holidays || []);
      showToast('Leave range saved!', 'success');
      // Phase 4: warn if any date in the range had a completed presentation evaluation
      if (_leaveResult?.completedConflicts?.length) {
        _leaveResult.completedConflicts.forEach(c => {
          showToast(`⚠ Completed evaluation exists on ${c.date} — please review.`, 'warning');
        });
      }
      document.getElementById('qc-multileave-panel').style.display = 'none';
    });

    // Multi-day leave cancel
    document.getElementById('btn-cancel-multileave').addEventListener('click', () => {
      document.getElementById('qc-multileave-panel').style.display = 'none';
      document.getElementById('ml-start').value  = '';
      document.getElementById('ml-end').value    = '';
      document.getElementById('ml-reason').value = '';
    });

    return sessionState;
  }

  function updateQuickCard(sid, state) {
    const row = document.getElementById(`qc-${sid}`);
    if (!row) return;
    const status = state.status || '';
    // Row exception highlight — only for non-present (very subtle, no color)
    row.classList.toggle('qc-row--absent',  status === 'absent');
    row.classList.toggle('qc-row--unmarked', status === '');
    // Update dropdown trigger label + data-status
    const sel   = document.getElementById(`qc-sel-${sid}`);
    const label = document.getElementById(`qc-sel-label-${sid}`);
    const statusLabels = { present: 'Present', late: 'Late', absent: 'Absent', '': 'Mark' };
    if (label) label.textContent = statusLabels[status] ?? 'Mark';
    if (sel)   sel.dataset.status = status;
  }

  // ─── v5: Session status label helper ─────────────────────────────────────
  function _sessionStatusLabel(s) {
    if (s.status === 'present') return 'Present';
    if (s.status === 'late')    return '🕐 Late';
    if (s.status === 'absent')  return 'Absent';
    // Legacy: use bool field
    return s.present ? 'Present' : 'Absent';
  }

  // ─── Deep Update Modal ─────────────────────────────────────────────────────

  // ─── Student Profile ───────────────────────────────────────────────────────

  /**
   * CHANGE 3: Passes holidays context to Calc; CHANGE 6: Mock Interview tab added.
   */
  function renderStudentProfile(student, batchId) {
    const main    = document.getElementById('main-content');
    const context = _batchContext(batchId);
    const m       = Calc.allMetrics(student, context);
    const alerts  = Calc.getAlerts(student, context);
    const cat     = Calc.placementCategory(student, context);
    const catBadgeClass = cat === 'A' ? 'cat-badge--a' : cat === 'B' ? 'cat-badge--b' : cat === 'C' ? 'cat-badge--c' : 'cat-badge--none';
    const existingLogin = Storage.getStudentUser(student.id);
    // AI Mock display: prefer history average; fall back to legacy interviewScore scalar
    const aiHistory   = student.aiMockHistory || [];
    const rawAIStored = student.interviewScore;
    let aiDisplay;
    if (aiHistory.length) {
      const avg = aiHistory.reduce((s, e) => s + e.score, 0) / aiHistory.length;
      aiDisplay = `${avg.toFixed(1)}/10${aiHistory.length > 1 ? ` (avg, ${aiHistory.length} sessions)` : ''}`;
    } else if (rawAIStored !== null && rawAIStored !== undefined) {
      const norm = rawAIStored > 10 ? (rawAIStored / 10).toFixed(1) : rawAIStored;
      aiDisplay  = `${norm}/10 (legacy)`;
    } else {
      aiDisplay  = '—';
    }
    // Manual mock average for display (matches Phase 5 formula — avg of all sessions)
    const mocks = student.mockInterviews || [];
    const manualDisplay = mocks.length
      ? (() => {
          const avg = mocks.reduce((s, mm) =>
            s + (typeof mm.totalScore === 'number' ? mm.totalScore : 0), 0) / mocks.length;
          return `${avg.toFixed(2)}/10${mocks.length > 1 ? ` (avg, ${mocks.length} sessions)` : ''}`;
        })()
      : '—';
    main.innerHTML = `
      <div class="view-header">
        <div class="profile-header-info">
          <div class="profile-avatar-lg">${student.name.charAt(0)}</div>
          <div>
            <h1 class="view-title">${student.name}</h1>
            <p class="view-sub">
              <code>${student.studentId}</code>
              ${student.email ? `&nbsp;·&nbsp;${student.email}` : ''}
              ${student.phone ? `&nbsp;·&nbsp;${student.phone}` : ''}
            </p>
            ${alerts.length ? `<div class="alert-strip">${alerts.map(a => `<span class="alert-pill">${_ICONS.flag} ${a.message}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" id="btn-back-batch" data-bid="${batchId}">← Back</button>
          ${existingLogin
            ? `<div class="login-dropdown-wrap">
                 <button class="btn btn-outline login-dropdown-trigger" id="btn-login-dropdown">
                   @${existingLogin.username} ▾
                 </button>
                 <div class="login-dropdown-menu" id="login-dropdown-menu">
                   <button class="login-dropdown-item" data-action="reset-student-password"
                     data-sid="${student.id}" data-bid="${batchId}" data-uid="${existingLogin.id}">
                     Reset Password
                   </button>
                   <button class="login-dropdown-item login-dropdown-item--danger" data-action="delete-student-login"
                     data-sid="${student.id}" data-bid="${batchId}" data-uid="${existingLogin.id}"
                     data-uname="${existingLogin.username}">
                     ${_ICONS.trash} Delete Login
                   </button>
                 </div>
               </div>`
            : `<button class="btn btn-outline btn-sm" data-action="create-student-login" data-sid="${student.id}" data-bid="${batchId}">Create Login</button>`}
        </div>
      </div>

      <div class="pi-banner pi-banner--${piColor(m.finalScore)}">
        <div class="pi-banner-inner">
          <div class="pi-circle">${fmt(m.finalScore)}</div>
          <div class="pi-detail">
            <div class="pi-label">Final Score
              <span class="cat-badge ${catBadgeClass}" style="margin-left:.6rem">Category ${cat}</span>
            </div>
            <div class="pi-breakdown">
              Attendance ${fmt(m.attendance)}% &nbsp;·&nbsp;
              Academic ${fmt(m.academic)}% &nbsp;·&nbsp;
              Presentation ${fmt(m.presentation)}%
            </div>
            <div class="pi-breakdown" style="margin-top:.25rem;font-size:.8rem;opacity:.8">
              AI Mock: <strong>${aiDisplay}</strong>
              &nbsp;·&nbsp; Manual Mock (avg): <strong>${manualDisplay}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="profile-tabs">
        <button class="ptab active" data-tab="overview">Overview</button>
        <button class="ptab" data-tab="attendance">Attendance</button>
        <button class="ptab" data-tab="academics">Academics</button>
        <button class="ptab" data-tab="exams">Exams</button>
        <button class="ptab" data-tab="presentation-metrics">Presentation Metrics</button>
        <button class="ptab" data-tab="mock-interview">Mock Interview</button>
        <button class="ptab" data-tab="notes">Notes</button>
      </div>

      <div id="profile-tab-content"></div>`;

    renderProfileTab('overview', student, m, batchId);

    document.querySelectorAll('.ptab').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Charts.destroyAll();
        renderProfileTab(btn.dataset.tab, student, m, batchId);
      }));
  }

  /** CHANGE 5+6: renderProfileTab passes batchId for context; adds mock-interview case */
  function renderProfileTab(tab, student, m, batchId) {
    const container = document.getElementById('profile-tab-content');
    const dark      = document.body.classList.contains('dark');
    const context   = _batchContext(batchId || '');

    if (tab === 'overview') {
      container.innerHTML = `
        <div class="tab-grid">
          <div class="card chart-card"><h3 class="card-title">Performance Radar</h3>
            <canvas id="radar-chart" height="280"></canvas>
          </div>
          <div class="card metrics-list-card"><h3 class="card-title">Metric Breakdown</h3>
            ${['attendance','academic','presentation'].map(k => `
              <div class="metric-row">
                <span class="metric-name">${capitalize(k)}</span>
                <div class="metric-bar-wrap">${scoreBar(m[k])}</div>
                <span class="metric-pct">${fmt(m[k])}%</span>
              </div>`).join('')}
            ${(() => {
              // AI Mock — normalise 0-10 → 0-100 for bar; display as /10
              const aiHistory = student.aiMockHistory || [];
              let aiVal = 0;
              if (aiHistory.length) {
                aiVal = (aiHistory.reduce((s, e) => s + e.score, 0) / aiHistory.length) * 10;
              } else if (student.interviewScore !== null && student.interviewScore !== undefined) {
                aiVal = student.interviewScore > 10 ? student.interviewScore : student.interviewScore * 10;
              }
              const aiDisplay = aiVal > 0 ? `${(aiVal / 10).toFixed(1)}/10` : '—';
              // Manual Mock avg — normalise 0-10 → 0-100 for bar; display as /10
              const mocks = student.mockInterviews || [];
              let manualVal = 0;
              if (mocks.length) {
                manualVal = (mocks.reduce((s, mm) =>
                  s + (typeof mm.totalScore === 'number' ? mm.totalScore : 0), 0) / mocks.length) * 10;
              }
              const manualDisplay = manualVal > 0 ? `${(manualVal / 10).toFixed(2)}/10` : '—';
              return `
              <div class="metric-row">
                <span class="metric-name">AI Mock</span>
                <div class="metric-bar-wrap">${scoreBar(aiVal)}</div>
                <span class="metric-pct">${aiDisplay}</span>
              </div>
              <div class="metric-row">
                <span class="metric-name">Manual Mock</span>
                <div class="metric-bar-wrap">${scoreBar(manualVal)}</div>
                <span class="metric-pct">${manualDisplay}</span>
              </div>`;
            })()}
            <div class="metric-row metric-row--pi">
              <span class="metric-name">Final Score</span>
              <div class="metric-bar-wrap">${scoreBar(m.finalScore)}</div>
              <span class="metric-pct pi--${piColor(m.finalScore)}">${fmt(m.finalScore)}</span>
            </div>
          </div>
        </div>`;
      setTimeout(() => Charts.renderRadar('radar-chart', student, dark, context), 50);
    }

    else if (tab === 'attendance') {
      const sessions  = student.sessions || [];
      const holidays  = context.holidays || [];
      // Exclude Sundays and holidays from counting
      const working   = sessions.filter(s => {
        const d = new Date(s.date + 'T12:00:00');
        if (d.getDay() === 0) return false;
        if (holidays.some(h => h.date === s.date)) return false;
        return true;
      });
      const present   = working.filter(s => Calc._isPresent(s)).length;
      const absent    = working.length - present;
      const allPres   = sessions.filter(s => Calc._isPresent(s)).length;
      container.innerHTML = `
        <div class="tab-grid">
          <div class="card chart-card" style="position:relative">
            <h3 class="card-title">Attendance Overview</h3>
            <canvas id="att-donut" height="260"></canvas>
            <div class="donut-center-text">${fmt(m.attendance)}%</div>
          </div>
          <div class="card">
            <h3 class="card-title">Session History</h3>
            <div class="att-stats">
              <span>Total sessions: <strong>${sessions.length}</strong></span>
              <span>Working sessions: <strong>${working.length}</strong></span>
              <span>Present (working): <strong class="text-good">${present}</strong></span>
              <span>Absent (working): <strong class="text-bad">${absent}</strong></span>
            </div>
            <div class="session-log">
              ${sessions.slice().reverse().map(s => {
                const d = new Date(s.date + 'T12:00:00');
                const isSunday = d.getDay() === 0;
                const holiday  = holidays.find(h => h.date === s.date);
                let tag = '';
                if (isSunday)   tag = ' <span class="att-tag att-tag-off">Week Off</span>';
                else if (holiday) tag = ` <span class="att-tag att-tag-holiday">${holiday.reason}</span>`;
                return `<div class="session-row ${Calc._isPresent(s) ? 'sp':'sa'}">
                  <span class="sr-date">${fmtDate(s.date)}</span>
                  <span class="sr-status">${_sessionStatusLabel(s)}</span>
                  ${tag}
                  ${s.remark ? `<span class="sr-extra"><span class="title-icon" aria-hidden="true">${_ICONS.messageCircle}</span> ${s.remark}</span>` : ''}
                </div>`;
              }).join('') || '<p class="empty-hint">No sessions recorded.</p>'}
            </div>
          </div>
        </div>`;
      setTimeout(() => Charts.renderAttendanceDonut('att-donut', student, dark), 50);
    }

    else if (tab === 'academics') {
      container.innerHTML = `
        <div class="card">
          <h3 class="card-title">Academic Performance</h3>
          <canvas id="academic-bar" height="200"></canvas>
          <div class="test-list">
            ${(student.weeklyTests || []).slice().reverse().map(t => `
              <div class="history-item">
                <span class="hi-label">${t.week || 'Test'} — ${fmtDate(t.date)}</span>
                <span class="hi-value">${t.marks}/${t.total} &nbsp;·&nbsp; ${((t.marks/t.total)*100).toFixed(1)}%</span>
              </div>`).join('') || '<p class="empty-hint">No tests recorded yet.</p>'}
          </div>
        </div>`;
      setTimeout(() => Charts.renderAcademicBar('academic-bar', student, dark), 50);
    }

    else if (tab === 'exams') {
      // CHANGE 4: uses new module-based exam tab
      _renderExamTab(container, student, dark);
    }

    else if (tab === 'presentation-metrics') {
      // CHANGE 8: reads from single source — presentationMetrics
      const metrics   = (student.presentationMetrics || student.careerMetrics || []).slice().reverse();
      const byMonth   = Calc.presentationsByMonth(student);
      const totalPres = (student.presentationDates || []).length;
      container.innerHTML = `
        <div class="tab-grid-wide">
          <div class="card pres-summary-card">
            <h3 class="card-title">Presentation Log</h3>
            <div class="pres-total-badge">${totalPres} <span>total presentations</span></div>
            ${byMonth.length ? `
              <div class="pres-month-grid">
                ${byMonth.map(mn => `
                  <div class="pres-month-item">
                    <span class="pm-month">${mn.month}</span>
                    <span class="pm-count">${mn.count}</span>
                  </div>`).join('')}
              </div>` : '<p class="empty-hint">No presentations logged yet.</p>'}
            <div class="pres-date-list">
              ${(student.presentationDates || []).slice().reverse().map(d =>
                `<div class="history-item"><span class="hi-label">${_ICONS.clipboard} ${fmtDate(d)}</span></div>`
              ).join('') || ''}
            </div>
          </div>
          <div class="card">
            <h3 class="card-title">Presentation Metrics History</h3>
            ${metrics.map(cm => `
              <div class="career-entry">
                <div class="career-entry-date">${fmtDate(cm.date)}</div>
                <div class="career-sliders-view">
                  ${['communication','confidence','bodyLanguage','grooming','behavior'].map(f => `
                    <div class="cs-row">
                      <span class="cs-lbl">${capitalize(f.replace(/([A-Z])/g,' $1'))}</span>
                      <div class="cs-bar-wrap">${scoreBar((cm[f]/10)*100)}</div>
                      <span class="cs-val">${cm[f]}/10</span>
                    </div>`).join('')}
                </div>
              </div>`).join('') || '<p class="empty-hint">No presentation metrics recorded.</p>'}
          </div>
        </div>`;
    }

    // CHANGE 5+6: Mock Interview tab
    else if (tab === 'mock-interview') {
      _renderMockInterviewTab(container, student, batchId);
    }

    else if (tab === 'notes') {
      // Collect manual notes
      const _manualNotes = (student.notes || []).map(n => ({
        date: n.date, sortKey: n.date, type: 'note', text: n.text
      }));
      // Collect Call Connect entries from sessions
      const _callNotes = (student.sessions || [])
        .filter(s => s.remark === 'Call Connect' && s.callNote)
        .map(s => ({
          date: s.date, sortKey: s.callNoteAt || s.date, type: 'call', text: s.callNote, callNoteAt: s.callNoteAt
        }));
      // Merge and sort newest first
      const _allNotes = [..._manualNotes, ..._callNotes]
        .sort((a, b) => b.sortKey.localeCompare(a.sortKey));

      const _notesHTML = _allNotes.length
        ? _allNotes.map(n => n.type === 'call' ? `
            <div class="note-card note-card--call">
              <div class="note-date">${_ICONS.phone} Call Connect — ${fmtDate(n.date)}${n.callNoteAt ? ' &nbsp;·&nbsp; ' + new Date(n.callNoteAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
              <p class="note-text">${n.text}</p>
            </div>` : `
            <div class="note-card">
              <div class="note-date">${fmtDate(n.date)}</div>
              <p class="note-text">${n.text}</p>
            </div>`).join('')
        : '<p class="empty-hint">No notes yet.</p>';

      container.innerHTML = `
        <div class="card">
          <h3 class="card-title">Trainer Notes &amp; Call Connect</h3>
          ${_notesHTML}
        </div>`;
    }
  }

  // ─── CHANGE 4: Exam Tab — 3-module structure ───────────────────────────────

  function _renderExamTab(container, student, dark) {
    const modules = Calc.moduleStats(student);
    const appeared = modules.filter(m => m.appeared).length;
    const cleared  = modules.filter(m => m.cleared).length;

    container.innerHTML = `
      <div class="card">
        <div class="exam-header">
          <h3 class="card-title">Exam Status — 3 Modules</h3>
          <div class="exam-summary-pills">
            <span class="exam-pill">Modules Appeared: <strong>${appeared}/3</strong></span>
            <span class="exam-pill exam-pill--good">Modules Cleared: <strong>${cleared}</strong></span>
          </div>
        </div>
        <p class="tab-hint">Each module has 7 parameters. A module is <strong>Cleared</strong> only when ALL appeared parameters meet minimum marks.</p>

        <!-- Module tabs -->
        <div class="module-tabs">
          ${[1,2,3].map((n,i) => {
            const mod = modules[i];
            let badge = '';
            if (mod.appeared && mod.cleared)  badge = '<span class="mod-badge mod-badge--cleared">✓</span>';
            else if (mod.appeared && !mod.cleared) badge = '<span class="mod-badge mod-badge--failed">✗</span>';
            return `<button class="mod-tab ${i===0?'active':''}" data-mod="${n}">Module ${n} ${badge}</button>`;
          }).join('')}
        </div>

        ${modules.map((mod, idx) => `
          <div class="module-panel ${idx===0?'active':''}" id="mod-panel-${mod.moduleNum}">
            <!-- Module status banner -->
            <div class="mod-status-banner mod-status--${!mod.appeared ? 'na' : mod.cleared ? 'cleared' : 'failed'}">
              ${!mod.appeared
                ? '— No parameters recorded for this module yet'
                : mod.cleared
                  ? `✓ Module ${mod.moduleNum} Cleared (${mod.clearedCount}/${mod.appearedCount} parameters passed)`
                  : `✗ Module ${mod.moduleNum} Not Cleared — ${mod.clearedCount}/${mod.appearedCount} parameters passed`}
            </div>

            <div class="exam-table-wrap">
              <table class="exam-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Max</th>
                    <th>Min Pass</th>
                    <th>Appeared</th>
                    <th>Marks</th>
                    <th>Status</th>
                    <th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  ${mod.params.map(p => `
                    <tr class="${p.appeared && p.cleared ? 'exam-cleared' : p.appeared && !p.cleared ? 'exam-failed' : ''}">
                      <td><strong>${p.name}</strong></td>
                      <td>${p.maxMarks}</td>
                      <td>${p.minMarks}</td>
                      <td>
                        <input type="checkbox" class="exam-appeared-chk"
                          data-module="${mod.moduleNum}" data-param="${p.name}"
                          ${p.appeared ? 'checked' : ''}>
                      </td>
                      <td>
                        <input type="number" class="exam-marks-inp form-input form-input--xs"
                          data-module="${mod.moduleNum}" data-param="${p.name}"
                          min="0" max="${p.maxMarks}"
                          value="${p.marks !== null ? p.marks : ''}"
                          placeholder="—" ${!p.appeared ? 'disabled' : ''}>
                      </td>
                      <td>
                        ${p.appeared
                          ? (p.marks !== null
                              ? `<span class="exam-status-badge ${p.cleared ? 'esb-cleared':'esb-failed'}">${p.cleared ? '✓ Cleared':'✗ Failed'}</span>`
                              : `<span class="exam-status-badge esb-pending">— Pending</span>`)
                          : `<span class="exam-status-badge esb-na">Not Appeared</span>`}
                      </td>
                      <td>
                        <button class="btn btn-sm btn-primary btn-save-exam"
                          data-module="${mod.moduleNum}" data-param="${p.name}">Save</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>

            ${mod.appeared ? `
              <div class="exam-chart-wrap">
                <h4 class="exam-chart-title">Parameter Marks — Module ${mod.moduleNum}</h4>
                <div style="height:${mod.appearedCount * 44 + 60}px">
                  <canvas id="exam-param-bar-${mod.moduleNum}"></canvas>
                </div>
              </div>` : ''}
          </div>`).join('')}

        <!-- Overall module summary chart -->
        ${appeared > 0 ? `
          <div class="exam-chart-wrap" style="margin-top:1.5rem">
            <h4 class="exam-chart-title">Module Summary (Cleared Params / Appeared Params)</h4>
            <div style="height:180px">
              <canvas id="exam-bar-chart"></canvas>
            </div>
          </div>` : ''}
      </div>`;

    // Bind module tab switching
    container.querySelectorAll('.mod-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.mod-tab').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.module-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        container.querySelector(`#mod-panel-${btn.dataset.mod}`).classList.add('active');
      });
    });

    // Bind "appeared" checkboxes to enable/disable marks inputs
    container.querySelectorAll('.exam-appeared-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const inp = container.querySelector(
          `.exam-marks-inp[data-module="${chk.dataset.module}"][data-param="${chk.dataset.param}"]`);
        if (inp) inp.disabled = !chk.checked;
      });
    });

    // Render param charts for appeared modules
    setTimeout(() => {
      modules.forEach(mod => {
        if (mod.appeared) Charts.renderModuleParamBar(`exam-param-bar-${mod.moduleNum}`, mod.params, dark);
      });
      if (appeared > 0) Charts.renderExamBar('exam-bar-chart', modules, dark);
    }, 50);
  }

  function _renderMockInterviewTab(container, student, batchId) {
    const today      = _localDateStr();
    const interviews = (student.mockInterviews || []).slice().reverse();
    const aiEntries  = (student.aiMockHistory  || []).slice().reverse();

    container.innerHTML = `
      <div class="card">
        <div class="mock-header">
          <h3 class="card-title">Manual Mock Interviews</h3>
          <button class="btn btn-primary btn-sm" id="btn-toggle-mock-form">+ Add Mock Interview</button>
        </div>

        <!-- Add Form (hidden by default) -->
        <div id="mock-add-form" class="mock-form-section" style="display:none">
          <div class="form-grid" style="grid-template-columns: 1fr 1fr auto; align-items: end;">
            <div class="form-group">
              <label>Interview Date</label>
              <input type="date" id="mock-date" value="${today}" class="form-input">
            </div>
            <div class="form-group">
              <label>Attendance</label>
              <select id="mock-attendance-select" class="form-input">
                <option value="present">Present</option>
                <option value="absent">Absent</option>
              </select>
            </div>
          </div>

          <!-- Q&A Notes -->
          <div class="mock-qa-grid">
            <div class="form-group">
              <label>Questions Answered</label>
              <textarea id="mock-q-answered" rows="3" class="form-input form-textarea"
                placeholder="Topics / questions the student answered well…"></textarea>
            </div>
            <div class="form-group">
              <label>Questions NOT Answered</label>
              <textarea id="mock-q-not-answered" rows="3" class="form-input form-textarea"
                placeholder="Topics the student struggled with…"></textarea>
            </div>
          </div>

          <!-- Scoring Table -->
          <div id="mock-scores-section">
            <table class="mock-score-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Score (0–10)</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${MOCK_PARAMS_CONFIG.map(p => `
                  <tr>
                    <td><strong>${p.label}</strong></td>
                    <td>
                      <input type="number" class="mock-score-inp form-input form-input--xs"
                        data-param="${p.key}" min="0" max="10" value="0" placeholder="0">
                    </td>
                    <td>
                      <input type="text" class="mock-remark-inp form-input"
                        data-param="${p.key}" placeholder="Remarks…">
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
            <div class="mock-total-display">
              Total Score: <strong id="mock-total-display">0.0</strong> / 10
              &nbsp;·&nbsp; Cleared: <span id="mock-cleared-display" class="text-bad">No (need ≥ 5)</span>
            </div>
          </div>

          <div style="margin-top:.75rem">
            <button class="btn btn-primary" data-action="save-mock" data-bid="${batchId}" data-sid="${student.id}">
              Save Mock Interview
            </button>
          </div>
        </div>

        <!-- Interview History -->
        <div class="mock-history" id="mock-history">
          ${interviews.length
            ? interviews.map(mi => _mockInterviewItemHTML(mi, batchId, student.id)).join('')
            : '<p class="empty-hint">No mock interviews recorded yet.</p>'}
        </div>
      </div>

      <!-- ── AI Mock Scores ──────────────────────────────────────────── -->
      <div class="card" style="margin-top:1rem">
        <div class="mock-header">
          <h3 class="card-title">AI Mock Scores</h3>
          <button class="btn btn-primary btn-sm" id="btn-toggle-ai-mock-form">+ Add AI Score</button>
        </div>

        <div id="ai-mock-add-form" class="mock-form-section" style="display:none">
          <div class="form-grid" style="grid-template-columns:1fr 1fr;align-items:end;gap:.75rem">
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="ai-mock-date" value="${today}" class="form-input">
            </div>
            <div class="form-group">
              <label>Score (0–10)</label>
              <input type="number" id="ai-mock-score" class="form-input"
                min="0" max="10" step="0.1" placeholder="e.g. 7.5">
            </div>
          </div>
          <div style="margin-top:.75rem">
            <button class="btn btn-primary btn-sm" data-action="save-ai-mock"
              data-bid="${batchId}" data-sid="${student.id}">Save AI Score</button>
            <span id="ai-mock-error" style="color:var(--bad);font-size:.82rem;
              margin-left:.5rem;display:none"></span>
          </div>
        </div>

        <div class="mock-history" id="ai-mock-history">
          ${aiEntries.length
            ? aiEntries.map(e => _aiMockItemHTML(e, batchId, student.id)).join('')
            : '<p class="empty-hint">No AI mock scores recorded yet.</p>'}
        </div>
      </div>`;

    // Toggle form visibility
    const toggleBtn = container.querySelector('#btn-toggle-mock-form');
    const form      = container.querySelector('#mock-add-form');
    toggleBtn.addEventListener('click', () => {
      const isHidden = form.style.display === 'none';
      form.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? 'Cancel' : '+ Add Mock Interview';
    });

    // Absent select hides/shows scoring and Q&A
    const attSelect    = container.querySelector('#mock-attendance-select');
    const scoresSection = container.querySelector('#mock-scores-section');
    const qaGrid       = container.querySelector('.mock-qa-grid');
    const _setAbsentUI = (isAbsent) => {
      const display = isAbsent ? 'none' : 'block';
      scoresSection.style.display = display;
      if (qaGrid) qaGrid.style.display = display;
    };
    attSelect.addEventListener('change', () => _setAbsentUI(attSelect.value === 'absent'));

    // Phase 5: Auto-default attendance from Quick Class session when date changes
    const mockDateInp = container.querySelector('#mock-date');
    const _syncAttFromQC = (date) => {
      const qcSession = (student.sessions || []).find(s => s.date === date);
      if (!qcSession) return; // no QC session for this date — leave as-is
      const qcStatus = qcSession.status || (qcSession.present ? 'present' : 'absent');
      attSelect.value = qcStatus === 'absent' ? 'absent' : 'present';
      _setAbsentUI(attSelect.value === 'absent');
    };
    mockDateInp.addEventListener('change', () => _syncAttFromQC(mockDateInp.value));
    _syncAttFromQC(mockDateInp.value); // apply on initial render for today's date

    // Auto-calculate total score as user inputs scores
    container.querySelectorAll('.mock-score-inp').forEach(inp => {
      inp.addEventListener('input', () => _updateMockTotal(container));
    });

    // AI Mock form toggle
    const aiToggleBtn = container.querySelector('#btn-toggle-ai-mock-form');
    const aiForm      = container.querySelector('#ai-mock-add-form');
    aiToggleBtn?.addEventListener('click', () => {
      const isHidden = aiForm.style.display === 'none';
      aiForm.style.display = isHidden ? 'block' : 'none';
      aiToggleBtn.textContent = isHidden ? 'Cancel' : '+ Add AI Score';
    });

    // Kebab menu toggle on AI mock history cards
    container.querySelector('#ai-mock-history')?.addEventListener('click', e => {
      const kebabBtn = e.target.closest('[data-kebab]');
      if (kebabBtn) {
        e.stopPropagation();
        const menu = document.getElementById(`kebab-menu-${kebabBtn.dataset.kebab}`);
        container.querySelectorAll('.mi-kebab-menu').forEach(m => {
          if (m !== menu) m.style.display = 'none';
        });
        if (menu) {
          const isOpen = menu.style.display !== 'none';
          menu.style.display = isOpen ? 'none' : 'block';
          if (!isOpen) {
            document.addEventListener('click', () => { menu.style.display = 'none'; }, { once: true });
          }
        }
      }
    });

    // Kebab menu toggle on interview history cards
    container.querySelector('#mock-history')?.addEventListener('click', e => {
      const kebabBtn = e.target.closest('[data-kebab]');
      if (kebabBtn) {
        e.stopPropagation();
        const menu = document.getElementById(`kebab-menu-${kebabBtn.dataset.kebab}`);
        // Close all other open menus first
        container.querySelectorAll('.mi-kebab-menu').forEach(m => {
          if (m !== menu) m.style.display = 'none';
        });
        if (menu) {
          const isOpen = menu.style.display !== 'none';
          menu.style.display = isOpen ? 'none' : 'block';
          if (!isOpen) {
            // Auto-close when clicking anywhere outside
            document.addEventListener('click', () => {
              menu.style.display = 'none';
            }, { once: true });
          }
        }
      }
    });
  }

  function _updateMockTotal(container) {
    const inputs = container.querySelectorAll('.mock-score-inp');
    let sum = 0;
    inputs.forEach(inp => { sum += Math.min(10, Math.max(0, parseFloat(inp.value) || 0)); });
    const avg = sum / MOCK_PARAMS_CONFIG.length;
    const totalEl   = container.querySelector('#mock-total-display');
    const clearedEl = container.querySelector('#mock-cleared-display');
    if (totalEl)   totalEl.textContent  = avg.toFixed(2);
    if (clearedEl) {
      const cleared = avg >= 5;
      clearedEl.textContent = cleared ? 'Yes ✓' : 'No (need ≥ 5)';
      clearedEl.className   = cleared ? 'text-good' : 'text-bad';
    }
  }

  function _mockInterviewItemHTML(mi, batchId, studentId) {
    const scoreRows = MOCK_PARAMS_CONFIG.map(p => {
      const s = mi.scores?.[p.key];
      return s ? `<div class="mi-score-row">
        <span class="mi-param">${p.label}</span>
        <span class="mi-val">${s.value}/10</span>
        ${s.remark ? `<span class="mi-remark">${s.remark}</span>` : ''}
      </div>` : '';
    }).join('');

    const _d = `data-mi-id="${mi.id}" data-bid="${batchId}" data-sid="${studentId}"`;

    return `<div class="mock-interview-item ${mi.absent ? 'mi-absent' : ''}">
      <div class="mi-top-row">
        <span class="mi-date">${fmtDate(mi.date)}</span>
        ${mi.absent
          ? '<span class="mi-status mi-status--absent">Absent</span>'
          : `<span class="mi-status mi-status--${mi.cleared ? 'cleared' : 'failed'}">
               Total: ${mi.totalScore?.toFixed(2)}/10 — ${mi.cleared ? 'Cleared' : 'Not Cleared'}
             </span>`}
        <div class="mi-kebab-wrap">
          <button class="btn-kebab" data-kebab="${mi.id}">${_ICONS.dotsV}</button>
          <div class="mi-kebab-menu" id="kebab-menu-${mi.id}" style="display:none">
            <button data-action="edit-mock" ${_d}>${_ICONS.pencil} Edit</button>
            <button class="mi-kebab-delete" data-action="delete-mock" ${_d}>${_ICONS.trash} Delete</button>
          </div>
        </div>
      </div>
      ${!mi.absent ? `
        <div class="mi-qa-row">
          ${mi.questionsAnswered   ? `<div class="mi-qa mi-qa--yes"><strong>Answered:</strong> ${mi.questionsAnswered}</div>`   : ''}
          ${mi.questionsNotAnswered ? `<div class="mi-qa mi-qa--no"><strong>Not Answered:</strong> ${mi.questionsNotAnswered}</div>` : ''}
        </div>
        <div class="mi-scores">${scoreRows}</div>` : ''}
    </div>`;
  }

  // ─── Phase 1: AI Mock Score item HTML ────────────────────────────────────────
  function _aiMockItemHTML(entry, batchId, studentId) {
    const scoreClass = entry.score >= 7 ? 'mi-status--cleared' : entry.score >= 5 ? 'mi-status--warn' : 'mi-status--failed';
    const _d = `data-mi-id="${entry.id}" data-bid="${batchId}" data-sid="${studentId}"`;
    return `<div class="mock-interview-item">
      <div class="mi-top-row">
        <span class="mi-date">${fmtDate(entry.date)}</span>
        <span class="mi-status ${scoreClass}">Score: ${entry.score}/10</span>
        <div class="mi-kebab-wrap">
          <button class="btn-kebab" data-kebab="aim-${entry.id}">${_ICONS.dotsV}</button>
          <div class="mi-kebab-menu" id="kebab-menu-aim-${entry.id}" style="display:none">
            <button data-action="edit-ai-mock"   ${_d}>${_ICONS.pencil} Edit</button>
            <button class="mi-kebab-delete" data-action="delete-ai-mock" ${_d}>${_ICONS.trash} Delete</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─── Generic Modals ────────────────────────────────────────────────────────

  function showBatchModal(existing = null) {
    const modal = el('div', 'modal-overlay');
    const statusOptions = ['active', 'upcoming', 'completed', 'archived']
      .map(v => `<option value="${v}"${(existing?.status || 'active') === v ? ' selected' : ''}>${capitalize(v)}</option>`)
      .join('');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${existing ? 'Edit Batch' : 'Create New Batch'}</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Batch Name *</label>
            <input type="text" id="f-batch-name" class="form-input"
              value="${existing ? existing.name : ''}" placeholder="e.g. Full Stack Dev – Jan 2025">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="f-batch-desc" class="form-input"
              value="${existing ? (existing.description || '') : ''}" placeholder="Optional description">
          </div>
          <div class="form-grid form-grid--2">
            <div class="form-group">
              <label>Batch Code</label>
              <input type="text" id="f-batch-code" class="form-input"
                value="${existing ? (existing.batchCode || '') : ''}" placeholder="e.g. FSD-25A">
            </div>
            <div class="form-group">
              <label>Capacity <span class="form-hint">(0 = unlimited)</span></label>
              <input type="number" id="f-batch-capacity" class="form-input" min="0"
                value="${existing ? (existing.capacity || 0) : 0}">
            </div>
          </div>
          <div class="form-grid form-grid--2">
            <div class="form-group">
              <label>Start Date</label>
              <input type="date" id="f-batch-start" class="form-input"
                value="${existing ? (existing.startDate || '') : ''}">
            </div>
            <div class="form-group">
              <label>End Date</label>
              <input type="date" id="f-batch-end" class="form-input"
                value="${existing ? (existing.endDate || '') : ''}">
            </div>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="f-batch-status" class="form-input">${statusOptions}</select>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm">${existing ? 'Save Changes' : 'Create Batch'}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('f-batch-name').focus();
    return modal;
  }

  function showStudentModal(existing = null) {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${existing ? 'Edit Student' : 'Add Student'}</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" id="f-stu-name" class="form-input"
              value="${existing ? existing.name : ''}" placeholder="Student's full name">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="f-stu-email" class="form-input"
              value="${existing ? existing.email : ''}" placeholder="email@example.com">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="text" id="f-stu-phone" class="form-input"
              value="${existing ? existing.phone : ''}" placeholder="+91 XXXXX XXXXX">
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm">${existing ? 'Save Changes' : 'Add Student'}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('f-stu-name').focus();
    return modal;
  }

  function showBulkImportModal(rows, onConfirm) {
    const modal = el('div', 'modal-overlay');
    const hasRows = rows.length > 0;

    const tableRows = rows.map((r, i) => `
      <tr>
        <td style="padding:.4rem .6rem">${i + 1}</td>
        <td style="padding:.4rem .6rem">${r.name ? escHtml(r.name) : '<span style="color:#f87171">—</span>'}</td>
        <td style="padding:.4rem .6rem">${r.email ? escHtml(r.email) : '—'}</td>
        <td style="padding:.4rem .6rem">${r.phone ? escHtml(r.phone) : '—'}</td>
      </tr>`).join('');

    modal.innerHTML = `
      <div class="modal" style="max-width:640px;width:95vw">
        <div class="modal-header">
          <h2>Import Students from Excel</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          ${!hasRows ? `
            <p style="color:#94a3b8;margin-bottom:.75rem">
              Your Excel sheet must have these columns in the <strong>first row</strong>:
            </p>
            <div style="background:#0F172A;border-radius:8px;padding:.75rem 1rem;font-family:monospace;font-size:.85rem;margin-bottom:1rem;color:#fbbf24">
              Name &nbsp;|&nbsp; Email &nbsp;|&nbsp; Phone
            </div>
            <p style="color:#64748b;font-size:.82rem;margin-bottom:1.25rem">
              Email and Phone are optional. Each row after the header becomes one student.
            </p>
            <a id="bulk-download-template" href="#" style="color:#0277FA;font-size:.85rem;text-decoration:underline">
              Download sample template
            </a>
          ` : `
            <p style="color:#94a3b8;margin-bottom:.75rem">
              <strong style="color:#f1f5f9">${rows.length}</strong> student${rows.length !== 1 ? 's' : ''} found — review before importing:
            </p>
            <div style="max-height:300px;overflow-y:auto;border:1px solid rgba(255,255,255,.08);border-radius:8px">
              <table style="width:100%;border-collapse:collapse;font-size:.85rem">
                <thead>
                  <tr style="background:rgba(255,255,255,.06);text-align:left">
                    <th style="padding:.5rem .6rem;color:#94a3b8">#</th>
                    <th style="padding:.5rem .6rem;color:#94a3b8">Name</th>
                    <th style="padding:.5rem .6rem;color:#94a3b8">Email</th>
                    <th style="padding:.5rem .6rem;color:#94a3b8">Phone</th>
                  </tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          `}
          <div style="margin-top:1.25rem">
            <label style="display:block;font-size:.85rem;color:#94a3b8;margin-bottom:.5rem">
              ${hasRows ? 'Upload a different file:' : 'Select Excel file (.xlsx or .xls):'}
            </label>
            <input type="file" id="bulk-excel-input" accept=".xlsx,.xls"
              style="font-size:.85rem;color:#f1f5f9;width:100%">
          </div>
          <div class="modal-footer" style="margin-top:1.25rem">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            ${hasRows
              ? `<button class="btn btn-primary" id="bulk-import-confirm">Import ${rows.length} Students</button>`
              : `<button class="btn btn-primary" id="bulk-parse-btn">Preview</button>`
            }
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    document.getElementById('modal-cancel').addEventListener('click', () => modal.remove());
    document.getElementById('modal-close').addEventListener('click',  () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    if (!hasRows) {
      document.getElementById('bulk-download-template')?.addEventListener('click', e => {
        e.preventDefault();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['Name', 'Email', 'Phone'], ['Jane Doe', 'jane@example.com', '+91 98765 43210']]);
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, 'spms_student_template.xlsx');
      });

      document.getElementById('bulk-parse-btn')?.addEventListener('click', () => {
        const file = document.getElementById('bulk-excel-input').files[0];
        if (!file) { showToast('Please select an Excel file', 'error'); return; }
        onConfirm({ action: 'parse', file });
      });
    } else {
      document.getElementById('bulk-import-confirm')?.addEventListener('click', () => {
        onConfirm({ action: 'import', rows });
        modal.remove();
      });

      document.getElementById('bulk-excel-input')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        modal.remove();
        onConfirm({ action: 'parse', file });
      });
    }

    return modal;
  }

  function showConfirm(message, cb, cancelCb = null) {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Confirm</h2></div>
        <div class="modal-body">
          <p style="margin-bottom:1.5rem">${message}</p>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-danger"  id="modal-confirm">Confirm</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const _close = (confirmed) => { modal.remove(); if (!confirmed && cancelCb) cancelCb(); };
    document.getElementById('modal-confirm').addEventListener('click', () => { cb(); modal.remove(); });
    document.getElementById('modal-cancel').addEventListener('click',  () => _close(false));
    modal.addEventListener('click', e => { if (e.target === modal) _close(false); });
  }

  /**
   * Shows a Google-Calendar–style delete modal for recurring events.
   * `cb` is called with one of: 'one' | 'future' | 'all'
   */
  function showDeleteRecurringModal(eventTitle, cb) {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal modal-sm del-recur-modal">
        <div class="modal-header">
          <h2>Delete recurring event</h2>
        </div>
        <div class="modal-body">
          <p class="del-recur-name">&ldquo;${escHtml(eventTitle)}&rdquo;</p>
          <div class="del-recur-options">
            <label class="del-recur-option">
              <input type="radio" name="del-recur-scope" value="one" checked>
              <div class="del-recur-text">
                <span class="del-recur-label">This occurrence</span>
                <span class="del-recur-desc">Remove only this single occurrence</span>
              </div>
            </label>
            <label class="del-recur-option">
              <input type="radio" name="del-recur-scope" value="future">
              <div class="del-recur-text">
                <span class="del-recur-label">This and following occurrences</span>
                <span class="del-recur-desc">Remove this and all future occurrences</span>
              </div>
            </label>
            <label class="del-recur-option">
              <input type="radio" name="del-recur-scope" value="all">
              <div class="del-recur-text">
                <span class="del-recur-label">All occurrences</span>
                <span class="del-recur-desc">Remove the entire recurring series</span>
              </div>
            </label>
          </div>
          <div class="modal-footer" style="margin-top:1.25rem">
            <button class="btn btn-outline" id="del-recur-cancel">Cancel</button>
            <button class="btn btn-danger"  id="del-recur-confirm">Delete</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const _close = () => modal.remove();
    document.getElementById('del-recur-cancel').addEventListener('click', _close);
    modal.addEventListener('click', e => { if (e.target === modal) _close(); });
    document.getElementById('del-recur-confirm').addEventListener('click', () => {
      const scope = modal.querySelector('input[name="del-recur-scope"]:checked')?.value || 'one';
      _close();
      cb(scope);
    });
  }

  function showToast(msg, type = 'success') {
    const t = el('div', `toast toast--${type}`);
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-in'), 10);
    setTimeout(() => { t.classList.remove('toast-in'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // ─── AUTH Screen (Login / Signup) — LOGIN_CHANGE ──────────────────────────
  // Renders the login and signup forms into #auth-screen.
  // The .app-shell is hidden while this is visible (toggled by app.js).

  /**
   * LOGIN_CHANGE UI-1: Render the full auth screen (login + signup panels).
   * @param {function} onLogin  - called with (username, password)
   * @param {function} onSignup - called with (username, password)
   */
  function renderAuthScreen(onLogin, onSignup) {
    const container = document.getElementById('auth-screen');
    if (!container) return;

    container.innerHTML = `
      <div class="auth-split-wrap">

        <!-- Left panel — dark ink brand -->
        <div class="auth-left-panel">
          <div class="auth-brand">
            <div class="auth-logo">SP<span>MS</span></div>
            <p class="auth-tagline">Student Performance Management System</p>
          </div>
          <ul class="auth-left-features">
            <li>Live Final Score for every student</li>
            <li>Attendance, Academic &amp; Mock tracking</li>
            <li>Offline-first with cloud sync</li>
            <li>Admin control across all batches</li>
          </ul>
          <p class="auth-left-note">Trusted by training institutes across India</p>
        </div>

        <!-- Right panel — paper form -->
        <div class="auth-right-panel">
          <div class="auth-card">
            <div class="auth-tabs">
              <button class="auth-tab active" data-auth-tab="login">Login</button>
              <button class="auth-tab"        data-auth-tab="signup">Create Account</button>
            </div>

            <!-- LOGIN PANEL -->
            <div class="auth-panel active" id="auth-panel-login">
              <div class="form-group">
                <label class="auth-label">Username</label>
                <input type="text" id="auth-login-user" class="form-input auth-input"
                  placeholder="Enter your username" autocomplete="username">
              </div>
              <div class="form-group">
                <label class="auth-label">Password</label>
                <input type="password" id="auth-login-pass" class="form-input auth-input"
                  placeholder="Enter your password" autocomplete="current-password">
              </div>
              <div class="auth-error" id="auth-login-error"></div>
              <button class="btn btn-primary btn-auth" id="btn-do-login">Login →</button>
            </div>

            <!-- SIGNUP PANEL — V4: full profile fields + admin key -->
            <div class="auth-panel" id="auth-panel-signup">
              <div class="form-group">
                <label class="auth-label">Full Name *</label>
                <input type="text" id="auth-signup-fullname" class="form-input auth-input"
                  placeholder="e.g. John Doe" autocomplete="name">
              </div>
              <div class="form-group">
                <label class="auth-label">Username *</label>
                <input type="text" id="auth-signup-user" class="form-input auth-input"
                  placeholder="Min 3 characters" autocomplete="username">
              </div>
              <div class="form-group">
                <label class="auth-label">Password *</label>
                <input type="password" id="auth-signup-pass" class="form-input auth-input"
                  placeholder="Min 4 characters" autocomplete="new-password">
              </div>
              <div class="form-group">
                <label class="auth-label">Confirm Password *</label>
                <input type="password" id="auth-signup-confirm" class="form-input auth-input"
                  placeholder="Re-enter password" autocomplete="new-password">
              </div>
              <div class="form-group">
                <label class="auth-label">Email <span class="auth-optional">(optional)</span></label>
                <input type="email" id="auth-signup-email" class="form-input auth-input"
                  placeholder="trainer@example.com" autocomplete="email">
              </div>
              <div class="form-group">
                <label class="auth-label">Phone <span class="auth-optional">(optional)</span></label>
                <input type="text" id="auth-signup-phone" class="form-input auth-input"
                  placeholder="+91 XXXXX XXXXX" autocomplete="tel">
              </div>
              <div class="form-group">
                <label class="auth-label">Admin Key <span class="auth-optional">(optional — only for admins)</span></label>
                <input type="password" id="auth-signup-adminkey" class="form-input auth-input"
                  placeholder="Leave blank for Trainer account">
              </div>
              <div class="auth-error" id="auth-signup-error"></div>
              <button class="btn btn-primary btn-auth" id="btn-do-signup">Create Account →</button>
            </div>
          </div>

          <p class="auth-footer">All data is stored locally in your browser. No internet required.</p>
        </div>

      </div>`;

    // Tab switching
    container.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        container.querySelector(`#auth-panel-${tab.dataset.authTab}`).classList.add('active');
        // Clear errors on switch
        container.querySelectorAll('.auth-error').forEach(e => { e.textContent = ''; e.style.display = 'none'; });
      });
    });

    // LOGIN — Enter key support
    const loginPassInp = container.querySelector('#auth-login-pass');
    loginPassInp?.addEventListener('keydown', e => { if (e.key === 'Enter') container.querySelector('#btn-do-login')?.click(); });
    container.querySelector('#auth-login-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginPassInp?.focus(); });

    // LOGIN — button
    container.querySelector('#btn-do-login')?.addEventListener('click', () => {
      const u = container.querySelector('#auth-login-user')?.value.trim();
      const p = container.querySelector('#auth-login-pass')?.value;
      _authShowError('auth-login-error', '');
      onLogin(u, p);
    });

    // SIGNUP — Enter key support
    const signupPassInp    = container.querySelector('#auth-signup-pass');
    const signupConfirmInp = container.querySelector('#auth-signup-confirm');
    container.querySelector('#auth-signup-fullname')?.addEventListener('keydown', e => { if (e.key === 'Enter') container.querySelector('#auth-signup-user')?.focus(); });
    container.querySelector('#auth-signup-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') signupPassInp?.focus(); });
    signupPassInp?.addEventListener('keydown', e => { if (e.key === 'Enter') signupConfirmInp?.focus(); });
    signupConfirmInp?.addEventListener('keydown', e => { if (e.key === 'Enter') container.querySelector('#btn-do-signup')?.click(); });

    // SIGNUP — button: V4 collects full profile object
    container.querySelector('#btn-do-signup')?.addEventListener('click', () => {
      const fullName = container.querySelector('#auth-signup-fullname')?.value.trim() || '';
      const u        = container.querySelector('#auth-signup-user')?.value.trim()     || '';
      const p        = container.querySelector('#auth-signup-pass')?.value            || '';
      const p2       = container.querySelector('#auth-signup-confirm')?.value         || '';
      const email    = container.querySelector('#auth-signup-email')?.value.trim()    || '';
      const phone    = container.querySelector('#auth-signup-phone')?.value.trim()    || '';
      const adminKey = container.querySelector('#auth-signup-adminkey')?.value        || '';
      _authShowError('auth-signup-error', '');
      if (p !== p2) { _authShowError('auth-signup-error', 'Passwords do not match.'); return; }
      onSignup({ username: u, password: p, fullName, email, phone, adminKey });
    });

    // Focus first field
    setTimeout(() => container.querySelector('#auth-login-user')?.focus(), 80);
  }

  /** LOGIN_CHANGE UI-2: Show an error message inside an auth panel */
  function _authShowError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent    = message;
    el.style.display  = message ? 'block' : 'none';
  }

  /** LOGIN_CHANGE UI-3: Show auth error from outside (called by app.js) */
  function showAuthError(panelId, message) {
    _authShowError(panelId, message);
  }

  /**
   * V4: Toggle between auth screen and main app shell.
   * @param {boolean}      loggedIn - true = show app, false = show auth
   * @param {object|null}  user     - full user object (when logged in)
   */
  // Phase 2: populate the header avatar button with user info
  function _updateHeaderAvatar(user) {
    const btn        = document.getElementById('btn-header-profile');
    const circle     = document.getElementById('header-avatar-circle');
    const nameEl     = document.getElementById('header-avatar-name');
    const roleEl     = document.getElementById('header-avatar-role');
    if (!btn) return;

    const displayName = user.fullName || user.username;
    const isAdmin     = user.role === 'admin';

    if (circle) circle.outerHTML = _avatarHTML(displayName, 'sm', '').replace(
      'class="user-avatar',
      'id="header-avatar-circle" class="user-avatar'
    );

    const freshName = document.getElementById('header-avatar-name');
    const freshRole = document.getElementById('header-avatar-role');
    if (freshName) freshName.textContent = displayName.length > 18
      ? displayName.slice(0, 16) + '…'
      : displayName;
    if (freshRole) freshRole.textContent = isAdmin ? 'Admin' : 'Trainer';

    btn.style.display = '';
  }

  function _clearHeaderAvatar() {
    const btn = document.getElementById('btn-header-profile');
    if (btn) btn.style.display = 'none';
  }

  function setAuthState(loggedIn, user = null) {
    const authScreen = document.getElementById('auth-screen');
    const appShell   = document.getElementById('app-shell');
    const userLabel  = document.getElementById('header-username');
    const logoutBtn  = document.getElementById('btn-logout');

    if (loggedIn && user) {
      if (authScreen) authScreen.style.display = 'none';
      if (appShell)   appShell.style.display   = '';
      // hide the old text username pill — avatar button replaces it
      if (userLabel)  userLabel.style.display  = 'none';
      if (logoutBtn)  logoutBtn.style.display  = '';
      _updateHeaderAvatar(user);
    } else {
      if (authScreen) authScreen.style.display = '';
      if (appShell)   appShell.style.display   = 'none';
      if (userLabel)  userLabel.style.display  = 'none';
      if (logoutBtn)  logoutBtn.style.display  = 'none';
      _clearHeaderAvatar();
    }
  }

  // ─── STUDENT_PORTAL: Student shell auth state ─────────────────────────────

  function setStudentAuthState(loggedIn, user = null) {
    const authScreen   = document.getElementById('auth-screen');
    const studentShell = document.getElementById('student-shell');
    const appShell     = document.getElementById('app-shell');
    const userLabel    = document.getElementById('student-header-username');
    const logoutBtn    = document.getElementById('btn-student-logout');

    if (loggedIn && user) {
      if (authScreen)   authScreen.style.display   = 'none';
      if (appShell)     appShell.style.display     = 'none';
      if (studentShell) studentShell.style.display = '';
      if (userLabel)  { userLabel.textContent = user.fullName || user.username; userLabel.style.display = ''; }
      if (logoutBtn)    logoutBtn.style.display = '';
    } else {
      if (studentShell) studentShell.style.display = 'none';
      if (authScreen)   authScreen.style.display   = '';
      if (userLabel)    userLabel.style.display     = 'none';
      if (logoutBtn)    logoutBtn.style.display     = 'none';
    }
  }

  // ─── V4: Profile Page ──────────────────────────────────────────────────────

  /**
   * Renders the logged-in user's profile page into #main-content.
   * Event wiring (save/change-password/delete) is done via data-action
   * attributes caught by handleMainClick in app.js.
   */
  // ─── Academics Screens (Phase 6) ──────────────────────────────────────────

  function renderAcademicsTests(batch) {
    const main = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];

    const rows = students.map(s => {
      const tests   = s.weeklyTests || [];
      const avg     = tests.length
        ? tests.reduce((sum, t) => sum + (t.marks / t.total) * 100, 0) / tests.length
        : null;
      const last    = tests.length ? tests[tests.length - 1] : null;
      const cls     = avg === null ? 'neutral' : avg >= 75 ? 'good' : avg >= 50 ? 'warn' : 'bad';
      return `
        <tr class="acad-row" data-sid="${s.id}" style="cursor:pointer" title="Click to add/view tests">
          <td>
            <div class="student-cell">
              ${_avatarHTML(s.name, 'sm')}
              <span>${escHtml(s.name)}</span>
            </div>
          </td>
          <td>${tests.length}</td>
          <td style="min-width:160px">
            ${avg !== null
              ? `<span class="pi-value pi--${cls}">${avg.toFixed(1)}%</span> ${scoreBar(avg, cls)}`
              : '<span style="color:var(--text3)">—</span>'}
          </td>
          <td>${last ? fmtDate(last.date) : '—'}</td>
        </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Weekly Tests</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${students.length} student${students.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table" id="acad-table">
          <thead><tr>
            <th>Student</th><th>Tests</th><th>Average Score</th><th>Last Test</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.6rem">Click a student row to add or view their test scores.</p>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.bookOpen}</div>
        <div class="empty-state-title">No students in this batch</div>
        <div class="empty-state-msg">Add students first via Manage Batch.</div>
       </div>`}
      <div class="slideout-overlay" id="acad-overlay"></div>
      <div class="slideout-panel" id="acad-panel"></div>`;
  }

  function renderAcademicsExams(batch) {
    const main = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];

    function modBadge(student, moduleNum) {
      const mods = Calc.moduleStats(student);
      const m    = mods.find(x => x.moduleNum === moduleNum);
      if (!m || !m.appeared) return `<span class="acad-mod-badge acad-mod-badge--pending">Not Attempted</span>`;
      if (m.cleared)         return `<span class="acad-mod-badge acad-mod-badge--cleared">Cleared</span>`;
      return                         `<span class="acad-mod-badge acad-mod-badge--failed">Failed</span>`;
    }

    const rows = students.map(s => `
      <tr class="acad-row" data-sid="${s.id}" style="cursor:pointer" title="Click to enter exam scores">
        <td><div class="student-cell">${_avatarHTML(s.name, 'sm')}<span>${escHtml(s.name)}</span></div></td>
        <td>${modBadge(s, 1)}</td>
        <td>${modBadge(s, 2)}</td>
        <td>${modBadge(s, 3)}</td>
      </tr>`).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Module Exams</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${students.length} student${students.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table" id="acad-table">
          <thead><tr>
            <th>Student</th><th>Module 1</th><th>Module 2</th><th>Module 3</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.6rem">Click a student to open their full exam score form.</p>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.notepad}</div>
        <div class="empty-state-title">No students in this batch</div>
       </div>`}`;
  }

  // ─── Student Remarks — Phase 8 ────────────────────────────────────────────

  function renderRemarksCallsScreen(batch) {
    const main     = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];

    const rows = students.map(s => {
      const logs     = s.callLogs || [];
      const connects = (s.sessions || []).filter(x => x.remark === 'Call Connect');
      const total    = logs.length + connects.length;
      const all      = [
        ...logs.map(l => l.date),
        ...connects.map(c => c.date)
      ].sort((a,b) => b.localeCompare(a));
      const last = all[0] || null;
      return `
        <tr class="acad-row" data-sid="${s.id}" style="cursor:pointer" title="View/add call records">
          <td><div class="student-cell">${_avatarHTML(s.name,'sm')}<span>${escHtml(s.name)}</span></div></td>
          <td>${total || '<span style="color:var(--text3)">—</span>'}</td>
          <td>${last ? fmtDate(last) : '<span style="color:var(--text3)">—</span>'}</td>
        </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Call Records</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${students.length} student${students.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table" id="remarks-table">
          <thead><tr><th>Student</th><th>Total Calls</th><th>Last Call</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.6rem">Click a student to view or add call records.</p>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.phone}</div>
        <div class="empty-state-title">No students in this batch</div>
        <div class="empty-state-msg">Add students first via Manage Batch.</div>
      </div>`}
      <div class="slideout-overlay" id="remarks-overlay"></div>
      <div class="slideout-panel" id="remarks-panel"></div>`;
  }

  function renderRemarksNotesScreen(batch) {
    const main     = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];

    const rows = students.map(s => {
      const notes = s.notes || [];
      const last  = notes.length ? notes[notes.length - 1] : null;
      return `
        <tr class="acad-row" data-sid="${s.id}" style="cursor:pointer" title="View/add notes">
          <td><div class="student-cell">${_avatarHTML(s.name,'sm')}<span>${escHtml(s.name)}</span></div></td>
          <td>${notes.length || '<span style="color:var(--text3)">—</span>'}</td>
          <td>${last ? fmtDate(last.date) : '<span style="color:var(--text3)">—</span>'}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">
            ${last ? escHtml(last.text) : '<span style="color:var(--text3)">—</span>'}
          </td>
        </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Student Notes</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${students.length} student${students.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table" id="remarks-table">
          <thead><tr><th>Student</th><th>Notes</th><th>Last Note</th><th>Preview</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.6rem">Click a student to view or add trainer notes.</p>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.notepad}</div>
        <div class="empty-state-title">No students in this batch</div>
        <div class="empty-state-msg">Add students first via Manage Batch.</div>
      </div>`}
      <div class="slideout-overlay" id="remarks-overlay"></div>
      <div class="slideout-panel" id="remarks-panel"></div>`;
  }

  function remarksCallsSlideOver(student, batchId) {
    const today = _localDateStr();
    // Combine callLogs + Call Connect sessions, sorted newest-first
    const logs     = (student.callLogs || []).map(l => ({
      id: l.id, date: l.date, type: 'Manual', text: l.remark || '—', deletable: true
    }));
    const connects = (student.sessions || [])
      .filter(s => s.remark === 'Call Connect')
      .map(s => ({
        id: `cc_${s.date}`, date: s.date, type: 'Attendance',
        text: s.callNote || 'No note recorded.', deletable: false
      }));
    const all = [...logs, ...connects].sort((a,b) => b.date.localeCompare(a.date));

    const histHTML = all.length ? all.map(r => `
      <div class="acad-hist-card">
        <div class="acad-hist-header">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            <span class="acad-hist-label">${fmtDate(r.date)}</span>
            <span class="rem-tag rem-tag--${r.type === 'Manual' ? 'manual' : 'auto'}">${r.type}</span>
          </div>
          ${r.deletable ? `<button class="btn btn-outline btn-sm" data-action="rem-call-del"
            data-bid="${batchId}" data-sid="${student.id}" data-id="${r.id}">${_ICONS.close}</button>` : ''}
        </div>
        <p class="rem-note-text">${escHtml(r.text)}</p>
      </div>`).join('') :
      `<p style="color:var(--text3);font-size:.85rem;padding:.5rem 0">No call records yet.</p>`;

    return `
      <div class="slideout-header">
        <button class="slideout-back-btn" data-action="remarks-close">←</button>
        <div class="slideout-header-info">
          <span class="slideout-title">${escHtml(student.name)}</span>
          <span class="slideout-subtitle">Call Records</span>
        </div>
      </div>
      <div class="slideout-body">
        <div class="acad-add-card">
          <div class="acad-add-title">Log a Call</div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr">
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="rem-call-date" class="form-input" value="${today}">
            </div>
            <div class="form-group">
              <label>Call Type / Outcome</label>
              <input type="text" id="rem-call-type" class="form-input" placeholder="e.g. Follow-up, Warning…">
            </div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea id="rem-call-note" class="form-input form-textarea" rows="2"
              placeholder="What was discussed…"></textarea>
          </div>
          <button class="btn btn-primary btn-sm" data-action="rem-call-save"
            data-bid="${batchId}" data-sid="${student.id}">Save Call Record</button>
        </div>
        <div class="acad-hist-list">${histHTML}</div>
      </div>`;
  }

  function remarksNotesSlideOver(student, batchId) {
    const today = _localDateStr();
    const notes = [...(student.notes || [])].reverse();

    const histHTML = notes.length ? notes.map((n, ri) => {
      const origIdx = (student.notes || []).length - 1 - ri;
      return `
        <div class="acad-hist-card">
          <div class="acad-hist-header">
            <span class="acad-hist-label">${fmtDate(n.date)}</span>
            <button class="btn btn-outline btn-sm" data-action="rem-note-del"
              data-bid="${batchId}" data-sid="${student.id}" data-idx="${origIdx}">${_ICONS.close}</button>
          </div>
          <p class="rem-note-text">${escHtml(n.text)}</p>
        </div>`;
    }).join('') :
    `<p style="color:var(--text3);font-size:.85rem;padding:.5rem 0">No notes yet.</p>`;

    return `
      <div class="slideout-header">
        <button class="slideout-back-btn" data-action="remarks-close">←</button>
        <div class="slideout-header-info">
          <span class="slideout-title">${escHtml(student.name)}</span>
          <span class="slideout-subtitle">Trainer Notes</span>
        </div>
      </div>
      <div class="slideout-body">
        <div class="acad-add-card">
          <div class="acad-add-title">Add Note</div>
          <div class="form-group">
            <textarea id="rem-note-text" class="form-input form-textarea" rows="3"
              placeholder="Observations, feedback, follow-ups…"></textarea>
          </div>
          <button class="btn btn-primary btn-sm" data-action="rem-note-save"
            data-bid="${batchId}" data-sid="${student.id}">Save Note</button>
        </div>
        <div class="acad-hist-list">${histHTML}</div>
      </div>`;
  }

  function academicsTestSlideOver(student, batchId) {
    const tests    = student.weeklyTests || [];
    const reversed = [...tests].reverse();
    const today    = _localDateStr();
    const nextLabel = `Week ${tests.length + 1}`;

    const histHTML = reversed.length
      ? reversed.map((t, ri) => {
          const origIdx = tests.length - 1 - ri;
          const pct     = (t.marks / t.total) * 100;
          const cls     = pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad';
          return `
            <div class="acad-hist-row">
              <div class="acad-hist-meta">
                <span class="acad-hist-week">${escHtml(t.week || `Test ${origIdx + 1}`)}</span>
                <span class="acad-hist-date">${fmtDate(t.date)}</span>
              </div>
              <span class="pi-value pi--${cls}">${t.marks}/${t.total} &middot; ${pct.toFixed(1)}%</span>
              <button class="btn-icon btn-icon--danger" data-action="acad-delete-test"
                data-bid="${batchId}" data-sid="${student.id}" data-idx="${origIdx}" title="Remove">${_ICONS.close}</button>
            </div>`;
        }).join('')
      : `<div class="acad-hist-empty">No tests recorded yet.</div>`;

    return `
      <div class="slideout-header">
        <button class="slideout-back-btn" data-action="acad-close">←</button>
        <span class="slideout-title">${escHtml(student.name)} — Weekly Tests</span>
      </div>
      <div class="slideout-body">
        <div class="acad-add-card">
          <div class="acad-add-title">Add Test Score</div>
          <div class="form-grid form-grid--2" style="margin-bottom:.65rem">
            <div class="form-group" style="margin:0">
              <label>Week Label</label>
              <input id="acad-week" class="form-input" value="${nextLabel}" placeholder="e.g. Week 1">
            </div>
            <div class="form-group" style="margin:0">
              <label>Date</label>
              <input id="acad-date" type="date" class="form-input" value="${today}">
            </div>
          </div>
          <div class="form-grid form-grid--2" style="margin-bottom:.75rem">
            <div class="form-group" style="margin:0">
              <label>Marks Obtained</label>
              <input id="acad-marks" type="number" class="form-input" min="0" placeholder="e.g. 85">
            </div>
            <div class="form-group" style="margin:0">
              <label>Total Marks</label>
              <input id="acad-total" type="number" class="form-input" min="1" value="100">
            </div>
          </div>
          <button class="btn btn-primary btn-sm" data-action="acad-add-test"
            data-bid="${batchId}" data-sid="${student.id}">Save Test</button>
        </div>
        <div class="acad-hist-section">
          <div class="acad-hist-header">
            Test History
            <span class="acad-hist-count">${tests.length} test${tests.length !== 1 ? 's' : ''}</span>
          </div>
          ${histHTML}
        </div>
      </div>`;
  }

  // ─── Manage Batch Screen (Phase 5) ────────────────────────────────────────

  function renderManageBatch(batch, activeTab = 'details') {
    const main = document.getElementById('main-content');
    if (!main) return;

    const students    = batch.students || [];
    const holidays    = batch.holidays || [];
    const statusOpts  = ['active','upcoming','completed','archived']
      .map(v => `<option value="${v}"${(batch.status||'active')===v?' selected':''}>
        ${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('');

    // Meeting link: trainer-specific (keyed by current user id)
    const _cu = (typeof Storage !== 'undefined') ? Storage.getCurrentUser() : null;
    const _meetingLinks = batch.meetingLinks || {};
    const _meetingLink  = _cu ? (_meetingLinks[_cu.id] || '') : '';

    // ── Details tab ──
    const detailsHTML = `
      <form class="mb-form" id="manage-batch-form" novalidate>
        <div class="mb-section">
          <div class="mb-section-title">Basic Info</div>
          <div class="form-grid form-grid--2">
            <div class="form-group">
              <label>Batch Name <span class="form-required">*</span></label>
              <input type="text" id="mb-name" class="form-input" value="${escHtml(batch.name)}" placeholder="e.g. Full Stack Dev – Jan 2025">
            </div>
            <div class="form-group">
              <label>Batch Code</label>
              <input type="text" id="mb-code" class="form-input" value="${escHtml(batch.batchCode||'')}" placeholder="e.g. FSD-25A">
            </div>
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="mb-desc" class="form-input" value="${escHtml(batch.description||'')}" placeholder="Optional description">
          </div>
        </div>

        <div class="mb-section">
          <div class="mb-section-title">Schedule &amp; Capacity</div>
          <div class="form-grid form-grid--3">
            <div class="form-group">
              <label>Start Date</label>
              <input type="date" id="mb-start" class="form-input" value="${batch.startDate||''}">
            </div>
            <div class="form-group">
              <label>End Date</label>
              <input type="date" id="mb-end" class="form-input" value="${batch.endDate||''}">
            </div>
            <div class="form-group">
              <label>Capacity <span class="form-hint">(0 = unlimited)</span></label>
              <input type="number" id="mb-capacity" class="form-input" min="0" value="${batch.capacity||0}">
            </div>
          </div>
          <div class="form-group" style="max-width:200px">
            <label>Status</label>
            <select id="mb-status" class="form-input">${statusOpts}</select>
          </div>
        </div>

        <div class="mb-section">
          <div class="mb-section-title">Meeting Link <span class="form-hint">(trainer-specific)</span></div>
          <div class="form-group">
            <label>Virtual Meeting URL</label>
            <div class="meeting-link-input-row">
              <input type="url" id="mb-meeting-link" class="form-input" value="${escHtml(_meetingLink)}" placeholder="https://meet.google.com/...">
            </div>
          </div>
        </div>

        <div class="mb-actions">
          <button type="submit" class="btn btn-primary" id="mb-save-btn">Save Changes</button>
        </div>
      </form>

      <div class="mb-section batch-danger-zone">
        <div class="mb-section-title">Batch Actions</div>
        <div class="batch-actions-row">
          ${batch.archived
            ? `<button class="btn btn-outline" id="mb-unarchive-batch">Unarchive Batch</button>`
            : `<button class="btn btn-outline" id="mb-archive-batch">Archive Batch</button>`
          }
          <button class="btn btn-danger" id="mb-delete-batch">Delete Batch</button>
        </div>
      </div>`;

    // ── Students tab ──
    const studentsHTML = `
      <div class="mb-section-bar">
        <span class="mb-count">${students.length} student${students.length!==1?'s':''} enrolled</span>
        <div class="mb-section-bar-actions">
          <button class="btn btn-outline btn-sm" id="mb-import-excel">${_ICONS.upload} Import Excel</button>
          <button class="btn btn-primary btn-sm" data-action="add-student" data-bid="${batch.id}">+ Add Student</button>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>ID</th><th>Name</th><th>Email</th><th>Enrolled</th><th style="text-align:right">Actions</th>
          </tr></thead>
          <tbody>
            ${students.map(s => `<tr>
              <td><code>${escHtml(s.studentId||'—')}</code></td>
              <td><strong>${escHtml(s.name)}</strong></td>
              <td>${escHtml(s.email||'—')}</td>
              <td>${s.createdAt ? fmtDate(s.createdAt) : '—'}</td>
              <td style="text-align:right">
                <button class="btn-icon" data-action="edit-student" data-bid="${batch.id}" data-sid="${s.id}" title="Edit">✎</button>
                <button class="btn-icon btn-icon--danger" data-action="remove-student" data-bid="${batch.id}" data-sid="${s.id}" title="Remove">${_ICONS.close}</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <div class="empty-state-icon">${_ICONS.users}</div>
        <div class="empty-state-title">No students yet</div>
        <div class="empty-state-msg">Add students to start tracking their performance.</div>
      </div>`}`;

    // ── Holidays tab ──
    const holidaysHTML = `
      <div class="mb-section-bar">
        <span class="mb-count">${holidays.length} holiday${holidays.length!==1?'s':''} added</span>
        <button class="btn btn-primary btn-sm" data-action="add-holiday" data-bid="${batch.id}">+ Add Holiday</button>
      </div>
      ${holidays.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            ${holidays.map((h,i) => `<tr>
              <td><strong>${fmtDate(h.date)}</strong></td>
              <td>${escHtml(h.reason||h.description||'—')}</td>
              <td style="text-align:right">
                <button class="btn-icon btn-icon--danger" data-action="remove-holiday" data-bid="${batch.id}" data-hidx="${i}" title="Remove">${_ICONS.close}</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <div class="empty-state-icon">${_ICONS.calendar}</div>
        <div class="empty-state-title">No holidays added</div>
        <div class="empty-state-msg">Holidays are excluded from attendance calculations.</div>
      </div>`}`;

    // ── Reports tab ──
    const reportsHTML = `
      <div class="mb-section">
        <div class="mb-section-title">Export Reports</div>
        <p class="mb-section-desc">Download student performance data and progress reports.</p>
        <button class="btn btn-primary" id="mb-export-reports">${_ICONS.download} Export Reports</button>
      </div>`;

    const tabs = [
      { id: 'details',  label: 'Batch Details' },
      { id: 'students', label: 'Students'       },
      { id: 'holidays', label: 'Holidays'       },
      { id: 'reports',  label: 'Reports'        },
    ];

    const tabsHTML = tabs.map(t =>
      `<button class="manage-tab${t.id===activeTab?' manage-tab--active':''}" data-manage-tab="${t.id}">${t.label}</button>`
    ).join('');

    const bodyMap = { details: detailsHTML, students: studentsHTML, holidays: holidaysHTML, reports: reportsHTML };

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">${escHtml(batch.name)}
            <span class="batch-status-badge batch-status--${batch.status||'active'}">${_statusLabel(batch.status)}</span>
          </h1>
          <p class="view-sub">Manage batch settings, students, and holidays</p>
        </div>
      </div>
      <nav class="manage-tabs" id="manage-tabs">${tabsHTML}</nav>
      <div id="manage-tab-body">${bodyMap[activeTab]||detailsHTML}</div>`;
  }

  function renderSettings() {
    const main = document.getElementById('main-content');
    if (!main) return;
    const dark = document.body.classList.contains('dark');
    main.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Settings</h1>
        <p class="view-sub">App preferences and data management</p>
      </div>
      <div class="settings-wrap">
        <div class="settings-section">
          <div class="settings-section-title">Appearance</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Dark Mode</div>
              <div class="settings-row-desc">Switch between light and dark theme</div>
            </div>
            <button class="btn btn-outline btn-sm" id="settings-dark-toggle">${dark ? 'Switch to Light' : 'Switch to Dark'}</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Data Management</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Download Backup</div>
              <div class="settings-row-desc">Export all your data as a JSON file</div>
            </div>
            <button class="btn btn-outline btn-sm" id="settings-backup-btn">Download</button>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Restore from Backup</div>
              <div class="settings-row-desc">Import a previously downloaded JSON backup</div>
            </div>
            <button class="btn btn-outline btn-sm" id="settings-restore-btn">Choose File</button>
          </div>
        </div>
      </div>`;
  }

  function renderProfilePage(user) {
    const main = document.getElementById('main-content');
    if (!main) return;

    const myBatches   = Storage.getMyBatches();
    const allStudents = myBatches.reduce((acc, b) => acc + (b.students?.length || 0), 0);
    let   totalFS = 0, fsCount = 0;
    myBatches.forEach(b => {
      const ctx = { holidays: b.holidays || [] };
      (b.students || []).forEach(s => {
        const m = Calc.allMetrics(s, ctx);
        totalFS += m.finalScore; fsCount++;
      });
    });
    const avgFS = fsCount ? (totalFS / fsCount) : 0;
    const isAdmin = user.role === 'admin';

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">My Profile</h1>
          <p class="view-sub">Manage your account and personal information</p>
        </div>
      </div>

      <div class="profile-page-grid">

        <!-- ── Identity card ───────────────────────────── -->
        <div class="card profile-identity-card">
          ${_avatarHTML(user.fullName || user.username, 'xl')}
          <div class="profile-id-info">
            <div class="profile-fullname">${user.fullName || user.username}</div>
            <div class="role-badge ${isAdmin ? 'role-badge--admin' : 'role-badge--trainer'}">
              ${isAdmin ? `${_ICONS.shield} Admin` : (user.designation?.trim() || 'Trainer')}
            </div>
            <div class="profile-username">@${user.username}</div>
            ${user.email ? `<div class="profile-contact">✉ ${user.email}</div>` : ''}
            ${user.phone ? `<div class="profile-contact">${_ICONS.phone} ${user.phone}</div>` : ''}
            <div class="profile-since">Member since ${fmtDate(user.createdAt)}</div>
          </div>
        </div>

        <!-- ── Edit personal info ──────────────────────── -->
        <div class="card profile-edit-card">
          <h3 class="card-title">Personal Information</h3>
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="prof-fullname" class="form-input" value="${user.fullName || ''}">
          </div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="prof-username" class="form-input" value="${user.username || ''}">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="prof-email" class="form-input" value="${user.email || ''}" placeholder="email@example.com">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="text" id="prof-phone" class="form-input" value="${user.phone || ''}" placeholder="+91 XXXXX XXXXX">
          </div>
          ${!isAdmin ? `
          <div class="form-group">
            <label>Designation <span class="form-hint">(e.g. Technical Faculty, PD Faculty)</span></label>
            <input type="text" id="prof-designation" class="form-input" value="${user.designation || ''}"
              placeholder="e.g. Technical Faculty">
          </div>` : ''}
          <div class="profile-save-row">
            <span class="auth-error" id="prof-edit-error"  style="display:none"></span>
            <span class="auth-error prof-success"          id="prof-edit-success" style="display:none"></span>
            <button class="btn btn-primary" data-action="save-profile">Save Changes</button>
          </div>
        </div>

        <!-- ── Statistics ──────────────────────────────── -->
        <div class="card profile-stats-card">
          <h3 class="card-title">${isAdmin ? 'All-System Statistics' : 'My Statistics'}</h3>
          <div class="profile-stats-grid">
            <div class="profile-stat-item">
              <div class="profile-stat-value">${myBatches.length}</div>
              <div class="profile-stat-label">${isAdmin ? 'My Batches' : 'Total Batches'}</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-value">${allStudents}</div>
              <div class="profile-stat-label">Total Students</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-value pi--${piColor(avgFS)}">${fmt(avgFS)}</div>
              <div class="profile-stat-label">Avg Final Score</div>
            </div>
          </div>
        </div>

        <!-- ── Security ────────────────────────────────── -->
        <div class="card profile-security-card">
          <h3 class="card-title">Security & Account</h3>
          <p class="tab-hint">Manage your credentials or permanently delete this account.</p>
          <div class="profile-security-actions">
            <button class="btn btn-outline profile-sec-btn" data-action="change-password">${_ICONS.lockClosed} Change Password</button>
            <button class="btn btn-danger  profile-sec-btn" data-action="delete-account">${_ICONS.trash} Delete My Account</button>
          </div>
        </div>

      </div>`;
  }

  // ─── V4: Admin Dashboard ───────────────────────────────────────────────────

  /**
   * Renders the admin panel into #main-content.
   * Shows all users + their batches. Admin can click any batch to open it.
   */
  // ─── P2: Manage Instructors Modal ────────────────────────────────────────

  /**
   * Live modal for managing a batch's instructors and substitution schedule.
   * All changes are immediately persisted; the modal body re-renders after each action.
   * onRefresh() is called on close so the batch dashboard updates its instructor panel.
   */
  function showManageInstructorsModal(batchId, onRefresh) {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal modal--wide">
        <div class="modal-header">
          <h2><span class="title-icon" aria-hidden="true">${_ICONS.users}</span> Manage Instructors</h2>
          <button class="modal-close" id="im-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body" id="im-body"></div>
      </div>`;
    document.body.appendChild(modal);

    function refresh() {
      const batch = Storage.getBatch(batchId);
      if (!batch) { modal.remove(); return; }
      _renderInstrModalBody(document.getElementById('im-body'), batch, refresh);
    }

    refresh();

    document.getElementById('im-close').addEventListener('click', () => {
      modal.remove();
      onRefresh();
    });
    modal.addEventListener('click', e => {
      if (e.target === modal) { modal.remove(); onRefresh(); }
    });
    return modal;
  }

  /** Renders/re-renders the body of the instructor management modal. */
  function _renderInstrModalBody(container, batch, refresh) {
    if (!container) return;
    const instrs  = batch.instructors  || [];
    const subs    = batch.substitutions || [];
    const roleLabels = { primary: 'Primary', assistant: 'Assistant', substitute: 'Substitute' };
    const roleColors = { primary: 'instr-role--primary', assistant: 'instr-role--assistant', substitute: 'instr-role--substitute' };

    // ── Instructors list ──────────────────────────────────────────────────────
    const instrRows = instrs.length ? instrs.map(i => `
      <tr class="im-instr-row" data-iid="${i.id}">
        <td>
          <div style="display:flex;align-items:center;gap:.5rem">
            <span class="instr-avatar" style="background:${_makeAvatarBg(i.name)};color:#fff;font-size:.7rem">${_makeInitials(i.name)}</span>
            <input type="text" class="form-input im-name-inp" value="${i.name}" style="max-width:180px" data-iid="${i.id}">
          </div>
        </td>
        <td>
          <select class="form-input im-role-sel" data-iid="${i.id}" style="min-width:120px">
            ${['primary','assistant','substitute'].map(r =>
              `<option value="${r}"${i.role === r ? ' selected' : ''}>${roleLabels[r]}</option>`
            ).join('')}
          </select>
        </td>
        <td>
          <button class="btn btn-sm btn-outline im-save-instr" data-iid="${i.id}">Save</button>
          <button class="btn btn-sm btn-danger  im-remove-instr" data-iid="${i.id}" style="margin-left:.3rem">${_ICONS.close}</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:.75rem">No instructors added yet.</td></tr>`;

    // ── Substitution rows ─────────────────────────────────────────────────────
    const subRows = subs.length ? subs.map(s => {
      const instr = instrs.find(i => i.id === s.instructorId);
      const name  = instr ? instr.name : s.instructorId;
      return `<tr>
        <td><span class="instr-role-badge ${roleColors[instr?.role] || 'instr-role--substitute'}">${name}</span></td>
        <td>${fmtDate(s.startDate)}</td>
        <td>${fmtDate(s.endDate)}</td>
        <td>
          <button class="btn btn-sm btn-danger im-remove-sub"
            data-iid="${s.instructorId}" data-start="${s.startDate}">${_ICONS.close}</button>
        </td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:.75rem">No substitutions scheduled.</td></tr>`;

    // ── Instructor select options for substitution add form ───────────────────
    const instrOpts = instrs.length
      ? instrs.map(i => `<option value="${i.id}">${i.name} (${roleLabels[i.role]})</option>`).join('')
      : '<option value="" disabled>Add an instructor first</option>';

    container.innerHTML = `
      <div class="im-section">
        <h3 class="im-section-title">Current Instructors</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>${instrRows}</tbody>
          </table>
        </div>

        <div class="im-add-row">
          <input type="text" id="im-new-name" class="form-input" placeholder="Instructor name" style="flex:1">
          <select id="im-new-role" class="form-input" style="min-width:130px">
            <option value="assistant">Assistant</option>
            <option value="primary">Primary</option>
            <option value="substitute">Substitute</option>
          </select>
          <button class="btn btn-primary" id="im-add-btn">+ Add</button>
        </div>
        <p id="im-add-error" style="color:var(--bad);font-size:.82rem;min-height:1.2em;margin-top:.25rem"></p>
      </div>

      <div class="im-section">
        <h3 class="im-section-title">Substitution Schedule</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Instructor</th><th>Start Date</th><th>End Date</th><th></th></tr></thead>
            <tbody>${subRows}</tbody>
          </table>
        </div>

        <div class="im-add-row" style="margin-top:.75rem">
          <select id="im-sub-instr" class="form-input" style="min-width:160px">${instrOpts}</select>
          <input type="date" id="im-sub-start" class="form-input">
          <input type="date" id="im-sub-end"   class="form-input">
          <button class="btn btn-primary" id="im-add-sub-btn">+ Add</button>
        </div>
        <p id="im-sub-error" style="color:var(--bad);font-size:.82rem;min-height:1.2em;margin-top:.25rem"></p>
      </div>`;

    // ── Bind events ───────────────────────────────────────────────────────────

    // Add instructor
    container.querySelector('#im-add-btn').addEventListener('click', () => {
      const name = container.querySelector('#im-new-name').value.trim();
      const errEl = container.querySelector('#im-add-error');
      if (!name) { errEl.textContent = 'Name is required.'; return; }
      errEl.textContent = '';
      Storage.addBatchInstructor(batch.id, name, container.querySelector('#im-new-role').value);
      refresh();
    });

    // Save individual instructor changes (name + role)
    container.querySelectorAll('.im-save-instr').forEach(btn => {
      btn.addEventListener('click', () => {
        const iid  = btn.dataset.iid;
        const row  = container.querySelector(`.im-instr-row[data-iid="${iid}"]`);
        const name = row.querySelector(`.im-name-inp[data-iid="${iid}"]`).value.trim();
        const role = row.querySelector(`.im-role-sel[data-iid="${iid}"]`).value;
        if (!name) return;
        Storage.updateBatchInstructor(batch.id, iid, { name, role });
        refresh();
      });
    });

    // Remove instructor
    container.querySelectorAll('.im-remove-instr').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = Storage.removeBatchInstructor(batch.id, btn.dataset.iid);
        if (!result.ok) { showToast(result.error, 'error'); return; }
        refresh();
      });
    });

    // Add substitution
    container.querySelector('#im-add-sub-btn').addEventListener('click', () => {
      const instrId = container.querySelector('#im-sub-instr').value;
      const start   = container.querySelector('#im-sub-start').value;
      const end     = container.querySelector('#im-sub-end').value;
      const errEl   = container.querySelector('#im-sub-error');
      if (!instrId) { errEl.textContent = 'Select an instructor.'; return; }
      if (!start)   { errEl.textContent = 'Start date is required.'; return; }
      if (!end)     { errEl.textContent = 'End date is required.'; return; }
      if (end < start) { errEl.textContent = 'End date cannot be before start date.'; return; }
      errEl.textContent = '';
      Storage.addSubstitution(batch.id, instrId, start, end);
      refresh();
    });

    // Remove substitution
    container.querySelectorAll('.im-remove-sub').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.removeSubstitution(batch.id, btn.dataset.iid, btn.dataset.start);
        refresh();
      });
    });
  }

  // ─── P5: Admin Control Center helpers ────────────────────────────────────

  /**
   * Returns analytics for a single instructor across their batches.
   * AD1: a batch is included if the user is the primary instructor (owner),
   * OR if they appear in assignedTrainers[] (PD Faculty / assigned role).
   */
  function _calcInstructorMetrics(userId, allBatches) {
    // Only count batches this user owns/is primary on.
    // Assigned trainers are helpers — their assisted batches are credited to the
    // primary instructor only, and they are excluded from Faculty Performance reports.
    const batches = allBatches.filter(b =>
      b.ownerId === userId || b.primaryInstructorId === userId
    );
    let totalFS = 0, totalAtt = 0, totalAcademic = 0, count = 0;
    batches.forEach(b => {
      const ctx = { holidays: b.holidays || [] };
      (b.students || []).forEach(s => {
        const m       = Calc.allMetrics(s, ctx);
        totalFS      += m.finalScore;
        totalAtt     += m.attendance;
        totalAcademic += m.academic;
        count++;
      });
    });
    return {
      batches:     batches.length,
      students:    count,
      avgFinalScore: count > 0 ? totalFS / count : 0,
      avgAtt:      count > 0 ? totalAtt      / count : 0,
      avgAcademic: count > 0 ? totalAcademic / count : 0
    };
  }

  /** Shared status label lookup used across admin views */
  function _statusLabel(status) {
    return { active: 'Active', upcoming: 'Upcoming',
             completed: 'Completed', archived: 'Archived' }[status || 'active'] || status;
  }

  // ─── P5: Admin Control Center ─────────────────────────────────────────────

  function renderAdminDashboard() {
    const main       = document.getElementById('main-content');
    if (!main) return;
    const allUsers   = Storage.getAllUsers();
    const allBatches = Storage.getBatches();

    // ── Institute-wide aggregates ──────────────────────────────────────────
    const totalStudents = allBatches.reduce((a, b) => a + (b.students?.length || 0), 0);
    const activeBatches = allBatches.filter(b => (b.status || 'active') === 'active').length;
    const totalTrainers = allUsers.filter(u => u.role === 'trainer').length;
    let fsSum = 0, fsCount = 0;
    allBatches.forEach(b => {
      const ctx = { holidays: b.holidays || [] };
      (b.students || []).forEach(s => { const m = Calc.allMetrics(s, ctx); fsSum += m.finalScore; fsCount++; });
    });
    const avgFS = fsCount > 0 ? fsSum / fsCount : 0;

    // User lookup map
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

    // ── Cross-batch chart section — only rendered when there are 2+ batches ──
    const chartSection = allBatches.length >= 2 ? `
      <div class="card acc-section p4-chart-section">
        <div class="card-header">
          <h2 class="card-title">Cross-Batch Performance Comparison</h2>
          <span class="acc-count">${allBatches.length} batches</span>
        </div>
        <div class="p4-chart-wrap">
          <canvas id="chart-cross-batch"></canvas>
        </div>
      </div>` : '';

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Admin Control Center</h1>
          <p class="view-sub">Institute-wide visibility and management</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" id="btn-admin-export">${_ICONS.download} Export Reports</button>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:1.5rem">
        ${statCard('Total Batches',    allBatches.length, _ICONS.allBatches, 'neutral')}
        ${statCard('Active Batches',   activeBatches,     _ICONS.check,      activeBatches > 0 ? 'good' : 'neutral')}
        ${statCard('Total Students',   totalStudents,     _ICONS.users,      'neutral')}
        ${statCard('Total Trainers',   totalTrainers,     _ICONS.academics,  'neutral')}
        ${statCard('Institute Avg Final Score', fsCount > 0 ? fmt(avgFS) : '—', _ICONS.chartBar, piColor(avgFS))}
      </div>

      ${chartSection}

      <div class="card acc-section">
        <div class="card-header">
          <h2 class="card-title">All Batches</h2>
          <span class="acc-count">${allBatches.length} total</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Batch Name</th><th>Code</th><th>Technical Faculty</th>
                <th>Students</th><th>Capacity</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${allBatches.length ? allBatches.map(b => {
                const instrId   = b.primaryInstructorId || b.ownerId;
                const instr     = userMap[instrId];
                const instrName = instr ? (instr.fullName || instr.username) : '—';
                const capDisp   = b.capacity > 0
                  ? `${b.students?.length || 0} / ${b.capacity}` : (b.students?.length || 0);
                return `<tr>
                  <td><strong>${b.name}</strong></td>
                  <td><code>${b.batchCode || '—'}</code></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:.45rem">
                      ${_avatarHTML(instr ? (instr.fullName || instr.username) : '?', 'sm')}
                      <span>${instrName}</span>
                    </div>
                  </td>
                  <td>${b.students?.length || 0}</td>
                  <td>${capDisp}</td>
                  <td><span class="batch-status-badge batch-status--${b.status || 'active'}">${_statusLabel(b.status)}</span></td>
                  <td><button class="btn btn-sm btn-outline" data-action="admin-view-batch" data-bid="${b.id}">View →</button></td>
                </tr>`;
              }).join('') : `<tr><td colspan="7" class="acc-empty">No batches yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card acc-section">
        <div class="card-header">
          <h2 class="card-title">Faculty Performance Report</h2>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Faculty</th><th>Designation</th><th>Batches</th><th>Students</th>
                <th>Avg Final Score</th><th>Avg Attendance</th><th>Avg Academic</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                // Only show users who own at least one batch — assigned-only trainers are
                // helpers with no independent credit and are excluded from this report.
                const facultyUsers = allUsers.filter(u => {
                  if (u.role === 'student') return false;
                  return allBatches.some(b => b.ownerId === u.id || b.primaryInstructorId === u.id);
                });
                if (!facultyUsers.length)
                  return `<tr><td colspan="7" class="acc-empty">No faculty found.</td></tr>`;
                return facultyUsers.map(u => {
                  const metrics = _calcInstructorMetrics(u.id, allBatches);
                  const isAdm   = u.role === 'admin';
                  // AD1: show designation if set, else fall back to role label
                  const desg    = u.designation?.trim()
                    || (isAdm ? 'Admin' : 'Technical Faculty');
                  const has     = metrics.students > 0;
                  return `<tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:.6rem">
                        ${_avatarHTML(u.fullName || u.username, 'sm')}
                        <div>
                          <div style="font-weight:600">${u.fullName || u.username}</div>
                          <div style="font-size:.75rem;color:var(--text3)">@${u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="role-badge-inline ${isAdm ? 'role-badge--admin' : 'role-badge--trainer'}">
                        ${desg}
                      </span>
                    </td>
                    <td>${metrics.batches}</td>
                    <td>${metrics.students}</td>
                    <td><strong class="pi-value pi--${piColor(metrics.avgFinalScore)}">${has ? fmt(metrics.avgFinalScore) : '—'}</strong></td>
                    <td>${has ? fmt(metrics.avgAtt) + '%' : '—'}</td>
                    <td>${has ? fmt(metrics.avgAcademic) + '%' : '—'}</td>
                  </tr>`;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card acc-section">
        <div class="card-header">
          <h2 class="card-title">User Management</h2>
          <span class="acc-count">${allUsers.length} accounts</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Username</th><th>Role</th><th>Details</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${allUsers.map(u => {
                const isCurrentUser = u.id === Storage.getCurrentUser()?.id;
                const roleBadge = u.role === 'admin'
                  ? `<span class="role-badge-inline role-badge--admin">Admin</span>`
                  : u.role === 'student'
                    ? `<span class="role-badge-inline role-badge--student">Student</span>`
                    : `<span class="role-badge-inline role-badge--trainer">Trainer</span>`;
                // Details column: designation for staff, linked batch for students
                const details = u.role === 'student'
                  ? `<span style="font-size:.78rem;color:var(--text3)">Student portal</span>`
                  : (u.designation || '<span style="color:var(--text3)">—</span>');
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:.6rem">
                      ${_avatarHTML(u.fullName || u.username, 'sm')}
                      <div>
                        <div style="font-weight:600">${u.fullName || u.username}</div>
                        <div style="font-size:.75rem;color:var(--text3)">${u.email || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><code>@${u.username}</code></td>
                  <td>${roleBadge}</td>
                  <td>${details}</td>
                  <td>
                    ${isCurrentUser
                      ? `<span style="font-size:.78rem;color:var(--text3)">Current session</span>`
                      : `<div class="kebab-wrap">
                           <button class="btn-kebab" data-action="user-kebab" data-uid="${u.id}" title="Actions">${_ICONS.dotsV}</button>
                           <div class="kebab-menu" id="kebab-${u.id}">
                             <button class="kebab-item kebab-item--danger" data-action="admin-delete-user"
                               data-uid="${u.id}" data-uname="${u.username}">${_ICONS.trash} Delete Account</button>
                           </div>
                         </div>`
                    }
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${_renderScoringConfigPanel()}`;

    // Wire live validation for scoring config inputs now that they are in the DOM
    _bindScoringConfigUI();
  }

  // ─── Scoring Config Panel (editable — Phase E) ───────────────────────────
  /**
   * Renders the editable Scoring Configuration card inside the Admin Control Center.
   * Inputs are pre-filled with the currently active config (custom or defaults).
   * Live validation and save/reset buttons wired via _bindScoringConfigUI()
   * which is called by renderAdminDashboard() after innerHTML is set.
   */
  function _renderScoringConfigPanel() {
    const cfg = ScoringConfig.load();
    const w   = cfg.weights;
    const t   = cfg.thresholds;

    // ── Status line ────────────────────────────────────────────────────────
    let statusHTML;
    if (cfg.isDefault) {
      statusHTML = `<span style="color:var(--text3);font-size:.85rem">Using defaults — no custom configuration saved.</span>`;
    } else {
      const savedDate = cfg.savedAt
        ? new Date(cfg.savedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
        : '—';
      const savedBy = cfg.savedBy
        ? (() => { const u = Storage.getAllUsers().find(x => x.id === cfg.savedBy); return u ? (u.fullName || u.username) : cfg.savedBy; })()
        : '—';
      statusHTML = `<span style="color:var(--success,#16a34a);font-size:.85rem">✔ Custom config active — last saved ${savedDate} by ${savedBy}.</span>`;
    }

    // ── Input row helper ───────────────────────────────────────────────────
    const weightInput = (label, id, value) => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
        <label for="${id}" style="width:130px;font-size:.88rem;color:var(--text2);flex-shrink:0">${label}</label>
        <input type="number" id="${id}" value="${value}" min="0" max="100" step="0.1"
          class="form-input--xs cfg-weight-input" style="width:72px;text-align:right">
        <span style="font-size:.85rem;color:var(--text3)">%</span>
      </div>`;

    return `
      <div class="card acc-section">
        <div class="card-header">
          <h2 class="card-title">Scoring Configuration</h2>
          <span class="acc-count">${cfg.isDefault ? 'Defaults Active' : 'Custom Active'}</span>
        </div>

        <!-- Status + warning -->
        <div style="padding:.75rem 1.25rem .25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
          <div>${statusHTML}</div>
          <div style="font-size:.78rem;color:#d97706;background:#fef3c7;padding:.3rem .7rem;border-radius:6px;border:1px solid #fde68a">
            Warning: Changes apply immediately to all student scores and categories.
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;padding:1rem 1.25rem 1.25rem">

          <!-- ── Final Score Weights ── -->
          <div>
            <div style="font-weight:600;font-size:.9rem;margin-bottom:.75rem;color:var(--text1)">
              Final Score Weights
              <span style="font-weight:400;font-size:.78rem;color:var(--text3);margin-left:.4rem">(must total 100%)</span>
            </div>
            ${weightInput('Attendance',   'cfg-w-attendance',   w.attendance)}
            ${weightInput('Academic',     'cfg-w-academic',     w.academic)}
            ${weightInput('Presentation', 'cfg-w-presentation', w.presentation)}
            ${weightInput('AI Mock',      'cfg-w-aimock',       w.aiMock)}
            ${weightInput('Manual Mock',  'cfg-w-manualmock',   w.manualMock)}

            <div style="display:flex;align-items:center;justify-content:flex-end;gap:.6rem;margin-top:.6rem">
              <span style="font-size:.82rem;color:var(--text3)">Total:</span>
              <strong id="cfg-total-display" style="font-size:.95rem;color:#16a34a">${w.attendance + w.academic + w.presentation + w.aiMock + w.manualMock}%</strong>
            </div>
            <div id="cfg-weight-error" style="color:#dc2626;font-size:.8rem;margin-top:.35rem;min-height:1.1rem"></div>
          </div>

          <!-- ── Placement Category Thresholds ── -->
          <div>
            <div style="font-weight:600;font-size:.9rem;margin-bottom:.75rem;color:var(--text1)">
              Placement Category Thresholds
            </div>

            <div style="display:flex;flex-direction:column;gap:.75rem">

              <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1rem;
                          background:var(--bg2,#f1f5f9);border-radius:8px;border-left:4px solid #16a34a">
                <span style="font-size:1.2rem;font-weight:700;color:#16a34a;width:18px">A</span>
                <span style="font-size:.85rem;color:var(--text2);flex:1">Final Score ≥</span>
                <input type="number" id="cfg-t-a" value="${t.a}" min="1" max="99" step="1"
                  class="form-input--xs" style="width:60px;text-align:right">
              </div>

              <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1rem;
                          background:var(--bg2,#f1f5f9);border-radius:8px;border-left:4px solid #d97706">
                <span style="font-size:1.2rem;font-weight:700;color:#d97706;width:18px">B</span>
                <span style="font-size:.85rem;color:var(--text2);flex:1">Final Score ≥</span>
                <input type="number" id="cfg-t-b" value="${t.b}" min="1" max="99" step="1"
                  class="form-input--xs" style="width:60px;text-align:right">
              </div>

              <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1rem;
                          background:var(--bg2,#f1f5f9);border-radius:8px;border-left:4px solid #dc2626">
                <span style="font-size:1.2rem;font-weight:700;color:#dc2626;width:18px">C</span>
                <span style="font-size:.85rem;color:var(--text2)">Final Score &lt; <strong id="cfg-c-display">${t.b}</strong></span>
              </div>

            </div>
            <div id="cfg-threshold-error" style="color:#dc2626;font-size:.8rem;margin-top:.5rem;min-height:1.1rem"></div>
          </div>

        </div>

        <!-- ── Action buttons ── -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:.75rem;
                    padding:.75rem 1.25rem 1.25rem;border-top:1px solid var(--border)">
          <button class="btn btn-outline btn-sm" data-action="reset-scoring-config"
            style="color:var(--text3)">
            ↺ Reset to Defaults
          </button>
          <button class="btn btn-primary btn-sm" id="cfg-save-btn" data-action="save-scoring-config">
            Save Configuration
          </button>
        </div>

      </div>`;
  }

  /**
   * Wires live validation for the Scoring Configuration panel inputs.
   * Called by renderAdminDashboard() immediately after main.innerHTML is set.
   * Updates: total display, weight error, C threshold label, threshold error,
   *          save button disabled state.
   */
  function _bindScoringConfigUI() {
    const weightIds = ['cfg-w-attendance','cfg-w-academic','cfg-w-presentation','cfg-w-aimock','cfg-w-manualmock'];

    function _updateWeightUI() {
      const total = weightIds.reduce((s, id) => {
        const el = document.getElementById(id);
        return s + (el ? (parseFloat(el.value) || 0) : 0);
      }, 0);
      const rounded = Math.round(total * 10) / 10;

      const totalEl = document.getElementById('cfg-total-display');
      const errEl   = document.getElementById('cfg-weight-error');
      if (totalEl) {
        totalEl.textContent = rounded + '%';
        totalEl.style.color = rounded === 100 ? '#16a34a' : '#dc2626';
      }
      if (errEl) {
        errEl.textContent = rounded === 100 ? '' : `Total must be exactly 100%. Currently: ${rounded}%`;
      }
      _updateSaveBtn();
    }

    function _updateThresholdUI() {
      const aEl = document.getElementById('cfg-t-a');
      const bEl = document.getElementById('cfg-t-b');
      const cEl = document.getElementById('cfg-c-display');
      const errEl = document.getElementById('cfg-threshold-error');

      const aVal = parseFloat(aEl?.value) || 0;
      const bVal = parseFloat(bEl?.value) || 0;

      if (cEl) cEl.textContent = bVal;

      const invalid = aVal <= bVal;
      if (errEl) {
        errEl.textContent = invalid ? 'Category A threshold must be greater than Category B.' : '';
      }
      _updateSaveBtn();
    }

    function _updateSaveBtn() {
      const btn = document.getElementById('cfg-save-btn');
      if (!btn) return;

      const weightIds2 = ['cfg-w-attendance','cfg-w-academic','cfg-w-presentation','cfg-w-aimock','cfg-w-manualmock'];
      const total   = weightIds2.reduce((s, id) => s + (parseFloat(document.getElementById(id)?.value) || 0), 0);
      const rounded = Math.round(total * 10) / 10;

      const aVal = parseFloat(document.getElementById('cfg-t-a')?.value) || 0;
      const bVal = parseFloat(document.getElementById('cfg-t-b')?.value) || 0;

      btn.disabled = (rounded !== 100) || (aVal <= bVal);
    }

    // Wire weight inputs
    weightIds.forEach(id => {
      document.getElementById(id)?.addEventListener('input', _updateWeightUI);
    });

    // Wire threshold inputs
    document.getElementById('cfg-t-a')?.addEventListener('input', _updateThresholdUI);
    document.getElementById('cfg-t-b')?.addEventListener('input', _updateThresholdUI);

    // Run once on load to set initial state
    _updateWeightUI();
    _updateThresholdUI();
  }

  // ─── Phase 11: Focused Admin Screens ─────────────────────────────────────

  function renderAdminAllBatchesScreen() {
    const main       = document.getElementById('main-content');
    if (!main) return;
    const allUsers   = Storage.getAllUsers();
    const allBatches = Storage.getBatches();
    const userMap    = Object.fromEntries(allUsers.map(u => [u.id, u]));

    const totalStudents = allBatches.reduce((a, b) => a + (b.students?.length || 0), 0);
    const activeBatches = allBatches.filter(b => (b.status || 'active') === 'active').length;
    let fsSum = 0, fsCount = 0;
    allBatches.forEach(b => {
      const ctx = { holidays: b.holidays || [] };
      (b.students || []).forEach(s => { const m = Calc.allMetrics(s, ctx); fsSum += m.finalScore; fsCount++; });
    });
    const avgFS = fsCount > 0 ? fsSum / fsCount : 0;

    const rows = allBatches.length ? allBatches.map(b => {
      const instrId   = b.primaryInstructorId || b.ownerId;
      const instr     = userMap[instrId];
      const instrName = instr ? (instr.fullName || instr.username) : '—';
      const capDisp   = b.capacity > 0
        ? `${b.students?.length || 0} / ${b.capacity}` : (b.students?.length || 0);
      return `<tr>
        <td><strong>${escHtml(b.name)}</strong></td>
        <td><code>${b.batchCode || '—'}</code></td>
        <td>
          <div style="display:flex;align-items:center;gap:.45rem">
            ${_avatarHTML(instr ? (instr.fullName || instr.username) : '?', 'sm')}
            <span>${escHtml(instrName)}</span>
          </div>
        </td>
        <td>${b.students?.length || 0}</td>
        <td>${capDisp}</td>
        <td><span class="batch-status-badge batch-status--${b.status || 'active'}">${_statusLabel(b.status)}</span></td>
        <td><button class="btn btn-sm btn-outline" data-action="admin-view-batch" data-bid="${b.id}">View →</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="acc-empty">No batches yet.</td></tr>`;

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">All Batches</h1>
          <p class="view-sub">Institute-wide batch overview</p>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:1.5rem">
        ${statCard('Total Batches',  allBatches.length, _ICONS.allBatches, 'neutral')}
        ${statCard('Active',         activeBatches,     _ICONS.check,      activeBatches > 0 ? 'good' : 'neutral')}
        ${statCard('Total Students', totalStudents,     _ICONS.users,      'neutral')}
        ${statCard('Institute Avg',  fsCount > 0 ? fmt(avgFS) : '—', _ICONS.chartBar, piColor(avgFS))}
      </div>
      <div class="card acc-section">
        <div class="card-header">
          <h2 class="card-title">Batches</h2>
          <span class="acc-count">${allBatches.length} total</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Batch Name</th><th>Code</th><th>Technical Faculty</th>
              <th>Students</th><th>Capacity</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderAdminManageUsersScreen() {
    const main     = document.getElementById('main-content');
    if (!main) return;
    const allUsers = Storage.getAllUsers();
    const curId    = Storage.getCurrentUser()?.id;

    const rows = allUsers.map(u => {
      const isCur = u.id === curId;
      const roleBadge = u.role === 'admin'
        ? `<span class="role-badge-inline role-badge--admin">Admin</span>`
        : u.role === 'student'
          ? `<span class="role-badge-inline role-badge--student">Student</span>`
          : `<span class="role-badge-inline role-badge--trainer">Trainer</span>`;
      const details = u.role === 'student'
        ? `<span style="font-size:.78rem;color:var(--text3)">Student portal</span>`
        : escHtml(u.designation || '—');
      // data-search: all searchable text lowercased for fast client-side filtering
      const searchText = [u.fullName || '', u.username || '', u.email || '', u.designation || '']
        .join(' ').toLowerCase();
      return `<tr data-role="${u.role}" data-search="${escHtml(searchText)}">
        <td>
          <div style="display:flex;align-items:center;gap:.6rem">
            ${_avatarHTML(u.fullName || u.username, 'sm')}
            <div>
              <div style="font-weight:600">${escHtml(u.fullName || u.username)}</div>
              <div style="font-size:.75rem;color:var(--text3)">${escHtml(u.email || '')}</div>
            </div>
          </div>
        </td>
        <td><code>@${escHtml(u.username)}</code></td>
        <td>${roleBadge}</td>
        <td>${details}</td>
        <td>
          ${isCur
            ? `<span style="font-size:.78rem;color:var(--text3)">You</span>`
            : `<div class="kebab-wrap">
                 <button class="btn-kebab" data-action="user-kebab" data-uid="${u.id}" title="Actions">${_ICONS.dotsV}</button>
                 <div class="kebab-menu" id="kebab-${u.id}">
                   <button class="kebab-item kebab-item--danger" data-action="admin-delete-user"
                     data-uid="${u.id}" data-uname="${u.username}">${_ICONS.trash} Delete Account</button>
                 </div>
               </div>`
          }
        </td>
      </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Manage Users</h1>
          <p class="view-sub">${allUsers.length} account${allUsers.length !== 1 ? 's' : ''} registered</p>
        </div>
      </div>
      <div class="card acc-section">
        <div class="card-header" style="flex-wrap:wrap;gap:.6rem">
          <div style="display:flex;align-items:center;gap:.6rem;flex:1;min-width:0">
            <h2 class="card-title">All Accounts</h2>
            <span class="acc-count" id="user-count-badge">${allUsers.length} total</span>
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <input type="text" class="search-input" id="user-search"
              placeholder="Search name, username, email…" style="width:13rem">
            <select class="form-select form-select--sm" id="user-role-filter">
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="trainer">Trainer</option>
              <option value="student">Student</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Details</th><th>Action</th></tr></thead>
            <tbody id="user-table-body">${rows}</tbody>
          </table>
          <p class="empty-state" id="user-empty-state" style="display:none">No users match your search.</p>
        </div>
        <p style="font-size:.8rem;color:var(--text3);margin-top:.75rem">
          New accounts are created via the Sign Up screen. Only admins can delete accounts.
        </p>
      </div>`;

    _bindUserSearchUI(allUsers.length);
  }

  function _bindUserSearchUI(total) {
    const searchInp  = document.getElementById('user-search');
    const roleFilter = document.getElementById('user-role-filter');
    const countBadge = document.getElementById('user-count-badge');
    const emptyState = document.getElementById('user-empty-state');
    const tbody      = document.getElementById('user-table-body');
    if (!searchInp || !roleFilter || !tbody) return;

    function applyFilter() {
      const q    = searchInp.value.toLowerCase().trim();
      const role = roleFilter.value;
      let visible = 0;
      tbody.querySelectorAll('tr').forEach(row => {
        const matchSearch = !q    || row.dataset.search.includes(q);
        const matchRole   = !role || row.dataset.role === role;
        const show        = matchSearch && matchRole;
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      if (countBadge) countBadge.textContent = visible === total ? `${total} total` : `${visible} of ${total}`;
      if (emptyState) emptyState.style.display = visible === 0 ? '' : 'none';
    }

    searchInp.addEventListener('input', applyFilter);
    roleFilter.addEventListener('change', applyFilter);
  }

  function renderAdminScoringScreen() {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Scoring Config</h1>
          <p class="view-sub">Adjust weights and thresholds for the performance algorithm</p>
        </div>
      </div>
      ${_renderScoringConfigPanel()}`;
    _bindScoringConfigUI();
  }

  function renderAdminSyncScreen() {
    const main = document.getElementById('main-content');
    if (!main) return;
    const batches  = Storage.getBatches();
    const users    = Storage.getAllUsers();
    const isOnline = navigator.onLine;

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Sync Status</h1>
          <p class="view-sub">Supabase cloud sync — write-through cache</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" id="btn-force-sync">↻ Force Sync Now</button>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:1.5rem">
        ${statCard('Connection', isOnline ? 'Online' : 'Offline', _ICONS.sync, isOnline ? 'good' : 'bad')}
        ${statCard('Batches Cached', batches.length, _ICONS.allBatches, 'neutral')}
        ${statCard('Users Cached',   users.length,   _ICONS.users, 'neutral')}
      </div>

      <div class="card acc-section">
        <div class="card-header"><h2 class="card-title">Sync Details</h2></div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.75rem">
          <div class="sync-detail-row">
            <span class="sync-detail-label">Cloud Provider</span>
            <span class="sync-detail-val">Supabase</span>
          </div>
          <div class="sync-detail-row">
            <span class="sync-detail-label">Sync Mode</span>
            <span class="sync-detail-val">Write-through (1.5 s debounce)</span>
          </div>
          <div class="sync-detail-row">
            <span class="sync-detail-label">Network Status</span>
            <span class="sync-detail-val ${isOnline ? 'sync-online' : 'sync-offline'}">${isOnline ? '● Online' : '● Offline'}</span>
          </div>
          <div class="sync-detail-row">
            <span class="sync-detail-label">Local Cache</span>
            <span class="sync-detail-val">${batches.length} batches · ${users.length} users</span>
          </div>
        </div>
      </div>
`;


    document.getElementById('btn-force-sync')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-force-sync');
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      const user = Storage.getCurrentUser();
      try {
        await SupabaseSync.hydrateUsers();
        if (user) await SupabaseSync.hydrateBatches(user.id, user.role === 'admin');
        UI.showToast('Sync complete!', 'success');
      } catch (e) {
        UI.showToast('Sync failed — check connection.', 'error');
      }
      if (btn) { btn.disabled = false; btn.textContent = '↻ Force Sync Now'; }
      renderAdminSyncScreen();
    });
  }

  // ─── P5: Admin Batch Detail View ─────────────────────────────────────────

  function renderAdminBatchDetail(batch, allUsers) {
    const main    = document.getElementById('main-content');
    if (!main) return;
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
    const ctx     = { holidays: batch.holidays || [] };

    const instrId    = batch.primaryInstructorId || batch.ownerId;
    const instr      = userMap[instrId];
    const instrName  = instr ? (instr.fullName || instr.username) : '—';
    // AD1: use assignedTrainers (replaces assistantInstructors)
    const assignedTrainers = (batch.assignedTrainers || [])
      .map(aid => { const a = userMap[aid]; return a ? (a.fullName || a.username) : aid; })
      .join(', ') || '—';

    main.innerHTML = `
      <div class="view-header">
        <div>
          <button class="btn btn-outline btn-sm acc-back-btn" data-action="back-admin">← Control Center</button>
          <h1 class="view-title" style="margin-top:.4rem">${batch.name}
            <span class="batch-status-badge batch-status--${batch.status || 'active'}">${_statusLabel(batch.status)}</span>
          </h1>
          <p class="view-sub">Admin Batch View — read &amp; manage</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" data-action="admin-assign-instructors" data-bid="${batch.id}">👤 Assign Faculty</button>
        </div>
      </div>

      <div class="card acc-detail-card">
        <div class="acc-detail-grid">
          <div class="acc-detail-item">
            <span class="acc-detail-label">Batch Code</span>
            <span class="acc-detail-value">${batch.batchCode || '—'}</span>
          </div>
          <div class="acc-detail-item">
            <span class="acc-detail-label">Start Date</span>
            <span class="acc-detail-value">${fmtDate(batch.startDate) || '—'}</span>
          </div>
          <div class="acc-detail-item">
            <span class="acc-detail-label">End Date</span>
            <span class="acc-detail-value">${fmtDate(batch.endDate) || '—'}</span>
          </div>
          <div class="acc-detail-item">
            <span class="acc-detail-label">Capacity</span>
            <span class="acc-detail-value">${batch.capacity > 0 ? batch.capacity : 'Unlimited'}</span>
          </div>
          <div class="acc-detail-item">
            <span class="acc-detail-label">Technical Faculty</span>
            <span class="acc-detail-value" style="display:flex;align-items:center;gap:.4rem">
              ${_avatarHTML(instrName, 'sm')} ${instrName}
            </span>
          </div>
          <div class="acc-detail-item">
            <span class="acc-detail-label">Assigned Trainers</span>
            <span class="acc-detail-value">${assignedTrainers}</span>
          </div>
        </div>
      </div>

      <div class="card acc-section">
        <div class="card-header">
          <h2 class="card-title">Students</h2>
          <span class="acc-count">${batch.students?.length || 0} enrolled</span>
        </div>
        ${(batch.students || []).length ? `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Enrolled</th>
                <th>Final Score</th>
                <th>Attendance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${(batch.students || []).map(s => {
                const m = Calc.allMetrics(s, ctx);
                return `<tr>
                  <td><code>${s.studentId}</code></td>
                  <td><strong>${s.name}</strong></td>
                  <td>${s.createdAt ? fmtDate(s.createdAt) : '—'}</td>
                  <td><strong class="pi-value pi--${piColor(m.finalScore)}">${fmt(m.finalScore)}</strong></td>
                  <td>${fmt(m.attendance)}% ${scoreBar(m.attendance)}</td>
                  <td>
                    <button class="btn-icon btn-icon--transfer"
                      data-action="admin-transfer-student"
                      data-sid="${s.id}" data-bid="${batch.id}"
                      title="Transfer Student">🔀</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : '<div class="empty-state">No students in this batch.</div>'}
      </div>`;
  }

  // ─── P5: Instructor Assignment Modal ─────────────────────────────────────

  function showInstructorAssignModal(batch, allUsers, onSave) {
    const modal             = el('div', 'modal-overlay');
    const currentPrimary    = batch.primaryInstructorId || batch.ownerId || '';
    // AD1: use assignedTrainers (replaces assistantInstructors)
    const currentAssigned   = batch.assignedTrainers || [];
    // AD1: only show trainer accounts in the assign modal (exclude student portal accounts)
    const eligibleUsers     = allUsers.filter(u => u.role !== 'student');

    const primaryOpts = eligibleUsers.map(u =>
      `<option value="${u.id}"${u.id === currentPrimary ? ' selected' : ''}>${u.fullName || u.username} (@${u.username})</option>`
    ).join('');

    const assignedChecks = eligibleUsers.map(u => `
      <label class="acc-check-label">
        <input type="checkbox" class="acc-asst-chk" value="${u.id}"${currentAssigned.includes(u.id) ? ' checked' : ''}>
        ${_avatarHTML(u.fullName || u.username, 'sm')}
        <span>${u.fullName || u.username} <em style="color:var(--text3)">@${u.username}</em>
          ${u.designation ? `<span class="acc-desg-tag">${u.designation}</span>` : ''}
        </span>
      </label>`
    ).join('');

    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Assign Faculty</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p style="font-size:.85rem;color:var(--text2);margin-bottom:1rem">Batch: <strong>${batch.name}</strong></p>
          <div class="form-group">
            <label>Technical Faculty <span style="color:var(--bad)">*</span></label>
            <select id="f-primary-instr" class="form-input">
              ${eligibleUsers.length ? primaryOpts : '<option value="">No users available</option>'}
            </select>
          </div>
          <div class="form-group">
            <label>Assigned Trainers <span class="form-hint">(optional — e.g. PD Faculty)</span></label>
            <div class="acc-check-group">
              ${assignedChecks || '<p class="empty-hint">No users available.</p>'}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm">Save Assignment</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.getElementById('f-primary-instr')?.focus();

    document.getElementById('modal-confirm')?.addEventListener('click', () => {
      const primaryId = document.getElementById('f-primary-instr').value;
      if (!primaryId) { return; }
      // AD1: collect assignedTrainer ids (exclude the primary from the list)
      const assignedIds = [...document.querySelectorAll('.acc-asst-chk:checked')]
        .map(c => c.value).filter(id => id !== primaryId);
      modal.remove();
      onSave(primaryId, assignedIds);
    });
    document.getElementById('modal-cancel')?.addEventListener('click', () => modal.remove());
    document.getElementById('modal-close')?.addEventListener('click',  () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    return modal;
  }

  // ─── V4: Change Password Modal ─────────────────────────────────────────────

  function showChangePasswordModal(onSave) {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Change Password</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Current Password</label>
            <input type="password" id="cp-old" class="form-input" placeholder="Enter current password">
          </div>
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="cp-new" class="form-input" placeholder="Min 4 characters">
          </div>
          <div class="form-group">
            <label>Confirm New Password</label>
            <input type="password" id="cp-confirm" class="form-input" placeholder="Re-enter new password">
          </div>
          <div class="auth-error" id="cp-error" style="display:none"></div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm">Update Password</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('cp-old').focus();

    document.getElementById('modal-confirm').addEventListener('click', () => {
      const old    = document.getElementById('cp-old').value;
      const np     = document.getElementById('cp-new').value;
      const conf   = document.getElementById('cp-confirm').value;
      const errEl  = document.getElementById('cp-error');
      errEl.style.display = 'none';
      if (!old)          { errEl.textContent = 'Enter your current password.';            errEl.style.display = 'block'; return; }
      if (np.length < 4) { errEl.textContent = 'New password must be at least 4 characters.'; errEl.style.display = 'block'; return; }
      if (np !== conf)   { errEl.textContent = 'Passwords do not match.';                 errEl.style.display = 'block'; return; }
      onSave(old, np, errEl, modal);
    });
    const close = () => modal.remove();
    document.getElementById('modal-close').addEventListener('click',  close);
    document.getElementById('modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    return modal;
  }

  // ─── v5: Presentation Schedule View ──────────────────────────────────────

  /**
   * v6: Renders the Presentation Schedule view (attendance-driven).
   * @param {Object}        batch
   * @param {number}        year
   * @param {number}        month       0-based
   * @param {Object}        schedule    { slots: {}, skips: {} }
   * @param {string}        todayISO    timezone-safe today date (YYYY-MM-DD)
   * @param {Object|null}   todaySkip   { reason } or null
   * @param {function}      onEval      (studentId, date)
   * @param {function}      onSkip      (reason) — mark today as no-presentation day
   * @param {function}      onRemoveSkip () — undo today's skip
   * @param {function}      onNav       (year, month)
   * @param {function}      onBack
   */
  function renderPresentationSchedule(batch, year, month, schedule, todayISO, todaySkip, onEval, onSkip, onRemoveSkip, onNav, onBack) {
    const main      = document.getElementById('main-content');
    const students  = batch.students || [];
    const monthName = new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const slots     = schedule?.slots || {};

    // Student name helper — handles removed-student placeholder
    const sName = id => {
      if (!id || id === '[removed]') return '[Removed Student]';
      const s = students.find(x => x.id === id);
      return s ? s.name : id;
    };

    // All days with slots, sorted chronologically
    const days = Object.keys(slots).sort();

    // Per-student monthly completion counts
    const monthlyCount = {};
    days.forEach(date => {
      (slots[date] || []).forEach(sl => {
        if (sl.completed) monthlyCount[sl.studentId] = (monthlyCount[sl.studentId] || 0) + 1;
      });
    });

    // Is this the current month?
    const todayParts    = todayISO.split('-').map(Number); // [y, m, d]
    const isCurrentMonth = year === todayParts[0] && month === (todayParts[1] - 1);
    const todaySlots     = isCurrentMonth ? (slots[todayISO] || []) : [];

    // Stats bar totals
    const totalCompleted = days.reduce((a, d) => a + slots[d].filter(sl => sl.completed).length, 0);
    const totalMissed    = days.reduce((a, d) => a + slots[d].filter(sl => sl.missed).length, 0);
    const totalPending   = days.reduce((a, d) => a + slots[d].filter(sl => !sl.completed && !sl.missed).length, 0);

    // Reusable slot row builder
    const slotRow = (sl, date, showEval) => {
      const s = students.find(x => x.id === sl.studentId);
      let badge = '';
      if      (sl.completed) badge = '<span class="att-tag att-tag-working">✓ Done</span>';
      else if (sl.missed)    badge = '<span class="att-tag att-tag-holiday">✗ Missed</span>';
      return `<div class="pres-slot-row ${sl.completed ? 'pres-slot-done' : sl.missed ? 'pres-slot-missed' : ''}">
        <span class="pres-slot-num">Slot ${sl.slot}</span>
        <span class="pres-slot-name">${s ? s.name : sName(sl.studentId)}</span>
        <span class="pres-slot-id">${s ? (s.studentId || '') : ''}</span>
        ${badge}
        <div class="pres-slot-actions">
          ${!sl.completed && !sl.missed && showEval
            ? `<button class="btn btn-primary btn-sm" data-pres-eval="${sl.studentId}" data-pres-date="${date}">Evaluate</button>`
            : ''}
        </div>
      </div>`;
    };

    // Active students (excludes removed placeholders) sorted by name
    const activeStudents = students.filter(s => s && s.id && s.id !== '[removed]');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Presentation Schedule</h1>
          <p class="view-sub">${batch.name} &nbsp;·&nbsp; ${monthName}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" id="btn-pres-back">← Back</button>
          <button class="btn btn-outline" id="btn-pres-prev-month">‹ Prev</button>
          <button class="btn btn-outline" id="btn-pres-next-month">› Next</button>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="stats-grid" style="margin-bottom:1.5rem">
        <div class="stat-card stat-card-good"><span class="sc-icon">${_ICONS.check}</span><span class="sc-val">${totalCompleted}</span><span class="sc-lbl">Completed This Month</span></div>
        <div class="stat-card stat-card-bad"><span class="sc-icon">${_ICONS.close}</span><span class="sc-val">${totalMissed}</span><span class="sc-lbl">Missed</span></div>
        <div class="stat-card stat-card-neutral"><span class="sc-icon">${_ICONS.calendar}</span><span class="sc-val">${totalPending}</span><span class="sc-lbl">Upcoming</span></div>
      </div>

      <!-- Today's presenters (pinned, current month only) -->
      ${isCurrentMonth ? `<div class="card pres-day-card pres-day-today" style="margin-bottom:1.5rem">
        <div class="card-header">
          <h3 class="card-title"><span class="title-icon" aria-hidden="true">${_ICONS.calendar}</span> Today's Presenters
            <span style="font-weight:400;font-size:.85rem;color:var(--text3)">&nbsp;${fmtDate(todayISO)}</span>
            ${todaySkip ? '<span class="att-tag att-tag-holiday" style="margin-left:.75rem">No Presentations</span>' : ''}
          </h3>
        </div>

        ${todaySkip ? `
          <!-- Skip active: show reason + undo -->
          <div style="padding:.75rem 1rem 1rem">
            <p style="margin:0 0 .5rem;color:var(--text2)">
              <strong>Reason:</strong> ${todaySkip.reason}
            </p>
            <button class="btn btn-outline btn-sm" id="btn-remove-skip">↩ Remove Skip</button>
          </div>
        ` : `
          <!-- No skip: show slots + toggle -->
          ${todaySlots.length
            ? `<div class="pres-slots">${todaySlots.map(sl => slotRow(sl, todayISO, true)).join('')}</div>`
            : `<p class="empty-hint" style="padding:.75rem 1rem">No presentations scheduled today — save today's attendance to auto-assign presenters.</p>`}

          <!-- No-presentation toggle -->
          <div style="border-top:1px solid var(--border);padding:.75rem 1rem 1rem;margin-top:.5rem">
            <label style="display:flex;align-items:center;gap:.6rem;cursor:pointer;font-size:.9rem;color:var(--text2)">
              <input type="checkbox" id="chk-skip-today" style="width:1rem;height:1rem;cursor:pointer">
              No presentations today
            </label>
            <div id="skip-reason-box" style="display:none;margin-top:.75rem">
              <input type="text" id="inp-skip-reason" class="form-input"
                placeholder="Reason (required) — e.g. Placement session, Guest lecture…"
                style="margin-bottom:.5rem">
              <button class="btn btn-primary btn-sm" id="btn-save-skip">Mark as No-Presentation Day</button>
            </div>
          </div>
        `}
      </div>` : ''}

      <!-- Monthly student summary -->
      ${activeStudents.length ? `<div class="card" style="margin-bottom:1.5rem">
        <h3 class="card-title">Student Presentation Summary — ${monthName}</h3>
        <table style="width:100%;border-collapse:collapse;margin-top:.75rem">
          <thead>
            <tr style="text-align:left;border-bottom:2px solid var(--border)">
              <th style="padding:.5rem .75rem">Student</th>
              <th style="padding:.5rem .75rem;text-align:center">This Month</th>
              <th style="padding:.5rem .75rem;text-align:center">Lifetime Total</th>
            </tr>
          </thead>
          <tbody>
            ${activeStudents.map(s => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:.5rem .75rem">${s.name}</td>
                <td style="padding:.5rem .75rem;text-align:center"><strong>${monthlyCount[s.id] || 0}</strong></td>
                <td style="padding:.5rem .75rem;text-align:center">${s.presScheduleInfo?.completedCount || 0}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Day-by-day schedule -->
      <h3 style="margin-bottom:.75rem;color:var(--text2)">Scheduled Days — ${monthName}</h3>
      ${!days.length
        ? `<div class="card"><p class="empty-hint">No presentations scheduled this month yet. Save today's attendance session to auto-assign presenters.</p></div>`
        : days.filter(date => !(isCurrentMonth && date === todayISO)).map(date => {
            const daySlots = slots[date];
            const d        = new Date(date + 'T12:00:00');
            const isToday  = date === todayISO;
            const isPast   = date < todayISO;
            return `<div class="card pres-day-card ${isToday ? 'pres-day-today' : ''}" style="margin-bottom:1rem">
              <div class="card-header">
                <h3 class="card-title">${fmtDate(date)} &nbsp;
                  <span style="font-weight:400;color:var(--text3)">${d.toLocaleDateString('en-IN',{weekday:'long'})}</span>
                  ${isToday ? '<span class="att-tag" style="background:var(--accent);color:#fff;margin-left:.5rem">Today</span>' : ''}
                  ${isPast && !isToday ? '<span class="att-tag att-tag-holiday" style="margin-left:.5rem">Past</span>' : ''}
                </h3>
              </div>
              <div class="pres-slots">
                ${daySlots.map(sl => slotRow(sl, date, isPast || isToday)).join('')}
              </div>
            </div>`;
          }).join('')}
    `;

    document.getElementById('btn-pres-back')?.addEventListener('click', onBack);
    document.getElementById('btn-pres-prev-month')?.addEventListener('click', () => {
      let m = month - 1, y = year;
      if (m < 0) { m = 11; y--; }
      onNav(y, m);
    });
    document.getElementById('btn-pres-next-month')?.addEventListener('click', () => {
      let m = month + 1, y = year;
      if (m > 11) { m = 0; y++; }
      onNav(y, m);
    });

    // Skip toggle — show/hide reason box
    document.getElementById('chk-skip-today')?.addEventListener('change', e => {
      const box = document.getElementById('skip-reason-box');
      if (box) box.style.display = e.target.checked ? 'block' : 'none';
      if (!e.target.checked) {
        const inp = document.getElementById('inp-skip-reason');
        if (inp) inp.value = '';
      }
    });

    // Save skip — validate reason then call onSkip
    document.getElementById('btn-save-skip')?.addEventListener('click', () => {
      const reason = document.getElementById('inp-skip-reason')?.value?.trim();
      if (!reason) {
        document.getElementById('inp-skip-reason')?.focus();
        document.getElementById('inp-skip-reason').style.borderColor = 'var(--danger)';
        return;
      }
      onSkip(reason);
    });

    // Remove skip
    document.getElementById('btn-remove-skip')?.addEventListener('click', onRemoveSkip);

    // Evaluate button via event delegation
    // Remove any previously attached handler first to prevent accumulation
    // (each call to renderPresentationSchedule would otherwise add another listener)
    const _mainEl = document.getElementById('main-content');
    if (_mainEl._presEvalHandler) {
      _mainEl.removeEventListener('click', _mainEl._presEvalHandler);
    }
    _mainEl._presEvalHandler = e => {
      const evalBtn = e.target.closest('[data-pres-eval]');
      if (evalBtn) onEval(evalBtn.dataset.presEval, evalBtn.dataset.presDate);
    };
    _mainEl.addEventListener('click', _mainEl._presEvalHandler);
  }

  /**
   * Renders the Presentation Evaluation modal.
   */
  function renderPresentationEvalModal(student, date, onSave) {
    const fields = [
      { key: 'communication', label: 'Communication', icon: '🗣' },
      { key: 'confidence',    label: 'Confidence',    icon: '💪' },
      { key: 'bodyLanguage',  label: 'Body Language', icon: '🧍' },
      { key: 'grooming',      label: 'Grooming',      icon: '✨' },
      { key: 'behavior',      label: 'Behavior',      icon: '🤝' }
    ];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal pev-modal">
        <div class="modal-header">
          <div class="pev-header-info">
            <div class="pev-student-name">${student.name}</div>
            <div class="pev-date-badge">${_ICONS.mock} ${fmtDate(date)}</div>
          </div>
          <button class="btn-icon" id="pres-eval-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">

          <!-- Live average score banner -->
          <div class="pev-avg-banner" id="pev-avg-banner">
            <div class="pev-avg-label">Average Score</div>
            <div class="pev-avg-value" id="pev-avg">5.0</div>
            <div class="pev-avg-out">/ 10</div>
          </div>

          <!-- Weak skills indicator -->
          <div class="pev-weak-row" id="pev-weak-row"></div>

          <!-- Sliders -->
          <div class="pev-sliders">
            ${fields.map(f => `
              <div class="pev-slider-row">
                <div class="pev-slider-meta">
                  <span class="pev-skill-label">${f.icon} ${f.label}</span>
                  <span class="pev-score-badge" id="pev-badge-${f.key}">5</span>
                </div>
                <div class="pev-slider-track">
                  <input type="range" min="1" max="10" value="5"
                    id="pev-${f.key}" class="pev-slider"
                    oninput="(function(v,id,bid){document.getElementById(id).textContent=v;document.getElementById(bid).dataset.v=v;document.getElementById(bid).textContent=v;document.getElementById(bid).className='pev-score-badge pev-score-badge--'+(v<=5?'weak':v>=8?'strong':'mid');})(this.value,'pev-badge-${f.key}','pev-badge-${f.key}')">
                  <div class="pev-track-labels"><span>1</span><span>5</span><span>10</span></div>
                </div>
              </div>`).join('')}
          </div>

        </div>
        <div class="modal-footer pev-footer">
          <button class="btn btn-outline" id="pres-eval-cancel">Cancel</button>
          <button class="btn btn-primary pev-save-btn" id="pres-eval-save">${_ICONS.check} Save Evaluation</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Use overlay.querySelector throughout — prevents cross-modal ID collisions
    // if multiple modals exist due to duplicate event listeners (bug fix)
    function updateAvg() {
      const scores = fields.map(f => parseInt(overlay.querySelector(`#pev-${f.key}`).value));
      const avg    = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
      const avgEl  = overlay.querySelector('#pev-avg');
      const banner = overlay.querySelector('#pev-avg-banner');
      avgEl.textContent = avg;
      banner.className  = 'pev-avg-banner ' + (avg >= 8 ? 'pev-avg--good' : avg >= 6 ? 'pev-avg--mid' : 'pev-avg--weak');
      const weak = fields.filter((f, i) => scores[i] <= 5).map(f => f.label);
      const weakRow = overlay.querySelector('#pev-weak-row');
      weakRow.innerHTML = weak.length
        ? `<span class="pev-weak-label">Weak skills:</span> ${weak.map(w => `<span class="pev-weak-tag">${w}</span>`).join('')}`
        : '';
      fields.forEach((f, i) => {
        const badge = overlay.querySelector(`#pev-badge-${f.key}`);
        if (badge) {
          badge.className = 'pev-score-badge pev-score-badge--' + (scores[i] <= 5 ? 'weak' : scores[i] >= 8 ? 'strong' : 'mid');
        }
      });
    }
    overlay.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', updateAvg));
    updateAvg();

    const close = () => overlay.remove();
    overlay.querySelector('#pres-eval-close')?.addEventListener('click', close);
    overlay.querySelector('#pres-eval-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#pres-eval-save')?.addEventListener('click', () => {
      const metrics = {};
      fields.forEach(f => { metrics[f.key] = parseInt(overlay.querySelector(`#pev-${f.key}`).value); });
      close();
      onSave(metrics);
    });
  }

  // ─── P1-7: Transfer Student Modal (admin-only) ────────────────────────────
  /**
   * Shows a modal for an admin to select a target batch and confirm the transfer.
   * targetBatches — list of batches the student can be transferred TO (current batch excluded).
   */
  function showTransferModal(student, currentBatchId, targetBatches, onConfirm) {
    const modal   = el('div', 'modal-overlay');
    const options = targetBatches.length
      ? targetBatches.map(b =>
          `<option value="${b.id}">${b.name}${b.batchCode ? ' (' + b.batchCode + ')' : ''} — ${b.students.length} students${b.capacity ? ' / ' + b.capacity : ''}</option>`
        ).join('')
      : '<option value="" disabled>No other batches available</option>';

    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Transfer Student</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p class="transfer-student-name">Transferring: <strong>${student.name}</strong></p>
          <div class="form-group" style="margin-top:1rem">
            <label>Select Target Batch *</label>
            <select id="f-transfer-target" class="form-input">${options}</select>
          </div>
          <p class="transfer-note">The student's full record (attendance, tests, exams, presentations) will be preserved.</p>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm"${!targetBatches.length ? ' disabled' : ''}>Transfer</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-confirm')?.addEventListener('click', () => {
      const targetId = document.getElementById('f-transfer-target').value;
      if (!targetId) return;
      modal.remove();
      onConfirm(targetId);
    });
    document.getElementById('modal-cancel')?.addEventListener('click',  () => modal.remove());
    document.getElementById('modal-close')?.addEventListener('click',   () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    return modal;
  }

  // ─── P4: Export Modals ───────────────────────────────────────────────────

  /**
   * Modal for exporting batch-level reports.
   * Three report types × two formats each.
   */
  function showExportModal(batch) {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Export Reports — ${batch.name}</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p style="font-size:.83rem;color:var(--text3);margin-bottom:1.1rem">
            Choose a report and format. Files download directly in your browser.
          </p>
          <div class="exp-grid">
            <div class="exp-card">
              <div class="exp-card-icon">${_ICONS.clipboard}</div>
              <div class="exp-card-title">Student List</div>
              <div class="exp-card-desc">All students with enrollment date and IDs</div>
              <div class="exp-btn-row">
                <button class="btn btn-sm btn-outline" data-export="student-list" data-fmt="xlsx" data-bid="${batch.id}">${_ICONS.arrowDown} Excel</button>
                <button class="btn btn-sm btn-outline" data-export="student-list" data-fmt="pdf"  data-bid="${batch.id}">${_ICONS.arrowDown} PDF</button>
              </div>
            </div>
            <div class="exp-card">
              <div class="exp-card-icon">${_ICONS.calendar}</div>
              <div class="exp-card-title">Attendance Report</div>
              <div class="exp-card-desc">Sessions, present/absent counts, attendance %</div>
              <div class="exp-btn-row">
                <button class="btn btn-sm btn-outline" data-export="attendance" data-fmt="xlsx" data-bid="${batch.id}">${_ICONS.arrowDown} Excel</button>
                <button class="btn btn-sm btn-outline" data-export="attendance" data-fmt="pdf"  data-bid="${batch.id}">${_ICONS.arrowDown} PDF</button>
              </div>
            </div>
            <div class="exp-card">
              <div class="exp-card-icon">${_ICONS.chartBar}</div>
              <div class="exp-card-title">Performance Summary</div>
              <div class="exp-card-desc">Final Score, attendance, academic, presentation scores and rank</div>
              <div class="exp-btn-row">
                <button class="btn btn-sm btn-outline" data-export="performance" data-fmt="xlsx" data-bid="${batch.id}">${_ICONS.arrowDown} Excel</button>
                <button class="btn btn-sm btn-outline" data-export="performance" data-fmt="pdf"  data-bid="${batch.id}">${_ICONS.arrowDown} PDF</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    return modal;
  }

  /**
   * Modal for exporting admin / institute-wide reports.
   */
  function showAdminExportModal() {
    const modal = el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Export Institute Reports</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p style="font-size:.83rem;color:var(--text3);margin-bottom:1.1rem">
            Download institute-wide reports. Files download directly in your browser.
          </p>
          <div class="exp-grid">
            <div class="exp-card">
              <div class="exp-card-icon">${_ICONS.allBatches}</div>
              <div class="exp-card-title">All Batches Overview</div>
              <div class="exp-card-desc">Batch list with student counts, avg Final Score, avg attendance</div>
              <div class="exp-btn-row">
                <button class="btn btn-sm btn-outline" data-export="admin-batches" data-fmt="xlsx">${_ICONS.arrowDown} Excel</button>
                <button class="btn btn-sm btn-outline" data-export="admin-batches" data-fmt="pdf">${_ICONS.arrowDown} PDF</button>
              </div>
            </div>
            <div class="exp-card">
              <div class="exp-card-icon">${_ICONS.academics}</div>
              <div class="exp-card-title">Faculty Performance</div>
              <div class="exp-card-desc">Per-faculty: batches, designation, avg Final Score, attendance, academic</div>
              <div class="exp-btn-row">
                <button class="btn btn-sm btn-outline" data-export="admin-faculty" data-fmt="xlsx">${_ICONS.arrowDown} Excel</button>
                <button class="btn btn-sm btn-outline" data-export="admin-faculty" data-fmt="pdf">${_ICONS.arrowDown} PDF</button>
              </div>
            </div>
            <div class="exp-card">
              <div class="exp-card-icon">${_ICONS.scoring}</div>
              <div class="exp-card-title">Student Placement Report</div>
              <div class="exp-card-desc">All students institute-wide: Final Score components, placement category A/B/C, mock scores, Call Connect count</div>
              <div class="exp-btn-row">
                <button class="btn btn-sm btn-outline" data-export="admin-placement" data-fmt="xlsx">${_ICONS.arrowDown} Excel</button>
                <button class="btn btn-sm btn-outline" data-export="admin-placement" data-fmt="pdf">${_ICONS.arrowDown} PDF</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    return modal;
  }

  // ─── Danger Confirm Modal — requires typing a specific string ────────────────
  // Used for high-stakes deletions (e.g. admin deleting a user account).
  // onConfirm() is called only when the typed text exactly matches matchText.
  function showDangerConfirm(title, matchText, warningHTML, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <h2 style="color:var(--bad)">${title}</h2>
          <button class="modal-close-btn" id="dc-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p style="font-size:.88rem;color:var(--text2);margin-bottom:1rem">${warningHTML}</p>
          <div class="form-group">
            <label style="font-size:.84rem">Type <strong>${matchText}</strong> to confirm:</label>
            <input type="text" id="dc-input" class="form-input" placeholder="${matchText}" autocomplete="off">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="dc-cancel">Cancel</button>
          <button class="btn btn-danger"  id="dc-confirm" disabled>Delete</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close   = () => modal.remove();
    const input   = modal.querySelector('#dc-input');
    const confirm = modal.querySelector('#dc-confirm');
    modal.querySelector('#dc-close').addEventListener('click', close);
    modal.querySelector('#dc-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    input.addEventListener('input', () => { confirm.disabled = input.value !== matchText; });
    confirm.addEventListener('click', () => { if (input.value === matchText) { close(); onConfirm(); } });
    setTimeout(() => input.focus(), 50);
  }

  // ─── Reset Student Password Modal ─────────────────────────────────────────
  function showResetStudentPasswordModal(studentName, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2>🔑 Reset Password — ${studentName}</h2>
          <button class="modal-close-btn" id="rsp-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>New Password <span style="color:var(--bad)">*</span></label>
            <input type="password" id="rsp-pw" class="form-input" placeholder="min. 4 characters" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label>Confirm Password <span style="color:var(--bad)">*</span></label>
            <input type="password" id="rsp-pw2" class="form-input" autocomplete="new-password">
          </div>
          <p id="rsp-error" style="color:var(--bad);font-size:.82rem;display:none;min-height:1.2em"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="rsp-cancel">Cancel</button>
          <button class="btn btn-primary"  id="rsp-confirm">Reset Password</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const errEl = modal.querySelector('#rsp-error');
    const close = () => modal.remove();
    modal.querySelector('#rsp-close').addEventListener('click', close);
    modal.querySelector('#rsp-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#rsp-confirm').addEventListener('click', () => {
      const pw  = modal.querySelector('#rsp-pw').value;
      const pw2 = modal.querySelector('#rsp-pw2').value;
      errEl.style.display = 'none';
      if (!pw || pw.length < 4) { errEl.textContent = 'Password must be at least 4 characters.'; errEl.style.display = 'block'; return; }
      if (pw !== pw2)           { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
      close();
      onConfirm(pw);
    });
    setTimeout(() => modal.querySelector('#rsp-pw').focus(), 50);
  }

  // ─── Content Topbar ───────────────────────────────────────────────────────

  function renderContentTopbar(user, pageTitle) {
    const topbar = document.getElementById('content-topbar');
    if (!topbar) return;
    const bg       = user ? _makeAvatarBg(user.fullName || user.username) : '#57534E';
    const initials = user ? _makeInitials(user.fullName || user.username) : '?';
    const name     = escHtml(user ? (user.fullName || user.username) : '');
    const role     = user?.role === 'admin' ? 'Admin' : 'Trainer';
    const isDark   = document.body.classList.contains('dark');
    topbar.innerHTML = `
      <div class="ct-title-row">
        <span class="ct-title">${escHtml(pageTitle || 'Dashboard')}</span>
        <span class="sync-badge" id="sync-status-badge"></span>
      </div>
      <div class="ct-actions">
        <button class="ct-icon-btn" id="ct-dark-toggle" title="${isDark ? 'Light Mode' : 'Dark Mode'}">
          ${isDark ? _ICONS.sun : _ICONS.moon}
        </button>
        <button class="ct-icon-btn" id="ct-btn-backup" title="Download Backup">
          ${_ICONS.download}
        </button>
        <button class="ct-icon-btn" id="ct-btn-restore" title="Restore Backup">
          ${_ICONS.upload}
        </button>
        <button class="ct-profile-chip" id="ct-profile-chip" title="View Profile">
          <div class="user-avatar user-avatar--sm" style="background:${bg}">${initials}</div>
          <div class="ct-profile-info">
            <span class="ct-profile-name">${name}</span>
            <span class="ct-profile-role">${role}</span>
          </div>
        </button>
      </div>`;
  }

  // ─── Profile Drawer ────────────────────────────────────────────────────────

  function _buildCalendarHTML(year, month, eventDates, prevId = 'pd-cal-prev', nextId = 'pd-cal-next') {
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    // Monday-first week order (Mo → Su)
    const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    const today  = new Date();
    const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();

    // Monday-first offset: Sun(0)→6, Mon(1)→0, Tue(2)→1 … Sat(6)→5
    const firstDow      = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth   = new Date(year, month + 1, 0).getDate();
    const daysInPrevMo  = new Date(year, month, 0).getDate();

    const dowHTML = DAYS.map(d => `<div class="pd-cal-dow">${d}</div>`).join('');

    let cells = '';
    // trailing days of prev month
    for (let i = firstDow - 1; i >= 0; i--) {
      cells += `<div class="pd-cal-cell"><span class="pd-cal-day pd-cal-day--other">${daysInPrevMo - i}</span></div>`;
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      const iso      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday  = year === todayY && month === todayM && d === todayD;
      const hasEvent = eventDates?.has(iso);
      cells += `<div class="pd-cal-cell">
        <span class="pd-cal-day${isToday ? ' pd-cal-day--today' : ''}">${d}</span>
        ${hasEvent ? '<span class="pd-cal-event-dot"></span>' : ''}
      </div>`;
    }
    // leading days of next month
    const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    for (let nd = 1; nd <= totalCells - firstDow - daysInMonth; nd++) {
      cells += `<div class="pd-cal-cell"><span class="pd-cal-day pd-cal-day--other">${nd}</span></div>`;
    }

    return `
      <div class="pd-cal-card">
        <div class="pd-cal-header">
          <button class="pd-cal-nav-btn" id="${prevId}" aria-label="Previous month">&#8249;</button>
          <span class="pd-cal-month">${MONTHS[month]} ${year}</span>
          <button class="pd-cal-nav-btn" id="${nextId}" aria-label="Next month">&#8250;</button>
        </div>
        <div class="pd-cal-grid">${dowHTML}${cells}</div>
      </div>`;
  }

  function renderProfileDrawerContent(user, batch, calYear, calMonth) {
    const body = document.getElementById('pd-body');
    if (!body) return;
    const bg       = user ? _makeAvatarBg(user.fullName || user.username) : '#57534E';
    const initials = user ? _makeInitials(user.fullName || user.username) : '?';
    const name     = escHtml(user ? (user.fullName || user.username) : 'User');
    const role     = user?.role === 'admin' ? 'Admin' : 'Trainer';

    // ── Use new calendarEvents (migrated from timetable) ─────────────────────
    const calEvents = batch?.calendarEvents || [];

    // ── Calendar dots: expand events for the viewed month ────────────────────
    const monthStart = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`;
    const monthEnd   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${new Date(calYear, calMonth+1, 0).getDate().toString().padStart(2,'0')}`;
    const monthOccs  = _calExpandEvents(calEvents, monthStart, monthEnd);
    const evDates    = new Set(monthOccs.map(o => o.date));

    // ── Upcoming events: next 14 days via the same expander ──────────────────
    const todayISO  = _localDateStr();
    const futureD   = new Date(todayISO + 'T12:00:00'); futureD.setDate(futureD.getDate() + 13);
    const futureISO = futureD.toISOString().split('T')[0];
    const upcoming  = _calExpandEvents(calEvents, todayISO, futureISO);

    const eventsHTML = upcoming.length
      ? upcoming.slice(0, 5).map(e => {
          const timeStr = e.type === 'allday'
            ? 'All day'
            : (e.startTime ? `${_calFmtTime(e.startTime)} – ${_calFmtTime(e.endTime)}` : '');
          const dateStr = new Date(e.date + 'T12:00:00')
            .toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
          return `
            <div class="pd-event-card">
              <div class="pd-event-card-icon pd-event-card-icon--${e.color || 'blue'}">${_ICONS.clock}</div>
              <div class="pd-event-card-body">
                <div class="pd-event-card-name">${escHtml(e.title)}</div>
                <div class="pd-event-card-date">${dateStr}${timeStr ? ' · ' + timeStr : ''}</div>
              </div>
            </div>`;
        }).join('')
      : `<div class="pd-events-empty">No upcoming classes</div>`;

    body.innerHTML = `
      <div class="pd-profile">
        <div class="pd-avatar" style="background:${bg}">${initials}</div>
        <div class="pd-name">${name}</div>
        <span class="pd-role-badge">${role}</span>
        <button class="pd-edit-btn" id="pd-edit-profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Profile
        </button>
      </div>
      <div class="pd-calendar">${_buildCalendarHTML(calYear, calMonth, evDates)}</div>
      <div class="pd-events-section">
        <span class="pd-events-title">Upcoming Classes</span>
        ${eventsHTML}
      </div>`;
  }

  // ─── Reminders & Tasks Screen ───────────────────────────────────────────────

  function renderRemindersTasksScreen(tasks) {
    const main = document.getElementById('main-content');
    if (!main) return;

    const allTasks   = tasks || [];
    const today      = _localDateStr();

    // Split auto vs manual
    const autoTasks   = allTasks.filter(t => t.source !== 'manual');
    const manualTasks = allTasks.filter(t => t.source === 'manual');

    const autoOpen   = autoTasks.filter(t => !t.completedAt);
    const manualOpen = manualTasks.filter(t => !t.completedAt);

    // Sort manual open: overdue first → due-date ascending → no-due-date last
    manualOpen.sort((a, b) => {
      const aOver = a.dueDate && a.dueDate < today;
      const bOver = b.dueDate && b.dueDate < today;
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return  1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return  1;
      return 0;
    });

    // Recently completed: mixed, newest first, capped at 20
    const completed = allTasks
      .filter(t => t.completedAt)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, 20);

    // ── Auto (Call Connect) task card ──────────────────────────────────────
    function _autoCard(t, isDone) {
      const dateStr = t.triggerDate
        ? new Date(t.triggerDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
        : '';
      return `
      <div class="rt-task-card${isDone ? ' rt-task-card--done' : ''}" data-task-id="${escHtml(t.id)}">
        <div class="rt-task-header">
          <span class="rt-task-type">${escHtml(t.type || 'Task')}</span>
          ${t.streak ? `<span class="rt-task-streak">${t.streak} consecutive absences</span>` : ''}
          ${dateStr ? `<span class="rt-task-date">${dateStr}</span>` : ''}
        </div>
        <div class="rt-task-student">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="rt-task-icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <strong>${escHtml(t.studentName || t.studentId)}</strong>
          <span class="rt-task-batch">${escHtml(t.batchName || t.batchId)}</span>
        </div>
        ${isDone
          ? `<div class="rt-task-done-remark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.85rem;height:.85rem;color:var(--good);flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg><span>${escHtml(t.remark || 'Completed')}</span></div>`
          : `<div class="rt-task-action">
              <input type="text" class="rt-remark-input form-input" data-task-id="${escHtml(t.id)}"
                placeholder="Enter call remark (required)…" value="${escHtml(t.remark || '')}">
              <button class="btn rt-complete-btn" id="rt-complete-${escHtml(t.id)}"
                ${(t.remark || '').trim() ? '' : 'disabled'} title="Mark as done">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:1rem;height:1rem"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
            <div class="rt-rejoin-section">
              <button type="button" class="rt-rejoin-toggle" data-task-id="${escHtml(t.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.7rem;height:.7rem;flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Set Rejoin On date
                <span class="rt-rejoin-optional">(optional)</span>
                <svg class="rt-rejoin-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:.65rem;height:.65rem;margin-left:auto;transition:transform .18s ease"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="rt-rejoin-fields" id="rt-rejoin-fields-${escHtml(t.id)}" style="display:none">
                <div class="rt-rejoin-row">
                  <div class="rt-rejoin-group">
                    <label class="rt-rejoin-label">Rejoin On</label>
                    <input type="date" class="rt-rejoin-date form-input" data-task-id="${escHtml(t.id)}" min="${today}">
                  </div>
                  <div class="rt-rejoin-group rt-rejoin-group--wide">
                    <label class="rt-rejoin-label">
                      Reason
                      <span class="rt-rejoin-req" style="display:none;color:var(--bad);margin-left:.2rem">*</span>
                    </label>
                    <input type="text" class="rt-rejoin-reason form-input" data-task-id="${escHtml(t.id)}"
                      placeholder="e.g. Out of station for family function…" maxlength="200">
                  </div>
                </div>
              </div>
            </div>`
        }
      </div>`;
    }

    // ── Manual task card ───────────────────────────────────────────────────
    function _manualCard(t, isDone) {
      const isOverdue = !isDone && t.dueDate && t.dueDate < today;
      let dueLabel = '';
      if (t.dueDate) {
        const d = new Date(t.dueDate + 'T00:00:00');
        dueLabel = d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
        if (t.dueTime) dueLabel += ' · ' + t.dueTime;
      }
      return `
      <div class="rt-manual-card${isDone ? ' rt-manual-card--done' : ''}${isOverdue ? ' rt-manual-card--overdue' : ''}" data-task-id="${escHtml(t.id)}">
        <div class="rt-manual-header">
          <span class="rt-manual-title">${escHtml(t.title || 'Task')}</span>
          ${!isDone ? `<div class="rt-manual-actions">
            <button class="rt-manual-icon-btn rt-edit-btn" data-task-id="${escHtml(t.id)}" title="Edit task">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.85rem;height:.85rem"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="rt-manual-icon-btn rt-delete-btn" data-task-id="${escHtml(t.id)}" title="Delete task">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.85rem;height:.85rem"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
            <button class="rt-manual-icon-btn rt-manual-icon-btn--tick rt-manual-tick-btn" data-task-id="${escHtml(t.id)}" title="Mark as done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:.85rem;height:.85rem"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>` : ''}
        </div>
        ${t.notes ? `<div class="rt-manual-notes">${escHtml(t.notes)}</div>` : ''}
        ${dueLabel ? `<div class="rt-manual-due${isOverdue ? ' rt-manual-due--overdue' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.75rem;height:.75rem;flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>${escHtml(dueLabel)}${isOverdue ? ' · Overdue' : ''}</span>
        </div>` : ''}
        ${isDone ? `<div class="rt-task-done-remark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:.85rem;height:.85rem;color:var(--good);flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg><span>Done</span></div>` : ''}
      </div>`;
    }

    function _doneCard(t) {
      return t.source === 'manual' ? _manualCard(t, true) : _autoCard(t, true);
    }

    const autoOpenHTML = autoOpen.length
      ? autoOpen.map(t => _autoCard(t, false)).join('')
      : `<div class="rt-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:2rem;height:2rem;opacity:.3"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg><p>No pending call tasks</p></div>`;

    const manualOpenHTML = manualOpen.length
      ? manualOpen.map(t => _manualCard(t, false)).join('')
      : `<div class="rt-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:2rem;height:2rem;opacity:.3"><path d="M12 5v14"/><path d="M5 12h14"/></svg><p>No tasks yet — add one!</p></div>`;

    const doneHTML = completed.length
      ? completed.map(t => _doneCard(t)).join('')
      : `<p class="rt-empty-sub">No completed tasks yet.</p>`;

    main.innerHTML = `
    <div class="rt-screen rt-screen--wide">

      <div class="rt-screen-header">
        <div>
          <h1 class="view-title" style="margin:0">Reminders &amp; Tasks</h1>
          <p class="view-sub" style="margin:.25rem 0 0">Manage call tasks and personal to-dos</p>
        </div>
        <button class="btn btn--primary" id="rt-add-task-btn" style="flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:1rem;height:1rem"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          Add Task
        </button>
      </div>

      <div class="rt-columns">
        <div class="rt-col">
          <div class="rt-section-header">
            <span class="rt-section-title">Call Tasks</span>
            <span class="rt-badge rt-badge--open">${autoOpen.length}</span>
          </div>
          <div class="rt-task-list" id="rt-auto-list">${autoOpenHTML}</div>
        </div>
        <div class="rt-col">
          <div class="rt-section-header">
            <span class="rt-section-title">My Tasks</span>
            <span class="rt-badge rt-badge--open">${manualOpen.length}</span>
          </div>
          <div class="rt-task-list" id="rt-manual-list">${manualOpenHTML}</div>
        </div>
      </div>

      <div class="rt-section rt-section--done">
        <button class="rt-section-header rt-section-header--toggle" id="rt-done-toggle" aria-expanded="false">
          <span class="rt-section-title">Recently Completed</span>
          <span class="rt-badge rt-badge--done">${completed.length}</span>
          <svg class="rt-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="rt-task-list rt-task-list--done" id="rt-done-list" style="display:none">${doneHTML}</div>
      </div>
    </div>

    <!-- Add / Edit Manual Task Modal -->
    <div class="rt-modal-backdrop" id="rt-modal-backdrop" style="display:none">
      <div class="rt-modal" role="dialog" aria-modal="true">
        <div class="rt-modal-header">
          <h3 class="rt-modal-title" id="rt-modal-title">Add Task</h3>
          <button class="rt-modal-close" id="rt-modal-close" title="Close"
            aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round" style="width:1.1rem;height:1.1rem">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="rt-modal-body">
          <input type="hidden" id="rt-modal-task-id">
          <div class="form-group">
            <label class="form-label" for="rt-modal-title-input">
              Title <span style="color:var(--bad)">*</span>
            </label>
            <input type="text" id="rt-modal-title-input" class="form-input"
              placeholder="Task title…" maxlength="120">
          </div>
          <div class="form-group">
            <label class="form-label" for="rt-modal-notes">Notes</label>
            <textarea id="rt-modal-notes" class="form-input" rows="3"
              placeholder="Optional notes…"
              style="resize:vertical;min-height:70px;max-height:180px"></textarea>
          </div>
          <div class="rt-modal-row">
            <div class="form-group" style="flex:1;min-width:0">
              <label class="form-label" for="rt-modal-date">Due Date</label>
              <input type="date" id="rt-modal-date" class="form-input">
            </div>
            <div class="form-group" style="flex:1;min-width:0">
              <label class="form-label" for="rt-modal-time">Due Time</label>
              <input type="time" id="rt-modal-time" class="form-input">
            </div>
          </div>
        </div>
        <div class="rt-modal-footer">
          <button class="btn" id="rt-modal-cancel">Cancel</button>
          <button class="btn btn--primary" id="rt-modal-save">Save Task</button>
        </div>
      </div>
    </div>`;
  }

  // ─── Admin Institute Dashboard ──────────────────────────────────────────────
  /**
   * renderAdminReportsScreen — dedicated Reports page for admin.
   * Surfaces all three institute-wide export types as full-page cards
   * (same content as the old Export modal, now a first-class nav section).
   */
  function renderAdminReportsScreen() {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Reports</h1>
          <p class="view-sub">Download institute-wide reports. Files save directly to your device.</p>
        </div>
      </div>

      <div class="exp-grid admin-reports-grid">
        <div class="exp-card">
          <div class="exp-card-icon">${_ICONS.allBatches}</div>
          <div class="exp-card-title">All Batches Overview</div>
          <div class="exp-card-desc">Batch list with student counts, avg Final Score, and avg attendance across all batches.</div>
          <div class="exp-btn-row">
            <button class="btn btn-sm btn-outline" data-export="admin-batches" data-fmt="xlsx">${_ICONS.arrowDown} Excel</button>
            <button class="btn btn-sm btn-outline" data-export="admin-batches" data-fmt="pdf">${_ICONS.arrowDown} PDF</button>
          </div>
        </div>

        <div class="exp-card">
          <div class="exp-card-icon">${_ICONS.academics}</div>
          <div class="exp-card-title">Faculty Performance</div>
          <div class="exp-card-desc">Per-faculty breakdown: batches assigned, designation, avg Final Score, attendance, and academic scores.</div>
          <div class="exp-btn-row">
            <button class="btn btn-sm btn-outline" data-export="admin-faculty" data-fmt="xlsx">${_ICONS.arrowDown} Excel</button>
            <button class="btn btn-sm btn-outline" data-export="admin-faculty" data-fmt="pdf">${_ICONS.arrowDown} PDF</button>
          </div>
        </div>

        <div class="exp-card">
          <div class="exp-card-icon">${_ICONS.scoring}</div>
          <div class="exp-card-title">Student Placement Report</div>
          <div class="exp-card-desc">All students institute-wide: Final Score components, placement category A/B/C, mock scores, and Call Connect count.</div>
          <div class="exp-btn-row">
            <button class="btn btn-sm btn-outline" data-export="admin-placement" data-fmt="xlsx">${_ICONS.arrowDown} Excel</button>
            <button class="btn btn-sm btn-outline" data-export="admin-placement" data-fmt="pdf">${_ICONS.arrowDown} PDF</button>
          </div>
        </div>
      </div>`;
  }

  /**
   * renderAdminDashboardScreen — SaaS-style institute overview.
   * KPI cards: Active Batches, Total Students, Avg Attendance, Top Performing Batch.
   * Chart canvas rendered here; chart data wired in app.js after render.
   * Only active (non-archived) batches contribute to KPI values.
   */
  function renderAdminDashboardScreen() {
    const main       = document.getElementById('main-content');
    if (!main) return;

    const allUsers      = Storage.getAllUsers();
    const allBatches    = Storage.getBatches();
    // Active = not archived and status is not 'archived'
    const activeBatches = allBatches.filter(b => !b.archived && b.status !== 'archived');

    // KPI — Total Students (active batches only)
    const totalStudents = activeBatches.reduce((a, b) => a + (b.students?.length || 0), 0);

    // KPI — Institute Average Attendance (active batches, all students)
    let attSum = 0, attCount = 0;
    const _sc = ScoringConfig.load();
    activeBatches.forEach(b => {
      const ctx = { holidays: b.holidays || [], scoringConfig: _sc };
      (b.students || []).forEach(s => { attSum += Calc.attendanceScore(s, ctx); attCount++; });
    });
    const avgAtt = attCount > 0 ? attSum / attCount : 0;
    const attColor = avgAtt >= 75 ? 'green' : avgAtt >= 60 ? 'amber' : 'red';

    // KPI — Top Performing Batch (highest avg final score, active only)
    let topBatch = null, topScore = -1;
    activeBatches.forEach(b => {
      if (!(b.students?.length)) return;
      const ctx = { holidays: b.holidays || [], scoringConfig: _sc };
      let fsSum = 0;
      b.students.forEach(s => { fsSum += Calc.allMetrics(s, ctx).finalScore; });
      const avg = fsSum / b.students.length;
      if (avg > topScore) { topScore = avg; topBatch = b; }
    });

    // Chart: only show when 2+ active batches exist
    const chartSection = activeBatches.length >= 2 ? `
      <div class="card admin-chart-card">
        <div class="card-header">
          <h2 class="card-title">Batch Performance Comparison</h2>
          <span class="acc-count">${activeBatches.length} active batches</span>
        </div>
        <p class="admin-chart-hint">Click any batch group on the chart to drill into its detail view.</p>
        <div class="p4-chart-wrap">
          <canvas id="chart-admin-dashboard"></canvas>
        </div>
      </div>` : `
      <div class="card admin-chart-card">
        <div class="card-header"><h2 class="card-title">Batch Performance Comparison</h2></div>
        <div class="acc-empty" style="padding:2.5rem 1rem;text-align:center">
          Add at least 2 active batches to see the cross-batch comparison chart.
        </div>
      </div>`;

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Institute Dashboard</h1>
          <p class="view-sub">Real-time overview across all active batches</p>
        </div>
      </div>

      <div class="admin-kpi-grid">
        <div class="admin-kpi-card admin-kpi-card--blue">
          <div class="admin-kpi-icon">${_ICONS.allBatches}</div>
          <div class="admin-kpi-body">
            <div class="admin-kpi-value">${activeBatches.length}</div>
            <div class="admin-kpi-label">Active Batches</div>
          </div>
        </div>
        <div class="admin-kpi-card admin-kpi-card--purple">
          <div class="admin-kpi-icon">${_ICONS.users}</div>
          <div class="admin-kpi-body">
            <div class="admin-kpi-value">${totalStudents}</div>
            <div class="admin-kpi-label">Total Students</div>
          </div>
        </div>
        <div class="admin-kpi-card admin-kpi-card--${attColor}">
          <div class="admin-kpi-icon">${_ICONS.attendance}</div>
          <div class="admin-kpi-body">
            <div class="admin-kpi-value">${attCount > 0 ? fmt(avgAtt) + '%' : '—'}</div>
            <div class="admin-kpi-label">Avg Attendance</div>
          </div>
        </div>
        <div class="admin-kpi-card admin-kpi-card--gold">
          <div class="admin-kpi-icon">${_ICONS.chartBar}</div>
          <div class="admin-kpi-body">
            <div class="admin-kpi-value">${topBatch ? fmt(topScore) : '—'}</div>
            <div class="admin-kpi-label">Top Batch Score</div>
            ${topBatch ? `<div class="admin-kpi-sub">${escHtml(topBatch.batchCode || topBatch.name)}</div>` : ''}
          </div>
        </div>
      </div>

      ${chartSection}
    `;
  }

  return {
    renderSidebar, renderNavSidebar, toggleSidebar, setNavSection, setNavMode, toggleNavGroup,
    openNavFlyout, closeNavFlyout,
    renderManageBatch, renderSettings,
    renderAcademicsTests, renderAcademicsExams, academicsTestSlideOver,
    renderMockManual, renderMockAI, renderMockHistory, mockManualSlideOver, mockAISlideOver,
    renderRemarksCallsScreen, renderRemarksNotesScreen, remarksCallsSlideOver, remarksNotesSlideOver,
    renderRemindersTasksScreen,
    renderAdminDashboardScreen, renderAdminReportsScreen,
    renderAdminAllBatchesScreen, renderAdminManageUsersScreen, renderAdminScoringScreen, renderAdminSyncScreen,
    renderBatchDashboard, renderQuickClass, updateQuickCard,
    renderAttendanceDashboard,
    renderStudentProfile, renderProfileTab,
    showBatchModal, showStudentModal, showBulkImportModal, showTransferModal, showConfirm, showDeleteRecurringModal, showToast,
    getMockParamsConfig,
    // Auth screen
    renderAuthScreen, showAuthError, setAuthState,
    // V4: new views + modal
    renderProfilePage, renderAdminDashboard, showChangePasswordModal,
    // P5: Admin Control Center
    renderAdminBatchDetail, showInstructorAssignModal,
    // P2: Instructor management
    showManageInstructorsModal,
    // Cal: Calendar (new)
    renderCalendar, showCalendarEventModal,
    // P3: Timetable (legacy — kept so old references don't throw)
    renderTimetable, showTimetableClassModal,
    // P4: Export
    showExportModal, showAdminExportModal,
    // v5: presentation schedule
    renderPresentationSchedule, renderPresentationEvalModal,
    // STUDENT_PORTAL
    setStudentAuthState,
    renderStudentSidebar, renderStudentTopbar, renderStudentProfileDrawerContent,
    renderStudentDashboard,
    renderStudentAttendance, renderStudentTestScores,
    renderStudentMockHistory, renderStudentPlacement,
    renderStudentSettings,
    showCreateStudentLoginModal,
    // User management
    showDangerConfirm, showResetStudentPasswordModal,
    // Content topbar + profile drawer
    renderContentTopbar, renderProfileDrawerContent,
    // Icon accessor for use in app.js
    getIcon: (name) => _ICONS[name] || '',
  };
})();
