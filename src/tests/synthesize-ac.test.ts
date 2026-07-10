import { describe, it, expect } from 'vitest'
import { synthesizeAc } from '../core/importer/synthesize-ac.js'

/**
 * Tests for the deterministic Given-When-Then AC synthesizer.
 * Pure function — no LLM, no random, no clock.
 */

describe('synthesizeAc', () => {
  it('returns at least one GWT criterion for a non-empty title', () => {
    const acs = synthesizeAc('IMPLEMENT: parse the config file')
    expect(acs.length).toBeGreaterThanOrEqual(1)
    const first = acs[0]
    expect(first).toContain('Given')
    expect(first).toContain('When')
    expect(first).toContain('Then')
  })

  it('is deterministic — same title yields identical output', () => {
    const a = synthesizeAc('WIRE feedback into dispatch')
    const b = synthesizeAc('WIRE feedback into dispatch')
    expect(a).toEqual(b)
  })

  it('derives a WIRE X into Y criterion from a WIRE title', () => {
    const acs = synthesizeAc('WIRE feedbackCmd into the lazy registry')
    expect(acs.some((s) => s.includes('feedbackCmd') && s.includes('lazy registry'))).toBe(true)
  })

  it('returns [] for an empty or whitespace-only title (no throw)', () => {
    expect(synthesizeAc('')).toEqual([])
    expect(synthesizeAc('   ')).toEqual([])
    expect(() => synthesizeAc('\t\n')).not.toThrow()
  })

  it('strips a leading TYPE: prefix from the subject', () => {
    const acs = synthesizeAc('FIX: convertToGraph drops acceptanceCriteria')
    // The synthesized AC should talk about the subject, not the "FIX:" label.
    expect(acs[0]).not.toContain('FIX:')
  })
})
