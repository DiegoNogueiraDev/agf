/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.2 AC coverage: ACT-R activation score for lesson ranking
 *
 * AC1: lesson 7 days old + 3 retrievals → score > lesson 1 day old + 0 retrievals
 * AC2: retrieval increments applied_count (Hebbian reinforcement)
 * AC3: 0 retrievals + 30 days → activation ≤ 0.1 (forgetting curve)
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import {
  persistLesson,
  consultLessons,
  incrementLessonRetrieval,
  computeActrActivation,
  type LessonRow,
} from '../core/autonomy/lessons-store.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

const MS_PER_DAY = 86_400_000

function lessonAt(daysAgo: number, retrievals: number, confidence: number = 0.8): LessonRow {
  const nowMs = Date.now()
  const createdAt = new Date(nowMs - daysAgo * MS_PER_DAY).toISOString()
  return {
    id: `test-${daysAgo}-${retrievals}`,
    patternHash: `hash-${daysAgo}-${retrievals}`,
    description: 'test lesson',
    recommendedAction: 'do something',
    confidence,
    appliedCount: retrievals,
    source: 'test',
    createdAt,
    updatedAt: createdAt,
  }
}

// ── AC1: recency × frequency — 7 days + 3 retrievals > 1 day + 0 retrievals ───

describe('AC1: ACT-R score — recency × frequency (7d+3ret > 1d+0ret)', () => {
  it('lesson 7 days old with 3 retrievals scores higher than 1 day old with 0 retrievals', () => {
    const now = Date.now()
    const older = lessonAt(7, 3) // 7 days ago, 3 retrievals
    const newer = lessonAt(1, 0) // 1 day ago, 0 retrievals

    const scoreOlder = computeActrActivation(older, now)
    const scoreNewer = computeActrActivation(newer, now)

    expect(scoreOlder).toBeGreaterThan(scoreNewer)
  })

  it('more retrievals increase activation score', () => {
    const now = Date.now()
    const base = lessonAt(5, 0)
    const used1 = lessonAt(5, 1)
    const used5 = lessonAt(5, 5)

    expect(computeActrActivation(used1, now)).toBeGreaterThan(computeActrActivation(base, now))
    expect(computeActrActivation(used5, now)).toBeGreaterThan(computeActrActivation(used1, now))
  })

  it('activation is between 0 and 1 for any input', () => {
    const now = Date.now()
    for (const [days, retrievals, conf] of [
      [0, 0, 0.5],
      [1, 1, 0.8],
      [30, 10, 0.9],
      [100, 100, 1.0],
    ]) {
      const lesson = lessonAt(days as number, retrievals as number, conf as number)
      const score = computeActrActivation(lesson, now)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  it('consultLessons sorts by activation score (most activated first)', () => {
    const db = createTestDb()
    const now = Date.now()

    // Persist two lessons — one well-used, one fresh
    const wellUsed = persistLesson(db, {
      patternHash: 'well-used',
      description: 'shared feature pattern well established',
      recommendedAction: 'use existing pattern',
      confidence: 0.8,
      source: 'test',
    })
    const freshLesson = persistLesson(db, {
      patternHash: 'fresh',
      description: 'shared feature pattern newly added',
      recommendedAction: 'try new approach',
      confidence: 0.8,
      source: 'test',
    })

    // Simulate 3 retrievals for well-used lesson
    for (let i = 0; i < 3; i++) {
      incrementLessonRetrieval(db, wellUsed.id)
    }

    const lessons = consultLessons(db, 'shared feature pattern')
    // After retrievals, well-used should appear before fresh
    expect(lessons.length).toBeGreaterThanOrEqual(2)
    const wellUsedIdx = lessons.findIndex((l) => l.patternHash === 'well-used')
    const freshIdx = lessons.findIndex((l) => l.patternHash === 'fresh')
    // well-used has higher applied_count → should score higher
    expect(wellUsedIdx).toBeLessThan(freshIdx)
  })
})

// ── AC2: retrieval increments applied_count ───────────────────────────────────

describe('AC2: retrieval increments applied_count (Hebbian reinforcement)', () => {
  it('incrementLessonRetrieval increases applied_count by 1', () => {
    const db = createTestDb()
    const lesson = persistLesson(db, {
      patternHash: 'incr-test',
      description: 'increment test lesson',
      recommendedAction: 'check count',
      confidence: 0.7,
    })
    expect(lesson.appliedCount).toBe(1)

    incrementLessonRetrieval(db, lesson.id)
    const updated = consultLessons(db, 'increment test', 5)
    expect(updated[0].appliedCount).toBe(2)
  })

  it('multiple incrementLessonRetrieval calls accumulate', () => {
    const db = createTestDb()
    const lesson = persistLesson(db, {
      patternHash: 'multi-incr',
      description: 'multi increment test',
      recommendedAction: 'check',
      confidence: 0.7,
    })

    for (let i = 0; i < 5; i++) incrementLessonRetrieval(db, lesson.id)

    const updated = consultLessons(db, 'multi increment', 5)
    expect(updated[0].appliedCount).toBe(6) // 1 initial + 5 increments
  })
})

// ── AC3: forgetting curve — 0 retrievals, 30 days → score ≤ 0.1 ─────────────

describe('AC3: forgetting curve — 0 retrievals + 30 days → activation ≤ 0.1', () => {
  it('lesson with 0 retrievals after 30 days has activation ≤ 0.1', () => {
    const now = Date.now()
    const old = lessonAt(30, 0)
    expect(computeActrActivation(old, now)).toBeLessThanOrEqual(0.1)
  })

  it('lesson with 0 retrievals after 60 days has very low activation', () => {
    const now = Date.now()
    const veryOld = lessonAt(60, 0)
    expect(computeActrActivation(veryOld, now)).toBeLessThan(0.05)
  })

  it('lesson with 0 retrievals after 1 day has activation > 0.1 (not forgotten yet)', () => {
    const now = Date.now()
    const fresh = lessonAt(1, 0)
    expect(computeActrActivation(fresh, now)).toBeGreaterThan(0.1)
  })

  it('decay is monotonic — older lesson always has lower or equal score than newer (same retrievals)', () => {
    const now = Date.now()
    const days = [1, 7, 14, 30, 60]
    const scores = days.map((d) => computeActrActivation(lessonAt(d, 0), now))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })
})
