/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * O gate de deploy tratava uma retratação documentada como trabalho pendente.
 *
 * `all_tasks_done` pergunta "sobrou trabalho ACIONÁVEL?" e já aceitava tasks
 * `blocked` com motivo escrito como adiadas. Mas uma task `quarantined` — o
 * status de um achado investigado e RETRATADO como falso-positivo — não entrava
 * na regra, então continuava contando como pendente para sempre.
 *
 * Medido no grafo real: 196 blocked, todas com motivo, e UMA quarantined com 681
 * caracteres explicando por que o achado era inválido. Essa única task
 * bloqueava o gate inteiro.
 *
 * A correção é na REGRA, não no dado: marcar a task como `done` seria mentir
 * (ela não foi feita, foi retratada), e arquivá-la esconderia a investigação. O
 * que o gate precisa saber é se sobrou trabalho a fazer — e um falso-positivo
 * retratado não é trabalho.
 *
 * A exigência de motivo escrito permanece nos dois casos: sem ela, qualquer task
 * poderia ser silenciada trocando o status, e o gate viraria decoração.
 */

import { describe, it, expect } from 'vitest'
import { checkDeployReadiness } from '../core/deployer/deploy-readiness.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const TS_NOW = '2026-01-01T00:00:00.000Z'
const MOTIVO = 'x'.repeat(250)

function task(over: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: 'task',
    title: over.id,
    status: 'done',
    priority: 3,
    createdAt: TS_NOW,
    updatedAt: TS_NOW,
    ...over,
  } as GraphNode
}

function check(doc: GraphDocument, name: string) {
  return checkDeployReadiness(doc).checks.find((c) => c.name === name)
}

function doc(...nodes: GraphNode[]): GraphDocument {
  return { nodes, edges: [] } as GraphDocument
}

describe('all_tasks_done — retratação documentada não é trabalho pendente', () => {
  it('uma task quarantined COM motivo escrito não bloqueia o gate', () => {
    const d = doc(task({ id: 'feita' }), task({ id: 'retratada', status: 'quarantined', description: MOTIVO }))

    expect(check(d, 'all_tasks_done')?.passed).toBe(true)
  })

  it('uma task quarantined SEM motivo AINDA bloqueia — senão o status vira botão de silenciar', () => {
    // A guarda que impede a correção de virar escape hatch: trocar o status para
    // 'quarantined' não pode, sozinho, sumir com a pendência.
    const d = doc(task({ id: 'feita' }), task({ id: 'silenciada', status: 'quarantined', description: 'curto' }))

    expect(check(d, 'all_tasks_done')?.passed).toBe(false)
  })

  it('blocked com motivo segue passando — sem regressão do comportamento atual', () => {
    const d = doc(task({ id: 'feita' }), task({ id: 'adiada', status: 'blocked', description: MOTIVO }))

    expect(check(d, 'all_tasks_done')?.passed).toBe(true)
  })

  it('uma task em backlog continua bloqueando — trabalho real não é adiável por omissão', () => {
    const d = doc(task({ id: 'feita' }), task({ id: 'pendente', status: 'backlog', description: MOTIVO }))

    expect(check(d, 'all_tasks_done')?.passed).toBe(false)
  })
})
