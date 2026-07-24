/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_414bf84a63d8 — o throughput medido do run paralelo, cobrado onde o dev olha.
 *
 * `benchmarkColonyBatch` já media wall-clock serial vs batch, mas o número morria
 * no retorno da função: `agf swarm bench` imprimia e ninguém guardava. Um ganho que
 * some quando o comando termina não é evidência de nada — na sessão seguinte a
 * afirmação "o paralelo é mais rápido" volta a ser alegação.
 *
 * Aqui se prova o trajeto inteiro: gravar o run → ler o mais recente → o número
 * aparecer em `agf insights`. E, principalmente, o caso SEM dado: sem run gravado
 * (ou com wall-clocks zerados) o relatório diz "sem dados" em vez de dividir por
 * zero ou exibir um speedup de 1 que ninguém mediu.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import {
  recordColonyBenchmark,
  readLatestColonyBenchmark,
  summarizeThroughput,
} from '../core/swarm/colony-throughput-store.js'

const PROJECT = 'proj-throughput'
let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

describe('colony throughput — persisting what the benchmark measured', () => {
  it('records a run and reads it back as the latest', () => {
    recordColonyBenchmark(db, PROJECT, { tasks: 8, k: 4, serialMs: 800, batchMs: 200, speedup: 4 })

    const latest = readLatestColonyBenchmark(db, PROJECT)
    expect(latest?.tasks).toBe(8)
    expect(latest?.speedup).toBe(4)
  })

  it('the LATEST run wins — a stale record must not outrank a fresh one', () => {
    recordColonyBenchmark(db, PROJECT, { tasks: 4, k: 2, serialMs: 400, batchMs: 200, speedup: 2 })
    recordColonyBenchmark(db, PROJECT, { tasks: 8, k: 4, serialMs: 800, batchMs: 200, speedup: 4 })

    expect(readLatestColonyBenchmark(db, PROJECT)?.speedup).toBe(4)
  })

  it('runs from another project are invisible — throughput is per project', () => {
    recordColonyBenchmark(db, 'outro-projeto', { tasks: 99, k: 8, serialMs: 900, batchMs: 100, speedup: 9 })

    expect(readLatestColonyBenchmark(db, PROJECT)).toBeNull()
  })
})

describe('summarizeThroughput — the number as agf insights reports it (AC1/AC2/AC3)', () => {
  it('a parallel run surfaces tasks-per-second AND the observed speedup (AC1)', () => {
    recordColonyBenchmark(db, PROJECT, { tasks: 8, k: 4, serialMs: 800, batchMs: 200, speedup: 4 })

    const s = summarizeThroughput(db, PROJECT)
    expect(s.status).toBe('measured')
    // 8 tasks em 200ms = 40 tasks/s; o serial mediu 8/800ms = 10 tasks/s.
    expect(s.tasksPerSecond).toBe(40)
    expect(s.serialTasksPerSecond).toBe(10)
    expect(s.speedup).toBe(4)
  })

  it('with no parallel run at all, throughput falls back to no-data — never an invented baseline (AC2)', () => {
    // AC2 pede que sem run paralelo o número NÃO infle. A forma honesta de não
    // inflar é não afirmar: sem medição não há baseline a exibir.
    const s = summarizeThroughput(db, PROJECT)
    expect(s.status).toBe('no-data')
    expect(s.tasksPerSecond).toBeNull()
    expect(s.speedup).toBeNull()
  })

  it('zeroed wall-clocks report no-data instead of dividing by zero (AC3)', () => {
    recordColonyBenchmark(db, PROJECT, { tasks: 5, k: 2, serialMs: 0, batchMs: 0, speedup: 0 })

    const s = summarizeThroughput(db, PROJECT)
    expect(s.status).toBe('no-data')
    expect(s.tasksPerSecond).toBeNull()
    expect(Number.isFinite(s.speedup ?? 0)).toBe(true)
  })

  it('a run of zero tasks is not a measurement either', () => {
    recordColonyBenchmark(db, PROJECT, { tasks: 0, k: 4, serialMs: 100, batchMs: 50, speedup: 2 })

    expect(summarizeThroughput(db, PROJECT).status).toBe('no-data')
  })

  it('every summary carries a reason — the number is auditable, like the OKR verdicts', () => {
    expect(summarizeThroughput(db, PROJECT).reason.length).toBeGreaterThan(0)
    recordColonyBenchmark(db, PROJECT, { tasks: 8, k: 4, serialMs: 800, batchMs: 200, speedup: 4 })
    expect(summarizeThroughput(db, PROJECT).reason.length).toBeGreaterThan(0)
  })
})
