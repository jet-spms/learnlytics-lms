/**
 * supabase-sync.js — Offline / localStorage-only stub
 *
 * This is a drop-in replacement for the Supabase cloud sync layer.
 * All functions maintain the same public API so app.js, storage.js,
 * and ui.js work without any changes.
 *
 * Behaviour:
 *  • All reads come from localStorage (same as the real version).
 *  • All writes go to localStorage only (no network calls).
 *  • All async functions resolve immediately with { ok: true }.
 *  • No Supabase SDK is required — the CDN script tag in auth.html
 *    is ignored gracefully.
 */

const SupabaseSync = (() => {

  // ── No-op helpers ──────────────────────────────────────────────────────────
  const _ok       = async () => ({ ok: true });
  const _okZero   = async () => ({ ok: true, pushed: 0, errors: 0 });
  const _noop     = ()       => {};

  // ── Hydration stubs ────────────────────────────────────────────────────────
  // The real functions pull data from Supabase and merge into localStorage.
  // In offline mode, localStorage already has all the data — nothing to do.
  async function hydrateUsers()              { return { ok: true }; }
  async function hydrateBatches()            { return { ok: true }; }
  async function hydrateSingleBatch(id)      { return { ok: true }; }
  async function hydrateSessions(batchId)    { return { ok: true }; }
  async function hydrateTasks()              { return { ok: true }; }

  // ── Debounced push stubs ───────────────────────────────────────────────────
  // The real functions debounce writes to Supabase.
  // In offline mode, localStorage writes happen synchronously in storage.js already.
  function scheduleBatchSync()  {}
  function scheduleUsersSync()  {}
  function scheduleTasksSync()  {}

  // ── Immediate delete stubs ─────────────────────────────────────────────────
  async function deleteBatchRemote(id)   { return { ok: true }; }
  async function deleteUserRemote(id)    { return { ok: true }; }
  async function deleteTaskRemote(id)    { return { ok: true }; }

  // ── Session push stub ──────────────────────────────────────────────────────
  async function pushSessions(batchId)   { return { ok: true, pushed: 0, errors: 0 }; }

  // ── Forced flush stubs ─────────────────────────────────────────────────────
  async function flushUsers()   { return { ok: true }; }
  async function flushBatches() { return { ok: true }; }
  async function flushAll()     { return { ok: true }; }

  // ── Status callback (S-6) ──────────────────────────────────────────────────
  function setStatusCallback(cb) { /* no-op — no sync status to show */ }

  // ── Scoring config stubs ───────────────────────────────────────────────────
  async function pushConfig(cfg)   { return { ok: true }; }
  async function pullConfig()      { return { ok: true, data: null }; }
  async function deleteConfig()    { return { ok: true }; }

  // ── Dev/testing stubs ──────────────────────────────────────────────────────
  async function testConnection()  {
    return { ok: false, mode: 'offline', message: 'Running in offline/localStorage mode.' };
  }

  async function auditSessionDivergence() {
    return { ok: true, diverged: 0, message: 'Offline mode — no divergence check.' };
  }

  async function reconcileSessions() {
    return { ok: true, pushed: 0, errors: 0, batches: 0, students: 0, ranAt: new Date().toISOString() };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    hydrateUsers,
    hydrateBatches,
    hydrateSingleBatch,
    scheduleBatchSync,
    scheduleUsersSync,
    scheduleTasksSync,
    pushSessions,
    hydrateSessions,
    hydrateTasks,
    deleteBatchRemote,
    deleteUserRemote,
    deleteTaskRemote,
    flushUsers,
    flushBatches,
    flushAll,
    setStatusCallback,
    pushConfig,
    pullConfig,
    deleteConfig,
    testConnection,
    auditSessionDivergence,
    reconcileSessions
  };
})();
