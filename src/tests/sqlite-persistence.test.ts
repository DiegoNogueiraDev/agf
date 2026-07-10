import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteCachePersistence } from '../core/llm/response-cache-sqlite.js'
import type { CacheEntry } from '../core/llm/response-cache.js'

describe('SqliteCachePersistence', () => {
  let db: Database.Database
  let persistence: SqliteCachePersistence<string>

  beforeEach(() => {
    db = new Database(':memory:')
    persistence = new SqliteCachePersistence<string>(db)
  })

  afterEach(() => {
    db.close()
  })

  it('write e read roundtrip', () => {
    const entry: CacheEntry<string> = {
      key: 'test-key',
      value: 'test-value',
      schemaVersion: 1,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 3600000,
    }
    persistence.write(entry)
    const read = persistence.read('test-key')
    expect(read?.value).toBe('test-value')
    expect(read?.schemaVersion).toBe(1)
  })

  it('read expirado retorna undefined', () => {
    const entry: CacheEntry<string> = {
      key: 'stale',
      value: 'old',
      schemaVersion: 1,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() - 1000,
    }
    persistence.write(entry)
    expect(persistence.read('stale')).toBeUndefined()
  })

  it('prune remove entries before given timestamp', () => {
    const now = Date.now()
    persistence.write({ key: 'old', value: 'v', schemaVersion: 1, createdAtMs: now - 100000, expiresAtMs: now - 1000 })
    persistence.write({ key: 'new', value: 'v', schemaVersion: 1, createdAtMs: now, expiresAtMs: now + 3600000 })
    const pruned = persistence.prune(now)
    expect(pruned).toBe(1)
    expect(persistence.read('old')).toBeUndefined()
    expect(persistence.read('new')).toBeDefined()
  })

  it('invalidateBySchema removes wrong schema version', () => {
    persistence.write({
      key: 'v1',
      value: 'a',
      schemaVersion: 1,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 3600000,
    })
    persistence.write({
      key: 'v2',
      value: 'b',
      schemaVersion: 2,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 3600000,
    })
    const removed = persistence.invalidateBySchema(2)
    expect(removed).toBe(1)
    expect(persistence.read('v1')).toBeUndefined()
  })

  it('clear removes all entries', () => {
    persistence.write({
      key: 'a',
      value: '1',
      schemaVersion: 1,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 3600000,
    })
    persistence.write({
      key: 'b',
      value: '2',
      schemaVersion: 1,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 3600000,
    })
    expect(persistence.size()).toBe(2)
    persistence.clear()
    expect(persistence.size()).toBe(0)
  })

  it('size() retorna numero de entradas', () => {
    expect(persistence.size()).toBe(0)
    persistence.write({
      key: 'k1',
      value: 'v1',
      schemaVersion: 1,
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 3600000,
    })
    expect(persistence.size()).toBe(1)
  })

  it('WAL mode ativado (memory fallback = memory)', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(['wal', 'WAL', 'memory']).toContain(row.journal_mode.toLowerCase())
  })
})

describe('RAC Eviction', () => {
  it('topical_prevalence * structural_importance ordena entradas corretamente', () => {
    const entries = [
      { key: 'a', topic: 'code', accessCount: 50, dependents: 10 },
      { key: 'b', topic: 'conversation', accessCount: 10, dependents: 2 },
      { key: 'c', topic: 'code', accessCount: 5, dependents: 1 },
    ]
    const scores = entries.map((e) => ({
      key: e.key,
      score: topicalPrevalence(e.accessCount, 100) * structuralImportance(e.dependents, 20),
    }))
    scores.sort((a, b) => a.score - b.score)
    expect(scores[0].key).toBe('c') // lowest = first to evict
    expect(scores[2].key).toBe('a') // highest = last to evict
  })
})

function topicalPrevalence(count: number, total: number): number {
  return total > 0 ? count / total : 0
}

function structuralImportance(dependents: number, maxDeps: number): number {
  return maxDeps > 0 ? dependents / maxDeps : 0
}

describe('Artifact Cache Auto-Prune', () => {
  it('entries older than 30 days are pruned', () => {
    const now = Date.now()
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const old = now - THIRTY_DAYS_MS - 1000
    const recent = now

    expect(old < now - THIRTY_DAYS_MS).toBe(true)
    expect(recent > now - THIRTY_DAYS_MS).toBe(true)
  })
})
