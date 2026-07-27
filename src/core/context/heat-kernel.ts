/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Heat-kernel relevance — diffusion on the graph Laplacian `e^{-tL}`.
 *
 * Anchor: Kondor & Lafferty (2002) diffusion kernels on graphs; spectral graph theory.
 * Biological echo: activity spreads by diffusion in neural tissue (Rall cable theory,
 * neurotransmitter diffusion, spreading activation decaying with synaptic distance).
 * The heat kernel `e^{-tL}` (L = D − A) is the continuous form of that spread: a single
 * `t` (diffusion time) tunes relevance from purely local (small t — like the Flow
 * engine's `e^{-λd}`) to global (large t — toward PageRank-like reach), in the same
 * ~1k-token repo-map budget.
 *
 * Pure & deterministic. Computes `e^{-tL} e_seed` via a truncated matrix power series
 * `Σ_{k} (−t)^k L^k e_seed / k!` — exact enough for small context neighbourhoods.
 */

import { McpGraphError } from '../utils/errors.js'

export interface DiffusionGraph {
  nodes: string[]
  edges: Array<[string, string]>
}

export interface HeatKernelOptions {
  /** Diffusion time. Small ⇒ local; large ⇒ global. Default 0.5. */
  t?: number
  /** Power-series truncation order. Default 30. */
  order?: number
}

/**
 * Heat-kernel relevance of every node to `seed` under diffusion time `t`.
 * Returns a map node → relevance in [0, 1] (seed starts at 1, heat conserves/spreads).
 */
export function heatKernelRelevance(
  graph: DiffusionGraph,
  seed: string,
  opts: HeatKernelOptions = {},
): Record<string, number> {
  const t = opts.t ?? 0.5
  const order = opts.order ?? 30
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((id, i) => [id, i]))
  const seedIdx = index.get(seed)
  if (seedIdx === undefined) throw new McpGraphError(`heatKernelRelevance: seed "${seed}" not in graph`)

  // Adjacency + degree → Laplacian L = D − A (applied implicitly).
  const adj: number[][] = Array.from({ length: n }, () => [])
  const degree = new Array<number>(n).fill(0)
  for (const [from, to] of graph.edges) {
    const a = index.get(from)
    const b = index.get(to)
    if (a === undefined || b === undefined || a === b) continue
    adj[a].push(b)
    adj[b].push(a)
    degree[a]++
    degree[b]++
  }

  // h = e^{-tL} e_seed = Σ_k term_k, term_0 = e_seed, term_{k} = term_{k-1} · (−t/k) · L
  const term = new Array<number>(n).fill(0)
  term[seedIdx] = 1
  const result = term.slice()

  for (let k = 1; k <= order; k++) {
    const lApplied = applyLaplacian(term, adj, degree)
    const scale = -t / k
    let maxAbs = 0
    for (let i = 0; i < n; i++) {
      term[i] = lApplied[i] * scale
      result[i] += term[i]
      const a = Math.abs(term[i])
      if (a > maxAbs) maxAbs = a
    }
    if (maxAbs < 1e-12) break // series converged
  }

  const out: Record<string, number> = {}
  graph.nodes.forEach((id, i) => {
    out[id] = clampTiny(result[i])
  })
  return out
}

/** (L v)_i = degree_i · v_i − Σ_{j~i} v_j  with L = D − A. */
function applyLaplacian(v: number[], adj: number[][], degree: number[]): number[] {
  const out = new Array<number>(v.length).fill(0)
  for (let i = 0; i < v.length; i++) {
    let neighbourSum = 0
    for (const j of adj[i]) neighbourSum += v[j]
    out[i] = degree[i] * v[i] - neighbourSum
  }
  return out
}

/** Snap floating-point dust to zero (disconnected nodes stay exactly 0). */
function clampTiny(x: number): number {
  return Math.abs(x) < 1e-9 ? 0 : x
}
