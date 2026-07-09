/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanTypeCoverage, type FileContent } from '../core/harness/type-coverage-scanner.js'

const clean: FileContent = {
  path: 'src/core/foo.ts',
  content: 'export function add(a: number, b: number): number {\n  return a + b\n}',
}
const withAny: FileContent = {
  path: 'src/core/bar.ts',
  content: 'export function process(input: any): any {\n  return input\n}',
}
const withAsAny: FileContent = { path: 'src/core/baz.ts', content: 'const x = result as any\nconst y = payload as any' }
const withAnyOnlyInLineComment: FileContent = {
  path: 'src/core/qux.ts',
  content:
    '// Best-effort: any failure is logged and swallowed here\nexport function add(a: number, b: number): number {\n  return a + b\n}',
}
const withAnyOnlyInBlockComment: FileContent = {
  path: 'src/core/quux.ts',
  content:
    '/*\n * mcp-graph is distributed WITHOUT ANY WARRANTY: any implied warranty is disclaimed\n */\nexport function add(a: number, b: number): number {\n  return a + b\n}',
}
const withAnyOnlyInString: FileContent = {
  path: 'src/core/corge.ts',
  content: "export function log(): string {\n  return 'accepts: any value here'\n}",
}
const withRealAnyAndCommentAny: FileContent = {
  path: 'src/core/grault.ts',
  content: '// note: any usage here is intentional\nexport function process(input: any): number {\n  return 0\n}',
}

describe('scanTypeCoverage', () => {
  it('all files clean → typeScore 100', () => {
    const r = scanTypeCoverage([clean])
    expect(r.typeScore).toBe(100)
    expect(r.filesWithAny).toBe(0)
    expect(r.anyCount).toBe(0)
  })

  it('all files with any → typeScore 0', () => {
    const r = scanTypeCoverage([withAny])
    expect(r.typeScore).toBe(0)
    expect(r.filesWithAny).toBe(1)
    expect(r.anyCount).toBe(2)
  })

  it('mixed → correct intermediate score', () => {
    const r = scanTypeCoverage([clean, withAny, withAsAny])
    expect(r.typeScore).toBe(33)
    expect(r.filesWithAny).toBe(2)
    expect(r.anyCount).toBe(4)
  })

  it('empty input → typeScore 100', () => {
    const r = scanTypeCoverage([])
    expect(r.typeScore).toBe(100)
    expect(r.totalFiles).toBe(0)
  })

  it('collectViolations returns file-level details', () => {
    const r = scanTypeCoverage([withAny, withAsAny], { collectViolations: true })
    expect(r.violations).toBeDefined()
    expect(r.violations!.length).toBe(4)
    expect(r.violations![0].dimension).toBe('types')
  })

  it('collectViolations false omits violations', () => {
    const r = scanTypeCoverage([withAny])
    expect(r.violations).toBeUndefined()
  })

  it('"any" inside a // line comment is not counted', () => {
    const r = scanTypeCoverage([withAnyOnlyInLineComment])
    expect(r.anyCount).toBe(0)
    expect(r.filesWithAny).toBe(0)
    expect(r.typeScore).toBe(100)
  })

  it('"any" inside a /* block */ comment is not counted', () => {
    const r = scanTypeCoverage([withAnyOnlyInBlockComment])
    expect(r.anyCount).toBe(0)
    expect(r.filesWithAny).toBe(0)
  })

  it('"any" inside a string literal is not counted', () => {
    const r = scanTypeCoverage([withAnyOnlyInString])
    expect(r.anyCount).toBe(0)
    expect(r.filesWithAny).toBe(0)
  })

  it('real `: any` annotation is still detected alongside a comment mentioning any', () => {
    const r = scanTypeCoverage([withRealAnyAndCommentAny], { collectViolations: true })
    expect(r.anyCount).toBe(1)
    expect(r.filesWithAny).toBe(1)
    expect(r.violations).toHaveLength(1)
    expect(r.violations![0].evidence).toBe(': any')
  })
})
