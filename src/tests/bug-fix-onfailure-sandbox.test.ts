/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug fix — node_0be82c17fcad: under the OnFailure approval policy an UNKNOWN
 * command (not dangerous, not known-safe) returned Skip + bypassSandbox:true,
 * letting arbitrary unrecognized commands escape the sandbox. Unknown commands
 * must now run sandboxed; only the explicit known-safe list bypasses.
 */
import { describe, it, expect } from 'vitest'
import { ShellEscalation } from '../core/security/shell-escalation.js'
import { ExecPolicyEngine } from '../core/security/exec-policy-engine.js'

function esc(): ShellEscalation {
  return new ShellEscalation(new ExecPolicyEngine())
}

describe('node_0be82c17fcad — OnFailure must not bypass the sandbox for unknown commands', () => {
  it('an unknown command under OnFailure runs sandboxed (no bypass)', () => {
    const r = esc().check('some-unknown-tool --do-stuff', 'OnFailure')
    expect(r.bypassSandbox).toBe(false)
  })

  it('regression: a known-safe command under OnFailure still skips + bypasses', () => {
    const r = esc().check('git status', 'OnFailure')
    expect(r.requirement).toBe('Skip')
    expect(r.bypassSandbox).toBe(true)
  })

  it('regression: a dangerous command under OnFailure needs approval, no bypass', () => {
    const r = esc().check('rm -rf /tmp/victim', 'OnFailure')
    expect(r.requirement).toBe('NeedsApproval')
    expect(r.bypassSandbox).toBe(false)
  })
})
