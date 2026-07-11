/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/economy/budget-kleiber.ts — allocateKleiber.
 */

import { describe, it, expect } from 'vitest'
import { allocateKleiber } from '../core/economy/budget-kleiber.js'

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
