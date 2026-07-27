import { describe, it, expect } from 'vitest'
import { ConstitutionChecker } from '../core/constitution/constitution-checker.js'
import type { ConstitutionPrinciple, NodeToCheck } from '../core/constitution/constitution-checker.js'

function makePrinciple(id: string, title: string, description: string, enforceable = true): ConstitutionPrinciple {
  return { id, title, description, enforceable }
}

function makeNode(id: string, title: string, description?: string): NodeToCheck {
  return { id, title, description }
}

describe('ConstitutionChecker', () => {
  it('returns no violations when no enforceable principles', () => {
    const checker = new ConstitutionChecker([makePrinciple('p1', 'Test', 'some description', false)])
    const result = checker.checkNode(makeNode('n1', 'Any title'))
    expect(result.violations).toHaveLength(0)
    expect(result.passRate).toBe(100)
  })

  it('returns no violations when node text does not match keywords', () => {
    const checker = new ConstitutionChecker([makePrinciple('p1', 'Security', 'Do not hardcode passwords or tokens')])
    const result = checker.checkNode(makeNode('n1', 'Render the user dashboard'))
    expect(result.violations).toHaveLength(0)
  })

  it('detects violation when node title matches principle keywords', () => {
    const checker = new ConstitutionChecker([
      makePrinciple('p1', 'No Hardcoded Secrets', 'Do not hardcode passwords or api_key in source'),
    ])
    const result = checker.checkNode(makeNode('n1', 'Store hardcoded api_key in config file'))
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0]?.principleId).toBe('p1')
  })

  it('passes when non-enforceable principles are violated', () => {
    const checker = new ConstitutionChecker([makePrinciple('p1', 'Advisory', 'avoid using passwords', false)])
    const result = checker.checkNode(makeNode('n1', 'Reset user passwords'))
    expect(result.violations).toHaveLength(0)
  })

  it('reports correct principlesChecked count', () => {
    const checker = new ConstitutionChecker([
      makePrinciple('p1', 'P1', 'keyword1 only'),
      makePrinciple('p2', 'P2', 'keyword2 only'),
    ])
    const result = checker.checkNode(makeNode('n1', 'no match here'))
    expect(result.principlesChecked).toBe(2)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(0)
  })
})
