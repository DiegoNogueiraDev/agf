/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { Semaphore, QueueTimeoutError, getMaxConcurrentHeavy } from '../core/utils/semaphore.js'

describe('Semaphore', () => {
  it('throws on invalid max', () => {
    expect(() => new Semaphore({ max: 0 })).toThrow()
    expect(() => new Semaphore({ max: -1 })).toThrow()
    expect(() => new Semaphore({ max: 1.5 })).toThrow()
  })

  it('acquire returns immediately when slot available', async () => {
    const s = new Semaphore({ max: 2 })
    const release = await s.acquire()
    expect(s.getStats().active).toBe(1)
    release()
    expect(s.getStats().active).toBe(0)
  })

  it('queues waiters when at capacity', async () => {
    const s = new Semaphore({ max: 1 })
    const r1 = await s.acquire()
    expect(s.getStats().active).toBe(1)
    expect(s.getStats().queued).toBe(0)

    const p2 = s.acquire()
    expect(s.getStats().queued).toBe(1)

    r1()
    const r2 = await p2
    expect(s.getStats().active).toBe(1)
    expect(s.getStats().queued).toBe(0)
    r2()
  })

  it('FIFO ordering of waiters', async () => {
    const s = new Semaphore({ max: 1 })
    const order: number[] = []

    const r1 = await s.acquire()
    const p2 = s.acquire().then((r) => {
      order.push(2)
      r()
    })
    const p3 = s.acquire().then((r) => {
      order.push(3)
      r()
    })

    r1()
    await p3

    expect(order).toEqual([2, 3])
  })

  it('throws QueueTimeoutError when timeout elapses', async () => {
    const s = new Semaphore({ max: 1, defaultTimeoutMs: 50 })
    const r1 = await s.acquire()
    await expect(s.acquire(20)).rejects.toThrow(QueueTimeoutError)
    r1()
  })

  it('uses defaultTimeoutMs when no per-call timeout given', async () => {
    const s = new Semaphore({ max: 1, defaultTimeoutMs: 30 })
    const r1 = await s.acquire()
    await expect(s.acquire()).rejects.toThrow(QueueTimeoutError)
    r1()
  })

  it('wrap() runs fn under semaphore', async () => {
    const s = new Semaphore({ max: 1 })
    const result = await s.wrap(async () => {
      expect(s.getStats().active).toBe(1)
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(s.getStats().active).toBe(0)
  })

  it('wrap() releases on exception', async () => {
    const s = new Semaphore({ max: 1 })
    await expect(
      s.wrap(async () => {
        throw new Error('fail')
      }),
    ).rejects.toThrow('fail')
    expect(s.getStats().active).toBe(0)
  })

  it('release is idempotent', async () => {
    const s = new Semaphore({ max: 1 })
    const release = await s.acquire()
    release()
    release() // second call should be no-op
    expect(s.getStats().active).toBe(0)

    // Next waiter should still work
    const r2 = await s.acquire()
    expect(s.getStats().active).toBe(1)
    r2()
  })

  it('getStats returns correct snapshot', async () => {
    const s = new Semaphore({ max: 3 })
    expect(s.getStats()).toEqual({ active: 0, queued: 0, max: 3 })

    const r1 = await s.acquire()
    expect(s.getStats().active).toBe(1)

    const r2 = await s.acquire()
    expect(s.getStats().active).toBe(2)

    r1()
    expect(s.getStats().active).toBe(1)
    r2()
    expect(s.getStats().active).toBe(0)
  })

  describe('getMaxConcurrentHeavy', () => {
    it('defaults to 2', () => {
      expect(getMaxConcurrentHeavy({})).toBe(2)
    })

    it('reads from env', () => {
      expect(getMaxConcurrentHeavy({ MAX_CONCURRENT_HEAVY: '5' })).toBe(5)
    })

    it('falls back to 2 for invalid values', () => {
      expect(getMaxConcurrentHeavy({ MAX_CONCURRENT_HEAVY: 'abc' })).toBe(2)
      expect(getMaxConcurrentHeavy({ MAX_CONCURRENT_HEAVY: '0' })).toBe(2)
    })
  })
})
