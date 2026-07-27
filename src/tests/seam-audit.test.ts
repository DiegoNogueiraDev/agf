/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { extractImportSpecifiers, classifySpecifier, auditFile } from '../core/analyzer/seam-audit.js'

describe('extractImportSpecifiers', () => {
  it('extracts module specifiers from import statements', () => {
    const code = `import { foo } from './foo.js'
import bar from 'lodash'
import * as all from 'node:fs'`
    const specs = extractImportSpecifiers(code)
    expect(specs).toEqual(['./foo.js', 'lodash', 'node:fs'])
  })

  it('extracts specifiers from re-export statements', () => {
    const code = `export { baz } from './baz.js'
export * from 'zod/v4'`
    const specs = extractImportSpecifiers(code)
    expect(specs).toEqual(['./baz.js', 'zod/v4'])
  })

  it('returns empty array when no imports', () => {
    expect(extractImportSpecifiers('const a = 1')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractImportSpecifiers('')).toEqual([])
  })

  it('handles single-quote and double-quote specifiers', () => {
    const code = `import a from "./a.js"\nimport b from './b.js'`
    expect(extractImportSpecifiers(code)).toEqual(['./a.js', './b.js'])
  })
})

describe('classifySpecifier', () => {
  it('classifies relative import as in-process', () => {
    const result = classifySpecifier('./foo')
    expect(result.category).toBe('in-process')
    expect(result.suggestion).toContain('in-process')
  })

  it('classifies absolute import as in-process', () => {
    const result = classifySpecifier('/src/bar')
    expect(result.category).toBe('in-process')
  })

  it('classifies node built-in as local-substitutable', () => {
    const result = classifySpecifier('node:fs')
    expect(result.category).toBe('local-substitutable')
  })

  it('classifies better-sqlite3 as local-substitutable', () => {
    const result = classifySpecifier('better-sqlite3')
    expect(result.category).toBe('local-substitutable')
  })

  it('classifies @anthropic-ai/ as true-external', () => {
    const result = classifySpecifier('@anthropic-ai/sdk')
    expect(result.category).toBe('true-external')
  })

  it('classifies openai as true-external', () => {
    const result = classifySpecifier('openai')
    expect(result.category).toBe('true-external')
  })

  it('classifies @modelcontextprotocol/ as remote-owned', () => {
    const result = classifySpecifier('@modelcontextprotocol/server')
    expect(result.category).toBe('remote-owned')
  })

  it('classifies axios as remote-owned', () => {
    const result = classifySpecifier('axios')
    expect(result.category).toBe('remote-owned')
  })

  it('classifies unknown third-party as remote-owned (heuristic)', () => {
    const result = classifySpecifier('some-random-lib')
    expect(result.category).toBe('remote-owned')
    expect(result.suggestion).toContain('heuristic')
  })
})

describe('auditFile', () => {
  it('produces a SeamReport with correct summary', () => {
    const code = `import { x } from './local.js'
import fs from 'node:fs'
import OpenAI from 'openai'
import axios from 'axios'`
    const report = auditFile('test.ts', code)
    expect(report.file).toBe('test.ts')
    expect(report.imports).toHaveLength(4)
    expect(report.summary['in-process']).toBe(1)
    expect(report.summary['local-substitutable']).toBe(1)
    expect(report.summary['true-external']).toBe(1)
    expect(report.summary['remote-owned']).toBe(1)
  })

  it('handles file with no imports', () => {
    const report = auditFile('empty.ts', 'const x = 1')
    expect(report.imports).toHaveLength(0)
    expect(Object.values(report.summary).every((v) => v === 0)).toBe(true)
  })
})
