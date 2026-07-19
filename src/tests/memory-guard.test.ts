/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { MemoryGuard, MemoryPressureError } from '../core/utils/memory-guard.js'

describe('MemoryGuard', () => {
  describe('default thresholds', () => {
    it('has warn=600MB reject=800MB by default', () => {
      const guard = new MemoryGuard()
      const snap = guard.snapshot()
      expect(snap.warnThresholdMb).toBe(600)
      expect(snap.rejectThresholdMb).toBe(800)
    })
  })

  describe('pressureLevel', () => {
    it('returns "ok" when heap is low', () => {
      const guard = new MemoryGuard({ readHeap: () => 100 * 1024 * 1024 })
      expect(guard.pressureLevel()).toBe('ok')
    })

    it('returns "warning" when heap exceeds warn threshold', () => {
      const guard = new MemoryGuard({ warnThresholdMb: 200, rejectThresholdMb: 400, readHeap: () => 300 * 1024 * 1024 })
      expect(guard.pressureLevel()).toBe('warning')
    })

    it('returns "critical" when heap exceeds reject threshold', () => {
      const guard = new MemoryGuard({ warnThresholdMb: 200, rejectThresholdMb: 400, readHeap: () => 500 * 1024 * 1024 })
      expect(guard.pressureLevel()).toBe('critical')
    })
  })

  describe('check()', () => {
    it('returns status and heapMb', () => {
      const guard = new MemoryGuard({ readHeap: () => 100 * 1024 * 1024 })
      const result = guard.check()
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('heapMb')
      expect(result.status).toBe('ok')
      expect(typeof result.heapMb).toBe('number')
    })

    it('emits MEMORY_PRESSURE_WARNING on ok→warning transition', () => {
      const emitter = vi.fn()
      const guard = new MemoryGuard({
        warnThresholdMb: 200,
        rejectThresholdMb: 400,
        readHeap: () => 300 * 1024 * 1024,
        emitEvent: emitter,
      })
      guard.check()
      expect(emitter).toHaveBeenCalledWith(
        'MEMORY_PRESSURE_WARNING',
        expect.objectContaining({ heapMb: expect.any(Number) }),
      )
    })

    it('emits MEMORY_PRESSURE_CRITICAL on any→critical transition', () => {
      const emitter = vi.fn()
      const guard = new MemoryGuard({
        warnThresholdMb: 200,
        rejectThresholdMb: 400,
        readHeap: () => 500 * 1024 * 1024,
        emitEvent: emitter,
      })
      guard.check()
      expect(emitter).toHaveBeenCalledWith(
        'MEMORY_PRESSURE_CRITICAL',
        expect.objectContaining({ heapMb: expect.any(Number) }),
      )
    })

    it('does not emit on same level', () => {
      const emitter = vi.fn()
      const guard = new MemoryGuard({
        warnThresholdMb: 200,
        rejectThresholdMb: 400,
        readHeap: () => 100 * 1024 * 1024,
        emitEvent: emitter,
      })
      guard.check()
      guard.check()
      expect(emitter).not.toHaveBeenCalled()
    })
  })

  describe('guardOrReject', () => {
    it('throws MemoryPressureError at critical level', () => {
      const guard = new MemoryGuard({ warnThresholdMb: 200, rejectThresholdMb: 400, readHeap: () => 500 * 1024 * 1024 })
      expect(() => guard.guardOrReject()).toThrow(MemoryPressureError)
    })

    it('returns status when not critical', () => {
      const guard = new MemoryGuard({ readHeap: () => 100 * 1024 * 1024 })
      const result = guard.guardOrReject()
      expect(result.status).toBe('ok')
    })

    it('MemoryPressureError contains heap and threshold info', () => {
      const guard = new MemoryGuard({ warnThresholdMb: 200, rejectThresholdMb: 400, readHeap: () => 500 * 1024 * 1024 })
      try {
        guard.guardOrReject()
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(MemoryPressureError)
        const e = err as MemoryPressureError
        expect(e.heapMb).toBeGreaterThan(400)
        expect(e.rejectThresholdMb).toBe(400)
        expect(e.message).toContain('memory-guard:critical')
      }
    })
  })

  describe('checkForTool', () => {
    it('returns null for light tools', () => {
      const guard = new MemoryGuard({ readHeap: () => 900 * 1024 * 1024 })
      expect(guard.checkForTool('light')).toBeNull()
    })

    it('returns null for heavy tools when not critical', () => {
      const guard = new MemoryGuard({ readHeap: () => 100 * 1024 * 1024 })
      expect(guard.checkForTool('context')).toBeNull()
    })

    it('returns error for heavy tools when critical', () => {
      const guard = new MemoryGuard({ rejectThresholdMb: 400, readHeap: () => 500 * 1024 * 1024 })
      const result = guard.checkForTool('context')
      expect(result).not.toBeNull()
      expect(result!.isError).toBe(true)
      expect(result!.content[0].text).toContain('MEMORY_PRESSURE')
    })
  })

  describe('snapshot', () => {
    it('returns full state', () => {
      const guard = new MemoryGuard({ warnThresholdMb: 100, rejectThresholdMb: 200, readHeap: () => 150 * 1024 * 1024 })
      const snap = guard.snapshot()
      expect(snap.heapUsedMb).toBeGreaterThan(0)
      expect(snap.warnThresholdMb).toBe(100)
      expect(snap.rejectThresholdMb).toBe(200)
      expect(snap.level).toBe('warning')
    })
  })
})
