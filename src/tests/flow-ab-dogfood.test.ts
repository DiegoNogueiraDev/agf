/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do loop A/B do flow (F1.T2 — node_420b38735e2d).
 * Prova que o experimento fecha ponta-a-ponta em :memory:: flow ligado com
 * abEnabled → applyFlowToCompact grava telemetria nos DOIS braços →
 * computeFlowReport compara e emite veredito ≠ no_data/inconclusive.
 * O dogfood real (20 chamadas no grafo vivo + node de decisão) é operacional,
 * coberto pelos AC da task; aqui fica a mecânica determinística.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/types.js'
import { setFlowEnabled, setFlowAbEnabled } from '../cli/shared/enable-flow.js'
import { FLOW_CONFIG_SETTING_KEY, resolveFlowConfig, flowAbArm } from '../core/context/flow-config.js'
import { applyFlowToCompact } from '../core/context/flow-compact.js'
import { queryFlowMetrics } from '../core/context/flow-metrics-store.js'
import { computeFlowReport } from '../core/context/flow-report.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'

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

function seedAbGraph(store: SqliteStore): void {
  store.initProject('flow-ab-test')
  const nodes: GraphNode[] = [
    node('t1', 'task', 'Task braço off', { description: 'core', acceptanceCriteria: ['ac1'] }),
    node('t2', 'task', 'Task braço on', { description: 'x'.repeat(300), acceptanceCriteria: ['ac2'] }),
    node('c1', 'constraint', 'Invariante pinado'),
    node('m1', 'task', 'Vizinho intermediário', { description: 'meio' }),
    // Periférico GORDO a distância 2 de t2: com Φ=0.71 (3 sucessos) → λ≈1.22 →
    // peso e^{-2λ}≈0.087 < threshold 0.1 → podado → tokensSaved > 0 no braço on.
    node('p1', 'task', 'Vizinho periférico gordo', { description: 'y'.repeat(400) }),
  ]
  const edges: GraphEdge[] = [
    { id: 'e1', from: 't1', to: 'c1', relationType: 'related_to', createdAt: isoNow() },
    { id: 'e2', from: 't2', to: 'c1', relationType: 'related_to', createdAt: isoNow() },
    { id: 'e3', from: 't2', to: 'm1', relationType: 'related_to', createdAt: isoNow() },
    { id: 'e4', from: 'm1', to: 'p1', relationType: 'related_to', createdAt: isoNow() },
  ]
  store.bulkInsert(nodes, edges)
}

describe('flow A/B — mecânica do experimento', () => {
  it('fixture cobre os dois braços deterministicamente', () => {
    expect(flowAbArm('t1')).toBe('flow_off')
    expect(flowAbArm('t2')).toBe('flow_on')
  })

  it('setFlowAbEnabled liga experiment.abEnabled preservando o resto do flow_config', () => {
    // Arrange
    const store = SqliteStore.open(':memory:')
    store.initProject('flow-ab-test')
    store.setProjectSetting(FLOW_CONFIG_SETTING_KEY, JSON.stringify({ enabled: true, lambdaBase: 0.9 }))

    // Act
    setFlowAbEnabled(store, true)

    // Assert
    const cfg = resolveFlowConfig(store)
    expect(cfg.experiment.abEnabled).toBe(true)
    expect(cfg.enabled).toBe(true)
    expect(cfg.lambdaBase).toBe(0.9)
    store.close()
  })

  it('applyFlowToCompact com abEnabled grava telemetria nos DOIS braços e o report compara', () => {
    // Arrange
    const store = SqliteStore.open(':memory:')
    seedAbGraph(store)
    setFlowEnabled(store, true)
    setFlowAbEnabled(store, true)
    const now = Date.now()
    // 3 sucessos → Φ=0.71 → λ=1.22: alto o bastante p/ podar p1 (d=2) no braço on.
    for (let i = 0; i < 3; i += 1) {
      insertEpisodicOutcome(store.getDb(), {
        id: `o${i}`,
        nodeId: 't1',
        taskType: 'task',
        tags: '',
        approachSummary: 'seed',
        outcome: 'success',
        cycleTimeDelta: 0,
        reopenCount: 0,
        createdAt: now - 1000 * (i + 1),
      })
    }

    // Act — um node de cada braço (paridade do id decide, teste acima prova)
    const offResult = applyFlowToCompact(store, 't1')
    const onResult = applyFlowToCompact(store, 't2')

    // Assert — telemetria nos dois braços
    expect(offResult?.flow.mode).toBe('flow_off')
    expect(onResult?.flow.mode).toBe('flow_on')
    const db = store.getDb()
    expect(queryFlowMetrics(db, { mode: 'flow_off' }).length).toBeGreaterThanOrEqual(1)
    expect(queryFlowMetrics(db, { mode: 'flow_on' }).length).toBeGreaterThanOrEqual(1)

    // Assert — braço on podou de verdade (economia real, não zero)
    expect(onResult?.flow.tokensSaved ?? 0).toBeGreaterThan(0)

    // Assert — o adjudicador compara os dois lados e declara vitória sem regressão de defeito
    const report = computeFlowReport(db)
    expect(report.flowOn.samples).toBeGreaterThanOrEqual(1)
    expect(report.flowOff.samples).toBeGreaterThanOrEqual(1)
    expect(report.verdict).toBe('net_positive')
    expect(typeof report.rationale).toBe('string')
    store.close()
  })
})
