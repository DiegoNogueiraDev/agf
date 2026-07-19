/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * PRD Quality Analyzer — scores a project graph for completeness and quality.
 *
 * Scoring weights:
 * - Requirements: 25% (epics + requirements present and with descriptions)
 * - Acceptance Criteria: 25% (tasks have AC defined)
 * - Tasks: 20% (tasks exist, are decomposed, have estimates)
 * - Risks: 15% (risk nodes present and assessed)
 * - Constraints: 15% (constraint nodes defined)
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { PrdQualityReport, PrdQualitySection, SectionQuality } from '../../schemas/analyzer-schema.js'
import { scoreToGrade } from '../utils/grading.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'prd-quality.ts' })

const SECTION_WEIGHTS = {
  requirements: 25,
  acceptanceCriteria: 25,
  tasks: 20,
  risks: 15,
  constraints: 15,
} as const

function assessQuality(ratio: number): SectionQuality {
  if (ratio <= 0) return 'missing'
  if (ratio < 0.4) return 'weak'
  if (ratio < 0.7) return 'adequate'
  return 'strong'
}

/** analyzePrdQuality —  */
export function analyzePrdQuality(doc: GraphDocument): PrdQualityReport {
  const { nodes } = doc
  const sections: PrdQualitySection[] = []

  // ── Requirements (epics + requirements) ──
  const reqNodes = nodes.filter((n) => n.type === 'epic' || n.type === 'requirement')
  const reqWithDesc = reqNodes.filter((n) => n.description && n.description.trim().length > 0)
  const reqRatio = reqNodes.length > 0 ? reqWithDesc.length / reqNodes.length : 0
  const reqQuality = assessQuality(reqRatio)

  const reqIssues: string[] = []
  const reqSuggestions: string[] = []
  if (reqNodes.length === 0) {
    reqIssues.push('Nenhum epic ou requirement definido')
    reqSuggestions.push('Criar pelo menos 1 epic descrevendo o escopo do projeto')
  }
  if (reqNodes.length > 0 && reqWithDesc.length < reqNodes.length) {
    reqIssues.push(`${reqNodes.length - reqWithDesc.length} requirements sem descrição`)
    reqSuggestions.push('Adicionar descrição a todos os requirements para clareza')
  }

  sections.push({
    name: 'requirements',
    quality: reqQuality,
    issues: reqIssues,
    suggestions: reqSuggestions,
  })

  // ── Acceptance Criteria ──
  const tasks = nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  const acNodes = nodes.filter((n) => n.type === 'acceptance_criteria')
  const tasksWithAc = tasks.filter((n) => n.acceptanceCriteria && n.acceptanceCriteria.length > 0)
  const acTotal = tasksWithAc.length + acNodes.length
  const acRatio = tasks.length > 0 ? Math.min(1, acTotal / tasks.length) : acNodes.length > 0 ? 0.5 : 0
  const acQuality = assessQuality(acRatio)

  const acIssues: string[] = []
  const acSuggestions: string[] = []
  if (acTotal === 0) {
    acIssues.push('Nenhum critério de aceitação definido')
    acSuggestions.push('Definir AC para cada task (Given/When/Then ou checklist)')
  } else if (tasks.length > 0 && tasksWithAc.length < tasks.length && acNodes.length === 0) {
    acIssues.push(`${tasks.length - tasksWithAc.length} tasks sem acceptance criteria`)
    acSuggestions.push('Garantir que toda task tenha AC testável')
  }

  sections.push({
    name: 'acceptanceCriteria',
    quality: acQuality,
    issues: acIssues,
    suggestions: acSuggestions,
  })

  // ── Tasks ──
  const tasksWithEstimate = tasks.filter((n) => n.estimateMinutes || n.xpSize)
  const taskRatio = tasks.length > 0 ? Math.min(1, tasksWithEstimate.length / tasks.length) : 0
  const taskQuality = assessQuality(taskRatio)

  const taskIssues: string[] = []
  const taskSuggestions: string[] = []
  if (tasks.length === 0) {
    taskIssues.push('Nenhuma task definida')
    taskSuggestions.push('Decompor requirements em tasks executáveis')
  }
  if (tasks.length > 0 && tasksWithEstimate.length < tasks.length) {
    taskIssues.push(`${tasks.length - tasksWithEstimate.length} tasks sem estimativa`)
    taskSuggestions.push('Adicionar xpSize ou estimateMinutes a todas as tasks')
  }

  sections.push({
    name: 'tasks',
    quality: taskQuality,
    issues: taskIssues,
    suggestions: taskSuggestions,
  })

  // ── Risks ──
  const riskNodes = nodes.filter((n) => n.type === 'risk')
  const riskQuality = assessQuality(riskNodes.length > 0 ? Math.min(1, riskNodes.length / 2) : 0)

  const riskIssues: string[] = []
  const riskSuggestions: string[] = []
  if (riskNodes.length === 0) {
    riskIssues.push('Nenhum risco identificado')
    riskSuggestions.push('Identificar pelo menos 1-2 riscos técnicos ou de negócio')
  }

  sections.push({
    name: 'risks',
    quality: riskQuality,
    issues: riskIssues,
    suggestions: riskSuggestions,
  })

  // ── Constraints ──
  const constraintNodes = nodes.filter((n) => n.type === 'constraint')
  const constraintQuality = assessQuality(constraintNodes.length > 0 ? Math.min(1, constraintNodes.length / 2) : 0)

  const constraintIssues: string[] = []
  const constraintSuggestions: string[] = []
  if (constraintNodes.length === 0) {
    constraintIssues.push('Nenhuma restrição definida')
    constraintSuggestions.push('Definir restrições técnicas (stack, performance, compatibilidade)')
  }

  sections.push({
    name: 'constraints',
    quality: constraintQuality,
    issues: constraintIssues,
    suggestions: constraintSuggestions,
  })

  // Cap quality at "adequate" when issues exist
  for (const section of sections) {
    if (section.issues.length > 0 && section.quality === 'strong') {
      section.quality = 'adequate'
    }
  }

  // ── Final score ──
  const qualityToScore: Record<SectionQuality, number> = {
    missing: 0,
    weak: 33,
    adequate: 66,
    strong: 100,
  }

  let totalScore = 0
  for (const section of sections) {
    const weight = SECTION_WEIGHTS[section.name as keyof typeof SECTION_WEIGHTS] ?? 0
    totalScore += (qualityToScore[section.quality] * weight) / 100
  }

  const score = Math.round(totalScore)
  const grade = scoreToGrade(score)
  const hasCriticalMissing = sections.some(
    (s) => s.quality === 'missing' && (s.name === 'requirements' || s.name === 'acceptanceCriteria'),
  )
  const readyForDesign = score >= 60 && !hasCriticalMissing

  const summary = `PRD Quality: ${grade} (${score}/100). ${readyForDesign ? 'Pronto para DESIGN.' : 'Não atende os critérios mínimos para avançar.'}`

  log.info('prd-quality', { score, grade, readyForDesign })

  return { score, grade, sections, readyForDesign, summary }
}
