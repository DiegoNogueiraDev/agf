import { describe, it, expect } from 'vitest'
import { HonchoConfigSchema, UserRepresentationSchema, PeerObservationSchema } from '../schemas/honcho.schema.js'

describe('HonchoConfigSchema', () => {
  it('accepts valid config', () => {
    const result = HonchoConfigSchema.safeParse({
      apiUrl: 'https://api.honcho.dev',
      dialecticDepth: 2,
      sessionResolution: 'per-session',
      observationMode: 'directional',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid dialecticDepth', () => {
    expect(
      HonchoConfigSchema.safeParse({
        apiUrl: 'https://api.honcho.dev',
        dialecticDepth: 4,
        sessionResolution: 'global',
        observationMode: 'unified',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid sessionResolution', () => {
    expect(
      HonchoConfigSchema.safeParse({
        apiUrl: 'https://api.honcho.dev',
        dialecticDepth: 1,
        sessionResolution: 'monthly',
        observationMode: 'unified',
      }).success,
    ).toBe(false)
  })
})

describe('UserRepresentationSchema', () => {
  it('accepts valid user', () => {
    const result = UserRepresentationSchema.safeParse({
      userId: 'user-123',
      updatedAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('defaults preferences to empty object', () => {
    const result = UserRepresentationSchema.safeParse({
      userId: 'user-123',
      updatedAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.preferences).toEqual({})
  })
})

describe('PeerObservationSchema', () => {
  it('accepts valid observation', () => {
    const result = PeerObservationSchema.safeParse({
      observerId: 'agent-a',
      targetId: 'agent-b',
      observation: 'Agent-b tends to over-explain',
      ts: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects confidence > 1', () => {
    expect(
      PeerObservationSchema.safeParse({
        observerId: 'a',
        targetId: 'b',
        observation: 'x',
        confidence: 1.5,
        ts: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(false)
  })
})
