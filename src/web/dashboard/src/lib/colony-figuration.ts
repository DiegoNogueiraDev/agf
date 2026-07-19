/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * colony-figuration (node_31ae9dd977c5) — transforma trilhas cruas de
 * feromônio em pesos VISUAIS para a ColonyView: strokeWidth/opacity
 * proporcionais ao amount (normalizado pelo mais forte), limitado ao top-K
 * por força. O cap é a mitigação dos risks node_2ef219d03cbb e
 * node_67a194b15e8a: centenas de trilhas nunca chegam ao DOM. Puro — zero
 * dependência de React/tema; a cor fica com o componente (CSS vars).
 */

import type { ColonyTrail } from './types'

/** Máximo de trilhas renderizadas — top-K por força. */
export const COLONY_TOP_K = 100

const MIN_STROKE_WIDTH = 1
const MAX_STROKE_WIDTH = 6
const MIN_OPACITY = 0.25
const MAX_OPACITY = 1

/** Trilha com os pesos visuais já resolvidos (normalized ∈ (0,1]). */
export interface FiguredTrail {
  readonly key: string
  readonly amount: number
  readonly ts: number
  readonly normalized: number
  readonly strokeWidth: number
  readonly opacity: number
}

/**
 * Descarta amounts inválidos (NaN/±Infinity/≤0), ordena por força, corta no
 * top-K e normaliza pelo mais forte — a trilha máxima sempre recebe peso cheio.
 */
export function figureTrails(trails: readonly ColonyTrail[], topK: number = COLONY_TOP_K): FiguredTrail[] {
  const valid = trails.filter((t) => Number.isFinite(t.amount) && t.amount > 0)
  if (valid.length === 0) return []

  const top = [...valid].sort((a, b) => b.amount - a.amount).slice(0, Math.max(0, topK))
  const max = top[0].amount

  return top.map((t) => {
    const normalized = t.amount / max
    return {
      key: t.key,
      amount: t.amount,
      ts: t.ts,
      normalized,
      strokeWidth: MIN_STROKE_WIDTH + normalized * (MAX_STROKE_WIDTH - MIN_STROKE_WIDTH),
      opacity: MIN_OPACITY + normalized * (MAX_OPACITY - MIN_OPACITY),
    }
  })
}
