/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Config Coverage Analyzer — checks config schema coverage.
 *
 * Checks:
 * - Finds config_schema nodes
 * - Checks metadata.referencedBy exists and is non-empty
 * - Reports orphan configs (no references) and referenced-but-undefined configs
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'config-coverage.ts' })

export interface ConfigCoverageReport {
  totalConfigs: number
  orphanConfigs: Array<{ nodeId: string; title: string }>
  referencedButUndefined: string[]
  coveragePercent: number
}

/** analyzeConfigCoverage —  */
export function analyzeConfigCoverage(doc: GraphDocument): ConfigCoverageReport {
  const configNodes = doc.nodes.filter((n) => n.type === 'config_schema')
  const configIds = new Set(configNodes.map((n) => n.id))

  const orphanConfigs: Array<{ nodeId: string; title: string }> = []
  const allReferencedBy = new Set<string>()

  for (const node of configNodes) {
    const meta = node.metadata as Record<string, unknown> | undefined
    const referencedBy = (meta?.referencedBy as string[]) ?? []

    if (referencedBy.length === 0) {
      orphanConfigs.push({ nodeId: node.id, title: node.title })
    }

    for (const ref of referencedBy) {
      allReferencedBy.add(ref)
    }
  }

  // Find config names referenced by tasks/descriptions but not defined as config_schema nodes
  const referencedButUndefined: string[] = []
  for (const ref of allReferencedBy) {
    if (!configIds.has(ref)) {
      referencedButUndefined.push(ref)
    }
  }

  const referencedCount = configNodes.length - orphanConfigs.length
  const coveragePercent = configNodes.length > 0 ? Math.round((referencedCount / configNodes.length) * 100) : 100

  log.debug('analyzer:config-coverage', {
    totalConfigs: configNodes.length,
    orphans: orphanConfigs.length,
    undefined: referencedButUndefined.length,
    coveragePercent,
  })

  return {
    totalConfigs: configNodes.length,
    orphanConfigs,
    referencedButUndefined,
    coveragePercent,
  }
}
