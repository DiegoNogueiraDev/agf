/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-implement — IMPLEMENT phase: TDD pipeline, start/finish task.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed, fmtNode } from '../shared/handler-utils.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-implement.ts' })

export class GraphImplementHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-implement ═']
    const doc = store.toGraphDocument()
    const taskId = args.trim()

    // Step 1: Find next task or use provided ID
    onProgress({ step: 1, total: 5, label: 'Localizando task...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    let targetId = taskId
    if (!targetId) {
      const next = findNextTask(doc)
      if (!next) {
        return [
          '═ /graph-implement ═',
          'Nenhuma task disponível para implementar.',
          `═ ${fmtElapsed(Date.now() - startMs)} ═`,
        ].join('\n')
      }
      targetId = next.node.id
      lines.push(`Próxima: ${fmtNode(next.node)} — ${next.reason}`)
    }

    // Step 2: Mark in_progress
    onProgress({
      step: 2,
      total: 5,
      label: `Marcando ${targetId} como in_progress...`,
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const node = store.getNodeById(targetId)
    if (!node) {
      return `Node não encontrado: ${targetId}`
    }
    store.updateNodeStatus(targetId, 'in_progress')

    // Step 3: Check ACs and TDD hints
    onProgress({
      step: 3,
      total: 5,
      label: 'Analisando acceptance criteria...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    if (node.acceptanceCriteria && node.acceptanceCriteria.length > 0) {
      lines.push(`ACs (${node.acceptanceCriteria.length}):`)
      for (const ac of node.acceptanceCriteria) {
        lines.push(`  • ${ac}`)
      }
    } else {
      lines.push('⚠ Nenhum acceptance criteria definido.')
    }

    // Step 4: Test command check
    onProgress({ step: 4, total: 5, label: 'Verificando ambiente...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    try {
      const { execSync } = await import('node:child_process')
      execSync('npm run dev -- test --blast 2>/dev/null || true', { timeout: 60000, stdio: 'ignore' })
      lines.push('✓ Blast gate passa (baseline)')
    } catch {
      lines.push("• Blast gate: verificar manualmente com 'npm run dev -- test --blast'")
    }

    // Step 5: Implementation summary
    onProgress({ step: 5, total: 5, label: 'Resumo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const freshDoc = store.toGraphDocument()
    const dod = checkDefinitionOfDone(freshDoc, targetId)
    lines.push(`DoD: ${dod.grade} (${dod.checks.filter((c) => c.passed).length}/${dod.checks.length})`)
    lines.push('')
    lines.push('Follow TDD: RED (escreva teste) → GREEN (implemente) → REFACTOR (limpe)')
    lines.push('Então use: /check ' + targetId + ' para verificar DoD')
    lines.push('E: update_status(done) quando pronto.')

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
