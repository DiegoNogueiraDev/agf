/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { checkCitationCoverage, isCitationGuardDisabled } from '../core/hooks/citation-coverage-guard.js'

describe('citation-coverage-guard', () => {
  describe('isCitationGuardDisabled', () => {
    it('returns false by default', () => {
      expect(isCitationGuardDisabled({})).toBe(false)
    })

    it('returns true when set to off', () => {
      expect(isCitationGuardDisabled({ MCP_GRAPH_CITATION_GUARD: 'off' })).toBe(true)
    })
  })

  describe('checkCitationCoverage', () => {
    it('skips non-core files', () => {
      const r = checkCitationCoverage([
        { file: 'src/tests/foo.test.ts', content: 'no citation' },
        { file: 'src/cli/bar.ts', content: 'no citation' },
      ])
      expect(r.scanned).toBe(0)
      expect(r.skipped).toBe(2)
      expect(r.missing).toEqual([])
    })

    it('reports core files without citations', () => {
      const r = checkCitationCoverage([{ file: 'src/core/foo.ts', content: 'no citation here' }])
      expect(r.scanned).toBe(1)
      expect(r.missing).toEqual(['src/core/foo.ts'])
    })

    it('does not report core files with citations', () => {
      const r = checkCitationCoverage([{ file: 'src/core/foo.ts', content: '§EPIC-123 — some code' }])
      expect(r.scanned).toBe(1)
      expect(r.missing).toEqual([])
    })

    it('handles mixed files', () => {
      const r = checkCitationCoverage([
        { file: 'src/core/with-citation.ts', content: '§EPIC-1 code' },
        { file: 'src/core/without-citation.ts', content: 'plain code' },
        { file: 'docs/readme.md', content: 'no need citation' },
      ])
      expect(r.scanned).toBe(2)
      expect(r.skipped).toBe(1)
      expect(r.missing).toEqual(['src/core/without-citation.ts'])
    })

    it('skips non-ts core files', () => {
      const r = checkCitationCoverage([{ file: 'src/core/assets/sample.json', content: '{}' }])
      expect(r.skipped).toBe(1)
      expect(r.scanned).toBe(0)
    })
  })
})
