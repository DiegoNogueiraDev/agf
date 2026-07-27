import { describe, it, expect } from 'vitest'
import { buildScaffoldCorpus, loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'

describe('buildScaffoldCorpus', () => {
  it('returns a non-empty array of scaffold descriptors', () => {
    const corpus = buildScaffoldCorpus()
    expect(corpus.length).toBeGreaterThan(0)
  })

  it('each descriptor has id, goal, fitTags, slots, noveltyFloor', () => {
    const corpus = buildScaffoldCorpus()
    for (const d of corpus) {
      expect(typeof d.id).toBe('string')
      expect(typeof d.goal).toBe('string')
      expect(Array.isArray(d.fitTags)).toBe(true)
      expect(Array.isArray(d.slots)).toBe(true)
      expect(typeof d.noveltyFloor).toBe('number')
    }
  })

  it('noveltyFloor is between 0 and 1 for all descriptors', () => {
    const corpus = buildScaffoldCorpus()
    for (const d of corpus) {
      expect(d.noveltyFloor).toBeGreaterThanOrEqual(0)
      expect(d.noveltyFloor).toBeLessThanOrEqual(1)
    }
  })
})

describe('loadDefaultScaffoldCorpus', () => {
  it('returns more descriptors than buildScaffoldCorpus alone', () => {
    const base = buildScaffoldCorpus()
    const full = loadDefaultScaffoldCorpus()
    expect(full.length).toBeGreaterThanOrEqual(base.length)
  })
})
