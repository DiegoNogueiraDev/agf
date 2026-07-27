import { describe, it, expect } from 'vitest'
import type { GuardianVerdict, GuardianConfig, ToolCallToReview } from '../schemas/guardian-reviewer.schema.js'

describe('guardian-reviewer types', () => {
  it('GuardianVerdict shape is valid', () => {
    const verdict: GuardianVerdict = { verdict: 'allow', reason: 'Safe command', risk: 'low' }
    expect(verdict.verdict).toBe('allow')
    expect(['allow', 'deny', 'ask_user']).toContain(verdict.verdict)
  })

  it('GuardianConfig shape is valid', () => {
    const config: GuardianConfig = { model: 'claude-haiku', timeoutMs: 5000, cacheSize: 100 }
    expect(config.model).toBeDefined()
  })

  it('ToolCallToReview shape is valid', () => {
    const call: ToolCallToReview = { toolName: 'bash', args: { command: 'ls' } }
    expect(call.toolName).toBe('bash')
  })

  it('verdict covers all three options', () => {
    const options: GuardianVerdict['verdict'][] = ['allow', 'deny', 'ask_user']
    expect(options).toHaveLength(3)
  })

  it('risk levels are correct', () => {
    const risks: GuardianVerdict['risk'][] = ['low', 'medium', 'high']
    expect(risks).toHaveLength(3)
  })
})
