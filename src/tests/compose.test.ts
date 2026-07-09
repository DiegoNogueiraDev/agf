import { describe, it, expect } from 'vitest'
import { readScaffoldMeta, composeScaffoldPlan } from '../core/scaffolder/compose.js'
import type { ComposableNode } from '../core/scaffolder/compose.js'

describe('readScaffoldMeta', () => {
  it('returns null for node with no metadata', () => {
    const node: ComposableNode = { metadata: null }
    expect(readScaffoldMeta(node)).toBeNull()
  })

  it('returns null for node with empty metadata', () => {
    const node: ComposableNode = { metadata: {} }
    expect(readScaffoldMeta(node)).toBeNull()
  })

  it('returns null for invalid scaffold metadata', () => {
    const node: ComposableNode = { metadata: { scaffold: 'invalid' } }
    expect(readScaffoldMeta(node)).toBeNull()
  })
})

describe('composeScaffoldPlan', () => {
  it('returns needs-llm when node has no scaffold metadata', () => {
    const node: ComposableNode = { metadata: null }
    const plan = composeScaffoldPlan(node, [], [])
    expect(plan.reason).toBe('needs-llm')
    expect(plan.items).toEqual([])
  })

  it('returns composed plan as object', () => {
    const node: ComposableNode = { metadata: null }
    const result = composeScaffoldPlan(node, [], [])
    expect(typeof result).toBe('object')
    expect(Array.isArray(result.items)).toBe(true)
  })
})
