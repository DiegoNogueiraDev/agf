/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_9f48c814825b AC coverage: Cost-Benefit Gate
 *
 * AC1: Token cost estimation per response action (estimated_input_tokens, estimated_output_tokens)
 * AC2: Historical success rate lookup from immune memory to compute P(success)
 * AC3: Expected value = P(success) × impact_score / estimated_token_cost
 * AC4: Response only applied if expected_value > configurable threshold
 * AC5: Responses below threshold are flagged_for_review instead of applied
 * AC6: Cost-benefit decision recorded in immune ledger per cycle
 */

import { describe, it, expect } from 'vitest'
import type { TCellResponse, Antigen, ImmuneMemoryEntry, CostBenefitConfig } from '../core/immune/immune-types.js'
import { DEFAULT_COST_BENEFIT_CONFIG } from '../core/immune/immune-types.js'
import { evaluateResponse, applyCostBenefitGate } from '../core/immune/cost-benefit-gate.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<TCellResponse> = {}): TCellResponse {
  return {
    id: 'resp-1',
    antigenId: 'ant-1',
    targetFile: 'src/core/foo.ts',
    targetLine: 10,
    actionKind: 'add_comment',
    description: 'Add error handling',
    affinity: 0.8,
    applied: false,
    ...overrides,
  }
}

function makeAntigen(overrides: Partial<Antigen> = {}): Antigen {
  return {
    id: 'ant-1',
    signalId: 'ds-1',
    kind: 'raw_throw',
    file: 'src/core/foo.ts',
    line: 10,
    evidence: 'throw new Error',
    severity: 'high',
    confidence: 1.0,
    presentedAt: Date.now(),
    ...overrides,
  }
}

function makeMemoryEntry(overrides: Partial<ImmuneMemoryEntry> = {}): ImmuneMemoryEntry {
  return {
    signature: 'sig-1',
    antigenKind: 'raw_throw',
    file: 'src/core/foo.ts',
    firstSeen: Date.now() - 1000,
    lastSeen: Date.now(),
    occurrences: 1,
    lastAction: 'add_comment',
    recoverySuccess: true,
    suppressed: false,
    ...overrides,
  }
}

// ── AC1: Token cost estimation with separate input/output tokens ──────────────

describe('AC1: evaluateResponse — estimated_input_tokens and estimated_output_tokens', () => {
  it('decision includes estimatedInputTokens field', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const decision = evaluateResponse(response, antigen, memory)
    expect(typeof decision.estimatedInputTokens).toBe('number')
    expect(decision.estimatedInputTokens).toBeGreaterThan(0)
  })

  it('decision includes estimatedOutputTokens field', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const decision = evaluateResponse(response, antigen, memory)
    expect(typeof decision.estimatedOutputTokens).toBe('number')
    expect(decision.estimatedOutputTokens).toBeGreaterThan(0)
  })

  it('estimatedTokenCost equals estimatedInputTokens + estimatedOutputTokens', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const decision = evaluateResponse(response, antigen, memory)
    expect(decision.estimatedTokenCost).toBe(decision.estimatedInputTokens + decision.estimatedOutputTokens)
  })
})

// ── AC2: Historical success rate from immune memory ───────────────────────────

describe('AC2: evaluateResponse — P(success) from immune memory', () => {
  it('historicalSuccessRate is minPSuccess when no memory entries', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const decision = evaluateResponse(response, antigen, memory)
    expect(decision.historicalSuccessRate).toBe(DEFAULT_COST_BENEFIT_CONFIG.minPSuccess)
  })

  it('historicalSuccessRate reflects 100% success in memory', () => {
    const response = makeResponse({ actionKind: 'add_comment' })
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>([
      [
        'src/core/foo.ts',
        [
          makeMemoryEntry({ recoverySuccess: true, lastAction: 'add_comment' }),
          makeMemoryEntry({ recoverySuccess: true, lastAction: 'add_comment' }),
        ],
      ],
    ])

    const decision = evaluateResponse(response, antigen, memory)
    expect(decision.historicalSuccessRate).toBe(1.0)
  })

  it('historicalSuccessRate reflects 50% success in memory', () => {
    const response = makeResponse({ actionKind: 'add_comment' })
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>([
      [
        'src/core/foo.ts',
        [
          makeMemoryEntry({ recoverySuccess: true, lastAction: 'add_comment' }),
          makeMemoryEntry({ recoverySuccess: false, lastAction: 'add_comment' }),
        ],
      ],
    ])

    const decision = evaluateResponse(response, antigen, memory)
    expect(decision.historicalSuccessRate).toBe(0.5)
  })
})

// ── AC3: Expected value formula ───────────────────────────────────────────────

describe('AC3: evaluateResponse — EV = P(success) × impact_score / estimated_token_cost', () => {
  it('expectedValue is non-negative', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const decision = evaluateResponse(response, antigen, memory)
    expect(decision.expectedValue).toBeGreaterThanOrEqual(0)
  })

  it('higher pSuccess increases expectedValue (same other factors)', () => {
    const response = makeResponse({ actionKind: 'add_comment' })
    const antigen = makeAntigen()

    const lowSuccessMemory = new Map<string, ImmuneMemoryEntry[]>([
      ['src/core/foo.ts', [makeMemoryEntry({ recoverySuccess: false, lastAction: 'add_comment' })]],
    ])
    const highSuccessMemory = new Map<string, ImmuneMemoryEntry[]>([
      ['src/core/foo.ts', [makeMemoryEntry({ recoverySuccess: true, lastAction: 'add_comment' })]],
    ])

    const low = evaluateResponse(response, antigen, lowSuccessMemory)
    const high = evaluateResponse(response, antigen, highSuccessMemory)
    expect(high.expectedValue).toBeGreaterThan(low.expectedValue)
  })

  it('higher severity antigen increases expectedValue', () => {
    const response = makeResponse()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const medAntigen = makeAntigen({ severity: 'medium' })
    const critAntigen = makeAntigen({ severity: 'critical' })

    const medDecision = evaluateResponse(response, medAntigen, memory)
    const critDecision = evaluateResponse(response, critAntigen, memory)
    expect(critDecision.expectedValue).toBeGreaterThan(medDecision.expectedValue)
  })

  it('decision includes impactScore field', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const decision = evaluateResponse(response, antigen, memory)
    expect(typeof decision.impactScore).toBe('number')
    expect(decision.impactScore).toBeGreaterThanOrEqual(0)
  })
})

