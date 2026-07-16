import { describe, it, expect } from 'vitest'
import { statusCommand } from '../cli/commands/status-cmd.js'

describe('statusCommand', () => {
  it('returns a Command instance', () => {
    const cmd = statusCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = statusCommand()
    expect(cmd.name()).toBe('status')
  })

  it('has a non-empty description', () => {
    const cmd = statusCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
