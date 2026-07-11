import { describe, it, expect } from 'vitest'
import { classifyText, isMetadataLine, isStructuralHeading } from '../core/parser/classify.js'

describe('classifyText', () => {
  it('returns an object with type and confidence', () => {
    const result = classifyText('some text')
    expect(typeof result.type).toBe('string')
    expect(typeof result.confidence).toBe('number')
  })

  it('confidence is between 0 and 1', () => {
    const result = classifyText('## Section heading with lots of content')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('handles empty string', () => {
    const result = classifyText('')
    expect(typeof result.type).toBe('string')
  })

  it('classifies acceptance criteria text', () => {
    const result = classifyText('GIVEN user is logged in WHEN they click submit THEN form is submitted')
    expect(typeof result.type).toBe('string')
    expect(result.confidence).toBeGreaterThan(0)
  })
})

describe('isMetadataLine', () => {
  it('returns boolean', () => {
    expect(typeof isMetadataLine('Status: done')).toBe('boolean')
  })

  it('returns true for **Priority: ... metadata lines', () => {
    expect(isMetadataLine('**Priority: High**')).toBe(true)
  })

  it('returns false for regular text', () => {
    expect(isMetadataLine('This is a normal sentence')).toBe(false)
  })
})

describe('isStructuralHeading', () => {
  it('returns boolean', () => {
    expect(typeof isStructuralHeading('Acceptance Criteria')).toBe('boolean')
  })

  it('returns true for scaffolding headings like Roadmap', () => {
    expect(isStructuralHeading('Roadmap da solução')).toBe(true)
  })

  it('returns false for implementable task headings', () => {
    expect(isStructuralHeading('some random title')).toBe(false)
  })
})
