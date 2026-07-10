import { describe, it, expect } from 'vitest'
import { SpecTemplateVariableSchema, SpecTemplateSectionSchema } from '../schemas/spec-template.schema.js'

describe('SpecTemplateVariableSchema', () => {
  it('accepts a string variable', () => {
    const result = SpecTemplateVariableSchema.safeParse({
      description: 'The name of the feature',
      type: 'string',
      required: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a select variable with options', () => {
    expect(
      SpecTemplateVariableSchema.safeParse({
        description: 'Severity level',
        type: 'select',
        required: false,
        options: ['low', 'medium', 'high'],
      }).success,
    ).toBe(true)
  })

  it('defaults required to false', () => {
    const result = SpecTemplateVariableSchema.safeParse({
      description: 'Optional param',
      type: 'boolean',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.required).toBe(false)
  })

  it('rejects unknown type', () => {
    expect(
      SpecTemplateVariableSchema.safeParse({
        description: 'Bad type',
        type: 'array',
      }).success,
    ).toBe(false)
  })
})

describe('SpecTemplateSectionSchema', () => {
  it('accepts a required section', () => {
    expect(
      SpecTemplateSectionSchema.safeParse({
        title: 'Problem Statement',
        description: 'Describe the problem',
        required: true,
      }).success,
    ).toBe(true)
  })

  it('defaults required to true', () => {
    const result = SpecTemplateSectionSchema.safeParse({
      title: 'Optional Notes',
      description: 'Additional notes',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.required).toBe(true)
  })
})
