const UIHelpers = (() => {

  const _AVATAR_COLORS = [
    '#0277fa','#7c3aed','#be185d','#0260d4','#047857',
    '#0284c7','#9333ea','#065f46','#15803d','#6d28d9'
  ];

  function _localDateStr(d = new Date()) {
    return d.getFullYear()
      + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scoreBar(value, colorClass = '') {
    const pct = Math.min(100, Math.max(0, value));
    const cls = colorClass || (pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad');
    return `<div class="score-bar"><div class="score-fill score-fill--${cls}" style="width:${pct}%"></div></div>`;
  }

  function piColor(pi) {
    if (pi >= 75) return 'good';
    if (pi >= 50) return 'warn';
    return 'bad';
  }

  function fmt(n) { return typeof n === 'number' ? n.toFixed(1) : '—'; }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function _makeAvatarBg(name) {
    let h = 0;
    const s = (name || 'U');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return _AVATAR_COLORS[h % _AVATAR_COLORS.length];
  }

  function _makeInitials(fullName) {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function _avatarHTML(fullName, size = 'md', extraStyle = '') {
    const bg  = _makeAvatarBg(fullName);
    const ini = _makeInitials(fullName);
    return `<div class="user-avatar user-avatar--${size}" style="background:${bg}${extraStyle ? ';' + extraStyle : ''}">${ini}</div>`;
  }

  return {
    _localDateStr, escHtml, scoreBar, piColor, fmt, fmtDate, capitalize,
    _makeAvatarBg, _makeInitials, _avatarHTML,
  };
})();
