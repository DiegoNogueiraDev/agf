/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Glossary builder — deterministic extraction of top-N domain-specific terms
 * from a corpus of text + source pairs. Reuses the TF-based frequency approach
 * from zipf-estimator.ts (high local TF, low global / stop-word frequency).
 *
 * Zero LLM calls. Pure function: same input → same output.
 * Composing: compact-context barrel (exported via compact-context.ts).
 */

/** A single glossary entry. */
export interface GlossaryEntry {
  term: string
  /** One-line definition derived from the corpus context sentence. */
  definition: string
  /** Source file/document where the term appears most. */
  source: string
  /** Number of times the term appears across the corpus. */
  frequency: number
}

export interface GlossaryOptions {
  /** Maximum number of terms to return. Default: 20. */
  topN?: number
  /** Minimum term length to consider. Default: 4 characters. */
  minTermLen?: number
}

export interface CorpusEntry {
  text: string
  source: string
}

// English stop words to exclude from the glossary (high global frequency).
const STOP_WORDS = new Set([
  'the',
  'and',
  'is',
  'of',
  'to',
  'in',
  'that',
  'this',
  'with',
  'for',
  'are',
  'was',
  'has',
  'have',
  'been',
  'from',
  'by',
  'at',
  'an',
  'a',
  'it',
  'its',
  'be',
  'as',
  'or',
  'but',
  'not',
  'on',
  'he',
  'she',
  'they',
  'we',
  'you',
  'all',
  'can',
  'will',
  'do',
  'so',
  'if',
  'up',
  'out',
  'no',
  'our',
  'one',
  'per',
  'via',
  'each',
  'use',
  'used',
  'uses',
  'using',
  'new',
  'into',
  'also',
  'any',
  'how',
  'than',
  'more',
  'only',
  'when',
  'then',
  'there',
  'where',
  'which',
  'their',
  'they',
  'what',
  'who',
  'over',
  'same',
  'such',
  'about',
  'after',
  'before',
  'between',
])

/** Tokenize text into candidate terms.
 *  Emits both whole PascalCase/camelCase identifiers (e.g. TokenLedger) and
 *  their individual parts (Token, Ledger) so both the compound and its components
 *  are considered.
 */
function tokenize(text: string): string[] {
  const SEP = /[\s,.(){}[\]<>:;/\\'"!?@#$%^&*+=|~`]+/
  const wholeWords = text
    .split(SEP)
    .map((t) => t.trim())
    .filter(Boolean)
  const splitParts = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(SEP)
    .map((t) => t.trim())
    .filter(Boolean)
  // Dedup while preserving order: whole words first (so PascalCase terms win display)
  const seen = new Set<string>()
  const result: string[] = []
  for (const t of [...wholeWords, ...splitParts]) {
    if (!seen.has(t)) {
      seen.add(t)
      result.push(t)
    }
  }
  return result
}

/** Build TF map: term → {count, sources} */
function buildTf(corpus: CorpusEntry[], minLen: number): Map<string, { count: number; sources: string[] }> {
  const tf = new Map<string, { count: number; sources: string[] }>()
  for (const entry of corpus) {
    const tokens = tokenize(entry.text)
    for (const raw of tokens) {
      const term = raw.toLowerCase()
      if (term.length < minLen) continue
      if (STOP_WORDS.has(term)) continue
      // Also keep original casing for display (prefer PascalCase)
      const display = /^[A-Z]/.test(raw) ? raw : term
      const key = display
      const existing = tf.get(key)
      if (existing) {
        existing.count += 1
        if (!existing.sources.includes(entry.source)) existing.sources.push(entry.source)
      } else {
        tf.set(key, { count: 1, sources: [entry.source] })
      }
    }
  }
  return tf
}

/** Find the first sentence in the corpus that contains the term (for definition). */
function findDefinitionSentence(term: string, corpus: CorpusEntry[]): string {
  const lc = term.toLowerCase()
  for (const entry of corpus) {
    const sentences = entry.text.split(/(?<=[.!?])\s+/)
    for (const s of sentences) {
      if (s.toLowerCase().includes(lc)) {
        // Trim to 1 line max
        const clean = s.trim().replace(/\s+/g, ' ')
        return clean.length > 120 ? clean.slice(0, 117) + '…' : clean
      }
    }
  }
  return `${term} — domain term extracted from corpus.`
}

/**
 * Build a glossary of top-N domain-specific terms from the corpus.
 * Deterministic: sorts by frequency desc, then term asc to break ties.
 */
export function buildGlossary(corpus: CorpusEntry[], opts: GlossaryOptions = {}): GlossaryEntry[] {
  const topN = opts.topN ?? 20
  const minLen = opts.minTermLen ?? 4

  const tf = buildTf(corpus, minLen)

  // Sort: frequency desc, term asc (deterministic tie-breaking)
  const ranked = [...tf.entries()].sort(([a, ac], [b, bc]) => {
    if (bc.count !== ac.count) return bc.count - ac.count
    return a.localeCompare(b)
  })

  const results: GlossaryEntry[] = []
  for (const [term, { count, sources }] of ranked) {
    if (results.length >= topN) break
    const definition = findDefinitionSentence(term, corpus)
    results.push({
      term,
      definition,
      source: sources[0],
      frequency: count,
    })
  }
  return results
}
