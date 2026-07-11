import { describe, it, expect } from 'vitest'
import { structuralBaselineEstimate } from '../core/rag-out/structural-baseline.js'
import type { ScaffoldDescriptor } from '../core/rag-out/gate.js'

function makeScaffold(id: string, slots: string[]): ScaffoldDescriptor {
  return { id, goal: `scaffold for ${id}`, fitTags: [id], slots, noveltyFloor: 0.5 }
}

describe('structuralBaselineEstimate', () => {
  it('returns a StructuralBaseline with baselineMethod=structural', () => {
    const b = structuralBaselineEstimate(makeScaffold('contract', ['route', 'method', 'body', 'response']))
    expect(b.baselineMethod).toBe('structural')
    expect(b.scaffoldId).toBe('contract')
  })

  it('baselineTokens = structureTokens + slotsEstimate', () => {
    const b = structuralBaselineEstimate(makeScaffold('prd', ['nome', 'problema', 'fases[]', 'metricas[]']))
    expect(b.baselineTokens).toBe(b.structureTokens + b.slotsEstimate)
  })

  it('actualTokens = slotsEstimate (structure was recovered, not generated)', () => {
    const b = structuralBaselineEstimate(makeScaffold('skill', ['skillName', 'phase', 'steps[]']))
    expect(b.actualTokens).toBe(b.slotsEstimate)
  })

  it('saved = baselineTokens - actualTokens', () => {
    const b = structuralBaselineEstimate(makeScaffold('cli', ['projectName', 'commands[]', 'version']))
    expect(b.saved).toBe(b.baselineTokens - b.actualTokens)
  })

  it('saved > 0 when scaffold has non-trivial structure', () => {
    const b = structuralBaselineEstimate(makeScaffold('contract', ['route', 'method', 'body']))
    expect(b.saved).toBeGreaterThan(0)
  })

  it('more slots → higher slotsEstimate and baselineTokens', () => {
    const few = structuralBaselineEstimate(makeScaffold('a', ['slot1']))
    const many = structuralBaselineEstimate(makeScaffold('b', ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']))
    expect(many.slotsEstimate).toBeGreaterThan(few.slotsEstimate)
    expect(many.baselineTokens).toBeGreaterThan(few.baselineTokens)
  })

  it('custom tokensPerSlot scales slotsEstimate proportionally', () => {
    const s = makeScaffold('x', ['a', 'b', 'c'])
    const b10 = structuralBaselineEstimate(s, { tokensPerSlot: 10 })
    const b30 = structuralBaselineEstimate(s, { tokensPerSlot: 30 })
    expect(b30.slotsEstimate).toBe(b10.slotsEstimate * 3)
  })

  it('empty slots scaffold has zero slotsEstimate but non-zero structure', () => {
    const b = structuralBaselineEstimate(makeScaffold('template', []))
    expect(b.slotsEstimate).toBe(0)
    expect(b.structureTokens).toBeGreaterThan(0)
  })

  it('honesty: saved is never negative', () => {
    const b = structuralBaselineEstimate(makeScaffold('x', []))
    expect(b.saved).toBeGreaterThanOrEqual(0)
  })
})
