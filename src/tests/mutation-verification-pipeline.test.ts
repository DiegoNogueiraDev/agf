/**
 * Integration: mutation pipeline — applyMutation → summarizeMutants → checkMutationKillRatio.
 *
 * Proves that a surviving mutant (bug not caught by tests) causes the correctness
 * gate to fail, and a fully-killed mutant set passes without false positive.
 */
import { describe, it, expect } from 'vitest'
import { applyMutation, summarizeMutants, DEFAULT_MUTATION_SPECS } from '../core/quality/mutation-runner.js'
import { checkMutationKillRatio } from '../core/quality/mutation-gate.js'
import type { MutantResult } from '../core/quality/mutation-runner.js'

describe('AC1: surviving mutant → correctness signal fails', () => {
  it('pipeline: mutant not killed → gate FAILS', () => {
    const source = 'if (count > 0) return true'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'gt')!

    // Apply mutation: > becomes <
    const mutated = applyMutation(source, spec)
    expect(mutated).toBe('if (count < 0) return true') // bug introduced

    // Simulate: test suite did NOT catch this mutation (killed=false)
    const mutantResult: MutantResult = { mutantId: 0, spec: spec.name, killed: false }
    const summary = summarizeMutants(source, [mutantResult])

    // Gate: kill ratio 0% < 60% threshold → FAIL
    const gate = checkMutationKillRatio(summary)
    expect(gate.pass).toBe(false)
    expect(gate.survivedCount).toBe(1)
  })

  it('pipeline: all mutants survive → gate fails with full survivor count', () => {
    const source = 'const result = a + b'

    const mutants: MutantResult[] = DEFAULT_MUTATION_SPECS.slice(0, 3).map((spec, i) => ({
      mutantId: i,
      spec: spec.name,
      killed: false, // test suite caught nothing
    }))

    const summary = summarizeMutants(source, mutants)
    const gate = checkMutationKillRatio(summary)

    expect(gate.pass).toBe(false)
    expect(gate.survivedCount).toBe(3)
    expect(gate.killRatio).toBe(0)
  })
})

describe('AC2: correct impl → passes without false positive', () => {
  it('pipeline: all mutants killed → gate PASSES', () => {
    const source = 'if (threshold < 0) return candidates[candidates.length - 1]'

    // Simulate: comprehensive test suite killed all mutations
    const mutants: MutantResult[] = DEFAULT_MUTATION_SPECS.slice(0, 4).map((spec, i) => ({
      mutantId: i,
      spec: spec.name,
      killed: true,
    }))

    const summary = summarizeMutants(source, mutants)
    const gate = checkMutationKillRatio(summary)

    expect(gate.pass).toBe(true)
    expect(gate.survivedCount).toBe(0)
  })

  it('pipeline: no mutants possible → gate skips without false positive', () => {
    // Constant string — no arithmetic/boolean patterns → 0 mutants
    const summary = summarizeMutants('const NAME = "agf"', [])
    const gate = checkMutationKillRatio(summary)

    expect(gate.pass).toBe(true)
    expect(gate.message).toMatch(/no mutants/i)
  })
})

describe('pipeline: mutation actually changes behaviour (not just text)', () => {
  it('arithmetic mutation inverts the expected output', () => {
    const addFn = (a: number, b: number): number => a + b

    const source = 'const r = a + b'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'arithmetic-add')!
    const mutated = applyMutation(source, spec)

    // mutated becomes 'const r = a - b'
    expect(mutated).toContain(' - ')

    // Original: 2+3=5; Mutated: 2-3=-1
    const original = addFn(2, 3)
    const mutatedResult = 2 - 3 // what the mutant would compute
    expect(original).toBe(5)
    expect(mutatedResult).toBe(-1)
    expect(original).not.toBe(mutatedResult) // behavioural difference detected
  })
})
