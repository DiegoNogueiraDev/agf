/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Metric Coverage Analyzer — checks metric monitoring coverage for high-priority risks.
 *
 * Checks:
 * - Finds metric nodes
 * - Finds risk nodes with high priority (1-2)
 * - Reports high risks without linked metrics
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'metric-coverage.ts' })

export interface MetricCoverageReport {
  totalMetrics: number
  totalHighRisks: number
  coveredRisks: string[]
  uncoveredRisks: Array<{ nodeId: string; title: string; priority: number }>
  coveragePercent: number
}

/** analyzeMetricCoverage —  */
export function analyzeMetricCoverage(doc: GraphDocument): MetricCoverageReport {
  const metricNodes = doc.nodes.filter((n) => n.type === 'metric')
  const highRisks = doc.nodes.filter((n) => n.type === 'risk' && n.priority <= 2)

  // Build set of risk IDs that have at least one edge to/from a metric
  const metricIds = new Set(metricNodes.map((n) => n.id))
  const risksWithMetrics = new Set<string>()

  for (const edge of doc.edges) {
    // Check if edge connects a risk to a metric (either direction)
    if (metricIds.has(edge.to) && highRisks.some((r) => r.id === edge.from)) {
      risksWithMetrics.add(edge.from)
    }
    if (metricIds.has(edge.from) && highRisks.some((r) => r.id === edge.to)) {
      risksWithMetrics.add(edge.to)
    }
  }

  const coveredRisks: string[] = []
  const uncoveredRisks: Array<{ nodeId: string; title: string; priority: number }> = []

  for (const risk of highRisks) {
    if (risksWithMetrics.has(risk.id)) {
      coveredRisks.push(risk.id)
    } else {
      uncoveredRisks.push({ nodeId: risk.id, title: risk.title, priority: risk.priority })
    }
  }

  const coveragePercent = highRisks.length > 0 ? Math.round((coveredRisks.length / highRisks.length) * 100) : 100

  log.debug('analyzer:metric-coverage', {
    totalMetrics: metricNodes.length,
    totalHighRisks: highRisks.length,
    covered: coveredRisks.length,
    coveragePercent,
  })

  return {
    totalMetrics: metricNodes.length,
    totalHighRisks: highRisks.length,
    coveredRisks,
    uncoveredRisks,
    coveragePercent,
  }
}
