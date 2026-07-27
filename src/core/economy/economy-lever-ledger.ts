/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { TokenLedger } from '../autonomy/token-ledger.js'
import type { DriverSurface } from '../../schemas/driver-surface.schema.js'

export interface LeverEvent {
  sessionId: string
  nodeId?: string
  lever: string
  tokensBefore: number
  tokensAfter: number
  saved: number
  accepted: boolean
  gateOutcome: 'accepted' | 'reverted' | 'ccr_dropped' | 'passthrough'
  /** Optional gate confidence (rerank/fit score) — enables threshold calibration. */
  score?: number
  /** The counterfactual `tokensBefore` was computed against. Absent reads as the old constant. */
  baselineMethod?: string
  /**
   * Superfície do driver onde a economia disparou (contract node_eb434a0955c2).
   * Obrigatório em toda escrita nova — NULL no banco significa APENAS linha
   * pré-migração. Ambíguo → 'internal' (conservador: nunca superestimar o driver).
   */
  surface: DriverSurface
}

export interface LeverSummary {
  lever: string
  totalSaved: number
  count: number
}

/** Persists a token-economy lever event to the ledger and returns the generated event ID. */
/**
 * Cria o `economy_lever_ledger` se faltar — fonte ÚNICA do DDL.
 *
 * PORQUÊ aqui: quem escreve a tabela é este módulo, então quem descreve suas
 * colunas também deve ser. Uma segunda cópia do DDL (num teste, num executor de
 * A/B) diverge no primeiro `ALTER TABLE` e falha com "no such column" muito
 * depois, longe da mudança que a causou — foi assim que `score`,
 * `baseline_method` e `surface` já ficaram para trás numa cópia manual.
 *
 * Também é auto-cura: este repo já teve migração registrada em `_migrations`
 * cuja tabela nunca existiu fisicamente, e o runner nunca reconsertava.
 */
export function ensureLeverLedgerTable(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS economy_lever_ledger (
    id            TEXT PRIMARY KEY,
    ts            INTEGER NOT NULL,
    session_id    TEXT NOT NULL,
    node_id       TEXT,
    lever         TEXT NOT NULL,
    tokens_before INTEGER NOT NULL,
    tokens_after  INTEGER NOT NULL,
    saved         INTEGER NOT NULL,
    accepted      INTEGER NOT NULL DEFAULT 0,
    gate_outcome  TEXT NOT NULL DEFAULT 'passthrough',
    score         REAL,
    baseline_method TEXT,
    surface       TEXT
  )`)
}

export function recordLeverEvent(db: Database.Database, event: LeverEvent): string {
  const id = `lev_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  db.prepare(
    `INSERT INTO economy_lever_ledger
      (id, ts, session_id, node_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome, score, baseline_method, surface)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    Date.now(),
    event.sessionId,
    event.nodeId ?? null,
    event.lever,
    event.tokensBefore,
    event.tokensAfter,
    event.saved,
    event.accepted ? 1 : 0,
    event.gateOutcome,
    event.score ?? null,
    event.baselineMethod ?? null,
    event.surface,
  )
  return id
}

/** Aggregate economy lever ledger entries — returns total tokens saved and call count per lever. */
export function summarizeByLever(db: Database.Database, sessionId?: string): LeverSummary[] {
  if (sessionId) {
    return db
      .prepare(
        `SELECT lever, SUM(saved) AS totalSaved, COUNT(*) AS count
         FROM economy_lever_ledger
         WHERE session_id = ?
         GROUP BY lever
         ORDER BY totalSaved DESC`,
      )
      .all(sessionId) as LeverSummary[]
  }

  return db
    .prepare(
      `SELECT lever, SUM(saved) AS totalSaved, COUNT(*) AS count
       FROM economy_lever_ledger
       GROUP BY lever
       ORDER BY totalSaved DESC`,
    )
    .all() as LeverSummary[]
}

export interface ScaffoldRecoverySummary {
  /** Accepted scaffold_recovery events (a reusable scaffold was found and reused). */
  recovered: number
  /** Passthrough scaffold_recovery events (no reusable scaffold — generated fresh). */
  generated: number
  /** SUM(saved) across accepted recoveries. Tokens — the field name used to hold cost units. */
  tokensSaved: number
  /** tokensSaved / SUM(tokens_before) across accepted events; 0 when no accepted events. */
  savingsRatio: number
}

/**
 * How often a scaffold was reused (accepted) rather than generated fresh (passthrough), and the
 * tokens that reuse saved. Composed by proof-snapshot.ts's `scaffoldReuse` field.
 *
 * Reads `rag_out_recovery`, which *is* the recovery. It used to read `scaffold_recovery` — a second
 * row written for the same event, holding the same structure priced at 1.5× rather than counted,
 * beneath a field named `tokensSaved`. One event, one row, one unit.
 */
export function summarizeScaffoldRecovery(db: Database.Database): ScaffoldRecoverySummary {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END), 0) AS recovered,
         COALESCE(SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END), 0) AS generated,
         COALESCE(SUM(CASE WHEN accepted = 1 THEN saved ELSE 0 END), 0) AS tokensSaved,
         COALESCE(SUM(CASE WHEN accepted = 1 THEN tokens_before ELSE 0 END), 0) AS baselineTokens
       FROM economy_lever_ledger
       WHERE lever = 'rag_out_recovery'`,
    )
    .get() as { recovered: number; generated: number; tokensSaved: number; baselineTokens: number }

  const savingsRatio = row.baselineTokens > 0 ? row.tokensSaved / row.baselineTokens : 0
  return { recovered: row.recovered, generated: row.generated, tokensSaved: row.tokensSaved, savingsRatio }
}

