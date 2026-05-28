/**
 * storage.js — LocalStorage persistence layer
 *
 * Phase 1 — Batch Management enhancements:
 *  P1-1: _normalizeBatch() — applies default values for new fields; ensures backward compat
 *  P1-2: createBatch() — now accepts batchCode, startDate, endDate, capacity, status, archived
 *  P1-3: getBatch() / getBatches() — return normalized batch objects
 *  P1-4: getMyBatches() — excludes archived batches; archived batches only via getArchivedBatches()
 *  P1-5: getArchivedBatches() — returns archived batches for the current user
 *  P1-6: archiveBatch() — sets archived=true, status='archived'
 *  P1-7: transferStudent() — moves a student between batches, preserves full record, appends enrollmentHistory
 *  P1-8: _makeStudent() — adds enrollmentHistory[] field
 *  P1-9: createStudent() — stamps initial 'enrolled' enrollmentHistory entry
 *
 * Soft-delete (cross-device ghost-batch fix):
 *  deleteBatch() stamps deleted:true + deletedAt on the batch instead of removing it.
 *  The flag syncs to Supabase via the normal save() path so every device sees
 *  the deletion on next hydration — no per-device localStorage tombstone needed.
 *  getBatches / getBatch / getBatchesForUser all filter deleted:true from reads.
 *  exportJSON / importJSON intentionally preserve deleted records (backup completeness).
 *
 * v4 (Profile/Role/Session) changes:
 *  V4-1: SESSION_KEY now uses sessionStorage (close browser = logout; refresh = stay logged in)
 *  V4-2: User schema extended: fullName, email, phone, role ('admin'|'trainer')
 *  V4-3: createUser() accepts full profile fields + adminKey for role detection
 *  V4-4: Added updateUser(), changePassword(), deleteAccount(), getAllUsers()
 *  V4-5: getCurrentUser() adds default fields for legacy user objects (migration)
 *  V4-6: exportJSON() is role-aware: admin exports all, trainer exports own batches only
 *  V4-7: Admin key constant — 'SPMSADMIN2026' grants admin role on signup
 */

