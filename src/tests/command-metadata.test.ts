/*!
 * TDD: command metadata — aliases + argHints (node_063e0234563d).
 *
 * AC1: A command with argHint exposes it for UI display.
 * AC2: Alias typed resolves to the canonical command.
 */

import { describe, it, expect } from 'vitest'
import { COMMANDS } from '../tui/dispatch-catalog.js'
import { resolveAlias } from '../tui/dispatch-parsing.js'

// Helpers that pass COMMANDS so tests don't have to import separately
function resolve(candidate: string): string {
  return resolveAlias(candidate, COMMANDS)
}

describe('AC1: commands have argHint field on relevant commands', () => {
  it('COMMANDS array includes at least one command with argHint', () => {
    const withHints = COMMANDS.filter((c) => c.argHint)
    expect(withHints.length).toBeGreaterThan(0)
  })

  it('run command has an argHint containing <prompt>', () => {
    const runCmd = COMMANDS.find((c) => c.name === 'run')
    expect(runCmd).toBeDefined()
    expect(runCmd!.argHint).toMatch(/<prompt>/i)
  })
})

describe('AC2: alias resolves to canonical command', () => {
  it('/n resolves to "next"', () => {
    expect(resolve('n')).toBe('next')
  })

  it('/s resolves to "stats"', () => {
    expect(resolve('s')).toBe('stats')
  })

  it('/m resolves to "metrics"', () => {
    expect(resolve('m')).toBe('metrics')
  })
})
