/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { acHasEdgeCase, tasksMissingEdgeCases, isHighStakes } from '../core/analyzer/edge-case-detector.js'
import { detectEdgeCases } from '../core/gaps/detect-edge-cases.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  title?: string
  tags?: string[]
  acceptanceCriteria?: string[]
}
function doc(nodes: MiniNode[]): GraphDocument {
  return { nodes, edges: [] } as unknown as GraphDocument
}

describe('M5 — edge-case signals', () => {
  it('acHasEdgeCase detects error/boundary phrasing', () => {
    expect(acHasEdgeCase('When the input is invalid, Then return an error')).toBe(true)
    expect(acHasEdgeCase('When the file exceeds the limit, Then reject it')).toBe(true)
    expect(acHasEdgeCase('Returns the user profile')).toBe(false)
  })

  it('flags a task with happy-path-only ACs', () => {
    const g = doc([
      { id: 't1', type: 'task', title: 'Upload', acceptanceCriteria: ['User uploads a file', 'File is stored'] },
    ])
    expect(tasksMissingEdgeCases(g)).toEqual(['t1'])
  })

  it('does not flag a task that already has an error AC', () => {
    const g = doc([
      {
        id: 't1',
        type: 'task',
        title: 'Upload',
        acceptanceCriteria: ['User uploads a file', 'When invalid, returns error'],
      },
    ])
    expect(tasksMissingEdgeCases(g)).toEqual([])
  })

  it('does not flag a task with no AC at all', () => {
    expect(tasksMissingEdgeCases(doc([{ id: 't1', type: 'task', title: 'X' }]))).toEqual([])
  })

  it('isHighStakes — auth/security/payment titles', () => {
    expect(isHighStakes({ id: 'a', type: 'task', title: 'Login authentication' } as never)).toBe(true)
    expect(isHighStakes({ id: 'b', type: 'task', title: 'Render dashboard' } as never)).toBe(false)
  })
})

describe('M5 — detectEdgeCases gaps', () => {
  it('recommended for a normal task', () => {
    const gaps = detectEdgeCases(
      doc([{ id: 't1', type: 'task', title: 'Render list', acceptanceCriteria: ['Shows the items'] }]),
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('missing_edge_case')
    expect(gaps[0].severity).toBe('recommended')
  })

  it('required for a security/auth task', () => {
    const gaps = detectEdgeCases(
      doc([{ id: 't1', type: 'task', title: 'User authentication', acceptanceCriteria: ['Logs the user in'] }]),
    )
    expect(gaps[0].severity).toBe('required')
  })

  // Load-bearing closure: adding an error AC removes the gap.
  it('CLOSURE: adding an error AC removes the gap', () => {
    let g = doc([{ id: 't1', type: 'task', title: 'Upload', acceptanceCriteria: ['User uploads a file'] }])
    let report = buildGapReport(detectEdgeCases(g))
    expect(report.byKind.missing_edge_case).toBe(1)

    g = doc([
      {
        id: 't1',
        type: 'task',
        title: 'Upload',
        acceptanceCriteria: ['User uploads a file', 'When the upload times out, Then it retries'],
      },
    ])
    report = buildGapReport(detectEdgeCases(g))
    expect(report.gaps).toEqual([])
  })
})
