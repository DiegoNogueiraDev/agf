import { describe, it, expect } from 'vitest'
import {
  DecisionSchema,
  ExecPolicyRuleSchema,
  ExecPolicyConfigSchema,
  NetworkRuleSchema,
} from '../schemas/exec-policy.schema.js'

describe('DecisionSchema', () => {
  it('accepts valid decisions', () => {
    for (const d of ['Allow', 'Prompt', 'Forbidden']) {
      expect(DecisionSchema.safeParse(d).success).toBe(true)
    }
  })

  it('rejects unknown decision', () => {
    expect(DecisionSchema.safeParse('Deny').success).toBe(false)
  })
})

describe('ExecPolicyRuleSchema', () => {
  it('accepts a prefix rule', () => {
    expect(
      ExecPolicyRuleSchema.safeParse({
        type: 'prefix',
        value: 'git',
        decision: 'Allow',
      }).success,
    ).toBe(true)
  })

  it('accepts a regex rule with string value', () => {
    expect(
      ExecPolicyRuleSchema.safeParse({
        type: 'regex',
        value: '^rm -rf',
        decision: 'Forbidden',
      }).success,
    ).toBe(true)
  })

  it('accepts array value', () => {
    expect(
      ExecPolicyRuleSchema.safeParse({
        type: 'exact',
        value: ['ls', 'pwd'],
        decision: 'Allow',
      }).success,
    ).toBe(true)
  })
})

describe('NetworkRuleSchema', () => {
  it('accepts a valid network rule', () => {
    expect(
      NetworkRuleSchema.safeParse({
        domain: 'api.github.com',
        protocol: 'https',
        decision: 'Allow',
      }).success,
    ).toBe(true)
  })

  it('rejects empty domain', () => {
    expect(
      NetworkRuleSchema.safeParse({
        domain: '',
        protocol: 'https',
        decision: 'Allow',
      }).success,
    ).toBe(false)
  })
})

describe('ExecPolicyConfigSchema', () => {
  it('accepts empty config with defaults', () => {
    const result = ExecPolicyConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rules).toEqual([])
      expect(result.data.allowedHosts).toEqual([])
    }
  })

  it('accepts config with rules', () => {
    expect(
      ExecPolicyConfigSchema.safeParse({
        rules: [{ type: 'prefix', value: 'npm', decision: 'Allow' }],
      }).success,
    ).toBe(true)
  })
})
