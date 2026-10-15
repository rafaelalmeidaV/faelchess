import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // O front usa o código-fonte do shared direto (sem build), só a parte que roda no navegador.
      '@faelchess/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
});
