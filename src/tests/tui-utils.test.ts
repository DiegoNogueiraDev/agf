/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TUI utility modules — formatStatusLine, budgetSkills, ReplSession,
 * browser-events, fnv1aHash, and other pure helpers across src/tui/.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { formatStatusLine } from '../tui/status-line.js'
import { budgetSkills } from '../tui/skill-budget.js'
import { ReplSession } from '../tui/repl-session.js'
import { emitBrowserEvent, listBrowserEvents, clearBrowserEvents } from '../tui/browser-events.js'
import { fnv1aHash } from '../tui/browser-port.js'

// ---------------------------------------------------------------------------
// formatStatusLine — status-line.ts
// ---------------------------------------------------------------------------
describe('formatStatusLine — status line compacta (#F3)', () => {
  it('monta linha com token, custo e modelo', () => {
    expect(formatStatusLine({ totalTokens: 1240, costUsd: 0.003, model: 'claude-sonnet-4.6' })).toBe(
      '⛁ 1240 tok · $0.0030 · claude-sonnet-4.6',
    )
  })

  it('token zero', () => {
    expect(formatStatusLine({ totalTokens: 0, costUsd: 0, model: 'auto' })).toBe('⛁ 0 tok · $0.0000 · auto')
  })

  it('custo com 4 casas', () => {
    expect(formatStatusLine({ totalTokens: 500, costUsd: 0.0012345, model: 'gpt-4o' })).toBe(
      '⛁ 500 tok · $0.0012 · gpt-4o',
    )
  })

  it('token negativo normaliza para 0', () => {
    const line = formatStatusLine({ totalTokens: -100, costUsd: 0, model: 'test' })
    expect(line).toContain('0 tok')
  })
})

// ---------------------------------------------------------------------------
// budgetSkills — skill-budget.ts
// ---------------------------------------------------------------------------
describe('budgetSkills — distribui budget de caracteres (#F3)', () => {
  it('skills vazias → resultado vazio', () => {
    const r = budgetSkills([], 100)
    expect(r.skills).toEqual([])
    expect(r.truncated).toBe(false)
    expect(r.aliased).toBe(false)
    expect(r.budgetUsed).toBe(0)
  })

  it('skills curtas cabem sem truncar', () => {
    const r = budgetSkills(
      [
        { name: 'a', description: 'short' },
        { name: 'b', description: 'tiny' },
      ],
      100,
    )
    expect(r.skills).toHaveLength(2)
    expect(r.skills[0].displayDesc).toBe('short')
    expect(r.skills[1].displayDesc).toBe('tiny')
    expect(r.truncated).toBe(false)
    expect(r.aliased).toBe(false)
  })

  it('skills longas sao truncadas por character budget', () => {
    const r = budgetSkills([{ name: 'a', description: 'x'.repeat(50) }], 20)
    expect(r.aliased).toBe(false)
    const skill = r.skills[0]
    expect(skill.displayDesc.length).toBeLessThan(50)
    expect(skill.description).toBe('x'.repeat(50))
    expect(r.truncated).toBe(true)
  })

  it('nomes ocupam mais de 60% do budget → entra em alias mode', () => {
    const r = budgetSkills(
      [
        { name: 'very-long-skill-name-that-exceeds-budget', description: 'something' },
        { name: 'another-long-name-that-also-exceeds', description: 'else' },
      ],
      20,
    )
    expect(r.aliased).toBe(true)
    expect(r.truncated).toBe(true)
    for (const s of r.skills) {
      expect(s.displayName).toMatch(/^r\d+\/$/)
    }
  })

  it('alias mode produz displayNames curtos no formato rN/', () => {
    const r = budgetSkills(
      [
        { name: 'alpha-triggering-alias', description: 'x' },
        { name: 'beta-triggering-alias', description: 'y' },
      ],
      15,
    )
    expect(r.skills[0].displayName).toBe('r0/')
    expect(r.skills[1].displayName).toBe('r1/')
    expect(r.skills[0].displayDesc).toBe('')
  })
})

