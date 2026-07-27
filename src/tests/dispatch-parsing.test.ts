/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_efcf7dfc53cc (F9 follow-up): dispatch-parsing.ts had zero test
 * coverage despite being the TUI's command-parsing/fuzzy-match critical
 * path (autocomplete palette + slash-command dispatch).
 */
import { describe, it, expect } from 'vitest'
import {
  parseCommand,
  resolveAlias,
  fuzzyScore,
  fuzzyFilter,
  filterCommands,
  type ParsedCommand,
} from '../tui/dispatch-parsing.js'
import type { SlashCommand } from '../tui/dispatch-catalog.js'

describe('parseCommand', () => {
  it('splits "/cmd args" into cmd and trimmed args', () => {
    const result = parseCommand('/next some args here')
    expect(result).toEqual<ParsedCommand>({ cmd: 'next', args: 'some args here' })
  })

  it('returns empty args when there is no space after the command', () => {
    expect(parseCommand('/stats')).toEqual({ cmd: 'stats', args: '' })
  })

  it('lowercases the command name', () => {
    expect(parseCommand('/NEXT')).toEqual({ cmd: 'next', args: '' })
  })

  it('treats non-slash input as cmd="" with the full trimmed text as args', () => {
    expect(parseCommand('  hello world  ')).toEqual({ cmd: '', args: 'hello world' })
  })

  it('trims surrounding whitespace on the whole input before parsing', () => {
    expect(parseCommand('  /run   do something  ')).toEqual({ cmd: 'run', args: 'do something' })
  })
})

describe('resolveAlias', () => {
  const commands: SlashCommand[] = [
    { name: 'next', aliases: ['n'], usage: '/next', desc: 'x' },
    { name: 'stats', usage: '/stats', desc: 'x' },
  ]

  it('resolves an alias to its canonical command name', () => {
    expect(resolveAlias('n', commands)).toBe('next')
  })

  it('returns the exact name unchanged when already canonical', () => {
    expect(resolveAlias('stats', commands)).toBe('stats')
  })

  it('returns the input unchanged when it matches no command or alias', () => {
    expect(resolveAlias('unknown', commands)).toBe('unknown')
  })
})

describe('fuzzyScore', () => {
  it('returns 0 for an empty query (matches trivially)', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })

  it('returns null when the query is not a subsequence of the text', () => {
    expect(fuzzyScore('xyz', 'next')).toBeNull()
  })

  it('scores an exact-prefix match lower than a match starting mid-string', () => {
    const prefixScore = fuzzyScore('nex', 'next')
    const midScore = fuzzyScore('ext', 'next')
    expect(prefixScore).not.toBeNull()
    expect(midScore).not.toBeNull()
    expect(prefixScore as number).toBeLessThan(midScore as number)
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('NEX', 'next')).toBe(fuzzyScore('nex', 'next'))
  })

  it('penalizes gaps between matched characters', () => {
    const contiguous = fuzzyScore('ne', 'next')
    const gapped = fuzzyScore('nt', 'next')
    expect(contiguous).not.toBeNull()
    expect(gapped).not.toBeNull()
    expect(contiguous as number).toBeLessThan(gapped as number)
  })
})

describe('fuzzyFilter', () => {
  const commands: SlashCommand[] = [
    { name: 'next', usage: '/next', desc: 'x' },
    { name: 'stats', usage: '/stats', desc: 'x' },
    { name: 'metrics', aliases: ['m'], usage: '/metrics', desc: 'x' },
  ]

  it('returns all commands unchanged (stable order) for an empty query', () => {
    expect(fuzzyFilter('', commands)).toEqual(commands)
  })

  it('filters out commands that do not match the query at all', () => {
    const result = fuzzyFilter('zzz', commands)
    expect(result).toHaveLength(0)
  })

  it('matches via an alias, not just the canonical name', () => {
    const result = fuzzyFilter('m', commands)
    expect(result.map((c) => c.name)).toContain('metrics')
  })

  it('orders results by best (lowest) score first', () => {
    const result = fuzzyFilter('s', commands)
    expect(result[0].name).toBe('stats') // 's' is the prefix of 'stats', best score
  })
})

describe('filterCommands', () => {
  it('returns empty array when the input does not start with "/"', () => {
    expect(filterCommands('next')).toEqual([])
  })

  it('filters the built-in COMMANDS catalog by the query after "/"', () => {
    const result = filterCommands('/nex')
    expect(result.map((c) => c.name)).toContain('next')
  })

  it('only uses the first word after "/" as the query, ignoring trailing args', () => {
    const result = filterCommands('/next some trailing text')
    expect(result.map((c) => c.name)).toContain('next')
  })

  it('includes extra commands passed in alongside the built-in catalog', () => {
    const extra: SlashCommand[] = [{ name: 'my-skill', usage: '/my-skill', desc: 'x', source: 'skill' }]
    const result = filterCommands('/my-skill', extra)
    expect(result.map((c) => c.name)).toContain('my-skill')
  })
})
