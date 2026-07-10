/**
 * boundary-drift.test.ts — boundary-drift detector for marker-wrapped regions.
 * ACs (from context + description):
 *  1. File whose marker region matches canonical → no findings.
 *  2. File whose marker region differs from canonical → finding with type 'boundary_drift'.
 *  3. File with no markers → no findings (nothing to compare).
 */
import { describe, it, expect } from 'vitest'
import { detectBoundaryDrift, type DriftFinding } from '../core/config/boundary-drift.js'
import { MARKER_START, MARKER_END } from '../core/config/ai-memory-generator.js'

const canonical = 'canonical content here'

function wrap(content: string): string {
  return `preamble\n${MARKER_START}\n${content}\n${MARKER_END}\npostamble`
}

describe('detectBoundaryDrift', () => {
  it('returns no findings when marker region matches canonical', () => {
    const fileContent = wrap(canonical)
    const findings: DriftFinding[] = detectBoundaryDrift(fileContent, canonical)
    expect(findings).toHaveLength(0)
  })

  it('returns boundary_drift finding when region differs from canonical', () => {
    const fileContent = wrap('hand-edited content — different from canonical')
    const findings: DriftFinding[] = detectBoundaryDrift(fileContent, canonical)
    expect(findings).toHaveLength(1)
    expect(findings[0].type).toBe('boundary_drift')
  })

  it('returns no findings when file has no markers', () => {
    const fileContent = 'plain content with no markers at all'
    const findings: DriftFinding[] = detectBoundaryDrift(fileContent, canonical)
    expect(findings).toHaveLength(0)
  })
})
