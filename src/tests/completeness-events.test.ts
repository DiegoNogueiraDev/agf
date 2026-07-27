import { describe, it, expect } from 'vitest'
import { formatGapsHistory } from '../core/gaps/completeness-events.js'
import type { GapsSnapshot } from '../core/gaps/completeness-events.js'

function makeSnap(overrides: Partial<GapsSnapshot> = {}): GapsSnapshot {
  return {
    timestamp: '2026-06-23T00:00:00.000Z',
    score: 80,
    grade: 'B',
    ready: false,
    total: 5,
    required: 2,
    byKind: {},
    ...overrides,
  }
}

describe('formatGapsHistory', () => {
  it('returns a string', () => {
    expect(typeof formatGapsHistory([])).toBe('string')
  })

  it('returns message when no snapshots', () => {
    const result = formatGapsHistory([])
    expect(result).toContain('sem histórico')
  })

  it('mentions agf gaps command when empty', () => {
    expect(formatGapsHistory([])).toContain('agf gaps')
  })

  it('formats a single snapshot', () => {
    const result = formatGapsHistory([makeSnap({ score: 75, grade: 'C', total: 3, required: 1 })])
    expect(result).toContain('75')
    expect(result).toContain('C')
    expect(result).toContain('3')
  })

  it('shows delta when two or more snapshots', () => {
    const snaps = [
      makeSnap({ score: 60, total: 10, required: 4 }),
      makeSnap({ score: 80, total: 5, required: 1, timestamp: '2026-06-24T00:00:00.000Z' }),
    ]
    const result = formatGapsHistory(snaps)
    expect(result).toContain('Δ score')
    expect(result).toContain('+20')
  })

  it('shows negative delta', () => {
    const snaps = [
      makeSnap({ score: 90, total: 2 }),
      makeSnap({ score: 70, total: 8, timestamp: '2026-06-24T00:00:00.000Z' }),
    ]
    const result = formatGapsHistory(snaps)
    expect(result).toContain('-20')
  })

  it('includes snapshot count in header', () => {
    const snaps = [makeSnap(), makeSnap({ timestamp: '2026-06-24T00:00:00.000Z' })]
    const result = formatGapsHistory(snaps)
    expect(result).toContain('2 snapshot')
  })

  it('includes timestamp in each row', () => {
    const result = formatGapsHistory([makeSnap({ timestamp: '2026-06-23T00:00:00.000Z' })])
    expect(result).toContain('2026-06-23')
  })

  it('includes required count in each row', () => {
    const result = formatGapsHistory([makeSnap({ required: 7 })])
    expect(result).toContain('req 7')
  })
})
