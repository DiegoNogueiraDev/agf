/*!
 * WHY: RAG-IN corpus should not rebuild on every retrieve call — the command set
 * rarely changes. This module provides a deterministic hash-based cache so the
 * sub-command enrichment step is a no-op when nothing changed (AC2) and rebuilds
 * automatically when the set grows (AC3).
 *
 * Composes with: builtin-corpus.ts (caller), command-chunk.ts (types).
 * Contract: `buildSubcommandCorpus(base, buildFn)` returns the same reference on
 * cache hit; calls `buildFn` only when the hash of `base` changes.
 */

import { createHash } from 'node:crypto'
import type { CommandChunk } from './command-chunk.js'

interface SubcommandCache {
  hash: string
  result: CommandChunk[]
}

let cache: SubcommandCache | null = null

function hashChunks(chunks: readonly CommandChunk[]): string {
  const key = chunks
    .map((c) => c.id)
    .sort()
    .join('|')
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/**
 * Return cached sub-command corpus when the base chunk set is unchanged.
 * `buildFn` is called exactly once per unique base hash — never on a cache hit.
 * Useful for enrichment that is expensive (async module loads, commander walks).
 */
export function buildSubcommandCorpus(
  base: readonly CommandChunk[],
  buildFn: (base: readonly CommandChunk[]) => CommandChunk[],
): CommandChunk[] {
  const h = hashChunks(base)
  if (cache && cache.hash === h) return cache.result
  const result = buildFn(base)
  cache = { hash: h, result }
  return result
}

/** Reset the cache — for testing only. */
export function clearSubcommandCache(): void {
  cache = null
}
