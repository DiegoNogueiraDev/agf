/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * Decisão-LLM mínima — o ÚNICO momento em que a IA toca o ranking, e mesmo assim
 * só para DECIDIR (nunca gerar). Quando o ranking determinístico está ambíguo
 * (empate técnico no topo), 1 chamada cheap-tier escolhe entre os top-K. Gated
 * por λ_flow + ambiguidade; default OFF (sem decisor → argmax determinístico).
 *
 * É a expressão literal de "usar a IA mínima como motor de decisão": a geração
 * é determinística; aqui a IA só aponta qual semente plantar quando há dúvida.
 */
import type { SqliteStore } from '../store/sqlite-store.js'
import { SCAFFOLD_REGISTRY, type ScaffoldKind } from './registry.js'
import type { RankedScaffold, RankableNode } from './retrieve-rank.js'
import { nodeRequirementText } from './retrieve-rank.js'
import { computeLambdaFlow } from '../context/flow-index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'scaffolder/decide.ts' })

/** Decisor injetado (LLM cheap-tier). Recebe o prompt, devolve texto curto. */
export type ScaffoldDecider = (prompt: string) => Promise<string>

const LAMBDA_BASE = 0.15
const ALPHA = 1.5
const DECISION_LAMBDA_CEILING = 1.0
const DEFAULT_AMBIGUITY = 1

export interface DecisionGate {
  readonly allowed: boolean
  readonly reason: string
}

/** Gate da decisão: desligável + λ não-saturado (cheap, mas ainda gated). */
export function decisionGate(store: SqliteStore): DecisionGate {
  if (process.env.AGF_DECIDE === '0' || store.getProjectSetting('decision_disabled') === 'true') {
    return { allowed: false, reason: 'disabled' }
  }
  const phi = Number(store.getProjectSetting('flow_phi') ?? '0') || 0
  const lambda = computeLambdaFlow(phi, LAMBDA_BASE, ALPHA)
  if (lambda >= DECISION_LAMBDA_CEILING) return { allowed: false, reason: `flow-saturated(λ=${lambda.toFixed(2)})` }
  return { allowed: true, reason: 'enabled' }
}

/** Empate técnico: top-1 e top-2 a uma distância ≤ threshold. */
export function isAmbiguous(ranked: readonly RankedScaffold[], threshold = DEFAULT_AMBIGUITY): boolean {
  return ranked.length > 1 && ranked[0].score - ranked[1].score <= threshold
}

function buildDecisionPrompt(node: RankableNode, candidates: readonly RankedScaffold[]): string {
  return [
    `Tarefa: "${nodeRequirementText(node).slice(0, 200)}".`,
    `Escolha o MELHOR scaffold entre os candidatos (responda APENAS com o nome, nada mais):`,
    ...candidates.map((c) => `- ${c.kind}: ${c.entry.description}`),
  ].join('\n')
}

/** Acha qual kind do registry aparece na resposta do decisor. */
function parseChosenKind(text: string): ScaffoldKind | null {
  const lc = text.toLowerCase()
  for (const e of SCAFFOLD_REGISTRY) if (lc.includes(e.kind)) return e.kind
  return null
}

/**
 * Reordena o ranking colocando a escolha da IA na frente — SÓ quando há decisor,
 * o gate permite e o ranking está ambíguo. Caso contrário devolve o argmax
 * determinístico inalterado. Nunca gera; 1 chamada cheap-tier no máximo.
 */
export async function decideBest(
  store: SqliteStore,
  node: RankableNode,
  ranked: readonly RankedScaffold[],
  deps: { decide?: ScaffoldDecider; topK?: number } = {},
): Promise<RankedScaffold[]> {
  const base = [...ranked]
  if (!deps.decide || !isAmbiguous(base)) return base
  if (!decisionGate(store).allowed) return base

  const topK = base.slice(0, deps.topK ?? 3)
  let chosen: ScaffoldKind | null = null
  try {
    chosen = parseChosenKind(await deps.decide(buildDecisionPrompt(node, topK)))
  } catch (err) {
    log.warn('decide:failed', { error: err instanceof Error ? err.message : String(err) })
    return base
  }
  if (!chosen) return base

  const idx = base.findIndex((r) => r.kind === chosen)
  if (idx <= 0) return base // já é o primeiro ou não encontrado
  const reordered = [base[idx], ...base.slice(0, idx), ...base.slice(idx + 1)]
  log.info('decide:reordered', { chosen, from: idx })
  return reordered
}
