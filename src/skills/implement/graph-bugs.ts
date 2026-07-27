/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-bugs — Bug discovery + structured fix: LSP, patterns, reproduce, 5-Whys.
 * No MCP dependency. Operates directly against SqliteStore + filesystem.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import type { GraphNode } from '../../core/graph/graph-types.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-bugs.ts' })

export class GraphBugsHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-bugs ═']
    const mode = args.trim().toLowerCase() || 'hunt'

    switch (mode) {
      case 'hunt':
        return this.huntBugs(store, dir, onProgress, startMs, lines)
      case 'fix':
        return this.fixBug(store, dir, args, onProgress, startMs, lines)
      default:
        if (args.trim()) {
          return this.fixBug(store, dir, args, onProgress, startMs, lines)
        }
        return this.huntBugs(store, dir, onProgress, startMs, lines)
    }
  }

  private async huntBugs(
    store: SkillExecutionContext['store'],
    dir: string,
    onProgress: SkillExecutionContext['onProgress'],
    startMs: number,
    lines: string[],
  ): Promise<string> {
    // Step 1: Check graph for anomaly patterns
    onProgress({
      step: 1,
      total: 3,
      label: 'Escaneando padrões de erro...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const doc = store.toGraphDocument()
    const stuck = doc.nodes.filter(
      (n) => n.status === 'in_progress' && Date.now() - new Date(n.updatedAt).getTime() > 24 * 60 * 60 * 1000,
    )
    if (stuck.length > 0) lines.push(`⚠ ${stuck.length} task(s) paradas há >24h`)

    // Step 2: Check for recurrent error types
    onProgress({
      step: 2,
      total: 3,
      label: 'Analisando padrões de erro...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    try {
      const { readdirSync, existsSync } = await import('node:fs')
      const memoriesDir = `${dir}/workflow-graph/memories`
      if (existsSync(memoriesDir)) {
        const healingFiles = readdirSync(memoriesDir).filter((f) => f.startsWith('healing-'))
        if (healingFiles.length > 0) {
          lines.push(`📖 ${healingFiles.length} registro(s) de auto-correção:`)
          for (const f of healingFiles.slice(0, 5)) {
            lines.push(`  • ${f.replace('.md', '')}`)
          }
        }
      }
    } catch {
      // ignore FS errors
    }

    // Step 3: Summary
    onProgress({ step: 3, total: 3, label: 'Resumo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('Para caçar bugs específicos, verifique LSP diagnostics no editor.')
    lines.push('Use /graph-bugs fix <descrição> para reportar e iniciar correção.')
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private async fixBug(
    store: SkillExecutionContext['store'],
    dir: string,
    args: string,
    onProgress: SkillExecutionContext['onProgress'],
    startMs: number,
    lines: string[],
  ): Promise<string> {
    onProgress({ step: 1, total: 2, label: 'Registrando bug...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const bugTitle = args.replace(/^fix\s+/i, '').trim() || 'Bug report'
    const timestamp = new Date().toISOString()

    const doc = store.toGraphDocument()
    const epic = doc.nodes.find((n) => n.type === 'epic' && n.status !== 'done')
    const node: Record<string, unknown> = {
      id: `bug_${Date.now().toString(36)}`,
      type: 'task' as const,
      title: bugTitle,
      description: `Bug reportado via /graph-bugs fix\nData: ${timestamp}`,
      status: 'ready' as const,
      priority: 1 as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      parentId: epic?.id ?? null,
      acceptanceCriteria: [
        'Bug reproduzido com steps mínimos',
        'Root cause identificado (5-Whys)',
        'Correção implementada com TDD',
        'Regressão prevenida com teste',
      ],
    }
    store.insertNode(node as unknown as GraphNode)
    lines.push(`✓ Bug registrado: ${node.id} — "${bugTitle}"`)
    if (epic) lines.push(`  Parent: ${epic.title} (${epic.id})`)

    onProgress({ step: 2, total: 2, label: 'Próximos passos...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    lines.push('Fluxo de correção:')
    lines.push('1. Reproduza o bug (RED)')
    lines.push('2. 5-Whys: encontre a causa raiz')
    lines.push('3. Implemente a correção (GREEN)')
    lines.push('4. Adicione teste de regressão')
    lines.push('5. Use /check ' + node.id + ' e update_status(done)')

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
