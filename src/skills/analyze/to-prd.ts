/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /to-prd — ANALYZE helper: scaffold a PRD epic in the graph from description.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { generateId } from '../../core/utils/id.js'
import { now } from '../../core/utils/time.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'to-prd.ts' })

export class ToPrdHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /to-prd ═']
    const title = args.trim()

    // Step 1: Validate input
    onProgress({ step: 1, total: 5, label: 'Validando entrada...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    if (!title) {
      lines.push('Uso: /to-prd <descrição da feature>')
      lines.push('Sintetiza uma ideia em um PRD draft no grafo.')
      return lines.join('\n')
    }
    lines.push(`Título: ${title}`)

    // Step 2: Check for duplicates
    onProgress({
      step: 2,
      total: 5,
      label: 'Verificando duplicatas...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const existing = store.queryNodes({ search: title, type: ['epic', 'requirement'] })
    const similar = existing.nodes.filter((n) => n.title.toLowerCase().includes(title.toLowerCase()))
    if (similar.length > 0) {
      lines.push(`⚠ ${similar.length} epic(s)/requisito(s) similares encontrados:`)
      for (const s of similar.slice(0, 3)) {
        lines.push(`  ${s.type === 'epic' ? 'Epic' : 'Req'}: ${s.title} (${s.id})`)
      }
    }

    // Step 3: Scaffold PRD epic structure
    onProgress({ step: 3, total: 5, label: 'Criando estrutura PRD...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const template = [
      '## Problem Statement',
      'Descreva a dor do usuário aqui.',
      '',
      '## Solution',
      'O que muda na perspectiva do usuário.',
      '',
      '## User Stories',
      '1. As a <actor>, I want <feature>, so that <benefit>',
      '',
      '## Implementation Decisions',
      '- Módulos a construir/modificar',
      '- Interfaces de módulo',
      '- Decisões arquiteturais, schema, contratos de API',
      '',
      '## Testing Decisions',
      "- O que significa 'bom teste' aqui",
      '- Módulos a testar',
      '- Artefatos de teste existentes similares',
      '',
      '## Out of Scope',
      'O que este PRD NÃO cobre.',
      '',
      '## Further Notes',
    ].join('\n')

    const timestamp = now()
    const epicId = generateId('epic')
    store.insertNode({
      id: epicId,
      type: 'epic',
      title: `PRD: ${title}`,
      description: template,
      status: 'backlog',
      priority: 2,
      tags: ['prd', 'draft'],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    lines.push(`✓ Epic criado: ${epicId}`)

    // Step 4: Create PRD requirement children
    onProgress({ step: 4, total: 5, label: 'Criando requisitos...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const reqs = [
      { title: 'Problem Statement documentado', ac: ['Problem statement está descrito em linguagem do usuário'] },
      { title: 'User stories exaustivas', ac: ['≥1 user story por ator', 'Formato As a/I want/So that'] },
      {
        title: 'Decisões de implementação',
        ac: ['Módulos listados sem file paths', 'Decisões arquiteturais documentadas'],
      },
    ]
    for (const r of reqs) {
      store.insertNode({
        id: generateId('req'),
        type: 'requirement',
        title: r.title,
        status: 'backlog',
        priority: 2,
        parentId: epicId,
        acceptanceCriteria: r.ac,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    lines.push(`✓ ${reqs.length} requisitos criados como filhos do epic`)

    // Step 5: Summary
    onProgress({ step: 5, total: 5, label: 'Resumo...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    lines.push('PRD draft criado. Próximos passos:')
    lines.push('  1. Preencha o template no description do epic')
    lines.push('  2. Use /decompose-prd para decompor em subtasks')
    lines.push('  3. Ou use /graph-plan para planejar o sprint')
    lines.push(`  Epic: ${epicId}`)

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
