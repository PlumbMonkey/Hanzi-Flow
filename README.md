# 漢字Flow — HanziFlow

A Mandarin study companion that pulls your due Anki cards and runs them through a three-step learning loop: **Listen → Speak → Write**.

Built with Vite · [hanzi-writer](https://github.com/chanind/hanzi-writer) · Web Speech API · AnkiConnect

---

## Features

- **Step 1 — Listen** — Play card audio (Anki file or browser TTS) and review the character, pinyin, and meaning. Toggle fields to self-quiz.
- **Step 2 — Speak** — Speak the character into your microphone. Passes on exact match or ≥ 85 % character overlap. Falls back to a STPVO word-order drag game on failure.
- **Step 3 — Write** — Animate, trace, or quiz strokes on a Tian-grid canvas powered by hanzi-writer.
- **Adaptive Weakness Engine (AWE)** — Tracks listen / speak / write accuracy per card across sessions. Flags weak points, activates aural-discrimination mode when listening drops below 70 %, and adjusts tomorrow's card count dynamically.
- **Character etymology** — Radical breakdown, historical evolution, and cultural notes from a bundled JSON database.
- **Session export** — Download a full `.json` snapshot or scan the QR code at wrap-up to carry weak-point data to another device.
- **Demo mode** — Try the full workflow without Anki using built-in sample cards.

---

## Requirements

| Tool | Notes |
|---|---|
| [Anki desktop](https://apps.ankiweb.net/) | Free, runs on Windows / macOS / Linux |
| [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159) | Add-on code `2055492159` — Tools → Add-ons → Get Add-ons |
| Chrome or Edge | Required for microphone speech recognition (Web Speech API) |
| Node.js 18 + | For local development only |

---

## Quick start

```bash
cd hanziflow-v2.1
npm install
npm run dev
# Open http://localhost:5500
```

### AnkiConnect CORS setup

HanziFlow runs on `http://localhost:5500`. Anki blocks cross-origin requests by default.

1. Open Anki → **Tools → Add-ons → AnkiConnect → Config**
2. Add your origin to `webCorsOriginList`:

```json
{
  "webCorsOriginList": [
    "http://localhost:5500"
  ]
}
```

3. **Restart Anki** after saving.

> If you host the app online (see below), also add your hosted URL to `webCorsOriginList` — e.g. `"https://plumbmonkey.github.io"`.

---

## Microphone troubleshooting

Speech recognition requires Chrome or Edge and microphone permission.

- **"Microphone access denied"** — Click the lock icon in the browser address bar → allow microphone → refresh and try again.
- **"Network error"** — Chrome's speech recognition requires an internet connection. Use the **override button** if you are offline.
- **No browser support** — Firefox and Safari do not support the Web Speech API. Switch to Chrome or Edge.

---

## Deploying to GitHub Pages

### 1 — Set the base path

Edit `hanziflow-v2.1/vite.config.js` and add `base`:

```js
export default defineConfig({
  base: '/Hanzi-Flow/',
  server: { port: 5500, strictPort: false, open: false },
  build: { target: 'es2020', sourcemap: true },
});
```

### 2 — Add the GitHub Actions workflow

Create `.github/workflows/deploy.yml` in the repo root:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: hanziflow-v2.1/package-lock.json
      - run: npm ci
        working-directory: hanziflow-v2.1
      - run: npm run build
        working-directory: hanziflow-v2.1
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: hanziflow-v2.1/dist
      - uses: actions/deploy-pages@v4
        id: deployment
```

### 3 — Enable Pages in GitHub

Go to **Settings → Pages → Source** and select **GitHub Actions**.

Every push to `main` will build and deploy automatically. Your app will be live at:
`https://plumbmonkey.github.io/Hanzi-Flow/`

---

## Project structure

```
hanziflow-v2.1/
├── index.html
├── vite.config.js
├── package.json
├── data/
│   └── etymology.json        # Bundled character etymology database
├── public/                   # Static assets
├── src/
│   ├── main.js               # Entry point — DOM wiring only
│   ├── state.js              # Central session state
│   ├── wizard.js             # 3-step session loop
│   ├── speech.js             # Web Speech API (mic + TTS)
│   ├── canvas.js             # hanzi-writer stroke canvas
│   ├── anki.js               # AnkiConnect API wrapper
│   ├── awe.js                # Adaptive Weakness Engine
│   ├── etymology.js          # Etymology panel
│   ├── stpvo.js              # Word-order drag game
│   ├── export.js             # JSON export + QR code
│   ├── persistence.js        # localStorage helpers
│   └── demo.js               # Built-in demo cards
└── styles/
    └── theme.css             # Design tokens + layout
```

---

## License

MIT © PlumbMonkey
