import { describe, it, expect } from 'vitest'
import { dreamCommand } from '../cli/commands/dream-cmd.js'

describe('dreamCommand', () => {
  it('returns a Command instance', () => {
    const cmd = dreamCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = dreamCommand()
    expect(cmd.name()).toBe('dream')
  })

  it('has a non-empty description', () => {
    const cmd = dreamCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = dreamCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})
