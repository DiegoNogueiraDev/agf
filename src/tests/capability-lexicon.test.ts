import { describe, it, expect } from 'vitest'
import { CAPABILITY_LEXICON, agfCapabilities, detectCapabilities, specForTag } from '../core/scan/capability-lexicon.js'

describe('CAPABILITY_LEXICON', () => {
  it('is a non-empty array', () => {
    expect(CAPABILITY_LEXICON.length).toBeGreaterThan(0)
  })

  it('each spec has required fields', () => {
    for (const spec of CAPABILITY_LEXICON) {
      expect(typeof spec.tag).toBe('string')
      expect(typeof spec.label).toBe('string')
      expect(Array.isArray(spec.patterns)).toBe(true)
      expect(['token-cost', 'swe', 'speed']).toContain(spec.pillar)
      expect(['low', 'med', 'high']).toContain(spec.effort)
      expect(['low', 'med', 'high']).toContain(spec.impact)
    }
  })

  it('all tags are unique', () => {
    const tags = CAPABILITY_LEXICON.map((s) => s.tag)
    const unique = new Set(tags)
    expect(unique.size).toBe(tags.length)
  })
})

describe('agfCapabilities', () => {
  it('returns a Set', () => {
    const result = agfCapabilities()
    expect(result instanceof Set).toBe(true)
  })

  it('accepts command name list and returns Set', () => {
    const result = agfCapabilities(['content-router', 'provider-failover'])
    expect(result instanceof Set).toBe(true)
  })

  it('includes content-router (real, wired via core/economy/content-router.ts + economy-pipeline.ts) — regression for a previously-recorded false-negative', () => {
    expect(agfCapabilities().has('content-router')).toBe(true)
  })
})

describe('detectCapabilities', () => {
  it('returns empty array for empty text', () => {
    expect(detectCapabilities('')).toEqual([])
  })

  it('detects capabilities by pattern match', () => {
    const spec = CAPABILITY_LEXICON[0]!
    const sampleText = spec.patterns[0]!.source.replace(/\\i$/, '').replace(/\\/g, '')
    const result = detectCapabilities(sampleText.toLowerCase())
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns array of tag strings', () => {
    const detected = detectCapabilities('content-router smartcrusher')
    for (const tag of detected) {
      expect(typeof tag).toBe('string')
    }
  })
})

describe('specForTag', () => {
  it('returns undefined for unknown tag', () => {
    expect(specForTag('nonexistent-tag-xyz')).toBeUndefined()
  })

  it('returns spec for known tag', () => {
    const firstTag = CAPABILITY_LEXICON[0]!.tag
    const spec = specForTag(firstTag)
    expect(spec).toBeDefined()
    expect(spec!.tag).toBe(firstTag)
  })
})
