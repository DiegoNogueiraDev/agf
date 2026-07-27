/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeEdge(id: string, from: string, to: string, overrides?: Partial<GraphEdge>): GraphEdge {
  return {
    id,
    from,
    to,
    relationType: 'depends_on',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[] = [], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1.0.0',
    project: { id: 'p1', name: 'test', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function createMockStore(doc?: GraphDocument): SqliteStore {
  const d = doc ?? makeDoc()
  const nodes = [...d.nodes]
  const edges = [...d.edges]
  return {
    toGraphDocument: () => d,
    getNodeById: (id: string) => d.nodes.find((n) => n.id === id) ?? null,
    insertNode: vi.fn(),
    insertEdge: vi.fn(),
    updateNode: vi.fn(),
    getAllNodes: () => nodes,
    getAllEdges: () => edges,
  } as unknown as SqliteStore
}

// =============================================================================
// 1. auto-decompose.ts
// =============================================================================

describe('auto-decompose', () => {
  describe('persistDecomposition', () => {
    it('should insert subtask nodes and edges', async () => {
      const { persistDecomposition } = await import('../core/planner/auto-decompose.js')
      const store = createMockStore()
      const result = {
        parentId: 'p1',
        subtasks: [
          {
            title: 'Sub 1',
            type: 'subtask' as const,
            acceptanceCriteria: ['AC1'],
            estimateMinutes: 30,
            suggestedTestType: 'unit' as const,
          },
          {
            title: 'Sub 2',
            type: 'subtask' as const,
            acceptanceCriteria: ['AC2'],
            estimateMinutes: 60,
            suggestedTestType: 'integration' as const,
          },
        ],
        edges: [{ from: 'p1_sub_0', to: 'p1_sub_1', relation: 'depends_on' as const }],
        rationale: 'test',
      }
      const output = persistDecomposition(store, result)
      expect(output.createdNodeIds).toHaveLength(2)
      expect(output.createdEdgeCount).toBe(1)
    })
  })

  describe('autoDecomposeLarge', () => {
    it('should skip non-L/XL tasks', async () => {
      const { autoDecomposeLarge } = await import('../core/planner/auto-decompose.js')
      const doc = makeDoc([makeNode('n1', { xpSize: 'S', acceptanceCriteria: ['AC1', 'AC2'] })])
      const store = createMockStore(doc)
      const report = autoDecomposeLarge(store)
      expect(report.decomposed).toHaveLength(0)
      expect(report.skipped).toHaveLength(0)
    })

    it('should skip L/XL tasks with insufficient ACs', async () => {
      const { autoDecomposeLarge } = await import('../core/planner/auto-decompose.js')
      const doc = makeDoc([makeNode('n1', { xpSize: 'L', acceptanceCriteria: ['AC1'] })])
      const store = createMockStore(doc)
      const report = autoDecomposeLarge(store, { minAcs: 2 })
      expect(report.skipped).toHaveLength(1)
      expect(report.skipped[0].reason).toBe('insufficient_acs')
    })

    it('should skip tasks that already have children', async () => {
      const { autoDecomposeLarge } = await import('../core/planner/auto-decompose.js')
      const doc = makeDoc([
        makeNode('n1', { xpSize: 'L', type: 'task', acceptanceCriteria: ['AC1', 'AC2'] }),
        makeNode('child', { type: 'subtask', parentId: 'n1' }),
      ])
      const store = createMockStore(doc)
      const report = autoDecomposeLarge(store)
      expect(report.skipped).toHaveLength(1)
      expect(report.skipped[0].reason).toBe('has_children')
    })
  })
})

// =============================================================================
// 2. auto-ready.ts
// =============================================================================

describe('analyzeAutoReady', () => {
  it('should return empty report when no backlog tasks', async () => {
    const { analyzeAutoReady } = await import('../core/planner/auto-ready.js')
    const doc = makeDoc()
    const report = analyzeAutoReady(doc)
    expect(report.totalCandidates).toBe(0)
    expect(report.candidates).toHaveLength(0)
  })

  it('should skip tasks without sprint', async () => {
    const { analyzeAutoReady } = await import('../core/planner/auto-ready.js')
    const doc = makeDoc([makeNode('n1', { status: 'backlog', acceptanceCriteria: ['AC1'] })])
    const report = analyzeAutoReady(doc)
    expect(report.totalCandidates).toBe(0)
  })

  it('should skip tasks without AC', async () => {
    const { analyzeAutoReady } = await import('../core/planner/auto-ready.js')
    const doc = makeDoc([makeNode('n1', { status: 'backlog', sprint: 'S1' })])
    const report = analyzeAutoReady(doc)
    expect(report.totalCandidates).toBe(0)
  })

  it('should skip tasks with unresolved dependencies', async () => {
    const { analyzeAutoReady } = await import('../core/planner/auto-ready.js')
    const doc = makeDoc(
      [
        makeNode('n1', { status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'] }),
        makeNode('n2', { status: 'backlog' }),
      ],
      [makeEdge('e1', 'n1', 'n2')],
    )
    const report = analyzeAutoReady(doc)
    expect(report.totalCandidates).toBe(0)
  })

  it('should promote tasks meeting all criteria', async () => {
    const { analyzeAutoReady } = await import('../core/planner/auto-ready.js')
    const doc = makeDoc(
      [
        makeNode('n1', { status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'] }),
        makeNode('n2', { status: 'done' }),
      ],
      [makeEdge('e1', 'n1', 'n2')],
    )
    const report = analyzeAutoReady(doc)
    expect(report.totalCandidates).toBe(1)
    expect(report.candidates[0].nodeId).toBe('n1')
  })

  it('should exclude blocked tasks', async () => {
    const { analyzeAutoReady } = await import('../core/planner/auto-ready.js')
    const doc = makeDoc([
      makeNode('n1', { status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'], blocked: true }),
    ])
    const report = analyzeAutoReady(doc)
    expect(report.totalCandidates).toBe(0)
  })
})

// =============================================================================
// 3. cycle-repair.ts
// =============================================================================

describe('repairCycles', () => {
  it('should return none_needed when no cycles exist', async () => {
    const { repairCycles } = await import('../core/planner/cycle-repair.js')
    const doc = makeDoc([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2')])
    const result = repairCycles(doc)
    expect(result.action).toBe('none_needed')
    expect(result.cycles).toHaveLength(0)
  })

  it('should auto-apply 2-node cycles (high confidence)', async () => {
    const { repairCycles } = await import('../core/planner/cycle-repair.js')
    const doc = makeDoc(
      [makeNode('n1'), makeNode('n2')],
      [
        makeEdge('e1', 'n1', 'n2', { createdAt: '2024-01-02T00:00:00.000Z' }),
        makeEdge('e2', 'n2', 'n1', { createdAt: '2024-01-01T00:00:00.000Z' }),
      ],
    )
    const result = repairCycles(doc)
    expect(result.cycles).toHaveLength(1)
    expect(result.autoApplied).toHaveLength(1)
    expect(result.autoApplied[0].confidence).toBe('high')
    expect(result.action).toBe('auto_applied')
  })

  it('should propose but not auto-apply 3+ node cycles (medium confidence)', async () => {
    const { repairCycles } = await import('../core/planner/cycle-repair.js')
    const doc = makeDoc(
      [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      [
        makeEdge('e1', 'n1', 'n2', { createdAt: '2024-01-01T00:00:00.000Z' }),
        makeEdge('e2', 'n2', 'n3', { createdAt: '2024-01-02T00:00:00.000Z' }),
        makeEdge('e3', 'n3', 'n1', { createdAt: '2024-01-03T00:00:00.000Z' }),
      ],
    )
    const result = repairCycles(doc)
    expect(result.cycles).toHaveLength(1)
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].confidence).toBe('medium')
    expect(result.action).toBe('proposals')
  })
})

// =============================================================================
// 4. decompose.ts
// =============================================================================

describe('detectLargeTasks', () => {
  it('should detect tasks with large estimates', async () => {
    const { detectLargeTasks } = await import('../core/planner/decompose.js')
    const doc = makeDoc([makeNode('n1', { estimateMinutes: 180 })])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
    expect(results[0].reasons[0]).toContain('180min')
  })

  it('should detect L/XL tasks', async () => {
    const { detectLargeTasks } = await import('../core/planner/decompose.js')
    const doc = makeDoc([makeNode('n1', { xpSize: 'XL' })])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
    expect(results[0].reasons.some((r) => r.includes('XL'))).toBe(true)
  })

  it('should detect tasks with many ACs', async () => {
    const { detectLargeTasks } = await import('../core/planner/decompose.js')
    const doc = makeDoc([makeNode('n1', { acceptanceCriteria: ['AC1', 'AC2', 'AC3', 'AC4', 'AC5', 'AC6'] })])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
  })

  it('should skip done tasks', async () => {
    const { detectLargeTasks } = await import('../core/planner/decompose.js')
    const doc = makeDoc([makeNode('n1', { status: 'done', xpSize: 'XL' })])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(0)
  })

  it('should return empty for small tasks', async () => {
    const { detectLargeTasks } = await import('../core/planner/decompose.js')
    const doc = makeDoc([makeNode('n1', { xpSize: 'S', estimateMinutes: 30 })])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(0)
  })
})

// =============================================================================
// 5. dependency-chain.ts
// =============================================================================

describe('dependency-chain', () => {
  describe('findTransitiveBlockers', () => {
    it('should find direct depends_on blockers', async () => {
      const { findTransitiveBlockers } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2')])
      const blockers = findTransitiveBlockers(doc, 'n1')
      expect(blockers).toHaveLength(1)
      expect(blockers[0].id).toBe('n2')
    })

    it('should find transitive blocks edges', async () => {
      const { findTransitiveBlockers } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2', { relationType: 'blocks' })])
      const blockers = findTransitiveBlockers(doc, 'n2')
      expect(blockers).toHaveLength(1)
      expect(blockers[0].id).toBe('n1')
    })

    it('should find transitive (nested) blockers', async () => {
      const { findTransitiveBlockers } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc(
        [makeNode('n1'), makeNode('n2'), makeNode('n3')],
        [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')],
      )
      const blockers = findTransitiveBlockers(doc, 'n1')
      expect(blockers).toHaveLength(2)
    })

    it('should return empty array for node with no blockers', async () => {
      const { findTransitiveBlockers } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc([makeNode('n1')])
      const blockers = findTransitiveBlockers(doc, 'n1')
      expect(blockers).toHaveLength(0)
    })
  })

  describe('detectCycles', () => {
    it('should detect 2-node cycle', async () => {
      const { detectCycles } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n1')])
      const cycles = detectCycles(doc)
      expect(cycles.length).toBeGreaterThan(0)
    })

    it('should return empty for DAG', async () => {
      const { detectCycles } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc(
        [makeNode('n1'), makeNode('n2'), makeNode('n3')],
        [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')],
      )
      const cycles = detectCycles(doc)
      expect(cycles).toHaveLength(0)
    })

    it('should handle blocks edges in cycle detection', async () => {
      const { detectCycles } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc(
        [makeNode('n1'), makeNode('n2')],
        [
          makeEdge('e1', 'n1', 'n2', { relationType: 'depends_on' }),
          // blocks adjacency is reversed: from→to becomes to→from
          makeEdge('e2', 'n1', 'n2', { relationType: 'blocks' }),
        ],
      )
      const cycles = detectCycles(doc)
      expect(cycles.length).toBeGreaterThan(0)
    })
  })

  describe('findCriticalPath', () => {
    it('should find the longest dependency path', async () => {
      const { findCriticalPath } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc(
        [
          makeNode('n1', { estimateMinutes: 30 }),
          makeNode('n2', { estimateMinutes: 60 }),
          makeNode('n3', { estimateMinutes: 90 }),
        ],
        [makeEdge('e1', 'n2', 'n1'), makeEdge('e2', 'n3', 'n2')],
      )
      const path = findCriticalPath(doc)
      expect(path.length).toBeGreaterThanOrEqual(2)
    })

    it('should return empty for single node', async () => {
      const { findCriticalPath } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc([makeNode('n1')])
      const path = findCriticalPath(doc)
      expect(path).toHaveLength(0)
    })

    it('should return empty when cycles are present', async () => {
      const { findCriticalPath } = await import('../core/planner/dependency-chain.js')
      const doc = makeDoc([makeNode('n1'), makeNode('n2')], [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n1')])
      const path = findCriticalPath(doc)
      expect(path).toHaveLength(0)
    })
  })
})

// =============================================================================
// 6. invest-validator.ts
// =============================================================================

describe('validateInvest', () => {
  it('should pass valid INVEST candidate', async () => {
    const { validateInvest } = await import('../core/planner/invest-validator.js')
    const result = validateInvest({
      title: 'Test',
      xpSize: 'S',
      acceptanceCriteria: ['GIVEN x WHEN y THEN z'],
    })
    expect(result.passed).toBe(true)
    expect(result.rejectedReasons).toHaveLength(0)
  })

  it('should fail candidate without AC (Valuable)', async () => {
    const { validateInvest } = await import('../core/planner/invest-validator.js')
    const result = validateInvest({
      title: 'Test',
      xpSize: 'S',
      acceptanceCriteria: [],
    })
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Valuable'))).toBe(true)
  })

  it('should fail candidate without xpSize (Estimable)', async () => {
    const { validateInvest } = await import('../core/planner/invest-validator.js')
    const result = validateInvest({
      title: 'Test',
      acceptanceCriteria: ['AC1'],
    })
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Estimable'))).toBe(true)
  })

  it('should fail L/XL candidate (Small)', async () => {
    const { validateInvest } = await import('../core/planner/invest-validator.js')
    const result = validateInvest({
      title: 'Test',
      xpSize: 'XL',
      acceptanceCriteria: ['AC1'],
    })
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Small'))).toBe(true)
  })

  it('should warn when no AC contains GIVEN/WHEN/THEN/should (Testable)', async () => {
    const { validateInvest } = await import('../core/planner/invest-validator.js')
    const result = validateInvest({
      title: 'Test',
      xpSize: 'M',
      acceptanceCriteria: ['implement feature'],
    })
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Testable'))).toBe(true)
  })
})

// =============================================================================
// 7. lifecycle-facade.ts
// =============================================================================

describe('runLifecycleFacade', () => {
  it('should aggregate outputs for a phase', async () => {
    const { runLifecycleFacade } = await import('../core/planner/lifecycle-facade.js')
    const result = await runLifecycleFacade(async (mode) => ({ ok: true, payload: { [mode]: 'ok' } }), 'DESIGN')
    expect(result.ok).toBe(true)
    expect(result.modes.length).toBeGreaterThan(0)
    expect(result.outputs).toBeDefined()
  })

  it('should return no_modes_for_phase warning for empty phase', async () => {
    const { runLifecycleFacade } = await import('../core/planner/lifecycle-facade.js')
    const result = await runLifecycleFacade(async (mode) => ({ ok: true, payload: { mode } }), 'UNKNOWN' as never)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.code === 'no_modes_for_phase')).toBe(true)
  })

  it('should run a single subCheck mode', async () => {
    const { runLifecycleFacade } = await import('../core/planner/lifecycle-facade.js')
    const result = await runLifecycleFacade(async (mode) => ({ ok: true, payload: { data: mode } }), 'DESIGN', 'adr')
    expect(result.modes).toEqual(['adr'])
  })

  it('should emit mode_unknown warning for invalid subCheck', async () => {
    const { runLifecycleFacade } = await import('../core/planner/lifecycle-facade.js')
    const result = await runLifecycleFacade(
      async (mode) => ({ ok: true, payload: { mode } }),
      'DESIGN',
      'nonexistent_mode',
    )
    expect(result.warnings.some((w) => w.code === 'mode_unknown')).toBe(true)
    expect(result.modes).toHaveLength(0)
  })

  it('should aggregate errors for failed modes', async () => {
    const { runLifecycleFacade } = await import('../core/planner/lifecycle-facade.js')
    const result = await runLifecycleFacade(
      async (mode) => (mode === 'adr' ? { ok: false, error: 'ADR failed' } : { ok: true, payload: { mode } }),
      'DESIGN',
    )
    expect(result.ok).toBe(false)
    expect(Object.keys(result.errors).length).toBeGreaterThan(0)
  })
})

// =============================================================================
// 8. lifecycle-phase.ts
// =============================================================================

describe('lifecycle-phase', () => {
  describe('detectCurrentPhase', () => {
    it('should return ANALYZE for empty graph', async () => {
      const { detectCurrentPhase } = await import('../core/planner/lifecycle-phase.js')
      expect(detectCurrentPhase(makeDoc())).toBe('ANALYZE')
    })

    it('should respect manual phase override', async () => {
      const { detectCurrentPhase } = await import('../core/planner/lifecycle-phase.js')
      expect(detectCurrentPhase(makeDoc(), { phaseOverride: 'DEPLOY' })).toBe('DEPLOY')
    })

    it('should return IMPLEMENT when tasks are in_progress', async () => {
      const { detectCurrentPhase } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([makeNode('n1', { type: 'task', status: 'in_progress', sprint: 'S1' })])
      expect(detectCurrentPhase(doc)).toBe('IMPLEMENT')
    })

    it('should return REVIEW when all tasks are done', async () => {
      const { detectCurrentPhase } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([makeNode('n1', { type: 'task', status: 'done' })])
      expect(detectCurrentPhase(doc)).toBe('REVIEW')
    })

    it('should return PLAN when no sprints assigned', async () => {
      const { detectCurrentPhase } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([makeNode('n1', { type: 'task', status: 'backlog' })])
      expect(detectCurrentPhase(doc)).toBe('PLAN')
    })

    it('should return VALIDATE when ≥50% tasks done', async () => {
      const { detectCurrentPhase } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([
        makeNode('n1', { type: 'task', status: 'done', sprint: 'S1' }),
        makeNode('n2', { type: 'task', status: 'backlog', sprint: 'S1' }),
      ])
      expect(detectCurrentPhase(doc)).toBe('VALIDATE')
    })
  })

  describe('getModesForPhase', () => {
    it('should return modes for DESIGN', async () => {
      const { getModesForPhase } = await import('../core/planner/lifecycle-phase.js')
      const modes = getModesForPhase('DESIGN')
      expect(modes).toContain('adr')
      expect(modes).toContain('interfaces')
    })

    it('should return empty for unknown phase', async () => {
      const { getModesForPhase } = await import('../core/planner/lifecycle-phase.js')
      expect(getModesForPhase('UNKNOWN' as never)).toHaveLength(0)
    })

    it('should return fresh array each call', async () => {
      const { getModesForPhase } = await import('../core/planner/lifecycle-phase.js')
      const a = getModesForPhase('PLAN')
      const b = getModesForPhase('PLAN')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('validatePhaseTransition', () => {
    it('should allow transitions without defined gates', async () => {
      const { validatePhaseTransition } = await import('../core/planner/lifecycle-phase.js')
      const result = validatePhaseTransition(makeDoc(), 'ANALYZE', 'PLAN')
      expect(result.allowed).toBe(true)
    })

    it('should gate ANALYZE→DESIGN based on epics', async () => {
      const { validatePhaseTransition } = await import('../core/planner/lifecycle-phase.js')
      const result = validatePhaseTransition(makeDoc(), 'ANALYZE', 'DESIGN')
      expect(result.allowed).toBe(false)
      expect(result.unmetConditions.length).toBeGreaterThan(0)
    })

    it('should allow ANALYZE→DESIGN when epics exist', async () => {
      const { validatePhaseTransition } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([
        {
          id: 'e1',
          type: 'epic',
          title: 'Epic',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        } as GraphNode,
      ])
      const result = validatePhaseTransition(doc, 'ANALYZE', 'DESIGN')
      expect(result.allowed).toBe(true)
    })

    it('should gate PLAN→IMPLEMENT on sprints', async () => {
      const { validatePhaseTransition } = await import('../core/planner/lifecycle-phase.js')
      const result = validatePhaseTransition(makeDoc(), 'PLAN', 'IMPLEMENT')
      expect(result.allowed).toBe(false)
    })
  })

  describe('checkToolGate', () => {
    it('should allow exempt tools in any phase', async () => {
      const { checkToolGate } = await import('../core/planner/lifecycle-phase.js')
      const warnings = checkToolGate(makeDoc(), 'ANALYZE', 'list')
      expect(warnings).toHaveLength(0)
    })

    it('should block phase-mismatched tools in strict mode', async () => {
      const { checkToolGate } = await import('../core/planner/lifecycle-phase.js')
      const warnings = checkToolGate(makeDoc(), 'ANALYZE', 'update_status')
      expect(warnings.length).toBeGreaterThan(0)
    })
  })

  describe('checkStatusGate', () => {
    it('should warn when done without AC in IMPLEMENT', async () => {
      const { checkStatusGate } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([makeNode('n1', { status: 'in_progress' })])
      const result = checkStatusGate(doc, 'IMPLEMENT', 'n1', 'done')
      expect(result.warnings.some((w) => w.code === 'done_without_acceptance_criteria')).toBe(true)
    })

    it('should warn done without in_progress status', async () => {
      const { checkStatusGate } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([makeNode('n1', { status: 'backlog' })])
      const result = checkStatusGate(doc, 'IMPLEMENT', 'n1', 'done')
      expect(result.warnings.some((w) => w.code === 'done_without_in_progress')).toBe(true)
    })

    it('should warn about in_progress without sprint in PLAN', async () => {
      const { checkStatusGate } = await import('../core/planner/lifecycle-phase.js')
      const doc = makeDoc([makeNode('n1', { type: 'task', status: 'backlog' })])
      const result = checkStatusGate(doc, 'PLAN', 'n1', 'in_progress')
      expect(result.warnings.some((w) => w.code === 'in_progress_without_sprint')).toBe(true)
    })
  })
})

// =============================================================================
// 9. next-override-tracker.ts
// =============================================================================

describe('next-override-tracker', () => {
  describe('recordNextOverride', () => {
    it('should insert a row into the database', async () => {
      const { recordNextOverride } = await import('../core/planner/next-override-tracker.js')
      const db = { prepare: vi.fn(() => ({ run: vi.fn() })) } as never
      recordNextOverride(db, {
        projectId: 'p1',
        suggestionId: 's1',
        actualId: 'a1',
        timestamp: '2024-01-01T00:00:00.000Z',
      })
      expect(db.prepare).toHaveBeenCalled()
    })
  })

  describe('analyzeNextPolicyAudit', () => {
    it('should return healthy when no overrides', async () => {
      const { analyzeNextPolicyAudit } = await import('../core/planner/next-override-tracker.js')
      const db = {
        prepare: vi.fn(() => ({ all: vi.fn(() => []) })),
      } as never
      const report = analyzeNextPolicyAudit(db, 'p1')
      expect(report.status).toBe('healthy')
      expect(report.overrides).toBe(0)
    })

    it('should catch db errors gracefully', async () => {
      const { analyzeNextPolicyAudit } = await import('../core/planner/next-override-tracker.js')
      const db = {
        prepare: vi.fn(() => {
          throw new Error('no table')
        }),
      } as never
      const report = analyzeNextPolicyAudit(db, 'p1')
      expect(report.status).toBe('healthy')
    })

    it('should detect priority override patterns', async () => {
      const { analyzeNextPolicyAudit } = await import('../core/planner/next-override-tracker.js')
      const overrides = Array.from({ length: 6 }, (_, i) => ({
        suggestion_id: `s${i}`,
        actual_id: `a${i}`,
        suggestion_priority: 1,
        actual_priority: 4,
        suggestion_tags: null,
      }))
      const db = {
        prepare: vi.fn(() => ({ all: vi.fn(() => overrides) })),
      } as never
      const report = analyzeNextPolicyAudit(db, 'p1')
      expect(report.status).toBe('unhealthy')
      expect(report.patterns).toBeDefined()
      expect(report.patterns![0].pattern).toBe('priority_override')
    })
  })
})

// =============================================================================
// 10. next-task.ts
// =============================================================================

describe('findNextTask', () => {
  it('should throw on invalid document', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    expect(() => findNextTask(null as never)).toThrow()
  })

  it('should return null when no eligible tasks', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc()
    const result = findNextTask(doc)
    expect(result).toBeNull()
  })

  it('should return the highest-priority unblocked task', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc([
      makeNode('n1', { priority: 3, status: 'backlog' }),
      makeNode('n2', { priority: 1, status: 'backlog' }),
    ])
    const result = findNextTask(doc)
    expect(result).not.toBeNull()
    expect(result!.node.id).toBe('n2')
  })

  it('should skip blocked tasks', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc([makeNode('n1', { status: 'blocked' }), makeNode('n2', { status: 'backlog', priority: 1 })])
    const result = findNextTask(doc)
    expect(result!.node.id).toBe('n2')
  })

  it('should skip tasks with unresolved dependencies', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc(
      [makeNode('n1', { status: 'backlog' }), makeNode('n2', { status: 'backlog' })],
      [makeEdge('e1', 'n1', 'n2')],
    )
    const result = findNextTask(doc)
    expect(result).not.toBeNull()
    expect(result!.node.id).toBe('n2') // n2 has no deps
  })

  it('should warn all_tasks_blocked when everything has unresolved deps', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc(
      [makeNode('n1', { status: 'backlog' }), makeNode('n2', { status: 'backlog' })],
      [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n1')],
    )
    const result = findNextTask(doc)
    expect(result!.warning).toBe('all_tasks_blocked')
  })

  it('should exclude locked tasks when provided', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc([
      makeNode('n1', { priority: 1, status: 'backlog' }),
      makeNode('n2', { priority: 2, status: 'backlog' }),
    ])
    const result = findNextTask(doc, { lockedTaskIds: new Set(['n1']) })
    expect(result!.node.id).toBe('n2')
  })

  it('should prefer smaller XP sizes when priority equal', async () => {
    const { findNextTask } = await import('../core/planner/next-task.js')
    const doc = makeDoc([
      makeNode('n1', { priority: 3, xpSize: 'XL', status: 'backlog' }),
      makeNode('n2', { priority: 3, xpSize: 'S', status: 'backlog' }),
    ])
    const result = findNextTask(doc)
    expect(result!.node.id).toBe('n2')
  })
})

// =============================================================================
// 11. reclassify-structural.ts
// =============================================================================

describe('reclassify-structural', () => {
  describe('findStructuralCandidates', () => {
    it('should detect TIER heading nodes', async () => {
      const { findStructuralCandidates } = await import('../core/planner/reclassify-structural.js')
      const doc = makeDoc([makeNode('n1', { title: 'TIER A — Implementation' })])
      const candidates = findStructuralCandidates(doc)
      expect(candidates).toHaveLength(1)
      expect(candidates[0].reason).toContain('TIER')
    })

    it('should detect parenthetical count nodes', async () => {
      const { findStructuralCandidates } = await import('../core/planner/reclassify-structural.js')
      const doc = makeDoc([makeNode('n1', { title: 'Tasks (3 items)' })])
      const candidates = findStructuralCandidates(doc)
      expect(candidates).toHaveLength(1)
    })

    it('should detect Sequenciamento heading', async () => {
      const { findStructuralCandidates } = await import('../core/planner/reclassify-structural.js')
      const doc = makeDoc([makeNode('n1', { title: 'Sequenciamento (4 sprints)' })])
      const candidates = findStructuralCandidates(doc)
      expect(candidates).toHaveLength(1)
    })

    it('should ignore regular task titles', async () => {
      const { findStructuralCandidates } = await import('../core/planner/reclassify-structural.js')
      const doc = makeDoc([makeNode('n1', { title: 'Implement login feature' })])
      const candidates = findStructuralCandidates(doc)
      expect(candidates).toHaveLength(0)
    })
  })

  describe('reclassifyStructural', () => {
    it('should find candidates in dry-run mode (apply=false)', async () => {
      const { reclassifyStructural } = await import('../core/planner/reclassify-structural.js')
      const doc = makeDoc([makeNode('n1', { title: 'TIER A — Something' })])
      const store = createMockStore(doc)
      const report = reclassifyStructural(doc, store, { apply: false })
      expect(report.totalCandidates).toBe(1)
      expect(report.applied).toBe(0)
    })

    it('should apply implementable=false metadata in write mode', async () => {
      const { reclassifyStructural } = await import('../core/planner/reclassify-structural.js')
      const doc = makeDoc([makeNode('n1', { title: 'TIER A — Something' })])
      const store = createMockStore(doc)
      const report = reclassifyStructural(doc, store, { apply: true })
      expect(report.totalCandidates).toBe(1)
    })
  })
})

// =============================================================================
// 12. replan-analyzer.ts
// =============================================================================

describe('analyzeReplanSuggest', () => {
  it('should return healthy when no sprints exist', async () => {
    const { analyzeReplanSuggest } = await import('../core/planner/replan-analyzer.js')
    const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) } as never
    const doc = makeDoc()
    const report = analyzeReplanSuggest(doc, db)
    expect(report.healthStatus).toBe('healthy')
    expect(report.proposals).toHaveLength(0)
  })

  it('should detect parent-blocking patterns', async () => {
    const { analyzeReplanSuggest } = await import('../core/planner/replan-analyzer.js')
    const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) } as never
    const doc = makeDoc(
      [
        makeNode('n1', { type: 'task', status: 'backlog', sprint: 'S1' }),
        makeNode('n2', { type: 'task', status: 'backlog', sprint: 'S1' }),
        makeNode('n3', { type: 'task', status: 'backlog', sprint: 'S1' }),
        makeNode('blocker', { type: 'task', status: 'backlog' }),
      ],
      [makeEdge('e1', 'n1', 'blocker'), makeEdge('e2', 'n2', 'blocker'), makeEdge('e3', 'n3', 'blocker')],
    )
    const report = analyzeReplanSuggest(doc, db, 'S1')
    expect(report.healthStatus).toBe('unhealthy')
    expect(report.proposals.some((p) => p.action === 'break_dependency')).toBe(true)
  })

  it('should catch db errors gracefully when querying changelog', async () => {
    const { analyzeReplanSuggest } = await import('../core/planner/replan-analyzer.js')
    const db = {
      prepare: vi.fn(() => {
        throw new Error('no table')
      }),
    } as never
    const doc = makeDoc([makeNode('n1', { type: 'task', status: 'done', sprint: 'S1' })])
    const report = analyzeReplanSuggest(doc, db, 'S1')
    expect(report.healthStatus).toBe('healthy')
  })
})

// =============================================================================
// 13. smart-decompose.ts
// =============================================================================

describe('smart-decompose', () => {
  describe('smartDecompose', () => {
    it('should return null for missing node', async () => {
      const { smartDecompose } = await import('../core/planner/smart-decompose.js')
      const store = createMockStore()
      vi.spyOn(store, 'getNodeById').mockReturnValue(null)
      expect(smartDecompose(store, 'nonexistent')).toBeNull()
    })

    it('should return null for node without AC', async () => {
      const { smartDecompose } = await import('../core/planner/smart-decompose.js')
      const doc = makeDoc([makeNode('n1')])
      const store = createMockStore(doc)
      expect(smartDecompose(store, 'n1')).toBeNull()
    })

    it('should decompose ACs into subtasks (1 AC = 1 subtask)', async () => {
      const { smartDecompose } = await import('../core/planner/smart-decompose.js')
      const doc = makeDoc([makeNode('n1', { acceptanceCriteria: ['AC1', 'AC2', 'AC3'] })])
      const store = createMockStore(doc)
      const result = smartDecompose(store, 'n1')
      expect(result).not.toBeNull()
      expect(result!.subtasks).toHaveLength(3)
      expect(result!.edges).toHaveLength(2)
    })

    it('should infer test types from AC keywords', async () => {
      const { smartDecompose } = await import('../core/planner/smart-decompose.js')
      const doc = makeDoc([
        makeNode('n1', {
          acceptanceCriteria: ['Unit logic should work', 'API endpoint should respond', 'Page should render correctly'],
        }),
      ])
      const store = createMockStore(doc)
      const result = smartDecompose(store, 'n1')
      expect(result!.subtasks[0].suggestedTestType).toBe('unit')
      expect(result!.subtasks[1].suggestedTestType).toBe('integration')
      expect(result!.subtasks[2].suggestedTestType).toBe('e2e')
    })
  })

  describe('smartDecomposeWithInvest', () => {
    it('should return null for non-L/XL tasks', async () => {
      const { smartDecomposeWithInvest } = await import('../core/planner/smart-decompose.js')
      const doc = makeDoc([makeNode('n1', { xpSize: 'S' })])
      const store = createMockStore(doc)
      expect(smartDecomposeWithInvest(store, 'n1')).toBeNull()
    })

    it('should generate placeholder children when no AC exists', async () => {
      const { smartDecomposeWithInvest } = await import('../core/planner/smart-decompose.js')
      const doc = makeDoc([makeNode('n1', { xpSize: 'L' })])
      const store = createMockStore(doc)
      const result = smartDecomposeWithInvest(store, 'n1')
      expect(result).not.toBeNull()
      expect(result!.accepted.length).toBeGreaterThan(0)
    })
  })

  describe('shouldSuggestDecomposition', () => {
    it('should return true for L size with AC and no children', async () => {
      const { shouldSuggestDecomposition } = await import('../core/planner/smart-decompose.js')
      expect(shouldSuggestDecomposition('L', 3, 0)).toBe(true)
    })

    it('should return false for S size', async () => {
      const { shouldSuggestDecomposition } = await import('../core/planner/smart-decompose.js')
      expect(shouldSuggestDecomposition('S', 3, 0)).toBe(false)
    })

    it('should return false when child tasks exist', async () => {
      const { shouldSuggestDecomposition } = await import('../core/planner/smart-decompose.js')
      expect(shouldSuggestDecomposition('L', 3, 2)).toBe(false)
    })
  })
})

// =============================================================================
// 14. sprint-health.ts
// =============================================================================

describe('analyzeSprintHealth', () => {
  it('should return healthy for empty sprint', async () => {
    const { analyzeSprintHealth } = await import('../core/planner/sprint-health.js')
    const doc = makeDoc()
    const report = analyzeSprintHealth(doc, 'S1')
    expect(report.health).toBe('healthy')
  })

  it('should compute basic metrics for a sprint', async () => {
    const { analyzeSprintHealth } = await import('../core/planner/sprint-health.js')
    const doc = makeDoc([
      makeNode('n1', { type: 'task', status: 'done', sprint: 'S1', xpSize: 'S' }),
      makeNode('n2', { type: 'task', status: 'backlog', sprint: 'S1', xpSize: 'M' }),
    ])
    const report = analyzeSprintHealth(doc, 'S1')
    expect(report.metrics.taskCount).toBe(2)
    expect(report.metrics.doneCount).toBe(1)
    expect(report.metrics.burndownRatio).toBe(0.5)
  })

  it('should return critical when blocked > 30%', async () => {
    const { analyzeSprintHealth } = await import('../core/planner/sprint-health.js')
    const doc = makeDoc([
      makeNode('n1', { type: 'task', status: 'blocked', sprint: 'S1' }),
      makeNode('n2', { type: 'task', status: 'blocked', sprint: 'S1' }),
      makeNode('n3', { type: 'task', status: 'backlog', sprint: 'S1' }),
    ])
    const report = analyzeSprintHealth(doc, 'S1')
    expect(report.health).toBe('critical')
  })

  it('should detect tasks without AC', async () => {
    const { analyzeSprintHealth } = await import('../core/planner/sprint-health.js')
    const doc = makeDoc([makeNode('n1', { type: 'task', status: 'backlog', sprint: 'S1' })])
    const report = analyzeSprintHealth(doc, 'S1')
    expect(report.metrics.tasksWithoutAC).toBe(1)
    expect(report.warnings.some((w) => w.includes('without acceptance criteria'))).toBe(true)
  })

  it('should exclude structural tasks from counts', async () => {
    const { analyzeSprintHealth } = await import('../core/planner/sprint-health.js')
    const doc = makeDoc([
      makeNode('n1', {
        type: 'task',
        status: 'backlog',
        sprint: 'S1',
        metadata: { implementable: false },
      }),
    ])
    const report = analyzeSprintHealth(doc, 'S1')
    expect(report.metrics.taskCount).toBe(0)
    expect(report.metrics.structuralCount).toBe(1)
  })
})

// =============================================================================
// 15. task-prefetcher.ts
// =============================================================================

describe('TaskPrefetcher', () => {
  it('should store and retrieve prefetched context', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 300000 })
    prefetcher.prefetch('n1', { query: 'test', context: 'context data' })
    const result = prefetcher.get('n1')
    expect(result).not.toBeNull()
    expect(result!.context).toBe('context data')
  })

  it('should return null for uncached nodes', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 300000 })
    expect(prefetcher.get('nonexistent')).toBeNull()
  })

  it('should expire entries after TTL', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 0 })
    prefetcher.prefetch('n1', { query: 'test', context: 'data' })
    await new Promise((r) => setTimeout(r, 10))
    expect(prefetcher.get('n1')).toBeNull()
  })

  it('should invalidate cache on mismatch', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 300000 })
    prefetcher.prefetch('n1', { query: 'test', context: 'data' })
    prefetcher.invalidateIfMismatch('n2')
    expect(prefetcher.get('n1')).toBeNull()
  })

  it('should not invalidate on match', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 300000 })
    prefetcher.prefetch('n1', { query: 'test', context: 'data' })
    prefetcher.invalidateIfMismatch('n1')
    expect(prefetcher.get('n1')).not.toBeNull()
  })

  it('should track hit/miss stats', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 300000 })
    prefetcher.prefetch('n1', { query: 'test', context: 'data' })
    prefetcher.get('n1')
    prefetcher.get('n2')
    const stats = prefetcher.getStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
  })

  it('should clear all entries', async () => {
    const { TaskPrefetcher } = await import('../core/planner/task-prefetcher.js')
    const prefetcher = new TaskPrefetcher({ ttlMs: 300000 })
    prefetcher.prefetch('n1', { query: 'test', context: 'data' })
    prefetcher.clear()
    expect(prefetcher.getStats().size).toBe(0)
  })
})

