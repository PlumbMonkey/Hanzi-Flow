/**
 * Entry point. Imports CSS, hydrates persisted state, wires DOM event
 * listeners to module handlers. No business logic lives here — main.js is
 * pure glue.
 */
import '../styles/theme.css';
import { S, $ } from './state.js';
import { ping, listDecks, sampleCardFields, guessFieldMap, fetchSessionCards, retrieveAudioBase64 } from './anki.js';
import { loadEtymologyDB, toggleEtym } from './etymology.js';
import { toggleAWEPanel, updateAWEPanel, hydrateAWE } from './awe.js';
import { toggleSpeech, overrideSpeech, playCardAudio } from './speech.js';
import { setMode, replayAnim, revealHW, prevChar, nextChar } from './canvas.js';
import {
  beginSession, reviewStash, goStep, passCard, stashCard,
  toggleField, closeModal, endLoop,
} from './wizard.js';
import { copyExportJSON, downloadExport } from './export.js';
import { DEMO_CARDS } from './demo.js';
import {
  loadNewCardLimit, loadNextDayTarget, clearNextDayTarget,
} from './persistence.js';

// ── Bootstrap ────────────────────────────────────────────────
async function bootstrap() {
  await loadEtymologyDB();
  hydrateAWE();
  updateAWEPanel();

  // Hydrate new-card limit input from persisted value or next-day target
  const nextTarget = loadNextDayTarget();
  const stored = loadNewCardLimit();
  const limitInput = $('new-limit');
  limitInput.value = nextTarget ?? stored;
  const hint = $('next-target-hint');
  if (nextTarget && nextTarget !== stored) {
    hint.textContent = `Today's target adjusted from ${stored} to ${nextTarget} based on yesterday's accuracy.`;
  }

  wireEvents();
}

// ── Event wiring ─────────────────────────────────────────────
function wireEvents() {
  // Header
  $('awe-pill').addEventListener('click', () => toggleAWEPanel());
  $('awe-close').addEventListener('click', () => toggleAWEPanel(false));

  // Connect screen
  $('check-anki').addEventListener('click', handleCheckAnki);
  $('deck-sel').addEventListener('change', refreshFieldsFromDeck);
  $('start-demo').addEventListener('click', startDemoSession);
  $('start-session').addEventListener('click', handleStartSession);

  // Step 1
  document.querySelectorAll('[data-toggle]').forEach((el) =>
    el.addEventListener('click', () => toggleField(el.dataset.toggle))
  );
  $('play-btn').addEventListener('click', () => {
    const card = S.cards[S.idx];
    if (card) playCardAudio(card, retrieveAudioBase64);
  });
  $('etym-header').addEventListener('click', toggleEtym);

  // Step 2
  $('mic-btn').addEventListener('click', () => toggleSpeech());
  $('speech-override').addEventListener('click', () => overrideSpeech());

  // Step 3
  document.querySelectorAll('.canvas-tab').forEach((tab) =>
    tab.addEventListener('click', () => setMode(tab.dataset.mode))
  );
  $('prev-ch').addEventListener('click', prevChar);
  $('next-ch').addEventListener('click', nextChar);
  $('hw-replay').addEventListener('click', replayAnim);
  $('hw-show').addEventListener('click', revealHW);

  // Step transitions via data-action
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => handleAction(el.dataset.action));
  });

  // Wrap screen
  $('copy-json').addEventListener('click', copyExportJSON);
  $('download-json').addEventListener('click', downloadExport);
  $('review-stash').addEventListener('click', reviewStash);
  $('new-session').addEventListener('click', () => location.reload());

  // Modal
  $('modal-wrap').addEventListener('click', () => { closeModal(); endLoop(); });
  $('modal-keep').addEventListener('click', closeModal);

  // Keyboard shortcuts (PRD §8.4)
  document.addEventListener('keydown', handleKeydown);
}

function handleAction(action) {
  switch (action) {
    case 'go-step-1': goStep(1); break;
    case 'go-step-2': goStep(2); break;
    case 'go-step-3': goStep(3); break;
    case 'pass':      passCard(); break;
    case 'stash':     stashCard(); break;
  }
}

