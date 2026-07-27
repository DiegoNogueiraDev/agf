/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Risk Assessment — evaluates risk nodes using probability × impact scoring.
 *
 * Heuristics:
 * - Keywords in title/description drive automatic probability/impact scoring
 * - Mitigation status: mitigated if child task is done, partial if in_progress
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { RiskMatrix, RiskEntry, RiskLevel } from '../../schemas/analyzer-schema.js'
import { assessMitigationLevel } from '../designer/tech-risk-assessor.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'risk-assessment.ts' })

const HIGH_PROBABILITY_KEYWORDS = ['sempre', 'provável', 'frequente', 'common', 'likely']
const LOW_PROBABILITY_KEYWORDS = ['raro', 'improvável', 'unlikely', 'rare']
const HIGH_IMPACT_KEYWORDS = ['crítico', 'blocker', 'critical', 'data loss', 'security', 'downtime']
const LOW_IMPACT_KEYWORDS = ['cosmético', 'menor', 'minor', 'cosmetic', 'low-priority']

function scoreFromKeywords(text: string, highKeywords: string[], lowKeywords: string[], defaultScore: number): number {
  const lower = text.toLowerCase()
  if (highKeywords.some((k) => lower.includes(k))) return 4
  if (lowKeywords.some((k) => lower.includes(k))) return 2
  return defaultScore
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 16) return 'critical'
  if (score >= 9) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

/** assessRisks —  */
export function assessRisks(doc: GraphDocument): RiskMatrix {
  const { nodes } = doc
  const riskNodes = nodes.filter((n) => n.type === 'risk')
  const risks: RiskEntry[] = []

  for (const node of riskNodes) {
    const text = `${node.title} ${node.description ?? ''}`

    const probability = scoreFromKeywords(text, HIGH_PROBABILITY_KEYWORDS, LOW_PROBABILITY_KEYWORDS, 3)
    const impact = scoreFromKeywords(text, HIGH_IMPACT_KEYWORDS, LOW_IMPACT_KEYWORDS, 3)
    const score = probability * impact
    const level = scoreToLevel(score)

    // Check mitigation via child tasks
    const childTasks = nodes.filter((n) => n.parentId === node.id && (n.type === 'task' || n.type === 'subtask'))
    let mitigationStatus: 'mitigated' | 'partial' | 'unmitigated' = 'unmitigated'
    if (childTasks.length > 0) {
      const allDone = childTasks.every((t) => t.status === 'done')
      const someProgress = childTasks.some((t) => t.status === 'in_progress' || t.status === 'done')
      if (allDone) mitigationStatus = 'mitigated'
      else if (someProgress) mitigationStatus = 'partial'
    }

    // Also check edge-based mitigation (unified with tech_risk analyzer)
    if (mitigationStatus === 'unmitigated') {
      const edgeLevel = assessMitigationLevel(doc, node)
      if (edgeLevel === 'mitigated') mitigationStatus = 'mitigated'
      else if (edgeLevel === 'partially_mitigated') mitigationStatus = 'partial'
    }

    const suggestedMitigation = mitigationStatus === 'unmitigated' ? suggestMitigation(text, level) : undefined

    risks.push({
      nodeId: node.id,
      title: node.title,
      probability,
      impact,
      score,
      level,
      mitigationStatus,
      suggestedMitigation,
      // Bug #028: indicate scores are keyword-inferred, not user-provided
      synthetic: true,
    })
  }

  // Sort by score descending
  risks.sort((a, b) => b.score - a.score)

  const summary = {
    total: risks.length,
    critical: risks.filter((r) => r.level === 'critical').length,
    high: risks.filter((r) => r.level === 'high').length,
    medium: risks.filter((r) => r.level === 'medium').length,
    low: risks.filter((r) => r.level === 'low').length,
    mitigated: risks.filter((r) => r.mitigationStatus === 'mitigated').length,
  }

  log.info('risk-assessment', { total: summary.total, critical: summary.critical, high: summary.high })

  return { risks, summary }
}

function suggestMitigation(text: string, level: RiskLevel): string {
  const lower = text.toLowerCase()

  if (lower.includes('security') || lower.includes('segurança')) {
    return 'Criar task de security review/audit'
  }
  if (lower.includes('performance') || lower.includes('desempenho')) {
    return 'Criar task de benchmark e definir SLOs'
  }
  if (lower.includes('data') || lower.includes('dados')) {
    return 'Criar task de backup e plano de recuperação'
  }
  if (level === 'critical') {
    return 'Risco crítico — criar spike de investigação urgente'
  }
  if (level === 'high') {
    return 'Criar task de mitigação com prioridade alta'
  }
  return 'Documentar plano de contingência'
}
