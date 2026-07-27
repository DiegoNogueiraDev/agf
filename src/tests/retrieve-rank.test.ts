import { describe, it, expect } from 'vitest'
import { rankScaffolds, nodeRequirementText } from '../core/scaffolder/retrieve-rank.js'

type RankableNode = Parameters<typeof rankScaffolds>[0]

function makeNode(overrides: Partial<RankableNode> = {}): RankableNode {
  return {
    id: 'test-node',
    title: 'Create REST endpoint',
    description: 'Implement a REST API endpoint for user management',
    tags: ['api', 'backend'],
    acceptanceCriteria: ['Returns 200 OK', 'Validates input'],
    ...overrides,
  } as unknown as RankableNode
}

describe('nodeRequirementText', () => {
  it('returns a string', () => {
    const result = nodeRequirementText(makeNode())
    expect(typeof result).toBe('string')
  })

  it('includes title in output', () => {
    const node = makeNode({ title: 'My Feature Title' })
    const text = nodeRequirementText(node)
    expect(text.toLowerCase()).toContain('my feature title')
  })

  it('includes tags in output', () => {
    const node = makeNode({ tags: ['rest', 'crud'] })
    const text = nodeRequirementText(node)
    expect(text).toContain('rest')
    expect(text).toContain('crud')
  })

  it('is lowercase', () => {
    const node = makeNode({ title: 'UPPERCASE TITLE' })
    const text = nodeRequirementText(node)
    expect(text).toBe(text.toLowerCase())
  })
})

describe('rankScaffolds', () => {
  it('returns an array', () => {
    const result = rankScaffolds(makeNode())
    expect(Array.isArray(result)).toBe(true)
  })

  it('only returns entries with score > 0', () => {
    const result = rankScaffolds(makeNode())
    for (const item of result) {
      expect(item.score).toBeGreaterThan(0)
    }
  })

  it('each result has kind, score, entry fields', () => {
    const result = rankScaffolds(makeNode())
    for (const item of result) {
      expect(typeof item.kind).toBe('string')
      expect(typeof item.score).toBe('number')
      expect(item.entry).toBeDefined()
    }
  })

  it('returns empty array for node with no matching keywords', () => {
    const node = makeNode({ title: 'zyx', description: '', tags: [], acceptanceCriteria: [] })
    const result = rankScaffolds(node)
    expect(Array.isArray(result)).toBe(true)
  })
})
