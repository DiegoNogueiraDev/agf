import { describe, it, expect } from 'vitest'
import { AgentDefinitionSchema } from '../schemas/agent.schema.js'

const valid = {
  name: 'planner',
  description: 'Plans implementation',
  tools: ['Read', 'Edit'],
  systemPrompt: 'You are a planner agent.',
  phase: 'PLAN' as const,
}

describe('AgentDefinitionSchema', () => {
  it('accepts a valid agent definition', () => {
    expect(AgentDefinitionSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an optional model field', () => {
    const result = AgentDefinitionSchema.safeParse({ ...valid, model: 'claude-sonnet-4-6' })
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const { name: _, ...rest } = valid
    expect(AgentDefinitionSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects empty name', () => {
    expect(AgentDefinitionSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejects invalid phase', () => {
    expect(AgentDefinitionSchema.safeParse({ ...valid, phase: 'UNKNOWN' }).success).toBe(false)
  })

  it('accepts all valid lifecycle phases', () => {
    const phases = ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING']
    for (const phase of phases) {
      expect(AgentDefinitionSchema.safeParse({ ...valid, phase }).success).toBe(true)
    }
  })
})
