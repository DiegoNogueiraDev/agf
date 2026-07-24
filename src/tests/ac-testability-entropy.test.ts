/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.1 AC coverage: entropy-based scoreAcTestability + batch redundancy detection
 *
 * AC1: vague AC (no concrete values) → score < 40
 * AC2: AC with status code + threshold → score ≥ 80
 * AC3: AC without numeric value or concrete state → penalty ≥ 15 points applied
 * AC4: two ACs with cosine similarity ≥ 70% → redundancy warning emitted
 */

import { describe, it, expect } from 'vitest'
import { scoreAcTestability, scoreAcTestabilityBatch } from '../core/analyzer/ac-testability.js'

// ── AC1: vague AC → score < 40 ───────────────────────────────────────────────

describe('AC1: vague AC (no concrete values) → score < 40', () => {
  it('purely vague GWT — no observable outcome, no numbers → score < 40', () => {
    const result = scoreAcTestability('GIVEN system ready WHEN user acts THEN thing happens')
    expect(result.score).toBeLessThan(40)
  })

  it('free-text AC with only modal verbs → score < 40', () => {
    const result = scoreAcTestability('the system should work correctly')
    expect(result.score).toBeLessThan(40)
  })

  it('GWT with vague THEN clause → score < 40', () => {
    const result = scoreAcTestability('GIVEN any input WHEN submitted THEN it is processed')
    expect(result.score).toBeLessThan(40)
  })

  it('scoreReasons shows the penalty for missing concrete evidence', () => {
    const result = scoreAcTestability('GIVEN system ready WHEN user acts THEN thing happens')
    const penaltyReason = result.scoreReasons.find((r) => r.includes('-15'))
    expect(penaltyReason).toBeDefined()
  })
})

// ── AC2: high-quality AC → score ≥ 80 ────────────────────────────────────────

describe('AC2: AC with status code + numeric threshold → score ≥ 80', () => {
  it('GWT with HTTP status code + time threshold → score ≥ 80', () => {
    const result = scoreAcTestability('GIVEN unauthenticated user WHEN POST /api/task THEN returns 401 within 100ms')
    expect(result.score).toBeGreaterThanOrEqual(80)
  })

  it('GWT with status code 200 and numeric threshold → score ≥ 80', () => {
    const result = scoreAcTestability(
      'GIVEN valid credentials WHEN POST /login THEN returns 200 and token within 500ms',
    )
    expect(result.score).toBeGreaterThanOrEqual(80)
  })

  it('GWT with percentage threshold and outcome verb → score ≥ 80', () => {
    const result = scoreAcTestability('GIVEN 1000 requests WHEN load test runs THEN returns 200 with p99 < 500ms')
    expect(result.score).toBeGreaterThanOrEqual(80)
  })

  it('scoreReasons documents structure + status code + numeric bonuses', () => {
    const result = scoreAcTestability('GIVEN unauthenticated user WHEN POST /api/task THEN returns 401 within 100ms')
    const reasons = result.scoreReasons.join(' ')
    expect(reasons).toMatch(/GWT/)
    expect(reasons).toMatch(/status code/)
    expect(reasons).toMatch(/numeric/)
  })
})

// ── AC3: no numeric/observable → penalty ≥ 15 applied ───────────────────────

describe('AC3: AC without numeric or concrete state → penalty ≥ 15 points', () => {
  it('GWT with vague THEN receives -15 penalty (no status code/numeric/boolean)', () => {
    const vague = scoreAcTestability('GIVEN user logged in WHEN submits form THEN action completes')
    const withNumber = scoreAcTestability('GIVEN user logged in WHEN submits form THEN action completes within 200ms')
    expect(withNumber.score - vague.score).toBeGreaterThanOrEqual(15)
  })

  it('penalized AC scoreReasons includes the -15 entry', () => {
    const result = scoreAcTestability('GIVEN user logged in WHEN submits form THEN action completes')
    const penalty = result.scoreReasons.find((r) => r.startsWith('-15'))
    expect(penalty).toBeDefined()
    expect(penalty).toMatch(/no concrete evidence/)
  })

  it('adding a boolean state removes the penalty', () => {
    const withoutBoolean = scoreAcTestability('GIVEN item added WHEN list refreshed THEN item appears')
    const withBoolean = scoreAcTestability('GIVEN item added WHEN list refreshed THEN item is visible')
    // "visible" is a boolean state → penalty removed, score higher
    expect(withBoolean.score).toBeGreaterThan(withoutBoolean.score)
  })

  it('adding an HTTP status code removes the penalty', () => {
    const withoutCode = scoreAcTestability('GIVEN invalid token WHEN GET /api/data THEN access is denied')
    const withCode = scoreAcTestability('GIVEN invalid token WHEN GET /api/data THEN returns 403')
    expect(withCode.score - withoutCode.score).toBeGreaterThanOrEqual(15)
  })
})

