import baseConfig from './vitest.config.js'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    testTimeout: 60_000,
    exclude: ['src/tests/tui-interactive.test.tsx', 'src/tests/tui-snapshots.test.tsx', 'src/tests/runner-fsm.test.ts'],
  },
}
