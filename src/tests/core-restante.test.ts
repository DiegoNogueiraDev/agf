/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// ── Mocks for definition-of-ready dependencies ──

vi.mock('../core/analyzer/ac-validator.js', () => ({
  validateAcQuality: vi.fn(() => ({ overallScore: 80, details: [], scores: {} })),
}))

vi.mock('../core/analyzer/risk-assessment.js', () => ({
  assessRisks: vi.fn(() => ({ risks: [] })),
}))

vi.mock('../core/insights/bottleneck-detector.js', () => ({
  detectBottlenecks: vi.fn(() => ({ oversizedTasks: [], bottlenecks: [] })),
}))

vi.mock('../core/insights/metrics-calculator.js', () => ({
  calculateMetrics: vi.fn(() => ({ sprintProgress: [], velocity: 0, distribution: [] })),
}))

vi.mock('../core/planner/dependency-chain.js', () => ({
  detectCycles: vi.fn(() => []),
}))

vi.mock('../core/harness/harness-cache.js', () => ({
  runHarnessScanCached: vi.fn(() => undefined),
}))

// ── Imports ──

import { validateValidationInput } from '../core/validator/validation.js'
import { checkDoneIntegrity } from '../core/validator/done-integrity-checker.js'
import { checkStatusFlow } from '../core/validator/status-flow-checker.js'
import { checkEdgeConsistency } from '../core/validator/edge-consistency-checker.js'
import { checkValidationReadiness } from '../core/validator/definition-of-ready.js'
import { buildDashboardModel, loadDashboardModel } from '../core/web/model.js'
import { buildProgressSnapshot } from '../core/web/progress-snapshot.js'
import { renderProgressHtml } from '../core/web/progress-html.js'
import { startProgressServer } from '../core/web/progress-server.js'
import { instantiateTemplate, listTemplates } from '../core/templates/template-engine.js'
import { WorkerStateSchema, PermissionModeSchema } from '../core/worker-state/worker-state-schema.js'
import { WorkerStateStore } from '../core/worker-state/worker-state-store.js'
import { registerTestsRules } from '../core/tests-rules/tests-rules-atomic.js'
import { clearRegistry } from '../core/atomic-files/registry.js'
import { hasVitest, initVitestSmokeConfig, mergeVitestScripts } from '../core/tests-rules/vitest-scaffold-atomic.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

