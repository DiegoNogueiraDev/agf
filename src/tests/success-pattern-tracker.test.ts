/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  derivePatternKey,
  SuccessPatternTracker,
  buildStrategyMemory,
} from '../core/harness/success-pattern-tracker.js'

vi.mock('../core/utils/id.js', () => ({
  generateId: vi.fn(() => 'spt_mock_id_001'),
}))

vi.mock('../core/utils/time.js', () => ({
  now: vi.fn(() => '2026-06-06T12:00:00.000Z'),
}))

vi.mock('../core/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}))

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS success_patterns (
      id TEXT PRIMARY KEY,
      pattern_key TEXT NOT NULL UNIQUE,
      count INTEGER NOT NULL DEFAULT 0,
      contributing_node_ids TEXT NOT NULL,
      contributing_rationales TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      memory_written INTEGER NOT NULL DEFAULT 0
    )
  `)
  return db
}

describe('derivePatternKey', () => {
  it('returns null when node has no tags and no parentId', () => {
    expect(derivePatternKey({})).toBeNull()
  })

  it('uses sorted tags when present', () => {
    const key = derivePatternKey({ tags: ['b', 'a'] })
    expect(key).toBe('tags:a,b')
  })

  it('falls back to parentId when no tags', () => {
    const key = derivePatternKey({ parentId: 'epic-123' })
    expect(key).toBe('epic:epic-123')
  })

  it('filters empty tags', () => {
    const key = derivePatternKey({ tags: ['valid', '', undefined as any] })
    expect(key).toBe('tags:valid')
  })
})

describe('SuccessPatternTracker', () => {
  let db: Database.Database
  let tracker: SuccessPatternTracker

  beforeEach(() => {
    db = createDb()
    tracker = new SuccessPatternTracker(db, 3)
  })

  it('records first success and returns shouldEmit=false', () => {
    const result = tracker.recordSuccess('tags:auth', 'node-1', 'Grade A finish')
    expect(result.shouldEmit).toBe(false)
    expect(result.count).toBe(1)
    expect(result.patternKey).toBe('tags:auth')
  })

  it('returns shouldEmit=true exactly when threshold is reached', () => {
    tracker.recordSuccess('tags:auth', 'node-1', 'Reason 1')
    tracker.recordSuccess('tags:auth', 'node-2', 'Reason 2')
    const result = tracker.recordSuccess('tags:auth', 'node-3', 'Reason 3')
    expect(result.shouldEmit).toBe(true)
    expect(result.alreadyEmitted).toBe(false)
    expect(result.count).toBe(3)
    expect(result.contributingNodeIds).toEqual(['node-1', 'node-2', 'node-3'])
  })

  it('returns alreadyEmitted=true on subsequent successes after emit', () => {
    tracker.recordSuccess('tags:auth', 'node-1', 'R1')
    tracker.recordSuccess('tags:auth', 'node-2', 'R2')
    tracker.recordSuccess('tags:auth', 'node-3', 'R3')
    const result = tracker.recordSuccess('tags:auth', 'node-4', 'R4')
    expect(result.shouldEmit).toBe(false)
    expect(result.alreadyEmitted).toBe(true)
    expect(result.count).toBe(4)
  })

  it('is idempotent for same (key, nodeId) pair', () => {
    tracker.recordSuccess('tags:auth', 'node-1', 'R1')
    const dup = tracker.recordSuccess('tags:auth', 'node-1', 'R1')
    expect(dup.count).toBe(1)
    expect(dup.shouldEmit).toBe(false)
  })

  it('handles null patternKey gracefully', () => {
    const result = tracker.recordSuccess(null, 'node-1', 'R1')
    expect(result.shouldEmit).toBe(false)
    expect(result.count).toBe(0)
  })
})

describe('buildStrategyMemory', () => {
  it('generates name and content from input', () => {
    const result = buildStrategyMemory({
      patternKey: 'tags:auth,security',
      nodeIds: ['node-1', 'node-2'],
      rationales: ['First success', 'Second success'],
    })
    expect(result.name).toContain('strategy_tags-auth-security_')
    expect(result.name).toMatch(/^strategy_/)
    expect(result.content).toContain('tags:auth,security')
    expect(result.content).toContain('node-1')
    expect(result.content).toContain('node-2')
  })
})
