/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 MemPalace Contributors (mempalace)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from mempalace (https://github.com/MemPalace/mempalace), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

export interface IndexEntry {
  key: string
  content: string
}

export interface CompressedEntry {
  originalKey: string
  compressedKey: string
  content: string
}

export interface CompressedIndex {
  entries: CompressedEntry[]
  compressMap: Map<string, string>
  decompress: (compressed: string) => string | undefined
  originalSize: number
  compressedSize: number
  compressionRatio: number
}

function tokenizeKey(key: string): string[] {
  return key.split(/[_-]+/)
}

/** Compress a dot/dash/underscore-delimited key by abbreviating each token to its 2-char prefix. */
export function compressKey(key: string): string {
  const tokens = tokenizeKey(key)
  if (tokens.length <= 1) return key

  const compressed = tokens
    .map((t) => {
      // AUDIT-052: 3-char (was 2) prefix cuts the collision rate; remaining
      // collisions are disambiguated by compressIndex so the reverse map stays
      // bijective.
      if (t.length <= 3) return t
      const prefix = t.slice(0, 3)
      const suffix = t.match(/\d+$/)
      return suffix ? prefix + suffix[0] : prefix
    })
    // AUDIT-052: the old `tokens.every(() => key.includes('_'))` callback ignored
    // its parameter (dead) — collapse to the equivalent direct check.
    .join(key.includes('_') ? '_' : '-')

  return compressed
}

/** Reverse-lookup the original key from a compressed key using the reverse map produced by `compressIndex`. */
export function decompressKey(compressedKey: string, map: Map<string, string>): string | undefined {
  return map.get(compressedKey)
}

/** Build a compressed index from full-text entries — returns compress/reverse maps and compression ratio. */
export function compressIndex(entries: IndexEntry[]): CompressedIndex {
  const compressMap = new Map<string, string>()
  const reverseMap = new Map<string, string>()
  let originalSize = 0
  let compressedSize = 0

  const compressed: CompressedEntry[] = entries.map((entry) => {
    // AUDIT-052: keep the reverse map bijective. Identical original keys reuse
    // the same compressed key; a collision with a DIFFERENT original is
    // disambiguated with a `#N` suffix so no original is lost (last-write-wins).
    let ck = compressMap.get(entry.key)
    if (ck === undefined) {
      ck = compressKey(entry.key)
      if (reverseMap.has(ck) && reverseMap.get(ck) !== entry.key) {
        let n = 2
        while (reverseMap.has(`${ck}#${n}`) && reverseMap.get(`${ck}#${n}`) !== entry.key) n++
        ck = `${ck}#${n}`
      }
      compressMap.set(entry.key, ck)
      reverseMap.set(ck, entry.key)
    }
    originalSize += entry.key.length
    compressedSize += ck.length
    return { originalKey: entry.key, compressedKey: ck, content: entry.content }
  })

  return {
    entries: compressed,
    compressMap,
    decompress: (ck: string) => reverseMap.get(ck),
    originalSize,
    compressedSize,
    compressionRatio: originalSize > 0 ? 1 - compressedSize / originalSize : 0,
  }
}

/** Search a compressed index by query string, returning up to `topK` matching entries ranked by token overlap. */
export function searchCompressedIndex(index: CompressedIndex, query: string, topK: number = 5): CompressedEntry[] {
  const ql = query.toLowerCase()

  const scored = index.entries.map((entry) => {
    let score = 0
    const kl = entry.originalKey.toLowerCase()
    const cl = entry.compressedKey.toLowerCase()
    if (kl === ql || cl === ql) score = 100
    else if (kl.startsWith(ql) || cl.startsWith(ql)) score = 80
    else if (kl.includes(ql) || cl.includes(ql)) score = 60
    else {
      const queryTokens = ql.split(/[_-]+/)
      const keyTokens = kl.split(/[_-]+/)
      const matchCount = queryTokens.filter((qt) => keyTokens.some((kt) => kt.startsWith(qt) || kt.includes(qt))).length
      if (matchCount > 0) score = (matchCount / queryTokens.length) * 50
    }
    if (entry.content.toLowerCase().includes(ql)) score += 10
    return { entry, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.entry)
}
