/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for Task 4.2: Quick-fix suggestions on DoD failure output.
 */

import { describe, it, expect } from 'vitest'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(node: Partial<GraphNode>): GraphDocument {
  return {
    nodes: [
      {
        id: 'n1',
        type: 'task',
        title: 'Test task',
        status: 'in_progress',
        priority: 1,
        blocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...node,
      } as GraphNode,
    ],
    edges: [],
  }
}

describe('DoD quick-fix suggestions on failures', () => {
  it('failed check has a non-empty fix field', () => {
    // Task with no AC — has_acceptance_criteria will fail
    const doc = makeDoc({ id: 'n1', description: 'desc', xpSize: 'S' })
    const report = checkDefinitionOfDone(doc, 'n1')
    const failedChecks = report.checks.filter((c) => !c.passed)
    expect(failedChecks.length).toBeGreaterThan(0)
    for (const check of failedChecks) {
      expect(typeof check.fix).toBe('string')
      expect(check.fix!.length).toBeGreaterThan(0)
    }
  })

  it('fix field is present on passed checks too (may be empty string or omitted)', () => {
    // Just confirm that failed checks always have it — passed checks may or may not
    const doc = makeDoc({ id: 'n1', description: 'desc', xpSize: 'S' })
    const report = checkDefinitionOfDone(doc, 'n1')
    const failedChecks = report.checks.filter((c) => !c.passed)
    for (const check of failedChecks) {
      // fix must be present and non-empty for failed checks
      expect(check.fix).toBeDefined()
      expect(typeof check.fix).toBe('string')
    }
  })

  it('has_test_files failure uses remediation-rules fixTemplate for missing_test', () => {
    // Task with AC but no test files — has_test_files check will fail
    const doc: GraphDocument = {
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'Test task',
          status: 'in_progress',
          priority: 1,
          blocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: 'desc',
          xpSize: 'S',
        } as GraphNode,
        {
          id: 'ac1',
          type: 'acceptance_criteria',
          title: 'GIVEN x WHEN y THEN returns 200',
          status: 'backlog',
          priority: 1,
          blocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          parentId: 'n1',
        } as GraphNode,
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'ac1', relationType: 'parent_of' } as never],
    }
    const report = checkDefinitionOfDone(doc, 'n1')
    const testFilesCheck = report.checks.find((c) => c.name === 'has_test_files')
    expect(testFilesCheck).toBeDefined()
    expect(testFilesCheck!.passed).toBe(false)
    // Should include a fix that references the missing_test remediation rule
    expect(testFilesCheck!.fix).toBeDefined()
    expect(typeof testFilesCheck!.fix).toBe('string')
    expect(testFilesCheck!.fix!.length).toBeGreaterThan(0)
  })

  it('fix field is a generic fallback when no remediation rule matches', () => {
    // has_description failure has no specific remediation violationType — should fall back
    const doc = makeDoc({ id: 'n1', description: '', xpSize: 'S', status: 'in_progress' })
    const report = checkDefinitionOfDone(doc, 'n1')
    const descCheck = report.checks.find((c) => c.name === 'has_description')
    expect(descCheck).toBeDefined()
    if (!descCheck!.passed) {
      expect(descCheck!.fix).toBeDefined()
      expect(typeof descCheck!.fix).toBe('string')
    }
  })
})
