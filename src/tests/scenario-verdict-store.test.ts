/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for the scenario verdict store (node_a0e28320fe6b, épico node_56a63da5d5c8).
 *
 * PORQUÊ: `agf scenario` roda cada cenário num :memory: próprio e nada persiste,
 * então check/done não têm veredito de superfície para LER. Sem persistência, o
 * gate só poderia adivinhar — e adivinhar verde é o falso-passed que este épico
 * existe para matar. Ausência de run ⇒ 'missing', NUNCA 'passed'.
 *
 * Zero mock: Database(':memory:') real + migrations reais.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import {
  recordScenarioVerdict,
  readLatestScenarioVerdict,
  surfaceProofState,
} from '../core/observability/scenario-verdict-store.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

describe('recordScenarioVerdict / readLatestScenarioVerdict', () => {
  it('persists a verdict for a nodeId and reads it back', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, scenarioId: 'login-flow', ranAt: 1000 })
    const v = readLatestScenarioVerdict(db, 'node_x')
    expect(v).not.toBeNull()
    expect(v!.passed).toBe(true)
    expect(v!.scenarioId).toBe('login-flow')
    expect(v!.ranAt).toBe(1000)
  })

  it('two runs for the same nodeId → reads the MOST RECENT', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, scenarioId: 's', ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, scenarioId: 's', ranAt: 2000 })
    const v = readLatestScenarioVerdict(db, 'node_x')
    expect(v!.passed).toBe(false)
    expect(v!.ranAt).toBe(2000)
  })

  it('a later PASS supersedes an earlier fail (recency wins, not optimism)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, ranAt: 2000 })
    expect(readLatestScenarioVerdict(db, 'node_x')!.passed).toBe(true)
  })

  it('verdicts are isolated per nodeId (no cross-contamination)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_a', passed: true, ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_b', passed: false, ranAt: 1000 })
    expect(readLatestScenarioVerdict(db, 'node_a')!.passed).toBe(true)
    expect(readLatestScenarioVerdict(db, 'node_b')!.passed).toBe(false)
  })

  it('no run for that node → null (absence is not a verdict)', () => {
    expect(readLatestScenarioVerdict(db, 'never_ran')).toBeNull()
  })

  it('stores the failure detail when the scenario failed', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, ranAt: 1, detail: '2 assertions failed' })
    expect(readLatestScenarioVerdict(db, 'node_x')!.detail).toBe('2 assertions failed')
  })
})

describe('surfaceProofState — the gate-facing verdict', () => {
  it('no run → missing (never a false passed)', () => {
    expect(surfaceProofState(db, 'never_ran')).toBe('missing')
  })

  it('latest run passed → passed', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, ranAt: 1 })
    expect(surfaceProofState(db, 'node_x')).toBe('passed')
  })

  it('latest run failed → failed (a stale earlier pass does not rescue it)', () => {
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: true, ranAt: 1000 })
    recordScenarioVerdict(db, { nodeId: 'node_x', passed: false, ranAt: 2000 })
    expect(surfaceProofState(db, 'node_x')).toBe('failed')
  })
})
