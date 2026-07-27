import { describe, it, expect } from 'vitest'
import { usageCommand } from '../cli/commands/usage-cmd.js'

describe('usageCommand', () => {
  it('returns a Command instance', () => {
    const cmd = usageCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = usageCommand()
    expect(cmd.name()).toBe('usage')
  })

  it('has a non-empty description', () => {
    const cmd = usageCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = usageCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})