// ---------------------------------------------------------------------------
// ReplSession — repl-session.ts
// ---------------------------------------------------------------------------
describe('ReplSession — estado do REPL interativo', () => {
  it('inicia com history vazio e prompt padrao', () => {
    const s = new ReplSession()
    expect(s.getHistory()).toEqual([])
    expect(s.prompt).toBe('›› ')
  })

  it('addToHistory acumula comandos', () => {
    const s = new ReplSession()
    s.addToHistory('test')
    s.addToHistory('hello')
    expect(s.getHistory()).toEqual(['test', 'hello'])
  })

  it('getHistory retorna copia (isolamento)', () => {
    const s = new ReplSession()
    s.addToHistory('cmd')
    const h = s.getHistory()
    h.push('mutated')
    expect(s.getHistory()).toEqual(['cmd'])
  })

  it('clear zera o historico', () => {
    const s = new ReplSession()
    s.addToHistory('a')
    s.addToHistory('b')
    s.clear()
    expect(s.getHistory()).toEqual([])
  })

  it('maxHistory limita o tamanho', () => {
    const s = new ReplSession(3)
    s.addToHistory('a')
    s.addToHistory('b')
    s.addToHistory('c')
    s.addToHistory('d')
    expect(s.getHistory()).toEqual(['b', 'c', 'd'])
  })

  it('setPrompt altera o prompt', () => {
    const s = new ReplSession()
    s.setPrompt('$ ')
    expect(s.prompt).toBe('$ ')
  })

  it('maxHistory default 100 nao estoura', () => {
    const s = new ReplSession()
    for (let i = 0; i < 200; i++) s.addToHistory(`cmd${i}`)
    expect(s.getHistory()).toHaveLength(100)
    expect(s.getHistory()[0]).toBe('cmd100')
  })
})

// ---------------------------------------------------------------------------
// browser-events — browser-events.ts
// ---------------------------------------------------------------------------
describe('browser-events — modulo de eventos', () => {
  beforeEach(() => {
    clearBrowserEvents()
  })

  it('listBrowserEvents vazio após clear', () => {
    expect(listBrowserEvents()).toEqual([])
  })

  it('emitBrowserEvent adiciona evento com timestamp', () => {
    emitBrowserEvent({ action: 'goto', args: 'https://example.com', result: 'ok', durationMs: 100, sessionId: 's1' })
    const events = listBrowserEvents()
    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('goto')
    expect(events[0].args).toBe('https://example.com')
    expect(events[0].result).toBe('ok')
    expect(events[0].durationMs).toBe(100)
    expect(events[0].sessionId).toBe('s1')
    expect(typeof events[0].at).toBe('number')
  })

  it('listBrowserEvents com filtro retorna apenas matching', () => {
    emitBrowserEvent({ action: 'goto', args: 'url1', result: 'loaded', durationMs: 50, sessionId: 's1' })
    emitBrowserEvent({ action: 'click', args: 'button', result: 'clicked', durationMs: 30, sessionId: 's1' })
    expect(listBrowserEvents('goto')).toHaveLength(1)
    expect(listBrowserEvents('click')).toHaveLength(1)
    expect(listBrowserEvents('url1')).toHaveLength(1)
    expect(listBrowserEvents('nonexistent')).toEqual([])
  })

  it('filtro sem argumento retorna todos', () => {
    emitBrowserEvent({ action: 'a1', args: '', result: '', durationMs: 0, sessionId: 's1' })
    emitBrowserEvent({ action: 'a2', args: '', result: '', durationMs: 0, sessionId: 's1' })
    expect(listBrowserEvents()).toHaveLength(2)
  })

  it('filtro busca em action, args e result', () => {
    emitBrowserEvent({ action: 'goto', args: 'https://test.com', result: 'ok', durationMs: 10, sessionId: 's1' })
    expect(listBrowserEvents('test')).toHaveLength(1)
    expect(listBrowserEvents('ok')).toHaveLength(1)
    expect(listBrowserEvents('goto')).toHaveLength(1)
  })

  it('MAX_EVENTS = 500 corta eventos antigos', () => {
    for (let i = 0; i < 600; i++) {
      emitBrowserEvent({ action: `a${i}`, args: '', result: '', durationMs: 0, sessionId: 's1' })
    }
    expect(listBrowserEvents()).toHaveLength(500)
    expect(listBrowserEvents('a0')).toHaveLength(0)
    expect(listBrowserEvents('a599')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// fnv1aHash — browser-port.ts
// ---------------------------------------------------------------------------
describe('fnv1aHash — FNV-1a 32-bit hash (#F3)', () => {
  it('produz string hexadecimal', () => {
    const h = fnv1aHash('hello')
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })

  it('deterministico — mesma entrada, mesmo hash', () => {
    expect(fnv1aHash('test')).toBe(fnv1aHash('test'))
  })

  it('entradas diferentes produzem hashes diferentes', () => {
    expect(fnv1aHash('a')).not.toBe(fnv1aHash('b'))
  })

  it('string vazia', () => {
    const h = fnv1aHash('')
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })

  it('entrada longa nao quebra', () => {
    const long = 'x'.repeat(10000)
    expect(() => fnv1aHash(long)).not.toThrow()
  })
})
