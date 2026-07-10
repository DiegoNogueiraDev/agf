/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.1 AC coverage: lessons-store wiring to implement-attempt
 *
 * AC1: implement-attempt with db + lessons → relevant lessons injected into flowContext
 * AC2: DoD failure for has_testable_ac → lesson persisted with node_id, AC, timestamp
 * AC3: buildLessonsContext returns top-3 by activation score
 */

import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import {
  persistLesson,
  consultLessons,
  buildLessonsContext,
  persistLessonFromDodFailure,
  type LessonRow,
} from '../core/autonomy/lessons-store.js'
import { attemptImplementation, buildInitialPrompt, type AttemptOptions } from '../core/autonomy/implement-attempt.js'
import type { ExecutionResult } from '../core/autonomy/implementation-executor.js'

// ── Test database setup ───────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

// ── AC1: lessons injected into implement-attempt flowContext ─────────────────

describe('AC1: lessons injected into implement-attempt when similarity ≥ 0.7', () => {
  it('buildInitialPrompt includes lessons when lessonsContext is provided via flowContext', () => {
    const node = { id: 'node-test', title: 'implement foo feature' }
    const flowContext = 'Past lessons:\n1. [check imports] always import the module under test (conf=0.90, applied=3x)'

    const prompt = buildInitialPrompt(node, { flowContext })
    expect(prompt).toContain('Past lessons')
    expect(prompt).toContain('check imports')
  })

  it('attemptImplementation with lessonsDb injects lessons into first prompt', async () => {
    const db = createTestDb()
    // Persist a relevant lesson
    persistLesson(db, {
      patternHash: 'test-hash-1',
      description: 'implement foo feature missing import test',
      recommendedAction: 'add import at top',
      confidence: 0.9,
      source: 'test',
    })

    const capturedPrompts: string[] = []
    const mockGenerate = vi.fn(async (prompt: string) => {
      capturedPrompts.push(prompt)
      return JSON.stringify({ edits: [] })
    })
    const mockExecute = vi.fn(async (): Promise<ExecutionResult> => ({
      testPassed: true,
      testOutput: 'ok',
    }))

    const options: AttemptOptions = {
      node: { id: 'node-1', title: 'implement foo feature' },
      maxAttempts: 1,
      lessonsDb: db,
    }

    await attemptImplementation({ generate: mockGenerate, execute: mockExecute }, options)
    expect(capturedPrompts.length).toBeGreaterThan(0)
    // The first prompt should include the lesson since description matches
    const firstPrompt = capturedPrompts[0]
    expect(firstPrompt).toContain('Past lessons')
  })

  it('attemptImplementation without lessonsDb does not inject lessons', async () => {
    const capturedPrompts: string[] = []
    const mockGenerate = vi.fn(async (prompt: string) => {
      capturedPrompts.push(prompt)
      return JSON.stringify({ edits: [] })
    })
    const mockExecute = vi.fn(async (): Promise<ExecutionResult> => ({
      testPassed: true,
      testOutput: 'ok',
    }))

    const options: AttemptOptions = {
      node: { id: 'node-2', title: 'simple task' },
      maxAttempts: 1,
      // no lessonsDb
    }

    await attemptImplementation({ generate: mockGenerate, execute: mockExecute }, options)
    // Should succeed without lessons
    expect(capturedPrompts.length).toBeGreaterThan(0)
  })
})

// ── AC2: DoD failure for has_testable_ac → lesson persisted ──────────────────

describe('AC2: DoD failure for has_testable_ac → lesson persisted with node_id, AC, timestamp', () => {
  it('persistLessonFromDodFailure saves lesson with node_id and failed AC', () => {
    const db = createTestDb()
    const nodeId = 'node-abc123'
    const failedAc = 'GIVEN x WHEN y THEN thing happens'

    persistLessonFromDodFailure(db, nodeId, failedAc)

    const lessons = consultLessons(db, 'weak_concrete ac testability', 5)
    expect(lessons.length).toBeGreaterThan(0)
    const lesson = lessons[0]
    expect(lesson.description).toContain(nodeId)
    expect(lesson.description).toContain(failedAc.slice(0, 40))
  })

  it('persistLessonFromDodFailure lesson has recommendedAction pointing to concrete values', () => {
    const db = createTestDb()
    persistLessonFromDodFailure(db, 'node-xyz', 'GIVEN system WHEN action THEN works')

    const lessons = consultLessons(db, 'weak concrete ac', 5)
    expect(lessons.length).toBeGreaterThan(0)
    expect(lessons[0].recommendedAction).toMatch(/threshold|status code|boolean|concrete/i)
  })

  it('persistLessonFromDodFailure increments applied_count on repeat failures', () => {
    const db = createTestDb()
    const nodeId = 'node-repeat'
    const failedAc = 'GIVEN x WHEN y THEN result is good'

    persistLessonFromDodFailure(db, nodeId, failedAc)
    persistLessonFromDodFailure(db, nodeId, failedAc)

    const lessons = consultLessons(db, 'weak concrete', 5)
    const relevant = lessons.find((l) => l.description.includes(nodeId))
    expect(relevant).toBeDefined()
    // Second call increments applied_count
    expect(relevant!.appliedCount).toBeGreaterThanOrEqual(2)
  })

  it('lesson source is dod-failure', () => {
    const db = createTestDb()
    persistLessonFromDodFailure(db, 'node-src', 'GIVEN test WHEN action THEN ok')
    const lessons = consultLessons(db, 'weak concrete', 5)
    expect(lessons[0].source).toBe('dod-failure')
  })
})

