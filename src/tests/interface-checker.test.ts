import { describe, it, expect } from 'vitest'
import { checkInterfaces } from '../core/designer/interface-checker.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const NOW = new Date().toISOString()

function makeDoc(nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: NOW, updatedAt: NOW },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeNode(id: string, type: GraphNode['type'], overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type,
    title: `Node ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeEdge(from: string, to: string, relationType: GraphEdge['relationType'] = 'related_to'): GraphEdge {
  return { id: `${from}-${to}`, from, to, relationType, createdAt: NOW }
}

describe('checkInterfaces', () => {
  it('returns score 100 for empty document', () => {
    const report = checkInterfaces(makeDoc([]))
    expect(report.overallScore).toBe(100)
    expect(report.results).toHaveLength(0)
  })

  it('only checks interface node types (epic, requirement, decision, constraint, risk)', () => {
    const doc = makeDoc([
      makeNode('t1', 'task'),
      makeNode('s1', 'subtask'),
      makeNode('e1', 'epic', { description: 'desc', acceptanceCriteria: ['ac'] }),
    ])
    const report = checkInterfaces(doc)
    expect(report.results).toHaveLength(1)
    expect(report.results[0].nodeId).toBe('e1')
  })

  it('scores hasDescription = 25 when description is present', () => {
    const doc = makeDoc([makeNode('e1', 'epic', { description: 'A description' })])
    const report = checkInterfaces(doc)
    expect(report.results[0].hasDescription).toBe(true)
    expect(report.results[0].score).toBeGreaterThanOrEqual(25)
  })

  it('scores hasDescription = 0 when description is absent', () => {
    const doc = makeDoc([makeNode('e1', 'epic')])
    const report = checkInterfaces(doc)
    expect(report.results[0].hasDescription).toBe(false)
  })

  it('scores hasAC = 25 when acceptanceCriteria is present', () => {
    const doc = makeDoc([makeNode('e1', 'epic', { acceptanceCriteria: ['must do X'] })])
    const report = checkInterfaces(doc)
    expect(report.results[0].hasAC).toBe(true)
    expect(report.results[0].score).toBeGreaterThanOrEqual(25)
  })

  it('scores hasEdges = 25 when node has edges', () => {
    const doc = makeDoc([makeNode('e1', 'epic'), makeNode('r1', 'requirement')], [makeEdge('e1', 'r1')])
    const report = checkInterfaces(doc)
    const epicResult = report.results.find((r) => r.nodeId === 'e1')!
    expect(epicResult.hasEdges).toBe(true)
  })

  it('scores hasConstraintLink = 25 when linked to a constraint node', () => {
    const doc = makeDoc([makeNode('e1', 'epic'), makeNode('c1', 'constraint')], [makeEdge('e1', 'c1')])
    const report = checkInterfaces(doc)
    const epicResult = report.results.find((r) => r.nodeId === 'e1')!
    expect(epicResult.hasConstraintLink).toBe(true)
    expect(epicResult.score).toBeGreaterThanOrEqual(50)
  })

  it('full score = 100 when all criteria met', () => {
    const doc = makeDoc(
      [makeNode('e1', 'epic', { description: 'desc', acceptanceCriteria: ['AC1'] }), makeNode('c1', 'constraint')],
      [makeEdge('e1', 'c1')],
    )
    const report = checkInterfaces(doc)
    const epicResult = report.results.find((r) => r.nodeId === 'e1')!
    expect(epicResult.score).toBe(100)
  })

  it('overallScore is average of individual scores', () => {
    const doc = makeDoc([makeNode('e1', 'epic'), makeNode('r1', 'requirement')])
    const report = checkInterfaces(doc)
    const expected = Math.round(report.results.reduce((sum, r) => sum + r.score, 0) / report.results.length)
    expect(report.overallScore).toBe(expected)
  })

  it('includes all interface node types in results', () => {
    const types: GraphNode['type'][] = ['epic', 'requirement', 'decision', 'constraint', 'risk']
    const doc = makeDoc(types.map((t, i) => makeNode(`n${i}`, t)))
    const report = checkInterfaces(doc)
    expect(report.results).toHaveLength(5)
  })

  it('nodesWithoutContracts lists nodes with score < 100', () => {
    const doc = makeDoc([makeNode('e1', 'epic')])
    const report = checkInterfaces(doc)
    expect(report.nodesWithoutContracts).toContain('e1')
  })
})
