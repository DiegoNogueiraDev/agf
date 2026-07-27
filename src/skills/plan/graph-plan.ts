/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-plan — PLAN phase: decompose epics, plan sprint, estimate.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-plan.ts' })

export class GraphPlanHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-plan ═']
    const doc = store.toGraphDocument()

    // Step 1: Find epics without tasks
    onProgress({ step: 1, total: 5, label: 'Analisando epics...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const epics = doc.nodes.filter((n) => n.type === 'epic' && n.status !== 'done')
    const undecomposed = epics.filter((e) => !doc.nodes.some((n) => n.parentId === e.id))
    lines.push(`Epics: ${epics.length} · Sem tasks: ${undecomposed.length}`)

    for (const e of undecomposed.slice(0, 5)) {
      lines.push(`  ⚠ ${e.title} (${e.id}) — sem tasks filhas`)
    }

    // Step 2: Check for oversized tasks
    onProgress({ step: 2, total: 5, label: 'Verificando sizing...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const tasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
    const oversized = tasks.filter(
      (t) => (t.xpSize === 'L' || t.xpSize === 'XL') && !doc.nodes.some((n) => n.parentId === t.id),
    )
    lines.push(`Tasks: ${tasks.length} · Oversized (L/XL sem subtasks): ${oversized.length}`)

    // Step 3: Dependency check
    onProgress({ step: 3, total: 5, label: 'Mapeando dependências...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const deps = doc.edges.filter((e) => e.relationType === 'depends_on')
    const tasksWithDeps = new Set(deps.map((d) => d.from))
    lines.push(`Dependências: ${deps.length} aresta(s) · ${tasksWithDeps.size} task(s) com dependências`)

    // Step 4: Sprint planning
    onProgress({ step: 4, total: 5, label: 'Planejando sprint...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const sprints = new Set(tasks.map((t) => t.sprint).filter(Boolean))
    const unassigned = tasks.filter((t) => !t.sprint && (t.status === 'backlog' || t.status === 'ready'))
    lines.push(
      `Sprints: ${sprints.size > 0 ? [...sprints].join(', ') : 'nenhum'} · Não atribuídas: ${unassigned.length}`,
    )

    // Estimate totals
    const estimated = tasks.filter((t) => t.estimateMinutes != null)
    const totalEstimate = estimated.reduce((acc, t) => acc + (t.estimateMinutes ?? 0), 0)
    lines.push(`Estimativa total: ${totalEstimate}min (${estimated.length}/${tasks.length} tasks estimadas)`)

    // Step 5: Recommendations
    onProgress({ step: 5, total: 5, label: 'Recomendações...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    if (undecomposed.length > 0) {
      lines.push('Recomendação: decomponha epics sem tasks com smart_decompose.')
    }
    if (oversized.length > 0) {
      lines.push('Recomendação: decomponha tasks L/XL em subtasks menores.')
    }
    if (unassigned.length > 0) {
      lines.push('Recomendação: atribua sprints às tasks não planejadas.')
    }

    lines.push('Hard-block: agf next detecta bloqueadores críticos (hard-block-detector) antes de puxar a task.')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
