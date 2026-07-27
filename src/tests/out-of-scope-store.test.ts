import { describe, it, expect } from 'vitest'
import {
  slugifyConcept,
  tokenSimilarity,
  DEFAULT_MATCH_THRESHOLD,
  OUT_OF_SCOPE_DIR,
} from '../core/knowledge/out-of-scope-store.js'

describe('constants', () => {
  it('DEFAULT_MATCH_THRESHOLD is 0.7', () => {
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.7)
  })

  it('OUT_OF_SCOPE_DIR is .out-of-scope', () => {
    expect(OUT_OF_SCOPE_DIR).toBe('.out-of-scope')
  })
})

describe('slugifyConcept', () => {
  it('lowercases the concept', () => {
    expect(slugifyConcept('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugifyConcept('real time notifications')).toBe('real-time-notifications')
  })

  it('strips non-alphanumeric characters', () => {
    expect(slugifyConcept('feature: add auth!')).toBe('feature-add-auth')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugifyConcept(' test ')).toBe('test')
  })

  it('handles accented characters', () => {
    const result = slugifyConcept('análise')
    expect(result).toMatch(/^[a-z0-9-]+$/)
  })

  it('returns a non-empty string for common input', () => {
    expect(slugifyConcept('payment integration').length).toBeGreaterThan(0)
  })

  it('truncates to 60 characters max', () => {
    const long = 'a very very very long concept that exceeds sixty characters total here'
    expect(slugifyConcept(long).length).toBeLessThanOrEqual(60)
  })

  it('handles empty string gracefully', () => {
    const result = slugifyConcept('')
    expect(typeof result).toBe('string')
  })
})

describe('tokenSimilarity', () => {
  it('returns 0 for completely different strings', () => {
    expect(tokenSimilarity('apple banana', 'cat dog')).toBe(0)
  })

  it('returns 1 for identical non-empty strings', () => {
    expect(tokenSimilarity('hello world', 'hello world')).toBe(1)
  })

  it('returns 0 when one string has no tokens of length ≥3', () => {
    expect(tokenSimilarity('ab', 'hello world')).toBe(0)
  })

  it('returns partial similarity for overlapping content', () => {
    const sim = tokenSimilarity('authentication service module', 'authentication gateway')
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })

  it('is symmetric', () => {
    const a = 'authentication service'
    const b = 'user authentication'
    expect(tokenSimilarity(a, b)).toBeCloseTo(tokenSimilarity(b, a))
  })

  it('handles punctuation in input', () => {
    const sim = tokenSimilarity('payment, gateway!', 'payment gateway')
    expect(sim).toBeGreaterThan(0.5)
  })
})
