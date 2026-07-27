/*!
 * Task node_01e774a299ff — agf loop list + status CLI subcommands.
 *
 * AC1: 2 running loops → list --json returns array with id/prompt/intervalSecs/runs/status.
 * AC2: no loops → list returns data===[] with ok:true.
 * AC3: loop status <id> → returns LoopJob; missing id → NOT_FOUND.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { listLoopsEnvelope, loopStatusEnvelope } from '../core/autonomy/loop-list.js'
import { registerLoop } from '../core/autonomy/loop-registry.js'

function makeDb(): ReturnType<typeof Database> {
  return new Database(':memory:')
}

describe('listLoopsEnvelope', () => {
  it('returns array of 2 jobs with correct fields (AC1)', () => {
    const db = makeDb()
    registerLoop(db, { prompt: 'stats', intervalSecs: 300 })
    registerLoop(db, { prompt: 'next', intervalSecs: 60 })
    const result = listLoopsEnvelope(db)
    expect(result.ok).toBe(true)
    expect(result.data.length).toBe(2)
    const first = result.data[0]
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('prompt')
    expect(first).toHaveProperty('intervalSecs')
    expect(first).toHaveProperty('runs')
    expect(first).toHaveProperty('status')
    expect(first.status).toBe('running')
    db.close()
  })

  it('returns empty array when no loops registered (AC2)', () => {
    const db = makeDb()
    const result = listLoopsEnvelope(db)
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([])
    db.close()
  })
})

describe('loopStatusEnvelope', () => {
  it('returns the LoopJob when id exists (AC3)', () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: 'foo', intervalSecs: 120 })
    const result = loopStatusEnvelope(db, id)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe(id)
      expect(result.data.prompt).toBe('foo')
    }
    db.close()
  })

  it('returns NOT_FOUND when id is missing (AC3)', () => {
    const db = makeDb()
    const result = loopStatusEnvelope(db, 'no-such-id')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOT_FOUND')
    db.close()
  })
})
