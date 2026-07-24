/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { CodeSymbol, CodeRelation } from './code-types.js'

const TEST_FILE_PATTERN = /\.test\.[tj]sx?$/

/**
 * Given changed files and the full symbol+relation graph, return the set of
 * test file paths that are transitively affected (import chain from changed file → test).
 *
 * Pure function — no I/O. BFS upstream: from symbols in changed files,
 * walk "who imports me" edges and collect test files.
 */
export function getBlastRadiusTestFiles(
  symbols: readonly CodeSymbol[],
  relations: readonly CodeRelation[],
  changedFiles: readonly string[],
): Set<string> {
  if (changedFiles.length === 0) return new Set()

  const changedSet = new Set(changedFiles)

  // Map: symbolId → file
  const symbolFile = new Map<string, string>()
  for (const s of symbols) symbolFile.set(s.id, s.file)

  // Map: toSymbol → [fromSymbol, ...] (who imports toSymbol)
  const upstreamMap = new Map<string, string[]>()
  for (const r of relations) {
    const list = upstreamMap.get(r.toSymbol)
    if (list) {
      list.push(r.fromSymbol)
    } else {
      upstreamMap.set(r.toSymbol, [r.fromSymbol])
    }
  }

  // Seed: all symbols in changed files
  const frontier = new Set<string>()
  for (const s of symbols) {
    if (changedSet.has(s.file)) frontier.add(s.id)
  }

  const visited = new Set<string>(frontier)
  const testFiles = new Set<string>()

  const queue = [...frontier]
  while (queue.length > 0) {
    const symId = queue.shift()!
    const upstreams = upstreamMap.get(symId) ?? []
    for (const upstream of upstreams) {
      const file = symbolFile.get(upstream)
      if (!file) continue
      if (TEST_FILE_PATTERN.test(file)) testFiles.add(file)
      if (!visited.has(upstream)) {
        visited.add(upstream)
        queue.push(upstream)
      }
    }
  }

  return testFiles
}
