/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { tokenize, jaccardSimilarity } from '../../core/utils/similarity.js'

describe('similarity — tokenize', () => {
  it('tokeniza por espaços e camelCase', () => {
    const tokens = tokenize('getUserData')
    expect(tokens.length).toBeGreaterThanOrEqual(3)
  })

  it('retorna array vazio para string vazia', () => {
    expect(tokenize('')).toEqual([])
  })

  it('lida com snake_case', () => {
    const tokens = tokenize('my_function_name')
    expect(tokens).toContain('my')
    expect(tokens).toContain('function')
    expect(tokens).toContain('name')
  })

  it('lida com nomes já separados', () => {
    const tokens = tokenize('hello world')
    expect(tokens).toContain('hello')
    expect(tokens).toContain('world')
  })
})

describe('similarity — jaccardSimilarity', () => {
  it('conjuntos idênticos têm similaridade 1', () => {
    const a = new Set(['a', 'b', 'c'])
    expect(jaccardSimilarity(a, a)).toBe(1)
  })

  it('conjuntos disjuntos têm similaridade 0', () => {
    const a = new Set(['a', 'b'])
    const b = new Set(['c', 'd'])
    expect(jaccardSimilarity(a, b)).toBe(0)
  })

  it('conjuntos com intersecção parcial ficam entre 0 e 1', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd'])
    expect(jaccardSimilarity(a, b)).toBe(2 / 4)
  })
})
