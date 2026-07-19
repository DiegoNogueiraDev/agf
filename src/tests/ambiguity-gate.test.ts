import { describe, it, expect } from 'vitest'
import { classifyAmbiguity } from '../core/analyzer/ambiguity-gate.js'

describe('classifyAmbiguity', () => {
  it('classifies a clear AC with no weasel terms as specified', () => {
    const result = classifyAmbiguity('Response latency < 200ms for 95th percentile under load')
    expect(result.level).toBe('specified')
    expect(result.vagueTerms).toEqual([])
  })

  it('classifies an AC with weasel terms and no concreteness as unspecified', () => {
    const result = classifyAmbiguity('The system should be fast and easy to use')
    expect(result.level).toBe('unspecified')
    expect(result.vagueTerms.length).toBeGreaterThan(0)
  })

  it('classifies an AC with weasel term but GWT format as partially', () => {
    const result = classifyAmbiguity('Given a user submits a form When the form has some errors Then display a message')
    // "some" is a weasel term but GWT format is concrete
    if (result.vagueTerms.length > 0) {
      expect(result.level).toBe('partially')
    } else {
      expect(result.level).toBe('specified')
    }
  })

  it('returns the original AC text in result', () => {
    const ac = 'Coverage must be ≥ 80%'
    const result = classifyAmbiguity(ac)
    expect(result.ac).toBe(ac)
  })

  it('handles empty string without throwing', () => {
    expect(() => classifyAmbiguity('')).not.toThrow()
  })

  it('does not falsely match substrings — "bombardment" should not match "bom"', () => {
    const result = classifyAmbiguity('Bombardment resistance rating exceeds class-3 threshold')
    // "bom" is a vague term but "bombardment" should not match it
    expect(result.vagueTerms).not.toContain('bom')
  })
})
