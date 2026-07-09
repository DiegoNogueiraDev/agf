/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/rag/knowledge-dedup.ts — findDuplicates + findContradictions.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { findDuplicates, findContradictions } from '../core/rag/knowledge-dedup.js'

function db(rows: Array<[string, string, string]>): Database.Database {
  const d = new Database(':memory:')
  d.exec('CREATE TABLE knowledge_documents (id TEXT, title TEXT, content TEXT, created_at TEXT)')
  const ins = d.prepare('INSERT INTO knowledge_documents (id, title, content, created_at) VALUES (?, ?, ?, ?)')
  let i = 0
  for (const [id, title, content] of rows) ins.run(id, title, content, `2026-01-0${++i}`)
  return d
}

describe('findDuplicates', () => {
  it('flags near-identical documents above the Jaccard threshold', () => {
    const d = db([
      ['a', 'A', 'the quick brown fox jumps over the lazy dog every morning'],
      ['b', 'B', 'the quick brown fox jumps over the lazy dog every morning too'],
      ['c', 'C', 'completely unrelated content about databases and indexes'],
    ])
    const dups = findDuplicates(d)
    expect(dups.length).toBe(1)
    expect([dups[0].docId1, dups[0].docId2].sort()).toEqual(['a', 'b'])
    expect(dups[0].similarity).toBeGreaterThan(0.7)
  })

  it('returns [] when no pair is similar enough', () => {
    const d = db([
      ['a', 'A', 'apples oranges bananas'],
      ['b', 'B', 'rockets satellites orbits'],
    ])
    expect(findDuplicates(d)).toEqual([])
  })
})

describe('findContradictions', () => {
  it('detects a must / must-not negation conflict in overlapping docs', () => {
    const d = db([
      ['a', 'A', 'system policy must enable feature alpha'],
      ['b', 'B', 'system policy must not enable feature beta gamma'],
    ])
    const conflicts = findContradictions(d)
    expect(conflicts.length).toBeGreaterThanOrEqual(1)
    expect(conflicts[0].reason.toLowerCase()).toContain('must')
  })
})
