/*!
 * Tests for enriched-context.ts — withOperationTimeout and EnrichedContextTimeoutError.
 *
 * withOperationTimeout(operation, timeoutMs, operationName) wraps any Promise
 * with a real setTimeout-backed race. No DB or LLM dependency.
 *
 * EnrichedContextTimeoutError is a typed custom error class.
 *
 * Covers: error class properties, resolve when operation finishes first,
 * timeout fires when operation never resolves, timeout fires when operation
 * is slow, operationName and timeoutMs in error message.
 */

import { describe, it, expect } from 'vitest'
import { withOperationTimeout, EnrichedContextTimeoutError } from '../core/integrations/enriched-context.js'

// ── EnrichedContextTimeoutError ───────────────────────────────────────────────

describe('EnrichedContextTimeoutError', () => {
  it('has name "EnrichedContextTimeoutError"', () => {
    const err = new EnrichedContextTimeoutError('fetch-context', 5000)
    expect(err.name).toBe('EnrichedContextTimeoutError')
  })

  it('is an instance of Error', () => {
    const err = new EnrichedContextTimeoutError('fetch-context', 5000)
    expect(err).toBeInstanceOf(Error)
  })

  it('includes the operation name in the message', () => {
    const err = new EnrichedContextTimeoutError('build-context', 3000)
    expect(err.message).toContain('build-context')
  })

  it('includes the timeout value in the message', () => {
    const err = new EnrichedContextTimeoutError('build-context', 7500)
    expect(err.message).toContain('7500')
  })

  it('message includes "timed out"', () => {
    const err = new EnrichedContextTimeoutError('op', 1000)
    expect(err.message.toLowerCase()).toContain('timed out')
  })
})

// ── withOperationTimeout — resolves before timeout ────────────────────────────

describe('withOperationTimeout — resolve before timeout', () => {
  it('resolves with the operation result when it completes before timeout', async () => {
    const result = await withOperationTimeout(Promise.resolve('hello'), 5000, 'test-op')
    expect(result).toBe('hello')
  })

  it('resolves with numeric result', async () => {
    const result = await withOperationTimeout(Promise.resolve(42), 5000, 'num-op')
    expect(result).toBe(42)
  })

  it('resolves with object result', async () => {
    const data = { id: 'node_001', title: 'my task' }
    const result = await withOperationTimeout(Promise.resolve(data), 5000, 'obj-op')
    expect(result).toEqual(data)
  })

  it('resolves with undefined result', async () => {
    const result = await withOperationTimeout(Promise.resolve(undefined), 5000, 'void-op')
    expect(result).toBeUndefined()
  })
})

// ── withOperationTimeout — timeout fires ──────────────────────────────────────

describe('withOperationTimeout — timeout fires', () => {
  it('throws EnrichedContextTimeoutError for a never-resolving promise', async () => {
    const neverResolves = new Promise<never>(() => {})
    await expect(withOperationTimeout(neverResolves, 10, 'stuck-op')).rejects.toBeInstanceOf(
      EnrichedContextTimeoutError,
    )
  }, 2000)

  it('error message contains the operation name', async () => {
    const neverResolves = new Promise<never>(() => {})
    await expect(withOperationTimeout(neverResolves, 10, 'my-slow-operation')).rejects.toSatisfy(
      (err: unknown) => err instanceof EnrichedContextTimeoutError && err.message.includes('my-slow-operation'),
    )
  }, 2000)

  it('error message contains the timeout value', async () => {
    const neverResolves = new Promise<never>(() => {})
    await expect(withOperationTimeout(neverResolves, 10, 'op')).rejects.toSatisfy(
      (err: unknown) => err instanceof EnrichedContextTimeoutError && err.message.includes('10'),
    )
  }, 2000)

  it('throws for an operation that takes longer than the timeout', async () => {
    const slowOp = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 200))
    await expect(withOperationTimeout(slowOp, 10, 'slow-op')).rejects.toBeInstanceOf(EnrichedContextTimeoutError)
  }, 2000)
})

// ── withOperationTimeout — propagates rejection ───────────────────────────────

describe('withOperationTimeout — propagates rejection', () => {
  it('propagates rejection from the operation when it rejects before timeout', async () => {
    const failing = Promise.reject(new Error('operation failed'))
    await expect(withOperationTimeout(failing, 5000, 'failing-op')).rejects.toThrow('operation failed')
  })
})
