/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_PINNED_TYPES } from '../core/context/topological-decay.js'

describe('topological-decay', () => {
  it('DEFAULT_PINNED_TYPES includes structural node types', () => {
    expect(DEFAULT_PINNED_TYPES).toContain('constraint')
    expect(DEFAULT_PINNED_TYPES).toContain('risk')
    expect(DEFAULT_PINNED_TYPES).toContain('decision')
    expect(DEFAULT_PINNED_TYPES).toContain('acceptance_criteria')
    expect(DEFAULT_PINNED_TYPES).toContain('constitution')
    expect(DEFAULT_PINNED_TYPES).toContain('requirement')
  })

  it('DEFAULT_PINNED_TYPES has 6 entries', () => {
    expect(DEFAULT_PINNED_TYPES).toHaveLength(6)
  })
})
