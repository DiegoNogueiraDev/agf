import { describe, it, expect } from 'vitest'
import { JourneyRunVerdictSchema, JourneyStepResultSchema, JourneyRunSchema } from '../schemas/journey-run.schema.js'

describe('JourneyRunVerdictSchema', () => {
  it('accepts valid verdicts', () => {
    for (const v of ['pass', 'fail', 'error', 'running']) {
      expect(JourneyRunVerdictSchema.safeParse(v).success).toBe(true)
    }
  })

  it('rejects unknown verdict', () => {
    expect(JourneyRunVerdictSchema.safeParse('skipped').success).toBe(false)
  })
})

describe('JourneyStepResultSchema', () => {
  it('accepts a valid step result', () => {
    const result = JourneyStepResultSchema.safeParse({
      index: 0,
      screenId: 'home',
      helper: 'navigate',
      ok: true,
      durationMs: 120,
      screenshotPath: 'screens/home.png',
      ocrText: null,
      domText: null,
      error: null,
    })
    expect(result.success).toBe(true)
  })

  it('defaults args to empty object', () => {
    const result = JourneyStepResultSchema.safeParse({
      index: 0,
      screenId: null,
      helper: 'click',
      ok: false,
      durationMs: 50,
      screenshotPath: null,
      ocrText: null,
      domText: null,
      error: 'timeout',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.args).toEqual({})
  })
})

describe('JourneyRunSchema', () => {
  it('accepts a valid run', () => {
    const result = JourneyRunSchema.safeParse({
      id: 'run-001',
      mapId: 'map-1',
      variantId: null,
      nodeId: null,
      prompt: null,
      plan: [],
      results: [],
      verdict: 'pass',
      durationMs: 500,
      createdAt: 1750000000,
      finishedAt: 1750000500,
    })
    expect(result.success).toBe(true)
  })
})
