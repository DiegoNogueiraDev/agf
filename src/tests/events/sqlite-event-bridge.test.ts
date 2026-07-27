import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { GraphEventBus } from '../../core/events/event-bus.js'
import { SqliteEventBridge } from '../../core/events/sqlite-event-bridge.js'
import type { GraphEvent } from '../../core/events/event-types.js'

function makeEvent(type = 'node:created'): GraphEvent {
  return { type, timestamp: new Date().toISOString(), payload: { nodeId: 'test' } }
}

describe('SqliteEventBridge', () => {
  let db: Database.Database
  let bus: GraphEventBus
  let bridge: SqliteEventBridge

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE event_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    bus = new GraphEventBus()
    bridge = new SqliteEventBridge(db, bus, 'agent-1')
  })

  afterEach(() => {
    bridge.stopPolling()
    db.close()
  })

  it('publishes event to the queue table', () => {
    bridge.publish(makeEvent())
    const row = db.prepare('SELECT * FROM event_queue').get() as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.event_type).toBe('node:created')
    expect(row.agent_id).toBe('agent-1')
  })

  it('pollOnce reads events from other agents and emits on local bus', () => {
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      JSON.stringify({ nodeId: 'remote' }),
      'agent-2',
      new Date().toISOString(),
    )

    const handler = vi.fn()
    bus.on('node:created', handler)

    bridge.pollOnce()

    expect(handler).toHaveBeenCalledTimes(1)
    const received = handler.mock.calls[0][0] as GraphEvent
    expect(received.payload).toEqual({ nodeId: 'remote' })
  })

  it('does not re-emit events from the same agent', () => {
    bridge.publish(makeEvent())

    const handler = vi.fn()
    bus.on('node:created', handler)

    bridge.pollOnce()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not duplicate already-processed events', () => {
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      '{}',
      'agent-2',
      new Date().toISOString(),
    )

    const handler = vi.fn()
    bus.on('node:created', handler)

    bridge.pollOnce()
    expect(handler).toHaveBeenCalledTimes(1)

    bridge.pollOnce()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('processes multiple events in order', () => {
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      '{}',
      'agent-2',
      new Date().toISOString(),
    )
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'edge:created',
      '{}',
      'agent-2',
      new Date().toISOString(),
    )

    const handler = vi.fn()
    bus.on('*', handler)

    bridge.pollOnce()

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('survives DB errors gracefully during poll', () => {
    bridge.startPolling(50)
    db.close()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => bridge.stopPolling()).not.toThrow()
        resolve()
      }, 150)
    })
  })

  it('pruneOld removes events older than maxAge', () => {
    const past = new Date(Date.now() - 10_000).toISOString()
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      '{}',
      'agent-2',
      past,
    )
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'edge:created',
      '{}',
      'agent-2',
      past,
    )

    const count = bridge.pruneOld(5_000)
    expect(count).toBe(2)

    const remaining = db.prepare('SELECT COUNT(*) as c FROM event_queue').get() as { c: number }
    expect(remaining.c).toBe(0)
  })

  it('startPolling does not start duplicate timers', () => {
    bridge.startPolling(100)
    bridge.startPolling(100)

    bridge.stopPolling()
  })
})
