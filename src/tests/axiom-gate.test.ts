import { describe, it, expect } from 'vitest'
import { checkAxiomGate } from '../core/constitution/axiom-gate.js'
import type { AxiomGateContext } from '../core/constitution/axiom-gate.js'

function makeCtx(overrides: Partial<AxiomGateContext> = {}): AxiomGateContext {
  return {
    activePrincipleIds: [],
    axiomLinks: [],
    mode: 'strict',
    ...overrides,
  }
}

describe('checkAxiomGate', () => {
  it('returns a result object', () => {
    const result = checkAxiomGate(makeCtx())
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('mode=off always passes', () => {
    const result = checkAxiomGate(
      makeCtx({
        activePrincipleIds: ['p1', 'p2'],
        axiomLinks: [],
        mode: 'off',
      }),
    )
    expect(result.blocked).toBe(false)
    expect(result.mode).toBe('off')
  })

  it('passes with no active principles', () => {
    const result = checkAxiomGate(makeCtx({ activePrincipleIds: [], mode: 'strict' }))
    expect(result.blocked).toBe(false)
    expect(result.orphanPrincipleIds).toHaveLength(0)
  })

  it('blocks in strict mode when principle has no axiom link', () => {
    const result = checkAxiomGate(
      makeCtx({
        activePrincipleIds: ['p-orphan'],
        axiomLinks: [],
        mode: 'strict',
      }),
    )
    expect(result.blocked).toBe(true)
    expect(result.orphanPrincipleIds).toContain('p-orphan')
  })

  it('does not block in advisory mode', () => {
    const result = checkAxiomGate(
      makeCtx({
        activePrincipleIds: ['p-orphan'],
        axiomLinks: [],
        mode: 'advisory',
      }),
    )
    expect(result.blocked).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('passes when all principles are linked', () => {
    const result = checkAxiomGate(
      makeCtx({
        activePrincipleIds: ['p1'],
        axiomLinks: [{ constitutionPrincipleId: 'p1', revoked: false } as never],
        mode: 'strict',
      }),
    )
    expect(result.blocked).toBe(false)
    expect(result.orphanPrincipleIds).toHaveLength(0)
  })

  it('includes mode in result', () => {
    const result = checkAxiomGate(makeCtx({ mode: 'advisory' }))
    expect(result.mode).toBe('advisory')
  })
})
