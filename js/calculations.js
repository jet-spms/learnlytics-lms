/**
 * calculations.js — All performance metric computations.
 *
 * v3 changes:
 *  CHANGE 1: attendanceScore() accepts optional context { holidays } to exclude Sundays + holidays
 *  CHANGE 2: performanceIndex(), allMetrics(), batchStats(), rankStudents(), getAlerts()
 *            all accept optional context for consistent holiday-aware calculations
 *  CHANGE 3: EXAM_MODULES renamed to EXAM_PARAMETERS; MODULE_COUNT = 3 added
 *  CHANGE 4: moduleStats() — new 3-module structure; each module has 7 parameters;
 *            a module is cleared only when ALL appeared parameters meet minimum marks
 *  CHANGE 5: batchAttendanceByDate() helper for the attendance dashboard
 *
 * v5 changes:
 *  CHANGE 6: attendanceScore() — new status field ("present"|"late"|"absent") with
 *            full backward-compat for old {present: bool} records. "late" = present for %.
 *  CHANGE 7: participationScore() — derived from presentationMetrics[] (speaking removed).
 *  CHANGE 8: getAlerts() — removed "no speaking" alert; added 3-consecutive-absences alert.
 *  CHANGE 9: batchAttendanceByDate() — counts "late" as present.
 *  CHANGE 10: punctualityScore() — reads sessions[].status as primary source.
 */

