import { describe, it, expect } from 'vitest'
import type { CheckLevel, CheckResult, DoctorReport } from '../core/doctor/doctor-types.js'

describe('DoctorReport types', () => {
  it('constructs a passing doctor report', () => {
    const checks: CheckResult[] = [
      { name: 'db-connection', level: 'ok' as CheckLevel, message: 'SQLite reachable' },
      { name: 'provider', level: 'ok' as CheckLevel, message: 'Anthropic configured' },
    ]
    const report: DoctorReport = {
      checks,
      summary: { ok: 2, warning: 0, error: 0 },
      passed: true,
    }
    expect(report.passed).toBe(true)
    expect(report.summary.ok).toBe(2)
  })

  it('constructs a failing doctor report', () => {
    const checks: CheckResult[] = [
      { name: 'db-connection', level: 'error' as CheckLevel, message: 'Cannot open DB', suggestion: 'Run agf init' },
      { name: 'provider', level: 'warning' as CheckLevel, message: 'No provider set' },
    ]
    const report: DoctorReport = {
      checks,
      summary: { ok: 0, warning: 1, error: 1 },
      passed: false,
    }
    expect(report.passed).toBe(false)
    expect(report.summary.error).toBe(1)
    expect(checks[0]?.suggestion).toBe('Run agf init')
  })

  it('CheckLevel covers ok, warning, error', () => {
    const levels: CheckLevel[] = ['ok', 'warning', 'error']
    expect(levels).toHaveLength(3)
  })
})
