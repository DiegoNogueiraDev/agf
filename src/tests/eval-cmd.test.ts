import { describe, it, expect } from 'vitest'
import { evalCommand } from '../cli/commands/eval-cmd.js'

describe('evalCommand', () => {
  it('returns a Command instance', () => {
    const cmd = evalCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = evalCommand()
    expect(cmd.name()).toBe('eval')
  })

  it('has a non-empty description', () => {
    const cmd = evalCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
