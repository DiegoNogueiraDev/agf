/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes das dims de velocity no scorecard (node_d35e86e659dc) — fonte única
 * (DRY) das 8 métricas de velocity computadas de grafo+ledger: lead-time,
 * cycle-time/task, flow-efficiency, FPY, rework-rate, gate-pass-rate, $/task,
 * tokens/task. Consumida por eval, metrics E insights — a MESMA computação.
 * AC: métricas sempre numéricas (nunca null); zero done → 0 + note, sem throw.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import {
  computeVelocityScorecard,
  collectVelocityScorecard,
  type VelocityInputs,
  type VelocityScorecard,
} from '../core/evals/scorecard.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-velocity')
  return store
}

function taskNode(id: string, status: GraphNode['status'], overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'task',
    title: `task ${id}`,
    description: 'velocity fixture',
    priority: 1,
    status,
    acceptanceCriteria: ['ac1'],
    tags: [],
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const VELOCITY_KEYS: Array<keyof VelocityScorecard> = [
  'leadTimeHours',
  'cycleTimeHours',
  'flowEfficiency',
  'fpy',
  'reworkRate',
  'gatePassRate',
  'costPerTaskUsd',
  'tokensPerTask',
]

function baseInputs(overrides: Partial<VelocityInputs> = {}): VelocityInputs {
  return {
    doneTasks: 4,
    leadTimeP50Hours: 10,
    avgCompletionHours: 6,
    active: 1,
    waiting: 3,
    fpyValue: 0.75,
    changeFailureRate: 0.25,
    gateOutcomes: { passed: 8, total: 10 },
    ledgerTotals: { costUsd: 2, tokens: 8000 },
    ...overrides,
  }
}

describe('computeVelocityScorecard (pure)', () => {
  it('zero done tasks → all 8 metrics are 0 with a note, without throwing (AC2)', () => {
    const sc = computeVelocityScorecard(
      baseInputs({
        doneTasks: 0,
        leadTimeP50Hours: 0,
        avgCompletionHours: 0,
        active: 0,
        waiting: 0,
        fpyValue: null,
        changeFailureRate: 0,
        gateOutcomes: { passed: 0, total: 0 },
        ledgerTotals: { costUsd: 0, tokens: 0 },
      }),
    )
    for (const key of VELOCITY_KEYS) {
      expect(sc[key], key).toBe(0)
    }
    expect(sc.doneTasks).toBe(0)
    expect(sc.note).toBeTruthy()
  })

  it('computes the 8 metrics numerically from populated inputs (AC1)', () => {
    const sc = computeVelocityScorecard(baseInputs())
    expect(sc.leadTimeHours).toBe(10)
    expect(sc.cycleTimeHours).toBe(6)
    expect(sc.flowEfficiency).toBe(25) // 1 active / (1+3) * 100
    expect(sc.fpy).toBe(0.75)
    expect(sc.reworkRate).toBe(0.25)
    expect(sc.gatePassRate).toBe(0.8) // 8/10
    expect(sc.costPerTaskUsd).toBe(0.5) // $2 / 4 done
    expect(sc.tokensPerTask).toBe(2000) // 8000 / 4 done
    expect(sc.note).toBeUndefined()
  })

  it('null FPY (no deliveries) degrades to 0, never null', () => {
    const sc = computeVelocityScorecard(baseInputs({ fpyValue: null }))
    expect(sc.fpy).toBe(0)
    expect(typeof sc.fpy).toBe('number')
  })
})

describe('collectVelocityScorecard (store + ledger)', () => {
  it('empty store → all metrics numeric 0 with a note, without throwing (AC2)', () => {
    const store = freshStore()
    const sc = collectVelocityScorecard(store)
    for (const key of VELOCITY_KEYS) {
      expect(typeof sc[key], key).toBe('number')
      expect(sc[key], key).toBe(0)
    }
    expect(sc.note).toBeTruthy()
    store.close()
  })

  it('seeded store → all 8 metrics numeric; fpy and gatePassRate follow episodic outcomes (AC1)', () => {
    const store = freshStore()
    store.insertNode(taskNode('node_v1', 'done'))
    store.insertNode(taskNode('node_v2', 'done'))
    store.insertNode(taskNode('node_v3', 'in_progress'))
    store.insertNode(taskNode('node_v4', 'backlog'))

    recordModelCall(store.getDb(), {
      sessionId: 's-velocity',
      provider: 'openrouter',
      model: 'deepseek/deepseek-chat',
      inputTokens: 5000,
      cachedInputTokens: 0,
      outputTokens: 1000,
    })

    const now = Date.now()
    insertEpisodicOutcome(store.getDb(), {
      id: 'eo1',
      nodeId: 'node_v1',
      taskType: 'task',
      tags: '',
      approachSummary: 'first pass ok',
      outcome: 'success',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: now - 1000,
    })
    insertEpisodicOutcome(store.getDb(), {
      id: 'eo2',
      nodeId: 'node_v2',
      taskType: 'task',
      tags: '',
      approachSummary: 'failed first',
      outcome: 'failure',
      cycleTimeDelta: 0,
      reopenCount: 2,
      createdAt: now - 900,
    })

    const sc = collectVelocityScorecard(store)
    for (const key of VELOCITY_KEYS) {
      expect(typeof sc[key], key).toBe('number')
      expect(Number.isFinite(sc[key]), key).toBe(true)
    }
    expect(sc.doneTasks).toBe(2)
    expect(sc.fpy).toBe(0.5) // 1 of 2 first-pass success
    expect(sc.gatePassRate).toBe(0.5) // 1 success of 2 outcomes
    expect(sc.tokensPerTask).toBe(3000) // 6000 tokens / 2 done
    expect(sc.costPerTaskUsd).toBeGreaterThan(0)
    store.close()
  })
})
