import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Hanzi-Flow/',
  server: {
    port: 5500,
    strictPort: false,
    open: false,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
