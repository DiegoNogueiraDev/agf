/*!
 * Task node_1a6a6a7b6c7d — agf loop stop.
 *
 * AC1: stop <id> → killer called with pid; registry marks stopped.
 * AC2: stop all → all 3 running loops stopped; killer called 3x.
 * AC3: stop <unknown-id> → NOT_FOUND error.
 * AC4: pid already dead → no throw; marks stopped (idempotent).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { stopLoop, stopAllLoops } from '../core/autonomy/loop-stop.js'
import { registerLoop, listLoops, getLoop } from '../core/autonomy/loop-registry.js'

function makeDb(): ReturnType<typeof Database> {
  return new Database(':memory:')
}

describe('stopLoop', () => {
  it('kills pid and marks stopped (AC1)', () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: 'test', intervalSecs: 60, pid: 54321 })
    const killedPids: number[] = []
    const result = stopLoop(db, id, { killer: (pid) => killedPids.push(pid) })
    expect(result.ok).toBe(true)
    expect(killedPids.length).toBe(1)
    expect(getLoop(db, id)?.status).toBe('stopped')
    db.close()
  })

  it('returns NOT_FOUND for unknown id (AC3)', () => {
    const db = makeDb()
    registerLoop(db, { prompt: 'test', intervalSecs: 60 })
    const result = stopLoop(db, 'no-such-id', { killer: () => {} })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
    db.close()
  })

  it('does not throw when pid is already dead; marks stopped (AC4)', () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: 'test', intervalSecs: 60, pid: 54321 })
    const killer = (_pid: number) => {
      throw new Error('ESRCH')
    }
    expect(() => stopLoop(db, id, { killer })).not.toThrow()
    expect(getLoop(db, id)?.status).toBe('stopped')
    db.close()
  })
})

describe('stopAllLoops', () => {
  it('stops all running loops and calls killer 3x (AC2)', () => {
    const db = makeDb()
    registerLoop(db, { prompt: 'a', intervalSecs: 60, pid: 111 })
    registerLoop(db, { prompt: 'b', intervalSecs: 60, pid: 222 })
    registerLoop(db, { prompt: 'c', intervalSecs: 60, pid: 333 })
    const killedPids: number[] = []
    const result = stopAllLoops(db, { killer: (pid) => killedPids.push(pid) })
    expect(result.stopped).toBe(3)
    expect(killedPids.length).toBe(3)
    expect(listLoops(db, { status: 'running' }).length).toBe(0)
    db.close()
  })
})
