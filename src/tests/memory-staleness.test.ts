/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  findStaleMemories,
  isMemoryStalenessDisabled,
  STALE_AGE_DAYS,
  STALENESS_LIMIT,
} from '../core/hooks/memory-staleness.js'

describe('memory-staleness', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = 1_700_000_000_000

  describe('isMemoryStalenessDisabled', () => {
    it('returns false by default', () => {
      expect(isMemoryStalenessDisabled({})).toBe(false)
    })

    it('returns true when set to off', () => {
      expect(isMemoryStalenessDisabled({ MCP_GRAPH_MEMORY_STALENESS: 'off' })).toBe(true)
    })
  })

  describe('findStaleMemories', () => {
    function makeRef(id: string, daysAgo: number) {
      return { id, title: `Memory ${id}`, updatedAt: now - daysAgo * DAY_MS }
    }

    it('returns empty when all memories are fresh', () => {
      const r = findStaleMemories([makeRef('a', 1), makeRef('b', 5)], now, STALE_AGE_DAYS, STALENESS_LIMIT)
      expect(r).toEqual([])
    })

    it('returns stale memories older than threshold', () => {
      const r = findStaleMemories(
        [makeRef('old1', 40), makeRef('fresh', 10), makeRef('old2', 50)],
        now,
        STALE_AGE_DAYS,
        STALENESS_LIMIT,
      )
      expect(r).toHaveLength(2)
      expect(r[0].id).toBe('old2')
      expect(r[1].id).toBe('old1')
      expect(r[0].ageDays).toBe(50)
    })

    it('respects limit', () => {
      const mems = Array.from({ length: 20 }, (_, i) => makeRef(`m${i}`, 60))
      const r = findStaleMemories(mems, now, STALE_AGE_DAYS, 5)
      expect(r).toHaveLength(5)
    })

    it('sorts by oldest first', () => {
      const mems = [makeRef('old-30', 30), makeRef('old-60', 60), makeRef('old-90', 90)]
      const r = findStaleMemories(mems, now, 15, STALENESS_LIMIT)
      expect(r.map((m) => m.id)).toEqual(['old-90', 'old-60', 'old-30'])
    })

    it('returns empty for empty input', () => {
      expect(findStaleMemories([], now)).toEqual([])
    })
  })
})
