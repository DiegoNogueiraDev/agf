/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_695acd1e3c25 AC coverage: persist-healing.ts (pure functions only)
 *
 * AC1: GIVEN acute issue types WHEN classifyIssue THEN returns 'acute'
 * AC2: GIVEN chronic types WHEN classifyIssue THEN returns 'chronic'
 * AC3: computePatternConfidence: count=1→0.5, count=2→0.7, count=3→0.9, large→capped 1.0
 * AC4: computeSubgraphFingerprint: order-invariant, 16-char hex, different inputs differ
 */

import { describe, it, expect } from 'vitest'
import { classifyIssue, computeSubgraphFingerprint, computePatternConfidence } from '../core/skills/persist-healing.js'
import type { HealingIssueCategory } from '../core/skills/persist-healing.js'

// ── classifyIssue ─────────────────────────────────────────────────────────────

describe('classifyIssue', () => {
  describe('AC1: acute issue types', () => {
    const acuteCases: Array<[string, HealingIssueCategory]> = [
      ['broken_dependency', 'acute'],
      ['stuck_task', 'acute'],
      ['orphan_node', 'acute'],
      ['stale_in_progress', 'acute'],
      ['blocked_no_blocker', 'acute'],
    ]

    for (const [type, expected] of acuteCases) {
      it(`classifyIssue('${type}') → '${expected}'`, () => {
        expect(classifyIssue(type as never)).toBe(expected)
      })
    }
  })

  describe('AC2: chronic issue types', () => {
    const chronicCases: Array<[string, HealingIssueCategory]> = [
      ['cycle_detected', 'chronic'],
      ['missing_ac', 'chronic'],
      ['oversized_undecomposed', 'chronic'],
      ['done_with_pending_deps', 'chronic'],
    ]

    for (const [type, expected] of chronicCases) {
      it(`classifyIssue('${type}') → '${expected}'`, () => {
        expect(classifyIssue(type as never)).toBe(expected)
      })
    }
  })
})

// ── computePatternConfidence ──────────────────────────────────────────────────

describe('computePatternConfidence', () => {
  it('AC3: count=1 → 0.5 (naive)', () => {
    expect(computePatternConfidence(1)).toBeCloseTo(0.5, 5)
  })

  it('AC3: count=2 → 0.7 (recall threshold ≥ 0.6)', () => {
    expect(computePatternConfidence(2)).toBeCloseTo(0.7, 5)
  })

  it('AC3: count=3 → 0.9 (memory response ≥ 0.9)', () => {
    expect(computePatternConfidence(3)).toBeCloseTo(0.9, 5)
  })

  it('AC3: count=4 → capped at 1.0', () => {
    expect(computePatternConfidence(4)).toBeCloseTo(1.0, 5)
  })

  it('AC3: large count → still capped at 1.0', () => {
    expect(computePatternConfidence(100)).toBe(1.0)
  })

  it('confidence increases monotonically with count', () => {
    const c1 = computePatternConfidence(1)
    const c2 = computePatternConfidence(2)
    const c3 = computePatternConfidence(3)
    expect(c1).toBeLessThan(c2)
    expect(c2).toBeLessThan(c3)
  })
})

// ── computeSubgraphFingerprint ────────────────────────────────────────────────

describe('computeSubgraphFingerprint', () => {
  it('AC4: returns a 16-char hex string', () => {
    const fp = computeSubgraphFingerprint(['node_a', 'node_b'], ['depends_on'])
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('AC4: order-invariant for nodeIds', () => {
    const fp1 = computeSubgraphFingerprint(['node_a', 'node_b'], ['depends_on'])
    const fp2 = computeSubgraphFingerprint(['node_b', 'node_a'], ['depends_on'])
    expect(fp1).toBe(fp2)
  })

  it('AC4: order-invariant for edgeTypes', () => {
    const fp1 = computeSubgraphFingerprint(['node_a'], ['blocks', 'depends_on'])
    const fp2 = computeSubgraphFingerprint(['node_a'], ['depends_on', 'blocks'])
    expect(fp1).toBe(fp2)
  })

  it('AC4: different node sets produce different fingerprints', () => {
    const fp1 = computeSubgraphFingerprint(['node_a'], ['depends_on'])
    const fp2 = computeSubgraphFingerprint(['node_b'], ['depends_on'])
    expect(fp1).not.toBe(fp2)
  })

  it('AC4: different edge types produce different fingerprints', () => {
    const fp1 = computeSubgraphFingerprint(['node_a'], ['depends_on'])
    const fp2 = computeSubgraphFingerprint(['node_a'], ['blocks'])
    expect(fp1).not.toBe(fp2)
  })

  it('empty nodeIds and edgeTypes returns 16-char hash', () => {
    const fp = computeSubgraphFingerprint([], [])
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('deterministic — same inputs always same output', () => {
    const fp1 = computeSubgraphFingerprint(['x', 'y', 'z'], ['e1', 'e2'])
    const fp2 = computeSubgraphFingerprint(['x', 'y', 'z'], ['e1', 'e2'])
    expect(fp1).toBe(fp2)
  })
})
