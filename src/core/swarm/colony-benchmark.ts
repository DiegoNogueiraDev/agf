/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Benchmark do paralelismo da colônia (node_1339edbe0343, épico
 * node_bf6f360b65dd).
 *
 * PORQUÊ: "a colônia roda em paralelo" era uma ALEGAÇÃO. Um harness que roda o
 * MESMO conjunto de tasks nos dois modos — serial e batch — e mede o wall-clock
 * dos dois transforma a alegação em número. Sem isso, um batch que na prática
 * serializa (por colisão de arquivo, por await mal posto) passaria despercebido.
 *
 * EXPANDE o pull existente (`pullIndependentBatch`, src/core/swarm/colony-batch.ts)
 * — não recria seleção nem claim. O executor entra por injeção (DIP): quem chama
 * decide o que é "trabalho", então o núcleo não conhece provider algum.
 *
 * Honestidade do número: os dois modos executam EXATAMENTE o mesmo conjunto
 * (o batch é pull-ado uma vez e reusado nas duas passagens), então a diferença
 * de wall-clock é sobreposição real, não conjunto diferente. Backlog vazio ⇒
 * zeros e `speedup: 0`, nunca um ganho inventado.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import type { LockManager } from '../store/lock-manager.js'
import { pullIndependentBatch } from './colony-batch.js'

/** O trabalho de uma task — injetado pelo chamador (provider, stub, o que for). */
export type TaskRunner = (node: GraphNode) => Promise<void>

/** Resultado da medição — wall-clock real dos dois modos. */
export interface ColonyBenchmark {
  /** Tasks efetivamente reivindicadas e executadas em cada modo. */
  tasks: number
  /** Largura do batch pedida. */
  k: number
  /** Wall-clock (ms) executando uma a uma. */
  serialMs: number
  /** Wall-clock (ms) executando o batch concorrente. */
  batchMs: number
  /** serialMs / batchMs. >1 = o batch ganhou. 0 quando não houve task. */
  speedup: number
}

export interface ColonyBenchmarkInput {
  doc: GraphDocument
  /** Fábrica de LockManager — cada passagem recebe estado de lease limpo. */
  makeLocks: () => LockManager
  /** Largura do batch (k). <=0 não roda nada. */
  k: number
  /** O trabalho a executar por task. */
  run: TaskRunner
  /** Relógio injetável (default: Date.now) — o wall-clock É a medida. */
  now?: () => number
}

const EMPTY = (k: number): ColonyBenchmark => ({ tasks: 0, k, serialMs: 0, batchMs: 0, speedup: 0 })

/**
 * Roda o mesmo conjunto serial e em batch, devolvendo o wall-clock de cada modo.
 * A seleção/claim reusa `pullIndependentBatch`; aqui só se mede.
 */
export async function benchmarkColonyBatch(input: ColonyBenchmarkInput): Promise<ColonyBenchmark> {
  const { doc, makeLocks, k, run } = input
  const now = input.now ?? (() => Date.now())

  if (k <= 0) return EMPTY(k)

  // Pull UMA vez: os dois modos executam exatamente o mesmo conjunto, senão a
  // comparação mediria backlogs diferentes em vez de sobreposição.
  const claims = pullIndependentBatch(doc, makeLocks(), k)
  if (claims.length === 0) return EMPTY(k)

  const nodes = claims.map((c) => c.node)

  // Passagem serial: uma de cada vez, esperando cada uma terminar.
  const serialStart = now()
  for (const node of nodes) {
    await run(node)
  }
  const serialMs = now() - serialStart

  // Passagem batch: todas concorrentes — é isto que a colônia promete.
  const batchStart = now()
  await Promise.all(nodes.map((node) => run(node)))
  const batchMs = now() - batchStart

  return {
    tasks: nodes.length,
    k,
    serialMs,
    batchMs,
    // batchMs 0 (execução instantânea) não pode virar Infinity no relatório.
    speedup: batchMs > 0 ? +(serialMs / batchMs).toFixed(2) : 0,
  }
}
