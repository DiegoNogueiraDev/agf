import { describe, it, expect } from 'vitest'
import { evaluateRuleset, type Rule, type Effect } from '../core/permissions/ruleset.js'

const allow = (action: string, resource: string): Rule => ({ action, resource, effect: 'allow' })
const deny = (action: string, resource: string): Rule => ({ action, resource, effect: 'deny' })
const ask = (action: string, resource: string): Rule => ({ action, resource, effect: 'ask' })

describe('evaluateRuleset — avaliacao em cascata', () => {
  it('allow explicito retorna allow', () => {
    expect(evaluateRuleset([allow('read', 'file:*')], 'read', 'file:test.txt')).toBe('allow')
  })

  it('deny explicito retorna deny', () => {
    expect(evaluateRuleset([deny('write', 'file:*')], 'write', 'file:test.txt')).toBe('deny')
  })

  it('ask retorna ask', () => {
    expect(evaluateRuleset([ask('write', 'file:*')], 'write', 'file:test.txt')).toBe('ask')
  })

  it('ultima regra vence (override em cascata)', () => {
    const rules: Rule[] = [allow('read', 'file:*'), deny('read', 'file:*')]
    expect(evaluateRuleset(rules, 'read', 'file:x.txt')).toBe('deny')
  })

  it('sem regra correspondente retorna deny (default deny)', () => {
    expect(evaluateRuleset([], 'write', 'file:test.txt')).toBe('deny')
  })

  it('action wildcard corresponde a qualquer acao', () => {
    expect(evaluateRuleset([allow('*', 'file:*')], 'read', 'file:x.txt')).toBe('allow')
    expect(evaluateRuleset([allow('*', 'file:*')], 'write', 'file:x.txt')).toBe('allow')
  })

  it('resource wildcard corresponde a qualquer recurso', () => {
    expect(evaluateRuleset([allow('read', '*')], 'read', 'anything')).toBe('allow')
  })

  it('so a primeira regra mais especifica vence', () => {
    const rules: Rule[] = [deny('read', 'file:secret/*'), allow('read', 'file:secret/public/*')]
    expect(evaluateRuleset(rules, 'read', 'file:secret/public/readme.md')).toBe('allow')
  })

  it('glob matching no resource', () => {
    expect(evaluateRuleset([allow('read', 'file:src/**/*.ts')], 'read', 'file:src/core/test.ts')).toBe('allow')
    expect(evaluateRuleset([allow('read', 'file:src/**/*.ts')], 'read', 'file:src/test.js')).toBe('deny')
  })

  it('O(n) worst case — lista grande ainda funciona', () => {
    const rules: Rule[] = Array.from({ length: 1000 }, (_, i) => ({
      action: `action${i}`,
      resource: `resource${i}`,
      effect: (i % 2 === 0 ? 'allow' : 'deny') as Effect,
    }))
    rules.push(allow('read', 'file:*'))
    expect(evaluateRuleset(rules, 'read', 'file:test.txt')).toBe('allow')
  })
})
