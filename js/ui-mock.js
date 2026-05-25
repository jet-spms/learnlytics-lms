/**
 * ui-mock.js — Mock Interview screen renderers (extracted from ui.js Phase 4A)
 *
 * Depends on: UIIcons (ui-icons.js), UIHelpers (ui-helpers.js)
 *
 * Exports:
 *   renderMockManual, renderMockAI, renderMockHistory
 *   mockManualSlideOver, mockAISlideOver
 *   getMockParamsConfig
 *   MOCK_PARAMS_CONFIG  (re-used by _renderMockInterviewTab and renderStudentMockHistory in ui.js)
 */

const UIMock = (() => {

  const _ICONS = UIIcons._ICONS;
  const { _localDateStr, escHtml, fmtDate, scoreBar, _avatarHTML } = UIHelpers;

  // ─── Mock parameter config (shared across manual mock screens) ───────────

  const MOCK_PARAMS_CONFIG = [
    { key: 'fundamentals',     label: 'Fundamentals' },
    { key: 'confidence',       label: 'Confidence' },
    { key: 'explanation',      label: 'Explanation' },
    { key: 'useOfExamples',    label: 'Use of Examples' },
    { key: 'subjectKnowledge', label: 'Subject Knowledge' }
  ];

  function getMockParamsConfig() { return MOCK_PARAMS_CONFIG; }

  // ─── Mock Interviews — Phase 7 ────────────────────────────────────────────

  function renderMockManual(batch) {
    const main     = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];

    const rows = students.map(s => {
      const mocks   = s.mockInterviews || [];
      const present = mocks.filter(m => m.attendance !== 'absent');
      const avg     = present.length
        ? present.reduce((sum, m) => sum + (m.totalScore || 0), 0) / present.length : null;
      const last    = mocks.length ? mocks[mocks.length - 1] : null;
      const cls     = avg === null ? 'neutral' : avg >= 7 ? 'good' : avg >= 5 ? 'warn' : 'bad';
      return `
        <tr class="acad-row" data-sid="${s.id}" style="cursor:pointer" title="Click to add/view mock scores">
          <td><div class="student-cell">${_avatarHTML(s.name,'sm')}<span>${escHtml(s.name)}</span></div></td>
          <td>${mocks.length} <span class="mock-sub">(${present.length} appeared)</span></td>
          <td style="min-width:160px">
            ${avg !== null
              ? `<span class="pi-value pi--${cls}">${avg.toFixed(1)}/10</span> ${scoreBar(avg*10, cls)}`
              : '<span style="color:var(--text3)">—</span>'}
          </td>
          <td>${last ? fmtDate(last.date) : '—'}</td>
        </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Manual Mock Interviews</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${students.length} student${students.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table" id="mock-table">
          <thead><tr><th>Student</th><th>Sessions</th><th>Avg Score</th><th>Last Mock</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.6rem">Click a student row to add or view mock interview scores.</p>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.mock}</div>
        <div class="empty-state-title">No students in this batch</div>
        <div class="empty-state-msg">Add students first via Manage Batch.</div>
      </div>`}
      <div class="slideout-overlay" id="mock-overlay"></div>
      <div class="slideout-panel" id="mock-panel"></div>`;
  }

  function renderMockAI(batch) {
    const main     = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];

    const rows = students.map(s => {
      const entries = s.aiMockHistory || [];
      const avg     = entries.length
        ? entries.reduce((sum, e) => sum + (e.score || 0), 0) / entries.length : null;
      const last    = entries.length ? entries[entries.length - 1] : null;
      const cls     = avg === null ? 'neutral' : avg >= 7 ? 'good' : avg >= 5 ? 'warn' : 'bad';
      return `
        <tr class="acad-row" data-sid="${s.id}" style="cursor:pointer" title="Click to add/view AI mock scores">
          <td><div class="student-cell">${_avatarHTML(s.name,'sm')}<span>${escHtml(s.name)}</span></div></td>
          <td>${entries.length}</td>
          <td style="min-width:160px">
            ${avg !== null
              ? `<span class="pi-value pi--${cls}">${avg.toFixed(1)}/10</span> ${scoreBar(avg*10, cls)}`
              : '<span style="color:var(--text3)">—</span>'}
          </td>
          <td>${last ? fmtDate(last.date) : '—'}</td>
        </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">AI Mock Scores</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${students.length} student${students.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${students.length ? `
      <div class="table-wrap">
        <table class="data-table" id="mock-table">
          <thead><tr><th>Student</th><th>Sessions</th><th>Avg Score</th><th>Last Session</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="font-size:.8rem;color:var(--text3);margin-top:.6rem">Click a student row to add or view AI mock scores.</p>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.sparkles}</div>
        <div class="empty-state-title">No students in this batch</div>
        <div class="empty-state-msg">Add students first via Manage Batch.</div>
      </div>`}
      <div class="slideout-overlay" id="mock-overlay"></div>
      <div class="slideout-panel" id="mock-panel"></div>`;
  }

  function renderMockHistory(batch) {
    const main     = document.getElementById('main-content');
    if (!main) return;
    const students = batch.students || [];
    const batchId  = batch.id;

    const all = [];
    students.forEach(s => {
      (s.mockInterviews || []).forEach(m => all.push({
        date: m.date, student: s.name, sid: s.id, type: 'Manual', entryId: m.id,
        score: m.attendance === 'absent' ? null : m.totalScore,
        absent: m.attendance === 'absent'
      }));
      (s.aiMockHistory || []).forEach(a => all.push({
        date: a.date, student: s.name, sid: s.id, type: 'AI', entryId: a.id,
        score: a.score, absent: false
      }));
    });
    all.sort((a, b) => b.date.localeCompare(a.date));

    const rows = all.map(r => {
      const cls     = r.score === null ? 'neutral' : r.score >= 7 ? 'good' : r.score >= 5 ? 'warn' : 'bad';
      const sc      = r.absent
        ? `<span class="mock-badge mock-badge--absent">Absent</span>`
        : r.score !== null
          ? `<span class="pi-value pi--${cls}">${Number(r.score).toFixed(1)}/10</span>`
          : '—';
      const isManual = r.type === 'Manual';
      const kebabKey = `hist-${isManual ? 'm' : 'ai'}-${r.entryId}`;
      const editAct  = isManual ? 'edit-mock-hist'    : 'edit-aimock-hist';
      const delAct   = isManual ? 'delete-mock-hist'  : 'delete-aimock-hist';
      return `<tr>
        <td>${fmtDate(r.date)}</td>
        <td>${escHtml(r.student)}</td>
        <td><span class="mock-type-badge mock-type-badge--${r.type.toLowerCase()}">${r.type}</span></td>
        <td>${sc}</td>
        <td class="mock-hist-actions-cell">
          <div class="mi-kebab-wrap">
            <button class="btn-kebab" data-kebab="${kebabKey}" title="Actions">${_ICONS.dotsV}</button>
            <div class="mi-kebab-menu" id="kebab-menu-${kebabKey}" style="display:none">
              <button data-action="${editAct}"
                data-bid="${batchId}" data-sid="${r.sid}" data-mi-id="${r.entryId}">${_ICONS.pencil} Edit</button>
              <button class="mi-kebab-delete" data-action="${delAct}"
                data-bid="${batchId}" data-sid="${r.sid}" data-mi-id="${r.entryId}">${_ICONS.trash} Delete</button>
            </div>
          </div>
        </td>
      </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Mock History</h1>
          <p class="view-sub">${escHtml(batch.name)} &middot; ${all.length} session${all.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      ${all.length ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Student</th><th>Type</th><th>Score</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` :
      `<div class="empty-state">
        <div class="empty-state-icon">${_ICONS.clipboard}</div>
        <div class="empty-state-title">No mock sessions yet</div>
        <div class="empty-state-msg">Add manual or AI mock scores to see history here.</div>
      </div>`}`;
  }

  function mockManualSlideOver(student, batchId) {
    const today   = _localDateStr();
    const PARAMS  = MOCK_PARAMS_CONFIG;

    return `
      <div class="slideout-header">
        <button class="slideout-back-btn" data-action="mock-close">←</button>
        <div class="slideout-header-info">
          <span class="slideout-title">${escHtml(student.name)}</span>
          <span class="slideout-subtitle">Manual Mock Interviews</span>
        </div>
      </div>
      <div class="slideout-body">
        <div class="acad-add-card">
          <div class="acad-add-title">Add Mock Session</div>
          <div class="form-grid form-grid--2" style="margin-bottom:.65rem">
            <div class="form-group" style="margin:0">
              <label>Date</label>
              <input type="date" id="mock-date" class="form-input" value="${today}">
            </div>
            <div class="form-group" style="margin:0">
              <label>Attendance</label>
              <select id="mock-attendance" class="form-input">
                <option value="present">Present</option>
                <option value="absent">Absent</option>
              </select>
            </div>
          </div>

          <div id="mock-scores-section">
            <div class="form-grid form-grid--2" style="margin-bottom:.5rem">
              ${PARAMS.map(p => `
                <div class="form-group" style="margin:0">
                  <label>${p.label}</label>
                  <input type="number" class="form-input mock-param-input"
                    data-param="${p.key}" min="0" max="10" step="0.5" value="0" placeholder="0–10">
                </div>`).join('')}
            </div>
            <div class="form-grid form-grid--2" style="margin-bottom:.65rem">
              <div class="form-group" style="margin:0">
                <label>Questions Answered</label>
                <textarea id="mock-q-yes" class="form-input form-textarea" rows="2"
                  placeholder="Topics answered well…"></textarea>
              </div>
              <div class="form-group" style="margin:0">
                <label>Not Answered</label>
                <textarea id="mock-q-no" class="form-input form-textarea" rows="2"
                  placeholder="Struggled with…"></textarea>
              </div>
            </div>
            <p class="mock-avg-row">Avg Score: <strong id="mock-live-avg">—</strong> / 10</p>
          </div>

          <button class="btn btn-primary btn-sm" data-action="mock-save"
            data-bid="${batchId}" data-sid="${student.id}">Save Session</button>
        </div>

      </div>`;
  }

  function mockAISlideOver(student, batchId) {
    const today = _localDateStr();

    return `
      <div class="slideout-header">
        <button class="slideout-back-btn" data-action="mock-close">←</button>
        <div class="slideout-header-info">
          <span class="slideout-title">${escHtml(student.name)}</span>
          <span class="slideout-subtitle">AI Mock Scores</span>
        </div>
      </div>
      <div class="slideout-body">
        <div class="acad-add-card">
          <div class="acad-add-title">Add AI Mock Score</div>
          <div class="form-grid form-grid--2" style="margin-bottom:.75rem">
            <div class="form-group" style="margin:0">
              <label>Date</label>
              <input type="date" id="aimock-date" class="form-input" value="${today}">
            </div>
            <div class="form-group" style="margin:0">
              <label>Score (0–10)</label>
              <input type="number" id="aimock-score" class="form-input"
                min="0" max="10" step="0.1" placeholder="e.g. 7.5">
            </div>
          </div>
          <button class="btn btn-primary btn-sm" data-action="aimock-save"
            data-bid="${batchId}" data-sid="${student.id}">Save AI Score</button>
        </div>
      </div>`;
  }

  return {
    MOCK_PARAMS_CONFIG,
    getMockParamsConfig,
    renderMockManual,
    renderMockAI,
    renderMockHistory,
    mockManualSlideOver,
    mockAISlideOver,
  };

})();