/** Calibration rows (score + saved + accepted) for a lever, for threshold tuning. */
export function getCalibrationEvents(
  db: Database.Database,
  lever?: string,
): Array<{ score: number | null; saved: number; accepted: boolean }> {
  const rows = (
    lever
      ? db.prepare('SELECT score, saved, accepted FROM economy_lever_ledger WHERE lever = ?').all(lever)
      : db.prepare('SELECT score, saved, accepted FROM economy_lever_ledger').all()
  ) as Array<{ score: number | null; saved: number; accepted: number }>
  return rows.map((r) => ({ score: r.score, saved: r.saved, accepted: r.accepted === 1 }))
}

/** Recent events (tokens_before, saved) for A/B comparison. */
export function getRecentAbEvents(
  db: Database.Database,
  lever: string,
  limit: number,
): Array<{ tokensBefore: number; saved: number }> {
  const rows = db
    .prepare(
      'SELECT tokens_before AS tokensBefore, saved FROM economy_lever_ledger WHERE lever = ? ORDER BY ts DESC LIMIT ?',
    )
    .all(lever, limit) as Array<{ tokensBefore: number; saved: number }>
  return rows
}

/** Distinct lever names present in the ledger. */
export function listLevers(db: Database.Database): string[] {
  const rows = db.prepare('SELECT DISTINCT lever FROM economy_lever_ledger ORDER BY lever').all() as Array<{
    lever: string
  }>
  return rows.map((r) => r.lever)
}

interface EconomyReportRow {
  lever: string
  totalSaved: number
  accepted: number
  reverted: number
  ccrDropped: number
  passthrough: number
}

