/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_2b30344d0d0d — A2AMailbox: async agent-to-agent courier over the shared
 * graph DB. Lets parallel swarm workers hand off context without round-tripping
 * through the authoritative graph on every read (LSTM §3: workers exchange
 * updates directly; the parameter server stays the source of truth).
 * Ported from graph-flow/core/swarm/a2a-mailbox.ts.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { A2AMailbox } from '../core/swarm/a2a-mailbox.js'
import { QuorumGate } from '../core/swarm/quorum-gate.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'

function freshMailbox(capacityPerRecipient?: number): A2AMailbox {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return new A2AMailbox(db, capacityPerRecipient !== undefined ? { capacityPerRecipient } : {})
}

describe('A2AMailbox — async courier (#node_2b30344d0d0d)', () => {
  it('send → pendingFor surfaces the message as pending with the parsed body', () => {
    const mb = freshMailbox()
    const sent = mb.send({ from: 'a', to: 'b', body: { hint: 'reuse cache' } })
    expect(sent.status).toBe('pending')
    const pending = mb.pendingFor<{ hint: string }>('b')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.body.hint).toBe('reuse cache')
    expect(pending[0]?.from).toBe('a')
  })

  it('recv delivers the oldest pending and flips status to delivered', () => {
    const mb = freshMailbox()
    mb.send({ from: 'a', to: 'b', body: 1 })
    mb.send({ from: 'a', to: 'b', body: 2 })
    const first = mb.recv<number>('b')
    expect(first?.body).toBe(1)
    expect(first?.status).toBe('delivered')
    expect(first?.deliveredAt).toBeTruthy()
    // it is no longer pending
    expect(mb.pendingFor('b')).toHaveLength(1)
  })

  it('recv on an empty mailbox returns null', () => {
    expect(freshMailbox().recv('nobody')).toBeNull()
  })

  it('ack marks a message acked; ack of an unknown id returns null', () => {
    const mb = freshMailbox()
    const sent = mb.send({ from: 'a', to: 'b', body: 'x' })
    const acked = mb.ack(sent.id)
    expect(acked?.status).toBe('acked')
    expect(acked?.ackedAt).toBeTruthy()
    expect(mb.ack('ghost')).toBeNull()
  })

  it('messages are isolated per recipient', () => {
    const mb = freshMailbox()
    mb.send({ from: 'a', to: 'b', body: 1 })
    mb.send({ from: 'a', to: 'c', body: 2 })
    expect(mb.pendingFor('b')).toHaveLength(1)
    expect(mb.pendingFor('c')).toHaveLength(1)
  })

  it('evicts the oldest pending when a recipient exceeds capacity (ring buffer)', () => {
    const mb = freshMailbox(2)
    mb.send({ from: 'a', to: 'b', body: 'oldest' })
    mb.send({ from: 'a', to: 'b', body: 'mid' })
    mb.send({ from: 'a', to: 'b', body: 'newest' }) // overflow → drop "oldest"
    const bodies = mb.pendingFor<string>('b').map((m) => m.body)
    expect(bodies).toEqual(['mid', 'newest'])
  })
})

describe('A2AMailbox.broadcast — quorum_gate lever (opt-in)', () => {
  function freshDb(): Database.Database {
    const db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
    return db
  }

  it('without a gate, fans out to every recipient (legacy behaviour)', () => {
    const db = freshDb()
    const mb = new A2AMailbox(db)
    const result = mb.broadcast({ from: 'lead', to: ['w1', 'w2', 'w3'], body: { finding: 'leak' } })
    expect(result.suppressed).toBe(false)
    expect(result.sent.length).toBe(3)
    expect(mb.pendingFor('w1').length).toBe(1)
    db.close()
  })

  it('with a gate, suppresses below quorum and records a quorum_gate saving', () => {
    const db = freshDb()
    const mb = new A2AMailbox(db)
    const gate = new QuorumGate({ quorum: 3 })

    const first = mb.broadcast({ from: 'lead', to: ['w1', 'w2'], topic: 'leak', body: { finding: 'maybe-leak' } }, gate)
    expect(first.suppressed).toBe(true)
    expect(first.sent.length).toBe(0)
    expect(first.savedTokens).toBeGreaterThan(0)
    expect(mb.pendingFor('w1').length).toBe(0) // nothing sent yet

    const saved = summarizeByLever(db).find((s) => s.lever === 'quorum_gate')
    expect(saved?.totalSaved).toBeGreaterThan(0)
    db.close()
  })

  it('fires the broadcast once the quorum of correlated findings accumulates', () => {
    const db = freshDb()
    const mb = new A2AMailbox(db)
    const gate = new QuorumGate({ quorum: 2 })

    const r1 = mb.broadcast({ from: 'lead', to: ['w1'], topic: 'leak', body: 1 }, gate)
    expect(r1.suppressed).toBe(true)
    const r2 = mb.broadcast({ from: 'lead', to: ['w1', 'w2'], topic: 'leak', body: 2 }, gate)
    expect(r2.suppressed).toBe(false)
    expect(r2.sent.length).toBe(2)
    db.close()
  })
})
