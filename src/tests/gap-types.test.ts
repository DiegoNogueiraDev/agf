import { describe, it, expect } from 'vitest'
import { GAP_KINDS } from '../core/gaps/gap-types.js'
import type { GapKind, EnrichmentAction, EnrichmentRequest, Gap } from '../core/gaps/gap-types.js'

describe('GAP_KINDS', () => {
  it('is a non-empty readonly array', () => {
    expect(GAP_KINDS.length).toBeGreaterThan(0)
    GAP_KINDS.forEach((kind) => expect(typeof kind).toBe('string'))
  })
})

describe('gap-types interfaces', () => {
  it('GapKind is one of the GAP_KINDS values', () => {
    const kind: GapKind = GAP_KINDS[0]!
    expect(GAP_KINDS).toContain(kind)
  })

  it('EnrichmentAction accepts known values', () => {
    const actions: EnrichmentAction[] = ['add_nodes', 'add_edges', 'rewrite_ac', 'clarify', 'decompose', 'annotate']
    expect(actions.length).toBe(6)
  })

  it('EnrichmentRequest has action, instruction, applyVia', () => {
    const req: EnrichmentRequest = {
      action: 'add_nodes',
      instruction: 'Add a subtask for edge case handling',
      applyVia: ['agf node add --type subtask --parent n-001'],
    }
    expect(req.action).toBe('add_nodes')
    expect(req.applyVia).toHaveLength(1)
  })

  it('Gap has required fields', () => {
    const gap: Gap = {
      kind: GAP_KINDS[0]!,
      severity: 'required',
      nodeId: 'n-001',
      evidence: 'Missing acceptance criteria',
    }
    expect(gap.kind).toBeDefined()
    expect(gap.severity).toBe('required')
    expect(gap.evidence).toBeDefined()
  })
})
