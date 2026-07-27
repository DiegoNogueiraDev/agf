/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { analyzePolicyObservations } from '../core/analyzer/policy-observations-analyzer.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_observations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      divergence INTEGER NOT NULL DEFAULT 0,
      decision TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL
    )
  `)
  return db
}

const recentTs = (): string => new Date(Date.now() - 1000).toISOString()
const oldTs = (): string => new Date(Date.now() - 400 * 24 * 60 * 60_000).toISOString()

describe('analyzePolicyObservations', () => {
  it('returns empty report when no observations exist', () => {
    const db = createTestDb()
    const result = analyzePolicyObservations(db, { windowDays: 30 })
    expect(result.totalObservations).toBe(0)
    expect(result.divergenceCount).toBe(0)
    expect(result.divergencePct).toBe(0)
    expect(result.topRules).toEqual([])
    expect(result.preferredProviders).toEqual([])
    expect(result.costNote).toContain('No observations')
  })

  it('counts divergences correctly', () => {
    const db = createTestDb()
    const insert = db.prepare(
      'INSERT INTO policy_observations (id, project_id, divergence, decision, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
    insert.run('1', 'p1', 1, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['openai'] }), recentTs())
    insert.run('2', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['anthropic'] }), recentTs())
    insert.run('3', 'p1', 1, JSON.stringify({ appliedRule: 'latency_router', chain: ['openai'] }), recentTs())

    const result = analyzePolicyObservations(db, { windowDays: 30 })
    expect(result.totalObservations).toBe(3)
    expect(result.divergenceCount).toBe(2)
    expect(result.divergencePct).toBeCloseTo(66.67, -1)
  })

  it('computes top rules by frequency', () => {
    const db = createTestDb()
    const insert = db.prepare(
      'INSERT INTO policy_observations (id, project_id, divergence, decision, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
    insert.run('1', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['openai'] }), recentTs())
    insert.run('2', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['anthropic'] }), recentTs())
    insert.run('3', 'p1', 0, JSON.stringify({ appliedRule: 'latency_router', chain: ['openai'] }), recentTs())

    const result = analyzePolicyObservations(db, { windowDays: 30, topN: 2 })
    expect(result.topRules.length).toBe(2)
    expect(result.topRules[0].rule).toBe('cost_optimizer')
    expect(result.topRules[0].count).toBe(2)
  })

  it('computes preferred providers', () => {
    const db = createTestDb()
    const insert = db.prepare(
      'INSERT INTO policy_observations (id, project_id, divergence, decision, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
    insert.run('1', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['openai'] }), recentTs())
    insert.run('2', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['openai'] }), recentTs())
    insert.run('3', 'p1', 0, JSON.stringify({ appliedRule: 'latency_router', chain: ['anthropic'] }), recentTs())

    const result = analyzePolicyObservations(db, { windowDays: 30 })
    expect(result.preferredProviders[0].provider).toBe('openai')
    expect(result.preferredProviders[0].count).toBe(2)
  })

  it('filters by project_id when provided', () => {
    const db = createTestDb()
    const insert = db.prepare(
      'INSERT INTO policy_observations (id, project_id, divergence, decision, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
    insert.run('1', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['openai'] }), recentTs())
    insert.run('2', 'p2', 0, JSON.stringify({ appliedRule: 'latency_router', chain: ['anthropic'] }), recentTs())

    const result = analyzePolicyObservations(db, { windowDays: 30, projectId: 'p1' })
    expect(result.totalObservations).toBe(1)
  })

  it('filters by windowDays', () => {
    const db = createTestDb()
    const insert = db.prepare(
      'INSERT INTO policy_observations (id, project_id, divergence, decision, timestamp) VALUES (?, ?, ?, ?, ?)',
    )
    insert.run('1', 'p1', 0, JSON.stringify({ appliedRule: 'cost_optimizer', chain: ['openai'] }), oldTs())

    const result = analyzePolicyObservations(db, { windowDays: 30 })
    expect(result.totalObservations).toBe(0)
  })
})
