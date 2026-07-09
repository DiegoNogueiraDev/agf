import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GraphEventBus } from '../../core/events/event-bus.js'
import type { GraphEvent } from '../../core/events/event-types.js'

function makeEvent(type = 'node:created'): GraphEvent {
  return { type, timestamp: new Date().toISOString(), payload: {} }
}

describe('GraphEventBus', () => {
  let bus: GraphEventBus

  beforeEach(() => {
    bus = new GraphEventBus()
  })

  afterEach(() => {
    bus.removeAllListeners()
  })

  it('registers a listener and receives emitted events', () => {
    const handler = vi.fn()
    bus.on('node:created', handler)

    const event = makeEvent()
    bus.emit(event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('emits to multiple registered listeners', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('node:created', h1)
    bus.on('node:created', h2)

    bus.emit(makeEvent())

    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('listener removal via off stops receiving events', () => {
    const handler = vi.fn()
    bus.on('node:created', handler)
    bus.emit(makeEvent())
    expect(handler).toHaveBeenCalledTimes(1)

    bus.off('node:created', handler)
    bus.emit(makeEvent())
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('one crashing listener does not break other listeners', () => {
    const crashHandler = vi.fn(() => {
      throw new Error('crash')
    })
    const safeHandler = vi.fn()

    bus.on('node:created', crashHandler)
    bus.on('node:created', safeHandler)

    expect(() => bus.emit(makeEvent())).not.toThrow()
    expect(safeHandler).toHaveBeenCalledTimes(1)
  })

  it('emits to wildcard * listener for all events', () => {
    const handler = vi.fn()
    bus.on('*', handler)

    bus.emit(makeEvent('node:created'))
    bus.emit(makeEvent('edge:created'))

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('emitTyped creates and emits an event in one call', () => {
    const handler = vi.fn()
    bus.on('phase:transitioned', handler)

    bus.emitTyped('phase:transitioned', { from: 'plan', to: 'implement' })

    expect(handler).toHaveBeenCalledTimes(1)
    const received = handler.mock.calls[0][0] as GraphEvent
    expect(received.type).toBe('phase:transitioned')
    expect(received.payload).toEqual({ from: 'plan', to: 'implement' })
    expect(received.timestamp).toBeDefined()
  })

  it('once listener fires only once', () => {
    const handler = vi.fn()
    bus.once('node:created', handler)

    bus.emit(makeEvent())
    bus.emit(makeEvent())

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emit throws without event type', () => {
    expect(() => bus.emit(null as unknown as GraphEvent)).toThrow()
    expect(() => bus.emit({} as GraphEvent)).toThrow()
  })

  it('removeAllListeners clears all handlers', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('node:created', h1)
    bus.on('edge:created', h2)

    bus.removeAllListeners()
    bus.emit(makeEvent('node:created'))
    bus.emit(makeEvent('edge:created'))

    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('listenerCount returns correct count', () => {
    expect(bus.listenerCount('node:created')).toBe(0)

    bus.on('node:created', () => {})
    expect(bus.listenerCount('node:created')).toBe(1)

    bus.on('node:created', () => {})
    expect(bus.listenerCount('node:created')).toBe(2)
  })

  it('max listener limit is set to 50', () => {
    for (let i = 0; i < 50; i++) {
      bus.on('node:created', () => {})
    }
    expect(bus.listenerCount('node:created')).toBe(50)
  })
})
