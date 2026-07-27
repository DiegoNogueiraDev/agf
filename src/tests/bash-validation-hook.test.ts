/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { evaluateBashCommand, enforceBashVerdict } from '../core/hooks/bash-validation-hook.js'

describe('bash-validation-hook', () => {
  describe('evaluateBashCommand', () => {
    it('returns safe for simple command', () => {
      const v = evaluateBashCommand('ls -la')
      expect(v.blocked).toBe(false)
      expect(v.risk).toBe('safe')
      expect(v.reasons).toEqual([])
    })

    it('returns forbidden for eval', () => {
      const v = evaluateBashCommand('eval "rm -rf /"')
      expect(v.blocked).toBe(true)
      expect(v.risk).toBe('forbidden')
      expect(v.reasons.length).toBeGreaterThan(0)
    })

    it('returns forbidden for inline exec', () => {
      const v = evaluateBashCommand('echo $(whoami)')
      expect(v.blocked).toBe(true)
      expect(v.risk).toBe('forbidden')
    })

    it('returns destructive for rm -rf', () => {
      const v = evaluateBashCommand('rm -rf /tmp/foo')
      expect(v.risk).toBe('destructive')
      expect(v.blocked).toBe(false)
    })

    it('returns safe for empty string', () => {
      const v = evaluateBashCommand('')
      expect(v.risk).toBe('safe')
      expect(v.blocked).toBe(false)
    })
  })

  describe('enforceBashVerdict', () => {
    it('does not throw for safe command', () => {
      expect(() => enforceBashVerdict('echo hello')).not.toThrow()
    })

    it('does not throw for destructive command (advisory)', () => {
      expect(() => enforceBashVerdict('rm -rf /tmp/x')).not.toThrow()
    })

    it('throws McpGraphError for forbidden command', () => {
      expect(() => enforceBashVerdict('eval "ls"')).toThrow('bash:validation:forbidden')
    })
  })
})
