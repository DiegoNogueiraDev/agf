/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Design Definition of Ready — composite gate for DESIGN→PLAN transition.
 * Aggregates ADR, traceability, coupling, interface, and risk checks.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { DesignReadinessReport, DesignReadinessCheck, AdrGrade } from '../../schemas/designer-schema.js'
import type { ValidatedDesignInput } from './validation.js'
import { validateAdrs } from './adr-validator.js'
import { buildTraceabilityMatrix, buildFullChainTraceability } from './traceability-matrix.js'
import { analyzeCoupling } from './coupling-analyzer.js'
import { checkInterfaces } from './interface-checker.js'
import { assessTechRisks } from './tech-risk-assessor.js'
import { detectCycles } from '../planner/dependency-chain.js'
import { scoreToGrade } from '../utils/grading.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'definition-of-ready.ts' })

const GRADE_ORDER: Record<AdrGrade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }

/** Run DESIGN-to-PLAN gate checks on the graph.
 *  `opts` (already boundary-validated via `validateDesignInput`) narrows the check
 *  set: `scope: 'incremental'` skips the harness scan, `includeTraceability`/
 *  `includeCoupling: false` skip their respective recommended checks. */
export function checkDesignReadiness(doc: GraphDocument, opts?: ValidatedDesignInput): DesignReadinessReport {
  const scope = opts?.scope ?? 'full'
  const includeTraceability = opts?.includeTraceability ?? true
  const includeCoupling = opts?.includeCoupling ?? true
  const checks: DesignReadinessCheck[] = []

  // ── Required checks (block ready: true) ──

  // 1. Has at least 1 decision
  const hasDecisions = doc.nodes.some((n) => n.type === 'decision')
  checks.push({
    name: 'has_decisions',
    passed: hasDecisions,
    details: hasDecisions
      ? `${doc.nodes.filter((n) => n.type === 'decision').length} decision(s) encontrada(s)`
      : 'Nenhum decision node encontrado',
    severity: 'required',
  })

  // 2. Has at least 1 constraint
  const hasConstraints = doc.nodes.some((n) => n.type === 'constraint')
  checks.push({
    name: 'has_constraints',
    passed: hasConstraints,
    details: hasConstraints
      ? `${doc.nodes.filter((n) => n.type === 'constraint').length} constraint(s) encontrada(s)`
      : 'Nenhum constraint node encontrado',
    severity: 'required',
  })

  // 3. No orphan requirements (all requirements have at least 1 edge)
  const requirements = doc.nodes.filter((n) => n.type === 'requirement')
  const reqsWithEdges = requirements.filter((req) => doc.edges.some((e) => e.from === req.id || e.to === req.id))
  const noOrphans = requirements.length === 0 || reqsWithEdges.length === requirements.length
  checks.push({
    name: 'no_orphan_requirements',
    passed: noOrphans,
    details: noOrphans
      ? 'Todos requirements têm pelo menos 1 edge'
      : `${requirements.length - reqsWithEdges.length} requirement(s) sem edges`,
    severity: 'required',
  })

  // 4. No cycles
  const cycles = detectCycles(doc)
  const noCycles = cycles.length === 0
  checks.push({
    name: 'no_cycles',
    passed: noCycles,
    details: noCycles ? 'Nenhum ciclo de dependência detectado' : `${cycles.length} ciclo(s) detectado(s)`,
    severity: 'required',
  })

  // 5. ADR quality >= C
  const adrReport = validateAdrs(doc)
  const adrPass = hasDecisions && GRADE_ORDER[adrReport.overallGrade] >= GRADE_ORDER['C']
  checks.push({
    name: 'adr_quality',
    passed: adrPass,
    details: hasDecisions ? `ADR grade: ${adrReport.overallGrade} (mínimo: C)` : 'Sem decisions para avaliar ADR',
    severity: 'required',
  })

  // ── Recommended checks (affect score but don't block) ──

  // 6. Traceability coverage >= 80%
  if (includeTraceability) {
    const traceReport = buildTraceabilityMatrix(doc)
    const traceCoveragePass = traceReport.coverageRate >= 80
    checks.push({
      name: 'traceability_coverage',
      passed: traceCoveragePass,
      details: `Cobertura de rastreabilidade: ${traceReport.coverageRate}% (meta: 80%)`,
      severity: 'recommended',
    })

    // 6b. Full-chain traceability requirement→task→test (informativo nesta fase;
    // tasks/tests amadurecem em PLAN/IMPLEMENT — ação detalhada via `agf gaps`).
    const fullChain = buildFullChainTraceability(doc)
    const fullChainPass = fullChain.entries.length === 0 || fullChain.chainCoverageRate >= 80
    checks.push({
      name: 'traceability_full_chain',
      passed: fullChainPass,
      details: `Cadeia requirement→task→test: ${fullChain.chainCoverageRate}% completa (meta: 80%)`,
      severity: 'recommended',
    })
  }

  // 7. No isolated nodes
  if (includeCoupling) {
    const couplingReport = analyzeCoupling(doc)
    const noIsolated = couplingReport.isolatedNodes.length === 0
    checks.push({
      name: 'no_isolated_nodes',
      passed: noIsolated,
      details: noIsolated ? 'Nenhum nó isolado' : `${couplingReport.isolatedNodes.length} nó(s) isolado(s)`,
      severity: 'recommended',
    })
  }

  // 8. Interface score >= 60
  const ifReport = checkInterfaces(doc)
  const ifPass = ifReport.overallScore >= 60
  checks.push({
    name: 'interface_quality',
    passed: ifPass,
    details: `Interface score: ${ifReport.overallScore} (meta: 60)`,
    severity: 'recommended',
  })

  // 9. High risks mitigated
  const riskReport = assessTechRisks(doc)
  const highUnmitigated = riskReport.risks.filter((r) => r.score >= 6 && !r.mitigated)
  const risksPass = highUnmitigated.length === 0
  checks.push({
    name: 'risks_mitigated',
    passed: risksPass,
    details: risksPass
      ? 'Todos riscos altos estão mitigados'
      : `${highUnmitigated.length} risco(s) alto(s) sem mitigação`,
    severity: 'recommended',
  })

  // 10. Has at least 1 milestone
  const hasMilestones = doc.nodes.some((n) => n.type === 'milestone')
  checks.push({
    name: 'has_milestones',
    passed: hasMilestones,
    details: hasMilestones
      ? `${doc.nodes.filter((n) => n.type === 'milestone').length} milestone(s) encontrado(s)`
      : 'Nenhum milestone definido',
    severity: 'recommended',
  })

  // 11. Harness score >= 55 (grade C+) — recommended; skipped in incremental scope
  // since the harness scan re-walks the full repo and is the most expensive check here.
  if (scope !== 'incremental') {
    try {
      const harness = runHarnessScanCached(process.cwd())
      const harnessPass = harness ? harness.score >= 55 : true
      checks.push({
        name: 'harness_minimum',
        passed: harnessPass,
        details: harness
          ? `Harness score: ${harness.score} (grade ${harness.grade}, meta: >= 55)`
          : 'Harness scan não disponível — check skippado',
        severity: 'recommended',
      })
    } catch {
      checks.push({
        name: 'harness_minimum',
        passed: true,
        details: 'Harness scan falhou — check skippado (non-blocking)',
        severity: 'recommended',
      })
    }
  }

  // ── Scoring ──
  const totalChecks = checks.length
  const passedChecks = checks.filter((c) => c.passed).length
  const score = Math.round((passedChecks / totalChecks) * 100)
  const grade = scoreToGrade(score)

  // Ready = all required checks passed
  const ready = checks.filter((c) => c.severity === 'required').every((c) => c.passed)

  const summary = ready
    ? `Design Ready (${grade}): ${passedChecks}/${totalChecks} checks passed, score ${score}`
    : `Design Not Ready: ${checks
        .filter((c) => c.severity === 'required' && !c.passed)
        .map((c) => c.name)
        .join(', ')} failed`

  log.info('design-readiness', { ready, score, grade, passed: passedChecks, total: totalChecks })

  return { checks, ready, score, grade, summary }
}
