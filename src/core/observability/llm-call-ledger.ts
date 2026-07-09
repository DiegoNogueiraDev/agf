/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Persistência do token-ledger no `llm_call_ledger` (SQLite) — fecha a malha
 * *medição → baseline → economia comprovada* (M1h). O `TokenLedger` é in-memory
 * por sessão; ao final do run, suas entries viram linhas auditáveis que o
 * `savings-ledger` (harness) já sabe somar via `getSessionTokensConsumed`.
 *
 * Mantém o `TokenLedger` puro (sem DB): este módulo é a única costura com o
 * SQLite, recebendo o ledger e os metadados da sessão.
 */
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'
import { calculateCost } from './cost-tracker.js'
import { recordSavingsEvents } from '../economy/economy-lever-ledger.js'
import type { TokenLedger } from '../autonomy/token-ledger.js'
import { MODEL_POOL } from '../model-hub/tier-router.js'
import type { ModelTier } from '../model-hub/tier-router.js'

const log = createLogger({ layer: 'core', source: 'llm-call-ledger.ts' })

/** Infers the tier (cheap|build|frontier) for a known model id. Returns null for unknowns. */
export function inferModelTier(modelId: string): ModelTier | null {
  const def = MODEL_POOL.find((m) => m.id === modelId)
  return def?.tier ?? null
}

export interface ModelCallRow {
  sessionId: string
  projectId?: string
  runId?: string
  nodeId?: string
  caller?: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Subconjunto de inputTokens com cache hit (cobrado ~10% — Frente B). */
  cachedInputTokens?: number
  /** Subconjunto de outputTokens gastos em raciocínio (output caro — Frente C). */
  reasoningTokens?: number
  costUsd?: number
  status?: string
  /** Tier do tier-router (cheap|build|frontier). Inferred from model if not provided. */
  modelTier?: string
  /** true quando o tier-router escalou de cheap → build/frontier. */
  escalated?: boolean
  /** Motivo da escalação automática (ex: "ac_count=5>3; context_size=9000>=8000"). Null quando não escalado. */
  escalationReason?: string
}

/** Insere uma linha em `llm_call_ledger`, retornando o id gerado. */
export function recordModelCall(db: Database.Database, row: ModelCallRow): string {
  const id = `llm_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  // custo: usa o explícito; senão deriva do preço (cache hit cobra ~10% do input).
  const costUsd =
    row.costUsd ?? calculateCost(row.model, row.inputTokens, row.outputTokens, row.cachedInputTokens).totalUsd
  // tier: usa o explícito ou infere do pool de modelos.
  const modelTier = row.modelTier ?? inferModelTier(row.model) ?? null
  const escalated = row.escalated !== undefined ? (row.escalated ? 1 : 0) : null
  const escalationReason = row.escalationReason ?? null
  db.prepare(
    `INSERT INTO llm_call_ledger
      (id, ts, project_id, run_id, node_id, caller, provider, model,
       input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, cost_usd, status, session_id,
       model_tier, escalated, escalation_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    Date.now(),
    row.projectId ?? null,
    row.runId ?? null,
    row.nodeId ?? null,
    row.caller ?? 'autopilot',
    row.provider,
    row.model,
    row.inputTokens,
    row.outputTokens,
    row.cachedInputTokens ?? null,
    row.reasoningTokens ?? null,
    costUsd,
    row.status ?? 'ok',
    row.sessionId,
    modelTier,
    escalated,
    escalationReason,
  )
  return id
}

export interface TierMetric {
  tier: string
  calls: number
  totalTokensIn: number
  totalTokensOut: number
  avgTokensTotal: number
  totalCostUsd: number
  avgCostUsd: number
  escalatedCalls: number
  callsPct: number
}

/**
 * Agrega o `llm_call_ledger` por `model_tier`. Linhas sem tier (NULL) ficam
 * agrupadas em '(unknown)'. Inclui `callsPct` — % do total por tier.
 */
export function summarizeLedgerByTier(db: Database.Database): TierMetric[] {
  const rows = db
    .prepare(
      `SELECT
       COALESCE(model_tier, '(unknown)') AS tier,
       COUNT(*) AS calls,
       COALESCE(SUM(input_tokens), 0) AS tin,
       COALESCE(SUM(output_tokens), 0) AS tout,
       COALESCE(SUM(cost_usd), 0) AS cost,
       COALESCE(SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END), 0) AS esc
     FROM llm_call_ledger
     GROUP BY COALESCE(model_tier, '(unknown)')
     ORDER BY calls DESC`,
    )
    .all() as Array<{ tier: string; calls: number; tin: number; tout: number; cost: number; esc: number }>

  const totalCalls = rows.reduce((s, r) => s + r.calls, 0)
  return rows.map((r) => ({
    tier: r.tier,
    calls: r.calls,
    totalTokensIn: r.tin,
    totalTokensOut: r.tout,
    avgTokensTotal: r.calls > 0 ? Math.round((r.tin + r.tout) / r.calls) : 0,
    totalCostUsd: r.cost,
    avgCostUsd: r.calls > 0 ? r.cost / r.calls : 0,
    escalatedCalls: r.esc,
    callsPct: totalCalls > 0 ? Math.round((r.calls / totalCalls) * 100) : 0,
  }))
}

export interface PersistLedgerMeta {
  sessionId: string
  projectId?: string
  runId?: string
  provider: string
}

/**
 * Grava cada entry do ledger como uma linha de `llm_call_ledger`. Atômico
 * (transação), retorna o número de linhas inseridas. Ledger vazio → 0.
 */
