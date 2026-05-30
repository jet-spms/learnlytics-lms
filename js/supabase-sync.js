/**
 * supabase-sync.js — Cloud sync layer for SPMS
 *
 * Enables multi-device login:
 *   • Users are pulled from Supabase before login so any device can authenticate.
 *   • Batches are pulled after login so data is always current.
 *   • Writes are debounced and pushed to Supabase in the background.
 *   • All operations fail gracefully — localStorage always works offline.
 *
 * Tables (Supabase):
 *   spms_users   : id (text PK), username (text), role (text), data (jsonb)
 *   spms_batches : id (text PK), owner_id (text), data (jsonb)
 */

const SupabaseSync = (() => {

  const SB_URL = 'https://clryriidbuglzigwpdem.supabase.co';
  const SB_KEY = 'sb_publishable_hgjzrPNnI4SfJ4luqj12gg_cmVCfr4t';

  let _client     = null;
  let _statusCb   = null;
  let _batchTimer = null;
  let _userTimer  = null;
  const DEBOUNCE  = 3000; // ms

  // ── Client ──────────────────────────────────────────────────────────────────
  function _getClient() {
    if (_client) return _client;
    try {
      if (typeof supabase !== 'undefined' &&
          typeof supabase.createClient === 'function' &&
          supabase.createClient.toString().length > 40) { // real SDK, not stub
        _client = supabase.createClient(SB_URL, SB_KEY);
      }
    } catch (_) { /* SDK not loaded */ }
    return _client;
  }

  function _setStatus(status) {
    if (typeof _statusCb === 'function') _statusCb(status);
  }

  // ── localStorage helpers ────────────────────────────────────────────────────
  function _loadLocalUsers() {
    try { return JSON.parse(localStorage.getItem('spms_users') || '[]'); } catch { return []; }
  }
  function _saveLocalUsers(arr) {
    try { localStorage.setItem('spms_users', JSON.stringify(arr)); } catch (_) {}
  }
  function _loadLocalData() {
    try { return JSON.parse(localStorage.getItem('spms_data') || '{"batches":[]}'); } catch { return { batches: [] }; }
  }
  function _saveLocalData(d) {
    try { localStorage.setItem('spms_data', JSON.stringify(d)); } catch (_) {}
  }

  // ── hydrateUsers ─────────────────────────────────────────────────────────────
  // Pull all users from Supabase → merge into localStorage.
  // Called on app init so ANY device can log in with cloud credentials.
  async function hydrateUsers() {
    const client = _getClient();
    if (!client) return { ok: true, source: 'local' };
    try {
      const { data, error } = await client.from('spms_users').select('id, data');
      if (error) return { ok: false, error: error.message };
      if (!data || !data.length) return { ok: true, count: 0 };

      const local   = _loadLocalUsers();
      const byId    = Object.fromEntries(local.map(u => [u.id, u]));

      data.forEach(row => {
        if (!row.data || !row.data.id) return;
        const remote = row.data;
        const local_ = byId[remote.id];
        // Remote wins if local is absent or remote is newer
        if (!local_ || (remote.updatedAt && local_.updatedAt && remote.updatedAt >= local_.updatedAt)) {
          byId[remote.id] = remote;
        }
      });

      _saveLocalUsers(Object.values(byId));
      return { ok: true, count: data.length };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // ── hydrateBatches ────────────────────────────────────────────────────────────
  // Pull batches from Supabase → merge into localStorage.
  // isAdmin = true → fetch ALL batches; false → only owner's batches.
  async function hydrateBatches(userId, isAdmin) {
    const client = _getClient();
    if (!client) return { ok: true, source: 'local' };
    try {
      let q = client.from('spms_batches').select('id, owner_id, data');
      if (!isAdmin && userId) q = q.eq('owner_id', userId);

      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      if (!data || !data.length) return { ok: true, count: 0 };

      const local = _loadLocalData();
      if (!Array.isArray(local.batches)) local.batches = [];
      const byId = Object.fromEntries(local.batches.map(b => [b.id, b]));

      data.forEach(row => {
        if (!row.data || !row.data.id) return;
        const remote = row.data;
        const local_ = byId[remote.id];
        if (!local_ || (remote.updatedAt && local_.updatedAt && remote.updatedAt >= local_.updatedAt)) {
          byId[remote.id] = remote;
        }
      });

      local.batches = Object.values(byId);
      _saveLocalData(local);
      return { ok: true, count: data.length };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async function hydrateSingleBatch(batchId) {
    if (!batchId) return { ok: false };
    const client = _getClient();
    if (!client) return { ok: true, source: 'local' };
    try {
      const { data, error } = await client.from('spms_batches').select('id, data').eq('id', batchId).single();
      if (error || !data?.data) return { ok: false };

      const local = _loadLocalData();
      if (!Array.isArray(local.batches)) local.batches = [];
      const idx = local.batches.findIndex(b => b.id === batchId);
      if (idx >= 0) local.batches[idx] = data.data;
      else          local.batches.push(data.data);
      _saveLocalData(local);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  async function hydrateSessions()  { return { ok: true }; } // sessions embedded in batch.data
  async function hydrateTasks()     { return { ok: true }; }

  // ── flushUsers ────────────────────────────────────────────────────────────────
  // Push all users to Supabase (upsert by id).
  async function flushUsers(users) {
    const client = _getClient();
    if (!client) return { ok: true };
    try {
      const arr = Array.isArray(users) ? users : _loadLocalUsers();
      if (!arr.length) return { ok: true };
      _setStatus('syncing');
      const rows = arr.map(u => ({
        id:       u.id,
        username: u.username || '',
        role:     u.role || 'trainer',
        data:     u,
      }));
      const { error } = await client.from('spms_users').upsert(rows, { onConflict: 'id' });
      if (error) { _setStatus('failed'); return { ok: false, error: error.message }; }
      _setStatus('synced');
      return { ok: true };
    } catch (e) { _setStatus('failed'); return { ok: false, error: String(e) }; }
  }

  // ── flushBatches ──────────────────────────────────────────────────────────────
  // Push all local batches to Supabase (upsert by id).
  async function flushBatches() {
    const client = _getClient();
    if (!client) return { ok: true };
    try {
      const local   = _loadLocalData();
      const batches = (local.batches || []);
      if (!batches.length) return { ok: true };
      _setStatus('syncing');
      const rows = batches.map(b => ({
        id:       b.id,
        owner_id: b.ownerId || '',
        data:     b,
      }));
      const { error } = await client.from('spms_batches').upsert(rows, { onConflict: 'id' });
      if (error) { _setStatus('failed'); return { ok: false, error: error.message }; }
      _setStatus('synced');
      return { ok: true };
    } catch (e) { _setStatus('failed'); return { ok: false, error: String(e) }; }
  }

  async function flushAll() {
    const [u, b] = await Promise.all([flushUsers(), flushBatches()]);
    return { ok: u.ok && b.ok };
  }

  // ── Debounced schedulers ──────────────────────────────────────────────────────
  function scheduleBatchSync() {
    clearTimeout(_batchTimer);
    _batchTimer = setTimeout(() => flushBatches().catch(() => {}), DEBOUNCE);
  }
  function scheduleUsersSync() {
    clearTimeout(_userTimer);
    _userTimer = setTimeout(() => flushUsers().catch(() => {}), DEBOUNCE);
  }
  function scheduleTasksSync() {} // tasks embedded in batch data — covered by scheduleBatchSync

  // ── Delete helpers ────────────────────────────────────────────────────────────
  async function deleteBatchRemote(id) {
    const client = _getClient();
    if (!client || !id) return { ok: true };
    try {
      const { error } = await client.from('spms_batches').delete().eq('id', id);
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  async function deleteUserRemote(id) {
    const client = _getClient();
    if (!client || !id) return { ok: true };
    try {
      const { error } = await client.from('spms_users').delete().eq('id', id);
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  async function deleteTaskRemote() { return { ok: true }; } // tasks in batch data

  // ── Sessions (embedded in batches) ────────────────────────────────────────────
  async function pushSessions() {
    scheduleBatchSync();
    return { ok: true, pushed: 0, errors: 0 };
  }

  // ── Scoring config (stored in a dedicated spms_config row) ─────────────────
  async function pushConfig(cfg) {
    const client = _getClient();
    if (!client) return { ok: true };
    try {
      const { error } = await client.from('spms_config').upsert(
        [{ id: 'scoring', data: cfg }], { onConflict: 'id' }
      );
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  async function pullConfig() {
    const client = _getClient();
    if (!client) return { ok: true, data: null };
    try {
      const { data, error } = await client.from('spms_config').select('data').eq('id', 'scoring').single();
      if (error || !data) return { ok: true, data: null };
      return { ok: true, data: data.data };
    } catch (e) { return { ok: true, data: null }; }
  }
  async function deleteConfig() {
    const client = _getClient();
    if (!client) return { ok: true };
    try {
      await client.from('spms_config').delete().eq('id', 'scoring');
      return { ok: true };
    } catch { return { ok: true }; }
  }

  // ── Status callback ────────────────────────────────────────────────────────
  function setStatusCallback(cb) { _statusCb = cb; }

  // ── Connection test ────────────────────────────────────────────────────────
  async function testConnection() {
    const client = _getClient();
    if (!client) return { ok: false, mode: 'offline', message: 'Supabase SDK not loaded.' };
    try {
      const { error } = await client.from('spms_users').select('id').limit(1);
      if (error) return { ok: false, mode: 'error', message: error.message };
      return { ok: true, mode: 'cloud', message: 'Connected to Supabase.' };
    } catch (e) { return { ok: false, mode: 'error', message: String(e) }; }
  }

  async function auditSessionDivergence() { return { ok: true, diverged: 0 }; }
  async function reconcileSessions()      { return { ok: true, pushed: 0, errors: 0, batches: 0, students: 0, ranAt: new Date().toISOString() }; }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    hydrateUsers, hydrateBatches, hydrateSingleBatch,
    scheduleBatchSync, scheduleUsersSync, scheduleTasksSync,
    pushSessions, hydrateSessions, hydrateTasks,
    deleteBatchRemote, deleteUserRemote, deleteTaskRemote,
    flushUsers, flushBatches, flushAll,
    setStatusCallback,
    pushConfig, pullConfig, deleteConfig,
    testConnection, auditSessionDivergence, reconcileSessions,
  };
})();
