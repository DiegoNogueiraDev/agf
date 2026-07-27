/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do importLearning (node_7ec4aef641d0, B2 da federação — contract
 * node_dc38e62ffc75): merge decay-aware MMAS — trilha importada entra com
 * desconto (idade + peso de fonte) e clamp tau; NUNCA rebaixa local mais
 * forte; idempotente (re-import não infla); filtro por tag (mitigação do
 * risk de poluição cross-domínio); schemaVersion desconhecida ⇒ erro tipado
 * SEM mutar o banco.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import {
  exportLearning,
  importLearning,
  LearningBundleVersionError,
  LEARNING_BUNDLE_VERSION,
  type LearningBundle,
} from '../core/knowledge/knowledge-packager.js'

const TARGET = 'proj-fed-target'

function migratedDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

function bundle(overrides: Partial<LearningBundle> = {}): LearningBundle {
  return {
    schemaVersion: LEARNING_BUNDLE_VERSION,
    sourceProject: 'proj-source',
    exportedAt: new Date().toISOString(),
    pheromones: [{ key: 'cli', amount: 8, ts: Date.now() }],
    episodicOutcomes: [
      {
        id: 'eo-src-1',
        nodeId: 'n1',
        taskType: 'task',
        tags: 'cli',
        approachSummary: 'worked',
        outcome: 'success',
        cycleTimeDelta: 0,
        reopenCount: 0,
        createdAt: Date.now(),
      },
    ],
    decisions: [
      { key: 'dk1', decision: 'use-x', occurrences: 3, successRate: 0.9, compiledAt: Date.now(), lastUsedAt: null },
    ],
    ...overrides,
  }
}

function localTau(db: Database.Database, key: string): number {
  const row = db.prepare('SELECT amount FROM pheromone_trails WHERE project_id = ? AND key = ?').get(TARGET, key) as
    { amount: number } | undefined
  return row?.amount ?? 0
}

describe('importLearning', () => {
  it('trilha herdada entra com desconto e clamp; local mais forte NUNCA é rebaixada (AC1)', () => {
    const db = migratedDb()
    depositPheromone(db, TARGET, 'cli', 5)
    const before = localTau(db, 'cli')

    // bundle com amount 9 mas descontado (peso de fonte < 1) fica < 5
    importLearning(db, TARGET, bundle({ pheromones: [{ key: 'cli', amount: 9, ts: Date.now() }] }), {
      sourceWeight: 0.4,
      nowMs: Date.now(),
    })
    expect(localTau(db, 'cli')).toBe(before) // 9*0.4=3.6 < 5 → intacta
  })

  it('projeto fresco herda a trilha descontada; re-import é idempotente — 0 inflação (AC2)', () => {
    const db = migratedDb()
    const b = bundle()
    const r1 = importLearning(db, TARGET, b, { sourceWeight: 0.5, nowMs: Date.now() })
    const afterFirst = localTau(db, 'cli')
    expect(afterFirst).toBeGreaterThan(0)
    expect(r1.pheromones.imported).toBe(1)

    const r2 = importLearning(db, TARGET, b, { sourceWeight: 0.5, nowMs: Date.now() })
    expect(localTau(db, 'cli')).toBe(afterFirst) // deep-equal antes/depois
    expect(r2.pheromones.imported).toBe(0)
    // outcomes/decisions também não duplicam
    const eoCount = db.prepare('SELECT COUNT(*) AS n FROM episodic_outcomes').get() as { n: number }
    expect(eoCount.n).toBe(1)
    const dCount = db.prepare('SELECT COUNT(*) AS n FROM compiled_decisions WHERE project_id = ?').get(TARGET) as {
      n: number
    }
    expect(dCount.n).toBe(1)
  })

  it('filtro --tags: só trilhas/outcomes com tag correspondente entram (AC3)', () => {
    const db = migratedDb()
    const b = bundle({
      pheromones: [
        { key: 'cli', amount: 8, ts: Date.now() },
        { key: 'web-dashboard', amount: 8, ts: Date.now() },
      ],
    })
    const r = importLearning(db, TARGET, b, { tags: ['cli'], nowMs: Date.now() })
    expect(localTau(db, 'cli')).toBeGreaterThan(0)
    expect(localTau(db, 'web-dashboard')).toBe(0)
    expect(r.pheromones.skipped).toBeGreaterThanOrEqual(1)
  })

  it('trilha velha decai mais que trilha fresca (decay por idade, determinístico via nowMs)', () => {
    const db = migratedDb()
    const now = Date.now()
    const old = 30 * 24 * 3600 * 1000
    importLearning(
      db,
      TARGET,
      bundle({
        pheromones: [
          { key: 'fresh', amount: 8, ts: now },
          { key: 'stale', amount: 8, ts: now - old },
        ],
      }),
      { nowMs: now },
    )
    expect(localTau(db, 'fresh')).toBeGreaterThan(localTau(db, 'stale'))
  })

  it('schemaVersion desconhecida (caso de erro) → erro tipado SEM mutar o banco (AC4)', () => {
    const db = migratedDb()
    const bad = { ...bundle(), schemaVersion: 99 } as unknown as LearningBundle
    expect(() => importLearning(db, TARGET, bad, {})).toThrow(LearningBundleVersionError)
    expect(localTau(db, 'cli')).toBe(0)
    const eo = db.prepare('SELECT COUNT(*) AS n FROM episodic_outcomes').get() as { n: number }
    expect(eo.n).toBe(0)
  })

  it('round-trip export→import entre dois projetos no mesmo padrão do contract', () => {
    const src = migratedDb()
    depositPheromone(src, 'proj-source', 'cli', 6)
    const exported = exportLearning(src, 'proj-source')

    const dst = migratedDb()
    const r = importLearning(dst, TARGET, exported, { nowMs: Date.now() })
    expect(r.pheromones.imported).toBe(1)
    expect(localTau(dst, 'cli')).toBeGreaterThan(0)
  })
})
