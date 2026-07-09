import { describe, it, expect } from 'vitest'
import { RECURRING_ARTIFACT_DESCRIPTORS, loadRecurringArtifactCorpus } from '../core/rag-out/recurring-artifacts.js'

describe('RECURRING_ARTIFACT_DESCRIPTORS', () => {
  it('is a non-empty readonly array', () => {
    expect(RECURRING_ARTIFACT_DESCRIPTORS.length).toBeGreaterThan(0)
  })

  it('each descriptor has id, goal, fitTags, slots, noveltyFloor', () => {
    for (const d of RECURRING_ARTIFACT_DESCRIPTORS) {
      expect(typeof d.id).toBe('string')
      expect(typeof d.goal).toBe('string')
      expect(Array.isArray(d.fitTags)).toBe(true)
      expect(Array.isArray(d.slots)).toBe(true)
      expect(typeof d.noveltyFloor).toBe('number')
    }
  })

  it('includes prd-software entry', () => {
    const ids = RECURRING_ARTIFACT_DESCRIPTORS.map((d) => d.id)
    expect(ids).toContain('prd-software')
  })
})

describe('loadRecurringArtifactCorpus', () => {
  it('returns the same items as RECURRING_ARTIFACT_DESCRIPTORS', () => {
    const loaded = loadRecurringArtifactCorpus()
    expect(loaded.length).toBe(RECURRING_ARTIFACT_DESCRIPTORS.length)
  })
})
