import { describe, it, expect } from 'vitest'
import { ContractSchema, ContractResultSchema } from '../schemas/contract-schema.js'

describe('ContractResultSchema', () => {
  it('accepts a valid result', () => {
    const result = ContractResultSchema.safeParse({
      claim: 'Feature X is implemented',
      validated: true,
      evidence: 'Test passed',
    })
    expect(result.success).toBe(true)
  })

  it('accepts result without evidence', () => {
    const result = ContractResultSchema.safeParse({ claim: 'X done', validated: false })
    expect(result.success).toBe(true)
  })

  it('rejects empty claim', () => {
    expect(ContractResultSchema.safeParse({ claim: '', validated: true }).success).toBe(false)
  })
})

describe('ContractSchema', () => {
  it('accepts a valid contract', () => {
    const result = ContractSchema.safeParse({
      taskId: 'task-001',
      implementorClaims: ['Feature implemented'],
      validationCriteria: ['Tests pass'],
      results: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty implementorClaims', () => {
    expect(
      ContractSchema.safeParse({
        taskId: 'task-001',
        implementorClaims: [],
        validationCriteria: ['x'],
        results: [],
      }).success,
    ).toBe(false)
  })
})
