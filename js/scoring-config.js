/**
 * scoring-config.js — Admin-controlled scoring configuration for SPMS.
 *
 * Phase A: Config module only.
 *   - Exposes global ScoringConfig singleton (IIFE pattern, same as SupabaseSync).
 *   - Handles load / save / validate / reset / getDefaults.
 *   - Reads and writes localStorage key 'spms_scoring_config'.
 *   - Every failure path (missing key, corrupt JSON, invalid values) silently
 *     returns hardcoded defaults — the app can never be left in an uncalculable state.
 *   - No dependency on any other SPMS module (Storage, Calc, UI, SupabaseSync).
 *   - No DOM access. No Supabase access (Phase F will add that).
 *
 * Config shape stored in localStorage:
 * {
 *   weights: {
 *     attendance:   <number 0–100>,
 *     academic:     <number 0–100>,
 *     presentation: <number 0–100>,
 *     aiMock:       <number 0–100>,
 *     manualMock:   <number 0–100>
 *   },
 *   thresholds: {
 *     a: <number, must be > thresholds.b>,
 *     b: <number, must be > 0>
 *   },
 *   savedAt:  <ISO date string>,
 *   savedBy:  <user ID string>
 * }
 */

const ScoringConfig = (() => {

  // ─── Storage Key ────────────────────────────────────────────────────────────
  const LS_KEY = 'spms_scoring_config';

  // ─── Hardcoded Defaults ──────────────────────────────────────────────────────
  // These values match the current live formula exactly (each component 20%).
  // They are never mutated. Always return a fresh copy via getDefaults().
  const _DEFAULT_WEIGHTS = {
    attendance:   20,
    academic:     20,
    presentation: 20,
    aiMock:       20,
    manualMock:   20
  };

  const _DEFAULT_THRESHOLDS = {
    a: 85,
    b: 70
  };

  // ─── Public: getDefaults ─────────────────────────────────────────────────────
  /**
   * Returns a fresh copy of the hardcoded defaults.
   * Used by the admin UI Reset button so it can display what the defaults are.
   * Never returns a reference to the internal constant — always a new object.
   */
  function getDefaults() {
    return {
      weights:    { ..._DEFAULT_WEIGHTS },
      thresholds: { ..._DEFAULT_THRESHOLDS }
    };
  }

  // ─── Public: validate ────────────────────────────────────────────────────────
  /**
   * Pure validation function. Never throws.
   * Accepts raw weights and thresholds objects (values may be strings from DOM inputs).
   * Coerces to numbers internally before checking.
   *
   * Returns: { valid: boolean, errors: string[] }
   *
   * Rules enforced:
   *   1. All five weight fields must be present and numeric (≥ 0, ≤ 100).
   *   2. Weights must sum to exactly 100 (rounded to 1 decimal to absorb float noise).
   *   3. Both threshold fields must be present and numeric (> 0, < 100).
   *   4. thresholds.a must be strictly greater than thresholds.b.
   */
  function validate(weights, thresholds) {
    const errors = [];

    // ── Weight presence and type checks ──
    const weightKeys = ['attendance', 'academic', 'presentation', 'aiMock', 'manualMock'];
    const parsedWeights = {};
    let allWeightsValid = true;

    weightKeys.forEach(k => {
      const val = parseFloat(weights?.[k]);
      if (isNaN(val) || val < 0 || val > 100) {
        errors.push(`Weight "${k}" must be a number between 0 and 100.`);
        allWeightsValid = false;
      } else {
        parsedWeights[k] = val;
      }
    });

    // ── Weight sum check (only if all weights parsed cleanly) ──
    if (allWeightsValid) {
      const sum = weightKeys.reduce((acc, k) => acc + parsedWeights[k], 0);
      // Round to 1 decimal to absorb floating-point noise (e.g. 99.99999999 → 100.0)
      if (Math.round(sum * 10) / 10 !== 100) {
        errors.push(`Weights must sum to exactly 100. Current total: ${Math.round(sum * 10) / 10}.`);
      }
    }

    // ── Threshold presence and type checks ──
    const parsedA = parseFloat(thresholds?.a);
    const parsedB = parseFloat(thresholds?.b);

    if (isNaN(parsedA) || parsedA <= 0 || parsedA >= 100) {
      errors.push('Category A threshold must be a number between 1 and 99.');
    }
    if (isNaN(parsedB) || parsedB <= 0 || parsedB >= 100) {
      errors.push('Category B threshold must be a number between 1 and 99.');
    }

    // ── A > B check (only if both parsed cleanly) ──
    if (!isNaN(parsedA) && !isNaN(parsedB)) {
      if (parsedA <= parsedB) {
        errors.push('Category A threshold must be strictly greater than Category B threshold.');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Public: load ────────────────────────────────────────────────────────────
  /**
   * Reads 'spms_scoring_config' from localStorage.
   * On any failure (key missing, JSON corrupt, validation fails) → returns defaults.
   * Never throws. Always returns a usable config object.
   *
   * Return shape:
   * {
   *   weights:    { attendance, academic, presentation, aiMock, manualMock },
   *   thresholds: { a, b },
   *   savedAt:    string | null,
   *   savedBy:    string | null,
   *   isDefault:  boolean   ← true if falling back to hardcoded defaults
   * }
   */
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);

      // Key does not exist → first-time run, use defaults
      if (raw === null) return _buildDefaultResult();

      const parsed = JSON.parse(raw);

      // Validate the stored config
      const { valid } = validate(parsed.weights, parsed.thresholds);
      if (!valid) {
        // Stored config is invalid (e.g. from an older format) → use defaults
        console.warn('[ScoringConfig] Stored config failed validation — using defaults.');
        return _buildDefaultResult();
      }

      // Valid stored config — coerce all values to numbers and return
      return {
        weights: {
          attendance:   parseFloat(parsed.weights.attendance),
          academic:     parseFloat(parsed.weights.academic),
          presentation: parseFloat(parsed.weights.presentation),
          aiMock:       parseFloat(parsed.weights.aiMock),
          manualMock:   parseFloat(parsed.weights.manualMock)
        },
        thresholds: {
          a: parseFloat(parsed.thresholds.a),
          b: parseFloat(parsed.thresholds.b)
        },
        savedAt:   parsed.savedAt   || null,
        savedBy:   parsed.savedBy   || null,
        isDefault: false
      };

    } catch (e) {
      // JSON.parse threw or localStorage threw (e.g. private browsing restriction)
      console.warn('[ScoringConfig] Failed to load config from localStorage — using defaults.', e);
      return _buildDefaultResult();
    }
  }

  // ─── Public: save ────────────────────────────────────────────────────────────
  /**
   * Validates then writes config to localStorage.
   * Does NOT write if validation fails — localStorage is never left in an invalid state.
   *
   * @param {object} weights    - Five weight fields (values may be numbers or strings).
   * @param {object} thresholds - { a, b } (values may be numbers or strings).
   * @param {string} savedBy    - User ID of the admin saving the config. Optional.
   *
   * Returns: { ok: boolean, errors: string[] }
   *   ok: true  → saved successfully
   *   ok: false → validation failed, nothing written, errors[] has messages
   */
  function save(weights, thresholds, savedBy) {
    const { valid, errors } = validate(weights, thresholds);

    if (!valid) {
      return { ok: false, errors };
    }

    const record = {
      weights: {
        attendance:   parseFloat(weights.attendance),
        academic:     parseFloat(weights.academic),
        presentation: parseFloat(weights.presentation),
        aiMock:       parseFloat(weights.aiMock),
        manualMock:   parseFloat(weights.manualMock)
      },
      thresholds: {
        a: parseFloat(thresholds.a),
        b: parseFloat(thresholds.b)
      },
      savedAt: new Date().toISOString(),
      savedBy: savedBy || null
    };

    try {
      localStorage.setItem(LS_KEY, JSON.stringify(record));
      return { ok: true, errors: [] };
    } catch (e) {
      console.error('[ScoringConfig] Failed to write config to localStorage.', e);
      return { ok: false, errors: ['Failed to save configuration. Storage may be full.'] };
    }
  }

  // ─── Public: reset ───────────────────────────────────────────────────────────
  /**
   * Removes the stored config from localStorage.
   * After this call, load() will return hardcoded defaults.
   * Safe to call even if the key does not exist.
   */
  function reset() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {
      console.warn('[ScoringConfig] Failed to remove config key from localStorage.', e);
    }
  }

  // ─── Private: _buildDefaultResult ───────────────────────────────────────────
  /**
   * Returns the default config result object.
   * Internal helper — always produces a fresh copy of defaults.
   */
  function _buildDefaultResult() {
    return {
      weights:    { ..._DEFAULT_WEIGHTS },
      thresholds: { ..._DEFAULT_THRESHOLDS },
      savedAt:    null,
      savedBy:    null,
      isDefault:  true
    };
  }

  // ─── Public: syncFromCloud ───────────────────────────────────────────────────
  /**
   * Phase F: Pulls the scoring config from Supabase and reconciles with localStorage.
   * Called once during login hydration (app.js :: init()) before rendering any UI.
   * Never throws — all failures are caught and logged silently.
   *
   * Sync rules (three states returned by SupabaseSync.pullConfig):
   *   'ok'    → Supabase has a config row → validate and write to localStorage.
   *             Supabase wins (consistent with existing hydration strategy).
   *   'empty' → Row does not exist (admin reset on another device) → clear localStorage.
   *   'error' → Supabase unreachable or table missing → do nothing, keep localStorage.
   */
  async function syncFromCloud() {
    try {
      // Guard: SupabaseSync must be loaded (it loads before this module)
      if (typeof SupabaseSync === 'undefined' || typeof SupabaseSync.pullConfig !== 'function') {
        console.warn('[ScoringConfig] SupabaseSync not available — skipping cloud sync.');
        return;
      }

      const result = await SupabaseSync.pullConfig();

      if (result.status === 'error') {
        // Supabase unreachable — keep whatever is in localStorage (offline safe)
        return;
      }

      if (result.status === 'empty') {
        // Row does not exist — admin reset on another device → clear local custom config
        reset();
        return;
      }

      // status === 'ok' — validate before writing to localStorage
      const cloudCfg = result.config;
      const { valid } = validate(cloudCfg?.weights, cloudCfg?.thresholds);
      if (!valid) {
        console.warn('[ScoringConfig] Cloud config failed validation — keeping local config.');
        return;
      }

      // Valid cloud config — write to localStorage
      // Bypass ScoringConfig.save() to avoid double-validation; write directly.
      const record = {
        weights:    {
          attendance:   parseFloat(cloudCfg.weights.attendance),
          academic:     parseFloat(cloudCfg.weights.academic),
          presentation: parseFloat(cloudCfg.weights.presentation),
          aiMock:       parseFloat(cloudCfg.weights.aiMock),
          manualMock:   parseFloat(cloudCfg.weights.manualMock)
        },
        thresholds: {
          a: parseFloat(cloudCfg.thresholds.a),
          b: parseFloat(cloudCfg.thresholds.b)
        },
        savedAt: cloudCfg.savedAt || null,
        savedBy: cloudCfg.savedBy || null
      };
      localStorage.setItem(LS_KEY, JSON.stringify(record));

    } catch (e) {
      console.warn('[ScoringConfig] syncFromCloud failed unexpectedly.', e);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  return {
    load,
    save,
    validate,
    reset,
    getDefaults,
    syncFromCloud   // Phase F: called by app.js during login hydration
  };

})();
