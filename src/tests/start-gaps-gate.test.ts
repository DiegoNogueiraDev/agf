/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do gate de entrada (node_dd0aaabbed5c, épico gates node_9e6f73a0bc3b):
 * o pull recusa quando o SUBTREE DO ÉPICO da task tem gaps required abertos —
 * nunca o grafo global (anti-falso-positivo: dívida alheia não trava a colônia).
 * Bloqueio duro com GAPS_REQUIRED_OPEN + applyVia; --force pull com warning.
 * Subtree limpo ⇒ byte-idêntico ao comportamento atual. Boehm/poka-yoke.
 */

import { describe, it, expect } from 'vitest'
import { checkEpicEntryGate } from '../core/gaps/entry-gate.js'
import { startTaskPipeline, type StartDeps } from '../cli/commands/start-cmd.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function node(id: string, type: GraphNode['type'], parentId?: string, extra: Partial<GraphNode> = {}): GraphNode {
  const now = new Date().toISOString()
  return {
    id,
    type,
    title: `${type} ${id}`,
    description: 'x',
    status: 'backlog',
    priority: 2,
    tags: [],
    parentId,
    acceptanceCriteria: ['Given a, When b, Then c mensurável', 'Given erro, When d, Then falha tratada'],
    createdAt: now,
    updatedAt: now,
    ...extra,
  } as GraphNode
}

/** Épico com um requirement ÓRFÃO (sem task implements) — gap required clássico no subtree. */
function docWithDirtyEpic(): GraphDocument {
  return {
    nodes: [
      node('epic_a', 'epic', undefined, { acceptanceCriteria: [] }),
      node('task_a1', 'task', 'epic_a'),
      node('req_a_orfa', 'requirement', 'epic_a'),
    ],
    edges: [],
  }
}

/** Épico limpo + um épico VIZINHO com requirement órfão (dívida global que NÃO trava o pull). */
function docWithCleanEpicDirtyNeighbor(): GraphDocument {
  return {
    nodes: [
      node('epic_clean', 'epic', undefined, { acceptanceCriteria: [] }),
      node('task_c1', 'task', 'epic_clean'),
      node('epic_dirty', 'epic', undefined, { acceptanceCriteria: [] }),
      node('req_d_orfa', 'requirement', 'epic_dirty'),
    ],
    edges: [],
  }
}

describe('checkEpicEntryGate (puro)', () => {
  it('gap required no subtree do épico da task → blocked com applyVia não-vazio (AC1)', () => {
    const gate = checkEpicEntryGate(docWithDirtyEpic(), 'task_a1')
    expect(gate.blocked).toBe(true)
    expect(gate.epicId).toBe('epic_a')
    expect(gate.gaps.length).toBeGreaterThan(0)
    expect(gate.applyVia.length).toBeGreaterThan(0)
  })

  it('dívida required SÓ fora do subtree → NÃO bloqueia (AC3, anti-falso-positivo)', () => {
    const gate = checkEpicEntryGate(docWithCleanEpicDirtyNeighbor(), 'task_c1')
    expect(gate.blocked).toBe(false)
    expect(gate.gaps).toEqual([])
  })

  it('task sem épico ancestral (raiz — caso de limite) → não bloqueia, não lança', () => {
    const doc: GraphDocument = { nodes: [node('task_orfa', 'task')], edges: [] }
    const gate = checkEpicEntryGate(doc, 'task_orfa')
    expect(gate.blocked).toBe(false)
  })

  it('task inexistente (caso de erro) → não lança, não bloqueia', () => {
    expect(checkEpicEntryGate(docWithDirtyEpic(), 'nao_existe').blocked).toBe(false)
  })
})

// ── Pipeline do start (deps injetáveis — o caminho que o agf start percorre) ──

function pipelineDeps(gate: ReturnType<typeof checkEpicEntryGate> | null, outLines: string[]): StartDeps {
  return {
    wakeUp: () => 'wake',
    countInProgress: () => 0,
    findNext: () => ({ id: 'task_a1', title: 'task a1', reason: 'test', xpSize: 'S', acCount: 2 }),
    loadContext: () => 'ctx',
    markInProgress: () => {},
    out: (msg: string) => outLines.push(msg),
    entryGate: gate ? () => gate : undefined,
  } as unknown as StartDeps
}

describe('startTaskPipeline com gate de entrada', () => {
  const blockedGate = {
    blocked: true,
    epicId: 'epic_a',
    gaps: [{ kind: 'weak_ac', severity: 'required' }],
    applyVia: ['agf node update task_a2_semac --ac "Given..."'],
  } as unknown as ReturnType<typeof checkEpicEntryGate>

  it('gate bloqueado → recusa com code GAPS_REQUIRED_OPEN e applyVia no resultado (AC1)', () => {
    const lines: string[] = []
    const result = startTaskPipeline(pipelineDeps(blockedGate, lines))
    expect(result.code).toBe('GAPS_REQUIRED_OPEN')
    expect(result.taskId).toBeNull()
    expect(result.applyVia?.length).toBeGreaterThan(0)
    expect(lines.join('\n')).toContain('GAPS_REQUIRED_OPEN')
  })

  it('--force → pull acontece com warning GAPS_FORCED (AC2)', () => {
    const lines: string[] = []
    const result = startTaskPipeline(pipelineDeps(blockedGate, lines), undefined, { forceGaps: true })
    expect(result.taskId).toBe('task_a1')
    expect(lines.join('\n')).toContain('GAPS_FORCED')
  })

  it('subtree limpo → pull byte-idêntico ao atual (AC4, zero regressão)', () => {
    const lines: string[] = []
    const cleanGate = { blocked: false, gaps: [], applyVia: [] } as unknown as ReturnType<typeof checkEpicEntryGate>
    const result = startTaskPipeline(pipelineDeps(cleanGate, lines))
    expect(result.taskId).toBe('task_a1')
    expect(lines.join('\n')).not.toContain('GAPS')
  })

  it('sem entryGate injetado (legado — caso de limite) → comportamento atual intacto', () => {
    const lines: string[] = []
    const result = startTaskPipeline(pipelineDeps(null, lines))
    expect(result.taskId).toBe('task_a1')
  })
})
