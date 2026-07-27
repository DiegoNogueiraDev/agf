/**
 * raw-immutability.test.ts — ProvenanceError on source rewrite + supersedes edge.
 * AC: rewrite with diff content → throw; rewrite same → no-op; correction via new source.
 */
import { describe, it, expect } from 'vitest'
import {
  ProvenanceError,
  writeSource,
  supersedesSource,
  type SourceStore,
} from '../core/provenance/source-immutability.js'

function makeStore(): SourceStore {
  const sources = new Map<string, string>()
  const edges: Array<{ from: string; to: string; type: 'supersedes' }> = []
  return { sources, edges }
}

describe('writeSource', () => {
  it('writes a new source without error', () => {
    const store = makeStore()
    expect(() => writeSource(store, 'src-1', 'content A')).not.toThrow()
    expect(store.sources.get('src-1')).toBe('content A')
  })

  it('throws ProvenanceError when rewriting with different content', () => {
    const store = makeStore()
    writeSource(store, 'src-1', 'content A')
    expect(() => writeSource(store, 'src-1', 'content B')).toThrow(ProvenanceError)
  })

  it('is idempotent for identical content (no-op, no error)', () => {
    const store = makeStore()
    writeSource(store, 'src-1', 'content A')
    expect(() => writeSource(store, 'src-1', 'content A')).not.toThrow()
    expect(store.sources.size).toBe(1)
  })
})

describe('supersedesSource', () => {
  it('adds a new source and a supersedes edge from new to old', () => {
    const store = makeStore()
    writeSource(store, 'src-old', 'wrong content')
    supersedesSource(store, 'src-new', 'corrected content', 'src-old')
    expect(store.sources.get('src-new')).toBe('corrected content')
    expect(store.edges).toContainEqual({ from: 'src-new', to: 'src-old', type: 'supersedes' })
  })

  it('throws when the superseded source does not exist', () => {
    const store = makeStore()
    expect(() => supersedesSource(store, 'src-new', 'content', 'nonexistent')).toThrow(ProvenanceError)
  })
})
