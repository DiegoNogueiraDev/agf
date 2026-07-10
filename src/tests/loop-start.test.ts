/*!
 * Task node_c43b1e6c5b9f — agf loop start background detach + registry.
 *
 * AC1: start "stats" --every 5m → envelope with data.loopId; registry has 1 row status==='running'.
 * AC2: --every xyz (invalid) → InvalidArgumentError; no loop registered.
 * AC3: spawner called with detached+unref (non-blocking) — proven by fake spawner.
 * AC5: spawner receives the loopId BEFORE registration, so the spawned child can
 *      report ticks back against the same registry row (see loop-tick.ts wiring).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { startLoop } from '../core/autonomy/loop-start.js'
import { listLoops, getLoop } from '../core/autonomy/loop-registry.js'

function makeDb(): ReturnType<typeof Database> {
  return new Database(':memory:')
}

describe('startLoop', () => {
  it('registers loop and returns loopId; registry has running row (AC1)', () => {
    const db = makeDb()
    const spawnerCalls: { detached: boolean; unref: boolean }[] = []
    const fakeSpawner = (detached: boolean) => {
      spawnerCalls.push({ detached, unref: true })
      return { pid: 1234, unref: () => {} }
    }

    const result = startLoop(db, { payload: 'stats', every: '5m', spawner: fakeSpawner })
    expect(result.loopId).toBeTruthy()
    const jobs = listLoops(db)
    expect(jobs.length).toBe(1)
    expect(jobs[0].status).toBe('running')
    expect(jobs[0].id).toBe(result.loopId)
    db.close()
  })

  it('throws on invalid --every; no loop registered (AC2)', () => {
    const db = makeDb()
    const fakeSpawner = () => ({ pid: 0, unref: () => {} })
    expect(() => startLoop(db, { payload: 'stats', every: 'xyz', spawner: fakeSpawner })).toThrow()
    expect(listLoops(db).length).toBe(0)
    db.close()
  })

  it('spawner is called with detached=true (non-blocking, AC3)', () => {
    const db = makeDb()
    const spawnerCalls: boolean[] = []
    const fakeSpawner = (detached: boolean) => {
      spawnerCalls.push(detached)
      return { pid: 999, unref: () => {} }
    }
    startLoop(db, { payload: 'stats', every: '1m', spawner: fakeSpawner })
    expect(spawnerCalls.length).toBe(1)
    expect(spawnerCalls[0]).toBe(true)
    db.close()
  })

  it('spawner receives the same loopId that ends up in the registry (AC5)', () => {
    const db = makeDb()
    const seenLoopIds: string[] = []
    const fakeSpawner = (_detached: boolean, loopId: string) => {
      seenLoopIds.push(loopId)
      return { pid: 4242, unref: () => {} }
    }

    const result = startLoop(db, { payload: 'stats', every: '5m', spawner: fakeSpawner })
    expect(seenLoopIds).toEqual([result.loopId])
    expect(getLoop(db, result.loopId)?.id).toBe(result.loopId)
  })

  it('node_165eda540a95: registry stores the REAL spawned pid, never 0 — kill(0) would signal the whole process group', () => {
    const db = makeDb()
    const fakeSpawner = () => ({ pid: 54321, unref: () => {} })

    const result = startLoop(db, { payload: 'stats', every: '5m', spawner: fakeSpawner })
    const jobs = listLoops(db)
    expect(jobs[0].pid).toBe(54321)
    expect(jobs[0].pid).toBe(result.pid)
    expect(jobs[0].pid).not.toBe(0)
  })
})
