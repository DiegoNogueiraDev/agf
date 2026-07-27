/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  decideFlaky,
  shouldSampleFlakyCheck,
  isFlakyDetectorDisabled,
  getSampleRate,
} from '../core/hooks/flaky-test-detector.js'

describe('flaky-test-detector', () => {
  describe('isFlakyDetectorDisabled', () => {
    it('returns false by default', () => {
      expect(isFlakyDetectorDisabled({})).toBe(false)
    })

    it('returns true when set to off', () => {
      expect(isFlakyDetectorDisabled({ MCP_GRAPH_FLAKY_DETECTOR: 'off' })).toBe(true)
    })
  })

  describe('getSampleRate', () => {
    it('returns default 0.05 when not set', () => {
      expect(getSampleRate({})).toBe(0.05)
    })

    it('parses value from env', () => {
      expect(getSampleRate({ MCP_GRAPH_FLAKY_SAMPLE_RATE: '0.1' })).toBe(0.1)
    })

    it('returns default for invalid values', () => {
      expect(getSampleRate({ MCP_GRAPH_FLAKY_SAMPLE_RATE: '-1' })).toBe(0.05)
      expect(getSampleRate({ MCP_GRAPH_FLAKY_SAMPLE_RATE: '2' })).toBe(0.05)
      expect(getSampleRate({ MCP_GRAPH_FLAKY_SAMPLE_RATE: 'abc' })).toBe(0.05)
    })
  })

  describe('shouldSampleFlakyCheck', () => {
    it('returns false when disabled', () => {
      const env = { MCP_GRAPH_FLAKY_DETECTOR: 'off' }
      expect(shouldSampleFlakyCheck(() => 0.01, env)).toBe(false)
    })

    it('returns false when rng above sample rate', () => {
      expect(shouldSampleFlakyCheck(() => 0.5)).toBe(false)
    })

    it('returns true when rng below sample rate', () => {
      expect(shouldSampleFlakyCheck(() => 0.01)).toBe(true)
    })
  })

  describe('decideFlaky', () => {
    it('is not flaky for all pass', () => {
      expect(decideFlaky({ outcomes: ['pass', 'pass', 'pass'] })).toEqual({
        flaky: false,
        passes: 3,
        fails: 0,
      })
    })

    it('is not flaky for all fail', () => {
      expect(decideFlaky({ outcomes: ['fail', 'fail'] })).toEqual({
        flaky: false,
        passes: 0,
        fails: 2,
      })
    })

    it('is flaky for mixed results', () => {
      expect(decideFlaky({ outcomes: ['pass', 'fail', 'pass'] })).toEqual({
        flaky: true,
        passes: 2,
        fails: 1,
      })
    })

    it('handles empty array', () => {
      expect(decideFlaky({ outcomes: [] })).toEqual({
        flaky: false,
        passes: 0,
        fails: 0,
      })
    })
  })
})
