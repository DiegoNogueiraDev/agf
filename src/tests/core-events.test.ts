/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for src/core/events/ — event bus, event types, SQLite bridge
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GraphEventBus } from '../core/events/event-bus.js'
import { SqliteEventBridge } from '../core/events/sqlite-event-bridge.js'
import type { GraphEvent, GraphEventType } from '../core/events/event-types.js'

describe('GraphEventBus', () => {
  let bus: GraphEventBus

  beforeEach(() => {
    bus = new GraphEventBus()
  })

  afterEach(() => {
    bus.removeAllListeners()
  })

  it('emits and receives typed events', () => {
    const handler = vi.fn()
    bus.on('node:created', handler)
    bus.emit({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 'test', nodeType: 'task' },
    })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].type).toBe('node:created')
  })

  it('emits to wildcard * listener', () => {
    const handler = vi.fn()
    bus.on('*', handler)
    bus.emit({ type: 'node:deleted', timestamp: new Date().toISOString(), payload: { nodeId: 'n1' } })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('throws when emitting event without type', () => {
    expect(() => {
      bus.emit({} as GraphEvent)
    }).toThrow('Cannot emit event without type')
  })

  it('removes specific listener with off()', () => {
    const handler = vi.fn()
    bus.on('edge:created', handler)
    bus.off('edge:created', handler)
    bus.emit({
      type: 'edge:created',
      timestamp: new Date().toISOString(),
      payload: { edgeId: 'e1', from: 'a', to: 'b', relationType: 'depends_on' },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('once() fires only once', () => {
    const handler = vi.fn()
    bus.once('node:updated', handler)
    bus.emit({
      type: 'node:updated',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', fields: ['title'] },
    })
    bus.emit({
      type: 'node:updated',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', fields: ['title'] },
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('removeAllListeners clears all', () => {
    const handler = vi.fn()
    bus.on('node:created', handler)
    bus.on('edge:created', handler)
    bus.removeAllListeners()
    bus.emit({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 't', nodeType: 'task' },
    })
    bus.emit({
      type: 'edge:created',
      timestamp: new Date().toISOString(),
      payload: { edgeId: 'e1', from: 'a', to: 'b', relationType: 'depends_on' },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('listenerCount returns correct count', () => {
    bus.on('node:created', () => {})
    bus.on('node:created', () => {})
    expect(bus.listenerCount('node:created')).toBe(2)
    bus.removeAllListeners()
    expect(bus.listenerCount('node:created')).toBe(0)
  })

  it('listenerCount works for wildcard', () => {
    bus.on('*', () => {})
    expect(bus.listenerCount('*')).toBe(1)
  })

  it('emitTyped creates and emits in one call', () => {
    const handler = vi.fn()
    bus.on('node:created', handler)
    bus.emitTyped('node:created', { nodeId: 'n1', title: 'auto', nodeType: 'task' })
    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0] as GraphEvent
    expect(event.type).toBe('node:created')
    expect(event.payload.nodeId).toBe('n1')
    expect(event.timestamp).toBeDefined()
  })

  it('isolates handler crash — other handlers still run', () => {
    const good = vi.fn()
    const bad = () => {
      throw new Error('crash')
    }
    bus.on('node:created', bad)
    bus.on('node:created', good)
    bus.emit({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 't', nodeType: 'task' },
    })
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('crashing handler is auto-removed', () => {
    const bad = () => {
      throw new Error('crash')
    }
    bus.on('node:created', bad)
    bus.emit({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 't', nodeType: 'task' },
    })
    expect(bus.listenerCount('node:created')).toBe(0)
  })

  it('setMaxListeners does not throw (default 50)', () => {
    for (let i = 0; i < 60; i++) {
      bus.on('node:created', () => {})
    }
    expect(bus.listenerCount('node:created')).toBe(60)
  })
})

describe('SqliteEventBridge', () => {
  let tmpDir: string
  let dbPath: string
  let db: Database.Database
  let bus: GraphEventBus
  let bridge: SqliteEventBridge

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'event-bridge-test-'))
    dbPath = join(tmpDir, 'events.db')
    db = new Database(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    bus = new GraphEventBus()
    bridge = new SqliteEventBridge(db, bus, 'agent-a')
  })

  afterEach(() => {
    bridge.stopPolling()
    bus.removeAllListeners()
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('publishes event to SQLite', () => {
    bridge.publish({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 'test', nodeType: 'task' },
    })
    const row = db.prepare('SELECT * FROM event_queue').get() as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.event_type).toBe('node:created')
  })

  it('pollOnce fetches events from other agents', () => {
    bridge.publish({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 'test', nodeType: 'task' },
    })
    // Insert as if from another agent — pollOnce should skip own events
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'edge:created',
      JSON.stringify({ edgeId: 'e1', from: 'a', to: 'b', relationType: 'depends_on' }),
      'agent-b',
      new Date().toISOString(),
    )

    const handler = vi.fn()
    bus.on('edge:created', handler)
    bridge.pollOnce()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('pollOnce skips own events', () => {
    bridge.publish({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 'test', nodeType: 'task' },
    })
    const handler = vi.fn()
    bus.on('node:created', handler)
    bridge.pollOnce()
    // Own event should be skipped
    expect(handler).not.toHaveBeenCalled()
  })

  it('startPolling and stopPolling manage timer', () => {
    bridge.startPolling(100)
    expect((bridge as unknown as Record<string, unknown>).timer).toBeDefined()
    bridge.stopPolling()
    expect((bridge as unknown as Record<string, unknown>).timer).toBeNull()
  })

  it('startPolling is idempotent', () => {
    bridge.startPolling(100)
    const timer1 = (bridge as unknown as Record<string, unknown>).timer
    bridge.startPolling(200)
    const timer2 = (bridge as unknown as Record<string, unknown>).timer
    expect(timer1).toBe(timer2)
    bridge.stopPolling()
  })

  it('pruneOld removes events older than maxAgeMs', () => {
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      '{}',
      'agent-b',
      new Date(Date.now() - 10_000).toISOString(),
    )
    // Prune with 1ms threshold — row is older, should be removed
    const pruned = bridge.pruneOld(1)
    expect(pruned).toBe(1)
    const remaining = db.prepare('SELECT COUNT(*) as cnt FROM event_queue').get() as { cnt: number }
    expect(remaining.cnt).toBe(0)
  })

  it('pruneOld returns 0 when nothing is old enough', () => {
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      '{}',
      'agent-b',
      new Date().toISOString(),
    )
    const pruned = bridge.pruneOld(86_400_000) // 24h
    expect(pruned).toBe(0)
  })

  it('pruneOld default is 1 hour', () => {
    const result = bridge.pruneOld()
    expect(typeof result).toBe('number')
  })
})
