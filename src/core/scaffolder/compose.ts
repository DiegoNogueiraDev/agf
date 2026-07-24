/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Compose — monta o plano de scaffolds como quebra-cabeça determinístico.
 *
 * Dado um node que declara as capacidades exigidas e os specs disponíveis,
 * escolhe o conjunto de scaffolds que as cobre via **Set Cover guloso
 * (CLRS §35.3)** — "combinar ou não, infinitas vezes". Sob orçamento de tokens,
 * poda com **0/1 Knapsack DP (CLRS §15)**. O que o corpus não cobrir fica em
 * `uncovered` → sinal de "borda criativa" (única via que gastaria tokens, fatia
 * futura). 0 LLM aqui.
 */
import { getScaffold, type ScaffoldKind, type ScaffoldSpec, type ScaffoldPlanItem } from './registry.js'
import type { RankedScaffold } from './retrieve-rank.js'
import { setCover } from '../algorithms/optimization.js'
import { knapsack01Items } from '../algorithms/dp/knapsack.js'

/** Spec único explícito no node. */
export interface ScaffoldMetaSingle {
  readonly kind: ScaffoldKind
  readonly spec: ScaffoldSpec
}
/** Composição: cobrir `requires` usando os `specs` disponíveis. */
export interface ScaffoldMetaCompose {
  readonly requires: readonly string[]
  readonly specs: Readonly<Partial<Record<ScaffoldKind, ScaffoldSpec>>>
}
export type ScaffoldMeta = ScaffoldMetaSingle | ScaffoldMetaCompose

export interface ComposableNode {
  readonly metadata?: Record<string, unknown> | null
}

export interface ComposedPlan {
  readonly items: ScaffoldPlanItem[]
  readonly universe: string[]
  readonly covered: string[]
  readonly uncovered: string[]
  /** 'needs-llm' = sem spec; 'creative-edge' = corpus não cobre tudo. */
  readonly reason?: 'needs-llm' | 'creative-edge'
}

export interface ComposeOptions {
  /** Teto de "peso" (proxy de tokens) — ativa a poda por knapsack. */
  readonly tokenBudget?: number
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Lê e valida `node.metadata.scaffold` defensivamente. `null` se ausente/inválido. */
export function readScaffoldMeta(node: ComposableNode): ScaffoldMeta | null {
  const raw = node.metadata?.['scaffold']
  if (!isObj(raw)) return null
  if (typeof raw['kind'] === 'string' && isObj(raw['spec']) && getScaffold(raw['kind'])) {
    return { kind: raw['kind'] as ScaffoldKind, spec: raw['spec'] as unknown as ScaffoldSpec }
  }
  if (Array.isArray(raw['requires']) && isObj(raw['specs'])) {
    return {
      requires: (raw['requires'] as unknown[]).filter((r): r is string => typeof r === 'string'),
      specs: raw['specs'] as Partial<Record<ScaffoldKind, ScaffoldSpec>>,
    }
  }
  return null
}

/** Capacidades cobertas por um kind (do registry). */
function capsOf(kind: ScaffoldKind): string[] {
  return [...(getScaffold(kind)?.capabilities ?? [])]
}

/**
 * Compõe o plano determinístico de scaffolds para um node. `ranked` (de
 * retrieve-rank) define a preferência em empates do set-cover.
 */
export function composeScaffoldPlan(
  node: ComposableNode,
  ranked: readonly RankedScaffold[],
  opts: ComposeOptions = {},
): ComposedPlan {
  const meta = readScaffoldMeta(node)
  if (!meta) return { items: [], universe: [], covered: [], uncovered: [], reason: 'needs-llm' }

  // Caminho único: 1 scaffold explícito.
  if ('kind' in meta) {
    const caps = capsOf(meta.kind)
    return { items: [{ kind: meta.kind, spec: meta.spec }], universe: caps, covered: caps, uncovered: [] }
  }

  // Caminho composição: cobrir `requires` com os specs disponíveis (set-cover).
  const universe = [...meta.requires]
  const availableKinds = Object.keys(meta.specs).filter((k): k is ScaffoldKind => Boolean(getScaffold(k)))
  // Ordena os subsets pela preferência do ranking (empate → maior rank vence).
  const rankOrder = new Map(ranked.map((r, i) => [r.kind, i]))
  availableKinds.sort((a, b) => (rankOrder.get(a) ?? 999) - (rankOrder.get(b) ?? 999))

  const subsets = new Map<string, string[]>()
  for (const k of availableKinds) subsets.set(k, capsOf(k))

  const cover = setCover(universe, subsets)
  let selectedKinds = cover.selected as ScaffoldKind[]

  // Poda por orçamento de tokens (knapsack): peso = tamanho do spec; valor = nº caps.
  if (opts.tokenBudget && opts.tokenBudget > 0 && selectedKinds.length > 1) {
    const values = selectedKinds.map((k) => capsOf(k).length)
    const weights = selectedKinds.map((k) => Math.max(1, Math.ceil(JSON.stringify(meta.specs[k]).length / 100)))
    const pick = knapsack01Items(values, weights, opts.tokenBudget)
    if (pick.selected.length > 0) selectedKinds = pick.selected.map((i) => selectedKinds[i])
  }

  const items: ScaffoldPlanItem[] = selectedKinds.map((k) => ({ kind: k, spec: meta.specs[k] as ScaffoldSpec }))
  const coveredSet = new Set<string>()
  for (const k of selectedKinds) for (const c of capsOf(k)) coveredSet.add(c)
  const covered = universe.filter((u) => coveredSet.has(u))
  const uncovered = universe.filter((u) => !coveredSet.has(u))

  return {
    items,
    universe,
    covered,
    uncovered,
    ...(uncovered.length > 0 ? { reason: 'creative-edge' as const } : {}),
  }
}
