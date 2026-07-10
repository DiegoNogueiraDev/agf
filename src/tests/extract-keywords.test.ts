import { describe, it, expect } from 'vitest'
import { extractFacts, formatFactsAsMemory } from '../core/hooks/extract-keywords.js'

describe('extractFacts', () => {
  const ts = '2026-06-12T12:00:00.000Z'

  it('extrai erro de output', () => {
    const facts = extractFacts('Error: connection refused', 'Bash', ts)
    expect(facts.length).toBeGreaterThanOrEqual(1)
    expect(facts[0].kind).toBe('error')
    expect(facts[0].text).toMatch(/Error/i)
  })

  it('extrai decisão de output', () => {
    const facts = extractFacts('Decidido: vamos usar React', 'analyze', ts)
    expect(facts.some((f) => f.kind === 'decision')).toBe(true)
  })

  it('extrai keyword técnica', () => {
    const facts = extractFacts('refactor the auth module', 'edit', ts)
    expect(facts.some((f) => f.kind === 'keyword' && /refactor/i.test(f.text))).toBe(true)
  })

  it('retorna vazio para output sem padrões', () => {
    const facts = extractFacts('hello world', 'Bash', ts)
    expect(facts).toEqual([])
  })

  it('deduplica matches do mesmo padrão', () => {
    const facts = extractFacts('Error: fail Error: outra falha', 'Bash', ts)
    const errors = facts.filter((f) => f.kind === 'error')
    expect(errors.length).toBeLessThanOrEqual(2)
  })

  it('respeita MAX_FACTS (10)', () => {
    const long = Array.from({ length: 20 }, (_, i) => `Error: err${i} refactor ${i}`).join(' ')
    const facts = extractFacts(long, 'Bash', ts)
    expect(facts.length).toBeLessThanOrEqual(10)
  })

  it('inclui toolName e timestamp no resultado', () => {
    const facts = extractFacts('Error: boom', 'Bash', ts)
    expect(facts[0].toolName).toBe('Bash')
    expect(facts[0].timestamp).toBe(ts)
  })
})

describe('formatFactsAsMemory', () => {
  it('formata fatos como entry de memória', () => {
    const facts = [
      { kind: 'error' as const, text: 'Error: boom', toolName: 'Bash', timestamp: '2026-06-12T12:00:00.000Z' },
    ]
    const entry = formatFactsAsMemory(facts)
    expect(entry).not.toBeNull()
    expect(entry!.name).toMatch(/^extracted-facts-/)
    expect(entry!.content).toContain('[error]')
    expect(entry!.content).toContain('Error: boom')
  })

  it('retorna null para array vazio', () => {
    expect(formatFactsAsMemory([])).toBeNull()
  })
})
