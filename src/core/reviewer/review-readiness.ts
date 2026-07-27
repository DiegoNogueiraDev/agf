/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Review Readiness — composite gate for VALIDATE→REVIEW transition.
 * 100% reuse of existing analyzers, no new helper modules.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { ReviewReadinessReport, ReviewReadinessCheck } from '../../schemas/reviewer-schema.js'
import type { ValidatedReviewInput } from './validation.js'
import { analyzeScope } from '../analyzer/scope-analyzer.js'
import { assessRisks } from '../analyzer/risk-assessment.js'
import { detectBottlenecks } from '../insights/bottleneck-detector.js'
import { validateAcQuality } from '../analyzer/ac-validator.js'
import { calculateVelocity } from '../planner/velocity.js'
import { detectCycles } from '../planner/dependency-chain.js'
import { scoreToGrade } from '../utils/grading.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { nodeHasAc } from '../utils/ac-helpers.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { checkAxiomGate } from '../constitution/axiom-gate.js'
import { getBuiltinConstitution, KARPATHY_BASELINE_NAME } from '../constitution/built-in-constitutions.js'
import { McpGraphError, getErrorMessage } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'review-readiness.ts' })

/** Run VALIDATE-to-REVIEW gate checks on the graph.
 *  `opts` (already boundary-validated via `validateReviewInput`) narrows the check
 *  set: `minCompletionRate` overrides the 80% default, `includeHarness: false`
 *  skips the harness scan. */
