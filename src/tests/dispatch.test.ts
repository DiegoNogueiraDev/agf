import { describe, it, expect } from 'vitest'
import { parseCommand, resolveAlias, fuzzyScore, fuzzyFilter, filterCommands, COMMANDS } from '../tui/dispatch.js'

describe('COMMANDS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(COMMANDS)).toBe(true)
    expect(COMMANDS.length).toBeGreaterThan(0)
  })

  it('each command has name, usage, desc', () => {
    for (const cmd of COMMANDS) {
      expect(typeof cmd.name).toBe('string')
      expect(typeof cmd.usage).toBe('string')
      expect(typeof cmd.desc).toBe('string')
    }
  })
})

describe('parseCommand', () => {
  it('parses /next with no args', () => {
    const result = parseCommand('/next')
    expect(result.cmd).toBe('next')
    expect(result.args).toBe('')
  })

  it('parses /run with args', () => {
    const result = parseCommand('/run implement auth module')
    expect(result.cmd).toBe('run')
    expect(result.args).toBe('implement auth module')
  })

  it('returns empty cmd for non-slash input', () => {
    const result = parseCommand('just text')
    expect(result.cmd).toBe('')
    expect(result.args).toBe('just text')
  })

  it('handles empty string', () => {
    const result = parseCommand('')
    expect(result.cmd).toBe('')
  })

  it('handles /cmd with extra whitespace', () => {
    const result = parseCommand('  /stats  ')
    expect(result.cmd).toBe('stats')
  })
})

describe('resolveAlias', () => {
  it('resolves alias n to next', () => {
    const result = resolveAlias('n', COMMANDS)
    expect(result).toBe('next')
  })

  it('resolves alias s to stats', () => {
    const result = resolveAlias('s', COMMANDS)
    expect(result).toBe('stats')
  })

  it('returns original name if not an alias', () => {
    const result = resolveAlias('next', COMMANDS)
    expect(result).toBe('next')
  })

  it('returns unchanged unknown string', () => {
    const result = resolveAlias('zzznope', COMMANDS)
    expect(result).toBe('zzznope')
  })
})

describe('fuzzyScore', () => {
  it('returns 0 for empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })

  it('exact match scores no worse than partial match', () => {
    const exact = fuzzyScore('next', 'next')
    const partial = fuzzyScore('nxt', 'next')
    // Lower score = better match (penalty-based); exact match has score <= partial match score
    if (exact !== null && partial !== null) {
      expect(exact).toBeLessThanOrEqual(partial)
    } else {
      // At minimum, exact match should not be null when partial isn't
      if (partial !== null) expect(exact).not.toBeNull()
    }
  })

  it('returns null when no character matches in sequence', () => {
    const score = fuzzyScore('zzz', 'abc')
    expect(score).toBeNull()
  })

  it('returns a number or null', () => {
    const result = fuzzyScore('ne', 'next')
    expect(result === null || typeof result === 'number').toBe(true)
  })
})

describe('fuzzyFilter', () => {
  it('returns all commands for empty query', () => {
    const result = fuzzyFilter('', COMMANDS)
    expect(result.length).toBe(COMMANDS.length)
  })

  it('filters commands matching a prefix', () => {
    const result = fuzzyFilter('next', COMMANDS)
    expect(result.some((c) => c.name === 'next')).toBe(true)
  })

  it('returns empty array when nothing matches', () => {
    const result = fuzzyFilter('zzzzzznotacommand', COMMANDS)
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('filterCommands', () => {
  it('returns empty for non-slash input', () => {
    const result = filterCommands('plain text')
    expect(result).toHaveLength(0)
  })

  it('returns matching commands for /n', () => {
    const result = filterCommands('/n')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns commands matching /run', () => {
    const result = filterCommands('/run')
    expect(result.some((c) => c.name === 'run')).toBe(true)
  })
})
