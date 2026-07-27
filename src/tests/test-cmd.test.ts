import { describe, it, expect } from 'vitest'
import { testCommand } from '../cli/commands/test-cmd.js'

describe('testCommand', () => {
  it('returns a Command instance', () => {
    const cmd = testCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = testCommand()
    expect(cmd.name()).toBe('test')
  })

  it('has a non-empty description', () => {
    const cmd = testCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
