import { describe, it, expect } from 'vitest'
import { DEFAULT_POLICIES, matchPolicy } from '../schemas/guardian-policies.schema.js'
import type { GuardianPolicy } from '../schemas/guardian-policies.schema.js'

describe('DEFAULT_POLICIES', () => {
  it('contains at least one policy', () => {
    expect(DEFAULT_POLICIES.length).toBeGreaterThan(0)
  })

  it('has a catch-all allow policy', () => {
    const catchAll = DEFAULT_POLICIES.find((p) => p.toolPattern === '*' && p.action === 'allow')
    expect(catchAll).toBeDefined()
  })
})

describe('matchPolicy', () => {
  const policies: GuardianPolicy[] = [
    { toolPattern: 'bash', conditions: { commandContains: 'rm -rf' }, action: 'deny', riskLevel: 'high' },
    { toolPattern: '*', action: 'allow', riskLevel: 'low' },
  ]

  it('matches deny policy for rm -rf command', () => {
    const result = matchPolicy('bash', { command: 'rm -rf /' }, policies)
    expect(result?.action).toBe('deny')
  })

  it('falls through to allow for safe command', () => {
    const result = matchPolicy('bash', { command: 'ls -la' }, policies)
    expect(result?.action).toBe('allow')
  })

  it('returns null when no policies provided', () => {
    const result = matchPolicy('bash', {}, [])
    expect(result).toBeNull()
  })
})
