/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  countNonTrivialLines,
  countExportLines,
  classifyDepth,
  analyzeDeepModule,
  DEEP_RATIO_MAX,
  SHALLOW_RATIO_MIN,
} from '../core/analyzer/deep-module.js'

describe('countNonTrivialLines', () => {
  it('counts code lines ignoring blanks and comments', () => {
    const code = `// this is a comment
const a = 1

/* block comment */
const b = 2
`
    expect(countNonTrivialLines(code)).toBe(2)
  })

  it('returns 0 for empty string', () => {
    expect(countNonTrivialLines('')).toBe(0)
  })

  it('returns 0 for only comments and blanks', () => {
    const code = `// comment

/* another */
*
`
    expect(countNonTrivialLines(code)).toBe(0)
  })

  it('counts mixed lines correctly', () => {
    const code = `export function foo() {
  // inline comment
  return 1
}
`
    expect(countNonTrivialLines(code)).toBe(3)
  })
})

describe('countExportLines', () => {
  it('counts export function declarations', () => {
    const code = `export function foo() {}
export const bar = 1
const internal = 2`
    expect(countExportLines(code)).toBe(2)
  })

  it('counts export default declarations', () => {
    const code = `export default function() {}
export default class A {}`
    expect(countExportLines(code)).toBe(2)
  })

  it('counts export braces and re-exports', () => {
    const code = `export { foo }
export * from './bar.js'`
    expect(countExportLines(code)).toBe(2)
  })

  it('returns 0 when no exports', () => {
    const code = `const a = 1
function b() {}`
    expect(countExportLines(code)).toBe(0)
  })
})

describe('classifyDepth', () => {
  it('returns deep for ratio below threshold', () => {
    expect(classifyDepth(DEEP_RATIO_MAX - 0.01)).toBe('deep')
  })

  it('returns shallow for ratio above threshold', () => {
    expect(classifyDepth(SHALLOW_RATIO_MIN + 0.01)).toBe('shallow')
  })

  it('returns medium for ratio between thresholds', () => {
    expect(classifyDepth(0.3)).toBe('medium')
  })

  it('handles boundary at deep threshold', () => {
    expect(classifyDepth(DEEP_RATIO_MAX)).toBe('medium')
  })
})

describe('analyzeDeepModule', () => {
  it('produces correct FileMetrics for a deep module', () => {
    const content = `export function api() {
  // lots of hidden logic
  const x = 1
  const y = 2
  const z = 3
  return x + y + z
}`
    const result = analyzeDeepModule('test.ts', content)
    expect(result.file).toBe('test.ts')
    expect(result.totalLoc).toBe(6)
    expect(result.exportLoc).toBe(1)
    expect(result.ratio).toBe(1 / 6)
    expect(result.depth).toBe('deep')
  })

  it('handles empty content gracefully', () => {
    const result = analyzeDeepModule('empty.ts', '')
    expect(result.totalLoc).toBe(0)
    expect(result.exportLoc).toBe(0)
    expect(result.ratio).toBe(1)
    expect(result.depth).toBe('shallow')
    expect(result.suggestion).toBe('module too small to evaluate (LOC < 10)')
  })
})
