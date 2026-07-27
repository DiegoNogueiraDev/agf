/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for buildCascadeAbDelta (node_616e64c1a5ad, épico node_66df2059d21e).
 * O A/B do cascade grava, por task, tokens_before (braço OFF) e tokens_after
 * (braço ON) no economy_lever_ledger. Este agregador transforma isso no delta
 * antes→depois que `agf metrics --economy-report` exibe.
 *
 * Regra dura: ledger vazio ⇒ hasData=false e delta 0 EXPLÍCITO — nunca um
 * número inventado nem um silêncio que parece economia.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { buildCascadeAbDelta } from '../core/economy/cascade-ab-delta.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

/** Grava uma linha do A/B como o runCascadeAb real grava (lever 'cascade'). */
function arm(nodeId: string, off: number, on: number): void {
  recordLeverEvent(db, {
    surface: 'internal',
    sessionId: 'sess-ab',
    nodeId,
    lever: 'cascade',
    tokensBefore: off,
    tokensAfter: on,
    saved: off - on,
    accepted: off - on > 0,
    gateOutcome: off - on > 0 ? 'accepted' : 'passthrough',
  })
}

describe('buildCascadeAbDelta', () => {
  it('empty ledger → hasData false and an explicit zero (never a silent number)', () => {
    const d = buildCascadeAbDelta(db)
    expect(d.hasData).toBe(false)
    expect(d.taskCount).toBe(0)
    expect(d.tokensBefore).toBe(0)
    expect(d.tokensAfter).toBe(0)
    expect(d.deltaTokens).toBe(0)
    expect(d.note.length).toBeGreaterThan(0)
  })

  it('aggregates before→after across tasks and reports the delta', () => {
    arm('cascade_ab_0', 1000, 600)
    arm('cascade_ab_1', 500, 400)
    const d = buildCascadeAbDelta(db)
    expect(d.hasData).toBe(true)
    expect(d.taskCount).toBe(2)
    expect(d.tokensBefore).toBe(1500)
    expect(d.tokensAfter).toBe(1000)
    expect(d.deltaTokens).toBe(500) // before − after: positivo = cascade economizou
  })

  it('a cascade that COSTS more yields a negative delta (honest sign, never clamped)', () => {
    arm('cascade_ab_0', 400, 900)
    const d = buildCascadeAbDelta(db)
    expect(d.deltaTokens).toBe(-500)
    expect(d.hasData).toBe(true)
  })

  it('ignores other levers — only the cascade A/B rows count', () => {
    arm('cascade_ab_0', 1000, 600)
    recordLeverEvent(db, {
      surface: 'internal',
      sessionId: 'sess-ab',
      nodeId: 'other',
      lever: 'ncd_dedup',
      tokensBefore: 9999,
      tokensAfter: 1,
      saved: 9998,
      accepted: true,
      gateOutcome: 'accepted',
    })
    const d = buildCascadeAbDelta(db)
    expect(d.taskCount).toBe(1)
    expect(d.tokensBefore).toBe(1000)
  })

  it('reports the percent reduction against the OFF arm (the honest baseline)', () => {
    arm('cascade_ab_0', 1000, 750)
    const d = buildCascadeAbDelta(db)
    expect(d.reductionPercent).toBeCloseTo(25)
  })

  it('percent reduction is 0 when the baseline is 0 (no division by zero)', () => {
    arm('cascade_ab_0', 0, 0)
    const d = buildCascadeAbDelta(db)
    expect(d.reductionPercent).toBe(0)
  })
})
