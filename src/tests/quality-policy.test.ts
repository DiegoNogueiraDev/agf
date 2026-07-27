/*!
 * Tests for quality-policy.ts — evaluatePolicy pure function.
 *
 * evaluatePolicy(policy, metrics) is explicitly documented as "Pure function —
 * no side effects, no DB access." All 4 operators tested: >=, <=, ==, !=.
 * Covers: passed/blocked/warned results and PolicyResult.passed flag.
 */

import { describe, it, expect } from 'vitest'
import { evaluatePolicy } from '../core/observability/quality-policy.js'
import type { QualityPolicy, QualityGate } from '../core/observability/quality-policy.js'

function makePolicy(gates: QualityGate[]): QualityPolicy {
  return { id: 'p1', name: 'test-policy', gates, active: true }
}

// ── no gates ─────────────────────────────────────────────────────────────────

describe('evaluatePolicy — no gates', () => {
  it('returns passed=true with empty blockers and warnings when policy has no gates', () => {
    const result = evaluatePolicy(makePolicy([]), { coverage: 80 })
    expect(result.passed).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

// ── >= operator ───────────────────────────────────────────────────────────────

describe('evaluatePolicy — >= operator', () => {
  it('passes when actual >= threshold', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'coverage', operator: '>=', threshold: 80, severity: 'block' }]),
      { coverage: 85 },
    )
    expect(result.passed).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('passes when actual exactly equals threshold', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'coverage', operator: '>=', threshold: 80, severity: 'block' }]),
      { coverage: 80 },
    )
    expect(result.passed).toBe(true)
  })

  it('fails (blocks) when actual < threshold', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'coverage', operator: '>=', threshold: 80, severity: 'block' }]),
      { coverage: 72 },
    )
    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].metric).toBe('coverage')
  })
})

// ── <= operator ───────────────────────────────────────────────────────────────

describe('evaluatePolicy — <= operator', () => {
  it('passes when actual <= threshold', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'error_rate', operator: '<=', threshold: 5, severity: 'warn' }]),
      { error_rate: 3 },
    )
    expect(result.passed).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns (not blocks) when actual > threshold with severity=warn', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'error_rate', operator: '<=', threshold: 5, severity: 'warn' }]),
      { error_rate: 8 },
    )
    expect(result.passed).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].severity).toBe('warn')
  })
})

// ── == operator ───────────────────────────────────────────────────────────────

describe('evaluatePolicy — == operator', () => {
  it('passes when actual exactly equals threshold', () => {
    const result = evaluatePolicy(makePolicy([{ metric: 'status', operator: '==', threshold: 1, severity: 'block' }]), {
      status: 1,
    })
    expect(result.passed).toBe(true)
  })

  it('blocks when actual != threshold', () => {
    const result = evaluatePolicy(makePolicy([{ metric: 'status', operator: '==', threshold: 1, severity: 'block' }]), {
      status: 0,
    })
    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(1)
  })
})

// ── != operator ───────────────────────────────────────────────────────────────

describe('evaluatePolicy — != operator', () => {
  it('passes when actual != threshold', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'critical_bugs', operator: '!=', threshold: 0, severity: 'block' }]),
      { critical_bugs: 3 },
    )
    expect(result.passed).toBe(true)
  })

  it('blocks when actual == threshold', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'critical_bugs', operator: '!=', threshold: 0, severity: 'block' }]),
      { critical_bugs: 0 },
    )
    expect(result.passed).toBe(false)
    expect(result.blockers[0].actual).toBe(0)
  })
})

// ── missing metric defaults to 0 ─────────────────────────────────────────────

describe('evaluatePolicy — missing metric', () => {
  it('treats missing metric as 0 when evaluating gate', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'missing_metric', operator: '>=', threshold: 50, severity: 'block' }]),
      {},
    )
    expect(result.passed).toBe(false)
    expect(result.blockers[0].actual).toBe(0)
  })
})

// ── mixed gates: blockers vs warnings ────────────────────────────────────────

describe('evaluatePolicy — mixed severity gates', () => {
  it('passed=true when only warn gates fail (no blockers)', () => {
    const result = evaluatePolicy(
      makePolicy([
        { metric: 'coverage', operator: '>=', threshold: 90, severity: 'warn' },
        { metric: 'tests', operator: '>=', threshold: 10, severity: 'warn' },
      ]),
      { coverage: 70, tests: 5 },
    )
    expect(result.passed).toBe(true)
    expect(result.warnings).toHaveLength(2)
    expect(result.blockers).toHaveLength(0)
  })

  it('passed=false when at least one block gate fails', () => {
    const result = evaluatePolicy(
      makePolicy([
        { metric: 'coverage', operator: '>=', threshold: 90, severity: 'warn' },
        { metric: 'security', operator: '>=', threshold: 1, severity: 'block' },
      ]),
      { coverage: 70, security: 0 },
    )
    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
  })

  it('all passing gates produce no blockers or warnings', () => {
    const result = evaluatePolicy(
      makePolicy([
        { metric: 'coverage', operator: '>=', threshold: 80, severity: 'block' },
        { metric: 'error_rate', operator: '<=', threshold: 5, severity: 'warn' },
      ]),
      { coverage: 95, error_rate: 2 },
    )
    expect(result.passed).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

// ── GateResult fields ─────────────────────────────────────────────────────────

describe('evaluatePolicy — GateResult field accuracy', () => {
  it('GateResult includes correct metric, operator, threshold, actual values', () => {
    const result = evaluatePolicy(
      makePolicy([{ metric: 'coverage', operator: '>=', threshold: 80, severity: 'block' }]),
      { coverage: 60 },
    )
    const gate = result.blockers[0]
    expect(gate.metric).toBe('coverage')
    expect(gate.operator).toBe('>=')
    expect(gate.threshold).toBe(80)
    expect(gate.actual).toBe(60)
    expect(gate.passed).toBe(false)
  })
})
