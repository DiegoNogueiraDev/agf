/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 6.3: Make calibration workflow user-facing with `agf calibrate --apply`.
 * AC1 — sampleSize >= 10 → lever threshold updated, output { lever, old, new, applied: true }.
 * AC2 — sampleSize < 10  → no update,              output { applied: false, reason: 'insufficient_data' }.
 * AC3 — --lever rag_in_reuse --apply → only rag_in updated, rag_out unchanged.
 */

import { describe, it, expect } from 'vitest'
import { applyCalibration, type CalibrationApplyInput, DEFAULT_LEVER_CONFIG } from '../core/economy/economy-config.js'

const BASE_CONFIG = { ...DEFAULT_LEVER_CONFIG }

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('T6.3 AC1: sampleSize >= 10 → applied: true with old/new values', () => {
  it('returns applied: true when sampleSize >= 10', () => {
    const input: CalibrationApplyInput = {
      lever: 'rag_in_reuse',
      recommended: 0.7,
      sampleSize: 10,
    }
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.results[0]!.applied).toBe(true)
  })

  it('result includes lever, old, new fields', () => {
    const input: CalibrationApplyInput = {
      lever: 'rag_in_reuse',
      recommended: 0.7,
      sampleSize: 12,
    }
    const result = applyCalibration([input], BASE_CONFIG)
    const r = result.results[0]!
    expect(r).toHaveProperty('lever', 'rag_in_reuse')
    expect(r).toHaveProperty('old')
    expect(r).toHaveProperty('new', 0.7)
    expect(typeof r.old).toBe('number')
  })

  it('old value matches the prior threshold in config', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.8, sampleSize: 15 }
    const result = applyCalibration([input], { ...BASE_CONFIG, rag_in: { threshold: 0.55, k: 3 } })
    expect(result.results[0]!.old).toBe(0.55)
  })

  it('updatedConfig reflects the new threshold', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.65, sampleSize: 20 }
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.updatedConfig.rag_in.threshold).toBe(0.65)
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('T6.3 AC2: sampleSize < 10 → applied: false, reason: insufficient_data', () => {
  it('returns applied: false when sampleSize < 10', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.7, sampleSize: 5 }
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.results[0]!.applied).toBe(false)
  })

  it('reason is insufficient_data when sampleSize < 10', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.7, sampleSize: 9 }
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.results[0]!.reason).toBe('insufficient_data')
  })

  it('config is unchanged when sampleSize < 10', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.9, sampleSize: 3 }
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.updatedConfig.rag_in.threshold).toBe(BASE_CONFIG.rag_in.threshold)
  })
})

// ── AC3 ───────────────────────────────────────────────────────────────────────

describe('T6.3 AC3: --lever rag_in_reuse only updates rag_in, rag_out unchanged', () => {
  it('rag_out threshold is unchanged when only rag_in_reuse is applied', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.8, sampleSize: 15 }
    const originalOut = BASE_CONFIG.rag_out.threshold
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.updatedConfig.rag_out.threshold).toBe(originalOut)
  })

  it('only the target lever result is in the applied list', () => {
    const input: CalibrationApplyInput = { lever: 'rag_in_reuse', recommended: 0.8, sampleSize: 15 }
    const result = applyCalibration([input], BASE_CONFIG)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.lever).toBe('rag_in_reuse')
  })

  it('both levers applied independently when two inputs provided', () => {
    const inputs: CalibrationApplyInput[] = [
      { lever: 'rag_in_reuse', recommended: 0.7, sampleSize: 10 },
      { lever: 'rag_out_recovery', recommended: 0.6, sampleSize: 11 },
    ]
    const result = applyCalibration(inputs, BASE_CONFIG)
    expect(result.updatedConfig.rag_in.threshold).toBe(0.7)
    expect(result.updatedConfig.rag_out.threshold).toBe(0.6)
  })
})
