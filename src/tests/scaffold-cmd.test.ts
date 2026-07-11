import { describe, it, expect } from 'vitest'
import { scaffoldCommand } from '../cli/commands/scaffold-cmd.js'

describe('scaffoldCommand', () => {
  it('returns a Command instance', () => {
    const cmd = scaffoldCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = scaffoldCommand()
    expect(cmd.name()).toBe('scaffold')
  })

  it('has a non-empty description', () => {
    const cmd = scaffoldCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
