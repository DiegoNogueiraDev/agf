/*!
 * Task node_wire_86ecb1a9b0b0 — wire ac-linter.ts into the `agf ac` surface.
 *
 * AC: `agf ac lint <id>` exists and exposes lintAcsBatch on a node's ACs.
 */

import { describe, it, expect } from 'vitest'
import { acCommand } from '../cli/commands/ac-cmd.js'

describe('acCommand', () => {
  it('registers a lint subcommand', () => {
    const cmd = acCommand()
    const lint = cmd.commands.find((c) => c.name() === 'lint')
    expect(lint).toBeDefined()
  })

  it('lint subcommand requires a node id argument', () => {
    const cmd = acCommand()
    const lint = cmd.commands.find((c) => c.name() === 'lint')!
    expect(lint.registeredArguments.length).toBeGreaterThan(0)
  })

  it('lint subcommand has a non-empty description', () => {
    const cmd = acCommand()
    const lint = cmd.commands.find((c) => c.name() === 'lint')!
    expect(lint.description().length).toBeGreaterThan(0)
  })

  it('registers a suggest subcommand', () => {
    const cmd = acCommand()
    const suggest = cmd.commands.find((c) => c.name() === 'suggest')
    expect(suggest).toBeDefined()
  })

  it('suggest subcommand requires a node id argument', () => {
    const cmd = acCommand()
    const suggest = cmd.commands.find((c) => c.name() === 'suggest')!
    expect(suggest.registeredArguments.length).toBeGreaterThan(0)
  })

  it('suggest subcommand has a non-empty description', () => {
    const cmd = acCommand()
    const suggest = cmd.commands.find((c) => c.name() === 'suggest')!
    expect(suggest.description().length).toBeGreaterThan(0)
  })
})
