/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { HookDedupStore } from '../core/hooks/dedup-store.js'

describe('HookDedupStore', () => {
  let store: HookDedupStore

  beforeEach(() => {
    store = new HookDedupStore(200)
  })

  it('shouldEmit returns true for a new key', () => {
    expect(store.shouldEmit('agent1:file.ts:Bash', 0)).toBe(true)
  })

  it('shouldEmit returns false within the dedup window', () => {
    const key = 'agent1:file.ts:Bash'
    store.recordEmission(key, 100)
    expect(store.shouldEmit(key, 250)).toBe(false)
  })

  it('shouldEmit returns true after the window expires', () => {
    const key = 'agent1:file.ts:Bash'
    store.recordEmission(key, 100)
    expect(store.shouldEmit(key, 400)).toBe(true)
  })

  it('recordEmission records the timestamp', () => {
    const key = 'test-key'
    store.recordEmission(key, 5000)
    expect(store.shouldEmit(key, 5050)).toBe(false)
  })

  it('reset clears all state', () => {
    store.recordEmission('key1', 100)
    store.reset()

    expect(store.shouldEmit('key1', 100)).toBe(true)
  })

  it('prune removes expired entries', () => {
    store.recordEmission('key1', 100)
    store.recordEmission('key2', 100)

    const pruned = store.prune(400)
    expect(pruned).toBe(2)
    expect(store.shouldEmit('key1', 400)).toBe(true)
  })

  it('prune does not remove recent entries', () => {
    store.recordEmission('key1', 100)

    const pruned = store.prune(250)
    expect(pruned).toBe(0)
    expect(store.shouldEmit('key1', 250)).toBe(false)
  })

  it('shouldEmit deletes expired key when accessed', () => {
    store.recordEmission('key1', 100)
    const result = store.shouldEmit('key1', 400)

    expect(result).toBe(true)
  })

  it('treats different keys independently', () => {
    store.recordEmission('key1', 100)
    store.recordEmission('key2', 100)

    expect(store.shouldEmit('key1', 250)).toBe(false)
    expect(store.shouldEmit('key2', 250)).toBe(false)
    expect(store.shouldEmit('key3', 250)).toBe(true)
  })

  it('uses default window of 200ms', () => {
    const defaultStore = new HookDedupStore()
    defaultStore.recordEmission('key', 100)
    expect(defaultStore.shouldEmit('key', 250)).toBe(false)
    expect(defaultStore.shouldEmit('key', 400)).toBe(true)
  })

  it('works with window=1 (effectively immediate re-emit)', () => {
    const smallStore = new HookDedupStore(1)
    smallStore.recordEmission('key', 100)
    expect(smallStore.shouldEmit('key', 100)).toBe(false)
    expect(smallStore.shouldEmit('key', 102)).toBe(true)
  })
})
