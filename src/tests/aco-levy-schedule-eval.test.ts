/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * VALIDATE task of the ACO Leva A+B epic (node_8425e9eac14c) — a real 4-variant
 * comparison (off / B-only / A-only / A+B) of the production task-selection ACO,
 * using ONLY existing instrumentation (selectNextTaskSmart, stagnationControl,
 * meanSelectionAdvantage) — no TSPLIB/generic-ACO harness (per session decision).
 *
 * PIVOT NOTE: the task originally planned to reuse `evals/suite/*\/scenario.json`
 * (agf eval), but that format evaluates LLM code-generation against a PRD — a
 * different measurement than comparing internal ACO selection quality. This test
 * IS the eval: it runs a synthetic backlog through selectNextTaskSmart +
 * stagnationControl N times per variant and reads meanSelectionAdvantage.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { stagnationControl } from '../core/economy/mmas-pheromone.js'
import { meanSelectionAdvantage } from '../core/economy/selection-quality.js'
import { makeSeededPrng } from '../core/utils/seeded-prng.js'
import { selectNextTaskSmart } from '../core/planner/aco-select.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const TASK_COUNT = 6
const ITERATIONS = 50

interface VariantConfig {
  name: string
  useSchedule: boolean
  useLevy: boolean
}

const VARIANTS: VariantConfig[] = [
  { name: '0-off', useSchedule: false, useLevy: false },
  { name: '1-B-schedule-only', useSchedule: true, useLevy: false },
  { name: '2-A-levy-only', useSchedule: false, useLevy: true },
  { name: '3-A+B', useSchedule: true, useLevy: true },
]

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('aco-levy-schedule-eval')
  return store
}

// Staggered initial pheromone per task — a uniform field makes every candidate's
// advantage exactly 0 by construction (computeSelectionAdvantage is a pheromone
// DIFFERENCE), which produced a misleadingly all-zero first scorecard. Real
// variance gives the roulette/Lévy pick something to actually differ on.
const INITIAL_PHEROMONE = [0.1, 0.5, 1.0, 2.0, 3.0, 4.0]

function seedBacklog(store: SqliteStore, simStartMs: number): void {
  const db = store.getDb()
  const projectId = store.getProject()!.id
  for (let i = 0; i < TASK_COUNT; i++) {
    const id = `t${i}`
    const tag = `tag${i}`
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${i}`,
      status: 'backlog',
      priority: 3,
      xpSize: 'M',
      tags: [tag],
      blocked: false,
      createdAt: new Date(simStartMs).toISOString(),
      updatedAt: new Date(simStartMs).toISOString(),
    } as GraphNode)
    depositPheromone(db, projectId, tag, INITIAL_PHEROMONE[i], simStartMs)
  }
}

/**
 * Run ITERATIONS selection+reward+evaporation cycles for one variant and return
 * meanSelectionAdvantage at the end. Pure simulation over a fresh in-memory store —
 * no I/O beyond SQLite-in-memory, no LLM calls (the GA/ACO learning loop is
 * deterministic given a seeded RNG).
 */
function runVariant(variant: VariantConfig, seed: number, simStartMs: number): number {
  const store = makeStore()
  try {
    seedBacklog(store, simStartMs)
    const db = store.getDb()
    const projectId = store.getProject()!.id
    const rng = makeSeededPrng(seed)

    for (let t = 0; t < ITERATIONS; t++) {
      const nowMs = simStartMs + t * 1000
      // selectNextTaskSmart reads pheromone via getAggregatedTagPheromone(db, projectId,
      // tags) internally WITHOUT an injectable nowMs (always Date.now()) — so the
      // simulation's clock must stay anchored near real wall-clock time, not an
      // arbitrary past/future date, or every trail decays to ~0 over the 7-day
      // half-life and the whole scorecard reads as a false all-zero.
      const res = selectNextTaskSmart(store.toGraphDocument(), {
        getDb: () => db,
        getProjectId: () => projectId,
        mode: 'auto',
        rng,
        levy: variant.useLevy ? () => ({ pLevy: 0.1, betaLevy: 1.5, kappa: 1.0 }) : undefined,
      })
      if (res) {
        for (const tag of res.node.tags ?? []) depositPheromone(db, projectId, tag, 0.5, nowMs)
      }
      stagnationControl(
        db,
        projectId,
        variant.useSchedule ? { rho0: 0.3, rhoF: 0.02, lambda: 100, t, nowMs } : { nowMs },
      )
    }

    return meanSelectionAdvantage(db, projectId)
  } finally {
    store.close()
  }
}

describe('4-variant ACO Leva A+B comparison (node_8425e9eac14c)', () => {
  it('produces a scorecard with all 4 variants and finite meanSelectionAdvantage values', () => {
    const simStartMs = Date.now()
    const scorecard = VARIANTS.map((v) => ({
      variant: v.name,
      meanSelectionAdvantage: runVariant(v, 42, simStartMs),
    }))

    expect(scorecard).toHaveLength(4)
    for (const entry of scorecard) {
      expect(Number.isFinite(entry.meanSelectionAdvantage)).toBe(true)
    }
    // Not asserted here which variant wins — that is the GATE task's decision
    // (node_9740a69a6ffe), made from real numbers, never invented ones.
  })

  // NOT byte-exact reproducible across two sequential calls: selectNextTaskSmart reads
  // pheromone via getAggregatedTagPheromone's Date.now()-based decay internally (no
  // injectable nowMs), so real wall-clock milliseconds elapse between the two runs and
  // shift the decay factor slightly. Documented honestly rather than forcing a false
  // "byte-identical" claim — the RNG itself (levyStep, seeded roulette) IS deterministic,
  // already covered by aco-select.test.ts's dedicated levyStep determinism tests.
  it('is stable within a wide tolerance across 2 back-to-back runs with the same seed', () => {
    const simStartMs = Date.now()
    const runA = VARIANTS.map((v) => runVariant(v, 7, simStartMs))
    const runB = VARIANTS.map((v) => runVariant(v, 7, simStartMs))
    for (let i = 0; i < runA.length; i++) {
      expect(runA[i]).toBeCloseTo(runB[i], 0) // same order of magnitude, not byte-exact
    }
  })
})

describe('GATE decision — multi-seed statistical signal (node_9740a69a6ffe)', () => {
  // 20 seeds instead of the single seed above — enough to separate real signal from
  // per-seed noise (see the GATE node's description for the exact numbers this
  // reproduces: component A +38.2%, component B -59.8% vs baseline, n=20).
  const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)

  function meanAdvantage(variant: VariantConfig): number {
    const simStartMs = Date.now()
    const values = SEEDS.map((seed) => runVariant(variant, seed, simStartMs))
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  it('Component A (Lévy) alone beats the off baseline — real, not noise', () => {
    const offMean = meanAdvantage(VARIANTS[0])
    const levyMean = meanAdvantage(VARIANTS[2])
    expect(levyMean).toBeGreaterThan(offMean)
  })

  it('Component B (thermodynamic schedule) alone is WORSE than the off baseline — the real finding behind the GATE rollback recommendation', () => {
    const offMean = meanAdvantage(VARIANTS[0])
    const scheduleMean = meanAdvantage(VARIANTS[1])
    expect(scheduleMean).toBeLessThan(offMean)
  })
})
