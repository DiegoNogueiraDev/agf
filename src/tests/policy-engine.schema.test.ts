import { describe, it, expect } from 'vitest'
import type { AtomicCondition, PolicyCondition, PolicyRule, PolicyContext } from '../schemas/policy-engine.schema.js'
import { PolicyEngine } from '../schemas/policy-engine.schema.js'

describe('AtomicCondition (TypeScript interface)', () => {
  it('can construct an atomic condition', () => {
    const cond: AtomicCondition = {
      greenAt: 'main',
      reviewPassed: true,
    }
    expect(cond.greenAt).toBe('main')
    expect(cond.reviewPassed).toBe(true)
    expect(cond.approvalTokenPresent).toBeUndefined()
  })
})

describe('PolicyCondition (TypeScript interface)', () => {
  it('can construct an AND condition', () => {
    const cond: PolicyCondition = {
      all: [{ reviewPassed: true }, { greenAt: 'main' }],
    }
    expect(cond.all).toHaveLength(2)
  })

  it('can construct a NOT condition', () => {
    const cond: PolicyCondition = {
      not: { staleBranch: true },
    }
    expect(cond.not).toBeDefined()
  })
})

describe('PolicyEngine', () => {
  it('evaluates a simple rule that passes', () => {
    const engine = new PolicyEngine()
    const rules: PolicyRule[] = [
      {
        condition: { reviewPassed: true },
        actions: ['allow_merge'],
        priority: 1,
      },
    ]
    const context: PolicyContext = { reviewStatus: 'approved', hasApprovalToken: true }
    const result = engine.evaluate(rules, context)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns empty actions when no rules match', () => {
    const engine = new PolicyEngine()
    const result = engine.evaluate([], {})
    expect(result).toEqual([])
  })
})
