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

  // ESCOPO DO RELEASE, não do grafo inteiro. Um nó `blocked` COM investigação
  // escrita é adiamento consciente — a colheita de dormência enfileira dezenas
  // deles, e exigir zero fazia o gate nunca ficar verde. Gate que nunca fica
  // verde é decoração, e o projeto passou uma sessão inteira consertando
  // exatamente esse padrão (medido, exibido, não cobrado).
  //
  // O que NÃO afrouxou: silêncio não é adiamento. Bloqueado sem motivo escrito
  // continua travando, e a contagem de adiados aparece no details — nada some.
  const DEFERRAL_REASON_MIN_CHARS = 200
  /**
   * Status que descrevem trabalho NÃO-ACIONÁVEL — desde que o motivo esteja
   * escrito. `blocked` = adiado com justificativa; `quarantined` = achado
   * investigado e RETRATADO como falso-positivo. Nenhum dos dois é trabalho a
   * fazer, e o gate pergunta exatamente isso.
   */
  const DEFERRABLE_STATUSES = new Set(['blocked', 'quarantined'])
  /**
   * A exigência de motivo escrito vale para os DOIS: sem ela, qualquer
   * pendência sumiria com uma troca de status, e o gate viraria decoração.
   */
  const isDeferred = (n: (typeof doc.nodes)[number]): boolean =>
    DEFERRABLE_STATUSES.has(n.status) && (n.description ?? '').length >= DEFERRAL_REASON_MIN_CHARS

  // 1. all_tasks_done — nenhuma task ACIONÁVEL pendente (adiadas não contam)
  const unfinished = tasks.filter((n) => n.status !== 'done' && !isDeferred(n))
  const allDone = tasks.length > 0 && unfinished.length === 0
  checks.push({
    name: 'all_tasks_done',
    passed: allDone,
    details: allDone
      ? `Nenhuma task acionável pendente (${doneTasks.length} done, ${tasks.filter(isDeferred).length} adiadas com motivo)`
      : `${unfinished.length} task(s) acionável(is) pendente(s): ${unfinished
          .slice(0, 3)
          .map((n) => n.id)
          .join(', ')}`,
    severity: 'required',
  })

  // 2. no_blocked_nodes — zero nodes with status=blocked
  // Só conta bloqueio SEM motivo: com investigação escrita é adiamento, e o
  // total adiado vai no details para continuar visível.
  const blockedNodes = doc.nodes.filter((n) => n.status === 'blocked')
  const unexplained = blockedNodes.filter((n) => !isDeferred(n))
  const statusBlockedCount = unexplained.length
  const noBlocked = statusBlockedCount === 0
  checks.push({
    name: 'no_blocked_nodes',
    passed: noBlocked,
    details: noBlocked
      ? `Nenhum bloqueio sem motivo (${blockedNodes.length - statusBlockedCount} adiado(s) com investigação escrita)`
      : `${statusBlockedCount} node(s) bloqueado(s) SEM motivo escrito: ${unexplained
          .slice(0, 3)
          .map((n) => n.id)
          .join(', ')}`,
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
        // REQUIRED, nao recommended (node_9d7942d39710): o limiar de 70 ja
        // existia aqui e o gate liberava do mesmo jeito, porque `ready` so olha
        // checks required — medido, exibido e nao cobrado. Virar required foi
        // seguro: o harness real estava em 87.2 (grade A), entao a mudanca nao
        // bloqueia nada hoje e passa a bloquear se o score regredir abaixo de
        // 70. Catraca, nao meta nova.
        severity: 'required',
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
