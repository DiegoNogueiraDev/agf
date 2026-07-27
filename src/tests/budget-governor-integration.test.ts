/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Integração do tick do governador (E3.T3 — node_95e41d13b52c).
 * O termostato ambiental: runGovernorTick lê a config + burnRate do ledger,
 * atua nos knobs via setLeverParam e registra cada atuação no
 * economy_lever_ledger — a formiga (driver) nunca decide nada.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { runGovernorTick } from '../core/economy/governor-tick.js'
import { GOVERNOR_KNOBS } from '../core/economy/budget-governor.js'
import {
  ECONOMY_LEVERS_SETTING_KEY,
  LEVER_DEFAULTS,
  getLeverParam,
  resolveEconomyLeversConfig,
} from '../core/economy/economy-levers-config.js'

function openGovStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('governor-int-test')
  return store
}

function enableGovernor(store: SqliteStore, extraLevers: string[], targetRatePerMin: number, windowMs: number): void {
  const cfg: Record<string, unknown> = {
    budget_governor: { enabled: true, params: { targetRatePerMin, windowMs } },
  }
  for (const l of extraLevers) cfg[l] = { enabled: true }
  store.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify(cfg))
}

function seedSpend(store: SqliteStore, session: string, ts: number, tokens: number): void {
  store
    .getDb()
    .prepare(
      `INSERT INTO llm_call_ledger (id, ts, session_id, provider, model, input_tokens, output_tokens, cost_usd, status)
       VALUES (?, ?, ?, 'stub', 'stub-model', ?, 0, 0, 'ok')`,
    )
    .run(`call_${ts}_${Math.floor(tokens)}`, ts, session, Math.floor(tokens))
}

/** Avanço médio dos knobs em direção ao bound compressivo, lido da config real. */
function aggressiveness(store: SqliteStore): number {
  const cfg = resolveEconomyLeversConfig(store)
  let sum = 0
  for (const k of GOVERNOR_KNOBS) {
    const v = getLeverParam(cfg, k.lever, k.param, LEVER_DEFAULTS[k.lever][k.param] ?? 0)
    const progress = k.direction === 1 ? (v - k.min) / (k.max - k.min) : (k.max - v) / (k.max - k.min)
    sum += progress
  }
  return sum / GOVERNOR_KNOBS.length
}

