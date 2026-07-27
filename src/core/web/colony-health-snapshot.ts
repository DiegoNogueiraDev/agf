/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §E5.4 — Colony health snapshot for /api/colony-health web endpoint.
 * Zero-LLM. Pure function: ColonyStats → ColonyHealthSnapshot.
 *
 * Extended with stigmergic health (normalizedEntropy + saturatedTrailCount)
 * from mmas-pheromone.ts. Pass db+projectId opts to include entropy; omit for
 * backward-compatible zero-entropy baseline.
 */

import type Database from 'better-sqlite3'
import { getColonySignals, type ColonyStats } from '../colony/colony-signals.js'
import { colonyEntropy, isStagnant, TAU_MAX } from '../economy/mmas-pheromone.js'
import { strongestPheromones, PHEROMONE_HALF_LIFE_MS } from '../economy/pheromone-store.js'

export type HealthColor = 'green' | 'yellow' | 'orange' | 'red'

export interface ColonyHealthSnapshot {
  grade: string
  caste: string
  quarantined_count: number
  suggested_model: string
  color: HealthColor
  pending: number
  blocked: number
  done: number
  total: number
  /** Normalized Shannon entropy of pheromone trails (0=stagnant, 1=fully diverse). */
  normalizedEntropy: number
  /** Number of trails near τ_max (within 5% — saturation warning). */
  saturatedTrailCount: number
  /** True when entropy is below the stagnation threshold — collapse risk visible. */
  stagnationAlert: boolean
}

export interface ColonyEntropyOpts {
  db: Database.Database
  projectId: string
  nowMs?: number
  halfLifeMs?: number
}

function gradeToColor(grade: string): HealthColor {
  if (grade === 'A' || grade === 'B') return 'green'
  if (grade === 'C') return 'yellow'
  if (grade === 'D') return 'orange'
  return 'red'
}

/**
 * Build a ColonyHealthSnapshot from live graph stats.
 * Pass `opts` (db + projectId) to include stigmergic entropy signals;
 * omit for backward-compatible output with entropy = 0.
 */
export function buildColonyHealthSnapshot(stats: ColonyStats, opts?: ColonyEntropyOpts): ColonyHealthSnapshot {
  const signals = getColonySignals(stats)
  const { byStatus } = stats

  const pending = (byStatus['backlog'] ?? 0) + (byStatus['ready'] ?? 0)
  const blocked = byStatus['blocked'] ?? 0
  const done = byStatus['done'] ?? 0
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0)

  let normalizedEntropy = 0
  let saturatedTrailCount = 0
  let stagnationAlert = false

  if (opts) {
    const { db, projectId, nowMs = Date.now(), halfLifeMs = PHEROMONE_HALF_LIFE_MS } = opts
    normalizedEntropy = colonyEntropy(db, projectId, nowMs, halfLifeMs)
    stagnationAlert = isStagnant(normalizedEntropy)

    // Trails within 5% of τ_max are considered saturated
    const saturationCeiling = TAU_MAX * 0.95
    const trails = strongestPheromones(db, projectId, Number.MAX_SAFE_INTEGER, nowMs, halfLifeMs)
    saturatedTrailCount = trails.filter((t) => t.strength >= saturationCeiling).length
  }

  return {
    grade: signals.colony_health_grade,
    caste: signals.caste,
    quarantined_count: signals.quarantined_count,
    suggested_model: signals.suggested_model,
    color: gradeToColor(signals.colony_health_grade),
    pending,
    blocked,
    done,
    total,
    normalizedEntropy,
    saturatedTrailCount,
    stagnationAlert,
  }
}
