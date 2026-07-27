/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { fuseSensors, type DimensionScores } from '../core/harness/sensor-fusion.js'

describe('fuseSensors', () => {
  it('returns empty when all dimensions healthy (>= 85)', () => {
    const scores: DimensionScores = {
      types: 90,
      tests: 95,
      naming: 85,
      errors: 100,
      context: 88,
      docs: 90,
      fitness: 92,
    }
    expect(fuseSensors(scores)).toEqual([])
  })

  it('returns cluster for weak type & error dimensions', () => {
    const scores: DimensionScores = {
      types: 30,
      tests: 90,
      naming: 95,
      errors: 40,
      context: 95,
      docs: 90,
      fitness: 90,
    }
    const clusters = fuseSensors(scores)
    expect(clusters.length).toBeGreaterThan(0)
    const codeQuality = clusters.find((c) => c.rootCause.includes('Type safety'))
    expect(codeQuality).toBeDefined()
    expect(codeQuality!.affectedDimensions).toContain('types')
    expect(codeQuality!.affectedDimensions).toContain('errors')
  })

  it('sorts clusters by impact descending', () => {
    const scores: DimensionScores = {
      types: 0,
      tests: 0,
      naming: 0,
      errors: 0,
      context: 0,
      docs: 0,
      fitness: 0,
    }
    const clusters = fuseSensors(scores)
    expect(clusters.length).toBeGreaterThan(1)
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i - 1].combinedImpact).toBeGreaterThanOrEqual(clusters[i].combinedImpact)
    }
  })

  it('applies MIN_GAP_THRESHOLD (5)', () => {
    // Scores just below 70 with low weight should not produce clusters
    const scores: DimensionScores = {
      types: 69,
      tests: 100,
      naming: 69,
      errors: 100,
      context: 69,
      docs: 100,
      fitness: 100,
    }
    // types gap=31, weight=0.25 → impact=7.75 (above threshold)
    // naming gap=31, weight=0.1 → impact=3.1 (below threshold → cluster dropped)
    // context gap=31, weight=0.05 → impact=1.55 (below threshold → cluster dropped)
    const clusters = fuseSensors(scores)
    const namingCluster = clusters.find((c) => c.affectedDimensions.includes('naming'))
    expect(namingCluster).toBeUndefined()
  })
})
