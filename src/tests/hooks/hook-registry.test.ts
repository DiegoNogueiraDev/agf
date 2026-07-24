import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { HookRegistry } from '../../core/hooks/hook-registry.js'
import { HookStatsStore } from '../../core/hooks/hook-stats-store.js'
import { HookTimeoutError, HookCircuitOpenError } from '../../core/hooks/hook-types.js'
import type { HookEvent, HookChannel, HookRegistration } from '../../core/hooks/hook-types.js'

function makeEvent(channel: HookChannel = 'session:start'): HookEvent {
  return { channel, timestamp: new Date().toISOString(), payload: {} }
}

function makeReg(id: string, channel: HookChannel = 'session:start', priority = 0): HookRegistration {
  return { id, channel, handler: vi.fn(), priority }
}

describe('HookRegistry', () => {
  let registry: HookRegistry
  let db: Database.Database
  let statsStore: HookStatsStore

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE hook_handler_stats (
        handler_id TEXT PRIMARY KEY,
        call_count INTEGER NOT NULL DEFAULT 0,
        p50_duration REAL,
        p95_duration REAL,
        last_error TEXT,
        circuit_state TEXT NOT NULL DEFAULT 'closed',
        updated_at TEXT NOT NULL
      )
    `)
    statsStore = new HookStatsStore(db)
    registry = new HookRegistry({ statsStore, timeoutMs: 200, windowMs: 1000, maxFailures: 3 })
  })

  afterEach(() => {
    db.close()
  })

  it('register adds a handler and dispatch runs it', async () => {
    const handler = vi.fn()
    registry.register({ id: 'test-1', channel: 'session:start', handler })
    await registry.dispatch(makeEvent('session:start'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('unregister removes the handler', async () => {
    const handler = vi.fn()
    registry.register({ id: 'test-1', channel: 'session:start', handler })
    registry.unregister('test-1')
    await registry.dispatch(makeEvent('session:start'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('list returns registered handler IDs', () => {
    registry.register(makeReg('a'))
    registry.register(makeReg('b'))
    expect(registry.list()).toEqual(['a', 'b'])
  })

  it('handlers execute in priority order', async () => {
    const calls: number[] = []
    registry.register({
      id: 'p2',
      channel: 'session:start',
      handler: vi.fn().mockImplementation(() => calls.push(2)),
      priority: 10,
    })
    registry.register({
      id: 'p1',
      channel: 'session:start',
      handler: vi.fn().mockImplementation(() => calls.push(1)),
      priority: 5,
    })

    await registry.dispatch(makeEvent('session:start'))
    expect(calls).toEqual([1, 2])
  })

  it('circuit breaker opens after maxFailures', async () => {
    registry = new HookRegistry({ timeoutMs: 50, windowMs: 1000, maxFailures: 2 })
    const slowHandler = () => new Promise<void>((_, rej) => setTimeout(() => rej(new Error('fail')), 100))
    registry.register({ id: 'slow', channel: 'session:start', handler: slowHandler })

    for (let i = 0; i < 3; i++) {
      try {
        await registry.dispatch(makeEvent('session:start'))
      } catch {
        /* expected */
      }
    }

    await expect(registry.dispatch(makeEvent('session:start'))).rejects.toThrow(HookCircuitOpenError)
  })

  it('circuit breaker resets after windowMs', async () => {
    registry = new HookRegistry({ timeoutMs: 50, windowMs: 200, maxFailures: 2 })
    const fastHandler = vi.fn()
    const slowHandler = () => new Promise<void>((_, rej) => setTimeout(() => rej(new Error('fail')), 100))
    registry.register({ id: 'fast', channel: 'session:start', handler: fastHandler, priority: 0 })
    registry.register({ id: 'slow', channel: 'session:start', handler: slowHandler, priority: 1 })

    for (let i = 0; i < 3; i++) {
      try {
        await registry.dispatch(makeEvent('session:start'))
      } catch {
        /* expected */
      }
    }
    await expect(registry.dispatch(makeEvent('session:start'))).rejects.toThrow(HookCircuitOpenError)

    await new Promise((r) => setTimeout(r, 250))
    registry.unregister('slow')
    await registry.dispatch(makeEvent('session:start'))
    expect(fastHandler).toHaveBeenCalled()
  })

  it('timeout fires HookTimeoutError', async () => {
    const slowHandler = () => new Promise<void>((r) => setTimeout(r, 1000))
    registry.register({ id: 'slow', channel: 'session:start', handler: slowHandler })

    await expect(registry.dispatch(makeEvent('session:start'))).rejects.toThrow(HookTimeoutError)
  })

  it('stats store records p50/p95 durations', async () => {
    const fastHandler = vi.fn().mockResolvedValue(undefined)
    registry.register({ id: 'fast', channel: 'session:start', handler: fastHandler })

    await registry.dispatch(makeEvent('session:start'))
    await registry.dispatch(makeEvent('session:start'))

    const stats = statsStore.get('fast')
    expect(stats).toBeDefined()
    expect(stats!.callCount).toBe(2)
    expect(stats!.p50Duration).toBeGreaterThanOrEqual(0)
    expect(stats!.p95Duration).toBeGreaterThanOrEqual(0)
  })
})
