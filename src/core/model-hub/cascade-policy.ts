/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Cascade Policy — a gate da lever `cascade` + métrica de rescue-rate
 * (A.T3, node_d69da48f87ff; risk node_94d1acc90c1e).
 *
 * OFF (default) ⇒ {@link resolveCascadePolicy} retorna null e NENHUM consumidor
 * roda a cascata — caminho de chamada byte-idêntico (contrato anti-regressão).
 * ON ⇒ tiers barato→caro + knobs do verificador vindos da config.
 *
 * O rescue-rate materializa o achado do próprio FrugalGPT: quando cheap e caro
 * falham JUNTOS (falha compartilhada), a escalada só adiciona custo — classe
 * com rescue < 20% recebe recomendação OFF no envelope (mitigação do risk).
 */

import {
  LEVER_DEFAULTS,
  getLeverParam,
  isLeverEnabled,
  resolveEconomyLeversConfig,
  type EconomyLeversConfigSource,
} from '../economy/economy-levers-config.js'

export interface CascadePolicy {
  /** Ordem barato→caro (tiers do model-hub; o consumidor resolve tier→modelo). */
  tiers: readonly string[]
  maxEscalations: number
  /** Threshold repassado ao cascade-verifier. */
  threshold: number
}

const DEFAULT_TIERS = ['cheap', 'frontier'] as const

/** Tier inicial atual da cascata (o draft barato) — fonte única do fallback. */
export const DEFAULT_INITIAL_TIER = DEFAULT_TIERS[0]

/** xpSizes que justificam começar já no tier frontier (pulam o draft barato). */
const FRONTIER_SIZES: ReadonlySet<string> = new Set(['L', 'XL'])

/**
 * Regra determinística complexidade→tier inicial (0 tokens, SEM flag).
 *
 * Uma task L/XL raramente passa no draft barato, então a cascata começa já no
 * frontier — economiza a escalada garantida. Todo o resto (XS/S/M) e qualquer
 * xpSize ausente/ inválido cai no {@link DEFAULT_INITIAL_TIER}, mantendo o
 * caminho de chamada byte-idêntico ao atual (contrato anti-regressão). Case-
 * sensitive: só os literais canônicos do {@link XpSizeSchema} escalam.
 */
export function initialTierForComplexity(
  xpSize: string | undefined,
  defaultTier: string = DEFAULT_INITIAL_TIER,
): string {
  if (xpSize !== undefined && FRONTIER_SIZES.has(xpSize)) return 'frontier'
  return defaultTier
}

/**
 * Aplica {@link initialTierForComplexity} à cadeia de tiers da cascata: fatia a
 * lista a partir do tier inicial escolhido, descartando os drafts mais baratos
 * que uma task complexa raramente aproveitaria (frontier-first p/ L/XL). Para
 * XS/S/M — e qualquer xpSize ausente/inválido — o tier inicial é o primeiro da
 * lista, então a fatia é a lista inteira: caminho byte-idêntico ao atual. Se o
 * tier escolhido não estiver na lista (não deveria, dado o fallback), devolve a
 * lista completa. Pura; não muta a entrada.
 */
export function effectiveCascadeTiers(tiers: readonly string[], xpSize: string | undefined): readonly string[] {
  const initial = initialTierForComplexity(xpSize, tiers[0])
  const startIdx = tiers.indexOf(initial)
  return startIdx > 0 ? tiers.slice(startIdx) : tiers
}

/** Null quando a lever `cascade` está OFF — o consumidor cai no caminho atual. */
export function resolveCascadePolicy(source: EconomyLeversConfigSource): CascadePolicy | null {
  const cfg = resolveEconomyLeversConfig(source)
  if (!isLeverEnabled(cfg, 'cascade')) return null
  const defaults = LEVER_DEFAULTS.cascade
  return {
    tiers: DEFAULT_TIERS,
    maxEscalations: getLeverParam(cfg, 'cascade', 'maxEscalations', defaults.maxEscalations),
    threshold: getLeverParam(cfg, 'cascade', 'threshold', defaults.threshold),
  }
}

/** Uma escalada observada: a classe da task e se o tier caro RESGATOU o draft. */
export interface RescueEntry {
  taskClass: string
  rescued: boolean
  id: string
}

export interface RescueClassReport {
  taskClass: string
  total: number
  rescued: number
  rate: number
  /** true quando rescue < 20% — escalada não paga nesta classe (falha compartilhada). */
  recommendOff: boolean
}

export interface RescueRateReport {
  byClass: RescueClassReport[]
}

const RESCUE_OFF_THRESHOLD = 0.2

/** Agrega escaladas por classe. Pura e determinística (ordenada por classe). */
export function computeRescueRate(entries: readonly RescueEntry[]): RescueRateReport {
  const grouped = new Map<string, { total: number; rescued: number }>()
  for (const e of entries) {
    const g = grouped.get(e.taskClass) ?? { total: 0, rescued: 0 }
    g.total += 1
    if (e.rescued) g.rescued += 1
    grouped.set(e.taskClass, g)
  }
  const byClass = [...grouped.entries()]
    .map(([taskClass, g]) => {
      const rate = g.total > 0 ? g.rescued / g.total : 0
      return { taskClass, total: g.total, rescued: g.rescued, rate, recommendOff: rate < RESCUE_OFF_THRESHOLD }
    })
    .sort((a, b) => a.taskClass.localeCompare(b.taskClass))
  return { byClass }
}