// ── Helpers ──

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 8)}`,
    type: 'task',
    title: 'Test Node',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  const ts = new Date().toISOString()
  return {
    id: `edge_${Math.random().toString(36).slice(2, 8)}`,
    from: '',
    to: '',
    relationType: 'depends_on',
    createdAt: ts,
    ...overrides,
  }
}

function emptyDoc(): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'Test', createdAt: '', updatedAt: '' },
    nodes: [],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function addDoc(doc: GraphDocument, ...nodes: GraphNode[]): void {
  for (const n of nodes) doc.nodes.push(n)
  for (const n of nodes) doc.indexes.byId[n.id] = doc.nodes.indexOf(n)
}

// ═══════════════════════════════════════════════════
//  validator/validation.ts
// ═══════════════════════════════════════════════════

describe('validator/validation.ts', () => {
  it('validateValidationInput: accepts valid action', () => {
    const result = validateValidationInput({ action: 'ac' })
    expect(result.action).toBe('ac')
  })

  it('validateValidationInput: accepts empty input', () => {
    const result = validateValidationInput({})
    expect(result.action).toBeUndefined()
    expect(result.nodeId).toBeUndefined()
    expect(result.strict).toBeUndefined()
  })

  it('validateValidationInput: rejects invalid action', () => {
    expect(() => validateValidationInput({ action: 'nope' })).toThrow()
  })

  it('validateValidationInput: accepts valid fields', () => {
    const result = validateValidationInput({ action: 'dod', nodeId: 'n1', strict: true })
    expect(result.action).toBe('dod')
    expect(result.nodeId).toBe('n1')
    expect(result.strict).toBe(true)
  })
})

// ═══════════════════════════════════════════════════
//  validator/done-integrity-checker.ts
// ═══════════════════════════════════════════════════

describe('validator/done-integrity-checker.ts', () => {
  it('empty graph: vacuous pass', () => {
    const r = checkDoneIntegrity(emptyDoc())
    expect(r.passed).toBe(true)
    expect(r.issues).toHaveLength(0)
    expect(r.info).toBe('0 done tasks to check — vacuous pass')
  })

  it('done task not blocked with all done deps → passes', () => {
    const dep = makeNode({ id: 'dep1', title: 'Dependency', status: 'done' })
    const task = makeNode({ id: 't1', title: 'Task', status: 'done', blocked: false })
    const doc = emptyDoc()
    addDoc(doc, dep, task)
    doc.edges.push(makeEdge({ id: 'e1', from: 't1', to: 'dep1', relationType: 'depends_on' }))
    const r = checkDoneIntegrity(doc)
    expect(r.passed).toBe(true)
  })

  it('done task still blocked → issue', () => {
    const task = makeNode({ id: 't1', title: 'BlockedDone', status: 'done', blocked: true })
    const doc = emptyDoc()
    addDoc(doc, task)
    const r = checkDoneIntegrity(doc)
    expect(r.passed).toBe(false)
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].issueType).toBe('blocked_but_done')
  })

  it('done task with non-done dependency → issue', () => {
    const dep = makeNode({ id: 'dep1', title: 'Pending', status: 'in_progress' })
    const task = makeNode({ id: 't1', title: 'Task', status: 'done' })
    const doc = emptyDoc()
    addDoc(doc, dep, task)
    doc.edges.push(makeEdge({ id: 'e1', from: 't1', to: 'dep1', relationType: 'depends_on' }))
    const r = checkDoneIntegrity(doc)
    expect(r.passed).toBe(false)
    expect(r.issues[0].issueType).toBe('dependency_not_done')
  })

  it('non-task done nodes are ignored', () => {
    const node = makeNode({ id: 'm1', type: 'milestone', title: 'M1', status: 'done' })
    const doc = emptyDoc()
    addDoc(doc, node)
    const r = checkDoneIntegrity(doc)
    expect(r.passed).toBe(true)
  })
})

// ═══════════════════════════════════════════════════
//  validator/status-flow-checker.ts
// ═══════════════════════════════════════════════════

describe('validator/status-flow-checker.ts', () => {
  it('no done tasks → 100% compliance', () => {
    const r = checkStatusFlow(emptyDoc())
    expect(r.complianceRate).toBe(100)
    expect(r.violations).toHaveLength(0)
  })

  it('done task with different timestamps → passes', () => {
    const task = makeNode({
      id: 't1',
      title: 'OK',
      status: 'done',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    })
    const doc = emptyDoc()
    addDoc(doc, task)
    const r = checkStatusFlow(doc)
    expect(r.complianceRate).toBe(100)
  })

  it('done task with equal timestamps → violation', () => {
    const task = makeNode({
      id: 't1',
      title: 'Skip',
      status: 'done',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })
    const doc = emptyDoc()
    addDoc(doc, task)
    const r = checkStatusFlow(doc)
    expect(r.complianceRate).toBe(0)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0].nodeId).toBe('t1')
  })

  it('mix of compliant and non-compliant → partial rate', () => {
    const t1 = makeNode({
      id: 't1',
      title: 'Good',
      status: 'done',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    })
    const t2 = makeNode({
      id: 't2',
      title: 'Bad',
      status: 'done',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })
    const doc = emptyDoc()
    addDoc(doc, t1, t2)
    const r = checkStatusFlow(doc)
    expect(r.complianceRate).toBe(50)
  })
})

// ═══════════════════════════════════════════════════
//  validator/edge-consistency-checker.ts
// ═══════════════════════════════════════════════════

describe('validator/edge-consistency-checker.ts', () => {
  it('empty edges → passes', () => {
    const r = checkEdgeConsistency(emptyDoc())
    expect(r.passed).toBe(true)
    expect(r.issues).toHaveLength(0)
  })

  it('self-loop edge → detected', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 'n1' }))
    doc.edges.push(makeEdge({ id: 'e1', from: 'n1', to: 'n1', relationType: 'depends_on' }))
    const r = checkEdgeConsistency(doc)
    expect(r.passed).toBe(false)
    expect(r.issues[0].issueType).toBe('self_loop')
  })

  it('redundant inverse: depends_on A→B + blocks B→A → detected', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 'a' }), makeNode({ id: 'b' }))
    doc.edges.push(makeEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'depends_on' }))
    doc.edges.push(makeEdge({ id: 'e2', from: 'b', to: 'a', relationType: 'blocks' }))
    const r = checkEdgeConsistency(doc)
    expect(r.passed).toBe(false)
    expect(r.issues.some((i) => i.issueType === 'redundant_inverse')).toBe(true)
  })

  it('orphan parent_of (no matching child_of) → detected', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 'a' }), makeNode({ id: 'b' }))
    doc.edges.push(makeEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'parent_of' }))
    const r = checkEdgeConsistency(doc)
    expect(r.issues.some((i) => i.issueType === 'orphan_parent_of')).toBe(true)
  })

  it('orphan child_of (no matching parent_of) → detected', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 'a' }), makeNode({ id: 'b' }))
    doc.edges.push(makeEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'child_of' }))
    const r = checkEdgeConsistency(doc)
    expect(r.issues.some((i) => i.issueType === 'orphan_child_of')).toBe(true)
  })

  it('parent_child_mismatch: parent_of A→B but B.parentId !== A', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 'a' }), makeNode({ id: 'b', parentId: 'c' }))
    doc.edges.push(makeEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'parent_of' }))
    doc.edges.push(makeEdge({ id: 'e2', from: 'b', to: 'a', relationType: 'child_of' }))
    const r = checkEdgeConsistency(doc)
    expect(r.issues.some((i) => i.issueType === 'parent_child_mismatch')).toBe(true)
  })

  it('valid parent_of + child_of pair with matching parentId → passes', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 'a' }), makeNode({ id: 'b', parentId: 'a' }))
    doc.edges.push(makeEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'parent_of' }))
    doc.edges.push(makeEdge({ id: 'e2', from: 'b', to: 'a', relationType: 'child_of' }))
    const r = checkEdgeConsistency(doc)
    expect(r.issues.some((i) => i.issueType === 'parent_child_mismatch')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════
//  validator/definition-of-ready.ts
// ═══════════════════════════════════════════════════

describe('validator/definition-of-ready.ts', () => {
  it('empty graph → not ready, completion_threshold fails', () => {
    const r = checkValidationReadiness(emptyDoc())
    expect(r.ready).toBe(false)
    expect(r.checks.find((c) => c.name === 'completion_threshold')?.passed).toBe(false)
  })

  it('graph with >50% done → passes completion_threshold', () => {
    const doc = emptyDoc()
    addDoc(
      doc,
      makeNode({ id: 't1', title: 'Done1', status: 'done' }),
      makeNode({ id: 't2', title: 'Done2', status: 'done' }),
      makeNode({ id: 't3', title: 'Pending', status: 'in_progress' }),
    )
    const r = checkValidationReadiness(doc)
    expect(r.checks.find((c) => c.name === 'completion_threshold')?.passed).toBe(true)
  })

  it('graph with AC node → ac_defined passes', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 't1', title: 'Task', status: 'done' }))
    doc.nodes.push(makeNode({ id: 'ac1', type: 'acceptance_criteria', title: 'AC 1' }))
    const r = checkValidationReadiness(doc)
    expect(r.checks.find((c) => c.name === 'ac_defined')?.passed).toBe(true)
  })

  it('graph with acceptanceCriteria on task → ac_defined passes', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 't1', title: 'Task', status: 'backlog', acceptanceCriteria: ['Must work'] }))
    const r = checkValidationReadiness(doc)
    expect(r.checks.find((c) => c.name === 'ac_defined')?.passed).toBe(true)
  })

  it('no AC → ac_defined fails', () => {
    const doc = emptyDoc()
    addDoc(doc, makeNode({ id: 't1', title: 'Task', status: 'backlog' }))
    const r = checkValidationReadiness(doc)
    expect(r.checks.find((c) => c.name === 'ac_defined')?.passed).toBe(false)
  })

  it('returns score and grade', () => {
    const r = checkValidationReadiness(emptyDoc())
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.grade).toBeDefined()
    expect(r.summary).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════
//  web/model.ts
// ═══════════════════════════════════════════════════

describe('web/model.ts', () => {
  describe('buildDashboardModel (pure)', () => {
    it('empty stats → phase —', () => {
      const m = buildDashboardModel({
        projectName: 'Test',
        stats: { totalNodes: 0, byStatus: {} },
        tasks: [],
        tokens: { total: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 },
        modelLabel: 'auto',
      })
      expect(m.phase).toBe('—')
      expect(m.wip).toBe(0)
      expect(m.totalTasks).toBe(0)
    })

    it('nodes in progress → BUILD phase', () => {
      const m = buildDashboardModel({
        projectName: 'Proj',
        stats: { totalNodes: 5, byStatus: { backlog: 2, in_progress: 1, done: 2 } },
        tasks: [{ id: 't1', title: 'T1', status: 'in_progress' }],
        tokens: { total: 100, tokensIn: 50, tokensOut: 50, costUsd: 0.01, calls: 2 },
        modelLabel: 'claude',
      })
      expect(m.projectName).toBe('Proj')
      expect(m.wip).toBe(1)
      expect(m.totalTasks).toBe(5)
      expect(m.modelLabel).toBe('claude')
      expect(m.tokens.calls).toBe(2)
    })
  })

  describe('loadDashboardModel (store integration)', () => {
    let store: SqliteStore

    afterEach(() => store?.close())

    it('returns model with project name and zero state', () => {
      store = SqliteStore.open(':memory:')
      store.initProject('TestProj')
      const m = loadDashboardModel(store)
      expect(m.projectName).toBe('TestProj')
      expect(m.totalTasks).toBe(0)
      expect(m.wip).toBe(0)
      expect(m.tasks).toEqual([])
    })

    it('includes active tasks', () => {
      store = SqliteStore.open(':memory:')
      store.initProject('Proj')
      store.insertNode(makeNode({ id: 't1', title: 'Active', status: 'in_progress' }))
      store.insertNode(makeNode({ id: 't2', title: 'Ready', status: 'ready' }))
      store.insertNode(makeNode({ id: 't3', title: 'Backlog', status: 'backlog' }))
      const m = loadDashboardModel(store)
      expect(m.tasks).toHaveLength(2)
      expect(m.tasks.find((t) => t.id === 't1')?.title).toBe('Active')
      expect(m.tasks.find((t) => t.id === 't2')?.title).toBe('Ready')
      expect(m.tasks.find((t) => t.id === 't3')).toBeUndefined()
    })
  })
})

// ═══════════════════════════════════════════════════
//  web/progress-snapshot.ts
// ═══════════════════════════════════════════════════

describe('web/progress-snapshot.ts', () => {
  let store: SqliteStore
  afterEach(() => store?.close())

  it('no project → empty snapshot', () => {
    store = SqliteStore.open(':memory:')
    const s = buildProgressSnapshot(store)
    expect(s.project).toBe('—')
    expect(s.phase).toBe('—')
    expect(s.tasks).toEqual([])
  })

  it('with project → snapshot matches model', () => {
    store = SqliteStore.open(':memory:')
    store.initProject('MyProj')
    store.insertNode(makeNode({ id: 't1', title: 'Active', status: 'in_progress' }))
    const s = buildProgressSnapshot(store)
    expect(s.project).toBe('MyProj')
    expect(s.totalTasks).toBe(1)
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0].title).toBe('Active')
  })
})

// ═══════════════════════════════════════════════════
//  web/progress-html.ts
// ═══════════════════════════════════════════════════

describe('web/progress-html.ts', () => {
  it('renderProgressHtml returns HTML string', () => {
    const html = renderProgressHtml()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('agent-graph-flow')
    expect(html).toContain('/api/progress')
    expect(html).toContain('/api/logs')
  })
})

// ═══════════════════════════════════════════════════
//  web/progress-server.ts
// ═══════════════════════════════════════════════════

describe('web/progress-server.ts', () => {
  let server: Awaited<ReturnType<typeof startProgressServer>> | undefined
  let store: SqliteStore

  afterEach(async () => {
    await server?.close()
    server = undefined
    store?.close()
  })

  it('starts and serves HTML at /', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('SrvTest')
    server = await startProgressServer(store, { port: 0, host: '127.0.0.1' })
    expect(server.port).toBeGreaterThan(0)
    expect(server.url).toContain('127.0.0.1')
    const res = await fetch(server.url)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('<!DOCTYPE html>')
  })

  it('/api/progress returns JSON', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('JSONTest')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/progress`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.project).toBe('JSONTest')
  })

  it('/api/logs returns log tail', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('LogTest')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/api/logs`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.logs)).toBe(true)
  })

  it('unknown route returns 404', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('404Test')
    server = await startProgressServer(store, { port: 0 })
    const res = await fetch(`${server.url}/nope`)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('not_found')
  })

  it('port fallback when preferred port is in use', async () => {
    store = SqliteStore.open(':memory:')
    store.initProject('Fallback')
    const s1 = await startProgressServer(store, { port: 0 })
    const store2 = SqliteStore.open(':memory:')
    store2.initProject('F2')
    // start another on same ephemeral port used by s1
    const s2 = await startProgressServer(store2, { port: s1.port })
    expect(s2.port).not.toBe(s1.port)
    await s2.close()
    await s1.close()
    store2.close()
  })
})

// ═══════════════════════════════════════════════════
//  templates/template-engine.ts
// ═══════════════════════════════════════════════════

describe('templates/template-engine.ts', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('Templates')
  })

  afterEach(() => store?.close())

  it('instantiateTemplate with empty definitions → throws', () => {
    expect(() => instantiateTemplate(store, { name: 'empty', nodeDefinitions: [] })).toThrow(
      'Template must have at least one node definition',
    )
  })

  it('instantiateTemplate creates nodes and returns IDs', () => {
    const r = instantiateTemplate(
      store,
      {
        name: 'test',
        nodeDefinitions: [
          { type: 'task', titleTemplate: 'My Task', xpSize: 'M' },
          { type: 'subtask', titleTemplate: 'Sub {{x}}', tags: ['tag1'] },
        ],
        edgeDefinitions: [{ fromIndex: 0, toIndex: 1, relationType: 'depends_on' }],
      },
      { x: 'A' },
    )
    expect(r.nodesCreated).toHaveLength(2)
    expect(r.edgesCreated).toHaveLength(1)
    expect(r.errors).toHaveLength(0)

    const doc = store.toGraphDocument()
    expect(doc.nodes).toHaveLength(2)
    expect(doc.nodes[0].title).toBe('My Task')
    expect(doc.nodes[0].xpSize).toBe('M')
    expect(doc.nodes[0].status).toBe('backlog')
    expect(doc.nodes[1].title).toBe('Sub A')
    expect(doc.nodes[1].tags).toEqual(['tag1'])
    expect(doc.edges).toHaveLength(1)
  })

  it('instantiateTemplate with parentId creates parent/child edges', () => {
    // parent node must exist in store for edge FK constraint
    const parentNode = makeNode({ id: 'existing_parent', title: 'Parent' })
    store.insertNode(parentNode)
    const r = instantiateTemplate(
      store,
      {
        name: 'child',
        nodeDefinitions: [{ type: 'task', titleTemplate: 'Child' }],
      },
      {},
      'existing_parent',
    )
    expect(r.nodesCreated).toHaveLength(1)
    expect(r.errors).toHaveLength(0)
    const doc = store.toGraphDocument()
    expect(doc.nodes.find((n) => n.id === r.nodesCreated[0])?.parentId).toBe('existing_parent')
    const parentEdges = doc.edges.filter((e) => e.relationType === 'parent_of' || e.relationType === 'child_of')
    expect(parentEdges).toHaveLength(2)
  })

  it('listTemplates returns empty when no milestone nodes have templateDefinition', () => {
    store.insertNode(makeNode({ id: 'm1', type: 'milestone', title: 'M1' }))
    const list = listTemplates(store)
    expect(list).toHaveLength(0)
  })

  it('listTemplates finds milestone with templateDefinition metadata', () => {
    store.insertNode(
      makeNode({
        id: 'm1',
        type: 'milestone',
        title: 'Template Epic',
        metadata: { templateDefinition: true },
      }),
    )
    const list = listTemplates(store)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Template Epic')
  })
})

// ═══════════════════════════════════════════════════
//  worker-state/worker-state-schema.ts
// ═══════════════════════════════════════════════════

describe('worker-state/worker-state-schema.ts', () => {
  it('PermissionModeSchema accepts valid modes', () => {
    expect(PermissionModeSchema.parse('read-only')).toBe('read-only')
    expect(PermissionModeSchema.parse('workspace-write')).toBe('workspace-write')
    expect(PermissionModeSchema.parse('danger-full-access')).toBe('danger-full-access')
  })

  it('PermissionModeSchema rejects invalid mode', () => {
    expect(() => PermissionModeSchema.parse('full-access')).toThrow()
  })

  it('WorkerStateSchema validates a valid state', () => {
    const state = {
      worker_id: 'w1',
      session_ref: 'sess_abc',
      model: 'claude-sonnet-4',
      permission_mode: 'read-only' as const,
      started_at: '2025-06-01T00:00:00.000Z',
      last_turn_at: '2025-06-01T01:00:00.000Z',
      cwd: '/home/user/project',
    }
    const result = WorkerStateSchema.parse(state)
    expect(result.worker_id).toBe('w1')
    expect(result.session_ref).toBe('sess_abc')
  })

  it('WorkerStateSchema rejects missing fields', () => {
    expect(() => WorkerStateSchema.parse({})).toThrow()
  })

  it('WorkerStateSchema rejects invalid ISO datetime', () => {
    expect(() =>
      WorkerStateSchema.parse({
        worker_id: 'w1',
        session_ref: 's1',
        model: 'm1',
        permission_mode: 'read-only',
        started_at: 'not-a-date',
        last_turn_at: '2025-06-01T00:00:00.000Z',
        cwd: '/tmp',
      }),
    ).toThrow()
  })
})

// ═══════════════════════════════════════════════════
//  worker-state/worker-state-store.ts
// ═══════════════════════════════════════════════════

describe('worker-state/worker-state-store.ts', () => {
  let tmpCwd: string
  let store: WorkerStateStore

  beforeEach(() => {
    tmpCwd = join(tmpdir(), `wss-test-${randomUUID()}`)
    mkdirSync(tmpCwd, { recursive: true })
    store = new WorkerStateStore(tmpCwd)
  })

  afterEach(() => {
    rmSync(tmpCwd, { recursive: true, force: true })
  })

  it('path returns correct absolute path', () => {
    expect(store.path()).toContain(tmpCwd)
    expect(store.path()).toContain('.mcp-graph/worker-state.json')
  })

  it('read returns null when no file exists', () => {
    expect(store.read()).toBeNull()
  })

  it('write + read roundtrip succeeds', () => {
    const state = {
      worker_id: 'w1',
      session_ref: 's1',
      model: 'claude',
      permission_mode: 'read-only' as const,
      started_at: '2025-06-01T00:00:00.000Z',
      last_turn_at: '2025-06-01T01:00:00.000Z',
      cwd: tmpCwd,
    }
    store.write(state)
    const read = store.read()
    expect(read).not.toBeNull()
    expect(read!.worker_id).toBe('w1')
    expect(read!.model).toBe('claude')
  })

  it('read returns null on malformed JSON', () => {
    const dir = join(tmpCwd, '.mcp-graph')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'worker-state.json'), 'not json', 'utf-8')
    expect(store.read()).toBeNull()
  })

  it('read returns null on invalid schema', () => {
    const dir = join(tmpCwd, '.mcp-graph')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'worker-state.json'), JSON.stringify({ foo: 1 }), 'utf-8')
    expect(store.read()).toBeNull()
  })

  it('clear removes the file', () => {
    const state = {
      worker_id: 'w1',
      session_ref: 's1',
      model: 'm1',
      permission_mode: 'read-only' as const,
      started_at: '2025-06-01T00:00:00.000Z',
      last_turn_at: '2025-06-01T01:00:00.000Z',
      cwd: tmpCwd,
    }
    store.write(state)
    expect(store.read()).not.toBeNull()
    store.clear()
    expect(store.read()).toBeNull()
  })

  it('clear on absent file is noop', () => {
    expect(() => store.clear()).not.toThrow()
  })

  it('touchLastTurn updates last_turn_at', () => {
    const fixedNow = new Date('2025-12-31T23:59:59.000Z')
    const clockStore = new WorkerStateStore(tmpCwd, () => fixedNow)
    const state = {
      worker_id: 'w1',
      session_ref: 's1',
      model: 'm1',
      permission_mode: 'read-only' as const,
      started_at: '2025-06-01T00:00:00.000Z',
      last_turn_at: '2025-06-01T01:00:00.000Z',
      cwd: tmpCwd,
    }
    clockStore.write(state)
    const updated = clockStore.touchLastTurn()
    expect(updated).not.toBeNull()
    expect(updated!.last_turn_at).toBe(fixedNow.toISOString())
  })

  it('touchLastTurn returns null when no state exists', () => {
    expect(store.touchLastTurn()).toBeNull()
  })
})

// ═══════════════════════════════════════════════════
//  tests-rules/tests-rules-atomic.ts
// ═══════════════════════════════════════════════════

describe('tests-rules/tests-rules-atomic.ts', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `tr-test-${randomUUID()}`)
    mkdirSync(tmpDir, { recursive: true })
    clearRegistry()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    clearRegistry()
  })

  it('registerTestsRules registers the atomic file without throwing', () => {
    expect(() => registerTestsRules(tmpDir)).not.toThrow()
  })

  it('registerTestsRules is idempotent (ignores duplicate_file_id)', () => {
    registerTestsRules(tmpDir)
    expect(() => registerTestsRules(tmpDir)).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════
//  tests-rules/vitest-scaffold-atomic.ts
// ═══════════════════════════════════════════════════

describe('tests-rules/vitest-scaffold-atomic.ts', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vsa-test-${randomUUID()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('hasVitest', () => {
    it('returns true when vitest in devDependencies', () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }), 'utf-8')
      expect(hasVitest(tmpDir)).toBe(true)
    })

    it('returns true when vitest in dependencies', () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { vitest: '^1.0.0' } }), 'utf-8')
      expect(hasVitest(tmpDir)).toBe(true)
    })

    it('returns false without vitest', () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { mocha: '^10.0.0' } }), 'utf-8')
      expect(hasVitest(tmpDir)).toBe(false)
    })

    it('returns false without package.json', () => {
      expect(hasVitest(tmpDir)).toBe(false)
    })
  })

  describe('initVitestSmokeConfig', () => {
    it('creates vitest.smoke.config.ts when vitest is present', async () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }), 'utf-8')
      const r = await initVitestSmokeConfig(tmpDir)
      expect(r.status).toBe('created')
      expect(existsSync(join(tmpDir, 'vitest.smoke.config.ts'))).toBe(true)
    })

    it('noop when vitest is absent', async () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: {} }), 'utf-8')
      const r = await initVitestSmokeConfig(tmpDir)
      expect(r.status).toBe('noop')
    })

    it('noop when file already exists', async () => {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }), 'utf-8')
      writeFileSync(join(tmpDir, 'vitest.smoke.config.ts'), 'existing', 'utf-8')
      const r = await initVitestSmokeConfig(tmpDir)
      expect(r.status).toBe('noop')
    })
  })

  describe('mergeVitestScripts', () => {
    it('adds blast scripts when missing', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          devDependencies: { vitest: '^1.0.0' },
          scripts: { test: 'vitest run' },
        }),
        'utf-8',
      )
      const r = await mergeVitestScripts(tmpDir)
      expect(r.status).toBe('updated')
      const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
      expect(pkg.scripts['test:blast']).toBe('vitest run --changed HEAD --project=node')
      expect(pkg.scripts['test:smoke']).toBe('vitest run --config vitest.smoke.config.ts')
      // existing script preserved
      expect(pkg.scripts.test).toBe('vitest run')
    })

    it('noop when all scripts already exist', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          devDependencies: { vitest: '^1.0.0' },
          scripts: {
            test: 'vitest run',
            'test:blast': 'existing',
            'test:blast:full': 'existing',
            'test:node': 'existing',
            'test:smoke': 'existing',
            'test:clear': 'existing',
          },
        }),
        'utf-8',
      )
      const r = await mergeVitestScripts(tmpDir)
      expect(r.status).toBe('noop')
    })

    it('noop when vitest absent', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          devDependencies: {},
          scripts: {},
        }),
        'utf-8',
      )
      const r = await mergeVitestScripts(tmpDir)
      expect(r.status).toBe('noop')
    })
  })
})
