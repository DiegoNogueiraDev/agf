import { describe, it, expect } from 'vitest'
import { extractJtbds, runJtbdTests } from '../core/designer/jtbd-runner.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { Jtbd } from '../core/designer/decision-fitness.js'

const NOW = new Date().toISOString()

function makeNode(overrides: Partial<GraphNode> & { id: string; type: GraphNode['type'] }): GraphNode {
  return {
    title: 'Node',
    status: 'backlog',
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('extractJtbds', () => {
  it('returns empty array for empty node list', () => {
    expect(extractJtbds([])).toHaveLength(0)
  })

  it('extracts a JTBD from an epic node description', () => {
    const node = makeNode({
      id: 'e1',
      type: 'epic',
      description: 'When a developer ships code, i want fast feedback, so i can fix errors early.',
    })
    const jtbds = extractJtbds([node])
    expect(jtbds).toHaveLength(1)
    expect(jtbds[0].sourceNodeId).toBe('e1')
    expect(jtbds[0].situation).toContain('developer')
    expect(jtbds[0].motivation).toContain('fast feedback')
    expect(jtbds[0].outcome).toContain('fix errors')
  })

  it('extracts JTBDs from requirement nodes', () => {
    const node = makeNode({
      id: 'r1',
      type: 'requirement',
      description: 'When a user logs in, i want to stay authenticated, so i can continue working.',
    })
    const jtbds = extractJtbds([node])
    expect(jtbds).toHaveLength(1)
    expect(jtbds[0].sourceNodeId).toBe('r1')
  })

  it('ignores nodes that are not epic or requirement', () => {
    const node = makeNode({
      id: 't1',
      type: 'task',
      description: 'When something happens, i want to act, so i can succeed.',
    })
    const jtbds = extractJtbds([node])
    expect(jtbds).toHaveLength(0)
  })

  it('skips nodes without description', () => {
    const node = makeNode({ id: 'e2', type: 'epic' })
    expect(extractJtbds([node])).toHaveLength(0)
  })

  it('extracts multiple JTBDs from multiple nodes', () => {
    const nodes = [
      makeNode({
        id: 'e1',
        type: 'epic',
        description: 'When a user visits, i want to see content, so i can learn.',
      }),
      makeNode({
        id: 'r1',
        type: 'requirement',
        description: 'When a team deploys, i want zero downtime, so i can serve users.',
      }),
    ]
    expect(extractJtbds(nodes)).toHaveLength(2)
  })

  it('JTBD has situation, motivation, outcome fields', () => {
    const node = makeNode({
      id: 'e1',
      type: 'epic',
      description: 'When a project starts, i want clear goals, so i can prioritize tasks.',
    })
    const [jtbd] = extractJtbds([node])
    expect(typeof jtbd.situation).toBe('string')
    expect(typeof jtbd.motivation).toBe('string')
    expect(typeof jtbd.outcome).toBe('string')
  })
})

describe('runJtbdTests', () => {
  const decision = makeNode({
    id: 'd1',
    type: 'decision',
    title: 'Use automated testing',
    description: 'Implement fast feedback loops with automated test suites to catch errors quickly.',
  })

  const jtbd: Jtbd = {
    situation: 'a developer ships code',
    motivation: 'fast feedback from automated tests',
    outcome: 'catch errors early before production',
    sourceNodeId: 'e1',
  }

  it('returns results for each JTBD', () => {
    const results = runJtbdTests([jtbd], decision)
    expect(results).toHaveLength(1)
  })

  it('result has status, overlapScore, justification', () => {
    const [result] = runJtbdTests([jtbd], decision)
    expect(['PASS', 'PARTIAL', 'FAIL']).toContain(result.status)
    expect(typeof result.overlapScore).toBe('number')
    expect(typeof result.justification).toBe('string')
  })

  it('overlapScore is between 0 and 1', () => {
    const [result] = runJtbdTests([jtbd], decision)
    expect(result.overlapScore).toBeGreaterThanOrEqual(0)
    expect(result.overlapScore).toBeLessThanOrEqual(1)
  })

  it('high keyword overlap yields PASS status', () => {
    const perfectJtbd: Jtbd = {
      situation: 'developer ships',
      motivation: 'automated test suites fast feedback',
      outcome: 'catch errors quickly loops',
      sourceNodeId: 'e2',
    }
    const [result] = runJtbdTests([perfectJtbd], decision)
    expect(result.status).toBe('PASS')
    expect(result.overlapScore).toBeGreaterThanOrEqual(0.3)
  })

  it('no keyword overlap yields FAIL status', () => {
    const unrelatedJtbd: Jtbd = {
      situation: 'a chef cooks meals',
      motivation: 'delicious recipes ingredients',
      outcome: 'satisfy hungry customers dining',
      sourceNodeId: 'e3',
    }
    const unrelatedDecision = makeNode({
      id: 'd2',
      type: 'decision',
      description: 'Configure database sharding strategy for horizontal scalability.',
    })
    const [result] = runJtbdTests([unrelatedJtbd], unrelatedDecision)
    expect(result.status).toBe('FAIL')
    expect(result.overlapScore).toBeLessThan(0.1)
  })

  it('returns empty array for empty jtbds list', () => {
    expect(runJtbdTests([], decision)).toHaveLength(0)
  })

  it('result references the original jtbd', () => {
    const [result] = runJtbdTests([jtbd], decision)
    expect(result.jtbd).toBe(jtbd)
  })
})
