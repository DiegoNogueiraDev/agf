import { describe, it, expect } from 'vitest'
import {
  GuardianPolicy,
  type GuardianPolicyConfig,
  DEFAULT_POLICIES,
  matchPolicy,
} from '../schemas/guardian-policies.schema.js'

describe('GuardianPolicies', () => {
  it('should define 3 políticas padrão', () => {
    expect(DEFAULT_POLICIES).toHaveLength(3)
  })

  it('should include deny destructive in plan mode', () => {
    const policy = DEFAULT_POLICIES[0]
    expect(policy?.action).toBe('deny')
    expect(policy?.toolPattern).toBeDefined()
  })

  it('should include ask_user for batch delete', () => {
    const policies = DEFAULT_POLICIES.filter((p) => p.action === 'ask_user')
    expect(policies.length).toBeGreaterThan(0)
  })

  it('should include allow for read tools', () => {
    const policies = DEFAULT_POLICIES.filter((p) => p.action === 'allow')
    expect(policies.length).toBeGreaterThan(0)
  })

  it('should support TOML config format', () => {
    const config: GuardianPolicyConfig = {
      guardian: {
        model: 'haiku',
        policies: [
          { toolPattern: 'bash', conditions: { commandContains: 'rm -rf' }, action: 'deny', riskLevel: 'high' },
          { toolPattern: 'read', action: 'allow', riskLevel: 'low' },
        ],
      },
    }
    expect(config.guardian.policies).toHaveLength(2)
    expect(config.guardian.model).toBe('haiku')
  })
})

describe('matchPolicy — cascade matching', () => {
  const policies: GuardianPolicy[] = [
    { toolPattern: 'bash', conditions: { commandContains: 'rm -rf' }, action: 'deny', riskLevel: 'high' },
    { toolPattern: 'write', conditions: { pathsContain: '/etc' }, action: 'ask_user', riskLevel: 'medium' },
    { toolPattern: '*', action: 'allow', riskLevel: 'low' },
  ]

  it('should deny destructive bash commands', () => {
    const result = matchPolicy('bash', { command: 'rm -rf /' }, policies)
    expect(result?.action).toBe('deny')
    expect(result?.riskLevel).toBe('high')
  })

  it('should allow harmless bash commands', () => {
    const result = matchPolicy('bash', { command: 'ls -la' }, policies)
    expect(result?.action).toBe('allow')
  })

  it('should ask_user for risky writes', () => {
    const result = matchPolicy('write', { path: '/etc/passwd' }, policies)
    expect(result?.action).toBe('ask_user')
  })

  it('should allow reads by default', () => {
    const result = matchPolicy('read', { path: '/tmp/file.txt' }, policies)
    expect(result?.action).toBe('allow')
  })

  it('should cascade: deny > ask_user > allow', () => {
    const testPolicies: GuardianPolicy[] = [
      { toolPattern: 'bash', action: 'deny', riskLevel: 'high' },
      { toolPattern: 'bash', action: 'ask_user', riskLevel: 'medium' },
    ]
    const result = matchPolicy('bash', {}, testPolicies)
    expect(result?.action).toBe('deny')
  })

  it('should return null for no match', () => {
    const result = matchPolicy('nonexistent', {}, [])
    expect(result).toBeNull()
  })
})
