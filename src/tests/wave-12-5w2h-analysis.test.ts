import { describe, it, expect } from 'vitest'
import { Why5W2HSchema, StakeholderSchema, PhaseSchema } from '../schemas/wave-12-5w2h-analysis.js'

describe('Why5W2HSchema', () => {
  it('accepts a valid why section', () => {
    expect(
      Why5W2HSchema.safeParse({
        rationale: 'Eliminate cross-test contamination in CI pipelines to reduce flakiness.',
        benefits: ['Zero flaky tests due to isolation', 'Faster CI cycles'],
      }).success,
    ).toBe(true)
  })

  it('rejects empty rationale', () => {
    expect(
      Why5W2HSchema.safeParse({
        rationale: 'Short',
        benefits: ['benefit'],
      }).success,
    ).toBe(false)
  })

  it('rejects empty benefits array', () => {
    expect(
      Why5W2HSchema.safeParse({
        rationale: 'Eliminate cross-test contamination in CI pipelines.',
        benefits: [],
      }).success,
    ).toBe(false)
  })
})

describe('StakeholderSchema', () => {
  it('accepts a valid stakeholder', () => {
    expect(
      StakeholderSchema.safeParse({
        role: 'Lead Developer',
        responsibilities: ['Architecture decisions', 'Implementation'],
      }).success,
    ).toBe(true)
  })

  it('accepts stakeholder with count', () => {
    expect(
      StakeholderSchema.safeParse({
        role: 'Team',
        responsibilities: ['Deliver features'],
        count_estimate: 3,
      }).success,
    ).toBe(true)
  })
})

describe('PhaseSchema', () => {
  it('accepts a valid phase', () => {
    expect(
      PhaseSchema.safeParse({
        phase_name: 'IMPLEMENT',
        duration_weeks: 2,
      }).success,
    ).toBe(true)
  })

  it('rejects unknown phase_name', () => {
    expect(
      PhaseSchema.safeParse({
        phase_name: 'EXECUTE',
        duration_weeks: 1,
      }).success,
    ).toBe(false)
  })
})
