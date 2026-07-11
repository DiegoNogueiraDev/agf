/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * learning-compiler — o JIT do Learning Compiler. Varre observações de decisão
 * ({@link DecisionObservation}, capturadas via [[decision-key]]), agrupa por
 * chave determinística, e compila uma regra na [[decision-table-store]] quando
 * a decisão se repetiu o bastante e teve sucesso o bastante. Regras compiladas
 * são então reproduzidas por fast-path de custo-zero (T1.4), pulando o LLM.
 *
 * O successRate é ponderado por decay ([[decay]] — curva de Ebbinghaus), de modo
 * que observações antigas pesam menos: lições velhas desbotam a menos que sejam
 * reforçadas por observações recentes. Determinístico: `now`/`tauMs` são
 * injetáveis para testes (sem Date.now() no caminho de decisão).
 */
import type { DecisionObservation } from './decision-key.js'
import type { DecisionTableStore } from './decision-table-store.js'
import { ebbinghausWeight } from './decay.js'
import { createLogger } from '../utils/logger.js'
import { emitMemoryLearningHook } from '../hooks/memory-learning-lifecycle-hooks.js'

const log = createLogger({ layer: 'core', source: 'learning-compiler.ts' })

/** Gate de compilação: ocorrências mínimas observadas. */
export const DEFAULT_MIN_OCCURRENCES = 2
/** Gate de compilação: taxa de sucesso mínima (ponderada por decay). */
export const DEFAULT_MIN_SUCCESS_RATE = 0.7

export interface CompileOptions {
  /** "Agora" (ms) para o cálculo de idade do decay. Default `Date.now()`. */
  now?: number
  /** τ do decay em ms. Default = `DEFAULT_TAU_MS` (30 dias). `Infinity` desliga o decay. */
  tauMs?: number
  /** Ocorrências mínimas (contagem crua) para compilar. Default 2. */
  minOccurrences?: number
  /** Taxa de sucesso mínima ponderada para compilar. Default 0.7. */
  minSuccessRate?: number
}

export interface CompileResult {
  /** Quantas regras foram compiladas (escritas/atualizadas no store). */
  compiled: number
  /** Quantos grupos não passaram os gates. */
  skipped: number
  /** Chaves efetivamente compiladas. */
  emittedKeys: string[]
}

interface Group {
  key: string
  observations: DecisionObservation[]
}

/** Agrupa observações pela chave de decisão, preservando ordem de primeira aparição. */
function groupByKey(observations: DecisionObservation[]): Group[] {
  const map = new Map<string, DecisionObservation[]>()
  for (const o of observations) {
    const arr = map.get(o.key)
    if (arr) arr.push(o)
    else map.set(o.key, [o])
  }
  return Array.from(map, ([key, obs]) => ({ key, observations: obs }))
}

/**
 * Compila decisões repetidas e bem-sucedidas em regras determinísticas.
 *
 * Para cada grupo (mesma chave): exige `occurrences >= minOccurrences` (contagem
 * crua) E `successRate >= minSuccessRate`, onde o successRate é a razão entre o
 * peso (decay) das observações com sucesso e o peso total. Em aprovação, grava a
 * decisão mais recente do grupo no store.
 *
 * @returns Sumário {@link CompileResult} com contagens e chaves emitidas.
 */
export function compileDecisions(
  observations: DecisionObservation[],
  store: DecisionTableStore,
  opts: CompileOptions = {},
): CompileResult {
  const now = opts.now ?? Date.now()
  const tauMs = opts.tauMs
  const minOccurrences = opts.minOccurrences ?? DEFAULT_MIN_OCCURRENCES
  const minSuccessRate = opts.minSuccessRate ?? DEFAULT_MIN_SUCCESS_RATE

  const result: CompileResult = { compiled: 0, skipped: 0, emittedKeys: [] }

  for (const group of groupByKey(observations)) {
    const occurrences = group.observations.length
    if (occurrences < minOccurrences) {
      result.skipped++
      continue
    }

    let totalWeight = 0
    let successWeight = 0
    for (const o of group.observations) {
      const w = ebbinghausWeight(now - o.ts, tauMs !== undefined ? { tauMs } : {})
      totalWeight += w
      if (o.success) successWeight += w
    }
    const successRate = totalWeight > 0 ? successWeight / totalWeight : 0

    if (successRate < minSuccessRate) {
      result.skipped++
      continue
    }

    // Decisão mais recente do grupo (a evidência mais atual vence).
    const latest = group.observations.reduce((a, b) => (b.ts > a.ts ? b : a))
    store.put({ key: group.key, decision: latest.decision, successRate, compiledAt: now })
    result.compiled++
    result.emittedKeys.push(group.key)
  }

  log.debug('learning-compiler:run', { compiled: result.compiled, skipped: result.skipped })
  if (result.compiled > 0) {
    emitMemoryLearningHook('on_learning_compile', {
      compiled: result.compiled,
      skipped: result.skipped,
      emittedKeys: result.emittedKeys,
    })
  }
  return result
}
