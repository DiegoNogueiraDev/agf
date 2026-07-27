/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Doc Completeness Checker — validates documentation coverage for handoff.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { DocCompletenessReport } from '../../schemas/handoff-schema.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'doc-completeness.ts' })

/** Check description coverage across all graph nodes. */
export function checkDocCompleteness(doc: GraphDocument): DocCompletenessReport {
  const { nodes } = doc

  const withDescription = nodes.filter((n) => n.description && n.description.trim().length > 0)
  const withoutDescription = nodes.filter((n) => !n.description || n.description.trim().length === 0)

  const totalNodes = nodes.length
  const descriptionsPresent = withDescription.length
  const coverageRate = totalNodes > 0 ? Math.round((descriptionsPresent / totalNodes) * 100) : 100

  const nodesWithoutDescription = withoutDescription.map((n) => ({
    nodeId: n.id,
    title: n.title,
  }))

  log.info('doc-completeness', { coverageRate, totalNodes, descriptionsPresent })

  return { descriptionsPresent, totalNodes, coverageRate, nodesWithoutDescription }
}
