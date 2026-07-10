/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * feature-extractor — TF-IDF distinctive term extraction per repo/subdir.
 *
 * WHY: capability-lexicon.ts covers 26 known tags but misses unknown capabilities.
 * TF-IDF over README+manifests surfaces distinctive signals outside the lexicon,
 * elevating recall for marketplace/scaffolder matching without touching the lexicon.
 *
 * Algorithm: Sparck Jones IDF × term frequency (TF-IDF); optional BM25 extension
 * available by swapping scoreTerms. Stopwords filtered via a compact top-100 list.
 *
 * Composing: repo-scanner.ts feeds CorpusDocument[]; insight-report.ts consumes
 * FeatureResult[]; capability-lexicon.ts provides complementary known-tag detection.
 *
 * Extension: extractFeaturesWithForageStop — wires forage-stop.ts (MVT/Charnov)
 * so deep repo reads halt when marginal new-term gain drops below threshold.
 * Purely additive; default behaviour unchanged.
 */

import { forageStop } from '../economy/forage-stop.js'

export interface CorpusDocument {
  /** Stable identifier — file path, repo name, or subdir label. */
  id: string
  /** Full text (README + manifests + exported symbol names concatenated). */
  text: string
}

export interface TermScore {
  term: string
  /** TF-IDF score (higher = more distinctive). */
  score: number
}

export interface FeatureResult {
  docId: string
  terms: TermScore[]
}

export interface FeatureExtractorOptions {
  /** Maximum number of top-scoring terms to return (default 10). */
  topN?: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the',
  'and',
  'of',
  'to',
  'in',
  'is',
  'it',
  'that',
  'was',
  'for',
  'on',
  'are',
  'as',
  'with',
  'his',
  'they',
  'at',
  'be',
  'this',
  'from',
  'or',
  'an',
  'will',
  'have',
  'by',
  'not',
  'but',
  'we',
  'you',
  'which',
  'if',
  'their',
  'said',
  'he',
  'she',
  'do',
  'its',
  'up',
  'been',
  'more',
  'can',
  'so',
  'all',
  'about',
  'out',
  'who',
  'get',
  'my',
  'no',
  'me',
  'than',
  'one',
  'also',
  'has',
  'your',
  'there',
  'would',
  'into',
  'other',
  'new',
  'how',
  'some',
  'what',
  'these',
  'use',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  // Normalize by document length
  const len = tokens.length || 1
  for (const [k, v] of tf) tf.set(k, v / len)
  return tf
}

function buildIdf(docs: Map<string, string[]>): Map<string, number> {
  const N = docs.size
  const df = new Map<string, number>()
  for (const tokens of docs.values()) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const idf = new Map<string, number>()
  for (const [term, count] of df) {
    // Sparck Jones IDF: log((N - df + 0.5) / (df + 0.5))  clamped to 0
    idf.set(term, Math.max(0, Math.log((N - count + 0.5) / (count + 0.5))))
  }
  return idf
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the top distinctive terms for a single document within a corpus.
 * Scores are TF × IDF (Sparck Jones). High-frequency background terms are
 * automatically demoted because their IDF approaches zero.
 */
export function extractDistinctiveFeatures(
  corpus: CorpusDocument[],
  docId: string,
  options: FeatureExtractorOptions = {},
): FeatureResult {
  const topN = options.topN ?? 10

  // Build tokenized corpus
  const tokenMap = new Map<string, string[]>()
  for (const d of corpus) tokenMap.set(d.id, tokenize(d.text))

  const target = tokenMap.get(docId)
  if (!target) return { docId, terms: [] }

  const idf = buildIdf(tokenMap)
  const tf = termFrequency(target)

  const scores: TermScore[] = []
  for (const [term, tfScore] of tf) {
    const idfScore = idf.get(term) ?? 0
    const tfidf = tfScore * idfScore
    if (tfidf > 0) scores.push({ term, score: tfidf })
  }

  scores.sort((a, b) => b.score - a.score)

  return { docId, terms: scores.slice(0, topN) }
}

// ---------------------------------------------------------------------------
// Forage-stop extension
// ---------------------------------------------------------------------------

export interface ForageExtractOptions extends FeatureExtractorOptions {
  /**
   * When true, apply MVT/Charnov early-stop: halt after reading files whose
   * marginal new-term gain falls below the environment average.
   * Default: false (byte-identical to original behaviour).
   */
  enableForageStop?: boolean
  /** Minimum docs to read even if gain drops immediately. Default: 1. */
  minDocs?: number
}

export interface ForageExtractResult {
  /** Features extracted from the docs that were actually read. */
  features: FeatureResult[]
  /** Number of docs read before forage-stop fired (or total if disabled). */
  docsRead: number
}

/**
 * Extract TF-IDF features from `docs`, optionally halting early (opt-in via
 * `enableForageStop`) when marginal new-token gain drops below MVT threshold.
 *
 * Gain of a document = count of tokens it adds that are NOT already in the
 * accumulated seen-token set. Documents with high marginal novelty are kept;
 * the tail of diminishing returns is pruned by `forageStop`.
 */
export function extractFeaturesWithForageStop(
  docs: CorpusDocument[],
  options: ForageExtractOptions = {},
): ForageExtractResult {
  if (!options.enableForageStop) {
    const features = docs.map((d) => extractDistinctiveFeatures(docs, d.id, { topN: options.topN }))
    return { features, docsRead: docs.length }
  }

  // Compute marginal gain per doc: new unique tokens contributed
  const seen = new Set<string>()
  const gains: number[] = []
  const tokenLists: string[][] = []

  for (const doc of docs) {
    const tokens = tokenize(doc.text)
    tokenLists.push(tokens)
    const newTokens = tokens.filter((t) => !seen.has(t))
    gains.push(newTokens.length)
    for (const t of newTokens) seen.add(t)
  }

  const forageItems = gains.map((gain, i) => ({ gain, tokens: tokenLists[i]!.length }))
  const { keptCount } = forageStop(forageItems, { minItems: options.minDocs ?? 1 })

  const keptDocs = docs.slice(0, keptCount)
  const features = keptDocs.map((d) => extractDistinctiveFeatures(keptDocs, d.id, { topN: options.topN }))

  return { features, docsRead: keptCount }
}
