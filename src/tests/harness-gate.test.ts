/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { checkArchitectureFitness, type FitnessGateResult } from '../core/harness/harness-gate.js'
import type { HarnessScanResult } from '../core/harness/harness-scan-runner.js'
import type { ViolationDetail } from '../core/harness/violation-detail.js'

// Stub runHarnessScan to avoid real FS scan in tests
vi.mock('../core/harness/harness-scan-runner.js', () => ({
  runHarnessScan: vi.fn(),
}))

import { runHarnessScan } from '../core/harness/harness-scan-runner.js'
const mockScan = vi.mocked(runHarnessScan)

function makeResult(fitnessScore: number, violations: ViolationDetail[] = []): HarnessScanResult {
  return {
    score: 100,
    grade: 'A',
    breakdown: {
      types: { score: 100, weight: 0.25 },
      tests: { score: 100, weight: 0.25 },
      fitness: { score: fitnessScore, weight: 0.15 },
      docs: { score: 100, weight: 0.1 },
      naming: { score: 100, weight: 0.1 },
      errors: { score: 100, weight: 0.05 },
      context: { score: 100, weight: 0.05 },
      provenance: { score: 100, weight: 0.05 },
    },
    violations,
    details: [],
    timestamp: '2026-01-01T00:00:00Z',
    ruleSuggestions: [],
  } as unknown as HarnessScanResult
}

describe('checkArchitectureFitness (AC1 — gate passes at 100%)', () => {
  it('returns pass:true when fitnessScore equals threshold', () => {
    mockScan.mockReturnValue(makeResult(100))
    const result = checkArchitectureFitness('/fake/dir')
    expect(result.pass).toBe(true)
    expect(result.fitnessScore).toBe(100)
  })

  it('returns pass:true when fitnessScore > threshold', () => {
    mockScan.mockReturnValue(makeResult(100))
    const result = checkArchitectureFitness('/fake/dir', { threshold: 90 })
    expect(result.pass).toBe(true)
  })
})

describe('checkArchitectureFitness (AC1 — gate fails below threshold)', () => {
  it('returns pass:false when fitnessScore < default threshold (100)', () => {
    mockScan.mockReturnValue(makeResult(80))
    const result = checkArchitectureFitness('/fake/dir')
    expect(result.pass).toBe(false)
    expect(result.fitnessScore).toBe(80)
  })

  it('returns pass:false when fitnessScore < custom threshold', () => {
    mockScan.mockReturnValue(makeResult(70))
    const result = checkArchitectureFitness('/fake/dir', { threshold: 75 })
    expect(result.pass).toBe(false)
  })
})

describe('checkArchitectureFitness (AC2 — violations with file:line)', () => {
  it('includes fitness violations with file and line', () => {
    const violations: ViolationDetail[] = [
      {
        file: 'src/big-file.ts',
        line: 801,
        dimension: 'fitness',
        violationType: 'missing_barrel',
        evidence: 'over 800',
        confidence: 1,
      },
    ]
    mockScan.mockReturnValue(makeResult(50, violations))
    const result: FitnessGateResult = checkArchitectureFitness('/fake/dir')
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0]).toMatchObject({ file: 'src/big-file.ts', line: 801 })
  })

  it('returns empty violations when fitness is 100%', () => {
    mockScan.mockReturnValue(makeResult(100, []))
    const result = checkArchitectureFitness('/fake/dir')
    expect(result.violations).toEqual([])
  })
})
