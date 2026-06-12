/**
 * Minimal Pairs deck — data loader and Anki TSV export.
 *
 * Data shape: { meta: {...}, pairs: [...] }
 *   meta  — deck name (墨语), error map, pronunciation rules, homework, next card
 *   pairs — active pair sets; each has characters, trap zone, drill sentences
 *
 * Path 1 (HanziFlow): buildPairSessionCards() returns wizard-compatible cards
 * so the full 3-step loop runs for each character.
 *
 * Path 2 (Anki): exportAnkiTsv() downloads a tab-separated file importable
 * into Anki as Basic note type. No add-ons required.
 */

let META = {};
let PAIRS = [];

export async function loadPairsDB() {
  try {
    const res = await fetch(new URL('../data/pairs.json', import.meta.url));
    if (res.ok) {
      const data = await res.json();
      META  = data.meta  ?? {};
      PAIRS = data.pairs ?? [];
    }
  } catch (e) {
    console.warn('Pairs load failed (continuing without):', e);
    META = {}; PAIRS = [];
  }
}

export function getPairs()    { return PAIRS; }
export function getDeckMeta() { return META; }

// ── Path 1: HanziFlow session cards ──────────────────────────
/**
 * Returns a flat wizard-compatible card array.
 * Each character in each pair becomes one card.
 * Cards carry `pairId` and `pairPartner` for future UI use.
 */
export function buildPairSessionCards() {
  const cards = [];
  for (const pair of PAIRS) {
    for (const ch of pair.characters) {
      cards.push({
        hanzi:       ch.hanzi,
        pinyin:      ch.pinyin,
        english:     ch.english,
        audioFile:   null,
        type:        'New',
        words:       null,
        pairId:      pair.id,
        pairPrompt:  pair.prompt,
        pairPartner: pair.characters.find((c) => c.hanzi !== ch.hanzi)?.hanzi ?? null,
      });
    }
  }
  return cards;
}

// ── Path 2: Anki TSV export ───────────────────────────────────
/**
 * Generates a tab-separated text file for Anki import.
 * Import as: File → Import → select file → Note type: Basic
 * Fields: Front, Back, Tags
 *
 * The file starts with a "#separator:tab" header so Anki auto-detects it.
 */
export function exportAnkiTsv() {
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    '#deck:HanziFlow Minimal Pairs',
    '#tags column:3',
  ];

  for (const pair of PAIRS) {
    const front = buildFront(pair);
    const back  = buildBack(pair);
    const tags  = `hanziflow minimal-pairs ${pair.id}`;
    lines.push([front, back, tags].join('\t'));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hanziflow-minimal-pairs.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/**
 * Generates a dated, share-ready Anki TSV.
 * Deck name and filename include the local date so each release is traceable.
 */
export function exportSharedAnkiTsv() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const cardLabel = META.currentCard ? `C${META.currentCard}` : 'CXX';
  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    `#deck:HanziFlow Shared ${dateStamp} :: ${cardLabel} Trap Pack`,
    '#tags column:3',
  ];

  for (const pair of PAIRS) {
    const front = buildFront(pair);
    const back  = buildBack(pair);
    const tags  = `hanziflow minimal-pairs shared ${pair.id}`;
    lines.push([front, back, tags].join('\t'));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hanziflow-minimal-pairs-${dateStamp}-shared.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

// ── HTML builders ─────────────────────────────────────────────
function e(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFront(pair) {
  const chars = pair.characters;
  return `<div style="font-family:serif;text-align:center;padding:20px">
  <div style="font-size:56px;letter-spacing:24px;color:#1a1208">${chars.map((c) => e(c.hanzi)).join('　')}</div>
  <div style="font-size:18px;color:#7a6a50;letter-spacing:8px;margin-top:8px">${chars.map((c) => e(c.pinyin)).join('　　　')}</div>
  <div style="font-size:13px;color:#9a8a70;margin-top:4px">${chars.map((c) => e(c.english)).join('　　')}</div>
  <div style="margin-top:20px;font-size:15px;color:#1a1208;background:#fbf8f0;border:1px solid #d4c8a8;border-radius:6px;padding:14px 20px;display:inline-block">
    🔊 ${e(pair.prompt)}<br>
    <span style="font-size:12px;color:#7a6a50">${e(pair.promptEn)}</span>
  </div>
  <div style="margin-top:14px;font-size:12px;color:#9a8a70">🎨 Hint: Look at the radicals — do they look the same?</div>
</div>`;
}

function buildBack(pair) {
  const blocks = pair.characters.map((ch) => `
  <div style="border:1px solid #d4c8a8;border-radius:8px;padding:16px;margin-bottom:14px;background:#fbf8f0">
    <div style="font-size:32px;font-family:serif;color:#c0392b">${e(ch.hanzi)}
      <span style="font-size:16px;color:#7a6a50;font-family:sans-serif">${e(ch.pinyin)}</span>
      <span style="font-size:13px;color:#9a8a70;font-family:sans-serif">${e(ch.tone)}</span>
    </div>
    <div style="font-size:13px;color:#5a7a5a;margin:6px 0">🔊 ${e(ch.pronunciation)}</div>
    <div style="font-size:12px;color:#1a1208;margin:8px 0;line-height:1.6">
      ✍️ <strong>Calligraphy:</strong> ${e(ch.calligraphy)}
    </div>
    <div style="font-size:12px;color:#1a1208;line-height:1.6;border-left:3px solid #c0a030;padding-left:10px">
      🏯 ${e(ch.culture)}
    </div>
  </div>`).join('');

  const drillRows = pair.trapZone.drill.map((d) =>
    `<tr><td style="font-size:15px;font-family:serif;padding:4px 10px">${e(d.zh)}</td>` +
    `<td style="font-size:12px;color:#7a6a50;padding:4px 10px">${e(d.py)}</td>` +
    `<td style="font-size:12px;color:#9a8a70;padding:4px 10px">${e(d.en)}</td></tr>`
  ).join('');

  return `<div style="font-family:sans-serif;padding:16px;max-width:520px;margin:0 auto">
  ${blocks}
  <div style="border:2px solid #c0392b;border-radius:8px;padding:14px;background:#fff8f5;margin-bottom:14px">
    <div style="font-size:13px;font-weight:bold;color:#c0392b;margin-bottom:8px">⚠️ TRAP ZONE</div>
    <div style="font-size:12px;color:#1a1208;margin-bottom:10px">${e(pair.trapZone.confusion)}<br>${e(pair.trapZone.reason)}</div>
    <table style="width:100%;border-collapse:collapse">${drillRows}</table>
  </div>
</div>`;
}
