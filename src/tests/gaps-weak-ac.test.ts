/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { scoreAcTestability } from '../core/analyzer/ac-testability.js'
import { detectWeakAc } from '../core/gaps/detect-weak-ac.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  acceptanceCriteria?: string[]
}
function doc(nodes: MiniNode[]): GraphDocument {
  return { nodes, edges: [] } as unknown as GraphDocument
}

describe('M3 — scoreAcTestability', () => {
  it('GWT structure is testable', () => {
    const r = scoreAcTestability('Given a user, When they log in, Then a token is returned')
    expect(r.hasStructure).toBe(true)
    expect(r.weak).toBe(false)
  })

  it('free-text with an action verb is testable', () => {
    const r = scoreAcTestability('Returns HTTP 200 on success')
    expect(r.hasObservableOutcome).toBe(true)
    expect(r.weak).toBe(false)
  })

  // The headline improvement: the legacy /should/ regex passes this; we flag it.
  it('a modal-only ("should be fast") AC is WEAK (no observable outcome)', () => {
    const r = scoreAcTestability('The system should be fast and reliable')
    expect(r.hasStructure).toBe(false)
    expect(r.hasObservableOutcome).toBe(false)
    expect(r.weak).toBe(true)
  })

  it('a vague free-text AC is weak', () => {
    expect(scoreAcTestability('Handle errors appropriately').weak).toBe(true)
  })
})

describe('M3 — detectWeakAc gaps', () => {
  it('flags a weak AC with a rewrite_ac enrichment', () => {
    const gaps = detectWeakAc(doc([{ id: 't1', type: 'task', acceptanceCriteria: ['The UI looks good'] }]))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('weak_ac_testability')
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].enrichment.action).toBe('rewrite_ac')
    expect(gaps[0].enrichment.applyVia[0]).toContain('agf node update t1 --ac')
  })

  it('does not flag a strong GWT AC', () => {
    const gaps = detectWeakAc(
      doc([{ id: 't1', type: 'task', acceptanceCriteria: ['Given X, When Y, Then Z is displayed'] }]),
    )
    expect(gaps).toEqual([])
  })

  // Load-bearing closure: rewriting the weak AC removes the gap.
  it('CLOSURE: rewriting the AC to GWT removes the gap', () => {
    let g = doc([{ id: 't1', type: 'task', acceptanceCriteria: ['works well'] }])
    let report = buildGapReport(detectWeakAc(g))
    expect(report.byKind.weak_ac_testability).toBe(1)

    g = doc([{ id: 't1', type: 'task', acceptanceCriteria: ['Given a request, When processed, Then it returns 200'] }])
    report = buildGapReport(detectWeakAc(g))
    expect(report.gaps).toEqual([])
  })
})
