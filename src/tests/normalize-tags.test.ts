/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { normalizeTags } from '../core/graph/normalize-tags.js'

describe('normalizeTags', () => {
  it('returns empty array for undefined or empty input', () => {
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags([])).toEqual([])
  })

  it('trims, drops blanks, and de-duplicates', () => {
    expect(normalizeTags(['aco', ' aco ', '', '  ', 'colony'])).toEqual(['aco', 'colony'])
  })

  it('splits comma-separated values from a single flag', () => {
    expect(normalizeTags(['aco,colony, immune'])).toEqual(['aco', 'colony', 'immune'])
  })

  it('preserves first-seen order across mixed variadic + comma forms', () => {
    expect(normalizeTags(['aco', 'colony,aco', 'immune'])).toEqual(['aco', 'colony', 'immune'])
  })
})
