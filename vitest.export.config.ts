import { defineConfig } from 'vitest/config';

// Runs the exported code in the quantum-lab image, so it needs Docker; kept out of `npm test`.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.docker.ts'] },
});
