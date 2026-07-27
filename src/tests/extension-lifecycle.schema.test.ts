import { describe, it, expect } from 'vitest'
import { PromptSlotSchema, PromptFragmentSchema } from '../schemas/extension-lifecycle.schema.js'

describe('PromptSlotSchema', () => {
  it('accepts valid slots', () => {
    for (const slot of ['DeveloperPolicy', 'DeveloperCapabilities', 'ContextualUser', 'SeparateDeveloper']) {
      expect(PromptSlotSchema.safeParse(slot).success).toBe(true)
    }
  })

  it('rejects unknown slot', () => {
    expect(PromptSlotSchema.safeParse('system_header').success).toBe(false)
  })
})

describe('PromptFragmentSchema', () => {
  it('accepts a valid fragment', () => {
    const result = PromptFragmentSchema.safeParse({
      slot: 'DeveloperPolicy',
      text: 'You are a helpful assistant.',
      priority: 10,
    })
    expect(result.success).toBe(true)
  })

  it('defaults priority to 50', () => {
    const result = PromptFragmentSchema.safeParse({
      slot: 'ContextualUser',
      text: 'Context info.',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.priority).toBe(50)
  })
})