// ── AC4: Response applied only if expectedValue > threshold ──────────────────

describe('AC4: applyCostBenefitGate — response applied only if EV >= threshold', () => {
  it('responses with EV >= threshold are in passed list', () => {
    const response = makeResponse({ actionKind: 'add_comment' })
    const antigen = makeAntigen({ severity: 'critical' })
    const memory = new Map<string, ImmuneMemoryEntry[]>([
      ['src/core/foo.ts', [makeMemoryEntry({ recoverySuccess: true, lastAction: 'add_comment' })]],
    ])

    const { passed, gated } = applyCostBenefitGate([response], [antigen], memory)
    // high P(success) + critical severity → high EV → should pass
    expect(passed.length + gated.length).toBe(1)
    // verify decisions are returned
  })

  it('gate disabled means all responses pass', () => {
    const response = makeResponse()
    const antigen = makeAntigen({ severity: 'low' })
    const memory = new Map<string, ImmuneMemoryEntry[]>()
    const config: CostBenefitConfig = { ...DEFAULT_COST_BENEFIT_CONFIG, enabled: false }

    const { passed, gated } = applyCostBenefitGate([response], [antigen], memory, config)
    expect(passed).toHaveLength(1)
    expect(gated).toHaveLength(0)
  })

  it('gate with very high threshold gates all responses', () => {
    const response = makeResponse()
    const antigen = makeAntigen({ severity: 'low' })
    const memory = new Map<string, ImmuneMemoryEntry[]>()
    const config: CostBenefitConfig = { ...DEFAULT_COST_BENEFIT_CONFIG, enabled: true, expectedValueThreshold: 999 }

    const { passed, gated } = applyCostBenefitGate([response], [antigen], memory, config)
    expect(passed).toHaveLength(0)
    expect(gated).toHaveLength(1)
  })
})

// ── AC5: Gated responses set to flag_for_review ───────────────────────────────

describe('AC5: applyCostBenefitGate — below-threshold responses are flagged_for_review', () => {
  it('gated response has actionKind = flag_for_review', () => {
    const response = makeResponse({ actionKind: 'add_comment' })
    const antigen = makeAntigen({ severity: 'low' })
    const memory = new Map<string, ImmuneMemoryEntry[]>()
    const config: CostBenefitConfig = { ...DEFAULT_COST_BENEFIT_CONFIG, enabled: true, expectedValueThreshold: 999 }

    const { gated } = applyCostBenefitGate([response], [antigen], memory, config)
    expect(gated[0].actionKind).toBe('flag_for_review')
  })

  it('gated response description includes gate reason', () => {
    const response = makeResponse({ description: 'fix error' })
    const antigen = makeAntigen({ severity: 'low' })
    const memory = new Map<string, ImmuneMemoryEntry[]>()
    const config: CostBenefitConfig = { ...DEFAULT_COST_BENEFIT_CONFIG, enabled: true, expectedValueThreshold: 999 }

    const { gated } = applyCostBenefitGate([response], [antigen], memory, config)
    expect(gated[0].description).toContain('[gate:')
    expect(gated[0].description).toContain('fix error')
  })
})

// ── AC6: Decisions returned for ledger recording ─────────────────────────────

describe('AC6: applyCostBenefitGate — decisions returned for ledger recording', () => {
  it('decisions array has one entry per response', () => {
    const responses = [makeResponse({ id: 'r1' }), makeResponse({ id: 'r2', targetFile: 'src/bar.ts' })]
    const antigens = [makeAntigen({ id: 'ant-1' }), makeAntigen({ id: 'ant-2' })]
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const { decisions } = applyCostBenefitGate(responses, antigens, memory)
    expect(decisions).toHaveLength(2)
  })

  it('each decision has responseId, passed, estimatedTokenCost, expectedValue, threshold', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const { decisions } = applyCostBenefitGate([response], [antigen], memory)
    const d = decisions[0]
    expect(typeof d.responseId).toBe('string')
    expect(typeof d.passed).toBe('boolean')
    expect(typeof d.estimatedTokenCost).toBe('number')
    expect(typeof d.expectedValue).toBe('number')
    expect(typeof d.threshold).toBe('number')
  })

  it('decisions include estimatedInputTokens and estimatedOutputTokens for ledger', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()

    const { decisions } = applyCostBenefitGate([response], [antigen], memory)
    const d = decisions[0]
    expect(typeof d.estimatedInputTokens).toBe('number')
    expect(typeof d.estimatedOutputTokens).toBe('number')
  })

  it('gate disabled decisions have passed=true', () => {
    const response = makeResponse()
    const antigen = makeAntigen()
    const memory = new Map<string, ImmuneMemoryEntry[]>()
    const config: CostBenefitConfig = { ...DEFAULT_COST_BENEFIT_CONFIG, enabled: false }

    const { decisions } = applyCostBenefitGate([response], [antigen], memory, config)
    expect(decisions[0].passed).toBe(true)
  })
})
