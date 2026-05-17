/**
 * Session export + QR (PRD §9).
 *
 * Two payloads:
 *  - Full JSON (download / copy) — entire session state including stash and AWE
 *  - Compact (QR) — timestamp, passed count, stash count, weak-points map only,
 *    encoded as a `hanziflow://import?data=<base64>` URI. A QR can't reliably
 *    hold ~3KB+ of card content, so full state travels by the .json file.
 */
import QRCode from 'qrcode';
import { S, $ } from './state.js';

export function buildExport({ sessionMinutes }) {
  const full = {
    version:        '2.1',
    exported:       new Date().toISOString(),
    sessionMinutes,
    passed:         S.passed,
    stash:          S.stash,
    awe: {
      listen: { ...S.awe.listen },
      speak:  { ...S.awe.speak  },
      write:  { ...S.awe.write  },
      weakpoints: weakpointsToObject(S.awe.weakpoints),
      latency: [...S.awe.latency],
    },
  };
  const json = JSON.stringify(full, null, 2);
  S.exportJSON = json;
  return { full, json };
}

export async function renderQR() {
  const compact = {
    v: '2.1',
    ts: new Date().toISOString(),
    passed: S.passed,
    stashCount: S.stash.length,
    weakpoints: weakpointsToObject(S.awe.weakpoints),
  };
  const b64 = base64UrlSafe(JSON.stringify(compact));
  const uri = `hanziflow://import?data=${b64}`;

  const canvas = $('qr-canvas');
  if (!canvas) return;
  try {
    await QRCode.toCanvas(canvas, uri, {
      width: 180,
      margin: 1,
      color: { dark: '#1a1208', light: '#ffffff' },
    });
  } catch (e) {
    console.warn('QR render failed:', e);
  }
}

export async function copyExportJSON() {
  try {
    await navigator.clipboard.writeText(S.exportJSON || '{}');
    flash('Copied to clipboard');
  } catch {
    flash('Clipboard blocked — use Download instead');
  }
}

export function downloadExport() {
  const blob = new Blob([S.exportJSON || '{}'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hanziflow-session-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

// ── helpers ───────────────────────────────────────────────────
function weakpointsToObject(wp) {
  const out = {};
  for (const [h, set] of Object.entries(wp || {})) {
    out[h] = [...(set instanceof Set ? set : new Set(set || []))];
  }
  return out;
}

function base64UrlSafe(str) {
  // unescape/encodeURIComponent dance to handle non-ASCII safely
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function flash(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:var(--ink);color:var(--paper);padding:8px 16px;
    border-radius:4px;font-size:13px;z-index:300;opacity:0;
    transition:opacity 0.3s;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 350);
  }, 1600);
}
