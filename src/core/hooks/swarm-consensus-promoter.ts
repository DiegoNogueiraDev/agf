/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T14 — Swarm consensus → auto-promotion bridge.
 * Pure: dado vote tally, decide se majority consensus foi atingido e
 * monta o payload do evento swarm:consensus-reached. Caller (handler do
 * canal) invoca verifyAndPromote (E20) para promover ancestrais.
 */

export const CONSENSUS_MAJORITY_RATIO = 0.5

export interface VoteTally {
  [option: string]: number
}

export interface ConsensusInput {
  sessionId: string
  nodeId: string
  votes: VoteTally
  /** Ratio of total votes the winner must exceed. Default 0.5 (strict majority). */
  majorityRatio?: number
}

export interface ConsensusResult {
  reached: boolean
  winner: string | null
  support: number
  total: number
  payload: ConsensusEventPayload | null
}

export interface ConsensusEventPayload {
  sessionId: string
  nodeId: string
  consensus: {
    winner: string
    support: number
    total: number
  }
}

/** isSwarmAutoPromoteDisabled —  */
export function isSwarmAutoPromoteDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_SWARM_AUTO_PROMOTE === 'off'
}

/** computeMajorityConsensus —  */
export function computeMajorityConsensus(input: ConsensusInput): ConsensusResult {
  const ratio = input.majorityRatio ?? CONSENSUS_MAJORITY_RATIO
  const entries = Object.entries(input.votes)
  if (entries.length === 0) {
    return { reached: false, winner: null, support: 0, total: 0, payload: null }
  }
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  if (total === 0) {
    return { reached: false, winner: null, support: 0, total: 0, payload: null }
  }
  // Pick highest, deterministic by lexicographic key on tie.
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const [winner, support] = entries[0]
  const reached = support / total > ratio
  return {
    reached,
    winner: reached ? winner : null,
    support,
    total,
    payload: reached
      ? {
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          consensus: { winner, support, total },
        }
      : null,
  }
}
