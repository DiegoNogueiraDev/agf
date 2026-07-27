/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_405ea88ef587 — a matriz de rastreabilidade lia um sinal que quase
 * ninguém escreve.
 *
 * `hasTestEdge` exigia uma ARESTA `tests`, e o grafo real tem exatamente 6
 * delas — enquanto a evidência de teste que o projeto de fato produz é o campo
 * `testFiles`, usado por `agf done`, pelo DoD e pela triangulação física do
 * `phantom_done`. Resultado medido: 77 tasks entregues apareciam como
 * `chain: partial` por falta de uma aresta que o fluxo nunca cria.
 *
 * A correção aceita `testFiles` — mas só quando o arquivo EXISTE no disco. Um
 * caminho declarado e ausente não pode virar evidência: foi exatamente assim
 * que o `verify-ac` passou a aprovar tarefas não implementadas
 * (node_2b9edaf0e59d). Declaração não é prova; arquivo no disco é.
 */

import { describe, it, expect } from 'vitest'
import { buildFullChainTraceability } from '../core/designer/traceability-matrix.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

const TS = '2026-01-01T00:00:00.000Z'

function node(over: Partial<GraphNode> & { id: string; type: GraphNode['type'] }): GraphNode {
  return { title: over.id, status: 'done', priority: 3, createdAt: TS, updatedAt: TS, ...over } as GraphNode
}

function edge(from: string, to: string, relationType: GraphEdge['relationType']): GraphEdge {
  return { id: `e_${from}_${to}`, from, to, relationType, createdAt: TS } as GraphEdge
}

/** Um requisito com uma task que o implementa — o esqueleto de todos os casos. */
function docWith(task: GraphNode, edges: GraphEdge[] = []): GraphDocument {
  return {
    nodes: [node({ id: 'req_1', type: 'requirement' }), task],
    edges: [edge(task.id, 'req_1', 'implements'), ...edges],
  } as GraphDocument
}

function chainOf(doc: GraphDocument): string {
  return buildFullChainTraceability(doc).entries[0].chain
}

describe('full-chain traceability — testFiles on disk counts as test evidence', () => {
  it('a task whose declared test file EXISTS closes the chain without a tests edge (AC1)', () => {
    // Este arquivo existe: é o próprio teste que você está lendo.
    const doc = docWith(node({ id: 'task_1', type: 'task', testFiles: [import.meta.url.replace('file://', '')] }))

    expect(chainOf(doc)).toBe('full')
  })

  it('a declared test file that does NOT exist is not evidence (AC2)', () => {
    // A guarda que impede trocar um sinal ausente por um sinal falso: sem ela,
    // qualquer node passaria a "ter teste" bastando escrever um caminho.
    const doc = docWith(node({ id: 'task_1', type: 'task', testFiles: ['src/tests/nunca-escrito.test.ts'] }))

    expect(chainOf(doc)).toBe('partial')
  })

  it('the existing tests-edge path still closes the chain — no regression (AC3)', () => {
    const doc = docWith(node({ id: 'task_1', type: 'task' }), [edge('task_1', 'test_node', 'tests')])

    expect(chainOf(doc)).toBe('full')
  })

  it('a task with neither edge nor testFiles stays partial — the gap must keep firing (AC4)', () => {
    expect(chainOf(docWith(node({ id: 'task_1', type: 'task' })))).toBe('partial')
  })

  it('a requirement with no task at all is still none — untouched by this change', () => {
    const doc = { nodes: [node({ id: 'req_1', type: 'requirement' })], edges: [] } as GraphDocument

    expect(chainOf(doc)).toBe('none')
  })

  it('testedTasks names the task that carried the evidence, not just a count', () => {
    // Quem lê o relatório precisa saber QUAL task sustentou a cadeia; um número
    // não é auditável.
    const doc = docWith(node({ id: 'task_1', type: 'task', testFiles: [import.meta.url.replace('file://', '')] }))

    expect(buildFullChainTraceability(doc).entries[0].testedTasks).toContain('task_1')
  })
})

describe('a requirement that GROUPS other requirements is not a leaf (node_793047dd1776)', () => {
  it('a container requirement is skipped — its implementers belong to the leaves', () => {
    // PRDs importados trazem o cabeçalho de seção ("Requisitos") como node do
    // tipo requirement, com os requisitos de verdade como filhos. Cobrar uma
    // task que "implemente o cabeçalho" é cobrar algo que não existe: quem se
    // implementa são as folhas, e elas seguem sendo cobradas individualmente.
    const doc = {
      nodes: [
        node({ id: 'req_container', type: 'requirement' }),
        node({ id: 'req_leaf', type: 'requirement', parentId: 'req_container' }),
      ],
      edges: [],
    } as GraphDocument

    const entries = buildFullChainTraceability(doc).entries
    const container = entries.find((e) => e.requirementId === 'req_container')

    expect(container, 'o container ainda é avaliado como requisito-folha').toBeUndefined()
  })

  it('the leaf inside the container IS still evaluated — nothing is hidden', () => {
    // A guarda que impede a correção de virar varredura-para-baixo-do-tapete.
    const doc = {
      nodes: [
        node({ id: 'req_container', type: 'requirement' }),
        node({ id: 'req_leaf', type: 'requirement', parentId: 'req_container' }),
      ],
      edges: [],
    } as GraphDocument

    const leaf = buildFullChainTraceability(doc).entries.find((e) => e.requirementId === 'req_leaf')

    expect(leaf?.chain).toBe('none')
  })

  it('a requirement whose children are TASKS is still a leaf — only requirement-children group', () => {
    const doc = {
      nodes: [node({ id: 'req_1', type: 'requirement' }), node({ id: 'task_1', type: 'task', parentId: 'req_1' })],
      edges: [],
    } as GraphDocument

    expect(buildFullChainTraceability(doc).entries.some((e) => e.requirementId === 'req_1')).toBe(true)
  })
})

describe('a requirement that contains EPICS is a container too (node_793047dd1776)', () => {
  it('a PRD-shaped requirement whose children are epics is skipped', () => {
    // Um PRD importado como node do tipo requirement, com os epicos reais como
    // filhos. Ninguem implementa um PRD — seus epicos e que sao implementados.
    // Mesma regra do cabecalho 'Requisitos', uma camada acima: o que muda e o
    // TIPO do filho, nao a natureza de agrupamento.
    const doc = {
      nodes: [node({ id: 'req_prd', type: 'requirement' }), node({ id: 'epic_a', type: 'epic', parentId: 'req_prd' })],
      edges: [],
    } as GraphDocument

    expect(buildFullChainTraceability(doc).entries.some((e) => e.requirementId === 'req_prd')).toBe(false)
  })

  it('a requirement with only TASK children is still a leaf — tasks implement, epics group', () => {
    // A fronteira que importa: task filha e implementacao (o requisito e
    // cobravel); epico filho e decomposicao (a cobranca desce para ele).
    const doc = {
      nodes: [node({ id: 'req_1', type: 'requirement' }), node({ id: 'task_1', type: 'task', parentId: 'req_1' })],
      edges: [],
    } as GraphDocument

    expect(buildFullChainTraceability(doc).entries.some((e) => e.requirementId === 'req_1')).toBe(true)
  })
})
