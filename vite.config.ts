import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { oscalValidatorsPlugin } from './tools/oscalValidators.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// TALOS builds to static assets for GitHub Pages under /talos/. Decision IDs: ADR-0002.
export default defineConfig({
  base: '/talos/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), oscalValidatorsPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // The generated OSCAL validators (virtual modules, ADR-0040) import this CommonJS module; the dev
  // server's dependency scan cannot see into virtual modules, so pre-bundle it explicitly.
  optimizeDeps: {
    include: ['ajv-formats/dist/formats.js'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
