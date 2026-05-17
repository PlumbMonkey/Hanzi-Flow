# Project HanziFlow — Product Requirements Document v2.1

**Document type:** Developer handoff specification
**Status:** Approved for development
**Date:** May 2026
**Target environment:** Local-first static SPA — desktop (mouse/stylus) and mobile browser (touch/stylus)
**Intended toolchain:** VS Code + GitHub Copilot, or Claude Code

---

## 0. Why this document exists

This is a build specification, not a vision document. It is written so a developer (or an AI coding assistant) can implement HanziFlow from scratch without reverse-engineering a prototype. Every feature below includes implementation notes, data schemas, and acceptance criteria.

### Critical environment note — read before building

HanziFlow connects to **AnkiConnect** at `http://localhost:8765`. Browsers block **mixed content**: an HTTPS-served page cannot make `fetch()` requests to an HTTP localhost address. This is a browser security restriction and cannot be coded around.

Consequence: the app **must be served over HTTP or opened as a local file** during development and for live Anki use:

- `file://` — open the built `index.html` directly from disk
- `http://localhost:xxxx` — VS Code Live Server, `python -m http.server`, `vite dev`, etc.
- A custom domain over HTTPS works **only** if AnkiConnect is also reachable over HTTPS, which it is not by default.

The previously observed connection failure was caused by running the app inside an HTTPS sandbox. It is not a bug in the app logic. Demo mode (no network calls) is unaffected and should always work.

### AnkiConnect CORS setup

AnkiConnect must be configured to accept requests from the app's origin. In Anki: Tools → Add-ons → AnkiConnect → Config, set:

```json
{
  "webCorsOriginList": ["http://localhost:5500", "http://localhost", "*"]
}
```

During development `"*"` is acceptable. For a pinned production origin, list it explicitly.

---

## 1. Executive summary

HanziFlow is a single-page Mandarin learning application that runs an entire study session from inside one interface. It is not a tracker — it is the study tool itself. It pulls due cards from a local Anki database, then guides the learner through a fixed three-step wizard (comprehension → speech → handwriting) for each card, adapting workload and emphasis to the learner's measured weaknesses, all within a strict 25-minute daily timebox.

### Core objective

Eliminate app-switching fatigue. One distraction-free wizard takes the learner from reading and listening directly into physical writing and speaking, dynamically scaling difficulty to prevent burnout.

### What v2.1 adds over v1

The v1 build delivered the connection pipeline and the three-step wizard. v2.1 adds three subsystems and one infrastructure feature:

1. Adaptive Weakness Engine (AWE) — performance metadata logging and curriculum reshaping
2. Cultural / Etymology layer — radical breakdown and historical evolution per character
3. Real-time stroke validation — per-stroke green/red feedback on the writing canvas
4. Export / QR sync flow — package session state for continuation on a mobile device

---

## 2. System architecture

```
+---------------------------------------------------------------+
|                     FRONTEND DESIGN LAYER                      |
|     Warm tan / rice-paper palette · ink-on-paper aesthetic      |
+---------------------------------------------------------------+
                              |
                              v
+---------------------------------------------------------------+
|                      CORE ROUTING WIZARD                       |
|   Connect -> [ Listen -> Speak -> Write ] x N cards -> Wrap     |
+---------------------------------------------------------------+
        |                     |                      |
        v                     v                      v
+----------------+   +------------------+   +-------------------+
|  DATA ENGINES  |   | PRODUCTION       |   |  ADAPTIVE / META  |
|  AnkiConnect   |   | Web Speech API   |   |  AWE engine       |
|  Hanzi Writer  |   | Drag-and-drop    |   |  localStorage     |
|  Etymology DB  |   | Stroke validator |   |  Export / QR      |
+----------------+   +------------------+   +-------------------+
```

### 2.1 Tech stack

| Component | Technology | Purpose |
|---|---|---|
| Hosting | GitHub Pages (or any static host) | Serves the static frontend |
| Anki integration | AnkiConnect API (`localhost:8765`) | Fetches card data; pushes pass/fail |
| Character canvas | Hanzi Writer v3.5 | Stroke animation, tracing, quiz, per-stroke callbacks |
| Speech assessment | Web Speech API (`SpeechRecognition`) | Dictation and match-checking |
| Audio synthesis | Web Speech API (`SpeechSynthesis`) | TTS fallback when no Anki audio field |
| QR generation | `qrcode` (npm, v1.5.x) | Encodes session export payload |
| Analytics | Chart.js (Phase 4, optional) | Streak and HSK benchmark visualization |
| State persistence | `localStorage` | AWE history, streaks, settings |

