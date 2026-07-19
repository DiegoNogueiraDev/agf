/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * DecisionTableStore — persistência das decisões compiladas pelo Learning
 * Compiler (JIT). Quando uma decisão LLM se repete com sucesso o suficiente,
 * é compilada numa entrada determinística aqui, e execuções futuras a
 * reproduzem SEM chamar o LLM (fast-path de custo-zero).
 *
 * Additive only: gerencia a própria tabela `compiled_decisions` via
 * `CREATE TABLE IF NOT EXISTS` (espelhada pela migration v107), então funciona
 * tanto sobre o DB do projeto quanto sobre um `:memory:` de teste, e nunca
 * toca o schema do grafo.
 */
import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'decision-table-store.ts' })

/** Uma entrada de decisão compilada, pronta para replay zero-token. */
export interface CompiledDecision {
  /** Chave determinística (hash de domínio|fase|papel|assinatura) — ver decision-key.ts (T1.2). */
  key: string
  /** A decisão compilada (payload arbitrário, serializado como JSON). */
  decision: unknown
  /** Quantas vezes a decisão foi observada/compilada (Little: ≥2 para compilar). */
  occurrences: number
  /** Taxa de sucesso histórica [0..1] no momento da compilação. */
  successRate: number
  /** Timestamp (ms) da última compilação. */
  compiledAt: number
  /** Timestamp (ms) do último replay via fast-path, ou null se nunca usada. */
  lastUsedAt: number | null
}

/** Entrada para {@link DecisionTableStore.put} (occurrences/lastUsedAt são gerenciados pelo store). */
export interface CompiledDecisionInput {
  key: string
  decision: unknown
  successRate: number
  /** Timestamp (ms) da compilação. Default: `Date.now()`. */
  compiledAt?: number
}

interface DecisionRow {
  decision_key: string
  decision: string
  occurrences: number
  success_rate: number
  compiled_at: number
  last_used_at: number | null
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS compiled_decisions (
    decision_key TEXT NOT NULL,
    project_id   TEXT NOT NULL DEFAULT 'default',
    decision     TEXT NOT NULL,
    occurrences  INTEGER NOT NULL DEFAULT 1,
    success_rate REAL NOT NULL DEFAULT 0,
    compiled_at  INTEGER NOT NULL,
    last_used_at INTEGER,
    PRIMARY KEY (project_id, decision_key)
  );
  CREATE INDEX IF NOT EXISTS idx_compiled_decisions_project
    ON compiled_decisions(project_id, last_used_at);
`

/**
 * SQLite-backed store de decisões compiladas. Escritas via better-sqlite3 são
 * síncronas. Escopado por `projectId` para que a mesma chave em projetos
 * distintos não colida no DB compartilhado.
 */
export class DecisionTableStore {
  private readonly db: Database.Database
  private readonly projectId: string

  /**
   * @param db Handle aberto do better-sqlite3 (DB do projeto, ou `:memory:` em testes).
   * @param projectId Escopo do projeto (default `'default'`).
   */
  constructor(db: Database.Database, projectId = 'default') {
    this.db = db
    this.projectId = projectId
    this.db.exec(CREATE_TABLE_SQL)
  }

  /**
   * Insere ou atualiza (upsert) uma decisão compilada. Em conflito de chave
   * dentro do projeto: incrementa `occurrences` e adota os valores mais
   * recentes de `decision`/`successRate`/`compiledAt` (sem mexer em `lastUsedAt`).
   *
   * @returns A linha resultante após o upsert.
   */
  put(input: CompiledDecisionInput): CompiledDecision {
    const compiledAt = input.compiledAt ?? Date.now()
    this.db
      .prepare(
        `INSERT INTO compiled_decisions
           (decision_key, project_id, decision, occurrences, success_rate, compiled_at, last_used_at)
         VALUES (?, ?, ?, 1, ?, ?, NULL)
         ON CONFLICT(project_id, decision_key) DO UPDATE SET
           occurrences  = occurrences + 1,
           decision     = excluded.decision,
           success_rate = excluded.success_rate,
           compiled_at  = excluded.compiled_at`,
      )
      .run(input.key, this.projectId, JSON.stringify(input.decision), input.successRate, compiledAt)
    log.debug('compiled_decision:put', { key: input.key, projectId: this.projectId })
    // get() nunca retorna null logo após um put bem-sucedido.
    return this.get(input.key) as CompiledDecision
  }

  /**
   * Marca uma decisão como usada agora (bump de `last_used_at`), para o
   * fast-path de replay (T1.4) registrar reuso e habilitar invalidação por
   * recência. No-op se a chave não existe.
   *
   * @returns `true` se uma linha foi atualizada.
   */
  markUsed(key: string, usedAt: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE compiled_decisions SET last_used_at = ?
         WHERE project_id = ? AND decision_key = ?`,
      )
      .run(usedAt, this.projectId, key)
    return result.changes > 0
  }

  /** Lê uma decisão compilada pela chave (escopada ao projeto), ou `null`. */
  get(key: string): CompiledDecision | null {
    const row = this.db
      .prepare(
        `SELECT decision_key, decision, occurrences, success_rate, compiled_at, last_used_at
         FROM compiled_decisions WHERE project_id = ? AND decision_key = ?`,
      )
      .get(this.projectId, key) as DecisionRow | undefined
    return row ? rowToDecision(row) : null
  }

  /** Lista todas as decisões compiladas do projeto (ordenadas por compilação). */
  list(): CompiledDecision[] {
    const rows = this.db
      .prepare(
        `SELECT decision_key, decision, occurrences, success_rate, compiled_at, last_used_at
         FROM compiled_decisions WHERE project_id = ? ORDER BY compiled_at`,
      )
      .all(this.projectId) as DecisionRow[]
    return rows.map(rowToDecision)
  }

  /** Quantidade de decisões compiladas no projeto. */
  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM compiled_decisions WHERE project_id = ?')
      .get(this.projectId) as { n: number }
    return row.n
  }
}

function rowToDecision(row: DecisionRow): CompiledDecision {
  return {
    key: row.decision_key,
    decision: JSON.parse(row.decision),
    occurrences: row.occurrences,
    successRate: row.success_rate,
    compiledAt: row.compiled_at,
    lastUsedAt: row.last_used_at,
  }
}
