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
import { summarizeLedgerByTier } from '../observability/llm-call-ledger.js'
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
