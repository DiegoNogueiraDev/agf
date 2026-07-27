/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2026 Colby Mchenry (codegraph)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from codegraph (https://github.com/colbymchenry/codegraph), MIT.
 * This file stays under its original MIT terms; agent-graph-flow as a whole
 * is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * PolymorphicSiblingDetector — detects supertypes with >=3 implementations.
 *
 * code_relations) for extends/implements edges and finds interfaces/classes
 * that have 3 or more implementations/subclasses.
 *
 * Uses graph edges as the data source (no AST parsing at detection time).
 */

import type { CodeStore } from '../code/code-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'polymorphic-sibling-detector.ts' })

const MIN_IMPLEMENTATIONS = 3
const POLYMORPHIC_RELATION_TYPES = new Set(['extends', 'implements'])

export interface PolymorphicImplementation {
  id: string
  name: string
  kind: string
  file: string
  relationType: string
}

export interface PolymorphicSupertype {
  superId: string
  superName: string
  superKind: string
  superFile: string
  implementations: PolymorphicImplementation[]
  implementationCount: number
}

/**
 * Detect supertypes (interfaces or classes) that have >=3 implementations
 * via extends or implements relations in the code intelligence graph.
 */
export function detectPolymorphicSiblings(codeStore: CodeStore, projectId: string): PolymorphicSupertype[] {
  const relations = codeStore.getAllRelations(projectId)

  const hierarchyEdges = relations.filter((r) => POLYMORPHIC_RELATION_TYPES.has(r.type))

  if (hierarchyEdges.length === 0) return []

  const bySupertype = new Map<string, Array<{ fromSymbol: string; type: string }>>()

  for (const edge of hierarchyEdges) {
    const group = bySupertype.get(edge.toSymbol)
    if (group) {
      group.push({ fromSymbol: edge.fromSymbol, type: edge.type })
    } else {
      bySupertype.set(edge.toSymbol, [{ fromSymbol: edge.fromSymbol, type: edge.type }])
    }
  }

  const result: PolymorphicSupertype[] = []

  for (const [superId, impls] of bySupertype) {
    if (impls.length < MIN_IMPLEMENTATIONS) continue

    const superSymbol = codeStore.getSymbol(superId)
    if (!superSymbol) continue

    const implementations: PolymorphicImplementation[] = []

    for (const impl of impls) {
      const implSymbol = codeStore.getSymbol(impl.fromSymbol)
      if (!implSymbol) continue
      implementations.push({
        id: implSymbol.id,
        name: implSymbol.name,
        kind: implSymbol.kind,
        file: implSymbol.file,
        relationType: impl.type,
      })
    }

    result.push({
      superId: superSymbol.id,
      superName: superSymbol.name,
      superKind: superSymbol.kind,
      superFile: superSymbol.file,
      implementations,
      implementationCount: implementations.length,
    })
  }

  log.debug('polymorphic-sibling-detector:scan', {
    totalRelations: relations.length,
    hierarchyEdges: hierarchyEdges.length,
    polymorphicFound: result.length,
  })

  return result
}
