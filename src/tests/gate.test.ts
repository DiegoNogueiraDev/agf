import { describe, it, expect } from 'vitest'
import { decideScaffold } from '../core/rag-out/gate.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'

function makeDescriptor(id: string, goal: string, fitTags: string[] = []): ScaffoldDescriptor {
  return { id, goal, fitTags, template: '', slots: [] }
}

describe('decideScaffold', () => {
  it('returns generate when corpus is empty', () => {
    const result = decideScaffold('build a CLI tool', [])
    expect(result.decision).toBe('generate')
    expect(result.reason).toBe('no_scaffolds_in_corpus')
  })

  it('returns an object with decision and goal', () => {
    const result = decideScaffold('build something', [
      makeDescriptor('s1', 'build a web service', ['build', 'service']),
    ])
    expect(typeof result.decision).toBe('string')
    expect(result.goal).toBe('build something')
  })

  it('confidence is a number between 0 and 1', () => {
    const result = decideScaffold('test', [makeDescriptor('s1', 'test', ['test'])])
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('candidates array is present', () => {
    const result = decideScaffold('test', [])
    expect(Array.isArray(result.candidates)).toBe(true)
  })
})
