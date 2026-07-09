import { describe, it, expect } from 'vitest'
import { majorityThreshold, tallyVotes, computeMajorityConsensus } from '../core/swarm/consensus/majority.js'
import type { Vote } from '../core/swarm/consensus/majority.js'

describe('majorityThreshold', () => {
  it('returns 1 for n=1', () => {
    expect(majorityThreshold(1)).toBe(1)
  })

  it('returns 2 for n=2', () => {
    expect(majorityThreshold(2)).toBe(2)
  })

  it('returns 2 for n=3', () => {
    expect(majorityThreshold(3)).toBe(2)
  })

  it('returns 3 for n=4', () => {
    expect(majorityThreshold(4)).toBe(3)
  })

  it('returns 3 for n=5', () => {
    expect(majorityThreshold(5)).toBe(3)
  })

  it('throws for n=0', () => {
    expect(() => majorityThreshold(0)).toThrow()
  })
})

describe('tallyVotes', () => {
  function makeVote<T>(value: T, agentId = 'a1'): Vote<T> {
    return { agentId, value }
  }

  it('returns empty Map for no votes', () => {
    const result = tallyVotes<string>([])
    expect(result.size).toBe(0)
  })

  it('counts a single vote', () => {
    const result = tallyVotes([makeVote('approve')])
    expect(result.get('approve')).toBe(1)
  })

  it('tallies multiple votes for same value', () => {
    const votes = [makeVote('yes', 'a1'), makeVote('yes', 'a2'), makeVote('no', 'a3')]
    const result = tallyVotes(votes)
    expect(result.get('yes')).toBe(2)
    expect(result.get('no')).toBe(1)
  })

  it('returns a Map', () => {
    const result = tallyVotes([makeVote('x')])
    expect(result instanceof Map).toBe(true)
  })
})

describe('computeMajorityConsensus', () => {
  function makeVote<T>(value: T, agentId = 'a1'): Vote<T> {
    return { agentId, value }
  }

  it('throws for empty votes', () => {
    expect(() => computeMajorityConsensus<string>([])).toThrow()
  })

  it('returns reached=true when majority agrees', () => {
    const votes = [makeVote('accept', 'a1'), makeVote('accept', 'a2'), makeVote('reject', 'a3')]
    const result = computeMajorityConsensus(votes)
    expect(result.reached).toBe(true)
    expect(result.winner).toBe('accept')
  })

  it('tally is a plain Record', () => {
    const result = computeMajorityConsensus([makeVote('x', 'a1')])
    expect(typeof result.tally).toBe('object')
    expect(result.tally['x']).toBe(1)
  })

  it('reached=false when votes are tied', () => {
    const votes = [makeVote('a', 'a1'), makeVote('b', 'a2')]
    const result = computeMajorityConsensus(votes)
    expect(result.reached).toBe(false)
    expect(result.winner).toBeNull()
  })

  it('throws for duplicate agentId', () => {
    const votes = [makeVote('x', 'a1'), makeVote('y', 'a1')]
    expect(() => computeMajorityConsensus(votes)).toThrow()
  })

  it('returns correct support count', () => {
    const votes = [makeVote('yes', 'a1'), makeVote('yes', 'a2'), makeVote('no', 'a3')]
    const result = computeMajorityConsensus(votes)
    expect(result.support).toBe(2)
    expect(result.threshold).toBe(2)
    expect(result.total).toBe(3)
  })
})
