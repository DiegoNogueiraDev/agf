import { describe, it, expect } from 'vitest'
import { scoreAcTestability, scoreAcTestabilityBatch } from '../core/analyzer/ac-testability.js'

describe('scoreAcTestability', () => {
  it('scores a well-structured Given/When/Then AC as not weak', () => {
    const result = scoreAcTestability('Given a logged-in user, When they click save, Then the record is persisted')
    expect(result.hasStructure).toBe(true)
    expect(result.weak).toBe(false)
    expect(result.score).toBeGreaterThan(0)
  })

  it('marks vague AC as weak', () => {
    const result = scoreAcTestability('it should work')
    expect(result.weak).toBe(true)
    expect(result.reason).toBeDefined()
  })

  it('detects observable outcome verb (returns, displays, redirects)', () => {
    const result = scoreAcTestability('the system returns a 200 OK response')
    expect(result.hasObservableOutcome).toBe(true)
    expect(result.weak).toBe(false)
  })

  it('returns the original AC string in result', () => {
    const ac = 'When user submits form, error is displayed'
    const result = scoreAcTestability(ac)
    expect(result.ac).toBe(ac)
  })

  it('identifies measurable numeric criteria', () => {
    const result = scoreAcTestability('response time is under 200ms')
    expect(result.isMeasurable).toBe(true)
  })
})

describe('scoreAcTestabilityBatch', () => {
  it('returns scored results for each AC', () => {
    const acs = ['Given X, When Y, Then Z', 'it should work']
    const result = scoreAcTestabilityBatch(acs)
    expect(result.scored).toHaveLength(2)
  })

  it('detects redundant ACs with high similarity', () => {
    const acs = [
      'Given a logged-in user, When they view the dashboard, Then stats are displayed',
      'Given a logged-in user, When they open the dashboard, Then statistics are shown',
    ]
    const result = scoreAcTestabilityBatch(acs, 0.5)
    expect(result.redundancyWarnings.length).toBeGreaterThan(0)
  })

  it('returns empty redundancy warnings for distinct ACs', () => {
    const acs = ['user can login', 'system sends email on registration']
    const result = scoreAcTestabilityBatch(acs)
    expect(result.redundancyWarnings).toHaveLength(0)
  })
})
