/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-design — DESIGN phase: ADRs, decisions, architecture overview.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import type { GraphDocument } from '../../core/graph/graph-types.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-design.ts' })

export class GraphDesignHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-design ═']

    onProgress({
      step: 1,
      total: 4,
      label: 'Analisando arquitetura...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const doc = store.toGraphDocument()

    const decisions = doc.nodes.filter((n) => n.type === 'decision')
    const interfaces = doc.nodes.filter((n) => n.type === 'interface')
    const stateMachines = doc.nodes.filter((n) => n.type === 'state_machine')

    lines.push(`Decisões arquiteturais (ADR): ${decisions.length}`)
    for (const d of decisions.slice(0, 5)) {
      lines.push(`  • ${d.title} [${d.status}]`)
    }
    if (decisions.length > 5) lines.push(`  +${decisions.length - 5} mais`)

    // Step 2: Check interfaces
    onProgress({
      step: 2,
      total: 4,
      label: 'Verificando interfaces...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    lines.push(`Interfaces definidas: ${interfaces.length}`)
    for (const iface of interfaces.slice(0, 3)) {
      lines.push(`  • ${iface.title}`)
    }

    // Step 3: State machines
    onProgress({ step: 3, total: 4, label: 'Máquinas de estado...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push(`Máquinas de estado: ${stateMachines.length}`)

    // Step 4: Dependency analysis
    onProgress({
      step: 4,
      total: 4,
      label: 'Analisando dependências...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const deps = doc.edges.filter((e) => e.relationType === 'depends_on')
    const cycles = this.findCycles(doc)
    lines.push(`Dependências: ${deps.length} aresta(s)`)
    lines.push(`Ciclos: ${cycles.length > 0 ? `⚠ ${cycles.length} ciclo(s) detectados` : '✓ nenhum'}`)

    lines.push('')
    lines.push('Para registrar nova decisão, use /node ou crie um ADR manualmente.')
    lines.push('Rationale: agf node rationale <id> registra decisão com fonte no rationale-store.')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private findCycles(doc: GraphDocument): string[] {
    const cycles: string[] = []
    const visited = new Set<string>()
    const stack = new Set<string>()

    const deps = doc.edges.filter((e) => e.relationType === 'depends_on')
    const adj = new Map<string, string[]>()
    for (const d of deps) {
      const list = adj.get(d.from) ?? []
      list.push(d.to)
      adj.set(d.from, list)
    }

    const dfs = (nodeId: string): boolean => {
      if (stack.has(nodeId)) return true
      if (visited.has(nodeId)) return false
      stack.add(nodeId)
      for (const neighbor of adj.get(nodeId) ?? []) {
        if (dfs(neighbor)) {
          cycles.push(nodeId)
          return true
        }
      }
      stack.delete(nodeId)
      visited.add(nodeId)
      return false
    }

    for (const n of doc.nodes) {
      if (!visited.has(n.id)) dfs(n.id)
    }
    return cycles
  }
}
