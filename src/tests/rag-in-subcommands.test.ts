/*!
 * TDD: async/cached sub-command enrichment for RAG-IN (node_f836dc151572).
 *
 * AC1: retrieve-command "drenar risco em task" → top-3 includes "agf risk triage"
 * AC2: corpus NOT rebuilt on unchanged command set (hash cache hit)
 * AC3: new sub-command → hash changes → reindex includes it on next retrieve
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildLiveCorpus } from '../core/rag-in/builtin-corpus.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'
import { buildSubcommandCorpus, clearSubcommandCache } from '../core/rag-in/subcommand-cache.js'
import type { CommandChunk } from '../core/rag-in/command-chunk.js'

describe('RAG-IN subcommand enrichment — AC1: risk triage in corpus', () => {
  it('live corpus contains "agf risk triage" (not doubled "agf risk risk triage")', () => {
    const corpus = buildLiveCorpus()
    const cmd = corpus.find((c) => c.command === 'agf risk triage')
    expect(cmd).toBeDefined()
    // must not be the doubled form
    expect(corpus.find((c) => c.command.includes('risk risk'))).toBeUndefined()
  })

  it('retrieve-command for "drenar risco em task" returns agf risk triage in top-3 (AC1)', () => {
    const corpus = buildLiveCorpus()
    const res = retrieveCommand('drenar risco em task', corpus)
    const commands = res.candidates.slice(0, 3).map((c) => c.chunk.command)
    expect(commands.some((c) => c === 'agf risk triage')).toBe(true)
  })

  it('live corpus contains "agf loop start" (not "agf loop loop start")', () => {
    const corpus = buildLiveCorpus()
    const cmd = corpus.find((c) => c.command === 'agf loop start')
    expect(cmd).toBeDefined()
    expect(corpus.find((c) => c.command.includes('loop loop'))).toBeUndefined()
  })
})

describe('RAG-IN subcommand cache — AC2: hash cache hit', () => {
  beforeEach(() => clearSubcommandCache())

  it('AC2: second call with same commands returns cached result (build fn not called twice)', () => {
    const buildFn = vi.fn((cmds: CommandChunk[]): CommandChunk[] => cmds)
    const base: CommandChunk[] = [
      {
        id: 'a',
        intent: 'intent a',
        command: 'agf a',
        family: 'harness',
        tool: 'agf a',
        flags_explained: '',
        danger: false,
        source: 'harness',
      },
    ]
    const r1 = buildSubcommandCorpus(base, buildFn)
    const r2 = buildSubcommandCorpus(base, buildFn)
    expect(r1).toBe(r2) // same reference = cache hit
    expect(buildFn).toHaveBeenCalledTimes(1) // built only once
  })
})

describe('RAG-IN subcommand cache — AC3: hash invalidation on new command', () => {
  beforeEach(() => clearSubcommandCache())

  it('AC3: adding a new chunk to base invalidates cache and triggers rebuild', () => {
    const chunk = (id: string): CommandChunk => ({
      id,
      intent: `intent ${id}`,
      command: `agf ${id}`,
      family: 'harness',
      tool: `agf ${id}`,
      flags_explained: '',
      danger: false,
      source: 'harness',
    })

    const buildFn = vi.fn((cmds: CommandChunk[]) => cmds)
    const base1 = [chunk('a'), chunk('b')]
    const base2 = [chunk('a'), chunk('b'), chunk('c')]

    buildSubcommandCorpus(base1, buildFn)
    buildSubcommandCorpus(base2, buildFn)

    expect(buildFn).toHaveBeenCalledTimes(2) // rebuilt because hash changed
  })
})
