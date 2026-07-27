/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { buildFullChainTraceability } from '../core/designer/traceability-matrix.js'
import { detectTraceability } from '../core/gaps/detect-traceability.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
}
interface MiniEdge {
  from: string
  to: string
  relationType: string
}
function doc(nodes: MiniNode[], edges: MiniEdge[]): GraphDocument {
  return { nodes, edges } as unknown as GraphDocument
}

const REQ: MiniNode = { id: 'r1', type: 'requirement' }
const TASK: MiniNode = { id: 't1', type: 'task' }
const TEST: MiniNode = { id: 'x1', type: 'browser_test' }

describe('M1 — full-chain traceability', () => {
  it('chain="none" when a requirement has no implementing task', () => {
    const report = buildFullChainTraceability(doc([REQ], []))
    expect(report.entries[0].chain).toBe('none')
    expect(report.brokenRequirements).toEqual(['r1'])
    expect(report.chainCoverageRate).toBe(0)
  })

  it('chain="partial" when task implements but has no test', () => {
    const report = buildFullChainTraceability(doc([REQ, TASK], [{ from: 't1', to: 'r1', relationType: 'implements' }]))
    expect(report.entries[0].chain).toBe('partial')
    expect(report.entries[0].linkedTasks).toEqual(['t1'])
    expect(report.entries[0].testedTasks).toEqual([])
  })

  it('chain="full" when task implements and is tested', () => {
    const report = buildFullChainTraceability(
      doc(
        [REQ, TASK, TEST],
        [
          { from: 't1', to: 'r1', relationType: 'implements' },
          { from: 'x1', to: 't1', relationType: 'tests' },
        ],
      ),
    )
    expect(report.entries[0].chain).toBe('full')
    expect(report.chainCoverageRate).toBe(100)
  })

  it('no requirements → no entries, no gaps', () => {
    expect(buildFullChainTraceability(doc([TASK], [])).entries).toEqual([])
    expect(detectTraceability(doc([TASK], []))).toEqual([])
  })
})

describe('M1 — detectTraceability gaps', () => {
  it('requirement with no task → one required gap with implements applyVia', () => {
    const gaps = detectTraceability(doc([REQ], []))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('traceability_break')
    expect(gaps[0].severity).toBe('required')
    expect(gaps[0].nodeId).toBe('r1')
    expect(gaps[0].enrichment.applyVia[0]).toContain('agf edge add')
    expect(gaps[0].enrichment.applyVia[0]).toContain('--type implements')
  })

  it('implemented-but-untested task → one recommended gap', () => {
    const gaps = detectTraceability(doc([REQ, TASK], [{ from: 't1', to: 'r1', relationType: 'implements' }]))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].nodeId).toBe('t1')
    expect(gaps[0].enrichment.applyVia.some((c) => c.includes('--type tests'))).toBe(true)
  })

  // The load-bearing test: applying the enrichment closes the gap deterministically,
  // no matter which driver did it.
  it('CLOSURE: enriching the graph removes the gap and flips ready', () => {
    // Start: broken (no task) → required gap, not ready.
    let g = doc([REQ], [])
    let report = buildGapReport(detectTraceability(g))
    expect(report.ready).toBe(false)
    expect(report.byKind.traceability_break).toBe(1)

    // Driver runs `agf edge add --from t1 --to r1 --type implements` (+ adds task).
    g = doc([REQ, TASK], [{ from: 't1', to: 'r1', relationType: 'implements' }])
    report = buildGapReport(detectTraceability(g))
    expect(report.ready).toBe(true) // required gap gone; only a recommended one remains
    expect(report.gaps.every((gap) => gap.severity === 'recommended')).toBe(true)

    // Driver adds the test node + `tests` edge.
    g = doc(
      [REQ, TASK, TEST],
      [
        { from: 't1', to: 'r1', relationType: 'implements' },
        { from: 'x1', to: 't1', relationType: 'tests' },
      ],
    )
    report = buildGapReport(detectTraceability(g))
    expect(report.gaps).toEqual([])
    expect(report.ready).toBe(true)
    expect(report.score).toBe(100)
  })
})
