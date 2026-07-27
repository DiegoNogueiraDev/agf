import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildSeedCorpus,
  buildHarnessCorpus,
  loadDefaultCorpus,
  buildLiveCorpus,
} from '../core/rag-in/builtin-corpus.js'
import { clearSubcommandCache } from '../core/rag-in/subcommand-cache.js'

describe('buildSeedCorpus', () => {
  it('returns a non-empty array', () => {
    const corpus = buildSeedCorpus()
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('each chunk has id, intent, command, tool, family', () => {
    const corpus = buildSeedCorpus()
    for (const c of corpus.slice(0, 5)) {
      expect(typeof c.id).toBe('string')
      expect(typeof c.intent).toBe('string')
      expect(typeof c.command).toBe('string')
      expect(typeof c.tool).toBe('string')
      expect(typeof c.family).toBe('string')
    }
  })

  it('all chunks have source=builtin', () => {
    const corpus = buildSeedCorpus()
    for (const c of corpus) {
      expect(c.source).toBe('builtin')
    }
  })
})

describe('buildHarnessCorpus', () => {
  it('returns a non-empty array', () => {
    const corpus = buildHarnessCorpus()
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('chunks have family=harness', () => {
    const corpus = buildHarnessCorpus()
    for (const c of corpus.slice(0, 3)) {
      expect(c.family).toBe('harness')
    }
  })
})

describe('loadDefaultCorpus', () => {
  it('returns at least as many chunks as seed + harness combined', () => {
    const seed = buildSeedCorpus()
    const harness = buildHarnessCorpus()
    const full = loadDefaultCorpus()
    expect(full.length).toBeGreaterThanOrEqual(seed.length + harness.length)
  })
})

describe('buildLiveCorpus — node_5bebd30be9fb (subcommand-cache wire)', () => {
  beforeEach(() => {
    clearSubcommandCache()
  })

  it('AC1: two calls with the same extraCommands return the identical array reference (cache hit)', () => {
    const extra = [{ name: 'fake-cmd', description: 'a fake command' }]
    const first = buildLiveCorpus(extra)
    const second = buildLiveCorpus(extra)
    expect(second).toBe(first)
  })

  it('AC2: changing extraCommands changes the returned reference (cache invalidated)', () => {
    const first = buildLiveCorpus([{ name: 'fake-cmd-a', description: 'a' }])
    const second = buildLiveCorpus([{ name: 'fake-cmd-b', description: 'b' }])
    expect(second).not.toBe(first)
  })

  it('still returns harness + seed chunks (behavior unchanged by caching)', () => {
    const corpus = buildLiveCorpus()
    const seed = buildSeedCorpus()
    expect(corpus.length).toBeGreaterThanOrEqual(seed.length)
    expect(corpus.some((c) => c.family === 'harness')).toBe(true)
  })
})
