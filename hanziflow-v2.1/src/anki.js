/**
 * AnkiConnect wrapper + deck/field loading + session card fetch.
 *
 * AnkiConnect lives at http://localhost:8765 on the user's machine.
 * Browsers block mixed content, so this app must be served over http:// or file://
 * (see PRD §0). CORS must allow this origin — see README for the webCorsOriginList
 * setting.
 */

const ANKI_URL = 'http://localhost:8765';

export async function anki(action, params = {}) {
  const res = await fetch(ANKI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function ping() {
  return anki('version');
}

export async function listDecks() {
  return anki('deckNames');
}

export async function sampleCardFields(deckName) {
  const ids = await anki('findCards', { query: `deck:"${deckName}"` });
  if (!ids.length) return [];
  const info = await anki('cardsInfo', { cards: [ids[0]] });
  return Object.keys(info[0].fields);
}

export async function fetchSessionCards({ deckName, newLimit, fieldMap }) {
  const dueIds = await anki('findCards', { query: `deck:"${deckName}" is:due` });
  const newIds = await anki('findCards', { query: `deck:"${deckName}" is:new` });
  const all = [...dueIds, ...newIds.slice(0, Math.max(0, newLimit))];
  if (!all.length) return [];

  // Cap at 30 per session to keep things responsive; remainder waits for next session.
  const sliced = all.slice(0, 30);
  const infos = await anki('cardsInfo', { cards: sliced });

  return infos.map((c, i) => ({
    cardId:    c.cardId,
    hanzi:     stripHtml(c.fields[fieldMap.hanzi]?.value || ''),
    pinyin:    stripHtml(c.fields[fieldMap.pinyin]?.value || ''),
    english:   stripHtml(c.fields[fieldMap.english]?.value || ''),
    audioFile: extractAudio(c.fields[fieldMap.audio]?.value || ''),
    type:      i < dueIds.length ? 'Review' : 'New',
    words:     null,   // Anki cards rarely carry a sentence-component array; demo cards do.
  }));
}

export async function retrieveAudioBase64(filename) {
  return anki('retrieveMediaFile', { filename });
}

export async function answerCard(cardId, passed) {
  // ease: 3 = good, 1 = again. Coarse but correct for the prototype.
  return anki('answerCards', { answers: [{ cardId, ease: passed ? 3 : 1 }] });
}

// ── Field heuristics ──────────────────────────────────────────
// Given the deck's field list, pick the most likely match for each role.
export function guessFieldMap(fields) {
  const find = (candidates) =>
    fields.find((f) => candidates.some((c) => f.toLowerCase().includes(c))) || fields[0];

  return {
    hanzi:   find(['hanzi', 'front', 'character', 'simplified', 'word']),
    pinyin:  find(['pinyin', 'pronunciation', 'reading']),
    english: find(['english', 'back', 'meaning', 'translation']),
    audio:   find(['audio', 'sound']),
  };
}

// ── Helpers ───────────────────────────────────────────────────
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').trim();
}

function extractAudio(value) {
  const m = value.match(/\[sound:([^\]]+)\]/);
  return m ? m[1] : null;
}
