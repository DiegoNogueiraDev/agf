/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Wire vivo do cache semântico (node_a6a006dfb847): resolveProviderAdapter passa
 * `semantic` ao CachingModelAdapter no caminho vivo. OFF (wire null) => byte-idêntico
 * (adapter sem camada semântica); ON (wire não-null) => adapter carrega o wire.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { resolveProviderAdapter } from '../core/model-hub/resolve-provider.js'
import {
  buildResponseCache,
  resolveSemanticCacheWire,
  CachingModelAdapter,
} from '../core/model-hub/caching-model-adapter.js'
import { ECONOMY_LEVERS_SETTING_KEY } from '../core/economy/economy-levers-config.js'

function settingsWith(cfg: Record<string, unknown>): { getProjectSetting(key: string): string | null } {
  return {
    getProjectSetting(key: string): string | null {
      return key === ECONOMY_LEVERS_SETTING_KEY ? JSON.stringify(cfg) : null
    },
  }
}

const ENV = { AGF_PROVIDER: 'copilot' } as NodeJS.ProcessEnv

describe('resolveProviderAdapter + semantic wire', () => {
  it('AC2: sem semantic (default) => CachingModelAdapter sem camada semântica (byte-idêntico)', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const { adapter } = resolveProviderAdapter('copilot', ENV, buildResponseCache(db))
    expect(adapter).toBeInstanceOf(CachingModelAdapter)
    expect((adapter as CachingModelAdapter).hasSemantic()).toBe(false)
    db.close()
  })

  it('AC1: lever ON => wire não-null => CachingModelAdapter carrega a camada semântica', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const wire = resolveSemanticCacheWire(settingsWith({ semantic_cache: { enabled: true } }), db, {
      nodeId: 'node_atual',
    })
    expect(wire).not.toBeNull()
    const { adapter } = resolveProviderAdapter('copilot', ENV, buildResponseCache(db), null, undefined, wire)
    expect((adapter as CachingModelAdapter).hasSemantic()).toBe(true)
    db.close()
  })

  it('lever OFF => resolveSemanticCacheWire null => threading não liga nada', () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const wire = resolveSemanticCacheWire(settingsWith({}), db, { nodeId: 'n' })
    expect(wire).toBeNull()
    const { adapter } = resolveProviderAdapter('copilot', ENV, buildResponseCache(db), null, undefined, wire)
    expect((adapter as CachingModelAdapter).hasSemantic()).toBe(false)
    db.close()
  })
})
