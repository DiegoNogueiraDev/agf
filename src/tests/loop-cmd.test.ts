/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * B4 — `agf loop` goal-mode logic. Deterministic & offline: deterministic
 * rubric path + injected attempt runner (no live LLM, no child process).
 */

import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { buildRubric } from '../core/autonomy/rubric.js'
import { runGoalMode, loadRubricFromText, runIntervalTick } from '../cli/commands/loop-cmd.js'
import { registerLoop, getLoop } from '../core/autonomy/loop-registry.js'

describe('loadRubricFromText', () => {
  it('parses a JSON array of specs', () => {
    const rubric = loadRubricFromText('[{"description":"has done","pattern":"done"}]')
    expect(rubric.criteria).toHaveLength(1)
    expect(rubric.criteria[0]).toMatchObject({ kind: 'deterministic', pattern: 'done' })
  })

  it('parses one criterion per line (bare AC strings)', () => {
    const rubric = loadRubricFromText('build passes pattern:PASS\n# comment line\n\ntests green pattern:OK')
    expect(rubric.criteria).toHaveLength(2)
    expect(rubric.criteria.every((c) => c.kind === 'deterministic')).toBe(true)
  })
})

describe('runGoalMode (deterministic, offline)', () => {
  it('iterates until the rubric is met and reports goal_met', async () => {
    const rubric = buildRubric([{ description: 'output is DONE', pattern: 'DONE' }])
    // First two attempts fail, third produces passing output.
    const outputs = ['working...', 'still working', 'task DONE']
    const attempt = vi.fn(async (_feedback: string | null, i: number) => outputs[i] ?? 'task DONE')

    const result = await runGoalMode({ rubric, attempt, maxIterations: 10 })

    expect(result.stopped).toBe('goal_met')
    expect(result.iterations).toBe(3)
    expect(result.allPass).toBe(true)
  })

  it('reports budget_exhausted when the rubric never passes', async () => {
    const rubric = buildRubric([{ description: 'needs DONE', pattern: 'DONE' }])
    const attempt = vi.fn(async () => 'never going to match')

    const result = await runGoalMode({ rubric, attempt, maxIterations: 4 })

    expect(result.stopped).toBe('budget_exhausted')
    expect(result.iterations).toBe(4)
    expect(result.allPass).toBe(false)
  })

  it('feeds the failing-criteria feedback into the next attempt', async () => {
    const rubric = buildRubric([{ description: 'must contain TOKEN', pattern: 'TOKEN' }])
    const seen: Array<string | null> = []
    const attempt = vi.fn(async (feedback: string | null) => {
      seen.push(feedback)
      return seen.length >= 2 ? 'now with TOKEN' : 'no match'
    })

    await runGoalMode({ rubric, attempt, maxIterations: 5 })

    expect(seen[0]).toBeNull()
    expect(seen[1]).toContain('must contain TOKEN')
  })
})

describe('runIntervalTick (wires loop-tick.ts runTick into the interval-mode spawned child)', () => {
  it('runs the inner command via the injected runner and increments the registry runs count', async () => {
    const db = new Database(':memory:')
    const loopId = registerLoop(db, { prompt: '/loop next', intervalSecs: 60 })
    const calls: { cmd: string; args: string[] }[] = []

    await runIntervalTick({
      db,
      loopId,
      cmd: 'next',
      args: ['--limit', '1'],
      runner: async (cmd, args) => {
        calls.push({ cmd, args })
      },
    })

    expect(calls).toEqual([{ cmd: 'next', args: ['--limit', '1'] }])
    expect(getLoop(db, loopId)?.runs).toBe(1)
    db.close()
  })

  it('increments the registry once per call, matching one runOnce per interval tick', async () => {
    const db = new Database(':memory:')
    const loopId = registerLoop(db, { prompt: '/loop stats', intervalSecs: 60 })
    const runner = async (): Promise<void> => {}

    await runIntervalTick({ db, loopId, cmd: 'stats', args: [], runner })
    await runIntervalTick({ db, loopId, cmd: 'stats', args: [], runner })

    expect(getLoop(db, loopId)?.runs).toBe(2)
    db.close()
  })

  it('serializes concurrent ticks for the same loopId (WIP=1 per loop, uses Runner from runner-fsm.ts)', async () => {
    const db = new Database(':memory:')
    const loopId = registerLoop(db, { prompt: '/loop next', intervalSecs: 60 })
    let active = 0
    let maxActive = 0
    const runner = async (): Promise<void> => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
    }

    await Promise.all([
      runIntervalTick({ db, loopId, cmd: 'next', args: [], runner }),
      runIntervalTick({ db, loopId, cmd: 'next', args: [], runner }),
    ])

    expect(maxActive).toBe(1)
    expect(getLoop(db, loopId)?.runs).toBe(2)
    db.close()
  })
})
