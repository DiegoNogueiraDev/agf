import { describe, it, expect } from 'vitest'
import { assessMitigationLevel, assessTechRisks } from '../core/designer/tech-risk-assessor.js'

type GraphDocument = Parameters<typeof assessTechRisks>[0]

const emptyDoc: GraphDocument = { nodes: [], edges: [] }

function makeRiskDoc(): GraphDocument {
  return {
    nodes: [
      {
        id: 'r1',
        title: 'Security Risk',
        type: 'risk',
        description: 'auth vulnerability injection',
        priority: 1,
        tags: ['security'],
      },
      { id: 'r2', title: 'Performance Risk', type: 'risk', description: 'latency bottleneck', priority: 3, tags: [] },
    ] as any[],
    edges: [],
  }
}

describe('assessMitigationLevel', () => {
  it('returns unmitigated when no mitigation edges exist', () => {
    const doc: GraphDocument = { nodes: [{ id: 'r1', type: 'risk', title: 'Risk' } as any], edges: [] }
    const result = assessMitigationLevel(doc, { id: 'r1' })
    expect(result).toBe('unmitigated')
  })

  it('returns partially_mitigated when metadata.mitigation is set', () => {
    const doc: GraphDocument = {
      nodes: [{ id: 'r1', type: 'risk', title: 'Risk', metadata: { mitigation: 'Add rate limiting' } } as any],
      edges: [],
    }
    const result = assessMitigationLevel(doc, { id: 'r1', metadata: { mitigation: 'Add rate limiting' } })
    expect(result).toBe('partially_mitigated')
  })
})

describe('assessTechRisks', () => {
  it('returns empty risks for empty doc', () => {
    const report = assessTechRisks(emptyDoc)
    expect(report.risks).toHaveLength(0)
    expect(report.inferredRisks).toHaveLength(0)
    expect(report.riskScore).toBe(0)
    expect(report.highRisks).toHaveLength(0)
  })

  it('processes explicit risk nodes', () => {
    const report = assessTechRisks(makeRiskDoc())
    expect(report.risks.length).toBeGreaterThan(0)
  })

  it('each risk has required fields', () => {
    const report = assessTechRisks(makeRiskDoc())
    for (const risk of report.risks) {
      expect(typeof risk.nodeId).toBe('string')
      expect(typeof risk.category).toBe('string')
      expect(typeof risk.score).toBe('number')
      expect(typeof risk.mitigated).toBe('boolean')
    }
  })

  it('infers complexity risk from high fan-out nodes', () => {
    const nodes = [
      { id: 'hub', title: 'Hub', type: 'task' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `dep${i}`, title: `Dep ${i}`, type: 'task' })),
    ]
    const edges = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      from: 'hub',
      to: `dep${i}`,
      relationType: 'depends_on',
    }))
    const doc: GraphDocument = { nodes: nodes as any[], edges: edges as any[] }
    const report = assessTechRisks(doc)
    expect(report.inferredRisks.length).toBeGreaterThan(0)
  })
})
