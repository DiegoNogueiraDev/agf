import { describe, it, expect } from 'vitest'
import { runDialecticEngine } from '../core/memory/dialectic-engine.js'
import type { DialecticInput, DialecticFact } from '../core/memory/dialectic-engine.js'

function makeInput(depth: 1 | 2 | 3, facts: DialecticFact[] = []): DialecticInput {
  return { facts, depth }
}

function makeFact(overrides: Partial<DialecticFact> = {}): DialecticFact {
  return {
    id: 'f1',
    content: 'The system uses SQLite for persistence',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('runDialecticEngine', () => {
  it('depth 1 runs synthesis only', () => {
    const result = runDialecticEngine(makeInput(1, [makeFact()]))
    expect(result.passesExecuted).toContain('synthesis')
    expect(result.passesExecuted).not.toContain('audit')
    expect(result.passesExecuted).not.toContain('reconciliation')
  })

  it('depth 2 runs audit and synthesis', () => {
    const result = runDialecticEngine(makeInput(2, [makeFact()]))
    expect(result.passesExecuted).toContain('audit')
    expect(result.passesExecuted).toContain('synthesis')
    expect(result.passesExecuted).not.toContain('reconciliation')
  })

  it('depth 3 runs all three passes', () => {
    const result = runDialecticEngine(makeInput(3, [makeFact()]))
    expect(result.passesExecuted).toContain('audit')
    expect(result.passesExecuted).toContain('synthesis')
    expect(result.passesExecuted).toContain('reconciliation')
  })

  it('returns synthesized as a string', () => {
    const result = runDialecticEngine(makeInput(1, [makeFact()]))
    expect(typeof result.synthesized).toBe('string')
  })

  it('synthesized joins fact contents', () => {
    const facts = [
      makeFact({ id: 'f1', content: 'fact A', updatedAt: '2026-01-01T00:00:00Z' }),
      makeFact({ id: 'f2', content: 'fact B', updatedAt: '2026-01-01T00:00:00Z' }),
    ]
    const result = runDialecticEngine(makeInput(1, facts))
    expect(result.synthesized).toContain('fact A')
    expect(result.synthesized).toContain('fact B')
  })

  it('handles empty facts without throwing', () => {
    expect(() => runDialecticEngine(makeInput(1, []))).not.toThrow()
  })

  it('result has passesExecuted array', () => {
    const result = runDialecticEngine(makeInput(2, [makeFact()]))
    expect(Array.isArray(result.passesExecuted)).toBe(true)
  })
})
