/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for cost aggregator.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import {
  costByNode,
  sessionCost,
  CACHE_DISCOUNT_RATIO,
  DEFAULT_INPUT_RATE_USD_PER_TOKEN,
} from '../core/llm/cost-aggregator.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT
    );
    CREATE TABLE llm_call_ledger (
      id TEXT PRIMARY KEY,
      cost_usd REAL NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      cached_input_tokens INTEGER,
      run_id TEXT,
      node_id TEXT
    );
    INSERT INTO nodes (id, parent_id) VALUES ('parent', NULL);
    INSERT INTO nodes (id, parent_id) VALUES ('child', 'parent');
    INSERT INTO nodes (id, parent_id) VALUES ('grandchild', 'child');
    INSERT INTO llm_call_ledger (id, cost_usd, provider, model, cached_input_tokens, node_id)
      VALUES ('r1', 1.0, 'anthropic', 'claude-haiku', NULL, 'parent');
    INSERT INTO llm_call_ledger (id, cost_usd, provider, model, cached_input_tokens, node_id)
      VALUES ('r2', 2.0, 'openai', 'gpt-4o-mini', 500, 'child');
    INSERT INTO llm_call_ledger (id, cost_usd, provider, model, cached_input_tokens, node_id)
      VALUES ('r3', 3.0, 'anthropic', 'claude-sonnet', 1000, 'grandchild');
  `)
  return db
}

describe('costByNode', () => {
  let db: Database.Database

  beforeAll(() => {
    db = createDb()
  })

  it('aggregates cost for a node and all descendants', () => {
    const r = costByNode(db, 'parent')
    expect(r.totalUsd).toBeCloseTo(6.0, 5)
    expect(r.callCount).toBe(3)
    expect(r.byProvider['anthropic']).toBeCloseTo(4.0, 5)
    expect(r.byProvider['openai']).toBeCloseTo(2.0, 5)
    expect(r.byModel['claude-haiku']).toBeCloseTo(1.0, 5)
    expect(r.byModel['gpt-4o-mini']).toBeCloseTo(2.0, 5)
    expect(r.byModel['claude-sonnet']).toBeCloseTo(3.0, 5)
  })

  it('aggregates cost for a leaf node', () => {
    const r = costByNode(db, 'grandchild')
    expect(r.totalUsd).toBeCloseTo(3.0, 5)
    expect(r.callCount).toBe(1)
  })
})

describe('sessionCost', () => {
  let db: Database.Database

  beforeAll(() => {
    db = createDb()
  })

  it('aggregates all rows and computes cache savings', () => {
    const r = sessionCost(db)
    expect(r.totalUsd).toBeCloseTo(6.0, 5)
    expect(r.callCount).toBe(3)
    expect(r.cachedTokensTotal).toBe(1500)
    const expectedSaved = 1500 * DEFAULT_INPUT_RATE_USD_PER_TOKEN * CACHE_DISCOUNT_RATIO
    expect(r.savedViaCacheUsd).toBeCloseTo(expectedSaved, 10)
  })

  it('filters by runId when provided', () => {
    db.prepare(
      `INSERT INTO llm_call_ledger (id, cost_usd, provider, model, cached_input_tokens, run_id)
      VALUES ('r4', 5.0, 'openai', 'gpt-4', NULL, 'run-1')`,
    ).run()
    db.prepare(
      `INSERT INTO llm_call_ledger (id, cost_usd, provider, model, cached_input_tokens, run_id)
      VALUES ('r5', 10.0, 'openai', 'gpt-4', NULL, 'run-1')`,
    ).run()
    const r = sessionCost(db, { runId: 'run-1' })
    expect(r.totalUsd).toBeCloseTo(15.0, 5)
    expect(r.callCount).toBe(2)
  })
})
