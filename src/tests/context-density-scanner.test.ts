/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanContextDensity } from '../core/harness/context-density-scanner.js'
import type { FileContent } from '../core/harness/type-coverage-scanner.js'

const documented: FileContent = {
  path: 'src/core/foo.ts',
  content: '/** Does something */\nexport function doSomething(): void {}',
}
const undocumented: FileContent = {
  path: 'src/core/bar.ts',
  content: 'export function doSomething(): void {}',
}
const mixedFile: FileContent = {
  path: 'src/core/baz.ts',
  content: '/** Documented */\nexport function documented(): void {}\nexport function undocumented(): void {}',
}

describe('scanContextDensity', () => {
  it('all exported functions documented → contextDensityScore 100', () => {
    const r = scanContextDensity([documented])
    expect(r.contextDensityScore).toBe(100)
    expect(r.documentedExports).toBe(1)
  })

  it('no exported functions documented → contextDensityScore 0', () => {
    const r = scanContextDensity([undocumented])
    expect(r.contextDensityScore).toBe(0)
    expect(r.totalExports).toBe(1)
    expect(r.documentedExports).toBe(0)
  })

  it('mixed → correct intermediate score', () => {
    const r = scanContextDensity([mixedFile])
    expect(r.contextDensityScore).toBe(50)
    expect(r.totalExports).toBe(2)
    expect(r.documentedExports).toBe(1)
  })

  it('empty input → contextDensityScore 100', () => {
    const r = scanContextDensity([])
    expect(r.contextDensityScore).toBe(100)
    expect(r.totalExports).toBe(0)
  })

  it('no exported functions → contextDensityScore 100', () => {
    const f: FileContent = { path: 'a.ts', content: 'const x = 1;\nfunction helper() {}' }
    const r = scanContextDensity([f])
    expect(r.contextDensityScore).toBe(100)
    expect(r.totalExports).toBe(0)
  })

  it('test files are excluded', () => {
    const f: FileContent = { path: 'src/tests/foo.test.ts', content: 'export function testMe(): void {}' }
    const r = scanContextDensity([f])
    expect(r.contextDensityScore).toBe(100)
    expect(r.totalExports).toBe(0)
  })

  it('async exported functions are detected', () => {
    const f: FileContent = { path: 'a.ts', content: '/** Async */\nexport async function fetch(): Promise<void> {}' }
    const r = scanContextDensity([f])
    expect(r.contextDensityScore).toBe(100)
    expect(r.totalExports).toBe(1)
  })

  it('export const arrow functions are detected', () => {
    const f: FileContent = { path: 'a.ts', content: '/** Arrow */\nexport const handler = (): void => {}' }
    const r = scanContextDensity([f])
    expect(r.contextDensityScore).toBe(100)
    expect(r.totalExports).toBe(1)
  })

  it('collectViolations returns missing_jsdoc details', () => {
    const r = scanContextDensity([undocumented], { collectViolations: true })
    expect(r.violations).toBeDefined()
    expect(r.violations!.length).toBe(1)
    expect(r.violations![0].violationType).toBe('missing_jsdoc')
  })
})
