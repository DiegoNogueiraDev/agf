/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_92cf517b3dbe — provider-registry: catálogo de providers OpenAI-compatible
 * (exclui Anthropic). Puro.
 */
import { describe, it, expect } from 'vitest'
import { resolveProviderConfig, listProviders } from '../core/model-hub/provider-registry.js'

describe('provider-registry (#P2)', () => {
  it("'groq' → baseURL da Groq + envVar GROQ_API_KEY", () => {
    const c = resolveProviderConfig('groq')
    expect(c?.baseURL).toContain('groq.com')
    expect(c?.envVar).toBe('GROQ_API_KEY')
    expect(c?.requiresKey).toBe(true)
  })

  it("'ollama' → baseURL local e não requer chave", () => {
    const c = resolveProviderConfig('ollama')
    expect(c?.baseURL).toContain('localhost')
    expect(c?.requiresKey).toBe(false)
  })

  it("'anthropic' → undefined (excluído por decisão do dono)", () => {
    expect(resolveProviderConfig('anthropic')).toBeUndefined()
  })

  it('listProviders inclui openai, openrouter, groq, deepseek, ollama', () => {
    const ids = listProviders()
    for (const id of ['openai', 'openrouter', 'groq', 'deepseek', 'ollama']) {
      expect(ids).toContain(id)
    }
    expect(ids).not.toContain('anthropic')
  })
})
