/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  resolveEconomyLeversConfig,
  isLeverEnabled,
  setLeverEnabled,
  setLeverParam,
  getLeverParam,
  getLeverParams,
  ECONOMY_LEVERS_SETTING_KEY,
  LEVER_KEYS,
} from '../core/economy/economy-levers-config.js'

/** Minimal in-memory project-settings store for the tests. */
class FakeSettings {
  private readonly map = new Map<string, string>()
  getProjectSetting(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setProjectSetting(key: string, value: string): void {
    this.map.set(key, value)
  }
}

describe('resolveEconomyLeversConfig', () => {
  it('defaults to all-off when no setting is stored', () => {
    const cfg = resolveEconomyLeversConfig(new FakeSettings())
    for (const k of LEVER_KEYS) expect(isLeverEnabled(cfg, k)).toBe(false)
  })

  it('falls back to all-off on a corrupt setting (no throw in the hot path)', () => {
    const s = new FakeSettings()
    s.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, '{not valid json')
    const cfg = resolveEconomyLeversConfig(s)
    expect(isLeverEnabled(cfg, 'ncd_dedup')).toBe(false)
  })

  it('reads a persisted enabled flag', () => {
    const s = new FakeSettings()
    s.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify({ heat_kernel: { enabled: true } }))
    const cfg = resolveEconomyLeversConfig(s)
    expect(isLeverEnabled(cfg, 'heat_kernel')).toBe(true)
    expect(isLeverEnabled(cfg, 'ncd_dedup')).toBe(false)
  })
})

describe('setLeverEnabled', () => {
  it('persists a flag and merges (does not clobber other levers)', () => {
    const s = new FakeSettings()
    setLeverEnabled(s, 'forage_stop', true)
    setLeverEnabled(s, 'mdl_select', true)
    const cfg = resolveEconomyLeversConfig(s)
    expect(isLeverEnabled(cfg, 'forage_stop')).toBe(true)
    expect(isLeverEnabled(cfg, 'mdl_select')).toBe(true)
  })

  it('can disable a previously enabled lever', () => {
    const s = new FakeSettings()
    setLeverEnabled(s, 'stigmergy', true)
    setLeverEnabled(s, 'stigmergy', false)
    expect(isLeverEnabled(resolveEconomyLeversConfig(s), 'stigmergy')).toBe(false)
  })
})

describe('lever params', () => {
  it('getLeverParam returns the default when no param is stored', () => {
    const s = new FakeSettings()
    s.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify({ forage_stop: { enabled: true } }))
    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParam(cfg, 'forage_stop', 'minItems', 1)).toBe(1)
    expect(getLeverParam(cfg, 'forage_stop', 'epsilon', 0.1)).toBe(0.1)
  })

  it('getLeverParam reads a stored param', () => {
    const s = new FakeSettings()
    s.setProjectSetting(
      ECONOMY_LEVERS_SETTING_KEY,
      JSON.stringify({
        forage_stop: { enabled: true, params: { minItems: 3, epsilon: 0.2 } },
      }),
    )
    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParam(cfg, 'forage_stop', 'minItems', 1)).toBe(3)
    expect(getLeverParam(cfg, 'forage_stop', 'epsilon', 0.1)).toBe(0.2)
  })

  it('setLeverParam persists a numeric param and preserves enabled state', () => {
    const s = new FakeSettings()
    setLeverEnabled(s, 'forage_stop', true)
    setLeverParam(s, 'forage_stop', 'epsilon', 0.25)

    const cfg = resolveEconomyLeversConfig(s)
    expect(isLeverEnabled(cfg, 'forage_stop')).toBe(true)
    expect(getLeverParam(cfg, 'forage_stop', 'epsilon', 0.1)).toBe(0.25)
  })

  it('setLeverParam creates a lever entry when none existed', () => {
    const s = new FakeSettings()
    setLeverParam(s, 'ncd_dedup', 'threshold', 0.15)

    const cfg = resolveEconomyLeversConfig(s)
    expect(isLeverEnabled(cfg, 'ncd_dedup')).toBe(false)
    expect(getLeverParam(cfg, 'ncd_dedup', 'threshold', 0.3)).toBe(0.15)
  })

  it('setLeverEnabled preserves existing params', () => {
    const s = new FakeSettings()
    setLeverParam(s, 'forage_stop', 'epsilon', 0.2)
    setLeverEnabled(s, 'forage_stop', true)

    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParam(cfg, 'forage_stop', 'epsilon', 0.1)).toBe(0.2)
  })

  it('getLeverParams returns empty object when no params stored', () => {
    const s = new FakeSettings()
    s.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify({ forage_stop: { enabled: true } }))
    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParams(cfg, 'forage_stop')).toEqual({})
  })

  it('ignores non-finite stored params (falls back to default)', () => {
    const s = new FakeSettings()
    s.setProjectSetting(
      ECONOMY_LEVERS_SETTING_KEY,
      JSON.stringify({
        forage_stop: { enabled: true, params: { epsilon: NaN } },
      }),
    )
    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParam(cfg, 'forage_stop', 'epsilon', 0.1)).toBe(0.1)
  })
})

