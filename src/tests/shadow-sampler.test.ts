import { describe, it, expect } from 'vitest'
import { createShadowSampler } from '../core/rag-out/shadow-sampler.js'
import type { ShadowEntry } from '../core/rag-out/shadow-sampler.js'

function makeEntry(lever: ShadowEntry['lever'], baselineTokens: number, actualTokens = 50): ShadowEntry {
  return { lever, baselineTokens, actualTokens, baselineMethod: 'shadow_sample', timestamp: 1 }
}

describe('createShadowSampler', () => {
  describe('shouldSample — 1/N counter', () => {
    it('triggers on the very first call (count=0 → 0 % N === 0)', () => {
      const s = createShadowSampler({ n: 3 })
      expect(s.shouldSample()).toBe(true)
    })

    it('returns false on non-multiple calls', () => {
      const s = createShadowSampler({ n: 3 })
      s.shouldSample() // 0 → true
      expect(s.shouldSample()).toBe(false) // 1
      expect(s.shouldSample()).toBe(false) // 2
    })

    it('returns true again at count = N', () => {
      const s = createShadowSampler({ n: 3 })
      s.shouldSample() // 0 → true
      s.shouldSample() // 1
      s.shouldSample() // 2
      expect(s.shouldSample()).toBe(true) // 3 → true again
    })

    it('default n=10 triggers on every 10th call', () => {
      const s = createShadowSampler()
      expect(s.shouldSample()).toBe(true) // 0
      for (let i = 1; i < 10; i++) s.shouldSample()
      expect(s.shouldSample()).toBe(true) // 10
    })

    it('n=1 samples every call', () => {
      const s = createShadowSampler({ n: 1 })
      for (let i = 0; i < 5; i++) {
        expect(s.shouldSample()).toBe(true)
      }
    })
  })

  describe('record and meanBaseline', () => {
    it('meanBaseline returns 0 with no samples', () => {
      const s = createShadowSampler()
      expect(s.meanBaseline('rag_out_recovery')).toBe(0)
    })

    it('meanBaseline returns the baseline of a single sample', () => {
      const s = createShadowSampler()
      s.record(makeEntry('rag_out_recovery', 200))
      expect(s.meanBaseline('rag_out_recovery')).toBe(200)
    })

    it('meanBaseline returns arithmetic mean of multiple samples', () => {
      const s = createShadowSampler()
      s.record(makeEntry('rag_out_recovery', 100))
      s.record(makeEntry('rag_out_recovery', 300))
      expect(s.meanBaseline('rag_out_recovery')).toBe(200)
    })

    it('different levers compute independent means', () => {
      const s = createShadowSampler()
      s.record(makeEntry('rag_out_recovery', 200))
      s.record(makeEntry('rag_in_reuse', 80))
      expect(s.meanBaseline('rag_out_recovery')).toBe(200)
      expect(s.meanBaseline('rag_in_reuse')).toBe(80)
    })

    it('samples array grows with each record call', () => {
      const s = createShadowSampler()
      expect(s.samples).toHaveLength(0)
      s.record(makeEntry('rag_out_recovery', 150))
      expect(s.samples).toHaveLength(1)
      s.record(makeEntry('rag_out_recovery', 250))
      expect(s.samples).toHaveLength(2)
    })
  })

  describe('baselineMethod label', () => {
    it('recorded entries carry baselineMethod=shadow_sample', () => {
      const s = createShadowSampler()
      s.record(makeEntry('rag_out_recovery', 100))
      expect(s.samples[0]!.baselineMethod).toBe('shadow_sample')
    })
  })
})
