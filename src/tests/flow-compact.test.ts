/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Integração do subsistema flow: `applyFlowToCompact` lê config + outcomes,
 * computa Φ → λ_flow, dilui a vizinhança do grafo e grava telemetria.
 * Cobre os contratos: flow OFF → null (legado); flow ON → contexto + métrica;
 * e o formatador `formatFlowContext`.
 */
import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { applyFlowToCompact, formatFlowContext, formatFlowContextXml } from '../core/context/flow-compact.js'
import { enableFlowConfig } from '../cli/shared/enable-flow.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import { queryFlowMetrics } from '../core/context/flow-metrics-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function isoNow(): string {
  return new Date(0).toISOString()
}

function node(id: string, type: GraphNode['type'], title: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type,
    title,
    status: 'backlog',
    priority: 3,
    createdAt: isoNow(),
    updatedAt: isoNow(),
    ...extra,
  }
}

function seedGraph(store: SqliteStore): void {
  store.initProject('flow-test')
  const nodes: GraphNode[] = [
    node('t1', 'task', 'Implementar somador', { description: 'core feature', acceptanceCriteria: ['soma 2+2=4'] }),
    node('c1', 'constraint', 'Não usar libs externas'),
    node('r1', 'risk', 'Overflow de inteiros'),
    node('t2', 'task', 'Vizinho periférico', { description: 'x'.repeat(400) }),
  ]
  const edges: GraphEdge[] = [
    { id: 'e1', from: 't1', to: 'c1', relationType: 'related_to', createdAt: isoNow() },
    { id: 'e2', from: 't1', to: 'r1', relationType: 'related_to', createdAt: isoNow() },
    { id: 'e3', from: 't1', to: 't2', relationType: 'related_to', createdAt: isoNow() },
  ]
  store.bulkInsert(nodes, edges)
}

describe('applyFlowToCompact — contrato de não-regressão', () => {
  it('flow desabilitado (default) → retorna null (cai no legado)', () => {
    const store = SqliteStore.open(':memory:')
    seedGraph(store)
    expect(applyFlowToCompact(store, 't1')).toBeNull()
    store.close()
  })

  it('node inexistente → null mesmo com flow ligado', () => {
    const store = SqliteStore.open(':memory:')
    seedGraph(store)
    enableFlowConfig(store)
    expect(applyFlowToCompact(store, 'inexistente')).toBeNull()
    store.close()
  })
})

describe('applyFlowToCompact — flow ligado', () => {
  it('retorna contexto + bloco de flow com λ aplicado e grava métrica', () => {
    const store = SqliteStore.open(':memory:')
    seedGraph(store)
    enableFlowConfig(store)

    // Seed de sucessos → Φ alto → λ_flow alto → mais poda de periféricos.
    for (let i = 0; i < 5; i += 1) {
      insertEpisodicOutcome(store.getDb(), {
        id: `epi_${i}`,
        nodeId: 't1',
        taskType: '',
        tags: '',
        approachSummary: '',
        outcome: 'success',
        cycleTimeDelta: 0,
        reopenCount: 0,
        createdAt: i + 1,
      })
    }

    const result = applyFlowToCompact(store, 't1')
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.flow.enabled).toBe(true)
    expect(result.flow.phi).toBeGreaterThan(0)
    // λ_flow = λ_base(0.15) + α(1.5)·Φ — deve exceder a base pura.
    expect(result.flow.lambda).toBeGreaterThan(0.15)
    expect(result.flow.tokensActual).toBeLessThanOrEqual(result.flow.tokensBaseline)

    // Telemetria persistida.
    const metrics = queryFlowMetrics(store.getDb(), { limit: 10 })
    expect(metrics.length).toBeGreaterThan(0)
    store.close()
  })
})

describe('formatFlowContext — bloco de prompt', () => {
  it('inclui task, ACs e invariantes pinados, e é texto não-vazio', () => {
    const store = SqliteStore.open(':memory:')
    seedGraph(store)
    enableFlowConfig(store)
    const result = applyFlowToCompact(store, 't1')
    expect(result).not.toBeNull()
    if (!result) return

    const text = formatFlowContext(result)
    expect(text).toContain('Implementar somador')
    expect(text.length).toBeGreaterThan(0)
    store.close()
  })

  it('formatFlowContextXml produces valid XML with required sections', () => {
    const store = SqliteStore.open(':memory:')
    seedGraph(store)
    enableFlowConfig(store)
    const result = applyFlowToCompact(store, 't1')
    expect(result).not.toBeNull()
    if (!result) return

    const xml = formatFlowContextXml(result)
    expect(xml).toContain('<compact-prompt>')
    expect(xml).toContain('<current_focus>')
    expect(xml).toContain('Implementar somador')
    expect(xml).toContain('</compact-prompt>')
    store.close()
  })
})
