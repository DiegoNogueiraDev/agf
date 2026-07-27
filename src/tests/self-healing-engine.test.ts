import { describe, it, expect } from 'vitest'
import { monitorGraph, executeActions, DEFAULT_HEALING_CONFIG } from '../core/skills/self-healing-engine.js'
import type { HealingConfig, HealingAction } from '../schemas/healing.schema.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const NOW = new Date().toISOString()

function makeDoc(nodes: GraphNode[] = [], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: NOW, updatedAt: NOW },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeEdge(id: string, from: string, to: string, relationType = 'depends_on'): GraphEdge {
  return { id, from, to, relationType: relationType as GraphEdge['relationType'], createdAt: NOW }
}

const cfg: HealingConfig = { ...DEFAULT_HEALING_CONFIG, staleHours: 0 }

describe('DEFAULT_HEALING_CONFIG', () => {
  it('has autoHeal false by default', () => {
    expect(DEFAULT_HEALING_CONFIG.autoHeal).toBe(false)
  })

  it('has dryRun true by default', () => {
    expect(DEFAULT_HEALING_CONFIG.dryRun).toBe(true)
  })
})

describe('monitorGraph', () => {
  it('returns empty issues for empty graph', () => {
    const issues = monitorGraph(makeDoc(), DEFAULT_HEALING_CONFIG)
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBe(0)
  })

  it('detects stuck tasks (in_progress beyond staleHours=0)', () => {
    const staleNode = makeNode('n1', {
      status: 'in_progress',
      updatedAt: new Date(Date.now() - 1000).toISOString(),
    })
    const issues = monitorGraph(makeDoc([staleNode]), cfg)
    const stuck = issues.filter((i) => i.type === 'stuck_task')
    expect(stuck.length).toBeGreaterThanOrEqual(1)
    expect(stuck[0]?.nodeId).toBe('n1')
  })

  it('detects broken dependency edge', () => {
    const node = makeNode('n1')
    const brokenEdge = makeEdge('e1', 'n1', 'nonexistent-node')
    const issues = monitorGraph(makeDoc([node], [brokenEdge]), DEFAULT_HEALING_CONFIG)
    const broken = issues.filter((i) => i.type === 'broken_dependency')
    expect(broken.length).toBe(1)
    expect(broken[0]?.nodeId).toBe('n1')
  })

  it('detects orphan task with no parent and no edges', () => {
    const orphan = makeNode('n1', { type: 'task', parentId: undefined })
    const issues = monitorGraph(makeDoc([orphan]), DEFAULT_HEALING_CONFIG)
    const orphans = issues.filter((i) => i.type === 'orphan_node')
    expect(orphans.length).toBeGreaterThanOrEqual(1)
  })

  it('does not flag non-orphan task that has edges', () => {
    const n1 = makeNode('n1')
    const n2 = makeNode('n2')
    const edge = makeEdge('e1', 'n1', 'n2')
    const issues = monitorGraph(makeDoc([n1, n2], [edge]), DEFAULT_HEALING_CONFIG)
    const orphans = issues.filter((i) => i.type === 'orphan_node')
    expect(orphans.length).toBe(0)
  })

  it('each issue has required fields', () => {
    const stale = makeNode('n1', {
      status: 'in_progress',
      updatedAt: new Date(0).toISOString(),
    })
    const issues = monitorGraph(makeDoc([stale]), cfg)
    for (const issue of issues) {
      expect(typeof issue.id).toBe('string')
      expect(typeof issue.type).toBe('string')
      expect(typeof issue.severity).toBe('string')
      expect(typeof issue.nodeId).toBe('string')
      expect(typeof issue.message).toBe('string')
    }
  })
})

describe('executeActions build verification', () => {
  function makeAction(overrides: Partial<HealingAction> = {}): HealingAction {
    return {
      id: 'a1',
      issueId: 'i1',
      type: 'update_status',
      nodeId: 'n1',
      description: 'Mark stuck task as blocked.',
      params: { newStatus: 'blocked' },
      ...overrides,
    }
  }

  it('applies the mutation and skips the build checker for non-code actions', () => {
    const doc = makeDoc([makeNode('n1', { status: 'in_progress' })])
    const buildChecker = () => ({ success: false, errorMessage: 'should not be called' })
    const results = executeActions([makeAction()], doc, { dryRun: false, dir: '/repo', buildChecker })

    expect(results[0]?.success).toBe(true)
    expect(doc.nodes[0]?.status).toBe('blocked')
  })

  it('marks the action failed when a forced build check fails after applying it', () => {
    const doc = makeDoc([makeNode('n1', { status: 'in_progress' })])
    const buildChecker = () => ({ success: false, errorMessage: 'tsc: Cannot find name Foo' })
    const results = executeActions([makeAction()], doc, {
      dryRun: false,
      dir: '/repo',
      buildChecker,
      forceCodeAction: true,
    })

    expect(results[0]?.success).toBe(false)
    expect(results[0]?.message).toContain('tsc: Cannot find name Foo')
  })

  it('keeps the action successful when a forced build check passes', () => {
    const doc = makeDoc([makeNode('n1', { status: 'in_progress' })])
    const buildChecker = () => ({ success: true })
    const results = executeActions([makeAction()], doc, {
      dryRun: false,
      dir: '/repo',
      buildChecker,
      forceCodeAction: true,
    })

    expect(results[0]?.success).toBe(true)
  })
})
