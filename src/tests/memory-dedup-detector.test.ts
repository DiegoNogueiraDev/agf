/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  findNearDuplicates,
  isMemoryDedupDisabled,
  getDedupWindow,
  shouldSkipDedup,
  vectorizeForDedup,
  DEDUP_SIMILARITY_THRESHOLD,
  MIN_DEDUP_CONTENT_LEN,
} from '../core/hooks/memory-dedup-detector.js'

describe('memory-dedup-detector', () => {
  describe('isMemoryDedupDisabled', () => {
    it('returns false by default', () => {
      expect(isMemoryDedupDisabled({})).toBe(false)
    })

    it('returns true when set to off', () => {
      expect(isMemoryDedupDisabled({ MCP_GRAPH_MEMORY_DEDUP: 'off' })).toBe(true)
    })
  })

  describe('getDedupWindow', () => {
    it('returns default 100', () => {
      expect(getDedupWindow({})).toBe(100)
    })

    it('parses from env', () => {
      expect(getDedupWindow({ MCP_GRAPH_DEDUP_WINDOW: '50' })).toBe(50)
    })

    it('returns default for invalid', () => {
      expect(getDedupWindow({ MCP_GRAPH_DEDUP_WINDOW: 'abc' })).toBe(100)
    })
  })

  describe('shouldSkipDedup', () => {
    it('skips empty content', () => {
      expect(shouldSkipDedup('')).toBe(true)
    })

    it('skips short content', () => {
      expect(shouldSkipDedup('short')).toBe(true)
    })

    it('does not skip long content', () => {
      expect(shouldSkipDedup('x'.repeat(MIN_DEDUP_CONTENT_LEN + 1))).toBe(false)
    })
  })

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
    })

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
    })

    it('returns 0 for different length', () => {
      expect(cosineSimilarity([1, 2], [1])).toBe(0)
    })

    it('returns 0 for zero vector', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
    })

    it('returns value between 0 and 1 for partial match', () => {
      const sim = cosineSimilarity([1, 2, 3], [1, 2, 0])
      expect(sim).toBeGreaterThan(0)
      expect(sim).toBeLessThan(1)
    })

    it('handles empty arrays', () => {
      expect(cosineSimilarity([], [])).toBe(0)
    })
  })

  describe('findNearDuplicates', () => {
    const vec = (id: string, v: number[]) => ({ id, vector: v })

    it('finds duplicate above threshold', () => {
      const matches = findNearDuplicates(vec('new', [1, 0, 0]), [vec('a', [1, 0, 0])], 0.5)
      expect(matches).toHaveLength(1)
      expect(matches[0].existingId).toBe('a')
      expect(matches[0].similarity).toBeCloseTo(1, 5)
    })

    it('excludes self-match', () => {
      const matches = findNearDuplicates(vec('self', [1, 0]), [vec('self', [1, 0])], 0.5)
      expect(matches).toHaveLength(0)
    })

    it('filters by threshold', () => {
      const matches = findNearDuplicates(vec('new', [1, 0]), [vec('a', [0.5, 0.5])], 0.9)
      expect(matches).toHaveLength(0)
    })

    it('sorts descending by similarity', () => {
      const matches = findNearDuplicates(
        vec('new', [1, 0, 0]),
        [vec('far', [0.9, 0.1, 0]), vec('close', [1, 0.01, 0])],
        0.5,
      )
      expect(matches).toHaveLength(2)
      expect(matches[0].existingId).toBe('close')
      expect(matches[1].existingId).toBe('far')
    })
  })

  describe('vectorizeForDedup (node_wire_49f392b42a5c)', () => {
    it('produces same-length vectors sharing one vocabulary', () => {
      const [a, b] = vectorizeForDedup([
        { id: 'a', text: 'the quick brown fox' },
        { id: 'b', text: 'the lazy dog' },
      ])
      expect(a.vector.length).toBe(b.vector.length)
    })

    it('near-identical texts vectorize to high cosine similarity', () => {
      const [a, b] = vectorizeForDedup([
        { id: 'a', text: 'agf next é global sem escopo por epic o picker é FIFO por prioridade' },
        { id: 'b', text: 'agf next é global sem escopo por epic o picker é FIFO por prioridade e id' },
      ])
      expect(cosineSimilarity(a.vector, b.vector)).toBeGreaterThanOrEqual(DEDUP_SIMILARITY_THRESHOLD)
    })

    it('unrelated texts vectorize to low cosine similarity', () => {
      const [a, b] = vectorizeForDedup([
        { id: 'a', text: 'agf next é global sem escopo por epic o picker é FIFO por prioridade' },
        { id: 'b', text: 'binários de release ficam no servidor via scp nunca no git' },
      ])
      expect(cosineSimilarity(a.vector, b.vector)).toBeLessThan(DEDUP_SIMILARITY_THRESHOLD)
    })
  })
})
