/*!
 * Task node_0c2812e4b4a6 — GA genome + fitness over ACO params.
 *
 * AC1: decode(encode(g)) ≈ g (lossless round-trip within 1e-9)
 * AC2: clamp(g) fixes out-of-range genes (alpha:99→5, rho:-1→0)
 * AC3: fitness(g, stub) returns stub value (pure, no I/O)
 */

import { describe, it, expect } from 'vitest'
import { encode, decode, clamp, fitness, type AcoGenome, type FitnessEvaluator } from '../core/economy/aco-genome.js'

const GENOME: AcoGenome = { alpha: 1.5, rho: 0.1, tauMin: 0.01, tauMax: 5.0 }

describe('aco-genome', () => {
  it('decode(encode(g)) ≈ g for each gene (AC1)', () => {
    const roundTripped = decode(encode(GENOME))
    expect(roundTripped.alpha).toBeCloseTo(GENOME.alpha, 9)
    expect(roundTripped.rho).toBeCloseTo(GENOME.rho, 9)
    expect(roundTripped.tauMin).toBeCloseTo(GENOME.tauMin, 9)
    expect(roundTripped.tauMax).toBeCloseTo(GENOME.tauMax, 9)
  })

  it('clamp fixes alpha=99 to max and rho=-1 to min (AC2)', () => {
    const g: AcoGenome = { alpha: 99, rho: -1, tauMin: 0.01, tauMax: 5 }
    const clamped = clamp(g)
    expect(clamped.alpha).toBeLessThanOrEqual(5)
    expect(clamped.rho).toBeGreaterThanOrEqual(0)
  })

  it('fitness returns stub value without I/O (AC3)', () => {
    const stub: FitnessEvaluator = (_g) => 0.7
    expect(fitness(GENOME, stub)).toBe(0.7)
  })

  it('encode produces a number array with same length as genome genes', () => {
    const encoded = encode(GENOME)
    expect(Array.isArray(encoded)).toBe(true)
    expect(encoded.length).toBe(4)
  })

  it('clamp keeps valid genome unchanged', () => {
    const clamped = clamp(GENOME)
    expect(clamped.alpha).toBe(GENOME.alpha)
    expect(clamped.rho).toBe(GENOME.rho)
  })
})
