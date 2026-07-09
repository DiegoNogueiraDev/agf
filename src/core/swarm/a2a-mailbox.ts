/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * A2A Direct Communication — SQLite-backed agent-to-agent mailbox.
 *
 * Parallel swarm workers hand off context to each other through this courier
 * instead of round-tripping every read through the authoritative graph (the LSTM
 * §3 "parameter server" stays the source of truth; the mailbox is just the
 * fast async channel between workers). Ring buffer per recipient: when capacity
 * is reached, the oldest *pending* message is evicted to make room — delivered
 * messages (possibly mid-handoff) are never dropped.
 *
 * Status flow:  pending → delivered → acked.
 *
 * COURIER ONLY: not authoritative. Real decisions still write to the graph.
 * Ported from graph-flow/core/swarm/a2a-mailbox.ts.
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'
import { generateId } from '../utils/id.js'
import type { QuorumGate } from './quorum-gate.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { estimateTokens } from '../autonomy/token-ledger.js'

export type A2AStatus = 'pending' | 'delivered' | 'acked'

export interface A2AMessage<T = unknown> {
  id: string
  from: string
  to: string
  body: T
  status: A2AStatus
  createdAt: string
  deliveredAt?: string
  ackedAt?: string
}

export interface A2AMailboxOptions {
  /** Max PENDING rows kept per recipient. Oldest pending is evicted on overflow. Default 100. */
  capacityPerRecipient?: number
}

export interface A2ASendInput<T = unknown> {
  from: string
  to: string
  body: T
}

export interface A2ABroadcastInput<T = unknown> {
  from: string
  /** Recipients of the fan-out. */
  to: string[]
  body: T
  /** Topic accumulated by the quorum gate. Default `'default'`. */
  topic?: string
  /** Correlation weight of this finding. Default 1. */
  weight?: number
}

export interface A2ABroadcastResult<T = unknown> {
  /** Messages actually enqueued (empty when suppressed below quorum). */
  sent: A2AMessage<T>[]
  /** True when the gate suppressed the broadcast (quorum not yet reached). */
  suppressed: boolean
  /** A2A tokens avoided by suppressing the premature fan-out. */
  savedTokens: number
}

interface MailboxRow {
  id: string
  from_agent: string
  to_agent: string
  body: string
  status: string
  created_at: string
  delivered_at: string | null
  acked_at: string | null
}

function rowToMessage<T>(row: MailboxRow): A2AMessage<T> {
  return {
    id: row.id,
    from: row.from_agent,
    to: row.to_agent,
    body: JSON.parse(row.body) as T,
    status: row.status as A2AStatus,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
    ackedAt: row.acked_at ?? undefined,
  }
}

export class A2AMailbox {
  private db: Database.Database
  private capacity: number

  constructor(db: Database.Database, opts: A2AMailboxOptions = {}) {
    this.db = db
    this.capacity = opts.capacityPerRecipient ?? 100
  }

