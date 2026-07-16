import { describe, it, expect } from 'vitest'
import { collectGitContext, formatGitContextXml } from '../core/utils/git-context.js'

describe('collectGitContext', () => {
  it('returns valid context from current git repo', () => {
    const ctx = collectGitContext()
    expect(ctx.branch).toBeTruthy()
    expect(ctx.remote).toBeTruthy()
    expect(Array.isArray(ctx.dirtyFiles)).toBe(true)
    expect(Array.isArray(ctx.recentCommits)).toBe(true)
  })
})

describe('formatGitContextXml', () => {
  it('formats with remote and branch', () => {
    const xml = formatGitContextXml({
      remote: 'https://github.com/user/repo',
      branch: 'main',
      dirtyFiles: [],
      dirtyTruncated: false,
      recentCommits: [],
    })
    expect(xml).toContain('<git-context>')
    expect(xml).toContain('<origin>')
    expect(xml).toContain('<branch>main</branch>')
    expect(xml).toContain('</git-context>')
  })

  it('formats with dirty files', () => {
    const xml = formatGitContextXml({
      remote: null,
      branch: null,
      dirtyFiles: ['src/test.ts', 'docs/readme.md'],
      dirtyTruncated: false,
      recentCommits: [],
    })
    expect(xml).toContain('<file>src/test.ts</file>')
    expect(xml).toContain('<file>docs/readme.md</file>')
  })

  it('formats with recent commits', () => {
    const xml = formatGitContextXml({
      remote: null,
      branch: null,
      dirtyFiles: [],
      dirtyTruncated: false,
      recentCommits: [{ hash: 'abc123', subject: 'Fix bug' }],
    })
    expect(xml).toContain('abc123')
    expect(xml).toContain('Fix bug')
  })

  it('escapes XML entities', () => {
    const xml = formatGitContextXml({
      remote: null,
      branch: null,
      dirtyFiles: ['file<"test">.ts'],
      dirtyTruncated: false,
      recentCommits: [],
    })
    expect(xml).toContain('&lt;')
    expect(xml).not.toContain('<"test">')
  })
})
