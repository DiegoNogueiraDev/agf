import { describe, it, expect } from 'vitest'
import { checkProviders, formatProviderReport } from '../core/doctor/provider-check.js'

describe('checkProviders', () => {
  it('returns a report object', () => {
    const report = checkProviders({})
    expect(report).toBeDefined()
    expect(Array.isArray(report.providers)).toBe(true)
  })

  it('reports all 10 known providers', () => {
    const report = checkProviders({})
    const names = report.providers.map((p) => p.provider)
    const expected = [
      'anthropic',
      'openai',
      'openrouter',
      'gemini',
      'bedrock',
      'azure',
      'deepseek',
      'glm',
      'kimi',
      'groq',
    ]
    for (const name of expected) {
      expect(names).toContain(name)
    }
  })

  it('marks provider as configured when env var is present', () => {
    const report = checkProviders({ ANTHROPIC_API_KEY: 'sk-test' })
    const anthropic = report.providers.find((p) => p.provider === 'anthropic')
    expect(anthropic?.configured).toBe(true)
  })

  it('marks provider as not configured when env var is absent', () => {
    const report = checkProviders({})
    const anthropic = report.providers.find((p) => p.provider === 'anthropic')
    expect(anthropic?.configured).toBe(false)
  })

  it('counts configured providers', () => {
    const report = checkProviders({ OPENAI_API_KEY: 'sk-openai', GEMINI_API_KEY: 'gemini-key' })
    expect(report.configuredCount).toBeGreaterThanOrEqual(2)
  })

  it('has gatewayWired field on each provider', () => {
    const report = checkProviders({})
    for (const p of report.providers) {
      expect(typeof p.gatewayWired).toBe('boolean')
    }
  })
})

describe('formatProviderReport', () => {
  it('returns an array of strings', () => {
    const report = checkProviders({})
    const lines = formatProviderReport(report)
    expect(Array.isArray(lines)).toBe(true)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('includes provider names in output', () => {
    const report = checkProviders({ ANTHROPIC_API_KEY: 'key' })
    const lines = formatProviderReport(report)
    const joined = lines.join('\n')
    expect(joined).toContain('anthropic')
  })
})
