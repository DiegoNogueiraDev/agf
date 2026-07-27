/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do first-pass yield (F3.T1 — node_1bc1477fcb27; contract node_3540f7d7fecc).
 * FPY = entregas cujo PRIMEIRO outcome (mais antigo por node) foi success /
 * total de nodes entregues na janela — a métrica de assertividade sobre os
 * episodic outcomes JÁ gravados (mesma fonte do flow-report).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import { computeFirstPassYield, evaluateFpyGate } from '../core/economy/first-pass-yield.js'

function seed(
  db: Database.Database,
  id: string,
  nodeId: string,
  outcome: 'success' | 'partial' | 'failure',
  createdAt: number,
): void {
  insertEpisodicOutcome(db, {
    id,
    nodeId,
    taskType: 'task',
    tags: '',
    approachSummary: 'seed',
    outcome,
    cycleTimeDelta: 0,
    reopenCount: outcome === 'success' ? 0 : outcome === 'partial' ? 1 : 2,
    createdAt,
  })
}

function migratedDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

describe('computeFirstPassYield', () => {
  it('AC1: 10 nodes — 7 com primeiro outcome success, 3 com failure+retry => FPY 0.7', () => {
    // Arrange
    const db = migratedDb()
    const now = 1_000_000
    for (let i = 0; i < 7; i += 1) seed(db, `s${i}`, `node_ok_${i}`, 'success', now + i)
    // 3 nodes que falharam de primeira e depois foram re-tentados com sucesso
    for (let i = 0; i < 3; i += 1) {
      seed(db, `f${i}a`, `node_bad_${i}`, 'failure', now + 100 + i) // primeiro (mais antigo)
      seed(db, `f${i}b`, `node_bad_${i}`, 'success', now + 200 + i) // retry posterior
    }

    // Act
    const fpy = computeFirstPassYield(db)

    // Assert
    expect(fpy.value).toBeCloseTo(0.7, 6)
    expect(fpy.delivered).toBe(10)
    expect(fpy.firstPass).toBe(7)
    db.close()
  })

  it('AC2: janela sem entregas => value null sem excecao', () => {
    const db = migratedDb()
    const fpy = computeFirstPassYield(db)
    expect(fpy.value).toBeNull()
    expect(fpy.delivered).toBe(0)
    expect(fpy.firstPass).toBe(0)
    db.close()
  })

  it('o PRIMEIRO outcome por node decide (partial de primeira nao conta como first-pass)', () => {
    // Arrange — node cujo primeiro outcome e partial e depois vira success
    const db = migratedDb()
    seed(db, 'p1', 'node_p', 'partial', 1000)
    seed(db, 'p2', 'node_p', 'success', 2000)

    // Act
    const fpy = computeFirstPassYield(db)

    // Assert — partial de primeira => nao e first-pass
    expect(fpy.delivered).toBe(1)
    expect(fpy.firstPass).toBe(0)
    expect(fpy.value).toBe(0)
    db.close()
  })

  it('janela por maxAgeDays exclui outcomes antigos', () => {
    // Arrange
    const db = migratedDb()
    const now = Date.now()
    seed(db, 'old', 'node_old', 'success', now - 40 * 24 * 3600 * 1000) // 40 dias atras
    seed(db, 'new', 'node_new', 'success', now - 1000)

    // Act — janela de 30 dias
    const fpy = computeFirstPassYield(db, { maxAgeDays: 30 })

    // Assert — so o recente conta
    expect(fpy.delivered).toBe(1)
    expect(fpy.value).toBe(1)
    db.close()
  })
})

describe('evaluateFpyGate — gate opcional (F3.T3 node_7959c7fd81be)', () => {
  it('threshold 0 (OFF default) => sempre passa, qualquer FPY', () => {
    expect(evaluateFpyGate({ value: 0.1, delivered: 10, firstPass: 1, window: { from: 0, to: 1 } }, 0).passed).toBe(
      true,
    )
  })

  it('AC3: gate ON limiar 0.8 e FPY 0.6 => reprova com code fpy_below_threshold', () => {
    const gate = evaluateFpyGate({ value: 0.6, delivered: 10, firstPass: 6, window: { from: 0, to: 1 } }, 0.8)
    expect(gate.passed).toBe(false)
    expect(gate.code).toBe('fpy_below_threshold')
    expect(gate.reason).toContain('0.6')
    expect(gate.reason).toContain('0.8')
  })

  it('gate ON e FPY no limiar => passa', () => {
    expect(evaluateFpyGate({ value: 0.8, delivered: 10, firstPass: 8, window: { from: 0, to: 1 } }, 0.8).passed).toBe(
      true,
    )
  })

  it('value null (sem entregas) => passa (nada a cobrar ainda)', () => {
    expect(evaluateFpyGate({ value: null, delivered: 0, firstPass: 0, window: { from: 0, to: 1 } }, 0.8).passed).toBe(
      true,
    )
  })
})
