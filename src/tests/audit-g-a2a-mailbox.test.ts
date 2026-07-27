/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-060 (MED) + AUDIT-061 (MED).
 * src/core/swarm/a2a-mailbox.ts
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { A2AMailbox } from '../core/swarm/a2a-mailbox.js'

function freshMailbox(capacityPerRecipient?: number): A2AMailbox {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return new A2AMailbox(db, capacityPerRecipient !== undefined ? { capacityPerRecipient } : {})
}

describe('AUDIT-060 — a stuck consumer must not wedge the queue / self-evict new sends', () => {
  it('delivered-but-unacked messages do not block or evict fresh sends', () => {
    const mb = freshMailbox(2)
    // Fill capacity with pending, then deliver them (consumer never acks).
    mb.send({ from: 'a', to: 'b', body: 'm1' })
    mb.send({ from: 'a', to: 'b', body: 'm2' })
    expect(mb.recv('b')?.body).toBe('m1')
    expect(mb.recv('b')?.body).toBe('m2')
    // Both are now 'delivered' (un-acked). A new send must survive, not self-evict.
    const sent = mb.send({ from: 'a', to: 'b', body: 'm3' })
    const pending = mb.pendingFor<string>('b')
    expect(pending.map((m) => m.body)).toContain('m3')
    expect(sent.status).toBe('pending')
  })

  it('regression: ring buffer still evicts oldest pending on pending overflow', () => {
    const mb = freshMailbox(2)
    mb.send({ from: 'a', to: 'b', body: 'oldest' })
    mb.send({ from: 'a', to: 'b', body: 'mid' })
    mb.send({ from: 'a', to: 'b', body: 'newest' })
    expect(mb.pendingFor<string>('b').map((m) => m.body)).toEqual(['mid', 'newest'])
  })
})

describe('AUDIT-061 — recv delivers each pending message exactly once (atomic)', () => {
  it('a single pending message is delivered once; the second recv returns null', () => {
    const mb = freshMailbox()
    const sent = mb.send({ from: 'a', to: 'b', body: { hint: 'x' } })
    const first = mb.recv<{ hint: string }>('b')
    expect(first?.id).toBe(sent.id)
    expect(first?.status).toBe('delivered')
    expect(first?.body.hint).toBe('x')
    expect(first?.deliveredAt).toBeTruthy()
    // Already delivered → not re-delivered.
    expect(mb.recv('b')).toBeNull()
  })

  it('two pending messages are delivered as distinct messages, oldest first', () => {
    const mb = freshMailbox()
    mb.send({ from: 'a', to: 'b', body: 1 })
    mb.send({ from: 'a', to: 'b', body: 2 })
    const a = mb.recv<number>('b')
    const b = mb.recv<number>('b')
    expect(a?.body).toBe(1)
    expect(b?.body).toBe(2)
    expect(a?.id).not.toBe(b?.id)
    expect(mb.recv('b')).toBeNull()
  })
})
