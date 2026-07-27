/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * status-report — fonte única do painel `agf status` / `/status` (DX). Mostra
 * provider/modelo/cache/tokens/$/economia a partir do store + ambiente.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { collectStatus, formatStatus } from '../cli/shared/status-report.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-x')
  return store
}

describe('status-report', () => {
  it('reflete provider/base-url/modelo/cache do projeto', () => {
    const store = freshStore()
    store.setProjectSetting('provider', 'ollama')
    store.setProjectSetting('provider_base_url', 'http://lab:11434/v1')
    store.setProjectSetting('model', 'qwen2.5-coder:14b')
    const s = collectStatus(store, {})
    expect(s.provider).toBe('ollama')
    expect(s.endpoint).toBe('http://lab:11434/v1')
    expect(s.model).toBe('qwen2.5-coder:14b')
    expect(s.cache).toBe('on')
    const lines = formatStatus(s).join('\n')
    expect(lines).toContain('ollama')
    expect(lines).toContain('qwen2.5-coder:14b')
    store.close()
  })

  it('cache off respeita AGF_RESPONSE_CACHE=0', () => {
    const store = freshStore()
    expect(collectStatus(store, { AGF_RESPONSE_CACHE: '0' }).cache).toBe('off')
    store.close()
  })

  it('sem chamadas → tokens 0 e custo-por-sucesso nulo (não quebra)', () => {
    const store = freshStore()
    const s = collectStatus(store, {})
    expect(s.tokens.total).toBe(0)
    expect(s.costPerSuccessUsd).toBeNull()
    store.close()
  })
})
