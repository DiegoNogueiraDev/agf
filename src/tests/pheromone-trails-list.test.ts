/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do reader listPheromoneTrails (node_7e38f5531fc8) — leitura CRUA da
 * pheromone_trails (sem decay/epsilon/cap, ao contrário de strongestPheromones):
 * {key, amount, ts} por projeto, ordenado por amount desc. Data-source do
 * contract node_c8b85a2b9c29. Nunca lança: falha/tabela vazia ⇒ [].
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { ensurePheromoneTable, depositPheromone } from '../core/economy/pheromone-store.js'
import { listPheromoneTrails } from '../core/economy/mmas-pheromone.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  ensurePheromoneTable(db)
  return db
}

describe('listPheromoneTrails', () => {
  it('returns the project trails ordered by amount desc, excluding other projects (AC1)', () => {
    const db = freshDb()
    depositPheromone(db, 'proj-a', 'trail-low', 1)
    depositPheromone(db, 'proj-a', 'trail-high', 9)
    depositPheromone(db, 'proj-a', 'trail-mid', 5)
    depositPheromone(db, 'proj-b', 'foreign-trail', 99)

    const trails = listPheromoneTrails(db, 'proj-a')
    expect(trails.map((t) => t.key)).toEqual(['trail-high', 'trail-mid', 'trail-low'])
    for (const t of trails) {
      expect(typeof t.amount).toBe('number')
      expect(typeof t.ts).toBe('number')
    }
    expect(trails.some((t) => t.key === 'foreign-trail')).toBe(false)
  })

  it('returns [] for a project with no trails (AC2)', () => {
    const db = freshDb()
    depositPheromone(db, 'proj-other', 'x', 1)
    expect(listPheromoneTrails(db, 'proj-empty')).toEqual([])
  })

  it('does not throw and returns [] when the query fails (AC4)', () => {
    const db = new Database(':memory:') // sem pheromone_trails
    db.close() // força falha de query
    expect(listPheromoneTrails(db, 'proj-a')).toEqual([])
  })
})
