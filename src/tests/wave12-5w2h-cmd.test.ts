/*!
 * Tests for agf wave12-5w2h — wires the dormant Wave-12 5W2H generator
 * (src/core/analyzer/wave-12-5w2h-generator.ts) to a CLI surface.
 */

import { describe, it, expect } from 'vitest'
import { buildWave125W2HPayload } from '../cli/commands/wave12-5w2h-cmd.js'

describe('buildWave125W2HPayload', () => {
  it('returns the full analysis object in json format (default)', () => {
    const result = buildWave125W2HPayload('json')
    expect(result.format).toBe('json')
    expect(result.analysis?.initiative_id).toBe('wave-12-sandbox-build')
    expect(result.text).toBeUndefined()
  })

  it('returns formatted display text in text format', () => {
    const result = buildWave125W2HPayload('text')
    expect(result.format).toBe('text')
    expect(result.analysis).toBeUndefined()
    expect(result.text).toContain('WHY')
    expect(result.text).toContain('HOW MUCH')
    expect(result.text).toContain('Wave-12: Sandbox Build')
  })
})
