import { defineConfig } from 'vite';

// COOP + COEP headers are required for SharedArrayBuffer, which Transformers.js
// needs for WASM multi-threading. 'credentialless' COEP is used instead of
// 'require-corp' so that cross-origin model fetches from HuggingFace still work.
const sharedArrayBufferHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: '/Hanzi-Flow/',
  server: {
    port: 5500,
    strictPort: false,
    open: false,
    headers: sharedArrayBufferHeaders,
  },
  preview: {
    port: 5500,
    headers: sharedArrayBufferHeaders,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
