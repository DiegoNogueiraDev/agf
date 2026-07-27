import { describe, it, expect } from 'vitest'
import { calibrateThreshold, type CalibrationEvent } from '../core/rag-in/calibrate.js'

// Low-score band loses (negative/zero net, errs); high-score band pays.
const events: CalibrationEvent[] = [
  // score 0.1–0.3: retrieval barely saved and got reverted → does not pay
  { score: 0.15, saved: 5, accepted: false },
  { score: 0.2, saved: 0, accepted: false },
  { score: 0.25, saved: 8, accepted: false },
  // score 0.5–0.7: pays clearly
  { score: 0.55, saved: 60, accepted: true },
  { score: 0.6, saved: 80, accepted: true },
  { score: 0.7, saved: 70, accepted: true },
  // score 0.9+: pays
  { score: 0.95, saved: 120, accepted: true },
]

describe('calibrateThreshold', () => {
  it('recommends raising the threshold past the band that does not pay', () => {
    const r = calibrateThreshold(events, { defaultThreshold: 0.5, bandWidth: 0.2 })
    // the 0.1–0.3 band loses → recommended threshold should exclude it
    expect(r.recommended).toBeGreaterThan(0.3)
  })

  it('returns the default when there are no events (cannot calibrate blindly)', () => {
    const r = calibrateThreshold([], { defaultThreshold: 0.5 })
    expect(r.recommended).toBe(0.5)
    expect(r.bands).toHaveLength(0)
    expect(r.reason).toMatch(/no.?data|insufficient/i)
  })

  it('reports per-band economics (meanSaved + acceptance)', () => {
    const r = calibrateThreshold(events, { defaultThreshold: 0.5, bandWidth: 0.2 })
    expect(r.bands.length).toBeGreaterThan(0)
    const paying = r.bands.find((b) => b.meanSaved > 50)
    expect(paying).toBeDefined()
    expect(paying!.acceptanceRate).toBeGreaterThan(0)
    expect(paying!.count).toBeGreaterThan(0)
  })

  it('does not recommend below the lowest paying band', () => {
    const r = calibrateThreshold(events, { defaultThreshold: 0.5, bandWidth: 0.2 })
    const lowestPaying = r.bands
      .filter((b) => b.meanSaved > 0 && b.acceptanceRate >= 0.5)
      .sort((a, b) => a.lo - b.lo)[0]
    if (lowestPaying) expect(r.recommended).toBeLessThanOrEqual(lowestPaying.lo + 0.001)
  })

  it('ignores events without a score (cannot place them in a band)', () => {
    const mixed: CalibrationEvent[] = [...events, { score: null, saved: 999, accepted: true }]
    const r = calibrateThreshold(mixed, { defaultThreshold: 0.5, bandWidth: 0.2 })
    const total = r.bands.reduce((s, b) => s + b.count, 0)
    expect(total).toBe(events.length)
  })
})
