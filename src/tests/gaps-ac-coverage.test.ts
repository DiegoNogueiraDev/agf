/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { GraphDocument } from '../core/graph/graph-types.js'
import { verifyAcCoverage, decomposedParents, significantTokens } from '../core/planner/ac-coverage.js'
import { detectAcCoverage } from '../core/gaps/detect-ac-coverage.js'
import { buildGapReport } from '../core/gaps/index.js'

interface MiniNode {
  id: string
  type: string
  parentId?: string
  acceptanceCriteria?: string[]
}
function doc(nodes: MiniNode[]): GraphDocument {
  return { nodes, edges: [] } as unknown as GraphDocument
}

// Parent with 2 ACs; children rephrase them in their own words.
const PARENT: MiniNode = {
  id: 'p',
  type: 'task',
  acceptanceCriteria: ['validate file size limit', 'store file in database'],
}
const CHILD_VALIDATE: MiniNode = {
  id: 'c1',
  type: 'subtask',
  parentId: 'p',
  acceptanceCriteria: ['validate the file size against the configured limit'],
}
const CHILD_STORE: MiniNode = {
  id: 'c2',
  type: 'subtask',
  parentId: 'p',
  acceptanceCriteria: ['store the uploaded file in the postgres database'],
}

describe('M2 — significantTokens', () => {
  it('keeps len≥4 non-stopwords, strips punctuation', () => {
    expect(significantTokens('Validate file size!')).toEqual(['validate', 'file', 'size'])
  })
  it('strips accents via NFD', () => {
    expect(significantTokens('Configuração válida')).toEqual(['configuracao', 'valida'])
  })
})

describe('M2 — verifyAcCoverage', () => {
  it('full coverage when every parent AC is restated by a child', () => {
    const r = verifyAcCoverage(doc([PARENT, CHILD_VALIDATE, CHILD_STORE]), 'p')
    expect(r.uncoveredAcs).toEqual([])
    expect(r.coverage).toBe(100)
  })

  it('flags a parent AC that no child covers', () => {
    const r = verifyAcCoverage(doc([PARENT, CHILD_VALIDATE]), 'p') // missing the "store" child
    expect(r.uncoveredAcs).toEqual(['store file in database'])
    expect(r.coverage).toBe(50)
  })

  it('parent with no AC → 100% (nothing to cover)', () => {
    const r = verifyAcCoverage(
      doc([
        { id: 'p', type: 'task' },
        { id: 'c', type: 'subtask', parentId: 'p' },
      ]),
      'p',
    )
    expect(r.coverage).toBe(100)
    expect(r.uncoveredAcs).toEqual([])
  })
})

describe('M2 — decomposedParents', () => {
  it('only returns tasks that have task/subtask children', () => {
    expect(decomposedParents(doc([PARENT, CHILD_VALIDATE]))).toEqual(['p'])
    expect(decomposedParents(doc([PARENT]))).toEqual([]) // leaf, not decomposed
  })
})

describe('M2 — detectAcCoverage gaps', () => {
  it('a leaf task (no children) produces no gap', () => {
    expect(detectAcCoverage(doc([PARENT]))).toEqual([])
  })

  it('an uncovered parent AC produces one recommended gap with add-subtask applyVia', () => {
    const gaps = detectAcCoverage(doc([PARENT, CHILD_VALIDATE]))
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('ac_coverage_break')
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].nodeId).toBe('p')
    expect(gaps[0].enrichment.applyVia[0]).toContain('agf node add --type subtask --parent p')
    expect(gaps[0].enrichment.applyVia[0]).toContain('store file in database')
  })

  // Load-bearing closure: adding the covering child removes the gap.
  it('CLOSURE: covering the missing AC removes the gap and stays ready', () => {
    let g = doc([PARENT, CHILD_VALIDATE])
    let report = buildGapReport(detectAcCoverage(g))
    expect(report.byKind.ac_coverage_break).toBe(1)
    expect(report.ready).toBe(true) // recommended → still ready, but penalized

    g = doc([PARENT, CHILD_VALIDATE, CHILD_STORE]) // driver runs `agf node add --type subtask …`
    report = buildGapReport(detectAcCoverage(g))
    expect(report.gaps).toEqual([])
    expect(report.score).toBe(100)
  })
})
