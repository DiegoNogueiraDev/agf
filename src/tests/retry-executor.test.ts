/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { withRetry } from '../core/utils/retry-executor.js'
import { getErrorPattern } from '../core/utils/error-recorder.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('withRetry', () => {
  it('resolves when fn succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { maxAttempts: 3 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable errors and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('recovered')

    const result = await withRetry(fn, { maxAttempts: 5 })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('timeout')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('validation failed'))

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('validation failed')
    // Should fail on first attempt since 'validation' is non-retryable
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry auth errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 unauthorized'))

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('401 unauthorized')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('honors custom retryableCategories', async () => {
    // Only 'rate_limit' is retryable in this config
    const fn = vi.fn().mockRejectedValueOnce(new Error('rate limit hit')).mockResolvedValue('ok')

    const result = await withRetry(fn, {
      maxAttempts: 3,
      retryableCategories: new Set(['rate_limit']),
    })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry errors outside custom retryableCategories', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        retryableCategories: new Set(['rate_limit']),
      }),
    ).rejects.toThrow('timeout')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry callback on each retry', async () => {
    const onRetry = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('ok')

    await withRetry(fn, { maxAttempts: 5, onRetry })

    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 0, expect.any(Error), expect.objectContaining({ category: 'timeout' }))
    expect(onRetry).toHaveBeenNthCalledWith(2, 1, expect.any(Error), expect.objectContaining({ category: 'network' }))
  })

  it('wraps non-Error throws in Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error')

    await expect(withRetry(fn, { maxAttempts: 2 })).rejects.toThrow('string error')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses baseBackoffMs and maxBackoffMs for delay', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok')

    // We can't easily assert exact delay, but verify it doesn't hang
    const result = await withRetry(fn, { maxAttempts: 3, baseBackoffMs: 5, maxBackoffMs: 50 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('single attempt (maxAttempts=1) is just a try-catch', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('withRetry — error-recorder wiring (node_a9a98f3725b7)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE error_patterns (
        id TEXT PRIMARY KEY,
        error_hash TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL,
        message TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('persists a recurring error pattern with count = number of failed attempts', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('ok')

    await withRetry(fn, { maxAttempts: 3, db })

    const [{ error_hash: hash }] = db.prepare('SELECT error_hash FROM error_patterns').all() as {
      error_hash: string
    }[]
    expect(getErrorPattern(db, hash)?.count).toBe(1)
  })

  it('accumulates count across multiple failed attempts before success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok')

    await withRetry(fn, { maxAttempts: 5, db })

    const [{ error_hash: hash }] = db.prepare('SELECT error_hash FROM error_patterns').all() as {
      error_hash: string
    }[]
    expect(getErrorPattern(db, hash)?.count).toBe(2)
  })

  it('is fully backward compatible when db is omitted', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('ok')
    await expect(withRetry(fn, { maxAttempts: 3 })).resolves.toBe('ok')
  })

  it('never lets a broken db recording mask the real retry/throw flow', async () => {
    const brokenDb = new Database(':memory:') // no error_patterns table
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))

    await expect(withRetry(fn, { maxAttempts: 2, db: brokenDb })).rejects.toThrow('timeout')
    expect(fn).toHaveBeenCalledTimes(2)
    brokenDb.close()
  })
})
