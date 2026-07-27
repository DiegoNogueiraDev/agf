/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-deploy — DEPLOY phase: release readiness, CI checks, DORA validation.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-deploy.ts' })

export class GraphDeployHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-deploy ═']
    const doc = store.toGraphDocument()

    // Step 1: Check harness score
    onProgress({
      step: 1,
      total: 4,
      label: 'Verificando harness score...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    try {
      const { collectSrcFiles } = await import('../../core/harness/collect-src.js')
      const { evaluateProjectQuality } = await import('../../core/harness/project-quality.js')
      const files = collectSrcFiles(dir)
      const quality = evaluateProjectQuality(files)
      lines.push(
        `Harness: testes ${quality.testScore}% · logs ${quality.logScore}% · ${quality.gate.passed ? '✓ gate OK' : '⚠ gate falhou'}`,
      )
    } catch {
      lines.push('  Harness: módulo indisponível')
    }

    // Step 2: Verify done tasks
    onProgress({
      step: 2,
      total: 4,
      label: 'Verificando tasks concluídas...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const stats = store.getStats()
    const doneCount = stats.byStatus.done ?? 0
    const totalCount = stats.totalNodes
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
    lines.push(`Tasks: ${doneCount}/${totalCount} done (${pct}%)`)

    // Step 3: Check for blockers
    onProgress({ step: 3, total: 4, label: 'Verificando blockers...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const blocked = doc.nodes.filter((n) => n.blocked || n.status === 'blocked')
    if (blocked.length > 0) {
      lines.push(`⚠ ${blocked.length} task(s) bloqueada(s):`)
      for (const b of blocked.slice(0, 5)) {
        lines.push(`  • ${b.title}`)
      }
    } else {
      lines.push('✓ Nenhum blocker')
    }

    // Step 4: Release readiness
    onProgress({ step: 4, total: 4, label: 'Readiness check...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const deployReady = pct >= 80 && blocked.length === 0
    if (deployReady) {
      lines.push('✓ Pronto para deploy!')
    } else {
      lines.push(
        `⚠ Aguardando: ${pct < 80 ? `${100 - pct}% restante` : ''} ${blocked.length > 0 ? `${blocked.length} blocker(s)` : ''}`,
      )
    }
    lines.push('Execute testes: npm run test:blast && npm run test:node && npm test')
    lines.push(
      'Nota: agf não é ferramenta RPA — conduz via grafo; automações externas são referenciadas como risk nodes.',
    )

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
