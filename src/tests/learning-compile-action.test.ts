/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createMemoryStore, actionCompile } from '../core/learning/learning-actions.js'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'
import type { PerfRecord } from '../core/learning/performance-tracker.js'

const NOW = 1_700_000_000_000

function rec(agentId: string, acPassed: boolean, ts = NOW): PerfRecord {
  return { agentId, nodeId: `n_${ts}_${agentId}`, harnessDelta: 0, acPassed, cycleTimeMs: 100, ts }
}

describe('actionCompile', () => {
  // AC: GIVEN agf learning compile WHEN executed THEN returns ok and the number of rules emitted
  it('compiles a per-agent routing rule when an agent has >= 2 successful records', () => {
    const learning = createMemoryStore([rec('alice', true), rec('alice', true)])
    const decisionStore = new DecisionTableStore(new Database(':memory:'))
    const res = actionCompile(learning, decisionStore, { now: NOW })
    expect(res.compiled).toBe(1)
    expect(decisionStore.count()).toBe(1)
  })

  it('does not compile an agent with a single record', () => {
    const learning = createMemoryStore([rec('bob', true)])
    const decisionStore = new DecisionTableStore(new Database(':memory:'))
    const res = actionCompile(learning, decisionStore, { now: NOW })
    expect(res.compiled).toBe(0)
    expect(res.skipped).toBe(1)
    expect(decisionStore.count()).toBe(0)
  })

  it('does not compile an agent below the success-rate gate', () => {
    // 1 pass + 2 fails recent → rate 0.33 < 0.7
    const learning = createMemoryStore([rec('carol', true), rec('carol', false), rec('carol', false)])
    const decisionStore = new DecisionTableStore(new Database(':memory:'))
    const res = actionCompile(learning, decisionStore, { now: NOW })
    expect(res.compiled).toBe(0)
    expect(decisionStore.count()).toBe(0)
  })

  it('compiledCount reflects multiple agents that qualify', () => {
    const learning = createMemoryStore([
      rec('alice', true),
      rec('alice', true),
      rec('dave', true),
      rec('dave', true),
      rec('eve', true), // only one → skipped
    ])
    const decisionStore = new DecisionTableStore(new Database(':memory:'))
    const res = actionCompile(learning, decisionStore, { now: NOW })
    expect(res.compiled).toBe(2)
    expect(decisionStore.count()).toBe(2)
  })
})
