/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanNamingClarity, type NamingClarityResult } from '../core/harness/naming-clarity-scanner.js'
import type { FileContent } from '../core/harness/type-coverage-scanner.js'

const good: FileContent = { path: 'src/core/foo.ts', content: 'const userName = "alice";\nconst totalCount = 42;' }
const bad: FileContent = {
  path: 'src/core/bar.ts',
  content: 'const data = { x: 1 };\nconst val = "temp";\nconst a = 5;',
}
const mixed: FileContent = { path: 'src/core/baz.ts', content: 'const userName = "alice";\nconst data = {};' }

describe('scanNamingClarity', () => {
  it('all good names → namingScore 100', () => {
    const r = scanNamingClarity([good])
    expect(r.namingScore).toBe(100)
    expect(r.flaggedSymbols).toBe(0)
  })

  it('all bad names → namingScore 0', () => {
    const r = scanNamingClarity([bad])
    expect(r.namingScore).toBe(0)
    expect(r.flaggedSymbols).toBe(3)
  })

  it('mixed → correct intermediate score', () => {
    const r = scanNamingClarity([mixed])
    expect(r.namingScore).toBe(50)
    expect(r.totalSymbols).toBe(2)
    expect(r.flaggedSymbols).toBe(1)
  })

  it('empty input → namingScore 100', () => {
    const r = scanNamingClarity([])
    expect(r.namingScore).toBe(100)
    expect(r.totalSymbols).toBe(0)
  })

  it('test files are excluded', () => {
    const testFile: FileContent = { path: 'src/tests/foo.test.ts', content: 'const data = 1;' }
    const r = scanNamingClarity([testFile])
    expect(r.namingScore).toBe(100)
    expect(r.totalSymbols).toBe(0)
  })

  it('allowed single-chars (i, j, k, e) are not flagged', () => {
    const f: FileContent = { path: 'a.ts', content: 'for (let i = 0; i < 10; i++) {}\ncatch (e) {}' }
    const r = scanNamingClarity([f])
    expect(r.namingScore).toBe(100)
  })

  it('disallowed single-chars are flagged', () => {
    const f: FileContent = { path: 'a.ts', content: 'const a = 1;' }
    const r = scanNamingClarity([f])
    expect(r.namingScore).toBe(0)
  })

  it('collectViolations returns file-level details', () => {
    const r = scanNamingClarity([bad], { collectViolations: true })
    expect(r.violations).toBeDefined()
    expect(r.violations!.length).toBe(3)
    expect(r.violations![0].dimension).toBe('naming')
  })
})
