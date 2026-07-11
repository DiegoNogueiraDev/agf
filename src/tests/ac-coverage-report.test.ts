/*!
 * Tests for AC coverage report emitted by import-prd / generate-prd.
 */

import { describe, it, expect } from 'vitest'
import { computeAcCoverage } from '../core/importer/ac-coverage.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(id: string, ac: string[] = []): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: ac,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('computeAcCoverage', () => {
  it('counts tasks, tasks with AC, and missing AC', () => {
    const nodes: GraphNode[] = [makeNode('n1', ['AC1']), makeNode('n2', []), makeNode('n3', ['AC1', 'AC2'])]
    const result = computeAcCoverage(nodes)
    expect(result.tasksTotal).toBe(3)
    expect(result.tasksWithExtractedAc).toBe(2)
    expect(result.tasksMissingAc).toBe(1)
  })

  it('ignores non-task nodes (epics, risks)', () => {
    const nodes: GraphNode[] = [{ ...makeNode('e1', []), type: 'epic' }, makeNode('t1', ['AC'])]
    const result = computeAcCoverage(nodes)
    expect(result.tasksTotal).toBe(1)
    expect(result.tasksWithExtractedAc).toBe(1)
  })

  it('returns zeros when no task nodes', () => {
    const result = computeAcCoverage([])
    expect(result.tasksTotal).toBe(0)
    expect(result.tasksMissingAc).toBe(0)
  })
})
