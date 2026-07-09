/*!
 * TDD: presentInAgf provenance — each insight with presentInAgf=true cites agfModule (node_65bb4a98fb82).
 *
 * AC: Given um scan de repos, When o report é gerado,
 *     Then capabilities presentes no agf citam o módulo/comando agf que as entrega.
 */

import { describe, it, expect } from 'vitest'
import type { Insight, ScanResult } from '../core/scan/repo-scanner.js'
import { renderReport } from '../core/scan/insight-report.js'

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    repo: 'test-repo',
    capability: 'content-router',
    label: 'Content router',
    insight: 'Route by content type',
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    presentInAgf: false,
    ...overrides,
  }
}

function makeResult(insights: Insight[]): ScanResult {
  return {
    root: '/tmp/repos',
    repos: [],
    insights,
    summary: {
      repoCount: 1,
      scannedCount: 1,
      insightCount: insights.length,
      uniqueGapCount: insights.filter((i) => !i.presentInAgf).length,
      byPillar: { 'token-cost': 1, swe: 0, speed: 0 },
    },
  }
}

describe('scan provenance in insight report', () => {
  it('renders agfModule in report when presentInAgf and agfModule provided', () => {
    const insights: Insight[] = [makeInsight({ presentInAgf: true, agfModule: 'src/core/gateway/content-router.ts' })]
    const report = renderReport(makeResult(insights))
    expect(report).toContain('content-router.ts')
  })

  it('renders gap rows for insights without presentInAgf (false)', () => {
    const insights: Insight[] = [makeInsight({ presentInAgf: false })]
    const report = renderReport(makeResult(insights))
    // Gaps section should include the label
    expect(report).toContain('Content router')
  })

  it('agfModule is optional — no crash when undefined', () => {
    const insights: Insight[] = [makeInsight({ presentInAgf: false, agfModule: undefined })]
    expect(() => renderReport(makeResult(insights))).not.toThrow()
  })
})
