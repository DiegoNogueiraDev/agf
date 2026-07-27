import { describe, it, expect } from 'vitest'
import { checkStatusFlow } from '../core/validator/status-flow-checker.js'
import { checkDoneIntegrity } from '../core/validator/done-integrity-checker.js'
import { checkEdgeConsistency } from '../core/validator/edge-consistency-checker.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const mockDoc = (nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument => ({ nodes, edges })

const task = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type: 'task' as const,
  title: `Task ${id}`,
  status: 'done',
  priority: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  ...overrides,
})

const edge = (from: string, to: string, relationType: string): GraphEdge => ({
  id: `e-${from}-${to}`,
  from,
  to,
  relationType: relationType as GraphEdge['relationType'],
  createdAt: '2026-01-01T00:00:00Z',
})

describe('status-flow-checker', () => {
  it('passes when all done tasks have different createdAt/updatedAt', () => {
    const doc = mockDoc([
      task('t1', { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }),
      task('t2', { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' }),
    ])

    const report = checkStatusFlow(doc)
    expect(report.violations.length).toBe(0)
    expect(report.complianceRate).toBe(100)
  })

  it('detects tasks with createdAt === updatedAt', () => {
    const ts = '2026-01-01T00:00:00Z'
    const doc = mockDoc([task('t1', { createdAt: ts, updatedAt: ts })])

    const report = checkStatusFlow(doc)
    expect(report.violations.length).toBe(1)
    expect(report.violations[0].nodeId).toBe('t1')
    expect(report.complianceRate).toBe(0)
  })

  it('returns 100% complianceRate when no done tasks exist', () => {
    const doc = mockDoc([{ ...task('t1'), status: 'in_progress' } as GraphNode])

    const report = checkStatusFlow(doc)
    expect(report.complianceRate).toBe(100)
  })
})

describe('done-integrity-checker', () => {
  it('passes when all done tasks have no issues', () => {
    const doc = mockDoc([task('t1', { blocked: false })])

    const report = checkDoneIntegrity(doc)
    expect(report.passed).toBe(true)
    expect(report.issues.length).toBe(0)
  })

  it('detects blocked but done tasks', () => {
    const doc = mockDoc([task('t1', { blocked: true })])

    const report = checkDoneIntegrity(doc)
    expect(report.passed).toBe(false)
    expect(report.issues.some((i) => i.issueType === 'blocked_but_done')).toBe(true)
  })

  it('detects done tasks with unresolved dependencies', () => {
    const nodes = [task('t1'), task('t2', { status: 'backlog' })]
    const edges = [edge('t1', 't2', 'depends_on')]

    const report = checkDoneIntegrity(mockDoc(nodes, edges))
    expect(report.passed).toBe(false)
    expect(report.issues.some((i) => i.issueType === 'dependency_not_done')).toBe(true)
  })

  it('allows done task that depends on another done task', () => {
    const nodes = [task('t1'), task('t2')]
    const edges = [edge('t1', 't2', 'depends_on')]

    const report = checkDoneIntegrity(mockDoc(nodes, edges))
    expect(report.passed).toBe(true)
  })

  it('returns vacuous pass info when no done tasks', () => {
    const doc = mockDoc([{ ...task('t1'), status: 'backlog' } as GraphNode])

    const report = checkDoneIntegrity(doc)
    expect(report.passed).toBe(true)
    expect(report.info).toContain('vacuous')
  })
})

describe('edge-consistency-checker', () => {
  it('detects self loops', () => {
    const nodes = [task('t1')]
    const edges = [edge('t1', 't1', 'depends_on')]

    const report = checkEdgeConsistency(mockDoc(nodes, edges))
    expect(report.issues.some((i) => i.issueType === 'self_loop')).toBe(true)
  })

  it('handles cyclic parent_of/child_of edges without crashing', () => {
    const nodes = [{ ...task('epic'), type: 'epic' as const }, task('t2')]
    const edges = [edge('epic', 't2', 'parent_of'), edge('t2', 'epic', 'child_of')]

    const report = checkEdgeConsistency(mockDoc(nodes, edges))
    expect(report).toBeDefined()
    expect(report.issues).toBeDefined()
  })

  it('passes for consistent graph', () => {
    const nodes = [task('t1'), task('t2')]
    const edges = [edge('t1', 't2', 'depends_on')]

    const report = checkEdgeConsistency(mockDoc(nodes, edges))
    const criticalIssues = report.issues.filter(
      (i) => i.issueType !== 'orphan_child_of' && i.issueType !== 'orphan_parent_of',
    )
    expect(criticalIssues.length).toBe(0)
  })
})
