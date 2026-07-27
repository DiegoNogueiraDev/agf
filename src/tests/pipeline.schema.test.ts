import { describe, it, expect } from 'vitest'
import { PipelineStepSchema, PipelineStepResultSchema, PipelineResultSchema } from '../schemas/pipeline.schema.js'

describe('PipelineStepSchema', () => {
  it('accepts a valid step', () => {
    const result = PipelineStepSchema.safeParse({
      tool: 'agf/stats',
      args: { limit: 10 },
    })
    expect(result.success).toBe(true)
  })

  it('defaults args to empty object', () => {
    const result = PipelineStepSchema.safeParse({ tool: 'agf/next' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.args).toEqual({})
  })

  it('rejects empty tool name', () => {
    expect(PipelineStepSchema.safeParse({ tool: '' }).success).toBe(false)
  })
})

describe('PipelineStepResultSchema', () => {
  it('accepts a success result', () => {
    const result = PipelineStepResultSchema.safeParse({
      stepIndex: 0,
      tool: 'agf/stats',
      status: 'success',
      durationMs: 120,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(
      PipelineStepResultSchema.safeParse({
        stepIndex: 0,
        tool: 'x',
        status: 'pending',
        durationMs: 0,
      }).success,
    ).toBe(false)
  })
})

describe('PipelineResultSchema', () => {
  it('accepts a complete result', () => {
    const result = PipelineResultSchema.safeParse({
      ok: true,
      stepsTotal: 2,
      stepsCompleted: 2,
      stepsFailed: 0,
      stepsSkipped: 0,
      steps: [],
      totalDurationMs: 500,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative step counts', () => {
    expect(
      PipelineResultSchema.safeParse({
        ok: false,
        stepsTotal: -1,
        stepsCompleted: 0,
        stepsFailed: 0,
        stepsSkipped: 0,
        steps: [],
        totalDurationMs: 0,
      }).success,
    ).toBe(false)
  })
})
