import { describe, it, expect } from 'vitest'
import { helpCommand } from '../cli/commands/help-cmd.js'

describe('helpCommand', () => {
  it('returns a Command instance', () => {
    const cmd = helpCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = helpCommand()
    expect(cmd.name()).toBe('help')
  })

  it('has a non-empty description', () => {
    const cmd = helpCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
