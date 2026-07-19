/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Graph traversal algorithms for Code Intelligence.
 * Operates on CodeStore data: BFS for context/impact, symbol lookup for change detection.
 */

import type { CodeStore } from './code-store.js'
import type { CodeGraphData, CodeSymbol, CodeRelation, ImpactResult, AffectedSymbol } from './code-types.js'
import { calculateRiskLevel } from './code-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'graph-traversal.ts' })

// ── Context (1-hop neighbors) ────────────────────────

/**
 * Get 360° context for a symbol: all direct callers, callees, and related symbols.
 */
export function getSymbolContext(store: CodeStore, name: string, projectId: string): CodeGraphData {
  const targets = store.findSymbolsByName(name, projectId)
  if (targets.length === 0) {
    return { symbols: [], relations: [] }
  }

  const symbolMap = new Map<string, CodeSymbol>()
  const relationSet = new Map<string, CodeRelation>()

  for (const target of targets) {
    symbolMap.set(target.id, target)

    // Outgoing relations (callees, imports, etc.)
    const outgoing = store.getRelationsFrom(target.id)
    for (const rel of outgoing) {
      relationSet.set(rel.id, rel)
      const neighbor = store.getSymbol(rel.toSymbol)
      if (neighbor) symbolMap.set(neighbor.id, neighbor)
    }

    // Incoming relations (callers, importers, etc.)
    const incoming = store.getRelationsTo(target.id)
    for (const rel of incoming) {
      relationSet.set(rel.id, rel)
      const neighbor = store.getSymbol(rel.fromSymbol)
      if (neighbor) symbolMap.set(neighbor.id, neighbor)
    }
  }

  log.debug('graph-traversal:context', {
    symbol: name,
    symbols: symbolMap.size,
    relations: relationSet.size,
  })

  return {
    symbols: Array.from(symbolMap.values()),
    relations: Array.from(relationSet.values()),
  }
}

// ── Impact Analysis (BFS depth 1-3) ─────────────────

/**
 * Analyze blast radius via BFS. Direction controls traversal:
 * - "upstream": who depends on this symbol (callers, importers)
 * - "downstream": what this symbol depends on (callees, imported)
 */
export function analyzeImpact(
  store: CodeStore,
  name: string,
  projectId: string,
  direction: 'upstream' | 'downstream' = 'upstream',
  maxDepth: number = 3,
): ImpactResult {
  const targets = store.findSymbolsByName(name, projectId)
  if (targets.length === 0) {
    return { symbol: name, affectedSymbols: [], riskLevel: 'low' }
  }

  const MAX_AFFECTED = 500
  const TIMEOUT_MS = 5_000
  const startTime = Date.now()

  const visited = new Set<string>()
  const affected: AffectedSymbol[] = []

  // Seed BFS with target symbol IDs
  let frontier: Array<{ id: string; depth: number }> = targets.map((t) => ({ id: t.id, depth: 0 }))
  for (const tVar of targets) visited.add(tVar.id)

  while (frontier.length > 0) {
    // Guard: max affected nodes limit
    if (affected.length >= MAX_AFFECTED) {
      log.warn('graph-traversal:max-affected-reached', { symbol: name, limit: MAX_AFFECTED })
      break
    }
    // Guard: timeout
    if (Date.now() - startTime > TIMEOUT_MS) {
      log.warn('graph-traversal:timeout', { symbol: name, timeoutMs: TIMEOUT_MS, affected: affected.length })
      break
    }

    const nextFrontier: Array<{ id: string; depth: number }> = []

    for (const { id, depth } of frontier) {
      if (depth >= maxDepth) continue
      if (affected.length >= MAX_AFFECTED) break

      const relations = direction === 'upstream' ? store.getRelationsTo(id) : store.getRelationsFrom(id)

      for (const rel of relations) {
        const neighborId = direction === 'upstream' ? rel.fromSymbol : rel.toSymbol
        if (visited.has(neighborId)) continue
        visited.add(neighborId)

        const neighbor = store.getSymbol(neighborId)
        if (!neighbor) continue

        const newDepth = depth + 1
        // Confidence decay: d=1 → 1.0, d=2 → 0.7, d=3 → 0.4
        const confidence = Math.max(0.1, 1.0 - (newDepth - 1) * 0.3)

        affected.push({
          name: neighbor.name,
          file: neighbor.file,
          confidence,
          depth: newDepth,
        })

        nextFrontier.push({ id: neighborId, depth: newDepth })
      }
    }

    frontier = nextFrontier
  }

  const riskLevel = calculateRiskLevel(affected.length)

  log.debug('graph-traversal:impact', {
    symbol: name,
    direction,
    affected: affected.length,
    riskLevel,
  })

  return { symbol: name, affectedSymbols: affected, riskLevel }
}

