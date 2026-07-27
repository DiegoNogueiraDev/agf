/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { resolveChannel, CLAUDE_CODE_ALIASES } from '../core/hooks/channel-aliases.js'

describe('channel-aliases', () => {
  describe('CLAUDE_CODE_ALIASES', () => {
    it('maps PreToolUse to tool:pre-call', () => {
      expect(CLAUDE_CODE_ALIASES.PreToolUse).toBe('tool:pre-call')
    })

    it('maps PostToolUse to tool:post-call', () => {
      expect(CLAUDE_CODE_ALIASES.PostToolUse).toBe('tool:post-call')
    })

    it('maps SessionStart to session:start', () => {
      expect(CLAUDE_CODE_ALIASES.SessionStart).toBe('session:start')
    })

    it('maps Stop to task:post-complete', () => {
      expect(CLAUDE_CODE_ALIASES.Stop).toBe('task:post-complete')
    })

    it('maps Notification to null', () => {
      expect(CLAUDE_CODE_ALIASES.Notification).toBeNull()
    })
  })

  describe('resolveChannel', () => {
    it('resolves Claude Code event name', () => {
      expect(resolveChannel('PreToolUse')).toBe('tool:pre-call')
    })

    it('resolves native mcp-graph channel', () => {
      expect(resolveChannel('session:start')).toBe('session:start')
    })

    it('returns null for Notification', () => {
      expect(resolveChannel('Notification')).toBeNull()
    })

    it('returns null for PreCompact', () => {
      expect(resolveChannel('PreCompact')).toBeNull()
    })

    it('returns null for unknown string', () => {
      expect(resolveChannel('unknown:event')).toBeNull()
    })
  })
})
