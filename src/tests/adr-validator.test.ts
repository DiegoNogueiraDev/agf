import { describe, it, expect } from 'vitest'
import { validateAdrs } from '../core/designer/adr-validator.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; type: string; title?: string; description?: string; metadata?: Record<string, unknown> }>,
): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      status: 'backlog',
      title: n.title ?? `Node ${n.id}`,
      priority: 3,
      createdAt: '2026-06-23T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: false,
      description: n.description,
      metadata: n.metadata ?? {},
    })),
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('validateAdrs', () => {
  it('returns an AdrReport object', () => {
    const result = validateAdrs(makeDoc([]))
    expect(typeof result).toBe('object')
    expect(Array.isArray(result.decisions)).toBe(true)
    expect(typeof result.overallGrade).toBe('string')
    expect(typeof result.summary).toBe('string')
  })

  it('returns empty decisions for doc with no decision nodes', () => {
    const result = validateAdrs(makeDoc([{ id: 't1', type: 'task' }]))
    expect(result.decisions).toHaveLength(0)
  })

  it('returns F grade for empty doc', () => {
    const result = validateAdrs(makeDoc([]))
    expect(result.overallGrade).toBe('F')
  })

  it('detects decision node and validates it', () => {
    const result = validateAdrs(makeDoc([{ id: 'd1', type: 'decision', title: 'Use SQLite', description: '' }]))
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].nodeId).toBe('d1')
  })

  it('grades A when all 4 sections present in description', () => {
    const fullAdr = `## Status\nApproved\n## Context\nWe needed a DB\n## Decision\nUse SQLite\n## Consequences\nSimple, embedded`
    const result = validateAdrs(makeDoc([{ id: 'd1', type: 'decision', description: fullAdr }]))
    expect(result.decisions[0].grade).toBe('A')
    expect(result.overallGrade).toBe('A')
  })

  it('grades F when no sections present', () => {
    const result = validateAdrs(makeDoc([{ id: 'd1', type: 'decision', description: 'just some text' }]))
    expect(result.decisions[0].grade).toBe('F')
  })

  it('detects sections in metadata fields', () => {
    const result = validateAdrs(
      makeDoc([
        {
          id: 'd1',
          type: 'decision',
          description: '',
          metadata: { status: 'Approved', context: 'We needed a DB', decision: 'Use SQLite', consequences: 'Simple' },
        },
      ]),
    )
    expect(result.decisions[0].grade).toBe('A')
  })

  it('lists missing sections in missingFields', () => {
    const partialAdr = `## Status\nApproved\n## Context\nWe needed a DB`
    const result = validateAdrs(makeDoc([{ id: 'd1', type: 'decision', description: partialAdr }]))
    expect(result.decisions[0].missingFields).toContain('Decision')
    expect(result.decisions[0].missingFields).toContain('Consequences')
  })

  it('overallGrade is the worst across all decisions', () => {
    const fullAdr = `## Status\nA\n## Context\nB\n## Decision\nC\n## Consequences\nD`
    const result = validateAdrs(
      makeDoc([
        { id: 'd1', type: 'decision', description: fullAdr },
        { id: 'd2', type: 'decision', description: 'no sections' },
      ]),
    )
    expect(result.overallGrade).toBe('F')
  })
})
