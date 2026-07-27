import { describe, it, expect } from 'vitest'
import { extractStructured, compactBullets, type StructuredBlock } from '../core/hooks/compact-extract.js'

describe('extractStructured', () => {
  it('extrai bloco JSON de output', () => {
    const output = 'result: {"name":"test","status":"ok"} done'
    const blocks = extractStructured(output)
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    expect(blocks[0].kind).toBe('json')
    expect(blocks[0].parsed).toEqual({ name: 'test', status: 'ok' })
  })

  it('extrai lista markdown', () => {
    const output = 'items:\n- a\n- b\n- c'
    const blocks = extractStructured(output)
    expect(blocks.some((b) => b.kind === 'list')).toBe(true)
  })

  it('extrai lista numerada', () => {
    const output = 'steps:\n1. first\n2. second'
    const blocks = extractStructured(output)
    expect(blocks.some((b) => b.kind === 'list')).toBe(true)
  })

  it('retorna vazio para texto sem estrutura', () => {
    const blocks = extractStructured('hello world')
    expect(blocks).toEqual([])
  })
})

describe('compactBullets', () => {
  it('converte array JSON em bullets', () => {
    const block: StructuredBlock = { kind: 'json', parsed: ['a', 'b', 'c'] }
    const bullets = compactBullets(block)
    expect(bullets).toContain('- a')
    expect(bullets).toContain('- b')
    expect(bullets).toContain('- c')
  })

  it('converte objeto JSON em chave: valor', () => {
    const block: StructuredBlock = { kind: 'json', parsed: { name: 'test', status: 'ok' } }
    const bullets = compactBullets(block)
    expect(bullets).toContain('- name: test')
    expect(bullets).toContain('- status: ok')
  })

  it('limita a 5 bullets', () => {
    const block: StructuredBlock = { kind: 'json', parsed: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 } }
    const bullets = compactBullets(block)
    expect(bullets.length).toBeLessThanOrEqual(5)
  })

  it('converte lista markdown em bullets', () => {
    const block: StructuredBlock = { kind: 'list', lines: ['x', 'y', 'z'] }
    const bullets = compactBullets(block)
    expect(bullets).toContain('- x')
    expect(bullets).toContain('- y')
  })

  it('retorna array vazio para json sem chaves úteis', () => {
    const block: StructuredBlock = { kind: 'json', parsed: 123 }
    const bullets = compactBullets(block)
    expect(Array.isArray(bullets)).toBe(true)
  })
})
