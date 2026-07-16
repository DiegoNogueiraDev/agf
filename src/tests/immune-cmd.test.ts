import { describe, it, expect } from 'vitest'
import { immuneCommand } from '../cli/commands/immune-cmd.js'

describe('immuneCommand', () => {
  it('returns a Command instance', () => {
    const cmd = immuneCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = immuneCommand()
    expect(cmd.name()).toBe('immune')
  })

  it('has a non-empty description', () => {
    const cmd = immuneCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
