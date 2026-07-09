/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_b29dcb99cf9f — evaluateQualityGate: gate 95/95 (testes + logs). Puro.
 */
import { describe, it, expect } from 'vitest'
import { evaluateQualityGate } from '../core/harness/quality-gate.js'

describe('evaluateQualityGate — gate 95/95 (#Q2)', () => {
  it('acima dos limiares → passed, sem failures', () => {
    const r = evaluateQualityGate({ testScore: 96, logScore: 97 })
    expect(r.passed).toBe(true)
    expect(r.failures).toEqual([])
  })

  it("testes abaixo do limiar → failures inclui 'tests'", () => {
    const r = evaluateQualityGate({ testScore: 80, logScore: 99 }, { tests: 95, logs: 95 })
    expect(r.passed).toBe(false)
    expect(r.failures.map((f) => f.dimension)).toContain('tests')
  })

  it("logs abaixo do limiar → failures inclui 'logs'", () => {
    const r = evaluateQualityGate({ testScore: 99, logScore: 90 }, { tests: 95, logs: 95 })
    expect(r.passed).toBe(false)
    expect(r.failures.map((f) => f.dimension)).toContain('logs')
  })

  it('thresholds custom são respeitados', () => {
    expect(evaluateQualityGate({ testScore: 70, logScore: 70 }, { tests: 60, logs: 60 }).passed).toBe(true)
    expect(evaluateQualityGate({ testScore: 70, logScore: 70 }, { tests: 80, logs: 60 }).passed).toBe(false)
  })

  it('limiar exato (==) passa', () => {
    expect(evaluateQualityGate({ testScore: 95, logScore: 95 }).passed).toBe(true)
  })
})
