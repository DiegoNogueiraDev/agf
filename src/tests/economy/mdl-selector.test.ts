/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { descriptionLength, selectByMDL } from '../../core/economy/mdl-selector.js'
import type { CompressionOption } from '../../core/economy/mdl-selector.js'

describe('mdl-selector — descriptionLength', () => {
  it('soma modelBytes + residualBytes', () => {
    const opt: CompressionOption = { id: 'test', residualBytes: 100, modelBytes: 50 }
    expect(descriptionLength(opt)).toBe(150)
  })

  it('inclui retrievalPenaltyBytes quando presente', () => {
    const opt: CompressionOption = { id: 'test', residualBytes: 100, modelBytes: 50, retrievalPenaltyBytes: 20 }
    expect(descriptionLength(opt)).toBe(170)
  })

  it('0-byte option tem length 0', () => {
    const opt: CompressionOption = { id: 'empty', residualBytes: 0, modelBytes: 0 }
    expect(descriptionLength(opt)).toBe(0)
  })
})

describe('mdl-selector — selectByMDL', () => {
  it('seleciona a opção com menor MDL', () => {
    const options: CompressionOption[] = [
      { id: 'a', residualBytes: 10, modelBytes: 5 },
      { id: 'b', residualBytes: 100, modelBytes: 50 },
    ]
    const result = selectByMDL(options)
    expect(result.chosen).not.toBeNull()
    expect(result.chosen!.id).toBe('a')
  })

  it('retorna lengths para cada opção', () => {
    const options: CompressionOption[] = [
      { id: 'x', residualBytes: 30, modelBytes: 10 },
      { id: 'y', residualBytes: 5, modelBytes: 5 },
    ]
    const result = selectByMDL(options)
    expect(result.lengths.length).toBe(2)
    expect(result.lengths[0]).toHaveProperty('id')
    expect(result.lengths[0]).toHaveProperty('length')
  })

  it('lida com opção única', () => {
    const options: CompressionOption[] = [{ id: 'u', residualBytes: 50, modelBytes: 25 }]
    const result = selectByMDL(options)
    expect(result.chosen!.id).toBe('u')
  })
})
