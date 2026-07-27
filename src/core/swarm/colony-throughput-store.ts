/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * colony-throughput-store — persiste o que `benchmarkColonyBatch` mede e resume
 * para a superfície (node_414bf84a63d8, épico node_bf6f360b65dd).
 *
 * PORQUÊ: o benchmark já comparava wall-clock serial vs batch, mas o número
 * morria no retorno da função — `agf swarm bench` imprimia e ninguém guardava.
 * Ganho que some quando o comando termina não sustenta nada: na sessão seguinte
 * "o paralelo é mais rápido" volta a ser alegação. Gravar é o que transforma a
 * medição em evidência consultável.
 *
 * CONTRATO DE HONESTIDADE (o mesmo do cockpit de OKR, ver core/okr/okr-status.ts):
 * ausência de medição é `no-data`, JAMAIS um baseline inventado ou um speedup de
 * 1. Toda divisão é guardada — wall-clock zerado é o caso normal de um run que
 * não chegou a medir, não uma exceção rara. E todo resumo carrega `reason`, para
 * que o número seja auditável em vez de um rótulo solto.
 */

import type Database from 'better-sqlite3'
import type { ColonyBenchmark } from './colony-benchmark.js'

/** Um run gravado do benchmark serial vs batch. */
export interface ColonyBenchmarkRun extends ColonyBenchmark {
  ranAt: number
}

/** Throughput como a superfície reporta — `no-data` é um estado de primeira classe. */
export interface ThroughputSummary {
  status: 'measured' | 'no-data'
  /** Tarefas por segundo no modo batch, ou null quando não há medição. */
  tasksPerSecond: number | null
  /** Tarefas por segundo no modo serial — a régua contra a qual o ganho é lido. */
  serialTasksPerSecond: number | null
  speedup: number | null
  /** Por que este resultado — auditável, nunca um número solto. */
  reason: string
}

const MS_PER_SECOND = 1000

/** Grava um run do benchmark. */
export function recordColonyBenchmark(
  db: Database.Database,
  projectId: string,
  benchmark: ColonyBenchmark,
  ranAt: number = Date.now(),
): void {
  db.prepare(
    `INSERT INTO colony_benchmark_run (id, project_id, tasks, k, serial_ms, batch_ms, speedup, ran_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `cbr_${ranAt}_${Math.round(benchmark.speedup * 100)}_${benchmark.tasks}`,
    projectId,
    benchmark.tasks,
    benchmark.k,
    benchmark.serialMs,
    benchmark.batchMs,
    benchmark.speedup,
    ranAt,
  )
}

/** O run mais recente do projeto, ou null quando nunca se mediu. */
export function readLatestColonyBenchmark(db: Database.Database, projectId: string): ColonyBenchmarkRun | null {
  const row = db
    .prepare(
      `SELECT tasks, k, serial_ms AS serialMs, batch_ms AS batchMs, speedup, ran_at AS ranAt
       FROM colony_benchmark_run WHERE project_id = ?
       -- Desempate por rowid: dois runs no MESMO milissegundo (acontece em
       -- benchmarks curtos) deixariam a ordem indefinida, e o "último" viraria
       -- sorteio. O rowid é monotônico por inserção.
       ORDER BY ran_at DESC, rowid DESC LIMIT 1`,
    )
    .get(projectId) as ColonyBenchmarkRun | undefined

  return row ?? null
}

function noData(reason: string): ThroughputSummary {
  return { status: 'no-data', tasksPerSecond: null, serialTasksPerSecond: null, speedup: null, reason }
}

/** Tarefas por segundo, arredondado a 2 casas; null quando o intervalo não permite dividir. */
function perSecond(tasks: number, elapsedMs: number): number | null {
  if (elapsedMs <= 0) return null
  return +((tasks / elapsedMs) * MS_PER_SECOND).toFixed(2)
}

/**
 * Resume o throughput do último run para a superfície. Sem run, com zero tasks
 * ou com wall-clock zerado ⇒ `no-data`: nenhum desses casos autoriza afirmar um
 * ganho, e exibir o baseline serial "para não ficar vazio" seria inflar por
 * outro caminho.
 */
export function summarizeThroughput(db: Database.Database, projectId: string): ThroughputSummary {
  const latest = readLatestColonyBenchmark(db, projectId)
  if (!latest) {
    return noData('nenhum run de benchmark gravado — rode `agf swarm bench` para medir')
  }
  if (latest.tasks <= 0) {
    return noData('o último run não processou nenhuma task — nada a medir')
  }

  const tasksPerSecond = perSecond(latest.tasks, latest.batchMs)
  const serialTasksPerSecond = perSecond(latest.tasks, latest.serialMs)
  if (tasksPerSecond === null || serialTasksPerSecond === null) {
    return noData('wall-clock zerado no último run — intervalo curto demais para medir')
  }

  return {
    status: 'measured',
    tasksPerSecond,
    serialTasksPerSecond,
    speedup: latest.speedup,
    reason: `${latest.tasks} tasks: batch ${latest.batchMs}ms vs serial ${latest.serialMs}ms (k=${latest.k})`,
  }
}
