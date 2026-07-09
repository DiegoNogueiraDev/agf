import { describe, it, expect } from 'vitest'
import { CODE_BOILERPLATE_DESCRIPTORS, loadCodeBoilerplateCorpus } from '../core/rag-out/code-boilerplates.js'

describe('CODE_BOILERPLATE_DESCRIPTORS', () => {
  it('is a non-empty readonly array', () => {
    expect(CODE_BOILERPLATE_DESCRIPTORS.length).toBeGreaterThan(0)
  })

  it('each descriptor has id, goal, fitTags, slots, noveltyFloor', () => {
    for (const d of CODE_BOILERPLATE_DESCRIPTORS) {
      expect(typeof d.id).toBe('string')
      expect(typeof d.goal).toBe('string')
      expect(Array.isArray(d.fitTags)).toBe(true)
      expect(Array.isArray(d.slots)).toBe(true)
      expect(typeof d.noveltyFloor).toBe('number')
    }
  })

  it('includes cli-ts entry', () => {
    const ids = CODE_BOILERPLATE_DESCRIPTORS.map((d) => d.id)
    expect(ids).toContain('cli-ts')
  })

  it('all have language field set', () => {
    for (const d of CODE_BOILERPLATE_DESCRIPTORS) {
      expect(d.language).toBeDefined()
    }
  })
})

describe('loadCodeBoilerplateCorpus', () => {
  it('returns same items as CODE_BOILERPLATE_DESCRIPTORS', () => {
    const loaded = loadCodeBoilerplateCorpus()
    expect(loaded.length).toBe(CODE_BOILERPLATE_DESCRIPTORS.length)
  })
})
