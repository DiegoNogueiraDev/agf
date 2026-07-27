/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_9c46b1ae2b41 — C77-T1: tests for seedProjectWithNodes SQL generation
 *
 * AC: returns array of SQL strings; includes INSERT INTO projects;
 *     empty nodes produces only project insert; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { seedProjectWithNodes } from '../core/observability/scenario-runner.js'

describe('seedProjectWithNodes', () => {
  it('returns an array', () => {
    const result = seedProjectWithNodes('proj1', [])
    expect(Array.isArray(result)).toBe(true)
  })

  it('empty nodes produces exactly one SQL statement (project insert)', () => {
    const result = seedProjectWithNodes('proj1', [])
    expect(result).toHaveLength(1)
  })

  it('first statement is INSERT INTO projects', () => {
    const result = seedProjectWithNodes('proj1', [])
    expect(result[0]).toMatch(/INSERT INTO projects/i)
  })

  it('project id is embedded in the project insert statement', () => {
    const result = seedProjectWithNodes('myproject', [])
    expect(result[0]).toContain('myproject')
  })

  it('one node produces two SQL statements (project + node)', () => {
    const result = seedProjectWithNodes('proj2', [{ id: 'node1', title: 'Task A' }])
    expect(result).toHaveLength(2)
  })

  it('node insert includes node id and title', () => {
    const result = seedProjectWithNodes('proj2', [{ id: 'node42', title: 'My Task' }])
    const nodeInsert = result[1]
    expect(nodeInsert).toContain('node42')
    expect(nodeInsert).toContain('My Task')
  })

  it('node insert is INSERT INTO nodes', () => {
    const result = seedProjectWithNodes('proj3', [{ id: 'n1', title: 'T1' }])
    expect(result[1]).toMatch(/INSERT INTO nodes/i)
  })

  it('multiple nodes produce project + N node statements', () => {
    const nodes = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
    ]
    const result = seedProjectWithNodes('proj4', nodes)
    expect(result).toHaveLength(4) // 1 project + 3 nodes
  })

  it('node with parentId includes parent reference in SQL', () => {
    const result = seedProjectWithNodes('proj5', [{ id: 'child', title: 'Child', parentId: 'parent-id' }])
    expect(result[1]).toContain('parent-id')
  })

  it('node without parentId uses NULL for parent_id', () => {
    const result = seedProjectWithNodes('proj6', [{ id: 'n1', title: 'Standalone' }])
    expect(result[1]).toContain('NULL')
  })

  it('all returned values are non-empty strings', () => {
    const result = seedProjectWithNodes('proj7', [{ id: 'x', title: 'X' }])
    for (const sql of result) {
      expect(typeof sql).toBe('string')
      expect(sql.length).toBeGreaterThan(0)
    }
  })

  it('node with custom type includes the type in SQL', () => {
    const result = seedProjectWithNodes('proj8', [{ id: 'e1', title: 'Epic', type: 'epic' }])
    expect(result[1]).toContain('epic')
  })

  it('node with custom status includes the status in SQL', () => {
    const result = seedProjectWithNodes('proj9', [{ id: 's1', title: 'Done Task', status: 'done' }])
    expect(result[1]).toContain('done')
  })
})
