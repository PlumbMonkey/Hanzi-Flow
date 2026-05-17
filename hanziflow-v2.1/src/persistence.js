/**
 * localStorage wrapper for values that survive across sessions.
 *
 * PRD references:
 *  - §4.4 — next-day new-card target persisted
 *  - §4.5 — weak-points map persisted
 *  - §12  — "persists the new-card limit"
 */

const KEY = {
  newCardLimit:  'hf.newCardLimit',
  nextDayTarget: 'hf.nextDayTarget',
  weakpoints:    'hf.weakpoints',
  lastSession:   'hf.lastSession',
  streak:        'hf.streak',
};

const safeGet = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const safeSet = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or disabled */ }
};

// ── New-card limit ────────────────────────────────────────────
export const loadNewCardLimit = () => safeGet(KEY.newCardLimit, 10);
export const saveNewCardLimit = (n) => safeSet(KEY.newCardLimit, Math.max(1, Math.min(50, +n || 10)));

// ── Next-day target (computed at session end from accuracy) ───
export const loadNextDayTarget = () => safeGet(KEY.nextDayTarget, null);
export const saveNextDayTarget = (n) => safeSet(KEY.nextDayTarget, +n);
export const clearNextDayTarget = () => { try { localStorage.removeItem(KEY.nextDayTarget); } catch {} };

// ── Weak-points map (merged across sessions) ──────────────────
// Stored as { hanzi: ['listen','speak'|'write', ...] }
export const loadWeakpoints = () => {
  const raw = safeGet(KEY.weakpoints, {});
  const out = {};
  for (const [h, arr] of Object.entries(raw)) {
    out[h] = new Set(Array.isArray(arr) ? arr : []);
  }
  return out;
};

export const saveWeakpoints = (wp) => {
  const out = {};
  for (const [h, set] of Object.entries(wp || {})) {
    out[h] = [...(set instanceof Set ? set : new Set(set || []))];
  }
  safeSet(KEY.weakpoints, out);
};

// ── Last session record (streak tracking) ─────────────────────
export const loadLastSession = () => safeGet(KEY.lastSession, null);
export const saveLastSession = (record) => safeSet(KEY.lastSession, record);

// ── Streak ────────────────────────────────────────────────────
export const loadStreak = () => safeGet(KEY.streak, 0);
export const saveStreak = (n) => safeSet(KEY.streak, +n);
