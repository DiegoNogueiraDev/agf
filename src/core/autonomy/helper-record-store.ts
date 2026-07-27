/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * helper-record-store — memória de auto-cura do autopilot. Persiste qual fix
 * resolveu uma falha, indexado pela assinatura da falha, para que falhas
 * recorrentes sejam resolvidas preventivamente sem re-diagnosticar (T3.3) e o
 * loop onFailure registre o que funcionou (T3.2).
 *
 * Additive only: gerencia a própria tabela `helper_records` via
 * `CREATE TABLE IF NOT EXISTS` (espelhada pela migration v109). Escopado por
 * `projectId`. Mesmo padrão de [[decision-table-store]].
 */
import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'helper-record-store.ts' })

/** Um fix conhecido para uma assinatura de falha. */
export interface HelperRecord {
  /** Assinatura determinística da falha (ex.: classe de erro normalizada). */
  signature: string
  /** O fix que resolveu (payload arbitrário — recipe id, passos, etc.). */
  fix: unknown
  /** Quantas vezes este fix foi gravado/reusado para esta assinatura. */
  uses: number
  /** Timestamp (ms) do último uso, ou null. */
  lastUsedAt: number | null
  /** Timestamp (ms) da primeira gravação. */
  createdAt: number
}

/** Entrada para {@link HelperRecordStore.put}. */
export interface HelperRecordInput {
  signature: string
  fix: unknown
  /** Timestamp (ms) da gravação. Default `Date.now()`. */
  createdAt?: number
}

interface HelperRow {
  signature: string
  fix: string
  uses: number
  last_used_at: number | null
  created_at: number
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS helper_records (
    signature    TEXT NOT NULL,
    project_id   TEXT NOT NULL DEFAULT 'default',
    fix          TEXT NOT NULL,
    uses         INTEGER NOT NULL DEFAULT 1,
    last_used_at INTEGER,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (project_id, signature)
  );
`

/** SQLite-backed store de fixes conhecidos, escopado por projeto. */
export class HelperRecordStore {
  private readonly db: Database.Database
  private readonly projectId: string

  constructor(db: Database.Database, projectId = 'default') {
    this.db = db
    this.projectId = projectId
    this.db.exec(CREATE_TABLE_SQL)
  }

  /**
   * Insere ou atualiza (upsert) um helper-record. Em conflito de assinatura no
   * projeto: incrementa `uses` e adota o `fix` mais recente.
   *
   * @returns O record resultante.
   */
  put(input: HelperRecordInput): HelperRecord {
    const createdAt = input.createdAt ?? Date.now()
    this.db
      .prepare(
        `INSERT INTO helper_records (signature, project_id, fix, uses, last_used_at, created_at)
         VALUES (?, ?, ?, 1, NULL, ?)
         ON CONFLICT(project_id, signature) DO UPDATE SET
           uses = uses + 1,
           fix  = excluded.fix`,
      )
      .run(input.signature, this.projectId, JSON.stringify(input.fix), createdAt)
    log.debug('helper_record:put', { signature: input.signature, projectId: this.projectId })
    return this.get(input.signature) as HelperRecord
  }

  /** Marca um record como usado agora (bump de `last_used_at`). No-op se ausente. */
  markUsed(signature: string, usedAt: number): boolean {
    const r = this.db
      .prepare(`UPDATE helper_records SET last_used_at = ? WHERE project_id = ? AND signature = ?`)
      .run(usedAt, this.projectId, signature)
    return r.changes > 0
  }

  /** Lê o helper-record de uma assinatura (escopado ao projeto), ou `null`. */
  get(signature: string): HelperRecord | null {
    const row = this.db
      .prepare(
        `SELECT signature, fix, uses, last_used_at, created_at
         FROM helper_records WHERE project_id = ? AND signature = ?`,
      )
      .get(this.projectId, signature) as HelperRow | undefined
    return row ? rowToRecord(row) : null
  }
}

/** Resultado de {@link resolveKnownFix}. */
export interface KnownFixResolution {
  /** `true` se já há um fix conhecido para a assinatura. */
  known: boolean
  /** O fix conhecido, ou `null` se a assinatura é nova. */
  fix: unknown | null
}

/**
 * Consulta helper-records por assinatura de falha (T3.3): se há um fix
 * conhecido, retorna-o (e marca uso) para aplicação preventiva SEM
 * re-diagnosticar; se não, sinaliza para cair no fluxo normal de diagnóstico.
 */
export function resolveKnownFix(store: HelperRecordStore, signature: string, now: number): KnownFixResolution {
  const rec = store.get(signature)
  if (!rec) return { known: false, fix: null }
  store.markUsed(signature, now)
  return { known: true, fix: rec.fix }
}

function rowToRecord(row: HelperRow): HelperRecord {
  return {
    signature: row.signature,
    fix: JSON.parse(row.fix),
    uses: row.uses,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  }
}
