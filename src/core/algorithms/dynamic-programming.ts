/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Dynamic programming & classic algorithms from CLRS 4th Ed.
 * Pure functions — no SQLite dependency. Testable by construction.
 */

// ── Type exports ────────────────────────────────────────────────────────────

export interface KnapsackItem {
  value: number
  weight: number
}

export interface KnapsackResult {
  selected: number[]
  totalValue: number
  totalWeight: number
}

export interface LcsResult {
  sequence: string
  length: number
}

export interface RodCuttingResult {
  cuts: number[]
  maxRevenue: number
}

export interface OptimalBstResult {
  cost: number
  root: number
}

export interface EditDistanceResult {
  distance: number
  operations: string[]
}

export interface Activity {
  start: number
  end: number
}

export interface ActivitySelectionResult {
  selected: number[]
  count: number
}

interface HuffmanNode {
  char: string | null
  freq: number
  left: HuffmanNode | null
  right: HuffmanNode | null
}

// ── §15.2: 0/1 Knapsack ─────────────────────────────────────────────────────

/** 0/1 knapsack — maximize value under a weight capacity via dynamic programming. */
export function knapsack01(items: KnapsackItem[], capacity: number): KnapsackResult {
  const n = items.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0))

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      if (items[i - 1].weight <= w) {
        dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - items[i - 1].weight] + items[i - 1].value)
      } else {
        dp[i][w] = dp[i - 1][w]
      }
    }
  }

  const selected: number[] = []
  let w = capacity
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(i - 1)
      w -= items[i - 1].weight
    }
  }

  const totalValue = dp[n][capacity]
  const totalWeight = selected.reduce((sum, idx) => sum + items[idx].weight, 0)

  return { selected: selected.reverse(), totalValue, totalWeight }
}

// ── §14.4: Longest Common Subsequence ───────────────────────────────────────

/** Longest common subsequence of two strings via dynamic programming. */
export function longestCommonSubsequence(a: string, b: string): LcsResult {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  let i = m
  let j = n
  const chars: string[] = []
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      chars.push(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return { sequence: chars.reverse().join(''), length: dp[m][n] }
}

// ── §14.1: Rod Cutting ──────────────────────────────────────────────────────

/** Rod-cutting — maximize revenue by cutting a rod into priced pieces. */
export function rodCutting(prices: number[], n: number): RodCuttingResult {
  const dp = Array(n + 1).fill(0)
  const cut = Array(n + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    let maxVal = -Infinity
    for (let j = 1; j <= i; j++) {
      if (j <= prices.length && prices[j - 1] + dp[i - j] > maxVal) {
        maxVal = prices[j - 1] + dp[i - j]
        cut[i] = j
      }
    }
    dp[i] = maxVal
  }

  const cuts: number[] = []
  let remaining = n
  while (remaining > 0) {
    cuts.push(cut[remaining])
    remaining -= cut[remaining]
  }

  return { cuts, maxRevenue: dp[n] }
}

// ── §14.5: Optimal Binary Search Tree ───────────────────────────────────────

/** Optimal binary search tree minimizing expected access cost. */
export function optimalBst(keys: string[], probabilities: number[]): OptimalBstResult {
  const n = keys.length
  if (n === 0) return { cost: 0, root: -1 }

  const cost: number[][] = Array.from({ length: n + 2 }, () => Array(n + 1).fill(0))
  const root: number[][] = Array.from({ length: n + 1 }, () => Array(n + 1).fill(0))
  const prefix: number[] = Array(n + 1).fill(0)

  for (let i = 1; i <= n; i++) prefix[i] = prefix[i - 1] + probabilities[i - 1]

  for (let i = 1; i <= n; i++) {
    cost[i][i - 1] = 0
    cost[i][i] = probabilities[i - 1]
    root[i][i] = i
  }

  for (let len = 2; len <= n; len++) {
    for (let i = 1; i <= n - len + 1; i++) {
      const j = i + len - 1
      cost[i][j] = Infinity
      const sum = prefix[j] - prefix[i - 1]
      for (let r = i; r <= j; r++) {
        const c = cost[i][r - 1] + cost[r + 1][j] + sum
        if (c < cost[i][j]) {
          cost[i][j] = c
          root[i][j] = r
        }
      }
    }
  }

  return { cost: cost[1][n], root: root[1][n] - 1 }
}

// ── §14.3: Edit Distance (Levenshtein) ──────────────────────────────────────

/** Levenshtein edit distance between two strings via dynamic programming. */
export function editDistance(a: string, b: string): EditDistanceResult {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  const operations: string[] = []
  if (dp[m][n] === 0) return { distance: 0, operations: [] }
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      operations.push(`keep '${a[i - 1]}'`)
      i--
      j--
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      operations.push(`replace '${a[i - 1]}' with '${b[j - 1]}'`)
      i--
      j--
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      operations.push(`insert '${b[j - 1]}'`)
      j--
    } else if (i > 0) {
      operations.push(`delete '${a[i - 1]}'`)
      i--
    }
  }

  return { distance: dp[m][n], operations: operations.reverse() }
}

