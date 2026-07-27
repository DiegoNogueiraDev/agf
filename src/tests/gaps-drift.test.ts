/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { estimateDrifts } from '../core/planner/reestimate.js'
import { detectEstimateDrift } from '../core/gaps/detect-estimate-drift.js'
import { detectDesignDrift } from '../core/gaps/detect-design-drift.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  status?: string
  xpSize?: string
  estimateMinutes?: number
}
interface MiniEdge {
  from: string
  to: string
  relationType: string
}
function doc(nodes: MiniNode[], edges: MiniEdge[] = []): GraphDocument {
  return { nodes, edges } as unknown as GraphDocument
}

describe('M9 — estimate drift', () => {
  it('flags an XL task estimated at 15min', () => {
    const drifts = estimateDrifts(
      doc([{ id: 't1', type: 'task', status: 'backlog', xpSize: 'XL', estimateMinutes: 15 }]),
    )
    expect(drifts.map((d) => d.node.id)).toEqual(['t1'])
  })

  it('does not flag a consistent M task (45min)', () => {
    expect(
      estimateDrifts(doc([{ id: 't1', type: 'task', status: 'backlog', xpSize: 'M', estimateMinutes: 45 }])),
    ).toEqual([])
  })

  it('does not flag a task missing size or estimate', () => {
    expect(estimateDrifts(doc([{ id: 't1', type: 'task', status: 'backlog', xpSize: 'M' }]))).toEqual([])
  })

  it('detectEstimateDrift emits an annotate gap', () => {
    const gaps = detectEstimateDrift(
      doc([{ id: 't1', type: 'task', status: 'backlog', xpSize: 'XS', estimateMinutes: 300 }]),
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('estimate_drift')
    expect(gaps[0].enrichment.action).toBe('annotate')
  })

  it('CLOSURE: fixing the estimate removes the gap', () => {
    let g = doc([{ id: 't1', type: 'task', status: 'backlog', xpSize: 'S', estimateMinutes: 200 }])
    expect(buildGapReport(detectEstimateDrift(g)).byKind.estimate_drift).toBe(1)
    g = doc([{ id: 't1', type: 'task', status: 'backlog', xpSize: 'S', estimateMinutes: 25 }])
    expect(buildGapReport(detectEstimateDrift(g)).gaps).toEqual([])
  })
})

describe('M8 — design drift (orphan ADRs)', () => {
  it('flags a decision not linked to any requirement', () => {
    const gaps = detectDesignDrift(
      doc([
        { id: 'r1', type: 'requirement' },
        { id: 'd1', type: 'decision' },
      ]),
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('design_drift')
    expect(gaps[0].nodeId).toBe('d1')
    expect(gaps[0].enrichment.applyVia[0]).toContain('agf edge add')
  })

  it('CLOSURE: linking the decision to a requirement removes the gap', () => {
    const nodes = [
      { id: 'r1', type: 'requirement' },
      { id: 'd1', type: 'decision' },
    ]
    expect(buildGapReport(detectDesignDrift(doc(nodes))).byKind.design_drift).toBe(1)
    const linked = doc(nodes, [{ from: 'd1', to: 'r1', relationType: 'related_to' }])
    expect(buildGapReport(detectDesignDrift(linked)).gaps).toEqual([])
  })
})
