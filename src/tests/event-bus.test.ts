import { describe, it, expect, vi } from 'vitest'
import { GraphEventBus } from '../core/events/event-bus.js'
import type { GraphEvent } from '../core/events/event-types.js'

function makeEvent(type: GraphEvent['type'] = 'node:created'): GraphEvent {
  return {
    type,
    payload: { nodeId: 'n1', title: 'Test node' },
    timestamp: new Date().toISOString(),
    source: 'test',
  } as unknown as GraphEvent
}

describe('GraphEventBus', () => {
  it('emits event to registered listener', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.on('node:created', handler)
    const event = makeEvent('node:created')
    bus.emit(event)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('wildcard listener receives all events', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.on('*', handler)
    bus.emit(makeEvent('node:created'))
    bus.emit(makeEvent('node:updated'))
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('on listener fires on every emit', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.on('node:updated', handler)
    bus.emit(makeEvent('node:updated'))
    bus.emit(makeEvent('node:updated'))
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('once listener fires only once', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.once('node:deleted', handler)
    bus.emit(makeEvent('node:deleted'))
    bus.emit(makeEvent('node:deleted'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('off removes a registered listener', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.on('edge:created', handler)
    bus.off('edge:created', handler)
    bus.emit(makeEvent('edge:created'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('removeAllListeners clears all handlers', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.on('node:created', handler)
    bus.on('*', handler)
    bus.removeAllListeners()
    bus.emit(makeEvent('node:created'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('listenerCount returns correct count', () => {
    const bus = new GraphEventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('node:created', h1)
    bus.on('node:created', h2)
    expect(bus.listenerCount('node:created')).toBe(2)
  })

  it('listenerCount is 0 for unregistered type', () => {
    const bus = new GraphEventBus()
    expect(bus.listenerCount('node:deleted')).toBe(0)
  })

  it('throws when emitting event without type', () => {
    const bus = new GraphEventBus()
    expect(() => bus.emit({} as GraphEvent)).toThrow()
  })

  it('does not call listener for different event type', () => {
    const bus = new GraphEventBus()
    const handler = vi.fn()
    bus.on('node:created', handler)
    bus.emit(makeEvent('node:updated'))
    expect(handler).not.toHaveBeenCalled()
  })
})
