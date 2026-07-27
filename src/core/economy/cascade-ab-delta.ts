/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Delta antes→depois do A/B do cascade (node_616e64c1a5ad, épico
 * node_66df2059d21e).
 *
 * PORQUÊ: o A/B (runCascadeAb, src/core/evals/tier-trade.ts) já roda os dois
 * braços e grava, por task, `tokens_before` (braço OFF = baseline) e
 * `tokens_after` (braço ON = cascade) no `economy_lever_ledger` sob o lever
 * 'cascade'. Mas nada SURFAVA esse número: o valor do A/B ficava no banco, fora
 * do comando que o usuário roda. Este agregador é a leitura honesta desse par.
 *
 * Sinal honesto: `deltaTokens = before − after`. Positivo = o cascade economizou;
 * **negativo = o cascade custou mais** — e o sinal negativo é preservado, nunca
 * zerado ou clampado. Um A/B que volta contra a feature é um resultado válido.
 *
 * Ledger vazio ⇒ `hasData:false` + `note` explicando — jamais um zero silencioso
 * que passa por "não houve gasto".
 *
 * NÃO recupera custo/latência POR BRAÇO: o produtor grava as duas chamadas com o
 * mesmo `nodeId` e `caller:'cascade-ab'`, sem marcar o braço, e não registra
 * latência. Ver o finding aberto — aqui não se inventa o que a fonte não tem.
 */

import type Database from 'better-sqlite3'

/** Delta agregado do A/B — o que `agf metrics --economy-report` exibe. */
export interface CascadeAbDelta {
  /** true quando há ≥1 linha do A/B; false ⇒ os zeros são "sem dado". */
  hasData: boolean
  /** Tasks do A/B (1 linha de lever por task). `tasks` seria comido pelo strip-list do ai-compress. */
  taskCount: number
  /** Σ tokens do braço OFF (baseline). */
  tokensBefore: number
  /** Σ tokens do braço ON (cascade). */
  tokensAfter: number
  /** before − after. Positivo = economizou; negativo = custou mais (sinal preservado). */
  deltaTokens: number
  /** Redução % sobre o baseline OFF; 0 quando o baseline é 0. */
  reductionPercent: number
  /** Explicação legível — sempre presente, principalmente quando não há dado. */
  note: string
}

interface CascadeRow {
  taskCount: number | null
  before: number | null
  after: number | null
}

const EMPTY: CascadeAbDelta = {
  hasData: false,
  taskCount: 0,
  tokensBefore: 0,
  tokensAfter: 0,
  deltaTokens: 0,
  reductionPercent: 0,
  note: 'sem dados: nenhum A/B de cascade registrado (rode o A/B com um provider conectado)',
}

/**
 * Lê as linhas do lever 'cascade' e devolve o delta antes→depois. Puro sobre a
 * tabela — testável com `new Database(':memory:')`.
 */
export function buildCascadeAbDelta(db: Database.Database): CascadeAbDelta {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS taskCount,
              SUM(tokens_before) AS before,
              SUM(tokens_after)  AS after
         FROM economy_lever_ledger
        WHERE lever = 'cascade'`,
    )
    .get() as CascadeRow | undefined

  const taskCount = row?.taskCount ?? 0
  if (!row || taskCount === 0) return EMPTY

  const tokensBefore = row.before ?? 0
  const tokensAfter = row.after ?? 0
  const deltaTokens = tokensBefore - tokensAfter
  const reductionPercent = tokensBefore > 0 ? +((deltaTokens / tokensBefore) * 100).toFixed(2) : 0

  return {
    hasData: true,
    taskCount,
    tokensBefore,
    tokensAfter,
    deltaTokens,
    reductionPercent,
    note:
      deltaTokens >= 0
        ? `cascade economizou ${deltaTokens} tokens em ${taskCount} task(s) (${reductionPercent}% vs baseline OFF)`
        : `cascade CUSTOU ${Math.abs(deltaTokens)} tokens a mais em ${taskCount} task(s) — resultado contra a feature`,
  }
}
