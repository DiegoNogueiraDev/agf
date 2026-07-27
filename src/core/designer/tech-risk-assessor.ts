/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tech risk assessor: categorize, score, and infer technical risks from graph structure.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type {
  TechRiskReport,
  TechRiskEntry,
  TechRiskCategory,
  TechRiskProbability,
  MitigationLevel,
} from '../../schemas/designer-schema.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tech-risk-assessor.ts' })

const CATEGORY_KEYWORDS: Record<TechRiskCategory, string[]> = {
  integration: ['integration', 'api', 'third-party', 'external', 'webhook', 'endpoint'],
  performance: ['performance', 'latency', 'throughput', 'bottleneck', 'slow', 'cache'],
  security: ['security', 'auth', 'vulnerability', 'injection', 'xss', 'csrf', 'encryption'],
  maturity: ['maturity', 'experimental', 'beta', 'unstable', 'new technology', 'prototype'],
  complexity: ['complexity', 'complex', 'coupling', 'monolith', 'legacy', 'refactor'],
  dependency: ['dependency', 'dependencies', 'vendor', 'lock-in', 'upgrade', 'breaking change'],
}

function categorizeRisk(description: string, tags: string[]): TechRiskCategory {
  const text = `${description} ${tags.join(' ')}`.toLowerCase()

  let bestCategory: TechRiskCategory = 'complexity'
  let bestScore = 0

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [TechRiskCategory, string[]][]) {
    const matchCount = keywords.filter((kw) => text.includes(kw)).length
    if (matchCount > bestScore) {
      bestScore = matchCount
      bestCategory = category
    }
  }

  return bestCategory
}

function priorityToProbability(priority: number): TechRiskProbability {
  if (priority <= 2) return 'high'
  if (priority <= 3) return 'medium'
  return 'low'
}

const PROBABILITY_VALUE: Record<TechRiskProbability, number> = { low: 1, medium: 2, high: 3 }

/** Full mitigation: decision or constraint edge */
const FULL_MITIGATION_TYPES = new Set(['decision', 'constraint'])
/** Partial mitigation: epic edge */
const PARTIAL_MITIGATION_TYPES = new Set(['epic'])

/** Determine mitigation level of a risk node from its edges. */
export function assessMitigationLevel(
  doc: GraphDocument,
  riskNode: { id: string; metadata?: Record<string, unknown> },
): MitigationLevel {
  const nodeTypeMap = new Map(doc.nodes.map((n) => [n.id, n.type]))

  let hasFullMitigation = false
  let hasPartialMitigation = false

  for (const edge of doc.edges) {
    const connectedType =
      edge.from === riskNode.id
        ? nodeTypeMap.get(edge.to)
        : edge.to === riskNode.id
          ? nodeTypeMap.get(edge.from)
          : undefined

    if (!connectedType) continue

    if (FULL_MITIGATION_TYPES.has(connectedType)) {
      hasFullMitigation = true
      break
    }
    if (PARTIAL_MITIGATION_TYPES.has(connectedType)) {
      hasPartialMitigation = true
    }
  }

  if (hasFullMitigation) return 'mitigated'

  // Check metadata.mitigation as partial mitigation
  const meta = riskNode.metadata as Record<string, unknown> | undefined
  if (meta) {
    const mitigation = meta.mitigation
    if (typeof mitigation === 'string' && mitigation.trim().length > 0) {
      hasPartialMitigation = true
    }
  }

  if (hasPartialMitigation) return 'partially_mitigated'

  return 'unmitigated'
}

/** Score and categorize explicit and inferred tech risks. */
export function assessTechRisks(doc: GraphDocument): TechRiskReport {
  const riskNodes = doc.nodes.filter((n) => n.type === 'risk')

  const risks: TechRiskEntry[] = riskNodes.map((node) => {
    const category = categorizeRisk(node.description ?? '', node.tags ?? [])
    const probability = priorityToProbability(node.priority)
    const impact: TechRiskProbability = node.priority <= 2 ? 'high' : node.priority <= 3 ? 'medium' : 'low'
    const score = PROBABILITY_VALUE[probability] * PROBABILITY_VALUE[impact]
    const mitigationLevel = assessMitigationLevel(doc, node)
    const mitigated = mitigationLevel !== 'unmitigated'

    return { nodeId: node.id, category, probability, impact, score, mitigated, mitigationLevel }
  })

  // Infer risks from graph structure
  const inferredRisks: TechRiskEntry[] = []

  // Count fan-out per node
  const fanOutMap = new Map<string, number>()
  for (const edge of doc.edges) {
    if (edge.relationType === 'depends_on') {
      fanOutMap.set(edge.from, (fanOutMap.get(edge.from) ?? 0) + 1)
    }
  }

  const HIGH_FAN_OUT_THRESHOLD = 5
  for (const [nodeId, fanOut] of fanOutMap) {
    if (fanOut > HIGH_FAN_OUT_THRESHOLD) {
      // High fan-out → complexity risk
      inferredRisks.push({
        nodeId,
        category: 'complexity',
        probability: 'medium',
        impact: 'medium',
        score: 4,
        mitigated: false,
      })
      // High depends_on count → dependency risk
      inferredRisks.push({
        nodeId,
        category: 'dependency',
        probability: 'medium',
        impact: 'medium',
        score: 4,
        mitigated: false,
      })
    }
  }

  const riskScore = risks.reduce((sum, r) => sum + r.score, 0) + inferredRisks.reduce((sum, r) => sum + r.score, 0)

  const highRisks = risks.filter((r) => r.score >= 6).map((r) => r.nodeId)

  log.info('tech-risk-assessor', { explicit: risks.length, inferred: inferredRisks.length, riskScore })

  return { risks, inferredRisks, riskScore, highRisks }
}
