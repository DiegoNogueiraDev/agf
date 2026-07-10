import { describe, it, expect } from 'vitest'
import { ReplSession } from '../tui/repl-session.js'

describe('ReplSession', () => {
  it('starts with empty history', () => {
    const session = new ReplSession()
    expect(session.getHistory()).toEqual([])
  })

  it('adds commands to history', () => {
    const session = new ReplSession()
    session.addToHistory('agf next')
    session.addToHistory('agf stats')
    expect(session.getHistory()).toEqual(['agf next', 'agf stats'])
  })

  it('returns a defensive copy (mutation does not affect session)', () => {
    const session = new ReplSession()
    session.addToHistory('cmd1')
    const h = session.getHistory()
    h.push('injected')
    expect(session.getHistory()).toEqual(['cmd1'])
  })

  it('trims history when maxHistory is exceeded', () => {
    const session = new ReplSession(3)
    ;['a', 'b', 'c', 'd'].forEach((c) => session.addToHistory(c))
    expect(session.getHistory()).toEqual(['b', 'c', 'd'])
  })

  it('clears all history', () => {
    const session = new ReplSession()
    session.addToHistory('cmd')
    session.clear()
    expect(session.getHistory()).toEqual([])
  })

  it('has default prompt ›› ', () => {
    expect(new ReplSession().prompt).toBe('›› ')
  })

  it('allows changing the prompt', () => {
    const session = new ReplSession()
    session.setPrompt('$ ')
    expect(session.prompt).toBe('$ ')
  })

  it('default maxHistory caps at 100', () => {
    const session = new ReplSession()
    for (let i = 0; i < 105; i++) session.addToHistory(`cmd-${i}`)
    expect(session.getHistory()).toHaveLength(100)
    expect(session.getHistory().at(-1)).toBe('cmd-104')
  })
})