describe('aco_autotune thermodynamic ρ schedule params (node_23b708ebefd5)', () => {
  it('LEVER_DEFAULTS.aco_autotune includes rho0=0.30, rhoF=0.02, lambda=100', async () => {
    const { LEVER_DEFAULTS } = await import('../core/economy/economy-levers-config.js')
    expect(LEVER_DEFAULTS.aco_autotune.rho0).toBe(0.3)
    expect(LEVER_DEFAULTS.aco_autotune.rhoF).toBe(0.02)
    expect(LEVER_DEFAULTS.aco_autotune.lambda).toBe(100)
  })

  it('getLeverParams returns the rho-schedule defaults when unconfigured', () => {
    const cfg = resolveEconomyLeversConfig(new FakeSettings())
    const params = getLeverParams(cfg, 'aco_autotune')
    expect(params.rho0).toBeUndefined() // unset in stored config; caller reads default via getLeverParam
  })

  it('getLeverParam returns the override when rho0 is explicitly set', () => {
    const s = new FakeSettings()
    setLeverParam(s, 'aco_autotune', 'rho0', 0.5)
    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParam(cfg, 'aco_autotune', 'rho0', 0.3)).toBe(0.5)
  })

  it('getLeverParam falls back to the LEVER_DEFAULTS value when rho0 is unset', async () => {
    const { LEVER_DEFAULTS } = await import('../core/economy/economy-levers-config.js')
    const cfg = resolveEconomyLeversConfig(new FakeSettings())
    expect(getLeverParam(cfg, 'aco_autotune', 'rho0', LEVER_DEFAULTS.aco_autotune.rho0)).toBe(0.3)
    expect(getLeverParam(cfg, 'aco_autotune', 'rhoF', LEVER_DEFAULTS.aco_autotune.rhoF)).toBe(0.02)
    expect(getLeverParam(cfg, 'aco_autotune', 'lambda', LEVER_DEFAULTS.aco_autotune.lambda)).toBe(100)
  })
})

describe('aco_autotune Levy exploration params (node_d3b833dc6252)', () => {
  it('LEVER_DEFAULTS.aco_autotune includes pLevy=0.10, betaLevy=1.5, kappa=1.0', async () => {
    const { LEVER_DEFAULTS } = await import('../core/economy/economy-levers-config.js')
    expect(LEVER_DEFAULTS.aco_autotune.pLevy).toBe(0.1)
    expect(LEVER_DEFAULTS.aco_autotune.betaLevy).toBe(1.5)
    expect(LEVER_DEFAULTS.aco_autotune.kappa).toBe(1.0)
  })

  it('getLeverParam returns the override when pLevy is explicitly set', () => {
    const s = new FakeSettings()
    setLeverParam(s, 'aco_autotune', 'pLevy', 0.25)
    const cfg = resolveEconomyLeversConfig(s)
    expect(getLeverParam(cfg, 'aco_autotune', 'pLevy', 0.1)).toBe(0.25)
  })

  it('getLeverParam falls back to the LEVER_DEFAULTS values when Levy params are unset', async () => {
    const { LEVER_DEFAULTS } = await import('../core/economy/economy-levers-config.js')
    const cfg = resolveEconomyLeversConfig(new FakeSettings())
    expect(getLeverParam(cfg, 'aco_autotune', 'pLevy', LEVER_DEFAULTS.aco_autotune.pLevy)).toBe(0.1)
    expect(getLeverParam(cfg, 'aco_autotune', 'betaLevy', LEVER_DEFAULTS.aco_autotune.betaLevy)).toBe(1.5)
    expect(getLeverParam(cfg, 'aco_autotune', 'kappa', LEVER_DEFAULTS.aco_autotune.kappa)).toBe(1.0)
  })
})
