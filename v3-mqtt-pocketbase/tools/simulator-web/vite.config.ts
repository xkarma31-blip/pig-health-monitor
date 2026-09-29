import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist_new',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    host: true
  },
  test: {
    globals: true,
    environment: 'node'
  }
});
