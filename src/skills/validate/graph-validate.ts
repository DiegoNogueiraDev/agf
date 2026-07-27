/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-validate — VALIDATE phase: AC verification, done integrity, quality.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-validate.ts' })

export class GraphValidateHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-validate ═']
    const doc = store.toGraphDocument()

    // Step 1: Check all in_progress tasks
    onProgress({
      step: 1,
      total: 4,
      label: 'Verificando tasks em progresso...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
    lines.push(`Tasks em progresso: ${inProgress.length}`)

    let dodPass = 0
    let dodFail = 0
    for (const task of inProgress) {
      const dod = checkDefinitionOfDone(doc, task.id)
      if (dod.ready) {
        dodPass++
        lines.push(`  ✓ ${task.title} — DoD pronto (${dod.grade})`)
      } else {
        dodFail++
        const failed = dod.checks.filter((c) => !c.passed && c.severity === 'required')
        if (failed.length > 0) {
          lines.push(`  ⚠ ${task.title} — faltam: ${failed.map((c) => c.name).join(', ')}`)
        }
      }
    }

    // Step 2: Done integrity check
    onProgress({
      step: 2,
      total: 4,
      label: 'Verificando integridade de tasks done...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const doneTasks = doc.nodes.filter((n) => n.status === 'done' && (n.type === 'task' || n.type === 'subtask'))
    const deps = doc.edges.filter((e) => e.relationType === 'depends_on')
    const doneIds = new Set(doneTasks.map((t) => t.id))
    const integrityIssues: string[] = []

    for (const task of doneTasks) {
      const taskDeps = deps.filter((d) => d.from === task.id)
      for (const dep of taskDeps) {
        if (!doneIds.has(dep.to)) {
          const depNode = doc.nodes.find((n) => n.id === dep.to)
          integrityIssues.push(
            `${task.title} → depende de ${depNode?.title ?? dep.to} (${depNode?.status ?? 'not found'})`,
          )
        }
      }
    }
    lines.push(`Tasks done: ${doneTasks.length} · Issues de integridade: ${integrityIssues.length}`)
    for (const issue of integrityIssues.slice(0, 5)) {
      lines.push(`  ⚠ ${issue}`)
    }

    // Step 3: AC quality
    onProgress({
      step: 3,
      total: 4,
      label: 'Qualidade dos acceptance criteria...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const tasksWithAC = doc.nodes.filter((n) => n.acceptanceCriteria && n.acceptanceCriteria.length > 0)
    const totalAC = tasksWithAC.reduce((acc, n) => acc + (n.acceptanceCriteria?.length ?? 0), 0)
    lines.push(`Tasks com AC: ${tasksWithAC.length} · Total ACs: ${totalAC}`)

    // Step 4: Test coverage
    onProgress({ step: 4, total: 4, label: 'Cobertura de testes...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const withTestFiles = doc.nodes.filter((n) => n.testFiles && n.testFiles.length > 0)
    lines.push(`Tasks com testFiles: ${withTestFiles.length}`)

    lines.push(``)
    lines.push(`Validação: ${dodPass} prontas, ${dodFail} com pendências`)
    if (dodPass > 0) lines.push('Use update_status(done) para concluir tasks prontas.')
    lines.push('Gate: agf check <id> --mutation --source <file> (mutation-gate, kill-ratio ≥0.60)')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
