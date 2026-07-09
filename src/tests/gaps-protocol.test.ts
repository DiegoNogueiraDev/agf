/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  buildGapReport,
  gapGradeFromScore,
  detectAllGaps,
  GAP_KINDS,
  type Gap,
  type GapKind,
  type GapSeverity,
} from '../core/gaps/index.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeGap(kind: GapKind, severity: GapSeverity): Gap {
  return {
    kind,
    severity,
    evidence: 'evidence',
    enrichment: { action: 'annotate', instruction: 'do X', applyVia: ['agf node update <id>'] },
  }
}

describe('gap protocol — buildGapReport', () => {
  it('empty → ready, score 100, grade A, no gaps', () => {
    const r = buildGapReport([])
    expect(r.ready).toBe(true)
    expect(r.score).toBe(100)
    expect(r.grade).toBe('A')
    expect(r.gaps).toEqual([])
    expect(r.summary).toContain('completo')
  })

  it('a single required gap → not ready, score 85', () => {
    const r = buildGapReport([makeGap('traceability_break', 'required')])
    expect(r.ready).toBe(false)
    expect(r.score).toBe(85)
    expect(r.byKind.traceability_break).toBe(1)
  })

  it('recommended-only gaps → still ready, penalized score', () => {
    const r = buildGapReport([makeGap('missing_edge_case', 'recommended'), makeGap('estimate_drift', 'recommended')])
    expect(r.ready).toBe(true)
    expect(r.score).toBe(94)
  })

  it('byKind is zero-filled for every kind', () => {
    const r = buildGapReport([])
    for (const k of GAP_KINDS) expect(r.byKind[k]).toBe(0)
  })

  it('score floors at 0', () => {
    const many = Array.from({ length: 10 }, () => makeGap('ac_coverage_break', 'required'))
    expect(buildGapReport(many).score).toBe(0)
    expect(buildGapReport(many).grade).toBe('F')
  })
})

describe('gapGradeFromScore', () => {
  it('honours A/B/C/D/F thresholds', () => {
    expect(gapGradeFromScore(90)).toBe('A')
    expect(gapGradeFromScore(70)).toBe('B')
    expect(gapGradeFromScore(55)).toBe('C')
    expect(gapGradeFromScore(40)).toBe('D')
    expect(gapGradeFromScore(10)).toBe('F')
  })
})

describe('detectAllGaps', () => {
  it('M0: empty detector registry returns no gaps', () => {
    const doc = { nodes: [], edges: [] } as unknown as GraphDocument
    expect(detectAllGaps(doc)).toEqual([])
  })
})
