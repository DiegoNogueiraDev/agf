/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da seleção submodular facility-location + CELF (E1.T1 — node_073e205ab7cf;
 * contract node_0b2652135f9c). CELF lazy-greedy sob knapsack de tokens: garantia
 * (1−1/e) do guloso, custo de avaliação amortizado pela fila de ganhos marginais.
 */

import { describe, it, expect } from 'vitest'
import {
  selectSubmodular,
  facilityLocationObjective,
  type SelectionCandidate,
} from '../core/context/submodular-select.js'

/** Candidatos sintéticos determinísticos: texto = termos pseudo-aleatórios estáveis por seed. */
function makeCandidates(n: number, seed = 1): SelectionCandidate[] {
  const out: SelectionCandidate[] = []
  let x = seed
  const next = (): number => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
  // Vocab rico e esparso — reflete contexto real (símbolos/texto de task têm
  // centenas de termos distintos), não a densidade patológica de um vocab minúsculo.
  const vocab = Array.from({ length: 1500 }, (_, i) => `term${i}`)
  for (let i = 0; i < n; i += 1) {
    const k = 3 + Math.floor(next() * 5)
    const terms = Array.from({ length: k }, () => vocab[Math.floor(next() * vocab.length)])
    out.push({ id: `c${i}`, text: terms.join(' '), tokens: 10 + Math.floor(next() * 40) })
  }
  return out
}

/** Guloso EXAUSTIVO (referência): a cada passo escolhe o de maior ganho marginal real. */
function exhaustiveGreedy(candidates: SelectionCandidate[], budget: number): number {
  const picked: SelectionCandidate[] = []
  let spent = 0
  const remaining = [...candidates]
  for (;;) {
    let best: SelectionCandidate | null = null
    let bestGain = 0
    const baseObj = facilityLocationObjective(picked, candidates)
    for (const c of remaining) {
      if (spent + c.tokens > budget) continue
      const gain = facilityLocationObjective([...picked, c], candidates) - baseObj
      if (gain > bestGain) {
        bestGain = gain
        best = c
      }
    }
    if (!best) break
    picked.push(best)
    spent += best.tokens
    remaining.splice(remaining.indexOf(best), 1)
  }
  return facilityLocationObjective(picked, candidates)
}

describe('selectSubmodular (CELF facility-location)', () => {
  it('AC1: 100 candidatos, budget 2000 => custo <=2000 e objetivo >=63% do guloso exaustivo', () => {
    // Arrange
    const candidates = makeCandidates(100, 7)
    const budget = 2000

    // Act
    const result = selectSubmodular(candidates, budget)

    // Assert — knapsack respeitado
    const spent = result.picked.reduce((s, id) => s + (candidates.find((c) => c.id === id)?.tokens ?? 0), 0)
    expect(spent).toBeLessThanOrEqual(budget)
    // Assert — garantia (1-1/e ≈ 0.63) vs o exaustivo no mesmo fixture
    const exhaustive = exhaustiveGreedy(candidates, budget)
    expect(result.objective).toBeGreaterThanOrEqual(0.63 * exhaustive)
  })

  it('AC2: mesmo input duas vezes => resultado idêntico (determinismo)', () => {
    const candidates = makeCandidates(80, 3)
    const a = selectSubmodular(candidates, 1500)
    const b = selectSubmodular(candidates, 1500)
    expect(a.picked).toEqual(b.picked)
    expect(a.objective).toBe(b.objective)
  })

  it('AC3: 5000 candidatos => tempo < 100ms', () => {
    const candidates = makeCandidates(5000, 11)
    const t0 = performance.now()
    const result = selectSubmodular(candidates, 2000)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(100)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('budget 0 ou candidatos vazios => seleção vazia, objetivo 0', () => {
    expect(selectSubmodular(makeCandidates(10), 0).picked).toEqual([])
    expect(selectSubmodular([], 2000).objective).toBe(0)
  })

  it('facilityLocationObjective é monotônico: adicionar um candidato nunca reduz o objetivo', () => {
    const cands = makeCandidates(20, 5)
    const subset = cands.slice(0, 5)
    const bigger = cands.slice(0, 6)
    expect(facilityLocationObjective(bigger, cands)).toBeGreaterThanOrEqual(facilityLocationObjective(subset, cands))
  })
})