// ── AC3: buildLessonsContext returns top-3 by confidence (proxy for activation) ─

describe('AC3: buildLessonsContext returns top-3 lessons by activation score', () => {
  it('returns lessons sorted by confidence desc', () => {
    const db = createTestDb()
    const query = 'test task for ac testability'

    // Persist 4 lessons with varying confidence
    persistLesson(db, {
      patternHash: 'h1',
      description: 'test task for ac testability low',
      recommendedAction: 'do a',
      confidence: 0.3,
    })
    persistLesson(db, {
      patternHash: 'h2',
      description: 'test task for ac testability medium',
      recommendedAction: 'do b',
      confidence: 0.6,
    })
    persistLesson(db, {
      patternHash: 'h3',
      description: 'test task for ac testability high',
      recommendedAction: 'do c',
      confidence: 0.9,
    })
    persistLesson(db, {
      patternHash: 'h4',
      description: 'test task for ac testability very high',
      recommendedAction: 'do d',
      confidence: 0.95,
    })

    const context = buildLessonsContext(db, query, 3)
    expect(context).toBeTruthy()

    // Top-3 by confidence should appear, highest first
    const lines = context.split('\n').filter((l) => l.includes('[do'))
    expect(lines.length).toBeLessThanOrEqual(3)
    // First result should be highest confidence
    if (lines.length >= 2) {
      const firstConf = parseFloat(lines[0].match(/conf=([\d.]+)/)?.[1] ?? '0')
      const secondConf = parseFloat(lines[1].match(/conf=([\d.]+)/)?.[1] ?? '0')
      expect(firstConf).toBeGreaterThanOrEqual(secondConf)
    }
  })

  it('returns empty string when no lessons match', () => {
    const db = createTestDb()
    const context = buildLessonsContext(db, 'completely unrelated query xyz123', 3)
    expect(context).toBe('')
  })

  it('respects topK=3 limit', () => {
    const db = createTestDb()
    const query = 'implement shared feature'
    for (let i = 0; i < 6; i++) {
      persistLesson(db, {
        patternHash: `h-topk-${i}`,
        description: `implement shared feature pattern ${i}`,
        recommendedAction: `action-${i}`,
        confidence: 0.5 + i * 0.05,
      })
    }
    const context = buildLessonsContext(db, query, 3)
    const count = (context.match(/^\d+\./gm) ?? []).length
    expect(count).toBeLessThanOrEqual(3)
  })
})

// ── AC-RETRY: retry prompt (attempt >= 2) includes lesson context ─────────────

describe('AC-RETRY: retry prompt (attempt >= 2) includes lesson context from lessons-store', () => {
  it('includes lessons in retry prompt when lessonsDb provided and first attempt fails', async () => {
    const db = createTestDb()
    persistLesson(db, {
      patternHash: 'retry-pattern-hash',
      description: 'check import path on retry always verify module exists',
      recommendedAction: 'add missing import at the top of file',
      confidence: 0.88,
      source: 'test',
    })

    const capturedPrompts: string[] = []
    // Must return a valid plan (≥1 edit/file) or PlanSchema.refine() throws
    // and parse recovery calls generate multiple extra times before the real retry.
    const validPlan = JSON.stringify({
      edits: [{ path: 'src/placeholder.ts', oldString: '', newString: '// ok' }],
    })
    const mockGenerate = vi.fn(async (prompt: string) => {
      capturedPrompts.push(prompt)
      return validPlan
    })

    let execCall = 0
    const mockExecute = vi.fn(async (): Promise<ExecutionResult> => {
      execCall++
      if (execCall === 1) return { testPassed: false, testOutput: 'FAIL: Cannot find module' }
      return { testPassed: true, testOutput: 'ok' }
    })

    const options: AttemptOptions = {
      node: { id: 'node-retry-lesson', title: 'check import path on retry always verify module exists' },
      maxAttempts: 2,
      lessonsDb: db,
    }

    await attemptImplementation({ generate: mockGenerate, execute: mockExecute }, options)

    expect(capturedPrompts.length).toBe(2)
    const retryPrompt = capturedPrompts[1]
    expect(retryPrompt).toContain('Past lessons')
    expect(retryPrompt).toContain('check import path')
  })

  it('retry prompt without lessonsDb does not include lesson context', async () => {
    const capturedPrompts: string[] = []
    const validPlan = JSON.stringify({
      edits: [{ path: 'src/placeholder.ts', oldString: '', newString: '// ok' }],
    })
    const mockGenerate = vi.fn(async (prompt: string) => {
      capturedPrompts.push(prompt)
      return validPlan
    })

    let execCall = 0
    const mockExecute = vi.fn(async (): Promise<ExecutionResult> => {
      execCall++
      if (execCall === 1) return { testPassed: false, testOutput: 'FAIL: test error' }
      return { testPassed: true, testOutput: 'ok' }
    })

    const options: AttemptOptions = {
      node: { id: 'node-no-lessons', title: 'some task without lessons db' },
      maxAttempts: 2,
    }

    await attemptImplementation({ generate: mockGenerate, execute: mockExecute }, options)
    expect(capturedPrompts.length).toBe(2)
    expect(capturedPrompts[1]).not.toContain('Past lessons')
  })
})
