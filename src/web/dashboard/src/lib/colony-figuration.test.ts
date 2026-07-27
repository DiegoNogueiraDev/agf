/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_31ae9dd977c5 — colony-figuration: trilhas cruas → pesos visuais.
 * Peso (strokeWidth/opacity) ∝ amount; top-K por força (mitiga risks
 * node_2ef219d03cbb / node_67a194b15e8a); amount inválido é descartado.
 */
import { describe, it, expect } from 'vitest'
import { figureTrails, COLONY_TOP_K } from './colony-figuration'
import type { ColonyTrail } from './types'

const trail = (key: string, amount: number): ColonyTrail => ({ key, amount, ts: 1 })

describe('figureTrails', () => {
  it('assigns visual weight proportional to amount — stronger trail, stronger stroke (AC1)', () => {
    const [strong, weak] = figureTrails([trail('weak', 1), trail('strong', 10)])
    expect(strong.key).toBe('strong')
    expect(strong.strokeWidth).toBeGreaterThan(weak.strokeWidth)
    expect(strong.opacity).toBeGreaterThan(weak.opacity)
    expect(strong.opacity).toBeLessThanOrEqual(1)
  })

  it('caps >300 trails at top-K by amount (AC2)', () => {
    const many = Array.from({ length: 500 }, (_, i) => trail(`t${i}`, i))
    const figured = figureTrails(many)
    expect(figured).toHaveLength(COLONY_TOP_K)
    // top-K = os mais fortes, ordenados desc
    expect(figured[0].amount).toBe(499)
    expect(figured[figured.length - 1].amount).toBe(500 - COLONY_TOP_K)
  })

  it('drops invalid amounts (NaN/Infinity/negative) without throwing (AC5)', () => {
    const figured = figureTrails([trail('ok', 2), trail('nan', NaN), trail('inf', Infinity), trail('neg', -1)])
    expect(figured.map((t) => t.key)).toEqual(['ok'])
  })

  it('returns [] for empty input (AC5)', () => {
    expect(figureTrails([])).toEqual([])
  })

  it('single-trail colony still gets full weight (divisão por max, não por range)', () => {
    const [only] = figureTrails([trail('solo', 7)])
    expect(only.strokeWidth).toBeGreaterThan(0)
    expect(only.opacity).toBeGreaterThan(0)
  })
})
