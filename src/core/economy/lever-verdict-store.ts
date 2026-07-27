/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ONDE O VEREDITO DO A/B SOBREVIVE (node_b1d2aafb4b0a).
 *
 * `runLeverAb` já media os dois braços e produzia um `LeverVerdict` — mas o
 * devolvia só em memória, gravando nos ledgers apenas o CUSTO de obter a
 * evidência. O julgamento em si evaporava ao fim do processo, então nenhum
 * default podia ser decidido por ele: um gate que lesse "levers provados"
 * encontraria sempre uma lista vazia, e ficaria dormente para sempre.
 *
 * Este módulo é a ponta que faltava. Quem decide o que a evidência AUTORIZA é
 * `lever-evidence-gate.ts` (puro); aqui só se guarda e se lê.
 *
 * CONTRATO: vale o veredito mais RECENTE de cada lever. Um A/B favorável de
 * meses atrás não pode manter um lever ligado depois de uma medição nova
 * mostrar que ele passou a custar — a evidência é revogável por evidência.
 */

import type Database from 'better-sqlite3'
import type { LeverVerdict } from './lever-ab-harness.js'
import type { LeverKey } from './economy-levers-config.js'

/** O recorte do veredito que decide um default; o resto é custo do experimento. */
export interface LeverVerdictRecord {
  lever: LeverKey
  savedTokens: number
  taskCount: number
  recommendation: LeverVerdict['recommendation']
}

const TABLE = 'lever_ab_verdict'

/**
 * Cria a tabela se faltar.
 *
 * Auto-cura em vez de depender só do runner de migração: este repo já teve uma
 * versão registrada em `_migrations` cuja tabela nunca existiu fisicamente, e o
 * runner, por considerá-la aplicada, nunca reconsertava. Verificar a existência
 * física a cada uso custa quase nada e remove essa classe inteira de falha.
 */
function ensureTable(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    lever TEXT NOT NULL,
    saved_tokens REAL NOT NULL,
    task_count INTEGER NOT NULL,
    recommendation TEXT NOT NULL
  )`)
}

/** Grava um veredito de A/B. Append-only: o histórico da decisão é auditável. */
export function recordLeverVerdict(db: Database.Database, v: LeverVerdictRecord): void {
  ensureTable(db)
  db.prepare(`INSERT INTO ${TABLE} (ts, lever, saved_tokens, task_count, recommendation) VALUES (?, ?, ?, ?, ?)`).run(
    Date.now(),
    v.lever,
    v.savedTokens,
    v.taskCount,
    v.recommendation,
  )
}

/**
 * O veredito vigente de cada lever (o mais recente).
 *
 * Devolve lista vazia em qualquer falha de leitura: isto alimenta a resolução
 * de defaults, que roda em caminho quente, e "sem evidência" é o fail-safe
 * correto — nunca uma exceção subindo por causa de um smart-default opcional.
 */
export function readLeverVerdicts(db: Database.Database): LeverVerdict[] {
  try {
    ensureTable(db)
    const rows = db
      .prepare(
        `SELECT lever, saved_tokens, task_count, recommendation FROM ${TABLE}
         WHERE id IN (SELECT MAX(id) FROM ${TABLE} GROUP BY lever)`,
      )
      .all() as Array<{ lever: string; saved_tokens: number; task_count: number; recommendation: string }>

    return rows.map((r) => ({
      lever: r.lever as LeverKey,
      tokensBefore: 0,
      tokensAfter: 0,
      savedTokens: r.saved_tokens,
      costUsd: 0,
      taskCount: r.task_count,
      recommendation: r.recommendation as LeverVerdict['recommendation'],
    }))
  } catch {
    return []
  }
}