// =============================================================================
// 16. tdd-enforcement.ts
// =============================================================================

describe('checkTddEnforcement', () => {
  it('should return no violations when mode is off', async () => {
    const { checkTddEnforcement } = await import('../core/planner/tdd-enforcement.js')
    const result = checkTddEnforcement({
      touchedFiles: ['src/foo.ts'],
      commitHistory: [],
      mode: 'off',
    })
    expect(result.blocked).toBe(false)
    expect(result.violations).toHaveLength(0)
  })

  it('should exempt declarative files', async () => {
    const { checkTddEnforcement, DEFAULT_DECLARATIVE_WHITELIST } = await import('../core/planner/tdd-enforcement.js')
    const result = checkTddEnforcement({
      touchedFiles: ['src/types.ts'],
      commitHistory: [],
      mode: 'strict',
      declarativeWhitelist: DEFAULT_DECLARATIVE_WHITELIST,
    })
    expect(result.exempted).toHaveLength(1)
    expect(result.violations).toHaveLength(0)
  })

  it('should detect violations when no test commits precede code', async () => {
    const { checkTddEnforcement } = await import('../core/planner/tdd-enforcement.js')
    const result = checkTddEnforcement({
      touchedFiles: ['src/core/foo.ts'],
      commitHistory: [{ hash: 'aaa', timestamp: '2024-01-02T00:00:00.000Z', files: ['src/core/foo.ts'] }],
      mode: 'strict',
    })
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]).toBe('src/core/foo.ts')
  })

  it('should pass when test commit precedes code', async () => {
    const { checkTddEnforcement } = await import('../core/planner/tdd-enforcement.js')
    const result = checkTddEnforcement({
      touchedFiles: ['src/core/foo.ts'],
      commitHistory: [
        { hash: 'aaa', timestamp: '2024-01-01T00:00:00.000Z', files: ['src/tests/foo.test.ts'] },
        { hash: 'bbb', timestamp: '2024-01-02T00:00:00.000Z', files: ['src/core/foo.ts'] },
      ],
      mode: 'strict',
    })
    expect(result.violations).toHaveLength(0)
  })

  it('should warn when test is in same commit as code', async () => {
    const { checkTddEnforcement } = await import('../core/planner/tdd-enforcement.js')
    const result = checkTddEnforcement({
      touchedFiles: ['src/core/foo.ts'],
      commitHistory: [
        { hash: 'aaa', timestamp: '2024-01-01T00:00:00.000Z', files: ['src/core/foo.ts', 'src/tests/foo.test.ts'] },
      ],
      mode: 'strict',
    })
    expect(result.violations).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
  })

  it('should block in strict mode when violations exist', async () => {
    const { checkTddEnforcement } = await import('../core/planner/tdd-enforcement.js')
    const result = checkTddEnforcement({
      touchedFiles: ['src/core/foo.ts'],
      commitHistory: [{ hash: 'aaa', timestamp: '2024-01-01T00:00:00.000Z', files: ['src/core/foo.ts'] }],
      mode: 'strict',
    })
    expect(result.blocked).toBe(true)
  })
})

