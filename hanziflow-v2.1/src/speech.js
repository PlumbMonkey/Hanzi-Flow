/**
 * Step 2 speech verification.
 *
 * Uses Web Speech API. Matching: exact OR character-overlap similarity >= 0.85
 * (PRD §7.4). Manual override always available (PRD §3 Step 2).
 */
import { S, $ } from './state.js';
import { recordSpeak, flagWeak, checkAuralMode, updateAWEPanel } from './awe.js';
import { renderSTPVO } from './stpvo.js';

export const SIMILARITY_THRESHOLD = 0.85;

export function similarity(heard, target) {
  if (!heard || !target) return 0;
  const heardSet = new Set(heard.split(''));
  let hits = 0;
  for (const ch of target.split('')) if (heardSet.has(ch)) hits++;
  return hits / Math.max(heard.length, target.length);
}

export function toggleSpeech(onPass) {
  if (S.speechActive) { stopSpeech(); return; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setFeedback('Speech recognition is not supported in this browser — please use Chrome or Edge, or use the override button', 'fail');
    return;
  }

  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  S.speechRec = rec;
  S.speechActive = true;

  $('mic-btn').classList.add('listening');
  setFeedback('Listening…');

  rec.onresult = (e) => {
    const card = S.cards[S.idx];
    const alts = Array.from(e.results[0]).map((a) => a.transcript.replace(/\s/g, ''));
    const target = card.hanzi.replace(/\s/g, '');
    const passed = alts.some((t) => t === target || similarity(t, target) >= SIMILARITY_THRESHOLD);
    const heard = e.results[0][0].transcript;

    recordSpeak(passed);
    if (passed) {
      setFeedback(`Heard: ${heard} ✓`, 'ok');
      S.speechPassed = true;
      $('speech-next').disabled = false;
      onPass?.();
    } else {
      flagWeak(card.hanzi, 'speak');
      setFeedback(`Heard: ${heard} — try the word-order game below`, 'fail');
      if (Array.isArray(card.words) && card.words.length) {
        renderSTPVO(card.words, onPass);
      }
    }
    stopSpeech();
    updateAWEPanel();
    checkAuralMode();
  };

  rec.onerror = (e) => {
    const errorMessages = {
      'not-allowed':    'Microphone access denied — click the lock/camera icon in your browser address bar, allow microphone access, then try again',
      'audio-capture':  'No microphone detected — check that a microphone is connected and enabled in your OS settings',
      'network':        'Network error — Chrome speech recognition requires an internet connection. Use the override button if you are offline',
      'no-speech':      'No speech detected — press the mic button and speak clearly in Mandarin',
      'aborted':        'Recording was aborted — press the mic button to try again',
    };
    setFeedback(errorMessages[e.error] || `Microphone error (${e.error || 'unknown'}) — try again or use the override button`, 'fail');
    stopSpeech();
  };

  rec.onend = () => {
    if (S.speechActive) {
      // Recognition ended without onresult or onerror firing (e.g. immediate stop).
      setFeedback('Recording stopped without a result — press the mic button to try again or use the override button', 'fail');
      stopSpeech();
    }
  };

  try {
    rec.start();
  } catch (err) {
    setFeedback('Could not start microphone — check browser permissions and try again', 'fail');
    stopSpeech();
  }
}

export function stopSpeech() {
  S.speechActive = false;
  $('mic-btn').classList.remove('listening');
  try { S.speechRec && S.speechRec.stop(); } catch { /* ignore */ }
}

export function overrideSpeech(onPass) {
  S.speechPassed = true;
  recordSpeak(true);
  setFeedback('Marked correct (override)', 'ok');
  $('speech-next').disabled = false;
  updateAWEPanel();
  onPass?.();
}

// ── Audio playback for Step 1 ──────────────────────────────
let activeAudio = null;

export async function playCardAudio(card, retrieveAudioBase64) {
  S.awe.listen.attempts++;
  S.awe.listenPlayCount++;
  const btn = $('play-btn');

  if (card.audioFile) {
    try {
      const b64 = await retrieveAudioBase64(card.audioFile);
      if (activeAudio) { activeAudio.pause(); activeAudio = null; }
      const a = new Audio('data:audio/mp3;base64,' + b64);
      activeAudio = a;
      btn.classList.add('playing');
      a.onended = () => btn.classList.remove('playing');
      a.onerror = () => { btn.classList.remove('playing'); tts(card.hanzi, btn); };
      a.play().catch(() => tts(card.hanzi, btn));
      return;
    } catch {
      // Fall through to TTS
    }
  }
  tts(card.hanzi, btn);
}

function tts(text, btn) {
  if (!('speechSynthesis' in window)) {
    setFeedback('Speech synthesis unavailable');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = S.awe.auralMode ? 0.7 : 0.85;
  btn.classList.add('playing');
  u.onend = () => btn.classList.remove('playing');
  window.speechSynthesis.speak(u);
}

export function setFeedback(text, kind = '') {
  const el = $('speech-fb');
  if (!el) return;
  el.textContent = text;
  el.className = 'speech-feedback' + (kind ? ' ' + kind : '');
}
