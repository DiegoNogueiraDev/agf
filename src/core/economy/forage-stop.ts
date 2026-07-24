/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-SWE — Task 3.1: Lever forage_stop (Teorema do Valor Marginal, Charnov 1976).
 *
 * Ao forragear itens de contexto (RAG/wake-up), o forrageador ótimo abandona o
 * "patch" quando a taxa de ganho marginal cai abaixo da média do ambiente. Aqui:
 * mantém os itens com ganho ≥ média(ganhos) × (1−epsilon); para no primeiro da
 * cauda diminutiva (respeitando um piso minItems). Os tokens dos itens cortados
 * são a economia. Pura + opt-in: lever OFF → função não é chamada → byte-idêntico.
 */

import type { ForageStopParams } from './economy-levers-config.js'

/** Item candidato de contexto com ganho (relevância) e custo (tokens). */
export interface ForageItem {
  gain: number
  tokens: number
}

export interface ForageStopResult {
  keptCount: number
  droppedCount: number
  /** Tokens economizados ao cortar a cauda diminutiva. */
  droppedTokens: number
  /** Índice (no ranking desc) onde o forrageamento parou (= keptCount). */
  stoppedAt: number
  /** Limiar de ganho usado (média × (1−epsilon)). */
  threshold: number
}

/**
 * Aplica a regra de parada MVT a itens candidatos. Ordena por ganho desc, mantém
 * os acima do limiar (média do ambiente ajustada por epsilon) e os primeiros
 * `minItems` como piso; corta o resto. Nunca lança; lista vazia → tudo zero.
 */
export function forageStop(items: ForageItem[], params: ForageStopParams = {}): ForageStopResult {
  const minItems = Math.max(0, params.minItems ?? 1)
  const epsilon = params.epsilon ?? 0

  if (items.length === 0) {
    return { keptCount: 0, droppedCount: 0, droppedTokens: 0, stoppedAt: 0, threshold: 0 }
  }

  const avg = items.reduce((acc, it) => acc + it.gain, 0) / items.length
  const threshold = avg * (1 - epsilon)

  const ranked = [...items].sort((a, b) => b.gain - a.gain)
  let kept = 0
  for (let i = 0; i < ranked.length; i++) {
    if (i < minItems || ranked[i].gain >= threshold) kept++
    else break // cauda diminutiva — abandona o patch
  }

  const dropped = ranked.slice(kept)
  const droppedTokens = dropped.reduce((acc, it) => acc + it.tokens, 0)

  return {
    keptCount: kept,
    droppedCount: dropped.length,
    droppedTokens,
    stoppedAt: kept,
    threshold: Math.round(threshold * 1000) / 1000,
  }
}
