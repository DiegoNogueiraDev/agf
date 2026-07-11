/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeMajorityConsensus, isSwarmAutoPromoteDisabled } from '../core/hooks/swarm-consensus-promoter.js'

describe('swarm-consensus-promoter', () => {
  describe('isSwarmAutoPromoteDisabled', () => {
    it('returns false by default', () => {
      expect(isSwarmAutoPromoteDisabled({})).toBe(false)
    })

    it('returns true when set to off', () => {
      expect(isSwarmAutoPromoteDisabled({ MCP_GRAPH_SWARM_AUTO_PROMOTE: 'off' })).toBe(true)
    })
  })

  describe('computeMajorityConsensus', () => {
    it('returns not reached for empty votes', () => {
      const r = computeMajorityConsensus({ sessionId: 's1', nodeId: 'n1', votes: {} })
      expect(r.reached).toBe(false)
      expect(r.winner).toBeNull()
      expect(r.payload).toBeNull()
    })

    it('returns not reached when all votes are zero', () => {
      const r = computeMajorityConsensus({ sessionId: 's1', nodeId: 'n1', votes: { a: 0, b: 0 } })
      expect(r.reached).toBe(false)
    })

    it('reaches consensus when majority exceeds ratio', () => {
      const r = computeMajorityConsensus({ sessionId: 's1', nodeId: 'n1', votes: { a: 3, b: 1 } })
      expect(r.reached).toBe(true)
      expect(r.winner).toBe('a')
      expect(r.support).toBe(3)
      expect(r.total).toBe(4)
      expect(r.payload).not.toBeNull()
      expect(r.payload!.consensus.winner).toBe('a')
    })

    it('does not reach consensus when equal votes', () => {
      const r = computeMajorityConsensus({ sessionId: 's1', nodeId: 'n1', votes: { a: 2, b: 2 } })
      expect(r.reached).toBe(false)
      expect(r.winner).toBeNull()
    })

    it('uses custom majority ratio', () => {
      const r = computeMajorityConsensus({
        sessionId: 's1',
        nodeId: 'n1',
        votes: { a: 4, b: 2 },
        majorityRatio: 0.6,
      })
      expect(r.reached).toBe(true)
      expect(r.winner).toBe('a')
    })

    it('fails when custom ratio not met', () => {
      const r = computeMajorityConsensus({
        sessionId: 's1',
        nodeId: 'n1',
        votes: { a: 3, b: 3 },
        majorityRatio: 0.6,
      })
      expect(r.reached).toBe(false)
    })

    it('ties broken by lexicographic order', () => {
      const r = computeMajorityConsensus({
        sessionId: 's1',
        nodeId: 'n1',
        votes: { a: 6, c: 6 },
        majorityRatio: 0.4,
      })
      expect(r.winner).toBe('a')
    })
  })
})
