/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { nonAtomicTasks, isAtomic } from '../core/planner/atomicity.js'
import { detectAtomicity } from '../core/gaps/detect-atomicity.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  status?: string
  estimateMinutes?: number
  xpSize?: string
  parentId?: string
}
function doc(nodes: MiniNode[]): GraphDocument {
  return { nodes, edges: [] } as unknown as GraphDocument
}

const BIG: MiniNode = { id: 'big', type: 'task', status: 'backlog', estimateMinutes: 180 }
const SMALL: MiniNode = { id: 'small', type: 'task', status: 'backlog', estimateMinutes: 30 }
const XL: MiniNode = { id: 'xl', type: 'task', status: 'backlog', xpSize: 'XL' }

describe('M7 — atomicity', () => {
  it('flags a large leaf task (estimate > 120min)', () => {
    const na = nonAtomicTasks(doc([BIG, SMALL]))
    expect(na.map((n) => n.node.id)).toEqual(['big'])
    expect(na[0].reasons.join(' ')).toMatch(/estimate/)
  })

  it('flags an XL leaf task', () => {
    expect(nonAtomicTasks(doc([XL])).map((n) => n.node.id)).toEqual(['xl'])
  })

  it('isAtomic — small leaf atomic, big leaf not', () => {
    const g = doc([BIG, SMALL])
    expect(isAtomic(g, 'small')).toBe(true)
    expect(isAtomic(g, 'big')).toBe(false)
  })

  it('a decomposed task (with children) is not flagged', () => {
    const g = doc([BIG, { id: 'c', type: 'subtask', status: 'backlog', estimateMinutes: 30, parentId: 'big' }])
    expect(nonAtomicTasks(g)).toEqual([])
  })
})

describe('M7 — detectAtomicity gaps', () => {
  it('emits a decompose gap for a non-atomic task', () => {
    const gaps = detectAtomicity(doc([BIG]))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('non_atomic_task')
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].enrichment.action).toBe('decompose')
    expect(gaps[0].enrichment.applyVia.some((c: string) => c.startsWith('agf decompose'))).toBe(true)
  })

  // Load-bearing closure: decomposing the task removes the gap.
  it('CLOSURE: decomposing the big task removes the gap', () => {
    let g = doc([BIG])
    let report = buildGapReport(detectAtomicity(g))
    expect(report.byKind.non_atomic_task).toBe(1)

    g = doc([BIG, { id: 'c', type: 'subtask', status: 'backlog', estimateMinutes: 30, parentId: 'big' }])
    report = buildGapReport(detectAtomicity(g))
    expect(report.gaps).toEqual([])
  })
})
