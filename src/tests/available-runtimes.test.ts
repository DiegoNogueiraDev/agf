/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { detectAvailableRuntimes } from '../core/planner/available-runtimes.js'

describe('detectAvailableRuntimes', () => {
  it('always reports node as available without probing', () => {
    const probe = (): boolean => {
      throw new Error('should not probe node')
    }
    expect(detectAvailableRuntimes(['node'], probe)).toEqual(['node'])
  })

  it('never reports corpus — it is a data dep, not a probeable binary', () => {
    const probe = (): boolean => true
    expect(detectAvailableRuntimes(['corpus'], probe)).toEqual([])
  })

  it('includes a runtime only when the probe confirms it', () => {
    const present = new Set(['go'])
    const probe = (rt: string): boolean => present.has(rt)
    expect(detectAvailableRuntimes(['go', 'java'], probe)).toEqual(['go'])
  })

  it('de-duplicates and lower-cases candidates', () => {
    const probe = (): boolean => true
    expect(detectAvailableRuntimes(['Go', 'go', 'GO'], probe)).toEqual(['go'])
  })
})
