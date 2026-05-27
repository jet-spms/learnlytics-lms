/**
 * ui-nav-sidebar.js — Nav sidebar renderers (extracted from ui.js Phase 4C)
 *
 * Depends on: UIIcons (ui-icons.js), UIHelpers (ui-helpers.js),
 *             Storage (storage.js — global, loaded before all ui modules)
 *
 * Exports:
 *   setNavSection, setNavMode, toggleNavGroup,
 *   renderNavSidebar, renderSidebar, toggleSidebar,
 *   openNavFlyout, closeNavFlyout
 */

const UINavSidebar = (() => {

  const _ICONS = UIIcons._ICONS;
  const { escHtml, _makeAvatarBg, _makeInitials } = UIHelpers;

  // ─── Mutable nav state ────────────────────────────────────────────────────

  let _currentNavSection = 'dashboard';
  let _currentNavMode    = 'trainer'; // 'trainer' | 'admin'

  function setNavSection(section) {
    _currentNavSection = section;
    const allNavs = [..._TRAINER_NAV, ..._ADMIN_NAV];
    const parent  = allNavs.find(e => e.type === 'group' && e.children?.some(c => c.id === section));
    if (parent) {
      _openNavGroups.clear();
      _openNavGroups.add(parent.id);
    }
  }
  function setNavMode(mode) { _currentNavMode = mode; }

  // Tracks which collapsible groups are expanded (survives re-renders)
  let _openNavGroups = new Set(['attendance']);

  function toggleNavGroup(groupId) {
    if (_openNavGroups.has(groupId)) {
      _openNavGroups.delete(groupId);
    } else {
      _openNavGroups.clear();
      _openNavGroups.add(groupId);
    }
  }

  // ─── Nav structure definitions ────────────────────────────────────────────

  const _TRAINER_NAV = [
    { type: 'item',  id: 'dashboard',       label: 'Dashboard',         icon: _ICONS.dashboard },
    { type: 'item',  id: 'manage-batch',    label: 'Manage Batch',      icon: _ICONS.manageBatch },
    { type: 'group', id: 'attendance',      label: 'Attendance',        icon: _ICONS.attendance,
      children: [
        { id: 'attendance-take',    label: 'Take Attendance'    },
        { id: 'attendance-holiday', label: 'Add Holiday'        },
        { id: 'attendance-history', label: 'Attendance History' },
      ]
    },
    { type: 'item',  id: 'timetable',      label: 'Timetable',         icon: _ICONS.clipboard },
    { type: 'group', id: 'presentation',    label: 'Presentation',      icon: _ICONS.presentation,
      children: [
        { id: 'presentation-today',   label: "Today's Schedule"  },
        { id: 'presentation-monthly', label: 'Monthly Dashboard' },
      ]
    },
    { type: 'group', id: 'academics',       label: 'Academics',         icon: _ICONS.academics,
      children: [
        { id: 'academics-tests',         label: 'Weekly Tests'   },
        { id: 'academics-exams',         label: 'Module Exams'   },
        { id: 'academics-question-bank', label: 'Question Bank'  },
        { id: 'academics-tests-mgmt',    label: 'Tests'          },
      ]
    },
    { type: 'group', id: 'mock-interviews', label: 'Mock Interviews',   icon: _ICONS.mock,
      children: [
        { id: 'mock-manual',  label: 'Manual Mock Score' },
        { id: 'mock-ai',      label: 'AI Mock Score'     },
        { id: 'mock-history', label: 'Mock History'      },
      ]
    },
    { type: 'group', id: 'student-remarks', label: 'Student Remarks',   icon: _ICONS.remarks,
      children: [
        { id: 'remarks-calls', label: 'Call Records'  },
        { id: 'remarks-notes', label: 'Student Notes' },
      ]
    },
    { type: 'item',  id: 'reminders', label: 'Reminders & Tasks', icon: _ICONS.reminders },
  ];

  const _ADMIN_NAV = [
    { type: 'item',  id: 'admin-dashboard', label: 'Dashboard', icon: _ICONS.dashboard },
    { type: 'group', id: 'admin-users',    label: 'Users',    icon: _ICONS.users,
      children: [
        { id: 'admin-manage-users', label: 'Manage Users'   },
        { id: 'admin-scoring',      label: 'Scoring Config' },
      ]
    },
    { type: 'group', id: 'admin-batches',  label: 'Batches',  icon: _ICONS.allBatches,
      children: [
        { id: 'admin-all-batches', label: 'All Batches' },
      ]
    },
    { type: 'item',  id: 'admin-reports',  label: 'Reports',  icon: _ICONS.download },
    { type: 'group', id: 'admin-system',   label: 'System',   icon: _ICONS.sync,
      children: [
        { id: 'admin-backup', label: 'Backup / Restore' },
        { id: 'admin-sync',   label: 'Sync Status'      },
      ]
    },
  ];

  // ─── Private helpers ──────────────────────────────────────────────────────

  function _navBatchSelectorHTML(batches, activeBatch, compact) {
    if (compact) {
      const initial = activeBatch ? (activeBatch.batchCode || activeBatch.name).charAt(0).toUpperCase() : '?';
      return `
        <div class="nsb-batch-compact" id="nav-batch-trigger" title="${activeBatch ? (activeBatch.batchCode || activeBatch.name) : 'Select batch'}">
          <span class="nsb-batch-avatar">${initial}</span>
        </div>`;
    }
    const label = activeBatch
      ? (activeBatch.batchCode ? activeBatch.batchCode : activeBatch.name)
      : 'Select a batch…';
    const activeBatches   = batches;
    const archivedBatches = Storage.getArchivedBatches();

    const activeHTML = activeBatches.length
      ? activeBatches.map(b => `
          <li class="nsb-batch-opt${b.id === activeBatch?.id ? ' nsb-batch-opt--active' : ''}" data-batch-id="${b.id}">
            <span class="nsb-opt-avatar">${(b.batchCode || b.name).charAt(0).toUpperCase()}</span>
            <span class="nsb-opt-label">${escHtml(b.batchCode || b.name)}</span>
            <span class="nsb-opt-count">${b.students.length}</span>
          </li>`).join('')
      : '<li class="nsb-batch-empty">No batches</li>';

    const archivedHTML = archivedBatches.length ? `
      <li class="nsb-batch-group-label">Archived</li>
      ${archivedBatches.map(b => `
        <li class="nsb-batch-opt nsb-batch-opt--archived${b.id === activeBatch?.id ? ' nsb-batch-opt--active' : ''}" data-batch-id="${b.id}">
          <span class="nsb-opt-avatar">${(b.batchCode || b.name).charAt(0).toUpperCase()}</span>
          <span class="nsb-opt-label">${escHtml(b.batchCode || b.name)}</span>
          <span class="nsb-opt-count">${b.students.length}</span>
        </li>`).join('')}` : '';

    return `
      <div class="nsb-batch-selector" id="nav-batch-selector">
        <button class="nsb-batch-trigger" id="nav-batch-trigger" type="button">
          <span class="nsb-batch-avatar">${activeBatch ? (activeBatch.batchCode || activeBatch.name).charAt(0).toUpperCase() : '▤'}</span>
          <span class="nsb-batch-label">${escHtml(label)}</span>
          <svg class="nsb-batch-chevron" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="nsb-batch-dropdown" id="nav-batch-dropdown" style="display:none">
          <div class="nsb-batch-search-wrap">
            <input class="nsb-batch-search" id="nav-batch-search" type="text" placeholder="Search batches…" autocomplete="off" aria-label="Search batches">
          </div>
          <ul class="nsb-batch-list" id="nav-batch-list">
            ${activeHTML}${archivedHTML}
          </ul>
          <div class="nsb-batch-add-row">
            <button class="nsb-btn-new-batch" id="btn-new-batch" type="button">+ New Batch</button>
          </div>
        </div>
      </div>`;
  }

  function _navItemsHTML(navDef, navSection, compact, openTaskCount = 0) {
    return navDef.map(entry => {
      if (entry.type === 'item') {
        const active   = entry.id === navSection;
        const upcoming = !!entry.upcoming;
        const tip      = compact ? entry.label : (upcoming ? 'Coming soon' : '');
        const showTaskBadge = entry.id === 'reminders' && openTaskCount > 0 && !upcoming;
        const badgeHTML = upcoming && !compact
          ? '<span class="nsb-item-badge" aria-hidden="true">Soon</span>'
          : showTaskBadge
            ? `<span class="nsb-item-badge nsb-item-badge--count" aria-label="${openTaskCount} open tasks">${openTaskCount > 99 ? '99+' : openTaskCount}</span>`
            : '';
        return `
          <div class="nsb-item${active ? ' nsb-item--active' : ''}${upcoming ? ' nsb-item--upcoming' : ''}"
               role="${upcoming ? 'button' : 'link'}"
               tabindex="${upcoming ? '-1' : '0'}"
               ${upcoming ? 'aria-disabled="true"' : ''}
               ${active ? 'aria-current="page"' : ''}
               ${upcoming ? '' : `data-nav="${entry.id}"`}
               ${tip ? `title="${tip}" aria-label="${tip}"` : `aria-label="${entry.label}"`}>
            <span class="nsb-item-icon" aria-hidden="true">${entry.icon}</span>
            ${compact ? '' : `<span class="nsb-item-label">${entry.label}</span>`}
            ${badgeHTML}
          </div>`;
      }

      if (entry.type === 'group') {
        const isOpen       = _openNavGroups.has(entry.id);
        const hasActive    = entry.children?.some(c => c.id === navSection);
        const parentActive = hasActive;
        const childrenId   = `nsb-children-${entry.id}`;

        if (compact) {
          return `
            <div class="nsb-item${hasActive ? ' nsb-item--active' : ''}" data-nav-group="${entry.id}"
                 role="button" tabindex="0"
                 aria-label="${entry.label}" title="${entry.label}">
              <span class="nsb-item-icon" aria-hidden="true">${entry.icon}</span>
            </div>`;
        }

        const childrenHTML = (entry.children || []).map(child => {
          const childActive = child.id === navSection;
          return `
            <div class="nsb-child${childActive ? ' nsb-child--active' : ''}" data-nav="${child.id}"
                 role="link" tabindex="0"
                 ${childActive ? 'aria-current="page"' : ''}
                 aria-label="${child.label}">
              <span class="nsb-child-dot" aria-hidden="true"></span>
              <span class="nsb-child-label">${child.label}</span>
            </div>`;
        }).join('');

        return `
          <div class="nsb-group-wrap${isOpen ? ' nsb-group-wrap--open' : ''}">
            <div class="nsb-item nsb-group-parent${parentActive ? ' nsb-item--active' : ''}"
                 data-nav-group="${entry.id}"
                 role="button" tabindex="0"
                 aria-expanded="${isOpen ? 'true' : 'false'}"
                 aria-controls="${childrenId}"
                 aria-label="${entry.label}">
              <span class="nsb-item-icon" aria-hidden="true">${entry.icon}</span>
              <span class="nsb-item-label">${entry.label}</span>
              <span class="nsb-chevron" aria-hidden="true">${_ICONS.chevron}</span>
            </div>
            <div class="nsb-children" id="${childrenId}">${childrenHTML}</div>
          </div>`;
      }

      return '';
    }).join('');
  }

  // ─── Public renderers ─────────────────────────────────────────────────────

  function renderNavSidebar(batches, activeBatchId, navSection, user, navMode) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const compact     = sidebar.classList.contains('nav-sidebar--compact');
    const activeBatch = batches.find(b => b.id === activeBatchId)
                     || Storage.getArchivedBatches().find(b => b.id === activeBatchId)
                     || null;
    const isAdmin     = user?.role === 'admin';
    const navDef      = (isAdmin && navMode === 'admin') ? _ADMIN_NAV : _TRAINER_NAV;
    const bg          = user ? _makeAvatarBg(user.fullName || user.username) : '#57534E';
    const initials    = user ? _makeInitials(user.fullName || user.username) : '?';

    const modeToggleHTML = (isAdmin && !compact) ? `
      <div class="nsb-mode-toggle">
        <button class="nsb-mode-btn${navMode === 'trainer' ? ' nsb-mode-btn--active' : ''}" data-nav-mode="trainer">Trainer</button>
        <button class="nsb-mode-btn${navMode === 'admin'   ? ' nsb-mode-btn--active' : ''}" data-nav-mode="admin">Admin</button>
      </div>` : '';

    const batchSelectorHTML = (navMode !== 'admin')
      ? _navBatchSelectorHTML(batches, activeBatch, compact)
      : '';

    sidebar.innerHTML = `
      <div class="nsb-header">
        <button class="nsb-collapse-btn" id="nav-collapse-btn" title="${compact ? 'Expand sidebar' : 'Collapse sidebar'}" aria-label="${compact ? 'Expand sidebar' : 'Collapse sidebar'}">
          <svg class="nsb-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5"/><path d="M9 3v18"/></svg>
        </button>
        ${compact ? '' : `<img src="assets/logo/logo-light.png" class="nsb-logo-img spms-logo-img" alt="" aria-hidden="true"><span class="nsb-logo-text">SPMS</span>`}
      </div>

      ${modeToggleHTML}
      ${batchSelectorHTML}

      <nav class="nsb-nav" id="nsb-nav">
        ${_navItemsHTML(navDef, navSection, compact, Storage.getTasks().filter(t => !t.completedAt).length)}
      </nav>

      <div class="nsb-footer">
        <button class="nsb-footer-nav-btn${navSection === 'settings' ? ' nsb-footer-nav-btn--active' : ''}" data-nav="settings" aria-label="Settings" title="Settings">
          <span class="nsb-footer-nav-icon">${_ICONS.settings}</span>
          ${compact ? '' : `<span class="nsb-footer-nav-label">Settings</span>`}
        </button>
        <button class="nsb-footer-logout-btn" id="btn-logout-sidebar" title="Log out" aria-label="Log out">
          <span class="nsb-footer-logout-icon">${_ICONS.logout}</span>
          ${compact ? '' : `<span class="nsb-footer-logout-label">Log out</span>`}
        </button>
      </div>
`;
  }

  // Legacy shim — all existing call sites continue to work unchanged
  function renderSidebar(batches, activeBatchId) {
    const user = Storage.getCurrentUser();
    renderNavSidebar(batches, activeBatchId, _currentNavSection, user, _currentNavMode);
  }

  function toggleSidebar(batches, activeBatchId) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('nav-sidebar--compact');
    renderSidebar(batches, activeBatchId);
  }

  // ─── Compact sidebar flyout ───────────────────────────────────────────────

  function openNavFlyout(groupId, navSection, anchorEl) {
    closeNavFlyout();

    const allNavs = [..._TRAINER_NAV, ..._ADMIN_NAV];
    const group   = allNavs.find(e => e.type === 'group' && e.id === groupId);
    if (!group) return;

    const sidebarEl = document.getElementById('sidebar');
    if (!sidebarEl) return;
    const sr = sidebarEl.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();

    const itemsHTML = (group.children || []).map(child => {
      const active = child.id === navSection;
      return `<div class="nsb-flyout-item${active ? ' nsb-flyout-item--active' : ''}"
                   data-flyout-nav="${child.id}"
                   role="link" tabindex="0"
                   ${active ? 'aria-current="page"' : ''}
                   aria-label="${child.label}">${child.label}</div>`;
    }).join('');

    const flyout = document.createElement('div');
    flyout.id = 'nsb-flyout';
    flyout.className = 'nsb-flyout';
    flyout.setAttribute('role', 'menu');
    flyout.setAttribute('aria-label', group.label + ' submenu');
    flyout.innerHTML = `<div class="nsb-flyout-title">${group.label}</div>${itemsHTML}`;
    flyout.style.left = (sr.right + 8) + 'px';
    flyout.style.top  = Math.min(ar.top, window.innerHeight - 260) + 'px';
    document.body.appendChild(flyout);
    requestAnimationFrame(() => flyout.classList.add('nsb-flyout--visible'));
  }

  function closeNavFlyout() {
    const el = document.getElementById('nsb-flyout');
    if (!el) return;
    el.classList.remove('nsb-flyout--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 220);
  }

  return {
    setNavSection,
    setNavMode,
    toggleNavGroup,
    renderNavSidebar,
    renderSidebar,
    toggleSidebar,
    openNavFlyout,
    closeNavFlyout,
  };

})();
