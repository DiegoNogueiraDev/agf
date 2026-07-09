import { describe, it, expect } from 'vitest'
import { lintCommand } from '../cli/commands/lint-cmd.js'

describe('lintCommand', () => {
  it('returns a Command instance', () => {
    const cmd = lintCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = lintCommand()
    expect(cmd.name()).toBe('lint')
  })

  it('has a non-empty description', () => {
    const cmd = lintCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
