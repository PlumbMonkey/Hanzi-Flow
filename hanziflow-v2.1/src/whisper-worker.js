/**
 * Web Worker — loads Whisper (whisper-base multilingual) via Transformers.js
 * and handles transcription requests off the main thread.
 *
 * Model (~150 MB) is downloaded from HuggingFace on first use and then cached
 * by the browser automatically. Subsequent loads are instant.
 *
 * Messages IN  (from main thread):
 *   { type: 'load' }                        — load/warm the model
 *   { type: 'transcribe', audio: Float32Array } — transcribe audio
 *
 * Messages OUT (to main thread):
 *   { type: 'progress', data: progressObj } — download progress
 *   { type: 'ready' }                        — model ready
 *   { type: 'result',  text: string }        — transcription complete
 *   { type: 'error',   message: string }     — something went wrong
 */
import { pipeline, env } from '@xenova/transformers';

// Use only remote HuggingFace models; rely on browser cache for persistence.
env.allowLocalModels = false;
env.useBrowserCache = true;
// Single-threaded WASM — avoids SharedArrayBuffer requirement as a safe fallback
// (COOP/COEP headers on the dev server also enable multi-threading, but this
// keeps things working even if those headers are absent in a deployment).
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;

async function loadModel() {
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-base',
    {
      progress_callback: (progress) => {
        self.postMessage({ type: 'progress', data: progress });
      },
    }
  );
  self.postMessage({ type: 'ready' });
}

self.addEventListener('message', async ({ data: msg }) => {
  if (msg.type === 'load') {
    try {
      await loadModel();
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
    return;
  }

  if (msg.type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', message: 'Model not loaded' });
      return;
    }
    try {
      const result = await transcriber(msg.audio, {
        language: 'chinese',
        task: 'transcribe',
      });
      self.postMessage({ type: 'result', text: result.text });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
});
