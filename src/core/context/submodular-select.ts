/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Submodular Select — seleção de contexto por facility-location + CELF lazy-greedy
 * sob knapsack de tokens (E1.T1, node_073e205ab7cf; contract node_0b2652135f9c;
 * PACMS arXiv 2606.20047, apricot/JMLR 2020).
 *
 * Facility-location f(X) = Σ_y max_{x∈X} sim(x,y) é monótona submodular ⇒ o guloso
 * dá garantia (1−1/e). CELF acelera o guloso reavaliando preguiçosamente só os
 * candidatos no topo da fila de ganhos marginais (não-crescentes por submodularidade),
 * mantendo as MESMAS escolhas do guloso ingênuo a uma fração do custo. Determinístico:
 * ordem estável por id + desempate por índice. Similaridade = cosseno sobre vetores
 * binários de termos (tokenizador unificado, zero deps de embedding).
 *
 * Escala: o ground-set Y é amostrado deterministicamente acima de {@link GROUND_CAP}
 * (n≤cap usa o conjunto completo) — mantém a passada O(n·|Y|) barata em n grande sem
 * perder a semântica de cobertura representativa.
 */

import { tokenize } from '../search/tokenizer.js'

export interface SelectionCandidate {
  id: string
  text: string
  /** Custo em tokens (fonte: estimateTokens, token-estimator.ts). */
  tokens: number
}

export interface SelectionResult {
  picked: string[]
  /** Valor da facility-location sobre o ground-set otimizado. */
  objective: number
  elapsedMs: number
}

/**
 * Acima deste n, o ground-set Y é amostrado (stochastic facility location — apricot
 * JMLR 2020); abaixo, usa-se o conjunto completo. Mantém a 1ª passada O(n·cap) barata
 * em n grande sem perder cobertura representativa. n≤cap ⇒ objetivo exato (AC1).
 */
export const GROUND_CAP = 128

/** Vetor de termos como conjunto de ids ordenados (interseção rápida). */
interface TermSet {
  ids: number[]
  size: number
}

function buildTermSets(candidates: readonly SelectionCandidate[]): { sets: TermSet[]; index: Map<string, number> } {
  const index = new Map<string, number>()
  const sets: TermSet[] = []
  for (const c of candidates) {
    const ids = new Set<number>()
    for (const term of tokenize(c.text, { stopwords: false, accentStrip: false })) {
      let id = index.get(term)
      if (id === undefined) {
        id = index.size
        index.set(term, id)
      }
      ids.add(id)
    }
    const sorted = [...ids].sort((a, b) => a - b)
    sets.push({ ids: sorted, size: sorted.length })
  }
  return { sets, index }
}

/** Cosseno binário: |a∩b| / sqrt(|a|·|b|). Conjuntos ordenados ⇒ interseção linear. */
function cosine(a: TermSet, b: TermSet): number {
  if (a.size === 0 || b.size === 0) return 0
  let i = 0
  let j = 0
  let inter = 0
  while (i < a.size && j < b.size) {
    const x = a.ids[i]
    const y = b.ids[j]
    if (x === y) {
      inter += 1
      i += 1
      j += 1
    } else if (x < y) i += 1
    else j += 1
  }
  return inter / Math.sqrt(a.size * b.size)
}

/** Ground-set determinístico: completo até GROUND_CAP; senão amostra por passo constante. */
function groundIndices(n: number): number[] {
  if (n <= GROUND_CAP) return Array.from({ length: n }, (_, i) => i)
  const stride = n / GROUND_CAP
  const out: number[] = []
  for (let k = 0; k < GROUND_CAP; k += 1) out.push(Math.floor(k * stride))
  return out
}

/**
 * f(selected) sobre o ground-set `ground` (default: todos os candidatos). Puro:
 * usado pelo guloso E como oráculo de referência nos testes.
 */
export function facilityLocationObjective(
  selected: readonly SelectionCandidate[],
  ground: readonly SelectionCandidate[],
): number {
  if (selected.length === 0) return 0
  const selSets = buildTermSetsAligned(selected)
  const grdSets = buildTermSetsAligned(ground, selSets.index)
  let total = 0
  for (const g of grdSets.sets) {
    let best = 0
    for (const s of selSets.sets) {
      const sim = cosine(s, g)
      if (sim > best) best = sim
    }
    total += best
  }
  return total
}

/** buildTermSets com índice de termos compartilhável (p/ o oráculo dos testes). */
function buildTermSetsAligned(
  candidates: readonly SelectionCandidate[],
  shared?: Map<string, number>,
): { sets: TermSet[]; index: Map<string, number> } {
  const index = shared ?? new Map<string, number>()
  const sets: TermSet[] = []
  for (const c of candidates) {
    const ids = new Set<number>()
    for (const term of tokenize(c.text, { stopwords: false, accentStrip: false })) {
      let id = index.get(term)
      if (id === undefined) {
        id = index.size
        index.set(term, id)
      }
      ids.add(id)
    }
    const sorted = [...ids].sort((a, b) => a - b)
    sets.push({ ids: sorted, size: sorted.length })
  }
  return { sets, index }
}

