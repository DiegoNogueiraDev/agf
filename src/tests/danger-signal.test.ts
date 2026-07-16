import { describe, it, expect } from 'vitest'
import {
  detectDangerSignals,
  mergeDangerSignals,
  computeDangerScore,
  dangerSignalsFromScannerViolations,
} from '../core/immune/danger-signal.js'

describe('detectDangerSignals', () => {
  it('returns empty array for empty files', () => {
    expect(detectDangerSignals([])).toHaveLength(0)
  })

  it('returns empty for clean code with typed error import', () => {
    const files = [{ path: 'src/foo.ts', content: "import { McpGraphError } from './utils/errors.js'\nconst x = 1" }]
    const signals = detectDangerSignals(files)
    const rawThrows = signals.filter((s) => s.kind === 'raw_throw')
    expect(rawThrows).toHaveLength(0)
  })

  it('detects raw_throw without typed error import', () => {
    const content = 'function f() { throw new Error("bad") }'
    const signals = detectDangerSignals([{ path: 'src/foo.ts', content }])
    const rawThrows = signals.filter((s) => s.kind === 'raw_throw')
    expect(rawThrows.length).toBeGreaterThan(0)
  })

  it('detects swallowed_catch', () => {
    const content = 'try { foo() } catch (e) {}'
    const signals = detectDangerSignals([{ path: 'src/foo.ts', content }])
    const swallowed = signals.filter((s) => s.kind === 'swallowed_catch')
    expect(swallowed.length).toBeGreaterThan(0)
  })

  it('detects console.error', () => {
    const content = 'console.error("something went wrong")'
    const signals = detectDangerSignals([{ path: 'src/foo.ts', content }])
    const consoleErrors = signals.filter((s) => s.kind === 'console_error')
    expect(consoleErrors.length).toBeGreaterThan(0)
  })

  it('skips test files', () => {
    const content = 'throw new Error("bad")'
    const signals = detectDangerSignals([{ path: 'src/foo.test.ts', content }])
    expect(signals).toHaveLength(0)
  })

  it('each signal has required fields', () => {
    const content = 'throw new Error("x")'
    const signals = detectDangerSignals([{ path: 'src/foo.ts', content }])
    for (const s of signals) {
      expect(typeof s.id).toBe('string')
      expect(typeof s.kind).toBe('string')
      expect(typeof s.file).toBe('string')
      expect(typeof s.severity).toBe('string')
    }
  })
})

describe('mergeDangerSignals', () => {
  it('concatenates static and runtime signals', () => {
    const s1 = [
      {
        id: 'a',
        kind: 'raw_throw',
        file: 'f.ts',
        line: 1,
        evidence: 'x',
        severity: 'high' as const,
        confidence: 1,
        detectedAt: 0,
      },
    ]
    const s2 = [
      {
        id: 'b',
        kind: 'console_error',
        file: 'g.ts',
        line: 2,
        evidence: 'y',
        severity: 'medium' as const,
        confidence: 0.9,
        detectedAt: 0,
      },
    ]
    const merged = mergeDangerSignals(s1, s2)
    expect(merged).toHaveLength(2)
  })

  it('returns empty for empty inputs', () => {
    expect(mergeDangerSignals([], [])).toHaveLength(0)
  })
})

describe('computeDangerScore', () => {
  it('returns 0 for empty signals', () => {
    expect(computeDangerScore([])).toBe(0)
  })

  it('returns a positive score for signals', () => {
    const signals = detectDangerSignals([{ path: 'src/foo.ts', content: 'throw new Error("x")' }])
    expect(computeDangerScore(signals)).toBeGreaterThan(0)
  })

  it('score is capped at 100', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      kind: 'swallowed_catch' as const,
      file: 'f.ts',
      line: i + 1,
      evidence: '{}',
      severity: 'critical' as const,
      confidence: 1,
      detectedAt: 0,
    }))
    expect(computeDangerScore(many)).toBeLessThanOrEqual(100)
  })
})

describe('dangerSignalsFromScannerViolations', () => {
  it('converts violations to danger signals', () => {
    const violations = [
      { violationType: 'raw_throw', file: 'src/foo.ts', line: 5, evidence: 'throw new Error("x")', confidence: 1.0 },
    ]
    const signals = dangerSignalsFromScannerViolations(violations)
    expect(signals).toHaveLength(1)
    expect(signals[0].kind).toBe('raw_throw')
    expect(signals[0].file).toBe('src/foo.ts')
  })

  it('maps console_warn to console_error kind', () => {
    const violations = [
      { violationType: 'console_warn', file: 'src/foo.ts', line: 1, evidence: 'console.warn()', confidence: 0.9 },
    ]
    const signals = dangerSignalsFromScannerViolations(violations)
    expect(signals[0].kind).toBe('console_error')
  })

  it('returns empty for empty violations', () => {
    expect(dangerSignalsFromScannerViolations([])).toHaveLength(0)
  })
})
