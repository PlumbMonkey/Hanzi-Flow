/**
 * Three-step wizard state machine + session loop (PRD §3).
 *
 * Owns: card loading, step routing, pass/stash, session start/end, timer,
 * progress, and Anki sync.
 */
import { S, $, resetSession } from './state.js';
import { renderEtymology } from './etymology.js';
import { initHW } from './canvas.js';
import { hideSTPVO } from './stpvo.js';
import { setFeedback } from './speech.js';
import { answerCard, retrieveAudioBase64 } from './anki.js';
import {
  hydrateAWE, onCardEnter, recordComprehension,
  showAWEAlert, logLatency, flagWeak, updateAWEPanel, applyDynamicPacing,
} from './awe.js';
import { buildExport, renderQR } from './export.js';
import { pickIdiom } from './demo.js';
import { saveNewCardLimit, loadNewCardLimit } from './persistence.js';

// ── Session lifecycle ─────────────────────────────────────────
export function beginSession({ cards, isDemo, fieldMap, newCardLimit }) {
  stopTimer();
  resetSession();
  S.cards = cards;
  S.isDemo = isDemo;
  if (fieldMap) S.ankiFields = fieldMap;
  if (typeof newCardLimit === 'number') saveNewCardLimit(newCardLimit);

  hydrateAWE();
  S.sessionStart = Date.now();
  S.timeboxFired = false;
  showScreen('screen-wizard');
  loadCard(0);
  startTimer();
}

export function reviewStash() {
  if (!S.stash.length) return;
  beginSession({ cards: [...S.stash], isDemo: S.isDemo });
}

// ── Card loading ──────────────────────────────────────────────
export function loadCard(i) {
  if (i >= S.cards.length) { endLoop(); return; }
  const c = S.cards[i];
  S.step = 1;
  S.speechPassed = false;
  onCardEnter();

  $('c-cur').textContent = i + 1;
  $('c-tot').textContent = S.cards.length;
  const lbl = $('c-type');
  lbl.textContent = c.type;
  lbl.style.color = c.type === 'New' ? 'var(--sage)' : 'var(--gold)';

  // Field defaults — aural mode hides pinyin
  S.showHanzi = true;
  S.showPinyin = !S.awe.auralMode;
  S.showEnglish = true;
  syncFieldToggles();

  $('s1-hanzi').textContent = c.hanzi;
  $('s1-pinyin').textContent = c.pinyin;
  $('s1-english').textContent = c.english;

  $('s2-hanzi').textContent = c.hanzi;
  $('s2-pinyin').textContent = c.pinyin;
  setFeedback('Press mic and speak in Mandarin');
  $('speech-next').disabled = true;
  hideSTPVO();

  renderS3Info(c);

  $('aural-notice').style.display = S.awe.auralMode ? 'block' : 'none';

  renderEtymology(c.hanzi);
  showAWEAlert();
  goStep(1);
  updateProgress();
}

// ── Step 3 info rendering ───────────────────────────────────
/**
 * Split a pinyin string (with or without spaces) into individual syllables.
 * Returns an array of syllable strings, or [pinyin] if parsing fails.
 */
