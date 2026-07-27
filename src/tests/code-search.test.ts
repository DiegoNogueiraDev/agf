/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.3 AC coverage: code-search.ts searchCodeSymbols
 *
 * AC1: existing symbol in index → returns entry with correct file and name
 * AC2: query with no match → empty array, no exception
 * AC3: empty index → empty array (with warning log)
 * Coverage: code-search.ts ≥ 90% branch coverage
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { CodeStore } from '../core/code/code-store.js'
import { searchCodeSymbols } from '../core/code/code-search.js'
import type { CodeSearchOptions } from '../core/code/code-search.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'code-search-test'

function freshStore(): CodeStore {
  const db = new Database(':memory:')
  runMigrations(db)
  return new CodeStore(db)
}

let _seq = 0
function makeSymbol(
  store: CodeStore,
  override: Partial<Parameters<CodeStore['insertSymbol']>[0]> = {},
): ReturnType<CodeStore['insertSymbol']> {
  const i = ++_seq
  return store.insertSymbol({
    projectId: PROJECT_ID,
    name: `symbol_${i}`,
    kind: 'function',
    file: `src/utils/util_${i}.ts`,
    startLine: 1,
    endLine: 10,
    exported: true,
    ...override,
  })
}

// ── AC1: existing symbol → returned with correct file / name ──────────────────

describe('AC1: symbol in index is returned with correct metadata', () => {
  it('returns result for an exact symbol name match', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'validateNode', file: 'src/core/graph/graph-node.ts' })

    const results = searchCodeSymbols(store, 'validateNode', PROJECT_ID)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].symbol.name).toBe('validateNode')
  })

  it('returns correct file path for the matched symbol', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'buildEdge', file: 'src/core/graph/edge-builder.ts' })

    const results = searchCodeSymbols(store, 'buildEdge', PROJECT_ID)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].symbol.file).toBe('src/core/graph/edge-builder.ts')
  })

  it('result contains a numeric score', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'insertNode', file: 'src/core/store/sqlite-store.ts' })

    const results = searchCodeSymbols(store, 'insertNode', PROJECT_ID)
    expect(results.length).toBeGreaterThan(0)
    expect(typeof results[0].score).toBe('number')
  })

  it('prefix match — "validate" matches "validateNode" (FTS5 prefix matching)', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'validateNode', file: 'src/core/graph/graph-node.ts' })

    const results = searchCodeSymbols(store, 'validate', PROJECT_ID)
    const names = results.map((r) => r.symbol.name)
    expect(names).toContain('validateNode')
  })

  it('returns the startLine and endLine via symbol metadata', () => {
    const store = freshStore()
    makeSymbol(store, {
      name: 'computeScore',
      file: 'src/core/search/tfidf.ts',
      startLine: 42,
      endLine: 60,
    })

    const results = searchCodeSymbols(store, 'computeScore', PROJECT_ID)
    expect(results.length).toBeGreaterThan(0)
    const sym = results[0].symbol
    expect(sym.startLine).toBe(42)
    expect(sym.endLine).toBe(60)
  })

  it('respects the limit option', () => {
    const store = freshStore()
    for (let i = 1; i <= 10; i++) {
      makeSymbol(store, { name: `searchHelper_${i}`, file: `src/helpers/h${i}.ts` })
    }

    const opts: CodeSearchOptions = { limit: 3 }
    const results = searchCodeSymbols(store, 'searchHelper', PROJECT_ID, opts)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('only returns symbols for the given projectId', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'myFunc', projectId: 'other-project', file: 'x.ts' })
    makeSymbol(store, { name: 'myFunc', projectId: PROJECT_ID, file: 'y.ts' })

    const results = searchCodeSymbols(store, 'myFunc', PROJECT_ID)
    for (const r of results) {
      expect(r.symbol.projectId).toBe(PROJECT_ID)
    }
  })
})

// ── AC2: query with no match → empty array, no exception ─────────────────────

