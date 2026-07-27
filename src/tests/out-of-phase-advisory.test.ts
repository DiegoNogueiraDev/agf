/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { wrapDesignPhaseAdvisory } from '../core/analyzer/out-of-phase-advisory.js'
import type { LifecyclePhase } from '../core/planner/lifecycle-phase.js'

describe('wrapDesignPhaseAdvisory', () => {
  it('returns report flat when phase is DESIGN', () => {
    const report = { score: 85, mode: 'traceability' as string }
    const result = wrapDesignPhaseAdvisory('DESIGN' as LifecyclePhase, 'traceability', report)
    expect(result.advisory).toBeUndefined()
    expect(result.score).toBe(85)
    expect(result.mode).toBe('traceability')
  })

  it('wraps in advisory envelope when phase is not DESIGN', () => {
    const report = { score: 50 }
    const result = wrapDesignPhaseAdvisory('IMPLEMENT' as LifecyclePhase, 'traceability', report)
    expect(result.advisory).toBe(true)
    expect(result.phaseWarning).toContain('non-binding')
    expect(result.data).toEqual(report)
    expect(result.mode).toBe('traceability')
    expect(result.ok).toBe(true)
  })

  it('wraps for ANALYZE phase', () => {
    const report = { score: 30 }
    const result = wrapDesignPhaseAdvisory('ANALYZE' as LifecyclePhase, 'coupling', report)
    expect(result.advisory).toBe(true)
    expect(result.phaseWarning).toContain('non-binding')
    expect(result.phaseWarning).toContain('ANALYZE')
  })

  it('wraps for PLANNING phase', () => {
    const report = { score: 70 }
    const result = wrapDesignPhaseAdvisory('PLAN' as LifecyclePhase, 'interfaces', report)
    expect(result.advisory).toBe(true)
  })

  it('wraps for VALIDATE phase', () => {
    const report = { score: 60 }
    const result = wrapDesignPhaseAdvisory('VALIDATE' as LifecyclePhase, 'tech_risk', report)
    expect(result.advisory).toBe(true)
  })

  it('wraps for REVIEW phase', () => {
    const report = { score: 40 }
    const result = wrapDesignPhaseAdvisory('REVIEW' as LifecyclePhase, 'design_ready', report)
    expect(result.advisory).toBe(true)
  })

  it('wraps for HANDOFF phase', () => {
    const report = { score: 90 }
    const result = wrapDesignPhaseAdvisory('HANDOFF' as LifecyclePhase, 'traceability', report)
    expect(result.advisory).toBe(true)
  })

  it('wraps for DEPLOY phase', () => {
    const report = { score: 95 }
    const result = wrapDesignPhaseAdvisory('DEPLOY' as LifecyclePhase, 'traceability', report)
    expect(result.advisory).toBe(true)
  })

  it('wraps for LISTENING phase', () => {
    const report = { score: 80 }
    const result = wrapDesignPhaseAdvisory('LISTENING' as LifecyclePhase, 'traceability', report)
    expect(result.advisory).toBe(true)
  })
})
