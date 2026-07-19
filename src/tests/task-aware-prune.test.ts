/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da poda task-aware (E2.T2 — node_ea0b184ab57d; contract node_6ee6fb0849cf).
 * Núcleo Squeez: linhas do tool-output pontuadas por BM25 contra as keywords da
 * task ativa; score-zero cai até o floor; lossy-gate reverte poda que quebra sentido.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { welchTTest } from '../core/economy/ab-compare.js'
import { compressCommand } from '../cli/commands/compress-cmd.js'
import { pruneTaskAware, applyTaskAwareToPayload } from '../core/economy/task-aware-prune.js'
import { estimateTokens } from '../core/context/token-estimator.js'
import type { TaskSignal } from '../core/context/task-signal.js'

const SIGNAL: TaskSignal = {
  taskId: 'task-fix',
  keywords: ['savings', 'tracker', 'ledger', 'burnrate', 'attribution'],
  acLines: [
    'Given o ledger com linhas, When calculo savings, Then o total bate',
    'Given a janela vazia, When calculo burnrate, Then retorna zero',
  ],
}

/** Fixture: ~200 linhas de saida estilo vitest — 40 relevantes, 160 ruido. */
function vitestFixture(): string {
  const lines: string[] = []
  for (let i = 0; i < 40; i += 1) {
    lines.push(`✓ savings-tracker ledger attribution case ${i} burnrate ok (${i}ms)`)
  }
  for (let i = 0; i < 160; i += 1) {
    lines.push(`✓ renderer widget chunk compiled module hydrate pipeline case ${i} (${i}ms)`)
  }
  return lines.join('\n')
}

describe('pruneTaskAware', () => {
  it('AC1: fixture de 200 linhas com AC citando o dominio => reducao de tokens >= 30%', async () => {
    // Arrange
    const text = vitestFixture()
    const before = estimateTokens(text)

    // Act
    const result = await pruneTaskAware(text, SIGNAL)

    // Assert
    const after = estimateTokens(result.text)
    expect((before - after) / before).toBeGreaterThanOrEqual(0.3)
    expect(result.droppedLines).toBeGreaterThan(0)
  })

  it('AC2: linhas que casam keywords do AC tem retencao >= 95%', async () => {
    // Arrange
    const text = vitestFixture()

    // Act
    const result = await pruneTaskAware(text, SIGNAL)

    // Assert — todas as 40 linhas relevantes permanecem
    const keptRelevant = result.text.split('\n').filter((l) => l.includes('savings-tracker')).length
    expect(keptRelevant / 40).toBeGreaterThanOrEqual(0.95)
    expect(result.retention).toBeGreaterThanOrEqual(0.95)
  })

  it('AC3: TaskSignal null => output byte-identico ao input', async () => {
    const text = vitestFixture()
    const result = await pruneTaskAware(text, null)
    expect(result.text).toBe(text)
    expect(result.droppedLines).toBe(0)
    expect(result.retention).toBe(1)
    expect(result.outcome).toBe('passthrough')
  })

  it('sinal degenerado (<3 keywords) => byte-identico (mitigacao do risk)', async () => {
    const text = vitestFixture()
    const result = await pruneTaskAware(text, { taskId: 't', keywords: ['ledger'], acLines: [] })
    expect(result.text).toBe(text)
    expect(result.outcome).toBe('passthrough')
  })

  it('AC4: lossy-gate reprova (linha de erro seria podada) => auto-revert com texto pre-poda', async () => {
    // Arrange — linha de ERRO que nao casa keyword nenhuma: a poda a removeria,
    // o verify de preservacao de erros reprova e o gate reverte.
    const text = [`Error: EACCES boom no modulo externo`, ...vitestFixture().split('\n')].join('\n')

    // Act
    const result = await pruneTaskAware(text, SIGNAL)

    // Assert
    expect(result.outcome).toBe('reverted')
    expect(result.text).toBe(text)
    expect(result.droppedLines).toBe(0)
  })

  it('floor de retencao: nunca mantem menos da metade das linhas', async () => {
    // Arrange — 10 relevantes, 190 ruido: sem floor cairiam 190
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => `savings ledger ${i}`),
      ...Array.from({ length: 190 }, (_, i) => `noise widget ${i}`),
    ]

    // Act
    const result = await pruneTaskAware(lines.join('\n'), SIGNAL)

    // Assert
    const kept = result.text.split('\n').length
    expect(kept).toBeGreaterThanOrEqual(100)
  })
})

describe('applyTaskAwareToPayload — estagio no compress run (E2.T3 node_ea13f329f163)', () => {
  it('AC1: com sinal e economia, grava linha task_aware_prune com surface=hook no ledger', async () => {
    // Arrange
    const db = new Database(':memory:')
    runMigrations(db)
    const text = vitestFixture()
    const est = estimateTokens(text)
    const payload = { compressed: text, tokens: { before: est, after: est, saved: 0, ratio: 1 } }

    // Act
    const result = await applyTaskAwareToPayload(payload, SIGNAL, { db, sessionId: 's-hook' })

    // Assert — poda aplicou e a linha auditavel existe
    expect(result.taskAware).toBeDefined()
    expect(result.taskAware!.droppedLines).toBeGreaterThan(0)
    const row = db
      .prepare(`SELECT surface, saved FROM economy_lever_ledger WHERE lever = 'task_aware_prune'`)
      .get() as { surface: string; saved: number }
    expect(row.surface).toBe('hook')
    expect(row.saved).toBeGreaterThan(0)
    db.close()
  })

  it('AC3: sinal null => payload byte-identico e zero linhas no ledger', async () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const payload = { compressed: vitestFixture(), tokens: { before: 2000, after: 1500, saved: 500, ratio: 0.75 } }
    const result = await applyTaskAwareToPayload(payload, null, { db, sessionId: 's' })
    expect(result.compressed).toBe(payload.compressed)
    expect(result.tokens).toEqual(payload.tokens)
    const c = db.prepare(`SELECT COUNT(*) AS c FROM economy_lever_ledger WHERE lever = 'task_aware_prune'`).get() as {
      c: number
    }
    expect(c.c).toBe(0)
    db.close()
  })

  it('AC2: A/B com 20 amostras — task-aware (B) vence o modo atual (A) com p<0.05', async () => {
    // Arrange — 20 fixtures com leve variacao deterministica
    const samplesA: number[] = []
    const samplesB: number[] = []
    for (let i = 0; i < 20; i += 1) {
      const noise = Array.from({ length: 150 + i }, (_, j) => `noise widget chunk ${j}`).join('\n')
      const relevant = Array.from({ length: 30 }, (_, j) => `savings ledger tracker ${j}`).join('\n')
      const text = `${relevant}\n${noise}`
      samplesA.push(estimateTokens(text))
      const pruned = await pruneTaskAware(text, SIGNAL)
      samplesB.push(estimateTokens(pruned.text))
    }

    // Act
    const ab = welchTTest(samplesA, samplesB)

    // Assert — B (task-aware) significativamente menor
    expect(ab.winner).toBe('B')
    expect(ab.pValue).toBeLessThan(0.05)
  })
})

describe('agf compress run --task (superficie do consumidor)', () => {
  it('a flag --task esta registrada no subcomando run', () => {
    const run = compressCommand().commands.find((c) => c.name() === 'run')!
    expect(run.options.some((o) => o.long === '--task')).toBe(true)
  })
})
