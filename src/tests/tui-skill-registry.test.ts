import { describe, it, expect } from 'vitest'
import { SkillRegistry, createDefaultRegistry } from '../tui/skill-registry.js'

describe('SkillRegistry', () => {
  it('cria registry com built-in commands', () => {
    const reg = createDefaultRegistry()
    expect(reg.size()).toBeGreaterThan(15)
    expect(reg.find('next')).toBeDefined()
    expect(reg.find('help')).toBeDefined()
    expect(reg.find('quit')).toBeDefined()
  })

  it('find retorna undefined para comando inexistente', () => {
    const reg = createDefaultRegistry()
    expect(reg.find('nonexistent')).toBeUndefined()
  })

  it('listByPhase filtra por fase', () => {
    const reg = createDefaultRegistry()
    const analyze = reg.listByPhase('ANALYZE')
    expect(analyze.some((c) => c.name === 'generate-prd')).toBe(true)
    expect(analyze.some((c) => c.name === 'import-prd')).toBe(true)
    expect(analyze.some((c) => c.name === 'next')).toBe(false)
  })

  it('getNext retorna proxima fase ou undefined', () => {
    const reg = createDefaultRegistry()
    // IMPLEMENT tem next/run/autopilot/check/diff → prox: VALIDATE com quality
    const next = reg.getNext('IMPLEMENT')
    expect(next).toBeDefined()
    expect(next!.phase).toBe('VALIDATE')
    // DESIGN nao tem built-ins → proximo PLAN com decompose
    const designNext = reg.getNext('DESIGN')
    expect(designNext).toBeDefined()
    expect(designNext!.phase).toBe('PLAN')
  })

  it('hasHandler retorna false quando nao tem handler', () => {
    const reg = createDefaultRegistry()
    expect(reg.hasHandler('next')).toBe(false)
  })

  it('getAll retorna todos os comandos', () => {
    const reg = createDefaultRegistry()
    const all = reg.getAll()
    expect(all.length).toBeGreaterThan(15)
  })
})
