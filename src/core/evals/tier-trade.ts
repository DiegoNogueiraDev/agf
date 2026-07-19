/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tier trade — quantifica a troca economia↔latência do roteamento frontier-first
 * (epic node_66df2059d21e; complemento do wire em cascade-policy/provider-context).
 *
 * Lê o ledger REAL — `model_tier` + `cost_usd`, já gravados por learned-router e
 * reusa {@link summarizeLedgerByTier} (fonte única do custo por tier, DRY) — e o
 * tempo de ciclo (created→updated) dos nodes done atribuídos a cada tier. Expõe o
 * delta frontier↔cheap: **economia sacrificada** (Δcusto) vs **latência ganha**
 * (Δciclo). Sem migração de schema — as colunas já existem.
 *
 * O núcleo ({@link computeTierTrade}) é puro/determinístico; o collector tolera um
 * ledger ausente/quebrado — loga e devolve null, NUNCA aborta o run (AC2).
 */

import type Database from 'better-sqlite3'
import type { SqliteStore } from '../store/sqlite-store.js'
import { summarizeLedgerByTier, recordModelCall } from '../observability/llm-call-ledger.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tier-trade.ts' })

const HOURS_MS = 3_600_000
const REAL_TIERS = new Set(['cheap', 'build', 'frontier'])

const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000
const round2 = (n: number): number => Math.round(n * 100) / 100

/** Uma linha por tier: custo do ledger + tempo médio de ciclo dos nodes atribuídos. */
export interface TierTradeRow {
  tier: string
  costUsd: number
  avgCycleTimeHours: number
  tasks: number
}

export interface TierTrade {
  /** Linhas por tier, ordenadas por nome (determinístico). */
  byTier: TierTradeRow[]
  /** frontier.costUsd − cheap.costUsd (>0 = economia sacrificada por assertividade). */
  economySacrificedUsd: number
  /** cheap.avgCycleTimeHours − frontier.avgCycleTimeHours (>0 = latência ganha). */
  latencyGainedHours: number
  /** Presente quando faltam cheap+frontier — a troca não é quantificável. */
  note?: string
}

/**
 * Puro: calcula o delta frontier↔cheap a partir das linhas por tier. Quando um dos
 * dois tiers está ausente, devolve deltas 0 + note (a troca precisa dos dois lados).
 */
export function computeTierTrade(rows: readonly TierTradeRow[]): TierTrade {
  const byTier = [...rows].sort((a, b) => a.tier.localeCompare(b.tier))
  const cheap = rows.find((r) => r.tier === 'cheap')
  const frontier = rows.find((r) => r.tier === 'frontier')
  if (!cheap || !frontier) {
    return {
      byTier,
      economySacrificedUsd: 0,
      latencyGainedHours: 0,
      note: 'sem ambos os tiers cheap+frontier no ledger — troca não quantificável',
    }
  }
  return {
    byTier,
    economySacrificedUsd: round6(frontier.costUsd - cheap.costUsd),
    latencyGainedHours: round2(cheap.avgCycleTimeHours - frontier.avgCycleTimeHours),
  }
}

/**
 * Colhe as linhas por tier (custo do ledger + ciclo dos nodes) e calcula a troca.
 * Ledger ausente/quebrado ⇒ loga e devolve null (AC2: run nunca aborta).
 */
export function collectTierTrade(store: SqliteStore): TierTrade | null {
  try {
    const db = store.getDb()
    const costByTier = new Map(summarizeLedgerByTier(db).map((t) => [t.tier, t.totalCostUsd]))
    const cycleByTier = cycleTimesByTier(store, db)
    const tiers = new Set([...costByTier.keys(), ...cycleByTier.keys()].filter((t) => REAL_TIERS.has(t)))
    const rows: TierTradeRow[] = [...tiers].map((tier) => {
      const cyc = cycleByTier.get(tier) ?? { totalHours: 0, tasks: 0 }
      return {
        tier,
        costUsd: round6(costByTier.get(tier) ?? 0),
        avgCycleTimeHours: cyc.tasks > 0 ? round2(cyc.totalHours / cyc.tasks) : 0,
        tasks: cyc.tasks,
      }
    })
    return computeTierTrade(rows)
  } catch (err) {
    log.warn('tier-trade: ledger indisponível — troca não registrada', { err: String(err) })
    return null
  }
}

