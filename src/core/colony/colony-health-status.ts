/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E5.1 — Colony health status with weighted score + breakdown.
 * Zero-LLM. Pure function.
 * Formula: score = harness*0.30 + tests*0.25 + dora*0.20 + knowledge*0.15 + pheromone*0.10
 */

import type { HealthGrade } from './colony-signals.js'

export type ColonyTrend = 'up' | 'stable' | 'down' | 'critical'

export interface ColonyHealthStatusInput {
  harnessScore: number // 0-100
  testPassRate: number // 0-100
  doraScore: number // 0-100
  knowledgeScore: number // 0-100
  pheromoneScore: number // 0-100
  quarantinedCount: number
  trend: ColonyTrend
}

export interface ColonyHealthStatus {
  score: number
  grade: HealthGrade
  trend: ColonyTrend
  breakdown: {
    harness: number
    tests: number
    dora: number
    knowledge: number
    pheromone: number
    quarantined: number
  }
}

export function gradeFromScore(score: number): HealthGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function buildColonyHealthStatus(input: ColonyHealthStatusInput): ColonyHealthStatus {
  const raw =
    input.harnessScore * 0.3 +
    input.testPassRate * 0.25 +
    input.doraScore * 0.2 +
    input.knowledgeScore * 0.15 +
    input.pheromoneScore * 0.1

  const score = Math.min(100, Math.max(0, Math.round(raw * 10) / 10))

  return {
    score,
    grade: gradeFromScore(score),
    trend: input.trend,
    breakdown: {
      harness: input.harnessScore,
      tests: input.testPassRate,
      dora: input.doraScore,
      knowledge: input.knowledgeScore,
      pheromone: input.pheromoneScore,
      quarantined: input.quarantinedCount,
    },
  }
}
