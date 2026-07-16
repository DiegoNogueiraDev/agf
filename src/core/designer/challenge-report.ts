/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Challenge Report Assembler — consolidates fitness, JTBD, and pre-mortem
 * results into a structured challenge report with verdict.
 *
 * Pure functions, no side effects. Supports 3 context tiers for serialization.
 */

import type { DecisionFitnessResult } from './decision-fitness.js'
import type { Finding } from './severity-scoring.js'
import { sortFindings, elevateFindings } from './severity-scoring.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'designer/challenge-report.ts' })

// ── Types ───────────────────────────────────────────────

export interface JtbdTestResult {
  jtbd: string
  result: 'PASS' | 'FAIL' | 'PARTIAL'
  score: number
}

export interface ChallengeReportInput {
  fitness: DecisionFitnessResult
  jtbdResults: JtbdTestResult[]
  preMortemFindings: Finding[]
}

export type ChallengeVerdict = 'CHALLENGE_PASSED' | 'CHALLENGE_FAILED'

export interface ChallengeVerdictResult {
  verdict: ChallengeVerdict
  criticalBlockers: string[]
  warnings: string[]
}

export interface ChallengeReport {
  fitnessScore: DecisionFitnessResult
  jtbdResults: JtbdTestResult[]
  preMortemFindings: Finding[]
  challengeQuestions: string[]
  overallVerdict: ChallengeVerdictResult
}

export type ContextTier = 'summary' | 'standard' | 'deep'

// ── Constants ───────────────────────────────────────────

const PASS_THRESHOLD = 60

// ── Main Functions ──────────────────────────────────────

/**
 * Assemble a challenge report from fitness, JTBD, and pre-mortem results.
 * Sorts findings by severity, elevates if composite is low, computes verdict.
 */
export function assembleChallengeReport(input: ChallengeReportInput): ChallengeReport {
  const { fitness, jtbdResults, preMortemFindings } = input

  // Elevate findings if composite is low, then sort
  const elevated = elevateFindings(preMortemFindings, fitness.composite)
  const sorted = sortFindings(elevated)

  // Generate adversarial challenge questions
  const questions = generateChallengeQuestions(fitness, jtbdResults, sorted)

  // Compute verdict
  const verdict = computeVerdict(fitness, sorted)

  return {
    fitnessScore: fitness,
    jtbdResults,
    preMortemFindings: sorted,
    challengeQuestions: questions,
    overallVerdict: verdict,
  }
}

/**
 * Serialize a challenge report to text at the specified context tier.
 * - summary (L0): ~30 tokens — verdict + score
 * - standard (L2): ~200 tokens — verdict + findings summary
 * - deep (L3): ~500+ tokens — full report
 */
export function serializeChallengeReport(report: ChallengeReport, tier: ContextTier): string {
  switch (tier) {
    case 'summary':
      return serializeSummary(report)
    case 'standard':
      return serializeStandard(report)
    case 'deep':
      return serializeDeep(report)
  }
}

// ── Verdict ─────────────────────────────────────────────

function computeVerdict(fitness: DecisionFitnessResult, findings: Finding[]): ChallengeVerdictResult {
  const criticalFindings = findings.filter((f) => f.severity === 'critical')
  const warningFindings = findings.filter((f) => f.severity === 'warning')

  const hasCritical = criticalFindings.length > 0
  const belowThreshold = fitness.composite < PASS_THRESHOLD

  if (belowThreshold || hasCritical) {
    const blockers: string[] = []
    if (belowThreshold) {
      blockers.push(`Composite fitness score ${fitness.composite} is below threshold ${PASS_THRESHOLD}`)
    }
    for (const fVar of criticalFindings) {
      blockers.push(fVar.message)
    }

    return {
      verdict: 'CHALLENGE_FAILED',
      criticalBlockers: blockers,
      warnings: warningFindings.map((f) => f.message),
    }
  }

  return {
    verdict: 'CHALLENGE_PASSED',
    criticalBlockers: [],
    warnings: warningFindings.map((f) => f.message),
  }
}

// ── Challenge Questions ─────────────────────────────────

