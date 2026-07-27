import { describe, it, expect } from 'vitest'
import { generatePrdCommand } from '../cli/commands/generate-prd-cmd.js'

describe('generatePrdCommand', () => {
  it('returns a Command instance', () => {
    const cmd = generatePrdCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = generatePrdCommand()
    expect(cmd.name()).toBe('generate-prd')
  })

  it('has a non-empty description', () => {
    const cmd = generatePrdCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
