/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cost-Benefit Gate — Co-stimulation signal before response application.
 *
 * Bio foundation: Matzinger's Danger Model co-stimulation. In real immunology,
 * T-cells need a second (co-stimulatory) signal in addition to antigen
 * recognition before they activate. Without co-stimulation, the T-cell
 * becomes anergic (unresponsive).
 *
 * Here, the co-stimulation signal is economic: the expected value of a
 * response must exceed a threshold before we spend tokens to apply it.
 * Expected value = P(success) × impact_score / estimated_token_cost.
 *
 * Economics foundation: Charnov's Marginal Value Theorem (optimal foraging).
 * A forager should leave a patch when its marginal capture rate drops below
 * the environment average. Similarly, we should stop fixing when the
 * expected benefit drops below the token cost.
 */

import type {
  TCellResponse,
  Antigen,
  CostBenefitConfig,
  CostBenefitDecision,
  ImmuneMemoryEntry,
} from './immune-types.js'
import { DEFAULT_COST_BENEFIT_CONFIG } from './immune-types.js'

function estimateTokenCost(response: TCellResponse): { input: number; output: number; total: number } {
  const base = DEFAULT_COST_BENEFIT_CONFIG.baseTokenCost
  const perLine = DEFAULT_COST_BENEFIT_CONFIG.perLineTokenCost
  // Input tokens: context around target line; output tokens: the fix text
  const input = Math.round(base * 0.7) + perLine
  const output = Math.round(base * 0.3)
  void response
  return { input, output, total: input + output }
}

function lookupHistoricalSuccess(
  response: TCellResponse,
  memory: Map<string, ImmuneMemoryEntry[]>,
): ImmuneMemoryEntry[] {
  const entries = memory.get(response.targetFile) ?? []
  return entries.filter((e) => e.lastAction === response.actionKind)
}

function computePSuccess(matching: ImmuneMemoryEntry[]): number {
  if (matching.length === 0) return DEFAULT_COST_BENEFIT_CONFIG.minPSuccess
  const successes = matching.filter((e) => e.recoverySuccess).length
  return Math.max(DEFAULT_COST_BENEFIT_CONFIG.minPSuccess, successes / matching.length)
}

function computeImpactScore(response: TCellResponse, antigen: Antigen): number {
  const severityWeight: Record<string, number> = { low: 0.3, medium: 0.5, high: 0.8, critical: 1.0 }
  const base = severityWeight[antigen.severity] ?? 0.3
  const noveltyMultiplier = antigen.selfScore !== undefined ? 1 + (1 - antigen.selfScore) : 1.0
  return base * (1 + response.affinity * 0.5) * noveltyMultiplier
}

export function evaluateResponse(
  response: TCellResponse,
  antigen: Antigen | undefined,
  memory: Map<string, ImmuneMemoryEntry[]>,
  config: CostBenefitConfig = DEFAULT_COST_BENEFIT_CONFIG,
): CostBenefitDecision {
  const tokenCost = estimateTokenCost(response)
  const matching = lookupHistoricalSuccess(response, memory)
  const historicalSuccessRate = computePSuccess(matching)
  const impactScore = antigen ? computeImpactScore(response, antigen) : 0.3
  const expectedValue = (historicalSuccessRate * impactScore) / Math.max(tokenCost.total, 1)
  const passed = expectedValue >= config.expectedValueThreshold

  const reasons: string[] = []
  if (passed) {
    reasons.push(`EV ${expectedValue.toFixed(3)} >= threshold ${config.expectedValueThreshold}`)
  } else {
    reasons.push(`EV ${expectedValue.toFixed(3)} < threshold ${config.expectedValueThreshold}`)
  }
  if (historicalSuccessRate < config.minPSuccess) {
    reasons.push(`low historical success rate ${(historicalSuccessRate * 100).toFixed(0)}%`)
  }
  if (impactScore < 0.5) {
    reasons.push(`low impact score ${impactScore.toFixed(2)}`)
  }

  return {
    responseId: response.id,
    estimatedTokenCost: tokenCost.total,
    estimatedInputTokens: tokenCost.input,
    estimatedOutputTokens: tokenCost.output,
    historicalSuccessRate,
    impactScore,
    expectedValue,
    threshold: config.expectedValueThreshold,
    passed,
    reason: reasons.length > 0 ? reasons.join('; ') : 'default pass',
  }
}

export function applyCostBenefitGate(
  responses: TCellResponse[],
  antigens: Antigen[],
  memory: Map<string, ImmuneMemoryEntry[]>,
  config: CostBenefitConfig = DEFAULT_COST_BENEFIT_CONFIG,
): { passed: TCellResponse[]; gated: TCellResponse[]; decisions: CostBenefitDecision[] } {
  if (!config.enabled) {
    return {
      passed: responses,
      gated: [],
      decisions: responses.map((r) => ({
        responseId: r.id,
        estimatedTokenCost: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        historicalSuccessRate: 0,
        impactScore: 0,
        expectedValue: Infinity,
        threshold: 0,
        passed: true,
        reason: 'gate disabled',
      })),
    }
  }

  const passed: TCellResponse[] = []
  const gated: TCellResponse[] = []
  const decisions: CostBenefitDecision[] = []

  for (const response of responses) {
    const antigen = antigens.find((a) => a.id === response.antigenId)
    const decision = evaluateResponse(response, antigen, memory, config)
    decisions.push(decision)

    if (decision.passed) {
      passed.push(response)
    } else {
      response.actionKind = 'flag_for_review'
      response.description = `[gate:${decision.reason}] ${response.description}`
      gated.push(response)
    }
  }

  return { passed, gated, decisions }
}
