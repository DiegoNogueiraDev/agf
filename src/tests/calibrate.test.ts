import { describe, it, expect } from 'vitest'
import { calibrateThreshold } from '../core/rag-in/calibrate.js'
import type { CalibrationEvent } from '../core/rag-in/calibrate.js'

describe('calibrateThreshold', () => {
  it('returns default threshold when no scored events', () => {
    const result = calibrateThreshold([])
    expect(result.recommended).toBe(0.5)
    expect(result.reason).toBe('insufficient_data')
    expect(result.bands).toEqual([])
  })

  it('filters out events with null score', () => {
    const events: CalibrationEvent[] = [
      { score: null, saved: 10, accepted: true },
      { score: null, saved: 5, accepted: false },
    ]
    const result = calibrateThreshold(events)
    expect(result.reason).toBe('insufficient_data')
  })

  it('returns the lowest paying band threshold', () => {
    const events: CalibrationEvent[] = [
      { score: 0.8, saved: 5, accepted: true },
      { score: 0.8, saved: 5, accepted: true },
      { score: 0.9, saved: 10, accepted: true },
      { score: 0.9, saved: 10, accepted: true },
    ]
    const result = calibrateThreshold(events)
    expect(result.recommended).toBeGreaterThan(0)
    expect(result.bands.length).toBeGreaterThan(0)
  })

  it('respects custom defaultThreshold when no data', () => {
    const result = calibrateThreshold([], { defaultThreshold: 0.7 })
    expect(result.recommended).toBe(0.7)
  })

  it('uses minMeanSaved and minAcceptance to determine if a band pays', () => {
    const events: CalibrationEvent[] = [
      { score: 0.5, saved: 0, accepted: true },
      { score: 0.5, saved: 0, accepted: true },
    ]
    // saved=0 < minMeanSaved=1 (default) → band does not pay
    const result = calibrateThreshold(events)
    expect(result.bands.every((b) => !b.pays)).toBe(true)
  })

  it('includes band metadata in result', () => {
    const events: CalibrationEvent[] = [
      { score: 0.6, saved: 5, accepted: true },
      { score: 0.6, saved: 5, accepted: true },
    ]
    const result = calibrateThreshold(events, { bandWidth: 0.5, minAcceptance: 0.5, minMeanSaved: 1 })
    const band = result.bands.find((b) => b.count > 0)
    expect(band).toBeDefined()
    expect(band?.meanSaved).toBe(5)
    expect(band?.acceptanceRate).toBe(1)
  })
})
