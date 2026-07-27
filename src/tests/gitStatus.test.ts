import { describe, it, expect } from 'vitest'
import { gitStatus, parseUntrackedFiles } from '../core/tool-compress/filters/gitStatus.js'

describe('gitStatus — clean/empty', () => {
  it('returns clean message for empty string', () => {
    expect(gitStatus('')).toBe('Clean working tree')
  })

  it('returns clean or empty message for whitespace-only input', () => {
    const result = gitStatus('   \n\n  ')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('gitStatus — branch extraction', () => {
  it('extracts branch from "On branch X" line', () => {
    const input = 'On branch main\nnothing to commit, working tree clean'
    const result = gitStatus(input)
    expect(result).toContain('* main')
  })

  it('extracts branch from ## short-format header', () => {
    const input = '## feature/my-branch...origin/feature/my-branch'
    const result = gitStatus(input)
    expect(result).toContain('* feature/my-branch')
  })
})

describe('gitStatus — staged files', () => {
  it('counts staged new file', () => {
    const input = 'A  src/new-file.ts'
    expect(gitStatus(input)).toContain('Staged: 1')
  })

  it('includes staged file path', () => {
    const input = 'A  src/new-file.ts'
    expect(gitStatus(input)).toContain('src/new-file.ts')
  })

  it('counts modified staged file', () => {
    const input = 'M  src/existing.ts'
    expect(gitStatus(input)).toContain('Staged: 1')
  })
})

describe('gitStatus — modified files', () => {
  it('counts modified unstaged file', () => {
    const input = ' M src/modified.ts'
    expect(gitStatus(input)).toContain('Modified: 1')
  })

  it('parses long-format modified line', () => {
    const input = '\tmodified:   src/something.ts'
    expect(gitStatus(input)).toContain('Modified: 1')
  })
})

describe('gitStatus — untracked files', () => {
  it('counts untracked file', () => {
    const input = '?? some-new-file.txt'
    expect(gitStatus(input)).toContain('Untracked: 1')
  })

  it('includes untracked file path', () => {
    const input = '?? some-new-file.txt'
    expect(gitStatus(input)).toContain('some-new-file.txt')
  })
})

describe('gitStatus — conflicts', () => {
  it('counts conflict from "both modified" long format', () => {
    const input = '\tboth modified:   src/conflicted.ts'
    expect(gitStatus(input)).toContain('conflicts: 1')
  })
})

describe('gitStatus — nothing to commit', () => {
  it('shows clean when no changes found', () => {
    const input = 'On branch main\nnothing to commit'
    const result = gitStatus(input)
    expect(result).toContain('clean — nothing to commit')
  })
})

describe('gitStatus — combined output', () => {
  it('shows branch + staged + untracked together', () => {
    const input = ['On branch develop', 'A  src/new.ts', '?? tmp.txt'].join('\n')
    const result = gitStatus(input)
    expect(result).toContain('* develop')
    expect(result).toContain('Staged: 1')
    expect(result).toContain('Untracked: 1')
  })
})

describe('parseUntrackedFiles — reusable porcelain parser (shared with agf done)', () => {
  it('extracts untracked file paths from --porcelain output', () => {
    const input = ['?? src/new.ts', 'A  src/staged.ts', '?? tmp.txt'].join('\n')
    expect(parseUntrackedFiles(input)).toEqual(['src/new.ts', 'tmp.txt'])
  })

  it('returns [] for clean/empty input', () => {
    expect(parseUntrackedFiles('')).toEqual([])
  })

  it('returns [] when nothing is untracked', () => {
    const input = ['M  src/existing.ts'].join('\n')
    expect(parseUntrackedFiles(input)).toEqual([])
  })
})
