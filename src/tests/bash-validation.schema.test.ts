import { describe, it, expect } from 'vitest'
import { CommandRiskSchema, ValidationResultSchema } from '../schemas/bash-validation.schema.js'

describe('CommandRiskSchema', () => {
  it('accepts valid risk values', () => {
    for (const v of ['safe', 'warn', 'destructive', 'forbidden']) {
      expect(CommandRiskSchema.safeParse(v).success).toBe(true)
    }
  })

  it('rejects unknown risk values', () => {
    expect(CommandRiskSchema.safeParse('unknown').success).toBe(false)
    expect(CommandRiskSchema.safeParse('').success).toBe(false)
  })
})

describe('ValidationResultSchema', () => {
  it('accepts a valid validation result', () => {
    const result = ValidationResultSchema.safeParse({
      risk: 'safe',
      reasons: ['no dangerous patterns found'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts result with optional sanitizedCommand', () => {
    const result = ValidationResultSchema.safeParse({
      risk: 'warn',
      reasons: ['uses rm'],
      sanitizedCommand: 'rm -i file.txt',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    expect(ValidationResultSchema.safeParse({ risk: 'safe' }).success).toBe(false)
    expect(ValidationResultSchema.safeParse({ reasons: [] }).success).toBe(false)
  })
})
