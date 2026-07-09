import { describe, it, expect } from 'vitest'
import { ECONOMY_PIPELINE_ORDER, buildEconomyPipeline } from '../core/economy/economy-pipeline.js'

describe('ECONOMY_PIPELINE_ORDER', () => {
  it('is a non-empty array', () => {
    expect(ECONOMY_PIPELINE_ORDER.length).toBeGreaterThan(0)
  })

  it('contains llm as last element', () => {
    const last = ECONOMY_PIPELINE_ORDER[ECONOMY_PIPELINE_ORDER.length - 1]
    expect(last).toBe('llm')
  })

  it('all stages are strings', () => {
    for (const stage of ECONOMY_PIPELINE_ORDER) {
      expect(typeof stage).toBe('string')
    }
  })
})

describe('buildEconomyPipeline', () => {
  it('returns a function', () => {
    const llmFn = async (req: string) => `response: ${req}`
    const pipeline = buildEconomyPipeline({ llmFn })
    expect(typeof pipeline).toBe('function')
  })

  it('passes request to llmFn when no stages are enabled', async () => {
    const llmFn = async (req: string) => `response: ${req}`
    const pipeline = buildEconomyPipeline({ llmFn, stages: {} })
    const result = await pipeline('hello')
    expect(result).toBe('response: hello')
  })

  it('llmFn is always the terminal stage', async () => {
    let called = false
    const llmFn = async (req: string) => {
      called = true
      return `ok: ${req}`
    }
    const pipeline = buildEconomyPipeline({ llmFn })
    await pipeline('test')
    expect(called).toBe(true)
  })
})
