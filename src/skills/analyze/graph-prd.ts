/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /graph-prd — PRD generation: transforms idea into structured PRD + imports.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'graph-prd.ts' })

export class GraphPrdHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /graph-prd ═']

    onProgress({ step: 1, total: 3, label: 'Analisando descrição...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })

    if (!args.trim()) {
      lines.push('⚠ Uso: /graph-prd <descrição do produto/feature>')
      lines.push('  Ex: /graph-prd sistema de login com OAuth2 e SSO')
      lines.push('  Ou use /import-prd <arquivo.md> para importar PRD existente.')
      return lines.join('\n')
    }

    // Step 2: Generate PRD via core engine
    onProgress({
      step: 2,
      total: 3,
      label: 'Gerando PRD estruturado...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })

    try {
      const { extractEntities } = await import('../../core/parser/extract.js')
      const { convertToGraph } = await import('../../core/importer/index.js')

      // Build a basic PRD structure from the description
      const prdText = [
        '# PRD Gerado',
        '',
        '## Problema',
        `- ${args}`,
        '',
        '## Requisitos Funcionais',
        '- RF1: Implementar funcionalidade principal',
        '',
        '## Requisitos Não-Funcionais',
        '- RNF1: Seguir padrões do projeto',
        '',
        '## Critérios de Aceitação',
        '- AC1: Funcionalidade implementada e testada',
      ].join('\n')

      const entities = extractEntities(prdText)
      const graph = convertToGraph(entities, 'PRD.md')

      if (!store.getProject()) {
        store.initProject('project')
      }
      store.bulkInsert(graph.nodes, graph.edges)
      store.recordImport('PRD.md', graph.nodes.length, graph.edges.length)

      lines.push(`PRD gerado e importado: ${graph.nodes.length} nós, ${graph.edges.length} arestas`)
    } catch (err) {
      lines.push(`⚠ Erro ao gerar PRD: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Step 3: Summary
    onProgress({ step: 3, total: 3, label: 'Resumo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const stats = store.getStats()
    lines.push(`Grafo atual: ${stats.totalNodes} nós`)
    lines.push('Use /graph-analyze para validar qualidade.')

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
