# HanziFlow v2.1

Mandarin study wizard built to PRD v2.1. Pulls due cards from Anki (via AnkiConnect on `localhost:8765`), runs each through a fixed three-step wizard (Listen → Speak → Write), and adapts the curriculum to the learner's measured weaknesses inside a strict 25-minute daily timebox.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed URL (default `http://localhost:5500`). The app **must** be served over `http://` (or opened as a `file://`) — browsers block HTTPS pages from calling the HTTP `localhost:8765` AnkiConnect endpoint. Demo mode requires no network at all.

## AnkiConnect setup

In Anki: Tools → Add-ons → AnkiConnect → Config. Add the dev origin to `webCorsOriginList`:

```json
{
  "webCorsOriginList": ["http://localhost:5500", "http://localhost", "*"]
}
```

`"*"` is fine during development; pin to your origin for production.

## Project layout

```
hanziflow-v2.1/
├── index.html              shell
├── src/
│   ├── main.js             entry point, screen router, keyboard shortcuts
│   ├── state.js            central S object
│   ├── persistence.js      localStorage wrapper (limits, weakpoints, next-day target)
│   ├── anki.js             AnkiConnect wrapper + card loading
│   ├── wizard.js           three-step state machine + session loop
│   ├── awe.js              Adaptive Weakness Engine
│   ├── etymology.js        lookup + render
│   ├── canvas.js           Hanzi Writer + per-stroke validation
│   ├── speech.js           Web Speech + similarity matching
│   ├── stpvo.js            drag-and-drop word-order game
│   ├── export.js           JSON download + QR generation
│   └── demo.js             demo cards + idioms
├── data/
│   └── etymology.json      20 HSK 1–3 seed characters
└── styles/
    └── theme.css           warm tan / rice-paper design tokens
```

## What v2.1 adds over v2

- Warm tan / rice-paper theme (replaces v2 dark)
- localStorage persistence: new-card limit, weak-points map, next-day target
- Dynamic workload pacing per PRD §4.4 (first-pass accuracy adjusts tomorrow's new-card target)
- Modular ES-module codebase (Vite)
- Acceptance criteria checklist from PRD §12 — see commit log for status

## Tech notes

| Component | Library |
|---|---|
| Character canvas | hanzi-writer v3.5 |
| Speech | Web Speech API (browser native) |
| QR | qrcode v1.5 |
| Build | Vite v5 |

See `HanziFlow_PRD_v2.1.md` (one level up) for the full build spec.
