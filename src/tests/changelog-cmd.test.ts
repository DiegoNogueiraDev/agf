/*!
 * Tests for agf changelog generate — builds a Keep-a-Changelog section from
 * raw git commit subjects using the existing pure changelog.ts helpers.
 */

import { describe, it, expect } from 'vitest'
import { buildChangelogPayload } from '../cli/commands/changelog-cmd.js'

describe('buildChangelogPayload', () => {
  it('groups conventional commit subjects into a Keep-a-Changelog section', () => {
    const subjects = ['feat(core): add widget', 'fix: crash on empty input', 'chore: bump deps']
    const result = buildChangelogPayload(subjects, '1.2.0')
    expect(result.markdown).toContain('## [1.2.0]')
    expect(result.markdown).toContain('### Features')
    expect(result.markdown).toContain('- **core:** add widget')
    expect(result.markdown).toContain('### Bug Fixes')
    expect(result.markdown).toContain('- crash on empty input')
    expect(result.entries).toBe(3)
    expect(result.skipped).toBe(0)
  })

  it('counts non-conventional subjects as skipped, not fatal', () => {
    const subjects = ['feat: real feature', 'Merge branch main into feature', 'wip']
    const result = buildChangelogPayload(subjects, '1.0.0')
    expect(result.entries).toBe(1)
    expect(result.skipped).toBe(2)
    expect(result.markdown).toContain('### Features')
  })

  it('returns an empty section (no throw) when there are no commits', () => {
    const result = buildChangelogPayload([], '0.1.0')
    expect(result.entries).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.markdown).toContain('## [0.1.0]')
  })
})
