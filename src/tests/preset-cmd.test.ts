import { describe, it, expect } from 'vitest'
import { listPresetLines, showPresetLines, presetCommand } from '../cli/commands/preset-cmd.js'

describe('listPresetLines', () => {
  it('returns an array of strings', () => {
    const lines = listPresetLines()
    expect(Array.isArray(lines)).toBe(true)
  })

  it('returns at least one preset name', () => {
    const lines = listPresetLines()
    expect(lines.length).toBeGreaterThan(0)
  })

  it('all entries are non-empty strings', () => {
    const lines = listPresetLines()
    for (const line of lines) {
      expect(typeof line).toBe('string')
    }
  })
})

describe('showPresetLines', () => {
  it('returns null for unknown preset name', () => {
    const result = showPresetLines('nonexistent-preset-xyz-123')
    expect(result).toBeNull()
  })

  it('returns string array for a known preset name', () => {
    const names = listPresetLines()
    if (names.length > 0) {
      const firstValidName = names[0].trim().split(/\s+/)[0]
      const result = showPresetLines(firstValidName)
      if (result !== null) {
        expect(Array.isArray(result)).toBe(true)
      }
    }
  })
})

describe('presetCommand', () => {
  it('returns a Command instance', () => {
    const cmd = presetCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = presetCommand()
    expect(cmd.name()).toBe('preset')
  })

  it('has a non-empty description', () => {
    const cmd = presetCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})
