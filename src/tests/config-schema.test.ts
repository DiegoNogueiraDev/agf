import { describe, it, expect } from 'vitest'
import {
  ContextModeSchema,
  ProfileFilterConfigSchema,
  BrowserAutomationConfigSchema,
  FlowConfigSchema,
} from '../core/config/config-schema.js'

describe('ContextModeSchema', () => {
  it('accepts valid modes', () => {
    for (const mode of ['ultra-lean', 'lean', 'full']) {
      expect(ContextModeSchema.safeParse(mode).success).toBe(true)
    }
  })

  it('rejects invalid mode', () => {
    expect(ContextModeSchema.safeParse('compact').success).toBe(false)
  })
})

describe('ProfileFilterConfigSchema', () => {
  it('accepts valid profiles', () => {
    for (const p of ['core', 'pro', 'expert', 'all']) {
      expect(ProfileFilterConfigSchema.safeParse(p).success).toBe(true)
    }
  })

  it('rejects unknown profile', () => {
    expect(ProfileFilterConfigSchema.safeParse('premium').success).toBe(false)
  })
})

describe('BrowserAutomationConfigSchema', () => {
  it('parses with all defaults (no input)', () => {
    const result = BrowserAutomationConfigSchema.safeParse(undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(false)
      expect(result.data.maxStepsDefault).toBe(25)
    }
  })

  it('accepts valid explicit config', () => {
    const result = BrowserAutomationConfigSchema.safeParse({
      enabled: true,
      bridgeUrl: 'http://127.0.0.1:9876/v1',
      maxStepsDefault: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejects maxStepsDefault above 100', () => {
    const result = BrowserAutomationConfigSchema.safeParse({ maxStepsDefault: 200 })
    expect(result.success).toBe(false)
  })
})

describe('FlowConfigSchema', () => {
  it('parses with all defaults', () => {
    const result = FlowConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(false)
      expect(result.data.historyWindow).toBe(12)
    }
  })

  it('rejects lambdaBase below 0', () => {
    const result = FlowConfigSchema.safeParse({ lambdaBase: -1 })
    expect(result.success).toBe(false)
  })
})
