/**
 * Tone-aware pronunciation diagnosis for Step 2.
 *
 * Web Speech / Whisper return hanzi, so a wrong tone or a flat-vs-curled
 * initial silently transcribes as a *different character* and the learner only
 * sees "try again". This module converts both the heard text and the target
 * to pinyin (via pinyin-pro) and diffs them syllable-by-syllable across three
 * axes — initial, final, tone — then renders a per-syllable breakdown plus a
 * plain-language articulation tip.
 *
 * Ties into the minimal-pairs pronunciation rules (pairs.json meta): the tip
 * text for z/c/s vs zh/ch/sh/r vs j/q/x mirrors those groups.
 */
import { pinyin } from 'pinyin-pro';
import { $ } from './state.js';

// Articulation groups — mirror pairs.json meta.pronunciationRules
const GROUPS = [
  { label: 'flat-tongue (z c s)',        initials: ['z', 'c', 's'],        how: 'tongue tip flat, just behind the lower front teeth' },
  { label: 'curled-tongue (zh ch sh r)', initials: ['zh', 'ch', 'sh', 'r'], how: 'tongue tip curled back toward the roof of the mouth' },
  { label: 'palatal (j q x)',            initials: ['j', 'q', 'x'],        how: 'tongue blade high against the hard palate, lips spread' },
];

const TONE_NAME = {
  1: '1st · high flat',
  2: '2nd · rising',
  3: '3rd · dipping',
  4: '4th · falling',
  0: 'neutral · light',
};

const groupOf = (initial) => GROUPS.find((g) => g.initials.includes(initial)) || null;

/** Hanzi-only view of a string (drops punctuation Web Speech likes to add). */
const hanziOnly = (s) => String(s || '').replace(/[^一-鿿]/g, '');

function analyze(text) {
  const zh = hanziOnly(text);
  if (!zh) return null;
  const opts = { type: 'array', nonZh: 'removed' };
  return {
    chars:    zh.split(''),
    py:       pinyin(zh, opts),
    initials: pinyin(zh, { pattern: 'initial', ...opts }),
    finals:   pinyin(zh, { pattern: 'final', toneType: 'none', ...opts }),
    tones:    pinyin(zh, { pattern: 'num', ...opts }).map(Number),
  };
}

/**
 * Compare heard vs target, syllable-aligned from the start.
 * Returns { rows, tip, lengthNote } or null when there is nothing to compare.
 */
export function diagnose(heardText, targetText) {
  const target = analyze(targetText);
  const heard  = analyze(heardText);
  if (!target) return null;

  const rows = target.chars.map((ch, i) => {
    const has = !!heard && i < heard.chars.length;
    return {
      char:       ch,
      py:         target.py[i],
      initial:    { want: target.initials[i], got: has ? heard.initials[i] : null, ok: has && heard.initials[i] === target.initials[i] },
      final:      { want: target.finals[i],   got: has ? heard.finals[i]   : null, ok: has && heard.finals[i]   === target.finals[i] },
      tone:       { want: target.tones[i],    got: has ? heard.tones[i]    : null, ok: has && heard.tones[i]    === target.tones[i] },
      heardChar:  has ? heard.chars[i] : null,
    };
  });

  let lengthNote = null;
  if (!heard) lengthNote = 'Nothing recognized — speak a little louder and closer to the mic.';
  else if (heard.chars.length !== target.chars.length) {
    lengthNote = `Heard ${heard.chars.length} syllable${heard.chars.length === 1 ? '' : 's'}, expected ${target.chars.length}.`;
  }

  return { rows, tip: buildTip(rows), lengthNote };
}

/** One targeted articulation tip — first initial-group confusion wins, then tone. */
function buildTip(rows) {
  for (const r of rows) {
    if (r.initial.got !== null && !r.initial.ok) {
      const wantG = groupOf(r.initial.want);
      const gotG  = groupOf(r.initial.got);
      if (wantG && gotG && wantG !== gotG) {
        return `${r.char} ${r.py} starts with ${r.initial.want}- — ${wantG.how}. You said ${r.initial.got}- (${gotG.label}: ${gotG.how}).`;
      }
      if (wantG) {
        return `${r.char} ${r.py} starts with ${r.initial.want}- (${wantG.label}): ${wantG.how}.`;
      }
    }
  }
  // Initials/finals fine → tone is the culprit
  const toneMiss = rows.find((r) => r.tone.got !== null && !r.tone.ok && r.initial.ok && r.final.ok);
  if (toneMiss) {
    return `${toneMiss.char} sounds right, but the tone is off — you said ${TONE_NAME[toneMiss.tone.got] ?? '?'}, it needs ${TONE_NAME[toneMiss.tone.want] ?? '?'}.`;
  }
  return null;
}

// ── Rendering ─────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function badge(label, part) {
  if (part.got === null) return `<span class="diag-badge miss">${esc(label)} —</span>`;
  if (part.ok)           return `<span class="diag-badge ok">${esc(label)} ${esc(part.want || '·')} ✓</span>`;
  return `<span class="diag-badge bad">${esc(label)} ${esc(part.got || '·')} → ${esc(part.want || '·')}</span>`;
}

const toneBadge = (part) => {
  if (part.got === null) return '<span class="diag-badge miss">tone —</span>';
  if (part.ok)           return `<span class="diag-badge ok">tone ${part.want} ✓</span>`;
  return `<span class="diag-badge bad">tone ${part.got} → ${part.want}</span>`;
};

/** Render the diagnosis under the speech feedback line. No-op if container missing. */
export function renderSpeechDiagnosis(heardText, targetText) {
  const el = $('speech-diag');
  if (!el) return;
  const d = diagnose(heardText, targetText);
  if (!d) { el.innerHTML = ''; return; }

  const rowsHtml = d.rows.map((r) => `
    <div class="diag-row">
      <span class="diag-syl">${esc(r.char)}<span class="diag-py">${esc(r.py)}</span></span>
      ${badge('initial', r.initial)}
      ${badge('final', r.final)}
      ${toneBadge(r.tone)}
      ${r.heardChar && r.heardChar !== r.char ? `<span class="diag-heard">heard ${esc(r.heardChar)}</span>` : ''}
    </div>`).join('');

  el.innerHTML =
    (d.lengthNote ? `<div class="diag-note">${esc(d.lengthNote)}</div>` : '')
    + rowsHtml
    + (d.tip ? `<div class="diag-tip">💡 ${esc(d.tip)}</div>` : '');
}

export function clearDiagnosis() {
  const el = $('speech-diag');
  if (el) el.innerHTML = '';
}
