/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-analyze — ANALYZE phase: PRD import, quality validation, DoR gate.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-analyze.ts' })

export class GraphAnalyzeHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-analyze ═']

    // Step 1: Graph stats check
    onProgress({
      step: 1,
      total: 4,
      label: 'Verificando estado do grafo...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const stats = store.getStats()
    lines.push(
      `Grafo: ${stats.totalNodes} nós · ${Object.entries(stats.byStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}`,
    )

    // Step 2: Check for epics and requirements
    onProgress({
      step: 2,
      total: 4,
      label: 'Verificando requisitos...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const doc = store.toGraphDocument()
    const epics = doc.nodes.filter((n) => n.type === 'epic')
    const reqs = doc.nodes.filter((n) => n.type === 'requirement')
    lines.push(`Epics: ${epics.length} · Requisitos: ${reqs.length}`)

    if (epics.length === 0 && reqs.length === 0) {
      lines.push('⚠ Nenhum epic ou requisito encontrado.')
      lines.push('  Use /import-prd <arquivo> para importar um PRD.')
      lines.push('  Ou /generate-prd <descrição> para gerar um novo PRD.')
      return lines.join('\n')
    }

    // Step 3: Validate with core analyzer (prd_quality via existing code)
    onProgress({
      step: 3,
      total: 4,
      label: 'Validando qualidade PRD...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    try {
      const { checkDefinitionOfDone } = await import('../../core/implementer/definition-of-done.js')
      for (const epic of epics) {
        const report = checkDefinitionOfDone(doc, epic.id)
        lines.push(`Epic "${epic.title}": DoD ${report.ready ? '✓' : '✗'} (${report.grade})`)
      }
    } catch {
      lines.push('  Validação de qualidade: módulo indisponível')
    }

    // Step 4: DoR readiness summary
    onProgress({ step: 4, total: 4, label: 'Resumo de readiness...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const constraints = doc.nodes.filter((n) => n.type === 'constraint')
    const risks = doc.nodes.filter((n) => n.type === 'risk')
    const decisions = doc.nodes.filter((n) => n.type === 'decision')
    lines.push(`Constraints: ${constraints.length} · Riscos: ${risks.length} · Decisões: ${decisions.length}`)

    const requiredMet = epics.length > 0 || reqs.length > 0
    lines.push(`Definition of Ready: ${requiredMet ? '✓ pronto para DESIGN' : '✗ precisa de requisitos'}`)

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}

function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}
