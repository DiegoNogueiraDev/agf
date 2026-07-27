import { describe, it, expect } from 'vitest'
import { calibrateCommand } from '../cli/commands/calibrate-cmd.js'

describe('calibrateCommand', () => {
  it('returns a Command instance', () => {
    const cmd = calibrateCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = calibrateCommand()
    expect(cmd.name()).toBe('calibrate')
  })

  it('has a non-empty description', () => {
    const cmd = calibrateCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
