/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_47e5bed32d42 — vote-level majority consensus. Consolidates DoD/decision
 * votes from a swarm of N workers (LSTM §3: many async workers, one convergent
 * decision). One vote per agent, threshold floor(N/2)+1.
 * Ported from graph-flow/core/swarm/consensus/majority.ts.
 */
import { describe, it, expect } from 'vitest'
import { computeMajorityConsensus, majorityThreshold, tallyVotes } from '../core/swarm/consensus/majority.js'

describe('majority consensus (#node_47e5bed32d42)', () => {
  it('majorityThreshold is floor(N/2)+1 and rejects N<=0', () => {
    expect(majorityThreshold(1)).toBe(1)
    expect(majorityThreshold(3)).toBe(2)
    expect(majorityThreshold(4)).toBe(3)
    expect(() => majorityThreshold(0)).toThrow()
  })

  it('reaches consensus when a value clears the threshold', () => {
    const r = computeMajorityConsensus([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'pass' },
      { agentId: 'a3', value: 'fail' },
    ])
    expect(r.reached).toBe(true)
    expect(r.winner).toBe('pass')
    expect(r.support).toBe(2)
    expect(r.threshold).toBe(2)
    expect(r.total).toBe(3)
    expect(r.tally).toEqual({ pass: 2, fail: 1 })
  })

  it('no consensus when the vote splits below threshold', () => {
    const r = computeMajorityConsensus([
      { agentId: 'a1', value: 'x' },
      { agentId: 'a2', value: 'y' },
    ])
    expect(r.reached).toBe(false)
    expect(r.winner).toBeNull()
  })

  it('rejects duplicate votes from the same agent', () => {
    expect(() =>
      computeMajorityConsensus([
        { agentId: 'a1', value: 'pass' },
        { agentId: 'a1', value: 'fail' },
      ]),
    ).toThrow(/Duplicate vote/)
  })

  it('throws on an empty vote set', () => {
    expect(() => computeMajorityConsensus([])).toThrow()
  })

  it('tallyVotes counts occurrences per value', () => {
    const counts = tallyVotes([
      { agentId: 'a1', value: 'pass' },
      { agentId: 'a2', value: 'pass' },
      { agentId: 'a3', value: 'fail' },
    ])
    expect(counts.get('pass')).toBe(2)
    expect(counts.get('fail')).toBe(1)
  })
})
