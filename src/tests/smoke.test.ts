import { describe, it, expect } from 'vitest'
import { VERSION, PROMISE, PHASES } from '../index.js'

describe('agent-graph-flow identity (M0 smoke)', () => {
  it('expõe uma versão semver', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('declara a promessa com os três pilares (token + TDD)', () => {
    expect(PROMISE).toContain('token')
    expect(PROMISE.toLowerCase()).toContain('tdd')
  })

  it('tem exatamente as 3 fases canônicas SHAPE → BUILD → SHIP', () => {
    expect(PHASES).toEqual(['SHAPE', 'BUILD', 'SHIP'])
  })
})
