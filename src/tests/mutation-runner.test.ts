import { describe, it, expect } from 'vitest'
import { applyMutation, summarizeMutants, DEFAULT_MUTATION_SPECS } from '../core/quality/mutation-runner.js'
import type { MutantResult } from '../core/quality/mutation-runner.js'

describe('applyMutation', () => {
  it('replaces + with - (arithmetic mutation)', () => {
    const src = 'const x = a + b'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'arithmetic-add')!
    const result = applyMutation(src, spec)
    expect(result).toBe('const x = a - b')
  })

  it('replaces === with !== (equality flip)', () => {
    const src = 'if (x === 0)'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'equality-strict')!
    const result = applyMutation(src, spec)
    expect(result).toBe('if (x !== 0)')
  })

  it('replaces true with false (boolean flip)', () => {
    const src = 'const ok = true'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'bool-true')!
    const result = applyMutation(src, spec)
    expect(result).toBe('const ok = false')
  })

  it('returns original source when no match', () => {
    const src = 'const x = 1'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'bool-true')!
    expect(applyMutation(src, spec)).toBe(src)
  })

  it('only applies the first occurrence (one mutant at a time)', () => {
    const src = 'a + b + c'
    const spec = DEFAULT_MUTATION_SPECS.find((s) => s.name === 'arithmetic-add')!
    const result = applyMutation(src, spec)
    // Only first '+' is replaced
    expect(result).toBe('a - b + c')
    expect(result.match(/\+/g)?.length).toBe(1)
  })
})

describe('summarizeMutants', () => {
  it('counts killed and survived correctly', () => {
    const mutants: MutantResult[] = [
      { mutantId: 0, spec: 'arithmetic-add', killed: true },
      { mutantId: 1, spec: 'equality-strict', killed: false },
      { mutantId: 2, spec: 'bool-true', killed: true },
    ]
    const summary = summarizeMutants('src/foo.ts', mutants)
    expect(summary.total).toBe(3)
    expect(summary.killed).toBe(2)
    expect(summary.survived).toBe(1)
    expect(summary.file).toBe('src/foo.ts')
    expect(summary.score).toBeCloseTo(2 / 3)
  })

  it('returns score 0 when no mutants', () => {
    const summary = summarizeMutants('src/foo.ts', [])
    expect(summary.total).toBe(0)
    expect(summary.score).toBe(0)
  })

  it('returns score 1 when all killed', () => {
    const mutants: MutantResult[] = [
      { mutantId: 0, spec: 'arithmetic-add', killed: true },
      { mutantId: 1, spec: 'bool-true', killed: true },
    ]
    const summary = summarizeMutants('src/foo.ts', mutants)
    expect(summary.score).toBe(1)
  })
})

describe('DEFAULT_MUTATION_SPECS', () => {
  it('has at least 4 mutation specs', () => {
    expect(DEFAULT_MUTATION_SPECS.length).toBeGreaterThanOrEqual(4)
  })

  it('all specs have name, pattern, and replacement', () => {
    for (const spec of DEFAULT_MUTATION_SPECS) {
      expect(typeof spec.name).toBe('string')
      expect(spec.pattern).toBeDefined()
      expect(typeof spec.replacement).toBe('string')
    }
  })
})
