/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { detectStaleSourceRef, STALE_AGE_DAYS, STALE_LOC_DELTA } from '../core/hooks/stale-source-ref.js'

describe('stale-source-ref', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = 1_700_000_000_000

  it('returns not stale when baselineLineCount is undefined', () => {
    const r = detectStaleSourceRef({
      createdAtMs: now - 30 * DAY_MS,
      mtimeMs: now,
      currentLineCount: 200,
    })
    expect(r.stale).toBe(false)
    expect(r.reason).toBeUndefined()
  })

  it('returns not stale when baselineLineCount is zero', () => {
    const r = detectStaleSourceRef({
      createdAtMs: now - 30 * DAY_MS,
      mtimeMs: now,
      currentLineCount: 200,
      baselineLineCount: 0,
    })
    expect(r.stale).toBe(false)
  })

  it('returns not stale when file is recent', () => {
    const r = detectStaleSourceRef({
      createdAtMs: now - 5 * DAY_MS,
      mtimeMs: now,
      currentLineCount: 100,
      baselineLineCount: 100,
    })
    expect(r.stale).toBe(false)
  })

  it('returns stale when file is old and LOC drifted', () => {
    const r = detectStaleSourceRef({
      createdAtMs: now - 30 * DAY_MS,
      mtimeMs: now,
      currentLineCount: 200,
      baselineLineCount: 100,
    })
    expect(r.stale).toBe(true)
    expect(r.reason).toContain('LOC drift')
  })

  it('returns not stale when LOC drift is below threshold', () => {
    const r = detectStaleSourceRef({
      createdAtMs: now - 30 * DAY_MS,
      mtimeMs: now,
      currentLineCount: 110,
      baselineLineCount: 100,
    })
    expect(r.stale).toBe(false)
  })

  it('uses custom options', () => {
    const r = detectStaleSourceRef(
      {
        createdAtMs: now - 5 * DAY_MS,
        mtimeMs: now,
        currentLineCount: 200,
        baselineLineCount: 100,
      },
      { minAgeDays: 3, locDeltaThreshold: 0.1 },
    )
    expect(r.stale).toBe(true)
  })

  it('computes correct ageDays and locDelta', () => {
    const ageDays = 20
    const r = detectStaleSourceRef({
      createdAtMs: now - ageDays * DAY_MS,
      mtimeMs: now,
      currentLineCount: 150,
      baselineLineCount: 100,
    })
    expect(r.ageDays).toBeCloseTo(ageDays, 0)
    expect(r.locDelta).toBe(0.5)
  })
})
