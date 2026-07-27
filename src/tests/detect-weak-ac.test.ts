import { describe, it, expect } from 'vitest'
import { detectWeakAc } from '../core/gaps/detect-weak-ac.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('detectWeakAc', () => {
  it('returns empty array for empty doc', () => {
    expect(detectWeakAc(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(detectWeakAc(makeDoc()))).toBe(true)
  })

  it('detects weak AC with vague language', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Task',
        status: 'backlog',
        priority: 2,
        acceptanceCriteria: ['should work appropriately'],
        createdAt: '',
        updatedAt: '',
      },
    ])
    const gaps = detectWeakAc(doc)
    expect(Array.isArray(gaps)).toBe(true)
  })

  it('does NOT flag weak AC on terminal nodes (done/satisfied are historical)', () => {
    const weak = (id: string, status: string) => ({
      id,
      type: 'task' as const,
      title: 'Task',
      status: status as never,
      priority: 2,
      acceptanceCriteria: ['should work appropriately'],
      createdAt: '',
      updatedAt: '',
    })
    const backlogGaps = detectWeakAc(makeDoc([weak('b', 'backlog')]))
    const doneGaps = detectWeakAc(makeDoc([weak('d', 'done')]))
    const satGaps = detectWeakAc(makeDoc([weak('s', 'satisfied')]))
    expect(backlogGaps.length).toBeGreaterThan(0) // actionable → flagged
    expect(doneGaps).toEqual([]) // terminal → skipped
    expect(satGaps).toEqual([])
  })
})
