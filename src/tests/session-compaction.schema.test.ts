import { describe, it, expect } from 'vitest'
import { CompactionConfigSchema, CompactionResultSchema } from '../schemas/session-compaction.schema.js'

describe('CompactionConfigSchema', () => {
  it('accepts valid config', () => {
    const result = CompactionConfigSchema.safeParse({
      preserveRecentMessages: 6,
      maxEstimatedTokens: 20000,
    })
    expect(result.success).toBe(true)
  })

  it('applies defaults', () => {
    const result = CompactionConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.preserveRecentMessages).toBe(4)
      expect(result.data.maxEstimatedTokens).toBe(10000)
    }
  })

  it('rejects non-positive values', () => {
    expect(CompactionConfigSchema.safeParse({ preserveRecentMessages: 0 }).success).toBe(false)
  })
})

describe('CompactionResultSchema', () => {
  it('accepts a valid result', () => {
    const result = CompactionResultSchema.safeParse({
      originalMessageCount: 20,
      preservedMessageCount: 4,
      removedMessageCount: 16,
      estimatedTokensSaved: 8000,
      compactedMessages: [
        { role: 'system', content: 'Summary of conversation.' },
        { role: 'user', content: 'Hello' },
      ],
      summarizedContent: 'Summary of conversation.',
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative counts', () => {
    expect(
      CompactionResultSchema.safeParse({
        originalMessageCount: -1,
        preservedMessageCount: 0,
        removedMessageCount: 0,
        estimatedTokensSaved: 0,
        compactedMessages: [],
        summarizedContent: '',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid message role', () => {
    expect(
      CompactionResultSchema.safeParse({
        originalMessageCount: 1,
        preservedMessageCount: 1,
        removedMessageCount: 0,
        estimatedTokensSaved: 0,
        compactedMessages: [{ role: 'unknown', content: 'x' }],
        summarizedContent: '',
      }).success,
    ).toBe(false)
  })
})
