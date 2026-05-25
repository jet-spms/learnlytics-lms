/**
 * ui-calendar.js — Full Calendar rendering (extracted from ui.js Phase 4A)
 *
 * Depends on: UIIcons (ui-icons.js), UIHelpers (ui-helpers.js)
 * Exports: renderCalendar, showCalendarEventModal
 *          _calExpandEvents, _calFmtTime  (re-used by profile drawer in ui.js)
 */

const UICalendar = (() => {

  const _FI    = UIIcons._FI;
  const _ICONS = UIIcons._ICONS;
  const { _localDateStr, escHtml } = UIHelpers;

  // ─── Cal: Full Calendar (replaces P3 Timetable UI) ───────────────────────

  // Short/full day labels (0=Sun … 6=Sat, index 7=Sun alias for Monday-first grids)
  const _CAL_DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const _CAL_DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const _CAL_MONTHS    = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
  const _CAL_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                              'Jul','Aug','Sep','Oct','Nov','Dec'];

  // 10 event colours → CSS class suffix (e.g. .cal-ev--blue)
  const _CAL_COLORS = ['blue','purple','green','red','orange','teal','pink','yellow','indigo','slate'];

  /**
   * Expands the flat calendarEvents array into concrete dated occurrences
   * that fall within [startISO, endISO] (inclusive).
   * Returns array of occurrence objects:
   *   { id, eventId, title, type, date:'YYYY-MM-DD', startTime, endTime,
   *     color, instructorId, description, isException, isCancelled }
   */
  function _calExpandEvents(events, startISO, endISO) {
    const result  = [];
    const startMs = new Date(startISO + 'T00:00:00').getTime();
    const endMs   = new Date(endISO   + 'T23:59:59').getTime();

    events.forEach(ev => {
      if (ev.type === 'once' || ev.type === 'allday') {
        if (!ev.date) return;
        const ms = new Date(ev.date + 'T12:00:00').getTime();
        if (ms < startMs || ms > endMs) return;
        result.push({ ...ev, eventId: ev.id, date: ev.date,
                      isException: false, isCancelled: false });

      } else {
        // recurring — walk every day in the range
        const cur    = new Date(startISO + 'T12:00:00');
        const end    = new Date(endISO   + 'T12:00:00');
        // If the event has an endDate, cap the walk at that date
        const endCap = ev.endDate ? new Date(ev.endDate + 'T12:00:00') : null;
        while (cur <= end) {
          // Stop generating once we reach endDate (exclusive — endDate is the first omitted date)
          if (endCap && cur >= endCap) break;
          const iso = cur.toISOString().split('T')[0];
          const dow = cur.getDay() === 0 ? 7 : cur.getDay(); // 1=Mon…7=Sun
          const evDow = ev.dayOfWeek === 0 ? 7 : ev.dayOfWeek;
          if (dow === evDow) {
            // Check for exception on this date
            const exc = (ev.exceptions || []).find(x => x.originalDate === iso);
            if (exc) {
              if (exc.newDate === null) {
                // cancelled occurrence — skip it
              } else {
                result.push({ ...ev, eventId: ev.id,
                  date: exc.newDate || iso,
                  originalDate: iso,          // original date before move (needed for exception ops)
                  startTime: exc.newStartTime || ev.startTime,
                  endTime:   exc.newEndTime   || ev.endTime,
                  isException: true, isCancelled: false });
              }
            } else {
              result.push({ ...ev, eventId: ev.id, date: iso,
                            originalDate: iso,
                            isException: false, isCancelled: false });
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    });

    return result.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });
  }

  /** Format 'HH:MM' → '9:00 AM' */
  function _calFmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  /** Returns ISO date string for Monday of the week containing iso. */
  function _calWeekStart(iso) {
    const d   = new Date(iso + 'T12:00:00');
    const dow = d.getDay(); // 0=Sun
    const toMon = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + toMon);
    return d.toISOString().split('T')[0];
  }

  /** Inline SVG chip for an event (color bar + title + time). */
  function _calEventChip(occ, batchId, compact = false) {
    const time = occ.type === 'allday' ? 'All day'
      : (occ.startTime ? _calFmtTime(occ.startTime) : '');
    const today  = _localDateStr();
    const isPast = occ.date < today;
    return `
      <div class="cal-ev cal-ev--${occ.color}${compact ? ' cal-ev--compact' : ''}${isPast ? ' cal-ev--past' : ''}"
           data-action="cal-chip-menu" data-eid="${occ.eventId}" data-bid="${batchId}"
           data-date="${occ.date}" data-orig-date="${occ.originalDate || occ.date}"
           title="${escHtml(occ.title)}${time ? ' · ' + time : ''}">
        <span class="cal-ev-dot"></span>
        <span class="cal-ev-title">${escHtml(occ.title)}</span>
        ${!compact && time ? `<span class="cal-ev-time">${time}</span>` : ''}
      </div>`;
  }

  // ── Month view ─────────────────────────────────────────────────────────────

  function _calMonthHTML(batch, calDate, batchId) {
    const ref     = new Date(calDate + 'T12:00:00');
    const year    = ref.getFullYear();
    const month   = ref.getMonth();
    const today   = _localDateStr();

    // Range: entire month + overflow days shown in grid
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);
    // Monday-first: offset of 1st day
    const startOffset  = (firstOfMonth.getDay() + 6) % 7; // 0=Mon
    const totalCells   = Math.ceil((startOffset + lastOfMonth.getDate()) / 7) * 7;

    // Build range: from (1st - startOffset) to end of grid
    // NOTE: gridStart/gridEnd are local-midnight dates; use _localDateStr() not
    // toISOString() to avoid UTC date-flip for UTC+ timezones.
    const gridStart = new Date(firstOfMonth); gridStart.setDate(1 - startOffset);
    const gridEnd   = new Date(gridStart);    gridEnd.setDate(gridStart.getDate() + totalCells - 1);
    const startISO  = _localDateStr(gridStart);
    const endISO    = _localDateStr(gridEnd);

    const occurrences = _calExpandEvents(batch.calendarEvents || [], startISO, endISO);
    // Group by date
    const byDate = {};
    occurrences.forEach(o => { (byDate[o.date] = byDate[o.date] || []).push(o); });

    // Day-of-week headers (Mon–Sun)
    const dowHdr = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      .map(d => `<div class="cal-month-dow">${d}</div>`).join('');

    let cells = '';
    for (let i = 0; i < totalCells; i++) {
      const d   = new Date(gridStart); d.setDate(gridStart.getDate() + i);
      const iso = _localDateStr(d);
      const isCurrentMonth = d.getMonth() === month;
      const isToday        = iso === today;
      const dayEvs         = byDate[iso] || [];
      const maxShow        = 3;
      const shown          = dayEvs.slice(0, maxShow);
      const overflow       = dayEvs.length - maxShow;

      cells += `
        <div class="cal-month-cell${isCurrentMonth ? '' : ' cal-month-cell--out'}${isToday ? ' cal-month-cell--today' : ''}">
          <div class="cal-month-cell-hdr">
            <span class="cal-month-day-num${isToday ? ' cal-month-day-num--today' : ''}"
                  data-action="cal-day-click" data-date="${iso}" data-bid="${batchId}">
              ${d.getDate()}
            </span>
            <button class="cal-month-add-btn" data-action="cal-new-event"
                    data-date="${iso}" data-bid="${batchId}" title="Add event">+</button>
          </div>
          <div class="cal-month-events">
            ${shown.map(o => _calEventChip(o, batchId, true)).join('')}
            ${overflow > 0 ? `<div class="cal-month-more" data-action="cal-day-click"
              data-date="${iso}" data-bid="${batchId}">+${overflow} more</div>` : ''}
          </div>
        </div>`;
    }

    return `<div class="cal-month-grid">${dowHdr}${cells}</div>`;
  }

  // ── Week view ──────────────────────────────────────────────────────────────

  function _calWeekHTML(batch, calDate, batchId) {
    const monISO  = _calWeekStart(calDate);
    const today   = _localDateStr();
    const now     = new Date();

    // Build 7 dates Mon–Sun
    const weekDates = Array.from({length: 7}, (_, i) => {
      const d = new Date(monISO + 'T12:00:00'); d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });

    const occurrences = _calExpandEvents(batch.calendarEvents || [], weekDates[0], weekDates[6]);
    const byDate = {};
    occurrences.forEach(o => { (byDate[o.date] = byDate[o.date] || []).push(o); });

    const HOUR_START = 6, HOUR_END = 22, TOTAL_HOURS = HOUR_END - HOUR_START;

    // All-day strip
    const alldayEvs = occurrences.filter(o => o.type === 'allday');

    // Column headers
    const colHeaders = weekDates.map(iso => {
      const d = new Date(iso + 'T12:00:00');
      const isToday = iso === today;
      return `
        <div class="cal-week-col-hdr${isToday ? ' cal-week-col-hdr--today' : ''}">
          <span class="cal-week-dow">${_CAL_DAY_SHORT[d.getDay()]}</span>
          <span class="cal-week-daynum${isToday ? ' cal-week-daynum--today' : ''}"
                data-action="cal-day-click" data-date="${iso}" data-bid="${batchId}">
            ${d.getDate()}
          </span>
        </div>`;
    }).join('');

    // All-day row
    const alldayRow = weekDates.map(iso => {
      const evs = alldayEvs.filter(o => o.date === iso);
      return `<div class="cal-week-allday-cell">
        ${evs.map(o => _calEventChip(o, batchId, true)).join('')}
      </div>`;
    }).join('');

    // Hour rows
    let hourRows = '';
    for (let h = HOUR_START; h < HOUR_END; h++) {
      const label = _calFmtTime(`${String(h).padStart(2,'0')}:00`);
      const cols  = weekDates.map(iso => {
        const evs = (byDate[iso] || []).filter(o => o.type !== 'allday' && o.startTime);
        // find events that START in this hour
        const starting = evs.filter(o => parseInt(o.startTime) === h);
        return `<div class="cal-week-time-cell" data-action="cal-new-event"
                     data-date="${iso}" data-bid="${batchId}" data-dow="">
          ${starting.map(o => {
            const [sh,sm] = o.startTime.split(':').map(Number);
            const [eh,em] = o.endTime.split(':').map(Number);
            const topPct  = (sm / 60) * 100;
            const durMins = Math.max((eh*60+em) - (sh*60+sm), 30);
            const hPct    = (durMins / 60) * 100;
            return `<div class="cal-week-event cal-ev--${o.color}"
                         style="top:${topPct}%;height:${hPct}%"
                         data-action="cal-chip-menu" data-eid="${o.eventId}" data-bid="${batchId}"
                         data-date="${o.date}" data-orig-date="${o.originalDate || o.date}">
              <span class="cal-week-ev-title">${escHtml(o.title)}</span>
              <span class="cal-week-ev-time">${_calFmtTime(o.startTime)}</span>
            </div>`;
          }).join('')}
        </div>`;
      }).join('');
      hourRows += `
        <div class="cal-week-row">
          <div class="cal-week-time-label">${label}</div>
          ${cols}
        </div>`;
    }

    // Current time indicator (only on today's column)
    const todayIdx  = weekDates.indexOf(today);
    const nowPct    = todayIdx >= 0
      ? ((now.getHours() - HOUR_START) * 60 + now.getMinutes()) / (TOTAL_HOURS * 60) * 100
      : -1;

    return `
      <div class="cal-week-wrap">
        <div class="cal-week-hdr-row">
          <div class="cal-week-time-gutter"></div>
          ${colHeaders}
        </div>
        <div class="cal-week-allday-row">
          <div class="cal-week-time-gutter cal-week-allday-label">All day</div>
          ${alldayRow}
        </div>
        <div class="cal-week-scroll">
          <div class="cal-week-grid">
            ${nowPct >= 0 ? `<div class="cal-now-line" style="top:${nowPct}%;left:calc((100% / 7) * ${todayIdx} + 56px);width:calc(100% / 7)"></div>` : ''}
            ${hourRows}
          </div>
        </div>
      </div>`;
  }

  // ── Day view ───────────────────────────────────────────────────────────────

  function _calDayHTML(batch, calDate, batchId) {
    const today = _localDateStr();
    const d     = new Date(calDate + 'T12:00:00');
    const HOUR_START = 6, HOUR_END = 22, TOTAL_HOURS = HOUR_END - HOUR_START;
    const now = new Date();

    const occurrences = _calExpandEvents(batch.calendarEvents || [], calDate, calDate);
    const alldayEvs   = occurrences.filter(o => o.type === 'allday');
    const timedEvs    = occurrences.filter(o => o.type !== 'allday' && o.startTime);

    let hourRows = '';
    for (let h = HOUR_START; h < HOUR_END; h++) {
      const label    = _calFmtTime(`${String(h).padStart(2,'0')}:00`);
      const starting = timedEvs.filter(o => parseInt(o.startTime) === h);
      hourRows += `
        <div class="cal-day-row">
          <div class="cal-week-time-label">${label}</div>
          <div class="cal-day-col" data-action="cal-new-event"
               data-date="${calDate}" data-bid="${batchId}">
            ${starting.map(o => {
              const [sh,sm] = o.startTime.split(':').map(Number);
              const [eh,em] = o.endTime.split(':').map(Number);
              const topPct  = (sm / 60) * 100;
              const durMins = Math.max((eh*60+em) - (sh*60+sm), 30);
              const hPct    = (durMins / 60) * 100;
              return `<div class="cal-week-event cal-ev--${o.color}"
                           style="top:${topPct}%;height:${hPct}%"
                           data-action="cal-chip-menu" data-eid="${o.eventId}" data-bid="${batchId}"
                           data-date="${o.date}" data-orig-date="${o.originalDate || o.date}">
                <span class="cal-week-ev-title">${escHtml(o.title)}</span>
                <span class="cal-week-ev-time">${_calFmtTime(o.startTime)} – ${_calFmtTime(o.endTime)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    const isToday = calDate === today;
    const nowPct  = isToday
      ? ((now.getHours() - HOUR_START) * 60 + now.getMinutes()) / (TOTAL_HOURS * 60) * 100
      : -1;

    return `
      <div class="cal-week-wrap cal-day-wrap">
        <div class="cal-week-allday-row">
          <div class="cal-week-time-gutter cal-week-allday-label">All day</div>
          <div class="cal-week-allday-cell" style="flex:1">
            ${alldayEvs.map(o => _calEventChip(o, batchId, true)).join('')}
          </div>
        </div>
        <div class="cal-week-scroll">
          <div class="cal-week-grid cal-day-grid">
            ${nowPct >= 0 ? `<div class="cal-now-line" style="top:${nowPct}%;left:56px;right:0"></div>` : ''}
            ${hourRows}
          </div>
        </div>
      </div>`;
  }

  // ── Year view ──────────────────────────────────────────────────────────────

  function _calYearHTML(batch, calDate, batchId) {
    const year   = new Date(calDate + 'T12:00:00').getFullYear();
    const today  = _localDateStr();
    const startISO = `${year}-01-01`, endISO = `${year}-12-31`;
    const occs   = _calExpandEvents(batch.calendarEvents || [], startISO, endISO);
    const byDate = {};
    occs.forEach(o => { (byDate[o.date] = byDate[o.date] || []).push(o); });

    const months = Array.from({length: 12}, (_, m) => {
      const firstDow   = (new Date(year, m, 1).getDay() + 6) % 7; // Monday-first
      const daysInMo   = new Date(year, m + 1, 0).getDate();
      const daysInPrev = new Date(year, m, 0).getDate();
      const totalCells = Math.ceil((firstDow + daysInMo) / 7) * 7;

      const dowHdr = ['M','T','W','T','F','S','S']
        .map(d => `<div class="cal-yr-dow">${d}</div>`).join('');

      let cells = '';
      for (let i = 0; i < firstDow; i++) {
        cells += `<div class="cal-yr-cell cal-yr-cell--out"><span>${daysInPrev - (firstDow - 1 - i)}</span></div>`;
      }
      for (let day = 1; day <= daysInMo; day++) {
        const iso      = `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday  = iso === today;
        const hasEvs   = (byDate[iso] || []).length > 0;
        const dotColor = hasEvs ? (byDate[iso][0].color || 'blue') : '';
        cells += `<div class="cal-yr-cell${isToday ? ' cal-yr-cell--today' : ''}${hasEvs ? ' cal-yr-cell--has-event' : ''}"
                       data-action="cal-day-click" data-date="${iso}" data-bid="${batchId}">
          <span class="cal-yr-day">${day}</span>
          ${hasEvs ? `<span class="cal-yr-dot cal-yr-dot--${dotColor}"></span>` : ''}
        </div>`;
      }
      for (let nd = 1; nd <= totalCells - firstDow - daysInMo; nd++) {
        cells += `<div class="cal-yr-cell cal-yr-cell--out"><span>${nd}</span></div>`;
      }

      return `
        <div class="cal-yr-month">
          <div class="cal-yr-month-name" data-action="cal-view-month"
               data-date="${year}-${String(m+1).padStart(2,'0')}-01"
               data-bid="${batchId}">${_CAL_MONTHS[m]}</div>
          <div class="cal-yr-grid">${dowHdr}${cells}</div>
        </div>`;
    });

    return `<div class="cal-year-wrap">${months.join('')}</div>`;
  }

  // ── Agenda view ────────────────────────────────────────────────────────────

  function _calAgendaHTML(batch, calDate, batchId) {
    const endDate = new Date(calDate + 'T12:00:00');
    endDate.setDate(endDate.getDate() + 59);  // 60-day window
    const endISO  = endDate.toISOString().split('T')[0];
    const today   = _localDateStr();

    const occs = _calExpandEvents(batch.calendarEvents || [], calDate, endISO);

    if (!occs.length) {
      return `<div class="empty-state" style="padding:3rem 0">
        <div class="empty-state-icon">${_ICONS.calendar}</div>
        <p class="empty-state-text">No events in the next 60 days</p>
        <button class="btn btn-primary" data-action="cal-new-event"
                data-date="${calDate}" data-bid="${batchId}">+ New Event</button>
      </div>`;
    }

    // Group by date
    const byDate = {};
    occs.forEach(o => { (byDate[o.date] = byDate[o.date] || []).push(o); });

    return Object.entries(byDate).map(([iso, evs]) => {
      const d       = new Date(iso + 'T12:00:00');
      const isToday = iso === today;
      const label   = isToday
        ? 'Today'
        : d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

      return `
        <div class="cal-agenda-group">
          <div class="cal-agenda-date${isToday ? ' cal-agenda-date--today' : ''}">${label}</div>
          ${evs.map(o => {
            const time = o.type === 'allday' ? 'All day'
              : `${_calFmtTime(o.startTime)} – ${_calFmtTime(o.endTime)}`;
            const instr = (batch.instructors || []).find(i => i.id === o.instructorId);
            return `
              <div class="cal-agenda-item">
                <div class="cal-agenda-bar cal-ev--${o.color}"></div>
                <div class="cal-agenda-body">
                  <div class="cal-agenda-title">${escHtml(o.title)}</div>
                  <div class="cal-agenda-meta">
                    <span>${time}</span>
                    ${instr ? `<span class="cal-agenda-instr">${escHtml(instr.name)}</span>` : ''}
                    ${o.isException ? '<span class="cal-agenda-exc">moved</span>' : ''}
                  </div>
                </div>
                <div class="cal-agenda-actions">
                  <button class="btn-icon" data-action="cal-edit-event"
                          data-eid="${o.eventId}" data-bid="${batchId}" title="Edit">${_ICONS.pencil}</button>
                  <button class="btn-icon btn-icon--danger" data-action="cal-delete-event"
                          data-eid="${o.eventId}" data-bid="${batchId}"
                          data-date="${o.date}" data-orig-date="${o.originalDate || o.date}"
                          title="Delete">${_ICONS.trash}</button>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
  }

  // ── Nav label helper ───────────────────────────────────────────────────────

  function _calNavLabel(viewMode, calDate) {
    const d = new Date(calDate + 'T12:00:00');
    switch (viewMode) {
      case 'day':
        return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
      case 'week': {
        const mon = new Date(_calWeekStart(calDate) + 'T12:00:00');
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${sun.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
      }
      case 'month':
        return `${_CAL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      case 'year':
        return `${d.getFullYear()}`;
      case 'agenda':
        return `From ${d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
      default:
        return '';
    }
  }

  // ── Main entry-point ───────────────────────────────────────────────────────

  /**
   * Cal: Main calendar renderer.  Replaces renderTimetable().
   * Renders the view shell (toolbar + body) into #main-content.
   */
  // readOnly  — hides + New Event and disables event-chip clicks (student view)
  // containerId — target element id; defaults to trainer's 'main-content'
  function renderCalendar(batch, viewMode, calDate, readOnly = false, containerId = 'main-content') {
    const main = document.getElementById(containerId);
    if (!main) return;
    const batchId = batch.id;
    const views = ['day','week','month','year','agenda'];
    const viewTabs = `
      <select class="cal-view-select" data-bid="${batchId}">
        ${views.map(v => `<option value="${v}"${viewMode === v ? ' selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
      </select>`;

    let bodyHTML;
    switch (viewMode) {
      case 'month':  bodyHTML = _calMonthHTML(batch, calDate, batchId); break;
      case 'week':   bodyHTML = _calWeekHTML(batch, calDate, batchId);  break;
      case 'day':    bodyHTML = _calDayHTML(batch, calDate, batchId);   break;
      case 'year':   bodyHTML = _calYearHTML(batch, calDate, batchId);  break;
      case 'agenda': bodyHTML = _calAgendaHTML(batch, calDate, batchId);break;
      default:       bodyHTML = _calMonthHTML(batch, calDate, batchId);
    }

    main.innerHTML = `
      <div class="cal-shell${readOnly ? ' cal-shell--readonly' : ''}">
        <div class="cal-toolbar">
          <div class="cal-toolbar-left">
            <button class="btn btn-outline btn-sm" data-action="cal-prev" data-bid="${batchId}">&#8249;</button>
            <button class="btn btn-outline btn-sm cal-today-btn" data-action="cal-today" data-bid="${batchId}">Today</button>
            <button class="btn btn-outline btn-sm" data-action="cal-next" data-bid="${batchId}">&#8250;</button>
            <span class="cal-nav-label">${_calNavLabel(viewMode, calDate)}</span>
          </div>
          <div class="cal-toolbar-right">
            ${viewTabs}
            ${readOnly ? '' : `<button class="btn btn-primary btn-sm" data-action="cal-new-event"
                    data-date="${calDate}" data-bid="${batchId}">+ New Event</button>`}
          </div>
        </div>
        <div class="cal-body">${bodyHTML}</div>
      </div>`;
  }

  // ── 12-hour time picker helpers ────────────────────────────────────────────

  /** Convert 24h "HH:MM" string to { h:1-12, m:0-59, ampm:'AM'|'PM' } */
  function _to12h(hhmm) {
    if (!hhmm) return { h: 12, m: 0, ampm: 'AM' };
    const [h24, m] = hhmm.split(':').map(Number);
    const ampm = h24 < 12 ? 'AM' : 'PM';
    const h12  = h24 % 12 || 12;
    return { h: h12, m, ampm };
  }

  /** Generate three-select 12h time picker HTML for a given idPrefix and 24h value. */
  function _timePickerHTML(idPrefix, value24h) {
    const { h, m, ampm } = _to12h(value24h);
    const hourOpts = Array.from({ length: 12 }, (_, i) => {
      const v = i + 1;
      return `<option value="${v}"${v === h ? ' selected' : ''}>${String(v).padStart(2,'0')}</option>`;
    }).join('');
    const minOpts = [0,5,10,15,20,25,30,35,40,45,50,55].map(v => {
      const padded = String(v).padStart(2,'0');
      return `<option value="${padded}"${v === m ? ' selected' : ''}>${padded}</option>`;
    }).join('');
    const ampmOpts = ['AM','PM'].map(v =>
      `<option value="${v}"${v === ampm ? ' selected' : ''}>${v}</option>`).join('');
    return `
      <div class="cal-time-picker">
        <select id="${idPrefix}-h" class="form-input cal-time-sel">${hourOpts}</select>
        <span class="cal-time-sep">:</span>
        <select id="${idPrefix}-m" class="form-input cal-time-sel">${minOpts}</select>
        <select id="${idPrefix}-ampm" class="form-input cal-time-sel cal-time-sel--ampm">${ampmOpts}</select>
      </div>`;
  }

  // ── Event creation / edit modal ────────────────────────────────────────────

  function showCalendarEventModal(batch, existing, prefillDate, prefillDow) {
    const isEdit  = !!existing;
    const instrOpts = `<option value="">— None / TBD —</option>` +
      (batch.instructors || []).map(i =>
        `<option value="${i.id}"${existing?.instructorId === i.id ? ' selected' : ''}>${escHtml(i.name)}</option>`
      ).join('');

    const dowOpts = [1,2,3,4,5,6,7].map(n => {
      const labels = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const sel = existing ? existing.dayOfWeek === n : (prefillDow || 1) === n;
      return `<option value="${n}"${sel ? ' selected' : ''}>${labels[n]}</option>`;
    }).join('');

    const colorChips = _CAL_COLORS.map(c => `
      <button type="button" class="cal-color-chip cal-color-chip--${c}${(existing?.color||'blue')===c?' cal-color-chip--selected':''}"
              data-color="${c}" title="${c}"></button>`).join('');

    const curType  = existing?.type || 'recurring';
    const curDate  = existing?.date || prefillDate || '';
    const curStart = existing?.startTime || '';
    const curEnd   = existing?.endTime   || '';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal cal-event-modal">
        <div class="modal-header">
          <h2>${isEdit ? 'Edit Event' : 'New Event'}</h2>
          <button class="modal-close" id="cal-modal-close">${_ICONS.close}</button>
        </div>
        <div class="modal-body">

          <div class="form-group">
            <label class="form-label">Title <span style="color:var(--bad)">*</span></label>
            <input id="cal-f-title" class="form-input" type="text"
                   value="${escHtml(existing?.title||'')}" placeholder="e.g. React Workshop" autocomplete="off">
          </div>

          <div class="form-group">
            <label class="form-label">Type</label>
            <div class="cal-type-pills">
              ${['recurring','once','allday'].map(t => `
                <label class="cal-type-pill${curType===t?' cal-type-pill--active':''}">
                  <input type="radio" name="cal-type" value="${t}"${curType===t?' checked':''} hidden>
                  ${t==='recurring'?'Recurring':t==='once'?'One-time':'All-day'}
                </label>`).join('')}
            </div>
          </div>

          <div id="cal-f-dow-group" class="form-group"${curType!=='recurring'?' style="display:none"':''}>
            <label class="form-label">Day of Week</label>
            <select id="cal-f-dow" class="form-input">${dowOpts}</select>
          </div>

          <div id="cal-f-date-group" class="form-group"${curType==='recurring'?' style="display:none"':''}>
            <label class="form-label">Date <span style="color:var(--bad)">*</span></label>
            <input id="cal-f-date" class="form-input" type="date" value="${curDate}">
          </div>

          <div id="cal-f-time-group" class="form-grid form-grid--2"${curType==='allday'?' style="display:none"':''}>
            <div class="form-group">
              <label class="form-label">Start Time</label>
              ${_timePickerHTML('cal-f-start', curStart)}
            </div>
            <div class="form-group">
              <label class="form-label">End Time</label>
              ${_timePickerHTML('cal-f-end', curEnd)}
            </div>
          </div>
          <div id="cal-dur-preview" class="tt-dur-preview"></div>

          <div class="form-group">
            <label class="form-label">Instructor</label>
            <select id="cal-f-instr" class="form-input">${instrOpts}</select>
          </div>

          <div class="form-group">
            <label class="form-label">Color</label>
            <div class="cal-color-picker">${colorChips}</div>
          </div>

          <div class="form-group">
            <label class="form-label">Description <span style="color:var(--text3);font-weight:400">(optional)</span></label>
            <textarea id="cal-f-desc" class="form-input" rows="2"
                      placeholder="Notes, location, etc.">${escHtml(existing?.description||'')}</textarea>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cal-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="cal-modal-confirm">${isEdit?'Save Changes':'Add Event'}</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // Type pill toggle — show/hide field groups
    modal.querySelectorAll('input[name="cal-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const t = radio.value;
        modal.querySelectorAll('.cal-type-pill').forEach(p => p.classList.remove('cal-type-pill--active'));
        radio.closest('.cal-type-pill').classList.add('cal-type-pill--active');
        document.getElementById('cal-f-dow-group').style.display  = t === 'recurring' ? '' : 'none';
        document.getElementById('cal-f-date-group').style.display = t !== 'recurring' ? '' : 'none';
        document.getElementById('cal-f-time-group').style.display = t === 'allday'    ? 'none' : '';
      });
    });

    // Color chip selection
    modal.querySelectorAll('.cal-color-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('.cal-color-chip').forEach(c => c.classList.remove('cal-color-chip--selected'));
        chip.classList.add('cal-color-chip--selected');
      });
    });

    document.getElementById('cal-f-title')?.focus();
    return modal;
  }

  return {
    renderCalendar,
    showCalendarEventModal,
    _calExpandEvents,
    _calFmtTime,
  };

})();
