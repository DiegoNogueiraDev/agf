/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-listening — LISTENING phase: retrospective, feedback, next cycle.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-listening.ts' })

export class GraphListeningHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-listening ═']
    const doc = store.toGraphDocument()
    const stats = store.getStats()

    // Step 1: Sprint velocity
    onProgress({ step: 1, total: 4, label: 'Analisando velocidade...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const sprints = new Map<string, { done: number; total: number }>()
    for (const node of doc.nodes) {
      if (node.type !== 'task' && node.type !== 'subtask') continue
      const sprint = node.sprint ?? '(no sprint)'
      const entry = sprints.get(sprint) ?? { done: 0, total: 0 }
      entry.total++
      if (node.status === 'done') entry.done++
      sprints.set(sprint, entry)
    }
    lines.push(`Sprints:`)
    for (const [name, data] of sprints) {
      const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
      lines.push(`  ${name}: ${data.done}/${data.total} done (${pct}%)`)
    }

    // Step 2: Bottleneck detection
    onProgress({ step: 2, total: 4, label: 'Detectando gargalos...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const blocked = doc.nodes.filter((n) => n.blocked || n.status === 'blocked')
    const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
    const stuck = inProgress.filter((n) => {
      const age = Date.now() - new Date(n.updatedAt).getTime()
      return age > 48 * 60 * 60 * 1000
    })
    lines.push(`Em progresso: ${inProgress.length} · Bloqueadas: ${blocked.length}`)
    if (stuck.length > 0) {
      lines.push(`⚠ ${stuck.length} task(s) paradas há >48h:`)
      for (const s of stuck.slice(0, 3)) {
        lines.push(`  • ${s.title} (${s.id})`)
      }
    }

    // Step 3: Feedback collection
    onProgress({
      step: 3,
      total: 4,
      label: 'Coletando métricas de feedback...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const requirements = doc.nodes.filter((n) => n.type === 'requirement')
    lines.push(`Requisitos/ideias: ${requirements.length}`)

    // Step 4: Next cycle seeding
    onProgress({
      step: 4,
      total: 4,
      label: 'Preparando próximo ciclo...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const backlog = doc.nodes.filter((n) => n.status === 'backlog')
    const ready = doc.nodes.filter((n) => n.status === 'ready')
    lines.push(`Backlog: ${backlog.length} · Ready: ${ready.length}`)
    lines.push(``)
    lines.push(`Total: ${stats.totalNodes} nós · ${stats.totalEdges} arestas`)
    lines.push('Para próximo ciclo: crie novo epic ou use /graph-analyze')
    lines.push('Reinforcement: agf learning registra acertos/erros e orienta o tier-router no próximo ciclo.')

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
