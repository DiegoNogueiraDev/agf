/*!
 * Tests for agf reference — wires the dormant reference-content barrel
 * (src/core/config/reference-content.ts and siblings) to a CLI surface.
 */

import { describe, it, expect } from 'vitest'
import { buildReferencePayload } from '../cli/commands/reference-cmd.js'

describe('buildReferencePayload', () => {
  it('returns the full uncompressed reference by default', () => {
    const result = buildReferencePayload()
    expect(result.phase).toBeUndefined()
    expect(result.compressed).toBe(false)
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.estimatedTokens).toBeGreaterThan(0)
  })

  it('applies L5 compression when compressed=true, shrinking the text', () => {
    const full = buildReferencePayload()
    const compressed = buildReferencePayload({ compressed: true })
    expect(compressed.compressed).toBe(true)
    expect(compressed.text.length).toBeLessThan(full.text.length)
    expect(compressed.estimatedTokens).toBeLessThan(full.estimatedTokens)
  })

  it('filters to a single phase when --phase is given', () => {
    const result = buildReferencePayload({ phase: 'IMPLEMENT' })
    expect(result.phase).toBe('IMPLEMENT')
    expect(result.text).toContain('IMPLEMENT')
  })
})