describe('runGovernorTick — o termostato no ambiente', () => {
  it('AC1: lever budget_governor OFF => tick retorna null, settings byte-identicos e zero linhas no ledger', () => {
    // Arrange
    const store = openGovStore()
    const before = store.getProjectSetting(ECONOMY_LEVERS_SETTING_KEY)

    // Act
    const result = runGovernorTick(store, { sessionId: 's-off', now: 1_000_000 })

    // Assert
    expect(result).toBeNull()
    expect(store.getProjectSetting(ECONOMY_LEVERS_SETTING_KEY)).toBe(before)
    const rows = store
      .getDb()
      .prepare(`SELECT COUNT(*) AS c FROM economy_lever_ledger WHERE lever = 'budget_governor'`)
      .get() as { c: number }
    expect(rows.c).toBe(0)
    store.close()
  })

  it('AC3: atuacao real grava linha budget_governor no ledger com o delta e persiste o param', () => {
    // Arrange — burn 200/min vs alvo 100/min, so ncd_dedup habilitada como knob
    const store = openGovStore()
    const now = 10_000_000
    enableGovernor(store, ['ncd_dedup'], 100, 60_000)
    seedSpend(store, 's-hot', now - 30_000, 200)

    // Act
    const result = runGovernorTick(store, { sessionId: 's-hot', now })

    // Assert — atuou no ncd_dedup.threshold em direcao compressiva e persistiu
    expect(result).not.toBeNull()
    expect(result!.actuations.length).toBe(1)
    expect(result!.actuations[0].lever).toBe('ncd_dedup')
    const after = getLeverParam(resolveEconomyLeversConfig(store), 'ncd_dedup', 'threshold', 0.3)
    expect(after).toBeGreaterThan(0.3)

    // Assert — linha no ledger com lever budget_governor e o delta aplicado
    const row = store
      .getDb()
      .prepare(`SELECT baseline_method AS bm, score FROM economy_lever_ledger WHERE lever = 'budget_governor'`)
      .get() as { bm: string; score: number }
    expect(row.bm).toContain('ncd_dedup.threshold')
    expect(row.bm).toContain('->')
    expect(row.score).toBeCloseTo(after, 6)
    store.close()
  })

  it('WIRE-AC1: targetRatePerMin=0 + orcamento kleiber declarado => alvo derivado usado, atua sob burn 2x', () => {
    // Arrange — governador com alvo 0 (sem meta estatica); budget_kleiber declara
    // 500 tok/janela de 1 min => alvo derivado = 500 tok/min (sem backlog sized).
    const store = openGovStore()
    const now = 20_000_000
    const cfg: Record<string, unknown> = {
      budget_governor: { enabled: true, params: { targetRatePerMin: 0, windowMs: 60_000 } },
      budget_kleiber: { enabled: true, params: { budgetTokens: 500 } },
      ncd_dedup: { enabled: true },
    }
    store.setProjectSetting(ECONOMY_LEVERS_SETTING_KEY, JSON.stringify(cfg))
    // burn 2x o alvo derivado (1000 tok na janela de 1 min => 1000/min vs alvo 500/min)
    seedSpend(store, 's-derived', now - 30_000, 1000)

    // Act
    const result = runGovernorTick(store, { sessionId: 's-derived', now })

    // Assert — alvo derivado (nao 0) usado e uma atuacao compressiva ocorreu
    expect(result).not.toBeNull()
    expect(result!.targetRate).toBeCloseTo(500, 6)
    expect(result!.actuations.length).toBeGreaterThanOrEqual(1)
    const after = getLeverParam(resolveEconomyLeversConfig(store), 'ncd_dedup', 'threshold', 0.3)
    expect(after).toBeGreaterThan(0.3)
    store.close()
  })

  it('WIRE-AC2: targetRatePerMin=0 e sem orcamento kleiber => no-op (null) como hoje', () => {
    // Arrange — governador ON, alvo 0, budget_kleiber ausente/OFF
    const store = openGovStore()
    enableGovernor(store, ['ncd_dedup'], 0, 60_000)
    const before = store.getProjectSetting(ECONOMY_LEVERS_SETTING_KEY)
    seedSpend(store, 's-none', 20_000_000 - 30_000, 1000)

    // Act
    const result = runGovernorTick(store, { sessionId: 's-none', now: 20_000_000 })

    // Assert — nada declarado => null, config byte-identica
    expect(result).toBeNull()
    expect(store.getProjectSetting(ECONOMY_LEVERS_SETTING_KEY)).toBe(before)
    store.close()
  })

  it('AC2: cenario stub seeded — consumo final em alvo+-10% em >=8 de 10 execucoes', () => {
    const TARGET = 100
    const STEP_MS = 60_000
    const STEPS = 12
    let withinBand = 0

    for (let seed = 0; seed < 10; seed += 1) {
      // Arrange — planta deterministica por seed: base 180..216 tokens/min
      const store = openGovStore()
      const base = 180 + seed * 4
      enableGovernor(
        store,
        GOVERNOR_KNOBS.map((k) => k.lever),
        TARGET,
        STEP_MS,
      )
      const session = `sim-${seed}`
      const start = 100_000_000

      // Act — a cada passo o consumo responde aos knobs; o tick regula em seguida
      let finalSpend = base
      for (let step = 0; step < STEPS; step += 1) {
        const ts = start + step * STEP_MS
        finalSpend = base * (1 - 0.5 * aggressiveness(store))
        seedSpend(store, session, ts, finalSpend)
        runGovernorTick(store, { sessionId: session, now: ts + 1 })
      }

      // Assert por seed
      if (Math.abs(finalSpend - TARGET) / TARGET <= 0.1) withinBand += 1
      store.close()
    }

    expect(withinBand).toBeGreaterThanOrEqual(8)
  })
})
