import { describe, it, expect } from 'vitest'
import { validateInvest } from '../core/planner/invest-validator.js'
import type { InvestCandidate } from '../core/planner/invest-validator.js'

function makeCandidate(overrides: Partial<InvestCandidate> = {}): InvestCandidate {
  return {
    title: 'My Task',
    acceptanceCriteria: ['should do X when Y'],
    xpSize: 'S',
    ...overrides,
  }
}

describe('validateInvest', () => {
  it('returns passed:true for a valid candidate', () => {
    const result = validateInvest(makeCandidate())
    expect(result.passed).toBe(true)
    expect(result.rejectedReasons).toHaveLength(0)
  })

  it('rejects when acceptanceCriteria is empty', () => {
    const result = validateInvest(makeCandidate({ acceptanceCriteria: [] }))
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Valuable'))).toBe(true)
  })

  it('rejects when xpSize is missing', () => {
    const result = validateInvest(makeCandidate({ xpSize: undefined }))
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Estimable'))).toBe(true)
  })

  it('rejects when xpSize is L', () => {
    const result = validateInvest(makeCandidate({ xpSize: 'L' }))
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Small'))).toBe(true)
  })

  it('rejects when xpSize is XL', () => {
    const result = validateInvest(makeCandidate({ xpSize: 'XL' }))
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Small'))).toBe(true)
  })

  it('accepts XS size', () => {
    const result = validateInvest(makeCandidate({ xpSize: 'XS' }))
    expect(result.rejectedReasons.some((r) => r.includes('Small'))).toBe(false)
  })

  it('rejects when no AC is testable', () => {
    const result = validateInvest(makeCandidate({ acceptanceCriteria: ['user can log in'] }))
    expect(result.passed).toBe(false)
    expect(result.rejectedReasons.some((r) => r.includes('Testable'))).toBe(true)
  })

  it('accepts AC with GIVEN/WHEN/THEN', () => {
    const result = validateInvest(
      makeCandidate({ acceptanceCriteria: ['GIVEN user is logged in WHEN clicking logout THEN redirected'] }),
    )
    expect(result.rejectedReasons.some((r) => r.includes('Testable'))).toBe(false)
  })

  it('accepts AC with should keyword', () => {
    const result = validateInvest(makeCandidate({ acceptanceCriteria: ['user should see dashboard'] }))
    expect(result.rejectedReasons.some((r) => r.includes('Testable'))).toBe(false)
  })

  it('result has passed and rejectedReasons fields', () => {
    const result = validateInvest(makeCandidate())
    expect(typeof result.passed).toBe('boolean')
    expect(Array.isArray(result.rejectedReasons)).toBe(true)
  })

  it('multiple violations are all reported', () => {
    const result = validateInvest({ title: 'x', acceptanceCriteria: [], xpSize: undefined })
    expect(result.rejectedReasons.length).toBeGreaterThan(1)
  })
})
