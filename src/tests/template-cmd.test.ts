import { describe, it, expect } from 'vitest'
import { templateCommand } from '../cli/commands/template-cmd.js'

describe('templateCommand', () => {
  it('returns a Command instance', () => {
    const cmd = templateCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = templateCommand()
    expect(cmd.name()).toBe('template')
  })

  it('has a non-empty description', () => {
    const cmd = templateCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = templateCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})
