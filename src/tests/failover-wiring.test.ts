/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { resolveFailoverSpecs } from '../cli/shared/provider-context.js'
import { collectStatus } from '../cli/shared/status-report.js'
import { resolveProviderAdapter } from '../core/model-hub/resolve-provider.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-fo')
  return store
}

describe('failover wiring', () => {
  it('lê a cadeia do setting persistido (env sem override)', () => {
    const store = freshStore()
    store.setProjectSetting('provider_failover', 'openrouter,ollama:qwen2.5-coder:7b')
    const specs = resolveFailoverSpecs(store, {})
    expect(specs).toEqual([{ provider: 'openrouter' }, { provider: 'ollama', model: 'qwen2.5-coder:7b' }])
    store.close()
  })

  it('env LLM_FAILOVER_CHAIN tem precedência sobre o setting', () => {
    const store = freshStore()
    store.setProjectSetting('provider_failover', 'ollama')
    const specs = resolveFailoverSpecs(store, { LLM_FAILOVER_CHAIN: 'openrouter:x' })
    expect(specs).toEqual([{ provider: 'openrouter', model: 'x' }])
    store.close()
  })

  it('status mostra a cadeia de failover configurada', () => {
    const store = freshStore()
    store.setProjectSetting('provider_failover', 'ollama:a,ollama:b')
    const s = collectStatus(store, {})
    expect(s.failover).toEqual(['ollama:a', 'ollama:b'])
    store.close()
  })

  it('sem cadeia → status.failover vazio (não polui)', () => {
    const store = freshStore()
    expect(collectStatus(store, {}).failover).toEqual([])
    store.close()
  })

  it('resolveProviderAdapter constrói um FailoverModelAdapter com a cadeia (sem rede)', () => {
    // Providers locais (ollama) não exigem chave nem rede na construção do adapter.
    const resolved = resolveProviderAdapter('ollama', {}, undefined, undefined, [
      { provider: 'ollama', model: 'fallback-model' },
    ])
    expect(resolved.failover).toBeDefined()
    expect(resolved.failover?.failoverStatus().targets.length).toBe(2)
  })

  it('sem cadeia → resolveProviderAdapter não cria failover (não-regressão)', () => {
    const resolved = resolveProviderAdapter('ollama', {})
    expect(resolved.failover).toBeUndefined()
  })
})
