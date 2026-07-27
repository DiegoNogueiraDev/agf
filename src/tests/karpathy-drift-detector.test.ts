/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { detectKarpathyDrift } from '../core/hooks/karpathy-drift-detector.js'

describe('karpathy-drift-detector', () => {
  it('returns empty drift for identical content', () => {
    const content = '## Section A\nsome body\n## Section B\nother body'
    const r = detectKarpathyDrift(content, content)
    expect(r.addedInVendor).toEqual([])
    expect(r.removedFromRules).toEqual([])
    expect(r.modified).toEqual([])
  })

  it('detects sections added in vendor', () => {
    const vendor = '## Section A\nbody\n## Section B\nbody'
    const rules = '## Section A\nbody'
    const r = detectKarpathyDrift(vendor, rules)
    expect(r.addedInVendor).toContain('Section B')
  })

  it('detects sections removed from rules', () => {
    const vendor = '## Section A\nbody'
    const rules = '## Section A\nbody\n## Section B\nbody'
    const r = detectKarpathyDrift(vendor, rules)
    expect(r.removedFromRules).toContain('Section B')
  })

  it('detects modified body', () => {
    const vendor = '## Section A\noriginal body'
    const rules = '## Section A\nmodified body'
    const r = detectKarpathyDrift(vendor, rules)
    expect(r.modified).toHaveLength(1)
    expect(r.modified[0]).toContain('Section A')
  })

  it('strips §tag annotations for matching', () => {
    const vendor = '## §karpathy-1 Section A\nbody'
    const rules = '## Section A\nbody'
    const r = detectKarpathyDrift(vendor, rules)
    expect(r.addedInVendor).toEqual([])
    expect(r.modified).toEqual([])
  })

  it('handles empty content', () => {
    const r = detectKarpathyDrift('', '')
    expect(r.addedInVendor).toEqual([])
    expect(r.removedFromRules).toEqual([])
    expect(r.modified).toEqual([])
  })

  it('normalizes whitespace in body comparison', () => {
    const vendor = '## Section A\n  spaced\n  body'
    const rules = '## Section A\nspaced body'
    const r = detectKarpathyDrift(vendor, rules)
    expect(r.modified).toEqual([])
  })
})
