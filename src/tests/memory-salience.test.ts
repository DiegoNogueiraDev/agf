/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  computeBaseLevelActivation,
  scoreMemoryActivation,
  selectByActivation,
  type ScoredMemory,
} from '../core/memory/memory-salience.js'

const DAY = 24 * 60 * 60 * 1000

describe('computeBaseLevelActivation (ACT-R base-level)', () => {
  it('rises with occurrences (frequency) at equal age', () => {
    const few = computeBaseLevelActivation({ occurrences: 1, ageMs: DAY })
    const many = computeBaseLevelActivation({ occurrences: 8, ageMs: DAY })
    expect(many).toBeGreaterThan(few)
  })

  it('falls with age (Ebbinghaus decay) at equal frequency', () => {
    const recent = computeBaseLevelActivation({ occurrences: 4, ageMs: DAY })
    const old = computeBaseLevelActivation({ occurrences: 4, ageMs: 365 * DAY })
    expect(recent).toBeGreaterThan(old)
  })

  it('is monotonic in the decay rate d (larger d punishes age more)', () => {
    const soft = computeBaseLevelActivation({ occurrences: 4, ageMs: 30 * DAY }, { decay: 0.2 })
    const hard = computeBaseLevelActivation({ occurrences: 4, ageMs: 30 * DAY }, { decay: 0.9 })
    expect(soft).toBeGreaterThan(hard)
  })

  it('treats occurrences < 1 as 1 (no NaN / -Infinity from ln(0))', () => {
    expect(Number.isFinite(computeBaseLevelActivation({ occurrences: 0, ageMs: DAY }))).toBe(true)
  })
})

describe('scoreMemoryActivation', () => {
  const now = 10 * 365 * DAY

  it('returns occurrences 0 / -Infinity activation when the query is absent', () => {
    const s = scoreMemoryActivation({ content: 'nothing relevant here', query: 'auth', mtimeMs: now, nowMs: now })
    expect(s.occurrences).toBe(0)
    expect(s.activation).toBe(-Infinity)
  })

  it('a recent crucial memory outranks an old repetitive one', () => {
    const recentCrucial = scoreMemoryActivation({
      content: 'auth uses JWT rotation',
      query: 'auth',
      mtimeMs: now - DAY,
      nowMs: now,
    })
    const oldRepetitive = scoreMemoryActivation({
      content: 'auth auth auth auth auth (legacy notes)',
      query: 'auth',
      mtimeMs: now - 400 * DAY,
      nowMs: now,
    })
    expect(recentCrucial.activation).toBeGreaterThan(oldRepetitive.activation)
  })

  it('spreading activation: higher query/term overlap raises the score at equal recency', () => {
    const overlap = scoreMemoryActivation({
      content: 'auth token rotation refresh flow',
      query: 'auth token rotation',
      mtimeMs: now - DAY,
      nowMs: now,
    })
    const noOverlap = scoreMemoryActivation({
      content: 'auth zzzzz qqqqq wwwww',
      query: 'auth token rotation',
      mtimeMs: now - DAY,
      nowMs: now,
    })
    expect(overlap.activation).toBeGreaterThan(noOverlap.activation)
  })
})

describe('selectByActivation', () => {
  const mk = (name: string, activation: number, tokens: number): ScoredMemory => ({
    result: { name, snippet: `snippet-${name}`, score: activation },
    activation,
    tokens,
  })

  it('keeps the highest-activation memories up to limit, sorted desc', () => {
    const out = selectByActivation([mk('a', 1, 10), mk('b', 5, 10), mk('c', 3, 10)], { limit: 2, threshold: -Infinity })
    expect(out.kept.map((k) => k.name)).toEqual(['b', 'c'])
    expect(out.droppedTokens).toBe(10) // 'a' dropped by the limit
  })

  it('drops memories below the threshold and accounts their tokens as saved', () => {
    const out = selectByActivation([mk('keep', 2, 12), mk('stale', -1, 7)], { limit: 5, threshold: 0 })
    expect(out.kept.map((k) => k.name)).toEqual(['keep'])
    expect(out.droppedTokens).toBe(7)
  })

  it('never returns more than limit and reports zero dropped when nothing is cut', () => {
    const out = selectByActivation([mk('a', 2, 5), mk('b', 1, 5)], { limit: 5, threshold: -Infinity })
    expect(out.kept).toHaveLength(2)
    expect(out.droppedTokens).toBe(0)
  })

  it('relativeThreshold drops entries far below the best one (robust to negative scale)', () => {
    // best = -5; relativeThreshold 2.5 ⇒ floor -7.5; -9 is dropped, -6 kept.
    const out = selectByActivation([mk('best', -5, 4), mk('near', -6, 4), mk('far', -9, 9)], {
      limit: 5,
      relativeThreshold: 2.5,
    })
    expect(out.kept.map((k) => k.name)).toEqual(['best', 'near'])
    expect(out.droppedTokens).toBe(9)
  })
})