/**
 * Atribui cada node ao seu tier mais caro (dearest-cost, como aggregateArmStats) e
 * agrega o ciclo (updated−created) dos nodes done por tier.
 */
function cycleTimesByTier(
  store: SqliteStore,
  db: Database.Database,
): Map<string, { totalHours: number; tasks: number }> {
  const rows = db
    .prepare(
      `SELECT node_id AS nodeId, model_tier AS tier, COALESCE(cost_usd, 0) AS cost
         FROM llm_call_ledger
        WHERE node_id IS NOT NULL AND model_tier IN ('cheap','build','frontier')`,
    )
    .all() as Array<{ nodeId: string; tier: string; cost: number }>

  const nodeTier = new Map<string, { tier: string; cost: number }>()
  for (const r of rows) {
    const cur = nodeTier.get(r.nodeId)
    if (!cur || r.cost > cur.cost) nodeTier.set(r.nodeId, { tier: r.tier, cost: r.cost })
  }

  const out = new Map<string, { totalHours: number; tasks: number }>()
  for (const node of store.toGraphDocument().nodes) {
    if (node.status !== 'done') continue
    const attributed = nodeTier.get(node.id)
    if (!attributed || !node.createdAt || !node.updatedAt) continue
    const hours = (new Date(node.updatedAt).getTime() - new Date(node.createdAt).getTime()) / HOURS_MS
    const g = out.get(attributed.tier) ?? { totalHours: 0, tasks: 0 }
    g.totalHours += hours
    g.tasks += 1
    out.set(attributed.tier, g)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// A/B cascade runner — prova a troca economia↔assertividade com custo REAL
// (task node_feb062f1496a). O read-side acima analisa o ledger; ESTE lado o
// POPULA, rodando um task-set fixo sob cascade ON (barato) vs OFF (baseline) e
// gravando cada braço nos DOIS ledgers de fonte única (DRY):
//   • llm_call_ledger  ← custo real (cost_usd), por tier, atribuído por node.
//   • economy_lever_ledger ← delta de tokens do lever 'cascade' (off − on).
// O provider é injetado via {@link CascadeArmExecutor} (DIP) — zero I/O concreto
// aqui, 100% testável. Sem provider ⇒ mode:'delegated' (nunca custo 0 silencioso).
// NÃO toca o gêmeo core/llm/tier-router.ts — só o roteamento vive lá.
// ─────────────────────────────────────────────────────────────────────────────

/** Os dois braços do A/B: `on` = roteamento em cascade; `off` = baseline sem cascade. */
export type CascadeArm = 'on' | 'off'

/** Uso REAL devolvido por UMA chamada de provider em UM braço. Números vêm do gateway real. */
export interface CascadeArmUsage {
  provider: string
  model: string
  /** cheap|build|frontier — atribui o custo ao tier no llm_call_ledger. */
  modelTier: string
  inputTokens: number
  outputTokens: number
  /** Custo real em USD da chamada — !=0 é o que prova a medição (0 = contador off). */
  costUsd: number
}

/**
 * Port DIP: roda uma task em um braço via o provider LIVE. `available()===false`
 * ⇒ nenhum provider conectado ⇒ {@link runCascadeAb} fica delegado (não grava nada).
 */
export interface CascadeArmExecutor {
  available(): boolean
  runArm(arm: CascadeArm, task: string): Promise<CascadeArmUsage>
}

/** Agregado de um braço ao fim do A/B. */
export interface CascadeArmSummary {
  arm: CascadeArm
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface CascadeAbLive {
  mode: 'live'
  arms: Record<CascadeArm, CascadeArmSummary>
  /** on.costUsd − off.costUsd. <0 = cascade economizou; >0 = pagou por assertividade. */
  costDeltaUsd: number
  /** Σ(off.tokens − on.tokens) via lever 'cascade'. Sinal honesto — negativo = cascade custou mais. */
  savedTokens: number
  /** Linhas gravadas em economy_lever_ledger (1 por task). */
  leverRows: number
  /** Linhas gravadas em llm_call_ledger (2 por task — um por braço). */
  callRows: number
}

export interface CascadeAbDelegated {
  mode: 'delegated'
  reason: string
}

export type CascadeAbOutcome = CascadeAbLive | CascadeAbDelegated

const ARMS: readonly CascadeArm[] = ['on', 'off']
const blankSummary = (arm: CascadeArm): CascadeArmSummary => ({
  arm,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
})

/**
 * Roda o A/B cascade ON vs OFF sobre um task-set fixo, gravando custo real por
 * braço. Devolve `delegated` quando não há provider (AC2), lança em task-set
 * vazio (erro acionável, nunca 0 silencioso), e em modo live grava os dois
 * ledgers e devolve o delta economia↔custo.
 */
export async function runCascadeAb(
  db: Database.Database,
  executor: CascadeArmExecutor,
  taskSet: readonly string[],
  opts: { sessionId: string; nodeIdPrefix?: string },
): Promise<CascadeAbOutcome> {
  if (taskSet.length === 0) {
    throw new Error('cascade A/B: task-set vazio — informe ≥1 task (nunca resolve com custo 0 silencioso)')
  }
  if (!executor.available()) {
    return {
      mode: 'delegated',
      reason:
        'nenhum provider conectado — rode o A/B cascade com seu próprio LLM (agf brief) ' +
        'ou conecte um provider (agf provider use <id>). Nunca gravamos custo 0 silencioso.',
    }
  }

  const arms: Record<CascadeArm, CascadeArmSummary> = { on: blankSummary('on'), off: blankSummary('off') }
  const prefix = opts.nodeIdPrefix ?? 'cascade_ab_'
  let leverRows = 0
  let callRows = 0

  for (const [i, task] of taskSet.entries()) {
    const nodeId = `${prefix}${i}`
    const perArmTokens: Record<CascadeArm, number> = { on: 0, off: 0 }

    for (const arm of ARMS) {
      const usage = await executor.runArm(arm, task)
      recordModelCall(db, {
        sessionId: opts.sessionId,
        nodeId,
        caller: 'cascade-ab',
        provider: usage.provider,
        model: usage.model,
        modelTier: usage.modelTier,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      })
      callRows++
      const s = arms[arm]
      s.calls++
      s.inputTokens += usage.inputTokens
      s.outputTokens += usage.outputTokens
      s.costUsd += usage.costUsd
      perArmTokens[arm] += usage.inputTokens + usage.outputTokens
    }

    // Lever 'cascade': economia de tokens do cascade (on) vs baseline (off).
    const saved = perArmTokens.off - perArmTokens.on
    recordLeverEvent(db, {
      surface: 'internal',
      sessionId: opts.sessionId,
      nodeId,
      lever: 'cascade',
      tokensBefore: perArmTokens.off,
      tokensAfter: perArmTokens.on,
      saved,
      accepted: saved > 0,
      gateOutcome: saved > 0 ? 'accepted' : 'passthrough',
    })
    leverRows++
  }

  const costDeltaUsd = round6(arms.on.costUsd - arms.off.costUsd)
  const savedTokens = arms.off.inputTokens + arms.off.outputTokens - (arms.on.inputTokens + arms.on.outputTokens)
  return { mode: 'live', arms, costDeltaUsd, savedTokens, leverRows, callRows }
}
