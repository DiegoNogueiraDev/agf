import { describe, it, expect } from 'vitest'
import { classifyFindingSeverity, sortFindings, elevateFindings } from '../core/designer/severity-scoring.js'
import type { Finding } from '../core/designer/severity-scoring.js'

describe('classifyFindingSeverity', () => {
  it('returns critical for score < 20', () => {
    expect(classifyFindingSeverity(0)).toBe('critical')
    expect(classifyFindingSeverity(19)).toBe('critical')
  })

  it('returns warning for score 20-59', () => {
    expect(classifyFindingSeverity(20)).toBe('warning')
    expect(classifyFindingSeverity(59)).toBe('warning')
  })

  it('returns info for score >= 60', () => {
    expect(classifyFindingSeverity(60)).toBe('info')
    expect(classifyFindingSeverity(100)).toBe('info')
  })
})

describe('sortFindings', () => {
  it('puts critical first, then warning, then info', () => {
    const findings: Finding[] = [
      { message: 'info finding', source: 'fitness', dimension: 'general', severity: 'info' },
      { message: 'critical finding', source: 'jtbd', dimension: 'friction', severity: 'critical' },
      { message: 'warning finding', source: 'premortem', dimension: 'reversibility', severity: 'warning' },
    ]
    const sorted = sortFindings(findings)
    expect(sorted[0]?.severity).toBe('critical')
    expect(sorted[1]?.severity).toBe('warning')
    expect(sorted[2]?.severity).toBe('info')
  })

  it('does not mutate the original array', () => {
    const findings: Finding[] = [{ message: 'a', source: 'fitness', dimension: 'general', severity: 'info' }]
    const sorted = sortFindings(findings)
    expect(sorted).not.toBe(findings)
  })
})

describe('elevateFindings', () => {
  it('elevates friction/optimality findings to critical when composite < 40', () => {
    const findings: Finding[] = [
      { message: 'friction issue', source: 'fitness', dimension: 'friction', severity: 'warning' },
      { message: 'optimality issue', source: 'jtbd', dimension: 'optimality', severity: 'info' },
    ]
    const elevated = elevateFindings(findings, 30)
    expect(elevated[0]?.severity).toBe('critical')
    expect(elevated[1]?.severity).toBe('critical')
  })

  it('does not elevate when composite >= 40', () => {
    const findings: Finding[] = [
      { message: 'friction issue', source: 'fitness', dimension: 'friction', severity: 'warning' },
    ]
    const elevated = elevateFindings(findings, 40)
    expect(elevated[0]?.severity).toBe('warning')
  })

  it('does not elevate non-elevatable dimensions', () => {
    const findings: Finding[] = [
      { message: 'reversibility issue', source: 'premortem', dimension: 'reversibility', severity: 'warning' },
    ]
    const elevated = elevateFindings(findings, 10)
    expect(elevated[0]?.severity).toBe('warning')
  })
})
