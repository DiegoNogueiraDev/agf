/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type Caste = 'TRAIL' | 'EXPLORE' | 'FUNGAL'
export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'
export type ModelTier = 'cheap' | 'build' | 'frontier'

export interface ColonySignals {
  caste: Caste
  colony_health_grade: HealthGrade
  active_pheromones: number
  quarantined_count: number
  suggested_model: ModelTier
}

export interface ColonyStats {
  byStatus: Record<string, number>
}

export interface ColonySignalOpts {
  harnessScore?: number
  activePheromones?: number
}

const CASTE_MODEL: Record<Caste, ModelTier> = {
  TRAIL: 'cheap',
  EXPLORE: 'frontier',
  FUNGAL: 'build',
}

function detectCaste(byStatus: Record<string, number>): Caste {
  const pending = byStatus['backlog'] ?? 0
  const blocked = byStatus['blocked'] ?? 0
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0)

  // High blocked ratio → scouts needed to find alternative paths
  if (total > 0 && blocked / total > 0.2) return 'EXPLORE'

  // No pending work and no blockers → cultivate new work (fungal mode)
  if (pending === 0 && blocked === 0) return 'FUNGAL'

  return 'TRAIL'
}

function gradeFromHarness(score: number): HealthGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function gradeFromStats(byStatus: Record<string, number>): HealthGrade {
  const done = byStatus['done'] ?? 0
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0)
  if (total === 0) return 'F'
  const ratio = done / total
  if (ratio >= 0.85) return 'A'
  if (ratio >= 0.65) return 'B'
  if (ratio >= 0.45) return 'C'
  if (ratio >= 0.25) return 'D'
  return 'F'
}

export function getColonySignals(s: ColonyStats, opts: ColonySignalOpts = {}): ColonySignals {
  const { byStatus } = s
  const caste = detectCaste(byStatus)
  const colony_health_grade =
    opts.harnessScore !== undefined ? gradeFromHarness(opts.harnessScore) : gradeFromStats(byStatus)

  return {
    caste,
    colony_health_grade,
    active_pheromones: opts.activePheromones ?? 0,
    quarantined_count: byStatus['quarantined'] ?? 0,
    suggested_model: CASTE_MODEL[caste],
  }
}