function generateChallengeQuestions(
  fitness: DecisionFitnessResult,
  jtbds: JtbdTestResult[],
  findings: Finding[],
): string[] {
  const questions: string[] = []

  // Always ask about the weakest dimension
  const dims = Object.entries(fitness.breakdown) as Array<[string, { score: number }]>
  const weakest = dims.reduce((a, b) => (a[1].score < b[1].score ? a : b))
  questions.push(`What is the mitigation plan for the low ${weakest[0]} score (${weakest[1].score}/100)?`)

  // Ask about failed JTBDs
  const failedJtbds = jtbds.filter((j) => j.result === 'FAIL')
  if (failedJtbds.length > 0) {
    questions.push(`How will this decision address the unmet JTBD: "${failedJtbds[0].jtbd}"?`)
  } else {
    questions.push('What happens if a new JTBD emerges that conflicts with this decision?')
  }

  // Ask about critical findings
  const criticals = findings.filter((f) => f.severity === 'critical')
  if (criticals.length > 0) {
    questions.push(`How will the critical issue "${criticals[0].message}" be resolved before proceeding?`)
  } else {
    questions.push('What is the rollback plan if this decision needs to be reversed in 6 months?')
  }

  // Ensure at least 3 questions
  while (questions.length < 3) {
    questions.push('What are the long-term maintenance implications of this decision?')
  }

  return questions
}

// ── Serialization Tiers ─────────────────────────────────

function serializeSummary(report: ChallengeReport): string {
  return `${report.overallVerdict.verdict} (score: ${report.fitnessScore.composite}, grade: ${report.fitnessScore.grade})`
}

function serializeStandard(report: ChallengeReport): string {
  const lines: string[] = [
    `## Challenge Report: ${report.overallVerdict.verdict}`,
    `**Fitness:** ${report.fitnessScore.composite}/100 (${report.fitnessScore.grade})`,
    `- friction: ${report.fitnessScore.breakdown.friction.score}`,
    `- optimality: ${report.fitnessScore.breakdown.optimality.score}`,
    `- reversibility: ${report.fitnessScore.breakdown.reversibility.score}`,
    '',
  ]

  if (report.jtbdResults.length > 0) {
    lines.push(
      `**JTBD:** ${report.jtbdResults.filter((j) => j.result === 'PASS').length}/${report.jtbdResults.length} passed`,
    )
  }

  if (report.preMortemFindings.length > 0) {
    const bySev = { critical: 0, warning: 0, info: 0 }
    for (const fVar of report.preMortemFindings) bySev[fVar.severity]++
    lines.push(`**Findings:** ${bySev.critical} critical, ${bySev.warning} warning, ${bySev.info} info`)
  }

  if (report.overallVerdict.criticalBlockers.length > 0) {
    lines.push('', '**Blockers:**')
    for (const bVar of report.overallVerdict.criticalBlockers) {
      lines.push(`- ${bVar}`)
    }
  }

  return lines.join('\n')
}

function serializeDeep(report: ChallengeReport): string {
  const lines: string[] = [
    `# Challenge Report: ${report.overallVerdict.verdict}`,
    '',
    '## Fitness Score',
    `Composite: ${report.fitnessScore.composite}/100 (Grade ${report.fitnessScore.grade})`,
    `- Friction: ${report.fitnessScore.breakdown.friction.score}/100 (weight ${report.fitnessScore.breakdown.friction.weight})`,
    `- Optimality: ${report.fitnessScore.breakdown.optimality.score}/100 (weight ${report.fitnessScore.breakdown.optimality.weight})`,
    `- Reversibility: ${report.fitnessScore.breakdown.reversibility.score}/100 (weight ${report.fitnessScore.breakdown.reversibility.weight})`,
    '',
  ]

  if (report.jtbdResults.length > 0) {
    lines.push('## JTBD Test Results')
    for (const j of report.jtbdResults) {
      lines.push(`- [${j.result}] ${j.jtbd} (score: ${j.score})`)
    }
    lines.push('')
  }

  if (report.preMortemFindings.length > 0) {
    lines.push('## Pre-Mortem Findings')
    for (const fVar of report.preMortemFindings) {
      lines.push(`- [${fVar.severity.toUpperCase()}] ${fVar.message} (${fVar.source}/${fVar.dimension})`)
    }
    lines.push('')
  }

  lines.push('## Challenge Questions')
  for (const qVar of report.challengeQuestions) {
    lines.push(`- ${qVar}`)
  }
  lines.push('')

  lines.push('## Verdict')
  lines.push(`**${report.overallVerdict.verdict}**`)
  if (report.overallVerdict.criticalBlockers.length > 0) {
    lines.push('Critical blockers:')
    for (const bVar of report.overallVerdict.criticalBlockers) {
      lines.push(`  - ${bVar}`)
    }
  }
  if (report.overallVerdict.warnings.length > 0) {
    lines.push('Warnings:')
    for (const wVar of report.overallVerdict.warnings) {
      lines.push(`  - ${wVar}`)
    }
  }

  return lines.join('\n')
}
