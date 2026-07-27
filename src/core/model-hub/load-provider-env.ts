/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * load-provider-env — injeta chaves de provider (ex.: OPENROUTER_API_KEY) no
 * `process.env` a partir de `secrets/<provider>-key.md` quando ainda não
 * definidas no ambiente. Mantém as chaves fora do código e do git (a pasta
 * `secrets/` é gitignored). Idempotente e gracioso (arquivo ausente → no-op).
 *
 * Formato aceito do arquivo: linha crua com a chave, OU `KEY=valor`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'load-provider-env.ts' })

/** Mapa: env var → arquivo em `secrets/`. */
const SECRET_FILES: ReadonlyArray<{ envVar: string; file: string }> = [
  { envVar: 'OPENROUTER_API_KEY', file: 'openrouter-key.md' },
  { envVar: 'DEEPSEEK_API_KEY', file: 'deepseek-key.md' },
]

/** Extrai o valor de um arquivo de secret (linha crua ou `KEY=valor`). */
function parseSecret(content: string, envVar: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/)
    if (m && m[1] === envVar) return m[2].trim()
  }
  // Sem `KEY=` → trata o conteúdo inteiro como o valor (formato linha crua).
  return trimmed.split(/\s+/)[0] ?? null
}

/**
 * Carrega as chaves de provider de `<baseDir>/secrets/` para o `process.env`,
 * sem sobrescrever o que já estiver definido no ambiente.
 */
export function loadProviderEnv(baseDir: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  for (const { envVar, file } of SECRET_FILES) {
    if (env[envVar]) continue // ambiente vence
    const path = join(baseDir, 'secrets', file)
    if (!existsSync(path)) continue
    try {
      const value = parseSecret(readFileSync(path, 'utf8'), envVar)
      if (value) {
        env[envVar] = value
        log.debug('provider-env:loaded', { envVar, source: 'secrets' })
      }
    } catch (err) {
      log.warn('provider-env:read-failed', { file, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
