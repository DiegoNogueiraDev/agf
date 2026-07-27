/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-platform — Platform audit: test pyramid, harness score, performance.
 * No MCP dependency. Operates directly against SqliteStore + FS.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-platform.ts' })

export class GraphPlatformHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-platform ═']

    // Step 1: Test pyramid analysis
    onProgress({
      step: 1,
      total: 3,
      label: 'Analisando pirâmide de testes...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    try {
      const { globSync } = await import('glob')
      const testFiles = globSync('src/**/*.test.{ts,tsx}', { cwd: dir })
      const specFiles = globSync('src/**/*.spec.{ts,tsx}', { cwd: dir })
      const testDirs = new Set(testFiles.map((f) => f.split('/').slice(0, -1).join('/')))
      lines.push(`Testes: ${testFiles.length + specFiles.length} arquivos · ${testDirs.size} módulos cobertos`)
    } catch {
      lines.push('  Análise de testes: glob indisponível')
    }

    // Step 2: Harness score
    onProgress({
      step: 2,
      total: 3,
      label: 'Calculando harness score...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    try {
      const { collectSrcFiles } = await import('../../core/harness/collect-src.js')
      const { evaluateProjectQuality } = await import('../../core/harness/project-quality.js')
      const files = collectSrcFiles(dir)
      const quality = evaluateProjectQuality(files)
      lines.push(`Harness Score: testes ${quality.testScore}% · logs ${quality.logScore}%`)
      lines.push(`Gate 95/95: ${quality.gate.passed ? '✓ aprovado' : '⚠ reprovado'}`)
      if (quality.darkModules.length > 0) {
        lines.push(`Módulos sem log: ${quality.darkModules.length}`)
        for (const m of quality.darkModules.slice(0, 5)) {
          lines.push(`  • ${m}`)
        }
      }
    } catch {
      lines.push('  Harness score: indisponível')
    }

    // Step 3: Graph-based audit findings
    onProgress({ step: 3, total: 3, label: 'Auditando do grafo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const doc = store.toGraphDocument()
    const withTests = doc.nodes.filter((n) => n.testFiles && n.testFiles.length > 0)
    const totalTasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask').length
    const testCoverage = totalTasks > 0 ? Math.round((withTests.length / totalTasks) * 100) : 0
    lines.push(`Tasks com testFiles: ${withTests.length}/${totalTasks} (${testCoverage}%)`)

    lines.push('')
    lines.push('Para cobertura completa: escreva testes unitários, integração e E2E.')
    lines.push('Objetivo: 70%+ cobertura, 95/95 gate, WIP <= 1.')

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