No build step is strictly required — the app can ship as a single HTML file with CDN imports. A Vite project is recommended if the codebase is split into modules.

### 2.2 Recommended file structure (if modularized)

```
hanziflow/
  index.html
  src/
    main.js            Entry point, screen router
    anki.js            AnkiConnect wrapper + card loading
    wizard.js          Three-step wizard state machine
    awe.js             Adaptive Weakness Engine
    etymology.js       Etymology lookup + render
    canvas.js          Hanzi Writer integration + stroke validation
    speech.js          Web Speech recognition + STPVO game
    export.js          Session export + QR generation
    state.js           Central state object
  data/
    etymology.json     Character etymology dataset
    hsk-vocab.json     HSK 1-6 wordlists (Phase 4)
  styles/
    theme.css          Design tokens (see section 8)
```

Single-file delivery is acceptable for v2.1; the module split is a refactor target, not a requirement.

---

## 3. The three-step wizard

Only one cognitive task is visible at a time. The learner cannot see Step 2 while doing Step 1.

### Step 1 — Comprehension (Listen / Read)

Displays the active card. Three independently toggleable visual layers: Hanzi, Pinyin, English. Audio playback button.

Implementation notes:
- Audio source priority: (1) Anki audio field via `retrieveMediaFile`, decoded to a base64 data URL; (2) fallback to `SpeechSynthesis` with `lang = "zh-CN"`.
- Toggle chips control field visibility via opacity, not `display`, so layout does not shift.
- When AWE aural-discrimination mode is active (see 4.3), Pinyin defaults to hidden and TTS rate drops to 0.7.
- The etymology panel (section 5) sits in this step, collapsed by default.

Acceptance: learner can play audio, reveal/hide each field independently, expand etymology, and advance to Step 2.

### Step 2 — Speech verification (Speak)

Learner speaks the target phrase in Mandarin. The engine transcribes via Web Speech API and matches against the card's Hanzi.

Implementation notes:
- `SpeechRecognition` with `lang = "zh-CN"`, `maxAlternatives = 5`. Check all alternatives.
- Matching: strip whitespace from transcript and target; accept exact match OR a character-overlap similarity score above 0.85 (see section 7.4 for the algorithm). Exact string matching alone is too brittle for tonal transcription variance.
- On fail: if the card is a sentence card (has a `words` array), morph into the STPVO drag-and-drop game (section 6). On a single-word card with no `words` array, the learner retries or uses manual override.
- Manual override button ("I was correct") always available — accounts for browser audio quirks and false negatives. Override counts as a pass for AWE purposes.

Acceptance: a correct utterance unlocks Step 3; a failed utterance on a sentence card opens the STPVO game; override always unlocks Step 3.

### Step 3 — Hanzi canvas (Write)

Powered by Hanzi Writer inside a traditional 田字格 (tián zì gé) grid. Three modes:

- **Animate** — demonstrates correct stroke order and direction.
- **Trace** — character shown faint; learner traces; per-stroke validation active.
- **Quiz** — blank canvas; learner draws from memory; per-stroke validation active.

Multi-character words: a prev/next control steps through each character. Stroke validation accumulates across all characters of the word.

See section 7 for the real-time stroke validation spec.

Acceptance: learner can switch modes, navigate multi-character words, see per-stroke feedback, replay the animation, reveal the character, and pass or stash the card.

### Session loop and the Short Loop stash

Cards failed or manually stashed at any step go into a temporary in-memory **stash** array. After the main queue is exhausted, the wrap screen offers a "Review stash" pass that re-runs the stash as a fresh queue.

---

## 4. Adaptive Weakness Engine (AWE)

The AWE logs per-card performance metadata and reshapes the curriculum. It is exposed to the learner through a slide-in sidebar panel (toggled from the header).

### 4.1 Metadata logged per card

| Metric | Source | Used for |
|---|---|---|
| Response latency | `Date.now()` at card load vs. at card resolution | Latency log; fatigue signal |
| Speech match result | Step 2 pass/fail/override | Speak skill accuracy |
| Listen attempts | Audio playback count vs. comprehension pass | Listen skill accuracy; aural mode trigger |
| Stroke error count | Hanzi Writer `onMistake` / `onCorrectStroke` callbacks | Write skill accuracy |
| Weak-point flags | Any skill failing on a given card | Per-card weakness tags |

### 4.2 Skill accuracy model

Maintain three running counters, each `{ attempts, passed }`:

