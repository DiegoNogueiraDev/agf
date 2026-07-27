/*!
 * TDD: typed relations + confidence + version in memory facts (node_852a18fb7373).
 *
 * AC1: A fact with superseded_by another is excluded from recall.
 * AC2: A fact carries confidence (extracted vs inferred) and version when written.
 */

import { describe, it, expect } from 'vitest'
import { selectByActivation, type ScoredMemory } from '../core/memory/memory-salience.js'
import type { MemorySearchResult } from '../core/memory/memory-reader.js'
import { parseMemoryFrontmatter } from '../core/memory/memory-reader.js'

function makeScored(
  name: string,
  extra: Partial<Pick<MemorySearchResult, 'supersededBy' | 'confidence' | 'version'>>,
): ScoredMemory {
  return {
    result: { name, snippet: `snippet of ${name}`, score: 1, ...extra },
    activation: 1,
    tokens: 10,
  }
}

describe('AC1: superseded fact is excluded from recall', () => {
  it('drops a memory with supersededBy set', () => {
    const scored = [makeScored('old-fact', { supersededBy: 'new-fact' }), makeScored('new-fact', {})]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'old-fact')).toBeUndefined()
    expect(kept.find((m) => m.name === 'new-fact')).toBeDefined()
  })

  it('includes fact without supersededBy', () => {
    const scored = [makeScored('current-fact', {})]
    const { kept } = selectByActivation(scored, { limit: 10 })
    expect(kept.find((m) => m.name === 'current-fact')).toBeDefined()
  })
})

describe('AC2: confidence and version parsed from frontmatter', () => {
  it('parses confidence field from frontmatter', () => {
    const raw = `---\nconfidence: extracted\nversion: 2\n---\nFact body.`
    const { confidence, version } = parseMemoryFrontmatter(raw)
    expect(confidence).toBe('extracted')
    expect(version).toBe(2)
  })

  it('parses superseded_by from frontmatter', () => {
    const raw = `---\nsuperseded_by: new-fact-name\n---\nOld fact.`
    const { supersededBy } = parseMemoryFrontmatter(raw)
    expect(supersededBy).toBe('new-fact-name')
  })

  it('returns undefined when fields absent', () => {
    const raw = `---\nvalid_until: null\n---\nBody.`
    const { confidence, version, supersededBy } = parseMemoryFrontmatter(raw)
    expect(confidence).toBeUndefined()
    expect(version).toBeUndefined()
    expect(supersededBy).toBeUndefined()
  })
})
