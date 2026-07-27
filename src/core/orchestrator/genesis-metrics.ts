/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Genesis Metrics — time-to-first-brief e round-trips (node_64d196c10406).
 *
 * WHY: o ganho de time-to-market do `agf genesis` só existe como EVIDÊNCIA se
 * cada run gravar {elapsedMs, tokensSpent, roundTrips} numa linha própria
 * (histórico, nunca sobrescrito) que o `agf metrics` expõe ao lado do baseline
 * manual. Tabela self-healing (CREATE IF NOT EXISTS na primeira escrita — mesmo
 * padrão de selection-quality.ts), sem depender do runner de migrações.
 *
 * CONTRATO: recordGenesisRun grava; readGenesisRuns lê (ordem de inserção);
 * genesisMetricsSection retorna null quando não há runs (o metrics não inventa
 * seção vazia — saída byte-idêntica para projetos que nunca rodaram genesis).
 */

import type Database from 'better-sqlite3'

/**
 * Baseline manual documentado: os comandos equivalentes do cenário demo que o
 * genesis colapsa num único round-trip — init · generate-prd · import-prd ·
 * decompose · gaps · brief (6 invocações, ≥5 exigidas pelo AC).
 */
export const MANUAL_BASELINE_ROUND_TRIPS = 6

/** O genesis é, por construção, um único round-trip do driver. */
const GENESIS_ROUND_TRIPS = 1

export interface GenesisRunInput {
  elapsedMs: number
  /** Tokens do bootstrap (fonte: llm_call_ledger da sessão genesis). */
  tokensSpent: number
}

export interface GenesisRunRow extends GenesisRunInput {
  roundTrips: number
  ts: number
}

export interface GenesisMetricsSection {
  runs: GenesisRunRow[]
  baselineRoundTrips: number
}

const ensuredDbs = new WeakSet<Database.Database>()

/** Idempotently ensure the genesis_runs table exists (self-heal). */
function ensureTable(db: Database.Database): void {
  if (ensuredDbs.has(db)) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS genesis_runs (
      ts           INTEGER NOT NULL,
      elapsed_ms   INTEGER NOT NULL,
      tokens_spent INTEGER NOT NULL,
      round_trips  INTEGER NOT NULL
    );
  `)
  ensuredDbs.add(db)
}

/** Grava UM run do genesis — sempre uma linha nova (histórico, AC3). */
export function recordGenesisRun(db: Database.Database, input: GenesisRunInput): void {
  ensureTable(db)
  db.prepare('INSERT INTO genesis_runs (ts, elapsed_ms, tokens_spent, round_trips) VALUES (?, ?, ?, ?)').run(
    Date.now(),
    Math.round(input.elapsedMs),
    Math.round(input.tokensSpent),
    GENESIS_ROUND_TRIPS,
  )
}

/** Todos os runs gravados, na ordem de inserção. */
export function readGenesisRuns(db: Database.Database): GenesisRunRow[] {
  ensureTable(db)
  const rows = db
    .prepare(
      'SELECT ts, elapsed_ms AS elapsedMs, tokens_spent AS tokensSpent, round_trips AS roundTrips FROM genesis_runs ORDER BY rowid',
    )
    .all() as GenesisRunRow[]
  return rows
}

/**
 * Seção pronta para o `agf metrics`; null quando nunca houve run — E null em
 * qualquer erro de leitura (db stub/parcial): a métrica do genesis é aditiva e
 * nunca pode derrubar o metrics inteiro.
 */
export function genesisMetricsSection(db: Database.Database): GenesisMetricsSection | null {
  try {
    const runs = readGenesisRuns(db)
    if (runs.length === 0) return null
    return { runs, baselineRoundTrips: MANUAL_BASELINE_ROUND_TRIPS }
  } catch {
    return null
  }
}
