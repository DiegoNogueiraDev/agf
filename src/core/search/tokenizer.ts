/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Unified tokenizer for all text processing pipelines.
 * Handles Portuguese and English text with configurable options.
 *
 * Replaces 3 previous inconsistent tokenizers:
 * - search/tokenizer.ts (accents + PT/EN stopwords)
 * - context/bm25-compressor.ts bm25Tokenize() (no accents, no stopwords)
 * - rag/rag-pipeline.ts tokenize() (EN-only stopwords)
 */

export interface TokenizeOptions {
  /** Remove stopwords (default: true) */
  stopwords?: boolean
  /** Strip accents via NFD normalization (default: true) */
  accentStrip?: boolean
  /** Apply stemming (default: false) — requires language */
  stemming?: boolean
  /** Language for stopwords/stemming: 'all' | 'en' | 'pt' (default: 'all') */
  language?: 'all' | 'en' | 'pt'
}

const STOPWORDS_PT = new Set([
  'a',
  'o',
  'e',
  'é',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'um',
  'uma',
  'uns',
  'umas',
  'por',
  'para',
  'com',
  'sem',
  'que',
  'se',
  'ou',
  'ao',
  'aos',
  'como',
  'mais',
  'mas',
  'este',
  'esta',
  'esse',
  'essa',
  'não',
  'nao',
  'ser',
  'ter',
  'foi',
  'são',
  'sao',
])

const STOPWORDS_EN = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'of',
  'in',
  'to',
  'for',
  'with',
  'on',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'and',
  'but',
  'or',
  'not',
  'no',
  'if',
  'it',
  'its',
  'this',
  'that',
  'they',
  'we',
  'he',
  'she',
  'you',
  'i',
  'me',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
  'what',
  'which',
  'who',
  'when',
  'where',
  'how',
])

const STOPWORDS_ALL = new Set([...STOPWORDS_PT, ...STOPWORDS_EN])

// ── Lightweight Snowball-inspired stemmers ──────────────

/**
 * Lightweight English stemmer (Porter-like suffix stripping).
 * Handles common suffixes without external dependencies.
 */
function stemEnglish(word: string): string {
  if (word.length <= 3) return word

  // Step 1: -ing, -ed, -ly, -tion, -ment, -ness, -able, -ible, -ous, -ive
  let stem = word
  if (stem.endsWith('isations') || stem.endsWith('izations')) {
    stem = stem.slice(0, -8)
  } else if (stem.endsWith('isation') || stem.endsWith('ization')) {
    stem = stem.slice(0, -7)
  } else if (stem.endsWith('ations')) {
    stem = stem.slice(0, -6)
  } else if (stem.endsWith('ation')) {
    stem = stem.slice(0, -5)
  } else if (stem.endsWith('fulness')) {
    stem = stem.slice(0, -7) + 'ful'
  } else if (stem.endsWith('ousness')) {
    stem = stem.slice(0, -7) + 'ous'
  } else if (stem.endsWith('iveness')) {
    stem = stem.slice(0, -7) + 'ive'
  } else if (stem.endsWith('ments')) {
    stem = stem.slice(0, -5)
  } else if (stem.endsWith('ment')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ness')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ings')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('able') || stem.endsWith('ible')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ting')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ing')) {
    stem = stem.slice(0, -3)
    // Handle doubling: running → runn → run
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1)
    }
  } else if (stem.endsWith('tion') || stem.endsWith('sion')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ies')) {
    stem = stem.slice(0, -3) + 'y'
  } else if (stem.endsWith('ous') || stem.endsWith('ive')) {
    stem = stem.slice(0, -3)
  } else if (stem.endsWith('ed')) {
    stem = stem.slice(0, -2)
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      stem = stem.slice(0, -1)
    }
  } else if (stem.endsWith('ly')) {
    stem = stem.slice(0, -2)
  } else if (stem.endsWith('er')) {
    stem = stem.slice(0, -2)
  } else if (stem.endsWith('es')) {
    stem = stem.slice(0, -2)
  } else if (stem.endsWith('s') && !stem.endsWith('ss')) {
    stem = stem.slice(0, -1)
  }

  return stem.length >= 2 ? stem : word
}

