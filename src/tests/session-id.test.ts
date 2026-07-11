/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `session_id` was the string `'cli'` on all 201 rows of the lever ledger, and NULL on all 17,645
 * rows of the command ledger. A column that never varies is not an identifier; it is a comment.
 *
 * So `agf savings` could say which task earned the tokens — `node_id` sees to that — and could not
 * say what this sitting of work earned, which is the question an agent asks when it finishes.
 *
 * `AGF_SESSION_ID` was read in two places and set in none. `assembleSession()` mints a fresh UUID
 * on every call, so `agf session show` anchored nothing either.
 *
 * A session is a span of work, not a process: every `agf` invocation is its own process, and
 * seventeen thousand sessions is the same as none. So the span is what is persisted, and it closes
 * when nobody has touched it for a while. The harness may always override it, and when a harness
 * knows better it should.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { IDLE_WINDOW_MS, resolveSessionId } from '../core/session/session-id.js'

let db: Database.Database

/** The two calls `resolveSessionId` makes on a store, and nothing else. */
function store() {
  return {
    getProjectSetting: (key: string): string | null =>
      (db.prepare('SELECT value FROM project_settings WHERE key = ?').get(key) as { value: string } | undefined)
        ?.value ?? null,
    setProjectSetting: (key: string, value: string): void => {
      db.prepare('INSERT OR REPLACE INTO project_settings (key, value) VALUES (?, ?)').run(key, value)
    },
  }
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec('CREATE TABLE project_settings (key TEXT PRIMARY KEY, value TEXT)')
})

afterEach(() => db.close())

const NOON = 1_700_000_000_000

describe('resolveSessionId — a span of work, not a process', () => {
  it('yields to the harness when it names the session', () => {
    expect(resolveSessionId(store(), { sessionId: 'claude-abc', now: NOON })).toBe('claude-abc')
  })

  it('ignores an empty override rather than recording the empty string', () => {
    const id = resolveSessionId(store(), { sessionId: '', now: NOON })
    expect(id).not.toBe('')
    expect(id).toMatch(/^sess_[0-9a-f]{12}$/)
  })

  it('mints an id on the first invocation and hands the same one back to the next', () => {
    const first = resolveSessionId(store(), { now: NOON })
    const second = resolveSessionId(store(), { now: NOON + 60_000 })
    expect(second).toBe(first)
  })

  // The window closes on the last touch, not on the first: an hour of steady work is one session.
  it('stays open while the work keeps touching it', () => {
    const first = resolveSessionId(store(), { now: NOON })
    let last = first
    for (let i = 1; i <= 10; i++) last = resolveSessionId(store(), { now: NOON + i * (IDLE_WINDOW_MS - 1) })
    expect(last).toBe(first)
  })

  it('opens a new one when nobody has touched it for the idle window', () => {
    const first = resolveSessionId(store(), { now: NOON })
    const second = resolveSessionId(store(), { now: NOON + IDLE_WINDOW_MS + 1 })
    expect(second).not.toBe(first)
    expect(second).toMatch(/^sess_[0-9a-f]{12}$/)
  })

  it('does not persist the harness id, so removing the override reopens our own span', () => {
    resolveSessionId(store(), { sessionId: 'claude-abc', now: NOON })
    expect(resolveSessionId(store(), { now: NOON + 1 })).toMatch(/^sess_[0-9a-f]{12}$/)
  })

  // Telemetry never takes a command down: a locked database, a missing table, a corrupt setting.
  it('falls back to a minted id when the store cannot be read', () => {
    const broken = {
      getProjectSetting: () => {
        throw new Error('database is locked')
      },
      setProjectSetting: () => {
        throw new Error('database is locked')
      },
    }
    expect(resolveSessionId(broken, { now: NOON })).toMatch(/^sess_[0-9a-f]{12}$/)
  })

  it('mints a fresh id when the stored setting is not the shape it wrote', () => {
    store().setProjectSetting('session_current', 'not json')
    expect(resolveSessionId(store(), { now: NOON })).toMatch(/^sess_[0-9a-f]{12}$/)
  })
})
