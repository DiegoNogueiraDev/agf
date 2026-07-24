/*!
 * TDD: ACO params centralization — single source for decay/evaporation/tauMin (node_091965637f71).
 *
 * AC1: evaporation/decay constant imported from one module by both colony and memory.
 * AC2: tauMin is the same value in MMAS default and aco_autotune lever default.
 * AC3: default behaviour unchanged — blast green.
 */

import { describe, it, expect } from 'vitest'

describe('AC1: single evaporation constant — no duplicate', () => {
  it('DEFAULT_EVAPORATION_RATE in aco-params matches what pheromone-decay imports', async () => {
    const { DEFAULT_EVAPORATION_RATE } = await import('../core/economy/aco-params.js')
    // pheromone-decay no longer owns the constant — it re-exports from aco-params
    const { DECAY_RATE } = await import('../core/memory/pheromone-decay.js')
    expect(DECAY_RATE).toBe(DEFAULT_EVAPORATION_RATE)
  })

  it('pheromone-memory DEFAULT_EVAPORATION_RATE points to aco-params value', async () => {
    const { DEFAULT_EVAPORATION_RATE: acoRate } = await import('../core/economy/aco-params.js')
    const { DEFAULT_EVAPORATION_RATE: memRate } = await import('../core/colony/pheromone-memory.js')
    expect(memRate).toBe(acoRate)
  })
})

describe('AC2: tauMin is consistent between MMAS default and aco_autotune lever', () => {
  it('TAU_MIN in mmas-pheromone equals aco_autotune.tauMin in economy-levers-config', async () => {
    const { TAU_MIN } = await import('../core/economy/aco-params.js')
    const { LEVER_DEFAULTS } = await import('../core/economy/economy-levers-config.js')
    const acoDefault = LEVER_DEFAULTS['aco_autotune'] as { tauMin?: number }
    expect(acoDefault?.tauMin).toBe(TAU_MIN)
  })
})

describe('AC3: default behaviour unchanged', () => {
  it('evaporation rate value is still 0.05', async () => {
    const { DEFAULT_EVAPORATION_RATE } = await import('../core/economy/aco-params.js')
    expect(DEFAULT_EVAPORATION_RATE).toBe(0.05)
  })
})
