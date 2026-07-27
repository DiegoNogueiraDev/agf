/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Promise-based mutual exclusion lock for serializing async write sequences.
 * Prevents interleaving of multi-step write operations that span async boundaries.
 * Reads bypass the mutex — only writes need serialization.
 */
export class AsyncMutex {
  private _locked = false
  private _queue: Array<() => void> = []

  /** Returns true when the lock is currently held. */
  get isLocked(): boolean {
    return this._locked
  }

  /**
   * Acquire the lock. Resolves when the lock is granted.
   * Returns a release function — caller MUST call it to free the lock.
   */
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this._locked) {
        this._locked = true
        resolve(() => this._release())
      } else {
        this._queue.push(() => resolve(() => this._release()))
      }
    })
  }

  private _release(): void {
    const next = this._queue.shift()
    if (next) {
      next()
    } else {
      this._locked = false
    }
  }

  /**
   * Run `fn` exclusively under the lock. Automatically acquires and releases.
   * Works with both sync and async functions.
   */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await Promise.resolve(fn())
    } finally {
      release()
    }
  }
}