- `listen` — incremented when audio is played; passed when the learner advances Step 1 without needing repeated playback (define "needed repeat" as 3+ plays before advancing — tune in testing).
- `speak` — incremented per Step 2 attempt; passed on match or override.
- `write` — incremented per stroke attempt; passed per correct stroke. (Stroke-level granularity gives a smoother signal than card-level.)

Accuracy percentage = `passed / attempts`, rendered as a bar per skill in the AWE panel. Display `—` until at least one attempt exists.

### 4.3 Aural discrimination shift

If the learner fails to comprehend from audio but succeeds when reading, listening is the weak point. Rule:

> When `listen` accuracy falls below **70%** across **3 or more** attempts, activate **aural discrimination mode**.

Effects while active:
- Step 1 hides Pinyin and (optionally) Hanzi by default; learner must opt in to reveal.
- TTS playback rate drops to 0.7 for clearer enunciation.
- A visible blue notice explains why hints are reduced.
- Mode re-evaluates after every speech attempt and deactivates once accuracy recovers above the threshold.

### 4.4 Dynamic workload pacing

The system targets a strict 25-minute daily session. First-pass accuracy adjusts *tomorrow's* new-card target:

| First-pass accuracy | Next-day target adjustment |
|---|---|
| Above 90% | +2 to +5 new cards |
| 75% to 90% | No change |
| Below 75% | Contract target; 25-minute window weighted toward the Short Loop stash |

The next-day target is persisted to `localStorage` and read on the next session's connect screen as the default new-card limit.

### 4.5 Weak-point flags

When any skill fails on a specific card, tag that card: `weakpoints[hanzi] = Set("listen" | "speak" | "write")`. When a flagged card reappears in a later session, surface a banner at the top of the wizard: "Previously weak in {skills} — pay extra attention." Persist the weak-point map to `localStorage`.

### 4.6 AWE panel UI

A slide-in right sidebar containing: three skill accuracy bars, a flagged-weak-points tag list, a latency log (last 5 cards, in seconds), and an aural-mode status line. Toggled by a pill in the header. Updates live as the session progresses.

---

## 5. Cultural / Etymology layer

Characters should be learned as meaningful structures, not arbitrary symbols. Each Step 1 card carries a collapsible etymology panel.

### 5.1 Etymology data schema

`data/etymology.json` is a flat object keyed by single Hanzi character:

```json
{
  "安": {
    "radicals": [
      { "zh": "宀", "meaning": "roof / shelter", "strokes": 3 },
      { "zh": "女", "meaning": "woman",          "strokes": 3 }
    ],
    "evolution":  ["𠀌", "安", "安"],
    "evoLabels":  ["Oracle Bone", "Bronze", "Modern"],
    "note": "A woman sheltered under a roof — in ancient China this image embodied total peace and security for the household."
  }
}
```

Field definitions:
- `radicals` — array of component parts, each with the component character, a plain-language meaning, and stroke count. A character that is itself a radical has a single entry noting that.
- `evolution` — 3 to 4 glyph stages, oldest first.
- `evoLabels` — labels parallel to `evolution`, e.g. Oracle Bone, Bronze, Seal, Modern.
- `note` — 1 to 3 sentences of cultural / structural context.

### 5.2 Lookup behavior

For a multi-character card, scan each character left to right and display etymology for the first character found in the dataset. If no character is present in the dataset, the panel shows a neutral "No etymology data for this character yet" state — never an error.

### 5.3 Seed dataset

v2.1 ships with at least the following 20 high-frequency HSK 1–3 characters fully populated: 安 明 好 休 男 木 日 月 山 水 火 学 人 大 心 口 时 友 国 中. The dataset is designed to grow; adding a character is a pure-data edit with no code change.

### 5.4 Phase 4 expansion (not in v2.1)

Phase 4 extends this layer with animated glyph-evolution transitions, phono-semantic component mapping (which part carries sound vs. meaning), and native idiom alerts. v2.1 only needs the static panel above.

---

## 6. STPVO word-order game

Triggered when a sentence card fails the Step 2 speech check. The learner reconstructs the sentence under the Subject–Time–Place–Verb–Object grammar frame.

### 6.1 Card data requirement

A sentence card must carry a `words` array — the correctly ordered sentence components:

```json
{
  "hanzi": "我今天去图书馆学习",
  "pinyin": "Wǒ jīntiān qù túshūguǎn xuéxí",
  "english": "I go to the library to study today",
  "words": ["我", "今天", "图书馆", "去", "学习"]
}
```

For cards loaded from Anki, the `words` array is absent unless the Anki note has a dedicated field for it; the STPVO game only appears for cards that have it. Demo cards include it.