// =============================================================================
// 17. touched-files.ts
// =============================================================================

describe('touched-files', () => {
  describe('getTouchedFiles', () => {
    it('should return empty array when metadata is missing', async () => {
      const { getTouchedFiles } = await import('../core/planner/touched-files.js')
      expect(getTouchedFiles(makeNode('n1'))).toHaveLength(0)
    })

    it('should return empty array when touchedFiles is not an array', async () => {
      const { getTouchedFiles } = await import('../core/planner/touched-files.js')
      const node = makeNode('n1', { metadata: { touchedFiles: 'not-an-array' } as never })
      expect(getTouchedFiles(node)).toHaveLength(0)
    })

    it('should return the file paths when present', async () => {
      const { getTouchedFiles } = await import('../core/planner/touched-files.js')
      const node = makeNode('n1', { metadata: { touchedFiles: ['src/a.ts', 'src/b.ts'] } as never })
      const files = getTouchedFiles(node)
      expect(files).toEqual(['src/a.ts', 'src/b.ts'])
    })

    it('should cap at TOUCHED_FILES_CAP entries', async () => {
      const { getTouchedFiles } = await import('../core/planner/touched-files.js')
      const files = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`)
      const node = makeNode('n1', { metadata: { touchedFiles: files } as never })
      expect(getTouchedFiles(node)).toHaveLength(20)
    })

    it('should filter out non-string entries', async () => {
      const { getTouchedFiles } = await import('../core/planner/touched-files.js')
      const node = makeNode('n1', {
        metadata: { touchedFiles: ['src/a.ts', 123, 'src/b.ts'] } as never,
      })
      expect(getTouchedFiles(node)).toEqual(['src/a.ts', 'src/b.ts'])
    })
  })

  describe('haveFileOverlap', () => {
    it('should return overlapping files', async () => {
      const { haveFileOverlap } = await import('../core/planner/touched-files.js')
      expect(haveFileOverlap(['a.ts', 'b.ts'], ['b.ts', 'c.ts'])).toEqual(['b.ts'])
    })

    it('should return empty for disjoint arrays', async () => {
      const { haveFileOverlap } = await import('../core/planner/touched-files.js')
      expect(haveFileOverlap(['a.ts'], ['b.ts'])).toHaveLength(0)
    })
  })
})

// =============================================================================
// 18. validation.ts
// =============================================================================

describe('planner validation schemas', () => {
  describe('validateNextTaskInput', () => {
    it('should accept valid input', async () => {
      const { validateNextTaskInput } = await import('../core/planner/validation.js')
      const result = validateNextTaskInput({ lockedTaskIds: ['t1', 't2'], agentId: 'agent-1' })
      expect(result.lockedTaskIds).toEqual(['t1', 't2'])
    })

    it('should accept empty input', async () => {
      const { validateNextTaskInput } = await import('../core/planner/validation.js')
      const result = validateNextTaskInput({})
      expect(result).toBeDefined()
    })

    it('should reject non-string agentId', async () => {
      const { validateNextTaskInput } = await import('../core/planner/validation.js')
      expect(() => validateNextTaskInput({ agentId: 123 })).toThrow()
    })
  })

  describe('validateSprintPlanInput', () => {
    it('should accept valid input', async () => {
      const { validateSprintPlanInput } = await import('../core/planner/validation.js')
      const result = validateSprintPlanInput({ sprintName: 'S1', maxTasks: 10, targetVelocity: 20 })
      expect(result.sprintName).toBe('S1')
    })

    it('should reject empty sprint name', async () => {
      const { validateSprintPlanInput } = await import('../core/planner/validation.js')
      expect(() => validateSprintPlanInput({ sprintName: '' })).toThrow()
    })
  })
})

// =============================================================================
// 19. velocity.ts
// =============================================================================

describe('velocity', () => {
  describe('calculateVelocity', () => {
    it('should return empty summary for no tasks', async () => {
      const { calculateVelocity } = await import('../core/planner/velocity.js')
      const doc = makeDoc()
      const result = calculateVelocity(doc)
      expect(result.sprints).toHaveLength(0)
      expect(result.overall.totalTasksCompleted).toBe(0)
    })

    it('should group done tasks by sprint', async () => {
      const { calculateVelocity } = await import('../core/planner/velocity.js')
      const doc = makeDoc([
        makeNode('n1', { type: 'task', status: 'done', sprint: 'S1', xpSize: 'M' }),
        makeNode('n2', { type: 'task', status: 'done', sprint: 'S1', xpSize: 'S' }),
        makeNode('n3', { type: 'task', status: 'done', sprint: 'S2', xpSize: 'L' }),
      ])
      const result = calculateVelocity(doc)
      expect(result.sprints).toHaveLength(2)
      const s1 = result.sprints.find((s) => s.sprint === 'S1')
      expect(s1).toBeDefined()
      expect(s1!.tasksCompleted).toBe(2)
      expect(s1!.totalPoints).toBeGreaterThan(0)
    })

    it('should compute avg completion hours from timestamps', async () => {
      const { calculateVelocity } = await import('../core/planner/velocity.js')
      const doc = makeDoc([
        makeNode('n1', {
          type: 'task',
          status: 'done',
          sprint: 'S1',
          createdAt: '2024-01-01T10:00:00.000Z',
          updatedAt: '2024-01-01T14:00:00.000Z',
        }),
      ])
      const result = calculateVelocity(doc)
      expect(result.sprints[0].avgCompletionHours).toBe(4)
    })

    it('should filter by sprintId', async () => {
      const { calculateVelocity } = await import('../core/planner/velocity.js')
      const doc = makeDoc([
        makeNode('n1', { type: 'task', status: 'done', sprint: 'S1', xpSize: 'M' }),
        makeNode('n2', { type: 'task', status: 'done', sprint: 'S2', xpSize: 'M' }),
      ])
      const result = calculateVelocity(doc, { sprintId: 'S1' })
      expect(result.sprints).toHaveLength(1)
      expect(result.sprints[0].sprint).toBe('S1')
    })
  })

  describe('applyDoraAdjustment', () => {
    it('should return base velocity unchanged when metrics are null', async () => {
      const { applyDoraAdjustment } = await import('../core/planner/velocity.js')
      const result = applyDoraAdjustment(100, null)
      expect(result.adjustedVelocity).toBe(100)
      expect(result.appliedMultiplier).toBe(1)
    })

    it('should apply MTTR penalty', async () => {
      const { applyDoraAdjustment } = await import('../core/planner/velocity.js')
      const result = applyDoraAdjustment(100, { mttrHours: 8, changeFailureRate: 0, deploymentFrequencyPerDay: 1 })
      expect(result.adjustedVelocity).toBe(85)
      expect(result.reasons.some((r) => r.includes('MTTR'))).toBe(true)
    })

    it('should apply CFR penalty', async () => {
      const { applyDoraAdjustment } = await import('../core/planner/velocity.js')
      const result = applyDoraAdjustment(100, { mttrHours: 1, changeFailureRate: 0.5, deploymentFrequencyPerDay: 1 })
      expect(result.adjustedVelocity).toBe(80)
      expect(result.reasons.some((r) => r.includes('CFR'))).toBe(true)
    })

    it('should apply deploy frequency penalty', async () => {
      const { applyDoraAdjustment } = await import('../core/planner/velocity.js')
      const result = applyDoraAdjustment(100, { mttrHours: 1, changeFailureRate: 0, deploymentFrequencyPerDay: 0.05 })
      expect(result.adjustedVelocity).toBe(90)
      expect(result.reasons.some((r) => r.includes('deployment'))).toBe(true)
    })

    it('should stack penalties multiplicatively', async () => {
      const { applyDoraAdjustment } = await import('../core/planner/velocity.js')
      const result = applyDoraAdjustment(100, { mttrHours: 8, changeFailureRate: 0.5, deploymentFrequencyPerDay: 0.05 })
      expect(result.appliedMultiplier).toBeCloseTo(0.612, 2)
    })
  })
})
