/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildGapReport, formatGapsHuman, type Gap, type GapKind, type GapSeverity } from '../core/gaps/index.js'

function makeGap(kind: GapKind, severity: GapSeverity, i = 0): Gap {
  return {
    kind,
    severity,
    nodeId: `n${i}`,
    evidence: `evidence ${i}`,
    enrichment: { action: 'annotate', instruction: 'do X', applyVia: [`agf node update n${i}`] },
  }
}

describe('formatGapsHuman', () => {
  it('empty report → COMPLETO, no gaps', () => {
    const out = formatGapsHuman(buildGapReport([]))
    expect(out).toContain('✓ COMPLETO')
    expect(out).toContain('(sem lacunas)')
  })

  it('groups by kind with counts and shows applyVia', () => {
    const report = buildGapReport([makeGap('weak_ac_testability', 'recommended', 1)])
    const out = formatGapsHuman(report)
    expect(out).toContain('weak_ac_testability (1):')
    expect(out).toContain('$ agf node update n1')
  })

  it('caps per kind at --limit and shows the dropped count', () => {
    const gaps = Array.from({ length: 20 }, (_, i) => makeGap('weak_ac_testability', 'recommended', i))
    const out = formatGapsHuman(buildGapReport(gaps), { limit: 5 })
    expect(out).toContain('weak_ac_testability (20):')
    expect(out).toContain('… +15 mais')
    // only 5 evidence lines rendered
    expect(out.match(/evidence \d+/g)?.length).toBe(5)
  })

  it('--severity filters the human view (score still reflects all gaps)', () => {
    const report = buildGapReport([
      makeGap('traceability_break', 'required', 1),
      makeGap('weak_ac_testability', 'recommended', 2),
    ])
    const out = formatGapsHuman(report, { severity: 'required' })
    expect(out).toContain('traceability_break (1):')
    expect(out).not.toContain('weak_ac_testability')
    // header score unchanged (computed over all gaps)
    expect(out).toContain(`score ${report.score}`)
  })

  it('--severity with no matches says so', () => {
    const report = buildGapReport([makeGap('weak_ac_testability', 'recommended', 1)])
    expect(formatGapsHuman(report, { severity: 'required' })).toContain("(sem lacunas 'required')")
  })
})
