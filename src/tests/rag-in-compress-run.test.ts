/*!
 * TDD: add 'agf compress run' to the RAG-IN corpus (node_8a67963ef6ad).
 *
 * AC: Given 'run a command and compress its output', when retrieveCommand runs,
 *     then the top candidate is 'agf compress run'.
 */

import { describe, it, expect } from 'vitest'
import { retrieveCommand } from '../core/rag-in/retrieve.js'
import { buildHarnessCorpus } from '../core/rag-in/builtin-corpus.js'

describe('rag-in agf compress run corpus entry', () => {
  it('corpus contains a compress-run entry', () => {
    const corpus = buildHarnessCorpus()
    const entry = corpus.find((c) => c.command.includes('compress run'))
    expect(entry).toBeDefined()
    expect(entry?.tool).toBe('agf')
  })

  it('retrieveCommand maps compress-output intent to agf compress run', () => {
    const corpus = buildHarnessCorpus()
    const result = retrieveCommand('run a command and compress its output', corpus)
    expect(result.top?.command).toContain('compress run')
  })
})
