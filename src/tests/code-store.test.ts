import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { CodeStore } from '../core/code/code-store.js'

/**
 * Characterization tests for CodeStore CRUD + searchSymbols + getIndexMeta.
 * Runs over better-sqlite3 `:memory:` with the real migrations (incl. FTS5),
 * so the SQL is exercised exactly as in production — no mocks.
 */

const PROJECT_ID = 'code-store-test'

function freshStore(): CodeStore {
  const db = new Database(':memory:')
  runMigrations(db)
  return new CodeStore(db)
}

type SymbolInput = Parameters<CodeStore['insertSymbol']>[0]
function symbolInput(over: Partial<SymbolInput> = {}): SymbolInput {
  return {
    projectId: PROJECT_ID,
    name: 'parcel',
    kind: 'function',
    file: 'src/a.ts',
    startLine: 1,
    endLine: 5,
    exported: true,
    ...over,
  }
}

describe('CodeStore symbol CRUD', () => {
  it('insertSymbol fills id/indexedAt and getSymbol round-trips it', () => {
    const store = freshStore()
    const inserted = store.insertSymbol(symbolInput({ name: 'foo' }))
    expect(inserted.id).toMatch(/^csym/)
    expect(inserted.indexedAt).toBeTruthy()

    const fetched = store.getSymbol(inserted.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.name).toBe('foo')
    expect(fetched?.projectId).toBe(PROJECT_ID)
  })

  it('getSymbol returns null for an unknown id', () => {
    const store = freshStore()
    expect(store.getSymbol('nope')).toBeNull()
  })

  it('findSymbolsByName and findSymbolsByFile filter by project', () => {
    const store = freshStore()
    store.insertSymbol(symbolInput({ name: 'shared', file: 'src/x.ts' }))
    store.insertSymbol(symbolInput({ name: 'shared', file: 'src/y.ts' }))
    store.insertSymbol(symbolInput({ name: 'other', file: 'src/x.ts', projectId: 'different' }))

    expect(store.findSymbolsByName('shared', PROJECT_ID)).toHaveLength(2)
    expect(store.findSymbolsByFile('src/x.ts', PROJECT_ID)).toHaveLength(1)
    expect(store.findSymbolsByName('shared', 'different')).toHaveLength(0)
  })
})

describe('CodeStore bulk + delete', () => {
  it('insertSymbolsBulk inserts N and countSymbols reports N', () => {
    const store = freshStore()
    const n = store.insertSymbolsBulk([
      symbolInput({ name: 'a', file: 'src/a.ts' }),
      symbolInput({ name: 'b', file: 'src/b.ts' }),
      symbolInput({ name: 'c', file: 'src/b.ts' }),
    ])
    expect(n).toBe(3)
    expect(store.countSymbols(PROJECT_ID)).toBe(3)
  })

  it('deleteSymbolsByFile removes only that file’s symbols', () => {
    const store = freshStore()
    store.insertSymbolsBulk([
      symbolInput({ name: 'a', file: 'src/a.ts' }),
      symbolInput({ name: 'b', file: 'src/b.ts' }),
      symbolInput({ name: 'c', file: 'src/b.ts' }),
    ])
    const removed = store.deleteSymbolsByFile('src/b.ts', PROJECT_ID)
    expect(removed).toBe(2)
    expect(store.countSymbols(PROJECT_ID)).toBe(1)
    expect(store.findSymbolsByFile('src/a.ts', PROJECT_ID)).toHaveLength(1)
  })

  it('deleteSymbolsByFile returns 0 when nothing matches', () => {
    const store = freshStore()
    expect(store.deleteSymbolsByFile('src/ghost.ts', PROJECT_ID)).toBe(0)
  })
})

describe('CodeStore searchSymbols (FTS5)', () => {
  it('returns matches ordered by score descending', () => {
    const store = freshStore()
    store.insertSymbol(symbolInput({ name: 'parcelService' }))
    store.insertSymbol(symbolInput({ name: 'parcelHelper' }))
    store.insertSymbol(symbolInput({ name: 'unrelated' }))

    // store.searchSymbols takes a raw FTS5 query; prefix matching uses the `*`
    // wildcard (the form code-search.ts builds before calling this method).
    const results = store.searchSymbols('parc*', PROJECT_ID)
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.every((r) => r.symbol.name.startsWith('parcel'))).toBe(true)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('returns an empty array when nothing matches', () => {
    const store = freshStore()
    store.insertSymbol(symbolInput({ name: 'alpha' }))
    expect(store.searchSymbols('zzzznomatch', PROJECT_ID)).toEqual([])
  })
})

describe('CodeStore relations', () => {
  it('insertRelation + getRelationsFrom/To round-trip', () => {
    const store = freshStore()
    const from = store.insertSymbol(symbolInput({ name: 'caller' }))
    const to = store.insertSymbol(symbolInput({ name: 'callee' }))

    const rel = store.insertRelation({
      projectId: PROJECT_ID,
      fromSymbol: from.id,
      toSymbol: to.id,
      type: 'calls',
      file: 'src/a.ts',
      line: 3,
    })
    expect(rel.id).toMatch(/^crel/)

    const outgoing = store.getRelationsFrom(from.id)
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0].toSymbol).toBe(to.id)

    const incoming = store.getRelationsTo(to.id)
    expect(incoming).toHaveLength(1)
    expect(incoming[0].fromSymbol).toBe(from.id)
  })
})

describe('CodeStore index meta', () => {
  it('getIndexMeta is null before upsert and reflects upserted values', () => {
    const store = freshStore()
    expect(store.getIndexMeta(PROJECT_ID)).toBeNull()

    store.upsertIndexMeta({
      projectId: PROJECT_ID,
      lastIndexed: '2026-06-28T00:00:00.000Z',
      fileCount: 4,
      symbolCount: 10,
      relationCount: 2,
      gitHash: 'abc123',
    })
    const meta = store.getIndexMeta(PROJECT_ID)
    expect(meta?.fileCount).toBe(4)
    expect(meta?.symbolCount).toBe(10)
    expect(meta?.gitHash).toBe('abc123')
  })
})