function splitPinyin(pinyin) {
  const clean = pinyin.trim().replace(/\s+/g, '');
  const PINYIN_RE = /(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?([\u0101\u00e1\u01ce\u00e0\u0113\u00e9\u011b\u00e8\u012b\u00ed\u01d0\u00ec\u014d\u00f3\u01d2\u00f2\u016b\u00fa\u01d4\u00f9\u01d6\u01d8\u01da\u01dcaeiouüv]+)(ng|n|r)?/gi;
  const syllables = clean.match(PINYIN_RE);
  return syllables && syllables.length > 0 ? syllables : [pinyin];
}

/**
 * Render the step-3 info bar: full hanzi phrase (as highlight-able spans),
 * pinyin (as per-syllable spans when count matches), and English.
 */
function renderS3Info(c) {
  const chars = c.hanzi.replace(/\s/g, '').split('');
  $('s3-hanzi').innerHTML = chars
    .map((ch, i) => `<span class="s3-char" data-ci="${i}">${ch}</span>`)
    .join('');

  const syllables = splitPinyin(c.pinyin);
  if (syllables.length === chars.length) {
    $('s3-pinyin').innerHTML = syllables
      .map((s, i) => `<span class="s3-tok" data-ci="${i}">${s}</span>`)
      .join('\u200a');
  } else {
    $('s3-pinyin').textContent = c.pinyin;
  }

  $('s3-english').textContent = c.english;
}

// ── Step routing ──────────────────────────────────────────────
export function goStep(n) {
  // PRD §3: speech must pass (or override / STPVO) before reaching Step 3.
  if (n === 3 && !S.speechPassed) return;

  // Record comprehension when leaving Step 1 forward
  if (S.step === 1 && n > 1) recordComprehension(true);

  S.step = n;
  for (const i of [1, 2, 3]) {
    $(`step-${i}`).classList.toggle('active', i === n);
    const pill = $(`pill-${i}`);
    pill.className = 'pill' + (i < n ? ' done' : i === n ? ' active' : '');
  }
  if (n === 3) initHW();
}

// ── Card resolution ───────────────────────────────────────────
export function passCard() {
  // Roll up write skill at card level (PRD §7.3): if stroke ratio < 0.7, flag weak
  if (S.strokeTotal > 0) {
    const ratio = S.strokeOk / S.strokeTotal;
    if (ratio < 0.7) flagWeak(S.cards[S.idx]?.hanzi, 'write');
  }
  logLatency();
  S.passed++;
  syncIfReal(true);
  S.idx++;
  updateStash();
  updateProgress();
  if (S.idx >= S.cards.length) { endLoop(); return; }
  loadCard(S.idx);
}

export function stashCard() {
  logLatency();
  S.stash.push(S.cards[S.idx]);
  syncIfReal(false);
  S.idx++;
  updateStash();
  updateProgress();
  if (S.idx >= S.cards.length) { endLoop(); return; }
  loadCard(S.idx);
}

function updateStash() {
  const n = S.stash.length;
  $('stash-badge-ct').textContent = n;
  $('stash-strip').style.display = n > 0 ? 'flex' : 'none';
  updateAWEPanel();
}

function updateProgress() {
  const done = S.passed + S.stash.length;
  const total = S.cards.length || 1;
  $('prog-fill').style.width = (done / total * 100) + '%';
}

// ── End-of-session ────────────────────────────────────────────
export async function endLoop() {
  stopTimer();
  const elapsedMin = Math.max(1, Math.round((Date.now() - S.sessionStart) / 60000));

  $('ws-passed').textContent = S.passed;
  $('ws-stashed').textContent = S.stash.length;
  $('ws-time').textContent = elapsedMin + 'm';
  $('ws-stash-ct').textContent = S.stash.length;
  $('review-stash').style.display = S.stash.length ? 'inline-block' : 'none';

  const idiom = pickIdiom();
  $('wrap-idiom').textContent = idiom.zh;
  $('wrap-sub').textContent = `${idiom.py} — ${idiom.en}`;

  // Dynamic workload pacing — adjusts tomorrow's new-card target (PRD §4.4)
  const pacing = applyDynamicPacing(loadNewCardLimit());
  $('wrap-pacing-msg').textContent = pacing.message;

  buildExport({ sessionMinutes: elapsedMin });
  await renderQR();
  showScreen('screen-wrap');
}

// ── Timer (PRD §4.4 / §11) ────────────────────────────────────
export function startTimer() {
  S.timerInt = setInterval(() => {
    const el = Math.floor((Date.now() - S.sessionStart) / 1000);
    const m = String(Math.floor(el / 60)).padStart(2, '0');
    const s = String(el % 60).padStart(2, '0');
    $('timer-disp').textContent = `${m}:${s}`;
    if (el >= 25 * 60 && !S.timeboxFired) {
      S.timeboxFired = true;
      fireTimebox();
    }
    if (el >= 25 * 60) {
      $('timer-pill').classList.add('warn');
      $('timer-dot').classList.add('warn');
    }
  }, 1000);
}

export function stopTimer() {
  clearInterval(S.timerInt);
  S.timerInt = null;
}

function fireTimebox() {
  const sp = S.awe.speak;
  const acc = sp.attempts ? Math.round(sp.passed / sp.attempts * 100) : null;
  const msg = $('modal-msg');
  if (acc !== null && acc < 75) {
    msg.textContent = `Your accuracy is ${acc}% — let's wrap up and protect tomorrow's progress. Your stash is ready when you are.`;
  } else if (acc !== null && acc >= 90) {
    msg.textContent = `Your accuracy is ${acc}% — great momentum. Keep going or wrap up beautifully.`;
  } else {
    msg.textContent = "You've hit your 25-minute timebox. Wrap up or keep going.";
  }
  $('timebox-modal').classList.add('open');
}

export function closeModal() { $('timebox-modal').classList.remove('open'); }

// ── Field toggles ─────────────────────────────────────────────
export function toggleField(f) {
  if (f === 'hanzi') S.showHanzi = !S.showHanzi;
  if (f === 'pinyin') S.showPinyin = !S.showPinyin;
  if (f === 'english') S.showEnglish = !S.showEnglish;
  syncFieldToggles();
}

function syncFieldToggles() {
  $('s1-hanzi').style.opacity   = S.showHanzi   ? '1' : '0';
  $('s1-pinyin').style.opacity  = S.showPinyin  ? '1' : '0';
  $('s1-english').style.opacity = S.showEnglish ? '1' : '0';
  document.querySelector('[data-toggle="hanzi"]')?.classList.toggle('on', S.showHanzi);
  document.querySelector('[data-toggle="pinyin"]')?.classList.toggle('on', S.showPinyin);
  document.querySelector('[data-toggle="english"]')?.classList.toggle('on', S.showEnglish);
}

// ── Anki sync ─────────────────────────────────────────────────
async function syncIfReal(passed) {
  if (S.isDemo) return;
  const card = S.cards[S.idx];
  if (!card?.cardId) return;
  try { await answerCard(card.cardId, passed); }
  catch (e) { console.warn('Anki sync failed:', e.message); }
}

// ── Audio glue (wires the speech module's playCardAudio with anki) ──
export { retrieveAudioBase64 };

// ── Screen routing ────────────────────────────────────────────
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = $(id);
  el.classList.add('active', 'fade-in');
  setTimeout(() => el.classList.remove('fade-in'), 400);
}
