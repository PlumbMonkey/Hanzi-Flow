/**
 * Adaptive Weakness Engine (PRD §4).
 *
 * Tracks per-card performance, flags weak points, drives aural-discrimination
 * mode and dynamic workload pacing. Most metric mutation happens here so the
 * call sites (speech, canvas) just pass pass/fail booleans.
 */
import { S, $ } from './state.js';
import {
  loadWeakpoints, saveWeakpoints,
  loadNextDayTarget, saveNextDayTarget,
} from './persistence.js';

// ── Constants tuned per PRD §4.3 / §4.4 ───────────────────────
export const AURAL_THRESHOLD     = 0.70;   // §4.3 — listening accuracy below this triggers aural mode
export const AURAL_MIN_ATTEMPTS  = 3;       // §4.3 — needs >=3 attempts to be meaningful
export const REPEAT_PLAY_FLOOR   = 3;       // §4.2 — "needed repeat" = 3+ plays before advancing
export const PACING_HIGH         = 0.90;    // §4.4 — above this, expand tomorrow
export const PACING_LOW          = 0.75;    // §4.4 — below this, contract tomorrow

// ── Public hooks ──────────────────────────────────────────────

/** Called on session start to seed cross-session weakpoints. */
export function hydrateAWE() {
  S.awe.weakpoints = loadWeakpoints();
}

/** Called per card on Step 1 entry — resets per-card play count. */
export function onCardEnter() {
  S.awe.listenPlayCount = 0;
  S.cardStart = Date.now();
}

/** Step 1 → 2 advance. Records a listen pass/fail based on play count. */
export function recordComprehension(advanced) {
  // Only attribute a listen attempt if audio was actually played at least once.
  if (S.awe.listenPlayCount > 0) {
    S.awe.listen.attempts++;
    if (advanced && S.awe.listenPlayCount < REPEAT_PLAY_FLOOR) {
      S.awe.listen.passed++;
    } else if (advanced) {
      flagWeak(S.cards[S.idx]?.hanzi, 'listen');
    }
  }
  checkAuralMode();
  updateAWEPanel();
}

export function recordSpeak(passed) {
  S.awe.speak.attempts++;
  if (passed) S.awe.speak.passed++;
}

export function recordStroke(ok) {
  S.awe.write.attempts++;
  if (ok) S.awe.write.passed++;
}

export function flagWeak(hanzi, skill) {
  if (!hanzi || !skill) return;
  if (!S.awe.weakpoints[hanzi]) S.awe.weakpoints[hanzi] = new Set();
  S.awe.weakpoints[hanzi].add(skill);
  saveWeakpoints(S.awe.weakpoints);
}

export function logLatency() {
  if (!S.cardStart) return;
  const ms = Date.now() - S.cardStart;
  S.awe.latency.push({ hanzi: S.cards[S.idx]?.hanzi || '?', ms });
  if (S.awe.latency.length > 20) S.awe.latency.shift();
  S.cardStart = null;
}

/** PRD §4.3 — recompute aural-discrimination mode after each speech attempt. */
export function checkAuralMode() {
  const a = S.awe.listen;
  if (a.attempts >= AURAL_MIN_ATTEMPTS) {
    S.awe.auralMode = (a.passed / a.attempts) < AURAL_THRESHOLD;
  }
  const status = $('aural-status');
  const notice = $('aural-notice');
  if (status) {
    status.textContent = S.awe.auralMode
      ? 'Status: ACTIVE — listening is your weak point'
      : 'Status: inactive';
    status.style.color = S.awe.auralMode ? 'var(--blue)' : 'var(--muted)';
  }
  if (notice) notice.style.display = S.awe.auralMode ? 'block' : 'none';
}

/** Surfaced as the per-card banner when the active card has past weak flags. */
export function showAWEAlert() {
  const card = S.cards[S.idx];
  const wp = S.awe.weakpoints[card?.hanzi];
  const el = $('awe-alert');
  if (wp && wp.size > 0) {
    el.style.display = 'flex';
    $('awe-alert-msg').textContent =
      `Previously weak in ${[...wp].join(', ')} for this card — pay extra attention.`;
  } else {
    el.style.display = 'none';
  }
}

