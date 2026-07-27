/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_2575bc077512 — C71-T1: tests for calculateQualityScore + getSourceReliabilityWeight
 *
 * AC: calculateQualityScore returns 0-1; fresh doc > stale doc;
 *     docs sourceType reliability=0.9; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { calculateQualityScore, getSourceReliabilityWeight } from '../core/rag/knowledge-quality.js'
import type { KnowledgeDocument } from '../schemas/knowledge.schema.js'

function makeDoc(overrides: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: 'doc_1',
    projectId: 'proj_1',
    sourceType: 'docs',
    sourceId: 'src_1',
    title: 'Test Document',
    content: 'A'.repeat(500),
    contentHash: 'abc123',
    chunkIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    qualityScore: undefined,
    usageCount: 0,
    ...overrides,
  }
}

describe('calculateQualityScore', () => {
  it('returns a number between 0 and 1 for a fresh doc', () => {
    const score = calculateQualityScore(makeDoc())
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('fresh doc scores higher than a 365-day-old doc', () => {
    const freshScore = calculateQualityScore(makeDoc())
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const staleScore = calculateQualityScore(makeDoc({ createdAt: oldDate, updatedAt: oldDate }))
    expect(freshScore).toBeGreaterThan(staleScore)
  })

  it('rich content (1000 chars) scores higher than sparse content (10 chars)', () => {
    const richScore = calculateQualityScore(makeDoc({ content: 'A'.repeat(1000) }))
    const sparseScore = calculateQualityScore(makeDoc({ content: 'A'.repeat(10) }))
    expect(richScore).toBeGreaterThan(sparseScore)
  })

  it('high usage doc scores higher than zero-usage doc', () => {
    const usedScore = calculateQualityScore(makeDoc({ usageCount: 100 }))
    const unusedScore = calculateQualityScore(makeDoc({ usageCount: 0 }))
    expect(usedScore).toBeGreaterThan(unusedScore)
  })

  it('docs sourceType scores higher than ai_decision sourceType (reliability)', () => {
    const docsScore = calculateQualityScore(makeDoc({ sourceType: 'docs' }))
    const aiScore = calculateQualityScore(makeDoc({ sourceType: 'ai_decision' }))
    expect(docsScore).toBeGreaterThan(aiScore)
  })

  it('returns a number (not NaN)', () => {
    const score = calculateQualityScore(makeDoc())
    expect(Number.isNaN(score)).toBe(false)
  })

  it('clamped to [0, 1] even for extreme inputs', () => {
    const farFuture = new Date(Date.now() + 1000 * 24 * 60 * 60 * 1000).toISOString()
    const score = calculateQualityScore(
      makeDoc({ createdAt: farFuture, updatedAt: farFuture, content: 'A'.repeat(100000), usageCount: 99999 }),
    )
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('getSourceReliabilityWeight', () => {
  it('docs returns 0.9', () => {
    expect(getSourceReliabilityWeight('docs')).toBe(0.9)
  })

  it('prd returns 0.85', () => {
    expect(getSourceReliabilityWeight('prd')).toBe(0.85)
  })

  it('memory returns 0.8', () => {
    expect(getSourceReliabilityWeight('memory')).toBe(0.8)
  })

  it('ai_decision returns 0.6', () => {
    expect(getSourceReliabilityWeight('ai_decision')).toBe(0.6)
  })

  it('unknown source type returns a fallback (not NaN)', () => {
    const weight = getSourceReliabilityWeight('upload' as never)
    expect(typeof weight).toBe('number')
    expect(Number.isNaN(weight)).toBe(false)
  })

  it('all returned weights are between 0 and 1', () => {
    const types = ['docs', 'prd', 'memory', 'code_context', 'ai_decision'] as const
    for (const t of types) {
      const w = getSourceReliabilityWeight(t)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })
})
