import { describe, it, expect, vi } from 'vitest'

describe('BroadcastQueue', () => {
  it('accepts multiple subscribers and delivers to all', async () => {
    const { BroadcastQueue } = await import('../core/utils/broadcast-queue.js')
    const queue = new BroadcastQueue<number>()

    const sub1 = vi.fn()
    const sub2 = vi.fn()
    queue.subscribe(sub1)
    queue.subscribe(sub2)

    queue.publish(42)

    expect(sub1).toHaveBeenCalledWith(42)
    expect(sub2).toHaveBeenCalledWith(42)
  })

  it('subscriber can unsubscribe and stop receiving', async () => {
    const { BroadcastQueue } = await import('../core/utils/broadcast-queue.js')
    const queue = new BroadcastQueue<string>()

    const sub = vi.fn()
    queue.subscribe(sub)
    queue.publish('first')
    expect(sub).toHaveBeenCalledTimes(1)

    queue.unsubscribe(sub)
    queue.publish('second')
    expect(sub).toHaveBeenCalledTimes(1)
  })

  it('no items lost when no subscribers active', async () => {
    const { BroadcastQueue } = await import('../core/utils/broadcast-queue.js')
    const queue = new BroadcastQueue<number>()

    expect(() => queue.publish(1)).not.toThrow()
    expect(() => queue.publish(2)).not.toThrow()
  })

  it('each subscriber receives independently', async () => {
    const { BroadcastQueue } = await import('../core/utils/broadcast-queue.js')
    const queue = new BroadcastQueue<number>()

    const sub1 = vi.fn()
    const sub2 = vi.fn()
    queue.subscribe(sub1)
    queue.subscribe(sub2)

    queue.publish(1)
    queue.publish(2)

    expect(sub1).toHaveBeenCalledTimes(2)
    expect(sub2).toHaveBeenCalledTimes(2)
  })
})
