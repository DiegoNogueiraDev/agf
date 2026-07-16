/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/insights/behavioral-metrics.ts — computeBehavioralMetrics.
 */

import { describe, it, expect } from 'vitest'
import { computeBehavioralMetrics, computeAssertiveness } from '../core/insights/behavioral-metrics.js'

describe('computeBehavioralMetrics — autonomy', () => {
  it('autonomyRate = done sem override / done', () => {
    const m = computeBehavioralMetrics(
      [
        { status: 'done' },
        { status: 'done', hadOverride: true },
        { status: 'done' },
        { status: 'done' },
        { status: 'backlog' }, // ignored — not done
      ],
      [],
    )
    expect(m.totalDone).toBe(4)
    expect(m.autonomousTasks).toBe(3)
    expect(m.autonomyRate).toBe(0.75)
  })

  it('sem tasks done → autonomyRate 0 (sem divisão por zero)', () => {
    const m = computeBehavioralMetrics([{ status: 'backlog' }, { status: 'in_progress' }], [])
    expect(m.totalDone).toBe(0)
    expect(m.autonomyRate).toBe(0)
  })
})

describe('computeBehavioralMetrics — resilience MTTR', () => {
  it('MTTR = média dos tempos de recuperação válidos', () => {
    const m = computeBehavioralMetrics(
      [{ status: 'done' }],
      [
        { failedAt: 0, recoveredAt: 100 },
        { failedAt: 50, recoveredAt: 350 }, // 300
      ],
    )
    expect(m.recoveries).toBe(2)
    expect(m.resilienceMttrMs).toBe(200)
  })

  it('descarta recuperações inválidas (recoveredAt < failedAt) e zera quando vazio', () => {
    const m = computeBehavioralMetrics([{ status: 'done' }], [{ failedAt: 500, recoveredAt: 100 }])
    expect(m.recoveries).toBe(0)
    expect(m.resilienceMttrMs).toBe(0)
  })
})

describe('computeAssertiveness', () => {
  it('assertivenessRate = AC-pass de 1ª passada / total', () => {
    const a = computeAssertiveness([{ acPassed: true }, { acPassed: true }, { acPassed: false }, { acPassed: true }])
    expect(a.total).toBe(4)
    expect(a.passed).toBe(3)
    expect(a.assertivenessRate).toBe(0.75)
  })

  it('sem submissões → 0 (sem divisão por zero)', () => {
    const a = computeAssertiveness([])
    expect(a).toEqual({ assertivenessRate: 0, passed: 0, total: 0 })
  })
})
