/*!
 * Tests for two pure readiness-gate functions.
 *
 * reviewer/review-readiness.ts:
 *   checkReviewReadiness(doc) — VALIDATE→REVIEW gate; tests completion_rate,
 *   no_blocked_tasks, no_cycles, and overall ready/score/grade shape.
 *
 * listener/feedback-readiness.ts:
 *   checkListeningReadiness(doc, opts?) — HANDOFF→LISTENING gate; opts injects
 *   hasSnapshots + knowledgeCount so harness/FS checks are bypassed.
 *   Tests all_tasks_done, no_in_progress, no_blocked, knowledge_indexed,
 *   has_snapshot, and overall ready/score shape.
 *
 * Both take GraphDocument (data) + optional opts; no DB, no FS writes.
 */

import { describe, it, expect } from 'vitest'
import { checkReviewReadiness } from '../core/reviewer/review-readiness.js'
import { checkListeningReadiness } from '../core/listener/feedback-readiness.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

// ── fixture helpers ───────────────────────────────────────────────────────────

const BASE_TIME = '2026-01-01T00:00:00.000Z'

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'title' | 'status'>): GraphNode {
  return {
    priority: 3 as const,
    parentId: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  } as GraphNode
}

function makeDoc(nodes: GraphNode[], edges: GraphDocument['edges'] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test-project', createdAt: BASE_TIME, updatedAt: BASE_TIME },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

const TASK_DONE = makeNode({ id: 't1', type: 'task', title: 'Done task', status: 'done', acceptanceCriteria: ['AC1'] })
const TASK_DONE2 = makeNode({
  id: 't2',
  type: 'task',
  title: 'Done task 2',
  status: 'done',
  acceptanceCriteria: ['AC2'],
})
const TASK_DONE3 = makeNode({
  id: 't3',
  type: 'task',
  title: 'Done task 3',
  status: 'done',
  acceptanceCriteria: ['AC3'],
})
const TASK_DONE4 = makeNode({
  id: 't4',
  type: 'task',
  title: 'Done task 4',
  status: 'done',
  acceptanceCriteria: ['AC4'],
})
const TASK_DONE5 = makeNode({
  id: 't5',
  type: 'task',
  title: 'Done task 5',
  status: 'done',
  acceptanceCriteria: ['AC5'],
})
const TASK_BACKLOG = makeNode({ id: 'tb', type: 'task', title: 'Backlog task', status: 'backlog' })
const TASK_IN_PROGRESS = makeNode({ id: 'tip', type: 'task', title: 'In progress task', status: 'in_progress' })
const TASK_BLOCKED = makeNode({ id: 'tbl', type: 'task', title: 'Blocked task', status: 'blocked' })

// ── checkReviewReadiness ──────────────────────────────────────────────────────

describe('checkReviewReadiness — report shape', () => {
  it('returns a report with checks, ready, score, grade, summary', () => {
    const doc = makeDoc([TASK_DONE])
    const report = checkReviewReadiness(doc)
    expect(Array.isArray(report.checks)).toBe(true)
    expect(typeof report.ready).toBe('boolean')
    expect(typeof report.score).toBe('number')
    expect(typeof report.grade).toBe('string')
    expect(typeof report.summary).toBe('string')
  })

  it('score is between 0 and 100 inclusive', () => {
    const report = checkReviewReadiness(makeDoc([TASK_DONE]))
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
  })

  it('grade is a non-empty string', () => {
    expect(checkReviewReadiness(makeDoc([TASK_DONE])).grade.length).toBeGreaterThan(0)
  })
})

describe('checkReviewReadiness — completion_rate check', () => {
  it('fails when 0 of 1 tasks are done (0% < 80%)', () => {
    const doc = makeDoc([TASK_BACKLOG])
    const report = checkReviewReadiness(doc)
    const check = report.checks.find((c) => c.name === 'completion_rate')
    expect(check?.passed).toBe(false)
  })

  it('passes when all tasks are done (100% ≥ 80%)', () => {
    const doc = makeDoc([TASK_DONE, TASK_DONE2, TASK_DONE3, TASK_DONE4, TASK_DONE5])
    const report = checkReviewReadiness(doc)
    const check = report.checks.find((c) => c.name === 'completion_rate')
    expect(check?.passed).toBe(true)
  })

  it('returns ready=false when completion_rate fails', () => {
    const doc = makeDoc([TASK_BACKLOG])
    expect(checkReviewReadiness(doc).ready).toBe(false)
  })
})

describe('checkReviewReadiness — no_blocked_tasks check', () => {
  it('fails when a task has status=blocked', () => {
    const doc = makeDoc([TASK_DONE, TASK_DONE2, TASK_DONE3, TASK_DONE4, TASK_BLOCKED])
    const report = checkReviewReadiness(doc)
    const check = report.checks.find((c) => c.name === 'no_blocked_tasks')
    expect(check?.passed).toBe(false)
  })

  it('passes when no tasks are blocked', () => {
    const doc = makeDoc([TASK_DONE, TASK_DONE2])
    const report = checkReviewReadiness(doc)
    const check = report.checks.find((c) => c.name === 'no_blocked_tasks')
    expect(check?.passed).toBe(true)
  })
})

describe('checkReviewReadiness — no_cycles check', () => {
  it('passes with empty edges (no cycles possible)', () => {
    const doc = makeDoc([TASK_DONE])
    const report = checkReviewReadiness(doc)
    const check = report.checks.find((c) => c.name === 'no_cycles')
    expect(check?.passed).toBe(true)
  })
})

// ── checkListeningReadiness ───────────────────────────────────────────────────

describe('checkListeningReadiness — report shape', () => {
  it('returns a report with checks, ready, score, grade, summary', () => {
    const doc = makeDoc([TASK_DONE])
    const report = checkListeningReadiness(doc)
    expect(Array.isArray(report.checks)).toBe(true)
    expect(typeof report.ready).toBe('boolean')
    expect(typeof report.score).toBe('number')
    expect(typeof report.grade).toBe('string')
    expect(typeof report.summary).toBe('string')
  })

  it('score is between 0 and 100 inclusive', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE]))
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
  })
})

