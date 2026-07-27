/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_883287cd08b4 — Adapter para qualquer endpoint OpenAI-compatible
 * (/chat/completions): OpenAI, OpenRouter, Groq, DeepSeek, Ollama, etc. Um único
 * adapter desbloqueia vários providers. Implementa ModelAdapter; fetch injetável
 * (testes sem rede). Erros HTTP carregam `status` para o classifyLlmError.
 * EXCLUI Anthropic por decisão do dono (usa o CLI deles).
 */
import { ModelAdapterError } from './copilot-sdk-adapter.js'
import type { FetchLike } from './copilot-auth.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from './model-client.js'
import { effortToWire } from './effort-router.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'openai-compatible-adapter.ts' })

export interface OpenAICompatibleOptions {
  /** Base URL terminando em /v1 (ex.: https://api.groq.com/openai/v1). */
  baseURL: string
  /** Chave Bearer. Opcional para endpoints locais (ex.: Ollama). */
  apiKey?: string
  /** fetch injetável (default: global). */
  fetchFn?: FetchLike
  /** Nome do provider, para logs. */
  provider?: string
  /** Headers extras (ex.: `X-OpenRouter-Cache` p/ o response-cache server-side). */
  extraHeaders?: Record<string, string>
  /**
   * Como (e SE) enviar o esforço de raciocínio (Frente C). `reasoning` é um
   * OpenRouter-ism; OpenAI usa `reasoning_effort` top-level; Ollama/Groq/Cerebras
   * REJEITAM ambos ("does not support thinking"). Default `none` → não envia.
   */
  reasoningStyle?: 'openrouter' | 'openai' | 'none'
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    // Cache hit de prefixo (OpenAI/Cerebras/Groq/OpenRouter): subconjunto do input barato.
    prompt_tokens_details?: { cached_tokens?: number }
    // DeepSeek NATIVO reporta o cache hit aqui (campo diferente do OpenAI).
    prompt_cache_hit_tokens?: number
    // Tokens de raciocínio (output caro) — medição T_reason da Frente C.
    completion_tokens_details?: { reasoning_tokens?: number }
  }
}

/** ModelAdapter genérico sobre a API OpenAI-compatible. */
export class OpenAICompatibleAdapter implements ModelAdapter {
  private readonly baseURL: string
  private readonly apiKey?: string
  private readonly fetchFn: FetchLike
  private readonly provider: string
  private readonly extraHeaders: Record<string, string>
  private readonly reasoningStyle: 'openrouter' | 'openai' | 'none'

  constructor(options: OpenAICompatibleOptions) {
    this.baseURL = options.baseURL.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
    this.provider = options.provider ?? 'openai-compatible'
    this.extraHeaders = options.extraHeaders ?? {}
    this.reasoningStyle = options.reasoningStyle ?? 'none'
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // Visão: quando há imagens, o conteúdo do user vira content-parts (texto +
    // image_url). Sem imagens → string simples (corpo idêntico ao legado).
    const userContent =
      request.images && request.images.length > 0
        ? [
            { type: 'text', text: request.prompt },
            ...request.images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ]
        : request.prompt
    const messages = request.system
      ? [
          { role: 'system', content: request.system },
          { role: 'user', content: userContent },
        ]
      : [{ role: 'user', content: userContent }]

    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...this.extraHeaders }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`

    // Frente C: esforço de raciocínio condicional, SÓ no estilo que o provider
    // aceita. OpenRouter usa `reasoning.effort`; OpenAI usa `reasoning_effort`;
    // demais (Ollama/Groq/Cerebras) rejeitam → `none` omite. Sem effort → idêntico
    // ao legado (não-regressão).
    const payload: Record<string, unknown> = { model: request.model, messages, stream: false }
    if (request.effort && this.reasoningStyle !== 'none') {
      const wire = effortToWire(request.effort)
      if (this.reasoningStyle === 'openrouter') payload.reasoning = { effort: wire }
      else payload.reasoning_effort = wire // 'openai'
    }

    let res
    try {
      res = await this.fetchFn(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
    } catch (err) {
      throw new ModelAdapterError(
        `falha de rede no provider ${this.provider}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      const retryAfterRaw = res.headers?.get?.('retry-after')
      const retryAfterMs =
        retryAfterRaw && Number.isFinite(Number(retryAfterRaw)) ? Math.round(Number(retryAfterRaw) * 1000) : undefined
      throw new ModelAdapterError(
        `provider ${this.provider} retornou ${res.status}: ${(await res.text()).slice(0, 200)}`,
        {
          status: res.status,
          retryAfterMs,
        },
      )
    }

    const body = (await res.json()) as ChatCompletion
    const text = body.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new ModelAdapterError(`resposta do provider ${this.provider} sem conteúdo.`)
    }
    // OpenAI/Cerebras/Groq/OpenRouter usam prompt_tokens_details.cached_tokens;
    // DeepSeek NATIVO usa prompt_cache_hit_tokens. Cobrir os dois num só ponto.
    const cachedTokensIn = body.usage?.prompt_tokens_details?.cached_tokens ?? body.usage?.prompt_cache_hit_tokens
    const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens
    log.info('OpenAI-compatible generate ok', {
      provider: this.provider,
      model: request.model,
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
      cachedTokensIn,
      reasoningTokens,
    })
    return {
      text,
      model: request.model,
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
      cachedTokensIn,
      reasoningTokens,
    }
  }
}
