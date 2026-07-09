/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { detectNfrSignals, missingNfrCategories } from '../core/analyzer/nfr-detector.js'
import { detectNfr } from '../core/gaps/detect-nfr.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  title: string
  description?: string
  tags?: string[]
  acceptanceCriteria?: string[]
}
function doc(nodes: MiniNode[]): GraphDocument {
  return { nodes, edges: [] } as unknown as GraphDocument
}

describe('M4 — NFR signal detection', () => {
  it('detects performance from "response time"', () => {
    const s = detectNfrSignals(doc([{ id: 'f', type: 'task', title: 'X', description: 'response time under 1s' }]))
    expect([...s]).toContain('performance')
  })

  it('detects security from "authentication"', () => {
    const s = detectNfrSignals(
      doc([{ id: 'f', type: 'task', title: 'Login', description: 'requires user authentication' }]),
    )
    expect([...s]).toContain('security')
  })

  it('missing when signalled but no NFR node covers it', () => {
    const g = doc([{ id: 'f', type: 'task', title: 'X', description: 'must scale to many concurrent users' }])
    expect(missingNfrCategories(g)).toContain('scalability')
  })

  it('addressed by an nfr-tagged requirement', () => {
    const g = doc([
      { id: 'f', type: 'task', title: 'X', description: 'low latency please' },
      { id: 'n', type: 'requirement', tags: ['nfr'], title: 'perf', description: 'p95 latency < 200ms' },
    ])
    expect(missingNfrCategories(g)).not.toContain('performance')
  })

  it('addressed by the NFR title convention (no tag needed)', () => {
    const g = doc([
      { id: 'f', type: 'task', title: 'X', description: 'needs encryption' },
      { id: 'n', type: 'requirement', title: 'NFR security: encrypt all data at rest' },
    ])
    expect(missingNfrCategories(g)).not.toContain('security')
  })
})

describe('M4 — detectNfr gaps', () => {
  it('emits an add_nodes gap for a missing NFR category', () => {
    const gaps = detectNfr(doc([{ id: 'f', type: 'task', title: 'X', description: 'p99 latency matters' }]))
    const perf = gaps.find((x) => x.evidence.includes('performance'))
    expect(perf).toBeDefined()
    expect(perf!.kind).toBe('missing_nfr')
    expect(perf!.severity).toBe('recommended')
    expect(perf!.enrichment.action).toBe('add_nodes')
    expect(perf!.enrichment.applyVia[0]).toContain('--tags nfr')
  })

  // Load-bearing closure: adding the NFR requirement removes the gap.
  it('CLOSURE: adding the NFR requirement removes the gap', () => {
    let g = doc([{ id: 'f', type: 'task', title: 'X', description: 'must handle high load' }])
    let report = buildGapReport(detectNfr(g))
    expect(report.byKind.missing_nfr).toBeGreaterThanOrEqual(1)

    g = doc([
      { id: 'f', type: 'task', title: 'X', description: 'must handle high load' },
      {
        id: 'n',
        type: 'requirement',
        tags: ['nfr'],
        title: 'NFR scalability',
        description: 'supports 1000 concurrent users',
      },
    ])
    report = buildGapReport(detectNfr(g))
    expect(report.byKind.missing_nfr).toBe(0)
  })
})
