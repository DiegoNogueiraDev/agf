/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import RealDatabase from 'better-sqlite3'
import type Database from 'better-sqlite3'
import {
  getSharedHookBus,
  setSharedHookBus,
  _resetSharedHookBus,
  _getSharedGraphBus,
  attachBrowserHarnessBridge,
  attachSqliteEventBridge,
} from '../core/hooks/shared-hook-bus.js'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'
import { EventWriter } from '../core/event-store/writer.js'
import { SqliteEventBridge } from '../core/events/sqlite-event-bridge.js'
import type { HookChannel } from '../core/hooks/hook-types.js'
import type { GraphEvent } from '../core/events/event-types.js'

describe('shared-hook-bus', () => {
  beforeEach(() => {
    _resetSharedHookBus()
  })

  afterEach(() => {
    _resetSharedHookBus()
  })

  it('getSharedHookBus returns a HookBus instance', () => {
    const bus = getSharedHookBus()
    expect(bus).toBeInstanceOf(HookBus)
  })

  it('getSharedHookBus returns the same instance on repeated calls', () => {
    const bus1 = getSharedHookBus()
    const bus2 = getSharedHookBus()
    expect(bus1).toBe(bus2)
  })

  it('setSharedHookBus replaces the shared instance', () => {
    const customBus = new HookBus(new GraphEventBus())
    setSharedHookBus(customBus)
    expect(getSharedHookBus()).toBe(customBus)
  })

  it('setSharedHookBus(null) causes getSharedHookBus to create a new instance', () => {
    const first = getSharedHookBus()
    setSharedHookBus(null)
    const second = getSharedHookBus()
    expect(second).toBeInstanceOf(HookBus)
    expect(second).not.toBe(first)
  })

  it('_resetSharedHookBus clears both instance and registered flag', () => {
    const first = getSharedHookBus()
    _resetSharedHookBus()
    const second = getSharedHookBus()
    expect(second).not.toBe(first)
  })

  it('shared bus emits and receives events', async () => {
    const bus = getSharedHookBus()
    const results: string[] = []
    const handler = vi.fn()
    bus.on('session:start', handler)

    await bus.emit({
      channel: 'session:start',
      timestamp: new Date().toISOString(),
      payload: {},
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('multiple getSharedHookBus calls before reset return same bus', () => {
    const a = getSharedHookBus()
    const b = getSharedHookBus()
    const c = getSharedHookBus()
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('setSharedHookBus resets registered flag', () => {
    setSharedHookBus(null)
    const bus = getSharedHookBus()
    expect(bus).toBeInstanceOf(HookBus)
  })
})

describe('graph-event-bridge auto-install from hooks.json (node_wire_1e56aca1f067)', () => {
  let dir: string
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    _resetSharedHookBus()
    dir = mkdtempSync(join(tmpdir(), 'agf-shared-hook-bus-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    _resetSharedHookBus()
    cwdSpy.mockRestore()
    rmSync(dir, { recursive: true, force: true })
  })

  it('fans out a graph event onto its configured hook channel when hooks.json declares graphEventBridge', async () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(
      join(dir, '.mcp-graph', 'hooks.json'),
      JSON.stringify({
        version: 1,
        graphEventBridge: { 'node:created': ['session:start' as HookChannel] },
      }),
    )

    const bus = getSharedHookBus()
    const handler = vi.fn()
    bus.on('session:start', handler)

    const { _getSharedGraphBus } = await import('../core/hooks/shared-hook-bus.js')
    const graphBus = _getSharedGraphBus()
    expect(graphBus).toBeInstanceOf(GraphEventBus)
    graphBus!.emit({
      type: 'node:created',
      timestamp: new Date().toISOString(),
      payload: { nodeId: 'n1', title: 'Test', nodeType: 'task' },
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(handler).toHaveBeenCalledTimes(1)
    const [event] = handler.mock.calls[0]
    expect(event.payload._fromBridge).toBe(true)
    expect(event.payload.graphEventType).toBe('node:created')
  })

  it('does not throw when hooks.json has no graphEventBridge block', () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(join(dir, '.mcp-graph', 'hooks.json'), JSON.stringify({ version: 1 }))

    expect(() => getSharedHookBus()).not.toThrow()
  })

  it('does not throw when no hooks.json exists at all', () => {
    expect(() => getSharedHookBus()).not.toThrow()
  })
})

describe('attachBrowserHarnessBridge (node_wire_43ffee6cf1d8)', () => {
  const fakeDb = {} as unknown as Database.Database

  beforeEach(() => {
    _resetSharedHookBus()
  })

  afterEach(() => {
    _resetSharedHookBus()
  })

  it('returns a cleanup function', () => {
    const cleanup = attachBrowserHarnessBridge(fakeDb)
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('persists browser-harness events emitted on the shared GraphEventBus', () => {
    const emitSpy = vi.spyOn(EventWriter.prototype, 'emit').mockImplementation(() => {})
    try {
      const cleanup = attachBrowserHarnessBridge(fakeDb)
      const graphBus = _getSharedGraphBus()
      expect(graphBus).toBeInstanceOf(GraphEventBus)
      graphBus!.emit({
        type: 'test.started',
        timestamp: new Date().toISOString(),
        payload: { runId: 'run-1' },
      } as unknown as GraphEvent)

      expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'test.started', sessionId: 'run-1' }))
      cleanup()
    } finally {
      emitSpy.mockRestore()
    }
  })

  it('ignores non browser-harness events', () => {
    const emitSpy = vi.spyOn(EventWriter.prototype, 'emit').mockImplementation(() => {})
    try {
      const cleanup = attachBrowserHarnessBridge(fakeDb)
      const graphBus = _getSharedGraphBus()
      graphBus!.emit({
        type: 'node:created',
        timestamp: new Date().toISOString(),
        payload: { nodeId: 'n1', title: 'T', nodeType: 'task' },
      } as unknown as GraphEvent)

      expect(emitSpy).not.toHaveBeenCalled()
      cleanup()
    } finally {
      emitSpy.mockRestore()
    }
  })

  it('stops persisting events after cleanup is called', () => {
    const emitSpy = vi.spyOn(EventWriter.prototype, 'emit').mockImplementation(() => {})
    try {
      const cleanup = attachBrowserHarnessBridge(fakeDb)
      cleanup()
      const graphBus = _getSharedGraphBus()
      graphBus!.emit({
        type: 'test.passed',
        timestamp: new Date().toISOString(),
        payload: { runId: 'run-2' },
      } as unknown as GraphEvent)

      expect(emitSpy).not.toHaveBeenCalled()
    } finally {
      emitSpy.mockRestore()
    }
  })
})

describe('attachSqliteEventBridge (node_wire_59e07e09ada4)', () => {
  let db: Database.Database

  beforeEach(() => {
    _resetSharedHookBus()
    db = new RealDatabase(':memory:')
    db.exec(`
      CREATE TABLE event_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
    _resetSharedHookBus()
  })

  it('returns a SqliteEventBridge bound to the shared GraphEventBus', () => {
    const bridge = attachSqliteEventBridge(db, 'agent-1')
    expect(bridge).toBeInstanceOf(SqliteEventBridge)
    bridge.stopPolling()
  })

  it('pollOnce re-emits events published by other agents onto the shared bus', () => {
    db.prepare('INSERT INTO event_queue (event_type, payload, agent_id, created_at) VALUES (?, ?, ?, ?)').run(
      'node:created',
      JSON.stringify({ nodeId: 'remote' }),
      'agent-2',
      new Date().toISOString(),
    )

    const bridge = attachSqliteEventBridge(db, 'agent-1')
    const graphBus = _getSharedGraphBus()
    expect(graphBus).toBeInstanceOf(GraphEventBus)

    const handler = vi.fn()
    graphBus!.on('node:created', handler)

    bridge.pollOnce()

    expect(handler).toHaveBeenCalledTimes(1)
    const received = handler.mock.calls[0][0] as GraphEvent
    expect(received.payload).toEqual({ nodeId: 'remote' })
    bridge.stopPolling()
  })
})
