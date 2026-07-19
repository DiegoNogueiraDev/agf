/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Certainty gate (node_03aed600188a, épico node_7deb314e81b0).
 *
 * PORQUÊ: o veredito de Delivery Certainty só vira ENFORCEMENT quando algo
 * recusa o `done` abaixo do limiar. Este é o predicado puro que decide: só
 * `PROVEN` (todos os pilares HARD verdes) passa. `PROVEN_INCOMPLETE` bloqueia
 * (há pilar hard vermelho) e `UNKNOWN` também — ausência de dado nunca é prova
 * (o mesmo princípio do phantom_done: sem evidência física, não é entrega).
 *
 * A recusa NOMEIA os pilares bloqueadores: um gate que barra sem dizer o porquê
 * é tão inútil quanto um verde falso. Puro — a superfície (done-cmd) injeta o
 * veredito e traduz em envelope/exit-code.
 */

import type { DeliveryCertainty } from './delivery-certainty.js'

/** Veredito do gate: passa ou barra, com o motivo nomeado. */
export interface CertaintyGateVerdict {
  blocked: boolean
  band: DeliveryCertainty['band']
  confidence: number
  /** Keys dos pilares HARD vermelhos que motivaram o bloqueio. */
  blockingPillars: string[]
  /** Motivo legível — nomeia os pilares para o operador agir. */
  reason: string
}

/**
 * Decide se o `done` pode prosseguir. Só `PROVEN` passa; qualquer outra banda
 * bloqueia. Quando a banda é UNKNOWN sem pilares vermelhos explícitos, o motivo
 * explica que faltam os arquivos físicos para provar qualquer coisa.
 */
export function evaluateCertaintyGate(certainty: DeliveryCertainty): CertaintyGateVerdict {
  const { band, confidence, blockingPillars } = certainty

  if (band === 'PROVEN') {
    return { blocked: false, band, confidence, blockingPillars: [], reason: 'todos os pilares hard verdes' }
  }

  const named = blockingPillars.length > 0 ? blockingPillars.join(', ') : 'nenhum arquivo físico declarado (code/test)'
  const reason =
    band === 'UNKNOWN'
      ? `certeza UNKNOWN (confidence ${confidence}): ${named} — ausência de dado não é prova`
      : `certeza insuficiente (band ${band}, confidence ${confidence}): pilar(es) hard vermelho(s): ${named}`

  return { blocked: true, band, confidence, blockingPillars: [...blockingPillars], reason }
}
