/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `FailoverModelAdapter` — decorator de tolerância a falha **provider-agnóstico**.
 * Envolve uma lista ORDENADA de adapters; em erro terminal (ou resposta vazia,
 * quando há próximo), cai para o seguinte. Previsibilidade de custo + nunca trava.
 * Mesmo padrão do {@link CachingModelAdapter} (decorator sobre `ModelAdapter`).
 *
 * Não-regressão: com 1 alvo (sem override), é passthrough puro — devolve a resposta
 * do adapter (mesmo vazia) e repropaga o erro ORIGINAL (não embrulha). O cache fica
 * por FORA (cache primeiro, failover depois): hit evita todos os providers.
 */
import type { ModelAdapter, ModelRequest, ModelResponse } from './model-client.js'
import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import { emitLlmHook } from '../hooks/llm-lifecycle-hooks.js'

const log = createLogger({ layer: 'core', source: 'failover-model-adapter.ts' })

export interface FailoverTarget {
  readonly providerId: string
  readonly adapter: ModelAdapter
  /** Modelo a usar nesta entrada (override). Omitido/'' → usa o `request.model`. */
  readonly model?: string
}

export interface FailoverStatusEntry {
  readonly providerId: string
  readonly model?: string
  failures: number
  lastError?: string
}

export interface FailoverStatus {
  readonly fallbackCount: number
  readonly targets: ReadonlyArray<FailoverStatusEntry>
}

/** Resposta sem texto útil é tratada como falha (só quando há um próximo alvo). */
function isEmpty(res: ModelResponse | null | undefined): boolean {
  return !res || typeof res.text !== 'string' || res.text.trim() === ''
}

export class FailoverModelAdapter implements ModelAdapter {
  private readonly status: FailoverStatusEntry[]
  private fallbackCount = 0

  constructor(private readonly targets: ReadonlyArray<FailoverTarget>) {
    if (targets.length === 0) throw new McpGraphError('FailoverModelAdapter requires at least one target')
    this.status = targets.map((t) => ({ providerId: t.providerId, model: t.model, failures: 0 }))
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    let lastErr: unknown
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i]
      const isLast = i === this.targets.length - 1
      const req: ModelRequest = target.model ? { ...request, model: target.model } : request
      emitLlmHook('pre_llm_call', { provider: target.providerId, model: target.model, attempt: i })
      try {
        const res = await target.adapter.generate(req)
        // Resposta vazia só conta como falha se há para onde cair (não-regressão).
        if (!isLast && isEmpty(res)) throw new McpGraphError('empty response')
        if (i > 0) {
          this.fallbackCount++
          log.info('failover:used', { providerId: target.providerId, attempt: i })
        }
        emitLlmHook('post_llm_call', { provider: target.providerId, model: target.model, attempt: i })
        return res
      } catch (err) {
        this.status[i].failures++
        this.status[i].lastError = err instanceof Error ? err.message : String(err)
        emitLlmHook('on_llm_error', {
          provider: target.providerId,
          model: target.model,
          attempt: i,
          error: this.status[i].lastError,
        })
        // Último alvo: repropaga o erro ORIGINAL (passthrough — não embrulha).
        if (isLast) throw err
        lastErr = err
        log.warn('failover:fallthrough', {
          from: target.providerId,
          to: this.targets[i + 1].providerId,
          error: this.status[i].lastError,
        })
        emitLlmHook('on_llm_retry', {
          provider: this.targets[i + 1].providerId,
          model: this.targets[i + 1].model,
          previousProvider: target.providerId,
          attempt: i + 1,
        })
      }
    }
    // Inalcançável (o laço sempre retorna ou lança no último). Guarda defensiva.
    throw lastErr instanceof Error ? lastErr : new Error('all failover targets failed')
  }

  failoverStatus(): FailoverStatus {
    return { fallbackCount: this.fallbackCount, targets: this.status.map((s) => ({ ...s })) }
  }
}

/**
 * Parser leniente da cadeia de failover (setting/env). Aceita `provider` (sem
 * override de modelo) ou `provider:model`, separados por vírgula. Estável e puro.
 */
export function parseFailoverProviders(raw: string | undefined | null): Array<{ provider: string; model?: string }> {
  if (!raw) return []
  const out: Array<{ provider: string; model?: string }> = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) {
      out.push({ provider: trimmed })
      continue
    }
    const provider = trimmed.slice(0, idx).trim()
    const model = trimmed.slice(idx + 1).trim()
    if (!provider) continue
    out.push(model ? { provider, model } : { provider })
  }
  return out
}
