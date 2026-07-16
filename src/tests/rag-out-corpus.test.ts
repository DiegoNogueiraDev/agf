import { describe, it, expect } from 'vitest'
import { loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'
import { decideScaffold } from '../core/rag-out/gate.js'

describe('loadDefaultScaffoldCorpus', () => {
  it('derives a non-empty corpus from the scaffolder registry', () => {
    const corpus = loadDefaultScaffoldCorpus()
    expect(corpus.length).toBeGreaterThanOrEqual(4)
    const contract = corpus.find((s) => s.id === 'contract')
    expect(contract).toBeDefined()
    expect(contract!.slots).toContain('requestSchema')
    expect(contract!.fitTags).toContain('rest')
    // split capabilities feed fit tags too
    expect(contract!.fitTags).toContain('handler')
    expect(contract!.noveltyFloor).toBeGreaterThan(0)
  })

  it('feeds the gate end-to-end: a REST goal recovers the contract scaffold', () => {
    const corpus = loadDefaultScaffoldCorpus()
    const d = decideScaffold('build a REST endpoint handler with request validation', corpus)
    expect(d.decision).toBe('recover')
    expect(d.best?.id).toBe('contract')
  })
})
