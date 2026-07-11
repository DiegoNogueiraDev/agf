/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /harness-regression-check — VALIDATE helper: compare harness scores before/after.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { runHarnessScanCached, resetHarnessCache } from '../../core/harness/harness-cache.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'harness-regression-check.ts' })

export class HarnessRegressionCheckHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /harness-regression-check ═']

    // Step 1: Get baseline from store (stored in project settings)
    onProgress({ step: 1, total: 5, label: 'Lendo baseline...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const baselineScoreRaw = store.getProjectSetting('harness_baseline_score')
    const baselineGrade = store.getProjectSetting('harness_baseline_grade')
    const baselineTs = store.getProjectSetting('harness_baseline_ts')

    const baselineScore = baselineScoreRaw ? parseFloat(baselineScoreRaw) : null
    if (baselineScore !== null && baselineGrade) {
      lines.push(`Baseline: ${baselineScore}/100 (${baselineGrade}) ${baselineTs ? `— ${baselineTs}` : ''}`)
    } else {
      lines.push('Baseline: não definida. Use --baseline para salvar.')
    }

    // Step 2: Force fresh scan (reset cache)
    onProgress({
      step: 2,
      total: 5,
      label: 'Executando scan fresco...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    if (args.includes('--reset')) {
      resetHarnessCache()
    }
    const current = runHarnessScanCached(dir, store.getDb())
    if (!current) {
      lines.push('⚠ Scan indisponível (src/ não encontrado ou erro).')
      lines.push('  Execute em um diretório com código fonte.')
      return lines.join('\n')
    }
    lines.push(`Atual: ${current.score}/100 (${current.grade})`)

    // Step 3: Compare
    onProgress({ step: 3, total: 5, label: 'Comparando scores...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const delta = baselineScore !== null ? current.score - baselineScore : 0
    const deltaStr = delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)
    lines.push(`Delta: ${deltaStr} pts`)

    if (current.regression) {
      lines.push(`⚠ Regressão detectada: ${current.regressionDelta?.toFixed(1) ?? '?'} pts`)
    }

    // Step 4: Decision
    onProgress({ step: 4, total: 5, label: 'Avaliando...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    if (delta <= -10) {
      lines.push('🚫 BLOQUEADO: regressão ≥ 10 pontos.')
      lines.push('  Investigue qual dimensão regrediu:')
      lines.push(`  Types: ${current.breakdown.types.score} · Tests: ${current.breakdown.tests.score}`)
      lines.push(`  Naming: ${current.breakdown.naming.score} · Errors: ${current.breakdown.errors.score}`)
      lines.push(`  Docs: ${current.breakdown.docs.score} · Context: ${current.breakdown.context.score}`)
      lines.push(`  Fitness: ${current.breakdown.fitness.score} · Provenance: ${current.breakdown.provenance.score}`)
      lines.push('  Abra uma task de investigação antes de continuar.')
    } else if (delta <= -5) {
      lines.push('⚠ ALERTA: regressão ≥ 5 pontos.')
      lines.push('  Investigue a(s) dimensão(ões) que regrediram.')
      lines.push('  Breakdown disponível acima.')
    } else if (delta < 0) {
      lines.push('• Regressão leve (< 5 pts). Monitorar no próximo scan.')
    } else if (delta === 0 && baselineScore !== null) {
      lines.push('✓ Sem alteração no score.')
    } else {
      lines.push('✓ Melhoria detectada.')
    }

    // Step 5: Save baseline
    onProgress({ step: 5, total: 5, label: 'Salvando baseline...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    if (args.includes('--save') || baselineScore === null) {
      store.setProjectSetting('harness_baseline_score', String(current.score))
      store.setProjectSetting('harness_baseline_grade', current.grade)
      store.setProjectSetting('harness_baseline_ts', new Date().toISOString())
      lines.push('✓ Nova baseline salva.')
    } else {
      lines.push('Use --save para atualizar a baseline para o score atual.')
    }
    if (args.includes('--reset')) {
      lines.push('Cache de harness resetado.')
    }

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
