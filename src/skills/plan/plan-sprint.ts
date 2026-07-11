/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /plan-sprint — PLAN phase: sprint capacity planning with WIP=1 enforcement.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed, fmtNode } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'plan-sprint.ts' })

const DEFAULT_FOCUS_FACTOR = 0.65
const DEFAULT_HOURS = 40

export class PlanSprintHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /plan-sprint ═']
    const doc = store.toGraphDocument()

    const parts = args.trim().split(/\s+/)
    const hoursAvailable = parseInt(parts[0], 10) || DEFAULT_HOURS
    const focusFactor = parts[1] ? parseFloat(parts[1]) : DEFAULT_FOCUS_FACTOR
    const capacityMin = Math.floor(hoursAvailable * focusFactor * 60)

    // Step 1: Compute capacity
    onProgress({ step: 1, total: 6, label: 'Calculando capacidade...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push(
      `Capacidade: ${hoursAvailable}h × ${focusFactor} = ${Math.floor(capacityMin / 60)}h${capacityMin % 60 > 0 ? ` ${capacityMin % 60}min` : ''} (${capacityMin}min)`,
    )

    // Step 2: Gather ready tasks
    onProgress({
      step: 2,
      total: 6,
      label: 'Coletando tasks prontas...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const tasks = doc.nodes.filter(
      (n) => (n.type === 'task' || n.type === 'subtask') && (n.status === 'backlog' || n.status === 'ready'),
    )
    const ready = tasks.filter((t) => t.status === 'ready')
    lines.push(`Tasks disponíveis: ${tasks.length} (${ready.length} ready)`)

    // Step 3: Sort by dependency order (topological via priority)
    onProgress({
      step: 3,
      total: 6,
      label: 'Ordenando por dependências...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const depEdges = doc.edges.filter((e) => e.relationType === 'depends_on')
    const depsByTarget = new Map<string, string[]>()
    for (const e of depEdges) {
      const list = depsByTarget.get(e.to) ?? []
      list.push(e.from)
      depsByTarget.set(e.to, list)
    }

    const sorted = [...ready].sort((a, b) => {
      const aBlocked = depsByTarget.has(a.id)
      const bBlocked = depsByTarget.has(b.id)
      if (aBlocked && !bBlocked) return 1
      if (!aBlocked && bBlocked) return -1
      return (a.priority ?? 99) - (b.priority ?? 99)
    })

    // Step 4: Greedy pack
    onProgress({ step: 4, total: 6, label: 'Empacotando sprint...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const sprint: typeof sorted = []
    let usedMin = 0
    const blockedTasks: typeof sorted = []

    for (const t of sorted) {
      if (depsByTarget.has(t.id)) {
        blockedTasks.push(t)
        continue
      }
      const est = t.estimateMinutes ?? 60
      if (usedMin + est <= capacityMin) {
        sprint.push(t)
        usedMin += est
      }
    }
    lines.push(
      `Sprint: ${sprint.length} tasks · ${usedMin}min / ${capacityMin}min (${Math.round((usedMin / capacityMin) * 100)}%)`,
    )

    // Step 5: WIP=1 check
    onProgress({ step: 5, total: 6, label: 'Verificando WIP=1...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
    if (inProgress.length > 1) {
      lines.push(`⚠ Violação WIP=1: ${inProgress.length} tasks in_progress`)
      for (const t of inProgress) {
        lines.push(`  → ${fmtNode(t)}`)
      }
    } else {
      lines.push(`✓ WIP=1 respeitado (${inProgress.length} ativa)`)
    }

    // Step 6: Recommendations
    onProgress({ step: 6, total: 6, label: 'Recomendações...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    if (sprint.length === 0) {
      lines.push('⚠ Nenhuma task livre para incluir no sprint.')
    } else {
      lines.push('Sprint planejado:')
      for (const t of sprint.slice(0, 10)) {
        lines.push(`  ${fmtNode(t)}`)
      }
      if (sprint.length > 10) {
        lines.push(`  … +${sprint.length - 10} tasks`)
      }
    }
    if (blockedTasks.length > 0) {
      lines.push(`Tasks bloqueadas por dependências: ${blockedTasks.length}`)
      lines.push('  Resolva bloqueios antes de iniciar o sprint.')
    }
    if (tasks.length - ready.length > 0) {
      lines.push(`Tasks em backlog (não ready): ${tasks.length - ready.length}`)
    }

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
