import { describe, it, expect } from 'vitest'
import { LIFECYCLE_PHASES, getNextPhase, getPrereqs } from '../core/orchestrator/lifecycle-gate.js'

describe('LIFECYCLE_PHASES', () => {
  it('is a non-empty array', () => {
    expect(LIFECYCLE_PHASES.length).toBeGreaterThan(0)
  })

  it('includes ANALYZE, IMPLEMENT, DEPLOY', () => {
    expect(LIFECYCLE_PHASES).toContain('ANALYZE')
    expect(LIFECYCLE_PHASES).toContain('IMPLEMENT')
    expect(LIFECYCLE_PHASES).toContain('DEPLOY')
  })
})

describe('getNextPhase', () => {
  it('returns next phase and gate for ANALYZE', () => {
    const result = getNextPhase('ANALYZE')
    expect(result.next).not.toBeNull()
    expect(typeof result.next).toBe('string')
  })

  it('returns null next for terminal phase', () => {
    const result = getNextPhase('LISTENING')
    expect(result.next).toBeNull()
  })

  it('returns null for unknown phase', () => {
    const result = getNextPhase('NONEXISTENT')
    expect(result.next).toBeNull()
  })

  it('IMPLEMENT leads to VALIDATE', () => {
    const result = getNextPhase('IMPLEMENT')
    expect(result.next).toBe('VALIDATE')
  })
})

describe('getPrereqs', () => {
  it('returns an array for known phases', () => {
    const prereqs = getPrereqs('IMPLEMENT')
    expect(Array.isArray(prereqs)).toBe(true)
  })

  it('returns empty array for unknown phase', () => {
    const prereqs = getPrereqs('NONEXISTENT')
    expect(prereqs).toHaveLength(0)
  })
})
