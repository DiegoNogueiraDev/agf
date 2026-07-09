/*!
 * Task node_f03f21faa7d0 — wire lever aco_autotune + persist evolved params.
 *
 * AC1: no lever configured → aco_autotune.enabled === false
 * AC2: setLeverParam(store, 'aco_autotune', 'alpha', 2.3) persists and reads back
 * AC3: lever ON → stagnationControl reads alpha/rho from lever params instead of defaults
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  resolveEconomyLeversConfig,
  isLeverEnabled,
  setLeverParam,
  getLeverParam,
  economyLeversSourceFromDb,
} from '../core/economy/economy-levers-config.js'

function openStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test')
  return store
}

describe('aco_autotune lever', () => {
  it('aco_autotune.enabled is false by default (AC1)', () => {
    const store = openStore()
    const cfg = resolveEconomyLeversConfig(store)
    expect(isLeverEnabled(cfg, 'aco_autotune')).toBe(false)
  })

  it('setLeverParam persists alpha and reads back (AC2)', () => {
    const store = openStore()
    setLeverParam(store, 'aco_autotune', 'alpha', 2.3)
    const cfg = resolveEconomyLeversConfig(store)
    const alpha = getLeverParam(cfg, 'aco_autotune', 'alpha', 1.0)
    expect(alpha).toBeCloseTo(2.3, 9)
  })

  it('setLeverParam persists rho and reads back', () => {
    const store = openStore()
    setLeverParam(store, 'aco_autotune', 'rho', 0.05)
    const cfg = resolveEconomyLeversConfig(store)
    const rho = getLeverParam(cfg, 'aco_autotune', 'rho', 0.1)
    expect(rho).toBeCloseTo(0.05, 9)
  })
})
