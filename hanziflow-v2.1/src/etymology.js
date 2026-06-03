/**
 * Etymology layer (PRD §5).
 *
 * Data lives in /data/etymology.json — a flat object keyed by single Hanzi.
 * For a multi-character card, scan each character left-to-right and show the
 * first one found. Missing-data state is neutral, never an error.
 */
import { $ } from './state.js';

let DB = {};

export async function loadEtymologyDB() {
  try {
    const res = await fetch(new URL('../data/etymology.json', import.meta.url));
    if (res.ok) DB = await res.json();
  } catch (e) {
    console.warn('Etymology load failed (continuing without):', e);
    DB = {};
  }
}

export function renderEtymology(hanzi, contextSentence = null) {
  if (!hanzi) return;
  let data = null, foundChar = '';
  for (const ch of hanzi.split('')) {
    if (DB[ch]) { data = DB[ch]; foundChar = ch; break; }
  }

  $('etym-char-preview').textContent = foundChar || hanzi[0] || '—';

  // Context line — show character highlighted within its sentence
  const ctxEl = $('etym-context-line');
  if (ctxEl) {
    if (contextSentence && contextSentence.length > 1 && foundChar) {
      const highlighted = contextSentence.split('').map((ch) =>
        ch === foundChar
          ? `<span class="etym-ctx-highlight">${escapeHtml(ch)}</span>`
          : `<span>${escapeHtml(ch)}</span>`
      ).join('');
      ctxEl.innerHTML =
        `<div class="awe-title">Card context</div>` +
        `<div class="etym-ctx-sentence">${highlighted}</div>`;
      ctxEl.style.display = '';
    } else {
      ctxEl.innerHTML = '';
      ctxEl.style.display = 'none';
    }
  }

  if (!data) {
    $('etym-radicals').innerHTML =
      '<span style="font-size:12px;color:var(--muted)">No etymology data for this character yet.</span>';
    $('etym-evolution').innerHTML = '';
    $('etym-note').textContent = '';
    const cpWrap = $('etym-compounds-wrap');
    if (cpWrap) { $('etym-compounds').innerHTML = ''; cpWrap.style.display = 'none'; }
    return;
  }

  $('etym-radicals').innerHTML = data.radicals.map((r) => `
    <div class="radical-chip">
      <div class="radical-zh">${escapeHtml(r.zh)}</div>
      <div class="radical-meaning">${escapeHtml(r.meaning)}</div>
      <div class="radical-stroke">${r.strokes} strokes</div>
    </div>`).join('');

  $('etym-evolution').innerHTML = data.evolution.map((ch, i) => `
    <div class="evo-stage">
      <div class="evo-char">${escapeHtml(ch)}</div>
      <div class="evo-label">${escapeHtml(data.evoLabels[i] || '')}</div>
    </div>${i < data.evolution.length - 1 ? '<div class="evo-arrow">→</div>' : ''}`).join('');

  $('etym-note').textContent = data.note || '';

  // Compounds section
  const cpWrap = $('etym-compounds-wrap');
  const cpEl = $('etym-compounds');
  if (cpWrap && cpEl) {
    if (data.compounds && data.compounds.length) {
      cpEl.innerHTML = data.compounds.map((c) => `
        <div class="compound-chip">
          <div class="compound-word">${escapeHtml(c.word)}</div>
          <div class="compound-pinyin">${escapeHtml(c.pinyin)}</div>
          <div class="compound-meaning">${escapeHtml(c.meaning)}</div>
        </div>`).join('');
      cpWrap.style.display = '';
    } else {
      cpEl.innerHTML = '';
      cpWrap.style.display = 'none';
    }
  }
}

export function toggleEtym() {
  const body = $('etym-body');
  const open = body.classList.toggle('open');
  $('etym-chevron').textContent = open ? '▴' : '▾';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
