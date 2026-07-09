/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { AsyncMutex } from '../core/utils/async-mutex.js'

describe('AsyncMutex', () => {
  it('starts unlocked', () => {
    const m = new AsyncMutex()
    expect(m.isLocked).toBe(false)
  })

  it('acquire + release allows sequential locking', async () => {
    const m = new AsyncMutex()
    const release1 = await m.acquire()
    expect(m.isLocked).toBe(true)
    release1()
    expect(m.isLocked).toBe(false)

    const release2 = await m.acquire()
    expect(m.isLocked).toBe(true)
    release2()
  })

  it('queues waiters when locked and releases in FIFO order', async () => {
    const m = new AsyncMutex()
    const order: number[] = []

    const release1 = await m.acquire()

    const p2 = m.acquire().then((r) => {
      order.push(2)
      r()
    })
    const p3 = m.acquire().then((r) => {
      order.push(3)
      r()
    })

    await new Promise((r) => setImmediate(r))

    release1()
    await p3

    expect(order).toEqual([2, 3])
    expect(m.isLocked).toBe(false)
  })

  it('double-release is idempotent', async () => {
    const m = new AsyncMutex()
    const release = await m.acquire()
    release()
    // Second call should not throw or unlock the wrong thing
    release()
    expect(m.isLocked).toBe(false)
  })

  it('run() executes fn under the lock', async () => {
    const m = new AsyncMutex()
    const result = await m.run(async () => {
      expect(m.isLocked).toBe(true)
      return 42
    })
    expect(result).toBe(42)
    expect(m.isLocked).toBe(false)
  })

  it('run() releases on throw', async () => {
    const m = new AsyncMutex()
    await expect(
      m.run(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(m.isLocked).toBe(false)
  })

  it('run() works with sync fn', async () => {
    const m = new AsyncMutex()
    const result = await m.run(() => 'sync')
    expect(result).toBe('sync')
  })

  it('serializes concurrent run() calls', async () => {
    const m = new AsyncMutex()
    const concurrent: number[] = []

    const p1 = m.run(async () => {
      concurrent.push(1)
      await new Promise((r) => setTimeout(r, 10))
      expect(concurrent).toEqual([1])
      concurrent.push('a')
    })

    const p2 = m.run(async () => {
      concurrent.push(2)
      concurrent.push('b')
    })

    await Promise.all([p1, p2])
    // p1 starts first, p2 can only start after p1 finishes
    expect(concurrent[concurrent.length - 1]).toBe('b')
  })
})
