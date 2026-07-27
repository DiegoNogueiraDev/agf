import { describe, it, expect } from 'vitest'
import { compressCommand } from '../cli/commands/compress-cmd.js'

describe('compressCommand', () => {
  it('returns a Command instance', () => {
    const cmd = compressCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = compressCommand()
    expect(cmd.name()).toBe('compress')
  })

  it('has a non-empty description', () => {
    const cmd = compressCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = compressCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })
})
