/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Feedback Readiness — composite gate for HANDOFF→LISTENING transition.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { ListenerReadinessReport, ListenerReadinessCheck } from '../../schemas/listener-schema.js'
import { analyzeScope } from '../analyzer/scope-analyzer.js'
import { calculateVelocity } from '../planner/velocity.js'
import { analyzeBacklogHealth } from './backlog-health.js'
import { scoreToGrade } from '../utils/grading.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { McpGraphError, getErrorMessage } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'feedback-readiness.ts' })

export interface ListeningReadinessOptions {
  hasSnapshots?: boolean
  knowledgeCount?: number
}

/** Run HANDOFF-to-LISTENING gate checks on the graph. */
export function checkListeningReadiness(doc: GraphDocument, opts?: ListeningReadinessOptions): ListenerReadinessReport {
  const checks: ListenerReadinessCheck[] = []

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

  // 2. has_snapshot — snapshot exists (recommended in gate context, required via analyze mode)
  const hasSnapshots = opts?.hasSnapshots ?? false
  checks.push({
    name: 'has_snapshot',
    passed: hasSnapshots,
    details: hasSnapshots ? 'Snapshot do grafo existe' : 'Nenhum snapshot encontrado',
    severity: 'recommended',
  })

  // 3. no_in_progress — zero in_progress tasks
  const inProgressTasks = tasks.filter((n) => n.status === 'in_progress')
  const noInProgress = inProgressTasks.length === 0
  checks.push({
    name: 'no_in_progress',
    passed: noInProgress,
    details: noInProgress ? 'Nenhuma task in_progress' : `${inProgressTasks.length} task(s) ainda in_progress`,
    severity: 'required',
  })

  // 4. no_blocked — zero tasks with status=blocked (Bug #012)
  const statusBlockedTasks = tasks.filter((t) => t.status === 'blocked')
  const noBlocked = statusBlockedTasks.length === 0
  checks.push({
    name: 'no_blocked',
    passed: noBlocked,
    details: noBlocked ? 'Nenhuma task bloqueada' : `${statusBlockedTasks.length} task(s) bloqueada(s)`,
    severity: 'required',
  })

  // ── Recommended checks ──

  // 5. velocity_trend — ≥2 sprints with velocity data
  const velocity = calculateVelocity(doc)
  const velocityPass = velocity.sprints.length >= 2
  checks.push({
    name: 'velocity_trend',
    passed: velocityPass,
    details: velocityPass
      ? `${velocity.sprints.length} sprints com dados de velocidade`
      : `Apenas ${velocity.sprints.length} sprint(s) com dados (meta: ≥2)`,
    severity: 'recommended',
  })

  // 6. knowledge_indexed — knowledge count > 0
  const knowledgeCount = opts?.knowledgeCount ?? 0
  const knowledgePass = knowledgeCount > 0
  checks.push({
    name: 'knowledge_indexed',
    passed: knowledgePass,
    details: knowledgePass ? `${knowledgeCount} conhecimento(s) indexado(s)` : 'Nenhum conhecimento indexado',
    severity: 'recommended',
  })

  // 7. no_orphan_requirements — zero requirements without linked tasks
  const scopeAnalysis = analyzeScope(doc)
  const orphanReqs = scopeAnalysis.orphans.filter((o) => o.type === 'requirement')
  const noOrphanReqs = orphanReqs.length === 0
  checks.push({
    name: 'no_orphan_requirements',
    passed: noOrphanReqs,
    details: noOrphanReqs
      ? 'Todos requirements linkados a tasks'
      : `${orphanReqs.length} requirement(s) sem tasks linkadas`,
    severity: 'recommended',
  })

  // 8. backlog_health — clean backlog for new cycle
  const healthReport = analyzeBacklogHealth(doc)
  checks.push({
    name: 'backlog_health',
    passed: healthReport.cleanForNewCycle,
    details: healthReport.cleanForNewCycle
      ? 'Backlog limpo para novo ciclo'
      : `${healthReport.staleTasks.length} task(s) stale, ${healthReport.techDebtIndicators.length} indicador(es) de tech debt`,
    severity: 'recommended',
  })

  // Harness baseline — save score as post-deploy reference
  try {
    const harness = runHarnessScanCached(process.cwd())
    if (harness) {
      checks.push({
        name: 'harness_baseline',
        passed: true,
        details: `Harness baseline: score ${harness.score} (grade ${harness.grade}) — salvo como referência pós-deploy`,
        severity: 'recommended',
      })
    }
  } catch (err) {
    log.debug('listening-readiness: harness scan failed', { error: getErrorMessage(err) })
  }

  // ── Scoring ──
  const totalChecks = checks.length
  if (totalChecks === 0) {
    throw new McpGraphError('Listening readiness: no checks were generated')
  }
  const passedChecks = checks.filter((c) => c.passed).length
  const score = Math.round((passedChecks / totalChecks) * 100)
  const grade = scoreToGrade(score)

  const ready = checks.filter((c) => c.severity === 'required').every((c) => c.passed)

  const summary = ready
    ? `Listening Ready (${grade}): ${passedChecks}/${totalChecks} checks passed, score ${score}`
    : `Listening Not Ready: ${checks
        .filter((c) => c.severity === 'required' && !c.passed)
        .map((c) => c.name)
        .join(', ')} failed`

  log.info('listening-readiness', { ready, score, grade, passed: passedChecks, total: totalChecks })

  return { checks, ready, score, grade, summary }
}
