/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Retrieve + Rank — recuperação RAG (lexical, determinística) + ranking estável
 * dos scaffolds candidatos para um node. 0 LLM.
 *
 * Retrieval: sobreposição de termos (família BM25/TF-IDF — Robertson & Zaragoza
 * 2009) entre o texto do requisito (título+descrição+tags+AC) e os keywords/
 * capabilities de cada entry do registry + padrões do corpus. Ranking: ordenação
 * estável e reproduzível (`deterministicRank`, CLRS Parte II) com peso opcional
 * do histórico de sucesso (sona-router kNN). Vetorial (hybridSearch) é
 * enriquecimento plugável quando embeddings estão disponíveis.
 */
import { SCAFFOLD_REGISTRY, type ScaffoldEntry, type ScaffoldKind } from './registry.js'
import { deterministicRank } from '../search/deterministic-ranker.js'

/** Subconjunto estrutural de GraphNode necessário para recuperar/ranquear. */
export interface RankableNode {
  readonly title: string
  readonly description?: string | null
  readonly tags?: readonly string[]
  readonly acceptanceCriteria?: readonly string[]
}

export interface RankedScaffold {
  readonly kind: ScaffoldKind
  readonly score: number
  readonly entry: ScaffoldEntry
}

export interface RankOptions {
  /** Peso por kind vindo do histórico de sucesso (sona-router). Default 0. */
  readonly perfBoost?: Readonly<Partial<Record<ScaffoldKind, number>>>
}

/** Texto do requisito, normalizado, para retrieval lexical. */
export function nodeRequirementText(node: RankableNode): string {
  return [node.title, node.description ?? '', ...(node.tags ?? []), ...(node.acceptanceCriteria ?? [])]
    .join(' ')
    .toLowerCase()
}

/** Tokeniza em termos alfanuméricos (mín. 3 chars) — determinístico. */
function terms(text: string): Set<string> {
  return new Set(
    text
      .split(/[^a-z0-9]+/i)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3),
  )
}

/** Score lexical: quantos keywords/capabilities da entry aparecem no requisito. */
function lexicalScore(entry: ScaffoldEntry, requirement: Set<string>): number {
  let hits = 0
  for (const kw of [...entry.keywords, ...entry.capabilities]) {
    if (requirement.has(kw.toLowerCase())) hits++
  }
  return hits
}

/**
 * Ranqueia os scaffolds do registry para um node. Retorna apenas os com score > 0
 * (relevantes), em ordem determinística. `perfBoost` soma o histórico de sucesso.
 */
export function rankScaffolds(node: RankableNode, opts: RankOptions = {}): RankedScaffold[] {
  const requirement = terms(nodeRequirementText(node))
  const scored = SCAFFOLD_REGISTRY.map((entry) => {
    const base = lexicalScore(entry, requirement)
    const boost = opts.perfBoost?.[entry.kind] ?? 0
    return { id: entry.kind, score: base + boost, entry, kind: entry.kind }
  })
  return deterministicRank(scored)
    .filter((s) => s.score > 0)
    .map((s) => ({ kind: s.kind, score: s.score, entry: s.entry }))
}
