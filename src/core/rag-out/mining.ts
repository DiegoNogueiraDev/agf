/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-OUT history mining (PRD 2.4) — promote recurring "generate" outputs into
 * scaffold candidates. When the gate falls to the LLM and the same shape recurs,
 * its structure is worth parametrizing and indexing: what is "new and expensive"
 * today becomes "recoverable and cheap" tomorrow.
 *
 * Pure and deterministic: greedy Jaccard clustering of goal token-sets, then
 * filter by a frequency floor. The shared tokens of a cluster become its fit
 * tags; the candidate is surfaced (with examples) for human review before it is
 * actually promoted into the scaffold corpus.
 */

export interface ScaffoldCandidate {
  suggestedId: string
  /** Tokens common to every goal in the cluster — the adequacy signal. */
  fitTags: string[]
  count: number
  examples: string[]
  /** Language of the artifact that generated this candidate (for cross-language guard). */
  language?: string
}

export interface MiningOptions {
  /** Min goals in a cluster to qualify as a candidate. */
  minFrequency?: number
  /** Jaccard similarity to join a cluster [0,1]. */
  similarity?: number
  /** Language of the artifacts being mined — propagated to each candidate. */
  language?: string
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'with',
  'into',
  'build',
  'write',
  'create',
  'make',
  'draft',
  'about',
  'using',
  'use',
  'one',
  'off',
  'um',
  'uma',
  'o',
  'os',
  'as',
  'de',
  'da',
  'do',
  'em',
  'para',
  'e',
  'com',
])

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

interface Cluster {
  tokenSets: Set<string>[]
  goals: string[]
}

const DEFAULT_MIN_FREQUENCY = 2
const DEFAULT_SIMILARITY = 0.5

export function mineScaffoldCandidates(goals: readonly string[], opts: MiningOptions = {}): ScaffoldCandidate[] {
  const minFreq = opts.minFrequency ?? DEFAULT_MIN_FREQUENCY
  const simThreshold = opts.similarity ?? DEFAULT_SIMILARITY
  if (goals.length === 0) return []

  const clusters: Cluster[] = []
  for (const goal of goals) {
    const tokens = new Set(contentTokens(goal))
    if (tokens.size === 0) continue
    // Join the first cluster whose representative (first member) is similar enough.
    const match = clusters.find((c) => jaccard(c.tokenSets[0]!, tokens) >= simThreshold)
    if (match) {
      match.tokenSets.push(tokens)
      match.goals.push(goal)
    } else {
      clusters.push({ tokenSets: [tokens], goals: [goal] })
    }
  }

  return clusters
    .filter((c) => c.goals.length >= minFreq)
    .map((c) => {
      // fitTags = tokens present in EVERY goal of the cluster (intersection).
      const intersection = [...c.tokenSets[0]!].filter((t) => c.tokenSets.every((s) => s.has(t)))
      const fitTags = intersection.sort()
      const candidate: ScaffoldCandidate = {
        suggestedId: fitTags.slice(0, 3).join('-') || 'scaffold-candidate',
        fitTags,
        count: c.goals.length,
        examples: c.goals.slice(0, 5),
      }
      if (opts.language) candidate.language = opts.language
      return candidate
    })
    .sort((a, b) => b.count - a.count)
}
