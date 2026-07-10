import { describe, it, expect } from 'vitest'
import { BASH_PATTERNS, PATH_PATTERNS, maxSeverity } from '../core/approval/approval-patterns.js'
import type { ApprovalSeverity } from '../core/approval/approval-patterns.js'

describe('maxSeverity', () => {
  it('returns critical when one argument is critical', () => {
    expect(maxSeverity('critical', 'low')).toBe('critical')
    expect(maxSeverity('low', 'critical')).toBe('critical')
  })

  it('returns high over medium', () => {
    expect(maxSeverity('high', 'medium')).toBe('high')
  })

  it('returns medium over low', () => {
    expect(maxSeverity('medium', 'low')).toBe('medium')
  })

  it('returns the same value when both are equal', () => {
    const levels: ApprovalSeverity[] = ['critical', 'high', 'medium', 'low']
    for (const lvl of levels) {
      expect(maxSeverity(lvl, lvl)).toBe(lvl)
    }
  })
})

describe('BASH_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(BASH_PATTERNS.length).toBeGreaterThan(0)
  })

  it('each pattern has a re (RegExp), severity, and reason', () => {
    for (const p of BASH_PATTERNS) {
      expect(p.re).toBeInstanceOf(RegExp)
      expect(['critical', 'high', 'medium', 'low']).toContain(p.severity)
      expect(typeof p.reason).toBe('string')
    }
  })

  it('includes a pattern that matches rm -rf', () => {
    const matches = BASH_PATTERNS.filter((p) => p.re.test('rm -rf /tmp'))
    expect(matches.length).toBeGreaterThan(0)
  })
})

describe('PATH_PATTERNS', () => {
  it('is a non-empty array', () => {
    expect(PATH_PATTERNS.length).toBeGreaterThan(0)
  })

  it('each pattern has a re (RegExp), severity, and reason', () => {
    for (const p of PATH_PATTERNS) {
      expect(p.re).toBeInstanceOf(RegExp)
      expect(['critical', 'high', 'medium', 'low']).toContain(p.severity)
    }
  })
})
