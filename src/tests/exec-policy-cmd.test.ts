/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires core/security/shell-escalation.ts (ShellEscalation) into the `agf
 * exec-policy check` CLI surface — the module was dormant (no-surface).
 */

import { describe, it, expect } from 'vitest'
import { execPolicyCommand, buildEngine } from '../cli/commands/exec-policy-cmd.js'

describe('execPolicyCommand', () => {
  it('registers a check subcommand', () => {
    const cmd = execPolicyCommand()
    const check = cmd.commands.find((c) => c.name() === 'check')
    expect(check).toBeDefined()
  })

  it('check subcommand requires a command argument', () => {
    const cmd = execPolicyCommand()
    const check = cmd.commands.find((c) => c.name() === 'check')!
    expect(check.registeredArguments.length).toBeGreaterThan(0)
  })

  it('check subcommand has a non-empty description', () => {
    const cmd = execPolicyCommand()
    const check = cmd.commands.find((c) => c.name() === 'check')!
    expect(check.description().length).toBeGreaterThan(0)
  })
})

describe('buildEngine', () => {
  it('returns a bare engine with no rules file', () => {
    const engine = buildEngine()
    const result = engine.check('rm -rf /tmp')
    expect(result).toBeNull()
  })

  it('loads rules from a TOML file', () => {
    const path = `${import.meta.dirname}/fixtures/exec-policy-rules.toml`
    const engine = buildEngine(path)
    const result = engine.check('danger-tool --wipe')
    expect(result?.decision).toBe('Forbidden')
  })

  it('throws on a missing rules file', () => {
    expect(() => buildEngine('/nonexistent/rules.toml')).toThrow()
  })
})
