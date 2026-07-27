/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /decompose-prd — ANALYZE→PLAN bridge: break epic into atomic XS/S subtasks.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed, fmtNode } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'decompose-prd.ts' })

export class DecomposePrdHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /decompose-prd ═']
    const doc = store.toGraphDocument()
    const epicId = args.trim()

    // Step 1: Find target epic(s)
    onProgress({
      step: 1,
      total: 6,
      label: 'Identificando epic alvo...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    let epics = doc.nodes.filter((n) => n.type === 'epic' && n.status !== 'done')
    if (epicId) {
      const target = doc.nodes.find((n) => n.id === epicId)
      if (!target || target.type !== 'epic') {
        return `═ /decompose-prd ═\nEpic não encontrado: ${epicId}\n═ ${fmtElapsed(Date.now() - startMs)} ═`
      }
      epics = [target]
    }
    lines.push(`Epics ativos: ${epics.length}`)

    // Step 2: Analyze decomposition state
    onProgress({
      step: 2,
      total: 6,
      label: 'Analisando decomposição...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    let totalUndecomposed = 0
    for (const epic of epics) {
      const children = doc.nodes.filter((n) => n.parentId === epic.id)
      if (children.length === 0) {
        totalUndecomposed++
        lines.push(`  ⚠ ${epic.title} (${epic.id}) — 0 filhos, precisa decompor`)
      } else {
        const subtasks = children.filter((c) => c.type === 'subtask' || c.type === 'task')
        const small = subtasks.filter((s) => s.xpSize === 'XS' || s.xpSize === 'S').length
        lines.push(`  ✓ ${epic.title}: ${subtasks.length} tasks, ${small} XS/S`)
      }
    }

    // Step 3: Check for oversized tasks
    onProgress({ step: 3, total: 6, label: 'Verificando sizing...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const allTasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
    const oversized = allTasks.filter(
      (t) => (t.xpSize === 'L' || t.xpSize === 'XL') && !doc.nodes.some((c) => c.parentId === t.id),
    )
    lines.push(`Tasks L/XL sem subtasks: ${oversized.length}`)
    for (const t of oversized.slice(0, 5)) {
      lines.push(`  ⚠ ${fmtNode(t)}`)
    }

    // Step 4: Check for missing ACs
    onProgress({ step: 4, total: 6, label: 'Validando ACs...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const tasksWithoutAc = allTasks.filter((t) => !t.acceptanceCriteria || t.acceptanceCriteria.length === 0)
    lines.push(`Tasks sem AC: ${tasksWithoutAc.length}/${allTasks.length}`)

    // Step 5: Dependency analysis
    onProgress({ step: 5, total: 6, label: 'Mapeando dependências...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const depEdges = doc.edges.filter((e) => e.relationType === 'depends_on')
    const blocking = doc.nodes.filter((n) => n.status === 'blocked')
    lines.push(`Dependências: ${depEdges.length} arestas · Tasks bloqueadas: ${blocking.length}`)

    // Step 6: Recommendations
    onProgress({ step: 6, total: 6, label: 'Recomendações...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    if (totalUndecomposed > 0) {
      lines.push('Ação: use /graph-plan para decompor epics em subtasks XS/S (≤2h cada).')
      lines.push('  Formato: Eα.Tβ — <verbo>-<objeto> (S)')
      lines.push('  Cada AC deve ser GIVEN/WHEN/THEN testável (mín 5 por task).')
    }
    if (oversized.length > 0) {
      lines.push('Ação: decomponha tasks L/XL em subtasks atômicas.')
    }
    if (tasksWithoutAc.length > 0) {
      lines.push('Ação: adicione acceptance criteria às tasks sem AC.')
    }
    if (totalUndecomposed === 0 && oversized.length === 0 && tasksWithoutAc.length === 0) {
      lines.push('✓ Estrutura de decomposição saudável. Pronto para PLAN.')
    }

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
