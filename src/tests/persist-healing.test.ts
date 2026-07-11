import { describe, it, expect } from 'vitest'
import { classifyIssue, computeSubgraphFingerprint, computePatternConfidence } from '../core/skills/persist-healing.js'

describe('classifyIssue', () => {
  it('classifies broken_dependency as acute', () => {
    expect(classifyIssue('broken_dependency')).toBe('acute')
  })

  it('classifies stuck_task as acute', () => {
    expect(classifyIssue('stuck_task')).toBe('acute')
  })

  it('classifies orphan_node as acute', () => {
    expect(classifyIssue('orphan_node')).toBe('acute')
  })

  it('classifies stale_in_progress as acute', () => {
    expect(classifyIssue('stale_in_progress')).toBe('acute')
  })

  it('classifies blocked_no_blocker as acute', () => {
    expect(classifyIssue('blocked_no_blocker')).toBe('acute')
  })

  it('classifies cycle_detected as chronic', () => {
    expect(classifyIssue('cycle_detected')).toBe('chronic')
  })

  it('classifies missing_ac as chronic', () => {
    expect(classifyIssue('missing_ac')).toBe('chronic')
  })

  it('classifies oversized_undecomposed as chronic', () => {
    expect(classifyIssue('oversized_undecomposed')).toBe('chronic')
  })

  it('classifies done_with_pending_deps as chronic', () => {
    expect(classifyIssue('done_with_pending_deps')).toBe('chronic')
  })
})

describe('computeSubgraphFingerprint', () => {
  it('returns a 16-char hex string', () => {
    const fp = computeSubgraphFingerprint(['a', 'b'], ['dep'])
    expect(typeof fp).toBe('string')
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic — same inputs same output', () => {
    const fp1 = computeSubgraphFingerprint(['x', 'y'], ['rel'])
    const fp2 = computeSubgraphFingerprint(['x', 'y'], ['rel'])
    expect(fp1).toBe(fp2)
  })

  it('is order-independent for node and edge arrays', () => {
    const fp1 = computeSubgraphFingerprint(['a', 'b'], ['e1', 'e2'])
    const fp2 = computeSubgraphFingerprint(['b', 'a'], ['e2', 'e1'])
    expect(fp1).toBe(fp2)
  })

  it('differs for different inputs', () => {
    const fp1 = computeSubgraphFingerprint(['a'], ['x'])
    const fp2 = computeSubgraphFingerprint(['b'], ['x'])
    expect(fp1).not.toBe(fp2)
  })

  it('handles empty arrays', () => {
    const fp = computeSubgraphFingerprint([], [])
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('computePatternConfidence', () => {
  it('returns 0.3 for 0 occurrences', () => {
    expect(computePatternConfidence(0)).toBeCloseTo(0.3)
  })

  it('returns 0.5 for 1 occurrence', () => {
    expect(computePatternConfidence(1)).toBeCloseTo(0.5)
  })

  it('caps at 1.0', () => {
    expect(computePatternConfidence(100)).toBe(1.0)
  })

  it('increases with more occurrences (up to cap)', () => {
    const c1 = computePatternConfidence(1)
    const c2 = computePatternConfidence(2)
    expect(c2).toBeGreaterThan(c1)
  })

  it('never exceeds 1.0', () => {
    for (const n of [0, 1, 5, 10, 50]) {
      expect(computePatternConfidence(n)).toBeLessThanOrEqual(1.0)
    }
  })
})
