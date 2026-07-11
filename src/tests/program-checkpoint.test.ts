/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: program-checkpoint.ts
 *
 * AC1: GIVEN 10th program task done WHEN agf done THEN output includes
 *      programCheckpoint: { tasksCompleted: 10, harnessDelta, qualityDelta, comparedToBaseline }
 * AC2: GIVEN checkpoint detects regression WHEN emitted
 *      THEN warning visible with regressed dimension
 * AC3: GIVEN checkpoint without saved baseline WHEN triggered
 *      THEN warning emitted + suggests running Task 1.1
 */

import { describe, it, expect } from 'vitest'
import { computeProgramCheckpoint, shouldEmitCheckpoint } from '../core/quality/program-checkpoint.js'

// ── shouldEmitCheckpoint ──────────────────────────────────────────────────────

describe('shouldEmitCheckpoint', () => {
  it('returns false for 0 tasks done', () => {
    expect(shouldEmitCheckpoint(0)).toBe(false)
  })

  it('returns false for non-multiples of 10', () => {
    expect(shouldEmitCheckpoint(1)).toBe(false)
    expect(shouldEmitCheckpoint(9)).toBe(false)
    expect(shouldEmitCheckpoint(11)).toBe(false)
    expect(shouldEmitCheckpoint(15)).toBe(false)
    expect(shouldEmitCheckpoint(19)).toBe(false)
  })

  it('returns true at 10 (AC1)', () => {
    expect(shouldEmitCheckpoint(10)).toBe(true)
  })

  it('returns true at 20, 30, 40, 50', () => {
    expect(shouldEmitCheckpoint(20)).toBe(true)
    expect(shouldEmitCheckpoint(30)).toBe(true)
    expect(shouldEmitCheckpoint(50)).toBe(true)
  })

  it('returns true at 100', () => {
    expect(shouldEmitCheckpoint(100)).toBe(true)
  })
})

// ── computeProgramCheckpoint ──────────────────────────────────────────────────

describe('computeProgramCheckpoint: non-checkpoint counts', () => {
  it('returns null when tasksCompleted is not a multiple of 10', () => {
    expect(computeProgramCheckpoint(9, null, null)).toBeNull()
    expect(computeProgramCheckpoint(11, null, null)).toBeNull()
    expect(computeProgramCheckpoint(0, null, null)).toBeNull()
  })
})

describe('AC3: no baseline → warning about missing baseline', () => {
  it('returns checkpoint with comparedToBaseline=false when no baseline (AC3)', () => {
    const cp = computeProgramCheckpoint(10, null, null)
    expect(cp).not.toBeNull()
    expect(cp!.comparedToBaseline).toBe(false)
  })

  it('tasksCompleted matches input when milestone hit (AC1)', () => {
    const cp = computeProgramCheckpoint(10, null, null)
    expect(cp!.tasksCompleted).toBe(10)
  })

  it('harnessDelta is null when no baseline (AC3)', () => {
    const cp = computeProgramCheckpoint(10, null, null)
    expect(cp!.harnessDelta).toBeNull()
  })

  it('warning field is set when no baseline (AC3)', () => {
    const cp = computeProgramCheckpoint(10, null, null)
    expect(typeof cp!.warning).toBe('string')
    expect(cp!.warning!.length).toBeGreaterThan(0)
  })

  it('warning mentions baseline capture when no baseline (AC3)', () => {
    const cp = computeProgramCheckpoint(10, null, null)
    expect(cp!.warning!.toLowerCase()).toMatch(/baseline|harness|task.*1\.1/i)
  })

  it('qualityDelta is null when no baseline (AC3)', () => {
    const cp = computeProgramCheckpoint(10, null, null)
    expect(cp!.qualityDelta).toBeNull()
  })
})

describe('AC1: tasksCompleted, harnessDelta, qualityDelta, comparedToBaseline in output', () => {
  it('includes all required fields when baseline present (AC1)', () => {
    const cp = computeProgramCheckpoint(10, 80, 75)
    expect(cp).not.toBeNull()
    expect('tasksCompleted' in cp!).toBe(true)
    expect('harnessDelta' in cp!).toBe(true)
    expect('qualityDelta' in cp!).toBe(true)
    expect('comparedToBaseline' in cp!).toBe(true)
  })

  it('comparedToBaseline=true when both scores provided', () => {
    const cp = computeProgramCheckpoint(10, 80, 75)
    expect(cp!.comparedToBaseline).toBe(true)
  })

  it('harnessDelta = currentScore - baselineScore (AC1)', () => {
    const cp = computeProgramCheckpoint(10, 82, 75)
    expect(cp!.harnessDelta).toBe(7) // 82 - 75
  })

  it('tasksCompleted is 20 at next milestone', () => {
    const cp = computeProgramCheckpoint(20, 85, 80)
    expect(cp!.tasksCompleted).toBe(20)
  })

  it('positive harnessDelta means improvement', () => {
    const cp = computeProgramCheckpoint(10, 90, 70)
    expect(cp!.harnessDelta!).toBeGreaterThan(0)
  })
})

describe('AC2: regression detection → visible warning', () => {
  it('sets warning when harness dropped vs baseline (AC2)', () => {
    const cp = computeProgramCheckpoint(10, 65, 75) // dropped 10 points
    expect(typeof cp!.warning).toBe('string')
    expect(cp!.warning!.length).toBeGreaterThan(0)
  })

  it('warning mentions regression keyword (AC2)', () => {
    const cp = computeProgramCheckpoint(10, 60, 80)
    expect(cp!.warning!.toLowerCase()).toMatch(/regress|drop|fell|degraded|caiu/i)
  })

  it('warning includes the magnitude of regression (AC2)', () => {
    const cp = computeProgramCheckpoint(10, 65, 80) // -15 points
    expect(cp!.warning).toMatch(/15|15\./)
  })

  it('no warning when harness improved or stayed the same', () => {
    const better = computeProgramCheckpoint(10, 85, 75)
    expect(better!.warning).toBeUndefined()

    const same = computeProgramCheckpoint(10, 75, 75)
    expect(same!.warning).toBeUndefined()
  })

  it('negative harnessDelta triggers regression warning', () => {
    const cp = computeProgramCheckpoint(10, 50, 80) // -30 points
    expect(cp!.harnessDelta).toBe(-30)
    expect(cp!.warning).toBeDefined()
  })
})

describe('edge cases', () => {
  it('handles qualityDelta from current vs baseline quality score', () => {
    const cp = computeProgramCheckpoint(10, 80, 75, 90, 70)
    expect(cp!.qualityDelta).toBe(20) // 90 - 70
  })

  it('qualityDelta is null when quality scores not provided', () => {
    const cp = computeProgramCheckpoint(10, 80, 75)
    expect(cp!.qualityDelta).toBeNull()
  })

  it('works at 100 tasks done', () => {
    const cp = computeProgramCheckpoint(100, 95, 70)
    expect(cp!.tasksCompleted).toBe(100)
    expect(cp!.harnessDelta).toBe(25)
  })
})
