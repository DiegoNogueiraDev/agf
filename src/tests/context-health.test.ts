/*!
 * Task node_94f1e5aff5af — context health score.
 *
 * AC1: GIVEN session messages, WHEN computeContextHealthScore called,
 *      THEN returns score 0-100 based on relevance, freshness, size
 * AC2: GIVEN health score < 50, THEN suggestCompression === true
 * AC3: GIVEN health score > 80, THEN suggestCompression === false (session healthy)
 */

import { describe, it, expect } from 'vitest'
import { computeContextHealthScore, type ContextHealthReport } from '../core/context/context-health.js'

function makeMessages(n: number, wordsEach = 20): Array<{ role: string; content: string; createdAt?: number }> {
  const content = 'word '.repeat(wordsEach)
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content,
    createdAt: Date.now() - (n - i) * 1000,
  }))
}

describe('computeContextHealthScore', () => {
  it('returns score between 0 and 100 (AC1)', () => {
    const msgs = makeMessages(5)
    const report: ContextHealthReport = computeContextHealthScore(msgs)
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
  })

  it('large overflowing context yields low score and suggestCompression=true (AC2)', () => {
    // ~200k tokens fills context → low size score → overall score < 50
    const msgs = makeMessages(350, 500)
    const report = computeContextHealthScore(msgs)
    expect(report.suggestCompression).toBe(true)
    expect(report.score).toBeLessThan(50)
  })

  it('small fresh context yields high score and suggestCompression=false (AC3)', () => {
    const msgs = makeMessages(5, 10)
    const report = computeContextHealthScore(msgs)
    expect(report.suggestCompression).toBe(false)
    expect(report.score).toBeGreaterThan(80)
  })

  it('report has numeric relevance, freshness, size dimensions (AC1)', () => {
    const report = computeContextHealthScore(makeMessages(3))
    expect(typeof report.dimensions.relevance).toBe('number')
    expect(typeof report.dimensions.freshness).toBe('number')
    expect(typeof report.dimensions.size).toBe('number')
  })
})
