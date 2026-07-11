/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `CachingModelAdapter` — decorator de cache de resposta **provider-agnóstico**.
 * Embrulha qualquer `ModelAdapter` (Copilot SDK/API, OpenAI-compatible) e, quando
 * a requisição (normalizada) recorre, serve do cache local → **0 token, 0 custo,
 * 0 chamada ao provider** — melhor que o desconto de prefixo (que ninguém de fora
 * cria). É o piso universal de economia: cobre inclusive providers SEM cache nativo
 * (Cerebras, Groq não-K2, Copilot, deepseek-via-OpenRouter).
 *
 * Determinístico e seguro: a chave cobre {provider, model, system, prompt, effort};
 * como o prompt já embute repo-map/feedback, mudou o contexto → mudou a chave →
 * auto-invalida (nunca devolve resposta de uma pergunta diferente). A única
 * normalização é volatilidade comprovadamente irrelevante (o marcador `(id: …)`).
 */
import type Database from 'better-sqlite3'
import { fnv1a64 } from '../cache/cache-types.js'
import { ResponseCache, createMemoryPersistence } from '../llm/response-cache.js'
import { SqliteCachePersistence } from '../llm/response-cache-sqlite.js'
import type { CacheRegistration } from '../cache/cache-types.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from './model-client.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'caching-model-adapter.ts' })

/** Versão do schema da chave/valor do cache — bump invalida tudo (contrato mudou). */
export const RESPONSE_CACHE_SCHEMA_VERSION = 1

/** TTL default do cache de resposta (7 dias). O prompt embute o contexto → mudou, vira miss. */
const RESPONSE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Cache ligado por default; `AGF_RESPONSE_CACHE=0` desliga (kill-switch). */
export function responseCacheEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGF_RESPONSE_CACHE !== '0'
}

/**
 * Constrói um `ResponseCache<ModelResponse>`: com `db` → persistência SQLite
 * (tabela v82, sobrevive a reinícios); sem `db` → LRU memory-only (ex.: `run`
 * fora de projeto). Único ponto de fiação p/ não repetir a configuração.
 */
export function buildResponseCache(db?: Database.Database): ResponseCache<ModelResponse> {
  const persistence = db ? new SqliteCachePersistence<ModelResponse>(db) : createMemoryPersistence<ModelResponse>()
  return new ResponseCache<ModelResponse>({
    schemaVersion: RESPONSE_CACHE_SCHEMA_VERSION,
    ttlMs: RESPONSE_CACHE_TTL_MS,
    persistence,
  })
}

export interface CachingModelAdapterOptions {
  /** Provider ativo — entra na chave (separa OpenRouter de OpenAI etc.). */
  providerId?: string
  /** Liga/desliga o cache (kill-switch). Default: true. */
  enabled?: boolean
}

/**
 * Remove do prompt a volatilidade comprovadamente irrelevante para a geração: o
 * marcador `(id: <nodeId>)` (o id da task não altera o código gerado). Mantém TODO
 * o resto — repo-map, título, feedback — para a chave permanecer segura/específica.
 */
export function normalizeForCacheKey(req: ModelRequest, providerId?: string): string {
  const prompt = req.prompt
    .replace(/\r\n/g, '\n')
    .replace(/\(id: [^)]*\)/g, '(id: *)')
    .trim()
  const system = (req.system ?? '').replace(/\r\n/g, '\n').trim()
  return JSON.stringify({ p: providerId ?? '', m: req.model, s: system, u: prompt, e: req.effort ?? '' })
}

/**
 * AUDIT-020 — the stored response is tagged with the 64-bit key hash so reads can
 * verify identity. `ResponseCache` re-hashes its lookup key down to 32 bits
 * (`hashKey`/`fnv1a32`), so two distinct 64-bit keys can land in the same bucket
 * and the cache would otherwise serve a different prompt's answer. Comparing the
 * stored 64-bit hash on read collapses that false-hit window to ~2^-64.
 */
type VerifiedResponse = ModelResponse & { __agfKeyHash?: string }

/** Decorator de cache sobre um ModelAdapter. */
export class CachingModelAdapter implements ModelAdapter {
  private readonly enabled: boolean
  private hitCount = 0
  private missCount = 0
  private savedTokens = 0

  constructor(
    private readonly inner: ModelAdapter,
    private readonly cache: ResponseCache<ModelResponse>,
    private readonly opts: CachingModelAdapterOptions = {},
  ) {
    this.enabled = opts.enabled !== false
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.enabled) return this.inner.generate(request)

    const key = normalizeForCacheKey(request, this.opts.providerId)
    const hashed = fnv1a64(key)

    const cached = this.cache.get(hashed) as VerifiedResponse | undefined
    // AUDIT-020 — only serve the cached value when its stored 64-bit key hash
    // matches; a 32-bit bucket collision (different prompt) fails this check and
    // is treated as a miss instead of returning the wrong answer.
    if (cached && cached.__agfKeyHash === hashed) {
      this.hitCount++
      this.savedTokens += (cached.tokensIn ?? 0) + (cached.tokensOut ?? 0)
      log.debug('response-cache:hit', { provider: this.opts.providerId, model: request.model })
      const { __agfKeyHash: _vk, ...clean } = cached
      void _vk
      return { ...clean, fromCache: true }
    }

    this.missCount++
    const res = await this.inner.generate(request)
    // Guarda só a resposta "crua" (sem fromCache) + o hash da chave p/ verificação.
    const { fromCache: _ignored, ...toStore } = res
    void _ignored
    const stored: VerifiedResponse = { ...toStore, __agfKeyHash: hashed }
    this.cache.set(hashed, stored)
    return res
  }

  /** Adapta para o `cacheOrchestrator` (dashboard `/cache-stats`). */
  asCacheRegistration(): CacheRegistration {
    return {
      name: 'llm-response-cache',
      hits: () => this.hitCount,
      misses: () => this.missCount,
      size: () => this.cache.size(),
      tokensSaved: () => this.savedTokens,
      invalidateAll: () => this.cache.invalidateAll(),
    }
  }
}
