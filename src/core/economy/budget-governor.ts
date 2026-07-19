/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Budget Governor — o TERMOSTATO do orçamento (E3.T2, épico node_2e8a6592d0ba).
 *
 * budget_kleiber ALOCA (alvo estático); este módulo REGULA em malha fechada:
 * erro relativo = (burnRate medido − alvo) / alvo → atuação PROPORCIONAL sobre
 * os knobs das levers habilitadas, sempre dentro de clamps, com banda de
 * histerese para não oscilar. Move a decisão de compressão do OPERADOR para o
 * AMBIENTE (estigmergia: lê as marcas do ledger via burnRate, atua nos
 * thresholds — nenhuma decisão do driver). Fundamento: BAGEN (arXiv 2606.00198),
 * Agent Contracts (arXiv 2601.08815).
 *
 * Puro por desenho: {@link governorTick} recebe medida/alvo/params por injeção e
 * devolve atuações; a persistência (setLeverParam) e o gatilho (task-prep tick)
 * são dos consumidores — E3.T3 wira, este arquivo nunca abre store.
 */

import type { LeverKey } from './economy-levers-config.js'

/**
 * Knob regulável de uma lever: qual param mover, em que direção comprime MAIS
 * (+1 = aumentar; −1 = diminuir) e os clamps invioláveis. Registry declarativo
 * (OCP): adicionar lever regulável = adicionar entrada, nunca editar o motor.
 * Direções derivadas da semântica de cada lever (ver docblocks em
 * economy-levers-config.ts): ncd_dedup.threshold ↑ deduplica mais;
 * info_bottleneck.beta ↓ aceita mais compressão; heat_kernel.t ↓ estreita a
 * difusão; forage_stop.minItems ↓ retém menos itens.
 */
export interface GovernorKnob {
  lever: LeverKey
  param: string
  min: number
  max: number
  direction: 1 | -1
}

export const GOVERNOR_KNOBS: readonly GovernorKnob[] = [
  { lever: 'ncd_dedup', param: 'threshold', min: 0.3, max: 0.6, direction: 1 },
  { lever: 'info_bottleneck', param: 'beta', min: 0.5, max: 2, direction: -1 },
  { lever: 'heat_kernel', param: 't', min: 0.2, max: 0.5, direction: -1 },
  { lever: 'forage_stop', param: 'minItems', min: 1, max: 3, direction: -1 },
]

/** Uma atuação do governador: mover `param` de `from` para `to` (clampado). */
export interface Actuation {
  lever: LeverKey
  param: string
  from: number
  to: number
}

export interface GovernorTickInput {
  /** tokens/min medidos na janela (fonte: burnRate em attribution.ts). */
  measuredRate: number
  /** tokens/min alvo (budget restante ÷ tempo restante — alocação do budget-kleiber). */
  targetRate: number
  /** Valor atual do param (fonte: getLeverParam sobre a config + LEVER_DEFAULTS). */
  currentParam: (lever: LeverKey, param: string) => number
  /** Só levers habilitadas são atuadas (fonte: isLeverEnabled). */
  isEnabled: (lever: LeverKey) => boolean
  /** Ganho proporcional. Default 0.5 — convergência sem overshoot na planta de referência. */
  gain?: number
  /** Banda morta relativa. Default 0.05 (±5%) — dentro dela, zero atuações. */
  hysteresisPct?: number
}

const DEFAULT_GAIN = 0.5
const DEFAULT_HYSTERESIS = 0.05

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Um tick do controlador proporcional. Determinístico e puro: mesmo input,
 * mesmas atuações. Atuação vazia (to === from, já clampado no bound) é omitida —
 * o ledger só recebe mudanças reais.
 */
export function governorTick(input: GovernorTickInput): Actuation[] {
  const gain = input.gain ?? DEFAULT_GAIN
  const hysteresis = input.hysteresisPct ?? DEFAULT_HYSTERESIS
  if (input.targetRate <= 0) return []

  const error = (input.measuredRate - input.targetRate) / input.targetRate
  if (Math.abs(error) <= hysteresis) return []

  const actuations: Actuation[] = []
  for (const knob of GOVERNOR_KNOBS) {
    if (!input.isEnabled(knob.lever)) continue
    const from = input.currentParam(knob.lever, knob.param)
    const span = knob.max - knob.min
    const to = clamp(from + knob.direction * gain * error * span, knob.min, knob.max)
    if (to === from) continue
    actuations.push({ lever: knob.lever, param: knob.param, from, to })
  }
  return actuations
}
