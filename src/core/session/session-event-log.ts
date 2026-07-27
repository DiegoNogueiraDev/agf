/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * SessionEventLog — the consumer that closes the `eventos ↑ → SUA APLICAÇÃO`
 * loop from the architecture diagram. Subscribes to the session's upward event
 * channels and keeps a capped, in-memory ring so the application (TUI/Web/API)
 * can read recent events (e.g. via `agf session events`).
 */

import type Database from 'better-sqlite3'
import type { HookBus } from '../hooks/hook-bus.js'
import type { HookChannel, HookEvent } from '../hooks/hook-types.js'
import { appendSessionEvent } from './session-event-store.js'

/** A recorded upward event. */
export interface SessionEventEntry {
  channel: string
  timestamp: string
  payload: Record<string, unknown>
}

/** Channels the log subscribes to (the diagram's three upward events). */
const WATCHED: readonly HookChannel[] = ['session:message-update', 'session:mode-changed', 'approval:required']

/** Default ring capacity. */
const DEFAULT_CAP = 100

export class SessionEventLog {
  private readonly entries: SessionEventEntry[] = []

  constructor(private readonly cap: number = DEFAULT_CAP) {}

  /**
   * Subscribe to the watched channels on the given bus. When `db` is provided,
   * each event is also persisted to the session_events table so the history
   * survives across processes.
   */
  install(bus: HookBus, db?: Database.Database): void {
    for (const channel of WATCHED) {
      bus.on(channel, async (event: HookEvent) => this.record(event, db))
    }
  }

  private record(event: HookEvent, db?: Database.Database): void {
    this.entries.push({ channel: event.channel, timestamp: event.timestamp, payload: event.payload })
    if (this.entries.length > this.cap) this.entries.shift()
    if (db) {
      appendSessionEvent(db, { channel: event.channel, timestamp: event.timestamp, payload: event.payload })
    }
  }

  /** Recorded entries, newest-first. */
  list(): SessionEventEntry[] {
    return [...this.entries].reverse()
  }
}