// ── §15.1: Activity Selection (Greedy) ──────────────────────────────────────

/** Maximum set of non-overlapping activities via the greedy earliest-finish rule. */
export function activitySelection(intervals: Activity[]): ActivitySelectionResult {
  const n = intervals.length
  if (n === 0) return { selected: [], count: 0 }

  const indexed = intervals.map((a, i) => ({ ...a, originalIndex: i }))
  indexed.sort((a, b) => a.end - b.end)

  const selected: number[] = [indexed[0].originalIndex]
  let lastEnd = indexed[0].end

  for (let i = 1; i < n; i++) {
    if (indexed[i].start >= lastEnd) {
      selected.push(indexed[i].originalIndex)
      lastEnd = indexed[i].end
    }
  }

  return { selected, count: selected.length }
}

// ── §15.4: Huffman Codes ────────────────────────────────────────────────────

function buildHuffmanTree(frequencies: Map<string, number>): HuffmanNode | null {
  if (frequencies.size === 0) return null

  const nodes: HuffmanNode[] = []
  for (const [char, freq] of frequencies) {
    nodes.push({ char, freq, left: null, right: null })
  }

  while (nodes.length > 1) {
    nodes.sort((a, b) => a.freq - b.freq)
    const left = nodes.shift()!
    const right = nodes.shift()!
    nodes.push({
      char: null,
      freq: left.freq + right.freq,
      left,
      right,
    })
  }

  return nodes[0]
}

function extractCodes(node: HuffmanNode | null, prefix: string, codes: Map<string, string>): void {
  if (!node) return
  if (node.char !== null) {
    codes.set(node.char, prefix || '0')
  }
  extractCodes(node.left, prefix + '0', codes)
  extractCodes(node.right, prefix + '1', codes)
}

/** Huffman prefix codes minimizing expected code length from symbol frequencies. */
export function huffmanCodes(frequencies: Map<string, number>): Map<string, string> {
  const codes = new Map<string, string>()
  const tree = buildHuffmanTree(frequencies)
  extractCodes(tree, '', codes)
  return codes
}

/** Huffman prefix codes from symbol frequencies (alias of huffmanCodes). */
export function huffmanCoding(frequencies: Map<string, number>): Map<string, string> {
  return huffmanCodes(frequencies)
}

// ── Rabin-Karp String Matching ──────────────────────────────────────────────

/** Rabin-Karp substring search using a rolling hash; returns match indices. */
export function rabinKarp(text: string, pattern: string, prime = 101): number[] {
  const positions: number[] = []
  const m = pattern.length
  const n = text.length
  if (m === 0 || m > n) return positions

  const base = 256
  let pHash = 0
  let tHash = 0
  let h = 1

  for (let i = 0; i < m - 1; i++) {
    h = (h * base) % prime
  }

  for (let i = 0; i < m; i++) {
    pHash = (base * pHash + pattern.charCodeAt(i)) % prime
    tHash = (base * tHash + text.charCodeAt(i)) % prime
  }

  for (let i = 0; i <= n - m; i++) {
    if (pHash === tHash) {
      let match = true
      for (let j = 0; j < m; j++) {
        if (text[i + j] !== pattern[j]) {
          match = false
          break
        }
      }
      if (match) positions.push(i)
    }
    if (i < n - m) {
      tHash = (base * (tHash - text.charCodeAt(i) * h) + text.charCodeAt(i + m)) % prime
      if (tHash < 0) tHash += prime
    }
  }

  return positions
}

// ── Longest Palindromic Substring ───────────────────────────────────────────

/** Longest palindromic substring via center expansion. */
export function longestPalindrome(s: string): string {
  const n = s.length
  if (n < 2) return s

  let start = 0
  let maxLen = 1

  const dp: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false))

  for (let i = 0; i < n; i++) dp[i][i] = true

  for (let i = 0; i < n - 1; i++) {
    if (s[i] === s[i + 1]) {
      dp[i][i + 1] = true
      start = i
      maxLen = 2
    }
  }

  for (let len = 3; len <= n; len++) {
    for (let i = 0; i <= n - len; i++) {
      const j = i + len - 1
      if (s[i] === s[j] && dp[i + 1][j - 1]) {
        dp[i][j] = true
        if (len > maxLen) {
          start = i
          maxLen = len
        }
      }
    }
  }

  return s.substring(start, start + maxLen)
}
