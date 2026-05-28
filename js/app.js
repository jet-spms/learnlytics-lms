/**
 * app.js — Main application controller
 *
 * v3 changes:
 *  CHANGE 1-7: [existing changes, see previous comments]
 *
 * LOGIN_CHANGE:
 *  LOGIN-1: init() checks auth state before doing anything else
 *  LOGIN-2: _startApp() contains the original init() body (called after successful login)
 *  LOGIN-3: bindGlobalEvents() wires the Logout button + sidebar profile/admin buttons (V4)
 *  LOGIN-4: _handleLogin() / _handleSignup() / _handleLogout() — auth event handlers
 *
 * V4 changes:
 *  V4-1: _startApp passes full user object to UI.setAuthState
 *  V4-2: _handleSignup receives full profile object from expanded signup form
 *  V4-3: openUserProfile() / openAdminPanel() — new main-content views
 *  V4-4: _handleSaveProfile / _handleChangePassword / _handleDeleteAccount — profile actions
 *  V4-5: handleMainClick handles admin-open-batch / save-profile / change-password / delete-account
 */

const App = (() => {

  let state = {
    activeBatchId:    null,
    view:             'welcome',  // 'welcome'|'dashboard'|'quickClass'|'profile'|'attendance'|'user-profile'|'admin-panel'|'admin-batch-detail'|'timetable'|'student-dashboard'
    activeStudentId:  null,
    // P3: Timetable state (legacy — replaced by Cal state below, kept so nothing errors)
    ttViewMode:   'week',
    ttWeekOffset: 0,
    ttActiveDate: null,
    // Cal-2: Calendar state — only relevant when view === 'timetable'
    calViewMode:  'month',                              // 'day'|'week'|'month'|'year'|'agenda'
    calDate:      _todayStr(), // focused ISO date (YYYY-MM-DD)
    // Phase 3: nav sidebar state
    navSection: 'dashboard',
    navMode:    'trainer',  // 'trainer' | 'admin' — resets on login
  };

  // ─── Profile drawer state (trainer) ───────────────────────────────────────
  let _drawerOpen  = false;
  let _calYear     = new Date().getFullYear();
  let _calMonth    = new Date().getMonth();

  // ─── Question Bank / Tests state ───────────────────────────────────────────
  let _qbPendingRows = [];   // rows parsed from Excel, waiting for trainer confirmation
  let _qbData        = [];   // full question bank cache, used when creating tests
  let _testsData     = [];   // tests cache for current batch (used by handlers)

  // ─── Student portal state ──────────────────────────────────────────────────
  let _studentNavSection      = 'dashboard';          // active sidebar item
  let _studentCalViewMode     = 'month';              // calendar view
  let _studentCalDate         = _todayStr(); // focused date
  let _studentDrawerCalYear   = new Date().getFullYear();
  let _studentDrawerCalMonth  = new Date().getMonth();

  // ─── MCQ test-session state ─────────────────────────────────────────────
  let _mcqTests          = [];   // tests list fetched from Supabase
  let _mcqAttempts       = [];   // this student's attempts
  let _mcqActiveTest     = null; // test object currently being taken
  let _mcqQuestions      = [];   // questions array (from spms_questions_public)
  let _mcqCurrentQ       = 0;    // current question index
  let _mcqAnswers        = {};   // { question_id: 'A'|'B'|'C'|'D' }
  let _mcqAttemptId      = null; // UUID of the in_progress attempt row
  let _mcqDeadline       = null; // ISO string deadline
  let _mcqTimerInterval  = null; // setInterval handle
  let _mcqSaveTimer      = null; // debounce handle for incremental saves
  let _mcqResultAttempt  = null; // attempt object shown on results screen

  // Page title lookup for content topbar
  const _PAGE_TITLES = {
    'dashboard':            'Dashboard',
    'manage-batch':         'Manage Batch',
    'attendance-take':      'Take Attendance',
    'attendance-holiday':   'Holidays',
    'attendance-history':   'Attendance History',
    'presentation-today':   "Today's Schedule",
    'presentation-monthly': 'Monthly Schedule',
    'academics-tests':         'Weekly Tests',
    'academics-exams':         'Module Exams',
    'academics-question-bank': 'Question Bank',
    'academics-tests-mgmt':    'Tests',
    'mock-manual':          'Manual Mock Score',
    'mock-ai':              'AI Mock Score',
    'mock-history':         'Mock History',
    'remarks-calls':        'Call Records',
    'remarks-notes':        'Student Notes',
    'timetable':            'Timetable',
    'settings':             'Settings',
    'reminders':            'Reminders & Tasks',
    'admin-dashboard':           'Institute Dashboard',
    'admin-all-batches':         'All Batches',
    'admin-faculty-performance': 'Faculty Batch Performance',
    'admin-manage-users':        'Manage Users',
    'admin-scoring':        'Scoring Config',
    'admin-backup':         'Backup & Restore',
    'admin-sync':           'Sync Status',
  };

  function _updateContentTopbar(title) {
    const user = Storage.getCurrentUser();
    UI.renderContentTopbar(user, title || _PAGE_TITLES[state.navSection] || 'Dashboard');
    // Re-apply sync state to the freshly-rendered badge element
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;
    badge.style.display = ''; // clear any lingering inline display:none
    if (_lastSyncStatus) {
      _updateSyncBadge(_lastSyncStatus); // restore active state
    } else {
      badge.className = 'sync-badge';
      badge.innerHTML = _SYNC_ICON_CLOUD; // idle faded cloud
    }
  }

  function _doBackup() {
    const blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `spms-backup-${_todayStr()}.json`;
    a.click();
    UI.showToast('Backup downloaded!', 'success');
  }

  function _openProfileDrawer() {
    const drawer   = document.getElementById('profile-drawer');
    const backdrop = document.getElementById('drawer-backdrop');
    if (!drawer) return;
    const user  = Storage.getCurrentUser();
    const batch = state.activeBatchId ? Storage.getBatch(state.activeBatchId) : null;
    drawer.innerHTML = `
      <div class="pd-header">
        <span class="pd-header-title">Profile</span>
        <button class="pd-close-btn" id="pd-close-btn">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}</button>
      </div>
      <div class="pd-body" id="pd-body"></div>`;
    UI.renderProfileDrawerContent(user, batch, _calYear, _calMonth);
    drawer.classList.add('profile-drawer--open');
    backdrop?.classList.add('drawer-backdrop--active');
    document.body.style.overflow = 'hidden';
    _drawerOpen = true;
  }

  function _closeProfileDrawer() {
    document.getElementById('profile-drawer')?.classList.remove('profile-drawer--open');
    document.getElementById('drawer-backdrop')?.classList.remove('drawer-backdrop--active');
    document.body.style.overflow = '';
    _drawerOpen = false;
  }

  function _refreshDrawerCal() {
    const user  = Storage.getCurrentUser();
    const batch = state.activeBatchId ? Storage.getBatch(state.activeBatchId) : null;
    UI.renderProfileDrawerContent(user, batch, _calYear, _calMonth);
  }

  // ─── Student Profile Drawer ────────────────────────────────────────────────

  function _openStudentProfileDrawer() {
    const drawer   = document.getElementById('student-profile-drawer');
    const backdrop = document.getElementById('student-drawer-backdrop');
    if (!drawer) return;
    const user    = Storage.getCurrentUser();
    const student = user ? Storage.getStudent(user.linkedBatchId, user.linkedStudentId) : null;
    const batch   = user ? Storage.getBatch(user.linkedBatchId) : null;
    drawer.innerHTML = `
      <div class="pd-header">
        <span class="pd-header-title">Profile</span>
        <button class="pd-close-btn" id="student-pd-close-btn">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}</button>
      </div>
      <div class="pd-body" id="student-pd-body"></div>`;
    UI.renderStudentProfileDrawerContent(student, batch, _studentDrawerCalYear, _studentDrawerCalMonth);
    drawer.classList.add('profile-drawer--open');
    backdrop?.classList.add('drawer-backdrop--active');
    document.body.style.overflow = 'hidden';
  }

  function _closeStudentProfileDrawer() {
    document.getElementById('student-profile-drawer')?.classList.remove('profile-drawer--open');
    document.getElementById('student-drawer-backdrop')?.classList.remove('drawer-backdrop--active');
    document.body.style.overflow = '';
  }

  function _refreshStudentDrawerCal() {
    const user    = Storage.getCurrentUser();
    const student = user ? Storage.getStudent(user.linkedBatchId, user.linkedStudentId) : null;
    const batch   = user ? Storage.getBatch(user.linkedBatchId) : null;
    UI.renderStudentProfileDrawerContent(student, batch, _studentDrawerCalYear, _studentDrawerCalMonth);
  }

  // Bug-2a fix: prevent bindGlobalEvents() from adding duplicate listeners on
  // re-login within the same page session. All handlers read from current
  // storage/state so they work correctly regardless of which user is logged in.
  let _globalEventsBound = false;

  // ─── Init — LOGIN_CHANGE LOGIN-1 ────────────────────────────────────────────
  // Check auth FIRST. If not logged in → show auth screen, do nothing else.
  // If logged in → proceed to _startApp() as normal.

  // SB-1: init is now async — hydrates from Supabase before rendering any UI
  async function init() {
    Storage.init();

    // Phase 1: pull all user records so cross-device login works on this browser
    _showSyncOverlay('Connecting to cloud\u2026');
    await SupabaseSync.hydrateUsers();
    _hideSyncOverlay();

    const currentUser = Storage.getCurrentUser();

    if (!currentUser) {
      // Not logged in — show auth screen, hide app
      UI.setAuthState(false);
      UI.renderAuthScreen(_handleLogin, _handleSignup);
      // Auto-switch to signup tab if landing page sent ?mode=signup
      if (new URLSearchParams(window.location.search).get('mode') === 'signup') {
        const signupTab = document.querySelector('[data-auth-tab="signup"]');
        if (signupTab) signupTab.click();
      }
    } else {
      // Phase 2: pull batch data so the latest state from any device is loaded
      _showSyncOverlay('Loading your data\u2026');
      await SupabaseSync.hydrateBatches(currentUser.id, currentUser.role === 'admin');
      // Phase F: pull scoring config so weights/thresholds are consistent across devices
      await ScoringConfig.syncFromCloud();
      // Phase 3: union-merge sessions from spms_sessions into localStorage (trainer/admin only —
      // students get their sessions via hydrateSessions(batchId) in _startStudentApp)
      if (currentUser.role !== 'student') {
        await SupabaseSync.hydrateSessions();
      }
      // Tasks: pull faculty tasks (skip for student accounts)
      if (currentUser.role !== 'student') {
        await SupabaseSync.hydrateTasks(currentUser.id);
      }
      _hideSyncOverlay();
      // Re-read user after hydration in case their profile was updated elsewhere
      _startApp(Storage.getCurrentUser() || currentUser);
    }
  }

  /**
   * LOGIN_CHANGE LOGIN-2: _startApp() is the original init() body.
   * Called after successful login or when a session is already active.
   */
  function _startApp(user) {
    // STUDENT_PORTAL: students get their own isolated shell — bypass trainer flow entirely
    if (user.role === 'student') {
      _startStudentApp(user);
      return;
    }

    // ISOLATION_CHANGE: run migration first — stamps any ownerless batches
    // with this user's ID. Safe to call every login; only changes batches
    // that have no ownerId yet (idempotent, never modifies owned batches).
    Storage.migrateOrphanedBatches(user.id);
    Storage.migrateBatchInstructors(); // P2: ensure every batch has at least one primary instructor

    // Reset nav mode on every login so admin always starts in trainer context
    state.navMode = 'trainer';
    UI.setNavMode('trainer');

    UI.setAuthState(true, user);   // V4-1: pass full user object (not just username)
    bindGlobalEvents();
    loadInitialView();
    applyTheme();
    _initBackToTop();
  }

  /** STUDENT_PORTAL: Entry point for role='student' logins. */
  async function _startStudentApp(user) {
    // Fix: hydrate the student's specific batch from Supabase before reading localStorage.
    // The generic hydrateBatches() call in _handleLogin fetches by owner_id — students never
    // own batches, so it returns zero rows. On a new device this means the batch is not in
    // localStorage and the student sees "record not found" even though their data exists in
    // Supabase. hydrateSingleBatch() fetches by exact batch ID, bypassing the ownership filter.
    _showSyncOverlay('Loading your data…');
    await SupabaseSync.hydrateSingleBatch(user.linkedBatchId);
    // Phase 3: union-merge sessions for this specific batch from spms_sessions.
    // Scoped to the student's batch only — avoids fetching unrelated data.
    await SupabaseSync.hydrateSessions(user.linkedBatchId);
    _hideSyncOverlay();

    const student = Storage.getStudent(user.linkedBatchId, user.linkedStudentId);
    const batch   = Storage.getBatch(user.linkedBatchId);

    // Run calendar migration so calendarEvents is always populated for the student's batch
    if (user.linkedBatchId) Storage.migrateCalendarSchema(user.linkedBatchId);

    // Reset student navigation state on each login
    _studentNavSection  = 'dashboard';
    _studentCalViewMode = 'month';
    _studentCalDate     = _todayStr();

    UI.setStudentAuthState(true, user);
    UI.renderStudentSidebar(student, _studentNavSection);
    UI.renderStudentTopbar(student, 'Dashboard');
    bindStudentGlobalEvents();
    applyTheme();
    _initBackToTop();
    if (student && batch) {
      UI.renderStudentDashboard(student, batch);
    } else {
      document.getElementById('student-main-content').innerHTML = `
        <div class="welcome-state">
          <div class="welcome-icon">${UI.getIcon('warning')}</div>
          <h2>Student record not found</h2>
          <p>Your account is not linked to a valid batch or student record. Please contact your trainer.</p>
        </div>`;
    }
  }

  // ─── Nav Router ─────────────────────────────────────────────────────────────

  function navigateTo(section) {
    state.navSection = section;
    UI.setNavSection(section);
    _updateContentTopbar(_PAGE_TITLES[section] || 'Dashboard');
    const batches = Storage.getMyBatches();
    // Always re-render the sidebar so the active highlight is correct for every section,
    // including group children whose handler functions don't call renderSidebar themselves.
    UI.renderSidebar(batches, state.activeBatchId);

    switch (section) {
      case 'dashboard':
        if (state.activeBatchId) selectBatch(state.activeBatchId);
        else showWelcome();
        break;

      // Attendance children
      case 'attendance-take':
        if (state.activeBatchId) openQuickClass(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('attendance'); }
        break;
      case 'attendance-history':
        if (state.activeBatchId) openAttendanceDashboard(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('attendance history'); }
        break;
      case 'attendance-holiday':
        if (state.activeBatchId) openManageBatch(state.activeBatchId, 'holidays');
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('holidays'); }
        break;

      // Presentation children
      case 'presentation-monthly':
      case 'presentation-today':
        if (state.activeBatchId) openPresentationSchedule(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('presentation schedule'); }
        break;

      case 'timetable':
        if (state.activeBatchId) openTimetable(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('timetable'); }
        break;

      case 'manage-batch':
        if (state.activeBatchId) openManageBatch(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('batch management'); }
        break;

      case 'settings':
        openSettings();
        break;

      case 'academics-tests':
        if (state.activeBatchId) openAcademicsTests(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('weekly tests'); }
        break;

      case 'academics-exams':
        if (state.activeBatchId) openAcademicsExams(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('module exams'); }
        break;

      case 'academics-question-bank':
        if (state.activeBatchId) openAcademicsQuestionBank(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('question bank'); }
        break;

      case 'academics-tests-mgmt':
        if (state.activeBatchId) openAcademicsTestsMgmt(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('tests'); }
        break;

      case 'mock-manual':
        if (state.activeBatchId) openMockManual(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('mock interviews'); }
        break;
      case 'mock-ai':
        if (state.activeBatchId) openMockAI(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('AI mock scores'); }
        break;
      case 'mock-history':
        if (state.activeBatchId) openMockHistory(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('mock history'); }
        break;

      case 'remarks-calls':
        if (state.activeBatchId) openRemarksCalls(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('call records'); }
        break;
      case 'remarks-notes':
        if (state.activeBatchId) openRemarksNotes(state.activeBatchId);
        else { UI.renderSidebar(batches, null); _showNoBatchSelected('student notes'); }
        break;

      case 'admin-dashboard':
        openAdminDashboard(); break;

      case 'admin-reports':
        openAdminReports(); break;

      case 'admin-all-batches':
        openAdminAllBatches(); break;
      case 'admin-faculty-performance':
        openFacultyBatchPerformance(); break;
      case 'admin-manage-users':
        openAdminManageUsers(); break;
      case 'admin-scoring':
        openAdminScoring(); break;
      case 'admin-backup':
        openSettings(); break;
      case 'admin-sync':
        openAdminSync(); break;

      case 'reminders':
        openReminders();
        break;

      case 'student-remarks':
      case 'academics':
      case 'mock-interviews':
        UI.renderSidebar(batches, state.activeBatchId);
        break;

      default:
        UI.renderSidebar(batches, state.activeBatchId);
    }
  }

  function loadInitialView() {
    // ISOLATION_CHANGE: use getMyBatches() so only the logged-in user's
    // batches are loaded into the sidebar and main view.
    const batches = Storage.getMyBatches();
    state.navSection = 'dashboard';
    UI.setNavSection('dashboard');
    UI.renderSidebar(batches, state.activeBatchId);
    _updateContentTopbar('Dashboard');
    if (batches.length) selectBatch(batches[0].id);
    else showWelcome();
  }

  function showWelcome() {
    document.getElementById('main-content').innerHTML = `
      <div class="welcome-state">
        <div class="welcome-illus">
          <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="40" fill="var(--surface2)"/>
            <path d="M40 18L62 28.5L40 39L18 28.5Z" fill="var(--accent)" opacity=".9"/>
            <path d="M27 33.5V47C27 51.5 33 56 40 56C47 56 53 51.5 53 47V33.5" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="62" y1="28.5" x2="62" y2="44" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="62" cy="46" r="3" fill="var(--accent)"/>
          </svg>
        </div>
        <h2 class="welcome-heading">Welcome to SPMS</h2>
        <p class="welcome-desc">Student Performance Management System</p>
        <p class="welcome-sub">Create your first batch to start tracking student progress.</p>
        <button class="btn btn-primary btn-lg" id="btn-welcome-create">+ Create First Batch</button>
      </div>`;
    document.getElementById('btn-welcome-create').addEventListener('click', openCreateBatchModal);
  }

  function _showNoBatchSelected(sectionLabel) {
    document.getElementById('main-content').innerHTML = `
      <div class="welcome-state">
        <div class="welcome-illus">
          <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="40" fill="var(--surface2)"/>
            <rect x="22" y="28" width="36" height="28" rx="4" stroke="var(--accent)" stroke-width="2.2" fill="none"/>
            <path d="M30 28V24a2 2 0 012-2h16a2 2 0 012 2v4" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>
            <line x1="32" y1="38" x2="48" y2="38" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
            <line x1="32" y1="44" x2="43" y2="44" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 class="welcome-heading">No batch selected</h2>
        <p class="welcome-desc">Select a batch from the sidebar to access ${sectionLabel || 'this section'}.</p>
      </div>`;
  }

  // ─── Theme ──────────────────────────────────────────────────────────────────

  function _syncThemeToggles(dark) {
    const t1 = document.getElementById('dark-toggle');
    const t2 = document.getElementById('dark-toggle-student');
    // These header buttons are only visible on mobile — use SVG icons via innerHTML
    if (t1) t1.innerHTML = dark ? UI.getIcon('sun') : UI.getIcon('moon');
    if (t2) t2.innerHTML = dark ? UI.getIcon('sun') : UI.getIcon('moon');
    // Re-render topbar so the SVG moon/sun icon flips too
    if (document.getElementById('content-topbar')) _updateContentTopbar();
  }

  function applyTheme() {
    const dark = localStorage.getItem('spms_dark') === 'true';
    document.body.classList.toggle('dark', dark);
    _syncThemeToggles(dark);
  }

  // ── Back to Top ───────────────────────────────────────────────────────────
  let _bttInit = false;
  function _initBackToTop() {
    if (_bttInit) return;  // only wire once even if called from both start paths
    _bttInit = true;
    const btn     = document.getElementById('back-to-top-btn');
    const main    = document.getElementById('main-content');
    const student = document.getElementById('student-main-content');
    if (!btn) return;

    function onScroll() {
      const show = (main?.scrollTop || 0) > 300 || (student?.scrollTop || 0) > 300;
      btn.classList.toggle('btt-visible', show);
    }

    main?.addEventListener('scroll', onScroll, { passive: true });
    student?.addEventListener('scroll', onScroll, { passive: true });

    btn.addEventListener('click', () => {
      if ((student?.scrollTop || 0) > 0) {
        student.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        main?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('spms_dark', isDark);
    _syncThemeToggles(isDark);
    if (state.view === 'profile') {
      const student = Storage.getStudent(state.activeBatchId, state.activeStudentId);
      if (student) { Charts.destroyAll(); UI.renderStudentProfile(student, state.activeBatchId); bindProfileEvents(); }
    }
  }

  /** STUDENT_PORTAL: Theme toggle for student shell — same toggle, different binding. */
  function toggleStudentTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('spms_dark', isDark);
    _syncThemeToggles(isDark);
  }

  // ─── Batch Selection ────────────────────────────────────────────────────────

  function selectBatch(batchId) {
    state.activeBatchId   = batchId;
    state.view            = 'dashboard';
    state.navSection      = 'dashboard';
    state.activeStudentId = null;
    Charts.destroyAll();
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    UI.setNavSection('dashboard');
    UI.renderSidebar(Storage.getMyBatches(), batchId); // ISOLATION_CHANGE: filtered
    _updateContentTopbar('Dashboard');
    UI.renderBatchDashboard(batch);
    bindDashboardEvents();
  }

  // ─── Global Events ──────────────────────────────────────────────────────────

  function bindGlobalEvents() {
    // S-6: re-register on every login — idempotent, keeps badge wired across re-logins.
    if (typeof SupabaseSync.setStatusCallback === 'function') {
      SupabaseSync.setStatusCallback(_updateSyncBadge);
    }

    // Bug-2a fix: skip all addEventListener calls if already bound.
    if (_globalEventsBound) return;
    _globalEventsBound = true;

    document.getElementById('dark-toggle').addEventListener('click', toggleTheme);

    // Phase 2: header profile avatar → opens profile drawer
    document.getElementById('btn-header-profile')?.addEventListener('click', _openProfileDrawer);

    // ── Mobile drawer helpers (shared by hamburger + sidebar events) ──────────
    const _sidebar   = document.getElementById('sidebar');
    const _backdrop  = document.getElementById('sidebar-backdrop');
    const _hamburger = document.getElementById('btn-hamburger');
    function _openMobileDrawer()  {
      _sidebar?.classList.add('mobile-open');
      _backdrop?.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    function _closeMobileDrawer() {
      _sidebar?.classList.remove('mobile-open');
      _backdrop?.classList.remove('active');
      document.body.style.overflow = '';
    }
    _hamburger?.addEventListener('click', _openMobileDrawer);
    _backdrop?.addEventListener('click', _closeMobileDrawer);
    document.getElementById('app-logo')?.addEventListener('click', () => {
      _sidebar?.classList.contains('mobile-open') ? _closeMobileDrawer() : _openMobileDrawer();
    });

    // ── Sidebar event delegation (survives renderNavSidebar re-renders) ───────
    _sidebar?.addEventListener('click', e => {
      // Collapse/expand toggle
      if (e.target.closest('#nav-collapse-btn')) {
        UI.closeNavFlyout();
        UI.toggleSidebar(Storage.getMyBatches(), state.activeBatchId);
        return;
      }
      // Compact mode: clicking on the sidebar rail (non-interactive area) expands it
      const isCompact = _sidebar.classList.contains('nav-sidebar--compact');
      if (isCompact) {
        const hit = e.target.closest(
          '[data-nav],[data-nav-group],[data-batch-id],' +
          '#nav-collapse-btn,#btn-logout-sidebar,' +
          '#nav-batch-trigger,[data-nav-mode]'
        );
        if (!hit) {
          UI.closeNavFlyout();
          UI.toggleSidebar(Storage.getMyBatches(), state.activeBatchId);
          return;
        }
      }
      // Collapsible group toggle (parent row click)
      const groupToggle = e.target.closest('[data-nav-group]');
      if (groupToggle) {
        const isCompact = _sidebar?.classList.contains('nav-sidebar--compact');
        if (isCompact) {
          // Compact mode: toggle flyout (click same icon again to close)
          const existing = document.getElementById('nsb-flyout');
          if (existing && existing.dataset.group === groupToggle.dataset.navGroup) {
            UI.closeNavFlyout();
          } else {
            UI.openNavFlyout(groupToggle.dataset.navGroup, state.navSection, groupToggle);
            document.getElementById('nsb-flyout')?.setAttribute('data-group', groupToggle.dataset.navGroup);
          }
          return;
        }
        // Expanded mode: one-at-a-time accordion
        UI.toggleNavGroup(groupToggle.dataset.navGroup);
        UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
        return;
      }
      // Nav item (standalone item or child item)
      const navItem = e.target.closest('[data-nav]');
      if (navItem && !navItem.classList.contains('nsb-item--upcoming')) {
        if (window.innerWidth <= 640) _closeMobileDrawer();
        navigateTo(navItem.dataset.nav);
        return;
      }
      // Admin/Trainer mode toggle
      const modeBtn = e.target.closest('[data-nav-mode]');
      if (modeBtn) {
        state.navMode = modeBtn.dataset.navMode;
        UI.setNavMode(state.navMode);
        UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
        return;
      }
      // Batch selector trigger — toggle dropdown
      if (e.target.closest('#nav-batch-trigger')) {
        const dd       = document.getElementById('nav-batch-dropdown');
        const chevron  = document.querySelector('#nav-batch-trigger .nsb-batch-chevron');
        if (dd) {
          const isOpen = dd.style.display !== 'none';
          dd.style.display = isOpen ? 'none' : 'block';
          chevron?.classList.toggle('nsb-batch-chevron--open', !isOpen);
          if (!isOpen) document.getElementById('nav-batch-search')?.focus();
        }
        return;
      }
      // Batch option in dropdown
      const batchOpt = e.target.closest('[data-batch-id]');
      if (batchOpt) {
        const dd = document.getElementById('nav-batch-dropdown');
        if (dd) dd.style.display = 'none';
        document.querySelector('#nav-batch-trigger .nsb-batch-chevron')?.classList.remove('nsb-batch-chevron--open');
        if (window.innerWidth <= 640) _closeMobileDrawer();
        selectBatch(batchOpt.dataset.batchId);
        return;
      }
      // New Batch button (inside dropdown)
      if (e.target.closest('#btn-new-batch')) {
        const dd = document.getElementById('nav-batch-dropdown');
        if (dd) dd.style.display = 'none';
        document.querySelector('#nav-batch-trigger .nsb-batch-chevron')?.classList.remove('nsb-batch-chevron--open');
        if (window.innerWidth <= 640) _closeMobileDrawer();
        openCreateBatchModal();
        return;
      }
      // Sidebar logout button
      if (e.target.closest('#btn-logout-sidebar'))  { _handleLogout(); return; }
    });

    // ── Keyboard nav: Enter/Space activates sidebar items ──────────────────────
    _sidebar?.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('[data-nav],[data-nav-group],[data-batch-id],[id="nav-collapse-btn"],[id="btn-logout-sidebar"]');
      if (!target) return;
      e.preventDefault();
      target.click();
    });

    // Batch search filtering — input delegation on sidebar
    _sidebar?.addEventListener('input', e => {
      if (!e.target.matches('#nav-batch-search')) return;
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#nav-batch-list [data-batch-id]').forEach(li => {
        const label = li.querySelector('.nsb-opt-label')?.textContent.toLowerCase() || '';
        li.style.display = label.includes(q) ? '' : 'none';
      });
    });

    document.getElementById('btn-backup')?.addEventListener('click', _doBackup);

    document.getElementById('btn-restore')?.addEventListener('click', () =>
      document.getElementById('restore-input')?.click());
    document.getElementById('restore-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (Storage.importJSON(reader.result)) {
          // ISOLATION_CHANGE: re-run migration after restore — restored batches
          // may lack ownerId; stamp them to the current user so they appear correctly.
          const cu = Storage.getCurrentUser();
          if (cu) Storage.migrateOrphanedBatches(cu.id);
          UI.showToast('Backup restored!', 'success');
          loadInitialView();
        } else {
          UI.showToast('Invalid backup file.', 'error');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    // LOGIN_CHANGE LOGIN-3: Logout button
    document.getElementById('btn-logout')?.addEventListener('click', _handleLogout);

    document.getElementById('main-content').addEventListener('click', handleMainClick);

    // Calendar view-mode dropdown (select fires 'change', not 'click')
    document.getElementById('main-content').addEventListener('change', e => {
      const sel = e.target.closest('.cal-view-select');
      if (!sel) return;
      const batchId = sel.dataset.bid || state.activeBatchId;
      state.calViewMode = sel.value;
      openTimetable(batchId);
    });

    // ── Content topbar event delegation ──────────────────────────────────────
    document.getElementById('content-area')?.addEventListener('click', e => {
      if (e.target.closest('#ct-dark-toggle'))  { toggleTheme(); return; }
      if (e.target.closest('#ct-btn-backup'))   { _doBackup(); return; }
      if (e.target.closest('#ct-btn-restore'))  { document.getElementById('restore-input').click(); return; }
      if (e.target.closest('#ct-profile-chip')) { _openProfileDrawer(); return; }
    });

    // ── Profile drawer event delegation ──────────────────────────────────────
    document.getElementById('profile-drawer')?.addEventListener('click', e => {
      if (e.target.closest('#pd-close-btn'))     { _closeProfileDrawer(); return; }
      if (e.target.closest('#pd-edit-profile'))  { _closeProfileDrawer(); openUserProfile(); return; }
      if (e.target.closest('#pd-cal-prev'))  {
        _calMonth--;
        if (_calMonth < 0) { _calMonth = 11; _calYear--; }
        _refreshDrawerCal();
        return;
      }
      if (e.target.closest('#pd-cal-next'))  {
        _calMonth++;
        if (_calMonth > 11) { _calMonth = 0; _calYear++; }
        _refreshDrawerCal();
        return;
      }
    });
    document.getElementById('drawer-backdrop')?.addEventListener('click', _closeProfileDrawer);

    // Cal chip popup action handler — popup lives in document.body (outside
    // #main-content) so handleMainClick never sees these clicks; they bubble
    // all the way to document and are caught here instead.
    document.addEventListener('click', e => {
      const chipBtn = e.target.closest('[data-action="cal-chip-edit"],[data-action="cal-chip-delete"]');
      if (!chipBtn) return;
      const act      = chipBtn.dataset.action;
      const eid      = chipBtn.dataset.eid;
      const bid      = chipBtn.dataset.bid;
      const occDate  = chipBtn.dataset.date     || '';
      const origDate = chipBtn.dataset.origDate || occDate;
      _hideCalChipPopup();
      if (act === 'cal-chip-edit')   openCalendarEventModal(bid, eid);
      if (act === 'cal-chip-delete') _confirmDeleteCalendarEvent(bid, eid, occDate, origDate);
    });

    // Close any open dropdowns/menus when clicking outside
    document.addEventListener('click', e => {
      // Flyout: handle child nav clicks and outside-click close
      const flyoutItem = e.target.closest('[data-flyout-nav]');
      if (flyoutItem) {
        UI.closeNavFlyout();
        navigateTo(flyoutItem.dataset.flyoutNav);
        return;
      }
      if (!e.target.closest('#nsb-flyout') && !e.target.closest('[data-nav-group]')) {
        UI.closeNavFlyout();
      }

      document.getElementById('more-actions-menu')?.classList.remove('is-open');
      document.querySelectorAll('.kebab-menu.is-open').forEach(m => m.classList.remove('is-open'));
      // Close mock interview kebab menus on outside click
      document.querySelectorAll('.mi-kebab-menu').forEach(m => m.style.display = 'none');
      // Close batch dropdown when clicking outside sidebar
      if (!e.target.closest('#sidebar')) {
        const dd = document.getElementById('nav-batch-dropdown');
        if (dd) dd.style.display = 'none';
        document.querySelector('#nav-batch-trigger .nsb-batch-chevron')?.classList.remove('nsb-batch-chevron--open');
      }
    });

    // Escape key closes the flyout
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') UI.closeNavFlyout();
    });

    // S-3 fix: flush any pending debounced writes to Supabase when the tab is
    // closed or navigated away from, minimising the 1.5 s data-loss window.
    window.addEventListener('beforeunload', () => SupabaseSync.flushAll());

  }

  /**
   * Hover sidebar — open on mouseenter, close (with 200 ms delay) on mouseleave.
   * The delay prevents flickering when the cursor briefly crosses the sidebar edge.
   * Called once from bindGlobalEvents(); safe to call multiple times (early-return guard).
   */
  let _sidebarCloseTimer = null;
  function _bindSidebarHover() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || sidebar._hoverBound) return;
    sidebar._hoverBound = true;

    sidebar.addEventListener('mouseenter', () => {
      clearTimeout(_sidebarCloseTimer);
      sidebar.classList.remove('sidebar-compact');
      UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
    });

    sidebar.addEventListener('mouseleave', () => {
      _sidebarCloseTimer = setTimeout(() => {
        // Only auto-collapse if sidebar is NOT pinned open by the toggle button.
        // Pinned = getSidebarCompact() is false (compact=false means "stay open").
        const pinned = !Storage.getSidebarCompact();
        if (pinned) return;
        sidebar.classList.add('sidebar-compact');
        UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
      }, 200);
    });
  }

  /** STUDENT_PORTAL: Wire all student interactions — sidebar, topbar, profile drawer, calendar. */
  function bindStudentGlobalEvents() {
    const studentSidebar   = document.getElementById('student-sidebar');
    const studentBackdrop  = document.getElementById('student-sidebar-backdrop');
    const studentHamburger = document.getElementById('btn-student-hamburger');
    const contentArea      = document.getElementById('student-content-area');
    const profileDrawer    = document.getElementById('student-profile-drawer');
    const drawerBackdrop   = document.getElementById('student-drawer-backdrop');

    // ── Helper: get current student/batch safely ───────────────────────────
    function _getStudentContext() {
      const user    = Storage.getCurrentUser();
      const student = user ? Storage.getStudent(user.linkedBatchId, user.linkedStudentId) : null;
      const batch   = user ? Storage.getBatch(user.linkedBatchId) : null;
      return { user, student, batch };
    }

    // ── Helper: navigate to a student section ─────────────────────────────
    function _navigateStudentTo(section) {
      _studentNavSection = section;
      const { student, batch } = _getStudentContext();
      UI.renderStudentSidebar(student, _studentNavSection);
      if (section === 'dashboard') {
        UI.renderStudentTopbar(student, 'Dashboard');
        if (student && batch) UI.renderStudentDashboard(student, batch);
      } else if (section === 'attendance') {
        UI.renderStudentTopbar(student, 'Attendance');
        if (student && batch) UI.renderStudentAttendance(student, batch);
      } else if (section === 'tests') {
        UI.renderStudentTopbar(student, 'Test Scores');
        if (student && batch) UI.renderStudentTestScores(student, batch);
      } else if (section === 'mock-history') {
        UI.renderStudentTopbar(student, 'Mock History');
        if (student && batch) UI.renderStudentMockHistory(student, batch);
      } else if (section === 'placement') {
        UI.renderStudentTopbar(student, 'Placement');
        if (student && batch) UI.renderStudentPlacement(student, batch);
      } else if (section === 'calendar') {
        UI.renderStudentTopbar(student, 'Calendar');
        if (batch) UI.renderCalendar(batch, _studentCalViewMode, _studentCalDate, true, 'student-main-content');
      } else if (section === 'mcq-tests') {
        UI.renderStudentTopbar(student, 'MCQ Tests');
        _openMCQTests();
      } else if (section === 'settings') {
        UI.renderStudentTopbar(student, 'Settings');
        UI.renderStudentSettings();
      }
    }

    // ── Helper: re-render sidebar preserving compact state ────────────────
    function _rerenderStudentSidebar() {
      const { student } = _getStudentContext();
      UI.renderStudentSidebar(student, _studentNavSection);
    }

    // ── Mobile sidebar drawer helpers ─────────────────────────────────────
    function _openStudentDrawer() {
      studentSidebar?.classList.add('mobile-open');
      studentBackdrop?.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    function _closeStudentDrawer() {
      studentSidebar?.classList.remove('mobile-open');
      studentBackdrop?.classList.remove('active');
      document.body.style.overflow = '';
    }

    studentHamburger?.addEventListener('click', _openStudentDrawer);
    studentBackdrop?.addEventListener('click', _closeStudentDrawer);

    // ── Sidebar click delegation ──────────────────────────────────────────
    if (studentSidebar) {
      studentSidebar.addEventListener('click', e => {

        // Collapse / expand toggle
        if (e.target.closest('#student-sidebar-collapse-btn')) {
          studentSidebar.classList.toggle('nav-sidebar--compact');
          _rerenderStudentSidebar();
          return;
        }

        // Compact rail click on non-interactive area → expand
        const isCompact = studentSidebar.classList.contains('nav-sidebar--compact');
        if (isCompact) {
          const hit = e.target.closest(
            '[data-student-nav],#student-sidebar-collapse-btn,' +
            '#btn-student-logout,#student-settings-btn'
          );
          if (!hit) {
            studentSidebar.classList.remove('nav-sidebar--compact');
            _rerenderStudentSidebar();
            return;
          }
        }

        // Nav item click — all student sections
        const navItem = e.target.closest('[data-student-nav]');
        if (navItem) {
          const section = navItem.dataset.studentNav;
          const knownSections = ['dashboard', 'attendance', 'tests', 'mcq-tests', 'mock-history', 'placement', 'calendar', 'settings'];
          if (knownSections.includes(section)) {
            if (window.innerWidth <= 640) _closeStudentDrawer();
            _navigateStudentTo(section);
          }
          return;
        }

        // Settings
        if (e.target.closest('#student-settings-btn')) {
          if (window.innerWidth <= 640) _closeStudentDrawer();
          _navigateStudentTo('settings');
          return;
        }

        // Logout
        if (e.target.closest('#btn-student-logout')) {
          _handleStudentLogout();
          return;
        }
      });

      // Keyboard nav: Enter / Space
      studentSidebar.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const target = e.target.closest(
          '[data-student-nav],#student-sidebar-collapse-btn,#btn-student-logout,#student-settings-btn'
        );
        if (!target) return;
        e.preventDefault();
        target.click();
      });
    }

    // ── Student calendar view-mode dropdown ───────────────────────────────
    contentArea?.addEventListener('change', e => {
      const sel = e.target.closest('.cal-view-select');
      if (!sel) return;
      _studentCalViewMode = sel.value;
      _navigateStudentTo('calendar');
    });

    // ── Content area delegation: topbar buttons + calendar navigation ─────
    contentArea?.addEventListener('click', e => {

      // Dark mode toggle (in topbar)
      if (e.target.closest('#student-dark-toggle')) {
        toggleStudentTheme();
        const { student } = _getStudentContext();
        const titles = { dashboard:'Dashboard', attendance:'Attendance', tests:'Test Scores', 'mcq-tests':'MCQ Tests', 'mock-history':'Mock History', placement:'Placement', calendar:'Calendar', settings:'Settings' };
        UI.renderStudentTopbar(student, titles[_studentNavSection] || 'Dashboard');
        return;
      }

      // Settings page — dark mode toggle
      if (e.target.closest('#student-settings-dark-toggle')) {
        toggleStudentTheme();
        UI.renderStudentSettings(); // re-render so button label flips
        return;
      }

      // Settings page — change password
      if (e.target.closest('#student-settings-change-password')) {
        const user = Storage.getCurrentUser();
        if (!user) return;
        UI.showChangePasswordModal((oldPass, newPass, errEl, modal) => {
          const result = Storage.changePassword(user.id, oldPass, newPass);
          if (!result.ok) {
            errEl.textContent = result.error;
            errEl.style.display = 'block';
            UI.showToast(result.error, 'error');
            return;
          }
          modal.remove();
          UI.showToast('Password updated successfully!', 'success');
        });
        return;
      }

      // Profile chip → open drawer
      if (e.target.closest('#student-profile-chip')) {
        _openStudentProfileDrawer();
        return;
      }

      // Calendar navigation + MCQ actions — all via data-action
      const btn    = e.target.closest('[data-action]');
      const action = btn?.dataset?.action;
      if (!action) return;

      if (action === 'cal-prev') {
        _studentCalDate = _calShift(_studentCalDate, _studentCalViewMode, -1);
        _navigateStudentTo('calendar'); return;
      }
      if (action === 'cal-next') {
        _studentCalDate = _calShift(_studentCalDate, _studentCalViewMode, +1);
        _navigateStudentTo('calendar'); return;
      }
      if (action === 'cal-today') {
        _studentCalDate = _todayStr();
        _navigateStudentTo('calendar'); return;
      }
      if (action === 'cal-view-day')    { _studentCalViewMode = 'day';    _navigateStudentTo('calendar'); return; }
      if (action === 'cal-view-week')   { _studentCalViewMode = 'week';   _navigateStudentTo('calendar'); return; }
      if (action === 'cal-view-month')  {
        if (btn.dataset.date) _studentCalDate = btn.dataset.date;
        _studentCalViewMode = 'month';
        _navigateStudentTo('calendar'); return;
      }
      if (action === 'cal-view-year')   { _studentCalViewMode = 'year';   _navigateStudentTo('calendar'); return; }
      if (action === 'cal-view-agenda') { _studentCalViewMode = 'agenda'; _navigateStudentTo('calendar'); return; }
      if (action === 'cal-day-click') {
        _studentCalDate     = btn.dataset.date;
        _studentCalViewMode = 'day';
        _navigateStudentTo('calendar'); return;
      }
      // All write actions (cal-new-event, cal-chip-menu, cal-edit-event, cal-delete-event)
      // are suppressed by .cal-shell--readonly CSS (pointer-events: none on .cal-ev) — no handler needed.

      // ── MCQ test actions ────────────────────────────────────────────────
      if (action === 'mcq-start')    { _handleMCQStart(btn.dataset.tid);   return; }
      if (action === 'mcq-resume')   { _handleMCQResume(btn.dataset.tid);  return; }
      if (action === 'mcq-results')  { _handleMCQViewResults(btn.dataset.tid); return; }
      if (action === 'mcq-answer')   { _handleMCQAnswer(btn.dataset.qid, btn.dataset.opt); return; }
      if (action === 'mcq-prev')     { _handleMCQNavigate(-1); return; }
      if (action === 'mcq-next')     { _handleMCQNavigate(+1); return; }
      if (action === 'mcq-goto')     { _handleMCQGoto(parseInt(btn.dataset.qi, 10)); return; }
      if (action === 'mcq-submit')   { _handleMCQSubmit(); return; }
      if (action === 'mcq-review')   { _handleMCQReview(btn.dataset.aid); return; }
      if (action === 'mcq-back-list'){ _stopMCQTimer(); _navigateStudentTo('mcq-tests'); return; }
    });

    // ── Student profile drawer delegation ─────────────────────────────────
    profileDrawer?.addEventListener('click', e => {
      if (e.target.closest('#student-pd-close-btn')) {
        _closeStudentProfileDrawer(); return;
      }
      if (e.target.closest('#student-pd-cal-prev')) {
        _studentDrawerCalMonth--;
        if (_studentDrawerCalMonth < 0) { _studentDrawerCalMonth = 11; _studentDrawerCalYear--; }
        _refreshStudentDrawerCal(); return;
      }
      if (e.target.closest('#student-pd-cal-next')) {
        _studentDrawerCalMonth++;
        if (_studentDrawerCalMonth > 11) { _studentDrawerCalMonth = 0; _studentDrawerCalYear++; }
        _refreshStudentDrawerCal(); return;
      }
    });

    drawerBackdrop?.addEventListener('click', _closeStudentProfileDrawer);
  }

  // ─── AUTH Handlers — LOGIN_CHANGE LOGIN-4 ──────────────────────────────────

  /** Handle login form submit — SB-2: async to hydrate batches before starting */
  async function _handleLogin(username, password) {
    if (!username) { UI.showAuthError('auth-login-error', 'Please enter your username.'); return; }
    if (!password) { UI.showAuthError('auth-login-error', 'Please enter your password.'); return; }

    const result = Storage.authenticateUser(username, password);
    if (!result.ok) {
      UI.showAuthError('auth-login-error', result.error);
      return;
    }
    _showSyncOverlay('Loading your data\u2026');
    await SupabaseSync.hydrateBatches(result.user.id, result.user.role === 'admin');
    // R-6: sync scoring config on fresh login — mirrors the init() path so weights/thresholds
    // are consistent across devices regardless of whether the user reloaded or logged in fresh.
    await ScoringConfig.syncFromCloud();
    // Phase 3: union-merge sessions from spms_sessions into localStorage (trainer/admin only —
    // students get their sessions via hydrateSessions(batchId) in _startStudentApp)
    if (result.user.role !== 'student') {
      await SupabaseSync.hydrateSessions();
    }
    // R-8: students have no tasks — guard prevents an unnecessary Supabase call on student login.
    if (result.user.role !== 'student') {
      await SupabaseSync.hydrateTasks(result.user.id);
    }
    _hideSyncOverlay();
    _startApp(result.user);
  }

  /** Handle signup form submit — V4-2: receives full profile object; SB-3: flushes new user immediately */
  async function _handleSignup(profile) {
    const result = Storage.createUser(profile);
    if (!result.ok) {
      UI.showAuthError('auth-signup-error', result.error);
      return;
    }
    Storage.authenticateUser(profile.username, profile.password);
    // Flush the new user to Supabase immediately so other devices can see it
    // (don't wait for the 1.5 s debounce — the user must exist before anyone logs in)
    _showSyncOverlay('Creating your account\u2026');
    await SupabaseSync.flushUsers(Storage.getAllUsers());
    _hideSyncOverlay();
    const roleLabel = result.user.role === 'admin' ? 'Admin' : 'Trainer';
    UI.showToast(`Welcome, ${result.user.fullName || result.user.username}! Account created as ${roleLabel}.`, 'success');
    _startApp(result.user);
  }

  /** Handle logout button click */
  function _handleLogout() {
    UI.showConfirm('Log out? You will be returned to the login screen. Your data is safe.', () => {
      Storage.logoutUser();
      state.activeBatchId   = null;
      state.view            = 'welcome';
      state.activeStudentId = null;
      Charts.destroyAll();
      // Bug-2b fix: clear stale DOM before hiding the app shell so the next
      // user never briefly sees the previous user's content on re-login.
      const _bl = document.getElementById('batch-list');
      const _mc = document.getElementById('main-content');
      if (_bl) _bl.innerHTML = '';
      if (_mc) _mc.innerHTML = '';
      UI.setAuthState(false);
      UI.renderAuthScreen(_handleLogin, _handleSignup);
    });
  }

  /** STUDENT_PORTAL: Handle logout from the student shell. */
  function _handleStudentLogout() {
    UI.showConfirm('Log out?', () => {
      // Close any open student drawer before logging out
      _closeStudentProfileDrawer();
      Storage.logoutUser();
      Charts.destroyAll();
      // Reset student state for next login
      _studentNavSection     = 'dashboard';
      _studentCalViewMode    = 'month';
      _studentCalDate        = _todayStr();
      _studentDrawerCalYear  = new Date().getFullYear();
      _studentDrawerCalMonth = new Date().getMonth();
      _stopMCQTimer();
      _mcqTests = []; _mcqAttempts = []; _mcqActiveTest = null;
      _mcqQuestions = []; _mcqCurrentQ = 0; _mcqAnswers = {};
      _mcqAttemptId = null; _mcqDeadline = null;
      UI.setStudentAuthState(false);
      UI.renderAuthScreen(_handleLogin, _handleSignup);
    });
  }

  // ─── MCQ Student Test-Taking (Phase 3) ──────────────────────────────────────

  async function _openMCQTests() {
    const user = Storage.getCurrentUser();
    if (!user) return;
    const student = Storage.getStudent(user.linkedBatchId, user.linkedStudentId);
    const batch   = Storage.getBatch(user.linkedBatchId);
    if (!student || !batch) { UI.renderStudentMCQTests([], []); return; }
    try {
      const [tests, attempts] = await Promise.all([
        SupabaseSync.fetchStudentTests(user.linkedBatchId, user.linkedStudentId),
        SupabaseSync.fetchStudentAttempts(user.linkedStudentId, user.linkedBatchId),
      ]);
      _mcqTests   = tests;
      _mcqAttempts = attempts;
      UI.renderStudentMCQTests(tests, attempts);
    } catch (err) {
      console.error('MCQ fetch error', err);
      UI.renderStudentMCQTests([], []);
      UI.showToast('Could not load tests. Check connection.', 'error');
    }
  }

  async function _handleMCQStart(testId) {
    const user = Storage.getCurrentUser();
    if (!user) return;
    const test = _mcqTests.find(t => t.id === testId);
    if (!test) return;

    UI.showToast('Loading test…', 'info');
    try {
      const deadlineISO = new Date(Date.now() + test.duration_mins * 60 * 1000).toISOString();
      const attemptId   = await SupabaseSync.startAttempt(
        testId, user.linkedStudentId, user.linkedBatchId, deadlineISO
      );
      const questions   = await SupabaseSync.fetchTestQuestions(test.question_ids);
      if (!questions.length) { UI.showToast('No questions found for this test.', 'error'); return; }

      _mcqActiveTest    = test;
      _mcqAttemptId     = attemptId;
      _mcqDeadline      = deadlineISO;
      _mcqQuestions     = questions;
      _mcqCurrentQ      = 0;
      _mcqAnswers       = {};

      _startMCQTimer();
      _renderTestTaking();
    } catch (err) {
      console.error('MCQ start error', err);
      UI.showToast('Failed to start test. Try again.', 'error');
    }
  }

  async function _handleMCQResume(testId) {
    const user    = Storage.getCurrentUser();
    if (!user) return;
    const test    = _mcqTests.find(t => t.id === testId);
    const attempt = _mcqAttempts.find(a => a.test_id === testId && a.status === 'in_progress');
    if (!test || !attempt) return;

    // If past deadline already, don't resume
    if (new Date(attempt.deadline).getTime() < Date.now()) {
      UI.showToast('Test time has expired.', 'error');
      _openMCQTests();
      return;
    }

    UI.showToast('Resuming test…', 'info');
    try {
      const questions = await SupabaseSync.fetchTestQuestions(test.question_ids);
      if (!questions.length) { UI.showToast('No questions found.', 'error'); return; }

      _mcqActiveTest = test;
      _mcqAttemptId  = attempt.id;
      _mcqDeadline   = attempt.deadline;
      _mcqQuestions  = questions;
      _mcqCurrentQ   = 0;
      _mcqAnswers    = attempt.answers_snapshot || {};

      _startMCQTimer();
      _renderTestTaking();
    } catch (err) {
      console.error('MCQ resume error', err);
      UI.showToast('Failed to resume. Try again.', 'error');
    }
  }

  function _handleMCQViewResults(testId) {
    const attempt = _mcqAttempts.find(a => a.test_id === testId && a.status === 'submitted');
    const test    = _mcqTests.find(t => t.id === testId);
    if (!attempt || !test) return;
    _mcqResultAttempt = attempt;
    UI.renderStudentTestResult(attempt, test.title);
  }

  function _handleMCQAnswer(questionId, option) {
    _mcqAnswers[questionId] = option;
    _renderTestTaking();
    _scheduleMCQAnswerSave();
  }

  function _handleMCQNavigate(delta) {
    const next = _mcqCurrentQ + delta;
    if (next < 0 || next >= _mcqQuestions.length) return;
    _mcqCurrentQ = next;
    _renderTestTaking();
  }

  function _handleMCQGoto(idx) {
    if (idx < 0 || idx >= _mcqQuestions.length) return;
    _mcqCurrentQ = idx;
    _renderTestTaking();
  }

  async function _handleMCQSubmit() {
    if (!_mcqAttemptId || !_mcqActiveTest) return;
    const unanswered = _mcqQuestions.length - Object.keys(_mcqAnswers).length;
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`
      : 'Submit the test? You cannot change answers after submission.';

    UI.showConfirm(msg, async () => {
      _stopMCQTimer();
      clearTimeout(_mcqSaveTimer);

      const user = Storage.getCurrentUser();
      if (!user) return;

      UI.showToast('Submitting…', 'info');
      try {
        const result = await SupabaseSync.submitTestRPC(
          _mcqAttemptId, _mcqActiveTest.id, user.linkedStudentId, _mcqAnswers
        );
        // result = { score, total, percentage, passed, title }

        // Append to student.weeklyTests[] in the same format as manual entry
        const student = Storage.getStudent(user.linkedBatchId, user.linkedStudentId);
        if (student) {
          const weeklyTests = Array.isArray(student.weeklyTests) ? [...student.weeklyTests] : [];
          weeklyTests.push({ week: result.title, date: new Date().toISOString(), marks: result.score, total: result.total });
          Storage.updateStudent(user.linkedBatchId, user.linkedStudentId, { weeklyTests });
        }

        // Update local attempts cache
        const attempt = _mcqAttempts.find(a => a.id === _mcqAttemptId);
        if (attempt) {
          attempt.status      = 'submitted';
          attempt.score       = result.score;
          attempt.total       = result.total;
          attempt.percentage  = result.percentage;
          attempt.passed      = result.passed;
        }

        UI.renderStudentTestResult(
          attempt || { score: result.score, total: result.total, percentage: result.percentage, passed: result.passed },
          result.title
        );
        UI.showToast(result.passed ? 'Test submitted — Passed!' : 'Test submitted — Failed', result.passed ? 'success' : 'error');
      } catch (err) {
        console.error('MCQ submit error', err);
        UI.showToast('Submission failed. Try again.', 'error');
        // Timer already stopped; let student retry
        _startMCQTimer();
        _renderTestTaking();
      }
    });
  }

  function _renderTestTaking() {
    const secondsLeft = _mcqDeadline
      ? Math.max(0, Math.floor((new Date(_mcqDeadline).getTime() - Date.now()) / 1000))
      : 0;
    UI.renderStudentTestTaking(_mcqActiveTest, _mcqQuestions, _mcqCurrentQ, _mcqAnswers, secondsLeft);
  }

  function _startMCQTimer() {
    _stopMCQTimer();
    _mcqTimerInterval = setInterval(() => {
      const secondsLeft = _mcqDeadline
        ? Math.max(0, Math.floor((new Date(_mcqDeadline).getTime() - Date.now()) / 1000))
        : 0;
      // Update just the timer display without re-rendering whole screen
      const timerEl = document.querySelector('.mcq-timer');
      if (timerEl) {
        const mins    = Math.floor(secondsLeft / 60);
        const secs    = secondsLeft % 60;
        const timeStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        // Preserve any child SVG icon nodes; only update the text node
        const textNode = [...timerEl.childNodes].find(n => n.nodeType === 3);
        if (textNode) textNode.textContent = ' ' + timeStr;
        else timerEl.append(' ' + timeStr);
        timerEl.className = 'mcq-timer' +
          (secondsLeft < 120 ? ' mcq-timer--urgent' : secondsLeft < 300 ? ' mcq-timer--warn' : '');
      }
      if (secondsLeft <= 0) {
        _stopMCQTimer();
        UI.showToast('Time is up! Submitting automatically…', 'error');
        _autoSubmitMCQ();
      }
    }, 1000);
  }

  function _stopMCQTimer() {
    if (_mcqTimerInterval) { clearInterval(_mcqTimerInterval); _mcqTimerInterval = null; }
  }

  async function _autoSubmitMCQ() {
    if (!_mcqAttemptId || !_mcqActiveTest) return;
    const user = Storage.getCurrentUser();
    if (!user) return;
    try {
      const result = await SupabaseSync.submitTestRPC(
        _mcqAttemptId, _mcqActiveTest.id, user.linkedStudentId, _mcqAnswers
      );
      const autoStudent = Storage.getStudent(user.linkedBatchId, user.linkedStudentId);
      if (autoStudent) {
        const weeklyTests = Array.isArray(autoStudent.weeklyTests) ? [...autoStudent.weeklyTests] : [];
        weeklyTests.push({ week: result.title, date: new Date().toISOString(), marks: result.score, total: result.total });
        Storage.updateStudent(user.linkedBatchId, user.linkedStudentId, { weeklyTests });
      }
      const attempt = _mcqAttempts.find(a => a.id === _mcqAttemptId);
      if (attempt) {
        Object.assign(attempt, { status:'submitted', score:result.score, total:result.total, percentage:result.percentage, passed:result.passed });
      }
      UI.renderStudentTestResult(
        attempt || { score:result.score, total:result.total, percentage:result.percentage, passed:result.passed },
        result.title
      );
    } catch (err) {
      console.error('Auto-submit error', err);
      UI.showToast('Auto-submit failed. Contact your trainer.', 'error');
    }
  }

  function _scheduleMCQAnswerSave() {
    clearTimeout(_mcqSaveTimer);
    _mcqSaveTimer = setTimeout(async () => {
      if (!_mcqAttemptId) return;
      try { await SupabaseSync.saveAnswers(_mcqAttemptId, _mcqAnswers); }
      catch (e) { /* silent — answers are in memory, next save will retry */ }
    }, 30000); // 30s debounce
  }

  // ─── Phase 4A: Trainer — view per-test results ───────────────────────────

  async function _handleViewTestResults(testId, batchId) {
    const panel   = document.getElementById('acad-panel');
    const overlay = document.getElementById('acad-overlay');
    if (!panel || !overlay) return;
    // Open panel immediately with a loading state
    panel.innerHTML = `<div class="slideout-body" style="padding:2rem;text-align:center;color:var(--text3)">Loading results…</div>`;
    overlay.classList.add('slideout-overlay--open');
    panel.classList.add('slideout-panel--open');
    try {
      const user = Storage.getCurrentUser();
      const [tests, allAttempts] = await Promise.all([
        SupabaseSync.fetchTests(user.id, batchId),
        SupabaseSync.fetchAllTestAttempts(testId),
      ]);
      const test = tests.find(t => t.id === testId);
      if (!test) throw new Error('Test not found');
      // Build student name map and full student list from localStorage
      const batch         = Storage.getBatch(batchId);
      const batchStudents = batch?.students || [];
      const studentMap    = {};
      batchStudents.forEach(s => { studentMap[s.id] = s.name; });
      panel.innerHTML = UI.testResultsPanel(test, allAttempts, studentMap, batchStudents);
    } catch (err) {
      panel.innerHTML = `<div class="slideout-body"><p style="color:var(--bad);padding:1rem">${err.message}</p></div>`;
    }
  }

  // ─── Phase 4B: Student — review answers ─────────────────────────────────

  async function _handleMCQReview(attemptId) {
    if (!attemptId) return;
    const user = Storage.getCurrentUser();
    if (!user?.linkedStudentId) return;
    const container = document.getElementById('student-main-content');
    if (container) container.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--text3)">Loading review…</div>`;
    try {
      const reviewData = await SupabaseSync.fetchAttemptReview(attemptId, user.linkedStudentId);
      // Look up test title from cached state
      const attempt  = _mcqAttempts.find(a => a.id === attemptId) || _mcqResultAttempt || {};
      const test     = _mcqTests.find(t => t.id === attempt.test_id);
      const title    = test?.title || 'Test Review';
      UI.renderStudentAnswerReview(reviewData, title);
    } catch (err) {
      UI.showToast(`Could not load review: ${err.message}`, 'error');
      // Fall back to MCQ test list (_navigateStudentTo is scoped inside bindStudentGlobalEvents)
      _openMCQTests();
    }
  }

  // ─── V4: Profile Page ─────────────────────────────────────────────────────

  // ─── Manage Batch (Phase 5) ─────────────────────────────────────────────────

  function openManageBatch(batchId, tab = 'details') {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view        = 'manage-batch';
    // Do NOT reset navSection here — navigateTo() already set the correct section
    // (could be 'manage-batch' OR 'attendance-holiday' depending on which nav item
    // the user clicked). Overwriting would wipe the group-parent highlight.
    state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    UI.renderManageBatch(batch, tab);
    _bindManageBatchEvents(batchId, tab);
  }

  function _bindManageBatchEvents(batchId, activeTab) {
    // Tab switching
    document.getElementById('manage-tabs')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-manage-tab]');
      if (tab) openManageBatch(batchId, tab.dataset.manageTab);
    });

    // Save batch details form (includes meeting link)
    document.getElementById('manage-batch-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const name     = document.getElementById('mb-name')?.value.trim();
      if (!name) { UI.showToast('Batch name is required.', 'error'); return; }

      // Build meeting links map (trainer-specific)
      const currentUser   = Storage.getCurrentUser();
      const existingBatch = Storage.getBatch(batchId);
      const meetingLinks  = { ...(existingBatch?.meetingLinks || {}) };
      const meetingLinkVal = document.getElementById('mb-meeting-link')?.value.trim() || '';
      if (currentUser) meetingLinks[currentUser.id] = meetingLinkVal;

      const updates  = {
        name,
        batchCode:    document.getElementById('mb-code')?.value.trim() || '',
        description:  document.getElementById('mb-desc')?.value.trim() || '',
        startDate:    document.getElementById('mb-start')?.value || '',
        endDate:      document.getElementById('mb-end')?.value || '',
        capacity:     parseInt(document.getElementById('mb-capacity')?.value) || 0,
        status:       document.getElementById('mb-status')?.value || 'active',
        meetingLinks,
      };
      Storage.updateBatch(batchId, updates);
      UI.showToast('Batch details saved!', 'success');
      // Refresh sidebar with updated batch name; re-render so Start Meeting reflects new url
      UI.renderSidebar(Storage.getMyBatches(), batchId);
      openManageBatch(batchId, 'details');
    });

    // Import Excel — Students tab
    document.getElementById('mb-import-excel')?.addEventListener('click', () => openBulkImportModal(batchId));

    // Export Reports — Reports tab
    document.getElementById('mb-export-reports')?.addEventListener('click', () => openBatchExportModal(batchId));

    // Sessions-per-day selector — Session Plan tab
    document.getElementById('mb-sess-per-day')?.addEventListener('change', e => {
      Storage.updateBatch(batchId, { sessionsPerDay: parseInt(e.target.value) || 1 });
      openManageBatch(batchId, 'session-plan');
    });

    // Upload Session Plan — Session Plan tab
    document.getElementById('mb-plan-file')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file || typeof XLSX === 'undefined') return;
      const statusEl = document.getElementById('mb-plan-status');
      if (statusEl) { statusEl.style.cssText = 'display:block;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#94a3b8;font-size:.85rem;'; statusEl.textContent = '⏳ Parsing…'; }
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const wb    = XLSX.read(ev.target.result, { type: 'array' });
          const sName = wb.SheetNames.includes('Logsheet') ? 'Logsheet' : wb.SheetNames[0];
          const ws    = wb.Sheets[sName];
          const rows  = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
          const plan  = []; let curSubj = '';
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const subj = (r[0] || '').toString().trim();
            const rawT = (r[2] || '').toString().replace(/\r\n|\r|\n/g,' ').trim();
            const dur  = parseFloat(r[3]) || 0;
            if (subj && subj.toLowerCase() !== 'subject') curSubj = subj;
            if (!rawT || rawT.toLowerCase() === 'total') continue;
            if (!curSubj) continue;
            const sn = parseInt(r[1]);
            if (isNaN(sn) || sn < 1) continue;
            plan.push({ subject: curSubj, sessionNo: sn, topic: rawT, durationHrs: dur });
          }
          if (!plan.length) {
            if (statusEl) { statusEl.style.cssText = 'display:block;padding:10px 14px;background:#451a03;border:1px solid #92400e;border-radius:8px;color:#fcd34d;font-size:.85rem;'; statusEl.innerHTML = '⚠️ No sessions found. Check columns: <b>Subject · Sessions · Topic · Duration (Hrs.)</b>'; }
            return;
          }
          Storage.updateBatch(batchId, { coursePlan: plan });
          openManageBatch(batchId, 'session-plan');
          UI.showToast(`Session plan uploaded — ${plan.length} sessions, ${plan.reduce((s,r)=>s+r.durationHrs,0)} hrs`, 'success');
        } catch {
          if (statusEl) { statusEl.style.cssText = 'display:block;padding:10px 14px;background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;color:#fca5a5;font-size:.85rem;'; statusEl.textContent = '❌ Could not read the file.'; }
        }
      };
      reader.readAsArrayBuffer(file);
    });

    // Archive Batch (Batch Actions section — Details tab)
    document.getElementById('mb-archive-batch')?.addEventListener('click', () => {
      const batch = Storage.getBatch(batchId);
      if (!batch) return;
      UI.showConfirm(`Archive batch "${batch.name}"? It will become read-only.`, () => {
        Storage.archiveBatch(batchId);
        UI.renderSidebar(Storage.getMyBatches(), null);
        selectBatch(batchId);
        UI.showToast(`Batch "${batch.name}" archived.`, 'info');
      });
    });

    // Unarchive Batch (shown when batch is already archived)
    document.getElementById('mb-unarchive-batch')?.addEventListener('click', () => {
      const batch = Storage.getBatch(batchId);
      if (!batch) return;
      Storage.unarchiveBatch(batchId);
      UI.renderSidebar(Storage.getMyBatches(), batchId);
      selectBatch(batchId);
      UI.showToast(`Batch "${batch.name}" restored to active.`, 'success');
    });

    // Delete Batch (Batch Actions section — Details tab)
    document.getElementById('mb-delete-batch')?.addEventListener('click', () => {
      const batch = Storage.getBatch(batchId);
      if (!batch) return;
      const currentUser = Storage.getCurrentUser();
      const isOwner = currentUser && (batch.ownerId === currentUser.id || !batch.ownerId);
      if (!isOwner && currentUser?.role !== 'admin') {
        UI.showToast('Only the batch owner can delete this batch.', 'error'); return;
      }
      UI.showConfirm(`Delete batch "${batch.name}" and ALL its students? This cannot be undone.`, () => {
        Storage.deleteBatch(batchId);
        state.activeBatchId = null;
        UI.renderSidebar(Storage.getMyBatches(), null);
        loadInitialView();
        UI.showToast('Batch deleted.', 'error');
      });
    });

    // Settings theme toggle (present when settings view re-uses this binder — safe no-op if absent)
    document.getElementById('settings-dark-toggle')?.addEventListener('click', () => {
      toggleTheme();
      UI.renderSettings();
      _bindSettingsEvents();
    });
  }

  // ─── Settings (Phase 5) ──────────────────────────────────────────────────────

  function openSettings() {
    state.view       = 'settings';
    // Do NOT call setNavSection here — navigateTo() already set the correct section
    // ('settings' or 'admin-backup'). Overwriting would break the admin-system group highlight.
    Charts.destroyAll();
    UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
    UI.renderSettings();
    _bindSettingsEvents();
  }

  function _bindSettingsEvents() {
    document.getElementById('settings-dark-toggle')?.addEventListener('click', () => {
      toggleTheme();
      UI.renderSettings();
      _bindSettingsEvents();
    });
    document.getElementById('settings-backup-btn')?.addEventListener('click', () => {
      const blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `spms-backup-${_todayStr()}.json`;
      a.click();
      UI.showToast('Backup downloaded!', 'success');
    });
    document.getElementById('settings-restore-btn')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type  = 'file';
      input.accept = '.json';
      input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (Storage.importJSON(reader.result)) {
            const cu = Storage.getCurrentUser();
            if (cu) Storage.migrateOrphanedBatches(cu.id);
            UI.showToast('Backup restored!', 'success');
            loadInitialView();
          } else {
            UI.showToast('Invalid backup file.', 'error');
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }

  // ─── Academics — Phase 6 ────────────────────────────────────────────────────

  function openAcademicsTests(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view          = 'academics-tests';
    state.navSection    = 'academics-tests';
    state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('academics-tests');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    UI.renderAcademicsTests(batch);
    _bindAcademicsTableEvents(batchId, 'tests');
  }

  function openAcademicsExams(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view          = 'academics-exams';
    state.navSection    = 'academics-exams';
    state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('academics-exams');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    UI.renderAcademicsExams(batch);
    _bindAcademicsTableEvents(batchId, 'exams');
  }

  function _bindAcademicsTableEvents(batchId, mode) {
    document.getElementById('acad-table')?.addEventListener('click', e => {
      const row = e.target.closest('[data-sid]');
      if (!row) return;
      const studentId = row.dataset.sid;
      if (mode === 'exams') {
        // Navigate to full student profile on the exams tab
        openStudentProfile(batchId, studentId, 'exams');
      } else {
        // Open slide-over panel for weekly tests
        _openTestsSlideOver(batchId, studentId);
      }
    });
    // Close slide-over when clicking overlay
    document.getElementById('acad-overlay')?.addEventListener('click', _closeAcadPanel);
  }

  function _openTestsSlideOver(batchId, studentId) {
    state.activeStudentId = studentId;
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const panel   = document.getElementById('acad-panel');
    const overlay = document.getElementById('acad-overlay');
    if (!panel || !overlay) return;
    panel.innerHTML = UI.academicsTestSlideOver(student, batchId);
    panel.classList.add('slideout-panel--open');
    overlay.classList.add('slideout-overlay--open');
  }

  function _closeAcadPanel() {
    document.getElementById('acad-panel')?.classList.remove('slideout-panel--open');
    document.getElementById('acad-overlay')?.classList.remove('slideout-overlay--open');
  }

  function _handleAcadAddTest(btn) {
    const batchId   = btn?.dataset.bid || state.activeBatchId;
    const studentId = btn?.dataset.sid || state.activeStudentId;
    if (!batchId || !studentId) return;

    const marks = parseFloat(document.getElementById('acad-marks')?.value);
    const total = parseFloat(document.getElementById('acad-total')?.value) || 100;
    const week  = document.getElementById('acad-week')?.value.trim();
    const date  = document.getElementById('acad-date')?.value
                  || _todayStr();

    if (isNaN(marks) || marks < 0) { UI.showToast('Enter valid marks.', 'error'); return; }
    if (marks > total)             { UI.showToast('Marks cannot exceed total.', 'error'); return; }

    const student  = Storage.getStudent(batchId, studentId);
    const tests    = [...(student.weeklyTests || [])];
    const label    = week || `Week ${tests.length + 1}`;
    tests.push({ week: label, date, marks, total });
    Storage.updateStudent(batchId, studentId, { weeklyTests: tests });

    UI.showToast('Test saved!', 'success');
    _openTestsSlideOver(batchId, studentId); // refresh slide-over with new data
  }

  function _handleAcadDeleteTest(btn) {
    const batchId   = btn.dataset.bid;
    const studentId = btn.dataset.sid;
    const idx       = parseInt(btn.dataset.idx);
    const student   = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const tests = [...(student.weeklyTests || [])];
    if (idx < 0 || idx >= tests.length) return;
    const label = tests[idx].week || `Test ${idx + 1}`;
    UI.showConfirm(`Remove "${label}"?`, () => {
      tests.splice(idx, 1);
      Storage.updateStudent(batchId, studentId, { weeklyTests: tests });
      UI.showToast('Test removed.', 'success');
      _openTestsSlideOver(batchId, studentId);
    });
  }

  // ─── Question Bank — Phase QB ─────────────────────────────────────────────

  async function openAcademicsQuestionBank(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view          = 'academics-question-bank';
    state.navSection    = 'academics-question-bank';
    state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('academics-question-bank');
    UI.renderSidebar(Storage.getMyBatches(), batchId);

    const main = document.getElementById('main-content');
    if (main) main.innerHTML = `<div class="loading-state" style="padding:3rem;text-align:center;color:var(--text3)">Loading question bank…</div>`;

    try {
      const user      = Storage.getCurrentUser();
      const questions = await SupabaseSync.fetchQuestionBank(user.id);
      UI.renderAcademicsQuestionBank(batch, questions);
      _bindQuestionBankEvents(batchId);
    } catch (err) {
      if (main) main.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Could not load question bank</div>
          <div class="empty-state-msg">${err.message}</div>
        </div>`;
    }
  }

  function _bindQuestionBankEvents(batchId) {
    document.getElementById('qb-file-input')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) _handleQuestionBankFile(file, batchId);
      e.target.value = '';  // reset so same file can be re-selected
    });
    document.getElementById('acad-overlay')?.addEventListener('click', _closeAcadPanel);
  }

  function _handleQuestionBankFile(file, batchId) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!raw.length) { UI.showToast('No rows found in the file.', 'error'); return; }

        const getCol = (row, ...keys) =>
          keys.map(k => (row[k] || '').toString().trim()).find(v => v) || '';

        const rows = raw.map(r => {
          const question = getCol(r, 'Question', 'question', 'QUESTION');
          const optionA  = getCol(r, 'Option A', 'OptionA', 'option a', 'OPTION A', 'option_a', 'A');
          const optionB  = getCol(r, 'Option B', 'OptionB', 'option b', 'OPTION B', 'option_b', 'B');
          const optionC  = getCol(r, 'Option C', 'OptionC', 'option c', 'OPTION C', 'option_c', 'C');
          const optionD  = getCol(r, 'Option D', 'OptionD', 'option d', 'OPTION D', 'option_d', 'D');
          const correct  = getCol(r, 'Correct Answer', 'Correct', 'correct', 'CORRECT', 'correct_answer', 'correct answer', 'Answer', 'answer', 'Ans', 'ans', 'ANS').toUpperCase();

          let _error = null;
          if (!question)                                    _error = 'Missing question';
          else if (!optionA || !optionB || !optionC || !optionD) _error = 'Missing option(s)';
          else if (!['A','B','C','D'].includes(correct))    _error = `Invalid answer: "${correct || 'blank'}"`;

          return { question, optionA, optionB, optionC, optionD, correct, _error };
        });

        _qbPendingRows = rows;

        const panel   = document.getElementById('acad-panel');
        const overlay = document.getElementById('acad-overlay');
        if (!panel || !overlay) return;
        panel.innerHTML = UI.questionBankPreviewPanel(rows, batchId);
        panel.classList.add('slideout-panel--open');
        overlay.classList.add('slideout-overlay--open');

      } catch {
        UI.showToast('Could not read the file. Make sure it is a valid .xlsx or .csv file.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function _handleQuestionBankSave(btn, batchId) {
    const valid = _qbPendingRows.filter(r => !r._error);
    if (!valid.length) return;

    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
      const user        = Storage.getCurrentUser();
      const uploadBatch = crypto.randomUUID();
      await SupabaseSync.uploadQuestions(user.id, batchId, valid, uploadBatch);
      _closeAcadPanel();
      _qbPendingRows = [];
      UI.showToast(`${valid.length} question${valid.length !== 1 ? 's' : ''} saved to Question Bank!`, 'success');
      openAcademicsQuestionBank(batchId);
    } catch (err) {
      UI.showToast(`Upload failed: ${err.message}`, 'error');
      btn.disabled    = false;
      btn.textContent = `Save ${valid.length} Question${valid.length !== 1 ? 's' : ''} to Bank`;
    }
  }

  function _handleQBDownloadSample() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'],
      ['What is the capital of India?',          'Mumbai',        'Delhi',          'Kolkata',  'Chennai', 'B'],
      ['Which planet is known as Red Planet?',   'Earth',         'Mars',           'Jupiter',  'Venus',   'B'],
      ['What is 2 + 2?',                         '3',             '4',              '5',        '6',       'B'],
      ['Which is the largest ocean?',            'Atlantic',      'Indian',         'Arctic',   'Pacific', 'D'],
      ['Who is the father of computers?',        'Newton',        'Edison',         'Charles Babbage', 'Tesla', 'C'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    XLSX.writeFile(wb, 'spms_question_bank_sample.xlsx');
  }

  async function _handleDeleteUploadBatch(uploadBatchId, batchId) {
    UI.showConfirm('Delete this entire upload batch? All questions in it will be permanently removed.', async () => {
      try {
        await SupabaseSync.deleteUploadBatch(uploadBatchId);
        UI.showToast('Batch deleted.', 'success');
        openAcademicsQuestionBank(batchId);
      } catch (err) {
        UI.showToast(`Delete failed: ${err.message}`, 'error');
      }
    });
  }

  // ─── Test Management — Phase TM ───────────────────────────────────────────

  async function openAcademicsTestsMgmt(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view          = 'academics-tests-mgmt';
    state.navSection    = 'academics-tests-mgmt';
    state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('academics-tests-mgmt');
    UI.renderSidebar(Storage.getMyBatches(), batchId);

    const main = document.getElementById('main-content');
    if (main) main.innerHTML = `<div class="loading-state" style="padding:3rem;text-align:center;color:var(--text3)">Loading tests…</div>`;

    try {
      const user = Storage.getCurrentUser();
      const [tests, questions, attemptCounts] = await Promise.all([
        SupabaseSync.fetchTests(user.id, batchId),
        SupabaseSync.fetchQuestionBank(user.id),
        SupabaseSync.fetchActiveAttemptCounts(batchId),
      ]);
      _qbData    = questions;
      _testsData = tests;
      UI.renderAcademicsTestsMgmt(batch, tests, attemptCounts);
      document.getElementById('acad-overlay')?.addEventListener('click', _closeAcadPanel);
    } catch (err) {
      if (main) main.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Could not load tests</div>
          <div class="empty-state-msg">${err.message}</div>
        </div>`;
    }
  }

  function _openCreateTestPanel(batchId) {
    const batchMap = new Map();
    _qbData.forEach(q => {
      if (!batchMap.has(q.upload_batch)) {
        batchMap.set(q.upload_batch, { created_at: q.created_at, count: 0 });
      }
      batchMap.get(q.upload_batch).count++;
    });

    const panel   = document.getElementById('acad-panel');
    const overlay = document.getElementById('acad-overlay');
    if (!panel || !overlay) return;

    const batchStudents = Storage.getBatch(batchId)?.students || [];
    panel.innerHTML = UI.createTestPanel([...batchMap.entries()], batchId, batchStudents);
    panel.classList.add('slideout-panel--open');
    overlay.classList.add('slideout-overlay--open');

    // Show question count when trainer picks a batch
    document.getElementById('ct-batch-select')?.addEventListener('change', e => {
      const ubid    = e.target.value;
      const count   = _qbData.filter(q => q.upload_batch === ubid).length;
      const countEl = document.getElementById('ct-q-count');
      if (countEl) countEl.textContent = ubid ? `${count} question${count !== 1 ? 's' : ''} will be included in this test` : '';
    });

    // P5: Select All toggle for student picker
    document.getElementById('ct-select-all')?.addEventListener('change', e => {
      document.querySelectorAll('[name="ct-student"]').forEach(cb => { cb.checked = e.target.checked; });
    });
    document.getElementById('ct-student-list')?.addEventListener('change', e => {
      if (e.target.name === 'ct-student') {
        const all = document.querySelectorAll('[name="ct-student"]');
        const sa  = document.getElementById('ct-select-all');
        if (sa) sa.checked = [...all].every(cb => cb.checked);
      }
    });
  }

  async function _handleCreateTestSave(btn, batchId) {
    const title    = document.getElementById('ct-title')?.value.trim();
    const duration = parseInt(document.getElementById('ct-duration')?.value);
    const passPct  = parseInt(document.getElementById('ct-pass')?.value) || 50;
    const ubid     = document.getElementById('ct-batch-select')?.value;

    if (!title)                    { UI.showToast('Enter a test title.', 'error'); return; }
    if (!duration || duration < 1) { UI.showToast('Enter a valid duration in minutes.', 'error'); return; }
    if (!ubid)                     { UI.showToast('Select a question batch.', 'error'); return; }

    const questionIds = _qbData.filter(q => q.upload_batch === ubid).map(q => q.id);
    if (!questionIds.length)       { UI.showToast('Selected batch has no questions.', 'error'); return; }

    // P5: collect selected students (required)
    const selectedStudents = [...document.querySelectorAll('[name="ct-student"]:checked')].map(cb => cb.value);
    if (!selectedStudents.length)  { UI.showToast('Select at least one student who can take this test.', 'error'); return; }

    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
      const user = Storage.getCurrentUser();
      await SupabaseSync.createTest({
        trainer_id:          user.id,
        batch_id:            batchId,
        title,
        duration_mins:       duration,
        pass_percent:        passPct,
        question_ids:        questionIds,
        allowed_student_ids: selectedStudents,
        status:              'draft',
      });
      _closeAcadPanel();
      UI.showToast(`"${title}" saved as draft for ${selectedStudents.length} student${selectedStudents.length !== 1 ? 's' : ''}.`, 'success');
      openAcademicsTestsMgmt(batchId);
    } catch (err) {
      UI.showToast(`Failed to save: ${err.message}`, 'error');
      btn.disabled    = false;
      btn.textContent = 'Save as Draft';
    }
  }

  async function _handlePublishTest(testId, batchId) {
    const test = _testsData.find(t => t.id === testId);
    const studentCount = (test?.allowed_student_ids || []).length;
    if (studentCount === 0) {
      UI.showToast('Add at least one student before publishing. Click ⋮ → Manage Students.', 'error');
      return;
    }
    UI.showConfirm(`Publish "${test?.title}"? ${studentCount} student${studentCount !== 1 ? 's' : ''} will be able to see and start it immediately.`, async () => {
      try {
        await SupabaseSync.updateTestStatus(testId, 'live');
        UI.showToast('Test is now LIVE.', 'success');
        openAcademicsTestsMgmt(batchId);
      } catch (err) {
        UI.showToast(`Failed: ${err.message}`, 'error');
      }
    });
  }

  async function _handleCloseTest(testId, batchId) {
    UI.showConfirm('Close this test? Students will no longer be able to start new attempts.', async () => {
      try {
        await SupabaseSync.updateTestStatus(testId, 'closed');
        UI.showToast('Test closed.', 'success');
        openAcademicsTestsMgmt(batchId);
      } catch (err) {
        UI.showToast(`Failed: ${err.message}`, 'error');
      }
    });
  }

  // P4: Re-open a closed test
  async function _handleReopenTest(testId, batchId) {
    const test = _testsData.find(t => t.id === testId);
    const studentCount = (test?.allowed_student_ids || []).length;
    UI.showConfirm(`Re-open "${test?.title}"? Students on the allowlist (${studentCount}) who haven't submitted will be able to take it.`, async () => {
      try {
        await SupabaseSync.updateTestStatus(testId, 'live');
        UI.showToast('Test is live again.', 'success');
        openAcademicsTestsMgmt(batchId);
      } catch (err) {
        UI.showToast(`Failed: ${err.message}`, 'error');
      }
    });
  }

  // P3: Delete any test (with attempt count warning for live/closed)
  async function _handleDeleteTest(testId, batchId) {
    const test    = _testsData.find(t => t.id === testId);
    const title   = test?.title || 'this test';
    const isDraft = test?.status === 'draft';

    const doDelete = async () => {
      try {
        await SupabaseSync.deleteTestAndAttempts(testId);
        UI.showToast('Test deleted.', 'success');
        _closeAcadPanel();
        openAcademicsTestsMgmt(batchId);
      } catch (err) {
        UI.showToast(`Failed: ${err.message}`, 'error');
      }
    };

    if (isDraft) {
      UI.showConfirm(`Delete "${title}"? This cannot be undone.`, doDelete);
    } else {
      // Fetch attempt count first so we can warn if submissions exist
      const count = await SupabaseSync.fetchTestAttemptCount(testId);
      const msg = count > 0
        ? `Delete "${title}"? This will permanently remove ${count} student submission${count !== 1 ? 's' : ''} and all scores. This cannot be undone.`
        : `Delete "${title}"? This cannot be undone.`;
      UI.showConfirm(msg, doDelete);
    }
  }

  // P5: Open manage students panel
  async function _handleManageStudents(testId, batchId, from) {
    const test  = _testsData.find(t => t.id === testId);
    if (!test) { UI.showToast('Test not found.', 'error'); return; }
    const batch         = Storage.getBatch(batchId);
    const batchStudents = batch?.students || [];
    const panel   = document.getElementById('acad-panel');
    const overlay = document.getElementById('acad-overlay');
    if (!panel) return;
    const backAction = from === 'results' ? 'tests-results' : 'acad-close';
    panel.innerHTML = UI.manageStudentsPanel(test, batchStudents, backAction);
    // Ensure panel is open (may already be open when coming from results)
    panel.classList.add('slideout-panel--open');
    overlay?.classList.add('slideout-overlay--open');
    // Wire Select All
    document.getElementById('ms-select-all')?.addEventListener('change', e => {
      document.querySelectorAll('[name="ms-student"]').forEach(cb => { cb.checked = e.target.checked; });
    });
    document.getElementById('ms-student-list')?.addEventListener('change', e => {
      if (e.target.name === 'ms-student') {
        const all = document.querySelectorAll('[name="ms-student"]');
        const sa  = document.getElementById('ms-select-all');
        if (sa) sa.checked = [...all].every(cb => cb.checked);
      }
    });
  }

  // P5: Save updated student allowlist
  async function _handleSaveStudents(btn, testId, batchId, from) {
    const selected = [...document.querySelectorAll('[name="ms-student"]:checked')].map(cb => cb.value);
    if (!selected.length) { UI.showToast('Select at least one student.', 'error'); return; }
    btn.disabled    = true;
    btn.textContent = 'Saving…';
    try {
      await SupabaseSync.updateTestAllowlist(testId, selected);
      // Update local cache so chips refresh correctly
      const cached = _testsData.find(t => t.id === testId);
      if (cached) cached.allowed_student_ids = selected;
      UI.showToast(`Allowlist updated — ${selected.length} student${selected.length !== 1 ? 's' : ''}.`, 'success');
      if (from === 'tests-results') {
        _handleViewTestResults(testId, batchId);
      } else {
        _closeAcadPanel();
        openAcademicsTestsMgmt(batchId);
      }
    } catch (err) {
      UI.showToast(`Failed: ${err.message}`, 'error');
      btn.disabled    = false;
      btn.textContent = 'Save';
    }
  }

  // ─── Mock Interviews — Phase 7 ────────────────────────────────────────────

  function openMockManual(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view = 'mock-manual'; state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('mock-manual');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    _updateContentTopbar('Manual Mock Interviews');
    UI.renderMockManual(batch);
    _bindMockTableEvents(batchId, 'manual');
  }

  function openMockAI(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view = 'mock-ai'; state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('mock-ai');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    _updateContentTopbar('AI Mock Scores');
    UI.renderMockAI(batch);
    _bindMockTableEvents(batchId, 'ai');
  }

  function openMockHistory(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view = 'mock-history'; state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('mock-history');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    _updateContentTopbar('Mock History');
    UI.renderMockHistory(batch);
  }

  function _bindMockTableEvents(batchId, mode) {
    document.getElementById('mock-table')?.addEventListener('click', e => {
      const row = e.target.closest('[data-sid]');
      if (!row) return;
      _openMockSlideOver(batchId, row.dataset.sid, mode);
    });
    document.getElementById('mock-overlay')?.addEventListener('click', _closeMockPanel);
  }

  function _openMockSlideOver(batchId, studentId, mode) {
    state.activeStudentId = studentId;
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const panel   = document.getElementById('mock-panel');
    const overlay = document.getElementById('mock-overlay');
    if (!panel) return;
    panel.innerHTML = mode === 'manual'
      ? UI.mockManualSlideOver(student, batchId)
      : UI.mockAISlideOver(student, batchId);
    panel.classList.add('slideout-panel--open');
    overlay?.classList.add('slideout-overlay--open');

    // Live avg update + attendance toggle (manual only)
    if (mode === 'manual') {
      panel.querySelectorAll('.mock-param-input').forEach(inp =>
        inp.addEventListener('input', () => _updateMockLiveAvg(panel)));
      panel.querySelector('#mock-attendance')?.addEventListener('change', e => {
        const sec = panel.querySelector('#mock-scores-section');
        if (sec) sec.style.display = e.target.value === 'absent' ? 'none' : '';
      });
    }
  }

  function _closeMockPanel() {
    document.getElementById('mock-panel')?.classList.remove('slideout-panel--open');
    document.getElementById('mock-overlay')?.classList.remove('slideout-overlay--open');
  }

  function _updateMockLiveAvg(panel) {
    const inputs = panel.querySelectorAll('.mock-param-input');
    let sum = 0, count = 0;
    inputs.forEach(inp => {
      const v = parseFloat(inp.value);
      if (!isNaN(v)) { sum += Math.min(10, Math.max(0, v)); count++; }
    });
    const el = panel.querySelector('#mock-live-avg');
    if (el) el.textContent = count > 0 ? (sum / count).toFixed(1) : '—';
  }

  function _handleMockSave(btn) {
    const { bid, sid } = btn.dataset;
    const panel = document.getElementById('mock-panel');
    const date  = panel.querySelector('#mock-date')?.value;
    const att   = panel.querySelector('#mock-attendance')?.value || 'present';
    if (!date) { UI.showToast('Please enter a date.', 'error'); return; }

    let entry;
    if (att === 'absent') {
      entry = { id: Date.now().toString(), date, attendance: 'absent', scores: {}, totalScore: 0,
                questionsAnswered: '', questionsNotAnswered: '' };
    } else {
      const PARAMS = UI.getMockParamsConfig();
      const scores = {}; let sum = 0;
      panel.querySelectorAll('.mock-param-input').forEach(inp => {
        const v = Math.min(10, Math.max(0, parseFloat(inp.value) || 0));
        scores[inp.dataset.param] = v; sum += v;
      });
      entry = { id: Date.now().toString(), date, attendance: 'present', scores,
                totalScore: sum / PARAMS.length,
                questionsAnswered:    panel.querySelector('#mock-q-yes')?.value.trim() || '',
                questionsNotAnswered: panel.querySelector('#mock-q-no')?.value.trim()  || '' };
    }
    const student = Storage.getStudent(bid, sid);
    if (!student) return;
    Storage.updateStudent(bid, sid, { mockInterviews: [...(student.mockInterviews || []), entry] });
    UI.showToast('Mock session saved!', 'success');
    _openMockSlideOver(bid, sid, 'manual');
  }

  function _handleMockDelete(btn) {
    const { bid, sid } = btn.dataset;
    const idx = parseInt(btn.dataset.idx);
    UI.showConfirm('Delete this mock session?', () => {
      const student = Storage.getStudent(bid, sid);
      if (!student) return;
      const mocks = [...(student.mockInterviews || [])];
      mocks.splice(idx, 1);
      Storage.updateStudent(bid, sid, { mockInterviews: mocks });
      UI.showToast('Session removed.', 'success');
      _openMockSlideOver(bid, sid, 'manual');
    });
  }

  function _handleAIMockSave(btn) {
    const { bid, sid } = btn.dataset;
    const panel = document.getElementById('mock-panel');
    const date  = panel.querySelector('#aimock-date')?.value;
    const score = parseFloat(panel.querySelector('#aimock-score')?.value);
    if (!date)                             { UI.showToast('Please enter a date.', 'error'); return; }
    if (isNaN(score) || score < 0 || score > 10) { UI.showToast('Score must be 0–10.', 'error'); return; }
    Storage.addAiMock(bid, sid, { date, score });
    UI.showToast('AI score saved!', 'success');
    _openMockSlideOver(bid, sid, 'ai');
  }

  function _handleAIMockDelete(btn) {
    const { bid, sid, id } = btn.dataset;
    UI.showConfirm('Delete this AI mock entry?', () => {
      Storage.deleteAiMock(bid, sid, id);
      UI.showToast('Entry removed.', 'success');
      _openMockSlideOver(bid, sid, 'ai');
    });
  }

  // ─── Student Remarks — Phase 8 ────────────────────────────────────────────

  function openRemarksCalls(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view = 'remarks-calls'; state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('remarks-calls');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    _updateContentTopbar('Call Records');
    UI.renderRemarksCallsScreen(batch);
    _bindRemarksTableEvents(batchId, 'calls');
  }

  function openRemarksNotes(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    state.view = 'remarks-notes'; state.activeBatchId = batchId;
    Charts.destroyAll();
    UI.setNavSection('remarks-notes');
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    _updateContentTopbar('Student Notes');
    UI.renderRemarksNotesScreen(batch);
    _bindRemarksTableEvents(batchId, 'notes');
  }

  // ─── Reminders & Tasks ──────────────────────────────────────────────────────

  function openReminders() {
    Charts.destroyAll();
    UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
    _updateContentTopbar('Reminders & Tasks');
    const tasks = Storage.getTasks();
    UI.renderRemindersTasksScreen(tasks);
    _bindRemindersEvents();
  }

  /**
   * RJ-1 / Fix-B: Re-render the Reminders screen while keeping any
   * in-progress input that the trainer has typed in OTHER task cards.
   *
   * Problem: openReminders() replaces main.innerHTML entirely. Any text
   * typed into task cards that were NOT just acted on is wiped.
   *
   * Solution: snapshot every open card's inputs by task-id, call
   * openReminders(), then replay the values back into the new DOM.
   * The `main` element itself is never replaced — only its children —
   * so the element reference stays valid across the re-render.
   */
  function _refreshReminders() {
    const main  = document.getElementById('main-content');
    const _snap = {};   // keyed by task-id

    if (main) {
      // Capture remark text
      main.querySelectorAll('.rt-remark-input[data-task-id]').forEach(el => {
        if (!el.value) return;
        (_snap[el.dataset.taskId] = _snap[el.dataset.taskId] || {}).remark = el.value;
      });
      // Capture rejoin date + open state
      main.querySelectorAll('.rt-rejoin-date[data-task-id]').forEach(el => {
        if (!el.value) return;
        const tid = el.dataset.taskId;
        const s   = (_snap[tid] = _snap[tid] || {});
        s.rejoinOn   = el.value;
        const fd     = document.getElementById(`rt-rejoin-fields-${tid}`);
        s.rejoinOpen = fd ? fd.style.display !== 'none' : false;
      });
      // Capture rejoin reason
      main.querySelectorAll('.rt-rejoin-reason[data-task-id]').forEach(el => {
        if (!el.value) return;
        (_snap[el.dataset.taskId] = _snap[el.dataset.taskId] || {}).rejoinReason = el.value;
      });
    }

    openReminders();   // re-renders main.innerHTML

    // Replay snapshots into the freshly rendered DOM
    Object.entries(_snap).forEach(([tid, s]) => {
      if (s.remark) {
        const el = main?.querySelector(`.rt-remark-input[data-task-id="${tid}"]`);
        if (el) {
          el.value = s.remark;
          const btn = document.getElementById(`rt-complete-${tid}`);
          if (btn) btn.disabled = false;
        }
      }
      if (s.rejoinOpen || s.rejoinOn || s.rejoinReason) {
        const fd = document.getElementById(`rt-rejoin-fields-${tid}`);
        const tb = main?.querySelector(`.rt-rejoin-toggle[data-task-id="${tid}"]`);
        // Re-open the rejoin panel if it was open
        if (s.rejoinOpen && fd) {
          fd.style.display = 'block';
          tb?.classList.add('rt-rejoin-toggle--open');
        }
        // Restore date
        if (s.rejoinOn) {
          const di = main?.querySelector(`.rt-rejoin-date[data-task-id="${tid}"]`);
          if (di) {
            di.value = s.rejoinOn;
            // Re-show required * on reason label
            const rq = fd?.querySelector('.rt-rejoin-req');
            if (rq) rq.style.display = 'inline';
          }
        }
        // Restore reason
        if (s.rejoinReason) {
          const ri = main?.querySelector(`.rt-rejoin-reason[data-task-id="${tid}"]`);
          if (ri) ri.value = s.rejoinReason;
        }
      }
    });
  }

  function _bindRemindersEvents() {
    const main = document.getElementById('main-content');
    if (!main) return;
    // Guard: attach listeners only once. main persists across re-renders, so
    // without this guard every openReminders() call (after completing/deleting a task)
    // stacks another listener — making the toggle cancel itself on even-numbered calls.
    if (main._rtEventsBound) return;
    main._rtEventsBound = true;

    // Remark input → enable / disable tick button (auto tasks only)
    // RJ-1: Rejoin date input → show/hide required * on the reason label
    main.addEventListener('input', e => {
      if (e.target.matches('.rt-remark-input')) {
        const taskId = e.target.closest('[data-task-id]')?.dataset.taskId;
        if (!taskId) return;
        const btn = document.getElementById(`rt-complete-${taskId}`);
        if (btn) btn.disabled = !e.target.value.trim();
      }
      // RJ-1: when a rejoin date is typed/cleared, show the required * on the reason field
      if (e.target.matches('.rt-rejoin-date')) {
        const taskId   = e.target.dataset.taskId;
        if (!taskId) return;
        const fieldsDiv = document.getElementById(`rt-rejoin-fields-${taskId}`);
        if (!fieldsDiv) return;
        const reqSpan = fieldsDiv.querySelector('.rt-rejoin-req');
        if (reqSpan) reqSpan.style.display = e.target.value ? 'inline' : 'none';
      }
    });

    main.addEventListener('click', e => {
      // ── Recently Completed toggle
      if (e.target.closest('#rt-done-toggle')) {
        const toggle = document.getElementById('rt-done-toggle');
        const list   = document.getElementById('rt-done-list');
        if (!toggle || !list) return;
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
        toggle.classList.toggle('rt-section-header--open', !expanded);
        list.style.display = expanded ? 'none' : 'flex';
        return;
      }

      // ── Add Task button → open modal in "add" mode
      if (e.target.closest('#rt-add-task-btn')) {
        _openRtModal(null);
        return;
      }

      // ── Modal close / cancel / backdrop click
      if (e.target.closest('#rt-modal-close') || e.target.closest('#rt-modal-cancel')) {
        _closeRtModal(); return;
      }
      if (e.target.matches('#rt-modal-backdrop')) {
        _closeRtModal(); return;
      }

      // ── Modal save
      if (e.target.closest('#rt-modal-save')) {
        _saveRtModal(); return;
      }

      // ── Manual task tick → complete (no remark required)
      if (e.target.closest('.rt-manual-tick-btn')) {
        const taskId = e.target.closest('[data-task-id]')?.dataset.taskId;
        if (!taskId) return;
        const ok = Storage.completeTask(taskId, '');
        if (ok) { UI.showToast('Task done!', 'success'); _refreshReminders(); }
        return;
      }

      // ── Manual task delete
      if (e.target.closest('.rt-delete-btn')) {
        const taskId = e.target.closest('[data-task-id]')?.dataset.taskId;
        if (!taskId) return;
        if (!confirm('Delete this task? This cannot be undone.')) return;
        Storage.deleteTask(taskId);
        UI.showToast('Task deleted.', 'success');
        _refreshReminders();
        return;
      }

      // ── Manual task edit → open modal in "edit" mode
      if (e.target.closest('.rt-edit-btn')) {
        const taskId = e.target.closest('[data-task-id]')?.dataset.taskId;
        if (!taskId) return;
        _openRtModal(taskId);
        return;
      }

      // RJ-1: Rejoin On toggle — expand/collapse the date+reason fields on an auto-task card
      if (e.target.closest('.rt-rejoin-toggle')) {
        const toggleBtn = e.target.closest('.rt-rejoin-toggle');
        const taskId    = toggleBtn.dataset.taskId;
        if (!taskId) return;
        const fieldsDiv = document.getElementById(`rt-rejoin-fields-${taskId}`);
        if (!fieldsDiv) return;
        const isOpen = fieldsDiv.style.display !== 'none';
        fieldsDiv.style.display = isOpen ? 'none' : 'block';
        toggleBtn.classList.toggle('rt-rejoin-toggle--open', !isOpen);
        return;
      }

      // ── Auto task tick → complete with required remark
      const btn = e.target.closest('.rt-complete-btn');
      if (!btn) return;
      const taskId = btn.closest('[data-task-id]')?.dataset.taskId;
      if (!taskId) return;
      const inp    = main.querySelector(`.rt-remark-input[data-task-id="${taskId}"]`);
      const remark = inp?.value.trim() || '';

      // RJ-1: read Rejoin On fields first — reason can double as the remark so the
      // trainer doesn't have to type the same information twice.
      const _rejoinDateInp   = main.querySelector(`.rt-rejoin-date[data-task-id="${taskId}"]`);
      const _rejoinReasonInp = main.querySelector(`.rt-rejoin-reason[data-task-id="${taskId}"]`);
      const _rejoinOn        = _rejoinDateInp?.value.trim()   || '';
      const _rejoinReason    = _rejoinReasonInp?.value.trim() || '';

      // Effective remark: use main remark if filled; fall back to rejoin reason when
      // the trainer has only filled the Rejoin section (avoids double entry).
      const _effectiveRemark = remark || (_rejoinOn && _rejoinReason ? _rejoinReason : '');
      if (!_effectiveRemark) {
        UI.showToast('Please enter a call remark before completing.', 'error');
        return;
      }
      // Rejoin date set but no reason at all → can't use as remark either
      if (_rejoinOn && !_rejoinReason) {
        UI.showToast('Please enter a reason for the Rejoin On date.', 'error');
        _rejoinReasonInp?.focus();
        return;
      }

      // Look up the task BEFORE completing so we have batchId + studentId for the rejoin write
      const _taskRef = Storage.getTasks().find(t => t.id === taskId);

      const ok = Storage.completeTask(taskId, _effectiveRemark);
      if (ok) {
        // RJ-1: persist the Rejoin On suppression to the student record if date was set
        if (_rejoinOn && _taskRef) {
          Storage.updateStudent(_taskRef.batchId, _taskRef.studentId, {
            rejoinOn:     _rejoinOn,
            rejoinReason: _rejoinReason
          });
        }
        UI.showToast('Task completed. Call log saved.', 'success');
        _refreshReminders();
      }
    });

    // Escape key closes modal
    main.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const bd = document.getElementById('rt-modal-backdrop');
        if (bd && bd.style.display !== 'none') _closeRtModal();
      }
    });
  }

  /** Open the add/edit manual task modal. Pass null taskId for "add" mode. */
  function _openRtModal(taskId) {
    const backdrop = document.getElementById('rt-modal-backdrop');
    const titleEl  = document.getElementById('rt-modal-title');
    const idInput  = document.getElementById('rt-modal-task-id');
    const titleIn  = document.getElementById('rt-modal-title-input');
    const notesIn  = document.getElementById('rt-modal-notes');
    const dateIn   = document.getElementById('rt-modal-date');
    const timeIn   = document.getElementById('rt-modal-time');
    if (!backdrop) return;

    if (taskId) {
      // Edit mode — populate fields with existing task data
      const task = Storage.getTasks().find(t => t.id === taskId);
      if (!task) return;
      titleEl.textContent = 'Edit Task';
      idInput.value = taskId;
      titleIn.value = task.title  || '';
      notesIn.value = task.notes  || '';
      dateIn.value  = task.dueDate || '';
      timeIn.value  = task.dueTime || '';
    } else {
      // Add mode — blank slate
      titleEl.textContent = 'Add Task';
      idInput.value = '';
      titleIn.value = notesIn.value = dateIn.value = timeIn.value = '';
    }

    backdrop.style.display = 'flex';
    setTimeout(() => titleIn.focus(), 40);
  }

  function _closeRtModal() {
    const bd = document.getElementById('rt-modal-backdrop');
    if (bd) bd.style.display = 'none';
  }

  function _saveRtModal() {
    const idInput = document.getElementById('rt-modal-task-id');
    const titleIn = document.getElementById('rt-modal-title-input');
    const notesIn = document.getElementById('rt-modal-notes');
    const dateIn  = document.getElementById('rt-modal-date');
    const timeIn  = document.getElementById('rt-modal-time');

    const title = titleIn?.value.trim();
    if (!title) { UI.showToast('Title is required.', 'error'); titleIn?.focus(); return; }

    const taskId = idInput?.value;
    if (taskId) {
      // Edit existing
      const ok = Storage.editManualTask(taskId, {
        title,
        notes:   notesIn?.value.trim() || '',
        dueDate: dateIn?.value || '',
        dueTime: timeIn?.value || '',
      });
      if (ok) { UI.showToast('Task updated.', 'success'); _closeRtModal(); openReminders(); }
    } else {
      // Create new
      Storage.addManualTask({
        title,
        notes:   notesIn?.value.trim() || '',
        dueDate: dateIn?.value || '',
        dueTime: timeIn?.value || '',
      });
      UI.showToast('Task added!', 'success');
      _closeRtModal();
      openReminders();
    }
  }

  function _bindRemarksTableEvents(batchId, mode) {
    document.getElementById('remarks-table')?.addEventListener('click', e => {
      const row = e.target.closest('[data-sid]');
      if (!row) return;
      _openRemarksSlideOver(batchId, row.dataset.sid, mode);
    });
    document.getElementById('remarks-overlay')?.addEventListener('click', _closeRemarksPanel);
  }

  function _openRemarksSlideOver(batchId, studentId, mode) {
    state.activeStudentId = studentId;
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const panel   = document.getElementById('remarks-panel');
    const overlay = document.getElementById('remarks-overlay');
    if (!panel) return;
    panel.innerHTML = mode === 'calls'
      ? UI.remarksCallsSlideOver(student, batchId)
      : UI.remarksNotesSlideOver(student, batchId);
    panel.classList.add('slideout-panel--open');
    overlay?.classList.add('slideout-overlay--open');
  }

  function _closeRemarksPanel() {
    document.getElementById('remarks-panel')?.classList.remove('slideout-panel--open');
    document.getElementById('remarks-overlay')?.classList.remove('slideout-overlay--open');
  }

  function _handleCallSave(btn) {
    const { bid, sid } = btn.dataset;
    const panel = document.getElementById('remarks-panel');
    const date  = panel.querySelector('#rem-call-date')?.value;
    const type  = panel.querySelector('#rem-call-type')?.value.trim();
    const note  = panel.querySelector('#rem-call-note')?.value.trim();
    if (!date) { UI.showToast('Please enter a date.', 'error'); return; }
    const remark = [type, note].filter(Boolean).join(' — ') || 'Call logged';
    Storage.saveCallLog(bid, sid, { date, remark });
    UI.showToast('Call record saved!', 'success');
    _openRemarksSlideOver(bid, sid, 'calls');
  }

  function _handleCallDelete(btn) {
    const { bid, sid, id } = btn.dataset;
    UI.showConfirm('Delete this call record?', () => {
      const student = Storage.getStudent(bid, sid);
      if (!student) return;
      Storage.updateStudent(bid, sid, {
        callLogs: (student.callLogs || []).filter(l => l.id !== id)
      });
      UI.showToast('Record removed.', 'success');
      _openRemarksSlideOver(bid, sid, 'calls');
    });
  }

  function _handleNoteSave(btn) {
    const { bid, sid } = btn.dataset;
    const panel = document.getElementById('remarks-panel');
    const text  = panel.querySelector('#rem-note-text')?.value.trim();
    if (!text) { UI.showToast('Note cannot be empty.', 'error'); return; }
    const date    = _todayStr();
    const student = Storage.getStudent(bid, sid);
    if (!student) return;
    Storage.updateStudent(bid, sid, {
      notes: [...(student.notes || []), { date, text }]
    });
    UI.showToast('Note saved!', 'success');
    _openRemarksSlideOver(bid, sid, 'notes');
  }

  function _handleNoteDelete(btn) {
    const { bid, sid } = btn.dataset;
    const idx = parseInt(btn.dataset.idx);
    UI.showConfirm('Delete this note?', () => {
      const student = Storage.getStudent(bid, sid);
      if (!student) return;
      const notes = [...(student.notes || [])];
      notes.splice(idx, 1);
      Storage.updateStudent(bid, sid, { notes });
      UI.showToast('Note removed.', 'success');
      _openRemarksSlideOver(bid, sid, 'notes');
    });
  }

  function openUserProfile() {
    const user = Storage.getCurrentUser();
    if (!user) return;
    state.view = 'user-profile';
    Charts.destroyAll();
    UI.renderProfilePage(user);
    UI.renderSidebar(Storage.getMyBatches(), null); // deselect any active batch
  }

  /** V4-4: Save profile changes */
  function _handleSaveProfile() {
    const user        = Storage.getCurrentUser();
    if (!user) return;
    const fullName    = document.getElementById('prof-fullname')?.value.trim();
    const username    = document.getElementById('prof-username')?.value.trim();
    const email       = document.getElementById('prof-email')?.value.trim();
    const phone       = document.getElementById('prof-phone')?.value.trim();
    // AD1: designation field (trainer only; field not rendered for admin so will be undefined)
    const designation = document.getElementById('prof-designation')?.value.trim() ?? undefined;
    const errEl       = document.getElementById('prof-edit-error');
    const succEl      = document.getElementById('prof-edit-success');

    if (errEl)  { errEl.textContent  = ''; errEl.style.display  = 'none'; }
    if (succEl) { succEl.textContent = ''; succEl.style.display = 'none'; }

    // Fix: username is a required field — block save if cleared to prevent account lockout.
    // updateUser() skips the min-length check when username is falsy (''), but still spreads
    // the empty string into the stored record, corrupting the user and locking them out.
    if (!username) {
      if (errEl) { errEl.textContent = 'Username cannot be empty.'; errEl.style.display = 'block'; }
      return;
    }

    // Only include designation in updates if the field exists in DOM (trainer view)
    const updates = { fullName, username, email, phone };
    if (designation !== undefined) updates.designation = designation;

    const result = Storage.updateUser(user.id, updates);
    if (!result.ok) {
      if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
      return;
    }
    // Refresh header with updated user
    const fresh = Storage.getCurrentUser();
    UI.setAuthState(true, fresh);
    UI.renderSidebar(Storage.getMyBatches(), null);
    if (succEl) { succEl.textContent = 'Profile saved!'; succEl.style.display = 'block'; }
    // Re-render identity card with new initials
    UI.renderProfilePage(fresh);
    UI.showToast('Profile updated!', 'success');
  }

  /** V4-4: Change password via modal */
  function _handleChangePassword() {
    const user = Storage.getCurrentUser();
    if (!user) return;
    UI.showChangePasswordModal((oldPass, newPass, errEl, modal) => {
      const result = Storage.changePassword(user.id, oldPass, newPass);
      if (!result.ok) {
        errEl.textContent    = result.error;
        errEl.style.display  = 'block';
        return;
      }
      modal.remove();
      UI.showToast('Password changed successfully!', 'success');
    });
  }

  /** V4-4: Delete account with confirmation */
  function _handleDeleteAccount() {
    const user = Storage.getCurrentUser();
    if (!user) return;
    UI.showConfirm(
      `Permanently delete account "@${user.username}" and ALL associated batches and students? This cannot be undone.`,
      () => {
        Storage.deleteAccount(user.id);
        state.activeBatchId   = null;
        state.view            = 'welcome';
        state.activeStudentId = null;
        Charts.destroyAll();
        UI.setAuthState(false);
        UI.renderAuthScreen(_handleLogin, _handleSignup);
        UI.showToast('Account deleted.', 'error');
      }
    );
  }

  // ─── V4: Admin Panel ──────────────────────────────────────────────────────

  function openAdminPanel() {
    const user = Storage.getCurrentUser();
    if (!user || user.role !== 'admin') return;
    state.view = 'admin-panel';
    Charts.destroyAll();
    UI.renderAdminDashboard();
    UI.renderSidebar(Storage.getMyBatches(), null);
    // P4: render cross-batch chart now that the canvas is in the DOM
    _renderAdminCharts();
    // Wire export button that was just injected into the DOM
    document.getElementById('btn-admin-export')?.addEventListener('click', openAdminExportModal);
  }

  /** P4: Builds cross-batch datasets and draws the comparison chart. */
  function _renderAdminCharts() {
    const allBatches = Storage.getBatches();
    if (allBatches.length < 2) return;
    const isDark  = document.body.classList.contains('dark');
    const allUsers = Storage.getAllUsers();
    const userMap  = Object.fromEntries(allUsers.map(u => [u.id, u]));

    // X-axis: sequential numbers only — clean, never tilt regardless of batch count.
    // Full batch code is shown in the hover tooltip instead.
    const labels = allBatches.map((_, i) => String(i + 1));

    // Batch codes for tooltip title (identity on hover)
    const batchCodes = allBatches.map(b =>
      b.batchCode || (b.name.length > 16 ? b.name.slice(0, 14) + '…' : b.name)
    );

    // Faculty name per batch — shown in tooltip
    const facultyNames = allBatches.map(b => {
      const instrId   = b.primaryInstructorId || b.ownerId;
      const instrUser = instrId ? userMap[instrId] : null;
      return instrUser ? (instrUser.fullName || instrUser.username) : '—';
    });

    // Per-batch aggregate metrics
    const attData = [], fsData = [], acadData = [], presData = [];
    allBatches.forEach(b => {
      const students = b.students || [];
      const ctx      = { holidays: b.holidays || [] };
      if (!students.length) {
        attData.push(0); fsData.push(0); acadData.push(0); presData.push(0);
        return;
      }
      let att = 0, fs = 0, acad = 0, pres = 0;
      students.forEach(s => {
        const m = Calc.allMetrics(s, ctx);
        att  += m.attendance;
        fs   += m.finalScore;
        acad += m.academic;
        pres += m.presentation;
      });
      const n = students.length;
      attData.push( parseFloat((att  / n).toFixed(1)));
      fsData.push(  parseFloat((fs   / n).toFixed(1)));
      acadData.push(parseFloat((acad / n).toFixed(1)));
      presData.push(parseFloat((pres / n).toFixed(1)));
    });

    Charts.renderCrossBatchBar('chart-cross-batch', labels, [
      { label: 'Avg Attendance',    data: attData,  color: '#0ea5e9' },
      { label: 'Avg Final Score',   data: fsData,   color: '#6366f1' },
      { label: 'Avg Academic',      data: acadData, color: '#22c55e' },
      { label: 'Avg Presentation',  data: presData, color: '#f59e0b' }
    ], isDark, facultyNames, batchCodes);
  }

  // ─── Admin Institute Dashboard ────────────────────────────────────────────

  /**
   * openAdminDashboard — renders the institute-level KPI + cross-batch chart screen.
   * Uses a separate canvas id ('chart-admin-dashboard') from the old admin panel
   * ('chart-cross-batch') so both can coexist without canvas conflicts.
   */
  function openAdminDashboard() {
    if (!_adminGuard()) return;
    state.view = 'admin-dashboard';
    Charts.destroyAll();
    UI.setNavSection('admin-dashboard');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('Institute Dashboard');
    UI.renderAdminDashboardScreen();
    _renderAdminDashboardCharts();
    // Wire "View Detailed Report →" link on Faculty Performance card
    document.getElementById('btn-go-faculty-perf')?.addEventListener('click', e => {
      e.preventDefault();
      openFacultyBatchPerformance();
    });
  }

  // Listen for spms-nav custom event dispatched by UI components (e.g. faculty perf link)
  document.addEventListener('spms-nav', e => {
    const section = e.detail;
    if (section === 'admin-faculty-performance') openFacultyBatchPerformance();
  });

  /**
   * _renderAdminDashboardCharts — builds datasets from active batches and
   * draws the grouped bar chart on '#chart-admin-dashboard'.
   * Wires onBatchClick so clicking a bar navigates to Admin Batch Detail.
   * Only active (non-archived) batches are included — same filter as the KPI cards.
   */
  function _renderAdminDashboardCharts() {
    const activeBatches = Storage.getBatches().filter(b => !b.archived && b.status !== 'archived');
    if (activeBatches.length < 2) return;

    const isDark     = document.body.classList.contains('dark');
    const allUsers   = Storage.getAllUsers();
    const userMap    = Object.fromEntries(allUsers.map(u => [u.id, u]));

    // X-axis labels: sequential numbers; full name shown in tooltip
    const labels      = activeBatches.map((_, i) => String(i + 1));
    const batchCodes  = activeBatches.map(b =>
      b.batchCode || (b.name.length > 16 ? b.name.slice(0, 14) + '…' : b.name)
    );
    const facultyNames = activeBatches.map(b => {
      const instrId   = b.primaryInstructorId || b.ownerId;
      const instrUser = instrId ? userMap[instrId] : null;
      return instrUser ? (instrUser.fullName || instrUser.username) : '—';
    });

    const attData = [], fsData = [], acadData = [], presData = [];
    const _sc = ScoringConfig.load();
    activeBatches.forEach(b => {
      const students = b.students || [];
      const ctx      = { holidays: b.holidays || [], scoringConfig: _sc };
      if (!students.length) {
        attData.push(0); fsData.push(0); acadData.push(0); presData.push(0);
        return;
      }
      let att = 0, fs = 0, acad = 0, pres = 0;
      students.forEach(s => {
        const m = Calc.allMetrics(s, ctx);
        att  += m.attendance;
        fs   += m.finalScore;
        acad += m.academic;
        pres += m.presentation;
      });
      const n = students.length;
      attData.push( parseFloat((att  / n).toFixed(1)));
      fsData.push(  parseFloat((fs   / n).toFixed(1)));
      acadData.push(parseFloat((acad / n).toFixed(1)));
      presData.push(parseFloat((pres / n).toFixed(1)));
    });

    Charts.renderCrossBatchBar(
      'chart-admin-dashboard',
      labels,
      [
        { label: 'Avg Attendance',    data: attData,  color: '#0ea5e9' },
        { label: 'Avg Final Score',   data: fsData,   color: '#6366f1' },
        { label: 'Avg Academic',      data: acadData, color: '#22c55e' },
        { label: 'Avg Presentation',  data: presData, color: '#f59e0b' }
      ],
      isDark,
      facultyNames,
      batchCodes,
      // Drill-down: click a batch bar group → open Admin Batch Detail
      (index) => {
        const clicked = activeBatches[index];
        if (clicked) openAdminBatchDetail(clicked.id);
      }
    );
  }

  // ─── Phase 11: Focused Admin Screens ─────────────────────────────────────

  function _adminGuard() {
    const user = Storage.getCurrentUser();
    return user && user.role === 'admin';
  }

  function openAdminReports() {
    if (!_adminGuard()) return;
    state.view = 'admin-reports';
    Charts.destroyAll();
    UI.setNavSection('admin-reports');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('Reports');
    UI.renderAdminReportsScreen();
    // Wire export buttons directly — no modal, buttons live in #main-content
    document.getElementById('main-content')?.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => _doExportAdmin(btn.dataset.export, btn.dataset.fmt));
    });
  }

  function openAdminAllBatches() {
    if (!_adminGuard()) return;
    state.view = 'admin-all-batches';
    Charts.destroyAll();
    UI.setNavSection('admin-all-batches');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('All Batches');
    UI.renderAdminAllBatchesScreen();

    // Wire Import Batches button
    document.getElementById('btn-import-batches')?.addEventListener('click', () => {
      openImportBatchesModal();
    });
  }

  function openFacultyBatchPerformance() {
    if (!_adminGuard()) return;
    state.view = 'admin-faculty-performance';
    Charts.destroyAll();
    UI.setNavSection('admin-faculty-performance');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('Faculty Batch Performance');
    const allUsers   = Storage.getAllUsers();
    const allBatches = Storage.getBatches();
    UI.renderFacultyBatchPerformanceScreen(allUsers, allBatches);
    // Chart is rendered by ui.js internally after DOM is built
    _bindFacultyPerfCharts(allUsers, allBatches);
  }

  // ─── Import Multiple Batches from Excel ──────────────────────────────────────

  function openImportBatchesModal(previewData) {
    UI.showImportBatchesModal(previewData || null, ({ action, file, batches }) => {

      // ── Download sample template ─────────────────────────────────────────────
      if (action === 'template') {
        const wb = XLSX.utils.book_new();
        const batchSheet = XLSX.utils.aoa_to_sheet([
          ['Batch Name', 'Batch Code', 'Description', 'Start Date', 'End Date', 'Capacity', 'Status'],
          ['ANH BATCH 2025', 'ANH25', 'Advanced Networking Hardware', '2025-06-01', '2025-11-30', '30', 'active'],
          ['LINUX BATCH A', 'LXA25', 'Linux Administration', '2025-07-01', '2025-12-31', '25', 'upcoming'],
        ]);
        const studentSheet = XLSX.utils.aoa_to_sheet([
          ['Batch Code', 'Enrollment No', 'Full Name', 'Email', 'Phone'],
          ['ANH25', 'JK-001', 'Rahul Sharma', 'rahul@example.com', '9876543210'],
          ['ANH25', 'JK-002', 'Priya Patel',  'priya@example.com', '9876543211'],
          ['LXA25', 'JK-003', 'Amit Singh',   'amit@example.com',  '9876543212'],
        ]);
        XLSX.utils.book_append_sheet(wb, batchSheet,   'Batches');
        XLSX.utils.book_append_sheet(wb, studentSheet, 'Students');
        XLSX.writeFile(wb, 'spms_batch_import_template.xlsx');
        // Re-open so user can then upload after editing the template
        openImportBatchesModal();
        return;
      }

      // ── Parse Excel file ─────────────────────────────────────────────────────
      if (action === 'parse') {
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const wb = XLSX.read(ev.target.result, { type: 'array' });

            // ── Sheet 1: Batches ──────────────────────────────────────────────
            const batchSheetName = wb.SheetNames[0];
            if (!batchSheetName) throw new Error('Excel file has no sheets.');
            const batchRows = XLSX.utils.sheet_to_json(wb.Sheets[batchSheetName], { defval: '' });
            if (!batchRows.length) throw new Error('Sheet 1 (Batches) is empty or missing a header row.');

            const parsedBatches = batchRows.map((row, idx) => {
              // Normalise keys to lowercase-no-space for flexibility
              const get = (...keys) => {
                for (const k of keys) {
                  const match = Object.keys(row).find(rk =>
                    rk.trim().toLowerCase().replace(/\s+/g, '') === k.toLowerCase().replace(/\s+/g, '')
                  );
                  if (match !== undefined) return String(row[match]).trim();
                }
                return '';
              };
              const name = get('BatchName', 'Name', 'Batch');
              if (!name) return null; // skip empty rows
              const code     = get('BatchCode', 'Code');
              const desc     = get('Description', 'Desc');
              const startDate = get('StartDate', 'Start');
              const endDate   = get('EndDate', 'End');
              const capRaw    = get('Capacity', 'Cap');
              const capacity  = parseInt(capRaw, 10) || 0;
              const status    = get('Status') || 'active';
              return { name, code, desc, startDate, endDate, capacity, status, students: [] };
            }).filter(Boolean);

            if (!parsedBatches.length) throw new Error('No valid batch rows found in Sheet 1.');

            // Build lookup by code for student linking
            const batchByCode = {};
            parsedBatches.forEach(b => { if (b.code) batchByCode[b.code.toLowerCase()] = b; });

            // ── Sheet 2: Students (optional) ──────────────────────────────────
            if (wb.SheetNames.length > 1) {
              const stuSheetName = wb.SheetNames[1];
              const stuRows = XLSX.utils.sheet_to_json(wb.Sheets[stuSheetName], { defval: '' });
              stuRows.forEach(row => {
                const get = (...keys) => {
                  for (const k of keys) {
                    const match = Object.keys(row).find(rk =>
                      rk.trim().toLowerCase().replace(/\s+/g, '') === k.toLowerCase().replace(/\s+/g, '')
                    );
                    if (match !== undefined) return String(row[match]).trim();
                  }
                  return '';
                };
                const bCode    = get('BatchCode', 'Code', 'Batch');
                const fullName = get('FullName', 'Name', 'StudentName');
                if (!fullName) return; // skip
                const target = batchByCode[bCode.toLowerCase()];
                if (!target) return; // unknown batch code
                target.students.push({
                  name:           fullName,
                  enrollmentNo:   get('EnrollmentNo', 'EnrollmentNumber', 'Enrollment'),
                  email:          get('Email'),
                  phone:          get('Phone', 'Mobile'),
                });
              });
            }

            openImportBatchesModal({ batches: parsedBatches });
          } catch (err) {
            UI.showToast('Could not parse file: ' + err.message, 'error');
            openImportBatchesModal(); // re-open upload modal
          }
        };
        reader.onerror = () => { UI.showToast('Failed to read the file.', 'error'); openImportBatchesModal(); };
        reader.readAsArrayBuffer(file);
        return;
      }

      // ── Import confirmed ─────────────────────────────────────────────────────
      if (action === 'import') {
        let createdCount = 0, studentCount = 0, skipped = 0;
        batches.forEach(b => {
          // Skip duplicate batch codes
          const existing = Storage.getBatches().find(ex =>
            ex.batchCode && b.code && ex.batchCode.toLowerCase() === b.code.toLowerCase()
          );
          if (existing) { skipped++; return; }

          const newBatch = Storage.createBatch(b.name, b.desc || '', {
            batchCode: b.code,
            startDate: b.startDate,
            endDate:   b.endDate,
            capacity:  b.capacity,
            status:    b.status || 'active',
          });
          createdCount++;
          (b.students || []).forEach(s => {
            Storage.createStudent(newBatch.id, {
              name:         s.name,
              enrollmentNo: s.enrollmentNo,
              email:        s.email,
              phone:        s.phone,
            });
            studentCount++;
          });
        });

        // Refresh the All Batches screen
        UI.renderAdminAllBatchesScreen();
        document.getElementById('btn-import-batches')?.addEventListener('click', () => openImportBatchesModal());

        let msg = `${createdCount} batch${createdCount !== 1 ? 'es' : ''} created`;
        if (studentCount) msg += ` with ${studentCount} student${studentCount !== 1 ? 's' : ''}`;
        if (skipped) msg += ` (${skipped} skipped — duplicate code)`;
        UI.showToast(msg, 'success');
      }
    });
  }

  function _bindFacultyPerfCharts(allUsers, allBatches) {
    // Grouped bar chart: one group per faculty, bars for each score dimension
    const facultyUsers = allUsers.filter(u => {
      if (u.role === 'student') return false;
      return allBatches.some(b => b.ownerId === u.id || b.primaryInstructorId === u.id);
    });
    if (!facultyUsers.length) return;

    const labels   = facultyUsers.map(u => u.fullName || u.username);
    const techData  = [], commData  = [], presData  = [], labData  = [], readyData = [];

    facultyUsers.forEach(u => {
      const m = UI.calcFacultyMetrics(u.id, allBatches);
      techData.push(parseFloat(m.avgTechnical.toFixed(1)));
      commData.push(parseFloat(m.avgCommunication.toFixed(1)));
      presData.push(parseFloat(m.avgPresentation.toFixed(1)));
      labData.push(parseFloat(m.avgLabs.toFixed(1)));
      readyData.push(parseFloat(m.placementReadiness.toFixed(1)));
    });

    const canvas = document.getElementById('chart-faculty-perf');
    if (!canvas) return;
    Charts.destroyAll();
    Charts.create('chart-faculty-perf', 'bar', {
      labels,
      datasets: [
        { label: 'Technical',       data: techData,  backgroundColor: '#0277FA' },
        { label: 'Communication',   data: commData,  backgroundColor: '#10B981' },
        { label: 'Presentation',    data: presData,  backgroundColor: '#8B5CF6' },
        { label: 'Labs',            data: labData,   backgroundColor: '#F59E0B' },
        { label: 'Placement Ready', data: readyData, backgroundColor: '#EC4899' },
      ]
    }, {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(148,163,184,0.1)' } }
      }
    });
  }

  function openAdminManageUsers() {
    if (!_adminGuard()) return;
    state.view = 'admin-manage-users';
    Charts.destroyAll();
    UI.setNavSection('admin-manage-users');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('Manage Users');
    UI.renderAdminManageUsersScreen();
    // Wire "+ Add User" button after render
    document.getElementById('btn-add-user')?.addEventListener('click', openAdminCreateUserModal);
  }

  function openAdminCreateUserModal() {
    const modal = UI.showCreateUserModal();
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const errEl    = document.getElementById('cu-error');
      const fullName = document.getElementById('cu-fullname').value.trim();
      const username = document.getElementById('cu-username').value.trim();
      const email    = document.getElementById('cu-email').value.trim();
      const phone    = document.getElementById('cu-phone').value.trim();
      const role     = document.getElementById('cu-role').value;
      const pw       = document.getElementById('cu-pw').value;
      const pw2      = document.getElementById('cu-pw2').value;

      errEl.style.display = 'none';
      if (!fullName) { errEl.textContent = 'Full name is required.'; errEl.style.display = ''; return; }
      if (!username) { errEl.textContent = 'Username is required.'; errEl.style.display = ''; return; }
      if (!pw)       { errEl.textContent = 'Password is required.'; errEl.style.display = ''; return; }
      if (pw !== pw2){ errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; return; }

      // Pass SPMSADMIN2026 as adminKey when role === 'admin'
      const adminKey = role === 'admin' ? 'SPMSADMIN2026' : '';
      const result   = Storage.createUser({ username, password: pw, fullName, email, phone, adminKey });
      if (!result.ok) { errEl.textContent = result.error; errEl.style.display = ''; return; }

      modal.remove();
      UI.showToast(`User @${username} created successfully as ${role}.`, 'success');
      openAdminManageUsers(); // refresh the list
    });
    bindModalClose(modal);
  }

  function openAdminScoring() {
    if (!_adminGuard()) return;
    state.view = 'admin-scoring';
    Charts.destroyAll();
    UI.setNavSection('admin-scoring');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('Scoring Config');
    UI.renderAdminScoringScreen();
  }

  function openAdminSync() {
    if (!_adminGuard()) return;
    state.view = 'admin-sync';
    Charts.destroyAll();
    UI.setNavSection('admin-sync');
    UI.renderSidebar(Storage.getMyBatches(), null);
    _updateContentTopbar('Sync Status');
    UI.renderAdminSyncScreen();
  }

  // ─── P5: Admin Control Center ─────────────────────────────────────────────

  /** Open admin batch detail view — shows full batch info + student list with transfer controls */
  function openAdminBatchDetail(batchId) {
    const user = Storage.getCurrentUser();
    if (!user || user.role !== 'admin') return;
    const batch    = Storage.getBatch(batchId);
    const allUsers = Storage.getAllUsers();
    if (!batch) return;
    state.view = 'admin-batch-detail';
    Charts.destroyAll();
    UI.renderAdminBatchDetail(batch, allUsers);
    UI.renderSidebar(Storage.getMyBatches(), null);
  }

  /** Open instructor assignment modal for a batch */
  function openInstructorAssignModal(batchId) {
    const user = Storage.getCurrentUser();
    if (!user || user.role !== 'admin') return;
    const batch    = Storage.getBatch(batchId);
    const allUsers = Storage.getAllUsers();
    if (!batch) return;
    UI.showInstructorAssignModal(batch, allUsers, (primaryId, assistantIds) => {
      Storage.updateBatchInstructors(batchId, primaryId, assistantIds);
      // Re-render the detail view with fresh data
      const updated = Storage.getBatch(batchId);
      UI.renderAdminBatchDetail(updated, Storage.getAllUsers());
      UI.showToast('Instructor assignment saved!', 'success');
    });
  }

  /**
   * Transfer student triggered from admin batch detail view.
   * After transfer, stays in admin context (re-opens admin batch detail).
   */
  function openAdminTransferStudentModal(fromBatchId, studentId) {
    const user = Storage.getCurrentUser();
    if (!user || user.role !== 'admin') { UI.showToast('Only admins can transfer students.', 'error'); return; }

    const student = Storage.getStudent(fromBatchId, studentId);
    if (!student) return;

    const allBatches    = Storage.getBatches().filter(b => !b.archived);
    const targetBatches = allBatches.filter(b => b.id !== fromBatchId);

    UI.showTransferModal(student, fromBatchId, targetBatches, (targetBatchId) => {
      const targetBatch = Storage.getBatch(targetBatchId);
      const targetName  = targetBatch ? targetBatch.name : targetBatchId;
      UI.showConfirm(
        `Transfer "${student.name}" to batch "${targetName}"? The student's full record will be preserved.`,
        () => {
          const result = Storage.transferStudent(fromBatchId, studentId, targetBatchId);
          if (!result.ok) { UI.showToast(result.error, 'error'); return; }
          UI.showToast(`"${student.name}" transferred to "${targetName}".`, 'success');
          openAdminBatchDetail(fromBatchId); // return to admin detail, not trainer dashboard
        }
      );
    });
  }

  // ─── Main Content Click Delegation ─────────────────────────────────────────

  function handleMainClick(e) {
    // Handle kebab toggles first — they use data-kebab, not data-action
    const kebabBtn = e.target.closest('[data-kebab]');
    if (kebabBtn) {
      e.stopPropagation();
      document.querySelectorAll('.mi-kebab-menu').forEach(m => m.style.display = 'none');
      const menu = document.getElementById(`kebab-menu-${kebabBtn.dataset.kebab}`);
      if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) {
      const examSaveBtn = e.target.closest('.btn-save-exam');
      if (examSaveBtn) { _handleExamSave(examSaveBtn); return; }
      return;
    }

    const { action, sid, bid } = btn.dataset;
    const batchId = bid || state.activeBatchId;

    // Academics slide-over actions
    if (action === 'acad-close')       { _closeAcadPanel(); return; }
    if (action === 'acad-add-test')    { _handleAcadAddTest(btn); return; }
    if (action === 'acad-delete-test') { _handleAcadDeleteTest(btn); return; }

    // Question Bank actions
    // Test Management actions
    if (action === 'tests-create')  { _openCreateTestPanel(state.activeBatchId); return; }
    if (action === 'tests-cancel')  { _closeAcadPanel(); return; }
    if (action === 'tests-save')    { _handleCreateTestSave(btn, btn.dataset.bid || state.activeBatchId); return; }
    if (action === 'tests-publish') { _handlePublishTest(btn.dataset.tid, state.activeBatchId); return; }
    if (action === 'tests-close')   { _handleCloseTest(btn.dataset.tid, state.activeBatchId); return; }
    if (action === 'tests-reopen')  { _handleReopenTest(btn.dataset.tid, state.activeBatchId); return; }
    if (action === 'tests-delete')  { _handleDeleteTest(btn.dataset.tid, state.activeBatchId); return; }
    if (action === 'tests-results') { _handleViewTestResults(btn.dataset.tid, state.activeBatchId); return; }
    if (action === 'tests-kebab')   {
      e.stopPropagation(); // prevent document handler from immediately closing the menu
      const menu = btn.closest('.kebab-wrap')?.querySelector('.kebab-menu');
      const wasOpen = menu?.classList.contains('is-open');
      // Close all open menus and clear any inline positioning from previous opens
      document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
        m.classList.remove('is-open');
        m.removeAttribute('style');
      });
      if (!wasOpen && menu) {
        // Use position:fixed so the dropdown escapes the overflow:auto table wrapper
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.right    = (window.innerWidth - rect.right) + 'px';
        menu.style.left     = 'auto';
        // Open upward if less than 220px below button, otherwise downward
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 220) {
          menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
          menu.style.top    = 'auto';
        } else {
          menu.style.top    = (rect.bottom + 4) + 'px';
          menu.style.bottom = 'auto';
        }
        menu.classList.add('is-open');
      }
      return;
    }
    if (action === 'tests-manage-students') { _handleManageStudents(btn.dataset.tid, state.activeBatchId, btn.dataset.from); return; }
    if (action === 'tests-save-students')   { _handleSaveStudents(btn, btn.dataset.tid, state.activeBatchId, btn.dataset.from); return; }

    if (action === 'qb-upload')          { document.getElementById('qb-file-input')?.click(); return; }
    if (action === 'qb-download-sample') { _handleQBDownloadSample(); return; }
    if (action === 'qb-cancel')          { _closeAcadPanel(); return; }
    if (action === 'qb-save')            { _handleQuestionBankSave(btn, btn.dataset.bid || state.activeBatchId); return; }
    if (action === 'qb-delete-batch')    { _handleDeleteUploadBatch(btn.dataset.ubid, state.activeBatchId); return; }

    // Student Remarks slide-over actions (Phase 8)
    if (action === 'remarks-close')  { _closeRemarksPanel(); return; }
    if (action === 'rem-call-save')  { _handleCallSave(btn); return; }
    if (action === 'rem-call-del')   { _handleCallDelete(btn); return; }
    if (action === 'rem-note-save')  { _handleNoteSave(btn); return; }
    if (action === 'rem-note-del')   { _handleNoteDelete(btn); return; }

    // Mock Interviews slide-over actions (Phase 7)
    if (action === 'mock-close')   { _closeMockPanel(); return; }
    if (action === 'mock-save')    { _handleMockSave(btn); return; }
    if (action === 'mock-del')     { _handleMockDelete(btn); return; }
    if (action === 'aimock-save')  { _handleAIMockSave(btn); return; }
    if (action === 'aimock-del')   { _handleAIMockDelete(btn); return; }

    // Mock interview history kebab toggle (data-kebab, not data-action)
    const kebabId = btn.dataset.kebab;
    if (kebabId) {
      e.stopPropagation();
      // Close all open mock kebab menus first
      document.querySelectorAll('.mi-kebab-menu').forEach(m => m.style.display = 'none');
      const menu = document.getElementById(`kebab-menu-${kebabId}`);
      if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
      return;
    }

    if (action === 'view')   { openStudentProfile(batchId, sid); return; }
    if (action === 'edit')   { openEditStudentModal(batchId, sid); return; }
    if (action === 'delete') { confirmDeleteStudent(batchId, sid); return; }

    // Manage Batch screen actions
    if (action === 'add-student') {
      openAddStudentModal(batchId);
      return;
    }
    if (action === 'edit-student') {
      openEditStudentModal(batchId, sid);
      return;
    }
    if (action === 'remove-student') {
      confirmDeleteStudent(batchId, sid);
      return;
    }
    if (action === 'add-holiday') {
      openAddHolidayModal(batchId);
      return;
    }
    if (action === 'remove-holiday') {
      const hidx = parseInt(btn.dataset.hidx);
      _removeHoliday(batchId, hidx);
      return;
    }

    // P1-7: Transfer student (admin-only) — from trainer batch dashboard
    if (action === 'transfer') { openTransferStudentModal(batchId, sid); return; }

    // P5: Admin Control Center actions
    if (action === 'admin-view-batch')         { openAdminBatchDetail(btn.dataset.bid); return; }
    if (action === 'admin-assign-instructors') { openInstructorAssignModal(btn.dataset.bid); return; }
    if (action === 'admin-transfer-student')   { openAdminTransferStudentModal(btn.dataset.bid, sid); return; }
    if (action === 'back-admin')               { openAdminPanel(); return; }

    // User Management: kebab menu toggle
    if (action === 'user-kebab') {
      e.stopPropagation(); // prevent document click listener from immediately closing it
      const uid  = btn.dataset.uid;
      const menu = document.getElementById(`kebab-${uid}`);
      // Close all other open menus first
      document.querySelectorAll('.kebab-menu.is-open').forEach(m => {
        if (m !== menu) m.classList.remove('is-open');
      });
      menu?.classList.toggle('is-open');
      return;
    }

    // User Management: admin edits a user profile
    if (action === 'admin-edit-user') {
      e.stopPropagation();
      const targetId  = btn.dataset.uid;
      const adminUser = Storage.getCurrentUser();
      if (!adminUser || adminUser.role !== 'admin') return;
      document.querySelectorAll('.kebab-menu.is-open').forEach(m => m.classList.remove('is-open'));
      const target = Storage.getAllUsers().find(u => u.id === targetId);
      if (!target) { UI.showToast('User not found.', 'error'); return; }
      const modal = UI.showEditUserModal(target);
      document.getElementById('modal-confirm').addEventListener('click', () => {
        const errEl = document.getElementById('eu-error');
        const fullName = document.getElementById('eu-fullname').value.trim();
        const email    = document.getElementById('eu-email').value.trim();
        const phone    = document.getElementById('eu-phone').value.trim();
        const designation = document.getElementById('eu-designation')?.value.trim() || '';
        if (!fullName) { errEl.textContent = 'Full name is required.'; errEl.style.display = ''; return; }
        const result = Storage.updateUser(targetId, { fullName, email, phone, designation });
        if (!result.ok) { errEl.textContent = result.error; errEl.style.display = ''; return; }
        modal.remove();
        UI.showToast(`Profile updated for @${target.username}.`, 'success');
        openAdminManageUsers();
      });
      bindModalClose(modal);
      return;
    }

    // User Management: admin force-resets a user's password
    if (action === 'admin-reset-user-pw') {
      e.stopPropagation();
      const targetId   = btn.dataset.uid;
      const targetName = btn.dataset.uname;
      const adminUser  = Storage.getCurrentUser();
      if (!adminUser || adminUser.role !== 'admin') return;
      document.querySelectorAll('.kebab-menu.is-open').forEach(m => m.classList.remove('is-open'));
      const target = Storage.getAllUsers().find(u => u.id === targetId);
      if (!target) { UI.showToast('User not found.', 'error'); return; }
      const modal = UI.showAdminResetPasswordModal(target);
      document.getElementById('modal-confirm').addEventListener('click', () => {
        const errEl = document.getElementById('rp-error');
        const pw    = document.getElementById('rp-pw').value;
        const pw2   = document.getElementById('rp-pw2').value;
        if (!pw || pw.length < 4) { errEl.textContent = 'Password must be at least 4 characters.'; errEl.style.display = ''; return; }
        if (pw !== pw2)           { errEl.textContent = 'Passwords do not match.'; errEl.style.display = ''; return; }
        const result = Storage.adminForceResetPassword(targetId, pw);
        if (!result.ok) { errEl.textContent = result.error; errEl.style.display = ''; return; }
        modal.remove();
        UI.showToast(`Password reset for @${targetName}.`, 'success');
      });
      bindModalClose(modal);
      return;
    }

    // User Management: admin deletes another user's account (type-to-confirm)
    if (action === 'admin-delete-user') {
      e.stopPropagation();
      const targetId   = btn.dataset.uid;
      const targetName = btn.dataset.uname;
      const adminUser  = Storage.getCurrentUser();
      if (!adminUser || adminUser.role !== 'admin') return;
      // Close any open kebab menu
      document.querySelectorAll('.kebab-menu.is-open').forEach(m => m.classList.remove('is-open'));
      UI.showDangerConfirm(
        `Delete @${targetName}?`,
        targetName,
        `This will permanently remove <strong>@${targetName}</strong> and soft-delete all their batches. This cannot be undone.`,
        () => {
          Storage.adminDeleteUser(targetId);
          UI.showToast(`Account "@${targetName}" deleted.`, 'error');
          openAdminPanel();
        }
      );
      return;
    }

    // Student login management: delete login
    if (action === 'delete-student-login') {
      const studentId = btn.dataset.sid;
      const uname     = btn.dataset.uname;
      UI.showDangerConfirm(
        `Delete login @${uname}?`,
        uname,
        `This removes the student portal login <strong>@${uname}</strong>. The student's data (attendance, marks, etc.) is kept. A new login can be created afterwards.`,
        () => {
          const result = Storage.deleteStudentUser(studentId);
          if (!result.ok) { UI.showToast(result.error, 'error'); return; }
          SupabaseSync.flushUsers(Storage.getAllUsers()).catch(() => {});
          UI.showToast('Student login deleted.', 'success');
          const fresh = Storage.getStudent(btn.dataset.bid, studentId);
          if (fresh && state.view === 'profile') {
            Charts.destroyAll();
            UI.renderStudentProfile(fresh, btn.dataset.bid);
            bindProfileEvents();
          }
        }
      );
      return;
    }

    // Student login management: reset password
    if (action === 'reset-student-password') {
      const studentId = btn.dataset.sid;
      const student   = Storage.getStudent(btn.dataset.bid, studentId);
      if (!student) return;
      UI.showResetStudentPasswordModal(student.name, (newPassword) => {
        const result = Storage.adminResetStudentPassword(studentId, newPassword);
        if (!result.ok) { UI.showToast(result.error, 'error'); return; }
        SupabaseSync.flushUsers(Storage.getAllUsers()).catch(() => {});
        UI.showToast('Password reset successfully!', 'success');
      });
      return;
    }

    // V4: Admin panel — open any trainer's batch
    if (action === 'admin-open-batch') { selectBatch(btn.dataset.bid); return; }

    // P3: Timetable actions
    if (action === 'back-batch-tt') { selectBatch(batchId); return; }

    if (action === 'tt-week-view') {
      state.ttViewMode = 'week';
      openTimetable(batchId); return;
    }
    if (action === 'tt-day-view') {
      state.ttViewMode = 'day';
      if (!state.ttActiveDate) state.ttActiveDate = _todayStr();
      openTimetable(batchId); return;
    }
    if (action === 'tt-day-click') {
      state.ttViewMode   = 'day';
      state.ttActiveDate = btn.dataset.date;
      openTimetable(batchId); return;
    }
    // ── Cal-2: Calendar navigation & actions ─────────────────────────────────
    if (action === 'cal-view-day')    { state.calViewMode = 'day';    openTimetable(batchId); return; }
    if (action === 'cal-view-week')   { state.calViewMode = 'week';   openTimetable(batchId); return; }
    if (action === 'cal-view-month')  {
      // From year view: btn.dataset.date may carry the first of that month
      if (btn.dataset.date) state.calDate = btn.dataset.date;
      state.calViewMode = 'month';
      openTimetable(batchId); return;
    }
    if (action === 'cal-view-year')   { state.calViewMode = 'year';   openTimetable(batchId); return; }
    if (action === 'cal-view-agenda') { state.calViewMode = 'agenda'; openTimetable(batchId); return; }

    if (action === 'cal-today') {
      state.calDate = _todayStr();
      openTimetable(batchId); return;
    }
    if (action === 'cal-prev') {
      state.calDate = _calShift(state.calDate, state.calViewMode, -1);
      openTimetable(batchId); return;
    }
    if (action === 'cal-next') {
      state.calDate = _calShift(state.calDate, state.calViewMode, +1);
      openTimetable(batchId); return;
    }
    if (action === 'cal-day-click') {
      // clicking a day in month/year view → switch to day view for that date
      state.calDate     = btn.dataset.date;
      state.calViewMode = 'day';
      openTimetable(batchId); return;
    }
    if (action === 'cal-new-event') {
      openCalendarEventModal(batchId, null, btn.dataset.date || state.calDate, btn.dataset.dow ? parseInt(btn.dataset.dow,10) : null);
      return;
    }
    // cal-chip-menu: click on an event chip → show Edit / Delete popup
    if (action === 'cal-chip-menu') {
      _showCalChipPopup(e, btn.dataset.eid, batchId, btn.dataset.date, btn.dataset.origDate);
      return;
    }
    // cal-chip-edit / cal-chip-delete are handled by the document-level listener in bindGlobalEvents
    // (popup lives in body, not #main-content — these fallbacks are kept for safety)
    if (action === 'cal-chip-edit') {
      _hideCalChipPopup();
      openCalendarEventModal(batchId, btn.dataset.eid);
      return;
    }
    if (action === 'cal-chip-delete') {
      _hideCalChipPopup();
      _confirmDeleteCalendarEvent(batchId, btn.dataset.eid, btn.dataset.date, btn.dataset.origDate);
      return;
    }
    // cal-edit-event / cal-delete-event: used by agenda view's dedicated buttons
    if (action === 'cal-edit-event') {
      openCalendarEventModal(batchId, btn.dataset.eid);
      return;
    }
    if (action === 'cal-delete-event') {
      _confirmDeleteCalendarEvent(batchId, btn.dataset.eid, btn.dataset.date, btn.dataset.origDate);
      return;
    }

    // Legacy timetable actions (kept so any residual references don't error)
    if (action === 'tt-prev-week') { openTimetable(batchId); return; }
    if (action === 'tt-next-week') { openTimetable(batchId); return; }
    if (action === 'tt-today')     { openTimetable(batchId); return; }
    if (action === 'tt-prev-day')  { openTimetable(batchId); return; }
    if (action === 'tt-next-day')  { openTimetable(batchId); return; }
    if (action === 'tt-add-class') { openCalendarEventModal(batchId, null, state.calDate); return; }
    if (action === 'tt-edit-class')   { openCalendarEventModal(batchId, btn.dataset.eid); return; }
    if (action === 'tt-delete-class') { _confirmDeleteCalendarEvent(batchId, btn.dataset.eid, btn.dataset.date || '', btn.dataset.origDate || ''); return; }

    // V4: Profile page actions
    if (action === 'save-profile')    { _handleSaveProfile();    return; }
    if (action === 'change-password') { _handleChangePassword(); return; }
    if (action === 'delete-account')  { _handleDeleteAccount();  return; }

    // Phase 1: AI Mock history actions
    if (action === 'save-ai-mock')   { _handleAiMockSave(btn.dataset.bid,   btn.dataset.sid);             return; }
    if (action === 'edit-ai-mock')   { _handleAiMockEdit(btn.dataset.bid,   btn.dataset.sid, btn.dataset.miId); return; }
    if (action === 'delete-ai-mock') { _handleAiMockDelete(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId); return; }

    // STUDENT_PORTAL: Student login creation
    if (action === 'create-student-login')  { openCreateStudentLoginModal(batchId, btn.dataset.sid); return; }

    // CHANGE 4: Holiday delete from attendance dashboard
    if (action === 'delete-holiday') {
      const date = btn.dataset.date;
      UI.showConfirm(`Remove holiday on ${date}?`, () => {
        Storage.removeHoliday(batchId, date);
        const batch = Storage.getBatch(batchId);
        if (!batch) return;
        UI.renderAttendanceDashboard(batch);
        bindAttendanceDashboardEvents();
        UI.showToast('Holiday removed.', 'success');
      });
      return;
    }

    // CHANGE 5: Mock interview save
    if (action === 'save-mock') {
      _handleMockInterviewSave(btn.dataset.bid, btn.dataset.sid);
      return;
    }

    // Mock interview delete
    if (action === 'delete-mock') {
      _handleMockDelete(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId);
      return;
    }

    // Mock interview edit (date + Q&A notes only)
    if (action === 'edit-mock') {
      _handleMockEdit(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId);
      return;
    }

    // Mock History page kebab — same logic but re-renders history page after
    if (action === 'edit-mock-hist') {
      _handleMockEdit(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId, true);
      return;
    }
    if (action === 'delete-mock-hist') {
      _handleMockDeleteHist(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId);
      return;
    }
    if (action === 'edit-aimock-hist') {
      _handleAiMockEdit(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId, true);
      return;
    }
    if (action === 'delete-aimock-hist') {
      _handleAiMockDeleteHist(btn.dataset.bid, btn.dataset.sid, btn.dataset.miId);
      return;
    }

    // Back buttons
    if (action === 'back-batch') { selectBatch(batchId); return; }

    // P4: Export — defensive routes kept for any future export button placed directly
    // inside #main-content. Export modals live on document.body and use direct
    // listeners (openBatchExportModal / openAdminExportModal), so these routes
    // are not reachable from modal buttons — they will not double-fire.
    if (action === 'export-batch') {
      _doExportBatch(btn.dataset.export, btn.dataset.fmt, btn.dataset.bid || batchId);
      return;
    }
    if (action === 'export-admin') {
      _doExportAdmin(btn.dataset.export, btn.dataset.fmt);
      return;
    }

    // Phase E: Scoring config — save
    if (action === 'save-scoring-config') {
      const weights = {
        attendance:   document.getElementById('cfg-w-attendance')?.value,
        academic:     document.getElementById('cfg-w-academic')?.value,
        presentation: document.getElementById('cfg-w-presentation')?.value,
        aiMock:       document.getElementById('cfg-w-aimock')?.value,
        manualMock:   document.getElementById('cfg-w-manualmock')?.value
      };
      const thresholds = {
        a: document.getElementById('cfg-t-a')?.value,
        b: document.getElementById('cfg-t-b')?.value
      };
      const currentUser = Storage.getCurrentUser();
      const result = ScoringConfig.save(weights, thresholds, currentUser?.id);
      if (result.ok) {
        UI.showToast('Scoring configuration saved.', 'success');
        // Phase F: push to Supabase fire-and-forget so other devices get the update on next login
        SupabaseSync.pushConfig(ScoringConfig.load());
        UI.renderAdminDashboard();
        _renderAdminCharts();
      } else {
        UI.showToast(result.errors[0] || 'Invalid configuration — check weights and thresholds.', 'error');
      }
      return;
    }

    // Phase E: Scoring config — reset to defaults
    if (action === 'reset-scoring-config') {
      UI.showConfirm(
        'Reset scoring configuration to defaults? All custom weights and thresholds will be cleared.',
        () => {
          ScoringConfig.reset();
          // Phase F: delete from Supabase so other devices see the reset on next login
          SupabaseSync.deleteConfig();
          UI.showToast('Scoring configuration reset to defaults.', 'info');
          UI.renderAdminDashboard();
          _renderAdminCharts();
        }
      );
      return;
    }
  }

  // ─── Dashboard Events ─────────────────────────────────────────────────────

  // CHANGE 2: removed bulk-upload binding, added attendance-dashboard binding
  function bindDashboardEvents() {
    const get = id => document.getElementById(id);
    // Edit Batch — navigates to Manage Batch > Details tab
    get('btn-edit-batch')?.addEventListener('click', () => openManageBatch(state.activeBatchId, 'details'));
    // Start Meeting — opens the trainer-specific meeting URL in a new tab
    get('btn-start-meeting')?.addEventListener('click', () => {
      const cu  = Storage.getCurrentUser();
      const url = cu ? ((Storage.getBatch(state.activeBatchId)?.meetingLinks || {})[cu.id] || '') : '';
      if (!url) { UI.showToast('No meeting link found.', 'info'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    // Unarchive — shown only when batch.archived === true
    get('btn-unarchive-batch')?.addEventListener('click', () => {
      const batch = Storage.getBatch(state.activeBatchId);
      if (!batch) return;
      Storage.unarchiveBatch(state.activeBatchId);
      UI.renderSidebar(Storage.getMyBatches(), state.activeBatchId);
      selectBatch(state.activeBatchId);
      UI.showToast(`Batch "${batch.name}" restored to active.`, 'success');
    });
  }

  // ─── CHANGE 4: Attendance Dashboard ─────────────────────────────────────────

  function openAttendanceDashboard(batchId) {
    state.view = 'attendance';
    Charts.destroyAll();
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    UI.renderAttendanceDashboard(batch);
    bindAttendanceDashboardEvents();
  }

  function bindAttendanceDashboardEvents() {
    // Back button
    document.getElementById('btn-back-to-batch')?.addEventListener('click', e =>
      selectBatch(e.currentTarget.dataset.bid));

    // Add holiday
    document.getElementById('btn-add-holiday')?.addEventListener('click', e => {
      const batchId = e.currentTarget.dataset.bid;
      const date   = document.getElementById('holiday-date-inp')?.value;
      const reason = document.getElementById('holiday-reason-inp')?.value.trim();
      if (!date) { UI.showToast('Select a date', 'error'); return; }
      const d = new Date(date + 'T12:00:00');
      if (d.getDay() === 0) { UI.showToast('Sundays are already Week Off — no need to add manually.', 'info'); return; }
      const added = Storage.addHoliday(batchId, date, reason || 'Holiday');
      if (!added) { UI.showToast('This date is already a holiday.', 'info'); return; }
      const batch = Storage.getBatch(batchId);
      if (!batch) return;
      UI.renderAttendanceDashboard(batch);
      bindAttendanceDashboardEvents();
      UI.showToast('Holiday added!', 'success');
    });
  }

  // ─── P4: Export ──────────────────────────────────────────────────────────

  /**
   * Opens the batch export modal and wires each export button with a direct
   * click listener. The modal lives on document.body (not inside #main-content),
   * so event delegation via handleMainClick cannot reach it. Direct listeners
   * are the correct pattern here — no data-action is set to prevent any future
   * double-fire if the delegation routes are ever re-evaluated.
   */
  function openBatchExportModal(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    const modal = UI.showExportModal(batch);
    modal.querySelectorAll('[data-export]').forEach(btn => {
      // Capture data-attributes at bind time — btn reference stays valid after modal.remove()
      const reportType = btn.dataset.export;
      const fmt        = btn.dataset.fmt;
      const bid        = btn.dataset.bid || batchId;  // data-bid is canonical; batchId is fallback
      btn.addEventListener('click', () => {
        modal.remove();                          // close first so UI is responsive
        _doExportBatch(reportType, fmt, bid);    // then trigger export
      });
    });
  }

  /**
   * Opens the admin export modal with direct click listeners.
   * Same reasoning as openBatchExportModal — modal is on body, not main-content.
   */
  function openAdminExportModal() {
    const modal = UI.showAdminExportModal();
    modal.querySelectorAll('[data-export]').forEach(btn => {
      const reportType = btn.dataset.export;
      const fmt        = btn.dataset.fmt;
      btn.addEventListener('click', () => {
        modal.remove();
        _doExportAdmin(reportType, fmt);
      });
    });
  }

  // ── Batch exports ─────────────────────────────────────────────────────────

  function _doExportBatch(reportType, fmt, batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) { UI.showToast('Batch not found', 'error'); return; }
    if (fmt === 'xlsx') _exportBatchXLSX(batch, reportType);
    else                _exportBatchPDF(batch, reportType);
  }

  function _exportBatchXLSX(batch, reportType) {
    const ctx      = { holidays: batch.holidays || [], scoringConfig: ScoringConfig.load() };
    const students = batch.students || [];
    const wb       = XLSX.utils.book_new();
    let rows, sheetName;

    if (reportType === 'student-list') {
      sheetName = 'Student List';
      rows = [
        ['Student ID', 'Name', 'Enrollment Date'],
        ...students.map(s => [
          s.studentId || s.id,
          s.name,
          s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '—'
        ])
      ];
    } else if (reportType === 'attendance') {
      sheetName = 'Attendance';
      rows = [
        ['Student ID', 'Name', 'Total Sessions', 'Present', 'Absent', 'Late', 'Attendance %'],
        ...students.map(s => {
          const sessions = s.sessions || [];
          const present  = sessions.filter(ss => Calc._isPresent(ss)).length;
          const late     = sessions.filter(ss => ss.status === 'late').length;
          const absent   = sessions.length - present;
          const attPct   = Calc.attendanceScore(s, ctx);
          return [s.studentId || s.id, s.name, sessions.length, present, absent, late, attPct.toFixed(1) + '%'];
        })
      ];
    } else {
      // performance summary
      sheetName = 'Performance';
      const ranked = Calc.rankStudents(students, ctx);
      rows = [
        ['Rank', 'Student ID', 'Name', 'Attendance %', 'Academic %', 'Presentation %', 'Final Score'],
        ...ranked.map(s => {
          const m = Calc.allMetrics(s, ctx);
          return [s.rank, s.studentId || s.id, s.name,
            m.attendance.toFixed(1), m.academic.toFixed(1), m.presentation.toFixed(1), m.finalScore.toFixed(1)];
        })
      ];
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Auto column widths
    const colWidths = rows[0].map((_, ci) =>
      ({ wch: Math.max(...rows.map(r => String(r[ci] ?? '').length), 10) + 2 })
    );
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `SPMS_${batch.name.replace(/\s+/g, '_')}_${sheetName}_${_todayStr()}.xlsx`);
    UI.showToast('Excel downloaded!', 'success');
  }

  function _exportBatchPDF(batch, reportType) {
    const ctx      = { holidays: batch.holidays || [] };
    const students = batch.students || [];
    const date     = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let title, theadHTML, tbodyHTML;

    if (reportType === 'student-list') {
      title = 'Student List';
      theadHTML = '<tr><th>#</th><th>Student ID</th><th>Name</th><th>Enrollment Date</th></tr>';
      tbodyHTML = students.map((s, i) => `<tr>
        <td>${i+1}</td><td>${s.studentId || s.id}</td><td>${s.name}</td>
        <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '—'}</td>
      </tr>`).join('');
    } else if (reportType === 'attendance') {
      title = 'Attendance Report';
      theadHTML = '<tr><th>Student ID</th><th>Name</th><th>Sessions</th><th>Present</th><th>Absent</th><th>Late</th><th>Att %</th></tr>';
      tbodyHTML = students.map(s => {
        const sessions = s.sessions || [];
        const present  = sessions.filter(ss => Calc._isPresent(ss)).length;
        const late     = sessions.filter(ss => ss.status === 'late').length;
        const absent   = sessions.length - present;
        const attPct   = Calc.attendanceScore(s, ctx).toFixed(1);
        return `<tr><td>${s.studentId||s.id}</td><td>${s.name}</td>
          <td>${sessions.length}</td><td>${present}</td><td>${absent}</td>
          <td>${late}</td><td>${attPct}%</td></tr>`;
      }).join('');
    } else {
      title = 'Performance Summary';
      const ranked = Calc.rankStudents(students, ctx);
      theadHTML = '<tr><th>Rank</th><th>Student ID</th><th>Name</th><th>Att %</th><th>Academic %</th><th>Pres %</th><th>Final Score</th></tr>';
      tbodyHTML = ranked.map(s => {
        const m = Calc.allMetrics(s, ctx);
        return `<tr><td>${s.rank}</td><td>${s.studentId||s.id}</td><td>${s.name}</td>
          <td>${m.attendance.toFixed(1)}</td><td>${m.academic.toFixed(1)}</td>
          <td>${m.presentation.toFixed(1)}</td><td>${m.finalScore.toFixed(1)}</td></tr>`;
      }).join('');
    }

    _printPDF(`SPMS — ${batch.name} — ${title}`, date, `
      <h1 style="font-size:1.3rem;margin-bottom:.3rem">${batch.name}</h1>
      <p style="color:#64748b;margin-bottom:1.2rem">${title} &nbsp;·&nbsp; Generated: ${date}</p>
      <table>${theadHTML}<tbody>${tbodyHTML}</tbody></table>`);
    UI.showToast('PDF ready — use your browser\'s print dialog', 'success');
  }

  // ── Admin exports ─────────────────────────────────────────────────────────

  function _doExportAdmin(reportType, fmt) {
    const allBatches = Storage.getBatches();
    const allUsers   = Storage.getAllUsers();
    // Normalise key: 'admin-instructors' is the legacy name; 'admin-faculty' is the canonical name.
    // Both resolve to the same export so old links / cached pages never break.
    const normType = reportType === 'admin-instructors' ? 'admin-faculty' : reportType;
    if (fmt === 'xlsx') _exportAdminXLSX(normType, allBatches, allUsers);
    else                _exportAdminPDF(normType, allBatches, allUsers);
  }

  function _exportAdminXLSX(reportType, allBatches, allUsers) {
    const wb = XLSX.utils.book_new();
    let rows, sheetName;

    // Build user lookup once — used by both branches.
    // Includes all roles; safe because we only look up by ID (no role assumptions here).
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

    if (reportType === 'admin-batches') {
      sheetName = 'Batches Overview';
      rows = [
        // P3: added Technical Faculty column
        ['Batch Name', 'Code', 'Technical Faculty', 'Status', 'Students', 'Avg Final Score', 'Avg Attendance'],
        ...allBatches.map(b => {
          const ctx      = { holidays: b.holidays || [] };
          const students = b.students || [];
          let fsSum = 0, attSum = 0;
          students.forEach(s => { const m = Calc.allMetrics(s, ctx); fsSum += m.finalScore; attSum += m.attendance; });
          const n = students.length;
          // P3: resolve Technical Faculty — safe fallback for legacy batches without primaryInstructorId
          const instrId   = b.primaryInstructorId || b.ownerId;
          const instrUser = instrId ? userMap[instrId] : null;
          const instrName = instrUser ? (instrUser.fullName || instrUser.username) : '—';
          return [
            b.name, b.batchCode || '—', instrName, b.status || 'active', n,
            n > 0 ? (fsSum  / n).toFixed(1) : '—',
            n > 0 ? (attSum / n).toFixed(1) + '%' : '—'
          ];
        })
      ];

    } else if (reportType === 'admin-placement') {
      // ── Student Placement Report — flat list, one row per student ────────────
      sheetName = 'Student Placement';
      rows = [[
        'Batch Name', 'Batch Code', 'Technical Faculty', 'Name',
        'Attendance %', 'Academic %', 'Presentation %', 'Final Score',
        'Tests Given', 'AI Mock Score (0-10)', 'Manual Mock Count',
        'Placement Category'
      ]];

      const skippedBatches = [];   // batches with 0 students — reported in footer note

      allBatches.forEach(b => {
        const students = b.students || [];
        if (!students.length) { skippedBatches.push(b.name); return; }
        const ctx = { holidays: b.holidays || [], scoringConfig: ScoringConfig.load() };

        // Resolve Technical Faculty name for this batch
        const instrId   = b.primaryInstructorId || b.ownerId;
        const instrUser = instrId ? userMap[instrId] : null;
        const instrName = instrUser ? (instrUser.fullName || instrUser.username) : '—';

        students.forEach(s => {
          try {
            const m = Calc.allMetrics(s, ctx);

            // AI Mock Score: normalise legacy 0–100 values to 0–10 (same logic as placementCategory)
            const rawAI   = s.interviewScore;
            const aiScore = (rawAI === null || rawAI === undefined)
              ? 'NA'
              : (rawAI > 10 ? (rawAI / 10).toFixed(1) : String(rawAI));

            // Tests given — count of weekly test entries recorded for this student
            const testsGiven  = (s.weeklyTests || []).length;

            // Manual mock count — total number of manual mock interview sessions done
            const manualCount = (s.mockInterviews || []).length;

            // Placement category — '—' means insufficient data (AI score or mock missing) → show 'NA'
            const cat        = Calc.placementCategory(s, ctx);
            const catDisplay = cat === '—' ? 'NA' : cat;

            rows.push([
              b.name,
              b.batchCode || '—',
              instrName,
              s.name,
              m.attendance.toFixed(1) + '%',
              m.academic.toFixed(1)   + '%',
              m.presentation.toFixed(1) + '%',
              m.finalScore.toFixed(1),
              testsGiven,
              aiScore,
              manualCount,
              catDisplay
            ]);
          } catch (_err) {
            // One malformed student record — emit a visible placeholder row and continue.
            // Never abort the full export for one bad record.
            rows.push([
              b.name,
              b.batchCode || '—',
              instrName,
              s?.name || '(unknown)',
              '—', '—', '—', '—', '—', '—', '—', '(data error)'
            ]);
          }
        });
      });

      // Transparent note about empty batches — appended after data rows
      if (skippedBatches.length) {
        rows.push([]);   // blank separator
        rows.push([`Note: ${skippedBatches.length} batch(es) with 0 students were excluded: ${skippedBatches.join(', ')}`]);
      }

    } else {
      // admin-faculty (and legacy admin-instructors alias — already normalised in _doExportAdmin)
      // Only include users who own at least one batch — assigned-only trainers are helpers
      // and carry no independent credit, so they are excluded from this report.
      const facultyUsers = allUsers.filter(u => {
        if (u.role === 'student') return false;
        return allBatches.some(b => b.ownerId === u.id || b.primaryInstructorId === u.id);
      });
      sheetName = 'Faculty Performance';
      rows = [
        ['Faculty', 'Username', 'Designation', 'Batches', 'Students', 'Avg Final Score', 'Avg Attendance', 'Avg Academic'],
        ...facultyUsers.map(u => {
          const m = _calcInstructorMetricsApp(u.id, allBatches);
          return [
            u.fullName || u.username, u.username,
            u.designation?.trim() || (u.role === 'admin' ? 'Admin' : 'Technical Faculty'),
            m.batches, m.students,
            m.students > 0 ? m.avgFinalScore.toFixed(1) : '—',
            m.students > 0 ? m.avgAtt.toFixed(1) + '%' : '—',
            m.students > 0 ? m.avgAcademic.toFixed(1) + '%' : '—'
          ];
        })
      ];
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colWidths = rows[0].map((_, ci) =>
      ({ wch: Math.max(...rows.map(r => String(r[ci] ?? '').length), 10) + 2 })
    );
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `SPMS_Institute_${sheetName.replace(/\s+/g, '_')}_${_todayStr()}.xlsx`);
    UI.showToast('Excel downloaded!', 'success');
  }

  function _exportAdminPDF(reportType, allBatches, allUsers) {
    const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    let title, theadHTML, tbodyHTML;

    // Build user lookup once — shared by both branches.
    const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

    if (reportType === 'admin-batches') {
      title = 'All Batches Overview';
      // P3: added Technical Faculty column
      theadHTML = '<tr><th>Batch Name</th><th>Code</th><th>Technical Faculty</th><th>Status</th><th>Students</th><th>Avg Final Score</th><th>Avg Attendance</th></tr>';
      tbodyHTML = allBatches.map(b => {
        const ctx = { holidays: b.holidays || [] };
        const students = b.students || [];
        let fsSum = 0, attSum = 0;
        students.forEach(s => { const m = Calc.allMetrics(s, ctx); fsSum += m.finalScore; attSum += m.attendance; });
        const n = students.length;
        // P3: resolve Technical Faculty — safe fallback for legacy batches without primaryInstructorId
        const instrId   = b.primaryInstructorId || b.ownerId;
        const instrUser = instrId ? userMap[instrId] : null;
        const instrName = instrUser ? (instrUser.fullName || instrUser.username) : '—';
        return `<tr>
          <td>${b.name}</td><td>${b.batchCode||'—'}</td>
          <td>${instrName}</td><td>${b.status||'active'}</td>
          <td>${n}</td>
          <td>${n>0?(fsSum/n).toFixed(1):'—'}</td>
          <td>${n>0?(attSum/n).toFixed(1)+'%':'—'}</td></tr>`;
      }).join('');
    } else if (reportType === 'admin-placement') {
      // Student Placement Report — grouped by batch, one section per batch
      const skippedBatches = [];
      const sections = [];

      allBatches.forEach(b => {
        const students = b.students || [];
        if (!students.length) { skippedBatches.push(b.name); return; }

        const instrId   = b.primaryInstructorId || b.ownerId;
        const instrUser = instrId ? userMap[instrId] : null;
        const instrName = instrUser ? (instrUser.fullName || instrUser.username) : '—';

        const ctx = { holidays: b.holidays || [] };
        const rowsHTML = students.map(s => {
          try {
            const m           = Calc.allMetrics(s, ctx);
            const rawAI       = s.interviewScore;
            const aiScore     = (rawAI === null || rawAI === undefined) ? 'NA' : (rawAI > 10 ? (rawAI / 10).toFixed(1) : String(rawAI));
            const testsGiven  = (s.weeklyTests || []).length;
            const manualCount = (s.mockInterviews || []).length;
            const cat         = Calc.placementCategory(s, ctx);
            const catDisplay  = cat === '—' ? 'NA' : cat;
            const catStyle    = cat === 'A' ? 'color:#16a34a;font-weight:600' : cat === 'B' ? 'color:#d97706;font-weight:600' : cat === 'C' ? 'color:#dc2626;font-weight:600' : 'color:#94a3b8';
            return `<tr>
              <td>${s.name || '—'}</td>
              <td>${m.attendance.toFixed(1)}%</td>
              <td>${m.academic.toFixed(1)}%</td>
              <td>${m.presentation.toFixed(1)}%</td>
              <td>${m.finalScore.toFixed(1)}</td>
              <td>${testsGiven}</td>
              <td>${aiScore}</td>
              <td>${manualCount}</td>
              <td style="${catStyle}">${catDisplay}</td>
            </tr>`;
          } catch (_err) {
            return `<tr>
              <td>${s?.name || '(unknown)'}</td>
              <td colspan="8" style="color:#dc2626;font-style:italic">(data error — record skipped)</td>
            </tr>`;
          }
        }).join('');

        sections.push(`
          <div class="batch-section">
            <div class="batch-header">
              <span class="batch-title">${b.name}</span>
              <span class="batch-meta">${b.batchCode ? b.batchCode + ' &nbsp;·&nbsp; ' : ''}Technical Faculty: ${instrName} &nbsp;·&nbsp; ${students.length} student${students.length !== 1 ? 's' : ''}</span>
            </div>
            <table>
              <thead><tr>
                <th>Name</th>
                <th>Att %</th><th>Academic %</th><th>Presentation %</th><th>Final Score</th>
                <th>Tests Given</th><th>AI Mock (0–10)</th><th>Manual Mock</th><th>Category</th>
              </tr></thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>`);
      });

      const footerHTML = skippedBatches.length
        ? `<p class="footer-note">Note: ${skippedBatches.length} batch(es) with 0 students were excluded: ${skippedBatches.join(', ')}</p>`
        : '';

      const placementCSS = `
        .batch-section { margin-bottom: 2rem; page-break-inside: avoid; }
        .batch-header { background: #EEF2FF; padding: 7px 10px; margin-bottom: 0; border-radius: 4px 4px 0 0; border-bottom: 2px solid #C7D4EE; }
        .batch-title { font-size: 11pt; font-weight: 700; color: #0F172A; }
        .batch-meta { font-size: 8.5pt; color: #475569; margin-left: 10px; }
        .footer-note { margin-top: 1.5rem; font-size: 8.5pt; color: #94A3B8; font-style: italic; }
      `;

      _printPDF('SPMS — Institute — Student Placement Report', date, `
        <style>${placementCSS}</style>
        <h1 style="font-size:1.3rem;margin-bottom:.3rem">SPMS — Institute Report</h1>
        <p style="color:#64748b;margin-bottom:1.4rem">Student Placement Report &nbsp;·&nbsp; Generated: ${date}</p>
        ${sections.join('')}
        ${footerHTML}`);
      UI.showToast('PDF ready — use your browser\'s print dialog', 'success');
      return;

    } else {
      // Only include users who own at least one batch — assigned-only trainers are helpers
      // and carry no independent credit, so they are excluded from this report.
      const facultyUsers = allUsers.filter(u => {
        if (u.role === 'student') return false;
        return allBatches.some(b => b.ownerId === u.id || b.primaryInstructorId === u.id);
      });
      title = 'Faculty Performance Report';
      theadHTML = '<tr><th>Faculty</th><th>Designation</th><th>Batches</th><th>Students</th><th>Avg Final Score</th><th>Avg Att</th><th>Avg Academic</th></tr>';
      tbodyHTML = facultyUsers.map(u => {
        const m    = _calcInstructorMetricsApp(u.id, allBatches);
        const desg = u.designation?.trim() || (u.role === 'admin' ? 'Admin' : 'Technical Faculty');
        return `<tr>
          <td>${u.fullName||u.username}<br><small style="color:#64748b">@${u.username}</small></td>
          <td>${desg}</td><td>${m.batches}</td><td>${m.students}</td>
          <td>${m.students>0?m.avgFinalScore.toFixed(1):'—'}</td>
          <td>${m.students>0?m.avgAtt.toFixed(1)+'%':'—'}</td>
          <td>${m.students>0?m.avgAcademic.toFixed(1)+'%':'—'}</td></tr>`;
      }).join('');
    }

    _printPDF(`SPMS — Institute — ${title}`, date, `
      <h1 style="font-size:1.3rem;margin-bottom:.3rem">SPMS — Institute Report</h1>
      <p style="color:#64748b;margin-bottom:1.2rem">${title} &nbsp;·&nbsp; Generated: ${date}</p>
      <table>${theadHTML}<tbody>${tbodyHTML}</tbody></table>`);
    UI.showToast('PDF ready — use your browser\'s print dialog', 'success');
  }

  // ── Shared export helpers ─────────────────────────────────────────────────

  /**
   * App-side replica of _calcInstructorMetrics (which lives in ui.js scope).
   * Needed here because ui.js private functions are not exported.
   */
  function _calcInstructorMetricsApp(userId, allBatches) {
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
      batches:          batches.length,
      students:         count,
      avgFinalScore:    count > 0 ? totalFS       / count : 0,
      avgAtt:      count > 0 ? totalAtt      / count : 0,
      avgAcademic: count > 0 ? totalAcademic / count : 0
    };
  }

  /** Returns today as YYYY-MM-DD for filenames. */
  /** Returns today's date as YYYY-MM-DD in LOCAL time (not UTC). */
  function _todayStr() {
    const d = new Date();
    return d.getFullYear()
      + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  /**
   * Opens a print-friendly window with the given HTML body content.
   * The browser's native print dialog handles PDF save.
   */
  function _printPDF(pageTitle, dateStr, bodyHTML) {
    const css = `
      body { font-family: 'DM Sans', system-ui, sans-serif; color: #1a1714;
             margin: 2cm; font-size: 11pt; }
      h1   { font-size: 14pt; margin-bottom: 4px; }
      p    { font-size: 9pt; color: #64748b; margin-bottom: 16px; }
      table{ width: 100%; border-collapse: collapse; font-size: 9.5pt; }
      th   { background: #f1f5f9; text-align: left; padding: 6px 10px;
             border-bottom: 2px solid #cbd5e1; font-weight: 600; }
      td   { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
      tr:last-child td { border-bottom: none; }
      small { font-size: 8pt; }
      @media print {
        @page { margin: 1.5cm; }
        body  { margin: 0; }
      }`;
    const win = window.open('', '_blank');
    if (!win) { UI.showToast('Allow pop-ups to generate PDF', 'error'); return; }
    win.document.write(`<!DOCTYPE html><html>
      <head><meta charset="UTF-8"><title>${pageTitle}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
      <style>${css}</style></head>
      <body>${bodyHTML}</body></html>`);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  // ─── P3: Timetable ──────────────────────────────────────────────────────────

  /**
   * Cal-2: Opens the calendar view for the active batch.
   * Runs the one-time schema migration first, then renders the calendar.
   */
  function openTimetable(batchId) {
    state.view          = 'timetable';
    state.activeBatchId = batchId;
    Charts.destroyAll();

    // Cal-1: run migration once (safe to call every time — skips if already done)
    Storage.migrateCalendarSchema(batchId);

    const batch  = Storage.getBatch(batchId);
    if (!batch) return;
    UI.renderSidebar(Storage.getMyBatches(), batchId);
    UI.renderCalendar(batch, state.calViewMode, state.calDate);
  }

  // ─── Cal-2: Calendar helpers ────────────────────────────────────────────────

  /**
   * Shifts calDate by ±1 unit depending on viewMode.
   * day → ±1 day  |  week → ±7 days  |  month → ±1 month  |  year → ±1 year
   * agenda → ±14 days (moves the window forward/back)
   */
  function _calShift(iso, viewMode, dir) {
    const d = new Date(iso + 'T12:00:00');
    switch (viewMode) {
      case 'day':    d.setDate(d.getDate() + dir);          break;
      case 'week':   d.setDate(d.getDate() + dir * 7);      break;
      case 'month':  d.setMonth(d.getMonth() + dir);        break;
      case 'year':   d.setFullYear(d.getFullYear() + dir);  break;
      case 'agenda': d.setDate(d.getDate() + dir * 14);     break;
    }
    return d.toISOString().split('T')[0];
  }

  /**
   * Opens the calendar event creation / edit modal.
   * eventId = null → new event  |  eventId = 'cal_xxx' → edit existing
   * prefillDate + prefillDow are used only when creating a new event.
   */
  function openCalendarEventModal(batchId, eventId, prefillDate, prefillDow) {
    const batch    = Storage.getBatch(batchId);
    if (!batch) return;
    const existing = eventId
      ? Storage.getCalendarEvents(batchId).find(e => e.id === eventId)
      : null;
    const modal = UI.showCalendarEventModal(batch, existing, prefillDate, prefillDow);

    /** Read a 12h time picker (3 selects) and return 24h "HH:MM" string. */
    function _readTimePicker(prefix) {
      const h    = parseInt(document.getElementById(`${prefix}-h`)?.value    || '12', 10);
      const m    = document.getElementById(`${prefix}-m`)?.value             || '00';
      const ampm = document.getElementById(`${prefix}-ampm`)?.value          || 'AM';
      let h24 = h % 12;           // 12 AM → 0, 12 PM → 12 handled below
      if (ampm === 'PM') h24 += 12;
      return `${String(h24).padStart(2,'0')}:${m}`;
    }

    document.getElementById('cal-modal-confirm')?.addEventListener('click', () => {
      const title = document.getElementById('cal-f-title')?.value.trim();
      if (!title) { UI.showToast('Title is required', 'error'); return; }

      const type  = document.querySelector('input[name="cal-type"]:checked')?.value || 'recurring';
      const color = document.querySelector('.cal-color-chip--selected')?.dataset.color || 'blue';

      const payload = {
        title,
        type,
        color,
        instructorId: document.getElementById('cal-f-instr')?.value || '',
        description:  document.getElementById('cal-f-desc')?.value.trim() || '',
      };

      if (type === 'recurring') {
        payload.dayOfWeek = parseInt(document.getElementById('cal-f-dow')?.value || '1', 10);
        payload.startTime = _readTimePicker('cal-f-start');
        payload.endTime   = _readTimePicker('cal-f-end');
      } else if (type === 'once') {
        payload.date      = document.getElementById('cal-f-date')?.value || '';
        payload.startTime = _readTimePicker('cal-f-start');
        payload.endTime   = _readTimePicker('cal-f-end');
        if (!payload.date) { UI.showToast('Date is required', 'error'); return; }
      } else {
        // allday
        payload.date = document.getElementById('cal-f-date')?.value || '';
        if (!payload.date) { UI.showToast('Date is required', 'error'); return; }
      }

      if (type !== 'allday') {
        if (payload.endTime <= payload.startTime) { UI.showToast('End time must be after start time', 'error'); return; }
      }

      if (existing) {
        Storage.updateCalendarEvent(batchId, existing.id, payload);
        UI.showToast(`"${title}" updated`, 'success');
      } else {
        Storage.addCalendarEvent(batchId, payload);
        UI.showToast(`"${title}" added`, 'success');
      }
      modal.remove();
      openTimetable(batchId);
    });

    // Close handlers
    modal.querySelector('#cal-modal-cancel')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#cal-modal-close')?.addEventListener('click',  () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Live duration preview
    const _refreshDur = () => {
      const s  = _readTimePicker('cal-f-start');
      const e  = _readTimePicker('cal-f-end');
      const el = document.getElementById('cal-dur-preview');
      if (!el) return;
      const [sh, sm] = s.split(':').map(Number);
      const [eh, em] = e.split(':').map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      el.textContent = mins > 0
        ? `Duration: ${Math.floor(mins/60) > 0 ? Math.floor(mins/60) + 'h ' : ''}${mins%60 > 0 ? mins%60 + 'm' : ''}`
        : '';
    };
    // Attach change listeners to all 6 picker selects
    ['cal-f-start-h','cal-f-start-m','cal-f-start-ampm',
     'cal-f-end-h',  'cal-f-end-m',  'cal-f-end-ampm'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', _refreshDur);
    });
    if (existing) _refreshDur();
  }

  // ── Calendar chip quick-action popup ──────────────────────────────────────

  /** Lazily creates and returns the singleton chip popup element.
   *  Action handling is done by the document-level listener in bindGlobalEvents —
   *  popup buttons bubble to document even though they are outside #main-content. */
  function _ensureCalChipPopup() {
    let popup = document.getElementById('cal-chip-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id        = 'cal-chip-popup';
      popup.className = 'cal-chip-popup';
      popup.setAttribute('role', 'menu');
      popup.innerHTML = `
        <button class="cal-chip-popup-btn" data-action="cal-chip-edit" data-eid="" data-bid="">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit event
        </button>
        <button class="cal-chip-popup-btn cal-chip-popup-btn--delete" data-action="cal-chip-delete" data-eid="" data-bid="">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
          Delete event
        </button>`;
      document.body.appendChild(popup);
    }
    return popup;
  }

  function _handleCalChipPopupKey(e) {
    if (e.key === 'Escape') _hideCalChipPopup();
  }

  /** Outside-click handler — ignores clicks that land inside the popup itself. */
  function _calChipOutsideClick(e) {
    const popup = document.getElementById('cal-chip-popup');
    if (popup && popup.contains(e.target)) return; // inside popup — let it reach the button
    _hideCalChipPopup();
  }

  /** Shows the chip popup near the click position with eid/batchId/date context. */
  function _showCalChipPopup(e, eid, batchId, occDate, origDate) {
    const popup = _ensureCalChipPopup();
    // Stamp eid, bid, date, orig-date on both action buttons
    popup.querySelectorAll('[data-action]').forEach(btn => {
      btn.dataset.eid      = eid;
      btn.dataset.bid      = batchId;
      btn.dataset.date     = occDate  || '';
      btn.dataset.origDate = origDate || occDate || '';
    });
    // Position near the click, nudged slightly so cursor doesn't overlap
    const PW = 160, PH = 90;
    let x = e.clientX + 6;
    let y = e.clientY + 6;
    if (x + PW > window.innerWidth  - 8) x = e.clientX - PW - 4;
    if (y + PH > window.innerHeight - 8) y = e.clientY - PH - 4;
    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';
    popup.classList.add('is-open');
    // Defer so the originating chip-click doesn't immediately trigger outside-close
    setTimeout(() => {
      document.addEventListener('click',   _calChipOutsideClick, { capture: true });
      document.addEventListener('keydown', _handleCalChipPopupKey);
    }, 0);
  }

  /** Hides the chip popup and cleans up its document listeners. */
  function _hideCalChipPopup() {
    const popup = document.getElementById('cal-chip-popup');
    if (popup) popup.classList.remove('is-open');
    document.removeEventListener('click',   _calChipOutsideClick, { capture: true });
    document.removeEventListener('keydown', _handleCalChipPopupKey);
  }

  /**
   * Confirm-delete a calendar event.
   * occDate   — the concrete date of the occurrence that was clicked (YYYY-MM-DD)
   * origDate  — the original date used as the exception key (equals occDate for non-moved occurrences)
   *
   * For one-off events (type !== 'recurring') or when no occDate is known:
   *   → simple confirm → delete entire event
   * For recurring events with a known occDate:
   *   → Google-Calendar–style 3-option modal
   */
  function _confirmDeleteCalendarEvent(batchId, eventId, occDate, origDate) {
    const ev = Storage.getCalendarEvents(batchId).find(e => e.id === eventId);
    if (!ev) return;

    // Non-recurring or no occurrence date known → simple full-delete confirm
    if (ev.type !== 'recurring' || !occDate) {
      UI.showConfirm(`Remove "${ev.title}"?`, () => {
        Storage.deleteCalendarEvent(batchId, eventId);
        openTimetable(batchId);
        UI.showToast('Event removed.', 'info');
      });
      return;
    }

    // Recurring + known occurrence date → 3-option modal
    UI.showDeleteRecurringModal(ev.title, scope => {
      if (scope === 'one') {
        // Cancel just this occurrence via exception (newDate:null = cancelled)
        Storage.addEventException(batchId, eventId, {
          originalDate: origDate || occDate,
          newDate:      null
        });
        UI.showToast('Occurrence removed.', 'info');

      } else if (scope === 'future') {
        // Stop series from this date onwards (endDate = this occurrence's date)
        Storage.setCalendarEventEndDate(batchId, eventId, occDate);
        UI.showToast('This and future occurrences removed.', 'info');

      } else {
        // Delete entire series
        Storage.deleteCalendarEvent(batchId, eventId);
        UI.showToast('Recurring event deleted.', 'info');
      }
      openTimetable(batchId);
    });
  }

  /** Opens the "Add Class" modal, optionally pre-selecting a day of week. */
  function openAddClassModal(batchId, prefillDow) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    const modal = UI.showTimetableClassModal(batch, null, prefillDow);

    // Live duration preview
    function _refreshDur() {
      const s = document.getElementById('f-tt-start')?.value;
      const e = document.getElementById('f-tt-end')?.value;
      const el = document.getElementById('tt-dur-preview');
      if (!el) return;
      if (s && e) {
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        el.textContent = mins > 0 ? `Duration: ${Math.floor(mins/60) > 0 ? Math.floor(mins/60) + 'h ' : ''}${mins%60 > 0 ? mins%60 + 'm' : ''}` : '';
      } else { el.textContent = ''; }
    }
    document.getElementById('f-tt-start')?.addEventListener('change', _refreshDur);
    document.getElementById('f-tt-end')?.addEventListener('change',   _refreshDur);

    document.getElementById('modal-confirm').addEventListener('click', () => {
      const subject = document.getElementById('f-tt-subject').value.trim();
      if (!subject) { UI.showToast('Subject is required', 'error'); return; }
      const startTime = document.getElementById('f-tt-start').value;
      const endTime   = document.getElementById('f-tt-end').value;
      if (!startTime) { UI.showToast('Start time is required', 'error'); return; }
      if (!endTime)   { UI.showToast('End time is required', 'error'); return; }
      if (endTime <= startTime) { UI.showToast('End time must be after start time', 'error'); return; }

      Storage.addTimetableEntry(batchId, {
        dayOfWeek:    parseInt(document.getElementById('f-tt-dow').value, 10),
        subject,
        instructorId: document.getElementById('f-tt-instr').value,
        startTime,
        endTime,
        recurring:    document.getElementById('f-tt-recurring').checked
      });
      modal.remove();
      openTimetable(batchId);
      UI.showToast(`Class "${subject}" added!`, 'success');
    });
    bindModalClose(modal);
  }

  /** Opens the "Edit Class" modal for an existing timetable entry. */
  function openEditClassModal(batchId, entryId) {
    const batch   = Storage.getBatch(batchId);
    if (!batch) return;
    const existing = (batch.timetable || []).find(e => e.id === entryId);
    if (!existing) return;
    const modal = UI.showTimetableClassModal(batch, existing, null);

    function _refreshDur() {
      const s = document.getElementById('f-tt-start')?.value;
      const e = document.getElementById('f-tt-end')?.value;
      const el = document.getElementById('tt-dur-preview');
      if (!el) return;
      if (s && e) {
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        el.textContent = mins > 0 ? `Duration: ${Math.floor(mins/60) > 0 ? Math.floor(mins/60) + 'h ' : ''}${mins%60 > 0 ? mins%60 + 'm' : ''}` : '';
      } else { el.textContent = ''; }
    }
    // Show duration immediately for existing entry
    _refreshDur();
    document.getElementById('f-tt-start')?.addEventListener('change', _refreshDur);
    document.getElementById('f-tt-end')?.addEventListener('change',   _refreshDur);

    document.getElementById('modal-confirm').addEventListener('click', () => {
      const subject = document.getElementById('f-tt-subject').value.trim();
      if (!subject) { UI.showToast('Subject is required', 'error'); return; }
      const startTime = document.getElementById('f-tt-start').value;
      const endTime   = document.getElementById('f-tt-end').value;
      if (!startTime) { UI.showToast('Start time is required', 'error'); return; }
      if (!endTime)   { UI.showToast('End time is required', 'error'); return; }
      if (endTime <= startTime) { UI.showToast('End time must be after start time', 'error'); return; }

      Storage.updateTimetableEntry(batchId, entryId, {
        dayOfWeek:    parseInt(document.getElementById('f-tt-dow').value, 10),
        subject,
        instructorId: document.getElementById('f-tt-instr').value,
        startTime,
        endTime,
        recurring:    document.getElementById('f-tt-recurring').checked
      });
      modal.remove();
      openTimetable(batchId);
      UI.showToast(`Class "${subject}" updated!`, 'success');
    });
    bindModalClose(modal);
  }

  /** Confirms and deletes a timetable entry. */
  function confirmDeleteTimetableEntry(batchId, entryId) {
    const batch   = Storage.getBatch(batchId);
    const entry   = batch ? (batch.timetable || []).find(e => e.id === entryId) : null;
    const subject = entry ? entry.subject : 'this class';
    UI.showConfirm(`Remove "${subject}" from the timetable?`, () => {
      Storage.deleteTimetableEntry(batchId, entryId);
      openTimetable(batchId);
      UI.showToast('Class removed.', 'info');
    });
  }

  // ─── P2: Instructor Management ──────────────────────────────────────────────

  function openManageInstructorsModal(batchId) {
    UI.showManageInstructorsModal(batchId, () => {
      // On modal close: re-render batch dashboard so instructor panel reflects changes
      const batch = Storage.getBatch(batchId);
      if (batch) { UI.renderBatchDashboard(batch); bindDashboardEvents(); }
    });
  }

  // ─── Batch Modals ────────────────────────────────────────────────────────────

  function openCreateBatchModal() {
    const modal = UI.showBatchModal();
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const name = document.getElementById('f-batch-name').value.trim();
      if (!name) { UI.showToast('Batch name is required', 'error'); return; }

      // Batch code is mandatory — sidebar and reports use it as the primary identifier
      const batchCodeVal = document.getElementById('f-batch-code').value.trim();
      if (!batchCodeVal) { UI.showToast('Batch code is required', 'error'); return; }

      // P1: validate new fields
      const startDate = document.getElementById('f-batch-start').value;
      const endDate   = document.getElementById('f-batch-end').value;
      if (startDate && endDate && endDate < startDate) {
        UI.showToast('End date cannot be earlier than start date', 'error'); return;
      }
      const capacityRaw = document.getElementById('f-batch-capacity').value;
      const capacity    = parseInt(capacityRaw, 10);
      if (capacityRaw !== '' && (isNaN(capacity) || capacity < 0)) {
        UI.showToast('Capacity must be a non-negative number', 'error'); return;
      }

      const batch = Storage.createBatch(
        name,
        document.getElementById('f-batch-desc').value.trim(),
        {
          batchCode: document.getElementById('f-batch-code').value.trim(),
          startDate,
          endDate,
          capacity:  isNaN(capacity) ? 0 : capacity,
          status:    document.getElementById('f-batch-status').value
        }
      );

      // Import students pre-loaded via the Excel picker
      const pendingStudents = window._pendingBatchStudents || [];
      pendingStudents.forEach(s => Storage.createStudent(batch.id, s));
      window._pendingBatchStudents = null;

      // Attach course plan if pre-loaded from course plan Excel
      const pendingPlan = window._pendingCoursePlan || null;
      if (pendingPlan && pendingPlan.length > 0) Storage.updateBatch(batch.id, { coursePlan: pendingPlan });
      window._pendingCoursePlan = null;

      modal.remove();
      UI.renderSidebar(Storage.getMyBatches(), batch.id);
      selectBatch(batch.id);
      const parts = [];
      if (pendingStudents.length > 0) parts.push(`${pendingStudents.length} student${pendingStudents.length !== 1 ? 's' : ''}`);
      if (pendingPlan && pendingPlan.length > 0) parts.push(`${pendingPlan.length} sessions plan`);
      UI.showToast(`Batch "${name}" created${parts.length ? ' with ' + parts.join(' & ') : ''}!`, 'success');
    });
    bindModalClose(modal, () => { window._pendingBatchStudents = null; window._pendingCoursePlan = null; });
  }

  function openEditBatchModal(batchId) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    const modal = UI.showBatchModal(batch);
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const name = document.getElementById('f-batch-name').value.trim();
      if (!name) { UI.showToast('Name is required', 'error'); return; }

      // P1: validate new fields
      const startDate = document.getElementById('f-batch-start').value;
      const endDate   = document.getElementById('f-batch-end').value;
      if (startDate && endDate && endDate < startDate) {
        UI.showToast('End date cannot be earlier than start date', 'error'); return;
      }
      const capacityRaw = document.getElementById('f-batch-capacity').value;
      const capacity    = parseInt(capacityRaw, 10);
      if (capacityRaw !== '' && (isNaN(capacity) || capacity < 0)) {
        UI.showToast('Capacity must be a non-negative number', 'error'); return;
      }

      Storage.updateBatch(batchId, {
        name,
        description: document.getElementById('f-batch-desc').value.trim(),
        batchCode:   document.getElementById('f-batch-code').value.trim(),
        startDate,
        endDate,
        capacity:    isNaN(capacity) ? 0 : capacity,
        status:      document.getElementById('f-batch-status').value
      });
      modal.remove();
      UI.renderSidebar(Storage.getMyBatches(), batchId);
      selectBatch(batchId);
      UI.showToast('Batch updated!', 'success');
    });
    const footer = modal.querySelector('.modal-footer');
    // AD1: only the batch owner can delete — assigned trainers get read/edit access only
    const _currentUser = Storage.getCurrentUser();
    const _isOwner     = _currentUser && (batch.ownerId === _currentUser.id || !batch.ownerId);
    if (_isOwner || _currentUser?.role === 'admin') {
      const delBtn = document.createElement('button');
      delBtn.className   = 'btn btn-danger';
      delBtn.textContent = 'Delete Batch';
      delBtn.style.marginRight = 'auto';
      footer.prepend(delBtn);
      delBtn.addEventListener('click', () => {
        modal.remove();
        UI.showConfirm(`Delete batch "${batch.name}" and ALL its students?`, () => {
          Storage.deleteBatch(batchId);
          state.activeBatchId = null;
          UI.renderSidebar(Storage.getMyBatches(), null);
          loadInitialView();
          UI.showToast('Batch deleted.', 'error');
        });
      });
    }
    bindModalClose(modal);
  }

  // ─── Student Modals ──────────────────────────────────────────────────────────

  function openBulkImportModal(batchId, parsedRows = null) {
    UI.showBulkImportModal(parsedRows || [], ({ action, file, rows }) => {
      if (action === 'parse') {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
            const stripTags = s => s.replace(/<[^>]*>/g, '').trim();
            const parsed = raw.map(r => ({
              name:      stripTags((r['Full Name'] || r['Name']  || r['name']  || r['NAME']  || r['FULL NAME'] || '').toString()),
              email:     stripTags((r['E-mail ID'] || r['Email ID'] || r['Email'] || r['email'] || r['EMAIL'] || r['E-Mail'] || r['E-MAIL ID'] || '').toString()),
              phone:     stripTags((r['Phone'] || r['phone'] || r['PHONE'] || r['Mobile'] || r['mobile'] || r['Contact'] || '').toString()),
              studentId: stripTags((r['Enrollment Number'] || r['Enrollment No'] || r['Student ID'] || r['ID'] || r['Enroll No'] || r['EnrollmentNumber'] || r['enrollment_number'] || '').toString()),
            })).filter(r => r.name);

            if (parsed.length === 0) {
              UI.showToast('No valid rows found. Make sure the sheet has a "Name" or "Full Name" column.', 'error');
              openBulkImportModal(batchId);
              return;
            }
            openBulkImportModal(batchId, parsed);
          } catch {
            UI.showToast('Could not read the file. Make sure it is a valid .xlsx file.', 'error');
            openBulkImportModal(batchId);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (action === 'import') {
        const batch = Storage.getBatch(batchId);
        const remaining = batch && batch.capacity > 0
          ? batch.capacity - batch.students.length
          : Infinity;
        const toAdd = remaining === Infinity ? rows : rows.slice(0, remaining);
        const skipped = rows.length - toAdd.length;

        toAdd.forEach(r => Storage.createStudent(batchId, r));
        selectBatch(batchId);

        const msg = skipped > 0
          ? `Imported ${toAdd.length} students (${skipped} skipped — batch capacity reached).`
          : `Imported ${toAdd.length} student${toAdd.length !== 1 ? 's' : ''} successfully!`;
        UI.showToast(msg, skipped > 0 ? 'info' : 'success');
      }
    });
  }

  function openAddStudentModal(batchId) {
    // P1-3: Capacity check before opening the modal
    const batch = Storage.getBatch(batchId);
    if (batch && batch.capacity > 0 && batch.students.length >= batch.capacity) {
      UI.showToast(`Batch capacity reached (${batch.capacity} students)`, 'error');
      return;
    }
    const modal = UI.showStudentModal();
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const name = document.getElementById('f-stu-name').value.trim();
      if (!name) { UI.showToast('Name is required', 'error'); return; }
      const customId = (document.getElementById('f-stu-id')?.value || '').trim();
      Storage.createStudent(batchId, {
        name,
        email:     document.getElementById('f-stu-email').value.trim(),
        phone:     document.getElementById('f-stu-phone').value.trim(),
        studentId: customId
      });
      modal.remove();
      UI.showToast(`Student "${name}" added!`, 'success');
      if (state.view === 'manage-batch') openManageBatch(batchId, 'students');
      else selectBatch(batchId);
    });
    bindModalClose(modal);
  }

  function openEditStudentModal(batchId, studentId) {
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const modal = UI.showStudentModal(student);
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const name = document.getElementById('f-stu-name').value.trim();
      if (!name) { UI.showToast('Name is required', 'error'); return; }
      const newDisplayId = (document.getElementById('f-stu-id')?.value || '').trim();
      const student0 = Storage.getStudent(batchId, studentId);
      Storage.updateStudent(batchId, studentId, {
        name,
        email:     document.getElementById('f-stu-email').value.trim(),
        phone:     document.getElementById('f-stu-phone').value.trim(),
        studentId: newDisplayId || (student0 && student0.studentId) || ''
      });
      modal.remove();
      UI.showToast('Student updated!', 'success');
      if (state.view === 'profile')       openStudentProfile(batchId, studentId);
      else if (state.view === 'manage-batch') openManageBatch(batchId, 'students');
      else selectBatch(batchId);
    });
    bindModalClose(modal);
  }

  function confirmDeleteStudent(batchId, studentId) {
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    UI.showConfirm(`Deleting "${student.name}" will permanently remove all their records including attendance, test scores, mock interviews and evaluations. This cannot be undone.`, () => {
      Storage.deleteStudent(batchId, studentId);
      UI.showToast('Student removed.', 'error');
      if (state.view === 'manage-batch') openManageBatch(batchId, 'students');
      else selectBatch(batchId);
    });
  }

  function openAddHolidayModal(batchId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Add Holiday</h2>
          <button class="modal-close" id="modal-close">${UI.getIcon('close')}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Date <span class="form-required">*</span></label>
            <input type="date" id="hol-date" class="form-input">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="hol-desc" class="form-input" placeholder="e.g. National Holiday">
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm">Add Holiday</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('hol-date').focus();
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const date = document.getElementById('hol-date').value;
      if (!date) { UI.showToast('Please pick a date.', 'error'); return; }
      const desc = document.getElementById('hol-desc').value.trim();
      Storage.addHoliday(batchId, date, desc || 'Holiday');
      modal.remove();
      UI.showToast('Holiday added!', 'success');
      openManageBatch(batchId, 'holidays');
    });
    bindModalClose(modal);
  }

  function _removeHoliday(batchId, index) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    const holiday = (batch.holidays || [])[index];
    if (!holiday) return;
    UI.showConfirm(`Remove holiday on ${holiday.date}?`, () => {
      Storage.removeHoliday(batchId, holiday.date);
      UI.showToast('Holiday removed.', 'success');
      openManageBatch(batchId, 'holidays');
    });
  }

  // ─── P1-7: Transfer Student (admin-only) ─────────────────────────────────

  function openTransferStudentModal(fromBatchId, studentId) {
    const user = Storage.getCurrentUser();
    if (!user || user.role !== 'admin') { UI.showToast('Only admins can transfer students.', 'error'); return; }

    const student = Storage.getStudent(fromBatchId, studentId);
    if (!student) return;

    // Build list of all non-archived batches except the current one
    const allBatches   = Storage.getBatches().filter(b => !b.archived);
    const targetBatches = allBatches.filter(b => b.id !== fromBatchId);

    UI.showTransferModal(student, fromBatchId, targetBatches, (targetBatchId) => {
      const targetBatch = Storage.getBatch(targetBatchId);
      const targetName  = targetBatch ? targetBatch.name : targetBatchId;

      UI.showConfirm(
        `Transfer "${student.name}" to batch "${targetName}"? The student's full record will be preserved.`,
        () => {
          const result = Storage.transferStudent(fromBatchId, studentId, targetBatchId);
          if (!result.ok) { UI.showToast(result.error, 'error'); return; }

          // Re-render sidebar so both batches update their student counts
          UI.renderSidebar(Storage.getMyBatches(), fromBatchId);
          selectBatch(fromBatchId);
          UI.showToast(`"${student.name}" transferred to "${targetName}".`, 'success');
        }
      );
    });
  }

  // ─── Quick Class Mode — v5 ────────────────────────────────────────────────
  // Changes: future-date block, 3-state status, remark, call-log gate.

  function openQuickClass(batchId) {
    state.view = 'quickClass';
    Charts.destroyAll();
    const batch = Storage.getBatch(batchId);
    if (!batch) return;
    const sessionState = UI.renderQuickClass(batch);

    document.getElementById('btn-save-session').addEventListener('click', () => {
      const today = _todayStr();
      const date  = document.getElementById('session-date').value;
      if (!date) { UI.showToast('Please select a date.', 'error'); return; }

      // Block future dates
      if (date > today) {
        UI.showToast('Attendance cannot be marked for future dates.', 'error'); return;
      }

      // Block Sunday
      const d = new Date(date + 'T12:00:00');
      if (d.getDay() === 0) {
        UI.showToast('Sunday is a Week Off — attendance cannot be marked.', 'error'); return;
      }

      // Block holidays
      const holiday = (batch.holidays || []).find(h => h.date === date);
      if (holiday) {
        UI.showToast(`This date is a holiday: "${holiday.reason}" — attendance cannot be marked.`, 'error'); return;
      }

      // Phase 1-B: Identify students who joined AFTER this date — exclude from save and blank check
      const _batchStudents = Storage.getBatch(batchId)?.students || [];
      const _newStudentIds = new Set(
        _batchStudents
          .filter(s => { const cd = (s.createdAt || '').split('T')[0]; return cd && cd > date; })
          .map(s => s.id)
      );

      // Phase 1-A: Block save if any applicable student has blank status
      const _blankStudents = Object.entries(sessionState)
        .filter(([sid, s]) => s.status === '' && !_newStudentIds.has(sid))
        .map(([sid]) => _batchStudents.find(s => s.id === sid))
        .filter(Boolean);
      if (_blankStudents.length) {
        const names = _blankStudents.map(s => s.name).join(', ');
        UI.showToast(`Please select a status for: ${names}`, 'error');
        _blankStudents.forEach(s => {
          const card = document.getElementById(`qc-${s.id}`);
          if (card) card.style.outline = '2px solid var(--bad)';
        });
        return;
      }
      // Clear any blank highlights from a previous failed attempt
      Object.keys(sessionState).forEach(sid => {
        const card = document.getElementById(`qc-${sid}`);
        if (card) card.style.outline = '';
      });

      // AD1: record who saved this session (lightweight audit trail)
      const _savedByUser = Storage.getCurrentUser();
      // Fix: saveSession() returns undefined if batchIdx === -1 (batch removed mid-session).
      // Destructuring undefined throws TypeError — guard with a safe fallback.
      const { presentIds, completedConflicts } = Storage.saveSession(batchId, {
        date,
        lastSavedBy:    _savedByUser ? (_savedByUser.fullName || _savedByUser.username) : null,
        lastSavedAt:    new Date().toISOString(),
        studentUpdates: Object.entries(sessionState)
          .filter(([sid, s]) => s.status !== '')   // save any student with an explicit status, new or old
          .map(([sid, s]) => ({
            studentId: sid,
            status:    s.status
          }))
      }) || { presentIds: [], completedConflicts: [] };

      // v6: Auto-assign presenters for today's session (only when saving today's attendance)
      const _n = new Date();
      const _todayISO = `${_n.getFullYear()}-` +
        `${String(_n.getMonth() + 1).padStart(2, '0')}-` +
        `${String(_n.getDate()).padStart(2, '0')}`;
      if (date === _todayISO) {
        // Skip assignment if trainer marked today as a no-presentation day
        const _skip = Storage.getPresentationSkip(batchId, date);
        if (!_skip) {
          // Use ALL present students for today (early + late) so late arrivals
          // can replace lower-priority pending slots if they rank higher
          const _allPresent = Storage.getPresentIdsForDate(batchId, date);
          if (_allPresent.length) {
            const students = Storage.getBatch(batchId)?.students || [];
            const chosen   = Calc.getNextPresenters(students, _allPresent, date, 3);
            if (chosen.length) {
              Storage.assignDailyPresentations(batchId, date, chosen.map(s => s.id));
            }
          }
        }
      }

      // Auto-create Call Connect tasks — no toasts, returns count of new tasks
      const _newTasks = _autoCreateCallConnectTasks(batchId, sessionState, date);
      // Phase 4: warn if any absent student had a completed evaluation on this date
      if (completedConflicts?.length) {
        completedConflicts.forEach(c => {
          UI.showToast(`⚠ ${c.studentName} has a completed evaluation on ${c.date} — please review.`, 'warning');
        });
      }
      // Stay on Quick Class — re-render with fresh data and restore the same date
      const _savedDate = date;
      openQuickClass(batchId);
      // Re-render sidebar so the Reminders badge count updates immediately
      if (_newTasks > 0) {
        UI.renderSidebar(Storage.getMyBatches(), batchId);
      }
      // Single clean confirmation — badge on sidebar handles task notification
      UI.showToast('Attendance saved.', 'success');
      const _dateInp = document.getElementById('session-date');
      if (_dateInp) {
        _dateInp.value = _savedDate;
        _dateInp.dispatchEvent(new Event('change'));
      }
    });

    document.getElementById('btn-cancel-quick').addEventListener('click', () => selectBatch(batchId));
  }

  /**
   * After a session is saved, check every absent student for a consecutive-absence
   * streak that is a multiple of 3. If found, auto-create a "Call Connect" task.
   * Returns the number of NEW tasks created (duplicates skipped by addTask).
   */
  function _autoCreateCallConnectTasks(batchId, sessionState, date) {
    const batch = Storage.getBatch(batchId);
    if (!batch) return 0;
    let created = 0;

    Object.entries(sessionState).forEach(([sid, s]) => {
      if (s.status !== 'absent') return;
      const student = Storage.getStudent(batchId, sid);
      if (!student) return;

      const sessions = (student.sessions || [])
        .filter(r => r.date <= date)
        .sort((a, b) => b.date.localeCompare(a.date));

      let streak = 0;
      for (const r of sessions) {
        const st = r.status || (r.present ? 'present' : 'absent');
        if (st === 'absent' || st === 'late') streak++;
        else break;
      }

      if (streak === 0 || streak % 3 !== 0) return;

      const result = Storage.addTask({
        batchId,
        studentId:   student.id,
        studentName: student.name,
        batchName:   batch.name || batch.batchCode || batchId,
        type:        'Call Connect',
        triggerDate: date,
        streak
      });
      // addTask returns { id, isNew } — only count genuinely new tasks
      if (result.isNew) created++;
    });

    return created;
  }

  // ─── Deep Update Modal ───────────────────────────────────────────────────────

  // ─── CHANGE 6: Exam Save — new module+param structure ────────────────────────

  function _handleExamSave(btn) {
    const moduleNum  = parseInt(btn.dataset.module);
    const paramName  = btn.dataset.param;
    const batchId    = state.activeBatchId;
    const studentId  = state.activeStudentId;
    if (!batchId || !studentId) return;

    const chk = document.querySelector(
      `.exam-appeared-chk[data-module="${moduleNum}"][data-param="${paramName}"]`);
    const inp = document.querySelector(
      `.exam-marks-inp[data-module="${moduleNum}"][data-param="${paramName}"]`);
    if (!chk || !inp) return;

    const appeared = chk.checked;
    const marks    = appeared ? parseFloat(inp.value) : null;
    const paramCfg = Calc.EXAM_PARAMETERS.find(p => p.name === paramName);

    if (appeared && (isNaN(marks) || marks < 0)) {
      UI.showToast(`Enter valid marks for ${paramName}`, 'error'); return;
    }
    if (appeared && paramCfg && marks > paramCfg.maxMarks) {
      UI.showToast(`Marks cannot exceed ${paramCfg.maxMarks} for ${paramName}`, 'error'); return;
    }

    // Load current exams, update the specific module/param
    const student = Storage.getStudent(batchId, studentId);
    let exams = (student.exams || []).filter(e => e.moduleNum !== undefined);
    // Detect and clear old flat format
    if (exams.length > 0 && exams[0].module !== undefined) exams = [];

    let modRec = exams.find(e => e.moduleNum === moduleNum);
    if (!modRec) {
      modRec = { moduleNum, parameters: {} };
      exams.push(modRec);
    }
    modRec.parameters[paramName] = { appeared, marks: appeared ? marks : null };

    Storage.updateStudent(batchId, studentId, { exams });

    // Update the row in-place (status cell)
    const cleared = appeared && marks !== null && paramCfg && marks >= paramCfg.minMarks;
    const tr = btn.closest('tr');
    if (tr) {
      tr.className = appeared && cleared ? 'exam-cleared' : appeared && !cleared ? 'exam-failed' : '';
      const statusCell = tr.cells[5];
      if (statusCell) {
        statusCell.innerHTML = appeared
          ? (marks !== null
              ? `<span class="exam-status-badge ${cleared ? 'esb-cleared':'esb-failed'}">${cleared ? '✓ Cleared':'✗ Failed'}</span>`
              : `<span class="exam-status-badge esb-pending">— Pending</span>`)
          : `<span class="exam-status-badge esb-na">Not Appeared</span>`;
      }
    }

    // Update the module status banner without full re-render
    const freshStudent = Storage.getStudent(batchId, studentId);
    const modStats     = Calc.moduleStats(freshStudent).find(m => m.moduleNum === moduleNum);
    const banner       = document.querySelector(`#mod-panel-${moduleNum} .mod-status-banner`);
    if (banner && modStats) {
      banner.className = `mod-status-banner mod-status--${!modStats.appeared ? 'na' : modStats.cleared ? 'cleared' : 'failed'}`;
      banner.textContent = !modStats.appeared
        ? '— No parameters recorded for this module yet'
        : modStats.cleared
          ? `✓ Module ${moduleNum} Cleared (${modStats.clearedCount}/${modStats.appearedCount} parameters passed)`
          : `✗ Module ${moduleNum} Not Cleared — ${modStats.clearedCount}/${modStats.appearedCount} parameters passed`;
      // Update module tab badge
      const tabBtn = document.querySelector(`.mod-tab[data-mod="${moduleNum}"]`);
      if (tabBtn) {
        const badge = modStats.appeared
          ? (modStats.cleared ? `<span class="mod-badge mod-badge--cleared">✓</span>` : `<span class="mod-badge mod-badge--failed">✗</span>`)
          : '';
        tabBtn.innerHTML = `Module ${moduleNum} ${badge}`;
        tabBtn.classList.add('active'); // keep it active
      }
    }

    UI.showToast(`${paramName} (Module ${moduleNum}) saved!`, 'success');
  }

  // ─── CHANGE 5: Mock Interview Save ──────────────────────────────────────────

  function _handleMockInterviewSave(batchId, studentId) {
    const date    = document.getElementById('mock-date')?.value;
    const absent  = document.getElementById('mock-attendance-select')?.value === 'absent';

    if (!date) { UI.showToast('Select an interview date', 'error'); return; }

    const qAnswered    = document.getElementById('mock-q-answered')?.value.trim()    || '';
    const qNotAnswered = document.getElementById('mock-q-not-answered')?.value.trim() || '';

    const PARAMS = UI.getMockParamsConfig();
    const scores = {};
    let sum = 0;

    if (absent) {
      PARAMS.forEach(p => { scores[p.key] = { value: 0, remark: '' }; });
      sum = 0;
    } else {
      PARAMS.forEach(p => {
        const val = Math.min(10, Math.max(0, parseFloat(
          document.querySelector(`.mock-score-inp[data-param="${p.key}"]`)?.value) || 0));
        const rem = document.querySelector(`.mock-remark-inp[data-param="${p.key}"]`)?.value.trim() || '';
        scores[p.key] = { value: val, remark: rem };
        sum += val;
      });
    }

    const totalScore = parseFloat((sum / PARAMS.length).toFixed(2));
    const cleared    = !absent && totalScore >= 5;

    const entry = {
      id: 'mi_' + Date.now(),
      date, absent, questionsAnswered: qAnswered, questionsNotAnswered: qNotAnswered,
      scores, totalScore, cleared
    };

    const student = Storage.getStudent(batchId, studentId);
    if (!student) { UI.showToast('Student not found', 'error'); return; }

    Storage.updateStudent(batchId, studentId, {
      mockInterviews: [...(student.mockInterviews || []), entry]
    });

    UI.showToast('Mock interview saved!', 'success');

    // Phase 5: Soft warning if mock interview attendance differs from Quick Class for this date
    const _qcSession = (student.sessions || []).find(s => s.date === date);
    if (_qcSession) {
      const _qcStatus = _qcSession.status || (_qcSession.present ? 'present' : 'absent');
      const _qcAbsent = _qcStatus === 'absent';
      if (_qcAbsent && !absent) {
        UI.showToast(`Note: ${student.name} was marked absent in Quick Class on this date — mock interview recorded as present.`, 'warning');
      } else if (!_qcAbsent && absent) {
        UI.showToast(`Note: ${student.name} was marked present in Quick Class on this date — mock interview recorded as absent.`, 'warning');
      }
    }

    // Re-render the mock interview tab
    const fresh     = Storage.getStudent(batchId, studentId);
    const context   = { holidays: Storage.getBatch(batchId)?.holidays || [] };
    const m         = Calc.allMetrics(fresh, context);
    Charts.destroyAll();
    UI.renderProfileTab('mock-interview', fresh, m, batchId);
  }

  // ─── Mock Interview Delete ────────────────────────────────────────────────

  function _handleMockDelete(batchId, studentId, miId) {
    UI.showConfirm('Delete this mock interview record? This cannot be undone.', () => {
      const student = Storage.getStudent(batchId, studentId);
      if (!student) return;
      Storage.updateStudent(batchId, studentId, {
        mockInterviews: (student.mockInterviews || []).filter(m => m.id !== miId)
      });
      const fresh   = Storage.getStudent(batchId, studentId);
      const context = { holidays: Storage.getBatch(batchId)?.holidays || [] };
      const m       = Calc.allMetrics(fresh, context);
      Charts.destroyAll();
      UI.renderProfileTab('mock-interview', fresh, m, batchId);
      UI.showToast('Mock interview deleted.', 'error');
    });
  }

  // ─── Mock Interview Edit (date + Q&A notes only — scores are immutable) ──

  function _handleMockEdit(batchId, studentId, miId, fromHistory = false) {
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const mi = (student.mockInterviews || []).find(m => m.id === miId);
    if (!mi) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px">
        <div class="modal-header">
          <h2>Edit Mock Interview</h2>
          <button class="btn-icon" id="mock-edit-close">${UI.getIcon('close')}</button>
        </div>
        <div class="modal-body">
          <p class="tab-hint" style="margin-bottom:1rem">
            Scores are permanent and cannot be changed. You can update the date and Q&amp;A notes only.
          </p>
          <div class="form-group">
            <label>Interview Date</label>
            <input type="date" id="mock-edit-date" class="form-input" value="${mi.date}">
          </div>
          ${!mi.absent ? `
          <div class="form-group">
            <label>Questions Answered</label>
            <textarea id="mock-edit-q-answered" rows="3" class="form-input form-textarea">${mi.questionsAnswered || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Questions NOT Answered</label>
            <textarea id="mock-edit-q-not-answered" rows="3" class="form-input form-textarea">${mi.questionsNotAnswered || ''}</textarea>
          </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="mock-edit-cancel">Cancel</button>
          <button class="btn btn-primary" id="mock-edit-save">Save Changes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#mock-edit-close')?.addEventListener('click', close);
    overlay.querySelector('#mock-edit-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#mock-edit-save')?.addEventListener('click', () => {
      const newDate = overlay.querySelector('#mock-edit-date')?.value;
      if (!newDate) { UI.showToast('Please select a date.', 'error'); return; }

      const latest  = Storage.getStudent(batchId, studentId);
      const updated = (latest.mockInterviews || []).map(m => {
        if (m.id !== miId) return m;
        return {
          ...m,
          date: newDate,
          ...(!mi.absent ? {
            questionsAnswered:    overlay.querySelector('#mock-edit-q-answered')?.value.trim()     || '',
            questionsNotAnswered: overlay.querySelector('#mock-edit-q-not-answered')?.value.trim() || ''
          } : {})
        };
      });

      Storage.updateStudent(batchId, studentId, { mockInterviews: updated });
      close();
      if (fromHistory) {
        const batch = Storage.getBatch(batchId);
        if (batch) UI.renderMockHistory(batch);
      } else {
        const fresh   = Storage.getStudent(batchId, studentId);
        const context = { holidays: Storage.getBatch(batchId)?.holidays || [] };
        const m       = Calc.allMetrics(fresh, context);
        Charts.destroyAll();
        UI.renderProfileTab('mock-interview', fresh, m, batchId);
      }
      UI.showToast('Mock interview updated.', 'success');
    });
  }

  function _handleMockDeleteHist(batchId, studentId, miId) {
    UI.showConfirm('Delete this mock interview record? This cannot be undone.', () => {
      const student = Storage.getStudent(batchId, studentId);
      if (!student) return;
      Storage.updateStudent(batchId, studentId, {
        mockInterviews: (student.mockInterviews || []).filter(m => m.id !== miId)
      });
      const batch = Storage.getBatch(batchId);
      if (batch) UI.renderMockHistory(batch);
      UI.showToast('Mock interview deleted.', 'info');
    });
  }

  // ─── Phase 1: AI Mock History Handlers ──────────────────────────────────────

  function _handleAiMockSave(batchId, studentId) {
    const dateInp  = document.getElementById('ai-mock-date');
    const scoreInp = document.getElementById('ai-mock-score');
    const errEl    = document.getElementById('ai-mock-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    const date  = dateInp?.value;
    const score = parseFloat(scoreInp?.value);

    if (!date) {
      if (errEl) { errEl.textContent = 'Date is required.'; errEl.style.display = 'inline'; }
      return;
    }
    if (isNaN(score) || score < 0 || score > 10) {
      if (errEl) { errEl.textContent = 'Score must be 0–10.'; errEl.style.display = 'inline'; }
      return;
    }

    Storage.addAiMock(batchId, studentId, { date, score });
    _refreshProfileOnMockTab(batchId, studentId);
    UI.showToast('AI Mock score saved!', 'success');
  }

  function _handleAiMockEdit(batchId, studentId, entryId, fromHistory = false) {
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    const entry = (student.aiMockHistory || []).find(e => e.id === entryId);
    if (!entry) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2>Edit AI Mock Score</h2>
          <button class="btn-icon" id="ai-edit-close">${UI.getIcon('close')}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="ai-edit-date" class="form-input" value="${entry.date}">
          </div>
          <div class="form-group">
            <label>Score (0–10)</label>
            <input type="number" id="ai-edit-score" class="form-input"
              min="0" max="10" step="0.1" value="${entry.score}">
          </div>
          <p id="ai-edit-error" style="color:var(--bad);font-size:.82rem;display:none;min-height:1.2em"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="ai-edit-cancel">Cancel</button>
          <button class="btn btn-primary" id="ai-edit-save">Save Changes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close  = () => overlay.remove();
    const errEl  = overlay.querySelector('#ai-edit-error');
    overlay.querySelector('#ai-edit-close')?.addEventListener('click', close);
    overlay.querySelector('#ai-edit-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#ai-edit-save')?.addEventListener('click', () => {
      const newDate  = overlay.querySelector('#ai-edit-date')?.value;
      const newScore = parseFloat(overlay.querySelector('#ai-edit-score')?.value);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

      if (!newDate) {
        if (errEl) { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; }
        return;
      }
      if (isNaN(newScore) || newScore < 0 || newScore > 10) {
        if (errEl) { errEl.textContent = 'Score must be 0–10.'; errEl.style.display = 'block'; }
        return;
      }

      Storage.updateAiMock(batchId, studentId, entryId, { date: newDate, score: newScore });
      close();
      if (fromHistory) {
        const batch = Storage.getBatch(batchId);
        if (batch) UI.renderMockHistory(batch);
      } else {
        _refreshProfileOnMockTab(batchId, studentId);
      }
      UI.showToast('AI Mock score updated.', 'success');
    });
  }

  function _handleAiMockDelete(batchId, studentId, entryId) {
    UI.showConfirm('Delete this AI mock score? This cannot be undone.', () => {
      Storage.deleteAiMock(batchId, studentId, entryId);
      _refreshProfileOnMockTab(batchId, studentId);
      UI.showToast('AI Mock score deleted.', 'info');
    });
  }

  function _handleAiMockDeleteHist(batchId, studentId, entryId) {
    UI.showConfirm('Delete this AI mock score? This cannot be undone.', () => {
      Storage.deleteAiMock(batchId, studentId, entryId);
      const batch = Storage.getBatch(batchId);
      if (batch) UI.renderMockHistory(batch);
      UI.showToast('AI Mock score deleted.', 'info');
    });
  }

  // ─── Helper: full profile re-render staying on Mock Interview tab ─────────
  // Used by all three AI mock handlers so the banner updates immediately
  // while keeping the trainer in context (not kicked back to Overview tab).
  function _refreshProfileOnMockTab(batchId, studentId) {
    const fresh   = Storage.getStudent(batchId, studentId);
    const context = { holidays: Storage.getBatch(batchId)?.holidays || [] };
    const m       = Calc.allMetrics(fresh, context);
    Charts.destroyAll();
    UI.renderStudentProfile(fresh, batchId);          // re-renders banner + all tabs
    bindProfileEvents();
    UI.renderProfileTab('mock-interview', fresh, m, batchId); // switch back to mock tab
    // Re-apply active state on the mock-interview tab button
    document.querySelectorAll('.ptab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === 'mock-interview'));
  }

  // ─── STUDENT_PORTAL: Create Student Login Modal ───────────────────────────────

  function openCreateStudentLoginModal(batchId, studentId) {
    const user = Storage.getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
      UI.showToast('Only trainers and admins can create student logins.', 'error');
      return;
    }
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;

    // Check for existing login
    const existing = Storage.getStudentUser(studentId);
    if (existing) {
      UI.showToast(`Login already exists: @${existing.username}`, 'info');
      return;
    }

    UI.showCreateStudentLoginModal(student, (username, password, errEl) => {
      const result = Storage.createStudentUser(batchId, studentId, { username, password });
      if (!result.ok) {
        if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
        return;
      }
      // Flush immediately so the student can log in right away
      SupabaseSync.flushUsers(Storage.getAllUsers()).catch(() => {});
      UI.showToast(`Login "@${username}" created for ${student.name}!`, 'success');
      // Re-render profile so the "Create Login" button becomes "Login exists"
      const fresh = Storage.getStudent(batchId, studentId);
      if (fresh && state.view === 'profile') {
        Charts.destroyAll();
        UI.renderStudentProfile(fresh, batchId);
        bindProfileEvents();
      }
    });
  }

  // ─── Student Profile ─────────────────────────────────────────────────────────

  function openStudentProfile(batchId, studentId, tab = 'overview') {
    state.view            = 'profile';
    state.activeBatchId   = batchId;
    state.activeStudentId = studentId;
    Charts.destroyAll();
    const student = Storage.getStudent(batchId, studentId);
    if (!student) return;
    UI.renderStudentProfile(student, batchId);
    bindProfileEvents();
    if (tab !== 'overview') {
      document.querySelector(`.ptab[data-tab="${tab}"]`)?.click();
    }
  }

  function bindProfileEvents() {
    document.getElementById('btn-back-batch')?.addEventListener('click', e =>
      selectBatch(e.currentTarget.dataset.bid));

    // Login dropdown toggle
    const ddBtn  = document.getElementById('btn-login-dropdown');
    const ddMenu = document.getElementById('login-dropdown-menu');
    if (ddBtn && ddMenu) {
      ddBtn.addEventListener('click', e => {
        e.stopPropagation();
        ddMenu.classList.toggle('is-open');
      });
      // Close when clicking anywhere outside; self-removes once element leaves DOM
      document.addEventListener('click', function _closeLoginDD() {
        if (!document.contains(ddMenu)) { document.removeEventListener('click', _closeLoginDD); return; }
        ddMenu.classList.remove('is-open');
      });
    }
  }

  // ─── Modal Utility ───────────────────────────────────────────────────────────

  function bindModalClose(modal, onClose) {
    const close = () => { modal.remove(); if (onClose) onClose(); };
    modal.querySelector('#modal-close')?.addEventListener('click', close);
    modal.querySelector('#modal-cancel')?.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  // ─── Presentation Schedule — v6 (attendance-driven) ─────────────────────

  function openPresentationSchedule(batchId, forceYear, forceMonth) {
    state.view = 'presSchedule';
    Charts.destroyAll();
    const batch = Storage.getBatch(batchId);
    if (!batch) return;

    const n        = new Date();
    const todayISO = `${n.getFullYear()}-` +
      `${String(n.getMonth() + 1).padStart(2, '0')}-` +
      `${String(n.getDate()).padStart(2, '0')}`;
    const year  = forceYear  !== undefined ? forceYear  : n.getFullYear();
    const month = forceMonth !== undefined ? forceMonth : n.getMonth(); // 0-indexed

    // v6: No auto-generation — slots are assigned on attendance save.
    const schedule   = Storage.getBatchPresentationSchedule(batchId, year, month) || { slots: {} };
    const todaySkip  = Storage.getPresentationSkip(batchId, todayISO);

    // Month navigation
    function onNav(yr, mo) {
      openPresentationSchedule(batchId, yr, mo);
    }

    // Evaluation callback
    function onEval(studentId, date) {
      const student = Storage.getStudent(batchId, studentId);
      if (!student) return;
      UI.renderPresentationEvalModal(student, date, (metrics) => {
        Storage.savePresentationResult(batchId, studentId, date, metrics, schedule, year, month);
        UI.showToast('Evaluation saved!', 'success');
        openPresentationSchedule(batchId, year, month);
      });
    }

    // Skip callbacks — only relevant for today
    function onSkip(reason) {
      Storage.markPresentationSkip(batchId, todayISO, reason);
      UI.showToast('No-presentation day marked.', 'info');
      openPresentationSchedule(batchId, year, month);
    }

    function onRemoveSkip() {
      Storage.removePresentationSkip(batchId, todayISO);
      UI.showToast('Skip removed — presentations can be assigned today.', 'success');
      openPresentationSchedule(batchId, year, month);
    }

    UI.renderPresentationSchedule(
      batch, year, month, schedule, todayISO, todaySkip,
      onEval, onSkip, onRemoveSkip, onNav,
      () => selectBatch(batchId)
    );

    // Backdate Entry button — wire after render
    document.getElementById('btn-backdate-pres')?.addEventListener('click', () => {
      const students = (batch.students || []).filter(s => s && s.id && s.id !== '[removed]')
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!students.length) { UI.showToast('No students in this batch.', 'error'); return; }

      const modal = UI.showBackdatedEntryModal(students, todayISO);
      document.getElementById('modal-confirm').addEventListener('click', () => {
        const errEl     = document.getElementById('bd-error');
        const studentId = document.getElementById('bd-student').value;
        const date      = document.getElementById('bd-date').value;

        errEl.style.display = 'none';
        if (!studentId) { errEl.textContent = 'Please select a student.'; errEl.style.display = ''; return; }
        if (!date)      { errEl.textContent = 'Please select a date.'; errEl.style.display = ''; return; }
        if (date > todayISO) { errEl.textContent = 'Future dates are not allowed.'; errEl.style.display = ''; return; }

        const student = Storage.getStudent(batchId, studentId);
        if (!student) { errEl.textContent = 'Student not found.'; errEl.style.display = ''; return; }

        // Get/create schedule for that date's month
        const [y, m] = date.split('-').map(Number);
        const schedMonth = m - 1; // 0-indexed
        let sched = Storage.getBatchPresentationSchedule(batchId, y, schedMonth) || { slots: {}, repeatQueue: [] };
        if (!sched.slots)       sched.slots = {};
        if (!sched.repeatQueue) sched.repeatQueue = [];

        // Ensure a slot exists for this student on this date (add if missing)
        if (!sched.slots[date]) sched.slots[date] = [];
        const existingSlot = sched.slots[date].find(sl => sl.studentId === studentId);
        if (!existingSlot) {
          const slotNum = sched.slots[date].length + 1;
          sched.slots[date].push({ studentId, slot: slotNum, completed: false, missed: false });
          Storage.saveBatchPresentationSchedule(batchId, y, schedMonth, sched);
        }

        modal.remove();

        // Open evaluation modal
        UI.renderPresentationEvalModal(student, date, (metrics) => {
          // Re-fetch schedule in case it was updated
          const freshSched = Storage.getBatchPresentationSchedule(batchId, y, schedMonth) || sched;
          Storage.savePresentationResult(batchId, studentId, date, metrics, freshSched, y, schedMonth);
          UI.showToast(`Presentation saved for ${student.name} on ${date}.`, 'success');
          // Reload the month view for the entered date's month
          openPresentationSchedule(batchId, y, schedMonth);
        });
      });

      // Close modal on backdrop/cancel
      modal.querySelector('#modal-close')?.addEventListener('click',  () => modal.remove());
      modal.querySelector('#modal-cancel')?.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    });
  }

  // ─── SB: Sync overlay helpers ─────────────────────────────────────────────
  // Show/hide the #sync-overlay div that blocks the UI during Supabase calls.

  function _showSyncOverlay(msg) {
    const overlay = document.getElementById('sync-overlay');
    if (!overlay) return;
    const msgEl = document.getElementById('sync-overlay-msg');
    if (msgEl) msgEl.textContent = msg || 'Syncing\u2026';
    overlay.style.display = 'flex';
  }

  function _hideSyncOverlay() {
    const overlay = document.getElementById('sync-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // S-6: Update the header sync-status badge — Google Sheets style.
  // Receives 'syncing' | 'synced' | 'failed' from SupabaseSync.setStatusCallback (real events only).
  // syncing → spinning icon + "Saving…" (stays until next status)
  // synced  → checkmark + "Saved" → fades out after 2.5 s
  // failed  → warning icon + "Sync failed" (stays until next sync attempt)
  const _SYNC_ICON_CLOUD = `<svg class="sync-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
  const _SYNC_ICON_SPIN  = `<svg class="sync-badge-icon sync-badge-icon--spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>`;
  const _SYNC_ICON_WARN  = `<svg class="sync-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

  let _syncBadgeTimer = null;
  let _lastSyncStatus = null; // persists across topbar re-renders

  function _syncBadgeIdle(badge) {
    // Resting state — faded cloud icon, no text, always visible
    badge.className = 'sync-badge sync-badge--pop';
    badge.innerHTML = _SYNC_ICON_CLOUD;
    badge.removeAttribute('title');
    _lastSyncStatus = null;
    badge.addEventListener('animationend', () => badge.classList.remove('sync-badge--pop'), { once: true });
  }

  function _updateSyncBadge(status) {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    clearTimeout(_syncBadgeTimer);

    // Trigger pop by removing + re-adding the class
    badge.classList.remove('sync-badge--pop');
    void badge.offsetWidth; // force reflow so animation restarts

    if (status === 'syncing') {
      _lastSyncStatus = 'syncing';
      badge.className = 'sync-badge sync-badge--syncing sync-badge--pop';
      badge.innerHTML = `${_SYNC_ICON_SPIN}<span>Saving…</span>`;
    } else if (status === 'synced') {
      _lastSyncStatus = 'synced';
      badge.className = 'sync-badge sync-badge--synced sync-badge--pop';
      badge.innerHTML = `${_SYNC_ICON_CLOUD}<span>Saved</span>`;
      // After 3 s return to quiet idle cloud
      _syncBadgeTimer = setTimeout(() => _syncBadgeIdle(badge), 3000);
    } else if (status === 'failed') {
      _lastSyncStatus = 'failed';
      badge.className = 'sync-badge sync-badge--failed sync-badge--pop';
      badge.innerHTML = `${_SYNC_ICON_WARN}<span>Sync failed</span>`;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
