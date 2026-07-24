/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/economy/budget-kleiber.ts — allocateKleiber + deriveTargetRatePerMin.
 */

import { describe, it, expect } from 'vitest'
import { allocateKleiber, deriveTargetRatePerMin } from '../core/economy/budget-kleiber.js'

describe('allocateKleiber', () => {
  it('conserva o total (Σ budgets = total)', () => {
    const alloc = allocateKleiber(
      [
        { id: 'a', size: 16 },
        { id: 'b', size: 1 },
      ],
      100,
    )
    const sum = alloc.reduce((acc, x) => acc + x.budget, 0)
    expect(sum).toBeCloseTo(100, 6)
  })

  it('escala sublinear: item grande recebe MENOS que o proporcional linear', () => {
    const alloc = allocateKleiber(
      [
        { id: 'big', size: 16 },
        { id: 'small', size: 1 },
      ],
      100,
    )
    const big = alloc.find((x) => x.id === 'big')!.budget
    const linearShare = (16 / 17) * 100 // ~94.1
    expect(big).toBeGreaterThan(alloc.find((x) => x.id === 'small')!.budget)
    expect(big).toBeLessThan(linearShare) // 16^.75/(16^.75+1) ≈ 88.9% < 94.1%
  })

  it('tamanhos nulos → orçamento zero (sem crash)', () => {
    const alloc = allocateKleiber([{ id: 'a', size: 0 }], 100)
    expect(alloc).toEqual([{ id: 'a', budget: 0 }])
  })

  it('lista vazia → []', () => {
    expect(allocateKleiber([], 100)).toEqual([])
  })
})

describe('deriveTargetRatePerMin — alvo do governador a partir do budget-kleiber', () => {
  const MIN_MS = 60_000

  it('sem backlog → a janela recebe todo o budget → alvo = budget / minutos da janela', () => {
    // Arrange/Act — 500 tok, janela de 1 min, nenhum item pendente
    const rate = deriveTargetRatePerMin(500, MIN_MS, [])
    // Assert — janela isolada abocanha o total; 500 tok / 1 min = 500 tok/min
    expect(rate).toBeCloseTo(500, 6)
  })

  it('com backlog pendente → a janela compete (Kleiber) e recebe menos que o budget cheio', () => {
    // Arrange — uma task de 120 min disputa o budget com a janela de 1 min
    const alone = deriveTargetRatePerMin(500, MIN_MS, [])!
    // Act
    const withBacklog = deriveTargetRatePerMin(500, MIN_MS, [{ id: 't1', size: 120 }])!
    // Assert — a fatia da janela cai (backlog puxa budget), mas segue positiva
    expect(withBacklog).toBeGreaterThan(0)
    expect(withBacklog).toBeLessThan(alone)
  })

  it('backlog maior → fatia da janela menor → alvo mais apertado (sublinear)', () => {
    const small = deriveTargetRatePerMin(500, MIN_MS, [{ id: 't1', size: 30 }])!
    const large = deriveTargetRatePerMin(500, MIN_MS, [{ id: 't1', size: 480 }])!
    expect(large).toBeLessThan(small)
  })

  it('budget ≤ 0 → null (no-op honesto, nada declarado)', () => {
    expect(deriveTargetRatePerMin(0, MIN_MS, [])).toBeNull()
    expect(deriveTargetRatePerMin(-100, MIN_MS, [])).toBeNull()
  })

  it('janela ≤ 0 → null (sem tempo, sem taxa)', () => {
    expect(deriveTargetRatePerMin(500, 0, [])).toBeNull()
    expect(deriveTargetRatePerMin(500, -1000, [])).toBeNull()
  })
})
