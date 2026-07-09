/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HookBus } from '../core/hooks/hook-bus.js'
import { GraphEventBus } from '../core/events/event-bus.js'
import type { HookEvent, HookChannel } from '../core/hooks/hook-types.js'

function makeEvent(channel: HookChannel = 'session:start'): HookEvent {
  return { channel, timestamp: new Date().toISOString(), payload: {} }
}

describe('HookBus', () => {
  let bus: HookBus

  beforeEach(() => {
    bus = new HookBus(new GraphEventBus())
  })

  it('registers a handler on a specific channel', async () => {
    const handler = vi.fn()
    bus.on('session:start', handler)
    await bus.emit(makeEvent('session:start'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ channel: 'session:start' }))
  })

  it('dispatch delivers to correct channel handler only', async () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('session:start', h1)
    bus.on('task:pre-execute', h2)

    await bus.emit(makeEvent('session:start'))
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).not.toHaveBeenCalled()
  })

  it('multiple handlers on same channel all receive the event', async () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('session:start', h1)
    bus.on('session:start', h2)

    await bus.emit(makeEvent('session:start'))
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('handler error does not break other handlers on same channel', async () => {
    const crashHandler = vi.fn().mockRejectedValue(new Error('crash'))
    const safeHandler = vi.fn()

    bus.on('session:start', crashHandler)
    bus.on('session:start', safeHandler)

    await expect(bus.emit(makeEvent('session:start'))).resolves.toBeUndefined()
    expect(safeHandler).toHaveBeenCalledTimes(1)
  })

  it('unregister removes handler via off()', async () => {
    const handler = vi.fn()
    bus.on('session:start', handler)
    bus.off('session:start', handler)

    await bus.emit(makeEvent('session:start'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('off on unknown handler does not throw', () => {
    const handler = vi.fn()
    expect(() => bus.off('session:start', handler)).not.toThrow()
  })

  it('off on unregistered channel does not throw', () => {
    expect(() => bus.off('session:start', vi.fn())).not.toThrow()
  })

  it('emit with no handlers does not throw', async () => {
    await expect(bus.emit(makeEvent('session:start'))).resolves.toBeUndefined()
  })

  it('listenerCount returns handler count per channel', () => {
    expect(bus.listenerCount('session:start')).toBe(0)
    bus.on('session:start', () => {})
    expect(bus.listenerCount('session:start')).toBe(1)
    bus.on('session:start', () => {})
    expect(bus.listenerCount('session:start')).toBe(2)
  })

  it('listenerCount returns 0 for channel with no handlers', () => {
    expect(bus.listenerCount('tool:pre-call')).toBe(0)
  })

  it('bus property exposes underlying GraphEventBus', () => {
    expect(bus.bus).toBeInstanceOf(GraphEventBus)
  })

  it('handler receives the full event payload', async () => {
    const handler = vi.fn()
    bus.on('session:start', handler)

    const event = {
      channel: 'session:start' as HookChannel,
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { hello: 'world', num: 42 },
    }
    await bus.emit(event)
    expect(handler).toHaveBeenCalledWith(event)
  })
})
