/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/economy/forage-stop.ts — forageStop (MVT de Charnov).
 */

import { describe, it, expect } from 'vitest'
import { forageStop } from '../core/economy/forage-stop.js'

describe('forageStop', () => {
  it('mantém itens acima da média e corta a cauda diminutiva (economia > 0)', () => {
    const r = forageStop(
      [
        { gain: 10, tokens: 100 },
        { gain: 8, tokens: 100 },
        { gain: 2, tokens: 100 },
        { gain: 1, tokens: 100 },
      ],
      { minItems: 1, epsilon: 0 },
    )
    // média = 5.25 → mantém 10 e 8; corta 2 e 1
    expect(r.keptCount).toBe(2)
    expect(r.droppedCount).toBe(2)
    expect(r.droppedTokens).toBe(200)
  })

  it('itens homogêneos → mantém todos (sem economia)', () => {
    const r = forageStop([
      { gain: 5, tokens: 50 },
      { gain: 5, tokens: 50 },
      { gain: 5, tokens: 50 },
    ])
    expect(r.keptCount).toBe(3)
    expect(r.droppedTokens).toBe(0)
  })

  it('respeita o piso minItems mesmo abaixo da média', () => {
    const r = forageStop(
      [
        { gain: 10, tokens: 100 },
        { gain: 1, tokens: 100 },
        { gain: 1, tokens: 100 },
        { gain: 1, tokens: 100 },
      ],
      { minItems: 3, epsilon: 0 },
    )
    expect(r.keptCount).toBe(3) // 3 itens mantidos apesar de só 1 estar acima da média
    expect(r.droppedCount).toBe(1)
  })

  it('epsilon maior explora mais (limiar menor, mantém mais)', () => {
    const items = [
      { gain: 10, tokens: 100 },
      { gain: 8, tokens: 100 },
      { gain: 3, tokens: 100 },
    ]
    const strict = forageStop(items, { minItems: 1, epsilon: 0 })
    const explore = forageStop(items, { minItems: 1, epsilon: 0.6 })
    expect(explore.keptCount).toBeGreaterThanOrEqual(strict.keptCount)
  })

  it('lista vazia → tudo zero (sem crash)', () => {
    expect(forageStop([])).toMatchObject({ keptCount: 0, droppedTokens: 0 })
  })
})
