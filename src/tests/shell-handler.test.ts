/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'

describe('shell-handler', () => {
  describe('module structure', () => {
    it('exports runShellHandler and types', async () => {
      const mod = await import('../core/hooks/shell-handler.js')
      expect(typeof mod.runShellHandler).toBe('function')
      expect(mod.ShellHandlerResult).toBeUndefined()
    })
  })

  describe('decide function (internal)', () => {
    it('pass on exit 0', async () => {
      const mod = await import('../core/hooks/shell-handler.js')
      const result = await mod.runShellHandler(
        { id: 'test', command: 'echo', args: ['hello'] },
        { channel: 'session:start', timestamp: '2025-01-01T00:00:00Z', payload: {} },
      )
      expect(result.decision).toBe('pass')
      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
    })

    it('warn on non-zero non-2 exit', async () => {
      const mod = await import('../core/hooks/shell-handler.js')
      const result = await mod.runShellHandler(
        { id: 'test', command: 'sh', args: ['-c', 'exit 1'] },
        { channel: 'session:start', timestamp: '2025-01-01T00:00:00Z', payload: {} },
      )
      expect(result.decision).toBe('warn')
      expect(result.exitCode).toBe(1)
    })

    it('block on exit 2', async () => {
      const mod = await import('../core/hooks/shell-handler.js')
      const result = await mod.runShellHandler(
        { id: 'test', command: 'sh', args: ['-c', 'exit 2'] },
        { channel: 'session:start', timestamp: '2025-01-01T00:00:00Z', payload: {} },
      )
      expect(result.decision).toBe('block')
      expect(result.exitCode).toBe(2)
    })

    it('warn on timeout', async () => {
      const mod = await import('../core/hooks/shell-handler.js')
      const result = await mod.runShellHandler(
        { id: 'test', command: 'sleep', args: ['10'], timeoutMs: 50 },
        { channel: 'session:start', timestamp: '2025-01-01T00:00:00Z', payload: {} },
      )
      expect(result.decision).toBe('warn')
      expect(result.timedOut).toBe(true)
    })
  })
})
