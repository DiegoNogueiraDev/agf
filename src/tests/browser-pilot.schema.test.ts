import { describe, it, expect } from 'vitest'
import {
  BrowserPilotInputSchema,
  BrowserPilotErrorSchema,
  BROWSER_PILOT_MODELS,
  BROWSER_PILOT_ERROR_CODES,
} from '../schemas/browser-pilot.schema.js'

describe('BrowserPilotInputSchema', () => {
  it('accepts a minimal input', () => {
    const result = BrowserPilotInputSchema.safeParse({
      prompt: 'Navigate to https://example.com and take a screenshot',
    })
    expect(result.success).toBe(true)
  })

  it('defaults maxSteps to 25', () => {
    const result = BrowserPilotInputSchema.safeParse({ prompt: 'Do something' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.maxSteps).toBe(25)
  })

  it('defaults screenshotMode to key_steps', () => {
    const result = BrowserPilotInputSchema.safeParse({ prompt: 'Do something' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.screenshotMode).toBe('key_steps')
  })

  it('rejects empty prompt', () => {
    expect(BrowserPilotInputSchema.safeParse({ prompt: '' }).success).toBe(false)
  })

  it('rejects maxSteps > 100', () => {
    expect(BrowserPilotInputSchema.safeParse({ prompt: 'x', maxSteps: 101 }).success).toBe(false)
  })
})

describe('BrowserPilotErrorSchema', () => {
  it('accepts a valid error response', () => {
    expect(
      BrowserPilotErrorSchema.safeParse({
        success: false,
        error: {
          code: BROWSER_PILOT_ERROR_CODES[0],
          message: 'Browser session failed to start',
          retriable: false,
        },
      }).success,
    ).toBe(true)
  })
})

describe('BROWSER_PILOT_MODELS', () => {
  it('is a non-empty tuple of model strings', () => {
    expect(BROWSER_PILOT_MODELS.length).toBeGreaterThan(0)
    expect(typeof BROWSER_PILOT_MODELS[0]).toBe('string')
  })
})
