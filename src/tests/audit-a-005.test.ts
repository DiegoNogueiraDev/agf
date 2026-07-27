/**
 * AUDIT-005 — persistDecomposition reversed / mis-targeted depends_on edges.
 *
 * It reconstructed planner→real id mapping from a `Set` over edge endpoints,
 * which discarded subtask order. smartDecompose emits a sequential chain where
 * subtask[i+1] depends_on subtask[i]; persisting must preserve that direction.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { persistDecomposition } from '../core/planner/auto-decompose.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { DecomposeResult } from '../core/planner/smart-decompose.js'

describe('AUDIT-005: persistDecomposition preserves depends_on edge direction', () => {
  let store: SqliteStore
  afterEach(() => store.close())

  it('chains subtasks in order: subtask[i+1] depends_on subtask[i]', () => {
    store = SqliteStore.open(':memory:')
    store.initProject('test')
    const ts = new Date().toISOString()
    store.insertNode({
      id: 'node_parent',
      title: 'Parent',
      type: 'task',
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: ts,
      updatedAt: ts,
    } as GraphNode)

    // Mirror smartDecompose output: edges chain subtask[i] -> subtask[i-1] using
    // provisional ids that persistDecomposition must NOT trust positionally.
    const result: DecomposeResult = {
      parentId: 'node_parent',
      subtasks: [
        { title: 'S1', type: 'subtask', acceptanceCriteria: ['a'], estimateMinutes: 30, suggestedTestType: 'unit' },
        { title: 'S2', type: 'subtask', acceptanceCriteria: ['b'], estimateMinutes: 30, suggestedTestType: 'unit' },
        { title: 'S3', type: 'subtask', acceptanceCriteria: ['c'], estimateMinutes: 30, suggestedTestType: 'unit' },
      ],
      edges: [
        { from: 'p1', to: 'p0', relation: 'depends_on' },
        { from: 'p2', to: 'p1', relation: 'depends_on' },
      ],
      rationale: 'test',
    }

    const persisted = persistDecomposition(store, result)
    expect(persisted.createdNodeIds).toHaveLength(3)
    expect(persisted.createdEdgeCount).toBe(2)

    const doc = store.toGraphDocument()
    const byTitle = (t: string): GraphNode => {
      const n = doc.nodes.find((node) => node.title === t)
      if (!n) throw new Error(`subtask ${t} not found`)
      return n
    }
    const s1 = byTitle('S1')
    const s2 = byTitle('S2')
    const s3 = byTitle('S3')

    const depends = doc.edges.filter((e) => e.relationType === 'depends_on')
    const has = (from: string, to: string): boolean => depends.some((e) => e.from === from && e.to === to)

    // Correct chain
    expect(has(s2.id, s1.id)).toBe(true)
    expect(has(s3.id, s2.id)).toBe(true)
    // Must not be reversed / mis-targeted
    expect(has(s1.id, s2.id)).toBe(false)
    expect(has(s3.id, s1.id)).toBe(false)
  })
})
