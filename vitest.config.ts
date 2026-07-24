import { defineConfig } from 'vitest/config'
import { cpus } from 'node:os'
import path from 'node:path'

const MAX_WORKERS = Math.max(2, Math.floor(cpus().length / 2))

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    pool: 'forks',
    maxWorkers: MAX_WORKERS,
    // Two test surfaces with different DOM needs: server/core tests run in plain
    // node; the web dashboard tests need jsdom + React Testing Library setup.
    // Projects keeps node tests fast (no jsdom overhead) while letting the React
    // tests live in the dashboard workspace. `--project=node` selects the fast
    // tier (used by test:blast / test:node).
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src/tests/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['./src/tests/vitest-setup-node.ts'],
        },
      },
      {
        extends: true,
        resolve: {
          // Mirror the dashboard's vite alias so `@/...` imports resolve the
          // same way under vitest as they do at runtime.
          alias: {
            '@': path.resolve(__dirname, './src/web/dashboard/src'),
          },
          dedupe: ['react', 'react-dom'],
        },
        test: {
          name: 'dashboard',
          include: ['src/web/dashboard/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/web/dashboard/src/test-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**',
        'src/api/**',
        'src/mcp/**',
        'src/cli/**',
        'src/schemas/**',
        'src/skills/**',
        'src/tui/**',
        'src/plugins/**',
        'src/web/dashboard/src/**',
      ],
      exclude: [
        'src/tests/**',
        'src/web/dashboard/src/**/*.test.{ts,tsx}',
        'src/web/dashboard/src/test-setup.ts',
        'src/web/dashboard/src/main.tsx',
        'src/web/dashboard/src/vite-env.d.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
    },
  },
})
