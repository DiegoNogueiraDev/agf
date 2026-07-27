/*!
 * Task node_d518b5a5b003 — loop tick runner (command | prompt | default autopilot).
 *
 * AC1: kind=command payload=stats → runAgf called with 'stats'; runs incremented.
 * AC2: empty payload → command becomes 'autopilot'.
 * AC3: kind=prompt → prompt delivered to delegate path; runs incremented.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runTick } from '../core/autonomy/loop-tick.js'
import { registerLoop, getLoop } from '../core/autonomy/loop-registry.js'

function makeDb(): ReturnType<typeof Database> {
  return new Database(':memory:')
}

describe('runTick', () => {
  it('kind=command calls runner with payload command and increments runs (AC1)', async () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: 'stats', intervalSecs: 60 })
    const calls: string[] = []
    const fakeRunner = async (cmd: string) => {
      calls.push(cmd)
    }

    await runTick(db, { loopId: id, kind: 'command', payload: 'stats', runner: fakeRunner })
    expect(calls).toEqual(['stats'])
    expect(getLoop(db, id)?.runs).toBe(1)
    db.close()
  })

  it('empty payload defaults to autopilot command (AC2)', async () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: '', intervalSecs: 60 })
    const calls: string[] = []
    await runTick(db, {
      loopId: id,
      kind: 'command',
      payload: '',
      runner: async (cmd) => {
        calls.push(cmd)
      },
    })
    expect(calls[0]).toBe('autopilot')
    db.close()
  })

  it('kind=prompt delegates to delegateRunner and increments runs (AC3)', async () => {
    const db = makeDb()
    const id = registerLoop(db, { prompt: 'build the backlog', intervalSecs: 60 })
    const prompts: string[] = []
    const fakeDelegate = async (prompt: string) => {
      prompts.push(prompt)
    }

    await runTick(db, { loopId: id, kind: 'prompt', payload: 'build the backlog', delegateRunner: fakeDelegate })
    expect(prompts).toEqual(['build the backlog'])
    expect(getLoop(db, id)?.runs).toBe(1)
    db.close()
  })
})
