import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into the portfolio site so GitHub Pages can serve it without a build step.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../experiments/tracefield',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
});