export function persistLedger(db: Database.Database, ledger: TokenLedger, meta: PersistLedgerMeta): number {
  const entries = ledger.entries()
  if (entries.length === 0) return 0

  let modelRows = 0
  const insertAll = db.transaction(() => {
    for (const entry of entries) {
      // Entries sintéticas (cache hit ou lever de economia) não são chamadas de
      // modelo — não viram linha em llm_call_ledger; a economia é gravada abaixo.
      if (entry.fromCache || entry.lever) continue
      modelRows += 1
      recordModelCall(db, {
        sessionId: meta.sessionId,
        projectId: meta.projectId,
        runId: meta.runId,
        nodeId: entry.nodeId,
        provider: meta.provider,
        model: entry.model,
        inputTokens: entry.tokensIn,
        outputTokens: entry.tokensOut,
        ...(entry.cachedTokensIn !== undefined ? { cachedInputTokens: entry.cachedTokensIn } : {}),
        ...(entry.reasoningTokens !== undefined ? { reasoningTokens: entry.reasoningTokens } : {}),
      })
    }
    // Costura única de economia (A2): cache hits + levers sintéticos
    // (artifact_reuse, repo_map, …) viram eventos no economy_lever_ledger,
    // atomicamente com as linhas de chamada. Roda em todo caminho que persiste.
    recordSavingsEvents(db, ledger, meta.sessionId)
  })
  insertAll()

  log.info('Token-ledger persistido', { session: meta.sessionId, rows: modelRows })
  return modelRows
}

export interface LedgerTotals {
  calls: number
  tokensIn: number
  tokensOut: number
  /** Tokens de input que deram cache hit de prefixo (Frente B). */
  cachedTokensIn: number
  /** Tokens de output gastos em raciocínio (Frente C — T_reason). */
  reasoningTokens: number
  total: number
  /** Custo em USD (piso: apenas modelos com preço cadastrado contribuem). */
  costUsd: number
}

export interface TaskMetric {
  nodeId: string
  calls: number
  tokensIn: number
  tokensOut: number
  cachedTokensIn: number
  total: number
  costUsd: number
}

export interface SessionMetric {
  sessionId: string
  calls: number
  total: number
  costUsd: number
}

export interface LedgerSummary {
  totals: LedgerTotals
  /** Uma linha por task, ordenada por total de tokens desc. */
  byTask: TaskMetric[]
  /** Uma linha por sessão, ordenada por total desc. */
  bySession: SessionMetric[]
  /** Média de tokens por task distinta (0 quando não há tasks). */
  avgTokensPerTask: number
}

/**
 * Lê o `llm_call_ledger` agregado: totais, tokens/task, tokens/sessão e média
 * por task — a métrica pública de economia (tokens/task) sobre dados reais.
 * Opcionalmente restrito a uma sessão.
 */
export function summarizeLedger(db: Database.Database, opts: { sessionId?: string } = {}): LedgerSummary {
  const where = opts.sessionId ? 'WHERE session_id = ?' : ''
  const params = opts.sessionId ? [opts.sessionId] : []

  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS tin,
              COALESCE(SUM(output_tokens), 0) AS tout,
              COALESCE(SUM(cached_input_tokens), 0) AS cached,
              COALESCE(SUM(reasoning_tokens), 0) AS reasoning,
              COALESCE(SUM(cost_usd), 0) AS cost
       FROM llm_call_ledger ${where}`,
    )
    .get(...params) as { calls: number; tin: number; tout: number; cached: number; reasoning: number; cost: number }
  const totals: LedgerTotals = {
    calls: totalsRow.calls,
    tokensIn: totalsRow.tin,
    tokensOut: totalsRow.tout,
    cachedTokensIn: totalsRow.cached,
    reasoningTokens: totalsRow.reasoning,
    total: totalsRow.tin + totalsRow.tout,
    costUsd: totalsRow.cost,
  }

  const taskRows = db
    .prepare(
      `SELECT COALESCE(node_id, '(sem task)') AS node_id,
              COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS tin,
              COALESCE(SUM(output_tokens), 0) AS tout,
              COALESCE(SUM(cached_input_tokens), 0) AS cached,
              COALESCE(SUM(cost_usd), 0) AS cost
       FROM llm_call_ledger ${where}
       GROUP BY COALESCE(node_id, '(sem task)')
       ORDER BY (COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0)) DESC`,
    )
    .all(...params) as Array<{
    node_id: string
    calls: number
    tin: number
    tout: number
    cached: number
    cost: number
  }>
  const byTask: TaskMetric[] = taskRows.map((r) => ({
    nodeId: r.node_id,
    calls: r.calls,
    tokensIn: r.tin,
    tokensOut: r.tout,
    cachedTokensIn: r.cached,
    total: r.tin + r.tout,
    costUsd: r.cost,
  }))

  const sessionRows = db
    .prepare(
      `SELECT COALESCE(session_id, '(sem sessão)') AS session_id,
              COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) AS total,
              COALESCE(SUM(cost_usd), 0) AS cost
       FROM llm_call_ledger ${where}
       GROUP BY COALESCE(session_id, '(sem sessão)')
       ORDER BY total DESC`,
    )
    .all(...params) as Array<{ session_id: string; calls: number; total: number; cost: number }>
  const bySession: SessionMetric[] = sessionRows.map((r) => ({
    sessionId: r.session_id,
    calls: r.calls,
    total: r.total,
    costUsd: r.cost,
  }))

  const avgTokensPerTask = byTask.length > 0 ? Math.round(totals.total / byTask.length) : 0

  return { totals, byTask, bySession, avgTokensPerTask }
}
