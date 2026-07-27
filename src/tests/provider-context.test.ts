/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * buildClientFromProject — resolução ÚNICA de provider+base-url+modelo+cache, lida
 * por todos os comandos (deliver/generate-prd/run/live-implement/scaffold) para que
 * a config persistida do projeto seja respeitada de forma consistente.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildClientFromProject } from '../cli/shared/provider-context.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('t')
  return store
}

describe('buildClientFromProject — contexto de provider consistente', () => {
  it('respeita provider + base-url persistidos no projeto (sem env, sem flags)', () => {
    const store = freshStore()
    store.setProjectSetting('provider', 'ollama')
    store.setProjectSetting('provider_base_url', 'http://lab:11434/v1')
    const ctx = buildClientFromProject(store, { env: {} })
    expect(ctx.providerLabel).toBe('ollama')
    expect(ctx.baseURL).toBe('http://lab:11434/v1')
    store.close()
  })

  it('flag de provider/base-url vence o setting', () => {
    const store = freshStore()
    store.setProjectSetting('provider', 'ollama')
    const ctx = buildClientFromProject(store, {
      provider: 'openrouter',
      baseUrl: 'http://x/v1',
      env: { OPENROUTER_API_KEY: 'k' },
    })
    expect(ctx.providerLabel).toBe('openrouter')
    expect(ctx.baseURL).toBe('http://x/v1')
    store.close()
  })

  it('sem store (ex.: run one-shot) → usa flags/env + cache em memória, sem quebrar', () => {
    const ctx = buildClientFromProject(undefined, { provider: 'ollama', baseUrl: 'http://h:11434/v1', env: {} })
    expect(ctx.providerLabel).toBe('ollama')
    expect(ctx.client).toBeTruthy()
    expect(typeof ctx.client.modelFor).toBe('function')
  })

  it('sem provider configurado → copilot (não-regressão)', () => {
    const store = freshStore()
    const ctx = buildClientFromProject(store, { env: {} })
    expect(ctx.providerLabel).toBe('copilot')
    store.close()
  })

  it('modelo: flag > setting > auto', () => {
    const store = freshStore()
    store.setProjectSetting('model', 'qwen2.5-coder:14b')
    const ctx = buildClientFromProject(store, { provider: 'ollama', baseUrl: 'http://h/v1', env: {} })
    expect(ctx.client.modelFor('implement')).toBe('qwen2.5-coder:14b')
    const ctx2 = buildClientFromProject(store, {
      provider: 'ollama',
      baseUrl: 'http://h/v1',
      model: 'qwen3:8b',
      env: {},
    })
    expect(ctx2.client.modelFor('implement')).toBe('qwen3:8b')
    store.close()
  })
})
