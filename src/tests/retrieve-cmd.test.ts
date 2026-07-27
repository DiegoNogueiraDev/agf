/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { CcrStore } from '../core/economy/ccr-store.js'
import { ToolOutputStore, toolOutputMarker } from '../core/context/tool-output-store.js'
import { runRetrieve, rankPassages, splitPassages } from '../cli/commands/retrieve-cmd.js'

function seed(original: string): { db: Database.Database; hash: string } {
  const db = new Database(':memory:')
  const hash = new CcrStore(db).put(original)
  return { db, hash }
}

describe('runRetrieve — tool-output:// handles (T2.4)', () => {
  const big = 'HEAD' + 'y'.repeat(5000) + 'TAIL'

  // AC: GIVEN a tool-output://<hash> WHEN agf retrieve runs THEN the full content is returned
  it('resolves a tool-output:// handle to the full original', () => {
    const db = new Database(':memory:')
    const { hash } = new ToolOutputStore(db, { thresholdChars: 100 }).offload(big)
    const result = runRetrieve(db, toolOutputMarker(hash as string), undefined, 5)
    expect(result).not.toBeNull()
    expect(result && 'original' in result ? result.original : null).toBe(big)
  })

  it('BM25-ranks a tool-output original when a query is given', () => {
    const db = new Database(':memory:')
    const { hash } = new ToolOutputStore(db, { thresholdChars: 10 }).offload(
      'alpha line\n\nbeta target line\n\ngamma line',
    )
    const result = runRetrieve(db, toolOutputMarker(hash as string), 'target', 5)
    expect(result && 'matches' in result ? result.matches.length : 0).toBeGreaterThan(0)
  })

  // AC: GIVEN an unknown hash WHEN agf retrieve runs THEN null (→ NOT_FOUND envelope)
  it('returns null for an unknown tool-output:// handle', () => {
    const db = new Database(':memory:')
    new ToolOutputStore(db)
    expect(runRetrieve(db, 'tool-output://deadbeef', undefined, 5)).toBeNull()
  })
})

describe('runRetrieve', () => {
  // AC1: envelope returns the original for a valid hash.
  it('returns the original for a valid hash (no query)', () => {
    const original = 'alpha line\n\nbeta paragraph\n\ngamma section'
    const { db, hash } = seed(original)

    const result = runRetrieve(db, hash, undefined, 5)

    expect(result).not.toBeNull()
    expect(result).toEqual({ hash, original })
    db.close()
  })

  // AC2: --query returns BM25-ranked slices of the original.
  it('returns BM25-ranked slices when a query is given', () => {
    const original = [
      'The cache layer stores compressed artifacts.',
      'BM25 ranking scores passages by query relevance.',
      'The graph engine drives task execution deterministically.',
    ].join('\n\n')
    const { db, hash } = seed(original)

    const result = runRetrieve(db, hash, 'BM25 ranking relevance', 5)

    expect(result).not.toBeNull()
    expect(result).toHaveProperty('matches')
    const matches = (result as { matches: Array<{ text: string; score: number; index: number }> }).matches
    expect(matches.length).toBeGreaterThan(0)
    // The BM25 passage about ranking/relevance must rank first.
    expect(matches[0].text).toContain('BM25 ranking')
    expect(matches[0].score).toBeGreaterThan(0)
    // Index points back into document order.
    expect(matches[0].index).toBe(1)
    db.close()
  })

  it('respects the --limit when ranking slices', () => {
    const original = ['one apple', 'two apple', 'three apple', 'four apple'].join('\n\n')
    const { db, hash } = seed(original)

    const result = runRetrieve(db, hash, 'apple', 2)

    const matches = (result as { matches: unknown[] }).matches
    expect(matches).toHaveLength(2)
    db.close()
  })

  // AC3: NOT_FOUND on an unknown hash (core returns null → command emits NOT_FOUND).
  it('returns null for an unknown hash', () => {
    const db = new Database(':memory:')
    // Ensure the table exists but holds nothing matching.
    new CcrStore(db)

    const result = runRetrieve(db, 'deadbeef'.repeat(8), undefined, 5)

    expect(result).toBeNull()
    db.close()
  })
})

describe('splitPassages', () => {
  it('splits blank-line-separated paragraphs', () => {
    expect(splitPassages('a\n\nb\n\nc')).toEqual(['a', 'b', 'c'])
  })

  it('falls back to per-line when no blank lines', () => {
    expect(splitPassages('line1\nline2\nline3')).toEqual(['line1', 'line2', 'line3'])
  })

  it('drops empty passages', () => {
    expect(splitPassages('a\n\n   \n\nb')).toEqual(['a', 'b'])
  })
})

describe('rankPassages', () => {
  it('ranks the most relevant passage first', () => {
    const original = 'cats and dogs\n\nquantum physics equations\n\nthe quantum field'
    const matches = rankPassages(original, 'quantum field', 5)
    expect(matches[0].text).toContain('quantum')
    expect(matches[0].score).toBeGreaterThan(0)
  })

  it('returns empty for empty original', () => {
    expect(rankPassages('', 'anything', 5)).toEqual([])
  })
})

describe('retrieve command registration', () => {
  it('exports retrieveCommand function', async () => {
    const mod = await import('../cli/commands/retrieve-cmd.js')
    expect(typeof mod.retrieveCommand).toBe('function')
  })
})
