/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for src/core/citations/ — citation extractor and validator.
 */
import { describe, it, expect } from 'vitest'
import { extractCitations, hasCitation } from '../core/citations/citation-extractor.js'
import { isCorePath, validateFilesCitations } from '../core/citations/citation-validator.js'
import type { CitationFile } from '../core/citations/citation-validator.js'

describe('citation-extractor', () => {
  describe('extractCitations', () => {
    it('extracts single citation', () => {
      const citations = extractCitations('Implementa §EPIC-7.3 feature')
      expect(citations).toEqual(['§EPIC-7.3'])
    })

    it('extracts multiple citations', () => {
      const citations = extractCitations('Fix §EPIC-13.1 §ADR-0049 issue')
      expect(citations).toEqual(['§EPIC-13.1', '§ADR-0049'])
    })

    it('returns empty for text without citations', () => {
      const citations = extractCitations('Just regular code')
      expect(citations).toEqual([])
    })

    it('extracts hyphen-separated citations', () => {
      const citations = extractCitations('§task-select-projection done')
      expect(citations).toEqual(['§task-select-projection'])
    })

    it('handles multi-segment identifiers', () => {
      const citations = extractCitations('§EPIC-E1 provider-router-expansion')
      expect(citations).toEqual(['§EPIC-E1'])
    })
  })

  describe('hasCitation', () => {
    it('returns true when citation present', () => {
      expect(hasCitation('code with §EPIC-7.3')).toBe(true)
    })

    it('returns false when no citation present', () => {
      expect(hasCitation('just plain text')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(hasCitation('')).toBe(false)
    })
  })
})

describe('citation-validator', () => {
  describe('isCorePath', () => {
    it('matches src/core/ paths', () => {
      expect(isCorePath('src/core/llm/gateway.ts')).toBe(true)
    })

    it('does not match src/cli/ paths', () => {
      expect(isCorePath('src/cli/commands/start.ts')).toBe(false)
    })

    it('does not match src/tests/ paths', () => {
      expect(isCorePath('src/tests/sandbox.test.ts')).toBe(false)
    })
  })

  describe('validateFilesCitations', () => {
    it('passes core files with citations', () => {
      const files: CitationFile[] = [
        { path: 'src/core/llm/gateway.ts', content: '§EPIC-7.3' },
        { path: 'src/cli/index.ts', content: 'no citation needed' },
      ]
      const result = validateFilesCitations(files)
      expect(result.violations).toEqual([])
      expect(result.checkedCount).toBe(1)
    })

    it('reports core files without citations', () => {
      const files: CitationFile[] = [{ path: 'src/core/foo.ts', content: 'just code' }]
      const result = validateFilesCitations(files)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].path).toBe('src/core/foo.ts')
      expect(result.violations[0].reason).toContain('citation')
    })

    it('ignores non-core paths', () => {
      const files: CitationFile[] = [
        { path: 'src/tests/foo.test.ts', content: 'test' },
        { path: 'src/cli/commands/foo.ts', content: 'cli' },
      ]
      const result = validateFilesCitations(files)
      expect(result.violations).toEqual([])
      expect(result.checkedCount).toBe(0)
    })

    it('returns empty violations for empty input', () => {
      const result = validateFilesCitations([])
      expect(result.violations).toEqual([])
      expect(result.checkedCount).toBe(0)
    })
  })
})
