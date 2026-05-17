/**
 * Central session state.
 *
 * Everything that lives only for the duration of one wizard session goes here.
 * Persistent values (weak-points across sessions, next-day target, last new-card
 * limit) live in persistence.js and are read at session start.
 */
export const S = {
  // Card queue
  cards: [],
  stash: [],
  idx: 0,
  step: 1,
  passed: 0,
  isDemo: false,

  // Session timing
  sessionStart: null,
  timerInt: null,
  timeboxFired: false,
  cardStart: null,

  // Anki field mapping (set on session start, used for cardsInfo extraction)
  ankiFields: { hanzi: '', pinyin: '', english: '', audio: '' },

  // Step 1 field visibility
  showHanzi: true,
  showPinyin: true,
  showEnglish: true,

  // Step 2 speech
  speechRec: null,
  speechActive: false,
  speechPassed: false,

  // Step 3 Hanzi Writer
  hw: null,
  chars: [],
  charIdx: 0,
  canvasMode: 'animate',
  strokeTotal: 0,
  strokeOk: 0,

  // AWE — session-local
  awe: {
    listen:  { attempts: 0, passed: 0 },
    speak:   { attempts: 0, passed: 0 },
    write:   { attempts: 0, passed: 0 },
    latency: [],          // [{ hanzi, ms }]
    weakpoints: {},       // { hanzi: Set<'listen'|'speak'|'write'> }
    auralMode: false,
    listenPlayCount: 0,   // plays for the active card (PRD §4.2: 3+ counts as "needed repeat")
  },

  // Export payload built on wrap
  exportJSON: '{}',
};

export function resetSession() {
  S.cards = [];
  S.stash = [];
  S.idx = 0;
  S.step = 1;
  S.passed = 0;
  S.sessionStart = null;
  S.timeboxFired = false;
  S.cardStart = null;
  S.speechPassed = false;
  S.speechActive = false;
  S.hw = null;
  S.chars = [];
  S.charIdx = 0;
  S.canvasMode = 'animate';
  S.strokeTotal = 0;
  S.strokeOk = 0;
  S.awe = {
    listen:  { attempts: 0, passed: 0 },
    speak:   { attempts: 0, passed: 0 },
    write:   { attempts: 0, passed: 0 },
    latency: [],
    weakpoints: {},
    auralMode: false,
    listenPlayCount: 0,
  };
}

export const $ = (id) => document.getElementById(id);
