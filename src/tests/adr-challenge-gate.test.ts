/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_b5d4d269a53c AC coverage: adr-challenge-gate.ts
 *
 * AC1: GIVEN mode=off WHEN runAdrChallengeGate THEN blocked=false totalDecisions=0 no warnings
 * AC2: GIVEN mode=strict AND 0 decisions WHEN runAdrChallengeGate THEN blocked=false warnings includes no_decisions
 * AC3: GIVEN mode=strict AND decisions with CHALLENGE_FAILED WHEN gate THEN blocked=true failedDecisions non-empty
 * AC4: GIVEN mode=advisory AND failures WHEN gate THEN blocked=false warnings present (warning severity)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AllAdrChallengesResult } from '../core/designer/adr-challenge-runner.js'

// Mock the runner to avoid needing full SqliteStore + decision nodes
vi.mock('../core/designer/adr-challenge-runner.js', () => ({
  runAllAdrChallenges: vi.fn(),
}))
vi.mock('../core/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

import { runAdrChallengeGate } from '../core/designer/adr-challenge-gate.js'
import { runAllAdrChallenges } from '../core/designer/adr-challenge-runner.js'

const mockRunAll = vi.mocked(runAllAdrChallenges)

// Minimal store stub — gate only passes it through to runAllAdrChallenges
const fakeStore = {} as never

function makeResultWithFailures(count: number): AllAdrChallengesResult {
  const reports = Array.from({ length: count }, (_, i) => ({
    nodeId: `node_${i}`,
    nodeTitle: `Decision ${i}`,
    report: {
      overallVerdict: { verdict: 'CHALLENGE_FAILED' as const, reason: 'low score' },
      fitnessScore: { composite: 40, friction: 40, optimality: 40, reversibility: 40 },
      jtbdResults: [],
      preMortemFindings: [],
    },
  }))
  return {
    reports,
    summary: { totalDecisions: count, passed: 0, failed: count, avgCompositeScore: 40 },
  }
}

function makeResultPassing(count: number): AllAdrChallengesResult {
  const reports = Array.from({ length: count }, (_, i) => ({
    nodeId: `node_${i}`,
    nodeTitle: `Decision ${i}`,
    report: {
      overallVerdict: { verdict: 'CHALLENGE_PASSED' as const, reason: 'good score' },
      fitnessScore: { composite: 80, friction: 80, optimality: 80, reversibility: 80 },
      jtbdResults: [],
      preMortemFindings: [],
    },
  }))
  return {
    reports,
    summary: { totalDecisions: count, passed: count, failed: 0, avgCompositeScore: 80 },
  }
}

const emptyResult: AllAdrChallengesResult = {
  reports: [],
  summary: { totalDecisions: 0, passed: 0, failed: 0, avgCompositeScore: 0 },
}

describe('runAdrChallengeGate — mode=off', () => {
  it('AC1: returns blocked=false without calling runAllAdrChallenges', () => {
    mockRunAll.mockClear()
    const result = runAdrChallengeGate(fakeStore, 'off')
    expect(result.blocked).toBe(false)
    expect(mockRunAll).not.toHaveBeenCalled()
  })

  it('AC1: returns totalDecisions=0 and empty arrays', () => {
    const result = runAdrChallengeGate(fakeStore, 'off')
    expect(result.totalDecisions).toBe(0)
    expect(result.reports).toHaveLength(0)
    expect(result.failedDecisions).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

describe('runAdrChallengeGate — 0 decisions', () => {
  beforeEach(() => {
    mockRunAll.mockReturnValue(emptyResult)
  })

  it('AC2: returns blocked=false when no decision nodes found', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.blocked).toBe(false)
  })

  it('AC2: warns with no_decisions code (strict)', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.warnings.some((w) => w.code === 'no_decisions')).toBe(true)
  })

  it('AC2: warns with no_decisions code (advisory)', () => {
    const result = runAdrChallengeGate(fakeStore, 'advisory')
    expect(result.warnings.some((w) => w.code === 'no_decisions')).toBe(true)
  })

  it('AC2: totalDecisions=0 and failedDecisions empty', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.totalDecisions).toBe(0)
    expect(result.failedDecisions).toHaveLength(0)
  })
})

describe('runAdrChallengeGate — strict mode with failures', () => {
  beforeEach(() => {
    mockRunAll.mockReturnValue(makeResultWithFailures(2))
  })

  it('AC3: blocked=true when decisions fail in strict mode', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.blocked).toBe(true)
  })

  it('AC3: failedDecisions contains the failing nodes', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.failedDecisions).toHaveLength(2)
    expect(result.failedDecisions[0]!.verdict).toBe('CHALLENGE_FAILED')
  })

  it('AC3: warning severity is "error" in strict mode', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    const warn = result.warnings.find((w) => w.code === 'challenge_failed')
    expect(warn?.severity).toBe('error')
  })

  it('AC3: totalDecisions reflects runner summary', () => {
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.totalDecisions).toBe(2)
  })
})

describe('runAdrChallengeGate — advisory mode with failures', () => {
  beforeEach(() => {
    mockRunAll.mockReturnValue(makeResultWithFailures(1))
  })

  it('AC4: blocked=false in advisory mode even with failures', () => {
    const result = runAdrChallengeGate(fakeStore, 'advisory')
    expect(result.blocked).toBe(false)
  })

  it('AC4: warning severity is "warning" (not "error") in advisory', () => {
    const result = runAdrChallengeGate(fakeStore, 'advisory')
    const warn = result.warnings.find((w) => w.code === 'challenge_failed')
    expect(warn?.severity).toBe('warning')
  })

  it('AC4: warnings are non-empty', () => {
    const result = runAdrChallengeGate(fakeStore, 'advisory')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('runAdrChallengeGate — all pass scenarios', () => {
  it('no failedDecisions when all pass (strict)', () => {
    mockRunAll.mockReturnValue(makeResultPassing(3))
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.blocked).toBe(false)
    expect(result.failedDecisions).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('no failedDecisions when all pass (advisory)', () => {
    mockRunAll.mockReturnValue(makeResultPassing(2))
    const result = runAdrChallengeGate(fakeStore, 'advisory')
    expect(result.blocked).toBe(false)
    expect(result.failedDecisions).toHaveLength(0)
  })

  it('reports are passed through from runner', () => {
    mockRunAll.mockReturnValue(makeResultPassing(2))
    const result = runAdrChallengeGate(fakeStore, 'strict')
    expect(result.reports).toHaveLength(2)
  })
})