const Calc = (() => {

  // ─── Exam Parameters Configuration ────────────────────────────────────────
  /**
   * CHANGE 3: These are the 7 PARAMETERS that apply to each of the 3 modules.
   * Previously called EXAM_MODULES (which was wrong — these are parameters, not modules).
   */
  const EXAM_PARAMETERS = [
    { name: 'Technical',           maxMarks: 100, minMarks: 50   },
    { name: 'English & PD',        maxMarks: 50,  minMarks: 25   },
    { name: 'Practical',           maxMarks: 100, minMarks: 50   },
    { name: 'Technical Viva',      maxMarks: 50,  minMarks: 25   },
    { name: 'Project',             maxMarks: 25,  minMarks: 12.5 },
    { name: 'Assignment',          maxMarks: 25,  minMarks: 12.5 },
    { name: 'English & PD Viva',   maxMarks: 50,  minMarks: 25   }
  ];
  const MODULE_COUNT = 3; // CHANGE 3: 3 distinct modules, each sharing the same parameters

  // ─── Individual Metrics ────────────────────────────────────────────────────

  /**
   * CHANGE 1 + CHANGE 6: Attendance % excludes Sundays and batch holidays.
   * CHANGE 6: Handles new status field ("present"|"late"|"absent").
   *   - "present" and "late" both count as attended.
   *   - Old records with {present: bool} are still supported.
   * context = { holidays: [{ date, reason }] }
   */
  function attendanceScore(student, context = {}) {
    const holidays = context.holidays || [];
    const sessions = student.sessions || [];
    if (!sessions.length) return 0;

    // Filter out Sundays (getDay()===0) and known holidays
    const workingSessions = sessions.filter(s => {
      const d = new Date(s.date + 'T12:00:00'); // noon avoids DST edge cases
      if (d.getDay() === 0) return false; // Sunday = week off
      if (holidays.some(h => h.date === s.date)) return false; // custom holiday
      return true;
    });

    if (!workingSessions.length) return 0;
    // CHANGE 6: "present" OR "late" counts as attended; old bool field also supported
    return (workingSessions.filter(s => _isPresent(s)).length / workingSessions.length) * 100;
  }

  /**
   * CHANGE 6: Helper — returns true if a session record counts as "attended".
   * Supports both new status field and legacy present boolean.
   */
  function _isPresent(s) {
    if (s.status !== undefined) return s.status === 'present' || s.status === 'late';
    return !!s.present; // legacy
  }

  /**
   * CHANGE 7: Participation score (0–100) now derived from presentationMetrics[].
   * Each presentation entry contributes equally. Score = (count / totalSessions) * 100,
   * capped at 100. Falls back gracefully to 0 if no data.
   * Speaking feature has been removed.
   */
  function participationScore(student) {
    const sessions = student.sessions || [];
    const metrics  = student.presentationMetrics || student.careerMetrics || [];
    if (!sessions.length) return 0;
    // ratio of presentation entries to total sessions, capped at 100
    return Math.min(100, (metrics.length / sessions.length) * 100);
  }

  /** Academic avg = mean of (marks/total)×100 across all weekly tests */
  function academicScore(student) {
    const tests = student.weeklyTests || [];
    if (!tests.length) return 0;
    return tests.reduce((acc, t) => acc + (t.marks / t.total) * 100, 0) / tests.length;
  }

  /**
   * Presentation Metrics score (0–100).
   * Reads presentationMetrics; falls back to legacy careerMetrics.
   */
  function presentationMetricsScore(student) {
    const metrics = student.presentationMetrics || student.careerMetrics || [];
    if (!metrics.length) return 0;
    const fields = ['communication', 'confidence', 'bodyLanguage', 'grooming', 'behavior'];
    const total  = metrics.reduce((acc, m) => {
      const entryAvg = fields.reduce((s, f) => s + (m[f] || 0), 0) / fields.length;
      return acc + (entryAvg / 10) * 100;
    }, 0);
    return total / metrics.length;
  }

  /**
   * CHANGE 10: Punctuality score = (onTime / total attended) × 100.
   * Primary source: sessions[].status — "present" = on time, "late" = not on time.
   * Falls back to legacy punctuality[] array if no session-status data exists.
   */
  function punctualityScore(student) {
    const sessions = (student.sessions || []).filter(s => _isPresent(s));
    if (sessions.length) {
      const onTime = sessions.filter(s => s.status === undefined ? !!s.present : s.status === 'present').length;
      return (onTime / sessions.length) * 100;
    }
    // Legacy fallback
    const p = student.punctuality || [];
    if (!p.length) return 0;
    return (p.filter(x => x.onTime).length / p.length) * 100;
  }

  // ─── Performance Index ─────────────────────────────────────────────────────

  /** CHANGE 2: Accepts context to pass holidays to attendanceScore */
  function performanceIndex(student, context = {}) {
    return (
      attendanceScore(student, context)     * 0.20 +
      participationScore(student)           * 0.20 +
      academicScore(student)                * 0.30 +
      presentationMetricsScore(student)     * 0.30
    );
  }

  /** CHANGE 2: allMetrics accepts context */
  function allMetrics(student, context = {}) {
    return {
      attendance:    parseFloat(attendanceScore(student, context).toFixed(1)),
      academic:      parseFloat(academicScore(student).toFixed(1)),
      presentation:  parseFloat(presentationMetricsScore(student).toFixed(1)),
      punctuality:   parseFloat(punctualityScore(student).toFixed(1)),
      // Phase 5: live formula — 5-component equal-weight (Att 20% + Academic 20% +
      // Pres 20% + AI Mock 20% + Manual Mock 20%). Null (no data at all) → 0.
      finalScore:    finalScore(student, context) ?? 0
    };
  }

  // ─── Phase 5: Final Score — primary formula ──────────────────────────────
  /**
   * finalScore — 5-component equal-weight formula (each 20%).
   *   Attendance  20%  (0–100)
   *   Academic    20%  (0–100)
   *   Presentation 20% (0–100)
   *   AI Mock     20%  (aiMockHistory avg OR legacy interviewScore, normalised 0–100)
   *   Manual Mock 20%  (average of ALL mockInterviews[], normalised 0–100)
   *
   * Gate (relaxed): returns null only when the student has NO data at all.
   * Missing individual components default to 0 — they do not inflate the score.
   *
   * Returns a float (0–100) or null (no data whatsoever).
   * allMetrics() maps null → 0 so consumers never receive null.
   */
  function finalScore(student, context = {}) {
    // ── Component 1: Attendance ───────────────────────────────────────────
    const att  = attendanceScore(student, context);

    // ── Component 2: Academic ─────────────────────────────────────────────
    const acad = academicScore(student);

    // ── Component 3: Presentation Metrics ────────────────────────────────
    const pres = presentationMetricsScore(student);

    // ── Component 4: AI Mock average (stored 0–10 → normalise to 0–100) ──
    // Reads aiMockHistory[] first; falls back to legacy interviewScore scalar.
    const aiHistory = student.aiMockHistory || [];
    let aiScore = 0;
    if (aiHistory.length) {
      const avg = aiHistory.reduce((s, e) => s + e.score, 0) / aiHistory.length;
      aiScore   = avg * 10;
    } else if (student.interviewScore !== null && student.interviewScore !== undefined) {
      // Legacy scalar: values > 10 were entered on 0–100 scale, already normalised
      aiScore = student.interviewScore > 10 ? student.interviewScore : student.interviewScore * 10;
    }

    // ── Component 5: Manual Mock average (stored 0–10 → normalise to 0–100) ─
    // Average of ALL mockInterviews[]; absent entries have totalScore = 0.
    const mocks = student.mockInterviews || [];
    let manualScore = 0;
    if (mocks.length) {
      const sum = mocks.reduce((s, m) => s + (typeof m.totalScore === 'number' ? m.totalScore : 0), 0);
      manualScore = (sum / mocks.length) * 10;
    }

    // ── Gate: null only when student has absolutely no recorded data ──────
    const hasData =
      (student.sessions || []).length > 0 ||
      (student.weeklyTests || []).length > 0 ||
      (student.presentationMetrics || student.careerMetrics || []).length > 0 ||
      aiHistory.length > 0 ||
      (student.interviewScore !== null && student.interviewScore !== undefined) ||
      mocks.length > 0;
    if (!hasData) return null;

    // ── Phase C: read weights from context.scoringConfig if present ───────
    // Falls back to equal 20% per component — identical to the previous /5 formula.
    // No call site passes scoringConfig yet (Phase E wires that in).
    const w = (context.scoringConfig && context.scoringConfig.weights) || {
      attendance: 20, academic: 20, presentation: 20, aiMock: 20, manualMock: 20
    };
    return parseFloat((
      (att * w.attendance + acad * w.academic + pres * w.presentation +
       aiScore * w.aiMock + manualScore * w.manualMock) / 100
    ).toFixed(1));
  }

  // ─── Ranking ───────────────────────────────────────────────────────────────

  /** CHANGE 2: accepts context */
  function rankStudents(students, context = {}) {
    return students
      .map(s  => ({ ...s, _finalScore: finalScore(s, context) ?? 0 }))
      .sort((a, b) => b._finalScore - a._finalScore)
      .map((s, i) => ({ ...s, rank: i + 1 }));
  }

  // ─── Alerts ────────────────────────────────────────────────────────────────

  /** CHANGE 2: accepts context */
  function getAlerts(student, context = {}) {
    const alerts  = [];
    const sessions = student.sessions    || [];
    const tests    = student.weeklyTests || [];

    if (sessions.length > 0 && attendanceScore(student, context) < 70)
      alerts.push({ type: 'attendance', message: 'Attendance below 70%' });

    // CHANGE 8: 3 consecutive absences alert (replaces removed "no speaking" alert)
    const lastThree = sessions.slice(-3);
    if (lastThree.length === 3 && lastThree.every(s => !_isPresent(s)))
      alerts.push({ type: 'absent', message: '3 consecutive absences' });

    if (tests.length >= 3) {
      const last3 = tests.slice(-3).map(t => (t.marks / t.total) * 100);
      if (last3[0] > last3[1] && last3[1] > last3[2])
        alerts.push({ type: 'academic', message: 'Academic performance declining (3 tests)' });
    }

    const pm = student.presentationMetrics || student.careerMetrics || [];
    if (pm.length > 0 && presentationMetricsScore(student) < 50)
      alerts.push({ type: 'presentation', message: 'Presentation metrics average below 50%' });

    return alerts;
  }

  // ─── Batch-level stats ─────────────────────────────────────────────────────

  /** CHANGE 2: accepts context */
  function batchStats(students, context = {}) {
    if (!students.length)
      return { avgAttendance: 0, avgFinalScore: 0, redFlags: 0, top3: [], bottom3: [] };
    const ranked         = rankStudents(students, context);
    const avgAttendance  = students.reduce((a, s) => a + attendanceScore(s, context), 0) / students.length;
    const avgFinalScore  = students.reduce((a, s) => a + (finalScore(s, context) ?? 0), 0) / students.length;
    const redFlags       = students.filter(s => getAlerts(s, context).length > 0).length;
    return {
      avgAttendance:  parseFloat(avgAttendance.toFixed(1)),
      avgFinalScore:  parseFloat(avgFinalScore.toFixed(1)),
      redFlags,
      top3:    ranked.slice(0, 3),
      bottom3: ranked.slice(-3).reverse()
    };
  }

  // ─── Exam / Module Helpers (CHANGE 3 + 4) ─────────────────────────────────

  /**
   * CHANGE 4: Returns stats for all 3 modules.
   * Each module has 7 parameters. Module is CLEARED only when ALL appeared params meet minMarks.
   *
   * Data format in student.exams:
   *   [{ moduleNum: 1, parameters: { 'Technical': { appeared: bool, marks: number|null }, ... } }]
   *
   * Handles old flat format gracefully (old: [{ module: 'Technical', ... }] → treated as empty).
   */
  function moduleStats(student) {
    let stored = student.exams || [];

    // CHANGE 4: Detect old flat format (v2 exams had top-level `module` string) → ignore
    if (stored.length > 0 && stored[0].module !== undefined) {
      stored = []; // incompatible old structure, start fresh
    }

    return [1, 2, 3].map(num => {
      const rec    = stored.find(e => e.moduleNum === num) || { moduleNum: num, parameters: {} };
      const params = (rec.parameters || {});

      const paramStats = EXAM_PARAMETERS.map(p => {
        const entry    = params[p.name] || {};
        const appeared = !!entry.appeared;
        const marks    = appeared ? (entry.marks ?? null) : null;
        const cleared  = appeared && marks !== null && marks >= p.minMarks;
        return { ...p, appeared, marks, cleared };
      });

      // CHANGE 4: Module cleared = ALL appeared parameters are cleared
      const appearedParams  = paramStats.filter(p => p.appeared);
      const moduleAppeared  = appearedParams.length > 0;
      const moduleCleared   = moduleAppeared && appearedParams.every(p => p.cleared);

      return {
        moduleNum:     num,
        params:        paramStats,
        appeared:      moduleAppeared,
        cleared:       moduleCleared,
        appearedCount: appearedParams.length,
        clearedCount:  appearedParams.filter(p => p.cleared).length
      };
    });
  }

  // ─── Attendance Dashboard Helper (CHANGE 5) ───────────────────────────────

  /**
   * Returns date-wise attendance data for a batch.
   * CHANGE 9: Uses _isPresent() so "late" counts as present for % calculation.
   * Used by the attendance dashboard view.
   */
  function batchAttendanceByDate(students, holidays = [], quickClassDates = null) {
    // Phase 2: if quickClassDates is provided and non-empty, only show those dates.
    // Old batches without quickClassDates get null → all dates shown (backward compat).
    const _qcSet = (quickClassDates && quickClassDates.length > 0)
      ? new Set(quickClassDates)
      : null;

    const dateMap = {};
    students.forEach(student => {
      (student.sessions || []).forEach(s => {
        if (_qcSet && !_qcSet.has(s.date)) return; // skip non-Quick-Class dates
        if (!dateMap[s.date]) dateMap[s.date] = { present: 0, late: 0, absent: 0, total: 0 };
        const st = s.status || (s.present ? 'present' : 'absent'); // compat
        if (st === 'present')       dateMap[s.date].present++;
        else if (st === 'late')     dateMap[s.date].late++;
        else                        dateMap[s.date].absent++;
        dateMap[s.date].total++;
      });
    });

    return Object.keys(dateMap).sort().map(date => {
      const d        = new Date(date + 'T12:00:00');
      const isSunday = d.getDay() === 0;
      const holiday  = holidays.find(h => h.date === date) || null;
      const counts   = dateMap[date];
      // present + late both count as "attended" for % purposes
      const attended = counts.present + counts.late;
      const pct      = counts.total > 0 ? ((attended / counts.total) * 100).toFixed(1) : '0.0';
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return { date, dayName: dayNames[d.getDay()], isSunday, holiday, ...counts, pct };
    });
  }

  // ─── Presentation Date Helpers ─────────────────────────────────────────────

  function presentationsByMonth(student) {
    const dates = student.presentationDates || [];
    const map   = {};
    dates.forEach(iso => {
      const d   = new Date(iso);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      map[key]  = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => new Date('1 ' + a.month) - new Date('1 ' + b.month));
  }

  // ─── Radar Chart Data ──────────────────────────────────────────────────────

  function radarData(student, context = {}) {
    const m = allMetrics(student, context);

    // AI Mock: normalise stored 0–10 → 0–100 for radar scale
    // Reads aiMockHistory[] first; falls back to legacy interviewScore scalar
    const aiHistory = student.aiMockHistory || [];
    let aiScore = 0;
    if (aiHistory.length) {
      const avg = aiHistory.reduce((s, e) => s + e.score, 0) / aiHistory.length;
      aiScore   = avg * 10;
    } else if (student.interviewScore !== null && student.interviewScore !== undefined) {
      aiScore = student.interviewScore > 10 ? student.interviewScore : student.interviewScore * 10;
    }

    // Manual Mock avg: normalise stored 0–10 → 0–100 for radar scale
    const mocks = student.mockInterviews || [];
    let manualScore = 0;
    if (mocks.length) {
      const sum = mocks.reduce((s, mm) =>
        s + (typeof mm.totalScore === 'number' ? mm.totalScore : 0), 0);
      manualScore = (sum / mocks.length) * 10;
    }

    return {
      labels: ['Attendance', 'Academic', 'Presentation', 'AI Mock', 'Manual Mock'],
      values: [
        m.attendance,
        m.academic,
        m.presentation,
        parseFloat(aiScore.toFixed(1)),
        parseFloat(manualScore.toFixed(1))
      ]
    };
  }

  // ─── Presentation Scheduler Algorithm (v5) ───────────────────────────────

  /**
   * getWorkingDays — returns all working-day date strings in a given month.
   * A working day is any day that is not a Sunday and not in holidays[].
   * @param {number} year
   * @param {number} month  — 0-based (0 = Jan)
   * @param {Array}  holidays — [{ date: 'YYYY-MM-DD' }]
   */
  function getWorkingDays(year, month, holidays = []) {
    const days        = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      // Build ISO string directly — never use toISOString() here because it converts
      // to UTC first, which shifts the date backwards in UTC+ timezones (e.g. IST UTC+5:30),
      // causing Monday to be stored as Sunday's date, etc.
      const iso  = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const day  = new Date(iso + 'T12:00:00').getDay(); // noon keeps DST safe
      if (day === 0) continue;                           // Sunday — skip
      if (holidays.some(h => h.date === iso)) continue; // batch holiday — skip
      days.push(iso);
    }
    return days;
  }

  // buildPresentationSchedule removed in v6 — monthly pre-generation replaced by attendance-driven scheduling.

  /**
   * getRepeatDecision — determines if/when a student should repeat based on their latest eval.
   * Returns: 'none' | 'soon' | 'immediate'
   * @note v6: repeat queue removed; this function is retained for historical eval display only.
   */
  function getRepeatDecision(presentationMetricsEntry) {
    if (!presentationMetricsEntry) return 'none';
    const fields  = ['communication', 'confidence', 'bodyLanguage', 'grooming', 'behavior'];
    const scores  = fields.map(f => presentationMetricsEntry[f] || 0);
    const avg     = scores.reduce((a, b) => a + b, 0) / scores.length;
    const hasWeak = scores.some(v => v <= 5);
    if (avg >= 8 && !hasWeak) return 'none';
    if (avg >= 6)              return 'soon';       // repeat in a few days
    return 'immediate';                              // repeat very soon
  }

  /**
   * getWeakSkills — returns array of skill names where score ≤ 5.
   */
  function getWeakSkills(presentationMetricsEntry) {
    if (!presentationMetricsEntry) return [];
    const fields = ['communication', 'confidence', 'bodyLanguage', 'grooming', 'behavior'];
    return fields.filter(f => (presentationMetricsEntry[f] || 0) <= 5);
  }

  /**
   * getNextPresenters — picks up to `count` students to present on `sessionDate`.
   *
   * Selection rules (confirmed with product owner):
   *  1. Only students whose ID is in presentStudentIds (present or late in Quick Class).
   *  2. Students created on or after sessionDate are excluded (new-student rule:
   *     eligible from the day AFTER they are added to the batch).
   *  3. Small-batch gap rule: if batch has fewer than 5 students, exclude students
   *     whose lastPresentationDate is within the last 2 days.  If ALL candidates
   *     violate the gap (soft rule), the gap is relaxed and all eligible are used.
   *  4. Sort priority:
   *       a. completedCount ASC  — student with fewest presentations goes first
   *       b. lastPresentationDate ASC — least recently presented breaks ties
   *          (empty string '' sorts before any ISO date → never-presented student wins)
   *       c. Array index ASC — stable deterministic final fallback; same inputs
   *          always produce the same result (required for idempotency).
   *  5. Return the first `count` candidates.
   *
   * @param {Array}  students          — full batch.students array (normalized)
   * @param {Array}  presentStudentIds — IDs marked present or late for sessionDate
   * @param {string} sessionDate       — ISO date 'YYYY-MM-DD' of the session
   * @param {number} count             — max students to pick (default 3)
   * @returns {Array} — subset of students objects (length ≤ count)
   */
  function getNextPresenters(students, presentStudentIds, sessionDate, count = 3) {
    if (!students?.length || !presentStudentIds?.length) return [];

    const presentSet  = new Set(presentStudentIds);
    const batchSize   = students.length;
    const useGapRule  = batchSize < 5;

    // ── Step 1: filter to present students eligible for scheduling ────────────
    // Exclude students created on or after sessionDate (new-student rule).
    // createdAt is a full ISO timestamp; split at 'T' gives the date portion.
    const eligible = students
      .map((s, idx) => ({ s, idx }))   // preserve original array index for tie-break
      .filter(({ s }) => {
        if (!presentSet.has(s.id)) return false;                   // must be present
        const createdDate = (s.createdAt || '').split('T')[0];
        if (createdDate >= sessionDate)  return false;             // added today or future
        return true;
      });

    if (!eligible.length) return [];

    // ── Step 2: 2-day gap rule for small batches (< 5 students) ──────────────
    // A student who presented within the last 2 days is temporarily excluded.
    // Cutoff: lastPresentationDate must be STRICTLY before (sessionDate − 2 days).
    // Build cutoffISO using direct string construction to avoid timezone shifts.
    let candidates = eligible;
    if (useGapRule) {
      const [yr, mo, dy] = sessionDate.split('-').map(Number);
      const cutoffDate   = new Date(yr, mo - 1, dy - 2); // local date, 2 days back
      const cutoffISO    = `${cutoffDate.getFullYear()}-` +
                           `${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-` +
                           `${String(cutoffDate.getDate()).padStart(2, '0')}`;

      const withGap = eligible.filter(({ s }) => {
        const last = s.presScheduleInfo?.lastPresentationDate || '';
        return last < cutoffISO; // '' < any date → never-presented always passes
      });

      // Soft rule: if gap leaves no candidates, fall back to all eligible
      candidates = withGap.length > 0 ? withGap : eligible;
    }

    // ── Step 3: sort by fairness criteria ────────────────────────────────────
    candidates.sort((a, b) => {
      const countA = a.s.presScheduleInfo?.completedCount      || 0;
      const countB = b.s.presScheduleInfo?.completedCount      || 0;
      if (countA !== countB) return countA - countB;            // fewer presentations first

      const lastA  = a.s.presScheduleInfo?.lastPresentationDate || '';
      const lastB  = b.s.presScheduleInfo?.lastPresentationDate || '';
      if (lastA !== lastB) return lastA < lastB ? -1 : 1;      // least recent first

      return a.idx - b.idx;                                     // stable array-order fallback
    });

    // ── Step 4: return top N student objects ──────────────────────────────────
    return candidates.slice(0, count).map(({ s }) => s);
  }

  // ─── STUDENT_PORTAL: Placement Category ──────────────────────────────────────

  /**
   * placementCategory — returns 'A', 'B', 'C', or '—'.
   *
   * Phase B: retired the 25/25/50 composite formula.
   * Category is now derived directly from finalScore() — the same number
   * the trainer already sees on screen — keeping scores and categories consistent.
   *
   * Gate (preserved from previous version):
   *   Returns '—' when AI Mock data is absent OR Manual Mock history is empty.
   *   AI Mock check covers both aiMockHistory[] (current model) and legacy
   *   interviewScore scalar, matching the same priority order as finalScore().
   *
   * Thresholds (hardcoded — Phase E wires in admin-configurable values):
   *   A ≥ 85   |   B ≥ 70   |   C < 70
   */
  function placementCategory(student, context = {}) {
    // ── Gate: require at least one AI Mock entry ──────────────────────────────
    // Checks aiMockHistory[] first (current model), then falls back to legacy
    // interviewScore scalar — mirrors the same priority order as finalScore().
    const hasAIMock = (student.aiMockHistory && student.aiMockHistory.length > 0) ||
                      (student.interviewScore !== null && student.interviewScore !== undefined);
    if (!hasAIMock) return '—';

    // ── Gate: require at least one Manual Mock entry ──────────────────────────
    const mocks = student.mockInterviews;
    if (!mocks || mocks.length === 0) return '—';

    // ── Phase B: category now derived from Final Score ────────────────────────
    // Replaces the retired 25/25/50 composite (AI Mock×25 + Manual Mock×25 + PI×50).
    // finalScore() uses the 5-component equal-weight formula (each 20%).
    // Thresholds remain hardcoded here — Phase E wires in admin-configurable values.
    const score = finalScore(student, context);

    // Defensive guard: finalScore() returns null only when student has zero data.
    // Gate above ensures data exists, so null should not occur — but never throw.
    if (score === null) return '—';

    // ── Phase C: read thresholds from context.scoringConfig if present ────
    // Falls back to A ≥ 85 / B ≥ 70 — identical to the previous hardcoded values.
    // No call site passes scoringConfig yet (Phase E wires that in).
    const t = (context.scoringConfig && context.scoringConfig.thresholds) || { a: 85, b: 70 };
    if (score >= t.a) return 'A';
    if (score >= t.b) return 'B';
    return 'C';
  }

  return {
    EXAM_PARAMETERS, MODULE_COUNT,

    attendanceScore, academicScore,
    presentationMetricsScore,
    punctualityScore,
    allMetrics, rankStudents, getAlerts, batchStats,

    moduleStats,
    batchAttendanceByDate,
    presentationsByMonth,
    radarData,

    // v5/v6: presentation
    getWorkingDays, getRepeatDecision, getWeakSkills,
    // v6: attendance-driven scheduling
    getNextPresenters,
    _isPresent,  // exported so storage.js / ui.js can use it
    // STUDENT_PORTAL
    placementCategory,
    // Phase 5: primary formula
    finalScore
  };
})();