// ── Connect handlers ─────────────────────────────────────────
async function handleCheckAnki() {
  const row = $('anki-status');
  const txt = $('anki-status-txt');
  const icon = row.querySelector('.status-icon');
  txt.textContent = 'Connecting…';
  icon.textContent = '◌';
  row.style.borderColor = '';

  try {
    await ping();
    row.style.borderColor = 'var(--sage)';
    icon.textContent = '✓';
    txt.textContent = 'Connected to AnkiConnect';
    await loadDecksIntoUI();
  } catch (e) {
    row.style.borderColor = 'var(--vermillion)';
    icon.textContent = '✗';
    txt.textContent = explainAnkiError(e);
  }
}

function explainAnkiError(e) {
  const m = (e?.message || '').toLowerCase();
  // Browsers report CORS failures as "Failed to fetch" — indistinguishable from
  // "Anki not running", so surface both possibilities in the message.
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('cors')) {
    return 'Cannot reach AnkiConnect. Two common causes: '
      + '(1) Anki is not open, or '
      + '(2) CORS is not configured — in Anki go to Tools → Add-ons → AnkiConnect → Config and add "http://localhost:5500" to webCorsOriginList, then restart Anki.';
  }
  return `Connection failed: ${e?.message || 'unknown'}`;
}

async function loadDecksIntoUI() {
  const decks = await listDecks();
  const sel = $('deck-sel');
  sel.innerHTML = decks.map((d) => `<option>${d}</option>`).join('');
  sel.disabled = false;
  await refreshFieldsFromDeck();
  $('start-session').disabled = false;
}

async function refreshFieldsFromDeck() {
  const deck = $('deck-sel').value;
  if (!deck) return;
  const fields = await sampleCardFields(deck);
  if (!fields.length) return;
  const map = guessFieldMap(fields);

  for (const id of ['f-hanzi', 'f-pinyin', 'f-english', 'f-audio']) {
    const sel = $(id);
    sel.innerHTML = fields.map((f) => `<option>${f}</option>`).join('');
    sel.disabled = false;
  }
  $('f-hanzi').value = map.hanzi;
  $('f-pinyin').value = map.pinyin;
  $('f-english').value = map.english;
  $('f-audio').value = map.audio;
}

async function handleStartSession() {
  const deck = $('deck-sel').value;
  const newLimit = +$('new-limit').value || 10;
  const fieldMap = {
    hanzi:   $('f-hanzi').value,
    pinyin:  $('f-pinyin').value,
    english: $('f-english').value,
    audio:   $('f-audio').value,
  };

  let cards;
  try {
    cards = await fetchSessionCards({ deckName: deck, newLimit, fieldMap });
  } catch (e) {
    alert(`Could not load cards: ${e.message}`);
    return;
  }
  if (!cards.length) {
    alert('No due cards found in this deck.');
    return;
  }

  // Once we've consumed today's target, clear it so tomorrow's gets recomputed cleanly.
  clearNextDayTarget();
  beginSession({ cards, isDemo: false, fieldMap, newCardLimit: newLimit });
}

function startDemoSession() {
  const cards = JSON.parse(JSON.stringify(DEMO_CARDS));
  beginSession({ cards, isDemo: true });
}

// ── Keyboard ─────────────────────────────────────────────────
function handleKeydown(e) {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ($('screen-wizard') && !$('screen-wizard').classList.contains('active')) return;

  const st = S.step;
  if (e.code === 'Space') {
    e.preventDefault();
    if (st === 1) {
      const card = S.cards[S.idx];
      if (card) playCardAudio(card, retrieveAudioBase64);
    }
    return;
  }
  if (e.code === 'Enter') {
    e.preventDefault();
    if (st === 1) goStep(2);
    else if (st === 2 && !$('speech-next').disabled) goStep(3);
    else if (st === 3) passCard();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 's') stashCard();
  else if (k === 'o' && st === 2) overrideSpeech();
  else if (k === 'r' && st === 3) replayAnim();
}

// ── Go ───────────────────────────────────────────────────────
bootstrap();
