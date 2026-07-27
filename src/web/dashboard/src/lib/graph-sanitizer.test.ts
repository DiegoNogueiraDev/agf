/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-understand-anything-dashboard-bridge — Task 2.3
 *
 * AC1: GIVEN payload válido WHEN dashboard carrega THEN renderiza sem warning
 * AC2: GIVEN payload com node sem `id` mas com `name` WHEN auto-fix roda THEN gera `id` derivado e renderiza
 * AC3: GIVEN payload com edge type não canônico (ex.: alias) WHEN auto-fix roda THEN normaliza para forma canônica
 * AC4: GIVEN payload corrompido sem reparo possível WHEN validate falha THEN mostra banner com lista de campos problemáticos
 * AC5: GIVEN payload com extra field WHEN dashboard carrega THEN ignora silently (forward-compat)
 */

import { describe, it, expect } from 'vitest'
import type { GraphNode } from './types'
import { autoFixGraph, NODE_TYPE_ALIASES, EDGE_TYPE_ALIASES } from './graph-sanitizer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function validNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'n1',
    type: 'task',
    title: 'My Task',
    status: 'backlog',
    priority: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function validEdge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e1',
    from: 'n1',
    to: 'n2',
    relationType: 'depends_on',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ── AC1: Valid payload → no warnings ─────────────────────────────────────────

describe('autoFixGraph AC1 — payload válido não produz issues', () => {
  it('payload com nodes e edges válidos produz issues vazio', () => {
    const raw = { nodes: [validNode()], edges: [validEdge()] }
    const { issues, repairImpossible, fatalFields } = autoFixGraph(raw)
    expect(issues).toHaveLength(0)
    expect(repairImpossible).toBe(false)
    expect(fatalFields).toHaveLength(0)
  })

  it('payload vazio (sem nodes/edges) é tratado como válido sem warnings', () => {
    const raw = { nodes: [], edges: [] }
    const { issues, repairImpossible } = autoFixGraph(raw)
    expect(issues).toHaveLength(0)
    expect(repairImpossible).toBe(false)
  })

  it('graph retornado contém os nodes e edges originais sem alteração', () => {
    const raw = { nodes: [validNode()], edges: [] }
    const { graph } = autoFixGraph(raw)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].id).toBe('n1')
    expect(graph.nodes[0].title).toBe('My Task')
  })
})

// ── AC2: Node sem id mas com name → gera id derivado ─────────────────────────

describe('autoFixGraph AC2 — gera id derivado de name quando id ausente', () => {
  it('node com name mas sem id recebe id derivado do name', () => {
    const raw = { nodes: [validNode({ id: undefined, name: 'My Feature' })], edges: [] }
    const { graph, issues } = autoFixGraph(raw)
    expect(graph.nodes[0].id).toBeTruthy()
    expect(graph.nodes[0].id).not.toBe('undefined')
    expect(issues.some((i: string) => i.includes('id') || i.includes('name'))).toBe(true)
  })

  it('id gerado é diferente para names diferentes', () => {
    const raw1 = { nodes: [validNode({ id: undefined, name: 'Alpha' })], edges: [] }
    const raw2 = { nodes: [validNode({ id: undefined, name: 'Beta' })], edges: [] }
    const { graph: g1 } = autoFixGraph(raw1)
    const { graph: g2 } = autoFixGraph(raw2)
    expect(g1.nodes[0].id).not.toBe(g2.nodes[0].id)
  })

  it('node com id vazio mas name válido também recebe id derivado', () => {
    const raw = { nodes: [validNode({ id: '', name: 'My Task' })], edges: [] }
    const { graph } = autoFixGraph(raw)
    expect(graph.nodes[0].id).toBeTruthy()
    expect(graph.nodes[0].id.length).toBeGreaterThan(0)
  })
})

// ── AC3: Edge type não canônico → normaliza via alias ────────────────────────