export function checkReviewReadiness(doc: GraphDocument, opts?: ValidatedReviewInput): ReviewReadinessReport {
  const minCompletionRate = opts?.minCompletionRate ?? 80
  const includeHarness = opts?.includeHarness ?? true
  const checks: ReviewReadinessCheck[] = []

  const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
  const doneTasks = tasks.filter((n) => n.status === 'done')
  const completionRate = tasks.length > 0 ? (doneTasks.length / tasks.length) * 100 : 0

  // Reuse results from expensive calls
  const bottlenecks = detectBottlenecks(doc)
  const scopeAnalysis = analyzeScope(doc)

  // ── Required checks ──

  // 1. completion_rate — ≥minCompletionRate% tasks done (default 80%)
  const enough = completionRate >= minCompletionRate
  checks.push({
    name: 'completion_rate',
    passed: enough,
    details: enough
      ? `${Math.round(completionRate)}% tasks done (meta: ${minCompletionRate}%)`
      : `Apenas ${Math.round(completionRate)}% tasks done (meta: ${minCompletionRate}%)`,
    severity: 'required',
  })

  // 2. no_blocked_tasks — zero tasks with status=blocked (Bug #010)
  const blockedCount = tasks.filter((t) => t.status === 'blocked').length
  const noBlocked = blockedCount === 0
  checks.push({
    name: 'no_blocked_tasks',
    passed: noBlocked,
    details: noBlocked ? 'Nenhuma task bloqueada' : `${blockedCount} task(s) bloqueada(s)`,
    severity: 'required',
  })

  // 3. ac_coverage — ≥70% done tasks with AC (inline or child AC nodes)
  const doneWithAC = doneTasks.filter((t) => nodeHasAc(doc, t.id))
  // Bug #027: 0 done tasks = vacuous pass (nothing to evaluate)
  const acCoverage = doneTasks.length > 0 ? Math.round((doneWithAC.length / doneTasks.length) * 100) : 0
  const acCoveragePass = doneTasks.length === 0 || acCoverage >= 70
  checks.push({
    name: 'ac_coverage',
    passed: acCoveragePass,
    details:
      doneTasks.length === 0
        ? 'No done tasks to evaluate (vacuous pass)'
        : `${acCoverage}% done tasks com AC (meta: 70%)`,
    severity: 'required',
  })

  // 4. no_cycles — no dependency cycles
  const cycles = detectCycles(doc)
  const noCycles = cycles.length === 0
  checks.push({
    name: 'no_cycles',
    passed: noCycles,
    details: noCycles ? 'Nenhum ciclo de dependência detectado' : `${cycles.length} ciclo(s) detectado(s)`,
    severity: 'required',
  })

  // 5. risks_addressed — zero critical/high unmitigated risks
  const riskMatrix = assessRisks(doc)
  const unmitigatedCritical = riskMatrix.risks.filter(
    (r) => (r.level === 'critical' || r.level === 'high') && r.mitigationStatus === 'unmitigated',
  )
  const risksPass = unmitigatedCritical.length === 0
  checks.push({
    name: 'risks_addressed',
    passed: risksPass,
    details: risksPass
      ? 'Todos riscos critical/high endereçados'
      : `${unmitigatedCritical.length} risco(s) critical/high sem mitigação`,
    severity: 'required',
  })

  // ── Recommended checks ──

  // 6. velocity_stable — coefficient of variation < 1.0 (≥2 sprints)
  const velocity = calculateVelocity(doc)
  let velocityPass = true
  let velocityDetails = 'Dados insuficientes para avaliar estabilidade'
  if (velocity.sprints.length >= 2) {
    const points = velocity.sprints.map((s) => s.totalPoints)
    const avg = points.reduce((a, b) => a + b, 0) / points.length
    const variance = points.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / points.length
    const stdDev = Math.sqrt(variance)
    const cv = avg > 0 ? stdDev / avg : 0
    velocityPass = cv < 1.0
    velocityDetails = `Coeficiente de variação: ${cv.toFixed(2)} (meta: < 1.0)`
  }
  checks.push({
    name: 'velocity_stable',
    passed: velocityPass,
    details: velocityDetails,
    severity: 'recommended',
  })

  // 7. no_orphan_tasks — zero orphan tasks
  const orphanTasks = scopeAnalysis.orphans.filter((o) => TASK_TYPES.has(o.type))
  const noOrphans = orphanTasks.length === 0
  checks.push({
    name: 'no_orphan_tasks',
    passed: noOrphans,
    details: noOrphans ? 'Nenhuma task órfã' : `${orphanTasks.length} task(s) órfã(s)`,
    severity: 'recommended',
  })

  // 8. no_oversized_tasks — no tasks >120min without subtasks
  const noOversized = bottlenecks.oversizedTasks.length === 0
  checks.push({
    name: 'no_oversized_tasks',
    passed: noOversized,
    details: noOversized
      ? 'Nenhuma task oversized'
      : `${bottlenecks.oversizedTasks.length} task(s) >120min sem decomposição`,
    severity: 'recommended',
  })

  // 9. scope_integrity — no scope conflicts
  const noConflicts = scopeAnalysis.conflicts.length === 0
  checks.push({
    name: 'scope_integrity',
    passed: noConflicts,
    details: noConflicts ? 'Sem conflitos de escopo' : `${scopeAnalysis.conflicts.length} conflito(s) de escopo`,
    severity: 'recommended',
  })

  // 10. ac_quality — AC quality score ≥ 60
  const acReport = validateAcQuality(doc)
  const acQualityPass = acReport.overallScore >= 60
  checks.push({
    name: 'ac_quality',
    passed: acQualityPass,
    details: `AC quality score: ${acReport.overallScore} (meta: 60)`,
    severity: 'recommended',
  })

  // 11. axiom_gate — enforceable constitution principles must carry a valid AxiomLink
  // Advisory mode: no AxiomLink persistence exists yet, so this surfaces orphans without blocking.
  const baseline = getBuiltinConstitution(KARPATHY_BASELINE_NAME)
  const activePrincipleIds = (baseline?.principles ?? []).filter((p) => p.enforceable).map((p) => p.id)
  const axiomGateResult = checkAxiomGate({ activePrincipleIds, axiomLinks: [], mode: 'advisory' })
  const axiomGatePass = axiomGateResult.orphanPrincipleIds.length === 0
  checks.push({
    name: 'axiom_gate',
    passed: axiomGatePass,
    details: axiomGatePass
      ? 'Todos princípios enforceable têm AxiomLink válido'
      : `${axiomGateResult.orphanPrincipleIds.length} princípio(s) enforceable sem AxiomLink (orphan): ${axiomGateResult.orphanPrincipleIds.join(', ')}`,
    severity: 'recommended',
  })

  // Harness grade check — grade >= C (score >= 55). Skippable via includeHarness: false
  // (mirrors the design gate's scope: 'incremental', which also skips its harness scan).
  if (includeHarness) {
    try {
      const harness = runHarnessScanCached(process.cwd())
      if (harness) {
        const harnessPass = harness.score >= 55
        checks.push({
          name: 'harness_grade_minimum',
          passed: harnessPass,
          details: `Harness grade: ${harness.grade} (score ${harness.score}, meta: >= C/55)`,
          severity: 'recommended',
        })
      }
    } catch (err) {
      log.debug('review-readiness: harness scan failed', { error: getErrorMessage(err) })
    }
  }

  // ── Scoring ──
  const totalChecks = checks.length
  if (totalChecks === 0) {
    throw new McpGraphError('Review readiness: no checks were generated')
  }
  const passedChecks = checks.filter((c) => c.passed).length
  const score = Math.round((passedChecks / totalChecks) * 100)
  const grade = scoreToGrade(score)

  const ready = checks.filter((c) => c.severity === 'required').every((c) => c.passed)

  const summary = ready
    ? `Review Ready (${grade}): ${passedChecks}/${totalChecks} checks passed, score ${score}`
    : `Review Not Ready: ${checks
        .filter((c) => c.severity === 'required' && !c.passed)
        .map((c) => c.name)
        .join(', ')} failed`

  log.info('review-readiness', { ready, score, grade, passed: passedChecks, total: totalChecks })

  return { checks, ready, score, grade, summary }
}
