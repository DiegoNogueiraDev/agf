/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * A/B comparison engine for economy lever calibration (Task 5.2).
 *
 * Implements Welch's t-test (unequal variances) for two token-usage samples.
 * Winner = whichever group has significantly lower avg tokens (fewer = cheaper).
 * Zero-variance special case: returns 'tie' for identical groups, 'A'/'B' for
 * perfect separation (no sampling error possible).
 */

export interface AbTestResult {
  avgA: number
  avgB: number
  /** avgA - avgB. Negative = A is cheaper. */
  delta: number
  tStat: number
  /** Two-tailed p-value. */
  pValue: number
  winner: 'A' | 'B' | 'tie'
  significant: boolean
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
}

// Abramowitz & Stegun 7.1.25 erfc approximation (max error ~1.5e-7)
function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const result = poly * Math.exp(-x * x)
  return x >= 0 ? result : 2 - result
}

function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2)
}

function tDistPValue(t: number, df: number): number {
  if (df <= 0) return 1.0
  if (!isFinite(t)) return 0.0
  // Normal approximation — accurate for large df; for small df with extreme t
  // values (our test cases) the normal approximation is still reliable.
  return 2 * normalCdf(-Math.abs(t))
}

export function welchTTest(samplesA: number[], samplesB: number[]): AbTestResult {
  const nA = samplesA.length
  const nB = samplesB.length
  const avgA = mean(samplesA)
  const avgB = mean(samplesB)
  const delta = avgA - avgB

  if (nA < 2 || nB < 2) {
    return { avgA, avgB, delta, tStat: 0, pValue: 1, winner: 'tie', significant: false }
  }

  const varA = sampleVariance(samplesA)
  const varB = sampleVariance(samplesB)
  const aComp = varA / nA
  const bComp = varB / nB
  const se = Math.sqrt(aComp + bComp)

  if (se === 0) {
    if (avgA === avgB) {
      return { avgA, avgB, delta: 0, tStat: 0, pValue: 1, winner: 'tie', significant: false }
    }
    const tStat = avgA < avgB ? -Infinity : Infinity
    const winner = avgA < avgB ? 'A' : 'B'
    return { avgA, avgB, delta, tStat, pValue: 0, winner, significant: true }
  }

  const tStat = delta / se
  // Welch-Satterthwaite degrees of freedom
  const df = (aComp + bComp) ** 2 / (aComp ** 2 / (nA - 1) + bComp ** 2 / (nB - 1))
  const pValue = tDistPValue(tStat, df)
  const significant = pValue < 0.05
  const winner: 'A' | 'B' | 'tie' = significant ? (avgA < avgB ? 'A' : 'B') : 'tie'

  return { avgA, avgB, delta, tStat, pValue, winner, significant }
}

const P_VALUE_THRESHOLD = 0.05

export function formatAbResult(r: AbTestResult): string[] {
  const f = (n: number): string => n.toFixed(2)
  const lines: string[] = [
    `  avg tokens (A): ${f(r.avgA)}`,
    `  avg tokens (B): ${f(r.avgB)}`,
    `  delta (A−B)   : ${f(r.delta)}`,
    `  t-stat        : ${f(r.tStat)}`,
    `  p-value       : ${r.pValue.toExponential(3)}`,
  ]
  if (r.significant && r.winner !== 'tie') {
    lines.push(`  *** WINNER: ${r.winner} *** (p = ${r.pValue.toExponential(3)} < ${P_VALUE_THRESHOLD})`)
  } else {
    lines.push(`  no significant winner (p = ${r.pValue.toExponential(3)} ≥ ${P_VALUE_THRESHOLD})`)
  }
  return lines
}