### 6.2 Mechanics

- Five labelled slots (Subject, Time, Place, Verb, Object) plus a shuffled word bank.
- HTML5 drag-and-drop. Chips move bank ↔ slot and slot ↔ slot. A drop onto an occupied slot returns the displaced chip to the bank.
- "Check order" compares slot contents against the `words` array in order.
- "Reveal answer" fills the slots correctly (used as a last resort; does not count as a pass).
- A correct arrangement counts as a Step 2 pass and unlocks Step 3.

Implementation note: attach `dragover` / `drop` listeners via `addEventListener` after the slots are rendered. Inline `ondragover` attributes referencing a global event object are unreliable — bind explicitly.

---

## 7. Real-time stroke validation

Trace and Quiz modes give per-stroke feedback as the learner draws.

### 7.1 Hanzi Writer quiz configuration

```javascript
writer.quiz({
  leniency: 0.9,
  onCorrectStroke: (info) => markStroke(info.strokeNum, true),
  onMistake:       (info) => markStroke(info.strokeNum, false),
  onComplete:      (summary) => finishCharacter(summary)
});
```

### 7.2 Visual feedback

Below the canvas, render one dot per stroke (count comes from `onLoadCharDataSuccess` → `data.strokes.length`). A correct stroke turns the dot green; a mistake turns it red. Dots are keyed by `charIndex` and `strokeNum` so multi-character words keep separate rows.

Hanzi Writer color config for the warm theme:
- `strokeColor` — ink brown, the resting character color
- `drawingColor` — vermillion, the learner's drawn strokes
- `highlightColor` — sage green, correct-stroke highlight
- `outlineColor` — faint ink, the trace guide

### 7.3 Feeding AWE

Each `onCorrectStroke` increments `write.attempts` and `write.passed`; each `onMistake` increments `write.attempts` only. On card pass, if the character's correct-stroke ratio is below 0.7, flag the card weak in `write`.

### 7.4 Speech similarity algorithm

For Step 2 matching, when an exact string match fails, compute a character-overlap ratio:

```javascript
function similarity(heard, target) {
  const heardSet = new Set(heard.split(''));
  let hits = 0;
  for (const ch of target.split('')) if (heardSet.has(ch)) hits++;
  return hits / Math.max(heard.length, target.length);
}
```

Accept the utterance if `similarity >= 0.85`. This tolerates minor transcription noise without accepting unrelated input. Tune the threshold in testing; expose it as a constant.

### 7.5 Missing character handling

If Hanzi Writer has no stroke data for a character (`onLoadCharDataError`), display the character large and faint with a quiet "Stroke data unavailable" caption, skip stroke validation for it, and let the session continue uninterrupted. Never block the wizard on a missing glyph.

---

## 8. Design and theme

### 8.1 Visual direction

Warm tan / rice-paper aesthetic — ink-on-paper, calm, traditionally Asian in feel. Light background, soft warm neutrals, a single sharp vermillion accent, muted gold and sage as secondary accents. Ample whitespace. Subtle horizontal rule texture evoking writing paper. This replaces the v2 dark theme, which the learner found less fitting.

### 8.2 Color tokens

Implement as CSS custom properties:

```css
:root {
  --ink:          #1a1208;   /* primary text, drawn strokes resting */
  --ink-light:    #3d3020;   /* secondary text */
  --paper:        #f7f2e8;   /* page background */
  --paper-warm:   #ede8d8;   /* card surfaces */
  --paper-dark:   #d6cebc;   /* hover surfaces, dividers */
  --vermillion:   #c0392b;   /* primary accent, drawn strokes */
  --vermillion-dim:#8b2a1e;  /* accent hover */
  --gold:         #b8860b;   /* etymology accent, bonus offers */
  --sage:         #5a7a5a;   /* success, correct strokes */
  --muted:        #7a6e5c;   /* hint text */
  --stroke:       rgba(26,18,8,0.15);   /* default borders */
  --stroke-strong:rgba(26,18,8,0.35);   /* emphasis borders */
}
```

### 8.3 Typography

- Display / headings: `IM Fell English` (serif, antiquarian character) for an editorial, classical tone.
- Hanzi: `Noto Serif SC` — proper Chinese serif rendering.
- Body / UI: `Noto Sans SC` at weight 300.

### 8.4 Usability requirements

- **Responsive canvas** — the Hanzi Writer canvas resizes for desktop pointer and mobile/tablet touch (stylus).
- **Keyboard shortcuts** — `Space` play audio, `Enter` advance step / pass card, `S` stash, `O` speech override, `R` replay animation, `1`–`4` grade (Phase 3 grading hook).
- **Minimalist surfaces** — flat fills, thin borders, no heavy shadows. Texture and warmth come from the palette, not from effects.

