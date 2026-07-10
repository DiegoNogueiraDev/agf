/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeEstimateDelta, formatCalibrationReport } from '../core/analyzer/estimate-calibration-analyzer.js'

describe('computeEstimateDelta', () => {
  it('returns positive delta when over estimate', () => {
    const delta = computeEstimateDelta(5, 120) // 5h actual vs 2h estimate
    expect(delta).toBe(3)
  })

  it('returns negative delta when under estimate', () => {
    const delta = computeEstimateDelta(1, 120) // 1h actual vs 2h estimate
    expect(delta).toBe(-1)
  })

  it('returns 0 when actual matches estimate', () => {
    const delta = computeEstimateDelta(2, 120) // 2h actual vs 2h estimate
    expect(delta).toBe(0)
  })

  it('returns null when estimateMinutes is undefined', () => {
    expect(computeEstimateDelta(2, undefined)).toBeNull()
  })

  it('returns null when estimateMinutes is 0', () => {
    expect(computeEstimateDelta(2, 0)).toBeNull()
  })

  it('returns null when estimateMinutes is negative', () => {
    expect(computeEstimateDelta(2, -30)).toBeNull()
  })

  it('returns null when completionHours is 0', () => {
    expect(computeEstimateDelta(0, 120)).toBeNull()
  })

  it('returns null when completionHours is negative', () => {
    expect(computeEstimateDelta(-1, 120)).toBeNull()
  })

  it('returns null when completionHours is undefined', () => {
    // @ts-expect-error testing runtime nullish behavior
    expect(computeEstimateDelta(undefined, 120)).toBeNull()
  })
})

describe('formatCalibrationReport', () => {
  it('formats a report with multiple sizes', () => {
    const report = {
      XS: { avg_delta: 0.5, bias_pct: 10, confidence: 'high' as const, count: 15, estimateHours: 0.5 },
      M: { avg_delta: -0.2, bias_pct: -5, confidence: 'medium' as const, count: 7, estimateHours: 4 },
    }
    const output = formatCalibrationReport(report)
    expect(output).toContain('XS')
    expect(output).toContain('M')
    expect(output).toContain('avg_delta=+0.5h')
    expect(output).toContain('avg_delta=-0.2h')
  })

  it('returns fallback message when report is empty', () => {
    expect(formatCalibrationReport({})).toBe('No calibration data yet.')
  })

  it('skips sizes with no entry', () => {
    const report = { L: { avg_delta: 1, bias_pct: 20, confidence: 'low' as const, count: 2, estimateHours: 5 } }
    const output = formatCalibrationReport(report)
    expect(output).not.toContain('XS')
    expect(output).not.toContain('S')
    expect(output).not.toContain('M')
    expect(output).toContain('L')
    expect(output).not.toContain('XL')
  })
})
