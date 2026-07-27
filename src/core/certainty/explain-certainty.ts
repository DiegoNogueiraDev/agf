/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Explica os MEIOS da Delivery Certainty (node_138a23eaa5f0, épico
 * node_7deb314e81b0).
 *
 * PORQUÊ: um veredito que diz "PROVEN_INCOMPLETE" sem dizer COMO chegou lá
 * obriga o operador a ler código. O pedido do usuário foi explícito — "deixar
 * muito claro os meios que possibilitam isso" — então cada pilar precisa
 * declarar O QUE mede, QUAL a fonte e POR QUE torna o done confiável.
 *
 * DRY/anti-drift: lê o catálogo ÚNICO (PILLAR_META em delivery-certainty.ts) que
 * o próprio composer usa. Se a explicação vivesse numa cópia, ela mentiria assim
 * que o composer mudasse. Puro — a superfície (certainty-cmd --explain) formata.
 */

import { PILLAR_META, PILLAR_KEYS, type CertaintyPillar, type DeliveryCertainty } from './delivery-certainty.js'

/** Um pilar explicado (modelo genérico, sem node). */
export interface PillarExplanation {
  key: CertaintyPillar['key']
  kind: CertaintyPillar['kind']
  measures: string
  source: string
  rationale: string
}

/** Um pilar explicado + o estado observado num node concreto. */
export interface PillarExplanationWithState extends PillarExplanation {
  state: CertaintyPillar['state']
  detail: string
}

/**
 * O MODELO de certeza, sem depender de node algum — responde "como o agf decide
 * que algo está pronto?". É o que `--explain` imprime quando não há id válido
 * (nunca crasha por ausência de dado).
 */
export function explainCertaintyModel(): PillarExplanation[] {
  return PILLAR_KEYS.map((key) => ({
    key,
    kind: PILLAR_META[key].kind,
    measures: PILLAR_META[key].measures,
    source: PILLAR_META[key].source,
    rationale: PILLAR_META[key].rationale,
  }))
}

/**
 * O modelo + o estado REAL de cada pilar para um veredito concreto. Preserva o
 * `state`/`detail` observados (um pilar vermelho continua vermelho — explain
 * nunca esconde falha) e o `rationale` que o próprio composer emitiu.
 */
export function explainCertainty(certainty: DeliveryCertainty): PillarExplanationWithState[] {
  return certainty.pillars.map((p) => ({
    key: p.key,
    kind: p.kind,
    measures: PILLAR_META[p.key].measures,
    source: p.source,
    rationale: p.rationale,
    state: p.state,
    detail: p.detail,
  }))
}
