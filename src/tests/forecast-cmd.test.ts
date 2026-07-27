import { describe, it, expect } from 'vitest'
import { forecastCommand } from '../cli/commands/forecast-cmd.js'

describe('forecastCommand', () => {
  it('returns a Command instance', () => {
    const cmd = forecastCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = forecastCommand()
    expect(cmd.name()).toBe('forecast')
  })

  it('has a non-empty description', () => {
    const cmd = forecastCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('registers the capacity subcommand', () => {
    const cmd = forecastCommand()
    expect(cmd.commands.map((c) => c.name())).toContain('capacity')
  })
})
