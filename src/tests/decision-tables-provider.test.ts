import { describe, it, expect } from 'vitest'
import { selectProvider } from '../core/model-hub/resolve-provider.js'

/**
 * Decision table: Provider selection.
 *
 * Conditions:
 *   C1: providerSetting is null/undefined
 *   C2: providerSetting is known (openrouter, openai, groq, etc.)
 *   C3: providerSetting is unknown
 *   C4: provider requires API key
 *   C5: API key is present in env
 *   C6: baseUrlOverride is provided
 *
 * Actions:
 *   A1: Returns kind='copilot' (fallback)
 *   A2: Returns kind='openai-compatible' with providerId
 *   A3: Includes apiKey in result
 *   A4: Includes custom baseURL
 */
describe('Decision table: Provider selection', () => {
  it('C1: null setting → copilot', () => {
    const result = selectProvider(null, {})
    expect(result.kind).toBe('copilot')
  })

  it('C1: undefined setting → copilot', () => {
    const result = selectProvider(undefined, {})
    expect(result.kind).toBe('copilot')
  })

  it('C2+C4+C5: openrouter com chave → openai-compatible', () => {
    const result = selectProvider('openrouter', { OPENROUTER_API_KEY: 'sk-test' })
    expect(result.kind).toBe('openai-compatible')
    if (result.kind === 'openai-compatible') {
      expect(result.providerId).toBe('openrouter')
      expect(result.apiKey).toBe('sk-test')
    }
  })

  it('C2+C4+¬C5: openrouter sem chave → copilot fallback', () => {
    const result = selectProvider('openrouter', {})
    expect(result.kind).toBe('copilot')
  })

  it('C2+¬C4: ollama → openai-compatible sem chave', () => {
    const result = selectProvider('ollama', {})
    expect(result.kind).toBe('openai-compatible')
    if (result.kind === 'openai-compatible') {
      expect(result.providerId).toBe('ollama')
      expect(result.apiKey).toBeUndefined()
    }
  })

  it('C3: provider desconhecido → copilot', () => {
    const result = selectProvider('nonexistent-provider', {})
    expect(result.kind).toBe('copilot')
  })

  it('C6: baseUrlOverride sobrescreve URL', () => {
    const result = selectProvider('ollama', {}, 'http://custom:11434')
    expect(result.kind).toBe('openai-compatible')
    if (result.kind === 'openai-compatible') {
      expect(result.baseURL).toBe('http://custom:11434')
    }
  })
})
