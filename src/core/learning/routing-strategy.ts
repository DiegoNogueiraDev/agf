/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-5.T06 — Delegate routing strategy.
 * Pure decision: given a routingStrategy + records, returns the chosen agent.
 *
 *   manual  (default) — caller picks; we return MANUAL_FALLBACK.
 *   sona    — kNN over PerfRecord history; falls back to manual when < 5.
 *   hybrid  — 50/50 blend: sona pick if confident, else manual.
 *
 * Backward compatibility: the manual path is identical to pre-E5 behavior.
 */

import type { PerfRecord } from './performance-tracker.js'
import { routeTask, MIN_SAMPLES_FOR_KNN, MANUAL_FALLBACK, type RouteDecision } from './sona-router.js'

export const ROUTING_STRATEGIES = ['manual', 'sona', 'hybrid'] as const
export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number]

export const HYBRID_CONFIDENT_SCORE = 1.0

/** isValidStrategy —  */
export function isValidStrategy(s: unknown): s is RoutingStrategy {
  return typeof s === 'string' && (ROUTING_STRATEGIES as readonly string[]).includes(s)
}

export interface DelegateRouteInput {
  strategy?: RoutingStrategy
  records: PerfRecord[]
}

export interface DelegateRouteDecision extends RouteDecision {
  strategy: RoutingStrategy
  notes?: string
}

function manualDecision(samples: number): DelegateRouteDecision {
  return {
    strategy: 'manual',
    agentId: MANUAL_FALLBACK,
    score: 0,
    reason: 'cold-start',
    sampleCount: samples,
    fallback: true,
  }
}

/** decideRoute —  */
export function decideRoute(input: DelegateRouteInput): DelegateRouteDecision {
  const strategy: RoutingStrategy = input.strategy ?? 'manual'

  if (strategy === 'manual') {
    return manualDecision(input.records.length)
  }

  const sonaResult = routeTask(input.records)

  if (strategy === 'sona') {
    return { ...sonaResult, strategy: 'sona' }
  }

  // Hybrid: use sona only when warm AND sufficiently confident.
  if (sonaResult.fallback) {
    return {
      ...manualDecision(input.records.length),
      strategy: 'hybrid',
      notes: 'hybrid:cold-fallback',
    }
  }
  if (sonaResult.score < HYBRID_CONFIDENT_SCORE) {
    return {
      ...manualDecision(input.records.length),
      strategy: 'hybrid',
      notes: `hybrid:low-confidence(score=${sonaResult.score.toFixed(2)})`,
    }
  }
  return { ...sonaResult, strategy: 'hybrid', notes: 'hybrid:sona-confident' }
}

export const MIN_SAMPLES_FOR_AUTO_ROUTE = MIN_SAMPLES_FOR_KNN
