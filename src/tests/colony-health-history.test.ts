/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_64518d44dfec — C85-T1: tests for colony-health-history pure functions
 *
 * AC: buildColonyHealthMemoryName returns formatted string;
 *     pruneColonyHealthSnapshots splits by cutoff;
 *     parseColonyHealthHistory sorts + trends; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import {
  buildColonyHealthMemoryName,
  pruneColonyHealthSnapshots,
  parseColonyHealthHistory,
} from '../core/colony/colony-health-history.js'
import type { ColonyHealthMemoryEntry } from '../core/colony/colony-health-history.js'

function makeEntry(name: string, date: Date, grade: string): ColonyHealthMemoryEntry {
  return { name, date, grade, content: `{"grade":"${grade}"}` }
}

// Relative to now, never a calendar literal: "recent" is only meaningful against
// the day the suite runs. This was `2026-06-23`, and on 2026-07-23 it aged past
// the 30-day prune window below and started failing every run — a test that rots
// on a date nobody is watching (node_92be256321b2). The tests that DO assert on
// a formatted date carry their own literal, so they are unaffected.
const RECENT = new Date(Date.now() - 24 * 60 * 60 * 1000) // yesterday
const OLD = new Date('2025-01-01T00:00:00Z') // fixed: always old, cannot rot

describe('buildColonyHealthMemoryName', () => {
  it('returns a non-empty string', () => {
    const result = buildColonyHealthMemoryName(RECENT)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('starts with colony-health-snapshot prefix', () => {
    const result = buildColonyHealthMemoryName(RECENT)
    expect(result.startsWith('colony-health-snapshot-')).toBe(true)
  })

  it('includes the date part', () => {
    const result = buildColonyHealthMemoryName(new Date('2026-06-23T12:30:00Z'))
    expect(result).toContain('2026-06-23')
  })

  it('contains time components separated by dashes', () => {
    const result = buildColonyHealthMemoryName(new Date('2026-06-23T12:30:45Z'))
    expect(result).toMatch(/\d{2}-\d{2}-\d{2}/)
  })

  it('different dates produce different names', () => {
    const name1 = buildColonyHealthMemoryName(RECENT)
    const name2 = buildColonyHealthMemoryName(OLD)
    expect(name1).not.toBe(name2)
  })
})

describe('pruneColonyHealthSnapshots', () => {
  it('returns object with pruned and kept arrays', () => {
    const result = pruneColonyHealthSnapshots([], 7)
    expect(Array.isArray(result.pruned)).toBe(true)
    expect(Array.isArray(result.kept)).toBe(true)
  })

  it('empty entries produces empty pruned and kept', () => {
    const result = pruneColonyHealthSnapshots([], 7)
    expect(result.pruned).toHaveLength(0)
    expect(result.kept).toHaveLength(0)
  })

  it('recent entries are kept with positive retentionDays', () => {
    const entries = [makeEntry('recent', RECENT, 'A')]
    const result = pruneColonyHealthSnapshots(entries, 365)
    expect(result.kept).toContain('recent')
    expect(result.pruned).toHaveLength(0)
  })

  it('very old entries are pruned', () => {
    const entries = [makeEntry('old-entry', OLD, 'B')]
    const result = pruneColonyHealthSnapshots(entries, 7)
    expect(result.pruned).toContain('old-entry')
    expect(result.kept).toHaveLength(0)
  })

  it('mix of old and recent: each goes to correct bucket', () => {
    const entries = [makeEntry('old-entry', OLD, 'C'), makeEntry('recent-entry', RECENT, 'A')]
    const result = pruneColonyHealthSnapshots(entries, 30)
    expect(result.pruned).toContain('old-entry')
    expect(result.kept).toContain('recent-entry')
  })
})

describe('parseColonyHealthHistory', () => {
  it('returns an array', () => {
    const result = parseColonyHealthHistory([], 10)
    expect(Array.isArray(result)).toBe(true)
  })

  it('empty entries returns empty array', () => {
    const result = parseColonyHealthHistory([], 10)
    expect(result).toHaveLength(0)
  })

  it('respects limit parameter', () => {
    const entries = [
      makeEntry('e1', new Date('2026-06-23'), 'A'),
      makeEntry('e2', new Date('2026-06-22'), 'B'),
      makeEntry('e3', new Date('2026-06-21'), 'C'),
    ]
    const result = parseColonyHealthHistory(entries, 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('each item has trend property', () => {
    const entries = [makeEntry('e1', RECENT, 'A')]
    const result = parseColonyHealthHistory(entries, 5)
    for (const item of result) {
      expect(['improving', 'stable', 'declining']).toContain(item.trend)
    }
  })

  it('single entry is stable (no previous to compare)', () => {
    const entries = [makeEntry('e1', RECENT, 'A')]
    const result = parseColonyHealthHistory(entries, 5)
    expect(result[0]?.trend).toBe('stable')
  })

  it('improving grade trend detected: C→A is improving', () => {
    const entries = [
      makeEntry('latest', new Date('2026-06-23'), 'A'),
      makeEntry('earlier', new Date('2026-06-22'), 'C'),
    ]
    const result = parseColonyHealthHistory(entries, 5)
    expect(result[0]?.trend).toBe('improving')
  })

  it('declining grade trend detected: A→C is declining', () => {
    const entries = [
      makeEntry('latest', new Date('2026-06-23'), 'C'),
      makeEntry('earlier', new Date('2026-06-22'), 'A'),
    ]
    const result = parseColonyHealthHistory(entries, 5)
    expect(result[0]?.trend).toBe('declining')
  })
})
