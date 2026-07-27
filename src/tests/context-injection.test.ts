import { describe, it, expect, beforeEach } from 'vitest'
import { pushFact, getCompactFacts, resetFacts } from '../core/hooks/context-injection.js'

describe('context-injection', () => {
  beforeEach(() => resetFacts())

  it('getCompactFacts retorna vazio sem facts', () => {
    expect(getCompactFacts()).toBe('')
  })

  it('pushFact acumula e getCompactFacts formata', () => {
    pushFact('Error: boom')
    pushFact('refactor auth')
    const out = getCompactFacts()
    expect(out).toContain('Error: boom')
    expect(out).toContain('refactor auth')
    expect(out).toMatch(/^ {2}• /m)
  })

  it('respeita MAX_FACTS = 10', () => {
    for (let i = 0; i < 15; i++) pushFact(`fact ${i}`)
    const out = getCompactFacts()
    const lines = out.split('\n').filter(Boolean)
    expect(lines.length).toBeLessThanOrEqual(10)
  })

  it('resetFacts limpa', () => {
    pushFact('something')
    resetFacts()
    expect(getCompactFacts()).toBe('')
  })
})
