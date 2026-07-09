/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Adapter HTTP direto do GitHub Copilot (M1u) — fala com
 * `api.githubcopilot.com/chat/completions` (formato OpenAI-compatível) usando o
 * token obtido em `copilot-auth.ts`, SEM depender do binário `copilot` CLI.
 * Técnica do provider do opencode (MIT), reimplementada zero-dep (fetch nativo).
 *
 * Vantagem sobre o adapter via-CLI: a resposta traz `usage` (prompt/completion
 * tokens) — o token-ledger passa a medir tokens REAIS, não estimados.
 */
import { randomUUID } from 'node:crypto'
import { createLogger } from '../utils/logger.js'
import { ModelAdapterError } from './copilot-sdk-adapter.js'
import { getValidCopilotToken, type FetchLike } from './copilot-auth.js'
import { effortToWire } from './effort-router.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from './model-client.js'

const log = createLogger({ layer: 'core', source: 'copilot-api-adapter.ts' })
const USER_AGENT = 'GitHubCopilotChat/0.35.0'

export interface CopilotApiAdapterOptions {
  /** Fetch injetável (default: global). */
  fetchFn?: FetchLike
  /** Caminho do auth.json (default: ~/.config/agent-graph-flow/auth.json). */
  authFilePath?: string
  /** Provedor de token (testes); default: `getValidCopilotToken`. */
  getToken?: () => Promise<{ token: string; apiBase: string }>
  /** Mapeia ID canônico → slug aceito pelo Copilot, se diferirem. */
  modelIdMap?: Record<string, string>
}

interface ChatChoice {
  message?: { content?: string }
}
interface ChatCompletion {
  choices?: ChatChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    // Defensivo: se o GitHub passar o cache hit adiante, medimos de graça.
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

/** Adapter que gera via HTTP direto na API do Copilot. */
export class CopilotApiAdapter implements ModelAdapter {
  private readonly fetchFn: FetchLike
  private readonly getToken: () => Promise<{ token: string; apiBase: string }>
  private readonly modelIdMap: Record<string, string>

  constructor(options: CopilotApiAdapterOptions = {}) {
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
    this.modelIdMap = options.modelIdMap ?? {}
    this.getToken =
      options.getToken ?? (() => getValidCopilotToken({ fetchFn: this.fetchFn, authFilePath: options.authFilePath }))
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const { token, apiBase } = await this.getToken()
    const model = this.modelIdMap[request.model] ?? request.model

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

    // Frente C: o Copilot é OpenAI-compatible e expõe modo de raciocínio (a maior
    // alavanca de custo, 4–7×). Passamos `reasoning_effort` quando roteado.
    const payload: Record<string, unknown> = { model, messages, stream: false }
    if (request.effort) payload.reasoning_effort = effortToWire(request.effort)

    let res
    try {
      res = await this.fetchFn(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Copilot-Integration-Id': 'vscode-chat',
          'Editor-Version': 'vscode/1.85.1',
          'Editor-Plugin-Version': 'copilot/1.155.0',
          'OpenAI-Intent': 'chat-completions',
          'X-Request-Id': randomUUID(),
        },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      throw new ModelAdapterError(
        `falha de rede ao chamar a API do Copilot: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new ModelAdapterError('token Copilot expirado/inválido (401/403) — rode `agf login` novamente.', {
          status: res.status,
        })
      }
      // Preserva status + retry-after para que classifyLlmError respeite o backoff.
      const retryAfterRaw = res.headers?.get?.('retry-after')
      const retryAfterMs =
        retryAfterRaw && Number.isFinite(Number(retryAfterRaw)) ? Math.round(Number(retryAfterRaw) * 1000) : undefined
      throw new ModelAdapterError(`API do Copilot retornou ${res.status}: ${(await res.text()).slice(0, 200)}`, {
        status: res.status,
        retryAfterMs,
      })
    }

    const body = (await res.json()) as ChatCompletion
    const text = body.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new ModelAdapterError('resposta da API do Copilot sem conteúdo.')
    }
    const cachedTokensIn = body.usage?.prompt_tokens_details?.cached_tokens
    log.info('Copilot API generate ok', {
      model,
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
      cachedTokensIn,
    })
    return {
      text,
      model: request.model,
      tokensIn: body.usage?.prompt_tokens,
      tokensOut: body.usage?.completion_tokens,
      cachedTokensIn,
    }
  }
}
