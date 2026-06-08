/**
 * One-shot script: generate hanziflow-minimal-pairs.txt for Anki import.
 * Run: node generate-anki.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, 'data/pairs.json'), 'utf8'));
const PAIRS = data.pairs;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFront(pair) {
  const chars = pair.characters;
  return [
    '<div style="font-family:serif;text-align:center;padding:20px">',
    `<div style="font-size:56px;letter-spacing:24px;color:#1a1208">${chars.map(c => esc(c.hanzi)).join('\u3000')}</div>`,
    `<div style="font-size:18px;color:#7a6a50;letter-spacing:8px;margin-top:8px">${chars.map(c => esc(c.pinyin)).join('\u3000\u3000\u3000')}</div>`,
    `<div style="font-size:13px;color:#9a8a70;margin-top:4px">${chars.map(c => esc(c.english)).join('\u3000\u3000')}</div>`,
    '<div style="margin-top:20px;font-size:15px;color:#1a1208;background:#fbf8f0;border:1px solid #d4c8a8;border-radius:6px;padding:14px 20px;display:inline-block">',
    `\uD83D\uDD0A ${esc(pair.prompt)}<br><span style="font-size:12px;color:#7a6a50">${esc(pair.promptEn)}</span>`,
    '</div>',
    '<div style="margin-top:14px;font-size:12px;color:#9a8a70">\uD83C\uDFA8 Hint: Look at the radicals \u2014 do they look the same?</div>',
    '</div>',
  ].join('');
}

function buildBack(pair) {
  const blocks = pair.characters.map(ch => [
    '<div style="border:1px solid #d4c8a8;border-radius:8px;padding:16px;margin-bottom:14px;background:#fbf8f0">',
    `<div style="font-size:32px;font-family:serif;color:#c0392b">${esc(ch.hanzi)}`,
    ` <span style="font-size:16px;color:#7a6a50;font-family:sans-serif">${esc(ch.pinyin)}</span>`,
    ` <span style="font-size:13px;color:#9a8a70;font-family:sans-serif">${esc(ch.tone)}</span></div>`,
    `<div style="font-size:13px;color:#5a7a5a;margin:6px 0">\uD83D\uDD0A ${esc(ch.pronunciation)}</div>`,
    `<div style="font-size:12px;color:#1a1208;margin:8px 0;line-height:1.6">\u270D\uFE0F <strong>Calligraphy:</strong> ${esc(ch.calligraphy)}</div>`,
    `<div style="font-size:12px;color:#1a1208;line-height:1.6;border-left:3px solid #c0a030;padding-left:10px">\uD83C\uDFEF ${esc(ch.culture)}</div>`,
    `<div style="font-size:12px;color:#3a6090;line-height:1.6;margin-top:6px;border-left:3px solid #3a6090;padding-left:10px">\uD83D\uDCDC ${esc(ch.etymology)}</div>`,
    '</div>',
  ].join('')).join('');

  const drillRows = pair.trapZone.drill.map(d =>
    `<tr><td style="font-size:15px;font-family:serif;padding:4px 10px">${esc(d.zh)}</td>` +
    `<td style="font-size:12px;color:#7a6a50;padding:4px 10px">${esc(d.py)}</td>` +
    `<td style="font-size:12px;color:#9a8a70;padding:4px 10px">${esc(d.en)}</td></tr>`
  ).join('');

  return [
    '<div style="font-family:sans-serif;padding:16px;max-width:520px;margin:0 auto">',
    blocks,
    '<div style="border:2px solid #c0392b;border-radius:8px;padding:14px;background:#fff8f5;margin-bottom:14px">',
    '<div style="font-size:13px;font-weight:bold;color:#c0392b;margin-bottom:8px">\u26A0\uFE0F\u26A1 TRAP ZONE \u26A1\u26A0\uFE0F</div>',
    `<div style="font-size:12px;color:#1a1208;margin-bottom:10px">${esc(pair.trapZone.confusion)}<br>${esc(pair.trapZone.reason)}</div>`,
    `<table style="width:100%;border-collapse:collapse">${drillRows}</table>`,
    '</div></div>',
  ].join('');
}

const lines = [
  '#separator:tab',
  '#html:true',
  '#notetype:Basic',
  '#deck:HanziFlow Minimal Pairs :: 墨语 Mò Yǔ',
  '#tags column:3',
];

for (const pair of PAIRS) {
  const front = buildFront(pair);
  const back  = buildBack(pair);
  const tags  = `hanziflow minimal-pairs ${pair.id}`;
  lines.push([front, back, tags].join('\t'));
}

writeFileSync(join(__dirname, 'hanziflow-minimal-pairs.txt'), lines.join('\n'), 'utf8');
console.log(`Generated ${PAIRS.length} Anki cards → hanziflow-minimal-pairs.txt`);
PAIRS.forEach(p => console.log(`  Card ${p.cardNumber}: ${p.title}`));
