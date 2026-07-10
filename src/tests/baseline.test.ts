/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_47ae046ffb01 — C72-T1: tests for simulateProviders + formatSimulate
 *
 * AC: simulateProviders returns sorted rows; formatSimulate returns string[];
 *     zero-token edge case returns early message; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { simulateProviders, formatSimulate } from '../core/observability/baseline.js'

describe('simulateProviders', () => {
  it('returns an object with expected keys', () => {
    const report = simulateProviders(10000, 0, 5000)
    expect(report).toHaveProperty('tokensIn')
    expect(report).toHaveProperty('tokensOut')
    expect(report).toHaveProperty('cachedTokens')
    expect(report).toHaveProperty('rows')
    expect(report).toHaveProperty('cheapestUsd')
    expect(report).toHaveProperty('worstUsd')
    expect(report).toHaveProperty('spread')
  })

  it('tokensIn and tokensOut are preserved in the report', () => {
    const report = simulateProviders(10000, 500, 5000)
    expect(report.tokensIn).toBe(10000)
    expect(report.tokensOut).toBe(5000)
    expect(report.cachedTokens).toBe(500)
  })

  it('rows are sorted by usd descending (most expensive first)', () => {
    const report = simulateProviders(10000, 0, 5000)
    for (let i = 1; i < report.rows.length; i++) {
      expect(report.rows[i - 1].usd).toBeGreaterThanOrEqual(report.rows[i].usd)
    }
  })

  it('rows array is non-empty', () => {
    const report = simulateProviders(10000, 0, 5000)
    expect(report.rows.length).toBeGreaterThan(0)
  })

  it('each row has model, usd, inputPer1M, outputPer1M, factor', () => {
    const report = simulateProviders(1000, 0, 500)
    const row = report.rows[0]
    expect(row).toHaveProperty('model')
    expect(row).toHaveProperty('usd')
    expect(row).toHaveProperty('inputPer1M')
    expect(row).toHaveProperty('outputPer1M')
    expect(row).toHaveProperty('factor')
  })

  it('cheapestUsd <= worstUsd', () => {
    const report = simulateProviders(10000, 0, 5000)
    expect(report.cheapestUsd).toBeLessThanOrEqual(report.worstUsd)
  })

  it('spread is worstUsd / cheapestUsd when both > 0', () => {
    const report = simulateProviders(100000, 0, 50000)
    if (report.cheapestUsd > 0) {
      const expectedSpread = report.worstUsd / report.cheapestUsd
      expect(report.spread).toBeCloseTo(expectedSpread, 5)
    }
  })

  it('zero tokens returns a report (not throw)', () => {
    expect(() => simulateProviders(0, 0, 0)).not.toThrow()
    const report = simulateProviders(0, 0, 0)
    expect(report).toHaveProperty('rows')
  })
})

describe('formatSimulate', () => {
  it('returns an array of strings', () => {
    const report = simulateProviders(10000, 0, 5000)
    const lines = formatSimulate(report)
    expect(Array.isArray(lines)).toBe(true)
    expect(lines.every((l) => typeof l === 'string')).toBe(true)
  })

  it('non-empty array for non-zero tokens', () => {
    const report = simulateProviders(10000, 0, 5000)
    const lines = formatSimulate(report)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('zero-token report returns early message about missing data', () => {
    const zeroReport = simulateProviders(0, 0, 0)
    const lines = formatSimulate(zeroReport)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toContain('Sem dados')
  })
})
