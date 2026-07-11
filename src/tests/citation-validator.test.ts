import { describe, it, expect } from 'vitest'
import { isCorePath, validateFilesCitations } from '../core/citations/citation-validator.js'

describe('isCorePath', () => {
  it('returns true for src/core/ paths', () => {
    expect(isCorePath('src/core/utils/id.ts')).toBe(true)
    expect(isCorePath('/workspace/project/src/core/graph/graph-types.ts')).toBe(true)
  })

  it('returns false for non-core paths', () => {
    expect(isCorePath('src/tests/foo.test.ts')).toBe(false)
    expect(isCorePath('src/schemas/foo.schema.ts')).toBe(false)
    expect(isCorePath('src/cli/commands/next.ts')).toBe(false)
  })
})

describe('validateFilesCitations', () => {
  it('returns no violations for files with §EPIC citations', () => {
    const files = [
      { path: 'src/core/graph/graph-store.ts', content: '/*\n * §EPIC-1 — Implementation.\n */\nexport {}' },
    ]
    const result = validateFilesCitations(files)
    expect(result.violations).toHaveLength(0)
    expect(result.checkedCount).toBe(1)
  })

  it('flags core files without any §EPIC or §ADR citation', () => {
    const files = [{ path: 'src/core/utils/missing-citation.ts', content: 'export const x = 1' }]
    const result = validateFilesCitations(files)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.path).toBe('src/core/utils/missing-citation.ts')
  })

  it('ignores non-core files', () => {
    const files = [
      { path: 'src/tests/foo.test.ts', content: 'no citation here' },
      { path: 'src/schemas/foo.schema.ts', content: 'no citation here' },
    ]
    const result = validateFilesCitations(files)
    expect(result.violations).toHaveLength(0)
    expect(result.checkedCount).toBe(0)
  })

  it('handles empty file list', () => {
    const result = validateFilesCitations([])
    expect(result.violations).toHaveLength(0)
    expect(result.checkedCount).toBe(0)
  })

  it('counts checked files correctly across mixed paths', () => {
    const files = [
      { path: 'src/core/a.ts', content: '§EPIC-1' },
      { path: 'src/core/b.ts', content: 'no citation' },
      { path: 'src/schemas/c.ts', content: 'not checked' },
    ]
    const result = validateFilesCitations(files)
    expect(result.checkedCount).toBe(2)
    expect(result.violations).toHaveLength(1)
  })
})
