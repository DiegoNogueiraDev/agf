import { describe, it, expect } from 'vitest'
import { gitLog } from '../core/tool-compress/filters/gitLog.js'

const SAMPLE_LOG = [
  'commit abc1234def567890',
  'Author: Alice <alice@example.com>',
  'Date:   Mon Jun 23 10:00:00 2026 +0000',
  '',
  '    Add feature X',
  '',
  'commit 99900011223344',
  'Author: Bob <bob@example.com>',
  'Date:   Sun Jun 22 10:00:00 2026 +0000',
  '',
  '    Fix bug Y',
].join('\n')

describe('gitLog', () => {
  it('returns string', () => {
    expect(typeof gitLog(SAMPLE_LOG)).toBe('string')
  })

  it('collapses verbose log to one line per commit', () => {
    const result = gitLog(SAMPLE_LOG)
    const lines = result.split('\n').filter(Boolean)
    expect(lines.length).toBe(2)
  })

  it('includes hash prefix', () => {
    const result = gitLog(SAMPLE_LOG)
    expect(result).toContain('abc1234')
  })

  it('includes commit subject', () => {
    const result = gitLog(SAMPLE_LOG)
    expect(result).toContain('Add feature X')
  })

  it('passes through empty string', () => {
    const result = gitLog('')
    expect(result).toBe('')
  })

  it('passes through non-git content unchanged', () => {
    const plain = 'just some text without commit lines'
    expect(gitLog(plain)).toBe(plain)
  })

  it('strips Author/Date lines', () => {
    const result = gitLog(SAMPLE_LOG)
    expect(result).not.toContain('Author:')
    expect(result).not.toContain('Date:')
  })
})
