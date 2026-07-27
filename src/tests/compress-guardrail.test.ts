/*!
 * TDD: compress pre-command guardrail in generated context file sources (node_c10223bebac0).
 *
 * AC1: AGF_ECONOMY contains 'agf compress run -- <cmd>' pre-command reference.
 * AC2: Guardrail distinguishes Claude Code (hook auto) vs hookless CLIs (manual).
 */

import { describe, it, expect } from 'vitest'
import { AGF_ECONOMY } from '../core/config/cli-reference-content.js'

describe('AC1: AGF_ECONOMY documents agf compress run pre-command', () => {
  it('contains the compress run pre-command reference', () => {
    expect(AGF_ECONOMY).toContain('agf compress run -- <cmd>')
  })
})

describe('AC2: guardrail distinguishes Claude Code hook vs hookless CLIs', () => {
  it('mentions Claude Code auto-hook behavior', () => {
    expect(AGF_ECONOMY).toMatch(/Claude Code|PostToolUse|hook/i)
  })

  it('mentions hookless CLI manual step (Copilot/Codex)', () => {
    expect(AGF_ECONOMY).toMatch(/Copilot|Codex|hookless/i)
  })
})
