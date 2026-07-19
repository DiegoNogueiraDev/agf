/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-5.T05 — Sona router (kNN routing for agent selection).
 *
 * Decides which agent to route a task to based on past PerfRecord history.
 *   - Cold-start (< MIN_SAMPLES_FOR_KNN): returns 'manual' fallback so the
 *     operator picks; we don't gamble routing under-sampled.
 *   - Warm: scores each agent by composite of harnessDelta (positive),
 *     acPassRate, and inverse cycle time. Returns the highest scorer + an
 *     explain() trace.
 *
 * Pure module; performance-tracker (E5.T02) feeds the records.
 */

import type { AgentStats, PerfRecord } from './performance-tracker.js'
import { aggregatePerformance } from './performance-tracker.js'

export const MIN_SAMPLES_FOR_KNN = 5
export const MANUAL_FALLBACK = 'manual'

const W_HARNESS = 0.5
const W_AC_PASS = 0.3
const W_CYCLE_INVERSE = 0.2

export interface RouteDecision {
  agentId: string
  score: number
  reason: 'cold-start' | 'scored' | 'tie-break'
  sampleCount: number
  fallback: boolean
}

export interface RouteExplanation {
  decision: RouteDecision
  contributions: Array<{
    agentId: string
    score: number
    breakdown: {
      harnessDelta: number
      acPassRate: number
      cycleInverse: number
    }
  }>
}

/** Score one agent on the composite formula. Higher = better. */
export function scoreAgent(stats: AgentStats): {
  score: number
  breakdown: { harnessDelta: number; acPassRate: number; cycleInverse: number }
} {
  // Cycle inverse: shorter cycle → higher score; cap to avoid divide-by-tiny.
  const cycleInverse = stats.meanCycleTimeMs > 0 ? 1000 / stats.meanCycleTimeMs : 0
  const breakdown = {
    harnessDelta: stats.meanHarnessDelta,
    acPassRate: stats.acPassRate,
    cycleInverse,
  }
  const score =
    W_HARNESS * breakdown.harnessDelta +
    W_AC_PASS * breakdown.acPassRate +
    W_CYCLE_INVERSE * Math.min(1, breakdown.cycleInverse)
  return { score, breakdown }
}

/**
 * Route a task. Cold-start returns the manual fallback when too few records;
 * warm path picks the highest scorer (with deterministic id tie-break).
 */
export function routeTask(records: PerfRecord[]): RouteDecision {
  if (records.length < MIN_SAMPLES_FOR_KNN) {
    return {
      agentId: MANUAL_FALLBACK,
      score: 0,
      reason: 'cold-start',
      sampleCount: records.length,
      fallback: true,
    }
  }
  const stats = aggregatePerformance(records)
  if (stats.length === 0) {
    return {
      agentId: MANUAL_FALLBACK,
      score: 0,
      reason: 'cold-start',
      sampleCount: 0,
      fallback: true,
    }
  }
  const scored = stats.map((s) => ({ stats: s, ...scoreAgent(s) }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.stats.agentId.localeCompare(b.stats.agentId)
  })
  const winner = scored[0]
  const tied = scored.length > 1 && scored[1].score === winner.score
  return {
    agentId: winner.stats.agentId,
    score: winner.score,
    reason: tied ? 'tie-break' : 'scored',
    sampleCount: records.length,
    fallback: false,
  }
}

/** Full breakdown for the explain() action of MCP tool 'learning'. */
export function explainRouting(records: PerfRecord[]): RouteExplanation {
  const decision = routeTask(records)
  if (decision.fallback) {
    return { decision, contributions: [] }
  }
  const stats = aggregatePerformance(records)
  return {
    decision,
    contributions: stats.map((s) => {
      const { score, breakdown } = scoreAgent(s)
      return { agentId: s.agentId, score, breakdown }
    }),
  }
}