const Storage = (() => {
  const KEY          = 'spms_data';
  const SIDEBAR_KEY  = 'spms_sidebar_compact';
  const USERS_KEY    = 'spms_users';
  const SESSION_KEY  = 'spms_current_user';
  const SETTINGS_KEY = 'spms_app_settings';    // Cal-1: app-level settings (timezone, etc.)

  // V4-7: Admin key — must match exactly (case-sensitive)
  const ADMIN_KEY   = 'SPMSADMIN2026';

  // ─── P1-1: Batch normalizer — fills in defaults for new fields ─────────────
  // Applied on every read so existing batches without new fields work correctly.
  function _normalizeBatch(b) {
    if (!b) return b;
    // Spread stored values last so real data always overrides defaults
    return {
      batchCode:            '',
      startDate:            '',
      endDate:              '',
      capacity:             0,       // 0 = unlimited
      status:               'active',
      archived:             false,
      // Soft-delete: deleted=true means the batch was intentionally removed.
      // The flag syncs to Supabase so all devices see the deletion on next hydration.
      // getBatches/getBatch/getBatchesForUser filter deleted batches from all reads.
      deleted:              false,
      deletedAt:            '',      // ISO timestamp stamped by deleteBatch()
      primaryInstructorId:  '',      // P5: fallback to ownerId when missing
      assignedTrainers:     [],      // P5 → AD1: replaces assistantInstructors
      instructors:          [],      // P2: [{id, name, role:'primary'|'assistant'|'substitute'}]
      substitutions:        [],      // P2: [{instructorId, startDate, endDate}]
      timetable:            [],      // P3 legacy (kept for backward compat, emptied by Cal migration)
      calendarEvents:       [],      // Cal-1: new event schema (see _normalizeCalendarEvent)
      _calMigrated:         false,   // Cal-1: true after one-time migration has run
      updatedAt:            '',      // ST-1: merge timestamp; real value in ...b overrides
      meetingLinks:         {},      // trainer-specific: { [userId]: url }
      ...b
    };
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify({ batches: [] }));
    }
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { batches: [] }; }
    catch { return { batches: [] }; }
  }

  function save(data) {
    // ST-1 (fixed): updatedAt is now stamped per-batch by individual mutation functions
    // (createBatch, updateBatch, deleteBatch, saveSession, etc.) via _touchBatch().
    // Stamping ALL batches here caused stale admin localStorage copies to appear newer
    // than Supabase after ANY write, overwriting fresh data on the next sync push.
    localStorage.setItem(KEY, JSON.stringify(data));
    // SB: push to Supabase asynchronously (debounced); app reads from localStorage
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.scheduleBatchSync(data.batches);
  }

  // _touchBatch — stamps updatedAt on a single batch object in-place.
  // Called by every function that mutates a specific batch so that only the
  // changed batch gets a fresh timestamp; all other batches are left untouched.
  function _touchBatch(b) {
    if (b) b.updatedAt = new Date().toISOString();
  }

  // ─── Sidebar Compact ───────────────────────────────────────────────────────
  function getSidebarCompact() { return localStorage.getItem(SIDEBAR_KEY) === 'true'; }
  function setSidebarCompact(v) { localStorage.setItem(SIDEBAR_KEY, String(v)); }

  // ─── V4-1: Session helpers — sessionStorage so closing browser logs out ────
  function _getSessionUserId()   { return sessionStorage.getItem(SESSION_KEY) || ''; }
  function _setSessionUserId(id) { sessionStorage.setItem(SESSION_KEY, id); }
  function _clearSessionUserId() { sessionStorage.removeItem(SESSION_KEY); }

  // ─── Batch CRUD ────────────────────────────────────────────────────────────
  // Soft-delete filter: deleted batches are invisible to all callers.
  // The raw record stays in localStorage (and Supabase) so the deletion flag
  // propagates to every device on next hydration.
  function getBatches() {
    return load().batches.map(_normalizeBatch).filter(b => !b.deleted);
  }
  function getBatch(id) {
    const b          = load().batches.find(b => b.id === id) || null;
    const normalized = _normalizeBatch(b);
    if (normalized?.deleted) return null;  // treat soft-deleted as non-existent
    return normalized;
  }

  // P1-2: createBatch now accepts the full set of optional fields.
  // All new fields are optional — existing callers passing only (name, description) still work.
  function createBatch(name, description = '', extraFields = {}) {
    const data    = load();
    const ownerId = _getSessionUserId();
    const batch   = {
      id:        'b_' + Date.now(),
      name, description,
      ownerId,
      createdAt: new Date().toISOString(),
      holidays:  [],
      students:  [],
      // P1-2: new optional fields (defaults if not supplied)
      batchCode: extraFields.batchCode || '',
      startDate: extraFields.startDate || '',
      endDate:   extraFields.endDate   || '',
      capacity:  typeof extraFields.capacity === 'number' ? extraFields.capacity : 0,
      status:    extraFields.status    || 'active',
      archived:  false
    };
    _touchBatch(batch);
    data.batches.push(batch);
    save(data);
    return batch;
  }

  function updateBatch(id, updates) {
    const data = load();
    const idx  = data.batches.findIndex(b => b.id === id);
    if (idx === -1) return null;
    // Preserve ownerId — never let updates overwrite it
    const safeguarded = { ...updates };
    delete safeguarded.ownerId;
    data.batches[idx] = { ...data.batches[idx], ...safeguarded };
    _touchBatch(data.batches[idx]);
    save(data);
    return data.batches[idx];
  }

  function deleteBatch(id) {
    const data = load();
    const idx  = data.batches.findIndex(b => b.id === id);
    if (idx === -1) return;
    // Soft delete: stamp the deleted flag instead of removing the record.
    // The flag is pushed to Supabase via the normal debounced sync path so all
    // other devices see the deletion on their next hydration — no per-device
    // tombstone or separate remote-DELETE call is needed.
    // getBatches / getBatch / getBatchesForUser all filter deleted:true records,
    // so the batch immediately disappears from every read path on this device too.
    data.batches[idx].deleted   = true;
    data.batches[idx].deletedAt = new Date().toISOString();
    _touchBatch(data.batches[idx]);
    save(data);
  }

  // ─── Holiday CRUD (per batch) ──────────────────────────────────────────────
  function getHolidays(batchId) {
    const batch = getBatch(batchId);
    return batch ? (batch.holidays || []) : [];
  }

  function addHoliday(batchId, date, reason) {
    const data = load();
    const idx  = data.batches.findIndex(b => b.id === batchId);
    if (idx === -1) return false;
    if (!data.batches[idx].holidays) data.batches[idx].holidays = [];
    if (data.batches[idx].holidays.some(h => h.date === date)) return false;
    data.batches[idx].holidays.push({ date, reason: reason || 'Holiday' });
    data.batches[idx].holidays.sort((a, b) => a.date.localeCompare(b.date));
    _touchBatch(data.batches[idx]);
    save(data);
    return true;
  }

  function removeHoliday(batchId, date) {
    const data = load();
    const idx  = data.batches.findIndex(b => b.id === batchId);
    if (idx === -1) return;
    if (!data.batches[idx].holidays) return;
    data.batches[idx].holidays = data.batches[idx].holidays.filter(h => h.date !== date);
    _touchBatch(data.batches[idx]);
    save(data);
  }

  // ─── Student CRUD ──────────────────────────────────────────────────────────
  function getStudents(batchId) {
    const batch = getBatch(batchId);
    return batch ? batch.students.map(_normalizeStudent) : [];
  }

  function getStudent(batchId, studentId) {
    const batch = getBatch(batchId);
    if (!batch) return null;
    return _normalizeStudent(batch.students.find(s => s.id === studentId) || null);
  }

  function generateStudentId(batchName) {
    const prefix = batchName.replace(/\s+/g, '').substring(0, 3).toUpperCase();
    return `${prefix}${Date.now().toString().slice(-5)}`;
  }

  // ─── STUDENT_PORTAL: Student normalizer — fills defaults for new fields ──────
  // Applied on every read so existing students without new fields work correctly.
  function _normalizeStudent(s) {
    if (!s) return s;
    return {
      interviewScore: null,  // STUDENT_PORTAL: null = not yet recorded
      aiMockHistory:  [],    // Phase 1: multiple AI mock attempts []{ id, date, score }
      rejoinOn:       '',    // RJ-1: active suppression date (YYYY-MM-DD); empty = no suppression
      rejoinReason:   '',    // RJ-1: free text reason set by trainer when suppression is activated
      ...s
    };
  }

  function _makeStudent(batchName, { name, email = '', phone = '', studentId: customStudentId = '' }) {
    return {
      id:                  's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      studentId:           (customStudentId && customStudentId.trim()) ? customStudentId.trim() : generateStudentId(batchName),
      name, email, phone,
      createdAt:           new Date().toISOString(),
      sessions:            [],
      weeklyTests:         [],
      presentationMetrics: [],
      presentationDates:   [],
      exams:               [],
      punctuality:         [],
      notes:               [],
      mockInterviews:      [],
      callLogs:            [],  // v5: { date, remark } — logged when 3 consecutive absences
      presScheduleInfo:    {},  // v5: { completedCount, targetCount, lastPresentationDate, repeatCount, weakSkills[] }
      enrollmentHistory:   [],  // P1-8: [{ batchId, date, action: 'enrolled'|'transferred' }]
      interviewScore:      null, // STUDENT_PORTAL: kept for backward compat; auto-updated from aiMockHistory
      aiMockHistory:       [],   // Phase 1: []{ id, date, score } — avg drives placement AI component
      rejoinOn:            '',   // RJ-1: active suppression date (YYYY-MM-DD); empty = no suppression
      rejoinReason:        ''    // RJ-1: free text reason set by trainer when suppression is activated
    };
  }

  function createStudent(batchId, fields) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const student = _makeStudent(data.batches[batchIdx].name, fields);
    // P1-9: stamp initial enrollment history entry
    student.enrollmentHistory.push({
      batchId,
      date:   new Date().toISOString().split('T')[0],
      action: 'enrolled'
    });
    data.batches[batchIdx].students.push(student);
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return student;
  }

  function updateStudent(batchId, studentId, updates) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const sIdx = data.batches[batchIdx].students.findIndex(s => s.id === studentId);
    if (sIdx === -1) return null;
    data.batches[batchIdx].students[sIdx] = {
      ...data.batches[batchIdx].students[sIdx],
      ...updates
    };
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return data.batches[batchIdx].students[sIdx];
  }

  function deleteStudent(batchId, studentId) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;

    const batch = data.batches[batchIdx];

    // v6: clean up presentation schedule slots for this student before deletion.
    // Completed slots get a placeholder so monthly totals stay accurate.
    // Pending slots are removed entirely (student no longer exists to evaluate).
    Object.keys(batch)
      .filter(k => k.startsWith('presSchedule_'))
      .forEach(key => {
        const schedule = batch[key];
        if (!schedule?.slots) return;
        Object.keys(schedule.slots).forEach(date => {
          schedule.slots[date] = schedule.slots[date]
            .map(sl => {
              if (sl.studentId !== studentId) return sl;
              if (sl.completed) {
                // Preserve completed slot with placeholder name for reporting
                return { ...sl, studentId: '[removed]', studentName: '[Removed Student]' };
              }
              return null;  // pending — remove
            })
            .filter(Boolean);
          // Clean up empty date entries
          if (!schedule.slots[date].length) delete schedule.slots[date];
        });
      });

    data.batches[batchIdx].students =
      data.batches[batchIdx].students.filter(s => s.id !== studentId);
    _touchBatch(data.batches[batchIdx]);
    save(data);
  }

  // ─── Phase 1: AI Mock History ─────────────────────────────────────────────
  // Each entry: { id: 'aim_<ts>', date: 'YYYY-MM-DD', score: 0–10 }
  // interviewScore is kept in sync as the running average so the formula
  // (which still reads interviewScore) always has a valid value until Phase 5.

  function _recalcAiAvg(student) {
    const history = student.aiMockHistory || [];
    if (!history.length) return null;
    const sum = history.reduce((acc, e) => acc + e.score, 0);
    return parseFloat((sum / history.length).toFixed(2));
  }

  function addAiMock(batchId, studentId, { date, score }) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const sIdx = data.batches[batchIdx].students.findIndex(s => s.id === studentId);
    if (sIdx === -1) return null;

    const entry   = { id: 'aim_' + Date.now(), date, score: parseFloat(score) };
    const student = data.batches[batchIdx].students[sIdx];
    const history = [...(student.aiMockHistory || []), entry];

    data.batches[batchIdx].students[sIdx] = {
      ...student,
      aiMockHistory:  history,
      interviewScore: _recalcAiAvg({ aiMockHistory: history })
    };
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return entry;
  }

  function updateAiMock(batchId, studentId, entryId, { date, score }) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return false;
    const sIdx = data.batches[batchIdx].students.findIndex(s => s.id === studentId);
    if (sIdx === -1) return false;

    const student = data.batches[batchIdx].students[sIdx];
    const history = (student.aiMockHistory || []).map(e =>
      e.id === entryId ? { ...e, date, score: parseFloat(score) } : e
    );

    data.batches[batchIdx].students[sIdx] = {
      ...student,
      aiMockHistory:  history,
      interviewScore: _recalcAiAvg({ aiMockHistory: history })
    };
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return true;
  }

  function deleteAiMock(batchId, studentId, entryId) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return false;
    const sIdx = data.batches[batchIdx].students.findIndex(s => s.id === studentId);
    if (sIdx === -1) return false;

    const student = data.batches[batchIdx].students[sIdx];
    const history = (student.aiMockHistory || []).filter(e => e.id !== entryId);

    data.batches[batchIdx].students[sIdx] = {
      ...student,
      aiMockHistory:  history,
      interviewScore: _recalcAiAvg({ aiMockHistory: history })
    };
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return true;
  }

  // ─── v6: Presentation scheduling helpers (private) ──────────────────────────

  /**
   * _getTodayISO — returns today's date as 'YYYY-MM-DD' without timezone shift.
   * Uses direct string construction (same pattern as Calc.getWorkingDays) to avoid
   * the UTC-conversion bug that toISOString() causes in UTC+ timezones.
   */
  function _getTodayISO() {
    const n = new Date();
    return `${n.getFullYear()}-` +
           `${String(n.getMonth() + 1).padStart(2, '0')}-` +
           `${String(n.getDate()).padStart(2, '0')}`;
  }

  /**
   * _getYearMonth — splits 'YYYY-MM-DD' into [year, month_0based].
   * @param {string} dateISO
   * @returns {[number, number]} [year, 0-based month]
   */
  function _getYearMonth(dateISO) {
    const parts = dateISO.split('-');
    return [parseInt(parts[0]), parseInt(parts[1]) - 1];
  }

  /**
   * Phase 4: _markAbsentSlotsForStudent — marks a specific student's pending
   * presentation slot on a specific date as missed (in-place on batch object).
   * Returns true if a COMPLETED slot conflict exists (trainer should be warned).
   */
  function _markAbsentSlotsForStudent(batch, studentId, date) {
    let hasCompletedConflict = false;
    Object.keys(batch)
      .filter(k => k.startsWith('presSchedule_'))
      .forEach(key => {
        const schedule = batch[key];
        if (!schedule?.slots?.[date]) return;
        schedule.slots[date] = schedule.slots[date].map(sl => {
          if (sl.studentId !== studentId) return sl;
          if (sl.completed) { hasCompletedConflict = true; return sl; } // completed — warn but don't touch
          if (!sl.missed)   return { ...sl, missed: true };              // pending → mark missed
          return sl;
        });
      });
    return hasCompletedConflict;
  }

  /**
   * _autoMarkMissedInData — scans all presSchedule_* keys on a batch object and
   * marks any pending slot (completed=false, missed=false) on a past date as missed.
   *
   * Runs IN-PLACE on the already-loaded batch object — no separate load/save.
   * Called from saveSession() so the write is included in the same save() call.
   *
   * @param {Object} batch     — the batch object from data.batches[idx] (mutated)
   * @param {string} todayISO  — 'YYYY-MM-DD' of today; only dates before this are processed
   */
  function _autoMarkMissedInData(batch, todayISO) {
    Object.keys(batch)
      .filter(k => k.startsWith('presSchedule_'))
      .forEach(key => {
        const schedule = batch[key];
        if (!schedule?.slots) return;
        Object.keys(schedule.slots).forEach(date => {
          if (date >= todayISO) return;  // only past dates
          schedule.slots[date] = schedule.slots[date].map(sl =>
            (!sl.completed && !sl.missed) ? { ...sl, missed: true } : sl
          );
        });
      });
  }

  // ─── Session (Quick Class) — v5 ───────────────────────────────────────────
  /**
   * v5 CHANGE: saveSession now stores { date, status: "present"|"late"|"absent", remark }
   * instead of the old { date, present, speaking, presentation }.
   *
   * Backward compat: old records without `status` field are left untouched.
   * Punctuality is auto-derived from status — no separate punctuality write needed.
   * Presentation flag removed from quick class (handled by scheduler).
   * Overwrites same-date records (existing behaviour preserved).
   *
   * studentUpdates: [{ studentId, status, remark }]
   * For multi-day leave: pass multiple dates via saveAbsentRange().
   */
  function saveSession(batchId, sessionData) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;

    // Track which students are present/late — returned to app.js for scheduling
    const presentIds   = [];
    const _sessionRows = []; // Phase 2: collected for spms_sessions dual-write

    sessionData.studentUpdates.forEach(({ studentId, status, remark = null,
                                          callNote = null, callNoteAt = null,
                                          // legacy compat fields — ignored if status present
                                          present, speaking, presentation }) => {
      const sIdx = data.batches[batchIdx].students.findIndex(s => s.id === studentId);
      if (sIdx === -1) return;
      const student = data.batches[batchIdx].students[sIdx];

      // Resolve status — support both new (status) and legacy (present bool) callers
      const resolvedStatus = status || (present ? 'present' : 'absent');

      // RJ-1: student attended — cancel any active Rejoin On suppression immediately.
      // Clearing here (same save cycle as the session write) keeps the student record
      // consistent: if they showed up, the previous absence episode has ended and any
      // suppression set during that episode is no longer valid.
      if ((resolvedStatus === 'present' || resolvedStatus === 'late') && student.rejoinOn) {
        student.rejoinOn    = '';
        student.rejoinReason = '';
      }

      const entry = { date: sessionData.date, status: resolvedStatus, remark: remark || null };
      // Phase 3: store Call Connect note + timestamp if provided
      if (remark === 'Call Connect' && callNote) {
        entry.callNote   = callNote;
        entry.callNoteAt = callNoteAt || new Date().toISOString();
      }

      const existingIdx = (student.sessions || []).findIndex(s => s.date === sessionData.date);
      if (existingIdx >= 0) {
        student.sessions[existingIdx] = entry;
      } else {
        if (!student.sessions) student.sessions = [];
        student.sessions.push(entry);
      }

      // Collect present/late student IDs for scheduling (v6)
      if (resolvedStatus === 'present' || resolvedStatus === 'late') {
        presentIds.push(studentId);
      }

      // Phase 2: build normalized row for spms_sessions upsert
      _sessionRows.push({
        id:           'sess_' + batchId + '_' + studentId + '_' + sessionData.date,
        batch_id:     batchId,
        student_id:   studentId,
        date:         sessionData.date,
        status:       resolvedStatus,
        remark:       entry.remark     || null,
        call_note:    entry.callNote   || null,
        call_note_at: entry.callNoteAt || null
      });
    });

    // v6: auto-mark any past pending presentation slots as missed (in same save cycle)
    _autoMarkMissedInData(data.batches[batchIdx], _getTodayISO());

    // Phase 4: For each absent student on a PAST date, mark their pending slot as missed.
    // Today's date is skipped — absent students today are treated as vacancies so that
    // assignDailyPresentations() can replace them with present students (Option 1).
    // _autoMarkMissedInData() handles past dates; this loop now only covers re-saves of
    // historical attendance where the date is strictly before today.
    const _completedConflicts = [];
    if (sessionData.date < _getTodayISO()) {
      sessionData.studentUpdates.forEach(({ studentId, status, present }) => {
        const resolvedStatus = status || (present ? 'present' : 'absent');
        if (resolvedStatus !== 'absent') return;
        const _student = data.batches[batchIdx].students.find(s => s.id === studentId);
        const _hasConflict = _markAbsentSlotsForStudent(data.batches[batchIdx], studentId, sessionData.date);
        if (_hasConflict && _student) {
          _completedConflicts.push({ studentName: _student.name, date: sessionData.date });
        }
      });
    }

    // Phase 2: Track this date as a real Quick Class date on the batch
    const _batch = data.batches[batchIdx];
    if (!_batch.quickClassDates) _batch.quickClassDates = [];
    if (!_batch.quickClassDates.includes(sessionData.date)) {
      _batch.quickClassDates.push(sessionData.date);
    }

    // AD1: lightweight audit — who last saved this session and when
    if (sessionData.lastSavedBy) {
      _batch.lastSavedBy = sessionData.lastSavedBy;
      _batch.lastSavedAt = sessionData.lastSavedAt || new Date().toISOString();
    }

    _touchBatch(data.batches[batchIdx]);
    save(data);

    // Phase 2: dual-write attendance rows to spms_sessions (fire-and-forget)
    if (typeof SupabaseSync !== 'undefined' && _sessionRows.length) {
      SupabaseSync.pushSessions(_sessionRows);
    }

    // Return presentIds so app.js can call Calc.getNextPresenters() + assignDailyPresentations()
    return { presentIds, completedConflicts: _completedConflicts };
  }

  /**
   * v5: saveAbsentRange — creates absent session entries for every date in [startDate, endDate]
   * (inclusive) for a single student, skipping Sundays and holidays.
   */
  function saveAbsentRange(batchId, studentId, startDate, endDate, remark, holidays = []) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;
    const sIdx = data.batches[batchIdx].students.findIndex(s => s.id === studentId);
    if (sIdx === -1) return;
    const student = data.batches[batchIdx].students[sIdx];
    if (!student.sessions) student.sessions = [];

    const cur = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate   + 'T12:00:00');
    const _completedConflicts = [];
    const _sessionRows        = []; // Phase 2: collected for spms_sessions dual-write
    while (cur <= end) {
      const iso = cur.toISOString().split('T')[0];
      if (cur.getDay() !== 0 && !holidays.some(h => h.date === iso)) {
        const idx = student.sessions.findIndex(s => s.date === iso);
        const entry = { date: iso, status: 'absent', remark: remark || null };
        if (idx >= 0) student.sessions[idx] = entry;
        else          student.sessions.push(entry);
        // Phase 4: mark pending slot missed for this student on this date
        const _hasConflict = _markAbsentSlotsForStudent(data.batches[batchIdx], studentId, iso);
        if (_hasConflict) _completedConflicts.push({ studentName: student.name, date: iso });
        // Phase 2: build normalized row for spms_sessions upsert
        _sessionRows.push({
          id:           'sess_' + batchId + '_' + studentId + '_' + iso,
          batch_id:     batchId,
          student_id:   studentId,
          date:         iso,
          status:       'absent',
          remark:       remark || null,
          call_note:    null,
          call_note_at: null
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
    _touchBatch(data.batches[batchIdx]);
    save(data);
    // Phase 2: dual-write attendance rows to spms_sessions (fire-and-forget)
    if (typeof SupabaseSync !== 'undefined' && _sessionRows.length) {
      SupabaseSync.pushSessions(_sessionRows);
    }
    return { completedConflicts: _completedConflicts };
  }

  /**
   * v6: getPresentIdsForDate — returns IDs of all students marked present or late
   * for a given date. Used so app.js can pass the full present list (early + late)
   * to getNextPresenters after a second attendance save.
   */
  function getPresentIdsForDate(batchId, date) {
    const batch = getBatch(batchId);
    if (!batch) return [];
    return (batch.students || [])
      .filter(s => {
        const session = (s.sessions || []).find(r => r.date === date);
        if (!session) return false;
        const st = session.status || (session.present ? 'present' : 'absent');
        return st === 'present' || st === 'late';
      })
      .map(s => s.id);
  }

  /**
   * v6: getPresentationSkip — returns the skip record for a date, or null if none.
   * Skip record shape: { reason: 'Placement session' }
   */
  function getPresentationSkip(batchId, date) {
    const [year, month] = _getYearMonth(date);
    const schedule = getBatchPresentationSchedule(batchId, year, month);
    return schedule?.skips?.[date] || null;
  }

  /**
   * v6: markPresentationSkip — marks a date as a no-presentation day with a reason.
   */
  function markPresentationSkip(batchId, date, reason) {
    if (!reason?.trim()) return;
    const [year, month] = _getYearMonth(date);
    const schedKey = `presSchedule_${year}_${month}`;
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;
    const batch = data.batches[batchIdx];
    if (!batch[schedKey])         batch[schedKey] = { slots: {} };
    if (!batch[schedKey].skips)   batch[schedKey].skips = {};
    batch[schedKey].skips[date] = { reason: reason.trim() };
    _touchBatch(data.batches[batchIdx]);
    save(data);
  }

  /**
   * v6: removePresentationSkip — removes a no-presentation skip for a date.
   */
  function removePresentationSkip(batchId, date) {
    const [year, month] = _getYearMonth(date);
    const schedKey = `presSchedule_${year}_${month}`;
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;
    const batch = data.batches[batchIdx];
    if (batch[schedKey]?.skips?.[date]) {
      delete batch[schedKey].skips[date];
      _touchBatch(data.batches[batchIdx]);
      save(data);
    }
  }

  /**
   * v6: assignDailyPresentations — stores the chosen presenters for a given date.
   *
   * Called from app.js after Calc.getNextPresenters() determines who presents.
   * Rules:
   *  - Completed and missed slots are LOCKED — never overwritten.
   *  - Pending slots are REPLACED by the new top candidates (from the full
   *    present list including late arrivals).
   *  - Total never exceeds 3 slots.
   *
   * @param {string} batchId           — batch to update
   * @param {string} date              — ISO date 'YYYY-MM-DD' of the session
   * @param {Array}  chosenStudentIds  — ordered array of student IDs (top priority first)
   */
  function assignDailyPresentations(batchId, date, chosenStudentIds) {
    if (!chosenStudentIds?.length) return;

    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;

    const batch = data.batches[batchIdx];
    const [year, month] = _getYearMonth(date);
    const schedKey = `presSchedule_${year}_${month}`;

    if (!batch[schedKey])        batch[schedKey] = { slots: {} };
    if (!batch[schedKey].slots)  batch[schedKey].slots = {};

    const existingSlots = batch[schedKey].slots[date] || [];

    // Lock completed and missed slots — these are permanent records
    const lockedSlots = existingSlots.filter(sl => sl.completed || sl.missed);
    const slotsNeeded = 3 - lockedSlots.length;
    if (slotsNeeded <= 0) return; // all slots already finalised

    // Build new slot list: locked first (renumbered from 1), then fill remaining
    const lockedIds = new Set(lockedSlots.map(sl => sl.studentId));
    const newSlots  = lockedSlots.map((sl, i) => ({ ...sl, slot: i + 1 }));
    let   slotNum   = lockedSlots.length + 1;

    for (const id of chosenStudentIds) {
      if (newSlots.length >= 3) break;
      if (!lockedIds.has(id)) {
        newSlots.push({ studentId: id, slot: slotNum++, completed: false, missed: false });
      }
    }

    batch[schedKey].slots[date] = newSlots;
    _touchBatch(data.batches[batchIdx]);
    save(data);
  }

  /**
   * v5: saveCallLog — appends a call log entry to student.callLogs[].
   */
  function saveCallLog(batchId, studentId, logEntry) {
    const student = getStudent(batchId, studentId);
    if (!student) return false;
    const logs = student.callLogs || [];
    logs.push({ id: 'cl_' + Date.now(), ...logEntry });
    updateStudent(batchId, studentId, { callLogs: logs });
    return true;
  }

  // ─── Reminders & Tasks ────────────────────────────────────────────────────
  const TASKS_KEY = 'spms_tasks';

  function _loadTasks() {
    try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); }
    catch { return []; }
  }

  function _saveTasks(tasks) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    // Push to Supabase asynchronously (debounced — same 1.5 s window as batch sync)
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.scheduleTasksSync(tasks);
  }

  /**
   * getTasks — returns tasks belonging to the current user only.
   *
   * Scoping rules:
   *  1. New tasks (post this change): have ownerId stamped — filter by exact match.
   *  2. Legacy tasks (no ownerId): fall back to batch ownership so existing data
   *     is not silently lost — a task is shown if its batch belongs to the current user.
   *  3. If no user is logged in: return empty array (safety guard).
   */
  function getTasks() {
    const user = getCurrentUser();
    if (!user) return [];
    return _loadTasks().filter(t => {
      if (t.ownerId) return t.ownerId === user.id;
      // Legacy task — derive ownership from the batch it was created for
      const batch = getBatch(t.batchId);
      return batch ? batch.ownerId === user.id : false;
    });
  }

  /**
   * addTask — creates a new auto task entry (Call Connect, etc.).
   * task: { batchId, studentId, studentName, batchName, type, triggerDate, streak? }
   *
   * Duplicate rule: ONE open auto-task per student (any triggerDate).
   * This prevents the same student generating new tasks on every re-save of attendance
   * across different milestone dates (Day3, Day6, Day9…).
   * ownerId is stamped AFTER the spread so callers cannot override it.
   *
   * Returns { id, isNew } so callers can tell whether a task was newly created.
   */
  function addTask(task) {
    const user  = getCurrentUser();
    const tasks = _loadTasks();
    // Duplicate check: any open auto-task for this student (ignore triggerDate)
    const duplicate = tasks.find(t =>
      !t.completedAt &&
      t.source       !== 'manual' &&
      t.studentId    === task.studentId &&
      (t.ownerId ? t.ownerId === user?.id : getBatch(t.batchId)?.ownerId === user?.id)
    );
    if (duplicate) return { id: duplicate.id, isNew: false };

    // RJ-1: Rejoin On suppression gate.
    // If the student has an active rejoinOn date (set by a trainer after calling them),
    // block new auto-task creation until that date passes.
    // This runs ONLY for auto-tasks that carry batchId + studentId.
    // Manual tasks (source:'manual') never reach addTask so no guard needed there.
    if (task.batchId && task.studentId) {
      const _rjStudent = getStudent(task.batchId, task.studentId);
      if (_rjStudent?.rejoinOn && _rjStudent.rejoinOn >= _getTodayISO()) {
        return { id: null, isNew: false };
      }
    }

    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdAt:   new Date().toISOString(),
      completedAt: null,
      remark:      '',
      source:      'auto',   // default; spread below can override if caller sets source
      ...task,
      ownerId: user?.id || '',   // stamped after spread — cannot be overridden by caller
    };
    tasks.unshift(newTask);
    _saveTasks(tasks);
    return { id: newTask.id, isNew: true };
  }

  /**
   * addManualTask — creates a standalone faculty-authored task (no student link).
   * title is required; notes, dueDate, dueTime are optional.
   * Returns the new task ID, or null if invalid.
   */
  function addManualTask({ title, notes = '', dueDate = '', dueTime = '' }) {
    const user = getCurrentUser();
    if (!user || !title?.trim()) return null;
    const task = {
      id:          'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdAt:   new Date().toISOString(),
      completedAt: null,
      ownerId:     user.id,
      source:      'manual',
      title:       title.trim(),
      notes:       notes.trim(),
      dueDate,
      dueTime,
      remark:      '',
    };
    const tasks = _loadTasks();
    tasks.unshift(task);
    _saveTasks(tasks);
    return task.id;
  }

  /**
   * deleteTask — hard-deletes a task.
   * Safety guard: only manual tasks can be deleted this way.
   */
  function deleteTask(taskId) {
    const tasks = _loadTasks();
    const idx   = tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return false;
    if (tasks[idx].source !== 'manual') return false; // never hard-delete auto tasks
    tasks.splice(idx, 1);
    _saveTasks(tasks);
    // Immediately remove from Supabase — don't wait for the debounced push,
    // otherwise scheduleTasksSync could re-insert the row before the delete fires.
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.deleteTaskRemote(taskId);
    return true;
  }

  /**
   * editManualTask — updates editable fields on a manual task.
   * Only title, notes, dueDate, dueTime are mutable via this path.
   */
  function editManualTask(taskId, updates) {
    const tasks = _loadTasks();
    const task  = tasks.find(t => t.id === taskId && t.source === 'manual');
    if (!task) return false;
    if (updates.title   !== undefined) task.title   = updates.title.trim();
    if (updates.notes   !== undefined) task.notes   = updates.notes.trim();
    if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
    if (updates.dueTime !== undefined) task.dueTime = updates.dueTime;
    _saveTasks(tasks);
    return true;
  }

  /**
   * completeTask — marks a task done.
   * Auto tasks: remark is required and a call log entry is auto-saved.
   * Manual tasks: remark is optional and no call log entry is created.
   */
  function completeTask(taskId, remark) {
    const tasks = _loadTasks();
    const task  = tasks.find(t => t.id === taskId);
    if (!task || task.completedAt) return false;
    const isManual = task.source === 'manual';
    if (!isManual && (!remark || !remark.trim())) return false;
    task.remark      = remark ? remark.trim() : '';
    task.completedAt = new Date().toISOString();
    _saveTasks(tasks);
    // Auto tasks only: save to student call log
    if (!isManual) {
      const today = new Date().toISOString().split('T')[0];
      saveCallLog(task.batchId, task.studentId, { date: today, remark: '[Call Connect] ' + task.remark });
    }
    return true;
  }

  // ─── Backup / Restore — V4-6: role-aware export ───────────────────────────
  /**
   * V4-6: Admin exports ALL batches. Trainer exports ONLY their own batches.
   * Both formats are compatible with importJSON (which uses .batches array).
   */
  function exportJSON() {
    const user = getCurrentUser();
    if (user && user.role === 'trainer') {
      // Trainer: scope to own batches only
      const data   = load();
      const scoped = { batches: data.batches.filter(b => b.ownerId === user.id) };
      return JSON.stringify(scoped, null, 2);
    }
    // Admin (or no user): full export
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.batches) throw new Error('Invalid format');
      // S-7: re-stamp ownerId before saving.
      // Trainers: overwrite every batch's ownerId with the logged-in user's ID so
      //   restored batches sync to Supabase under the correct owner.
      // Admins: preserve original ownerId values — a full multi-trainer backup must
      //   keep each batch attributed to its original trainer, not reassigned to admin.
      const curUser = getCurrentUser();
      if (curUser && curUser.role !== 'admin') {
        parsed.batches.forEach(b => { b.ownerId = curUser.id; });
      }
      save(parsed);
      return true;
    } catch { return false; }
  }

  // ─── AUTH ──────────────────────────────────────────────────────────────────

  function _hashPassword(password) {
    let h = 5381;
    for (let i = 0; i < password.length; i++) {
      h = (Math.imul(31, h) + password.charCodeAt(i)) | 0;
    }
    h = h ^ 0x53504D53;
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function _loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch { return []; }
  }

  // Fix 3: mirrors _touchBatch() — stamps updatedAt on exactly one user in-place.
  // Call this on the mutated user before _saveUsers(); never call it on all users.
  function _touchUser(u) {
    if (u) u.updatedAt = new Date().toISOString();
  }

  function _saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    // SB: push to Supabase asynchronously (debounced)
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.scheduleUsersSync(users);
  }

  /**
   * V4-5: Add default values for any user field added in v4.
   * Ensures old user objects don't break the app.
   */
  function _normalizeUser(u) {
    return {
      id:              u.id,
      username:        u.username        || '',
      fullName:        u.fullName        || u.username || '',
      email:           u.email           || '',
      phone:           u.phone           || '',
      role:            u.role            || 'trainer',  // existing users default to trainer
      passwordHash:    u.passwordHash    || '',
      createdAt:       u.createdAt       || '',
      // AD1: cosmetic designation label (e.g. 'Technical Faculty', 'PD Faculty')
      designation:     u.designation     || '',
      // STUDENT_PORTAL: only populated for role === 'student'
      linkedStudentId: u.linkedStudentId || '',
      linkedBatchId:   u.linkedBatchId   || '',
      updatedAt:       u.updatedAt       || ''   // ST-1
    };
  }

  /**
   * V4-3: createUser — accepts full profile object + adminKey for role detection.
   * Returns { ok: true, user } or { ok: false, error }.
   */
  function createUser({ username, password, fullName = '', email = '', phone = '', adminKey = '' }) {
    const trimmed = (username || '').trim();
    if (!trimmed)              return { ok: false, error: 'Username is required.' };
    if (!password)             return { ok: false, error: 'Password is required.' };
    if (trimmed.length < 3)    return { ok: false, error: 'Username must be at least 3 characters.' };
    if (password.length < 4)   return { ok: false, error: 'Password must be at least 4 characters.' };
    if (!fullName.trim())      return { ok: false, error: 'Full name is required.' };

    const users = _loadUsers();
    if (users.some(u => u.username.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: 'Username already exists. Please choose another.' };
    }

    const role = (adminKey.trim() === ADMIN_KEY) ? 'admin' : 'trainer';
    const user = {
      id:           'u_' + Date.now(),
      username:     trimmed,
      fullName:     fullName.trim(),
      email:        email.trim(),
      phone:        phone.trim(),
      role,
      passwordHash: _hashPassword(password),
      createdAt:    new Date().toISOString().split('T')[0]
    };
    users.push(user);
    _touchUser(user);
    _saveUsers(users);
    return { ok: true, user };
  }

  /**
   * V4-4: updateUser — updates profile fields for a user.
   * Cannot change role, id, or passwordHash via this function.
   */
  function updateUser(userId, updates) {
    const users = _loadUsers();
    const idx   = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'User not found.' };

    // Validate username uniqueness if changing it
    if (updates.username) {
      const trimmed = updates.username.trim();
      if (trimmed.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
      const clash = users.find(u => u.id !== userId && u.username.toLowerCase() === trimmed.toLowerCase());
      if (clash) return { ok: false, error: 'Username already taken.' };
      updates.username = trimmed;
    }
    if (updates.fullName) {
      updates.fullName = updates.fullName.trim();
      if (!updates.fullName) return { ok: false, error: 'Full name cannot be empty.' };
    }

    // Protect sensitive fields
    const safe = { ...updates };
    delete safe.id;
    delete safe.passwordHash;
    delete safe.role;
    delete safe.createdAt;

    users[idx] = { ...users[idx], ...safe };
    _touchUser(users[idx]);
    _saveUsers(users);
    return { ok: true, user: _normalizeUser(users[idx]) };
  }

  /**
   * V4-4: changePassword — verifies old password then updates hash.
   */
  function changePassword(userId, oldPassword, newPassword) {
    if (!oldPassword) return { ok: false, error: 'Enter your current password.' };
    if (!newPassword || newPassword.length < 4)
      return { ok: false, error: 'New password must be at least 4 characters.' };

    const users = _loadUsers();
    const idx   = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'User not found.' };
    if (users[idx].passwordHash !== _hashPassword(oldPassword))
      return { ok: false, error: 'Current password is incorrect.' };

    users[idx].passwordHash = _hashPassword(newPassword);
    _touchUser(users[idx]);
    _saveUsers(users);
    return { ok: true };
  }

  /**
   * V4-4: deleteAccount — removes the user and ALL their batches, then logs out.
   */
  function deleteAccount(userId) {
    // Remove all batches owned by this user
    const data   = load();
    data.batches = data.batches.filter(b => b.ownerId !== userId);

    // Fix: remove ghost references — the deleted user may appear in assignedTrainers[]
    // on other trainers' batches. Clean those up so faculty reports and the Assign Faculty
    // modal never show a dangling ID. Only assignedTrainers[] is touched; ownerId is never
    // modified on surviving batches.
    data.batches.forEach(b => {
      if (b.assignedTrainers?.includes(userId)) {
        b.assignedTrainers = b.assignedTrainers.filter(id => id !== userId);
        _touchBatch(b);
      }
    });

    save(data);  // single write covers both the batch removal and the trainer cleanup

    // Remove user record
    const users = _loadUsers().filter(u => u.id !== userId);
    _saveUsers(users);

    // SB: delete user from Supabase immediately; ON DELETE CASCADE removes their batches too
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.deleteUserRemote(userId);

    // Clear session
    _clearSessionUserId();
  }

  /**
   * adminDeleteUser — admin-initiated deletion of another user's account.
   * Same cleanup as deleteAccount() but does NOT clear the session, so the
   * admin who triggered the deletion stays logged in.
   * Only callable by an admin — enforced in app.js before this is reached.
   */
  function adminDeleteUser(userId) {
    const current = _getSessionUserId();
    if (userId === current) {
      // Safety: admin trying to delete themselves — use the normal self-delete path
      deleteAccount(userId);
      return;
    }

    // Soft-delete all batches owned by the target user
    const data = load();
    const ts   = new Date().toISOString();
    data.batches.forEach(b => {
      let bChanged = false;
      if (b.ownerId === userId) { b.deleted = true; b.deletedAt = ts; bChanged = true; }
      // Also clean up dangling assignedTrainer references
      if (b.assignedTrainers?.includes(userId)) {
        b.assignedTrainers = b.assignedTrainers.filter(id => id !== userId);
        bChanged = true;
      }
      if (bChanged) _touchBatch(b);
    });
    save(data);

    // Remove user record from local + Supabase
    const users = _loadUsers().filter(u => u.id !== userId);
    _saveUsers(users);
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.deleteUserRemote(userId);
  }

  /**
   * V4-4: getAllUsers — returns all user objects (for admin panel).
   */
  function getAllUsers() {
    return _loadUsers().map(_normalizeUser);
  }

  // ─── STUDENT_PORTAL: Student User Management ─────────────────────────────────

  /**
   * createStudentUser — creates a role='student' user linked to a specific student record.
   * Called by trainers/admins from the student profile page.
   * Students do NOT self-register; this is trainer-initiated.
   * Returns { ok: true, user } or { ok: false, error }.
   */
  function createStudentUser(batchId, studentId, { username, password }) {
    const trimmed = (username || '').trim();
    if (!trimmed)           return { ok: false, error: 'Username is required.' };
    if (trimmed.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (!password || password.length < 4)
                            return { ok: false, error: 'Password must be at least 4 characters.' };

    const student = getStudent(batchId, studentId);
    if (!student) return { ok: false, error: 'Student record not found.' };

    const users = _loadUsers();
    if (users.some(u => u.username.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: 'Username already exists. Choose another.' };
    }

    // Guard: prevent creating a second login for the same student
    if (users.some(u => u.linkedStudentId === studentId)) {
      return { ok: false, error: 'This student already has a login account.' };
    }

    const user = {
      id:              'u_' + Date.now(),
      username:        trimmed,
      fullName:        student.name,
      email:           student.email  || '',
      phone:           student.phone  || '',
      role:            'student',
      passwordHash:    _hashPassword(password),
      createdAt:       new Date().toISOString().split('T')[0],
      linkedStudentId: studentId,
      linkedBatchId:   batchId
    };
    users.push(user);
    _touchUser(user);
    _saveUsers(users);
    return { ok: true, user };
  }

  /**
   * getStudentUser — finds the user record (role='student') linked to a student id.
   * Returns the normalized user object, or null if no login has been created yet.
   */
  function getStudentUser(studentId) {
    const raw = _loadUsers().find(u => u.role === 'student' && u.linkedStudentId === studentId);
    return raw ? _normalizeUser(raw) : null;
  }

  /**
   * deleteStudentUser — removes the student portal login for a given student.
   * Does NOT touch the student's actual data (attendance, marks, etc.) — only
   * the login credentials are removed. The trainer can then create a fresh login.
   * Returns { ok: true } or { ok: false, error }.
   */
  function deleteStudentUser(studentId) {
    const users  = _loadUsers();
    const target = users.find(u => u.role === 'student' && u.linkedStudentId === studentId);
    if (!target) return { ok: false, error: 'No login found for this student.' };
    const filtered = users.filter(u => u.id !== target.id);
    _saveUsers(filtered);
    if (typeof SupabaseSync !== 'undefined') SupabaseSync.deleteUserRemote(target.id);
    return { ok: true };
  }

  /**
   * adminResetStudentPassword — lets a trainer/admin set a new password for a
   * student login without requiring the old password (admin privilege).
   * Different from changePassword() which requires old-password verification.
   * Returns { ok: true } or { ok: false, error }.
   */
  function adminResetStudentPassword(studentId, newPassword) {
    if (!newPassword || newPassword.length < 4)
      return { ok: false, error: 'Password must be at least 4 characters.' };
    const users = _loadUsers();
    const idx   = users.findIndex(u => u.role === 'student' && u.linkedStudentId === studentId);
    if (idx === -1) return { ok: false, error: 'No login found for this student.' };
    users[idx].passwordHash = _hashPassword(newPassword);
    _touchUser(users[idx]);
    _saveUsers(users);
    return { ok: true };
  }

  /**
   * adminForceResetPassword — admin sets a new password for ANY user (trainer/admin/student)
   * by userId, without requiring the old password. Admin-only privilege.
   * Returns { ok: true } or { ok: false, error }.
   */
  function adminForceResetPassword(userId, newPassword) {
    if (!newPassword || newPassword.length < 4)
      return { ok: false, error: 'Password must be at least 4 characters.' };
    const users = _loadUsers();
    const idx   = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'User not found.' };
    users[idx].passwordHash = _hashPassword(newPassword);
    _touchUser(users[idx]);
    _saveUsers(users);
    return { ok: true };
  }

  /**
   * authenticateUser — V4-1: writes to sessionStorage instead of localStorage.
   */
  function authenticateUser(username, password) {
    const trimmed = (username || '').trim();
    const users   = _loadUsers();
    const raw     = users.find(u => u.username.toLowerCase() === trimmed.toLowerCase());
    if (!raw) return { ok: false, error: 'Username not found.' };
    if (raw.passwordHash !== _hashPassword(password))
      return { ok: false, error: 'Incorrect password.' };
    _setSessionUserId(raw.id); // V4-1: sessionStorage
    return { ok: true, user: _normalizeUser(raw) };
  }

  /**
   * getCurrentUser — V4-1: reads from sessionStorage; V4-5: normalizes fields.
   */
  function getCurrentUser() {
    const id = _getSessionUserId();
    if (!id) return null;
    const raw = _loadUsers().find(u => u.id === id);
    if (!raw) return null;
    return _normalizeUser(raw);
  }

  /**
   * logoutUser — V4-1: clears sessionStorage key only.
   */
  function logoutUser() { _clearSessionUserId(); }

  // ─── Batch Isolation Helpers ───────────────────────────────────────────────
  // AD1: a batch "belongs" to a user if they own it, are the primary instructor,
  // or appear in assignedTrainers[]. Soft-delete filter applied here.
  function getBatchesForUser(userId) {
    if (!userId) return [];
    return load().batches
      .filter(b => !b.deleted &&
                   (b.ownerId === userId ||
                    b.primaryInstructorId === userId ||
                    (b.assignedTrainers || []).includes(userId)))
      .map(_normalizeBatch);
  }

  // AD1-b: assignBatchesToUser — bulk-assign a list of batchIds to a user as an assigned trainer.
  // Batches not in the new list get the user removed from assignedTrainers (but ownerId is never touched).
  function assignBatchesToUser(userId, assignedBatchIds) {
    const data = load();
    let changed = false;
    const idSet = new Set(assignedBatchIds);
    data.batches.forEach(b => {
      const trainers = b.assignedTrainers || [];
      const isOwner  = b.ownerId === userId;
      if (isOwner) return; // never remove owner visibility
      const shouldHave = idSet.has(b.id);
      const hasNow     = trainers.includes(userId);
      if (shouldHave && !hasNow) {
        b.assignedTrainers = [...trainers, userId];
        _touchBatch(b); changed = true;
      } else if (!shouldHave && hasNow) {
        b.assignedTrainers = trainers.filter(id => id !== userId);
        _touchBatch(b); changed = true;
      }
    });
    if (changed) save(data);
    return { ok: true };
  }

  // P1-4: getMyBatches() excludes archived batches — archived appear only in getArchivedBatches()
  function getMyBatches() {
    return getBatchesForUser(_getSessionUserId()).filter(b => !b.archived);
  }

  // P1-5: Returns archived batches owned by OR assigned to the current user
  function getArchivedBatches() {
    return getBatchesForUser(_getSessionUserId()).filter(b => b.archived);
  }

  function migrateOrphanedBatches(userId) {
    if (!userId) return;
    const data    = load();
    let   changed = false;
    data.batches.forEach(b => {
      if (!b.ownerId) { b.ownerId = userId; _touchBatch(b); changed = true; }
    });
    if (changed) save(data);
  }

  // P1-6: archiveBatch — sets archived=true and status='archived'
  function archiveBatch(id) {
    return updateBatch(id, { archived: true, status: 'archived' });
  }

  // P1-6: unarchiveBatch — restores batch to active status
  function unarchiveBatch(id) {
    return updateBatch(id, { archived: false, status: 'active' });
  }

  // AD1: updateBatchInstructors — sets Technical Faculty (primary) and assigned trainers on a batch.
  // primaryInstructorId must be a valid user id. assignedTrainers is an array of user ids.
  function updateBatchInstructors(batchId, primaryInstructorId, assignedTrainers = []) {
    if (!primaryInstructorId) return null;
    // Ensure primary is never in the assigned trainers list
    const cleanAssigned = assignedTrainers.filter(id => id !== primaryInstructorId);
    return updateBatch(batchId, { primaryInstructorId, assignedTrainers: cleanAssigned });
  }

  // P1-7: transferStudent — moves student between batches, preserving full record.
  // Appends enrollmentHistory entries to the student for both sides of the transfer.
  // Returns { ok: true } or { ok: false, error }
  function transferStudent(fromBatchId, studentId, toBatchId) {
    if (fromBatchId === toBatchId)
      return { ok: false, error: 'Source and target batch are the same.' };

    const data       = load();
    const fromIdx    = data.batches.findIndex(b => b.id === fromBatchId);
    const toIdx      = data.batches.findIndex(b => b.id === toBatchId);
    if (fromIdx === -1) return { ok: false, error: 'Source batch not found.' };
    if (toIdx   === -1) return { ok: false, error: 'Target batch not found.' };

    const sIdx = data.batches[fromIdx].students.findIndex(s => s.id === studentId);
    if (sIdx === -1) return { ok: false, error: 'Student not found.' };

    // Check capacity of target batch
    const targetBatch    = _normalizeBatch(data.batches[toIdx]);
    const targetStudents = data.batches[toIdx].students.length;
    if (targetBatch.capacity > 0 && targetStudents >= targetBatch.capacity)
      return { ok: false, error: `Target batch is at full capacity (${targetBatch.capacity}).` };

    // Deep-clone the student, append transfer history entry
    const student = JSON.parse(JSON.stringify(data.batches[fromIdx].students[sIdx]));
    const today   = new Date().toISOString().split('T')[0];
    if (!student.enrollmentHistory) student.enrollmentHistory = [];
    student.enrollmentHistory.push({
      batchId: toBatchId,
      date:    today,
      action:  'transferred'
    });

    // Remove from source, add to target
    data.batches[fromIdx].students.splice(sIdx, 1);
    data.batches[toIdx].students.push(student);
    _touchBatch(data.batches[fromIdx]);
    _touchBatch(data.batches[toIdx]);
    save(data);
    return { ok: true, student };
  }

  // ─── Presentation Schedule (v5) ───────────────────────────────────────────

  /**
   * v5: getBatchPresentationSchedule — returns the stored schedule for a batch+month.
   * Key: 'presSchedule_YYYY_MM' stored inside the batch object.
   */
  function getBatchPresentationSchedule(batchId, year, month) {
    const batch = getBatch(batchId);
    if (!batch) return null;
    const key = `presSchedule_${year}_${month}`;
    return batch[key] || null;
  }

  /**
   * v5: saveBatchPresentationSchedule — persists a generated schedule into the batch object.
   */
  function saveBatchPresentationSchedule(batchId, year, month, schedule) {
    const key = `presSchedule_${year}_${month}`;
    updateBatch(batchId, { [key]: schedule });
  }

  /**
   * v6: savePresentationResult — marks a slot as completed and saves metrics to student.
   * repeatQueue logic removed (v6 uses attendance-driven scheduling, no queue needed).
   */
  function savePresentationResult(batchId, studentId, date, metrics, schedule, year, month) {
    // 1. Save presentation metrics to student
    const student = getStudent(batchId, studentId);
    if (!student) return false;
    const entry           = { date, ...metrics };
    const existingMetrics = student.presentationMetrics || [];
    const isNewDate       = !existingMetrics.some(m => m.date === date);
    // Fix 2: dedup by date — replace any existing entry for this date rather than appending
    const updated = existingMetrics.filter(m => m.date !== date).concat(entry);
    // Add to presentationDates (single source of truth)
    const dates = [...(student.presentationDates || [])];
    if (!dates.includes(date)) { dates.push(date); dates.sort(); }

    // 2. Update presScheduleInfo metrics
    const weakSkills = Calc.getWeakSkills(entry);
    const presInfo   = student.presScheduleInfo || {};
    // Fix 2: only increment completedCount for genuinely new dates, not re-saves
    if (isNewDate) presInfo.completedCount = (presInfo.completedCount || 0) + 1;
    presInfo.lastPresentationDate = date;
    presInfo.weakSkills           = weakSkills;

    updateStudent(batchId, studentId, {
      presentationMetrics: updated,
      presentationDates:   dates,
      presScheduleInfo:    presInfo
    });

    // 3. Mark slot as completed in schedule
    if (schedule?.slots?.[date]) {
      schedule.slots[date] = schedule.slots[date].map(sl =>
        sl.studentId === studentId ? { ...sl, completed: true } : sl
      );
    }

    saveBatchPresentationSchedule(batchId, year, month, schedule);
    return true;
  }

  /**
   * v5: markPresentationMissed — marks a slot as missed and keeps student in repeat queue.
   */
  function markPresentationMissed(batchId, studentId, date, schedule, year, month) {
    if (schedule?.slots?.[date]) {
      schedule.slots[date] = schedule.slots[date].map(sl =>
        sl.studentId === studentId ? { ...sl, missed: true } : sl
      );
    }
    if (!schedule.repeatQueue.includes(studentId)) {
      schedule.repeatQueue.unshift(studentId); // high priority — missed presentation
    }
    saveBatchPresentationSchedule(batchId, year, month, schedule);
  }

  // ─── P2: Instructor Management ────────────────────────────────────────────

  /**
   * P2: migrateBatchInstructors — one-time migration called at login.
   * For every batch whose instructors[] is empty, creates a 'primary' entry
   * from the batch owner's user record. Safe to call multiple times — only
   * acts on batches that still have an empty instructors array.
   */
  function migrateBatchInstructors() {
    const data  = load();
    const users = _loadUsers();
    let changed = false;
    data.batches.forEach(b => {
      let bChanged = false;
      if (!b.instructors || b.instructors.length === 0) {
        const owner = users.find(u => u.id === b.ownerId);
        b.instructors = [{
          id:   'instr_' + (b.ownerId || 'owner'),
          name: owner ? (owner.fullName || owner.username) : 'Batch Owner',
          role: 'primary'
        }];
        bChanged = true;
      }
      if (!b.substitutions) { b.substitutions = []; bChanged = true; }
      if (bChanged) { _touchBatch(b); changed = true; }
    });
    if (changed) save(data);
  }

  /** Returns the instructors array for a batch. */
  function getBatchInstructors(batchId) {
    const batch = getBatch(batchId);
    return batch ? (batch.instructors || []) : [];
  }

  /**
   * Appends a new instructor to the batch.
   * Returns the new instructor object, or null if batchId not found.
   */
  function addBatchInstructor(batchId, name, role = 'assistant') {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    if (!data.batches[batchIdx].instructors) data.batches[batchIdx].instructors = [];
    const entry = { id: 'instr_' + Date.now(), name: name.trim(), role };
    data.batches[batchIdx].instructors.push(entry);
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return entry;
  }

  /**
   * Updates an existing instructor's name and/or role.
   * Returns the updated object, or null if not found.
   */
  function updateBatchInstructor(batchId, instrId, updates) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const instrs = data.batches[batchIdx].instructors || [];
    const iIdx   = instrs.findIndex(i => i.id === instrId);
    if (iIdx === -1) return null;
    instrs[iIdx] = { ...instrs[iIdx], ...updates };
    data.batches[batchIdx].instructors = instrs;
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return instrs[iIdx];
  }

  /**
   * Removes an instructor from a batch.
   * Guard: cannot remove the last primary instructor.
   * Also removes substitutions referencing this instructor.
   * Returns { ok, error }.
   */
  function removeBatchInstructor(batchId, instrId) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return { ok: false, error: 'Batch not found.' };
    const instrs = data.batches[batchIdx].instructors || [];
    const target  = instrs.find(i => i.id === instrId);
    if (!target)  return { ok: false, error: 'Instructor not found.' };
    if (target.role === 'primary' && instrs.filter(i => i.role === 'primary').length <= 1)
      return { ok: false, error: 'A batch must have at least one primary instructor.' };
    data.batches[batchIdx].instructors = instrs.filter(i => i.id !== instrId);
    if (data.batches[batchIdx].substitutions) {
      data.batches[batchIdx].substitutions =
        data.batches[batchIdx].substitutions.filter(s => s.instructorId !== instrId);
    }
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return { ok: true };
  }

  /** Adds a substitution period for an instructor. Returns true on success. */
  function addSubstitution(batchId, instructorId, startDate, endDate) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return false;
    if (!data.batches[batchIdx].substitutions) data.batches[batchIdx].substitutions = [];
    data.batches[batchIdx].substitutions.push({ instructorId, startDate, endDate });
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return true;
  }

  /** Removes a substitution identified by instructorId + startDate. */
  function removeSubstitution(batchId, instructorId, startDate) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;
    if (!data.batches[batchIdx].substitutions) return;
    data.batches[batchIdx].substitutions =
      data.batches[batchIdx].substitutions
        .filter(s => !(s.instructorId === instructorId && s.startDate === startDate));
    _touchBatch(data.batches[batchIdx]);
    save(data);
  }

  // ─── P3: Timetable CRUD ───────────────────────────────────────────────────

  /** Returns the timetable array for a batch. */
  function getTimetable(batchId) {
    const batch = getBatch(batchId);
    return batch ? (batch.timetable || []) : [];
  }

  /**
   * Adds a new timetable entry to a batch.
   * Returns the new entry (with generated id), or null if batch not found.
   */
  function addTimetableEntry(batchId, entry) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    if (!data.batches[batchIdx].timetable) data.batches[batchIdx].timetable = [];
    const newEntry = {
      id:           'tt_' + Date.now(),
      dayOfWeek:    Number(entry.dayOfWeek),
      subject:      (entry.subject || '').trim(),
      instructorId: entry.instructorId || '',
      startTime:    entry.startTime    || '',
      endTime:      entry.endTime      || '',
      recurring:    entry.recurring !== false   // default true
    };
    data.batches[batchIdx].timetable.push(newEntry);
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return newEntry;
  }

  /**
   * Updates fields on an existing timetable entry.
   * Returns the updated entry or null if not found.
   */
  function updateTimetableEntry(batchId, entryId, updates) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const tt   = data.batches[batchIdx].timetable || [];
    const eIdx = tt.findIndex(e => e.id === entryId);
    if (eIdx === -1) return null;
    tt[eIdx] = { ...tt[eIdx], ...updates };
    data.batches[batchIdx].timetable = tt;
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return tt[eIdx];
  }

  /**
   * Removes a timetable entry by id.
   * Returns true on success, false if not found.
   */
  function deleteTimetableEntry(batchId, entryId) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return false;
    const before = (data.batches[batchIdx].timetable || []).length;
    data.batches[batchIdx].timetable =
      (data.batches[batchIdx].timetable || []).filter(e => e.id !== entryId);
    const removed = data.batches[batchIdx].timetable.length < before;
    if (removed) { _touchBatch(data.batches[batchIdx]); save(data); }
    return removed;
  }

  // ─── Cal-1: Calendar — new schema, migration, CRUD, timezone ────────────────

  /**
   * Canonical shape for a calendar event.
   * Always run incoming data through this before storing.
   *
   * type:
   *   'recurring' — repeats every week on dayOfWeek (1=Mon … 7=Sun)
   *   'once'      — one-time event on a specific date
   *   'allday'    — all-day event on a specific date (no startTime/endTime)
   *
   * exceptions (recurring only):
   *   Array of per-occurrence overrides created by drag-"just this one".
   *   { originalDate:'YYYY-MM-DD', newDate:'YYYY-MM-DD'|null,
   *     newStartTime:'HH:MM', newEndTime:'HH:MM' }
   *   newDate === null means that occurrence is cancelled/deleted.
   *
   * color keys map to CSS variables defined in styles.css:
   *   blue | purple | green | red | orange | teal | pink | yellow | indigo | slate
   */
  function _normalizeCalendarEvent(e) {
    const type = ['recurring','once','allday'].includes(e.type) ? e.type : 'recurring';
    return {
      id:           e.id           || ('cal_' + Date.now() + Math.random().toString(36).slice(2,6)),
      title:        (e.title       || '').trim(),
      type,
      dayOfWeek:    type === 'recurring' ? (Number(e.dayOfWeek) || 1) : 0,
      date:         type !== 'recurring' ? (e.date || '')              : '',
      // endDate: for recurring events, stop generating occurrences on/after this date (YYYY-MM-DD).
      // Empty string means no end — series runs indefinitely.
      endDate:      type === 'recurring' ? (e.endDate || '')           : '',
      startTime:    type !== 'allday'    ? (e.startTime || '')         : '',
      endTime:      type !== 'allday'    ? (e.endTime   || '')         : '',
      exceptions:   Array.isArray(e.exceptions) ? e.exceptions         : [],
      instructorId: e.instructorId || '',
      color:        ['blue','purple','green','red','orange','teal','pink','yellow','indigo','slate']
                      .includes(e.color) ? e.color : 'blue',
      description:  (e.description || '').trim()
    };
  }

  /**
   * Cal-1: One-time migration — converts old P3 timetable entries to calendarEvents.
   * Option B: recurring:false entries are DROPPED (no date was ever stored for them).
   * Safe to call repeatedly — skips if _calMigrated is already true.
   */
  function migrateCalendarSchema(batchId) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return;
    const batch = data.batches[batchIdx];
    if (batch._calMigrated) return;   // already done

    const oldEntries = batch.timetable || [];
    // Keep only recurring:true entries (Option B — drop recurring:false)
    batch.calendarEvents = oldEntries
      .filter(e => e.recurring !== false)
      .map((e, i) => _normalizeCalendarEvent({
        id:           e.id || ('cal_' + Date.now() + i),
        title:        e.subject || '',
        type:         'recurring',
        dayOfWeek:    e.dayOfWeek,
        startTime:    e.startTime,
        endTime:      e.endTime,
        instructorId: e.instructorId,
        color:        'blue',         // default colour for migrated entries
        description:  ''
      }));

    batch.timetable    = [];          // clear legacy array
    batch._calMigrated = true;

    _touchBatch(batch);
    save(data);
  }

  /** Returns all calendar events for a batch (normalized). */
  function getCalendarEvents(batchId) {
    const batch = getBatch(batchId);
    return batch ? (batch.calendarEvents || []) : [];
  }

  /**
   * Adds a new calendar event.
   * Returns the saved event object (with generated id), or null.
   */
  function addCalendarEvent(batchId, event) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    if (!data.batches[batchIdx].calendarEvents) data.batches[batchIdx].calendarEvents = [];

    const newEvent = _normalizeCalendarEvent(event);
    data.batches[batchIdx].calendarEvents.push(newEvent);
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return newEvent;
  }

  /**
   * Updates fields on an existing calendar event.
   * Merges updates then re-normalizes. Returns the updated event or null.
   */
  function updateCalendarEvent(batchId, eventId, updates) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const events = data.batches[batchIdx].calendarEvents || [];
    const eIdx   = events.findIndex(e => e.id === eventId);
    if (eIdx === -1) return null;

    events[eIdx] = _normalizeCalendarEvent({ ...events[eIdx], ...updates });
    data.batches[batchIdx].calendarEvents = events;
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return events[eIdx];
  }

  /**
   * Deletes a calendar event by id.
   * Returns true on success, false if not found.
   */
  function deleteCalendarEvent(batchId, eventId) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return false;
    const before = (data.batches[batchIdx].calendarEvents || []).length;
    data.batches[batchIdx].calendarEvents =
      (data.batches[batchIdx].calendarEvents || []).filter(e => e.id !== eventId);
    const removed = data.batches[batchIdx].calendarEvents.length < before;
    if (removed) { _touchBatch(data.batches[batchIdx]); save(data); }
    return removed;
  }

  /**
   * Cal-1: Adds (or replaces) a per-occurrence exception on a recurring event.
   * Used by drag-"just this one" — stores the override for originalDate.
   *
   * exception shape:
   *   { originalDate:'YYYY-MM-DD',  // the occurrence being overridden
   *     newDate:'YYYY-MM-DD'|null,  // null = cancelled occurrence
   *     newStartTime:'HH:MM',
   *     newEndTime:'HH:MM' }
   */
  function addEventException(batchId, eventId, exception) {
    const data     = load();
    const batchIdx = data.batches.findIndex(b => b.id === batchId);
    if (batchIdx === -1) return null;
    const events = data.batches[batchIdx].calendarEvents || [];
    const eIdx   = events.findIndex(e => e.id === eventId);
    if (eIdx === -1) return null;

    if (!Array.isArray(events[eIdx].exceptions)) events[eIdx].exceptions = [];
    // Replace any existing exception for the same originalDate
    events[eIdx].exceptions = events[eIdx].exceptions
      .filter(ex => ex.originalDate !== exception.originalDate);
    events[eIdx].exceptions.push(exception);

    data.batches[batchIdx].calendarEvents = events;
    _touchBatch(data.batches[batchIdx]);
    save(data);
    return events[eIdx];
  }

  /**
   * Sets the endDate on a recurring event so occurrences on/after that date
   * are no longer generated.  Used for "delete this + future occurrences".
   */
  function setCalendarEventEndDate(batchId, eventId, endDate) {
    return updateCalendarEvent(batchId, eventId, { endDate: endDate || '' });
  }

  // ─── Cal-1: App-level settings (timezone, future prefs) ──────────────────────

  /** Returns the full app settings object from its own localStorage key. */
  function _getAppSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
  }

  /** Merges updates into app settings and persists. */
  function _saveAppSettings(updates) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ..._getAppSettings(), ...updates }));
  }

  /**
   * Returns the configured app timezone string (e.g. 'Asia/Kolkata').
   * Falls back to the browser's own timezone if none has been set yet.
   */
  function getAppTimezone() {
    return _getAppSettings().timezone ||
           Intl.DateTimeFormat().resolvedOptions().timeZone ||
           'UTC';
  }

  /**
   * Persists a new global timezone (IANA string, e.g. 'America/New_York').
   * Triggers no re-render — caller is responsible for refreshing the view.
   */
  function setAppTimezone(tz) {
    _saveAppSettings({ timezone: tz });
  }

  return {
    init, load, save,
    getSidebarCompact, setSidebarCompact,
    getBatches, getBatch, createBatch, updateBatch, deleteBatch,
    getHolidays, addHoliday, removeHoliday,
    getStudents, getStudent, createStudent,
    updateStudent, deleteStudent, generateStudentId,
    addAiMock, updateAiMock, deleteAiMock,
    saveSession, saveAbsentRange, saveCallLog,
    getTasks, addTask, addManualTask, deleteTask, editManualTask, completeTask,
    exportJSON, importJSON,
    // Auth
    createUser, authenticateUser, getCurrentUser, logoutUser,
    updateUser, changePassword, deleteAccount, adminDeleteUser, getAllUsers,
    // STUDENT_PORTAL
    createStudentUser, getStudentUser, deleteStudentUser, adminResetStudentPassword, adminForceResetPassword,
    // Batch isolation
    getBatchesForUser, getMyBatches, migrateOrphanedBatches, assignBatchesToUser,
    // P1: Batch management enhancements
    getArchivedBatches, archiveBatch, unarchiveBatch, transferStudent,
    // P5: Admin Control Center
    updateBatchInstructors,
    // P2: Instructor management
    migrateBatchInstructors, getBatchInstructors,
    addBatchInstructor, updateBatchInstructor, removeBatchInstructor,
    addSubstitution, removeSubstitution,
    // P3: Timetable (legacy — kept so old call-sites don't break; UI replaced by Calendar)
    getTimetable, addTimetableEntry, updateTimetableEntry, deleteTimetableEntry,
    // Cal-1: Calendar
    migrateCalendarSchema,
    getCalendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
    addEventException, setCalendarEventEndDate,
    getAppTimezone, setAppTimezone,
    // Presentation schedule (v5/v6)
    getBatchPresentationSchedule, saveBatchPresentationSchedule,
    savePresentationResult, markPresentationMissed,
    getPresentIdsForDate, assignDailyPresentations,
    getPresentationSkip, markPresentationSkip, removePresentationSkip
  };
})();
