/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { evaluateProjectQuality } from '../core/harness/project-quality.js'
import type { SourceFile } from '../core/harness/logging-coverage-scanner.js'

describe('evaluateProjectQuality', () => {
  it('perfect scores → gate passes', () => {
    const files: SourceFile[] = [
      { path: 'src/core/foo.ts', content: 'export const x = 1;\nconst log = createLogger("foo");' },
      { path: 'src/tests/foo.test.ts', content: 'expect(x).toBe(1)' },
    ]
    const r = evaluateProjectQuality(files)
    expect(r.testScore).toBe(100)
    expect(r.logScore).toBe(100)
    expect(r.gate.passed).toBe(true)
    expect(r.gate.failures).toHaveLength(0)
  })

  it('no tests → gate fails', () => {
    const files: SourceFile[] = [{ path: 'src/core/foo.ts', content: 'const log = createLogger("foo");' }]
    const r = evaluateProjectQuality(files)
    expect(r.testScore).toBe(0)
    expect(r.gate.passed).toBe(false)
    expect(r.gate.failures.some((f) => f.dimension === 'tests')).toBe(true)
  })

  it('no logging → gate fails', () => {
    const files: SourceFile[] = [
      { path: 'src/core/foo.ts', content: 'export const x = 1;' },
      { path: 'src/tests/foo.test.ts', content: 'expect(x).toBe(1)' },
    ]
    const r = evaluateProjectQuality(files)
    expect(r.logScore).toBe(0)
    expect(r.gate.passed).toBe(false)
    expect(r.gate.failures.some((f) => f.dimension === 'logs')).toBe(true)
  })

  it('tracks dark modules (no logging)', () => {
    const files: SourceFile[] = [
      { path: 'src/core/foo.ts', content: 'const log = createLogger("foo");' },
      { path: 'src/core/bar.ts', content: 'export const y = 2;' },
    ]
    const r = evaluateProjectQuality(files)
    expect(r.darkModules).toEqual(['src/core/bar.ts'])
  })

  it('empty files list → gate passes with defaults', () => {
    const r = evaluateProjectQuality([])
    expect(r.testScore).toBe(100)
    expect(r.logScore).toBe(100)
    expect(r.gate.passed).toBe(true)
    expect(r.totalModules).toBe(0)
  })

  it('handles mixed module names with extensions', () => {
    const files: SourceFile[] = [
      { path: 'src/core/my-module.tsx', content: 'const log = createLogger("m");' },
      { path: 'src/tests/my-module.test.tsx', content: 'expect(1).toBe(1)' },
    ]
    const r = evaluateProjectQuality(files)
    expect(r.testScore).toBe(100)
    expect(r.logScore).toBe(100)
  })
})
