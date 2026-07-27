/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_1adf757784bf — C86-T1: tests for diffLineColor (diff-view)
 */

import { describe, it, expect } from 'vitest'
import { diffLineColor } from '../tui/diff-view.js'

describe('diffLineColor', () => {
  it('returns "green" for lines starting with "+ "', () => {
    expect(diffLineColor('+ added line')).toBe('green')
  })

  it('returns "red" for lines starting with "- "', () => {
    expect(diffLineColor('- removed line')).toBe('red')
  })

  it('returns undefined for context lines (no prefix)', () => {
    expect(diffLineColor('  context line')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(diffLineColor('')).toBeUndefined()
  })

  it('returns undefined for lines starting with "@ "', () => {
    expect(diffLineColor('@@ -1,3 +1,4 @@')).toBeUndefined()
  })

  it('requires space after + or - for color ("+added" with no space is not green)', () => {
    expect(diffLineColor('+added')).toBeUndefined()
  })

  it('requires space after - for red ("-removed" no space)', () => {
    expect(diffLineColor('-removed')).toBeUndefined()
  })

  it('multiple green lines all return "green"', () => {
    const lines = ['+ foo', '+ bar', '+ baz']
    for (const line of lines) {
      expect(diffLineColor(line)).toBe('green')
    }
  })
})
