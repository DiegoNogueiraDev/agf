import { describe, it, expect } from 'vitest'
import { resolveChannel } from '../core/hooks/channel-aliases.js'

/**
 * Decision table: Hook channel routing.
 *
 * Conditions:
 *   C1: Event comes from Claude Code (alias)
 *   C2: Event comes from OpenCode (alias)
 *   C3: Event comes from Copilot (alias)
 *   C4: Event is a standard channel name
 *
 * Actions:
 *   A1: Resolves to tool:pre-call
 *   A2: Resolves to tool:post-call
 *   A3: Resolves to session:start
 *   A4: Resolves to session:end
 *   A5: Passes through unchanged
 */
describe('Decision table: Hook channel routing', () => {
  // Row 1: Claude Code aliases → standard channels
  it('C1: PreToolUse → tool:pre-call', () => {
    expect(resolveChannel('PreToolUse')).toBe('tool:pre-call')
  })

  it('C1: PostToolUse → tool:post-call', () => {
    expect(resolveChannel('PostToolUse')).toBe('tool:post-call')
  })

  it('C1: SessionStart → session:start', () => {
    expect(resolveChannel('SessionStart')).toBe('session:start')
  })

  // Row 2: Standard channels pass through
  it('C4: tool:pre-call → tool:pre-call', () => {
    expect(resolveChannel('tool:pre-call')).toBe('tool:pre-call')
  })

  it('C4: session:end → session:end', () => {
    expect(resolveChannel('session:end')).toBe('session:end')
  })

  // Row 3: Unknown channel → null
  it('C4: unknown → null', () => {
    expect(resolveChannel('custom:event')).toBeNull()
  })
})
