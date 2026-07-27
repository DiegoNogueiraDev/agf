import { describe, it, expect } from 'vitest'
import { parseConventionalCommit, groupByType, formatKeepAChangelog } from '../core/utils/changelog.js'

describe('parseConventionalCommit', () => {
  it('parses feat: message', () => {
    const result = parseConventionalCommit('feat(core): add new feature')
    expect(result?.type).toBe('feat')
    expect(result?.scope).toBe('core')
    expect(result?.description).toBe('add new feature')
  })

  it('parses fix without scope', () => {
    const result = parseConventionalCommit('fix: resolve crash')
    expect(result?.type).toBe('fix')
    expect(result?.scope).toBeUndefined()
    expect(result?.description).toBe('resolve crash')
  })

  it('returns null for non-conventional commit', () => {
    expect(parseConventionalCommit('random commit message')).toBeNull()
  })
})

describe('groupByType', () => {
  it('groups commits by type', () => {
    const entries = [
      { type: 'feat', description: 'feature a' },
      { type: 'feat', description: 'feature b' },
      { type: 'fix', description: 'bugfix a' },
      { type: 'chore', description: 'chore a' },
    ]
    const grouped = groupByType(entries)
    expect(grouped.Features).toHaveLength(2)
    expect(grouped['Bug Fixes']).toHaveLength(1)
    expect(grouped.Chores).toHaveLength(1)
  })
})

describe('formatKeepAChangelog', () => {
  it('formats grouped entries as markdown', () => {
    const md = formatKeepAChangelog('1.0.0', {
      Features: [{ type: 'feat', description: 'new UI' }],
      'Bug Fixes': [{ type: 'fix', description: 'fix crash' }],
    })
    expect(md).toContain('## [1.0.0]')
    expect(md).toContain('### Features')
    expect(md).toContain('- new UI')
    expect(md).toContain('### Bug Fixes')
    expect(md).toContain('- fix crash')
  })
})
