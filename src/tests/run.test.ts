/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { RunSchema, type RunBudget } from '../schemas/session.schema.js'
import { createRun, transitionRun } from '../core/session/run.js'

const runBudget: RunBudget = { scope: 'run', currentUsd: 0, capUsd: 5 }

describe('RunSchema', () => {
  it('accepts a scope:run budget', () => {
    const run = createRun('run_1', runBudget)
    expect(RunSchema.safeParse(run).success).toBe(true)
  })

  it('rejects a budget whose scope is not "run"', () => {
    const bad = { ...createRun('run_1', runBudget), budget: { scope: 'project', currentUsd: 0, capUsd: 5 } }
    expect(RunSchema.safeParse(bad).success).toBe(false)
  })
})

describe('createRun', () => {
  it('returns a pending run with endedAt:null', () => {
    const run = createRun('run_1', runBudget)
    expect(run.status).toBe('pending')
    expect(run.endedAt).toBeNull()
    expect(run.runId).toBe('run_1')
  })
})

describe('transitionRun', () => {
  it('sets endedAt when transitioning active -> completed', () => {
    const active = transitionRun(createRun('run_1', runBudget), 'active')
    const completed = transitionRun(active, 'completed')
    expect(completed.status).toBe('completed')
    expect(completed.endedAt).not.toBeNull()
  })

  it('throws a typed error on an illegal transition (completed -> active)', () => {
    const completed = transitionRun(transitionRun(createRun('r', runBudget), 'active'), 'completed')
    expect(() => transitionRun(completed, 'active')).toThrow(/illegal|transition/i)
  })

  it('does not mutate its input', () => {
    const pending = createRun('run_1', runBudget)
    const next = transitionRun(pending, 'active')
    expect(pending.status).toBe('pending')
    expect(next).not.toBe(pending)
  })
})
