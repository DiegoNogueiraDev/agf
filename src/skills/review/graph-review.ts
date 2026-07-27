/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-review — REVIEW phase: code review, blast radius, diff analysis.
 * No MCP dependency. Operates directly against SqliteStore.
 * Extends AuditBaseHandler.
 */

import { AuditBaseHandler } from './audit-base-handler.js'
import { fmtNode } from '../shared/handler-utils.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-review.ts' })

export class GraphReviewHandler extends AuditBaseHandler {
  async run(_args: string): Promise<string> {
    this.header('graph-review')
    const { store } = this
    const doc = store.toGraphDocument()

    this.step(1, 5, 'Tasks para revisão...')
    const doneRecently = doc.nodes
      .filter((n) => n.status === 'done' && (n.type === 'task' || n.type === 'subtask'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    this.lines.push(`Tasks done: ${doneRecently.length}`)

    const reviewCandidates = doneRecently.slice(0, 10)
    for (const task of reviewCandidates) {
      const dod = checkDefinitionOfDone(doc, task.id)
      this.lines.push(`  ${fmtNode(task)} — DoD: ${dod.grade} (${dod.score}%)`)
    }

    this.step(2, 5, 'Verificando testFiles...')
    const withTests = reviewCandidates.filter((t) => t.testFiles && t.testFiles.length > 0)
    const withoutTests = reviewCandidates.filter((t) => !t.testFiles || t.testFiles.length === 0)
    this.lines.push(`Com testFiles: ${withTests.length} · Sem testFiles: ${withoutTests.length}`)

    this.step(3, 5, 'Qualidade das descrições...')
    const withDesc = doneRecently.filter((t) => t.description && t.description.length > 20)
    this.lines.push(`Com descrição detalhada: ${withDesc.length}/${doneRecently.length}`)

    this.step(4, 5, 'Integridade de dependências...')
    const deps = doc.edges.filter((e) => e.relationType === 'depends_on')
    const doneIds = new Set(doc.nodes.filter((n) => n.status === 'done').map((n) => n.id))
    const unresolved = deps.filter((d) => doneIds.has(d.from) && !doneIds.has(d.to))
    if (unresolved.length > 0) {
      this.lines.push(`⚠ ${unresolved.length} dependência(s) de tasks done para não-done:`)
      for (const d of unresolved.slice(0, 5)) {
        const from = doc.nodes.find((n) => n.id === d.from)
        const to = doc.nodes.find((n) => n.id === d.to)
        this.lines.push(`  ${from?.title ?? d.from} → ${to?.title ?? d.to} (${to?.status ?? '?'})`)
      }
    } else {
      this.lines.push('✓ Todas as dependências estão consistentes')
    }

    this.step(5, 5, 'Saúde do projeto...')
    const stats = store.getStats()
    const completion = stats.totalNodes > 0 ? Math.round(((stats.byStatus.done ?? 0) / stats.totalNodes) * 100) : 0
    this.lines.push(`Progresso: ${completion}% done (${stats.byStatus.done ?? 0}/${stats.totalNodes})`)
    this.lines.push('Pack: agf pack --offline gera context-pack compacto sem chamada LLM.')

    return this.footer()
  }
}
