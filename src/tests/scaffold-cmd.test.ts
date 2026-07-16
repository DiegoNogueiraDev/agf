import { describe, it, expect, vi } from 'vitest'
import { scaffoldCommand, cacheCorpusRepo } from '../cli/commands/scaffold-cmd.js'

describe('scaffoldCommand', () => {
  it('returns a Command instance', () => {
    const cmd = scaffoldCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = scaffoldCommand()
    expect(cmd.name()).toBe('scaffold')
  })

  it('has a non-empty description', () => {
    const cmd = scaffoldCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('registers a --cache-corpus option', () => {
    const cmd = scaffoldCommand()
    const opt = cmd.options.find((o) => o.long === '--cache-corpus')
    expect(opt).toBeDefined()
  })
})

// ── cacheCorpusRepo — wires corpus-cache.ts (node_wire_b6233e54880f) ────────
describe('cacheCorpusRepo', () => {
  it('reports cached=true and the local path when clone/pull succeeds', () => {
    const deps = {
      cloneOrPullCorpus: vi.fn().mockReturnValue('/home/user/.agf/corpus/owner/repo'),
      listCorpusRepos: vi.fn().mockReturnValue([{ repo: 'owner/repo' } as never]),
    }
    const result = cacheCorpusRepo('owner/repo', deps)
    expect(result).toEqual({
      repo: 'owner/repo',
      cached: true,
      localPath: '/home/user/.agf/corpus/owner/repo',
      totalCached: 1,
    })
    expect(deps.cloneOrPullCorpus).toHaveBeenCalledWith('owner/repo')
  })

  it('reports cached=false and a null path when clone/pull fails (invalid repo, network error)', () => {
    const deps = {
      cloneOrPullCorpus: vi.fn().mockReturnValue(null),
      listCorpusRepos: vi.fn().mockReturnValue([]),
    }
    const result = cacheCorpusRepo('not-a-repo', deps)
    expect(result).toEqual({
      repo: 'not-a-repo',
      cached: false,
      localPath: null,
      totalCached: 0,
    })
  })
})
