import { describe, it, expect } from 'vitest'
import { TensorBufferPool, TENSOR_SEQUENCE_LENGTH } from '../core/rag/tensor-buffer-pool.js'

describe('TENSOR_SEQUENCE_LENGTH', () => {
  it('is 128', () => {
    expect(TENSOR_SEQUENCE_LENGTH).toBe(128)
  })
})

describe('TensorBufferPool', () => {
  it('creates a pool with default size 4', () => {
    const pool = new TensorBufferPool()
    expect(pool.size).toBe(4)
  })

  it('creates a pool with custom size', () => {
    const pool = new TensorBufferPool(2)
    expect(pool.size).toBe(2)
  })

  it('reports correct available count initially', () => {
    const pool = new TensorBufferPool(3)
    expect(pool.available).toBe(3)
  })

  it('acquire returns a slot handle', async () => {
    const pool = new TensorBufferPool(2)
    const handle = await pool.acquire()
    expect(handle).toBeDefined()
    expect(handle.slot).toBeDefined()
    handle.release()
  })

  it('slot has inputIds, attentionMask, tokenTypeIds as BigInt64Array', async () => {
    const pool = new TensorBufferPool(2)
    const handle = await pool.acquire()
    expect(handle.slot.inputIds).toBeInstanceOf(BigInt64Array)
    expect(handle.slot.attentionMask).toBeInstanceOf(BigInt64Array)
    expect(handle.slot.tokenTypeIds).toBeInstanceOf(BigInt64Array)
    handle.release()
  })

  it('arrays have length TENSOR_SEQUENCE_LENGTH', async () => {
    const pool = new TensorBufferPool(1)
    const handle = await pool.acquire()
    expect(handle.slot.inputIds.length).toBe(TENSOR_SEQUENCE_LENGTH)
    handle.release()
  })

  it('release returns slot to pool, available increases', async () => {
    const pool = new TensorBufferPool(1)
    const handle = await pool.acquire()
    const beforeRelease = pool.available
    handle.release()
    expect(pool.available).toBeGreaterThan(beforeRelease)
  })

  it('queues acquire when pool is exhausted', async () => {
    const pool = new TensorBufferPool(1)
    const h1 = await pool.acquire()
    const p2 = pool.acquire()
    setTimeout(() => h1.release(), 10)
    const h2 = await p2
    expect(h2).toBeDefined()
    h2.release()
  })
})
