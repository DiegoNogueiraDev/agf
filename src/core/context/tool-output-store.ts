/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * tool-output-store — offload de saída de ferramenta grande para fora do
 * contexto (corte de token na entrada). Saída acima do threshold é persistida
 * inteira (indexada por SHA256, padrão do [[ccr-store]]) e substituída no
 * contexto por um preview cabeça-cauda ([[truncate]]) + marcador
 * `tool-output://<hash>`. Saída pequena passa intacta, sem store.
 *
 * O original é resgatável byte-a-byte via {@link ToolOutputStore.get} (e, no
 * CLI, via `agf retrieve` — T2.4). Additive only: gerencia a própria tabela
 * `tool_output_store` (espelhada pela migration v108).
 */
import type { Database } from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { truncateWithMarker } from './truncate.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-output-store' })

/** Acima deste tamanho (chars) a saída é offloaded; abaixo passa intacta. */
export const DEFAULT_THRESHOLD_CHARS = 2000
/** Orçamento de chars do preview cabeça-cauda emitido no lugar da saída grande. */
export const DEFAULT_PREVIEW_CHARS = 1000

/** Marcador de resgate de uma saída offloaded. */
export function toolOutputMarker(hash: string): string {
  return `tool-output://${hash}`
}

export interface ToolOutputOptions {
  thresholdChars?: number
  previewChars?: number
}

/** Resultado do offload: o que entra no contexto + metadados de resgate. */
export interface ToolOutputResult {
  /** Texto a colocar no contexto: o original (se pequeno) ou preview+marcador. */
  preview: string
  /** `true` se a saída foi persistida e substituída por preview. */
  stored: boolean
  /** SHA256 do original (chave de resgate), ou `null` se não armazenada. */
  hash: string | null
  /** Marcador `tool-output://<hash>`, ou `null` se não armazenada. */
  marker: string | null
}

/**
 * Store local de saídas de ferramenta. Reusa o padrão do CCR: original indexado
 * por SHA256, `INSERT OR IGNORE` idempotente.
 */
export class ToolOutputStore {
  private readonly db: Database
  private readonly thresholdChars: number
  private readonly previewChars: number

  constructor(db: Database, opts: ToolOutputOptions = {}) {
    this.db = db
    this.thresholdChars = opts.thresholdChars ?? DEFAULT_THRESHOLD_CHARS
    this.previewChars = opts.previewChars ?? DEFAULT_PREVIEW_CHARS
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS tool_output_store (
        hash TEXT PRIMARY KEY,
        original TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
    )
  }

  /**
   * Offload de uma saída de ferramenta. Pequena (≤ threshold) passa intacta.
   * Grande é persistida e substituída por um preview cabeça-cauda + marcador.
   */
  offload(output: string): ToolOutputResult {
    if (output.length <= this.thresholdChars) {
      return { preview: output, stored: false, hash: null, marker: null }
    }
    const hash = ToolOutputStore.hashOf(output)
    const bytes = Buffer.byteLength(output, 'utf8')
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO tool_output_store (hash, original, bytes, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(hash, output, bytes, new Date().toISOString())
    if (result.changes > 0) log.debug('tool-output stored', { hash, bytes })
    const marker = toolOutputMarker(hash)
    const preview = `${truncateWithMarker(output, this.previewChars)}\n${marker}`
    return { preview, stored: true, hash, marker }
  }

  /** Resgata o original completo por hash, ou `null`. */
  get(hash: string): string | null {
    const row = this.db.prepare('SELECT original FROM tool_output_store WHERE hash = ?').get(hash) as
      { original: string } | undefined
    return row ? row.original : null
  }

  /** SHA256 hex determinístico de uma string (utf8). */
  static hashOf(original: string): string {
    return createHash('sha256').update(original, 'utf8').digest('hex')
  }
}
