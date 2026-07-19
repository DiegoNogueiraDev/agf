/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pre-allocated, reusable tensor buffers for ONNX inference.
 * Eliminates per-embedding BigInt64Array allocations that cause GC thrashing
 * when indexing thousands of documents (5K docs ≈ 3 × BigInt64Array(128) each = 15MB churn).
 */

const SEQUENCE_LENGTH = 128

export interface TensorBufferSlot {
  inputIds: BigInt64Array
  attentionMask: BigInt64Array
  tokenTypeIds: BigInt64Array
}

interface SlotHandle {
  slot: TensorBufferSlot
  release: () => void
}

export class TensorBufferPool {
  private readonly _pool: TensorBufferSlot[]
  private _available: TensorBufferSlot[]
  private readonly _waiters: Array<(slot: TensorBufferSlot) => void> = []

  constructor(poolSize: number = 4) {
    this._pool = Array.from({ length: poolSize }, () => ({
      inputIds: new BigInt64Array(SEQUENCE_LENGTH),
      attentionMask: new BigInt64Array(SEQUENCE_LENGTH),
      tokenTypeIds: new BigInt64Array(SEQUENCE_LENGTH),
    }))
    this._available = [...this._pool]
  }

  /** Total pool capacity (fixed at construction). */
  get size(): number {
    return this._pool.length
  }

  /** Number of slots currently available. */
  get available(): number {
    return this._available.length
  }

  /**
   * Acquire a slot from the pool.
   * If all slots are in use, the caller waits until one is released (FIFO queue).
   * Always call `release()` on the returned handle — use try/finally.
   */
  acquire(): Promise<SlotHandle> {
    return new Promise((resolve) => {
      const slot = this._available.pop()
      if (slot !== undefined) {
        resolve({ slot, release: () => this._return(slot) })
      } else {
        this._waiters.push((s) => resolve({ slot: s, release: () => this._return(s) }))
      }
    })
  }

  private _return(slot: TensorBufferSlot): void {
    const waiter = this._waiters.shift()
    if (waiter) {
      waiter(slot)
    } else {
      this._available.push(slot)
    }
  }
}

/** Sequence length constant used by TensorBufferPool buffers. */
export const TENSOR_SEQUENCE_LENGTH = SEQUENCE_LENGTH
