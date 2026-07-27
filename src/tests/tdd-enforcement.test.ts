import { describe, it, expect } from 'vitest'
import { checkTddEnforcement, DEFAULT_DECLARATIVE_WHITELIST } from '../core/planner/tdd-enforcement.js'
import type { TddEnforcementContext } from '../core/planner/tdd-enforcement.js'

describe('checkTddEnforcement', () => {
  it('returns not blocked in off mode', () => {
    const ctx: TddEnforcementContext = {
      touchedFiles: ['src/core/foo.ts'],
      commitHistory: [],
      mode: 'off',
    }
    const result = checkTddEnforcement(ctx)
    expect(result.blocked).toBe(false)
    expect(result.violations).toHaveLength(0)
  })

  it('exempts declarative whitelist files (*.d.ts, types.ts)', () => {
    const ctx: TddEnforcementContext = {
      touchedFiles: ['src/types/foo.d.ts', 'src/types/types.ts'],
      commitHistory: [
        { hash: 'abc', timestamp: '2026-01-01T00:00:00Z', files: ['src/types/foo.d.ts', 'src/types/types.ts'] },
      ],
      mode: 'strict',
      declarativeWhitelist: DEFAULT_DECLARATIVE_WHITELIST,
    }
    const result = checkTddEnforcement(ctx)
    expect(result.blocked).toBe(false)
    expect(result.exempted).toContain('src/types/foo.d.ts')
  })

  it('detects violation when code added before test in strict mode', () => {
    const ctx: TddEnforcementContext = {
      touchedFiles: ['src/core/my-feature.ts'],
      commitHistory: [{ hash: 'c1', timestamp: '2026-01-01T10:00:00Z', files: ['src/core/my-feature.ts'] }],
      mode: 'strict',
      declarativeWhitelist: [],
    }
    const result = checkTddEnforcement(ctx)
    expect(result.blocked).toBe(true)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  it('passes when test is committed before code', () => {
    const ctx: TddEnforcementContext = {
      touchedFiles: ['src/core/my-feature.ts'],
      commitHistory: [
        { hash: 'c1', timestamp: '2026-01-01T09:00:00Z', files: ['src/tests/my-feature.test.ts'] },
        { hash: 'c2', timestamp: '2026-01-01T10:00:00Z', files: ['src/core/my-feature.ts'] },
      ],
      mode: 'strict',
      declarativeWhitelist: [],
    }
    const result = checkTddEnforcement(ctx)
    expect(result.blocked).toBe(false)
    expect(result.violations).toHaveLength(0)
  })

  it('advisory mode detects violations but does not block', () => {
    const ctx: TddEnforcementContext = {
      touchedFiles: ['src/core/untested.ts'],
      commitHistory: [{ hash: 'c1', timestamp: '2026-01-01T10:00:00Z', files: ['src/core/untested.ts'] }],
      mode: 'advisory',
      declarativeWhitelist: [],
    }
    const result = checkTddEnforcement(ctx)
    expect(result.blocked).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  it('DEFAULT_DECLARATIVE_WHITELIST includes *.d.ts and schema files', () => {
    expect(DEFAULT_DECLARATIVE_WHITELIST.some((p) => p.includes('.d.ts'))).toBe(true)
  })
})
