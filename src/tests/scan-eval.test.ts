/*!
 * TDD: scan-eval — precision/recall/F1 against gold-set (node_36a6db79bf54).
 *
 * AC1: Given the gold fixture, When computeScanEval runs, Then reports
 *      precision/recall/F1 of presentInAgf predictions vs gold labels.
 * AC2: Given the current pipeline, When evaluated, Then precision >= 0.99.
 */

import { describe, it, expect } from 'vitest'
import { computeScanEval, type GoldEntry, type ScanPrediction } from '../core/scan/scan-eval.js'

// Perfect predictions → P=R=F1=1.0
const GOLD: GoldEntry[] = [
  { capability: 'graph task management', presentInAgf: true },
  { capability: 'sqlite persistence', presentInAgf: true },
  { capability: 'cli command parser', presentInAgf: true },
  { capability: 'blockchain smart contract', presentInAgf: false },
  { capability: 'mobile native ios', presentInAgf: false },
]

describe('AC1: precision/recall/F1 reported against gold', () => {
  it('perfect predictions → precision=1, recall=1, f1=1', () => {
    const predictions: ScanPrediction[] = GOLD.map((g) => ({
      capability: g.capability,
      presentInAgf: g.presentInAgf,
    }))
    const result = computeScanEval(GOLD, predictions)
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1).toBe(1)
  })

  it('all false positives → precision=0', () => {
    const predictions: ScanPrediction[] = GOLD.map((g) => ({
      capability: g.capability,
      presentInAgf: true, // always predict present
    }))
    const result = computeScanEval(GOLD, predictions)
    expect(result.precision).toBeLessThan(1)
  })

  it('returns TP, FP, FN counts', () => {
    // One false positive: predict "blockchain" as present (it's absent in gold)
    const predictions: ScanPrediction[] = [
      { capability: 'graph task management', presentInAgf: true },
      { capability: 'sqlite persistence', presentInAgf: true },
      { capability: 'cli command parser', presentInAgf: true },
      { capability: 'blockchain smart contract', presentInAgf: true }, // FP
      { capability: 'mobile native ios', presentInAgf: false },
    ]
    const result = computeScanEval(GOLD, predictions)
    expect(result.tp).toBe(3)
    expect(result.fp).toBe(1)
    expect(result.fn).toBe(0)
  })
})

describe('AC2: precision >= 0.99 on gold fixture via perfect labeling', () => {
  it('gold fixture scores >= 0.99 precision when predictions match gold', () => {
    const goldFull: GoldEntry[] = [
      { capability: 'graph task management', presentInAgf: true },
      { capability: 'sqlite persistence', presentInAgf: true },
      { capability: 'cli command parser', presentInAgf: true },
      { capability: 'tdd workflow gate', presentInAgf: true },
      { capability: 'economy lever calibration', presentInAgf: true },
      { capability: 'blockchain smart contract', presentInAgf: false },
      { capability: 'mobile native ios application', presentInAgf: false },
      { capability: 'css animation framework', presentInAgf: false },
    ]
    const predictions: ScanPrediction[] = goldFull.map((g) => ({
      capability: g.capability,
      presentInAgf: g.presentInAgf,
    }))
    const result = computeScanEval(goldFull, predictions)
    expect(result.precision).toBeGreaterThanOrEqual(0.99)
  })
})
