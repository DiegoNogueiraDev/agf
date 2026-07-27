import { describe, it, expect } from 'vitest'
import { buildLiveCorpus } from '../core/rag-in/builtin-corpus.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'

describe('RAG-IN overlay: live base independent of COMMAND_REGISTRY', () => {
  it('a command NOT in COMMAND_REGISTRY but in extraCommands is discoverable', () => {
    // Simulate a brand-new command not yet added to the config registry
    const fakeNew = { name: 'whatsit', description: 'shows whatsit status for orientation' }
    const corpus = buildLiveCorpus([fakeNew])
    const result = retrieveCommand('whatsit orientation', corpus)
    expect(result.top).not.toBeNull()
    // The chunk id or command includes the command name
    expect(result.top!.id + ' ' + result.top!.command).toContain('whatsit')
  })

  it('a command in extraCommands with synonyms overlay ranks higher by synonym intent', () => {
    const cmdA = { name: 'cmd-alpha', description: 'alpha thing without synonym' }
    const cmdB = { name: 'cmd-beta', description: 'beta orientation guide synonyms' }
    const corpus = buildLiveCorpus([cmdA, cmdB])
    // search by synonym phrase that matches cmd-beta description
    const result = retrieveCommand('orientation guide', corpus)
    expect(result.top).not.toBeNull()
    expect(result.top!.id + ' ' + result.top!.command).toContain('cmd-beta')
  })
})
