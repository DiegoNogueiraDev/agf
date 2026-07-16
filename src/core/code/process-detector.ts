/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Process detector — identifies entry points and traces call chains.
 * Entry point = exported function/method with no incoming "calls" relations.
 */

import type { CodeStore } from './code-store.js'
import type { DetectedProcess } from './code-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'process-detector.ts' })

/**
 * Detect execution processes: exported symbols with no callers → trace call chains.
 */
export function detectProcesses(store: CodeStore, projectId: string): DetectedProcess[] {
  const allSymbols = store.getAllSymbols(projectId)
  const allRelations = store.getAllRelations(projectId)

  // Build sets for quick lookup
  const callTargets = new Set<string>()
  const callGraph = new Map<string, string[]>() // symbolId → [calleeIds]

  for (const rel of allRelations) {
    if (rel.type === 'calls') {
      callTargets.add(rel.toSymbol)

      const existing = callGraph.get(rel.fromSymbol) ?? []
      existing.push(rel.toSymbol)
      callGraph.set(rel.fromSymbol, existing)
    }
  }

  // Symbol ID → symbol lookup
  const symbolMap = new Map(allSymbols.map((s) => [s.id, s]))

  // Entry points: exported functions/methods with no incoming calls
  const entryPoints = allSymbols.filter(
    (s) => s.exported && !callTargets.has(s.id) && (s.kind === 'function' || s.kind === 'method'),
  )

  const processes: DetectedProcess[] = []

  for (const entry of entryPoints) {
    const chain: Array<{ name: string; file: string }> = []
    const visited = new Set<string>()

    // BFS to trace call chain
    const queue = callGraph.get(entry.id) ?? []
    for (const id of queue) visited.add(id)

    let frontier = [...queue]
    while (frontier.length > 0) {
      const next: string[] = []

      for (const id of frontier) {
        const sym = symbolMap.get(id)
        if (!sym) continue

        chain.push({ name: sym.name, file: sym.file })

        const callees = callGraph.get(id) ?? []
        for (const calleeId of callees) {
          if (!visited.has(calleeId)) {
            visited.add(calleeId)
            next.push(calleeId)
          }
        }
      }

      frontier = next
    }

    processes.push({
      entryPoint: entry.name,
      entryFile: entry.file,
      chain,
    })
  }

  log.debug('process-detector', {
    entryPoints: entryPoints.length,
    processes: processes.length,
  })

  return processes
}
