/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_ace2ea079847 — C70-T1: tests for buildColonyHealthSnapshot
 *
 * AC: correct grade/color/caste/counts; gradeToColor mapping verified;
 *     blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { buildColonyHealthSnapshot } from '../core/web/colony-health-snapshot.js'
import type { ColonyStats } from '../core/colony/colony-signals.js'

function makeStats(overrides: Partial<Record<string, number>> = {}): ColonyStats {
  return {
    byStatus: {
      backlog: 5,
      ready: 2,
      in_progress: 1,
      blocked: 1,
      done: 10,
      quarantined: 0,
      ...overrides,
    },
  }
}

describe('buildColonyHealthSnapshot', () => {
  it('returns an object with all required fields', () => {
    const snap = buildColonyHealthSnapshot(makeStats())
    expect(snap).toHaveProperty('grade')
    expect(snap).toHaveProperty('caste')
    expect(snap).toHaveProperty('quarantined_count')
    expect(snap).toHaveProperty('suggested_model')
    expect(snap).toHaveProperty('color')
    expect(snap).toHaveProperty('pending')
    expect(snap).toHaveProperty('blocked')
    expect(snap).toHaveProperty('done')
    expect(snap).toHaveProperty('total')
  })

  it('pending = backlog + ready', () => {
    const snap = buildColonyHealthSnapshot(makeStats({ backlog: 3, ready: 4 }))
    expect(snap.pending).toBe(7)
  })

  it('blocked matches byStatus.blocked', () => {
    const snap = buildColonyHealthSnapshot(makeStats({ blocked: 2 }))
    expect(snap.blocked).toBe(2)
  })

  it('done matches byStatus.done', () => {
    const snap = buildColonyHealthSnapshot(makeStats({ done: 15 }))
    expect(snap.done).toBe(15)
  })

  it('total is sum of all statuses', () => {
    const stats = makeStats({ backlog: 5, ready: 2, in_progress: 1, blocked: 1, done: 10, quarantined: 0 })
    const snap = buildColonyHealthSnapshot(stats)
    expect(snap.total).toBe(19)
  })

  it('quarantined_count matches byStatus.quarantined', () => {
    const snap = buildColonyHealthSnapshot(makeStats({ quarantined: 3 }))
    expect(snap.quarantined_count).toBe(3)
  })

  it('grade is a non-empty string', () => {
    const snap = buildColonyHealthSnapshot(makeStats())
    expect(typeof snap.grade).toBe('string')
    expect(snap.grade.length).toBeGreaterThan(0)
  })

  it('color is one of green/yellow/orange/red', () => {
    const snap = buildColonyHealthSnapshot(makeStats())
    expect(['green', 'yellow', 'orange', 'red']).toContain(snap.color)
  })

  it('caste is a non-empty string', () => {
    const snap = buildColonyHealthSnapshot(makeStats())
    expect(typeof snap.caste).toBe('string')
    expect(snap.caste.length).toBeGreaterThan(0)
  })

  it('suggested_model is a non-empty string', () => {
    const snap = buildColonyHealthSnapshot(makeStats())
    expect(typeof snap.suggested_model).toBe('string')
    expect(snap.suggested_model.length).toBeGreaterThan(0)
  })

  it('healthy graph (many done) produces a positive grade', () => {
    const snap = buildColonyHealthSnapshot(makeStats({ done: 100, blocked: 0, backlog: 1 }))
    expect(['A', 'B', 'C']).toContain(snap.grade)
  })

  it('empty graph returns total 0', () => {
    const snap = buildColonyHealthSnapshot({ byStatus: {} })
    expect(snap.total).toBe(0)
    expect(snap.pending).toBe(0)
    expect(snap.done).toBe(0)
  })

  it('empty graph quarantined_count is 0', () => {
    const snap = buildColonyHealthSnapshot({ byStatus: {} })
    expect(snap.quarantined_count).toBe(0)
  })
})
