/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/search/match-snippet.ts
 */

import { describe, it, expect } from 'vitest'
import { buildMatchSnippet } from '../core/search/match-snippet.js'

describe('buildMatchSnippet', () => {
  it('returns a context window around the first match, case-insensitively', () => {
    const text = 'Dormant capability detected (no-surface): src/core/algorithms/string/suffix-array.ts.'
    const snippet = buildMatchSnippet(text, 'NO-SURFACE', 10)
    expect(snippet).toBeDefined()
    expect(snippet!.toLowerCase()).toContain('no-surface')
  })

  it('prefixes/suffixes with an ellipsis when the window is clipped', () => {
    const text = 'a'.repeat(100) + 'NEEDLE' + 'b'.repeat(100)
    const snippet = buildMatchSnippet(text, 'needle', 5)
    expect(snippet).toBeDefined()
    expect(snippet!.startsWith('…')).toBe(true)
    expect(snippet!.endsWith('…')).toBe(true)
  })

  it('returns undefined when the query does not occur in the text', () => {
    expect(buildMatchSnippet('hello world', 'xyz')).toBeUndefined()
  })

  it('returns undefined for empty text or query', () => {
    expect(buildMatchSnippet('', 'x')).toBeUndefined()
    expect(buildMatchSnippet('hello', '')).toBeUndefined()
  })
})
