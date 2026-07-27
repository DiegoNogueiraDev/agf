import { describe, it, expect } from 'vitest'
import { CommandPalette, categorize } from '../tui/components/CommandPalette.js'
import type { SlashCommand } from '../tui/dispatch.js'

function cmd(name: string, overrides: Partial<SlashCommand> = {}): SlashCommand {
  return { name, usage: `/${name}`, desc: '', ...overrides }
}

describe('CommandPalette', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof CommandPalette).toBe('function')
  })

  it('categorizes rabin-karp as Algorithm', () => {
    expect(categorize(cmd('rabin-karp'))).toBe('Algorithm')
  })

  it('categorizes suffix-search as Algorithm', () => {
    expect(categorize(cmd('suffix-search'))).toBe('Algorithm')
  })
})
