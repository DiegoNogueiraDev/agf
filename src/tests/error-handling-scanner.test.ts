/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanErrorHandling } from '../core/harness/error-handling-scanner.js'
import type { FileContent } from '../core/harness/type-coverage-scanner.js'

const clean: FileContent = {
  path: 'src/core/foo.ts',
  content: 'export function add(a: number, b: number): number {\n  return a + b\n}',
}
const rawThrow: FileContent = {
  path: 'src/core/bar.ts',
  content: 'function parse(input: string): number {\n  throw new Error("invalid")\n}',
}
const emptyCatch: FileContent = { path: 'src/core/baz.ts', content: 'try {\n  risky()\n} catch (e) {}\n' }
const consoleErrorUse: FileContent = { path: 'src/core/qux.ts', content: 'console.error("failed")' }

describe('scanErrorHandling', () => {
  it('no bad patterns → errorHandlingScore 100', () => {
    const r = scanErrorHandling([clean])
    expect(r.errorHandlingScore).toBe(100)
    expect(r.totalErrorSites).toBe(0)
  })

  it('raw throw → penalty applied', () => {
    const r = scanErrorHandling([rawThrow])
    expect(r.errorHandlingScore).toBe(80) // 100 - 1*20
    expect(r.rawThrows).toBe(1)
  })

  it('typed errors import exempts raw throws', () => {
    const typed: FileContent = {
      path: 'src/core/bar.ts',
      content: 'import { AppError } from "./utils/errors.js"\nthrow new Error("wrapped")',
    }
    const r = scanErrorHandling([typed])
    expect(r.errorHandlingScore).toBe(100)
  })

  it('empty catch → penalty applied', () => {
    const r = scanErrorHandling([emptyCatch])
    expect(r.errorHandlingScore).toBe(80)
    expect(r.swallowedCatches).toBe(1)
  })

  it('console.error → penalty applied', () => {
    const r = scanErrorHandling([consoleErrorUse])
    expect(r.errorHandlingScore).toBe(80)
    expect(r.consoleErrors).toBe(1)
  })

  it('multiple bad patterns stack penalties', () => {
    const r = scanErrorHandling([rawThrow, emptyCatch, consoleErrorUse])
    expect(r.errorHandlingScore).toBe(40) // 100 - 3*20
    expect(r.totalErrorSites).toBe(3)
  })

  it('empty input → errorHandlingScore 100', () => {
    const r = scanErrorHandling([])
    expect(r.errorHandlingScore).toBe(100)
    expect(r.totalErrorSites).toBe(0)
  })

  it('test file console.error is exempt', () => {
    const f: FileContent = { path: 'src/tests/foo.test.ts', content: 'console.error("test")' }
    const r = scanErrorHandling([f])
    expect(r.errorHandlingScore).toBe(100)
  })

  it('score floors at 0 for many violations', () => {
    const many: FileContent = {
      path: 'a.ts',
      content:
        'throw new Error("a")\nthrow new Error("b")\nthrow new Error("c")\nthrow new Error("d")\nthrow new Error("e")\nthrow new Error("f")',
    }
    const r = scanErrorHandling([many])
    expect(r.errorHandlingScore).toBe(0)
  })

  it('collectViolations returns file-level details', () => {
    const r = scanErrorHandling([rawThrow], { collectViolations: true })
    expect(r.violations).toBeDefined()
    expect(r.violations!.length).toBe(1) // only 1 raw_throw match
    expect(r.violations![0].dimension).toBe('errors')
  })
})