// ── Full Graph ───────────────────────────────────────

/**
 * Get the complete code graph for a project (with optional limit).
 */
export function getFullGraph(
  store: CodeStore,
  projectId: string,
  symbolLimit: number = 5000,
  symbolOffset: number = 0,
): {
  symbols: CodeSymbol[]
  relations: Array<CodeRelation & { from: string; to: string }>
  total: { symbols: number; relations: number }
} {
  const symbols = store.getAllSymbols(projectId, symbolLimit, symbolOffset)
  const relations = store.getAllRelations(projectId)

  // Build id→name map so the dashboard can reference nodes by name
  const symbolIds = new Set<string>()
  const idToName = new Map<string, string>()
  for (const sym of symbols) {
    idToName.set(sym.id, sym.name)
    symbolIds.add(sym.id)
  }

  // Filter relations to only include those connecting visible symbols
  const visibleRelations = relations.filter((rel) => symbolIds.has(rel.fromSymbol) || symbolIds.has(rel.toSymbol))

  const enrichedRelations = visibleRelations.map((rel) => ({
    ...rel,
    from: idToName.get(rel.fromSymbol) ?? rel.fromSymbol,
    to: idToName.get(rel.toSymbol) ?? rel.toSymbol,
  }))

  return {
    symbols,
    relations: enrichedRelations,
    total: {
      symbols: store.countSymbols(projectId),
      relations: store.countRelations(projectId),
    },
  }
}

// ── Semantic Enrichment (AST + LSP) ──────────────────

/**
 * Get LSP-enriched symbol context.
 * Returns AST-based context augmented with LSP references when bridge is available.
 */
export async function getSymbolContextSemantic(
  store: CodeStore,
  name: string,
  projectId: string,
  lspBridge?: {
    findReferences: (
      file: string,
      line: number,
      character: number,
    ) => Promise<
      Array<{ file: string; startLine: number; startCharacter: number; endLine: number; endCharacter: number }>
    >
  } | null,
): Promise<CodeGraphData & { lspEnriched: boolean }> {
  // 1. Get AST-based context (always available, fast)
  const astContext = getSymbolContext(store, name, projectId)

  if (!lspBridge) {
    return { ...astContext, lspEnriched: false }
  }

  // 2. Try to enrich with LSP references
  try {
    const targets = store.findSymbolsByName(name, projectId)
    if (targets.length === 0) {
      return { ...astContext, lspEnriched: false }
    }

    const target = targets[0]
    const refs = await lspBridge.findReferences(target.file, target.startLine, 0)

    if (refs.length === 0) {
      return { ...astContext, lspEnriched: false }
    }

    // Merge LSP references as additional symbols if not already in AST context
    const existingFiles = new Set(astContext.symbols.map((s) => s.file))
    const newSymbols: CodeSymbol[] = []

    for (const ref of refs) {
      if (existingFiles.has(ref.file)) continue

      // Try to find a symbol at this reference location
      const sym = store.findSymbolAtLine(ref.file, ref.startLine, projectId)
      if (sym && !astContext.symbols.some((s) => s.id === sym.id)) {
        newSymbols.push(sym)
      }
    }

    log.debug('graph-traversal:semantic-enrich', {
      symbol: name,
      lspRefs: refs.length,
      newSymbols: newSymbols.length,
    })

    return {
      symbols: [...astContext.symbols, ...newSymbols],
      relations: astContext.relations,
      lspEnriched: true,
    }
  } catch (err) {
    log.warn('graph-traversal:lsp-enrichment-failed', {
      symbol: name,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ...astContext, lspEnriched: false }
  }
}
