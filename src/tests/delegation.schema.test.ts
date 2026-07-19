import { describe, it, expect } from 'vitest'
import { DelegationTaskSchema, DelegationResultSchema, DelegationEntrySchema } from '../schemas/delegation.schema.js'

describe('DelegationTaskSchema', () => {
  it('accepts a valid task', () => {
    const result = DelegationTaskSchema.safeParse({
      objective: 'Write tests for the module',
      allowedTools: ['Read', 'Write'],
    })
    expect(result.success).toBe(true)
  })

  it('defaults timeoutMs to 300000', () => {
    const result = DelegationTaskSchema.safeParse({
      objective: 'Do something',
      allowedTools: ['bash'],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.timeoutMs).toBe(300_000)
  })

  it('rejects empty allowedTools', () => {
    expect(
      DelegationTaskSchema.safeParse({
        objective: 'Do something',
        allowedTools: [],
      }).success,
    ).toBe(false)
  })

  it('rejects empty objective', () => {
    expect(
      DelegationTaskSchema.safeParse({
        objective: '',
        allowedTools: ['read'],
      }).success,
    ).toBe(false)
  })
})

describe('DelegationResultSchema', () => {
  it('accepts completed result', () => {
    expect(
      DelegationResultSchema.safeParse({
        delegationId: 'del-001',
        status: 'completed',
        summary: 'Task done',
      }).success,
    ).toBe(true)
  })

  it('accepts failed result', () => {
    expect(
      DelegationResultSchema.safeParse({
        delegationId: 'del-002',
        status: 'failed',
        summary: 'Timeout reached',
      }).success,
    ).toBe(true)
  })
})

describe('DelegationEntrySchema', () => {
  it('accepts a valid DB entry', () => {
    expect(
      DelegationEntrySchema.safeParse({
        id: 'entry-1',
        parentAgentId: 'parent',
        childAgentId: 'child',
        objective: 'Write tests',
        allowedTools: '["read","write"]',
        status: 'running',
        resultSummary: null,
        createdAt: '2026-06-22T00:00:00Z',
        completedAt: null,
      }).success,
    ).toBe(true)
  })
})
