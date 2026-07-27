/*!
 * Tests for code analyzer availability and reset utilities.
 *
 * ts-analyzer.ts:
 *   resetTypeScriptLoader() — clears tsModule + loadAttempted (module-level state)
 *   isTypeScriptAvailable() — async: returns true when typescript is installed
 *
 * treesitter/treesitter-manager.ts:
 *   resetTreeSitterLoader() — clears tsModule + initAttempted (module-level state)
 *   isTreeSitterAvailable() — async: returns boolean (true if web-tree-sitter WASM loads)
 *
 * Both loaders cache their result in module-level variables. Reset functions
 * let tests drive fresh load attempts. No FS writes, no DB.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetTypeScriptLoader, isTypeScriptAvailable } from '../core/code/ts-analyzer.js'
import { resetTreeSitterLoader, isTreeSitterAvailable } from '../core/code/treesitter/treesitter-manager.js'

// ── resetTypeScriptLoader ─────────────────────────────────────────────────────

describe('resetTypeScriptLoader', () => {
  it('does not throw when called once', () => {
    expect(() => resetTypeScriptLoader()).not.toThrow()
  })

  it('can be called multiple times in succession without throwing', () => {
    resetTypeScriptLoader()
    resetTypeScriptLoader()
    expect(() => resetTypeScriptLoader()).not.toThrow()
  })

  it('allows isTypeScriptAvailable to re-load after reset', async () => {
    await isTypeScriptAvailable() // populate cache
    resetTypeScriptLoader() // clear
    const result = await isTypeScriptAvailable() // fresh load
    expect(result).toBe(true)
  })
})

// ── isTypeScriptAvailable ─────────────────────────────────────────────────────

describe('isTypeScriptAvailable', () => {
  beforeEach(() => resetTypeScriptLoader())

  it('returns true because typescript is installed in this project', async () => {
    expect(await isTypeScriptAvailable()).toBe(true)
  })

  it('returns a boolean', async () => {
    const result = await isTypeScriptAvailable()
    expect(typeof result).toBe('boolean')
  })

  it('result is not null or undefined', async () => {
    const result = await isTypeScriptAvailable()
    expect(result).not.toBeNull()
    expect(result).not.toBeUndefined()
  })

  it('returns Promise that resolves', async () => {
    const p = isTypeScriptAvailable()
    expect(p).toBeInstanceOf(Promise)
    expect(await p).toBe(true)
  })

  it('returns consistent value on repeated calls (caches result)', async () => {
    const r1 = await isTypeScriptAvailable()
    const r2 = await isTypeScriptAvailable()
    expect(r1).toBe(r2)
  })

  it('returns true after multiple resets followed by a fresh call', async () => {
    resetTypeScriptLoader()
    resetTypeScriptLoader()
    expect(await isTypeScriptAvailable()).toBe(true)
  })
})

// ── resetTreeSitterLoader ─────────────────────────────────────────────────────

describe('resetTreeSitterLoader', () => {
  it('does not throw when called once', () => {
    expect(() => resetTreeSitterLoader()).not.toThrow()
  })

  it('can be called multiple times in succession without throwing', () => {
    resetTreeSitterLoader()
    resetTreeSitterLoader()
    expect(() => resetTreeSitterLoader()).not.toThrow()
  })

  it('allows isTreeSitterAvailable to re-load after reset', async () => {
    const before = await isTreeSitterAvailable() // populate cache
    resetTreeSitterLoader() // clear
    const after = await isTreeSitterAvailable() // fresh load attempt
    expect(typeof after).toBe('boolean')
    expect(after).toBe(before) // same package availability → same result
  })
})

// ── isTreeSitterAvailable ─────────────────────────────────────────────────────

describe('isTreeSitterAvailable', () => {
  beforeEach(() => resetTreeSitterLoader())

  it('returns a boolean', async () => {
    const result = await isTreeSitterAvailable()
    expect(typeof result).toBe('boolean')
  })

  it('result is not null or undefined', async () => {
    const result = await isTreeSitterAvailable()
    expect(result).not.toBeNull()
    expect(result).not.toBeUndefined()
  })

  it('returns Promise that resolves', async () => {
    const p = isTreeSitterAvailable()
    expect(p).toBeInstanceOf(Promise)
    expect(typeof (await p)).toBe('boolean')
  })

  it('returns consistent value on repeated calls (caches result)', async () => {
    const r1 = await isTreeSitterAvailable()
    const r2 = await isTreeSitterAvailable()
    expect(r1).toBe(r2)
  })

  it('returns boolean after multiple resets', async () => {
    resetTreeSitterLoader()
    resetTreeSitterLoader()
    const result = await isTreeSitterAvailable()
    expect(typeof result).toBe('boolean')
  })
})
