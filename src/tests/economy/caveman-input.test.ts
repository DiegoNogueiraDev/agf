/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { cavemanFilterInput, estimateCavemanInputReduction } from '../../core/economy/caveman-input.js'

describe('caveman-input — cavemanFilterInput', () => {
  it('reduz artigos e preposições em modo aggressive', () => {
    const input = 'the quick brown fox jumps over the lazy dog'
    const result = cavemanFilterInput(input, 'aggressive')
    expect(result.length).toBeLessThan(input.length)
  })

  it('não altera texto vazio', () => {
    expect(cavemanFilterInput('')).toBe('')
  })

  it('moderate preserva mais texto que aggressive', () => {
    const input = 'the quick brown fox jumps over the lazy dog near the river'
    const aggressive = cavemanFilterInput(input, 'aggressive')
    const moderate = cavemanFilterInput(input, 'moderate')
    expect(moderate.length).toBeGreaterThanOrEqual(aggressive.length)
  })

  it('não quebra em modo light', () => {
    const input = 'the quick brown fox'
    const result = cavemanFilterInput(input, 'light')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('caveman-input — estimateCavemanInputReduction', () => {
  it('retorna bytesBefore e bytesAfter', () => {
    const input = 'the quick brown fox jumps over the lazy dog'
    const stats = estimateCavemanInputReduction(input, 'aggressive')
    expect(stats.bytesBefore).toBe(input.length)
    expect(stats.bytesAfter).toBeLessThan(stats.bytesBefore)
    expect(stats.reductionPercent).toBeGreaterThan(0)
  })

  it('texto vazio tem redução 0', () => {
    const stats = estimateCavemanInputReduction('')
    expect(stats.bytesBefore).toBe(0)
    expect(stats.reductionPercent).toBe(0)
  })

  it('retorna targetMet baseado no percentual', () => {
    const stats = estimateCavemanInputReduction('the quick brown fox jumps over the lazy dog', 'aggressive')
    expect(stats).toHaveProperty('targetMet')
    expect(stats).toHaveProperty('target')
    expect(stats.target).toBeGreaterThan(0)
  })
})
