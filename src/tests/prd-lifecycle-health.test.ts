/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { computePrdLifecycleHealth } from '../core/analyzer/prd-lifecycle-health.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import { OperationError } from '../core/utils/errors.js'

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'e1',
    type: 'epic',
    title: 'Test Epic',
    status: 'done',
    priority: 3,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('computePrdLifecycleHealth', () => {
  it('throws OperationError for non-existent epic', () => {
    const doc = makeDoc([])
    expect(() => computePrdLifecycleHealth(doc, 'nonexistent')).toThrow(OperationError)
  })

  it('returns report with all 9 phases', () => {
    const doc = makeDoc([
      makeNode({ id: 'e1', type: 'epic', title: 'Epic', acceptanceCriteria: ['Valid AC with outcome'] }),
      makeNode({
        id: 't1',
        type: 'task',
        title: 'Task 1',
        parentId: 'e1',
        acceptanceCriteria: ['User should see the page'],
        status: 'done',
        testFiles: ['test.ts'],
      }),
    ])
    const result = computePrdLifecycleHealth(doc, 'e1')
    expect(result.epicId).toBe('e1')
    expect(Object.keys(result.phases).length).toBe(9)
    expect(typeof result.passedAll).toBe('boolean')
    expect(typeof result.passedCount).toBe('number')
    expect(typeof result.summary).toBe('string')
  })

  it('ANALYZE phase passes when AC quality >= 70', () => {
    const doc = makeDoc([
      makeNode({ id: 'e1', type: 'epic', title: 'Epic' }),
      makeNode({
        id: 't1',
        type: 'task',
        title: 'Task',
        parentId: 'e1',
        acceptanceCriteria: [
          'Given valid input When submitted Then returns status 200 with response body containing id',
        ],
      }),
    ])
    const result = computePrdLifecycleHealth(doc, 'e1')
    expect(result.phases.ANALYZE.passed).toBe(true)
  })

  it('ANALYZE phase fails when AC quality < 70', () => {
    const doc = makeDoc([
      makeNode({ id: 'e1', type: 'epic', title: 'Epic' }),
      makeNode({ id: 't1', type: 'task', title: 'Task', parentId: 'e1', acceptanceCriteria: ['apropriado e rápido'] }),
    ])
    const result = computePrdLifecycleHealth(doc, 'e1')
    expect(result.phases.ANALYZE.passed).toBe(false)
  })

  it('PLAN phase uses capacityCalibrationDelta from options', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { capacityCalibrationDelta: 0.05 })
    expect(result.phases.PLAN.passed).toBe(true)
  })

  it('PLAN phase fails when delta > 10%', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { capacityCalibrationDelta: 0.2 })
    expect(result.phases.PLAN.passed).toBe(false)
  })

  it('IMPLEMENT phase checks TDD pass rate', () => {
    const doc = makeDoc([
      makeNode({ id: 'e1', type: 'epic', title: 'Epic' }),
      makeNode({ id: 't1', type: 'task', title: 'Task', parentId: 'e1', status: 'done', testFiles: ['t1.test.ts'] }),
    ])
    const result = computePrdLifecycleHealth(doc, 'e1')
    expect(result.phases.IMPLEMENT.passed).toBe(true)
  })

  it('IMPLEMENT phase fails when done tasks lack testFiles', () => {
    const doc = makeDoc([
      makeNode({ id: 'e1', type: 'epic', title: 'Epic' }),
      makeNode({ id: 't1', type: 'task', title: 'Task', parentId: 'e1', status: 'done' }),
    ])
    const result = computePrdLifecycleHealth(doc, 'e1')
    expect(result.phases.IMPLEMENT.passed).toBe(false)
  })

  it('DEPLOY phase uses harnessGrade from options', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { harnessGrade: 'A' })
    expect(result.phases.DEPLOY.passed).toBe(true)
  })

  it('DEPLOY phase fails when harnessGrade < B', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { harnessGrade: 'C' })
    expect(result.phases.DEPLOY.passed).toBe(false)
  })

  it('REVIEW phase uses blastRadiusFiles from options', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { blastRadiusFiles: 3 })
    expect(result.phases.REVIEW.passed).toBe(true)
  })

  it('REVIEW phase fails when blast > 5', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { blastRadiusFiles: 10 })
    expect(result.phases.REVIEW.passed).toBe(false)
  })

  it('HANDOFF phase passes when no doc gaps', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { docCompletenessGaps: 0 })
    expect(result.phases.HANDOFF.passed).toBe(true)
  })

  it('LISTENING phase uses decisionOutcomeClosureRate', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { decisionOutcomeClosureRate: 1.0 })
    expect(result.phases.LISTENING.passed).toBe(true)
  })

  it('LISTENING phase fails when closure rate < 1.0', () => {
    const doc = makeDoc([makeNode({ id: 'e1', type: 'epic', title: 'Epic' })])
    const result = computePrdLifecycleHealth(doc, 'e1', { decisionOutcomeClosureRate: 0.5 })
    expect(result.phases.LISTENING.passed).toBe(false)
  })

  it('returns passedAll=true when all phases pass with good options', () => {
    const doc = makeDoc([
      makeNode({
        id: 'e1',
        type: 'epic',
        title: 'Epic',
        status: 'done',
        description: 'Full lifecycle epic',
        acceptanceCriteria: ['Given valid input When submitted Then returns status 200'],
      }),
      makeNode({
        id: 't1',
        type: 'task',
        title: 'Task',
        parentId: 'e1',
        acceptanceCriteria: ['Given valid input When submitted Then returns status 200'],
        status: 'done',
        testFiles: ['t1.test.ts'],
      }),
    ])
    const result = computePrdLifecycleHealth(doc, 'e1', {
      capacityCalibrationDelta: 0,
      harnessGrade: 'A',
      blastRadiusFiles: 2,
      docCompletenessGaps: 0,
      decisionOutcomeClosureRate: 1.0,
    })
    expect(result.passedAll).toBe(true)
    expect(result.passedCount).toBe(9)
  })
})
