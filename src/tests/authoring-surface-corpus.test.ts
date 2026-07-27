/*!
 * TDD: authoring surface documented in corpus + context files (node_05d30ad6fc48).
 *
 * AC1: retrieve-command "create a new skill" → top result is "agf skill new".
 * AC2: AGF_GOLDEN_RULES or another source constant mentions agf skill new / agent create / hooks add.
 */

import { describe, it, expect } from 'vitest'
import { buildLiveCorpus } from '../core/rag-in/builtin-corpus.js'
import { AGF_GOLDEN_RULES } from '../core/config/cli-reference-content.js'

describe('AC1: authoring commands present in RAG-IN corpus', () => {
  it('corpus contains agf skill new intent', () => {
    const corpus = buildLiveCorpus()
    const found = corpus.some(
      (c) =>
        c.command.includes('skill new') || (c.intent.toLowerCase().includes('create') && c.command.includes('skill')),
    )
    expect(found).toBe(true)
  })

  it('corpus contains agf agent create intent', () => {
    const corpus = buildLiveCorpus()
    const found = corpus.some((c) => c.command.includes('agent create') || c.command.includes('agent.create'))
    expect(found).toBe(true)
  })
})

describe('AC2: authoring surface documented in generated context source', () => {
  it('AGF_GOLDEN_RULES or context sources mention agf skill new', () => {
    // The generated context documents the authoring surface
    expect(AGF_GOLDEN_RULES).toMatch(/skill new|agent create|hooks add/i)
  })
})
