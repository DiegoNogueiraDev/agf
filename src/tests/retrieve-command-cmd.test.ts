import { describe, it, expect } from 'vitest'
import { retrieveCommandCommand } from '../cli/commands/retrieve-command-cmd.js'

describe('retrieveCommandCommand', () => {
  it('returns a Command instance', () => {
    const cmd = retrieveCommandCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = retrieveCommandCommand()
    expect(cmd.name()).toBe('retrieve-command')
  })

  it('has a non-empty description', () => {
    const cmd = retrieveCommandCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
