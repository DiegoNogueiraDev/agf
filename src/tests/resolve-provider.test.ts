/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_9014fcbe32e8 — selectProvider/buildProviderAdapter: escolhe Copilot
 * (default) ou um provider OpenAI-compatible quando configurado + chave presente.
 * Não-regressão: sem config → Copilot.
 */
import { describe, it, expect } from 'vitest'
import { selectProvider, buildProviderAdapter } from '../core/model-hub/resolve-provider.js'
import { OpenAICompatibleAdapter } from '../core/model-hub/openai-compatible-adapter.js'

describe('selectProvider — escolha de provider (#P3)', () => {
  it('sem setting → copilot (default, não-regressão)', () => {
    expect(selectProvider(null, {}).kind).toBe('copilot')
  })

  it("'groq' + GROQ_API_KEY → openai-compatible groq", () => {
    const c = selectProvider('groq', { GROQ_API_KEY: 'sk-x' })
    expect(c.kind).toBe('openai-compatible')
    if (c.kind === 'openai-compatible') {
      expect(c.providerId).toBe('groq')
      expect(c.baseURL).toContain('groq.com')
      expect(c.apiKey).toBe('sk-x')
    }
  })

  it("'groq' SEM chave → cai para copilot (não-regressão)", () => {
    expect(selectProvider('groq', {}).kind).toBe('copilot')
  })

  it("'ollama' (não requer chave) → openai-compatible mesmo sem env", () => {
    expect(selectProvider('ollama', {}).kind).toBe('openai-compatible')
  })

  it('OLLAMA_BASE_URL aponta o ollama p/ um servidor remoto', () => {
    const c = selectProvider('ollama', { OLLAMA_BASE_URL: 'http://192.168.1.50:11434/v1' })
    expect(c.kind).toBe('openai-compatible')
    if (c.kind === 'openai-compatible') {
      expect(c.providerId).toBe('ollama')
      expect(c.baseURL).toBe('http://192.168.1.50:11434/v1')
    }
  })

  it('override de baseURL também vale p/ providers com chave', () => {
    const c = selectProvider('openai', { OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'http://gw.local/v1' })
    if (c.kind === 'openai-compatible') expect(c.baseURL).toBe('http://gw.local/v1')
  })

  it('sem override → baseURL do registry (não-regressão)', () => {
    const c = selectProvider('ollama', {})
    if (c.kind === 'openai-compatible') expect(c.baseURL).toContain('11434')
  })

  it('base-URL persistido (CLI/TUI) é usado quando não há env', () => {
    const c = selectProvider('ollama', {}, 'http://lab:11434/v1')
    if (c.kind === 'openai-compatible') expect(c.baseURL).toBe('http://lab:11434/v1')
  })

  it('precedência: env <ID>_BASE_URL vence o setting persistido', () => {
    const c = selectProvider('ollama', { OLLAMA_BASE_URL: 'http://env:11434/v1' }, 'http://persisted:11434/v1')
    if (c.kind === 'openai-compatible') expect(c.baseURL).toBe('http://env:11434/v1')
  })

  it('setting persistido vazio/whitespace → cai para o registry', () => {
    const c = selectProvider('ollama', {}, '   ')
    if (c.kind === 'openai-compatible') expect(c.baseURL).toContain('11434')
  })

  it("'anthropic' (excluído) → copilot", () => {
    expect(selectProvider('anthropic', { ANTHROPIC_API_KEY: 'x' }).kind).toBe('copilot')
  })
})

describe('buildProviderAdapter — constrói o adapter da escolha (#P3)', () => {
  it('escolha openai-compatible → OpenAICompatibleAdapter', () => {
    const adapter = buildProviderAdapter({
      kind: 'openai-compatible',
      providerId: 'groq',
      baseURL: 'http://x/v1',
      apiKey: 'k',
    })
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter)
  })

  // B1: OpenRouter liga o response-cache server-side via header (kill-switch env).
  it('openrouter → envia X-OpenRouter-Cache (e respeita AGF_OPENROUTER_CACHE=0)', async () => {
    const orig = globalThis.fetch
    let seen: Record<string, string> = {}
    globalThis.fetch = (async (_url: string, init: { headers: Record<string, string> }) => {
      seen = init.headers
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }),
        text: async () => '',
      }
    }) as unknown as typeof fetch
    try {
      const choice = {
        kind: 'openai-compatible' as const,
        providerId: 'openrouter',
        baseURL: 'http://x/v1',
        apiKey: 'k',
      }
      await buildProviderAdapter(choice, {}).generate({ model: 'm', prompt: 'p' })
      expect(seen['X-OpenRouter-Cache']).toBe('true')

      await buildProviderAdapter(choice, { AGF_OPENROUTER_CACHE: '0' }).generate({ model: 'm', prompt: 'p' })
      expect(seen['X-OpenRouter-Cache']).toBeUndefined()
    } finally {
      globalThis.fetch = orig
    }
  })
})
