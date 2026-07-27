/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * /tracer-bullet-tdd — IMPLEMENT helper: tracer-bullet TDD pipeline guidance.
 * No MCP dependency. Operates directly against SqliteStore.
 */

import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import { fmtElapsed, fmtNode } from '../shared/handler-utils.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { createLogger } from '../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'tracer-bullet-tdd.ts' })

export class TracerBulletTddHandler implements SkillHandlerPort {
  async execute(args: string, ctx: SkillExecutionContext): Promise<string> {
    const { store, onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /tracer-bullet-tdd ═']
    const doc = store.toGraphDocument()
    const taskId = args.trim()

    // Step 1: Find target task
    onProgress({ step: 1, total: 6, label: 'Localizando task...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    let targetId = taskId
    if (!targetId) {
      const next = findNextTask(doc)
      if (!next) {
        lines.push('Nenhuma task disponível.')
        return lines.join('\n')
      }
      targetId = next.node.id
    }
    const node = store.getNodeById(targetId)
    if (!node) {
      return `═ /tracer-bullet-tdd ═\nNode não encontrado: ${targetId}\n═ ${fmtElapsed(Date.now() - startMs)} ═`
    }
    lines.push(`Task: ${fmtNode(node)}`)

    // Step 2: Check layer depth
    onProgress({ step: 2, total: 6, label: 'Analisando camadas...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const children = doc.nodes.filter((n) => n.parentId === targetId)
    lines.push(`Sub-tasks: ${children.length}`)
    if (children.length > 0) {
      lines.push('  Camadas detectadas via subtasks:')
      for (const c of children.slice(0, 5)) {
        lines.push(`    ${fmtNode(c)}`)
      }
    }

    // Step 3: TDD readiness check
    onProgress({
      step: 3,
      total: 6,
      label: 'Verificando ambiente TDD...',
      elapsedMs: Date.now() - startMs,
      tokensUsed: 0,
    })
    const acs = node.acceptanceCriteria ?? []
    lines.push(`ACs: ${acs.length}`)
    if (acs.length > 0) {
      for (const ac of acs.slice(0, 5)) {
        lines.push(`  • ${ac}`)
      }
    }

    // Step 4: Test command check
    onProgress({ step: 4, total: 6, label: 'Verificando testes...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    try {
      const { execSync } = await import('node:child_process')
      const result = execSync('npx vitest run --reporter=verbose 2>&1 | tail -5', {
        timeout: 30000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      lines.push('Testes baseline:')
      for (const line of result.trim().split('\n').slice(0, 3)) {
        lines.push(`  ${line}`)
      }
    } catch {
      lines.push("  Execute 'npm test' para baseline.")
    }

    // Step 5: Tracer bullet guide
    onProgress({ step: 5, total: 6, label: 'Guia tracer bullet...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    lines.push('')
    lines.push('╔ Tracer Bullet TDD Pipeline ╗')
    lines.push('║ 1. RED   — Escreva o menor teste que atravessa todas as camadas')
    lines.push('║ 2. STUB  — Código mínimo em cada camada para compilar (vermelho → verde)')
    lines.push('║ 3. GREEN — Faça o teste passar com implementação mínima')
    lines.push('║ 4. COMMIT — O diff mostra a arquitetura em uma tela')
    lines.push('║ 5. WIDEN — Adicione casos aos testes unitários de cada camada')
    lines.push('║ 6. REFACTOR — Limpe após verde; nunca refatore código vermelho')
    lines.push('╚════════════════════════════╝')

    // Step 6: DoD checkpoint
    onProgress({ step: 6, total: 6, label: 'Checkpoint...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })
    const freshDoc = store.toGraphDocument()
    const dod = checkDefinitionOfDone(freshDoc, targetId)
    lines.push(`DoD atual: ${dod.grade} (${dod.checks.filter((c) => c.passed).length}/${dod.checks.length})`)
    lines.push('')
    lines.push(`Quando pronto: /check ${targetId} → /done ${targetId}`)

    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}
