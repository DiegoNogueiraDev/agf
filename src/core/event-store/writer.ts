/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-unified-observability — Task 1.2: EventWriter with buffered batch flush.
 * Best-effort: buffer is in-memory, not durable. Events lost on crash before flush.
 */

import type Database from 'better-sqlite3'
import type { EventRecord } from './schema.js'
import { generateId } from '../utils/id.js'

const FLUSH_INTERVAL_MS = 200
const FLUSH_BATCH_SIZE = 100
const MAX_RETRY = 3

type EmitInput = Omit<EventRecord, 'id'>

export class EventWriter {
  private readonly db: Database.Database
  private buffer: EventRecord[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing = false

  constructor(db: Database.Database) {
    this.db = db
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)
    if (this.timer.unref) this.timer.unref()
  }

  emit(input: EmitInput): void {
    this.buffer.push({ id: generateId('evt'), ...input })
    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      setImmediate(() => void this.flush())
    }
  }

  async forceFlush(): Promise<void> {
    return this.flush()
  }

  async close(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    await this.flush()
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true

    const batch = this.buffer.splice(0, this.buffer.length).sort((a, b) => {
      const sA = a.sessionId ?? ''
      const sB = b.sessionId ?? ''
      if (sA !== sB) return sA.localeCompare(sB)
      return a.timestamp.localeCompare(b.timestamp)
    })

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO events
         (id, kind, subjectRef_kind, subjectRef_id, payload, timestamp, projectId, sessionId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const insertAll = this.db.transaction((rows: EventRecord[]) => {
      for (const row of rows) {
        insert.run(
          row.id,
          row.kind,
          row.subjectRef.kind,
          row.subjectRef.id,
          row.payload !== undefined ? JSON.stringify(row.payload) : null,
          row.timestamp,
          row.projectId ?? null,
          row.sessionId ?? null,
        )
      }
    })

    let attempt = 0
    while (attempt < MAX_RETRY) {
      try {
        insertAll(batch)
        break
      } catch {
        attempt++
        if (attempt < MAX_RETRY) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 10))
        }
      }
    }

    this.flushing = false
  }
}
