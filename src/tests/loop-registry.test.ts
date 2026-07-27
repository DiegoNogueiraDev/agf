/*!
 * Task node_2ca5dbb72a53 — loop_jobs registry.
 *
 * AC1: registerLoop → returns id; listLoops includes job with status==='running'.
 * AC2: markStopped → status===stopped; listLoops({status:'running'}) excludes it.
 * AC3: incrementRuns 3x → getLoop(id).runs===3.
 * AC4: table absent → listLoops returns [] without throwing.
 * AC5: registerLoop accepts an explicit id (pre-generated before spawn) and uses it verbatim.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { registerLoop, listLoops, markStopped, incrementRuns, getLoop } from '../core/autonomy/loop-registry.js'

function makeDb(): ReturnType<typeof Database> {
  return new Database(':memory:')
}

describe('loop-registry', () => {
  it('registerLoop returns id and listLoops includes the job (AC1)', () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: '/loop test', intervalSecs: 60 })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    const jobs = listLoops(db)
    expect(jobs.length).toBe(1)
    expect(jobs[0].status).toBe('running')
    expect(jobs[0].prompt).toBe('/loop test')
    db.close()
  })

  it('markStopped sets status to stopped; filtered out of running list (AC2)', () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: '/loop foo', intervalSecs: 30 })
    markStopped(db, id)
    expect(getLoop(db, id)?.status).toBe('stopped')
    const running = listLoops(db, { status: 'running' })
    expect(running.find((j) => j.id === id)).toBeUndefined()
    db.close()
  })

  it('incrementRuns 3x → runs===3 (AC3)', () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: '/loop bar', intervalSecs: 120 })
    incrementRuns(db, id)
    incrementRuns(db, id)
    incrementRuns(db, id)
    expect(getLoop(db, id)?.runs).toBe(3)
    db.close()
  })

  it('listLoops returns [] without throwing when table is absent (AC4)', () => {
    const db = makeDb()
    // Do NOT call registerLoop (which creates the table); call listLoops directly
    expect(() => listLoops(db)).not.toThrow()
    expect(listLoops(db)).toEqual([])
    db.close()
  })

  it('registerLoop uses an explicit id when provided (AC5)', () => {
    const db = makeDb()
    const id = registerLoop(db, { id: 'preassigned-loop-id', prompt: '/loop baz', intervalSecs: 60 })
    expect(id).toBe('preassigned-loop-id')
    expect(getLoop(db, 'preassigned-loop-id')?.prompt).toBe('/loop baz')
    db.close()
  })
})
