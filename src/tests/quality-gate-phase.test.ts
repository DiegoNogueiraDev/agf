/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 4.2 AC coverage: phase-dependent quality-gate thresholds
 *
 * AC1: IMPLEMENT phase → threshold = setpoint × 0.85 (tolerance during dev)
 * AC2: DEPLOY phase → threshold = setpoint × 1.0 (max strictness before deploy)
 * AC3: getPhaseThresholds works for all defined phases; DEPLOY ≠ IMPLEMENT
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  getPhaseThresholds,
  evaluateQualityGate,
  PHASE_MULTIPLIERS,
  type LifecyclePhase,
  type QualityThresholds,
} from '../core/harness/quality-gate.js'

// ── AC1: IMPLEMENT phase threshold = setpoint × 0.85 ─────────────────────────

describe('AC1: IMPLEMENT phase threshold = setpoint × 0.85', () => {
  it('getPhaseThresholds for implement applies 0.85 multiplier to setpoint', () => {
    const setpoint: QualityThresholds = { tests: 95, logs: 95 }
    const thresholds = getPhaseThresholds('implement', setpoint)
    expect(thresholds.tests).toBe(Math.round(95 * 0.85))
    expect(thresholds.logs).toBe(Math.round(95 * 0.85))
  })

  it('evaluateQualityGate with implement thresholds passes at 80 (< 95 default, ≥ 80.75)', () => {
    const implementThresholds = getPhaseThresholds('implement', DEFAULT_THRESHOLDS)
    // 80 < DEFAULT 95 but ≥ 80.75 (95 × 0.85) — should pass in implement phase
    const result = evaluateQualityGate({ testScore: 81, logScore: 81 }, implementThresholds)
    expect(result.passed).toBe(true)
  })

  it('evaluateQualityGate with implement thresholds fails below 0.85 × setpoint', () => {
    const implementThresholds = getPhaseThresholds('implement', DEFAULT_THRESHOLDS)
    // 80 < 80.75 (95 × 0.85 = 80.75 rounded to 81) — should fail
    const result = evaluateQualityGate({ testScore: 79, logScore: 79 }, implementThresholds)
    expect(result.passed).toBe(false)
  })

  it('IMPLEMENT threshold is strictly lower than DEPLOY threshold', () => {
    const setpoint: QualityThresholds = { tests: 90, logs: 90 }
    const impl = getPhaseThresholds('implement', setpoint)
    const deploy = getPhaseThresholds('deploy', setpoint)
    expect(impl.tests).toBeLessThan(deploy.tests)
    expect(impl.logs).toBeLessThan(deploy.logs)
  })
})

// ── AC2: DEPLOY phase threshold = setpoint × 1.0 ─────────────────────────────

describe('AC2: DEPLOY phase threshold = setpoint × 1.0 (max strictness)', () => {
  it('getPhaseThresholds for deploy returns setpoint unchanged', () => {
    const setpoint: QualityThresholds = { tests: 95, logs: 95 }
    const thresholds = getPhaseThresholds('deploy', setpoint)
    expect(thresholds.tests).toBe(95)
    expect(thresholds.logs).toBe(95)
  })

  it('evaluateQualityGate with deploy thresholds fails at 94', () => {
    const deployThresholds = getPhaseThresholds('deploy', DEFAULT_THRESHOLDS)
    const result = evaluateQualityGate({ testScore: 94, logScore: 94 }, deployThresholds)
    expect(result.passed).toBe(false)
  })

  it('evaluateQualityGate with deploy thresholds passes at 95', () => {
    const deployThresholds = getPhaseThresholds('deploy', DEFAULT_THRESHOLDS)
    const result = evaluateQualityGate({ testScore: 95, logScore: 95 }, deployThresholds)
    expect(result.passed).toBe(true)
  })

  it('DEPLOY multiplier is 1.0 per PHASE_MULTIPLIERS', () => {
    expect(PHASE_MULTIPLIERS['deploy']).toBe(1.0)
  })
})

// ── AC3: getPhaseThresholds covers all defined phases; DEPLOY ≠ IMPLEMENT ─────

describe('AC3: phase multipliers are defined and DEPLOY ≠ IMPLEMENT', () => {
  it('PHASE_MULTIPLIERS includes implement and deploy', () => {
    expect(PHASE_MULTIPLIERS).toHaveProperty('implement')
    expect(PHASE_MULTIPLIERS).toHaveProperty('deploy')
  })

  it('PHASE_MULTIPLIERS.implement = 0.85', () => {
    expect(PHASE_MULTIPLIERS['implement']).toBe(0.85)
  })

  it('getPhaseThresholds is stable — same phase+setpoint yields same result', () => {
    const setpoint: QualityThresholds = { tests: 80, logs: 80 }
    const r1 = getPhaseThresholds('deploy', setpoint)
    const r2 = getPhaseThresholds('deploy', setpoint)
    expect(r1).toEqual(r2)
  })

  it('every LifecyclePhase key in PHASE_MULTIPLIERS is accepted by getPhaseThresholds', () => {
    const setpoint: QualityThresholds = { tests: 90, logs: 90 }
    const phases = Object.keys(PHASE_MULTIPLIERS) as LifecyclePhase[]
    for (const phase of phases) {
      const result = getPhaseThresholds(phase, setpoint)
      expect(result.tests).toBeGreaterThan(0)
      expect(result.logs).toBeGreaterThan(0)
    }
  })

  it('evaluateQualityGate result shows calibrated source when phase thresholds passed', () => {
    const deployThresholds = getPhaseThresholds('deploy', DEFAULT_THRESHOLDS)
    const result = evaluateQualityGate({ testScore: 95, logScore: 95 }, deployThresholds)
    expect(result.thresholdSource).toBe('calibrated')
  })
})
