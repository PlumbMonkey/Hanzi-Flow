/**
 * Listening discrimination drill for minimal pairs.
 *
 * The classic minimal-pair exercise: TTS plays ONE character of a pair, the
 * learner picks which one they heard. Immediate feedback plus the pair's
 * trap-zone note as a micro-lesson. Feeds S.awe.listen with real pass/fail
 * data (one attempt per round) and flags missed characters as 'listen' weak
 * points — the same signals aural-discrimination mode reasons from.
 *
 * Rendering is fully dynamic into #drill-body (index.html only ships the
 * screen shell); a single delegated click listener handles all buttons.
 */
import { S, $ } from './state.js';
import { getPairs } from './pairs.js';
import { flagWeak, checkAuralMode, updateAWEPanel } from './awe.js';
import { showScreen } from './wizard.js';

const D = {
  rounds: [],
  idx: 0,
  score: 0,
  misses: [],     // [{ pair, target }]
  answered: false,
  active: false,
};

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Session ───────────────────────────────────────────────────
export function startListeningDrill() {
  const pairs = getPairs().filter((p) => (p.characters?.length ?? 0) >= 2);
  if (!pairs.length) return;

  D.rounds = shuffle(pairs).map((pair) => ({
    pair,
    target: pair.characters[Math.floor(Math.random() * pair.characters.length)],
    choices: shuffle(pair.characters),
  }));
  D.idx = 0;
  D.score = 0;
  D.misses = [];
  D.active = true;

  if (!$('drill-body').dataset.wired) {
    $('drill-body').addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    $('drill-body').dataset.wired = '1';
  }

  showScreen('screen-drill');
  renderRound();
}

function endDrill() {
  D.active = false;
  window.speechSynthesis?.cancel();
  showScreen('screen-connect');
}

// ── Rounds ────────────────────────────────────────────────────
function renderRound() {
  const round = D.rounds[D.idx];
  D.answered = false;

  const choicesHtml = round.choices.map((c, i) => `
    <button class="drill-choice" data-pick="${esc(c.hanzi)}">
      <span class="drill-choice-key">${i + 1}</span>
      <span class="drill-choice-hanzi">${esc(c.hanzi)}</span>
      <span class="drill-choice-py" style="visibility:hidden">${esc(c.pinyin)}</span>
    </button>`).join('');

  $('drill-body').innerHTML = `
    <div class="drill-head">
      <h2>Listening drill <span class="drill-sub">听力辨音</span></h2>
      <div class="drill-progress">${D.idx + 1} / ${D.rounds.length} · score ${D.score}</div>
    </div>
    <p class="drill-inst">Play the audio, then choose the character you heard.</p>
    <div class="audio-row"><button class="audio-btn" data-drill="play" title="Space = replay">▶</button></div>
    <div class="drill-choices">${choicesHtml}</div>
    <div class="drill-feedback" id="drill-feedback"></div>
    <div class="drill-lesson" id="drill-lesson"></div>
    <hr class="divider">
    <div class="btn-row">
      <button class="btn" data-drill="quit">Exit drill</button>
      <button class="btn btn-primary" data-drill="next" id="drill-next" disabled>Next →</button>
    </div>
    <div class="kbd-hint"><kbd>Space</kbd> replay &nbsp; <kbd>1</kbd>/<kbd>2</kbd> choose &nbsp; <kbd>Enter</kbd> next</div>`;

  // Small delay so the screen paints before audio starts
  setTimeout(() => { if (D.active && !D.answered) playTarget(); }, 350);
}

