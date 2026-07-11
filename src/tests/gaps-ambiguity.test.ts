/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { classifyAmbiguity } from '../core/analyzer/ambiguity-gate.js'
import { detectAmbiguity } from '../core/gaps/detect-ambiguity.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  acceptanceCriteria?: string[]
}
function doc(nodes: MiniNode[]): GraphDocument {
  return { nodes, edges: [] } as unknown as GraphDocument
}

describe('M6 — classifyAmbiguity', () => {
  it('no weasel terms → specified', () => {
    expect(classifyAmbiguity('Returns the user profile as JSON').level).toBe('specified')
  })

  it('weasel terms + no concreteness → unspecified', () => {
    const r = classifyAmbiguity('The UI should be fast and intuitive')
    expect(r.level).toBe('unspecified')
    expect(r.vagueTerms).toContain('fast')
    expect(r.vagueTerms).toContain('intuitive')
  })

  it('weasel term but measurable → partially', () => {
    expect(classifyAmbiguity('Response is fast, under 200ms').level).toBe('partially')
  })

  it('matches hyphenated phrases (user-friendly)', () => {
    expect(classifyAmbiguity('The form must be user-friendly').vagueTerms).toContain('user-friendly')
  })

  it('whole-word match — "bombardment" does NOT match "bom"', () => {
    expect(classifyAmbiguity('Survives a bombardment of concurrent requests').level).toBe('specified')
  })
})

describe('M6 — detectAmbiguity gaps', () => {
  it('flags an unspecified AC with a clarify enrichment (+ decision applyVia)', () => {
    const gaps = detectAmbiguity(doc([{ id: 't1', type: 'task', acceptanceCriteria: ['must be fast and robust'] }]))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('ambiguous_ac')
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].enrichment.action).toBe('clarify')
    expect(gaps[0].enrichment.applyVia.some((c) => c.includes('--type decision'))).toBe(true)
  })

  it('does not flag a measurable (partially) AC', () => {
    const gaps = detectAmbiguity(doc([{ id: 't1', type: 'task', acceptanceCriteria: ['Loads fast, under 100ms'] }]))
    expect(gaps).toEqual([])
  })

  // Load-bearing closure: making the AC measurable resolves the ambiguity.
  it('CLOSURE: making the AC measurable removes the gap', () => {
    let g = doc([{ id: 't1', type: 'task', acceptanceCriteria: ['should be fast'] }])
    let report = buildGapReport(detectAmbiguity(g))
    expect(report.byKind.ambiguous_ac).toBe(1)

    g = doc([{ id: 't1', type: 'task', acceptanceCriteria: ['p95 latency under 200ms'] }])
    report = buildGapReport(detectAmbiguity(g))
    expect(report.gaps).toEqual([])
  })
})
