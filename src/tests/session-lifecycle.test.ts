/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../core/hooks/shared-hook-bus.js', () => ({
  getSharedHookBus: () => ({
    emit: vi.fn(),
  }),
}))

describe('session-lifecycle', () => {
  let mod: typeof import('../core/hooks/session-lifecycle.js')

  beforeEach(async () => {
    vi.resetModules()
    mod = await import('../core/hooks/session-lifecycle.js')
  })

  afterEach(() => {
    mod._resetSessionLifecycleForTesting()
  })

  describe('emitSessionStart', () => {
    it('returns a session ID string', () => {
      const id = mod.emitSessionStart()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('returns same ID on second call (idempotent)', () => {
      const id1 = mod.emitSessionStart()
      const id2 = mod.emitSessionStart()
      expect(id1).toBe(id2)
    })
  })

  describe('emitSessionEnd', () => {
    it('returns true on first call', () => {
      mod.emitSessionStart()
      const r = mod.emitSessionEnd('SIGINT')
      expect(r).toBe(true)
    })

    it('returns false on second call (idempotent)', () => {
      mod.emitSessionStart()
      mod.emitSessionEnd('SIGINT')
      const r = mod.emitSessionEnd('SIGTERM')
      expect(r).toBe(false)
    })
  })

  describe('installSessionEndHandlers', () => {
    it('returns a disposer function', () => {
      const proc = { on: vi.fn(), off: vi.fn() } as unknown as NodeJS.Process
      const disposer = mod.installSessionEndHandlers(proc, ['SIGINT'])
      expect(typeof disposer).toBe('function')
      expect(proc.on).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    })

    it('disposer removes handlers', () => {
      const proc = { on: vi.fn(), off: vi.fn() } as unknown as NodeJS.Process
      const disposer = mod.installSessionEndHandlers(proc, ['SIGINT'])
      disposer()
      expect(proc.off).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    })
  })
})
