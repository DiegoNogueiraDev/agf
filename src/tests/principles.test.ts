/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_a689c5ad8c9a — doctrine: catálogo de princípios de engenharia (Clean
 * Code, XP, TDD, Lean) com a fórmula λ_flow como peça central da economia de
 * token. Selectors puros e determinísticos.
 */
import { describe, it, expect } from 'vitest'
import {
  listPrinciples,
  getPrinciple,
  principlesByCategory,
  listCategories,
  type PrincipleCategory,
} from '../core/doctrine/principles.js'

describe('doctrine — catálogo de princípios (#F7)', () => {
  it('cobre todas as categorias com ≥1 princípio cada', () => {
    const cats: PrincipleCategory[] = ['tdd', 'clean-code', 'xp', 'flow', 'lean', 'promise']
    for (const cat of cats) {
      expect(principlesByCategory(cat).length).toBeGreaterThan(0)
    }
    expect(listCategories().sort()).toEqual([...cats].sort())
  })

  it('a fórmula do dono (λ_flow) é princípio central de economia de token', () => {
    const p = getPrinciple('token-economy-lambda-flow')
    expect(p).toBeDefined()
    expect(p?.category).toBe('flow')
    expect(p?.statement).toContain('λ_flow = λ_base')
  })

  it('TDD inclui Red→Green→Refactor', () => {
    const tdd = principlesByCategory('tdd')
    expect(tdd.some((p) => /red.*green.*refactor/i.test(p.statement) || p.id === 'tdd-red-green-refactor')).toBe(true)
  })

  it('getPrinciple desconhecido → undefined', () => {
    expect(getPrinciple('nao-existe')).toBeUndefined()
  })

  it('cada princípio tem id, title, category, statement e rationale não-vazios', () => {
    for (const p of listPrinciples()) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.statement.length).toBeGreaterThan(0)
      expect(p.rationale.length).toBeGreaterThan(0)
    }
  })

  it('ids são únicos', () => {
    const ids = listPrinciples().map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
