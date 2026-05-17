/**
 * STPVO drag-and-drop word-order game (PRD §6).
 *
 * Triggered when Step 2 speech fails on a sentence card that carries a `words`
 * array. Five labelled slots (Subject, Time, Place, Verb, Object) plus a
 * shuffled word bank. Drop onto an occupied slot returns the displaced chip
 * to the bank.
 *
 * PRD §6 implementation note: bind listeners with addEventListener, not inline
 * ondragover — inline handlers referencing a global event object are unreliable.
 */
import { S, $ } from './state.js';
import { setFeedback } from './speech.js';

let dragWord = null;

export function renderSTPVO(words, onPass) {
  $('stpvo-zone').style.display = 'flex';
  const slotsHost = $('stpvo-slots');
  const bank = $('word-bank');

  slotsHost.innerHTML = Array(5).fill(0)
    .map((_, i) => `<div class="stpvo-slot" id="slot-${i}" data-slot="${i}"></div>`)
    .join('');

  const shuffled = [...words].sort(() => Math.random() - 0.5);
  bank.innerHTML = shuffled.map((w) =>
    `<div class="word-chip" draggable="true" data-word="${escapeAttr(w)}">${escapeText(w)}</div>`
  ).join('');

  // Bind drag start on chips
  bank.querySelectorAll('.word-chip').forEach((chip) => bindChip(chip));

  // Bind slot drop targets
  document.querySelectorAll('.stpvo-slot').forEach((slot) => {
    slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('dragover'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
    slot.addEventListener('drop',     (e) => dropOnSlot(e, slot));
  });

  // Bind bank as drop target
  bank.addEventListener('dragover', (e) => e.preventDefault());
  bank.addEventListener('drop',     (e) => dropOnBank(e));

  // Wire check / reveal buttons (idempotent — replace listeners by cloning)
  rebindButton('stpvo-check',  () => checkOrder(words, onPass));
  rebindButton('stpvo-reveal', () => revealOrder(words));
}

export function hideSTPVO() {
  $('stpvo-zone').style.display = 'none';
  $('stpvo-slots').innerHTML = '';
  $('word-bank').innerHTML = '';
}

function bindChip(chip) {
  chip.addEventListener('dragstart', (e) => {
    dragWord = chip.dataset.word;
    chip.classList.add('dragging');
    // Some browsers need data on the dataTransfer to permit drag
    try { e.dataTransfer.setData('text/plain', dragWord); } catch { /* ignore */ }
  });
  chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
}

function dropOnSlot(e, slot) {
  e.preventDefault();
  slot.classList.remove('dragover');
  if (!dragWord) return;

  // Displace any existing chip back to bank
  if (slot.firstChild) $('word-bank').appendChild(slot.firstChild);

  const chip = document.querySelector(`.word-chip[data-word="${cssEscape(dragWord)}"]`);
  if (chip) {
    chip.classList.remove('dragging');
    chip.classList.add('placed');
    slot.appendChild(chip);
    bindChip(chip);
  }
  dragWord = null;
}

function dropOnBank(e) {
  e.preventDefault();
  if (!dragWord) return;
  const chip = document.querySelector(`.word-chip.placed[data-word="${cssEscape(dragWord)}"]`);
  if (chip) {
    chip.classList.remove('placed');
    $('word-bank').appendChild(chip);
    bindChip(chip);
  }
  dragWord = null;
}

function checkOrder(target, onPass) {
  const placed = Array.from({ length: 5 }, (_, i) => {
    const slot = $(`slot-${i}`);
    return slot && slot.firstChild ? slot.firstChild.dataset.word : null;
  }).filter(Boolean);

  const ok = placed.length === target.length && placed.every((w, i) => w === target[i]);

  if (ok) {
    S.speechPassed = true;
    $('speech-next').disabled = false;
    setFeedback('Word order correct ✓', 'ok');
    onPass?.();
  } else {
    setFeedback('Not quite — keep adjusting', 'fail');
  }
}

function revealOrder(words) {
  words.forEach((w, i) => {
    const slot = $(`slot-${i}`);
    if (!slot) return;
    slot.innerHTML = '';
    const chip = document.createElement('div');
    chip.className = 'word-chip placed';
    chip.dataset.word = w;
    chip.textContent = w;
    slot.appendChild(chip);
    bindChip(chip);
  });
  $('word-bank').innerHTML = '';
  // Reveal does NOT count as a pass (PRD §6.2)
  setFeedback('Revealed — try again to log a real pass', '');
}

// ── helpers ────────────────────────────────────────────────
function rebindButton(id, handler) {
  const old = $(id);
  if (!old) return;
  const clone = old.cloneNode(true);
  old.parentNode.replaceChild(clone, old);
  clone.addEventListener('click', handler);
}

function cssEscape(s) {
  return String(s).replace(/(["\\])/g, '\\$1');
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

function escapeText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
