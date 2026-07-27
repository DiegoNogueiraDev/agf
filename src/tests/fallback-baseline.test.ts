/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `saved = GENERATION_OVERHEAD_TOKENS`, and that constant was 60. So `rag_in_reuse` reported
 * exactly sixty tokens times the number of calls — 2,940 over 49 retrievals — and the number was
 * not a measurement, it was a multiplication. Someone chose 60 in a comment that says "~60 tokens
 * of reasoning/prose is typical".
 *
 * The system already prescribes the counterfactual. When retrieval refuses it hands back
 * `agf --help`, and `_rag-protocol.md` tells the agent to read `agf help` instead of guessing. So
 * the cost a successful retrieval avoids is the cost of that fallback — and unlike a chosen
 * constant, it is a text that exists and can be counted. It was counted, twenty-two times, in
 * `command_invocations`: 457 tokens, min equal to max, because the help output is deterministic.
 *
 * It is a lower bound and it is labelled as one. `agf help` lists the curated commands, not all
 * 393; an agent that does not find its command there pays more, never less.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { measuredFallbackTokens } from '../core/rag-in/fallback-baseline.js'

let db: Database.Database

function seed(tokens: number[]): void {
  db.exec(`CREATE TABLE command_invocations (
    id TEXT PRIMARY KEY, ts INTEGER, command TEXT, estimated_tokens INTEGER)`)
  const insert = db.prepare('INSERT INTO command_invocations (id, ts, command, estimated_tokens) VALUES (?, 0, ?, ?)')
  tokens.forEach((t, i) => insert.run(`inv_${i}`, 'help', t))
}

beforeEach(() => {
  db = new Database(':memory:')
})

afterEach(() => db.close())

describe('measuredFallbackTokens — the avoided path is a text you can count', () => {
  it('reports the median cost of the help the agent would have read', () => {
    seed([450, 457, 460])
    expect(measuredFallbackTokens(db)).toEqual({ tokens: 457, samples: 3 })
  })

  // The mean would follow one 12,000-token outlier off a cliff; the median stays where the data is.
  it('is not moved by a single freak invocation', () => {
    seed([457, 457, 457, 12000])
    expect(measuredFallbackTokens(db)?.tokens).toBe(457)
  })

  it('returns null when the help was never run — no data, no claim', () => {
    seed([])
    expect(measuredFallbackTokens(db)).toBeNull()
  })

  it('ignores an invocation that emitted nothing', () => {
    seed([0, 0, 457])
    expect(measuredFallbackTokens(db)).toEqual({ tokens: 457, samples: 1 })
  })

  it('never throws when the ledger table is absent — telemetry stays quiet', () => {
    const empty = new Database(':memory:')
    expect(() => measuredFallbackTokens(empty)).not.toThrow()
    expect(measuredFallbackTokens(empty)).toBeNull()
    empty.close()
  })
})
