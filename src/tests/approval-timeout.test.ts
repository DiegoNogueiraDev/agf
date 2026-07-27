/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { ApprovalTimeoutTracker, getApprovalTimeoutMs } from '../core/hooks/approval-timeout.js'

describe('approval-timeout', () => {
  describe('getApprovalTimeoutMs', () => {
    it('returns default when env not set', () => {
      expect(getApprovalTimeoutMs({})).toBe(300_000)
    })

    it('returns parsed value from env', () => {
      expect(getApprovalTimeoutMs({ MCP_GRAPH_APPROVAL_TIMEOUT_MS: '5000' })).toBe(5000)
    })

    it('returns default for invalid value', () => {
      expect(getApprovalTimeoutMs({ MCP_GRAPH_APPROVAL_TIMEOUT_MS: 'abc' })).toBe(300_000)
      expect(getApprovalTimeoutMs({ MCP_GRAPH_APPROVAL_TIMEOUT_MS: '0' })).toBe(300_000)
      expect(getApprovalTimeoutMs({ MCP_GRAPH_APPROVAL_TIMEOUT_MS: '-1' })).toBe(300_000)
    })
  })

  describe('ApprovalTimeoutTracker', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('calls onTimeout after timeoutMs', () => {
      vi.useFakeTimers()
      const cb = vi.fn()
      const tracker = new ApprovalTimeoutTracker(100, cb)
      tracker.arm('approval-1', { tool: 'Bash' })
      expect(tracker.pending).toBe(1)
      vi.advanceTimersByTime(100)
      expect(cb).toHaveBeenCalledWith('approval-1', { tool: 'Bash' })
      expect(tracker.pending).toBe(0)
    })

    it('resolve cancels the timer', () => {
      vi.useFakeTimers()
      const cb = vi.fn()
      const tracker = new ApprovalTimeoutTracker(100, cb)
      tracker.arm('approval-1', {})
      tracker.resolve('approval-1')
      vi.advanceTimersByTime(100)
      expect(cb).not.toHaveBeenCalled()
      expect(tracker.pending).toBe(0)
    })

    it('resolve on unknown id is silent no-op', () => {
      const cb = vi.fn()
      const tracker = new ApprovalTimeoutTracker(100, cb)
      expect(() => tracker.resolve('nonexistent')).not.toThrow()
    })

    it('clear cancels all timers', () => {
      vi.useFakeTimers()
      const cb = vi.fn()
      const tracker = new ApprovalTimeoutTracker(100, cb)
      tracker.arm('a1', {})
      tracker.arm('a2', {})
      expect(tracker.pending).toBe(2)
      tracker.clear()
      expect(tracker.pending).toBe(0)
      vi.advanceTimersByTime(100)
      expect(cb).not.toHaveBeenCalled()
    })

    it('re-arming replaces prior timer', () => {
      vi.useFakeTimers()
      const cb = vi.fn()
      const tracker = new ApprovalTimeoutTracker(100, cb)
      tracker.arm('a1', { first: true })
      tracker.arm('a1', { second: true })
      expect(tracker.pending).toBe(1)
      vi.advanceTimersByTime(100)
      expect(cb).toHaveBeenCalledWith('a1', { second: true })
    })
  })
})
