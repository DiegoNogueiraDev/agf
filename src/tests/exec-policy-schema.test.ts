import { describe, it, expect } from 'vitest'
import {
  DecisionSchema,
  ExecPolicyRuleSchema,
  NetworkRuleSchema,
  ExecApprovalRequirementSchema,
  ExecPolicyConfigSchema,
  type Decision,
} from '../schemas/exec-policy.schema.js'

describe('DecisionSchema', () => {
  it('should accept Allow', () => {
    expect(DecisionSchema.safeParse('Allow').success).toBe(true)
  })

  it('should accept Prompt', () => {
    expect(DecisionSchema.safeParse('Prompt').success).toBe(true)
  })

  it('should accept Forbidden', () => {
    expect(DecisionSchema.safeParse('Forbidden').success).toBe(true)
  })

  it('should reject invalid decision', () => {
    expect(DecisionSchema.safeParse('Unknown').success).toBe(false)
  })
})

describe('ExecPolicyRuleSchema', () => {
  it('should accept prefix rule with Allow', () => {
    const result = ExecPolicyRuleSchema.safeParse({
      type: 'prefix',
      value: ['git', 'status'],
      decision: 'Allow',
    })
    expect(result.success).toBe(true)
  })

  it('should accept rule with justification', () => {
    const result = ExecPolicyRuleSchema.safeParse({
      type: 'prefix',
      value: ['git', 'push'],
      decision: 'Prompt',
      justification: 'Push requires review',
    })
    expect(result.success).toBe(true)
  })

  it('should reject rule with invalid decision', () => {
    const result = ExecPolicyRuleSchema.safeParse({
      type: 'prefix',
      value: ['rm', '-rf'],
      decision: 'Maybe',
    })
    expect(result.success).toBe(false)
  })
})

describe('NetworkRuleSchema', () => {
  it('should accept domain allow rule', () => {
    const result = NetworkRuleSchema.safeParse({
      domain: 'api.example.com',
      protocol: 'https',
      decision: 'Allow',
    })
    expect(result.success).toBe(true)
  })

  it('should accept domain deny rule', () => {
    const result = NetworkRuleSchema.safeParse({
      domain: 'evil.com',
      protocol: 'https',
      decision: 'Deny',
    })
    expect(result.success).toBe(true)
  })
})

describe('ExecApprovalRequirementSchema', () => {
  it('should accept Skip', () => {
    expect(ExecApprovalRequirementSchema.safeParse('Skip').success).toBe(true)
  })

  it('should accept NeedsApproval', () => {
    expect(ExecApprovalRequirementSchema.safeParse('NeedsApproval').success).toBe(true)
  })

  it('should accept Forbidden', () => {
    expect(ExecApprovalRequirementSchema.safeParse('Forbidden').success).toBe(true)
  })
})

describe('ExecPolicyConfigSchema', () => {
  it('should accept valid config', () => {
    const result = ExecPolicyConfigSchema.safeParse({
      rules: [
        { type: 'prefix', value: ['git', 'status'], decision: 'Allow' },
        { type: 'prefix', value: ['curl'], decision: 'Prompt' },
      ],
      networkRules: [{ domain: 'api.example.com', protocol: 'https', decision: 'Allow' }],
    })
    expect(result.success).toBe(true)
  })

  it('should cascade Forbidden over Prompt over Allow', () => {
    const order: Decision[] = ['Allow', 'Prompt', 'Forbidden']
    expect(order.indexOf('Forbidden')).toBe(2)
    expect(order.indexOf('Prompt')).toBe(1)
    expect(order.indexOf('Allow')).toBe(0)
  })
})
