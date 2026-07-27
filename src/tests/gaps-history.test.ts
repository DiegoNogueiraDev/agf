/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  recordGapsSnapshot,
  getGapsHistory,
  formatGapsHistory,
  buildGapReport,
  type Gap,
  type GapKind,
  type GapSeverity,
  type GapsSnapshot,
} from '../core/gaps/index.js'

function makeGap(kind: GapKind, severity: GapSeverity): Gap {
  return { kind, severity, evidence: 'e', enrichment: { action: 'annotate', instruction: 'x', applyVia: ['agf x'] } }
}

describe('M10 — completeness timeline (event-store)', () => {
  it('records a snapshot and reads it back', async () => {
    const store = SqliteStore.open(':memory:')
    try {
      const report = buildGapReport([
        makeGap('traceability_break', 'required'),
        makeGap('weak_ac_testability', 'recommended'),
      ])
      await recordGapsSnapshot(store.getDb(), report)
      const hist = getGapsHistory(store.getDb())
      expect(hist).toHaveLength(1)
      expect(hist[0].total).toBe(2)
      expect(hist[0].required).toBe(1)
      expect(hist[0].score).toBe(report.score)
      expect(hist[0].grade).toBe(report.grade)
      expect(hist[0].byKind.traceability_break).toBe(1)
    } finally {
      store.close()
    }
  })

  it('accumulates multiple snapshots (an improving completeness trend)', async () => {
    const store = SqliteStore.open(':memory:')
    try {
      await recordGapsSnapshot(store.getDb(), buildGapReport([makeGap('traceability_break', 'required')]))
      await recordGapsSnapshot(store.getDb(), buildGapReport([])) // gap closed
      const hist = getGapsHistory(store.getDb())
      expect(hist).toHaveLength(2)
      expect(hist.some((s) => !s.ready)).toBe(true) // the first
      expect(hist.some((s) => s.ready && s.total === 0)).toBe(true) // the improved one
    } finally {
      store.close()
    }
  })

  it('empty history → helpful message', () => {
    expect(formatGapsHistory([])).toContain('sem histórico')
  })

  it('formatGapsHistory renders timeline + Δ score', () => {
    const snaps: GapsSnapshot[] = [
      { timestamp: '2026-06-15T01:00:00Z', score: 0, grade: 'F', ready: false, total: 100, required: 10, byKind: {} },
      { timestamp: '2026-06-15T09:00:00Z', score: 50, grade: 'C', ready: true, total: 40, required: 0, byKind: {} },
    ]
    const out = formatGapsHistory(snaps)
    expect(out).toContain('timeline (2 snapshot')
    expect(out).toContain('score   0  F  total 100 (req 10)')
    expect(out).toContain('Δ score: +50')
  })
})
