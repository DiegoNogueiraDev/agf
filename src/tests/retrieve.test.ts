import { describe, it, expect } from 'vitest'
import { tfidfCosineScores, rerankCandidates, retrieveCommand } from '../core/rag-in/retrieve.js'
import type { CommandChunk, CommandFamily } from '../core/rag-in/command-chunk.js'
import type { RetrievedCommand } from '../core/rag-in/retrieve.js'

function makeChunk(id: string, intent: string, command: string, tool: string): CommandChunk {
  return {
    id,
    intent,
    command,
    family: 'unix' as CommandFamily,
    tool,
    flags_explained: '',
    danger: false,
    source: 'test',
  }
}

describe('tfidfCosineScores', () => {
  it('returns zeros for empty corpus', () => {
    expect(tfidfCosineScores(['grep'], [])).toEqual([])
  })

  it('returns zeros for empty query', () => {
    const result = tfidfCosineScores([], [['grep', 'file']])
    expect(result).toEqual([0])
  })

  it('scores matching document higher than non-matching', () => {
    const query = ['extract', 'archive']
    const docs = [
      ['extract', 'archive', 'tar'],
      ['list', 'directory', 'ls'],
    ]
    const scores = tfidfCosineScores(query, docs)
    expect(scores[0]).toBeGreaterThan(scores[1]!)
  })
})

describe('rerankCandidates', () => {
  it('returns empty array for empty candidates', () => {
    expect(rerankCandidates('extract archive', [], 3)).toEqual([])
  })

  it('returns top k results', () => {
    const candidates: RetrievedCommand[] = [
      { chunk: makeChunk('a', 'extract archive', 'tar -xzf', 'tar'), score: 0.8 },
      { chunk: makeChunk('b', 'list files', 'ls -la', 'ls'), score: 0.6 },
      { chunk: makeChunk('c', 'find file', 'find . -name', 'find'), score: 0.5 },
      { chunk: makeChunk('d', 'copy file', 'cp src dst', 'cp'), score: 0.4 },
    ]
    const result = rerankCandidates('extract archive', candidates, 2)
    expect(result).toHaveLength(2)
  })

  it('ranks candidates by intent coverage', () => {
    const candidates: RetrievedCommand[] = [
      { chunk: makeChunk('a', 'compress file', 'gzip file', 'gzip'), score: 0.9 },
      { chunk: makeChunk('b', 'extract archive tar', 'tar -xzf', 'tar'), score: 0.5 },
    ]
    const result = rerankCandidates('extract archive', candidates, 2)
    // The tar chunk should rank higher for "extract archive" query
    expect(result[0]?.chunk.id).toBe('b')
  })
})

describe('retrieveCommand', () => {
  it('returns fallback_help when corpus is empty', () => {
    const result = retrieveCommand('extract archive', [])
    expect(result.decision).toBe('fallback_help')
    expect(result.top).toBeNull()
  })

  it('returns retrieved for a high-confidence match', () => {
    const corpus = [
      makeChunk('tar-extract', 'extract a gzipped tar archive', 'tar -xzf {file}', 'tar'),
      makeChunk('ls-list', 'list directory contents', 'ls -la', 'ls'),
    ]
    const result = retrieveCommand('extract archive tar', corpus, { threshold: 0 })
    expect(result.decision).toBe('retrieved')
    expect(result.top).not.toBeNull()
  })

  it('returns fallback_help when confidence is below threshold', () => {
    const corpus = [makeChunk('unrelated', 'completely different task', 'unrelated command', 'unrelated')]
    const result = retrieveCommand('specific obscure thing', corpus, { threshold: 1.0 })
    expect(result.decision).toBe('fallback_help')
  })
})
