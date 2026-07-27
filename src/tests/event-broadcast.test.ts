import { describe, it, expect, vi } from 'vitest'
import { GraphEventBus } from '../core/events/event-bus.js'
import { createEventBroadcast } from '../core/events/event-broadcast.js'

describe('createEventBroadcast', () => {
  it('fans out a single bus event to every subscriber', () => {
    const bus = new GraphEventBus()
    const broadcast = createEventBroadcast(bus)

    const sub1 = vi.fn()
    const sub2 = vi.fn()
    broadcast.subscribe(sub1)
    broadcast.subscribe(sub2)

    bus.emitTyped('node:updated', { nodeId: 'node_1', fields: ['status'] })

    expect(sub1).toHaveBeenCalledTimes(1)
    expect(sub2).toHaveBeenCalledTimes(1)
    expect(sub1.mock.calls[0][0]).toMatchObject({
      type: 'node:updated',
      payload: { nodeId: 'node_1', fields: ['status'] },
    })
  })

  it('stops delivering to a subscriber after it unsubscribes', () => {
    const bus = new GraphEventBus()
    const broadcast = createEventBroadcast(bus)

    const sub = vi.fn()
    broadcast.subscribe(sub)
    bus.emitTyped('edge:created', { edgeId: 'e1' })
    expect(sub).toHaveBeenCalledTimes(1)

    broadcast.unsubscribe(sub)
    bus.emitTyped('edge:created', { edgeId: 'e2' })
    expect(sub).toHaveBeenCalledTimes(1)
  })
})
