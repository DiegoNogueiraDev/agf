import { describe, it, expect } from 'vitest'
import { computeRewardStrength } from '../core/economy/reward-strength.js'
import type { RewardSignals } from '../core/economy/reward-strength.js'

function signals(overrides: Partial<RewardSignals> = {}): RewardSignals {
  return {
    tokensSaved: 0,
    harnessDelta: 0,
    acPass: false,
    cycleTimeMs: 0,
    ...overrides,
  }
}

describe('computeRewardStrength — AC1: delegated mode with harness improvement', () => {
  it('returns > 0 when tokens=0 but harnessDelta > 0', () => {
    const strength = computeRewardStrength(signals({ harnessDelta: 5 }))
    expect(strength).toBeGreaterThan(0)
  })

  it('returns > 0 when tokens=0 and acPass=true', () => {
    const strength = computeRewardStrength(signals({ acPass: true }))
    expect(strength).toBeGreaterThan(0)
  })

  it('returns > 0 when tokens > 0 in non-delegated mode', () => {
    const strength = computeRewardStrength(signals({ tokensSaved: 50 }))
    expect(strength).toBeGreaterThan(0)
  })

  it('higher harnessDelta produces higher strength', () => {
    const low = computeRewardStrength(signals({ harnessDelta: 2 }))
    const high = computeRewardStrength(signals({ harnessDelta: 8 }))
    expect(high).toBeGreaterThan(low)
  })

  it('combined signals produce higher strength than any single signal', () => {
    const harness = computeRewardStrength(signals({ harnessDelta: 5 }))
    const ac = computeRewardStrength(signals({ acPass: true }))
    const both = computeRewardStrength(signals({ harnessDelta: 5, acPass: true }))
    expect(both).toBeGreaterThan(harness)
    expect(both).toBeGreaterThan(ac)
  })
})

describe('computeRewardStrength — AC2: no positive signal → deposit 0', () => {
  it('returns 0 when all signals are non-positive (tokens=0, harnessDelta=0, acPass=false)', () => {
    const strength = computeRewardStrength(signals())
    expect(strength).toBe(0)
  })

  it('returns 0 when harnessDelta is negative and no other signal', () => {
    const strength = computeRewardStrength(signals({ harnessDelta: -3 }))
    expect(strength).toBe(0)
  })

  it('returns 0 when tokensSaved is negative', () => {
    const strength = computeRewardStrength(signals({ tokensSaved: -10 }))
    expect(strength).toBe(0)
  })

  it('cycleTimeMs alone (no quality signal) does not produce positive reward', () => {
    // Fast task with zero quality signals should not reward
    const strength = computeRewardStrength(signals({ cycleTimeMs: 60_000 }))
    expect(strength).toBe(0)
  })
})

describe('computeRewardStrength — speed bonus (cycleTimeMs)', () => {
  it('fast task (< 2h) gets a small bonus on top of base reward', () => {
    const noSpeed = computeRewardStrength(signals({ harnessDelta: 5, cycleTimeMs: 0 }))
    const fast = computeRewardStrength(signals({ harnessDelta: 5, cycleTimeMs: 30 * 60 * 1000 })) // 30 min
    expect(fast).toBeGreaterThan(noSpeed)
  })

  it('slow task (> 2h) gets no speed bonus', () => {
    const noSpeed = computeRewardStrength(signals({ harnessDelta: 5, cycleTimeMs: 0 }))
    const slow = computeRewardStrength(signals({ harnessDelta: 5, cycleTimeMs: 3 * 60 * 60 * 1000 })) // 3h
    expect(slow).toBeCloseTo(noSpeed, 5)
  })
})
