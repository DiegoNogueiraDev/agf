/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do `agf flow on|off|status` (F1.T1 — node_dc8f44a027ec).
 * Cobre os helpers puros do comando; a superfície Commander é E2E-tier.
 * Fixture: SqliteStore.open(':memory:') — migrações reais, zero I/O em disco.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { setFlowEnabled } from '../cli/shared/enable-flow.js'
import { FLOW_CONFIG_SETTING_KEY, resolveFlowConfig } from '../core/context/flow-config.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import { insertFlowMetric } from '../core/context/flow-metrics-store.js'
import { buildFlowStatus } from '../cli/commands/flow-cmd.js'

function openTestStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('flow-cmd-test')
  return store
}

function seedOutcome(store: SqliteStore, id: string, outcome: 'success' | 'failure', createdAt: number): void {
  insertEpisodicOutcome(store.getDb(), {
    id,
    nodeId: `node_${id}`,
    taskType: 'task',
    tags: '',
    approachSummary: 'seed',
    outcome,
    cycleTimeDelta: 0,
    reopenCount: 0,
    createdAt,
  })
}

describe('flow-cmd helpers', () => {
  it('agf flow on é idempotente e resolveFlowConfig passa a enabled=true', () => {
    // Arrange
    const store = openTestStore()

    // Act
    setFlowEnabled(store, true)
    const rawAfterFirst = store.getProjectSetting(FLOW_CONFIG_SETTING_KEY)
    setFlowEnabled(store, true)
    const rawAfterSecond = store.getProjectSetting(FLOW_CONFIG_SETTING_KEY)

    // Assert
    expect(resolveFlowConfig(store).enabled).toBe(true)
    expect(rawAfterSecond).toBe(rawAfterFirst)
    store.close()
  })

  it('agf flow off muda apenas enabled e preserva overrides gravados', () => {
    // Arrange
    const store = openTestStore()
    store.setProjectSetting(FLOW_CONFIG_SETTING_KEY, JSON.stringify({ enabled: true, lambdaBase: 0.9 }))

    // Act
    setFlowEnabled(store, false)

    // Assert
    const parsed = JSON.parse(store.getProjectSetting(FLOW_CONFIG_SETTING_KEY) ?? '{}') as Record<string, unknown>
    expect(parsed.enabled).toBe(false)
    expect(parsed.lambdaBase).toBe(0.9)
    expect(resolveFlowConfig(store).enabled).toBe(false)
    store.close()
  })

  it('buildFlowStatus em projeto sem setting retorna enabled=false, phi=0 e metricsCount=0 sem excecao', () => {
    // Arrange
    const store = openTestStore()

    // Act
    const status = buildFlowStatus(store)

    // Assert — contrato de nao-regressao: sem setting o flow é OFF (default byte-idêntico)
    expect(status.enabled).toBe(false)
    expect(status.phi).toBe(0)
    expect(status.metricsCount).toBe(0)
    expect(status.sampleCount).toBe(0)
    store.close()
  })

  it('buildFlowStatus com flow ligado reflete phi>0 dos outcomes e conta linhas de flow_metrics', () => {
    // Arrange
    const store = openTestStore()
    setFlowEnabled(store, true)
    const now = Date.now()
    seedOutcome(store, 'o1', 'success', now - 3000)
    seedOutcome(store, 'o2', 'success', now - 2000)
    seedOutcome(store, 'o3', 'success', now - 1000)
    for (let i = 0; i < 2; i += 1) {
      insertFlowMetric(store.getDb(), {
        id: `flowm_${i}`,
        projectId: 'p1',
        nodeId: `node_m${i}`,
        mode: 'flow_on',
        phi: 0.5,
        lambda: 0.6,
        tokensBaseline: 100,
        tokensActual: 80,
        prunedCount: 2,
        pinnedCount: 1,
        createdAt: now - i,
      })
    }

    // Act
    const status = buildFlowStatus(store)

    // Assert
    expect(status.enabled).toBe(true)
    expect(status.phi).toBeGreaterThan(0)
    expect(status.phi).toBeLessThanOrEqual(1)
    expect(status.streak).toBe(3)
    expect(status.metricsCount).toBe(2)
    expect(status.lambda).toBeGreaterThan(0)
    store.close()
  })
})