  /** Enqueue a message for `to`. Returns the created (pending) message. */
  send<T = unknown>(input: A2ASendInput<T>): A2AMessage<T> {
    const id = generateId('a2a')
    const createdAt = now()
    this.db
      .prepare(
        `INSERT INTO a2a_mailbox (id, from_agent, to_agent, body, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .run(id, input.from, input.to, JSON.stringify(input.body), createdAt)

    this.evictIfOverCapacity(input.to)

    return { id, from: input.from, to: input.to, body: input.body, status: 'pending', createdAt }
  }

  /**
   * Fan-out a finding to many recipients, optionally gated by a {@link QuorumGate}
   * (opt-in `quorum_gate` lever). With a gate, the broadcast is **suppressed** until
   * a quorum of correlated findings accumulates for `topic` — saving the per-recipient
   * A2A tokens of every premature fan-out (bacterial quorum sensing). Without a gate,
   * it always sends (legacy behaviour). A suppressed broadcast records a `quorum_gate`
   * lever event with the avoided tokens.
   */
  broadcast<T = unknown>(input: A2ABroadcastInput<T>, gate?: QuorumGate): A2ABroadcastResult<T> {
    if (gate) {
      const fired = gate.accumulate(input.topic ?? 'default', input.weight ?? 1)
      if (!fired) {
        const savedTokens = estimateTokens(JSON.stringify(input.body)) * input.to.length
        try {
          recordLeverEvent(this.db, {
            sessionId: `a2a-${Date.now()}`,
            lever: 'quorum_gate',
            tokensBefore: savedTokens,
            tokensAfter: 0,
            saved: savedTokens,
            accepted: false,
            gateOutcome: 'reverted',
          })
        } catch {
          // telemetry never breaks the broadcast
        }
        return { sent: [], suppressed: true, savedTokens }
      }
    }
    const sent = input.to.map((to) => this.send<T>({ from: input.from, to, body: input.body }))
    return { sent, suppressed: false, savedTokens: 0 }
  }

  /** All pending messages for a recipient, oldest first. Non-mutating. */
  pendingFor<T = unknown>(toAgent: string): A2AMessage<T>[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM a2a_mailbox
         WHERE to_agent = ? AND status = 'pending'
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(toAgent) as MailboxRow[]
    return rows.map(rowToMessage<T>)
  }

  /** Deliver the oldest pending message (pending → delivered), or null if none. */
  recv<T = unknown>(toAgent: string): A2AMessage<T> | null {
    const row = this.db
      .prepare(
        `SELECT * FROM a2a_mailbox
         WHERE to_agent = ? AND status = 'pending'
         ORDER BY created_at ASC, rowid ASC
         LIMIT 1`,
      )
      .get(toAgent) as MailboxRow | undefined
    if (!row) return null

    const deliveredAt = now()
    // AUDIT-061: claim atomically — a single guarded UPDATE...RETURNING (the
    // `AND status = 'pending'` guard) stops two connections from delivering the
    // same message twice. Falls back to null if another claimer won the race.
    const claimed = this.db
      .prepare(`UPDATE a2a_mailbox SET status = 'delivered', delivered_at = ? WHERE id = ? AND status = 'pending'`)
      .run(deliveredAt, row.id)
    if (claimed.changes === 0) return this.recv<T>(toAgent)
    return rowToMessage<T>({ ...row, status: 'delivered', delivered_at: deliveredAt })
  }

  /** Acknowledge a message by id (→ acked). Returns null if the id is unknown. */
  ack<T = unknown>(messageId: string): A2AMessage<T> | null {
    const ackedAt = now()
    const result = this.db
      .prepare(`UPDATE a2a_mailbox SET status = 'acked', acked_at = ? WHERE id = ?`)
      .run(ackedAt, messageId)
    if (result.changes === 0) return null
    const row = this.db.prepare(`SELECT * FROM a2a_mailbox WHERE id = ?`).get(messageId) as MailboxRow | undefined
    return row ? rowToMessage<T>(row) : null
  }

  /** Total messages across all recipients and statuses. */
  totalCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM a2a_mailbox`).get() as { n: number }
    return row.n
  }

  private evictIfOverCapacity(toAgent: string): void {
    // AUDIT-060: cap on PENDING only. Counting delivered-but-unacked toward the
    // cap let a stuck consumer wedge the queue — a fresh send would overflow and
    // self-evict (the just-inserted pending row) while stale delivered rows
    // persisted forever. Delivered rows no longer count toward capacity.
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM a2a_mailbox
         WHERE to_agent = ? AND status = 'pending'`,
      )
      .get(toAgent) as { n: number }
    const overflow = row.n - this.capacity
    if (overflow <= 0) return

    // Evict oldest pending first; never drop delivered (they may be mid-handoff).
    this.db
      .prepare(
        `DELETE FROM a2a_mailbox
         WHERE id IN (
           SELECT id FROM a2a_mailbox
           WHERE to_agent = ? AND status = 'pending'
           ORDER BY created_at ASC, rowid ASC
           LIMIT ?
         )`,
      )
      .run(toAgent, overflow)
  }
}
