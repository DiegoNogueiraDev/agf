/*!
 * Wires core/security/permissions-gate.ts (PermissionsGate) into the `agf
 * sandbox-gate check` CLI surface — the module was dormant (no-surface).
 */

import { describe, it, expect } from 'vitest'
import { sandboxGateCommand, defaultPolicy, parsePolicy } from '../cli/commands/sandbox-gate-cmd.js'

describe('sandboxGateCommand', () => {
  it('registers a check subcommand', () => {
    const cmd = sandboxGateCommand()
    const check = cmd.commands.find((c) => c.name() === 'check')
    expect(check).toBeDefined()
  })

  it('check subcommand requires a command argument', () => {
    const cmd = sandboxGateCommand()
    const check = cmd.commands.find((c) => c.name() === 'check')!
    expect(check.registeredArguments.length).toBeGreaterThan(0)
  })

  it('check subcommand has a non-empty description', () => {
    const cmd = sandboxGateCommand()
    const check = cmd.commands.find((c) => c.name() === 'check')!
    expect(check.description().length).toBeGreaterThan(0)
  })
})

describe('defaultPolicy', () => {
  it('is fully permissive (Unrestricted fs, Enabled network)', () => {
    const policy = defaultPolicy()
    expect(policy.fs.kind).toBe('Unrestricted')
    expect(policy.network.kind).toBe('Enabled')
  })
})

describe('parsePolicy', () => {
  it('accepts a valid { fs, network } policy object', () => {
    const raw = {
      fs: { kind: 'Restricted', entries: [{ path: { type: 'Path', path: '/tmp' }, access: 'Write' }] },
      network: { kind: 'Restricted' },
    }
    const policy = parsePolicy(raw)
    expect(policy.fs.kind).toBe('Restricted')
    expect(policy.network.kind).toBe('Restricted')
  })

  it('throws on an invalid policy shape', () => {
    expect(() => parsePolicy({ fs: { kind: 'NotAKind' } })).toThrow()
  })
})
