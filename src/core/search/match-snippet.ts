/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { suffixArray, suffixArraySearch } from '../algorithms/string/suffix-array.js'

const DEFAULT_CONTEXT_CHARS = 40

/**
 * Locate `query` in `text` (case-insensitive, first occurrence) and return a
 * surrounding context window, ellipsis-clipped at either end. Returns
 * `undefined` when `text`/`query` is empty or the query does not occur.
 */
export function buildMatchSnippet(
  text: string,
  query: string,
  contextChars: number = DEFAULT_CONTEXT_CHARS,
): string | undefined {
  if (!text || !query) return undefined

  const sa = suffixArray(text.toLowerCase())
  const matchIndex = suffixArraySearch(sa, query.toLowerCase())
  if (matchIndex === -1) return undefined

  const start = Math.max(0, matchIndex - contextChars)
  const end = Math.min(text.length, matchIndex + query.length + contextChars)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}
