/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 4.1 AC coverage: calibrate quality-gate thresholds against real history
 *
 * AC1: project with ≥10 done tasks → thresholds calibrated using p75 as setpoint
 * AC2: default thresholds = 95/95 (not 35/40)
 * AC3: QualityGateResult shows active thresholds and calibration source
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  evaluateQualityGate,
  calibrateQualityThresholds,
  type QualityScores,
} from '../core/harness/quality-gate.js'

// ── AC2: default thresholds = 95/95 ──────────────────────────────────────────

describe('AC2: default thresholds are 95/95 (not 35/40)', () => {
  it('DEFAULT_THRESHOLDS.tests = 95', () => {
    expect(DEFAULT_THRESHOLDS.tests).toBe(95)
  })

  it('DEFAULT_THRESHOLDS.logs = 95', () => {
    expect(DEFAULT_THRESHOLDS.logs).toBe(95)
  })

  it('evaluateQualityGate fails at score 94 with default thresholds', () => {
    const result = evaluateQualityGate({ testScore: 94, logScore: 94 })
    expect(result.passed).toBe(false)
    expect(result.failures).toHaveLength(2)
  })

  it('evaluateQualityGate passes at score 95 with default thresholds', () => {
    const result = evaluateQualityGate({ testScore: 95, logScore: 95 })
    expect(result.passed).toBe(true)
  })
})

// ── AC1: calibration with ≥10 samples uses p75 ───────────────────────────────

describe('AC1: calibrateQualityThresholds uses p75 with ≥10 done tasks', () => {
  it('returns calibrated thresholds using p75 of historical scores', () => {
    // 10 historical task scores
    const historical: QualityScores[] = [
      { testScore: 70, logScore: 65 },
      { testScore: 75, logScore: 70 },
      { testScore: 80, logScore: 75 },
      { testScore: 82, logScore: 78 },
      { testScore: 85, logScore: 80 },
      { testScore: 88, logScore: 82 },
      { testScore: 90, logScore: 85 },
      { testScore: 92, logScore: 87 },
      { testScore: 95, logScore: 90 },
      { testScore: 98, logScore: 92 },
    ]
    const result = calibrateQualityThresholds(historical)
    expect(result.source).toBe('calibrated')
    // p75 of test scores (sorted): [70,75,80,82,85,88,90,92,95,98] → idx 7 = 92
    expect(result.thresholds.tests).toBe(92)
    // p75 of log scores (sorted): [65,70,75,78,80,82,85,87,90,92] → idx 7 = 87
    expect(result.thresholds.logs).toBe(87)
  })

  it('returns default thresholds when fewer than minSamples', () => {
    const historical: QualityScores[] = [
      { testScore: 80, logScore: 75 },
      { testScore: 85, logScore: 80 },
    ]
    const result = calibrateQualityThresholds(historical, { minSamples: 10 })
    expect(result.source).toBe('default')
    expect(result.thresholds.tests).toBe(DEFAULT_THRESHOLDS.tests)
  })

  it('calibrated thresholds respect floor values', () => {
    // Very low historical scores — floor should kick in
    const historical: QualityScores[] = Array.from({ length: 10 }, () => ({
      testScore: 20,
      logScore: 25,
    }))
    const result = calibrateQualityThresholds(historical, { floorTests: 50, floorLogs: 50 })
    expect(result.thresholds.tests).toBeGreaterThanOrEqual(50)
    expect(result.thresholds.logs).toBeGreaterThanOrEqual(50)
  })

  it('calibration is stable — same input always returns same thresholds', () => {
    const historical: QualityScores[] = Array.from({ length: 15 }, (_, i) => ({
      testScore: 60 + i * 2,
      logScore: 55 + i * 2,
    }))
    const r1 = calibrateQualityThresholds(historical)
    const r2 = calibrateQualityThresholds(historical)
    expect(r1.thresholds).toEqual(r2.thresholds)
    expect(r1.source).toBe(r2.source)
  })
})

// ── AC3: QualityGateResult shows active thresholds and source ─────────────────

describe('AC3: evaluateQualityGate result includes active thresholds and calibration source', () => {
  it('result has activeThresholds field showing what was used', () => {
    const result = evaluateQualityGate({ testScore: 96, logScore: 96 })
    expect(result).toHaveProperty('activeThresholds')
    expect(result.activeThresholds.tests).toBe(95)
    expect(result.activeThresholds.logs).toBe(95)
  })

  it('result has thresholdSource field indicating default or calibrated', () => {
    const result = evaluateQualityGate({ testScore: 96, logScore: 96 })
    expect(result).toHaveProperty('thresholdSource')
    expect(['default', 'calibrated']).toContain(result.thresholdSource)
  })

  it('custom thresholds show thresholdSource = calibrated', () => {
    const customThresholds = { tests: 80, logs: 75 }
    const result = evaluateQualityGate({ testScore: 85, logScore: 80 }, customThresholds)
    expect(result.thresholdSource).toBe('calibrated')
    expect(result.activeThresholds.tests).toBe(80)
    expect(result.activeThresholds.logs).toBe(75)
  })

  it('default thresholds show thresholdSource = default', () => {
    const result = evaluateQualityGate({ testScore: 96, logScore: 96 })
    expect(result.thresholdSource).toBe('default')
  })
})
