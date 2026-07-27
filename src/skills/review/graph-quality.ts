/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-quality — Code quality audit: lint, typecheck, complexity, naming.
 * No MCP dependency. Operates directly against SqliteStore + FS.
 * Extends AuditBaseHandler.
 */

import { AuditBaseHandler } from './audit-base-handler.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-quality.ts' })

export class GraphQualityHandler extends AuditBaseHandler {
  async run(_args: string): Promise<string> {
    this.header('graph-quality')
    const { store } = this

    this.step(1, 4, 'Rodando ESLint...')
    try {
      const { execSync } = await import('node:child_process')
      const lintOut = execSync('npx eslint src/ --quiet 2>&1 || true', { timeout: 60000, cwd: this.dir })
      const text = lintOut.toString()
      const errorMatch = text.match(/(\d+) errors?/)
      const warnMatch = text.match(/(\d+) warnings?/)
      const errors = errorMatch ? parseInt(errorMatch[1], 10) : 0
      const warnings = warnMatch ? parseInt(warnMatch[1], 10) : 0
      this.lines.push(`ESLint: ${errors} errors · ${warnings} warnings`)
      if (errors === 0 && warnings === 0) this.lines.push('  ✓ Código limpo')
    } catch {
      this.lines.push('  ESLint: indisponível')
    }

    this.step(2, 4, 'TypeScript typecheck...')
    try {
      const { execSync } = await import('node:child_process')
      const tsOut = execSync('npx tsc --noEmit 2>&1 || true', { timeout: 60000, cwd: this.dir })
      const tsLines = tsOut.toString().trim().split('\n').filter(Boolean)
      const errorCount = tsLines.filter((l) => l.includes('error TS')).length
      if (errorCount > 0) {
        this.lines.push(`TypeScript: ${errorCount} erro(s)`)
        for (const l of tsLines.slice(0, 5)) this.lines.push(`  • ${l.split('(')[0]}`)
      } else {
        this.lines.push('  ✓ Sem erros de tipo')
      }
    } catch {
      this.lines.push('  TypeScript: indisponível')
    }

    this.step(3, 4, 'Métricas de qualidade do grafo...')
    const doc = store.toGraphDocument()
    const tasksWithoutAC = doc.nodes.filter(
      (n) =>
        (n.type === 'task' || n.type === 'subtask') && (!n.acceptanceCriteria || n.acceptanceCriteria.length === 0),
    )
    const tasksWithoutDesc = doc.nodes.filter(
      (n) => (n.type === 'task' || n.type === 'subtask') && (!n.description || n.description.length < 10),
    )
    this.lines.push(`Tasks sem AC: ${tasksWithoutAC.length} · Sem descrição: ${tasksWithoutDesc.length}`)

    this.step(4, 4, 'Resumo...')
    const stats = store.getStats()
    this.lines.push(`Total: ${stats.totalNodes} nós · ${stats.totalEdges} arestas`)
    if (tasksWithoutAC.length > 0) this.lines.push('Recomendação: adicione acceptance criteria às tasks pendentes.')
    if (tasksWithoutDesc.length > 0) this.lines.push('Recomendação: adicione descrições às tasks.')
    this.lines.push(
      'Gate: npm run dev -- test --blast (blast) · agf check <id> --mutation --source <file> (mutation ≥0.60)',
    )

    return this.footer()
  }
}
