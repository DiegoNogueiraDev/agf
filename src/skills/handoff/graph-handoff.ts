/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-handoff — HANDOFF phase: memories, snapshot, export, doc completeness.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-handoff.ts' })

export class GraphHandoffHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-handoff ═']
    const doc = store.toGraphDocument()

    // Step 1: Create snapshot
    onProgress({ step: 1, total: 4, label: 'Criando snapshot...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    try {
      const snapshotId = store.createSnapshot()
      lines.push(`✓ Snapshot criado: #${snapshotId}`)
    } catch (err) {
      lines.push(`⚠ Erro ao criar snapshot: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Step 2: Check document completeness
    onProgress({
      step: 2,
      total: 4,
      label: 'Verificando documentação...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const stats = store.getStats()
    const decisions = doc.nodes.filter((n) => n.type === 'decision')
    const doneTasks = doc.nodes.filter((n) => n.status === 'done' && (n.type === 'task' || n.type === 'subtask'))
    lines.push(`Decisões documentadas (ADRs): ${decisions.length}`)
    lines.push(`Tasks concluídas: ${doneTasks.length}/${stats.totalNodes}`)

    // Step 3: Gather completion data
    onProgress({
      step: 3,
      total: 4,
      label: 'Compilando dados de entrega...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const byType = stats.byType
    const epicDone = doc.nodes.filter((n) => n.type === 'epic' && n.status === 'done').length
    const totalEpics = doc.nodes.filter((n) => n.type === 'epic').length
    lines.push(`Épicos: ${epicDone}/${totalEpics} concluídos`)
    lines.push(
      `Por tipo: ${Object.entries(byType)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    )

    // Step 4: Document handoff summary
    onProgress({
      step: 4,
      total: 4,
      label: 'Gerando resumo de handoff...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const completion = stats.totalNodes > 0 ? Math.round(((stats.byStatus.done ?? 0) / stats.totalNodes) * 100) : 0
    const memoriesDir = `${dir}/workflow-graph/memories`
    const { existsSync } = await import('node:fs')
    const hasMemories = existsSync(memoriesDir)

    lines.push('')
    lines.push(`Resumo: ${completion}% completo · ${stats.totalNodes} nós · ${stats.totalEdges} arestas`)
    lines.push(`Memórias: ${hasMemories ? '✓ diretório presente' : '⚠ sem diretório de memórias'}`)
    lines.push('Para exportar conhecimento completo, use knowledge(export).')
    lines.push('Ou crie PR via git push.')

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
