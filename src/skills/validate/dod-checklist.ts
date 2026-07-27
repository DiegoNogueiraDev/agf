/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /dod-checklist — VALIDATE helper: explicit Definition of Done checklist.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'dod-checklist.ts' })

export class DodChecklistHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /dod-checklist ═']
    const doc = store.toGraphDocument()
    const taskId = args.trim()

    // Step 1: Find target task(s)
    onProgress({ step: 1, total: 5, label: 'Localizando tasks...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    let taskIds: string[]
    if (taskId) {
      taskIds = [taskId]
    } else {
      const inProgress = doc.nodes.filter(
        (n) => n.status === 'in_progress' && (n.type === 'task' || n.type === 'subtask'),
      )
      taskIds = inProgress.map((n) => n.id)
    }
    if (taskIds.length === 0) {
      lines.push('Nenhuma task encontrada. Passe um nodeId ou tenha tasks in_progress.')
      return lines.join('\n')
    }
    lines.push(`Verificando DoD para ${taskIds.length} task(s)`)

    // Step 2: Run DoD check on each
    onProgress({ step: 2, total: 5, label: 'Executando DoD...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    for (const id of taskIds) {
      const node = doc.nodes.find((n) => n.id === id)
      if (!node) {
        lines.push(`✗ ${id}: não encontrado`)
        continue
      }
      const report = checkDefinitionOfDone(doc, id)

      onProgress({
        step: 3,
        total: 5,
        label: `Analisando ${node.title}...`,
        elapsedMs: Date.now() - startMs,
        tokensUsed: 0,
      })
      lines.push('')
      lines.push(`${report.ready ? '✓' : '✗'} ${node.title} — ${report.grade} (${report.score}/100)`)

      // Step 3: List each check
      const requiredChecks = report.checks.filter((c) => c.severity === 'required')
      const recommendedChecks = report.checks.filter((c) => c.severity !== 'required')

      lines.push('  Required:')
      for (const c of requiredChecks) {
        lines.push(`    ${c.passed ? '✓' : '✗'} ${c.name}: ${c.details ?? ''}`)
      }
      lines.push('  Recommended:')
      for (const c of recommendedChecks) {
        lines.push(`    ${c.passed ? '✓' : '✗'} ${c.name}: ${c.details ?? ''}`)
      }

      // Step 4: Gap analysis
      const failed = report.checks.filter((c) => !c.passed)
      if (failed.length > 0) {
        lines.push(`  Ações pendentes (${failed.length}):`)
        for (const c of failed) {
          lines.push(`    → Corrigir: ${c.name} (${c.severity})`)
        }
      }
    }

    // Step 5: Summary
    onProgress({ step: 5, total: 5, label: 'Resumo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    const allReady = taskIds.every((id) => {
      const report = checkDefinitionOfDone(doc, id)
      return report.ready
    })
    if (allReady) {
      lines.push('✓ Todas as tasks passam DoD — prontas para done.')
    } else {
      lines.push('⚠ Nem todas as tasks passam DoD. Corrija os itens acima antes de marcar done.')
    }

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
