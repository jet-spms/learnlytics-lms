/**
 * ui-student-portal.js — Student Portal renderers (extracted from ui.js Phase 4B)
 *
 * Depends on: UIIcons (ui-icons.js), UIHelpers (ui-helpers.js),
 *             UICalendar (ui-calendar.js), UIMock (ui-mock.js),
 *             Calc (calculations.js), ScoringConfig (scoring-config.js)
 *
 * Exports:
 *   renderStudentTopbar, renderStudentProfileDrawerContent,
 *   renderStudentSidebar, renderStudentDashboard,
 *   renderStudentAttendance, renderStudentTestScores,
 *   renderStudentMockHistory, renderStudentPlacement,
 *   renderStudentSettings, showCreateStudentLoginModal
 */

const UIStudentPortal = (() => {

  const _ICONS = UIIcons._ICONS;
  const { escHtml, fmtDate, piColor, _makeAvatarBg, _makeInitials, _localDateStr } = UIHelpers;
  const { _calExpandEvents, _calFmtTime } = UICalendar;
  const { MOCK_PARAMS_CONFIG } = UIMock;

  // ─── Private copy of _buildCalendarHTML ──────────────────────────────────
  // Also used by renderProfileDrawerContent in ui.js (trainer drawer).
  // Kept private here to avoid cross-module dependency on ui.js which loads after.
  function _buildCalendarHTML(year, month, eventDates, prevId = 'pd-cal-prev', nextId = 'pd-cal-next') {
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    const today  = new Date();
    const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();

    const firstDow      = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth   = new Date(year, month + 1, 0).getDate();
    const daysInPrevMo  = new Date(year, month, 0).getDate();

    const dowHTML = DAYS.map(d => `<div class="pd-cal-dow">${d}</div>`).join('');

    let cells = '';
    for (let i = firstDow - 1; i >= 0; i--) {
      cells += `<div class="pd-cal-cell"><span class="pd-cal-day pd-cal-day--other">${daysInPrevMo - i}</span></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday  = year === todayY && month === todayM && d === todayD;
      const hasEvent = eventDates?.has(iso);
      cells += `<div class="pd-cal-cell">
        <span class="pd-cal-day${isToday ? ' pd-cal-day--today' : ''}">${d}</span>
        ${hasEvent ? '<span class="pd-cal-event-dot"></span>' : ''}
      </div>`;
    }
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

  // ─── STUDENT_PORTAL: Student Content Topbar ───────────────────────────────

  function renderStudentTopbar(student, pageTitle) {
    const topbar = document.getElementById('student-content-topbar');
    if (!topbar) return;
    const name     = escHtml(student ? (student.name || '') : '');
    const bg       = _makeAvatarBg(name || 'S');
    const initials = _makeInitials(name || 'Student');
    const isDark   = document.body.classList.contains('dark');
    topbar.innerHTML = `
      <div class="ct-title-row">
        <span class="ct-title">${escHtml(pageTitle || 'Dashboard')}</span>
      </div>
      <div class="ct-actions">
        <button class="ct-icon-btn" id="student-dark-toggle" title="${isDark ? 'Light Mode' : 'Dark Mode'}" aria-label="Toggle dark mode">
          ${isDark ? _ICONS.sun : _ICONS.moon}
        </button>
        <button class="ct-profile-chip" id="student-profile-chip" title="View Profile" aria-label="Open profile">
          <div class="user-avatar user-avatar--sm" style="background:${bg}">${initials}</div>
          <div class="ct-profile-info">
            <span class="ct-profile-name">${name}</span>
            <span class="ct-profile-role">Student</span>
          </div>
        </button>
      </div>`;
  }

  // ─── STUDENT_PORTAL: Student Profile Drawer Content ───────────────────────

  function renderStudentProfileDrawerContent(student, batch, calYear, calMonth) {
    const body = document.getElementById('student-pd-body');
    if (!body) return;

    const name     = student ? escHtml(student.name || '') : 'Student';
    const bg       = _makeAvatarBg(name);
    const initials = _makeInitials(name);

    const calEvents = batch?.calendarEvents || [];

    const monthStart = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`;
    const monthEnd   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${new Date(calYear, calMonth+1, 0).getDate().toString().padStart(2,'0')}`;
    const monthOccs  = _calExpandEvents(calEvents, monthStart, monthEnd);
    const evDates    = new Set(monthOccs.map(o => o.date));

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
      </div>
      <div class="pd-calendar">${_buildCalendarHTML(calYear, calMonth, evDates, 'student-pd-cal-prev', 'student-pd-cal-next')}</div>
      <div class="pd-events-section">
        <span class="pd-events-title">Upcoming Classes</span>
        ${eventsHTML}
      </div>`;
  }

  // ─── STUDENT_PORTAL: Student Sidebar ──────────────────────────────────────

  function renderStudentSidebar(student, activeNav = 'dashboard') {
    const sidebar = document.getElementById('student-sidebar');
    if (!sidebar) return;

    const compact   = sidebar.classList.contains('nav-sidebar--compact');
    const panelIcon = `<svg class="nsb-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5"/><path d="M9 3v18"/></svg>`;

    const navItem = (id, icon, label) => {
      const active = activeNav === id;
      return `
        <div class="nsb-item${active ? ' nsb-item--active' : ''}" data-student-nav="${id}" title="${label}">
          <span class="nsb-item-icon">${icon}</span>
          ${compact ? '' : `<span class="nsb-item-label">${label}</span>`}
        </div>`;
    };

    sidebar.innerHTML = `
      <div class="nsb-header">
        <button class="nsb-collapse-btn" id="student-sidebar-collapse-btn"
          title="${compact ? 'Expand sidebar' : 'Collapse sidebar'}"
          aria-label="${compact ? 'Expand sidebar' : 'Collapse sidebar'}">
          ${panelIcon}
        </button>
        ${compact ? '' : `<img src="assets/logo/logo-light.png" class="nsb-logo-img spms-logo-img" alt="" aria-hidden="true"><span class="nsb-logo-text">SPMS</span>`}
      </div>

      <nav class="nsb-nav" id="student-nsb-nav">
        ${compact ? '' : `<div class="nsb-section"><span class="nsb-title">My Performance</span></div>`}
        ${navItem('dashboard',    _ICONS.dashboard,  'Dashboard')}
        ${navItem('attendance',   _ICONS.attendance, 'Attendance')}
        ${navItem('tests',        _ICONS.bookOpen,   'Test Scores')}
        ${navItem('mock-history', _ICONS.mock,       'Mock History')}
        ${navItem('placement',    _ICONS.scoring,    'Placement')}
        ${compact ? '' : `<div class="nsb-section" style="margin-top:.4rem"><span class="nsb-title">Schedule</span></div>`}
        ${navItem('calendar',     _ICONS.calendar,   'Calendar')}
      </nav>

      <div class="nsb-footer">
        <button class="nsb-footer-nav-btn" id="student-settings-btn" data-student-nav="settings"
          title="Settings" aria-label="Settings">
          <span class="nsb-footer-nav-icon">${_ICONS.settings}</span>
          ${compact ? '' : `<span class="nsb-footer-nav-label">Settings</span>`}
        </button>
        <button class="nsb-footer-logout-btn" id="btn-student-logout" title="Log out" aria-label="Log out">
          <span class="nsb-footer-logout-icon">${_ICONS.logout}</span>
          ${compact ? '' : `<span class="nsb-footer-logout-label">Log out</span>`}
        </button>
      </div>
    `;
  }

  // ─── STUDENT_PORTAL: Student Dashboard (view-only) ─────────────────────────

  function renderStudentDashboard(student, batch) {
    const container = document.getElementById('student-main-content');
    if (!container) return;

    const context  = { holidays: batch.holidays || [], scoringConfig: ScoringConfig.load() };
    const m        = Calc.allMetrics(student, context);
    const alerts   = Calc.getAlerts(student, context);
    const cat      = Calc.placementCategory(student, context);
    const catBadgeClass = cat === 'A' ? 'cat-badge--a' : cat === 'B' ? 'cat-badge--b' : cat === 'C' ? 'cat-badge--c' : 'cat-badge--none';
    const modStats = Calc.moduleStats(student);

    function pbar(val, label) {
      const c = val >= 75 ? 'good' : val >= 50 ? 'warn' : 'bad';
      return `<div class="sp-progress-row">
        <span class="sp-progress-label">${label}</span>
        <div class="score-bar" style="flex:1"><div class="score-fill score-fill--${c}" style="width:${Math.min(100,val)}%"></div></div>
        <span class="sp-progress-val">${val.toFixed(1)}%</span>
      </div>`;
    }

    const aiHistory = student.aiMockHistory || [];
    let aiScore = 0;
    if (aiHistory.length) {
      aiScore = (aiHistory.reduce((s, e) => s + e.score, 0) / aiHistory.length) * 10;
    } else if (student.interviewScore !== null && student.interviewScore !== undefined) {
      aiScore = student.interviewScore > 10 ? student.interviewScore : student.interviewScore * 10;
    }

    const mocks = student.mockInterviews || [];
    let manualScore = 0;
    if (mocks.length) {
      const sum = mocks.reduce((s, mk) => s + (typeof mk.totalScore === 'number' ? mk.totalScore : 0), 0);
      manualScore = (sum / mocks.length) * 10;
    }

    const modHTML = modStats.length ? modStats.map(mod => {
      const cls = !mod.appeared ? 'sp-mod--na' : mod.cleared ? 'sp-mod--cleared' : 'sp-mod--failed';
      const icon = !mod.appeared ? '—' : mod.cleared ? '✓' : '✗';
      return `<div class="sp-module-chip ${cls}">
        <span class="sp-mod-icon">${icon}</span>
        <span>Module ${mod.moduleNum}</span>
        ${mod.appeared ? `<span class="sp-mod-count">${mod.clearedCount}/${mod.appearedCount}</span>` : ''}
      </div>`;
    }).join('') : '<p style="opacity:.6;font-size:.9rem">No exam data yet.</p>';

    const alertsHTML = alerts.length
      ? alerts.map(a => `<div class="alert-pill sp-alert">${_ICONS.flag} ${a.message}</div>`).join('')
      : '<p style="opacity:.6;font-size:.9rem">No active alerts. Keep it up!</p>';

    container.innerHTML = `
      <div class="sp-dashboard">

        <div class="view-header" style="margin-bottom:1.5rem">
          <div class="profile-header-info">
            <div class="profile-avatar-lg">${student.name.charAt(0)}</div>
            <div>
              <h1 class="view-title">${student.name}</h1>
              <p class="view-sub"><code>${student.studentId}</code>
                ${student.email ? `&nbsp;·&nbsp;${student.email}` : ''}
                &nbsp;·&nbsp; Batch: <strong>${batch.name}</strong>
              </p>
            </div>
          </div>
        </div>

        <!-- Metric cards -->
        <div class="stats-grid" style="margin-bottom:1.5rem">
          <div class="stat-card stat-card--${m.attendance>=75?'good':m.attendance>=60?'warn':'bad'}">
            <div class="stat-icon">${_ICONS.calendar}</div>
            <div class="stat-body">
              <div class="stat-value">${m.attendance.toFixed(1)}%</div>
              <div class="stat-label">Attendance</div>
            </div>
          </div>
          <div class="stat-card stat-card--${m.academic>=75?'good':m.academic>=50?'warn':'bad'}">
            <div class="stat-icon">${_ICONS.bookOpen}</div>
            <div class="stat-body">
              <div class="stat-value">${m.academic.toFixed(1)}%</div>
              <div class="stat-label">Academic</div>
            </div>
          </div>
          <div class="stat-card stat-card--${m.presentation>=75?'good':m.presentation>=50?'warn':'bad'}">
            <div class="stat-icon">${_ICONS.mock}</div>
            <div class="stat-body">
              <div class="stat-value">${m.presentation.toFixed(1)}%</div>
              <div class="stat-label">Presentation</div>
            </div>
          </div>
          <div class="stat-card stat-card--${piColor(m.finalScore)}">
            <div class="stat-icon">${_ICONS.chartBar}</div>
            <div class="stat-body">
              <div class="stat-value">${m.finalScore.toFixed(1)}</div>
              <div class="stat-label">Final Score</div>
            </div>
          </div>
          <div class="stat-card stat-card--neutral">
            <div class="stat-icon">${_ICONS.scoring}</div>
            <div class="stat-body">
              <div class="stat-value"><span class="cat-badge ${catBadgeClass}" style="font-size:1.2rem">${cat}</span></div>
              <div class="stat-label">Placement Category</div>
            </div>
          </div>
        </div>

        <div class="sp-two-col">

          <!-- Progress summary -->
          <div class="card" style="padding:1.25rem">
            <h3 class="card-title" style="margin-bottom:.75rem">Progress Summary</h3>
            ${pbar(m.attendance,        'Attendance')}
            ${pbar(m.academic,          'Academic')}
            ${pbar(m.presentation,      'Presentation')}
            ${pbar(aiScore,             'AI Mock')}
            ${pbar(manualScore,         'Manual Mock')}
            <div class="sp-progress-row" style="margin-top:.5rem;border-top:1px solid var(--border);padding-top:.5rem">
              <span class="sp-progress-label"><strong>Final Score</strong></span>
              <div class="score-bar" style="flex:1"><div class="score-fill score-fill--${piColor(m.finalScore)}" style="width:${Math.min(100,m.finalScore)}%"></div></div>
              <span class="sp-progress-val"><strong>${m.finalScore.toFixed(1)}</strong></span>
            </div>
          </div>

          <!-- Right column -->
          <div style="display:flex;flex-direction:column;gap:1rem">

            <!-- Exam module progress -->
            <div class="card" style="padding:1.25rem">
              <h3 class="card-title" style="margin-bottom:.75rem">Exam Module Progress</h3>
              <div class="sp-modules-row">${modHTML}</div>
            </div>

            <!-- Alerts -->
            <div class="card" style="padding:1.25rem">
              <h3 class="card-title" style="margin-bottom:.75rem">Alerts</h3>
              <div class="sp-alerts-list">${alertsHTML}</div>
            </div>

          </div>
        </div>

      </div>`;
  }

  // ─── STUDENT_PORTAL: Attendance (read-only) ────────────────────────────────

  function renderStudentAttendance(student, batch) {
    const container = document.getElementById('student-main-content');
    if (!container) return;

    const sessions = (student.sessions || []).slice().reverse();
    const holidays = batch.holidays || [];

    const working = (student.sessions || []).filter(s => {
      const d = new Date(s.date + 'T12:00:00');
      if (d.getDay() === 0) return false;
      if (holidays.some(h => h.date === s.date)) return false;
      return true;
    });
    const present  = working.filter(s => Calc._isPresent(s)).length;
    const absent   = working.length - present;
    const pct      = working.length ? (present / working.length) * 100 : 0;
    const pctCls   = pct >= 75 ? 'good' : pct >= 60 ? 'warn' : 'bad';

    const rows = sessions.length ? sessions.map(s => {
      const isHol = holidays.some(h => h.date === s.date);
      const isSun = new Date(s.date + 'T12:00:00').getDay() === 0;
      let statusLabel, statusCls;
      if (isHol)               { statusLabel = 'Holiday'; statusCls = 'warn'; }
      else if (isSun)          { statusLabel = 'Sunday';  statusCls = 'neutral'; }
      else if (Calc._isPresent(s)) { statusLabel = s.status === 'late' ? 'Late' : 'Present'; statusCls = 'good'; }
      else                     { statusLabel = 'Absent';  statusCls = 'bad'; }

      return `<tr>
        <td>${fmtDate(s.date)}</td>
        <td><span class="pi-value pi--${statusCls}">${statusLabel}</span></td>
        <td style="color:var(--text3)">${s.remark ? escHtml(s.remark) : '—'}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" class="empty-hint" style="text-align:center;padding:1.5rem">No sessions recorded yet.</td></tr>`;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Attendance</h1>
          <p class="view-sub">${escHtml(student.name)} &middot; ${escHtml(batch.name)}</p>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:1.5rem">
        <div class="stat-card stat-card--${pctCls}">
          <div class="stat-icon">${_ICONS.attendance}</div>
          <div class="stat-body">
            <div class="stat-value">${pct.toFixed(1)}%</div>
            <div class="stat-label">Attendance Rate</div>
          </div>
        </div>
        <div class="stat-card stat-card--good">
          <div class="stat-icon">${_ICONS.check}</div>
          <div class="stat-body">
            <div class="stat-value">${present}</div>
            <div class="stat-label">Days Present</div>
          </div>
        </div>
        <div class="stat-card stat-card--bad">
          <div class="stat-icon">${_ICONS.close}</div>
          <div class="stat-body">
            <div class="stat-value">${absent}</div>
            <div class="stat-label">Days Absent</div>
          </div>
        </div>
        <div class="stat-card stat-card--neutral">
          <div class="stat-icon">${_ICONS.clipboard}</div>
          <div class="stat-body">
            <div class="stat-value">${working.length}</div>
            <div class="stat-label">Working Days</div>
          </div>
        </div>
      </div>

      <div class="table-card card">
        <div class="card-header" style="padding:1rem 1.25rem .75rem;border-bottom:1px solid var(--border)">
          <span class="card-title">Session Log</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Date</th><th>Status</th><th>Remark</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ─── STUDENT_PORTAL: Test Scores (read-only) ───────────────────────────────

  function renderStudentTestScores(student, batch) {
    const container = document.getElementById('student-main-content');
    if (!container) return;

    const tests = (student.weeklyTests || []).slice().reverse();
    const all   = student.weeklyTests || [];
    const avg   = all.length ? all.reduce((s, t) => s + (t.marks / t.total) * 100, 0) / all.length : null;
    const best  = all.length ? Math.max(...all.map(t => (t.marks / t.total) * 100)) : null;
    const avgCls = avg === null ? 'neutral' : avg >= 75 ? 'good' : avg >= 50 ? 'warn' : 'bad';

    const rows = tests.length ? tests.map(t => {
      const pct = (t.marks / t.total) * 100;
      const cls = pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad';
      return `<tr>
        <td style="font-weight:500">${escHtml(t.label || '—')}</td>
        <td>${fmtDate(t.date)}</td>
        <td style="font-variant-numeric:tabular-nums">${t.marks} / ${t.total}</td>
        <td><span class="pi-value pi--${cls}">${pct.toFixed(1)}%</span></td>
        <td><span class="exam-status-badge exam-status-badge--${pct >= 50 ? 'pass' : 'fail'}">${pct >= 50 ? 'Pass' : 'Fail'}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="empty-hint" style="text-align:center;padding:1.5rem">No test scores recorded yet.</td></tr>`;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Test Scores</h1>
          <p class="view-sub">${escHtml(student.name)} &middot; ${escHtml(batch.name)}</p>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:1.5rem">
        <div class="stat-card stat-card--neutral">
          <div class="stat-icon">${_ICONS.clipboard}</div>
          <div class="stat-body">
            <div class="stat-value">${all.length}</div>
            <div class="stat-label">Total Tests</div>
          </div>
        </div>
        <div class="stat-card stat-card--${avgCls}">
          <div class="stat-icon">${_ICONS.chartBar}</div>
          <div class="stat-body">
            <div class="stat-value">${avg !== null ? avg.toFixed(1) + '%' : '—'}</div>
            <div class="stat-label">Average Score</div>
          </div>
        </div>
        <div class="stat-card stat-card--good">
          <div class="stat-icon">${_ICONS.award}</div>
          <div class="stat-body">
            <div class="stat-value">${best !== null ? best.toFixed(1) + '%' : '—'}</div>
            <div class="stat-label">Best Score</div>
          </div>
        </div>
      </div>

      <div class="table-card card">
        <div class="card-header" style="padding:1rem 1.25rem .75rem;border-bottom:1px solid var(--border)">
          <span class="card-title">Test History</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Label</th><th>Date</th><th>Marks</th><th>Score</th><th>Result</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ─── STUDENT_PORTAL: Mock History (read-only) ──────────────────────────────

  function renderStudentMockHistory(student, batch) {
    const container = document.getElementById('student-main-content');
    if (!container) return;

    const mocks     = (student.mockInterviews || []).slice().reverse();
    const aiMocks   = (student.aiMockHistory  || []).slice().reverse();
    const PARAMS    = MOCK_PARAMS_CONFIG;

    const manualRows = mocks.length ? mocks.map(m => {
      if (m.attendance === 'absent') {
        return `<tr>
          <td>${fmtDate(m.date)}</td>
          <td><span class="pi-value pi--neutral">Absent</span></td>
          <td colspan="2" style="color:var(--text3)">—</td>
        </tr>`;
      }
      const cls = m.totalScore >= 7 ? 'good' : m.totalScore >= 5 ? 'warn' : 'bad';
      return `<tr>
        <td>${fmtDate(m.date)}</td>
        <td><span class="pi-value pi--good">Present</span></td>
        <td><span class="pi-value pi--${cls}">${typeof m.totalScore === 'number' ? m.totalScore.toFixed(2) : '—'} / 10</span></td>
        <td style="color:var(--text3);font-size:var(--text-xs)">${PARAMS.map(p => { const raw = m.scores?.[p.key]; const val = raw == null ? '—' : typeof raw === 'object' ? raw.value : raw; return `${p.label}: ${val}`; }).join(' · ')}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="4" class="empty-hint" style="text-align:center;padding:1.5rem">No manual mock sessions recorded yet.</td></tr>`;

    const aiRows = aiMocks.length ? aiMocks.map(a => {
      const cls = a.score >= 7 ? 'good' : a.score >= 5 ? 'warn' : 'bad';
      return `<tr>
        <td>${fmtDate(a.date)}</td>
        <td><span class="pi-value pi--${cls}">${typeof a.score === 'number' ? a.score.toFixed(2) : '—'} / 10</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="2" class="empty-hint" style="text-align:center;padding:1.5rem">No AI mock sessions recorded yet.</td></tr>`;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Mock History</h1>
          <p class="view-sub">${escHtml(student.name)} &middot; ${escHtml(batch.name)}</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header">
          <span class="card-title"><span class="title-icon" aria-hidden="true">${_ICONS.mock}</span> Manual Mock Interviews</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Attendance</th><th>Avg Score</th><th>Parameters</th></tr></thead>
            <tbody>${manualRows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><span class="title-icon" aria-hidden="true">${_ICONS.sparkles}</span> AI Mock Interviews</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Score</th></tr></thead>
            <tbody>${aiRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ─── STUDENT_PORTAL: Placement (read-only) ─────────────────────────────────

  function renderStudentPlacement(student, batch) {
    const container = document.getElementById('student-main-content');
    if (!container) return;

    const context  = { holidays: batch.holidays || [], scoringConfig: ScoringConfig.load() };
    const m        = Calc.allMetrics(student, context);
    const cat      = Calc.placementCategory(student, context);
    const catBadgeClass = cat === 'A' ? 'cat-badge--a' : cat === 'B' ? 'cat-badge--b' : cat === 'C' ? 'cat-badge--c' : 'cat-badge--none';
    const catDesc  = cat === 'A' ? 'Excellent — Ready for placement'
                   : cat === 'B' ? 'Good — On track for placement'
                   : cat === 'C' ? 'Needs improvement before placement'
                   : 'Not yet evaluated — complete AI Mock to unlock';

    function metricRow(label, val, icon) {
      const c = val >= 75 ? 'good' : val >= 50 ? 'warn' : 'bad';
      return `<div class="sp-progress-row">
        <span class="sp-progress-label">${icon ? `<span class="title-icon" aria-hidden="true">${icon}</span> ` : ''}${label}</span>
        <div class="score-bar" style="flex:1"><div class="score-fill score-fill--${c}" style="width:${Math.min(100,val)}%"></div></div>
        <span class="sp-progress-val">${val.toFixed(1)}%</span>
      </div>`;
    }

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Placement Status</h1>
          <p class="view-sub">${escHtml(student.name)} &middot; ${escHtml(batch.name)}</p>
        </div>
      </div>

      <div class="sp-two-col" style="margin-bottom:1.25rem">

        <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:2rem 1.5rem;text-align:center">
          <div style="font-size:.78rem;font-weight:600;color:var(--text3);letter-spacing:.04em">PLACEMENT CATEGORY</div>
          <div class="cat-badge ${catBadgeClass}" style="font-size:3.5rem;width:5rem;height:5rem;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-lg)">${cat}</div>
          <p style="font-size:var(--text-sm);color:var(--text2);max-width:200px">${catDesc}</p>
        </div>

        <div class="card" style="padding:1.25rem">
          <h3 class="card-title" style="margin-bottom:1rem">Score Breakdown</h3>
          ${metricRow('Attendance',    m.attendance,   _ICONS.attendance)}
          ${metricRow('Academic',      m.academic,     _ICONS.academics)}
          ${metricRow('Presentation',  m.presentation, _ICONS.presentation)}
          ${metricRow('Final Score',   m.finalScore,   _ICONS.chartBar)}
          <div class="sp-progress-row" style="margin-top:.75rem;border-top:1px solid var(--border);padding-top:.75rem">
            <span class="sp-progress-label"><strong>Overall Final Score</strong></span>
            <span class="sp-progress-val" style="font-size:1.1rem;font-weight:700;color:var(--text)">${m.finalScore.toFixed(1)}</span>
          </div>
        </div>

      </div>`;
  }

  // ─── STUDENT_PORTAL: Settings ───────────────────────────────────────────────

  function renderStudentSettings() {
    const container = document.getElementById('student-main-content');
    if (!container) return;
    const dark = document.body.classList.contains('dark');

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Settings</h1>
          <p class="view-sub">Appearance and account preferences</p>
        </div>
      </div>
      <div class="settings-wrap">
        <div class="settings-section">
          <div class="settings-section-title">Appearance</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Dark Mode</div>
              <div class="settings-row-desc">Switch between light and dark theme</div>
            </div>
            <button class="btn btn-outline btn-sm" id="student-settings-dark-toggle">
              ${dark ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Account</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Change Password</div>
              <div class="settings-row-desc">Update your login password</div>
            </div>
            <button class="btn btn-outline btn-sm" id="student-settings-change-password">
              Change Password
            </button>
          </div>
        </div>
      </div>`;
  }

  // ─── STUDENT_PORTAL: Create Student Login Modal ───────────────────────────

  function showCreateStudentLoginModal(student, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2>🔐 Create Login for ${student.name}</h2>
          <button class="modal-close-btn" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:.75rem;font-size:.9rem;opacity:.8">
            Create a login so this student can access their dashboard.
          </p>
          <div class="form-group">
            <label>Username <span style="color:var(--bad)">*</span></label>
            <input type="text" id="sl-username" class="form-input" placeholder="min. 3 characters" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Password <span style="color:var(--bad)">*</span></label>
            <input type="password" id="sl-password" class="form-input" placeholder="min. 4 characters" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label>Confirm Password <span style="color:var(--bad)">*</span></label>
            <input type="password" id="sl-password2" class="form-input" autocomplete="new-password">
          </div>
          <p id="sl-error" style="color:var(--bad);font-size:.82rem;display:none;min-height:1.2em"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary"  id="sl-confirm">Create Login</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const errEl = modal.querySelector('#sl-error');
    const close = () => modal.remove();
    modal.querySelector('#modal-close').addEventListener('click', close);
    modal.querySelector('#modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('#sl-confirm').addEventListener('click', () => {
      const username  = modal.querySelector('#sl-username').value.trim();
      const password  = modal.querySelector('#sl-password').value;
      const password2 = modal.querySelector('#sl-password2').value;
      errEl.style.display = 'none';
      if (!username || username.length < 3) {
        errEl.textContent = 'Username must be at least 3 characters.'; errEl.style.display = 'block'; return;
      }
      if (!password || password.length < 4) {
        errEl.textContent = 'Password must be at least 4 characters.'; errEl.style.display = 'block'; return;
      }
      if (password !== password2) {
        errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return;
      }
      onConfirm(username, password, errEl);
      if (errEl.style.display === 'none') modal.remove();
    });
  }

  return {
    renderStudentTopbar,
    renderStudentProfileDrawerContent,
    renderStudentSidebar,
    renderStudentDashboard,
    renderStudentAttendance,
    renderStudentTestScores,
    renderStudentMockHistory,
    renderStudentPlacement,
    renderStudentSettings,
    showCreateStudentLoginModal,
  };

})();
