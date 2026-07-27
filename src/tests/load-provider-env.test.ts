/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * loadProviderEnv — injeta chaves de `secrets/<provider>-key.md` no env quando
 * ausentes, sem sobrescrever o ambiente. Cobre OpenRouter e DeepSeek (nativo).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadProviderEnv } from '../core/model-hub/load-provider-env.js'

const dirs: string[] = []
function projectWithSecrets(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), 'agf-secrets-'))
  dirs.push(base)
  mkdirSync(join(base, 'secrets'), { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(base, 'secrets', name), content)
  return base
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

describe('loadProviderEnv', () => {
  it('carrega OPENROUTER_API_KEY e DEEPSEEK_API_KEY de secrets/', () => {
    const base = projectWithSecrets({
      'openrouter-key.md': 'sk-or-abc',
      'deepseek-key.md': 'DEEPSEEK_API_KEY=sk-ds-xyz',
    })
    const env: Record<string, string | undefined> = {}
    loadProviderEnv(base, env)
    expect(env.OPENROUTER_API_KEY).toBe('sk-or-abc')
    expect(env.DEEPSEEK_API_KEY).toBe('sk-ds-xyz')
  })

  it('ambiente vence — não sobrescreve chave já definida', () => {
    const base = projectWithSecrets({ 'deepseek-key.md': 'sk-ds-fromfile' })
    const env: Record<string, string | undefined> = { DEEPSEEK_API_KEY: 'sk-ds-fromenv' }
    loadProviderEnv(base, env)
    expect(env.DEEPSEEK_API_KEY).toBe('sk-ds-fromenv')
  })

  it('arquivo ausente → no-op gracioso', () => {
    const base = projectWithSecrets({})
    const env: Record<string, string | undefined> = {}
    loadProviderEnv(base, env)
    expect(env.DEEPSEEK_API_KEY).toBeUndefined()
  })
})