describe('autoFixGraph AC3 — normaliza edge types via alias', () => {
  it("'depends-on' (com hífen) é normalizado para 'depends_on'", () => {
    const raw = { nodes: [validNode()], edges: [validEdge({ relationType: 'depends-on' })] }
    const { graph } = autoFixGraph(raw)
    expect(graph.edges[0].relationType).toBe('depends_on')
  })

  it("'blocked_by' é normalizado para 'depends_on'", () => {
    const raw = { nodes: [validNode()], edges: [validEdge({ relationType: 'blocked_by' })] }
    const { graph } = autoFixGraph(raw)
    expect(graph.edges[0].relationType).toBe('depends_on')
  })

  it("'parent-of' (com hífen) é normalizado para 'parent_of'", () => {
    const raw = { nodes: [validNode()], edges: [validEdge({ relationType: 'parent-of' })] }
    const { graph } = autoFixGraph(raw)
    expect(graph.edges[0].relationType).toBe('parent_of')
  })

  it('type canônico existente não é alterado', () => {
    const raw = { nodes: [validNode()], edges: [validEdge({ relationType: 'blocks' })] }
    const { graph, issues } = autoFixGraph(raw)
    expect(graph.edges[0].relationType).toBe('blocks')
    expect(issues).toHaveLength(0)
  })

  it('NODE_TYPE_ALIASES exportado contém ao menos story→task e feature→epic', () => {
    expect(NODE_TYPE_ALIASES['story']).toBe('task')
    expect(NODE_TYPE_ALIASES['feature']).toBe('epic')
  })

  it('EDGE_TYPE_ALIASES exportado contém depends-on e blocked_by', () => {
    expect(EDGE_TYPE_ALIASES['depends-on']).toBe('depends_on')
    expect(EDGE_TYPE_ALIASES['blocked_by']).toBe('depends_on')
  })

  it("node type alias 'story' é normalizado para 'task'", () => {
    const raw = { nodes: [validNode({ type: 'story' })], edges: [] }
    const { graph } = autoFixGraph(raw)
    expect(graph.nodes[0].type).toBe('task')
  })
})

// ── AC4: Payload corrompido → repairImpossible + fatalFields ─────────────────

describe('autoFixGraph AC4 — payload sem reparo possível reporta fatalFields', () => {
  it('node sem id, sem name e sem title resulta em repairImpossible=true', () => {
    const raw = { nodes: [validNode({ id: undefined, name: undefined, title: undefined })], edges: [] }
    const { repairImpossible, fatalFields } = autoFixGraph(raw)
    expect(repairImpossible).toBe(true)
    expect(fatalFields.length).toBeGreaterThan(0)
  })

  it('fatalFields inclui referência ao campo problemático com índice', () => {
    const raw = { nodes: [validNode({ id: undefined, name: undefined, title: undefined })], edges: [] }
    const { fatalFields } = autoFixGraph(raw)
    expect(fatalFields.some((f: string) => f.includes('nodes[0]') || f.includes('id'))).toBe(true)
  })

  it('node sem title e sem id/name resulta em fatalFields não vazio', () => {
    const raw = { nodes: [validNode({ id: undefined, name: undefined, title: undefined })], edges: [] }
    const { fatalFields } = autoFixGraph(raw)
    expect(fatalFields.length).toBeGreaterThan(0)
  })

  it('nodes válidos mais um node corrompido: repairImpossible=true', () => {
    const corrupt = validNode({ id: undefined, name: undefined, title: undefined })
    const raw = { nodes: [validNode(), corrupt], edges: [] }
    const { repairImpossible, graph } = autoFixGraph(raw)
    expect(repairImpossible).toBe(true)
    // Reparable nodes still included
    expect(graph.nodes.some((n: GraphNode) => n.id === 'n1')).toBe(true)
  })
})

// ── AC5: Extra fields → ignorados silenciosamente ────────────────────────────

describe('autoFixGraph AC5 — campos extras são ignorados (forward-compat)', () => {
  it('node com campo extra não produz warning', () => {
    const raw = { nodes: [validNode({ unknownField: 'foo', anotherExtra: 42 })], edges: [] }
    const { issues } = autoFixGraph(raw)
    expect(issues).toHaveLength(0)
  })

  it('node com campo extra não aparece no graph retornado', () => {
    const raw = { nodes: [validNode({ unknownField: 'foo' })], edges: [] }
    const { graph } = autoFixGraph(raw)
    expect((graph.nodes[0] as unknown as Record<string, unknown>)['unknownField']).toBeUndefined()
  })

  it('edge com campo extra não produz warning', () => {
    const raw = { nodes: [validNode()], edges: [validEdge({ extraEdgeField: true })] }
    const { issues } = autoFixGraph(raw)
    expect(issues).toHaveLength(0)
  })
})
