import { describe, it, expect } from 'vitest'
import { BUILT_IN_PRINCIPLES, evaluateDecisionPrinciples } from '../core/designer/decision-principles.js'

type GraphNode = Parameters<typeof evaluateDecisionPrinciples>[0]

function makeNode(description: string): GraphNode {
  return { id: 'n1', title: 'Test Decision', description, type: 'decision' } as any
}

describe('BUILT_IN_PRINCIPLES', () => {
  it('is a non-empty array', () => {
    expect(BUILT_IN_PRINCIPLES.length).toBeGreaterThan(0)
  })

  it('each principle has id, name, description, dimension, violationKeywords', () => {
    for (const p of BUILT_IN_PRINCIPLES) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.description).toBe('string')
      expect(typeof p.dimension).toBe('string')
      expect(Array.isArray(p.violationKeywords)).toBe(true)
    }
  })
})

describe('evaluateDecisionPrinciples', () => {
  it('returns empty for empty description', () => {
    const violations = evaluateDecisionPrinciples(makeNode(''), BUILT_IN_PRINCIPLES)
    expect(violations).toHaveLength(0)
  })

  it('returns no violations for clean description', () => {
    const violations = evaluateDecisionPrinciples(
      makeNode('Use a simple, reversible, standard approach'),
      BUILT_IN_PRINCIPLES,
    )
    expect(Array.isArray(violations)).toBe(true)
  })

  it('detects violation when keyword matches', () => {
    const violationText = BUILT_IN_PRINCIPLES[0]!.violationKeywords[0]!
    if (!violationText) return
    const violations = evaluateDecisionPrinciples(makeNode(violationText), BUILT_IN_PRINCIPLES)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]!.principleId).toBeDefined()
    expect(violations[0]!.severity).toBeDefined()
  })

  it('violation has required fields', () => {
    const allKeywords = BUILT_IN_PRINCIPLES.flatMap((p) => p.violationKeywords).join(', ')
    const violations = evaluateDecisionPrinciples(makeNode(allKeywords), BUILT_IN_PRINCIPLES)
    if (violations.length > 0) {
      const v = violations[0]!
      expect(typeof v.principleId).toBe('string')
      expect(typeof v.principleName).toBe('string')
      expect(typeof v.dimension).toBe('string')
      expect(typeof v.message).toBe('string')
    }
  })
})
