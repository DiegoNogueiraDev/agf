/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface SuffixArrayResult {
  text: string
  suffixArray: number[]
  lcp?: number[]
}

function buildSuffixArray(text: string): number[] {
  const n = text.length
  const suffixes: Array<{ idx: number; suff: string }> = []
  for (let i = 0; i < n; i++) suffixes.push({ idx: i, suff: text.slice(i) })
  // Ordinal compare — must match the plain `<` comparator used by suffixArraySearch's
  // binary search, or the two orderings can disagree (e.g. on punctuation/digits vs
  // letters) and silently break the search invariant.
  suffixes.sort((a, b) => (a.suff < b.suff ? -1 : a.suff > b.suff ? 1 : 0))
  return suffixes.map((s) => s.idx)
}

export function suffixArray(text: string): SuffixArrayResult {
  const sa = buildSuffixArray(text)
  return { text, suffixArray: sa }
}

export function suffixArraySearch(result: SuffixArrayResult, pattern: string): number {
  const { text, suffixArray } = result
  let lo = 0,
    hi = suffixArray.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const suffix = text.slice(suffixArray[mid]!)
    if (suffix.startsWith(pattern)) return suffixArray[mid]!
    if (suffix < pattern) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}