function playTarget() {
  const round = D.rounds[D.idx];
  if (!round || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(round.target.hanzi);
  u.lang = 'zh-CN';
  u.rate = 0.8;
  window.speechSynthesis.speak(u);
}

function answer(pickedHanzi) {
  if (D.answered) return;
  const round = D.rounds[D.idx];
  D.answered = true;

  const correct = pickedHanzi === round.target.hanzi;
  S.awe.listen.attempts++;
  if (correct) { S.awe.listen.passed++; D.score++; }
  else {
    flagWeak(round.target.hanzi, 'listen');
    D.misses.push(round);
  }

  // Reveal: pinyin on every choice, colors on target / wrong pick
  document.querySelectorAll('.drill-choice').forEach((btn) => {
    btn.disabled = true;
    btn.querySelector('.drill-choice-py').style.visibility = 'visible';
    const h = btn.dataset.pick;
    if (h === round.target.hanzi) btn.classList.add('drill-correct');
    else if (h === pickedHanzi) btn.classList.add('drill-wrong');
  });

  const fb = $('drill-feedback');
  fb.textContent = correct
    ? `✓ Correct — ${round.target.hanzi} ${round.target.pinyin}`
    : `✗ It was ${round.target.hanzi} ${round.target.pinyin} (${round.target.tone ?? ''})`;
  fb.className = 'drill-feedback ' + (correct ? 'ok' : 'fail');

  const trap = round.pair.trapZone;
  if (trap?.confusion) {
    $('drill-lesson').innerHTML =
      `<div class="drill-lesson-title">⚠️ Why this pair is tricky</div>` +
      `<div>${esc(trap.confusion)}</div>` +
      (trap.reason ? `<div class="drill-lesson-reason">${esc(trap.reason)}</div>` : '');
  }

  $('drill-next').disabled = false;
  $('drill-next').textContent = D.idx + 1 >= D.rounds.length ? 'Finish →' : 'Next →';
  const prog = document.querySelector('.drill-progress');
  if (prog) prog.textContent = `${D.idx + 1} / ${D.rounds.length} · score ${D.score}`;
  checkAuralMode();
  updateAWEPanel();
}

function nextRound() {
  if (!D.answered) return;
  D.idx++;
  if (D.idx >= D.rounds.length) renderSummary();
  else renderRound();
}

// ── Summary ───────────────────────────────────────────────────
function renderSummary() {
  const pctScore = Math.round((D.score / D.rounds.length) * 100);
  const missHtml = D.misses.length
    ? D.misses.map((m) => `
        <div class="drill-miss-row">
          <span class="drill-miss-chars">${m.pair.characters.map((c) => `${esc(c.hanzi)} ${esc(c.pinyin)}`).join(' vs ')}</span>
          <span class="drill-miss-heard">missed: ${esc(m.target.hanzi)}</span>
        </div>`).join('')
    : '<div class="drill-miss-none">No misses — your ear nailed every pair 🎉</div>';

  $('drill-body').innerHTML = `
    <div class="drill-head">
      <h2>Drill complete <span class="drill-sub">听力辨音</span></h2>
    </div>
    <div class="drill-score-big">${D.score} / ${D.rounds.length} <span class="drill-score-pct">(${pctScore}%)</span></div>
    <div class="drill-miss-list">${missHtml}</div>
    <div class="drill-summary-note">Misses are flagged as listening weak points in the AWE panel and will surface as alerts when those cards come up.</div>
    <hr class="divider">
    <div class="btn-row">
      <button class="btn" data-drill="quit">Back to start</button>
      <button class="btn btn-primary" data-drill="again">Practice again ↺</button>
    </div>`;
}

// ── Events ────────────────────────────────────────────────────
function onClick(e) {
  const choice = e.target.closest('.drill-choice');
  if (choice && !choice.disabled) { answer(choice.dataset.pick); return; }
  const btn = e.target.closest('[data-drill]');
  if (!btn) return;
  switch (btn.dataset.drill) {
    case 'play':  playTarget(); break;
    case 'next':  nextRound(); break;
    case 'again': startListeningDrill(); break;
    case 'quit':  endDrill(); break;
  }
}

function onKeydown(e) {
  if (!D.active || !$('screen-drill').classList.contains('active')) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  if (e.code === 'Space') { e.preventDefault(); playTarget(); return; }
  if (e.code === 'Enter') { e.preventDefault(); nextRound(); return; }
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1) {
    const btns = document.querySelectorAll('.drill-choice');
    const btn = btns[n - 1];
    if (btn && !btn.disabled) answer(btn.dataset.pick);
  }
}
