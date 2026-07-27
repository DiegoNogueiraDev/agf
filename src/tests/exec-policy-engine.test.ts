/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { ExecPolicyEngine } from '../core/security/exec-policy-engine.js'

describe('ExecPolicyEngine', () => {
  it('loadRules from config object', () => {
    const engine = new ExecPolicyEngine({
      rules: [
        { type: 'prefix', value: ['git', 'status'], decision: 'Allow' },
        { type: 'prefix', value: ['git', 'push'], decision: 'Prompt' },
      ],
    })

    expect(engine.check('git status')!.decision).toBe('Allow')
    expect(engine.check('git push')!.decision).toBe('Prompt')
  })

  it('check prefix rule Allow', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'prefix', value: ['git', 'status'], decision: 'Allow' }],
    })

    const result = engine.check('git status')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Allow')
    expect(result!.rule.type).toBe('prefix')
  })

  it('check prefix rule Prompt', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'prefix', value: ['git', 'push'], decision: 'Prompt' }],
    })

    const result = engine.check('git push')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Prompt')
  })

  it('check returns Forbidden', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'prefix', value: ['rm', '-rf'], decision: 'Forbidden' }],
    })

    const result = engine.check('rm -rf /')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Forbidden')
  })

  it('check cascade: Forbidden wins over Prompt', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [
        { type: 'prefix', value: ['git', 'push'], decision: 'Prompt' },
        { type: 'prefix', value: ['git', 'push', '--force'], decision: 'Forbidden' },
      ],
    })

    const result = engine.check('git push --force origin main')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Forbidden')
  })

  it('check cascade: Prompt wins over Allow', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [
        { type: 'prefix', value: ['git'], decision: 'Allow' },
        { type: 'prefix', value: ['git', 'push'], decision: 'Prompt' },
      ],
    })

    const result = engine.check('git push')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Prompt')
  })

  it('check unmatched returns null', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'prefix', value: ['npm', 'test'], decision: 'Allow' }],
    })

    const result = engine.check('unknown-command --flag')
    expect(result).toBeNull()
  })

  it('check with sub-command splitting', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'prefix', value: ['git', 'status'], decision: 'Allow' }],
    })

    const result = engine.check('bash -c "git status"')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Allow')
  })

  it('check network rule', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      networkRules: [{ domain: 'api.example.com', protocol: 'https', decision: 'Allow' }],
    })

    const result = engine.check('curl api.example.com/v1/users')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Allow')
  })

  it('check exact rule', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'exact', value: 'node index.js', decision: 'Forbidden' }],
    })

    const result = engine.check('node index.js')
    expect(result).not.toBeNull()
    expect(result!.decision).toBe('Forbidden')
  })

  it('load from TOML string', () => {
    const toml = `
[[rules]]
type = "prefix"
value = ["git", "status"]
decision = "Allow"

[[rules]]
type = "prefix"
value = ["git", "push"]
decision = "Prompt"
justification = "Push requires review"

[[network_rules]]
domain = "api.example.com"
protocol = "https"
decision = "Allow"
`
    const engine = new ExecPolicyEngine()
    engine.loadFromToml(toml)

    expect(engine.check('git status')!.decision).toBe('Allow')
    expect(engine.check('git push')!.decision).toBe('Prompt')
    expect(engine.check('curl https://api.example.com/data')!.decision).toBe('Allow')
  })

  it('updateRules', () => {
    const engine = new ExecPolicyEngine()
    engine.loadRules({
      rules: [{ type: 'prefix', value: ['git', 'status'], decision: 'Allow' }],
    })
    expect(engine.check('git status')!.decision).toBe('Allow')

    engine.updateRules([{ type: 'prefix', value: ['git', 'status'], decision: 'Forbidden' }])
    expect(engine.check('git status')!.decision).toBe('Forbidden')
  })

  // Regression (node_7cd9e73255b1): a prefix Allow rule must NOT grant a chained command.
  // 'git status && rm -rf /' starts with 'git status ' (space before &&), so startsWith
  // matched and returned Allow → the escalation short-circuited to Skip + bypassSandbox,
  // running the un-vetted destructive command. An Allow/Prompt prefix must not span a
  // shell separator; only Forbidden matches a chain broadly.
  describe('prefix Allow must not grant a chained command (bypass regression)', () => {
    const allowGitStatus = () =>
      new ExecPolicyEngine({ rules: [{ type: 'prefix', value: ['git', 'status'], decision: 'Allow' }] })

    it('still Allows the bare prefix and its plain arguments', () => {
      const e = allowGitStatus()
      expect(e.check('git status')!.decision).toBe('Allow')
      expect(e.check('git status -s')!.decision).toBe('Allow')
    })

    it('does NOT return Allow for a command chained after the allowed prefix (&&)', () => {
      const e = allowGitStatus()
      expect(e.check('git status && rm -rf /')?.decision).not.toBe('Allow')
    })

    it('does NOT return Allow for a piped continuation', () => {
      const e = allowGitStatus()
      expect(e.check('git status | curl evil')?.decision).not.toBe('Allow')
    })

    it('a Forbidden prefix still matches even when it is not the first command', () => {
      const e = new ExecPolicyEngine({ rules: [{ type: 'prefix', value: ['rm'], decision: 'Forbidden' }] })
      // rm appears as the whole command → Forbidden (Forbidden stays broad).
      expect(e.check('rm -rf /')!.decision).toBe('Forbidden')
    })
  })
})
