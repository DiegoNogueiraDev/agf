/*!
 * Task node_3158bb3d6a9d — decomposition hint for non_atomic_task.
 *
 * AC1: Given an XL task with no subtasks, When gaps --kind non_atomic_task,
 *      Then applyVia includes 'agf decompose <id>'.
 * AC2: Given an S task with AC, When gaps --kind non_atomic_task,
 *      Then not flagged.
 */

import { describe, it, expect } from 'vitest'
import { detectAtomicity } from '../core/gaps/detect-atomicity.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const TS = new Date().toISOString()

function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'in_progress',
    priority: 3,
    createdAt: TS,
    updatedAt: TS,
    ...extra,
  }
}

function makeDoc(nodes: GraphNode[]) {
  return {
    version: '1.0.0',
    project: { id: 'proj_test', name: 'Test', createdAt: TS },
    nodes,
    edges: [],
    indexes: { byId: {} as Record<string, GraphNode> },
    meta: {},
  }
}

describe('detectAtomicity applyVia hint', () => {
  it('applyVia includes agf decompose <id> for XL task (AC1)', () => {
    const task = node('task_xl', { xpSize: 'XL' })
    const doc = makeDoc([task])
    const gaps = detectAtomicity(doc)
    const gap = gaps.find((g) => g.nodeId === 'task_xl')
    expect(gap).toBeDefined()
    const applyVia = gap!.enrichment?.applyVia ?? []
    const hasDecomposeWithId = applyVia.some((cmd) => cmd.includes('agf decompose') && cmd.includes('task_xl'))
    expect(hasDecomposeWithId).toBe(true)
  })

  it('S task is not flagged (AC2)', () => {
    const task = node('task_s', { xpSize: 'S', acceptanceCriteria: ['Given X, When Y, Then Z'] })
    const doc = makeDoc([task])
    const gaps = detectAtomicity(doc)
    expect(gaps.some((g) => g.nodeId === 'task_s')).toBe(false)
  })
})
