import { describe, it, expect } from 'vitest'
import { healCommand } from '../cli/commands/heal-cmd.js'

describe('healCommand', () => {
  it('returns a Command instance', () => {
    const cmd = healCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = healCommand()
    expect(cmd.name()).toBe('heal')
  })

  it('has a non-empty description', () => {
    const cmd = healCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('declares a --patterns option to surface failure-pattern analysis', () => {
    const cmd = healCommand()
    const patternsOption = cmd.options.find((o) => o.long === '--patterns')
    expect(patternsOption).toBeDefined()
  })

  it('declares a --known-fix option to surface the helper-record lookup (T3.3)', () => {
    const cmd = healCommand()
    const knownFixOption = cmd.options.find((o) => o.long === '--known-fix')
    expect(knownFixOption).toBeDefined()
  })

  it('declares a --recipe option to surface the deterministic recovery-recipes classification (node_wire_8f2d2d6db4fc)', () => {
    const cmd = healCommand()
    const recipeOption = cmd.options.find((o) => o.long === '--recipe')
    expect(recipeOption).toBeDefined()
  })

  it('declares a --pipeline option to surface the Petri-net deadlock check (node_wire_2a54857155a1)', () => {
    const cmd = healCommand()
    const pipelineOption = cmd.options.find((o) => o.long === '--pipeline')
    expect(pipelineOption).toBeDefined()
  })
})
