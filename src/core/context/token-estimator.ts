/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Improved token estimation — word-boundary aware heuristic.
 *
 * BPE tokenizers (cl100k_base, Claude) roughly tokenize:
 * - Common English words → 1 token each
 * - Long/uncommon words → 2+ tokens (~1 per 4 chars of word)
 * - Punctuation/symbols → 1 token each
 * - Numbers → ~1 token per 3 digits
 * - Whitespace → merged with adjacent tokens (free)
 *
 * This heuristic counts words and adjusts for length, giving ~10-15% accuracy
 * vs the old ceil(len/4) which had ~20% error.
 */

/** Estimate BPE token count using word-boundary heuristics. */
function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

function isWhitespace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11
}

/** estimateTokens —  */
export function estimateTokens(text: string): number {
  if (!text) return 0

  let tokens = 0
  const len = text.length
  let i = 0

  while (i < len) {
    const code = text.charCodeAt(i)

    if (isWhitespace(code)) {
      i++
      continue
    }

    if (isAsciiLetter(code)) {
      const start = i
      i++
      // Count camelCase transitions as separate sub-words (BPE splits on case boundaries)
      let subWords = 1
      while (i < len && isAsciiLetter(text.charCodeAt(i))) {
        // Detect camelCase: lowercase followed by uppercase
        if (
          i > start &&
          text.charCodeAt(i) >= 65 &&
          text.charCodeAt(i) <= 90 &&
          text.charCodeAt(i - 1) >= 97 &&
          text.charCodeAt(i - 1) <= 122
        ) {
          subWords++
        }
        i++
      }
      const wordLen = i - start
      if (subWords > 1) {
        // camelCase: BPE splits on case boundaries, each sub-word is ~1 token
        tokens += subWords
      } else {
        // E3-T07: words >20 chars use /4 ratio (BPE splits more aggressively on long terms)
        tokens += wordLen <= 6 ? 1 : wordLen > 20 ? Math.ceil(wordLen / 4) : Math.ceil(wordLen / 5)
      }
      continue
    }

    if (isAsciiDigit(code)) {
      const start = i
      i++
      while (i < len && isAsciiDigit(text.charCodeAt(i))) i++
      const digitsLen = i - start
      tokens += Math.ceil(digitsLen / 3)
      continue
    }

    // Symbols/punctuation: 1 token each
    tokens += 1
    i++
  }

  return tokens
}