describe('checkListeningReadiness — all_tasks_done check', () => {
  it('fails when tasks array is empty (no tasks to be done)', () => {
    const report = checkListeningReadiness(makeDoc([]))
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(false)
  })

  it('fails when one task is still backlog', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_BACKLOG]))
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(false)
  })

  it('passes when all tasks are done', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_DONE2]))
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(true)
  })
})

describe('checkListeningReadiness — no_in_progress check', () => {
  it('fails when a task is in_progress', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_IN_PROGRESS]))
    const check = report.checks.find((c) => c.name === 'no_in_progress')
    expect(check?.passed).toBe(false)
  })

  it('passes when no tasks are in_progress', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_DONE2]))
    const check = report.checks.find((c) => c.name === 'no_in_progress')
    expect(check?.passed).toBe(true)
  })
})

describe('checkListeningReadiness — no_blocked check', () => {
  it('fails when a task is blocked', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_BLOCKED]))
    const check = report.checks.find((c) => c.name === 'no_blocked')
    expect(check?.passed).toBe(false)
  })
})

describe('checkListeningReadiness — injectable opts', () => {
  it('has_snapshot passes when hasSnapshots=true', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE]), { hasSnapshots: true })
    const check = report.checks.find((c) => c.name === 'has_snapshot')
    expect(check?.passed).toBe(true)
  })

  it('has_snapshot fails when hasSnapshots omitted (defaults false)', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE]))
    const check = report.checks.find((c) => c.name === 'has_snapshot')
    expect(check?.passed).toBe(false)
  })

  it('knowledge_indexed passes when knowledgeCount > 0', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE]), { knowledgeCount: 3 })
    const check = report.checks.find((c) => c.name === 'knowledge_indexed')
    expect(check?.passed).toBe(true)
  })

  it('knowledge_indexed fails when knowledgeCount omitted (defaults 0)', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE]))
    const check = report.checks.find((c) => c.name === 'knowledge_indexed')
    expect(check?.passed).toBe(false)
  })
})

describe('checkListeningReadiness — ready state', () => {
  it('returns ready=false when required checks fail (empty doc)', () => {
    expect(checkListeningReadiness(makeDoc([])).ready).toBe(false)
  })

  it('returns ready=true when all required checks pass (all done, no in_progress, no blocked)', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_DONE2]))
    expect(report.ready).toBe(true)
  })

  it('summary contains "Ready" when ready=true', () => {
    const report = checkListeningReadiness(makeDoc([TASK_DONE, TASK_DONE2]))
    expect(report.summary).toContain('Ready')
  })

  it('summary contains "Not Ready" when ready=false', () => {
    const report = checkListeningReadiness(makeDoc([]))
    expect(report.summary).toContain('Not Ready')
  })
})
