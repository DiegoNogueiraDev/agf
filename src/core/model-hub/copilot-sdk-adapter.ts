/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Adapter real do SDK do GitHub Copilot (`@github/copilot-sdk`), que controla o
 * Copilot CLI via JSON-RPC. É uma integração OPCIONAL e carregada por import
 * dinâmico — a dep não entra no bundle e o core compila sem ela. Quando o SDK
 * ou a autenticação/CLI não estão presentes, `generate` lança
 * `ModelAdapterError` e o autopilot escala (guardrail).
 *
 * API usada (de @github/copilot-sdk@1.0.0):
 *   new CopilotClient() → start() → createSession({ model, onPermissionRequest })
 *   → session.send(prompt): Promise<string> → session.disconnect() → client.stop()
 *
 * ⚠ Validável apenas num runtime com Copilot CLI + auth (conectividade). Os IDs
 * de modelo do MODEL_POOL devem casar com os aceitos pelo Copilot CLI; ajuste
 * via `modelIdMap` se o seu CLI usar slugs diferentes.
 */
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from './model-client.js'

const log = createLogger({ layer: 'core', source: 'copilot-sdk-adapter.ts' })

export class ModelAdapterError extends McpGraphError {
  /** HTTP status quando a falha veio de uma resposta do provider (p/ classifyLlmError). */
  readonly status?: number
  /** Espera sugerida (ms), derivada de `retry-after` em respostas 429. */
  readonly retryAfterMs?: number

  constructor(message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(`Model adapter error: ${message}`)
    this.name = 'ModelAdapterError'
    this.status = opts.status
    this.retryAfterMs = opts.retryAfterMs
  }
}

// ── Superfície mínima do SDK que consumimos (resiliente a mudanças amplas) ──
interface SdkSession {
  send(prompt: string): Promise<string>
  disconnect(): Promise<void>
}
interface SdkClient {
  start(): Promise<void>
  stop(): Promise<unknown>
  createSession(config: { model: string; onPermissionRequest?: unknown }): Promise<SdkSession>
}
interface SdkModule {
  CopilotClient: new (options?: unknown) => SdkClient
  approveAll: unknown
}

export interface CopilotSdkAdapterOptions {
  /** Mapeia ID canônico (MODEL_POOL) → slug aceito pelo Copilot CLI, se diferirem. */
  modelIdMap?: Record<string, string>
}

/** Adapter que delega a geração ao Copilot CLI via SDK. */
export class CopilotSdkAdapter implements ModelAdapter {
  constructor(private readonly options: CopilotSdkAdapterOptions = {}) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    let mod: SdkModule
    try {
      mod = (await import('@github/copilot-sdk')) as unknown as SdkModule
    } catch {
      throw new ModelAdapterError(
        '@github/copilot-sdk não disponível — instale a dep opcional num runtime conectado ao Copilot.',
      )
    }

    const model = this.options.modelIdMap?.[request.model] ?? request.model
    const client = new mod.CopilotClient()

    try {
      await client.start()
    } catch (err) {
      throw new ModelAdapterError(
        `Falha ao iniciar o Copilot CLI (auth/conectividade?): ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    try {
      const session = await client.createSession({ model, onPermissionRequest: mod.approveAll })
      try {
        const prompt = request.system ? `${request.system}\n\n${request.prompt}` : request.prompt
        const text = await session.send(prompt)
        log.info('Copilot SDK generate ok', { model })
        return { text, model: request.model }
      } finally {
        await session.disconnect()
      }
    } finally {
      await client.stop()
    }
  }
}
