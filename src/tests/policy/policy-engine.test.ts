import { describe, it, expect } from 'vitest'
import {
  PolicyEngine,
  type PolicyRule,
  type PolicyCondition,
  type ContextInput,
} from '../../core/policy/policy-engine.js'

describe('PolicyEngine', () => {
  it('evaluates atomic greenAt condition when true', () => {
    const rules: PolicyRule[] = [
      { name: 'test', condition: { greenAt: 'workspace' }, actions: [{ type: 'continue' }], priority: 1 },
    ]
    const engine = new PolicyEngine(rules)
    const result = engine.evaluate({ greenLevel: 'workspace', stal: false, reviewPassed: false })
    expect(result.actions).toHaveLength(1)
    expect(result.ruleName).toBe('test')
  })

  it('returns fallthrough when condition is false', () => {
    const rules: PolicyRule[] = [
      { name: 'test', condition: { greenAt: 'workspace' }, actions: [{ type: 'continue' }], priority: 1 },
    ]
    const engine = new PolicyEngine(rules)
    const result = engine.evaluate({ greenLevel: 'targeted', stal: false, reviewPassed: false })
    expect(result.actions).toHaveLength(0)
    expect(result.ruleName).toBe('__fallthrough')
  })

  it('evaluates And composition: both conditions must pass', () => {
    const rules: PolicyRule[] = [
      {
        name: 'merge-ready',
        condition: { all: [{ greenAt: 'workspace' }, { reviewPassed: true }] },
        actions: [{ type: 'merge' }],
        priority: 1,
      },
    ]
    const engine = new PolicyEngine(rules)
    const pass = engine.evaluate({ greenLevel: 'workspace', stal: false, reviewPassed: true })
    expect(pass.actions).toHaveLength(1)

    const fail = engine.evaluate({ greenLevel: 'workspace', stal: false, reviewPassed: false })
    expect(fail.actions).toHaveLength(0)
  })

  it('evaluates Or composition: either condition passes', () => {
    const rules: PolicyRule[] = [
      {
        name: 'or-test',
        condition: { any: [{ stal: true }, { stal: false }] },
        actions: [{ type: 'recover' }],
        priority: 1,
      },
    ]
    const engine = new PolicyEngine(rules)
    const pass = engine.evaluate({ greenLevel: 'targeted', stal: false, reviewPassed: false })
    expect(pass.actions).toHaveLength(1)
  })

  it('evaluates Not composition: inverts sub-condition', () => {
    const rules: PolicyRule[] = [
      {
        name: 'not-blocked',
        condition: { not: { stal: true } },
        actions: [{ type: 'continue' }],
        priority: 1,
      },
    ]
    const engine = new PolicyEngine(rules)
    const pass = engine.evaluate({ greenLevel: 'targeted', stal: false, reviewPassed: false })
    expect(pass.actions).toHaveLength(1)

    const fail = engine.evaluate({ greenLevel: 'targeted', stal: true, reviewPassed: false })
    expect(fail.actions).toHaveLength(0)
  })

  it('respects priority ordering: higher priority wins', () => {
    const rules: PolicyRule[] = [
      { name: 'low', condition: { stal: true }, actions: [{ type: 'recover' }], priority: 1 },
      { name: 'high', condition: { stal: true }, actions: [{ type: 'escalate' }], priority: 10 },
    ]
    const engine = new PolicyEngine(rules)
    const result = engine.evaluate({ greenLevel: 'targeted', stal: true, reviewPassed: false })
    expect(result.ruleName).toBe('high')
    expect(result.actions[0].type).toBe('escalate')
  })

  it('chains multiple actions from one rule', () => {
    const rules: PolicyRule[] = [
      {
        name: 'chain-test',
        condition: { greenAt: 'merge_ready' },
        actions: [{ type: 'merge' }, { type: 'cleanup' }],
        priority: 1,
      },
    ]
    const engine = new PolicyEngine(rules)
    const result = engine.evaluate({ greenLevel: 'merge_ready', stal: false, reviewPassed: false })
    expect(result.actions).toHaveLength(2)
    expect(result.actions[0].type).toBe('merge')
    expect(result.actions[1].type).toBe('cleanup')
  })

  it('defaultRules match orchestrator import_prd behavior', () => {
    const engine = new PolicyEngine(PolicyEngine.defaultRules())
    const ctx: ContextInput = { totalNodes: 0, hasRequirements: false, stal: false, reviewPassed: false }
    const result = engine.evaluate(ctx)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].type).toBe('import_prd')
  })

  it('defaultRules decompose when oversized', () => {
    const engine = new PolicyEngine(PolicyEngine.defaultRules())
    const ctx: ContextInput = {
      totalNodes: 5,
      hasRequirements: true,
      oversizedCount: 2,
      readyTasks: 0,
      inProgress: 0,
      stal: false,
      reviewPassed: false,
    }
    const result = engine.evaluate(ctx)
    expect(result.actions[0].type).toBe('decompose')
  })

  it('defaultRules implement when tasks ready', () => {
    const engine = new PolicyEngine(PolicyEngine.defaultRules())
    const ctx: ContextInput = {
      totalNodes: 10,
      hasRequirements: true,
      oversizedCount: 0,
      readyTasks: 3,
      inProgress: 1,
      stal: false,
      reviewPassed: false,
    }
    const result = engine.evaluate(ctx)
    expect(result.actions[0].type).toBe('implement')
  })
})
