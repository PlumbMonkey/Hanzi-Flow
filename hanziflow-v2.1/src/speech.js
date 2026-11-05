/**
 * Step 2 speech verification.
 *
 * Primary: Web Speech API (Chrome/Edge).
 * Fallback: Whisper (whisper-base) running locally in a Web Worker via
 *   Transformers.js — used automatically when Brave is detected (Brave strips
 *   Google's API key from Chromium) or when Web Speech API fires 'network'.
 *   Model (~150 MB) downloads once from HuggingFace and is cached by the browser.
 *
 * Matching: exact OR character-overlap similarity >= 0.85 (PRD §7.4).
 * Manual override always available (PRD §3 Step 2).
 */
import { S, $ } from './state.js';
import { recordSpeak, recordSpeakOverride, flagWeak, checkAuralMode, updateAWEPanel } from './awe.js';
import { renderSTPVO } from './stpvo.js';
import { renderSpeechDiagnosis, clearDiagnosis } from './tonefeedback.js';
export { clearDiagnosis };

// Brave removes Google's Chromium API key, so Web Speech API always fails there.
const isBrave = () => typeof navigator.brave !== 'undefined';

// ── Whisper worker state ──────────────────────────────────────
let _worker = null;
const _ws = { ready: false, loading: false };
const _modelResolves = [];
let _transcribeResolve = null;
let _transcribeReject = null;

function initWorker() {
  if (_worker) return _worker;
  _worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  _worker.onmessage = ({ data: msg }) => {
    if (msg.type === 'progress' && msg.data?.status === 'progress') {
      const pct = Math.round(msg.data.progress ?? 0);
      setFeedback(`Downloading speech model (first use only) — ${pct}%`);
    } else if (msg.type === 'ready') {
      _ws.ready = true;
      _ws.loading = false;
      _modelResolves.forEach((r) => r());
      _modelResolves.length = 0;
    } else if (msg.type === 'result') {
      _transcribeResolve?.(msg.text);
      _transcribeResolve = _transcribeReject = null;
    } else if (msg.type === 'error') {
      (_transcribeReject ?? _modelResolves[0])?.(new Error(msg.message));
      _transcribeResolve = _transcribeReject = null;
      _modelResolves.length = 0;
    }
  };
  _worker.onerror = (err) => {
    setFeedback(`Speech model failed to load: ${err.message} — use the override button`, 'fail');
    _ws.loading = false;
    _modelResolves.forEach((_, i, arr) => { if (arr[i]) arr[i](new Error(err.message)); });
    _modelResolves.length = 0;
  };
  return _worker;
}

function loadModel() {
  if (_ws.ready) return Promise.resolve();
  const worker = initWorker();
  const p = new Promise((r) => _modelResolves.push(r));
  if (!_ws.loading) {
    _ws.loading = true;
    worker.postMessage({ type: 'load' });
  }
  return p;
}

function transcribeAudio(float32) {
  return new Promise((resolve, reject) => {
    _transcribeResolve = resolve;
    _transcribeReject = reject;
    _worker.postMessage({ type: 'transcribe', audio: float32 }, [float32.buffer]);
  });
}

async function blobToFloat32Array(blob) {
  const ab = await blob.arrayBuffer();
  const tempCtx = new AudioContext();
  const decoded = await tempCtx.decodeAudioData(ab);
  tempCtx.close();

  const TARGET_SR = 16_000;
  if (decoded.sampleRate === TARGET_SR && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0);
  }
  // Resample to 16 kHz mono for Whisper
  const frameCount = Math.ceil(decoded.duration * TARGET_SR);
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SR);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const resampled = await offline.startRendering();
  return resampled.getChannelData(0);
}

export const SIMILARITY_THRESHOLD = 0.85;

/**
 * Strip whitespace + punctuation before matching. Anki sentence cards carry
 * trailing 。 but speech recognition never returns it — without this, a
 * perfect 5-character utterance scores 5/6 = 0.83 and fails the threshold.
 */
