/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Fiação do cache local de resposta contra o DB MIGRADO (tabela v82
 * `llm_response_cache`): garante que `buildResponseCache(db)` + `CachingModelAdapter`
 * gravam/leem nas colunas canônicas (`value_json`/`ttl_expires_at`) e que o hit
 * sobrevive a uma nova instância de cache (persistência real).
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { buildResponseCache, CachingModelAdapter } from '../core/model-hub/caching-model-adapter.js'
import type { ModelAdapter, ModelRequest, ModelResponse } from '../core/model-hub/model-client.js'

function migratedDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

function countingInner(): { adapter: ModelAdapter; calls: () => number } {
  let n = 0
  return {
    adapter: {
      generate: async (r: ModelRequest): Promise<ModelResponse> => ({
        text: `r${++n}`,
        model: r.model,
        tokensIn: 10,
        tokensOut: 5,
      }),
    },
    calls: () => n,
  }
}

describe('cache local de resposta — fiação contra o DB migrado (v82)', () => {
  it('grava e lê na tabela v82 sem erro de coluna (value_json/ttl_expires_at)', async () => {
    const db = migratedDb()
    const inner = countingInner()
    const adapter = new CachingModelAdapter(inner.adapter, buildResponseCache(db), { providerId: 'openrouter' })
    const req: ModelRequest = { model: 'deepseek/deepseek-chat', prompt: 'p', system: 'S' }

    await adapter.generate(req)
    const hit = await adapter.generate(req)
    expect(hit.fromCache).toBe(true)
    expect(inner.calls()).toBe(1)

    const row = db.prepare('SELECT value_json, ttl_expires_at FROM llm_response_cache').get() as
      { value_json: string; ttl_expires_at: number } | undefined
    expect(row?.value_json).toContain('"text":"r1"')
    expect(row?.ttl_expires_at).toBeGreaterThan(Date.now())
    db.close()
  })

  it('persistência: hit sobrevive a uma NOVA instância de cache (mesmo db)', async () => {
    const db = migratedDb()
    const inner = countingInner()
    const req: ModelRequest = { model: 'm', prompt: 'persistir' }

    const a1 = new CachingModelAdapter(inner.adapter, buildResponseCache(db))
    await a1.generate(req) // grava no SQLite

    const a2 = new CachingModelAdapter(inner.adapter, buildResponseCache(db)) // cache novo, mesmo db
    const hit = await a2.generate(req)
    expect(hit.fromCache).toBe(true)
    expect(inner.calls()).toBe(1) // não chamou o inner de novo — veio do disco
    db.close()
  })
})
