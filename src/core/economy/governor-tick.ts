/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Governor Tick — a cola impura do termostato (E3.T3, node_95e41d13b52c).
 *
 * Fecha a malha NO AMBIENTE: lê a config (alvo/ganho/janela), mede o burnRate
 * da sessão no llm_call_ledger, roda o controlador puro (budget-governor.ts) e
 * PERSISTE as atuações via setLeverParam + linha auditável no
 * economy_lever_ledger. O driver (a formiga) nunca decide — o gatilho é o
 * prepareTask (task-prep.ts), que roda em todo `agf start`/`context`.
 *
 * Contrato de não-regressão: lever OFF ou alvo ≤ 0 → retorna null e NADA muda
 * (byte-idêntico). Falha de ledger nunca quebra o hot-path (best-effort).
 */

import type Database from 'better-sqlite3'
import { burnRate } from './attribution.js'
import { governorTick, type Actuation } from './budget-governor.js'
import { deriveTargetRatePerMin, type BudgetItem } from './budget-kleiber.js'
import {
  LEVER_DEFAULTS,
  getLeverParam,
  isLeverEnabled,
  resolveEconomyLeversConfig,
  setLeverParam,
  type EconomyLeversConfig,
  type EconomyLeversConfigStore,
} from './economy-levers-config.js'
import { recordLeverEvent } from './economy-lever-ledger.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'governor-tick.ts' })

/** Nó mínimo lido para dimensionar o backlog pendente na derivação Kleiber. */
interface SizedNode {
  status: string
  estimateMinutes?: number
}

/**
 * Store mínimo do tick: config read/write + db p/ ledger (SqliteStore satisfaz).
 * `toGraphDocument` é opcional — quando ausente (stub), a derivação do alvo trata
 * o backlog como vazio (a janela leva todo o budget declarado): degradação limpa,
 * nunca quebra o hot-path.
 */
export interface GovernorTickStore extends EconomyLeversConfigStore {
  getDb(): Database.Database
  toGraphDocument?(): { nodes: readonly SizedNode[] }
}

export interface GovernorTickOutcome {
  measuredRate: number
  targetRate: number
  actuations: Actuation[]
}

/** Itens dimensionados do backlog pendente (não-done, com estimateMinutes > 0). */
function pendingSizedItems(store: GovernorTickStore): BudgetItem[] {
  const doc = store.toGraphDocument?.()
  if (!doc) return []
  return doc.nodes
    .filter((n) => n.status !== 'done' && typeof n.estimateMinutes === 'number' && n.estimateMinutes > 0)
    .map((n, i) => ({ id: `n${i}`, size: n.estimateMinutes as number }))
}

/**
 * Alvo derivado do lever budget_kleiber: 0 quando o lever está OFF ou nenhum
 * orçamento foi declarado (o no-op honesto de hoje). Do contrário, a janela
 * disputa o budget declarado contra o backlog via deriveTargetRatePerMin.
 */
function deriveKleiberTarget(store: GovernorTickStore, cfg: EconomyLeversConfig, windowMs: number): number {
  if (!isLeverEnabled(cfg, 'budget_kleiber')) return 0
  const budgetTokens = getLeverParam(cfg, 'budget_kleiber', 'budgetTokens', 0)
  if (budgetTokens <= 0) return 0
  return deriveTargetRatePerMin(budgetTokens, windowMs, pendingSizedItems(store)) ?? 0
}

/**
 * Um tick completo do governador. Null = governador OFF ou sem alvo (no-op
 * ambiental honesto — o controlador nunca atua sem meta declarada na config).
 */
export function runGovernorTick(
  store: GovernorTickStore,
  opts: { sessionId: string; now?: number },
): GovernorTickOutcome | null {
  const cfg = resolveEconomyLeversConfig(store)
  if (!isLeverEnabled(cfg, 'budget_governor')) return null

  const defaults = LEVER_DEFAULTS.budget_governor
  const windowMs = getLeverParam(cfg, 'budget_governor', 'windowMs', defaults.windowMs)
  const declaredTarget = getLeverParam(cfg, 'budget_governor', 'targetRatePerMin', defaults.targetRatePerMin)

  // Alvo estático declarado vence; em 0, deriva do orçamento budget-kleiber
  // (pureza estigmérgica total — nada decidido fora do ambiente).
  const targetRate = declaredTarget > 0 ? declaredTarget : deriveKleiberTarget(store, cfg, windowMs)
  if (targetRate <= 0) return null

  const now = opts.now ?? Date.now()
  const measuredRate = burnRate(store.getDb(), opts.sessionId, windowMs, now)

  const actuations = governorTick({
    measuredRate,
    targetRate,
    currentParam: (lever, param) => getLeverParam(cfg, lever, param, LEVER_DEFAULTS[lever][param] ?? 0),
    isEnabled: (lever) => isLeverEnabled(cfg, lever),
    gain: getLeverParam(cfg, 'budget_governor', 'gain', defaults.gain),
    hysteresisPct: getLeverParam(cfg, 'budget_governor', 'hysteresisPct', defaults.hysteresisPct),
  })

  for (const a of actuations) {
    setLeverParam(store, a.lever, a.param, a.to)
    try {
      // Linha auditável da atuação: score = novo valor; baselineMethod carrega o
      // delta legível (`lever.param:de->para`) — a trilha que o quorum futuro lê.
      recordLeverEvent(store.getDb(), {
        sessionId: opts.sessionId,
        lever: 'budget_governor',
        tokensBefore: 0,
        tokensAfter: 0,
        saved: 0,
        accepted: true,
        gateOutcome: 'accepted',
        score: a.to,
        baselineMethod: `${a.lever}.${a.param}:${a.from.toFixed(4)}->${a.to.toFixed(4)}`,
        surface: 'internal',
      })
    } catch (err) {
      log.debug('governor:ledger:skipped', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { measuredRate, targetRate, actuations }
}
