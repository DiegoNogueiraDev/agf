import { describe, it, expect } from 'vitest'
import { specSyncCommand } from '../cli/commands/spec-sync-cmd.js'

describe('specSyncCommand', () => {
  it('returns a Command instance', () => {
    const cmd = specSyncCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = specSyncCommand()
    expect(cmd.name()).toBe('spec-sync')
  })

  it('has a non-empty description', () => {
    const cmd = specSyncCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = specSyncCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})