export function normalizeForMatch(s) {
  return String(s || '').replace(/[\s。．，、！？；：（）〈〉《》「」『』【】…·～＂＇.,!?;:'"()[\]—–-]/g, '');
}

export function similarity(heard, target) {
  if (!heard || !target) return 0;
  const heardSet = new Set(heard.split(''));
  let hits = 0;
  for (const ch of target.split('')) if (heardSet.has(ch)) hits++;
  return hits / Math.max(heard.length, target.length);
}

export function toggleSpeech(onPass) {
  if (S.speechActive) { stopSpeech(); return; }

  // Brave cannot use Web Speech API (missing Google API key). Use local Whisper.
  if (isBrave()) {
    startWhisperRecording(onPass);
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    // No Web Speech API support — fall back to local Whisper
    startWhisperRecording(onPass);
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
  clearDiagnosis();

  rec.onresult = (e) => {
    const card = S.cards[S.idx];
    const alts = Array.from(e.results[0]).map((a) => normalizeForMatch(a.transcript));
    const target = normalizeForMatch(card.hanzi);
    const passed = alts.some((t) => t === target || similarity(t, target) >= SIMILARITY_THRESHOLD);
    const heard = e.results[0][0].transcript;

    recordSpeak(passed);
    if (passed) {
      setFeedback(`Heard: ${heard} ✓`, 'ok');
      clearDiagnosis();
      S.speechPassed = true;
      $('speech-next').disabled = false;
      onPass?.();
    } else {
      flagWeak(card.hanzi, 'speak');
      setFeedback(`Heard: ${heard} — see what went wrong below`, 'fail');
      // Best-matching alternative gives the fairest per-syllable diagnosis
      const best = alts.reduce((a, b) => (similarity(b, target) > similarity(a, target) ? b : a), alts[0] || '');
      renderSpeechDiagnosis(best, target);
      if (Array.isArray(card.words) && card.words.length) {
        renderSTPVO(card.words, onPass);
      }
    }
    stopSpeech();
    updateAWEPanel();
    checkAuralMode();
  };

  rec.onerror = (e) => {
    // Network error: auto-fall back to local Whisper
    if (e.error === 'network') {
      stopSpeech();
      setFeedback('Web Speech API unavailable — switching to local Whisper…');
      startWhisperRecording(onPass);
      return;
    }
    const errorMessages = {
      'not-allowed':    'Microphone access denied — click the lock/camera icon in your browser address bar, allow microphone access, then try again',
      'audio-capture':  'No microphone detected — check that a microphone is connected and enabled in your OS settings',
      'no-speech':      'No speech detected — press the mic button and speak clearly in Mandarin',
      'aborted':        'Recording was aborted — press the mic button to try again',
    };
    setFeedback(errorMessages[e.error] || `Microphone error (${e.error || 'unknown'}) — try again or use the override button`, 'fail');
    stopSpeech();
  };

  rec.onend = () => {
    if (S.speechActive) {
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

// ── Whisper local recording (Brave / network-error fallback) ──
const WHISPER_MAX_MS = 10_000; // auto-stop after 10 seconds

async function startWhisperRecording(onPass) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setFeedback('Microphone access denied — allow microphone access and try again', 'fail');
    return;
  }

  S.speechActive = true;
  $('mic-btn').classList.add('listening');
  clearDiagnosis();

  // Kick off model loading in parallel with recording (no-op if already loaded)
  const modelPromise = loadModel();
  setFeedback(_ws.ready
    ? 'Recording… press mic again to stop'
    : 'Downloading speech model + recording… press mic to stop (first use only ~150 MB)'
  );

  const recorder = new MediaRecorder(stream);
  S.mediaRecorder = recorder;
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const autoStop = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, WHISPER_MAX_MS);

  recorder.onstop = async () => {
    clearTimeout(autoStop);
    stream.getTracks().forEach((t) => t.stop());
    stopSpeech();

    try {
      if (!_ws.ready) { setFeedback('Waiting for model to finish downloading…'); await modelPromise; }
      setFeedback('Transcribing…');
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const float32 = await blobToFloat32Array(blob);
      const text = await transcribeAudio(float32);

      const card = S.cards[S.idx];
      const heard = normalizeForMatch(text);
      const target = normalizeForMatch(card.hanzi);
      const passed = heard === target || similarity(heard, target) >= SIMILARITY_THRESHOLD;

      recordSpeak(passed);
      if (passed) {
        setFeedback(`Heard: ${text} ✓`, 'ok');
        clearDiagnosis();
        S.speechPassed = true;
        $('speech-next').disabled = false;
        onPass?.();
      } else {
        flagWeak(card.hanzi, 'speak');
        setFeedback(`Heard: ${text || '(nothing)'} — see what went wrong below`, 'fail');
        renderSpeechDiagnosis(heard, target);
        if (Array.isArray(card.words) && card.words.length) renderSTPVO(card.words, onPass);
      }
      updateAWEPanel();
      checkAuralMode();
    } catch (err) {
      setFeedback(`Transcription error: ${err.message} — try again or use the override button`, 'fail');
    }
  };

  recorder.start();
}

export function stopSpeech() {
  S.speechActive = false;
  $('mic-btn').classList.remove('listening');
  try { S.speechRec && S.speechRec.stop(); } catch { /* ignore */ }
  try { S.mediaRecorder && S.mediaRecorder.state !== 'inactive' && S.mediaRecorder.stop(); } catch { /* ignore */ }
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
  // listen.attempts is recorded once per card in recordComprehension();
  // here we only track how many times this card's audio was replayed.
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
