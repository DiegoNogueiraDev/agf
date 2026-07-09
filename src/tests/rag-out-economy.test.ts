import { describe, it, expect } from 'vitest'
import {
  estimateRagOutEconomy,
  toLeverEvent,
  scaffoldCostBreakdown,
  toLeverEventFromBreakdown,
  formatScaffoldRecoveryMessage,
} from '../core/rag-out/economy.js'
import type { RagOutDecision } from '../core/rag-out/gate.js'

const recovered: RagOutDecision = {
  decision: 'recover',
  goal: 'REST endpoint handler',
  confidence: 0.9,
  best: {
    id: 'contract',
    goal: 'REST handler',
    fitTags: ['rest'],
    slots: ['route', 'method', 'requestSchema', 'responseSchema'],
    noveltyFloor: 0.5,
  },
  candidates: [],
  reason: 'fit_above_bar',
}

const generated: RagOutDecision = {
  decision: 'generate',
  goal: 'a haiku',
  confidence: 0.1,
  best: null,
  candidates: [],
  reason: 'no_lexical_match',
}

describe('estimateRagOutEconomy', () => {
  it('reports positive savings on recover (structure not generated, only slots filled)', () => {
    const e = estimateRagOutEconomy(recovered)
    expect(e.lever).toBe('rag_out_recovery')
    expect(e.decision).toBe('recover')
    expect(e.baselineTokens).toBeGreaterThan(e.actualTokens)
    expect(e.saved).toBe(e.baselineTokens - e.actualTokens)
    expect(e.saved).toBeGreaterThan(0)
    expect(e.baselineMethod).toBe('structural')
  })

  it('reports zero savings on generate (nothing recovered)', () => {
    const e = estimateRagOutEconomy(generated)
    expect(e.decision).toBe('generate')
    expect(e.saved).toBe(0)
  })

  it('node_2adc99bdaf58: baseline scales with scaffold slot count (structuralBaselineEstimate), not a flat constant', () => {
    const small: RagOutDecision = {
      ...recovered,
      best: { ...recovered.best!, slots: ['route'] },
    }
    const large: RagOutDecision = {
      ...recovered,
      best: { ...recovered.best!, slots: ['route', 'method', 'requestSchema', 'responseSchema', 'headers', 'auth'] },
    }
    const eSmall = estimateRagOutEconomy(small)
    const eLarge = estimateRagOutEconomy(large)
    // A flat STRUCTURE_TOKENS constant would make baselineTokens grow only by
    // SLOT_FILL_TOKENS per slot; structuralBaselineEstimate also grows the
    // structure itself with slot count, so the gap must be more than linear
    // in slot count alone — i.e. the two scaffolds must NOT share a baseline
    // that only differs by (largeSlots - smallSlots) * a single constant.
    const slotDelta = large.best!.slots.length - small.best!.slots.length
    const naiveFlatDelta = slotDelta * 12 // old hardcoded SLOT_FILL_TOKENS
    expect(eLarge.baselineTokens - eSmall.baselineTokens).not.toBe(naiveFlatDelta)
  })
})

describe('toLeverEvent', () => {
  it('maps recover to an accepted rag_out_recovery event', () => {
    const ev = toLeverEvent(estimateRagOutEconomy(recovered), 'sess', 'node_y')
    expect(ev.lever).toBe('rag_out_recovery')
    expect(ev.nodeId).toBe('node_y')
    expect(ev.accepted).toBe(true)
    expect(ev.gateOutcome).toBe('accepted')
    expect(ev.tokensBefore - ev.tokensAfter).toBe(ev.saved)
  })

  it('maps generate to a passthrough event', () => {
    const ev = toLeverEvent(estimateRagOutEconomy(generated), 'sess')
    expect(ev.gateOutcome).toBe('passthrough')
    expect(ev.accepted).toBe(false)
    expect(ev.saved).toBe(0)
  })
})

describe('scaffoldCostBreakdown — PRD 2.3 cache pricing model', () => {
  it('without scaffold: all tokens are output price (2×)', () => {
    const b = scaffoldCostBreakdown({ structureTokens: 180, slotTokens: 48 })
    // baseline: (structure + slots) × output multiplier (2.0)
    expect(b.baselineCost).toBeCloseTo((180 + 48) * 2.0)
  })

  it('with scaffold (cached): structure at 0.5× input, slots at 2× output', () => {
    const b = scaffoldCostBreakdown({ structureTokens: 180, slotTokens: 48 })
    // recovered: structure × 0.5 (cache) + slots × 2.0 (output)
    expect(b.recoveredCost).toBeCloseTo(180 * 0.5 + 48 * 2.0)
  })

  it('savingsRatio > 0.5 for 70% structure (PRD 2.3 claim)', () => {
    // PRD says structure is 60-80% → savings should exceed 50% of total cost
    const b = scaffoldCostBreakdown({ structureTokens: 700, slotTokens: 300 })
    expect(b.savingsRatio).toBeGreaterThan(0.5)
  })

  it('savingsRatio = 0 when structureTokens = 0 (nothing to recover)', () => {
    const b = scaffoldCostBreakdown({ structureTokens: 0, slotTokens: 100 })
    expect(b.savingsRatio).toBe(0)
  })

  it('saved = baselineCost - recoveredCost', () => {
    const b = scaffoldCostBreakdown({ structureTokens: 180, slotTokens: 48 })
    expect(b.saved).toBeCloseTo(b.baselineCost - b.recoveredCost)
  })
})

describe('toLeverEventFromBreakdown — AC1+AC3 economy ledger wiring', () => {
  it('AC1: scaffold reuse → accepted lever event with positive saved', () => {
    const breakdown = scaffoldCostBreakdown({ structureTokens: 180, slotTokens: 48 })
    const ev = toLeverEventFromBreakdown(breakdown, 'sess_x', 'node_abc')
    expect(ev.lever).toBe('scaffold_recovery')
    expect(ev.accepted).toBe(true)
    expect(ev.gateOutcome).toBe('accepted')
    expect(ev.saved).toBeGreaterThan(0)
    expect(ev.tokensBefore).toBeGreaterThan(ev.tokensAfter)
    expect(ev.nodeId).toBe('node_abc')
  })

  it('AC3: no reuse (structureTokens=0) → passthrough event with saved=0', () => {
    const breakdown = scaffoldCostBreakdown({ structureTokens: 0, slotTokens: 100 })
    const ev = toLeverEventFromBreakdown(breakdown, 'sess_x')
    expect(ev.accepted).toBe(false)
    expect(ev.gateOutcome).toBe('passthrough')
    expect(ev.saved).toBe(0)
  })
})

describe('formatScaffoldRecoveryMessage — node_1103d0139ec1', () => {
  it("AC1: decision=recover with saved=180 → 'scaffold recovered: 180 tok saved'", () => {
    expect(formatScaffoldRecoveryMessage('recover', 180)).toBe('scaffold recovered: 180 tok saved')
  })

  it("AC3: decision=generate → undefined (no 'scaffold recovered' text)", () => {
    expect(formatScaffoldRecoveryMessage('generate', 0)).toBeUndefined()
  })

  it('decision=recover with saved=0 → undefined (nothing was actually recovered)', () => {
    expect(formatScaffoldRecoveryMessage('recover', 0)).toBeUndefined()
  })
})
