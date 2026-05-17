/**
 * Step 3 — Hanzi Writer integration with per-stroke validation.
 *
 * Modes: animate / trace / quiz (PRD §3 Step 3).
 * Per-stroke green/red dots fed by Hanzi Writer's onCorrectStroke / onMistake
 * callbacks (PRD §7.1, §7.2). Multi-character words navigate with prev/next.
 *
 * Color tokens (PRD §7.2) map to the warm-palette §8.2 values via CSS vars —
 * we read them off the root computed style so the canvas stays in sync if the
 * palette changes.
 */
import HanziWriter from 'hanzi-writer';
import { S, $ } from './state.js';
import { recordStroke, updateAWEPanel } from './awe.js';

const HW_OPTS_BASE = () => {
  const root = getComputedStyle(document.documentElement);
  return {
    width: 300,
    height: 300,
    padding: 20,
    strokeColor:    root.getPropertyValue('--ink').trim()        || '#1a1208',
    outlineColor:   root.getPropertyValue('--stroke').trim()     || 'rgba(26,18,8,0.15)',
    drawingColor:   root.getPropertyValue('--vermillion').trim() || '#c0392b',
    highlightColor: root.getPropertyValue('--sage').trim()       || '#5a7a5a',
    showOutline: true,
    strokeAnimationSpeed: 0.9,
    delayBetweenStrokes: 180,
  };
};

export function initHW() {
  const card = S.cards[S.idx];
  S.chars = card.hanzi.replace(/\s/g, '').split('');
  S.charIdx = 0;
  S.strokeTotal = 0;
  S.strokeOk = 0;
  updateCharNav();
  renderChar();
}

export function renderChar() {
  const ch = S.chars[S.charIdx];
  if (!ch) return;

  $('char-pos').textContent = `${S.charIdx + 1} / ${S.chars.length}: ${ch}`;
  const target = $('hw-target');
  target.innerHTML = '';
  $('stroke-dots').innerHTML = '';
  S.hw = null;

  if (!HanziWriter) {
    target.innerHTML = fallbackGlyph(ch);
    return;
  }

  try {
    S.hw = HanziWriter.create('hw-target', ch, {
      ...HW_OPTS_BASE(),
      showCharacter: S.canvasMode !== 'quiz',
      onLoadCharDataSuccess: (data) => {
        const total = data?.strokes?.length || 0;
        buildStrokeDots(total);
        if (S.canvasMode === 'animate') {
          S.hw.animateCharacter();
        } else if (S.canvasMode === 'trace' || S.canvasMode === 'quiz') {
          S.hw.quiz({
            leniency: 0.9,
            onMistake:      (info) => markStroke(info.strokeNum, false),
            onCorrectStroke:(info) => markStroke(info.strokeNum, true),
            onComplete:     () => onCharComplete(),
          });
        }
      },
      onLoadCharDataError: () => {
        target.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;height:300px;flex-direction:column;gap:8px">
            <div style="font-family:'Noto Serif SC',serif;font-size:120px;color:var(--ink);opacity:0.15">${ch}</div>
            <div style="font-size:12px;color:var(--muted)">Stroke data unavailable</div>
          </div>`;
      },
    });
  } catch (e) {
    console.warn('HanziWriter init failed:', e);
    target.innerHTML = fallbackGlyph(ch);
  }
}

function fallbackGlyph(ch) {
  return `<div style="display:flex;align-items:center;justify-content:center;height:300px;font-family:'Noto Serif SC',serif;font-size:140px;color:var(--ink);opacity:0.12">${ch}</div>`;
}

function buildStrokeDots(n) {
  S.strokeTotal += n;
  const wrap = $('stroke-dots');
  wrap.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'stroke-dot';
    d.id = `sd-${S.charIdx}-${i}`;
    wrap.appendChild(d);
  }
}

function markStroke(num, ok) {
  const d = $(`sd-${S.charIdx}-${num}`);
  if (d) d.classList.add(ok ? 'ok' : 'fail');
  if (ok) S.strokeOk++;
  recordStroke(ok);
  updateAWEPanel();
}

function onCharComplete() {
  // Hook for future per-character celebration. Stays quiet for v2.1.
}

export function setMode(m) {
  S.canvasMode = m;
  document.querySelectorAll('.canvas-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === m);
  });
  renderChar();
}

export function replayAnim() {
  if (S.hw && S.canvasMode === 'animate') S.hw.animateCharacter();
  else renderChar();
}

export function revealHW() {
  if (S.hw) S.hw.showCharacter();
}

export function prevChar() {
  if (S.charIdx > 0) { S.charIdx--; renderChar(); updateCharNav(); }
}

export function nextChar() {
  if (S.charIdx < S.chars.length - 1) { S.charIdx++; renderChar(); updateCharNav(); }
}

function updateCharNav() {
  $('prev-ch').disabled = S.charIdx === 0;
  $('next-ch').disabled = S.charIdx >= S.chars.length - 1;
}
