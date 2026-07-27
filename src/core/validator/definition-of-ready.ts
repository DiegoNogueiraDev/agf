/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Validation Definition of Ready — composite gate for IMPLEMENT→VALIDATE transition.
 * Aggregates completion, AC quality, done integrity, and risk checks.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { ValidationReadinessReport, ValidationReadinessCheck } from '../../schemas/validator-schema.js'
import { validateAcQuality } from '../analyzer/ac-validator.js'
import { assessRisks } from '../analyzer/risk-assessment.js'
import { detectBottlenecks } from '../insights/bottleneck-detector.js'
import { calculateMetrics } from '../insights/metrics-calculator.js'
import { detectCycles } from '../planner/dependency-chain.js'
import { checkDoneIntegrity } from './done-integrity-checker.js'
import { checkStatusFlow } from './status-flow-checker.js'
import { scoreToGrade } from '../utils/grading.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { McpGraphError, getErrorMessage } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'definition-of-ready.ts' })

/** Run IMPLEMENT-to-VALIDATE gate checks on the graph. */
export function checkValidationReadiness(doc: GraphDocument): ValidationReadinessReport {
  const checks: ValidationReadinessCheck[] = []

  const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
  const doneTasks = tasks.filter((n) => n.status === 'done')
  const completionRate = tasks.length > 0 ? (doneTasks.length / tasks.length) * 100 : 0

  // ── Required checks ──

  // 1. completion_threshold — ≥50% tasks done
  const halfDone = completionRate >= 50
  checks.push({
    name: 'completion_threshold',
    passed: halfDone,
    details: halfDone
      ? `${Math.round(completionRate)}% tasks done (meta: 50%)`
      : `Apenas ${Math.round(completionRate)}% tasks done (meta: 50%)`,
    severity: 'required',
  })

  // 2. ac_defined — done tasks have AC
  const hasAC = doc.nodes.some(
    (n) => n.type === 'acceptance_criteria' || (n.acceptanceCriteria && n.acceptanceCriteria.length > 0),
  )
  checks.push({
    name: 'ac_defined',
    passed: hasAC,
    details: hasAC ? 'Acceptance criteria definidos' : 'Nenhum acceptance criteria encontrado',
    severity: 'required',
  })

  // 3. ac_quality — AC quality score ≥ 60
  const acReport = validateAcQuality(doc)
  const acQualityPass = acReport.overallScore >= 60
  checks.push({
    name: 'ac_quality',
    passed: acQualityPass,
    details: `AC quality score: ${acReport.overallScore} (meta: 60)`,
    severity: 'required',
  })

  // 4. done_integrity — no done tasks with integrity issues
  const integrityReport = checkDoneIntegrity(doc)
  checks.push({
    name: 'done_integrity',
    passed: integrityReport.passed,
    details: integrityReport.passed
      ? 'Todas tasks done com integridade verificada'
      : `${integrityReport.issues.length} problema(s) de integridade em tasks done`,
    severity: 'required',
  })

  // 5. no_cycles — no dependency cycles
  const cycles = detectCycles(doc)
  const noCycles = cycles.length === 0
  checks.push({
    name: 'no_cycles',
    passed: noCycles,
    details: noCycles ? 'Nenhum ciclo de dependência detectado' : `${cycles.length} ciclo(s) detectado(s)`,
    severity: 'required',
  })

  // ── Recommended checks ──

  // 6. ac_coverage_global — ≥80% of ALL tasks have AC
  const tasksWithAC = tasks.filter(
    (t) =>
      (t.acceptanceCriteria && t.acceptanceCriteria.length > 0) ||
      doc.nodes.some(
        (n) =>
          n.type === 'acceptance_criteria' &&
          doc.edges.some((e) => (e.from === n.id && e.to === t.id) || (e.from === t.id && e.to === n.id)),
      ),
  )
  const acCoverageRate = tasks.length > 0 ? Math.round((tasksWithAC.length / tasks.length) * 100) : 100
  const acCoveragePass = acCoverageRate >= 80
  checks.push({
    name: 'ac_coverage_global',
    passed: acCoveragePass,
    details: `${acCoverageRate}% tasks com AC (meta: 80%)`,
    severity: 'recommended',
  })

  // 7. no_oversized_remaining — no incomplete tasks >120min without subtasks
  const bottlenecks = detectBottlenecks(doc)
  const oversizedRemaining = bottlenecks.oversizedTasks.filter((ot) => {
    const node = doc.nodes.find((n) => n.id === ot.id)
    return node && node.status !== 'done'
  })
  const noOversized = oversizedRemaining.length === 0
  checks.push({
    name: 'no_oversized_remaining',
    passed: noOversized,
    details: noOversized
      ? 'Nenhuma task incompleta oversized'
      : `${oversizedRemaining.length} task(s) incompleta(s) >120min sem decomposição`,
    severity: 'recommended',
  })

  // 8. risks_mitigated — high/critical risks with mitigation
  const riskMatrix = assessRisks(doc)
  const unmitigatedHighRisks = riskMatrix.risks.filter(
    (r) => (r.level === 'high' || r.level === 'critical') && r.mitigationStatus === 'unmitigated',
  )
  const risksPass = unmitigatedHighRisks.length === 0
  checks.push({
    name: 'risks_mitigated',
    passed: risksPass,
    details: risksPass
      ? 'Todos riscos high/critical com mitigação'
      : `${unmitigatedHighRisks.length} risco(s) high/critical sem mitigação`,
    severity: 'recommended',
  })

  // 9. status_flow_compliance — done tasks went through in_progress
  const flowReport = checkStatusFlow(doc)
  const flowPass = flowReport.complianceRate >= 80
  checks.push({
    name: 'status_flow_compliance',
    passed: flowPass,
    details: `Taxa de compliance do fluxo de status: ${flowReport.complianceRate}% (meta: 80%)`,
    severity: 'recommended',
  })

  // 10. sprint_progress — current sprint ≥ 70% completion
  const metrics = calculateMetrics(doc)
  const currentSprint =
    metrics.sprintProgress.length > 0 ? metrics.sprintProgress[metrics.sprintProgress.length - 1] : null
  const sprintPass = currentSprint ? currentSprint.percentage >= 70 : true
  checks.push({
    name: 'sprint_progress',
    passed: sprintPass,
    details: currentSprint
      ? `Sprint "${currentSprint.sprint}": ${currentSprint.percentage}% (meta: 70%)`
      : 'Nenhum sprint ativo',
    severity: 'recommended',
  })

  // Harness regression check — score nao caiu > 10pts
  try {
    const harness = runHarnessScanCached(process.cwd())
    if (harness) {
      checks.push({
        name: 'harness_no_regression',
        passed: !harness.regression || (harness.regressionDelta !== undefined && harness.regressionDelta > -10),
        details: harness.regression
          ? `Harness regrediu ${harness.regressionDelta} pontos (threshold: -10)`
          : `Harness score: ${harness.score} (grade ${harness.grade}) — sem regressão`,
        severity: 'recommended',
      })
    }
  } catch (err) {
    log.debug('validation-readiness: harness scan failed', { error: getErrorMessage(err) })
  }

  // ── Scoring ──
  const totalChecks = checks.length
  if (totalChecks === 0) {
    throw new McpGraphError('Validation readiness: no checks were generated')
  }
  const passedChecks = checks.filter((c) => c.passed).length
  const score = Math.round((passedChecks / totalChecks) * 100)
  const grade = scoreToGrade(score)

  const ready = checks.filter((c) => c.severity === 'required').every((c) => c.passed)

  const summary = ready
    ? `Validation Ready (${grade}): ${passedChecks}/${totalChecks} checks passed, score ${score}`
    : `Validation Not Ready: ${checks
        .filter((c) => c.severity === 'required' && !c.passed)
        .map((c) => c.name)
        .join(', ')} failed`

  log.info('validation-readiness', { ready, score, grade, passed: passedChecks, total: totalChecks })

  return { checks, ready, score, grade, summary }
}
