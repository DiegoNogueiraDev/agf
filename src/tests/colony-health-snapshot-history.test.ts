/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_5152b7ea830e AC coverage: colony-health snapshot history
 *
 * AC: agf done <id> grava colony-health-snapshot-<date> em agf memory
 * AC: snapshots mantidos por 30 dias (agf gc prune os mais antigos)
 * AC: agf colony-health --history mostra trend dos últimos 7 snapshots
 */

import { describe, it, expect } from 'vitest'
import {
  buildColonyHealthMemoryName,
  pruneColonyHealthSnapshots,
  parseColonyHealthHistory,
  type ColonyHealthMemoryEntry,
} from '../core/colony/colony-health-history.js'

// ── buildColonyHealthMemoryName ────────────────────────────────────────────────

describe('buildColonyHealthMemoryName', () => {
  it('returns a name starting with colony-health-snapshot-', () => {
    const name = buildColonyHealthMemoryName(new Date('2026-06-23T10:00:00Z'))
    expect(name.startsWith('colony-health-snapshot-')).toBe(true)
  })

  it('includes date in name (YYYY-MM-DD format)', () => {
    const name = buildColonyHealthMemoryName(new Date('2026-06-23T10:00:00Z'))
    expect(name).toContain('2026-06-23')
  })
})

// ── pruneColonyHealthSnapshots ─────────────────────────────────────────────────

describe('pruneColonyHealthSnapshots', () => {
  function makeMemory(name: string, daysAgo: number): ColonyHealthMemoryEntry {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    return { name, date, grade: 'A', content: `{"grade":"A","date":"${date.toISOString()}"}` }
  }

  it('returns empty pruned list when no snapshots are old enough', () => {
    const entries = [
      makeMemory('colony-health-snapshot-2026-06-23', 5),
      makeMemory('colony-health-snapshot-2026-06-22', 10),
    ]
    const result = pruneColonyHealthSnapshots(entries, 30)
    expect(result.pruned).toHaveLength(0)
  })

  it('returns snapshots older than retention days', () => {
    const entries = [
      makeMemory('colony-health-snapshot-2026-05-01', 50),
      makeMemory('colony-health-snapshot-2026-06-23', 5),
    ]
    const result = pruneColonyHealthSnapshots(entries, 30)
    expect(result.pruned).toHaveLength(1)
    expect(result.pruned[0]).toContain('2026-05-01')
  })

  it('returns all names older than retention days', () => {
    const entries = [
      makeMemory('colony-health-snapshot-old-1', 35),
      makeMemory('colony-health-snapshot-old-2', 40),
      makeMemory('colony-health-snapshot-recent', 2),
    ]
    const result = pruneColonyHealthSnapshots(entries, 30)
    expect(result.pruned).toHaveLength(2)
    expect(result.kept).toHaveLength(1)
  })
})

// ── parseColonyHealthHistory ───────────────────────────────────────────────────

describe('parseColonyHealthHistory', () => {
  function makeEntry(grade: string, daysAgo: number): ColonyHealthMemoryEntry {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    return {
      name: `colony-health-snapshot-${date.toISOString().slice(0, 10)}`,
      date,
      grade,
      content: JSON.stringify({ grade, date: date.toISOString(), caste: 'TRAIL' }),
    }
  }

  it('returns last 7 entries sorted by date desc', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry('A', i))
    const history = parseColonyHealthHistory(entries, 7)
    expect(history).toHaveLength(7)
  })

  it('includes grade field in each entry', () => {
    const entries = [makeEntry('A', 1), makeEntry('B', 2), makeEntry('C', 3)]
    const history = parseColonyHealthHistory(entries, 7)
    expect(history.every((e) => e.grade !== undefined)).toBe(true)
  })

  it('detects declining trend', () => {
    const entries = [makeEntry('A', 6), makeEntry('B', 5), makeEntry('C', 4), makeEntry('D', 3)]
    const history = parseColonyHealthHistory(entries, 7)
    expect(history[0].trend).toBe('declining')
  })

  it('detects stable trend when grades do not change', () => {
    const entries = [makeEntry('B', 3), makeEntry('B', 2), makeEntry('B', 1)]
    const history = parseColonyHealthHistory(entries, 7)
    expect(history.every((e) => e.trend === 'stable')).toBe(true)
  })

  it('detects improving trend', () => {
    const entries = [makeEntry('D', 2), makeEntry('C', 1)]
    const history = parseColonyHealthHistory(entries, 7)
    expect(history[0].trend).toBe('improving')
  })

  it('returns entries in date desc order (most recent first)', () => {
    const entries = [makeEntry('A', 5), makeEntry('B', 2), makeEntry('C', 8)]
    const history = parseColonyHealthHistory(entries, 7)
    expect(history[0].grade).toBe('B')
    expect(history[1].grade).toBe('A')
    expect(history[2].grade).toBe('C')
  })
})