/**
 * Lightweight Portuguese stemmer (RSLP-inspired suffix stripping).
 * Handles common PT suffixes without external dependencies.
 */
function stemPortuguese(word: string): string {
  if (word.length <= 3) return word

  let stem = word

  // Step 1: Remove common verb/noun suffixes (longest first)
  if (stem.endsWith('ações') || stem.endsWith('acoes')) {
    stem = stem.slice(0, -5)
  } else if (stem.endsWith('ação') || stem.endsWith('acao')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('mente')) {
    stem = stem.slice(0, -5)
  } else if (stem.endsWith('ando') || stem.endsWith('endo') || stem.endsWith('indo')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ador') || stem.endsWith('edor') || stem.endsWith('idor')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('ante') || stem.endsWith('ente') || stem.endsWith('inte')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('avel') || stem.endsWith('ivel')) {
    stem = stem.slice(0, -4)
  } else if (stem.endsWith('oso') || stem.endsWith('osa')) {
    stem = stem.slice(0, -3)
  } else if (stem.endsWith('ado') || stem.endsWith('ido')) {
    stem = stem.slice(0, -3)
  } else if (stem.endsWith('ais') || stem.endsWith('eis') || stem.endsWith('ois')) {
    stem = stem.slice(0, -3)
  } else if (stem.endsWith('ar') || stem.endsWith('er') || stem.endsWith('ir')) {
    stem = stem.slice(0, -2)
  } else if (stem.endsWith('as') || stem.endsWith('es') || stem.endsWith('os')) {
    stem = stem.slice(0, -2)
  } else if (
    stem.endsWith('al') ||
    stem.endsWith('el') ||
    stem.endsWith('il') ||
    stem.endsWith('ol') ||
    stem.endsWith('ul')
  ) {
    stem = stem.slice(0, -2)
  } else if (stem.endsWith('a') || stem.endsWith('e') || stem.endsWith('o')) {
    stem = stem.slice(0, -1)
  }

  return stem.length >= 2 ? stem : word
}

/**
 * Apply stemming based on language setting.
 * Uses lightweight built-in stemmers (no external deps).
 */
function stem(word: string, language: 'all' | 'en' | 'pt'): string {
  if (language === 'en') return stemEnglish(word)
  if (language === 'pt') return stemPortuguese(word)
  // For 'all': try both stemmers, use the shorter result (more aggressive reduction)
  const en = stemEnglish(word)
  const pt = stemPortuguese(word)
  return en.length <= pt.length ? en : pt
}

/**
 * Unified tokenizer — normalize and tokenize text with configurable options.
 *
 * Default behavior matches the original tokenizer: accent strip + all stopwords + no stemming.
 * Use options to customize for specific pipelines:
 * - BM25: `{ stopwords: false, accentStrip: false }` (raw tokens for frequency counting)
 * - RAG pipeline: default (full processing)
 * - Stemmed search: `{ stemming: true }`
 */
/** Normalize and tokenize text with configurable options. */
export function tokenize(text: string, options?: TokenizeOptions): string[] {
  const opts = {
    stopwords: options?.stopwords ?? true,
    accentStrip: options?.accentStrip ?? true,
    stemming: options?.stemming ?? false,
    language: options?.language ?? ('all' as const),
  }

  // E12-T08: Cap input length to prevent excessive memory usage
  const MAX_INPUT_LENGTH = 500_000
  let normalized = (text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text).toLowerCase()

  if (opts.accentStrip) {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  normalized = normalized
    .replace(/[^a-z0-9_\s\u00e0-\u00ff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return []

  // Select stopword set
  let stopwordSet: Set<string>
  if (!opts.stopwords) {
    stopwordSet = new Set()
  } else if (opts.language === 'en') {
    stopwordSet = STOPWORDS_EN
  } else if (opts.language === 'pt') {
    stopwordSet = STOPWORDS_PT
  } else {
    stopwordSet = STOPWORDS_ALL
  }

  let tokens = normalized.split(' ').filter((t) => t.length >= 2 && !stopwordSet.has(t))

  if (opts.stemming) {
    tokens = tokens.map((t) => stem(t, opts.language))
    // Re-filter after stemming (stem might produce short tokens)
    tokens = tokens.filter((t) => t.length >= 2)
  }

  return tokens
}
