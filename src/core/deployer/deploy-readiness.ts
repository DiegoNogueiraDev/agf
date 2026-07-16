/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deploy Readiness — composite gate for HANDOFF→DEPLOY transition.
 * Validates that the project is ready for release/deployment.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { DeployReadinessReport, DeployReadinessCheck } from '../../schemas/deployer-schema.js'
import { detectCycles } from '../planner/dependency-chain.js'
import { scoreToGrade } from '../utils/grading.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { nodeHasAc } from '../utils/ac-helpers.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { DeployReadinessError, getErrorMessage } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'deploy-readiness.ts' })

export interface DeployReadinessOptions {
  hasSnapshots?: boolean
  knowledgeCount?: number
}

/** Run HANDOFF-to-DEPLOY gate checks on the graph. */
export function checkDeployReadiness(doc: GraphDocument, opts?: DeployReadinessOptions): DeployReadinessReport {
  if (!doc || !doc.nodes) {
    throw new DeployReadinessError('Invalid graph document: missing nodes')
  }
  const checks: DeployReadinessCheck[] = []

  const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
  const doneTasks = tasks.filter((n) => n.status === 'done')

  // ── Required checks ──

  // 1. all_tasks_done — 100% tasks done
  const allDone = tasks.length > 0 && tasks.every((n) => n.status === 'done')
  checks.push({
    name: 'all_tasks_done',
    passed: allDone,
    details: allDone ? 'Todas tasks done' : `${doneTasks.length}/${tasks.length} tasks done (100% requerido)`,
    severity: 'required',
  })

  // 2. no_blocked_nodes — zero nodes with status=blocked
  const statusBlockedCount = doc.nodes.filter((n) => n.status === 'blocked').length
  const noBlocked = statusBlockedCount === 0
  checks.push({
    name: 'no_blocked_nodes',
    passed: noBlocked,
    details: noBlocked ? 'Nenhum node bloqueado' : `${statusBlockedCount} node(s) bloqueado(s)`,
    severity: 'required',
  })

  // 3. has_snapshot — snapshot must exist before deploying
  const hasSnapshots = opts?.hasSnapshots ?? false
  checks.push({
    name: 'has_snapshot',
    passed: hasSnapshots,
    details: hasSnapshots ? 'Snapshot do grafo existe' : 'Nenhum snapshot encontrado — criar snapshot antes de deploy',
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

  // 5. no_in_progress — zero in_progress tasks
  const inProgressTasks = tasks.filter((n) => n.status === 'in_progress')
  const noInProgress = inProgressTasks.length === 0
  checks.push({
    name: 'no_in_progress',
    passed: noInProgress,
    details: noInProgress ? 'Nenhuma task in_progress' : `${inProgressTasks.length} task(s) ainda in_progress`,
    severity: 'required',
  })

  // ── Recommended checks ──

  // 6. ac_coverage — ≥80% tasks with AC
  const tasksWithAC = tasks.filter((t) => nodeHasAc(doc, t.id))
  const acCoverage = tasks.length > 0 ? Math.round((tasksWithAC.length / tasks.length) * 100) : 0
  const acPass = acCoverage >= 80
  checks.push({
    name: 'ac_coverage',
    passed: acPass,
    details: `${acCoverage}% tasks com AC (meta: 80%)`,
    severity: 'recommended',
  })

  // 7. knowledge_captured — knowledge count > 0
  const knowledgeCount = opts?.knowledgeCount ?? 0
  const knowledgePass = knowledgeCount > 0
  checks.push({
    name: 'knowledge_captured',
    passed: knowledgePass,
    details: knowledgePass
      ? `${knowledgeCount} conhecimento(s) capturado(s)`
      : 'Nenhum conhecimento capturado no knowledge store',
    severity: 'recommended',
  })

  // Harness grade check — grade >= B (score >= 70) for deploy
  try {
    const harness = runHarnessScanCached(process.cwd())
    if (harness) {
      const harnessPass = harness.score >= 70
      checks.push({
        name: 'harness_deploy_grade',
        passed: harnessPass,
        details: `Harness grade: ${harness.grade} (score ${harness.score}, meta: >= B/70)`,
        severity: 'recommended',
      })
    }
  } catch (err) {
    log.debug('deploy-readiness: harness scan failed', { error: getErrorMessage(err) })
  }

  // ── Scoring ──
  const totalChecks = checks.length
  const passedChecks = checks.filter((c) => c.passed).length
  const score = Math.round((passedChecks / totalChecks) * 100)
  const grade = scoreToGrade(score)

  const ready = checks.filter((c) => c.severity === 'required').every((c) => c.passed)

  const summary = ready
    ? `Deploy Ready (${grade}): ${passedChecks}/${totalChecks} checks passed, score ${score}`
    : `Deploy Not Ready: ${checks
        .filter((c) => c.severity === 'required' && !c.passed)
        .map((c) => c.name)
        .join(', ')} failed`

  log.info('deploy-readiness', { ready, score, grade, passed: passedChecks, total: totalChecks })

  return { checks, ready, score, grade, summary }
}
