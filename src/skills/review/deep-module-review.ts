/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /deep-module-review — REVIEW helper: audit module depth ratio + interface surface.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'
import { globSync } from 'glob'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const _log = createLogger({ layer: 'core', source: 'deep-module-review.ts' })

interface ModuleMetrics {
  file: string
  lines: number
  exports: number
  imports: number
  depthRatio: number
  classification: 'deep' | 'medium' | 'shallow'
}

export class DeepModuleReviewHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store: _store, dir, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /deep-module-review ═']
    const targetDir = args.trim() || 'src'

    // Step 1: Find source files
    onProgress({ step: 1, total: 5, label: 'Encontrando módulos...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const fullPath = path.join(dir, targetDir)
    if (!existsSync(fullPath)) {
      lines.push(`Diretório não encontrado: ${targetDir}`)
      return lines.join('\n')
    }
    const tsFiles = globSync(`${targetDir}/**/*.ts`, {
      cwd: dir,
      ignore: ['**/*.test.ts', '**/*.bench.ts', '**/node_modules/**', '**/__tests__/**'],
    })
    if (tsFiles.length === 0) {
      lines.push('Nenhum arquivo .ts encontrado.')
      return lines.join('\n')
    }
    lines.push(`Arquivos encontrados: ${tsFiles.length}`)

    // Step 2: Analyze each module
    onProgress({ step: 2, total: 5, label: 'Analisando módulos...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const metrics: ModuleMetrics[] = []
    for (const file of tsFiles) {
      try {
        const content = readFileSync(path.join(dir, file), 'utf-8')
        const linesCount = content.split('\n').length

        const exportMatches = content.match(/^export\s+(const|function|class|interface|type|enum|default|async)/gm)
        const exports = exportMatches ? exportMatches.length : 0

        const importMatches = content.match(/^import\s+/gm)
        const imports = importMatches ? importMatches.length : 0

        const depthRatio = exports > 0 ? imports / exports : imports > 0 ? 999 : 0
        const classification: 'deep' | 'medium' | 'shallow' =
          depthRatio <= 0.5 ? 'deep' : depthRatio <= 1.0 ? 'medium' : 'shallow'

        metrics.push({ file, lines: linesCount, exports, imports, depthRatio, classification })
      } catch {
        // skip unreadable files
      }
    }

    // Step 3: Classify and report
    onProgress({ step: 3, total: 5, label: 'Classificando...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const deep = metrics.filter((m) => m.classification === 'deep')
    const medium = metrics.filter((m) => m.classification === 'medium')
    const shallow = metrics.filter((m) => m.classification === 'shallow')

    lines.push('')
    lines.push(`Deep (≤0.5):    ${deep.length}`)
    lines.push(`Medium (≤1.0):  ${medium.length}`)
    lines.push(`Shallow (>1.0): ${shallow.length}`)

    // Step 4: Detail shallow candidates
    onProgress({ step: 4, total: 5, label: 'Detalhando shallow...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    if (shallow.length > 0) {
      lines.push('')
      lines.push('Shallow candidates (revisar):')
      for (const m of shallow.slice(0, 8)) {
        lines.push(
          `  ⚠ ${m.file} — ${m.lines}L, ${m.exports} exports, ${m.imports} imports, depth=${m.depthRatio.toFixed(2)}`,
        )
      }
      if (shallow.length > 8) {
        lines.push(`  … +${shallow.length - 8} shallow modules`)
      }
    }

    if (medium.length > 0) {
      lines.push('')
      lines.push('Medium modules (questionar exports):')
      for (const m of medium.slice(0, 5)) {
        lines.push(`  • ${m.file} — ${m.exports} exports, depth=${m.depthRatio.toFixed(2)}`)
      }
    }

    // Step 5: Recommendations
    onProgress({ step: 5, total: 5, label: 'Recomendações...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    if (shallow.length > 0) {
      lines.push('Ação shallow: reduza exports ou aumente implementação interna.')
      lines.push('  - Algum export pode ser internal?')
      lines.push('  - Algum import usa só 1 símbolo?')
      lines.push('  - É intencional (facade)? Justifique no PR.')
    }
    if (deep.length > 0) {
      lines.push(`✓ ${deep.length} deep modules — boa saúde estrutural.`)
    }
    if (shallow.length === 0) {
      lines.push('✓ Nenhum módulo shallow detectado.')
    }

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
