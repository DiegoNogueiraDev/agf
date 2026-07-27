/*!
 * TDD: forage-stop wired into feature-extractor (node_bb43738b711a).
 *
 * AC1: Given a repo where additional files bring no new distinctive terms,
 *      When extracting, Then reading stops early (forage-stop fires).
 * AC2: Given a deep scan, When run, Then completes deterministically within a
 *      bounded time (no LLM tokens).
 */

import { describe, it, expect } from 'vitest'
import { extractFeaturesWithForageStop, type CorpusDocument } from '../core/scan/feature-extractor.js'

// Redundant docs: same vocabulary repeated — marginal gain drops fast
const REDUNDANT_DOCS: CorpusDocument[] = [
  { id: 'file1', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file2', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file3', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file4', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file5', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file6', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file7', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'file8', text: 'authentication login logout session token jwt bearer oauth' },
]

// Diverse docs: each brings genuinely new terms
const DIVERSE_DOCS: CorpusDocument[] = [
  { id: 'auth', text: 'authentication login logout session token jwt bearer oauth' },
  { id: 'db', text: 'database postgres sql query migration schema table index' },
  { id: 'cache', text: 'redis cache eviction ttl lru distributed key-value store' },
  { id: 'queue', text: 'rabbitmq kafka queue consumer producer message broker' },
]

describe('AC1: early stopping when marginal gain drops', () => {
  it('reads fewer docs than total when docs are redundant', () => {
    const result = extractFeaturesWithForageStop(REDUNDANT_DOCS, { enableForageStop: true })
    expect(result.docsRead).toBeLessThan(REDUNDANT_DOCS.length)
  })

  it('reads more docs for diverse content than for redundant content', () => {
    const diverse = extractFeaturesWithForageStop(DIVERSE_DOCS, { enableForageStop: true })
    const redundant = extractFeaturesWithForageStop(REDUNDANT_DOCS, { enableForageStop: true })
    // Diverse content has high marginal gain → reads more before stopping
    expect(diverse.docsRead).toBeGreaterThan(redundant.docsRead)
  })

  it('without forage-stop reads all docs regardless', () => {
    const result = extractFeaturesWithForageStop(REDUNDANT_DOCS, { enableForageStop: false })
    expect(result.docsRead).toBe(REDUNDANT_DOCS.length)
  })
})

describe('AC2: deterministic, 0-token, bounded runtime', () => {
  it('completes fast (<200ms) on 8 docs', () => {
    const start = Date.now()
    extractFeaturesWithForageStop(REDUNDANT_DOCS, { enableForageStop: true })
    expect(Date.now() - start).toBeLessThan(200)
  })

  it('returns the same result on two runs (deterministic)', () => {
    const r1 = extractFeaturesWithForageStop(DIVERSE_DOCS, { enableForageStop: true })
    const r2 = extractFeaturesWithForageStop(DIVERSE_DOCS, { enableForageStop: true })
    expect(r1.docsRead).toBe(r2.docsRead)
    expect(r1.features.map((f) => f.docId)).toEqual(r2.features.map((f) => f.docId))
  })
})
