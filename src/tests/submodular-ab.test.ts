/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  selectSubmodular,
  facilityLocationObjective,
  type SelectionCandidate,
} from '../core/context/submodular-select.js'
import { welchTTest } from '../core/economy/ab-compare.js'

// node_c555697b02c1 — VALIDATE A/B: a lever submodular_select só pode virar
// default se VENCER com significância (regra 16 — prova, não alegação).
// A = pipeline atual (sem seleção ⇒ sob budget, truncamento FIFO na ordem de
// chegada); B = facility-location + CELF. Métrica = objetivo facility-location
// sobre o ground-set completo (cobertura). 20 tasks stub determinísticas
// (LCG seeded, zero Math.random) com redundância clusterizada — o cenário real
// de vizinhança de grafo (muitos nós quase-duplicados por épico).

const TOPICS = [
  'gateway compressao tokens ledger economia',
  'lease claim formiga colonia estigmergia',
  'harness dimensao conectividade dormencia score',
  'difusao heat kernel laplaciano grafo',
  'memoria salience retencao decaimento tier',
] as const

/** LCG determinístico (Numerical Recipes) — reprodutível entre runs. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

/**
 * Uma "task stub": 40 candidatos em 5 clusters de 8 quase-duplicatas, ordenados
 * cluster-a-cluster (o FIFO fica preso no cluster 1 — exatamente o viés do
 * pipeline atual, que serve vizinhos na ordem em que as edges chegam).
 */
function makeTaskCandidates(taskIndex: number): SelectionCandidate[] {
  const rnd = makeLcg(1000 + taskIndex * 7919)
  const candidates: SelectionCandidate[] = []
  for (let topic = 0; topic < TOPICS.length; topic += 1) {
    for (let v = 0; v < 8; v += 1) {
      const noise = `variante${Math.floor(rnd() * 1000)} caso${Math.floor(rnd() * 1000)}`
      candidates.push({
        id: `t${taskIndex}-c${topic}-${v}`,
        text: `${TOPICS[topic]} ${noise}`,
        tokens: 10,
      })
    }
  }
  return candidates
}

const BUDGET_TOKENS = 80 // ~8 picks de 10 tokens — força escolha sob escassez

/** A = pipeline atual sob budget: truncamento FIFO (ordem de chegada). */
function selectFifo(candidates: readonly SelectionCandidate[], budget: number): SelectionCandidate[] {
  const picked: SelectionCandidate[] = []
  let spent = 0
  for (const c of candidates) {
    if (spent + c.tokens > budget) break
    picked.push(c)
    spent += c.tokens
  }
  return picked
}

function objectiveOf(selectedIds: readonly string[], all: readonly SelectionCandidate[]): number {
  const byId = new Map(all.map((c) => [c.id, c]))
  const selected = selectedIds.map((id) => byId.get(id)!).filter(Boolean)
  return facilityLocationObjective(selected, all)
}

interface AbSamples {
  a: number[]
  b: number[]
}

function runAb(taskCount: number): AbSamples {
  const a: number[] = []
  const b: number[] = []
  for (let i = 0; i < taskCount; i += 1) {
    const candidates = makeTaskCandidates(i)
    a.push(
      objectiveOf(
        selectFifo(candidates, BUDGET_TOKENS).map((c) => c.id),
        candidates,
      ),
    )
    b.push(objectiveOf(selectSubmodular(candidates, BUDGET_TOKENS).picked, candidates))
  }
  return { a, b }
}

describe('A/B submodular vs pipeline atual (node_c555697b02c1)', () => {
  const samples = runAb(20)

  it('AC1: 20 amostras A vs B no mesmo budget ⇒ ab-compare emite winner e pValue numéricos', () => {
    const result = welchTTest(samples.a, samples.b)

    expect(['A', 'B', 'tie']).toContain(result.winner)
    expect(Number.isFinite(result.pValue)).toBe(true)
    expect(Number.isFinite(result.avgA)).toBe(true)
    expect(Number.isFinite(result.avgB)).toBe(true)
    expect(samples.a).toHaveLength(20)
    expect(samples.b).toHaveLength(20)
  })

  it('AC2: no fixture de referência, objetivo de B ≥ A + 15%', () => {
    const candidates = makeTaskCandidates(0) // fixture de referência: task 0
    const objA = objectiveOf(
      selectFifo(candidates, BUDGET_TOKENS).map((c) => c.id),
      candidates,
    )
    const objB = objectiveOf(selectSubmodular(candidates, BUDGET_TOKENS).picked, candidates)

    expect(objB).toBeGreaterThanOrEqual(objA * 1.15)
  })

  it('AC3: qualidade de B ≥ A em TODAS as 20 amostras (sem regressão) e B vence com significância', () => {
    for (let i = 0; i < samples.a.length; i += 1) {
      expect(samples.b[i]).toBeGreaterThanOrEqual(samples.a[i])
    }
    // GOTCHA: welchTTest tem semântica de CUSTO (winner = média MENOR). Para
    // objetivos (maior = melhor), "B vence" = significant && avgB > avgA — o
    // campo winner apontaria 'A' por ser o lado "mais barato".
    const result = welchTTest(samples.a, samples.b)
    expect(result.significant).toBe(true)
    expect(result.avgB).toBeGreaterThan(result.avgA)
  })

  it('determinismo: re-rodar as 20 amostras produz exatamente os mesmos objetivos', () => {
    const again = runAb(20)
    expect(again.a).toEqual(samples.a)
    expect(again.b).toEqual(samples.b)
  })
})
