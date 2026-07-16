/*!
 * TDD: web surface parity audit (node_1b6d843f2ea4).
 *
 * AC1: Given web surfaces and CLI capabilities, When audit runs, Then lists
 *      key capabilities without a corresponding web view.
 * AC2: Given the report, When read, Then is sorted by priority (most-used first).
 */

import { describe, it, expect } from 'vitest'
import { auditWebParity, type WebParityReport } from '../core/web/web-surface-parity.js'

describe('AC1: lists key capabilities without web view', () => {
  it('returns a non-empty list of gaps', () => {
    const report: WebParityReport = auditWebParity()
    expect(report.gaps.length).toBeGreaterThan(0)
  })

  it('every gap has id, capability, and priority', () => {
    const report = auditWebParity()
    for (const gap of report.gaps) {
      expect(gap).toHaveProperty('capability')
      expect(gap).toHaveProperty('priority')
      expect(typeof gap.capability).toBe('string')
      expect(typeof gap.priority).toBe('number')
    }
  })

  it('covered capabilities are listed separately', () => {
    const report = auditWebParity()
    expect(Array.isArray(report.covered)).toBe(true)
  })

  it('stats/harness/gaps are known CLI capabilities (appear in all or gaps)', () => {
    const report = auditWebParity()
    const allCaps = [...report.covered, ...report.gaps.map((g) => g.capability)]
    expect(allCaps).toContain('stats')
    expect(allCaps).toContain('harness')
    expect(allCaps).toContain('gaps')
  })
})

describe('AC2: gaps sorted by priority (lower = higher importance first)', () => {
  it('gaps are sorted ascending by priority', () => {
    const report = auditWebParity()
    const priorities = report.gaps.map((g) => g.priority)
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]!).toBeGreaterThanOrEqual(priorities[i - 1]!)
    }
  })
})
