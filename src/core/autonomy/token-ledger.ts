/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Token-ledger do loop autônomo (M1g) — torna a economia de token **visível e
 * auditável**. Cada chamada de modelo durante a implementação de uma task é
 * registrada (tokens in/out, modelo) e agregada por task; `totals()` fecha a
 * conta da sessão.
 *
 * Medição sem custo: quando o adapter do Copilot reporta `tokensIn/Out`, usa o
 * valor real; senão estima por `chars/4` (heurística próxima da tokenização de
 * GPT/Claude), zero dependências. O ledger é in-memory e puro — a persistência
 * no `llm_call_ledger` (SQLite) é um passo separado.
 */

/** Estima tokens de um texto por `chars/4` (ceil). Zero deps. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface CallUsage {
  /** ID canônico do modelo que atendeu a chamada. */
  model: string
  tokensIn: number
  tokensOut: number
  /** Tokens de input que deram cache hit de prefixo (Frente B). */
  cachedTokensIn?: number
  /** Subconjunto de tokensOut gastos em raciocínio (output caro — Frente C). */
  reasoningTokens?: number
  /** Servido do cache local de resposta → 0 spend real; `savedTokens` é a economia. */
  fromCache?: boolean
  /** Tokens que seriam gastos não fosse o cache local (in+out da resposta cacheada). */
  savedTokens?: number
  /**
   * Rótulo da alavanca que gerou a economia desta entry (`response_cache`,
   * `artifact_reuse`, `repo_map`, …). Quando ausente e `fromCache` é true,
   * trata-se de um hit de cache de resposta. Entries com `lever` são sintéticas
   * (economia sem spend) e não viram linha de chamada em `llm_call_ledger`.
   */
  lever?: string
}

export interface TaskTokens {
  nodeId: string
  calls: number
  tokensIn: number
  tokensOut: number
  total: number
}

export interface LedgerTotals {
  calls: number
  tokensIn: number
  tokensOut: number
  total: number
  cachedTokensIn: number
}

/** Uma chamada de modelo registrada (task + uso de tokens). */
export type LedgerEntry = { nodeId: string } & CallUsage

type Row = LedgerEntry

/** Acumula o uso de tokens por task ao longo de uma sessão de autopilot. */
export class TokenLedger {
  private readonly rows: Row[] = []

  /** Registra o uso (reportado ou estimado) de uma chamada de modelo. */
  record(nodeId: string, usage: CallUsage): void {
    this.rows.push({ nodeId, ...usage })
  }

  /**
   * Conveniência: registra uma chamada usando tokens reportados quando
   * disponíveis, senão estima por `chars/4`. Retorna o `CallUsage` gravado.
   */
  recordCall(
    nodeId: string,
    args: {
      model: string
      prompt: string
      response: string
      reportedIn?: number
      reportedOut?: number
      reportedCachedIn?: number
      reportedReasoning?: number
      /** Resposta veio do cache local → não conta como spend; vira economia. */
      fromCache?: boolean
    },
  ): CallUsage {
    const inTok = args.reportedIn ?? estimateTokens(args.prompt)
    const outTok = args.reportedOut ?? estimateTokens(args.response)
    if (args.fromCache) {
      // Cache hit: spend real = 0; o que seria gasto vira economia (savedTokens).
      const usage: CallUsage = {
        model: args.model,
        tokensIn: 0,
        tokensOut: 0,
        fromCache: true,
        savedTokens: inTok + outTok,
      }
      this.record(nodeId, usage)
      return usage
    }
    const usage: CallUsage = {
      model: args.model,
      tokensIn: inTok,
      tokensOut: outTok,
      ...(args.reportedCachedIn !== undefined ? { cachedTokensIn: args.reportedCachedIn } : {}),
      ...(args.reportedReasoning !== undefined ? { reasoningTokens: args.reportedReasoning } : {}),
    }
    this.record(nodeId, usage)
    return usage
  }

  /** Agrega os tokens de uma task. Node sem chamadas → zeros. */
  byTask(nodeId: string): TaskTokens {
    const acc: TaskTokens = { nodeId, calls: 0, tokensIn: 0, tokensOut: 0, total: 0 }
    for (const row of this.rows) {
      if (row.nodeId !== nodeId) continue
      acc.calls += 1
      acc.tokensIn += row.tokensIn
      acc.tokensOut += row.tokensOut
    }
    acc.total = acc.tokensIn + acc.tokensOut
    return acc
  }

  /** Uma linha agregada por task (ordem de primeira aparição). */
  tasks(): TaskTokens[] {
    const seen: string[] = []
    for (const row of this.rows) {
      if (!seen.includes(row.nodeId)) seen.push(row.nodeId)
    }
    return seen.map((nodeId) => this.byTask(nodeId))
  }

  /** Uma linha por chamada, em ordem de registro (para persistência/auditoria). */
  entries(): readonly LedgerEntry[] {
    return this.rows.map((row) => ({ ...row }))
  }

  /** Soma total da sessão. */
  totals(): LedgerTotals {
    const acc: LedgerTotals = { calls: 0, tokensIn: 0, tokensOut: 0, total: 0, cachedTokensIn: 0 }
    for (const row of this.rows) {
      acc.calls += 1
      acc.tokensIn += row.tokensIn
      acc.tokensOut += row.tokensOut
      acc.cachedTokensIn += row.cachedTokensIn ?? 0
    }
    acc.total = acc.tokensIn + acc.tokensOut
    return acc
  }
}
