import { describe, it, expect } from 'vitest'
import {
  ThreadStatusSchema,
  TurnStatusSchema,
  UserTextInputSchema,
  UserImageInputSchema,
} from '../schemas/app-server-thread.schema.js'

describe('ThreadStatusSchema', () => {
  it('accepts NotLoaded', () => {
    expect(ThreadStatusSchema.safeParse('NotLoaded').success).toBe(true)
  })

  it('accepts Idle', () => {
    expect(ThreadStatusSchema.safeParse('Idle').success).toBe(true)
  })

  it('accepts SystemError', () => {
    expect(ThreadStatusSchema.safeParse('SystemError').success).toBe(true)
  })

  it('accepts Active with flags', () => {
    expect(ThreadStatusSchema.safeParse({ Active: { flags: ['streaming'] } }).success).toBe(true)
  })

  it('accepts Active with empty flags', () => {
    expect(ThreadStatusSchema.safeParse({ Active: { flags: [] } }).success).toBe(true)
  })

  it('rejects unknown string', () => {
    expect(ThreadStatusSchema.safeParse('Running').success).toBe(false)
  })
})

describe('TurnStatusSchema', () => {
  it('accepts all turn statuses', () => {
    for (const s of ['Starting', 'AwaitingInput', 'Running', 'Stopping', 'Stopped', 'Error']) {
      expect(TurnStatusSchema.safeParse(s).success).toBe(true)
    }
  })

  it('rejects unknown status', () => {
    expect(TurnStatusSchema.safeParse('Idle').success).toBe(false)
  })
})

describe('UserTextInputSchema', () => {
  it('accepts a text input', () => {
    expect(UserTextInputSchema.safeParse({ Text: 'Hello, world!' }).success).toBe(true)
  })

  it('accepts empty text', () => {
    expect(UserTextInputSchema.safeParse({ Text: '' }).success).toBe(true)
  })
})

describe('UserImageInputSchema', () => {
  it('accepts a base64 image', () => {
    expect(UserImageInputSchema.safeParse({ Image: 'data:image/png;base64,abc123' }).success).toBe(true)
  })
})
