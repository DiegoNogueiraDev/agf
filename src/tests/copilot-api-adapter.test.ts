import { describe, it, expect } from 'vitest'
import { CopilotApiAdapter } from '../core/model-hub/copilot-api-adapter.js'
import { ModelAdapterError } from '../core/model-hub/copilot-sdk-adapter.js'
import type { FetchLike, FetchResponse } from '../core/model-hub/copilot-auth.js'

const token = async (): Promise<{ token: string; apiBase: string }> => ({
  token: 'cop_jwt',
  apiBase: 'https://api.githubcopilot.com',
})

function completion(content: string): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
    }),
    text: async () => '',
  }
}

describe('CopilotApiAdapter — chat/completions HTTP (M1u)', () => {
  it('POSTa em /chat/completions com headers Copilot e mapeia text+usage', async () => {
    let seenUrl = ''
    let seenHeaders: Record<string, string> = {}
    let seenBody: Record<string, unknown> = {}
    const fetchFn: FetchLike = async (url, init) => {
      seenUrl = url
      seenHeaders = init?.headers ?? {}
      seenBody = JSON.parse(init?.body ?? '{}')
      return completion('olá mundo')
    }
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    const res = await adapter.generate({ model: 'claude-sonnet-4.6', prompt: 'oi' })

    expect(seenUrl).toBe('https://api.githubcopilot.com/chat/completions')
    expect(seenHeaders.Authorization).toBe('Bearer cop_jwt')
    expect(seenHeaders['Copilot-Integration-Id']).toBe('vscode-chat')
    expect(seenHeaders['Editor-Version']).toBeTruthy()
    expect(seenBody.model).toBe('claude-sonnet-4.6')
    expect(seenBody.stream).toBe(false)
    expect(res.text).toBe('olá mundo')
    expect(res.tokensIn).toBe(12)
    expect(res.tokensOut).toBe(7)
    expect(res.model).toBe('claude-sonnet-4.6')
  })

  it('inclui mensagem system quando fornecida', async () => {
    let body: Record<string, unknown> = {}
    const fetchFn: FetchLike = async (_url, init) => {
      body = JSON.parse(init?.body ?? '{}')
      return completion('ok')
    }
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    await adapter.generate({ model: 'gpt-4o', prompt: 'tarefa', system: 'você é um agente TDD' })
    const messages = body.messages as Array<{ role: string; content: string }>
    expect(messages[0]).toEqual({ role: 'system', content: 'você é um agente TDD' })
    expect(messages[1].role).toBe('user')
  })

  it('aplica modelIdMap ao id do modelo', async () => {
    let body: Record<string, unknown> = {}
    const fetchFn: FetchLike = async (_u, init) => {
      body = JSON.parse(init?.body ?? '{}')
      return completion('ok')
    }
    const adapter = new CopilotApiAdapter({
      fetchFn,
      getToken: token,
      modelIdMap: { 'claude-opus-4.6': 'claude-opus-4' },
    })
    await adapter.generate({ model: 'claude-opus-4.6', prompt: 'x' })
    expect(body.model).toBe('claude-opus-4')
  })

  it('401/403 → ModelAdapterError clara', async () => {
    const fetchFn: FetchLike = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'unauthorized',
    })
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    await expect(adapter.generate({ model: 'gpt-4o', prompt: 'x' })).rejects.toBeInstanceOf(ModelAdapterError)
  })

  it('resposta sem content → ModelAdapterError', async () => {
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
      text: async () => '',
    })
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    await expect(adapter.generate({ model: 'gpt-4o', prompt: 'x' })).rejects.toBeInstanceOf(ModelAdapterError)
  })

  // Frente C: Copilot expõe modo de raciocínio (OpenAI-compatible).
  it('com effort → body inclui reasoning_effort (minimal→low)', async () => {
    let body: Record<string, unknown> = {}
    const fetchFn: FetchLike = async (_u, init) => {
      body = JSON.parse(init?.body ?? '{}')
      return completion('ok')
    }
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    await adapter.generate({ model: 'gpt-5.5', prompt: 'x', effort: 'minimal' })
    expect(body.reasoning_effort).toBe('low')
  })

  it('sem effort → body NÃO inclui reasoning_effort (não-regressão)', async () => {
    let body: Record<string, unknown> = {}
    const fetchFn: FetchLike = async (_u, init) => {
      body = JSON.parse(init?.body ?? '{}')
      return completion('ok')
    }
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    await adapter.generate({ model: 'gpt-5.5', prompt: 'x' })
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('lê cached_tokens do usage se o GitHub passar (medição defensiva)', async () => {
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 64 } },
      }),
      text: async () => '',
    })
    const adapter = new CopilotApiAdapter({ fetchFn, getToken: token })
    const res = await adapter.generate({ model: 'gpt-5.5', prompt: 'x' })
    expect(res.cachedTokensIn).toBe(64)
  })
})