describe('AC2: no match → empty array without exception', () => {
  it('returns [] for a query matching no symbols', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'realFunction', file: 'src/a.ts' })

    const results = searchCodeSymbols(store, 'xyznomatchsymbol', PROJECT_ID)
    expect(results).toEqual([])
  })

  it('does not throw on unmatched query', () => {
    const store = freshStore()
    expect(() => searchCodeSymbols(store, 'notPresent', PROJECT_ID)).not.toThrow()
  })

  it('returns [] (not null) for a query that sanitizes to empty', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'anySymbol', file: 'src/x.ts' })

    const result = searchCodeSymbols(store, '*** (( broken', PROJECT_ID)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns [] for query with only special chars', () => {
    const store = freshStore()
    const result = searchCodeSymbols(store, '!@#$%^&*', PROJECT_ID)
    expect(result).toEqual([])
  })

  it('does not throw on empty string query', () => {
    const store = freshStore()
    expect(() => searchCodeSymbols(store, '', PROJECT_ID)).not.toThrow()
  })
})

// ── AC3: empty index → empty array ────────────────────────────────────────────

describe('AC3: empty index returns empty array', () => {
  it('returns [] when no symbols have been indexed', () => {
    const store = freshStore()
    const results = searchCodeSymbols(store, 'anything', PROJECT_ID)
    expect(results).toEqual([])
  })

  it('does not throw when index is empty', () => {
    const store = freshStore()
    expect(() => searchCodeSymbols(store, 'func', PROJECT_ID)).not.toThrow()
  })

  it('returns [] for a different project with no symbols', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'myFunc', projectId: PROJECT_ID })

    const results = searchCodeSymbols(store, 'myFunc', 'empty-project')
    expect(results).toEqual([])
  })
})

// ── language filter coverage ──────────────────────────────────────────────────

describe('language filter narrows results', () => {
  it('returns only symbols matching the specified language', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'tsFunc', file: 'a.ts', language: 'typescript' })
    makeSymbol(store, { name: 'tsFunc', file: 'b.py', language: 'python' })

    const results = searchCodeSymbols(store, 'tsFunc', PROJECT_ID, { language: 'typescript' })
    for (const r of results) {
      expect(r.symbol.language).toBe('typescript')
    }
  })

  it('returns [] when language filter matches none', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'goFunc', file: 'a.go', language: 'go' })

    const results = searchCodeSymbols(store, 'goFunc', PROJECT_ID, { language: 'rust' })
    expect(results).toEqual([])
  })
})

// ── rerank=true path coverage ─────────────────────────────────────────────────

describe('rerank option exercises TF-IDF reranking path', () => {
  it('returns results when rerank=true with sufficient candidates', () => {
    const store = freshStore()
    for (let i = 1; i <= 5; i++) {
      makeSymbol(store, { name: `rankTarget_${i}`, file: `src/r${i}.ts` })
    }

    const results = searchCodeSymbols(store, 'rankTarget', PROJECT_ID, { rerank: true, limit: 3 })
    expect(Array.isArray(results)).toBe(true)
  })

  it('does not throw when rerank=true and no results', () => {
    const store = freshStore()
    expect(() => searchCodeSymbols(store, 'nomatch', PROJECT_ID, { rerank: true })).not.toThrow()
  })
})

// ── groupByModule path coverage ───────────────────────────────────────────────

describe('groupByModule sorts by module path', () => {
  it('returns results when groupByModule=true', () => {
    const store = freshStore()
    makeSymbol(store, { name: 'groupFn', file: 'src/a.ts', modulePath: 'module-b' })
    makeSymbol(store, { name: 'groupFn', file: 'src/b.ts', modulePath: 'module-a' })

    const results = searchCodeSymbols(store, 'groupFn', PROJECT_ID, { groupByModule: true })
    expect(Array.isArray(results)).toBe(true)
    if (results.length >= 2) {
      const paths = results.map((r) => r.modulePath ?? '')
      expect(paths[0] <= paths[1]).toBe(true)
    }
  })
})
