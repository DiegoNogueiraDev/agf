/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Majority consensus — simple majority (floor(N/2)+1) over discrete, per-agent
 * votes. Consolidates the decisions of a swarm of N async workers into one
 * convergent verdict (LSTM §3: many workers updating asynchronously, a single
 * stable outcome). One vote per agent is enforced.
 *
 * This is the vote-level primitive (generic `Vote<T>[]`); the hooks-layer
 * `swarm-consensus-promoter` operates on a pre-computed tally instead.
 * Ported from graph-flow/core/swarm/consensus/majority.ts.
 */

import { McpGraphError } from '../../utils/errors.js'

export interface Vote<T> {
  agentId: string
  value: T
}

export interface ConsensusResult<T> {
  reached: boolean
  winner: T | null
  support: number
  threshold: number
  total: number
  /** Per-value tally for diagnostics. */
  tally: Record<string, number>
}

/** Simple-majority threshold for N voters: floor(N/2)+1. Throws when N<=0. */
export function majorityThreshold(n: number): number {
  if (n <= 0) {
    throw new McpGraphError(`majorityThreshold requires n > 0, got ${n}`)
  }
  return Math.floor(n / 2) + 1
}

/** Count occurrences of each distinct vote value. */
export function tallyVotes<T>(votes: Vote<T>[]): Map<T, number> {
  const counts = new Map<T, number>()
  for (const vote of votes) {
    counts.set(vote.value, (counts.get(vote.value) ?? 0) + 1)
  }
  return counts
}

/** Compute simple-majority consensus over per-agent votes. Rejects an empty
 * vote set and duplicate votes from the same agent. */
export function computeMajorityConsensus<T>(votes: Vote<T>[]): ConsensusResult<T> {
  if (votes.length === 0) {
    throw new McpGraphError('computeMajorityConsensus requires at least one vote')
  }
  const seen = new Set<string>()
  for (const vote of votes) {
    if (seen.has(vote.agentId)) {
      throw new McpGraphError(`Duplicate vote from agent: ${vote.agentId}`)
    }
    seen.add(vote.agentId)
  }

  const counts = tallyVotes(votes)
  const threshold = majorityThreshold(votes.length)

  let winner: T | null = null
  let support = 0
  for (const [value, count] of counts.entries()) {
    if (count >= threshold && count > support) {
      winner = value
      support = count
    }
  }

  const tally: Record<string, number> = {}
  for (const [value, count] of counts.entries()) {
    tally[String(value)] = count
  }

  return { reached: winner !== null, winner, support, threshold, total: votes.length, tally }
}
