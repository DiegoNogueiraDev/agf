/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do exportLearning (node_7912a6136632, B1 da federação — contract
 * node_dc38e62ffc75): bundle versionado com o aprendizado operacional do
 * projeto — pheromone_trails (via listPheromoneTrails), episodic_outcomes e
 * decision-table. Reusa os readers existentes, zero SQL novo. Projeto vazio
 * ou tabela ausente ⇒ seções vazias, nunca lança.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'
import { exportLearning, LEARNING_BUNDLE_VERSION } from '../core/knowledge/knowledge-packager.js'

const PROJECT = 'proj-fed-export'

function migratedDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('exportLearning', () => {
  it('projeto com 3 trilhas, 2 outcomes e 1 decisão → bundle com as 3 seções + schemaVersion (AC1)', () => {
    const db = migratedDb()
    depositPheromone(db, PROJECT, 'trail-a', 5)
    depositPheromone(db, PROJECT, 'trail-b', 3)
    depositPheromone(db, PROJECT, 'trail-c', 8)
    const now = Date.now()
    insertEpisodicOutcome(db, {
      id: 'eo1',
      nodeId: 'n1',
      taskType: 'task',
      tags: 'cli',
      approachSummary: 'a',
      outcome: 'success',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: now,
    })
    insertEpisodicOutcome(db, {
      id: 'eo2',
      nodeId: 'n2',
      taskType: 'task',
      tags: 'web',
      approachSummary: 'b',
      outcome: 'failure',
      cycleTimeDelta: 1,
      reopenCount: 2,
      createdAt: now,
    })
    new DecisionTableStore(db, PROJECT).put({ key: 'k1', decision: 'use-x', successRate: 0.9 })

    const bundle = exportLearning(db, PROJECT)
    expect(bundle.schemaVersion).toBe(LEARNING_BUNDLE_VERSION)
    expect(bundle.sourceProject).toBe(PROJECT)
    expect(bundle.pheromones).toHaveLength(3)
    expect(bundle.pheromones[0].amount).toBe(8) // ordenado por força (reader cru)
    expect(bundle.episodicOutcomes).toHaveLength(2)
    expect(bundle.decisions).toHaveLength(1)
    expect(bundle.decisions[0].key).toBe('k1')
    expect(typeof bundle.exportedAt).toBe('string')
    // JSON puro serializável (contrato)
    expect(() => JSON.stringify(bundle)).not.toThrow()
  })

  it('projeto vazio (caso de limite) → bundle válido com seções vazias, sem lançar (AC2)', () => {
    const db = migratedDb()
    const bundle = exportLearning(db, 'proj-empty')
    expect(bundle.pheromones).toEqual([])
    expect(bundle.episodicOutcomes).toEqual([])
    expect(bundle.decisions).toEqual([])
    expect(bundle.schemaVersion).toBe(LEARNING_BUNDLE_VERSION)
  })

  it('tabela ausente (store legado — caso de erro) → seção vazia, export não falha (AC3)', () => {
    const db = new Database(':memory:') // sem migrations: nenhuma tabela
    const bundle = exportLearning(db, PROJECT)
    expect(bundle.pheromones).toEqual([])
    expect(bundle.episodicOutcomes).toEqual([])
    expect(bundle.decisions).toEqual([])
  })

  it('exclui dados de OUTRO projeto (escopo por project_id)', () => {
    const db = migratedDb()
    depositPheromone(db, 'proj-other', 'foreign', 9)
    new DecisionTableStore(db, 'proj-other').put({ key: 'fk', decision: 'y', successRate: 1 })
    const bundle = exportLearning(db, PROJECT)
    expect(bundle.pheromones).toEqual([])
    expect(bundle.decisions).toEqual([])
  })
})
