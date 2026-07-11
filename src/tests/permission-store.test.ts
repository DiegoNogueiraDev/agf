import { describe, it, expect } from 'vitest'
import { deriveRuleset, evaluateRuleset, type Rule } from '../core/permissions/ruleset.js'

describe('deriveRuleset — derivacao de permissoes para subtasks', () => {
  const DEFAULT_COUNT = 2

  it('parent deny sempre vence (most restrictive wins)', () => {
    const parent: Rule[] = [{ action: 'write', resource: 'file:*', effect: 'deny' }]
    const child: Rule[] = [{ action: 'write', resource: 'file:*', effect: 'allow' }]
    const derived = deriveRuleset(parent, child)
    expect(evaluateRuleset(derived, 'write', 'file:test.txt')).toBe('deny')
  })

  it('parent allow + child deny = deny (child restringe)', () => {
    const parent: Rule[] = [{ action: '*', resource: '*', effect: 'allow' }]
    const child: Rule[] = [{ action: 'write', resource: 'file:secret/*', effect: 'deny' }]
    const derived = deriveRuleset(parent, child)
    expect(evaluateRuleset(derived, 'write', 'file:secret/x.txt')).toBe('deny')
  })

  it('parent + child nao conflitantes = ambos permitidos', () => {
    const parent: Rule[] = [{ action: 'read', resource: 'file:*', effect: 'allow' }]
    const child: Rule[] = [{ action: 'write', resource: 'file:*', effect: 'allow' }]
    const derived = deriveRuleset(parent, child)
    expect(evaluateRuleset(derived, 'read', 'file:x.txt')).toBe('allow')
    expect(evaluateRuleset(derived, 'write', 'file:x.txt')).toBe('allow')
  })

  it('ask vira deny se parent deny na mesma action/resource', () => {
    const parent: Rule[] = [{ action: 'write', resource: 'file:*', effect: 'deny' }]
    const child: Rule[] = [{ action: 'write', resource: 'file:*', effect: 'ask' }]
    const derived = deriveRuleset(parent, child)
    expect(evaluateRuleset(derived, 'write', 'file:test.txt')).toBe('deny')
  })

  it('sem parent rules, child + defaults sao aplicados', () => {
    const child: Rule[] = [{ action: 'read', resource: '*', effect: 'allow' }]
    const derived = deriveRuleset([], child)
    expect(evaluateRuleset(derived, 'read', 'anything')).toBe('allow')
    expect(evaluateRuleset(derived, 'todowrite', 'any')).toBe('deny')
    expect(evaluateRuleset(derived, 'task', 'any')).toBe('deny')
  })

  it('parent deny em acao ampla cobre recursos especificos do child', () => {
    const parent: Rule[] = [{ action: 'write', resource: '*', effect: 'deny' }]
    const child: Rule[] = [{ action: 'write', resource: 'file:test.txt', effect: 'allow' }]
    const derived = deriveRuleset(parent, child)
    expect(evaluateRuleset(derived, 'write', 'file:test.txt')).toBe('deny')
  })
})
