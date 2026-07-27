import { describe, it, expect } from 'vitest'
import { assembleChallengeReport, serializeChallengeReport } from '../core/designer/challenge-report.js'
import type { ChallengeReportInput, JtbdTestResult } from '../core/designer/challenge-report.js'
import type { DecisionFitnessResult } from '../core/designer/decision-fitness.js'
import type { Finding } from '../core/designer/severity-scoring.js'

function makeFitness(composite = 70): DecisionFitnessResult {
  return {
    composite,
    grade: 'B',
    breakdown: {
      friction: { score: 80, weight: 0.35 },
      optimality: { score: 65, weight: 0.4 },
      reversibility: { score: 60, weight: 0.25 },
    },
  } as unknown as DecisionFitnessResult
}

function makeJtbd(result: 'PASS' | 'FAIL' = 'PASS'): JtbdTestResult {
  return { jtbd: 'As a dev, I want fast deploys', result, score: result === 'PASS' ? 80 : 20 }
}

function makeFinding(severity: 'high' | 'medium' | 'low' = 'low'): Finding {
  return { title: 'Risk item', severity, description: 'Some risk', mitigations: [] } as unknown as Finding
}

function makeInput(overrides: Partial<ChallengeReportInput> = {}): ChallengeReportInput {
  return {
    fitness: makeFitness(),
    jtbdResults: [makeJtbd()],
    preMortemFindings: [],
    ...overrides,
  }
}

describe('assembleChallengeReport', () => {
  it('returns an object', () => {
    const result = assembleChallengeReport(makeInput())
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('includes fitnessScore in report', () => {
    const result = assembleChallengeReport(makeInput())
    expect(result.fitnessScore).toBeDefined()
    expect(result.fitnessScore.composite).toBe(70)
  })

  it('includes jtbdResults', () => {
    const result = assembleChallengeReport(makeInput({ jtbdResults: [makeJtbd('FAIL')] }))
    expect(Array.isArray(result.jtbdResults)).toBe(true)
    expect(result.jtbdResults[0].result).toBe('FAIL')
  })

  it('has overallVerdict', () => {
    const result = assembleChallengeReport(makeInput())
    expect(typeof result.overallVerdict).toBe('object')
    expect(typeof result.overallVerdict.verdict).toBe('string')
  })

  it('passes challenge when composite >= 60', () => {
    const result = assembleChallengeReport(makeInput({ fitness: makeFitness(75) }))
    expect(result.overallVerdict.verdict).toBe('CHALLENGE_PASSED')
  })

  it('fails challenge when composite < 60', () => {
    const result = assembleChallengeReport(makeInput({ fitness: makeFitness(40) }))
    expect(result.overallVerdict.verdict).toBe('CHALLENGE_FAILED')
  })

  it('includes challengeQuestions array', () => {
    const result = assembleChallengeReport(makeInput())
    expect(Array.isArray(result.challengeQuestions)).toBe(true)
  })
})

describe('serializeChallengeReport', () => {
  it('returns a string', () => {
    const report = assembleChallengeReport(makeInput())
    const str = serializeChallengeReport(report, 'summary')
    expect(typeof str).toBe('string')
  })

  it('returns non-empty string', () => {
    const report = assembleChallengeReport(makeInput())
    const str = serializeChallengeReport(report, 'standard')
    expect(str.length).toBeGreaterThan(0)
  })

  it('supports different tiers', () => {
    const report = assembleChallengeReport(makeInput())
    const summary = serializeChallengeReport(report, 'summary')
    const deep = serializeChallengeReport(report, 'deep')
    expect(typeof summary).toBe('string')
    expect(typeof deep).toBe('string')
  })
})
