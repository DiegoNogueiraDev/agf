/*!
 * Tests for quality-snapshot.ts — formatQualityTrend pure formatter.
 *
 * formatQualityTrend(trend: QualityTrend): string is pure (no I/O, no DB).
 * Covers: first snapshot (no previous), snapshot with previous, delta display,
 * severity line, alerts, and no-regression line.
 */

import { describe, it, expect } from 'vitest'
import { formatQualityTrend } from '../core/harness/quality-snapshot.js'
import type { QualityTrend, QualitySnapshot } from '../core/harness/quality-snapshot.js'

function makeSnapshot(overrides: Partial<QualitySnapshot> = {}): QualitySnapshot {
  return {
    ts: '2026-06-23T00:00:00.000Z',
    harnessScore: 88,
    harnessGrade: 'A',
    testScore: 75,
    logScore: 80,
    totalModules: 100,
    ...overrides,
  }
}

function makeTrend(overrides: Partial<QualityTrend> = {}): QualityTrend {
  return {
    current: makeSnapshot(),
    previous: null,
    harnessDelta: null,
    testDelta: null,
    logDelta: null,
    severity: 'stable',
    alerts: [],
    ...overrides,
  }
}

// ── baseline (first snapshot, no previous) ───────────────────────────────────

describe('formatQualityTrend — first snapshot', () => {
  it('includes the Quality Snapshot header', () => {
    const out = formatQualityTrend(makeTrend())
    expect(out).toContain('Quality Snapshot')
  })

  it('includes score, grade, test%, and log% on the score line', () => {
    const out = formatQualityTrend(makeTrend())
    expect(out).toContain('88/100')
    expect(out).toContain('(A)')
    expect(out).toContain('75%')
    expect(out).toContain('80%')
  })

  it('includes total modules count', () => {
    const out = formatQualityTrend(makeTrend())
    expect(out).toContain('100')
  })

  it('shows "first snapshot" message when previous is null', () => {
    const out = formatQualityTrend(makeTrend({ previous: null }))
    expect(out.toLowerCase()).toContain('primeiro snapshot')
  })
})

// ── with previous snapshot ────────────────────────────────────────────────────

describe('formatQualityTrend — with previous snapshot', () => {
  const prev = makeSnapshot({ ts: '2026-06-22T00:00:00.000Z', harnessScore: 80, testScore: 70, logScore: 75 })

  it('includes previous timestamp in output', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: 8,
      testDelta: 5,
      logDelta: 5,
      severity: 'improving',
      alerts: [],
    })
    const out = formatQualityTrend(trend)
    expect(out).toContain('2026-06-22')
  })

  it('includes delta values with sign prefix', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: 8.0,
      testDelta: 5,
      logDelta: 5,
      severity: 'improving',
      alerts: [],
    })
    const out = formatQualityTrend(trend)
    expect(out).toContain('+8.0')
    expect(out).toContain('+5%')
  })

  it('includes negative delta with minus sign for regression', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: -3.5,
      testDelta: -10,
      logDelta: 0,
      severity: 'warning',
      alerts: ['Test coverage regressed by 10%'],
    })
    const out = formatQualityTrend(trend)
    expect(out).toContain('-3.5')
    expect(out).toContain('-10%')
  })

  it('includes severity in output', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: -3.5,
      testDelta: -10,
      logDelta: 0,
      severity: 'warning',
      alerts: [],
    })
    const out = formatQualityTrend(trend)
    expect(out).toContain('warning')
  })
})

// ── alerts ────────────────────────────────────────────────────────────────────

describe('formatQualityTrend — alerts', () => {
  const prev = makeSnapshot({ ts: '2026-06-22T00:00:00.000Z' })

  it('includes alert text when alerts are present', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: -5,
      testDelta: -15,
      logDelta: 0,
      severity: 'alert',
      alerts: ['Critical regression: test coverage dropped 15%'],
    })
    const out = formatQualityTrend(trend)
    expect(out).toContain('Critical regression')
  })

  it('shows no-regression line when alerts is empty with previous', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: 2,
      testDelta: 3,
      logDelta: 1,
      severity: 'improving',
      alerts: [],
    })
    const out = formatQualityTrend(trend)
    expect(out.toLowerCase()).toContain('sem regressões')
  })

  it('does not show no-regression line when alerts are present', () => {
    const trend = makeTrend({
      previous: prev,
      harnessDelta: -2,
      testDelta: -5,
      logDelta: 0,
      severity: 'warning',
      alerts: ['Regression detected'],
    })
    const out = formatQualityTrend(trend)
    expect(out.toLowerCase()).not.toContain('sem regressões')
  })
})

// ── null deltas shown as "?" ──────────────────────────────────────────────────

describe('formatQualityTrend — null deltas', () => {
  it('renders null deltas as "?" in output', () => {
    const prev = makeSnapshot({ ts: '2026-06-22T00:00:00.000Z' })
    const trend = makeTrend({
      previous: prev,
      harnessDelta: null,
      testDelta: null,
      logDelta: null,
      severity: 'stable',
      alerts: [],
    })
    const out = formatQualityTrend(trend)
    expect(out).toContain('?')
  })
})
