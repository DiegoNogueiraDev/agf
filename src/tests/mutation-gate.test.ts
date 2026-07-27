import { describe, it, expect } from 'vitest'
import { checkMutationKillRatio } from '../core/quality/mutation-gate.js'
import type { MutationRunSummary, MutantResult } from '../core/quality/mutation-runner.js'

function summary(killed: number, total: number): MutationRunSummary {
  const mutants: MutantResult[] = Array.from({ length: total }, (_, i) => ({
    mutantId: i,
    spec: 'arithmetic-add',
    killed: i < killed,
  }))
  return {
    file: 'src/core/foo.ts',
    total,
    killed,
    survived: total - killed,
    score: total === 0 ? 0 : killed / total,
    mutants,
  }
}

describe('checkMutationKillRatio — surviving mutant causes gate to fail', () => {
  it('returns FAIL when kill ratio is below threshold (surviving mutant)', () => {
    // 2 out of 5 killed → 40% < 60% default threshold
    const result = checkMutationKillRatio(summary(2, 5))
    expect(result.pass).toBe(false)
    expect(result.message).toMatch(/survived|kill ratio/i)
  })

  it('returns FAIL with explicit surviving mutant info', () => {
    const result = checkMutationKillRatio(summary(0, 3))
    expect(result.pass).toBe(false)
    expect(result.survivedCount).toBe(3)
  })

  it('returns FAIL when kill ratio is exactly below threshold', () => {
    // 59% < 60%
    const result = checkMutationKillRatio(summary(59, 100))
    expect(result.pass).toBe(false)
  })
})

describe('checkMutationKillRatio — correct implementation passes without false positive', () => {
  it('returns PASS when all mutants killed', () => {
    const result = checkMutationKillRatio(summary(5, 5))
    expect(result.pass).toBe(true)
    expect(result.survivedCount).toBe(0)
  })

  it('returns PASS when kill ratio meets threshold exactly', () => {
    // 60/100 = 60% == 60% threshold
    const result = checkMutationKillRatio(summary(60, 100))
    expect(result.pass).toBe(true)
  })

  it('returns PASS when kill ratio exceeds threshold', () => {
    const result = checkMutationKillRatio(summary(4, 5)) // 80%
    expect(result.pass).toBe(true)
  })

  it('returns PASS (no false positive) when no mutants exist', () => {
    // Empty summary: nothing to kill, nothing to fail on
    const result = checkMutationKillRatio(summary(0, 0))
    expect(result.pass).toBe(true)
    expect(result.message).toMatch(/no mutants/i)
  })
})

describe('checkMutationKillRatio — custom threshold', () => {
  it('respects custom threshold', () => {
    const hiBar = checkMutationKillRatio(summary(7, 10), 0.8) // 70% < 80%
    const loBar = checkMutationKillRatio(summary(7, 10), 0.6) // 70% >= 60%
    expect(hiBar.pass).toBe(false)
    expect(loBar.pass).toBe(true)
  })
})
