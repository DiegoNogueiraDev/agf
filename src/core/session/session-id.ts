/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Which sitting of work a ledger row belongs to.
 *
 * `session_id` held the string `'cli'` on all 201 rows of the lever ledger and NULL on all 17,645
 * rows of the command ledger. A column that never varies is not an identifier; it is a comment.
 * `agf savings` could name the task that earned the tokens — `node_id` sees to that — and could
 * not answer what this sitting earned, which is the question an agent asks when it finishes.
 *
 * WHY not the process: every `agf` invocation is its own process. Seventeen thousand sessions is
 * arithmetically the same as one, and neither answers the question.
 *
 * WHY a persisted span with an idle window: a session is a stretch of work, and work has gaps —
 * a test run, a thought, a coffee. The span stays open while anything touches it and closes when
 * nothing has for thirty minutes. It lives in `project_settings`, so it needs no migration, no
 * daemon, and no clock beyond the one the caller passes.
 *
 * WHY the harness wins: Claude Code, Copilot and the rest already know what a session is. When one
 * sets `AGF_SESSION_ID` we use it and do not persist it — removing the override must reopen our own
 * span rather than adopt somebody else's id forever.
 *
 * Contract: never throws. Telemetry does not take a command down, so a locked database yields a
 * minted id and the row is still written.
 */

import { randomUUID } from 'node:crypto'

/** Nothing touched the session for this long → the next call opens a new one. */
export const IDLE_WINDOW_MS = 30 * 60 * 1000

const SETTING_KEY = 'session_current'

/** The two calls this module makes on a store. Injected so the span is testable without SQLite. */
export interface SessionSettingStore {
  getProjectSetting(key: string): string | null
  setProjectSetting(key: string, value: string): void
}

export interface ResolveOptions {
  /** `AGF_SESSION_ID` — the harness naming the session it already tracks. */
  sessionId?: string
  /** Injected clock: the span is a function of time and nothing else. */
  now: number
}

interface StoredSpan {
  id: string
  lastSeen: number
}

/** `sess_` and twelve hex characters: short enough to read in a ledger, long enough not to collide. */
function mint(): string {
  return `sess_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

/** The stored span, or null when there is none, or when what is stored is not one. */
function readSpan(store: SessionSettingStore): StoredSpan | null {
  const raw = store.getProjectSetting(SETTING_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSpan>
    if (typeof parsed.id !== 'string' || typeof parsed.lastSeen !== 'number') return null
    return { id: parsed.id, lastSeen: parsed.lastSeen }
  } catch {
    return null
  }
}

/**
 * The session this invocation belongs to: the harness's, or the open span, or a new one.
 *
 * Touching is the point — the window closes on the last call, not the first, so an hour of steady
 * work is one session and a return after lunch is another.
 */
export function resolveSessionId(store: SessionSettingStore, opts: ResolveOptions): string {
  const override = opts.sessionId?.trim()
  if (override) return override

  try {
    const span = readSpan(store)
    const id = span && opts.now - span.lastSeen <= IDLE_WINDOW_MS ? span.id : mint()
    store.setProjectSetting(SETTING_KEY, JSON.stringify({ id, lastSeen: opts.now }))
    return id
  } catch {
    // A locked database, a missing table, a migration mid-flight. The row still gets an id.
    return mint()
  }
}
