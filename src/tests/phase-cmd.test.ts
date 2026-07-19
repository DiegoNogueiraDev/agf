import { describe, it, expect } from 'vitest'
import { phaseCommand } from '../cli/commands/phase-cmd.js'

describe('phaseCommand', () => {
  it('returns a Command instance', () => {
    const cmd = phaseCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = phaseCommand()
    expect(cmd.name()).toBe('phase')
  })

  it('has a non-empty description', () => {
    const cmd = phaseCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
