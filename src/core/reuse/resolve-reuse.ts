/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_ac6cd10da51b — Decisão de reuso determinístico.
 *
 * `exact`: assinatura idêntica com artefato verde → reusa os edits sem chamar o
 * modelo (~0 tokens). `scaffold`: sem exato, mas um vizinho semântico acima do
 * limiar (finder injetável que usa embeddings) → injeta os edits como hint,
 * cortando re-raciocínio. `none`: gera do zero. Determinística dada a busca.
 */
import type Database from 'better-sqlite3'
import { queryBySignature, type ArtifactEdit } from './artifact-cache.js'

export interface NeighborMatch {
  sourceId: string
  /** Similaridade de cosseno [0,1] do vizinho mais próximo. */
  similarity: number
  edits: ArtifactEdit[]
}

export interface ResolveReuseDeps {
  /** Busca o vizinho semântico mais próximo de uma assinatura (embeddings). */
  findNeighbor?: (signature: string) => NeighborMatch | null
}

export interface ResolveReuseOptions {
  /** Similaridade mínima para aceitar um scaffold. Default 0.85. */
  scaffoldThreshold?: number
}

export type ReuseDecision =
  | { kind: 'exact'; edits: ArtifactEdit[]; sourceId: string }
  | { kind: 'scaffold'; edits: ArtifactEdit[]; sourceId: string; similarity: number }
  | { kind: 'none' }

const DEFAULT_SCAFFOLD_THRESHOLD = 0.7

/**
 * Resolve a estratégia de reuso para uma assinatura de task.
 * Prioridade: exact (verde idêntico) → scaffold (vizinho acima do limiar) → none.
 */
export function resolveReuse(
  db: Database.Database,
  signature: string,
  deps: ResolveReuseDeps = {},
  options: ResolveReuseOptions = {},
): ReuseDecision {
  const exact = queryBySignature(db, signature).find((r) => r.outcome === 'success')
  if (exact && exact.appliedEdits.length > 0) {
    return { kind: 'exact', edits: exact.appliedEdits, sourceId: exact.id }
  }

  const threshold = options.scaffoldThreshold ?? DEFAULT_SCAFFOLD_THRESHOLD
  const neighbor = deps.findNeighbor?.(signature)
  if (neighbor && neighbor.similarity >= threshold && neighbor.edits.length > 0) {
    return { kind: 'scaffold', edits: neighbor.edits, sourceId: neighbor.sourceId, similarity: neighbor.similarity }
  }

  return { kind: 'none' }
}