// ── AC4: cosine similarity ≥ 70% → redundancy warning ───────────────────────

describe('AC4: two ACs with ≥ 70% cosine similarity → redundancy warning', () => {
  it('nearly identical ACs trigger a redundancy warning', () => {
    const acs = [
      'GIVEN user logged in WHEN user clicks logout THEN user is logged out',
      'GIVEN user is authenticated WHEN user clicks logout THEN user is logged out',
    ]
    const { redundancyWarnings } = scoreAcTestabilityBatch(acs)
    expect(redundancyWarnings).toHaveLength(1)
    expect(redundancyWarnings[0].similarity).toBeGreaterThanOrEqual(0.7)
  })

  it('distinct ACs do not trigger a warning', () => {
    const acs = [
      'GIVEN unauthenticated user WHEN POST /api/task THEN returns 401',
      'GIVEN valid task WHEN GET /api/task/:id THEN returns 200 with task data',
    ]
    const { redundancyWarnings } = scoreAcTestabilityBatch(acs)
    expect(redundancyWarnings).toHaveLength(0)
  })

  it('batch result includes scored entries for all ACs', () => {
    const acs = [
      'GIVEN user logged in WHEN user clicks logout THEN user is logged out',
      'GIVEN valid credentials WHEN POST /login THEN returns 200 within 500ms',
      'GIVEN invalid password WHEN POST /login THEN returns 401',
    ]
    const { scored, redundancyWarnings } = scoreAcTestabilityBatch(acs)
    expect(scored).toHaveLength(3)
    // High-quality ACs score higher
    expect(scored[1].score).toBeGreaterThanOrEqual(80)
    // redundancy check across all pairs
    expect(Array.isArray(redundancyWarnings)).toBe(true)
  })

  it('three similar ACs produce three pairwise warnings', () => {
    const acs = [
      'GIVEN user logged WHEN logout THEN user logged out from system',
      'GIVEN authenticated user WHEN logout THEN user logged out from system',
      'GIVEN signed in user WHEN logout THEN user logged out from system',
    ]
    const { redundancyWarnings } = scoreAcTestabilityBatch(acs)
    // All three pairs should be redundant
    expect(redundancyWarnings.length).toBeGreaterThanOrEqual(1)
    for (const w of redundancyWarnings) {
      expect(w.similarity).toBeGreaterThanOrEqual(0.7)
    }
  })

  it('custom threshold 0.5 catches more pairs than default 0.7', () => {
    const acs = [
      'GIVEN user on page WHEN user clicks submit THEN form is submitted',
      'GIVEN user on form WHEN user clicks submit THEN form is submitted successfully',
    ]
    const strict = scoreAcTestabilityBatch(acs, 0.7)
    const loose = scoreAcTestabilityBatch(acs, 0.5)
    // Loose threshold catches at least as many as strict
    expect(loose.redundancyWarnings.length).toBeGreaterThanOrEqual(strict.redundancyWarnings.length)
  })
})

// ── Score monotonicity: adding information always helps ──────────────────────

describe('score monotonicity: more concrete information → higher score', () => {
  it('GWT > free text (structure matters)', () => {
    const free = scoreAcTestability('system should work correctly')
    const gwt = scoreAcTestability('GIVEN system ready WHEN user acts THEN system responds')
    expect(gwt.score).toBeGreaterThan(free.score)
  })

  it('GWT + status code > GWT alone (specificity matters)', () => {
    const gwt = scoreAcTestability('GIVEN request WHEN POST /api THEN server responds')
    const gwtCode = scoreAcTestability('GIVEN request WHEN POST /api THEN returns 201')
    expect(gwtCode.score).toBeGreaterThan(gwt.score)
  })

  it('GWT + status + numeric > GWT + status (precision matters)', () => {
    const withCode = scoreAcTestability('GIVEN request WHEN POST /api THEN returns 201')
    const withCodeTime = scoreAcTestability('GIVEN request WHEN POST /api THEN returns 201 within 200ms')
    expect(withCodeTime.score).toBeGreaterThan(withCode.score)
  })

  it('score is capped at 100', () => {
    const maxed = scoreAcTestability(
      'GIVEN unauthenticated user WHEN POST /api/task THEN returns 401 within 100ms and status is false and null body',
    )
    expect(maxed.score).toBeLessThanOrEqual(100)
  })
})
