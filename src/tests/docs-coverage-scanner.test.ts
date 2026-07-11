/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanDocsCoverage } from '../core/harness/docs-coverage-scanner.js'

describe('scanDocsCoverage', () => {
  it('all docs present → docsScore 100', () => {
    const r = scanDocsCoverage({
      hasClaudeMd: true,
      hasReadme: true,
      rulesCount: 3,
      srcDirsCount: 3,
      hasDocsDir: true,
    })
    expect(r.docsScore).toBe(100)
  })

  it('no docs at all → docsScore 0', () => {
    const r = scanDocsCoverage({
      hasClaudeMd: false,
      hasReadme: false,
      rulesCount: 0,
      srcDirsCount: 3,
      hasDocsDir: false,
    })
    expect(r.docsScore).toBe(0)
  })

  it('only CLAUDE.md → docsScore 30', () => {
    const r = scanDocsCoverage({
      hasClaudeMd: true,
      hasReadme: false,
      rulesCount: 0,
      srcDirsCount: 3,
      hasDocsDir: false,
    })
    expect(r.docsScore).toBe(30)
  })

  it('partial rules coverage', () => {
    const r = scanDocsCoverage({
      hasClaudeMd: true,
      hasReadme: true,
      rulesCount: 1,
      srcDirsCount: 4,
      hasDocsDir: true,
    })
    expect(r.docsScore).toBe(78) // 30 + 20 + 8 (25% of 30) + 20
  })

  it('no src dirs → rules get full score (30)', () => {
    const r = scanDocsCoverage({
      hasClaudeMd: false,
      hasReadme: false,
      rulesCount: 0,
      srcDirsCount: 0,
      hasDocsDir: false,
    })
    expect(r.docsScore).toBe(30)
  })
})
