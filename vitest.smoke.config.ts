import { defineConfig } from 'vitest/config'

// Smoke suite: critical-path tests, fast (<5s each), no heavy I/O.
// Add to smoke set:  ln -sf ../<test>.test.ts src/tests/smoke/<test>.test.ts
// Remove from smoke: rm src/tests/smoke/<test>.test.ts
// Target runtime: <30s total.
export default defineConfig({
  test: {
    include: ['src/tests/smoke/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 5_000,
    globals: true,
  },
})
