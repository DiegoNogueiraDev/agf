/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { startTaskPipeline, resolveGearForTask, type StartDeps } from '../cli/commands/start-cmd.js'
import type { TaskContext } from '../core/context/compact-context-types.js'

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    task: { id: 't1', type: 'task', title: 'x', status: 'in_progress', priority: 2 },
    node: { id: 't1', type: 'task', title: 'x', status: 'in_progress', priority: 2 },
    parent: null,
    children: [],
    blockers: [],
    dependsOn: [],
    acceptanceCriteria: [],
    sourceRef: null,
    metrics: { originalChars: 0, compactChars: 0, reductionPercent: 0, estimatedTokens: 0 },
    ...overrides,
  }
}

describe('startTaskPipeline — gearshift hook', () => {
  const baseDeps: StartDeps = {
    wakeUp: () => 'wake',
    findNext: () => ({ id: 'task-1', title: 'Do something', reason: 'high priority' }),
    loadContext: () => 'ctx',
    markInProgress: (id: string) => id,
    countInProgress: () => 0,
    out: () => {},
  }

  it('calls applyGear with the started task id after marking it in_progress', () => {
    const applyGear = vi.fn()
    startTaskPipeline({ ...baseDeps, applyGear })
    expect(applyGear).toHaveBeenCalledWith('task-1')
  })

  it('never calls applyGear when no next task is found (WIP or empty backlog)', () => {
    const applyGear = vi.fn()
    startTaskPipeline({ ...baseDeps, findNext: () => null, applyGear })
    expect(applyGear).not.toHaveBeenCalled()
  })

  it('does not throw when applyGear is undefined (auto=off wiring, or older deps)', () => {
    expect(() => startTaskPipeline(baseDeps)).not.toThrow()
  })
})

describe('resolveGearForTask (start-cmd.ts) — composes gearshift + arm-stats evidence', () => {
  it('GIVEN auto=on and a trivial task (acCount=1) THEN gear=1 (Haiku, cheap)', () => {
    const ctx = makeContext({
      acceptanceCriteria: ['one'],
      task: { id: 't1', type: 'task', title: 'x', status: 'in_progress', priority: 2, xpSize: 'S' },
    })
    const result = resolveGearForTask(ctx, undefined)
    expect(result.gear).toBe(1)
    expect(result.tier).toBe('cheap')
  })

  it('GIVEN cheap tier heuristic AND cheap-arm failure history THEN gear escalates one rung above the heuristic', () => {
    const ctx = makeContext({
      acceptanceCriteria: ['one'],
      task: { id: 't1', type: 'task', title: 'x', status: 'in_progress', priority: 2, xpSize: 'S' },
    })
    const failingCheapArm = { pulls: 5, successes: 1 }
    const result = resolveGearForTask(ctx, failingCheapArm)
    expect(result.gear).toBe(2)
    expect(result.tier).toBe('build')
  })

  it('GIVEN cheap tier heuristic AND a healthy cheap-arm track record THEN gear stays at the heuristic', () => {
    const ctx = makeContext({
      acceptanceCriteria: ['one'],
      task: { id: 't1', type: 'task', title: 'x', status: 'in_progress', priority: 2, xpSize: 'S' },
    })
    const healthyCheapArm = { pulls: 10, successes: 9 }
    const result = resolveGearForTask(ctx, healthyCheapArm)
    expect(result.gear).toBe(1)
  })

  it('never escalates a non-cheap heuristic tier (evidence only matters for cheap)', () => {
    const ctx = makeContext({
      acceptanceCriteria: ['a', 'b'],
      dependsOn: [{ id: 'd1', title: 'dep', status: 'done', resolved: true, inferred: false }],
      task: { id: 't1', type: 'task', title: 'x', status: 'in_progress', priority: 2 },
    })
    const failingCheapArm = { pulls: 10, successes: 0 }
    const result = resolveGearForTask(ctx, failingCheapArm)
    expect(result.tier).not.toBe('cheap')
  })
})
