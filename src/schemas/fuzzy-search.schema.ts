/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S3.1 — Fuzzy file search com scoring (port do algoritmo nucleo do Codex).
 */

export interface FuzzyResult {
  file: string
  score: number
  matches: number[]
}

/** Ranks file paths against a query, returning non-zero matches sorted by descending score. */
export function fuzzySearch(query: string, files: string[]): FuzzyResult[] {
  if (!query.trim()) return []

  const scored: Array<{ file: string; score: number }> = []
  for (const file of files) {
    const score = scoreFile(query, file)
    if (score > 0) {
      scored.push({ file, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => ({ file: s.file, score: s.score, matches: [] }))
}

/** Scores a single file path against a query (exact > substring > subsequence); 0 means no match. */
export function scoreFile(query: string, filePath: string): number {
  const normalized = filePath.toLowerCase()
  const q = query.toLowerCase()

  if (normalized === q) return 1000
  if (normalized.includes(q)) {
    const baseScore = 500
    const pathPrefix = filePath.lastIndexOf('/') + 1
    const fileName = filePath.slice(pathPrefix).toLowerCase()

    if (fileName === q) return baseScore + 400
    if (fileName.includes(q)) return baseScore + 200 + (q.length / fileName.length) * 100
    return baseScore + (q.length / normalized.length) * 100
  }

  const base = consecutiveCharScore(q, normalized)
  if (base <= 0) return 0

  const pathPrefix = filePath.lastIndexOf('/') + 1
  const fileName = filePath.slice(pathPrefix).toLowerCase()
  const fileNameScore = consecutiveCharScore(q, fileName)

  if (fileNameScore > 0) {
    return base + fileNameScore * 2
  }
  return base
}

function consecutiveCharScore(query: string, target: string): number {
  let qi = 0
  let score = 0
  let consecutive = 0

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      consecutive++
      score += 10 + consecutive * 5
      qi++
    } else {
      consecutive = 0
    }
  }

  if (qi < query.length) return 0
  return score
}