// ── Pacing (PRD §4.4) ─────────────────────────────────────────
/**
 * Compute and persist tomorrow's new-card target based on first-pass speak accuracy.
 * Called at session wrap. Returns the chosen delta and message for UI.
 */
export function applyDynamicPacing(currentLimit) {
  const speak = S.awe.speak;
  const acc = speak.attempts ? speak.passed / speak.attempts : null;
  let next = currentLimit;
  let delta = 0;
  let message;

  if (acc === null) {
    message = 'No speech attempts recorded — keeping tomorrow\'s target the same.';
  } else if (acc >= PACING_HIGH) {
    // +2 to +5, scaled by how far above 0.90 we are (cap +5)
    delta = Math.min(5, 2 + Math.round((acc - PACING_HIGH) * 30));
    next = Math.min(50, currentLimit + delta);
    message = `Strong session (${Math.round(acc * 100)}% speak accuracy) — tomorrow's target +${delta} (${next} new cards).`;
  } else if (acc < PACING_LOW) {
    delta = -Math.max(2, Math.round((PACING_LOW - acc) * 20));
    next = Math.max(1, currentLimit + delta);
    message = `Accuracy at ${Math.round(acc * 100)}% — contracting tomorrow's target to ${next} and weighting toward the stash.`;
  } else {
    message = `Accuracy at ${Math.round(acc * 100)}% — steady. Keeping ${next} for tomorrow.`;
  }

  saveNextDayTarget(next);
  return { next, delta, message };
}

export function previewNextDayTarget() {
  return loadNextDayTarget();
}

// ── Panel render ──────────────────────────────────────────────
const pct = (a) => (a.attempts ? Math.round((a.passed / a.attempts) * 100) : null);

export function updateAWEPanel() {
  for (const id of ['listen', 'speak', 'write']) {
    const p = pct(S.awe[id]);
    const bar = $(`awe-${id}-bar`);
    const pctEl = $(`awe-${id}-pct`);
    if (bar) bar.style.width = (p || 0) + '%';
    if (pctEl) pctEl.textContent = p !== null ? p + '%' : '—';
  }

  // Weak-points
  const wpEl = $('awe-weakpoints');
  if (wpEl) {
    const keys = Object.keys(S.awe.weakpoints);
    if (keys.length) {
      wpEl.innerHTML = keys.map((h) => {
        const set = S.awe.weakpoints[h];
        const skills = set instanceof Set ? [...set] : (set || []);
        return skills.map((skill) =>
          `<span class="weak-tag ${skill}">${h} · ${skill}</span>`
        ).join('');
      }).join('');
    } else {
      wpEl.innerHTML = '<span style="font-size:12px;color:var(--muted)">None yet</span>';
    }
  }

  // Latency (last 5, newest first)
  const ll = $('awe-latency-list');
  if (ll) {
    const recent = [...S.awe.latency].slice(-5).reverse();
    if (recent.length) {
      ll.innerHTML = recent.map((l) =>
        `<div class="latency-item"><span>${l.hanzi}</span><span class="latency-ms">${(l.ms / 1000).toFixed(1)}s</span></div>`
      ).join('');
    } else {
      ll.innerHTML = '<div style="font-size:12px;color:var(--muted)">No data yet</div>';
    }
  }

  // Next-day target hint
  const nt = $('awe-next-target');
  if (nt) {
    const v = loadNextDayTarget();
    nt.textContent = v ? `${v} new cards (set by yesterday's accuracy)` : 'Will be set after this session';
  }
}

export function toggleAWEPanel(force) {
  const p = $('awe-panel');
  const open = typeof force === 'boolean' ? force : !p.classList.contains('open');
  p.classList.toggle('open', open);
  p.setAttribute('aria-hidden', String(!open));
  if (open) updateAWEPanel();
}