/** Format the economy lever ledger as a human-readable report for display in the CLI. */
export function formatEconomyReport(db: Database.Database): string {
  const rows = db
    .prepare(
      `SELECT
        lever,
        SUM(saved) AS totalSaved,
        SUM(CASE WHEN gate_outcome = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN gate_outcome = 'reverted' THEN 1 ELSE 0 END) AS reverted,
        SUM(CASE WHEN gate_outcome = 'ccr_dropped' THEN 1 ELSE 0 END) AS ccrDropped,
        SUM(CASE WHEN gate_outcome = 'passthrough' THEN 1 ELSE 0 END) AS passthrough
       FROM economy_lever_ledger
       GROUP BY lever
       ORDER BY totalSaved DESC`,
    )
    .all() as EconomyReportRow[]

  if (rows.length === 0) {
    return 'Nenhum lever registrado. Rode tarefas com ECONOMY_* flags ligadas para gerar economia.'
  }

  function acceptanceRate(acc: number, rev: number): string {
    const total = acc + rev
    if (total === 0) return '   —'
    return `${Math.round((acc / total) * 100)}%`.padStart(4)
  }

  const lines: string[] = ['Economia por lever:']
  lines.push('')

  // Header with acceptance rate
  lines.push(
    '  Lever'.padEnd(18) +
      'Saved'.padEnd(10) +
      'Acc'.padEnd(6) +
      'Rev'.padEnd(6) +
      'CCR'.padEnd(6) +
      'Pass'.padEnd(6) +
      'Accept',
  )

  let totalSaved = 0
  let totalAccepted = 0
  let totalReverted = 0
  let totalCcr = 0
  let totalPass = 0

  for (const row of rows) {
    const ar = acceptanceRate(row.accepted, row.reverted)
    lines.push(
      `  ${row.lever.padEnd(16)} ${String(row.totalSaved).padStart(6)} ${String(row.accepted).padStart(4)} ${String(row.reverted).padStart(4)} ${String(row.ccrDropped).padStart(4)} ${String(row.passthrough).padStart(4)} ${ar}`,
    )
    totalSaved += row.totalSaved
    totalAccepted += row.accepted
    totalReverted += row.reverted
    totalCcr += row.ccrDropped
    totalPass += row.passthrough
  }

  // Totals row
  const totalAr = acceptanceRate(totalAccepted, totalReverted)
  lines.push('  ' + '-'.repeat(60))
  lines.push(
    `  ${'TOTAL'.padEnd(16)} ${String(totalSaved).padStart(6)} ${String(totalAccepted).padStart(4)} ${String(totalReverted).padStart(4)} ${String(totalCcr).padStart(4)} ${String(totalPass).padStart(4)} ${totalAr}`,
  )

  // Monthly projection
  const firstTs = db.prepare('SELECT MIN(ts) AS first FROM economy_lever_ledger').get() as { first: number } | undefined
  if (firstTs && firstTs.first > 0) {
    const elapsedDays = Math.max(1, Math.ceil((Date.now() - firstTs.first) / (1000 * 60 * 60 * 24)))
    const dailyRate = totalSaved / elapsedDays
    const monthlyProjection = Math.round(dailyRate * 30)
    lines.push('')
    lines.push(
      `Projeção mensal: ~${monthlyProjection} tokens/mês economizados (${elapsedDays} dias de dados, média ${Math.round(dailyRate)}/dia)`,
    )
  }

  return lines.join('\n')
}

/**
 * Costura única de economia: grava no `economy_lever_ledger` toda entry do
 * TokenLedger que carrega economia (`savedTokens > 0`), atribuindo ao lever
 * declarado (`entry.lever`) ou, na ausência, ao `response_cache` (hit de cache
 * de resposta). Cobre artifact_reuse, repo_map e quaisquer levers sintéticos —
 * por isso vive dentro de `persistLedger` e roda em TODOS os caminhos `--live`.
 * Retorna quantos eventos foram gravados.
 */
export function recordSavingsEvents(db: Database.Database, ledger: TokenLedger, sessionId: string): number {
  let count = 0
  for (const entry of ledger.entries()) {
    const saved = entry.savedTokens ?? 0
    if (saved <= 0) continue
    recordLeverEvent(db, {
      surface: 'internal',
      sessionId,
      nodeId: entry.nodeId,
      lever: entry.lever ?? 'response_cache',
      tokensBefore: saved,
      tokensAfter: 0,
      saved,
      accepted: true,
      gateOutcome: 'accepted',
    })
    count++
  }
  return count
}

/**
 * @deprecated Use {@link recordSavingsEvents}. Mantido por compat: delega para a
 * costura única (que cobre cache de resposta + levers sintéticos).
 */
export function recordCacheHitEvents(db: Database.Database, ledger: TokenLedger, sessionId: string): number {
  return recordSavingsEvents(db, ledger, sessionId)
}
