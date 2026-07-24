/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * O ESTADO QUE A LISTA DEVE MOSTRAR (node_0b96f1ced50c).
 *
 * `agf economy list` lia a config PERSISTIDA e reportava `enabled: false` para
 * levers que estavam EFETIVAMENTE rodando: `resolveEffectiveLevers` liga o
 * bundle loss-safe sempre que um agente dirige (node_7ee81fd6a5e0). Medido —
 * `forage_stop`, `ncd_dedup`, `heat_kernel`, `info_bottleneck` e `zipf_estimate`
 * ativos, todos exibidos como desligados.
 *
 * Uma superfície que reporta o estado errado é pior que uma ausente: quem lê
 * decide com base nela.
 *
 * ─── Por que `source` e não só `enabled` ──────────────────────────────────────
 *
 * "Ligado" tem duas causas com consequências opostas para o usuário: quem ligou
 * à mão sabe e pode desligar; quem recebeu do bundle sequer sabe que está
 * ligado. Um booleano sozinho apaga essa diferença — e ela é exatamente o que o
 * operador precisa para agir.
 *
 * PURO: recebe as duas configs já resolvidas e devolve o estado. Quem as lê do
 * disco é o comando; assim a regra é testável sem store.
 */

import type { EconomyLeversConfig, LeverKey } from './economy-levers-config.js'

/** De onde veio o "ligado" — a informação que decide o que o usuário pode fazer. */
export type LeverSource = 'config' | 'auto-bundle' | 'none'

export interface LeverListState {
  enabled: boolean
  source: LeverSource
}

/**
 * Estado exibível de um lever, cruzando a config persistida com a efetiva.
 *
 * `effective` é o que de fato governa a execução (config + bundle
 * auto-ativado); `persisted` é só o que o usuário declarou. A lista reporta o
 * primeiro — mentir sobre o que roda foi o defeito — e usa o segundo apenas
 * para atribuir a causa.
 *
 * A escolha do operador vence na atribuição: se ele ligou explicitamente, a
 * origem é `config` mesmo que o bundle também ligasse. Creditar ao bundle
 * esconderia uma decisão que foi dele.
 */
export function leverListState(
  lever: LeverKey,
  persisted: EconomyLeversConfig,
  effective: EconomyLeversConfig,
): LeverListState {
  const enabled = effective[lever]?.enabled === true
  if (!enabled) return { enabled: false, source: 'none' }
  return { enabled: true, source: persisted[lever]?.enabled === true ? 'config' : 'auto-bundle' }
}
