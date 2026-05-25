/**
 * ui-timetable.js — Timetable rendering (extracted from ui.js Phase 4A)
 *
 * Depends on: UIIcons (ui-icons.js), UIHelpers (ui-helpers.js)
 * Exports: renderTimetable, showTimetableClassModal
 */

const UITimetable = (() => {

  const _ICONS = UIIcons._ICONS;
  const { _localDateStr, capitalize } = UIHelpers;

  function el(tag, cls, html = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  // ─── P3: Timetable (legacy — kept so old code paths don't error) ──────────

  const _TT_DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const _TT_DAY_FULL = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /**
   * Returns an array of 6 ISO date strings [Mon..Sat] for the week that is
   * weekOffset weeks away from today's week (weekOffset 0 = current week).
   */
  function _ttWeekDates(weekOffset) {
    const today = new Date();
    const dow   = today.getDay(); // 0=Sun
    const toMon = dow === 0 ? -6 : 1 - dow;
    const mon   = new Date(today);
    mon.setDate(today.getDate() + toMon + weekOffset * 7);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return _localDateStr(d); // local date — avoids UTC flip for midnight-based date objects
    });
  }

  /** Calculate human-readable duration string from "HH:MM" times. */
  function _ttCalcDuration(start, end) {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
  }

  /** Check if an ISO date string is in a batch's holiday list. */
  function _ttIsHoliday(batch, dateStr) {
    return (batch.holidays || []).some(h => h.date === dateStr);
  }

  /** Get holiday reason for a date, or '' if not a holiday. */
  function _ttHolidayReason(batch, dateStr) {
    const h = (batch.holidays || []).find(h => h.date === dateStr);
    return h ? h.reason : '';
  }

  /** Render a single class card (used in both week and day view). */
  function _ttClassCardHTML(entry, batch, batchId, compact) {
    const instr    = (batch.instructors || []).find(i => i.id === entry.instructorId);
    const instrName = instr ? instr.name : '';
    const dur      = _ttCalcDuration(entry.startTime, entry.endTime);
    const recBadge = entry.recurring ? '' :
      '<span class="tt-once-badge">Once</span>';
    return `
      <div class="tt-class-card${compact ? ' tt-class-card--compact' : ''}">
        <div class="tt-class-top">
          <span class="tt-class-subject">${entry.subject}</span>
          ${recBadge}
        </div>
        <div class="tt-class-time">${entry.startTime} – ${entry.endTime}${dur ? ` <span class="tt-dur">· ${dur}</span>` : ''}</div>
        ${instrName ? `<div class="tt-class-instr">👤 ${instrName}</div>` : ''}
        <div class="tt-class-actions">
          <button class="btn-icon tt-edit-btn" data-action="tt-edit-class"
            data-eid="${entry.id}" data-bid="${batchId}" title="Edit class">✎</button>
          <button class="btn-icon btn-icon--danger tt-del-btn" data-action="tt-delete-class"
            data-eid="${entry.id}" data-bid="${batchId}" title="Remove class">${_ICONS.close}</button>
        </div>
      </div>`;
  }

  /**
   * P3: Main timetable view renderer.
   * viewMode: 'week' | 'day'
   * weekOffset: integer (0 = current week)
   * activeDate: ISO string used for day view
   */
  function renderTimetable(batch, viewMode, weekOffset, activeDate) {
    const main = document.getElementById('main-content');
    if (!main) return;

    const timetable = batch.timetable || [];
    const today     = _localDateStr();
    const weekDates = _ttWeekDates(weekOffset);  // [mon..sat]

    // ── Week label ─────────────────────────────────────────────────────────
    const wStart  = new Date(weekDates[0] + 'T12:00:00');
    const wEnd    = new Date(weekDates[5] + 'T12:00:00');
    const weekLabel = `${wStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${wEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    // ── Nav bar HTML ───────────────────────────────────────────────────────
    const navHTML = `
      <div class="tt-nav">
        <div class="tt-nav-left">
          <button class="btn btn-outline btn-sm" data-action="tt-prev-week" data-bid="${batch.id}">← Prev</button>
          <button class="btn btn-outline btn-sm" data-action="tt-today"     data-bid="${batch.id}">Today</button>
          <button class="btn btn-outline btn-sm" data-action="tt-next-week" data-bid="${batch.id}">Next →</button>
          <span class="tt-week-label">${viewMode === 'week' ? weekLabel : ''}</span>
        </div>
        <div class="tt-nav-right">
          <div class="tt-view-toggle">
            <button class="btn btn-sm${viewMode === 'week' ? ' btn-primary' : ' btn-outline'}"
              data-action="tt-week-view" data-bid="${batch.id}">Week</button>
            <button class="btn btn-sm${viewMode === 'day'  ? ' btn-primary' : ' btn-outline'}"
              data-action="tt-day-view"  data-bid="${batch.id}">Day</button>
          </div>
        </div>
      </div>`;

    // ── Render week or day body ────────────────────────────────────────────
    const bodyHTML = viewMode === 'day'
      ? _ttDayViewHTML(batch, timetable, activeDate || today, weekDates)
      : _ttWeekGridHTML(batch, timetable, weekDates, today);

    main.innerHTML = `
      <div class="view-header">
        <div>
          <button class="btn btn-outline btn-sm" data-action="back-batch-tt"
            data-bid="${batch.id}" style="margin-bottom:.4rem">← Back to Batch</button>
          <h1 class="view-title">Timetable
            <span style="font-size:1rem;font-weight:400;color:var(--text3)">${batch.name}</span>
          </h1>
          <p class="view-sub">Weekly class schedule · does not affect attendance</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" data-action="tt-add-class" data-bid="${batch.id}">+ Add Class</button>
        </div>
      </div>
      ${navHTML}
      ${bodyHTML}`;
  }

  /** Renders the 6-column week grid (Mon–Sat). */
  function _ttWeekGridHTML(batch, timetable, weekDates, today) {
    const cols = weekDates.map((dateStr, i) => {
      const dow       = i + 1;  // 1=Mon … 6=Sat
      const isToday   = dateStr === today;
      const holiday   = _ttIsHoliday(batch, dateStr);
      const reason    = _ttHolidayReason(batch, dateStr);
      const d         = new Date(dateStr + 'T12:00:00');
      const dayNum    = d.getDate();

      // Day header — clickable to switch to day view
      const headerHTML = `
        <div class="tt-day-header${isToday ? ' tt-day-header--today' : ''}"
          data-action="tt-day-click" data-date="${dateStr}" data-bid="${batch.id}">
          <span class="tt-day-name">${_TT_DAYS[dow]}</span>
          <span class="tt-day-num${isToday ? ' tt-today-num' : ''}">${dayNum}</span>
        </div>`;

      // Day body
      let bodyHTML;
      if (holiday) {
        bodyHTML = `<div class="tt-holiday-cell">
          <span class="tt-holiday-label">🏖 HOLIDAY</span>
          ${reason ? `<span class="tt-holiday-reason">${reason}</span>` : ''}
        </div>`;
      } else {
        const entries = timetable
          .filter(e => e.dayOfWeek === dow)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        bodyHTML = entries.length
          ? entries.map(e => _ttClassCardHTML(e, batch, batch.id, true)).join('')
          : `<div class="tt-empty-day">No classes</div>`;
      }

      // Per-day add button
      const addBtn = `<button class="tt-add-slot-btn" data-action="tt-add-class"
        data-dow="${dow}" data-bid="${batch.id}" title="Add class on ${_TT_DAY_FULL[dow]}">+</button>`;

      return `
        <div class="tt-day-col${isToday ? ' tt-day-col--today' : ''}">
          ${headerHTML}
          <div class="tt-day-body">${bodyHTML}</div>
          ${!holiday ? addBtn : ''}
        </div>`;
    });

    return `<div class="card tt-week-grid">${cols.join('')}</div>`;
  }

  /** Renders the day detail view for a single date. */
  function _ttDayViewHTML(batch, timetable, activeDate, weekDates) {
    const d       = new Date(activeDate + 'T12:00:00');
    const dow     = d.getDay(); // 0=Sun
    const holiday = _ttIsHoliday(batch, activeDate);
    const reason  = _ttHolidayReason(batch, activeDate);

    const dayTitle = d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    // Entries for this DOW (1–6 only; Sunday = 0 → show empty)
    const entries = dow >= 1 && dow <= 6
      ? timetable.filter(e => e.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime))
      : [];

    let contentHTML;
    if (dow === 0) {
      contentHTML = `<div class="tt-holiday-full"><span class="tt-holiday-label">SUNDAY — Week Off</span></div>`;
    } else if (holiday) {
      contentHTML = `<div class="tt-holiday-full">
        <span class="tt-holiday-label">🏖 HOLIDAY</span>
        ${reason ? `<span class="tt-holiday-reason">${reason}</span>` : ''}
      </div>`;
    } else if (entries.length) {
      contentHTML = `<div class="tt-day-entries">${entries.map(e => _ttClassCardHTML(e, batch, batch.id, false)).join('')}</div>`;
    } else {
      contentHTML = `<div class="empty-state">No classes scheduled for ${_TT_DAY_FULL[dow] || 'this day'}.<br>
        <button class="btn btn-primary" style="margin-top:1rem"
          data-action="tt-add-class" data-dow="${dow}" data-bid="${batch.id}">+ Add Class</button></div>`;
    }

    // Prev / next day navigation (skip Sunday)
    const prevD = new Date(d); prevD.setDate(d.getDate() - 1);
    if (prevD.getDay() === 0) prevD.setDate(prevD.getDate() - 1);
    const nextD = new Date(d); nextD.setDate(d.getDate() + 1);
    if (nextD.getDay() === 0) nextD.setDate(nextD.getDate() + 1);

    return `
      <div class="card tt-day-view-card">
        <div class="tt-day-view-header">
          <button class="btn btn-outline btn-sm" data-action="tt-prev-day"
            data-date="${prevD.toISOString().split('T')[0]}" data-bid="${batch.id}">← Prev Day</button>
          <div class="tt-day-view-title">
            <span>${dayTitle}</span>
            <input type="date" id="tt-date-picker" class="form-input tt-date-picker"
              value="${activeDate}" title="Jump to date">
          </div>
          <button class="btn btn-outline btn-sm" data-action="tt-next-day"
            data-date="${nextD.toISOString().split('T')[0]}" data-bid="${batch.id}">Next Day →</button>
        </div>
        <div class="tt-day-view-body">${contentHTML}</div>
      </div>`;
  }

  /**
   * P3: Modal for adding or editing a timetable class.
   * existing: timetable entry object when editing, null when adding.
   * prefillDow: integer 1–6, pre-selects the day of week when adding from a column.
   */
  function showTimetableClassModal(batch, existing, prefillDow) {
    const modal  = el('div', 'modal-overlay');
    const isEdit = !!existing;

    const dowOpts = [1,2,3,4,5,6].map(n =>
      `<option value="${n}"${(existing ? existing.dayOfWeek : (prefillDow || 1)) === n ? ' selected' : ''}>${_TT_DAY_FULL[n]}</option>`
    ).join('');

    const instrOpts = `<option value="">— None / TBD —</option>` +
      (batch.instructors || []).map(i =>
        `<option value="${i.id}"${existing && existing.instructorId === i.id ? ' selected' : ''}>${i.name} (${capitalize(i.role)})</option>`
      ).join('');

    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${isEdit ? '✎ Edit Class' : '+ Add Class'}</h2>
          <button class="modal-close" id="modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Subject <span style="color:var(--bad)">*</span></label>
            <input type="text" id="f-tt-subject" class="form-input"
              value="${isEdit ? existing.subject : ''}" placeholder="e.g. React Fundamentals">
          </div>
          <div class="form-grid form-grid--2">
            <div class="form-group">
              <label>Day of Week</label>
              <select id="f-tt-dow" class="form-input">${dowOpts}</select>
            </div>
            <div class="form-group">
              <label>Instructor</label>
              <select id="f-tt-instr" class="form-input">${instrOpts}</select>
            </div>
          </div>
          <div class="form-grid form-grid--2">
            <div class="form-group">
              <label>Start Time <span style="color:var(--bad)">*</span></label>
              <input type="time" id="f-tt-start" class="form-input"
                value="${isEdit ? existing.startTime : ''}">
            </div>
            <div class="form-group">
              <label>End Time <span style="color:var(--bad)">*</span></label>
              <input type="time" id="f-tt-end" class="form-input"
                value="${isEdit ? existing.endTime : ''}">
            </div>
          </div>
          <div id="tt-dur-preview" class="tt-dur-preview"></div>
          <div class="form-group" style="display:flex;align-items:center;gap:.65rem;margin-bottom:0">
            <input type="checkbox" id="f-tt-recurring" style="width:15px;height:15px;accent-color:var(--accent)"
              ${(!isEdit || existing.recurring) ? 'checked' : ''}>
            <label for="f-tt-recurring" style="margin:0;font-size:.875rem;color:var(--text)">
              Repeat weekly (recurring)
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm">${isEdit ? 'Save Changes' : 'Add Class'}</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    document.getElementById('f-tt-subject').focus();
    return modal;
  }

  return {
    renderTimetable,
    showTimetableClassModal,
  };

})();
