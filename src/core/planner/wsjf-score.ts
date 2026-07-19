/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * wsjf-score (node_b9c002916d15) — WSJF = Cost-of-Delay / JobSize, puro e
 * determinístico (nowMs injetável). Refina o sort do picker VIVO
 * (next-task.ts findNextTask; aco-select delega pra ele no caminho
 * determinístico) DENTRO da banda de prioridade — a banda em si continua
 * mandando primeiro; o WSJF só desempata dentro dela. NÃO toca
 * graph/auto-sequence.ts (gêmeo do `agf sequence`, não é o picker).
 *
 * CoD = peso-da-prioridade + peso-MoSCoW (tag must/should/could) + urgência
 * por idade (cresce devagar, com teto). JobSize = estimateMinutes, com
 * fallback no mapa xpSize→minutos. Nunca lança: campos ausentes/ inválidos
 * degradam a defaults seguros.
 */

import type { GraphNode } from '../graph/graph-types.js'

/** Fallback de JobSize quando estimateMinutes está ausente. */
export const XP_SIZE_MINUTES: Record<string, number> = {
  XS: 30,
  S: 60,
  M: 120,
  L: 240,
  XL: 480,
}

const DEFAULT_PRIORITY = 3
const MOSCOW_WEIGHT: Record<string, number> = { must: 3, should: 2, could: 1 }
/** Urgência por idade: +0.01 CoD/dia, teto 2 — sobe devagar, nunca domina. */
const AGE_COD_PER_DAY = 0.01
const AGE_COD_CAP = 2
const DAY_MS = 24 * 3600 * 1000

export interface WsjfScore {
  /** Cost of Delay (prioridade + MoSCoW + idade). */
  cod: number
  /** Minutos estimados (estimateMinutes ou mapa xpSize). */
  jobSize: number
  /** cod / jobSize — maior = fazer antes. */
  wsjf: number
}

export interface WsjfOptions {
  /** Injetável p/ determinismo em teste; default relógio real. */
  nowMs?: number
}

/** WSJF de um node — puro, determinístico, nunca lança. */
export function computeWsjf(node: GraphNode, opts: WsjfOptions = {}): WsjfScore {
  const nowMs = opts.nowMs ?? Date.now()

  const rawPriority =
    typeof node.priority === 'number' && Number.isFinite(node.priority) ? node.priority : DEFAULT_PRIORITY
  const priority = Math.min(5, Math.max(1, rawPriority))
  const priorityWeight = 6 - priority

  const moscowWeight = (node.tags ?? []).reduce((best, tag) => Math.max(best, MOSCOW_WEIGHT[tag] ?? 0), 0)

  const createdMs = node.createdAt ? Date.parse(node.createdAt) : NaN
  const ageDays = Number.isFinite(createdMs) ? Math.max(0, (nowMs - createdMs) / DAY_MS) : 0
  const ageBoost = Math.min(AGE_COD_CAP, ageDays * AGE_COD_PER_DAY)

  const cod = priorityWeight + moscowWeight + ageBoost

  const jobSize =
    typeof node.estimateMinutes === 'number' && Number.isFinite(node.estimateMinutes) && node.estimateMinutes > 0
      ? node.estimateMinutes
      : (XP_SIZE_MINUTES[node.xpSize ?? 'M'] ?? XP_SIZE_MINUTES.M)

  return { cod, jobSize, wsjf: cod / jobSize }
}
