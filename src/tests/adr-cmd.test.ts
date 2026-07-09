import { describe, it, expect } from 'vitest'
import { adrCommand } from '../cli/commands/adr-cmd.js'

describe('adrCommand', () => {
  it('returns a Command instance', () => {
    const cmd = adrCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = adrCommand()
    expect(cmd.name()).toBe('adr')
  })

  it('has a non-empty description', () => {
    const cmd = adrCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = adrCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})
