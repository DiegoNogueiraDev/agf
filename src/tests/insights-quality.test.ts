/*!
 * Task node_1704a7c53ac6 — agf insights quality (burndown por kind)
 *
 * AC1: Given snapshots exist, When insightsQuality called,
 *      Then shows count per kind + delta vs previous snapshot.
 * AC2: Given output, When emitted, Then respects JSON envelope and --select.
 */

import { describe, it, expect } from 'vitest'
import { computeInsightsQuality, type InsightsQualityResult } from '../core/insights/insights-quality.js'
import type { GapsSnapshot } from '../core/gaps/completeness-events.js'

function snap(byKind: Record<string, number>, total = 0): GapsSnapshot {
  const ts = new Date().toISOString()
  return { timestamp: ts, score: 80, grade: 'B', ready: true, total, required: 0, byKind }
}

describe('computeInsightsQuality', () => {
  it('returns empty kinds and zero delta when no snapshots (AC1)', () => {
    const result: InsightsQualityResult = computeInsightsQuality([])
    expect(result.kinds).toEqual({})
    expect(result.delta).toEqual({})
    expect(result.snapshotCount).toBe(0)
  })

  it('returns byKind from latest snapshot and delta vs previous (AC1)', () => {
    const s1 = snap({ missing_ac: 3, missing_nfr: 1 })
    const s2 = snap({ missing_ac: 2, missing_nfr: 2, edge_case: 1 })
    const result = computeInsightsQuality([s1, s2])
    expect(result.kinds).toEqual({ missing_ac: 2, missing_nfr: 2, edge_case: 1 })
    expect(result.delta.missing_ac).toBe(-1) // 2-3
    expect(result.delta.missing_nfr).toBe(1) // 2-1
    expect(result.delta.edge_case).toBe(1) // 1-0
    expect(result.snapshotCount).toBe(2)
  })

  it('returns zero delta when only one snapshot (AC1)', () => {
    const result = computeInsightsQuality([snap({ missing_ac: 5 })])
    expect(result.delta).toEqual({})
    expect(result.kinds.missing_ac).toBe(5)
  })
})
