/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da varredura rate-distortion (E4.T2 — node_493efe4a5bc7).
 * Cada compressor lossy registrado ganha pontos {ratePct, distortion} medidos
 * sobre fixtures reais — curva de Shannon operacional, não estimada.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  RD_COMPRESSORS,
  runRdSweep,
  saveRdBaseline,
  loadRdBaseline,
  compareRdToBaseline,
  rdGateCheck,
} from '../core/economy/rd-sweep.js'

describe('runRdSweep', () => {
  it('AC1: >=1 ponto RD por compressor lossy registrado (contagem igual ao registry)', async () => {
    // Act
    const points = await runRdSweep()

    // Assert — todo compressor distinto do registry aparece
    const registryNames = new Set(RD_COMPRESSORS.map((c) => c.compressor))
    const pointNames = new Set(points.map((p) => p.compressor))
    expect(pointNames).toEqual(registryNames)
    expect(points.length).toBe(RD_COMPRESSORS.length)
  })

  it('AC2: caveman aggressive comprime mais que light e nunca distorce menos', async () => {
    // Act
    const points = await runRdSweep()

    // Assert — monotonia no par de modos do mesmo compressor
    const agg = points.find((p) => p.compressor === 'caveman-input' && p.mode === 'aggressive')!
    const light = points.find((p) => p.compressor === 'caveman-input' && p.mode === 'light')!
    expect(agg.ratePct).toBeGreaterThan(light.ratePct)
    expect(agg.distortion).toBeGreaterThanOrEqual(light.distortion)
  })

  it('todos os pontos tem ratePct em [0,100] e distortion em [0,1]', async () => {
    const points = await runRdSweep()
    for (const p of points) {
      expect(p.ratePct).toBeGreaterThanOrEqual(0)
      expect(p.ratePct).toBeLessThanOrEqual(100)
      expect(p.distortion).toBeGreaterThanOrEqual(0)
      expect(p.distortion).toBeLessThanOrEqual(1)
    }
  })

  it('AC3: baseline persistida e recarregada retorna os mesmos pontos (roundtrip)', async () => {
    // Arrange
    const store = SqliteStore.open(':memory:')
    store.initProject('rd-test')
    const points = await runRdSweep()

    // Act
    saveRdBaseline(store, points)
    const loaded = loadRdBaseline(store)

    // Assert
    expect(loaded).toEqual(points)
    store.close()
  })

  it('baseline ausente => null sem excecao', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('rd-empty')
    expect(loadRdBaseline(store)).toBeNull()
    store.close()
  })
})

describe('compareRdToBaseline + rdGateCheck — gate de regressao de distorcao (E4.T3 node_de35f1764076)', () => {
  const basePoint = { compressor: 'caveman-input', mode: 'aggressive', ratePct: 40, distortion: 0.5 }

  it('AC2: distortion 12% pior que a baseline => reprova nomeando o compressor', () => {
    const result = compareRdToBaseline([{ ...basePoint, distortion: 0.56 }], [basePoint])
    expect(result.passed).toBe(false)
    expect(result.regressions.length).toBe(1)
    expect(result.regressions[0].compressor).toBe('caveman-input')
  })

  it('AC3: distortion igual ou melhor => passa', () => {
    expect(compareRdToBaseline([{ ...basePoint, distortion: 0.5 }], [basePoint]).passed).toBe(true)
    expect(compareRdToBaseline([{ ...basePoint, distortion: 0.4 }], [basePoint]).passed).toBe(true)
  })

  it('dentro da tolerancia de 10% => passa (0.54 sobre 0.5)', () => {
    expect(compareRdToBaseline([{ ...basePoint, distortion: 0.54 }], [basePoint]).passed).toBe(true)
  })

  it('baseline zero: qualquer distorcao material reprova', () => {
    const zero = { ...basePoint, distortion: 0 }
    expect(compareRdToBaseline([{ ...basePoint, distortion: 0.05 }], [zero]).passed).toBe(false)
    expect(compareRdToBaseline([zero], [zero]).passed).toBe(true)
  })

  it('rdGateCheck sem baseline: SEMEIA a baseline na primeira execucao e passa', async () => {
    // Arrange
    const store = SqliteStore.open(':memory:')
    store.initProject('rd-gate-seed')

    // Act
    const first = await rdGateCheck(store)

    // Assert — seed + baseline persistida
    expect(first.seeded).toBe(true)
    expect(first.passed).toBe(true)
    expect(loadRdBaseline(store)).not.toBeNull()

    // Act 2 — segunda execucao compara contra a semente (deterministico => passa)
    const second = await rdGateCheck(store)
    expect(second.seeded).toBe(false)
    expect(second.passed).toBe(true)
    store.close()
  })
})
