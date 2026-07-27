import { describe, it, expect } from 'vitest'
import {
  CANONICAL_PHASES,
  INTERNAL_TO_CANONICAL,
  CANONICAL_TO_INTERNAL,
  toCanonicalPhase,
  detectPhase,
} from '../core/lifecycle/phase.js'

describe('motor de fases SHAPE → BUILD → SHIP (9 internas → 3 canônicas)', () => {
  it('expõe exatamente as 3 fases canônicas em ordem', () => {
    expect(CANONICAL_PHASES).toEqual(['SHAPE', 'BUILD', 'SHIP'])
  })

  it('mapeia todas as 9 fases internas para uma canônica', () => {
    const internal = Object.keys(INTERNAL_TO_CANONICAL)
    expect(internal).toHaveLength(9)
    expect(INTERNAL_TO_CANONICAL.ANALYZE).toBe('SHAPE')
    expect(INTERNAL_TO_CANONICAL.DESIGN).toBe('SHAPE')
    expect(INTERNAL_TO_CANONICAL.PLAN).toBe('SHAPE')
    expect(INTERNAL_TO_CANONICAL.IMPLEMENT).toBe('BUILD')
    expect(INTERNAL_TO_CANONICAL.VALIDATE).toBe('BUILD')
    expect(INTERNAL_TO_CANONICAL.REVIEW).toBe('SHIP')
    expect(INTERNAL_TO_CANONICAL.HANDOFF).toBe('SHIP')
    expect(INTERNAL_TO_CANONICAL.DEPLOY).toBe('SHIP')
    expect(INTERNAL_TO_CANONICAL.LISTENING).toBe('SHIP')
  })

  it('a inversa cobre as 9 internas sem sobreposição', () => {
    const all = [...CANONICAL_TO_INTERNAL.SHAPE, ...CANONICAL_TO_INTERNAL.BUILD, ...CANONICAL_TO_INTERNAL.SHIP]
    expect(all).toHaveLength(9)
    expect(new Set(all).size).toBe(9)
  })

  it('resolver de compat aceita nome canônico e interno (case-insensitive)', () => {
    expect(toCanonicalPhase('BUILD')).toBe('BUILD')
    expect(toCanonicalPhase('implement')).toBe('BUILD')
    expect(toCanonicalPhase('Deploy')).toBe('SHIP')
    expect(toCanonicalPhase('analyze')).toBe('SHAPE')
  })

  it('resolver lança em nome desconhecido', () => {
    expect(() => toCanonicalPhase('NOPE')).toThrow()
  })

  it('detectPhase é advisory a partir do status do grafo', () => {
    expect(detectPhase({ totalNodes: 0, backlog: 0, inProgress: 0, done: 0 })).toBe('SHAPE')
    // só backlog → ainda modelando/planejando
    expect(detectPhase({ totalNodes: 5, backlog: 5, inProgress: 0, done: 0 })).toBe('SHAPE')
    // algo em progresso → construindo
    expect(detectPhase({ totalNodes: 5, backlog: 3, inProgress: 1, done: 1 })).toBe('BUILD')
    // tudo done, nada pendente → entregando
    expect(detectPhase({ totalNodes: 5, backlog: 0, inProgress: 0, done: 5 })).toBe('SHIP')
  })
})
