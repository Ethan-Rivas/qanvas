import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { pwa } from './scripts/pwa.ts';

export default defineConfig({
  // Relative paths, so the same build works on GitHub Pages (under /qanvas/) and at the root of a server.
  base: './',
  plugins: [react(), pwa(import.meta.dirname)],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The timing checks in src/sim/performance.test.ts must not share the CPU with other test files.
    fileParallelism: false,
  },
});
