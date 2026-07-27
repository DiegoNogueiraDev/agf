/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for benchmarkColonyBatch (node_1339edbe0343, épico node_bf6f360b65dd).
 * PROVAR paralelismo, não alegá-lo: o MESMO conjunto de tasks roda serial e em
 * batch, e o wall-clock é medido nos dois. Zero mock — Database(':memory:')
 * real, nodes reais, LockManager real; o "provider" é um atraso assíncrono
 * verdadeiro (é o trabalho que se quer sobrepor).
 *
 * Margens folgadas de propósito: um teste de tempo que exige precisão vira
 * flaky. O sinal buscado é a ORDEM de grandeza (4 tasks × 40ms serial ≈ 160ms
 * vs ≈ 40ms em paralelo), não o milissegundo.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { LockManager } from '../core/store/lock-manager.js'
import { benchmarkColonyBatch } from '../core/swarm/colony-benchmark.js'

const DELAY_MS = 40

let db: Database.Database
let store: SqliteStore

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  store = new SqliteStore(db)
  store.initProject('proj-colony-bench')
})

afterEach(() => {
  store.close()
})

/** Insere N tasks independentes (sem depends_on entre elas), prontas para pull. */
function seedIndependentTasks(n: number): void {
  for (let i = 0; i < n; i++) {
    store.insertNode({
      id: `node_bench_${i}`,
      type: 'task',
      title: `bench task ${i}`,
      status: 'backlog',
      priority: 3,
      implementationFiles: [`src/bench/${i}.ts`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
}

/** O "provider": trabalho assíncrono REAL — é isso que o paralelismo sobrepõe. */
const realDelay = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
}

describe('benchmarkColonyBatch', () => {
  it('mede wall-clock dos DOIS modos sobre o mesmo conjunto', async () => {
    seedIndependentTasks(4)
    const r = await benchmarkColonyBatch({
      doc: store.toGraphDocument(),
      makeLocks: () => new LockManager(db),
      k: 4,
      run: realDelay,
    })
    expect(r.tasks).toBe(4)
    expect(r.k).toBe(4)
    expect(r.serialMs).toBeGreaterThan(0)
    expect(r.batchMs).toBeGreaterThan(0)
  })

  it('batch(k=4) é materialmente mais rápido que serial no mesmo backlog', async () => {
    seedIndependentTasks(4)
    const r = await benchmarkColonyBatch({
      doc: store.toGraphDocument(),
      makeLocks: () => new LockManager(db),
      k: 4,
      run: realDelay,
    })
    // serial ≈ 4×40 = 160ms; batch ≈ 40ms. Margem folgada evita flake.
    expect(r.batchMs).toBeLessThan(r.serialMs * 0.7)
    expect(r.speedup).toBeGreaterThan(1)
  })

  it('k=1 (degenerado) não introduz overhead absurdo — batch ~ serial', async () => {
    seedIndependentTasks(1)
    const r = await benchmarkColonyBatch({
      doc: store.toGraphDocument(),
      makeLocks: () => new LockManager(db),
      k: 1,
      run: realDelay,
    })
    expect(r.tasks).toBe(1)
    // Um único task: nada a sobrepor. Guarda contra regressão de overhead.
    expect(r.batchMs).toBeLessThan(r.serialMs * 3 + 50)
  })

  it('backlog vazio → zeros explícitos, sem crash e sem speedup inventado', async () => {
    const r = await benchmarkColonyBatch({
      doc: store.toGraphDocument(),
      makeLocks: () => new LockManager(db),
      k: 4,
      run: realDelay,
    })
    expect(r.tasks).toBe(0)
    expect(r.serialMs).toBe(0)
    expect(r.batchMs).toBe(0)
    expect(r.speedup).toBe(0)
  })

  it('k<=0 não roda nada (guarda de entrada)', async () => {
    seedIndependentTasks(3)
    const r = await benchmarkColonyBatch({
      doc: store.toGraphDocument(),
      makeLocks: () => new LockManager(db),
      k: 0,
      run: realDelay,
    })
    expect(r.tasks).toBe(0)
  })

  it('executa CADA task uma vez em cada modo (nenhuma perdida, nenhuma repetida)', async () => {
    seedIndependentTasks(3)
    const seen: string[] = []
    await benchmarkColonyBatch({
      doc: store.toGraphDocument(),
      makeLocks: () => new LockManager(db),
      k: 3,
      run: async (node) => {
        seen.push(node.id)
        await realDelay()
      },
    })
    // 3 tasks × 2 modos (serial + batch) = 6 execuções.
    expect(seen).toHaveLength(6)
    expect(new Set(seen).size).toBe(3)
  })
})
