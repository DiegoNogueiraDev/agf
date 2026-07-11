import { describe, it, expect } from 'vitest'
import { mrdCommand } from '../cli/commands/mrd-cmd.js'

describe('mrdCommand', () => {
  it('returns a Command instance', () => {
    const cmd = mrdCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = mrdCommand()
    expect(cmd.name()).toBe('mrd')
  })

  it('has a non-empty description', () => {
    const cmd = mrdCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('exposes --dir and --select options', () => {
    const cmd = mrdCommand()
    const flags = cmd.options.map((o) => o.long)
    expect(flags).toContain('--dir')
    expect(flags).toContain('--select')
  })
})
