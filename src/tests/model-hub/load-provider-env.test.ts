/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadProviderEnv } from '../../core/model-hub/load-provider-env.js'

describe('loadProviderEnv — chave de secrets/ para o env', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-secret-'))
    mkdirSync(join(dir, 'secrets'), { recursive: true })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lê linha crua e injeta OPENROUTER_API_KEY', () => {
    writeFileSync(join(dir, 'secrets', 'openrouter-key.md'), 'sk-or-v1-abc123\n', 'utf8')
    const env: NodeJS.ProcessEnv = {}
    loadProviderEnv(dir, env)
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-v1-abc123')
  })

  it('não sobrescreve env já definido', () => {
    writeFileSync(join(dir, 'secrets', 'openrouter-key.md'), 'sk-or-FILE', 'utf8')
    const env: NodeJS.ProcessEnv = { OPENROUTER_API_KEY: 'sk-or-ENV' }
    loadProviderEnv(dir, env)
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-ENV')
  })

  it('arquivo ausente → no-op (gracioso)', () => {
    const env: NodeJS.ProcessEnv = {}
    loadProviderEnv(join(dir, 'vazio'), env)
    expect(env.OPENROUTER_API_KEY).toBeUndefined()
  })

  it('aceita formato KEY=valor', () => {
    writeFileSync(join(dir, 'secrets', 'openrouter-key.md'), 'OPENROUTER_API_KEY=sk-or-kv\n', 'utf8')
    const env: NodeJS.ProcessEnv = {}
    loadProviderEnv(dir, env)
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-kv')
  })
})