/**
 * Seleção CELF sob knapsack. Determinística. Escolhe iterativamente o candidato de
 * maior ganho marginal que ainda cabe no budget, reavaliando preguiçosamente a fila.
 */
export function selectSubmodular(candidates: readonly SelectionCandidate[], budgetTokens: number): SelectionResult {
  const t0 = performance.now()
  if (candidates.length === 0 || budgetTokens <= 0) {
    return { picked: [], objective: 0, elapsedMs: performance.now() - t0 }
  }

  const { sets } = buildTermSets(candidates)
  const gIdx = groundIndices(candidates.length)
  const n = candidates.length

  // coverage[y] = maior sim entre o ground-set y e algum candidato já escolhido.
  const coverage = new Float64Array(gIdx.length)

  /** Ganho marginal de adicionar o candidato `ci`: Σ_y max(0, sim(ci,y) − coverage[y]). */
  const marginalGain = (ci: number): number => {
    const a = sets[ci]
    let gain = 0
    for (let k = 0; k < gIdx.length; k += 1) {
      const sim = cosine(a, sets[gIdx[k]])
      const delta = sim - coverage[k]
      if (delta > 0) gain += delta
    }
    return gain
  }

  // CELF: max-heap binário (gain desc; empate → ci asc para determinismo). Cada
  // entrada carrega o `iter` da última reavaliação — stale ⇒ recomputa e re-insere.
  const heap = new MarginalHeap()
  for (let ci = 0; ci < n; ci += 1) heap.push({ ci, gain: marginalGain(ci), iter: 0 })

  const pickedIdx: number[] = []
  const selected = new Uint8Array(n)
  let spent = 0
  let iter = 0

  while (spent < budgetTokens && heap.size() > 0) {
    iter += 1
    let chosen = -1
    // Reavaliação preguiçosa: extrai o topo; descarta selecionados/inviáveis;
    // se stale, recomputa e re-insere; se fresco (iter atual), é o ótimo do passo.
    for (;;) {
      const entry = heap.pop()
      if (!entry) break
      if (selected[entry.ci]) continue
      if (candidates[entry.ci].tokens + spent > budgetTokens) continue // inviável agora e sempre (budget só cai)
      if (entry.iter === iter) {
        chosen = entry.ci
        break
      }
      entry.gain = marginalGain(entry.ci)
      entry.iter = iter
      heap.push(entry)
    }
    if (chosen === -1) break

    // aplica o pick: atualiza coverage
    const a = sets[chosen]
    for (let k = 0; k < gIdx.length; k += 1) {
      const sim = cosine(a, sets[gIdx[k]])
      if (sim > coverage[k]) coverage[k] = sim
    }
    selected[chosen] = 1
    pickedIdx.push(chosen)
    spent += candidates[chosen].tokens
  }

  const picked = pickedIdx.map((i) => candidates[i].id)
  let objective = 0
  for (const cov of coverage) objective += cov
  return { picked, objective, elapsedMs: performance.now() - t0 }
}

interface HeapEntry {
  ci: number
  gain: number
  iter: number
}

/**
 * Max-heap binário para o CELF: raiz = maior ganho marginal (empate → menor ci,
 * para determinismo). O(log n) por push/pop — substitui o re-sort O(n log n) que
 * dominava o custo em n grande.
 */
class MarginalHeap {
  private readonly data: HeapEntry[] = []

  size(): number {
    return this.data.length
  }

  /** true quando `a` precede `b` (maior ganho; empate → menor ci). */
  private before(a: HeapEntry, b: HeapEntry): boolean {
    return a.gain > b.gain || (a.gain === b.gain && a.ci < b.ci)
  }

  push(entry: HeapEntry): void {
    const d = this.data
    d.push(entry)
    let i = d.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.before(d[i], d[parent])) {
        ;[d[i], d[parent]] = [d[parent], d[i]]
        i = parent
      } else break
    }
  }

  pop(): HeapEntry | undefined {
    const d = this.data
    if (d.length === 0) return undefined
    const top = d[0]
    const last = d.pop()!
    if (d.length > 0) {
      d[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let best = i
        if (l < d.length && this.before(d[l], d[best])) best = l
        if (r < d.length && this.before(d[r], d[best])) best = r
        if (best === i) break
        ;[d[i], d[best]] = [d[best], d[i]]
        i = best
      }
    }
    return top
  }
}
