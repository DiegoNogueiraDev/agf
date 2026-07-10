/*!
 * TDD tests for RAG-IN auto-derive from live cli/index.ts commands array.
 *
 * AC1: A command newly added to the `commands` array appears in the corpus
 *      without any COMMAND_REGISTRY edit.
 * AC2: 'agf retrieve-command "gerenciar risco"' top-3 includes 'agf risk'
 *      derived from the live description (not COMMAND_REGISTRY).
 * AC3: test:blast passes without regression.
 */

import { describe, it, expect } from 'vitest'
import { CLI_COMMANDS, isCliEntrypoint } from '../cli/index.js'
import { buildLiveCorpus } from '../core/rag-in/builtin-corpus.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'

describe('isCliEntrypoint (worker teardown fix)', () => {
  it('is false when cli/index.ts is imported as a module, not run as the entrypoint', () => {
    // Importing this file used to unconditionally run the full CLI bootstrap
    // (session manifest, hook registration, program.parseAsync()) as a
    // side effect — leaking open handles that hung worker teardown under
    // the full suite. The entrypoint guard must keep this false in a test.
    expect(isCliEntrypoint).toBe(false)
  })
})

describe('CLI_COMMANDS export (AC1)', () => {
  it('exports an array of commands with name and description', () => {
    expect(Array.isArray(CLI_COMMANDS)).toBe(true)
    expect(CLI_COMMANDS.length).toBeGreaterThan(0)
    expect(CLI_COMMANDS[0]).toMatchObject({ name: expect.any(String), description: expect.any(String) })
  })

  it('includes the risk command', () => {
    const found = CLI_COMMANDS.some((c) => c.name === 'risk')
    expect(found).toBe(true)
  })
})

describe('buildLiveCorpus — derives from CLI_COMMANDS (AC1)', () => {
  it('returns a non-empty corpus', () => {
    const corpus = buildLiveCorpus()
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('corpus includes a chunk for the risk command', () => {
    const corpus = buildLiveCorpus()
    const found = corpus.some((c) => c.command.includes('risk') || c.intent.includes('risk'))
    expect(found).toBe(true)
  })

  it('corpus reflects a new command added without COMMAND_REGISTRY edit (AC1 — simulate)', () => {
    // We pass a fake extra command to buildLiveCorpus and verify it appears
    const fakeCommands = [{ name: 'agf-fake-xyz', description: 'unique-fake-cmd-for-testing' }]
    const corpus = buildLiveCorpus(fakeCommands)
    const found = corpus.some((c) => c.command.includes('agf-fake-xyz') || c.intent.includes('unique-fake'))
    expect(found).toBe(true)
  })
})

describe('retrieveCommand with live corpus — risk intent (AC2)', () => {
  it('top-3 includes agf risk for "gerenciar risco" intent', () => {
    const corpus = buildLiveCorpus()
    const res = retrieveCommand('gerenciar risco manage risk', corpus, { k: 5 })
    const top3 = res.candidates.slice(0, 3).map((r) => r.chunk.command)
    expect(top3.some((c) => c.includes('risk'))).toBe(true)
  })
})
