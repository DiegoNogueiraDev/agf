/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_883287cd08b4 — OpenAICompatibleAdapter: ModelAdapter sobre a API
 * /chat/completions (OpenAI-compatible). Fetch injetável → testes sem rede.
 */
import { describe, it, expect } from 'vitest'
import { OpenAICompatibleAdapter } from '../core/model-hub/openai-compatible-adapter.js'
import type { FetchLike, FetchResponse } from '../core/model-hub/copilot-auth.js'

function fakeFetch(captured: { url?: string; init?: unknown }, body: unknown, ok = true, status = 200): FetchLike {
  return async (url, init): Promise<FetchResponse> => {
    captured.url = url
    captured.init = init
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }
}

const completion = {
  choices: [{ message: { content: 'resultado' } }],
  usage: { prompt_tokens: 12, completion_tokens: 7 },
}

describe('OpenAICompatibleAdapter — ModelAdapter (#P1)', () => {
  it('generate retorna text do choices[0].message.content e tokens do usage', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'sk-test',
      fetchFn: fakeFetch(cap, completion),
    })
    const res = await adapter.generate({ model: 'llama-3', prompt: 'oi' })
    expect(res.text).toBe('resultado')
    expect(res.tokensIn).toBe(12)
    expect(res.tokensOut).toBe(7)
    expect(cap.url).toContain('/chat/completions')
  })

  it('envia Authorization: Bearer com a apiKey', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'sk-abc',
      fetchFn: fakeFetch(cap, completion),
    })
    await adapter.generate({ model: 'm', prompt: 'oi' })
    const headers = (cap.init as { headers: Record<string, string> }).headers
    expect(headers.Authorization).toBe('Bearer sk-abc')
  })

  it('com system → messages com role system + user', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
    })
    await adapter.generate({ model: 'm', prompt: 'P', system: 'S' })
    const sent = JSON.parse((cap.init as { body: string }).body) as { messages: { role: string }[] }
    expect(sent.messages.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('res.ok=false → lança erro com status (classificável)', async () => {
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch({}, { error: 'boom' }, false, 429),
    })
    await expect(adapter.generate({ model: 'm', prompt: 'oi' })).rejects.toMatchObject({ status: 429 })
  })

  // Frente C — esforço de raciocínio condicional vai no fio, no estilo do provider.
  it('reasoningStyle=openrouter → body inclui reasoning.effort (enum low|medium|high)', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
      reasoningStyle: 'openrouter',
    })
    await adapter.generate({ model: 'm', prompt: 'P', effort: 'high' })
    const sent = JSON.parse((cap.init as { body: string }).body) as { reasoning?: { effort?: string } }
    expect(sent.reasoning?.effort).toBe('high')
  })

  it('reasoningStyle=openai → body inclui reasoning_effort top-level', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
      reasoningStyle: 'openai',
    })
    await adapter.generate({ model: 'm', prompt: 'P', effort: 'minimal' })
    const sent = JSON.parse((cap.init as { body: string }).body) as { reasoning_effort?: string }
    expect(sent.reasoning_effort).toBe('low') // minimal colapsa em low
  })

  it('reasoningStyle=none (default, ex.: Ollama) → NUNCA envia reasoning, mesmo com effort', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
    })
    await adapter.generate({ model: 'qwen2.5-coder:7b', prompt: 'P', effort: 'high' })
    const sent = JSON.parse((cap.init as { body: string }).body) as { reasoning?: unknown; reasoning_effort?: unknown }
    expect(sent.reasoning).toBeUndefined()
    expect(sent.reasoning_effort).toBeUndefined()
  })

  it('captura reasoning_tokens do usage (medição T_reason — Frente C)', async () => {
    const withReason = {
      choices: [{ message: { content: 'r' } }],
      usage: { prompt_tokens: 10, completion_tokens: 40, completion_tokens_details: { reasoning_tokens: 30 } },
    }
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch({}, withReason),
    })
    const res = await adapter.generate({ model: 'm', prompt: 'oi', effort: 'high' })
    expect(res.reasoningTokens).toBe(30)
  })

  // DeepSeek NATIVO reporta o cache hit em prompt_cache_hit_tokens (campo diferente).
  it('captura cache hit do DeepSeek nativo (prompt_cache_hit_tokens)', async () => {
    const ds = {
      choices: [{ message: { content: 'r' } }],
      usage: { prompt_tokens: 200, completion_tokens: 10, prompt_cache_hit_tokens: 192 },
    }
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'k',
      fetchFn: fakeFetch({}, ds),
      provider: 'deepseek',
    })
    const res = await adapter.generate({ model: 'deepseek-chat', prompt: 'oi' })
    expect(res.cachedTokensIn).toBe(192)
  })

  it('prefere prompt_tokens_details.cached_tokens quando ambos presentes (OpenAI-style)', async () => {
    const both = {
      choices: [{ message: { content: 'r' } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 50 },
        prompt_cache_hit_tokens: 99,
      },
    }
    const adapter = new OpenAICompatibleAdapter({ baseURL: 'http://x/v1', apiKey: 'k', fetchFn: fakeFetch({}, both) })
    const res = await adapter.generate({ model: 'm', prompt: 'oi' })
    expect(res.cachedTokensIn).toBe(50)
  })

  it('com images → user content vira parts (text + image_url); sem images → string', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
    })
    await adapter.generate({ model: 'gpt-4o', prompt: 'descreva', images: ['data:image/png;base64,AAA'] })
    const sent = JSON.parse((cap.init as { body: string }).body) as { messages: Array<{ content: unknown }> }
    const content = sent.messages[0].content as Array<{ type: string; image_url?: { url: string } }>
    expect(Array.isArray(content)).toBe(true)
    expect(content[0]).toEqual({ type: 'text', text: 'descreva' })
    expect(content[1].type).toBe('image_url')
    expect(content[1].image_url?.url).toContain('base64,AAA')
  })

  it('sem images → content é string (não-regressão)', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
    })
    await adapter.generate({ model: 'm', prompt: 'oi' })
    const sent = JSON.parse((cap.init as { body: string }).body) as { messages: Array<{ content: unknown }> }
    expect(typeof sent.messages[0].content).toBe('string')
  })

  it('envia extraHeaders (ex.: X-OpenRouter-Cache)', async () => {
    const cap: { url?: string; init?: unknown } = {}
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'http://x/v1',
      apiKey: 'k',
      fetchFn: fakeFetch(cap, completion),
      extraHeaders: { 'X-OpenRouter-Cache': 'true' },
    })
    await adapter.generate({ model: 'm', prompt: 'P' })
    const headers = (cap.init as { headers: Record<string, string> }).headers
    expect(headers['X-OpenRouter-Cache']).toBe('true')
  })
})
