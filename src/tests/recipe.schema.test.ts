import { describe, it, expect } from 'vitest'
import { AssertionSchema, RecipeStepSchema, RecipeSchema } from '../schemas/recipe.schema.js'

const stepBase = {
  evidence_before: 'screenshot-before.png',
  evidence_after: 'screenshot-after.png',
}

describe('AssertionSchema', () => {
  it('accepts visible assertion', () => {
    expect(AssertionSchema.safeParse({ type: 'visible', selector: '#header' }).success).toBe(true)
  })

  it('accepts text assertion', () => {
    expect(AssertionSchema.safeParse({ type: 'text', value: 'Hello' }).success).toBe(true)
  })

  it('rejects unknown assertion type', () => {
    expect(AssertionSchema.safeParse({ type: 'exists' }).success).toBe(false)
  })
})

describe('RecipeStepSchema', () => {
  it('accepts navigate step', () => {
    expect(RecipeStepSchema.safeParse({ kind: 'navigate', ...stepBase }).success).toBe(true)
  })

  it('accepts click step with selector', () => {
    expect(RecipeStepSchema.safeParse({ kind: 'click', selector: '#btn', ...stepBase }).success).toBe(true)
  })

  it('accepts type step', () => {
    expect(
      RecipeStepSchema.safeParse({ kind: 'type', selector: '#input', payload: 'hello', ...stepBase }).success,
    ).toBe(true)
  })

  it('rejects step without evidence_before', () => {
    expect(RecipeStepSchema.safeParse({ kind: 'click', evidence_after: 'after.png' }).success).toBe(false)
  })
})

describe('RecipeSchema', () => {
  it('accepts a valid recipe', () => {
    const result = RecipeSchema.safeParse({
      runId: 'run-001',
      createdAt: 1750000000000,
      steps: [{ kind: 'navigate', ...stepBase }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty steps', () => {
    expect(RecipeSchema.safeParse({ runId: 'r', createdAt: 0, steps: [] }).success).toBe(false)
  })
})
