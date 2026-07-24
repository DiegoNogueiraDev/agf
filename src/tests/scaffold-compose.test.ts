import { describe, it, expect } from 'vitest'
import { readScaffoldMeta, composeScaffoldPlan } from '../core/scaffolder/compose.js'
import type { ComposableNode } from '../core/scaffolder/compose.js'

function makeNode(scaffold: unknown = undefined): ComposableNode {
  return { metadata: scaffold !== undefined ? { scaffold } : null }
}

describe('readScaffoldMeta', () => {
  it('returns null for node with no metadata', () => {
    expect(readScaffoldMeta({ metadata: null })).toBeNull()
  })

  it('returns null when scaffold field is missing', () => {
    expect(readScaffoldMeta({ metadata: {} })).toBeNull()
  })

  it('returns null when scaffold is not an object', () => {
    expect(readScaffoldMeta(makeNode('not-an-object'))).toBeNull()
  })
})

describe('composeScaffoldPlan', () => {
  it('returns needs-llm plan when no scaffold metadata', () => {
    const node = makeNode()
    const plan = composeScaffoldPlan(node, [])
    expect(plan.items).toHaveLength(0)
    expect(plan.reason).toBe('needs-llm')
  })

  it('returns plan with required fields', () => {
    const node = makeNode()
    const plan = composeScaffoldPlan(node, [])
    expect(Array.isArray(plan.items)).toBe(true)
    expect(Array.isArray(plan.universe)).toBe(true)
    expect(Array.isArray(plan.covered)).toBe(true)
    expect(Array.isArray(plan.uncovered)).toBe(true)
  })
})
