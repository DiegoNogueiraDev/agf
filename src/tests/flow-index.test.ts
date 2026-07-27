/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeFlowIndex, computeLambdaFlow, decayWeight, DEFAULT_FLOW_TUNING } from '../core/context/flow-index.js'

describe('flow-index', () => {
  describe('DEFAULT_FLOW_TUNING', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_FLOW_TUNING.emaGain).toBe(0.34)
      expect(DEFAULT_FLOW_TUNING.resetFactor).toBe(0)
      expect(DEFAULT_FLOW_TUNING.partialFactor).toBe(0.5)
    })
  })

  describe('computeFlowIndex', () => {
    it('returns streak=0 and phi=0 for empty outcomes', () => {
      const state = computeFlowIndex([])
      expect(state.phi).toBe(0)
      expect(state.streak).toBe(0)
      expect(state.sampleCount).toBe(0)
    })

    it('increases phi with consecutive successes', () => {
      const state = computeFlowIndex(['success', 'success', 'success'])
      expect(state.phi).toBeGreaterThan(0)
      expect(state.streak).toBe(3)
    })

    it('resets streak when most recent outcome is failure', () => {
      // Most recent first: failure is newest
      const state = computeFlowIndex(['failure'])
      expect(state.streak).toBe(0)
    })

    it('counts trailing successes from newest', () => {
      // Only the first (most recent) is success; the immediate next is failure
      const state = computeFlowIndex(['success', 'failure', 'success'])
      expect(state.streak).toBe(1) // only newest is success
    })

    it('resets phi on failure with resetFactor=0', () => {
      const state = computeFlowIndex(['failure'])
      expect(state.phi).toBe(0)
    })

    it('handles partial outcomes with damping', () => {
      const state = computeFlowIndex(['partial', 'partial'])
      expect(state.phi).toBeGreaterThanOrEqual(0)
    })

    it('clamps phi to [0, 1]', () => {
      const state = computeFlowIndex([
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
        'success',
      ])
      expect(state.phi).toBeLessThanOrEqual(1)
      expect(state.phi).toBeGreaterThanOrEqual(0)
    })
  })

  describe('computeLambdaFlow', () => {
    it('returns baseline when phi=0', () => {
      expect(computeLambdaFlow(0, 0.3, 0.5)).toBe(0.3)
    })

    it('adds alpha*phi to baseline', () => {
      expect(computeLambdaFlow(0.5, 0.3, 0.5)).toBe(0.55)
    })

    it('works with zero alpha', () => {
      expect(computeLambdaFlow(1, 0.5, 0)).toBe(0.5)
    })
  })

  describe('decayWeight', () => {
    it('returns 1 at distance 0', () => {
      expect(decayWeight(1, 0)).toBe(1)
    })

    it('decreases with distance', () => {
      expect(decayWeight(1, 2)).toBeLessThan(decayWeight(1, 1))
    })

    it('decreases with lambda', () => {
      expect(decayWeight(2, 1)).toBeLessThan(decayWeight(1, 1))
    })

    it('approaches 0 with large lambda*distance', () => {
      expect(decayWeight(10, 10)).toBeCloseTo(0, 5)
    })
  })
})
