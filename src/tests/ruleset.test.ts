import { describe, it, expect } from 'vitest'
import { evaluateRuleset, deriveRuleset } from '../core/permissions/ruleset.js'
import type { Rule, Effect } from '../core/permissions/ruleset.js'

function rule(action: string, resource: string, effect: Effect): Rule {
  return { action, resource, effect }
}

describe('evaluateRuleset', () => {
  it('returns deny by default with empty ruleset', () => {
    expect(evaluateRuleset([], 'read', '/tmp/foo')).toBe('deny')
  })

  it('returns allow for exact match', () => {
    const rules: Rule[] = [rule('read', '/src/foo.ts', 'allow')]
    expect(evaluateRuleset(rules, 'read', '/src/foo.ts')).toBe('allow')
  })

  it('last matching rule wins', () => {
    const rules: Rule[] = [rule('read', '*', 'allow'), rule('read', '/etc/passwd', 'deny')]
    expect(evaluateRuleset(rules, 'read', '/etc/passwd')).toBe('deny')
    expect(evaluateRuleset(rules, 'read', '/src/foo.ts')).toBe('allow')
  })

  it('wildcard * matches any single segment', () => {
    const rules: Rule[] = [rule('*', '/src/*.ts', 'allow')]
    expect(evaluateRuleset(rules, 'write', '/src/foo.ts')).toBe('allow')
    expect(evaluateRuleset(rules, 'write', '/src/bar/baz.ts')).toBe('deny')
  })

  it('double wildcard ** matches across segments', () => {
    const rules: Rule[] = [rule('read', '/src/**', 'allow')]
    expect(evaluateRuleset(rules, 'read', '/src/a/b/c.ts')).toBe('allow')
    expect(evaluateRuleset(rules, 'read', '/other/foo.ts')).toBe('deny')
  })

  it('returns ask effect', () => {
    const rules: Rule[] = [rule('delete', '/important/**', 'ask')]
    expect(evaluateRuleset(rules, 'delete', '/important/file.txt')).toBe('ask')
  })
})

describe('deriveRuleset', () => {
  it('returns combined rules when no parent deny', () => {
    const parent: Rule[] = [rule('read', '*', 'allow')]
    const child: Rule[] = [rule('write', '/tmp/**', 'allow')]
    const merged = deriveRuleset(parent, child)
    expect(evaluateRuleset(merged, 'read', '/any/file')).toBe('allow')
    expect(evaluateRuleset(merged, 'write', '/tmp/foo.txt')).toBe('allow')
  })

  it('blocks child rule overriding parent deny', () => {
    const parent: Rule[] = [rule('delete', '/important/**', 'deny')]
    const child: Rule[] = [rule('delete', '/important/sensitive.txt', 'allow')]
    const merged = deriveRuleset(parent, child)
    expect(evaluateRuleset(merged, 'delete', '/important/sensitive.txt')).toBe('deny')
  })

  it('includes SUBTASK_DENY_DEFAULTS that block todowrite/task', () => {
    const parent: Rule[] = []
    const child: Rule[] = []
    const merged = deriveRuleset(parent, child)
    expect(evaluateRuleset(merged, 'todowrite', 'anything')).toBe('deny')
    expect(evaluateRuleset(merged, 'task', 'anything')).toBe('deny')
  })
})