---

## 9. Export / QR sync flow

AnkiConnect's local port is unreachable from a phone. The export flow lets the learner carry session results to a mobile device.

### 9.1 Export payload schema

On the wrap screen, build:

```json
{
  "version": "2.1",
  "exported": "2026-05-17T12:00:00.000Z",
  "sessionMinutes": 22,
  "passed": 9,
  "stash": [ /* full card objects still in stash */ ],
  "awe": {
    "listen":  { "attempts": 12, "passed": 10 },
    "speak":   { "attempts": 11, "passed": 8 },
    "write":   { "attempts": 64, "passed": 58 },
    "weakpoints": { "图书馆": ["speak"] },
    "latency": [ { "hanzi": "学习", "ms": 8400 } ]
  }
}
```

### 9.2 Delivery

- **Download** — write the full JSON as `hanziflow-session-YYYY-MM-DD.json` via a Blob URL.
- **Copy** — full JSON to clipboard.
- **QR code** — a QR cannot reliably hold a full session payload (≈2–3 KB ceiling). Encode a **compact** payload only — timestamp, passed count, stash count, and the weak-point map — under a `hanziflow://import?data=<base64>` URI. The companion mobile experience parses this URI; the full state travels by the downloaded file.

### 9.3 Mobile companion (future)

A future React Native / PWA companion registers the `hanziflow://` scheme (or accepts the `.json` file) and runs a review-only session from the exported state. Out of scope for v2.1 — the export side is built now so the data contract is fixed.

---

## 10. Phased roadmap

| Phase | Module | Features | Status |
|---|---|---|---|
| 1 | Local pipeline | AnkiConnect handshake, field mapping, due-card queue | Complete (v1) |
| 2 | Production loop | Three-step wizard, Web Speech, Hanzi Writer, Short Loop stash | Complete (v1) |
| 3 | Adaptive brain | AWE, 25-min timebox, stroke validation, STPVO, etymology layer, export/QR | This document (v2.1) |
| 4 | Culture & etymology+ | Animated glyph evolution, phono-semantic mapping, idiom alerts, HSK benchmark charts | Future |
| 5 | Gamified world | Story chapters, avatar progression, community scoreboards | Future / premium |

---

## 11. Risk and mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| HTTPS sandbox blocks `localhost` fetch | High | Document HTTP/`file://` serving requirement prominently (section 0); demo mode needs no network |
| AnkiConnect requires Anki open | High | Friendly "Waiting for Anki…" state with troubleshooting steps; explicit "Check connection" action |
| Web Speech API varies by browser | Medium | Detect support; warn on unsupported browsers; always-available manual override; tunable similarity threshold |
| Hanzi Writer missing rare characters | Low | `onLoadCharDataError` shows the glyph faint and skips validation; session never blocks |
| QR payload size ceiling | Low | QR carries a compact payload only; full state travels by downloaded `.json` file |
| Anki note lacks a `words` field | Low | STPVO game appears only for cards that have a `words` array; absence degrades gracefully |
| CORS rejection from AnkiConnect | Medium | Document `webCorsOriginList` config (section 0); surface CORS errors distinctly from "Anki not running" |

---

## 12. Acceptance checklist for v2.1

- [ ] App runs from `file://` and `http://localhost` and connects to AnkiConnect
- [ ] Demo mode runs a full session with zero network calls
- [ ] Connect screen lists decks, maps four fields, and persists the new-card limit
- [ ] Three-step wizard enforces one task at a time
- [ ] Audio plays from the Anki audio field, with TTS fallback
- [ ] Speech check matches with the similarity algorithm and offers manual override
- [ ] STPVO game appears on sentence-card speech failure and validates order
- [ ] Hanzi canvas supports Animate / Trace / Quiz and multi-character navigation
- [ ] Per-stroke green/red dots update live in Trace and Quiz
- [ ] Etymology panel renders radicals, evolution, and cultural note for seeded characters
- [ ] AWE panel shows live skill bars, weak-point tags, and latency log
- [ ] Aural discrimination mode activates below 70% listening accuracy
- [ ] 25-minute timebox fires the wrap modal with accuracy-aware messaging
- [ ] Wrap screen exports JSON (download + copy) and renders a scannable QR code
- [ ] Pass/fail syncs back to Anki via `answerCards` outside demo mode
- [ ] Warm tan / rice-paper theme applied throughout

---

*End of document — HanziFlow PRD v2.1*
