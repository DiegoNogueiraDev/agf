import { describe, it, expect } from 'vitest'
import { learningCommand } from '../cli/commands/learning-cmd.js'

describe('learningCommand', () => {
  it('returns a Command instance', () => {
    const cmd = learningCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = learningCommand()
    expect(cmd.name()).toBe('learning')
  })

  it('has a non-empty description', () => {
    const cmd = learningCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('has subcommands registered', () => {
    const cmd = learningCommand()
    expect(cmd.commands.length).toBeGreaterThan(0)
  })

  it('registers a tools subcommand exposing tool-pheromone ACO routing', () => {
    const cmd = learningCommand()
    const tools = cmd.commands.find((c) => c.name() === 'tools')
    expect(tools).toBeDefined()
    const optionNames = tools?.options.map((o) => o.long) ?? []
    expect(optionNames).toContain('--deposit')
    expect(optionNames).toContain('--limit')
  })
})
