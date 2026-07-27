import { describe, it, expect } from 'vitest'
import { checkReviewReadiness } from '../core/reviewer/review-readiness.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

const emptyDoc: GraphDocument = {
  version: '1',
  project: { id: 'p_test', name: 'Test Project', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  nodes: [],
  edges: [],
  indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
  meta: { sourceFiles: [], lastImport: null },
}

describe('checkReviewReadiness with empty graph', () => {
  it('returns a report with at least one check', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(report.checks.length).toBeGreaterThan(0)
  })

  it('summary is a non-empty string', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(typeof report.summary).toBe('string')
    expect(report.summary.length).toBeGreaterThan(0)
  })

  it('score is between 0 and 100', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
  })

  it('grade is a letter A–D', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(report.grade).toMatch(/^[ABCD]$/)
  })

  it('completion_rate check fails when no tasks are done', () => {
    const report = checkReviewReadiness(emptyDoc)
    const check = report.checks.find((c) => c.name === 'completion_rate')
    expect(check).toBeDefined()
    expect(check?.passed).toBe(false)
    expect(check?.severity).toBe('required')
  })

  it('no_blocked_tasks check passes when there are no nodes', () => {
    const report = checkReviewReadiness(emptyDoc)
    const check = report.checks.find((c) => c.name === 'no_blocked_tasks')
    expect(check?.passed).toBe(true)
  })

  it('not ready when any required check fails', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(report.ready).toBe(false)
  })

  it('ready field is boolean', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(typeof report.ready).toBe('boolean')
  })

  it('axiom_gate check reports orphan enforceable principles as recommended (advisory, non-blocking)', () => {
    const report = checkReviewReadiness(emptyDoc)
    const check = report.checks.find((c) => c.name === 'axiom_gate')
    expect(check).toBeDefined()
    expect(check?.severity).toBe('recommended')
    expect(check?.passed).toBe(false)
    expect(check?.details).toMatch(/orphan/i)
  })
})

describe('checkReviewReadiness with boundary-validated options (ValidatedReviewInput)', () => {
  const halfDoneDoc: GraphDocument = {
    ...emptyDoc,
    nodes: [
      {
        id: 't1',
        type: 'task',
        title: 'T1',
        status: 'done',
        priority: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 't2',
        type: 'task',
        title: 'T2',
        status: 'backlog',
        priority: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
  }

  it('completion_rate uses the default 80% threshold when no options are passed', () => {
    const report = checkReviewReadiness(halfDoneDoc)
    const check = report.checks.find((c) => c.name === 'completion_rate')
    expect(check?.passed).toBe(false)
    expect(check?.details).toMatch(/meta: 80%/)
  })

  it('honors a custom minCompletionRate threshold', () => {
    const report = checkReviewReadiness(halfDoneDoc, { minCompletionRate: 40 })
    const check = report.checks.find((c) => c.name === 'completion_rate')
    expect(check?.passed).toBe(true)
    expect(check?.details).toMatch(/meta: 40%/)
  })

  it('runs the harness_grade_minimum check by default', () => {
    const report = checkReviewReadiness(emptyDoc)
    expect(report.checks.map((c) => c.name)).toContain('harness_grade_minimum')
  })

  it('skips the harness_grade_minimum check when includeHarness is false', () => {
    const report = checkReviewReadiness(emptyDoc, { includeHarness: false })
    expect(report.checks.map((c) => c.name)).not.toContain('harness_grade_minimum')
  })
})
