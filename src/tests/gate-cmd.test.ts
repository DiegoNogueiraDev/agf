import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { readDeployOptions, runGate, type GateReport } from '../cli/commands/gate-cmd.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

describe('readDeployOptions', () => {
  it('returns hasSnapshots/knowledgeCount computed from the store', () => {
    const store = {
      listSnapshots: () => [{ id: 's1' }],
      getDb: () => ({
        prepare: () => ({ get: () => ({ count: 3 }) }),
      }),
    }
    expect(readDeployOptions(store as never)).toEqual({ hasSnapshots: true, knowledgeCount: 3 })
  })

  it('rejects a corrupted negative knowledgeCount instead of passing it through silently', () => {
    const store = {
      listSnapshots: () => [],
      getDb: () => ({
        prepare: () => ({ get: () => ({ count: -1 }) }),
      }),
    }
    expect(() => readDeployOptions(store as never)).toThrow(z.ZodError)
  })
})

function emptyDoc(): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: [],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('runGate design scope options', () => {
  const store = { toGraphDocument: () => emptyDoc() }

  it('includes traceability, coupling and harness checks by default', () => {
    const report = runGate(store, 'design') as GateReport
    const names = report.checks.map((c) => c.name)
    expect(names).toContain('traceability_coverage')
    expect(names).toContain('traceability_full_chain')
    expect(names).toContain('no_isolated_nodes')
    expect(names).toContain('harness_minimum')
  })

  it('skips traceability checks when includeTraceability is false', () => {
    const report = runGate(store, 'design', { designOptions: { includeTraceability: false } }) as GateReport
    const names = report.checks.map((c) => c.name)
    expect(names).not.toContain('traceability_coverage')
    expect(names).not.toContain('traceability_full_chain')
  })

  it('skips the coupling check when includeCoupling is false', () => {
    const report = runGate(store, 'design', { designOptions: { includeCoupling: false } }) as GateReport
    expect(report.checks.map((c) => c.name)).not.toContain('no_isolated_nodes')
  })

  it('skips the harness check when scope is incremental', () => {
    const report = runGate(store, 'design', { designOptions: { scope: 'incremental' } }) as GateReport
    expect(report.checks.map((c) => c.name)).not.toContain('harness_minimum')
  })
})

describe('runGate review options', () => {
  const store = { toGraphDocument: () => emptyDoc() }

  it('includes the harness_grade_minimum check by default', () => {
    const report = runGate(store, 'review') as GateReport
    expect(report.checks.map((c) => c.name)).toContain('harness_grade_minimum')
  })

  it('skips the harness_grade_minimum check when reviewOptions.includeHarness is false', () => {
    const report = runGate(store, 'review', { reviewOptions: { includeHarness: false } }) as GateReport
    expect(report.checks.map((c) => c.name)).not.toContain('harness_grade_minimum')
  })

  it('honors reviewOptions.minCompletionRate for the completion_rate check', () => {
    const report = runGate(store, 'review', { reviewOptions: { minCompletionRate: 0 } }) as GateReport
    const check = report.checks.find((c) => c.name === 'completion_rate')
    expect(check?.passed).toBe(true)
  })
})

describe("runGate 'next' — lifecycle-pipeline advisory", () => {
  it('recommends import_prd on an empty graph', () => {
    const store = { toGraphDocument: () => emptyDoc() }
    const report = runGate(store, 'next') as GateReport
    expect(report.ready).toBe(true)
    expect(report.checks[0]?.details).toContain('import_prd')
  })

  it('recommends analyze_prd once requirement/epic nodes exist', () => {
    const doc = emptyDoc()
    doc.nodes.push({
      id: 'n1',
      type: 'requirement',
      title: 'r1',
      status: 'backlog',
      createdAt: '',
      updatedAt: '',
    } as GraphDocument['nodes'][number])
    const store = { toGraphDocument: () => doc }
    const report = runGate(store, 'next') as GateReport
    expect(report.checks[0]?.details).toContain('analyze_prd')
  })

  it('is always advisory (ready=true) — never blocks the pipeline', () => {
    const store = { toGraphDocument: () => emptyDoc() }
    const report = runGate(store, 'next', { currentPhase: 'LISTENING' }) as GateReport
    expect(report.ready).toBe(true)
  })
})
