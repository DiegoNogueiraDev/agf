/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_9844108d6e9e — ac_coverage_break só é acionável ANTES de construir.
 *
 * O check pergunta "as subtasks cobrem a AC do pai?". Isso é conselho de
 * PLANEJAMENTO: enquanto há filho por fazer, dá para redistribuir a AC. Depois
 * que todos fecharam, a única forma de "cobrir" é escrever AC retroativa para
 * trabalho entregue — ficção. Medido neste repo: 107 achados, 51 pais, e em
 * TODOS os 51 os filhos estavam 100% done. Ou seja, 100% do sinal era
 * inacionável.
 *
 * Mas silenciar por completo esconderia um risco real: uma AC de pai não
 * coberta com tudo done PODE significar que ela nunca foi entregue. Por isso a
 * troca é (b)+(c): o check de planejamento se cala onde não é acionável, e um
 * kind novo assume o caso — dizendo outra coisa, com outra severidade.
 */

import { describe, it, expect } from 'vitest'
import { detectAcCoverage } from '../core/gaps/detect-ac-coverage.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const TS = '2026-01-01T00:00:00.000Z'

function task(id: string, status: string, parentId?: string, ac?: string[]): GraphNode {
  return {
    id,
    type: 'task',
    title: id,
    status,
    priority: 3,
    createdAt: TS,
    updatedAt: TS,
    parentId,
    acceptanceCriteria: ac,
  } as GraphNode
}

/** Pai decomposto com AC que nenhum filho cobre. */
function doc(childStatus: string): GraphDocument {
  return {
    nodes: [
      task('parent', 'done', undefined, [
        'Given um pagamento estornado When o saldo recalcula Then bate com o extrato',
      ]),
      task('child', childStatus, 'parent', ['Given outra coisa totalmente diferente When roda Then passa']),
    ],
    edges: [],
  } as GraphDocument
}

describe('ac_coverage_break — planning advice, silent where it cannot be acted on (b)', () => {
  it('flags while a child is still open — redistributing the AC is possible', () => {
    const gaps = detectAcCoverage(doc('backlog')).filter((g) => g.kind === 'ac_coverage_break')

    expect(gaps).toHaveLength(1)
  })

  it('does NOT flag ac_coverage_break when every child is done — covering would mean fiction', () => {
    const gaps = detectAcCoverage(doc('done')).filter((g) => g.kind === 'ac_coverage_break')

    expect(gaps).toEqual([])
  })
})

describe('ac_delivery_doubt — the risk (b) would have hidden (c)', () => {
  it('raises a DIFFERENT kind when everything is done and the AC is still uncovered', () => {
    // O sinal não some: muda de natureza. Não é mais "redistribua a AC", é
    // "esta AC pode nunca ter sido entregue" — outra pergunta, outro dono.
    const gaps = detectAcCoverage(doc('done')).filter((g) => g.kind === 'ac_delivery_doubt')

    expect(gaps).toHaveLength(1)
    expect(gaps[0].evidence).toMatch(/entregue|delivered/i)
  })

  it('does not raise delivery doubt while work is still open — that is premature', () => {
    const gaps = detectAcCoverage(doc('backlog')).filter((g) => g.kind === 'ac_delivery_doubt')

    expect(gaps).toEqual([])
  })

  it('the two kinds are mutually exclusive — a parent is in one state or the other', () => {
    for (const st of ['backlog', 'done']) {
      const kinds = new Set(detectAcCoverage(doc(st)).map((g) => g.kind))
      expect(kinds.size, `pai com filho ${st} emitiu ${[...kinds].join('+')}`).toBeLessThanOrEqual(1)
    }
  })
})
