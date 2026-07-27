import { describe, it, expect } from 'vitest'
import { estimateRagInEconomy, toLeverEvent } from '../core/rag-in/economy.js'
import type { RagInEconomy } from '../core/rag-in/economy.js'
import type { RetrieveDecision } from '../core/rag-in/retrieve.js'
import type { CommandChunk } from '../core/rag-in/command-chunk.js'

function makeChunk(command = 'agf next'): CommandChunk {
  return {
    id: 'agf-next',
    intent: 'pull next task',
    command,
    family: 'harness',
    tool: 'agf',
    flags_explained: '',
    warns: false,
    source: 'tldr',
    tags: [],
  } as unknown as CommandChunk
}

function makeFallbackDecision(): RetrieveDecision {
  return {
    decision: 'fallback_help',
    query: 'list files',
    confidence: 0.2,
    top: null,
    candidates: [],
    fallback: 'ls --help',
  }
}

function makeRetrievedDecision(command = 'agf next'): RetrieveDecision {
  return {
    decision: 'retrieved',
    query: 'pull next task',
    confidence: 0.85,
    top: makeChunk(command),
    candidates: [],
    fallback: null,
  }
}

describe('estimateRagInEconomy', () => {
  it('returns saved=0 for fallback decision', () => {
    const result = estimateRagInEconomy(makeFallbackDecision())
    expect(result.saved).toBe(0)
    expect(result.lever).toBe('rag_in_reuse')
    expect(result.decision).toBe('fallback_help')
  })

  it('returns saved=0 when top is null', () => {
    const d = makeRetrievedDecision()
    ;(d as any).top = null
    const result = estimateRagInEconomy(d)
    expect(result.saved).toBe(0)
  })

  it('returns positive saved for retrieved decision', () => {
    const result = estimateRagInEconomy(makeRetrievedDecision('agf next --select data.id'))
    expect(result.saved).toBeGreaterThan(0)
    expect(result.lever).toBe('rag_in_reuse')
  })

  it('baselineTokens > actualTokens for retrieved decision', () => {
    const result = estimateRagInEconomy(makeRetrievedDecision('agf start'))
    expect(result.baselineTokens).toBeGreaterThan(result.actualTokens)
  })

  it('baselineMethod is structural', () => {
    const result = estimateRagInEconomy(makeRetrievedDecision())
    expect(result.baselineMethod).toBe('structural')
  })

  it('rerankScore matches confidence', () => {
    const d = makeRetrievedDecision()
    const result = estimateRagInEconomy(d)
    expect(result.rerankScore).toBe(d.confidence)
  })
})

describe('toLeverEvent', () => {
  function makeEconomy(overrides: Partial<RagInEconomy> = {}): RagInEconomy {
    return {
      lever: 'rag_in_reuse',
      decision: 'retrieved',
      baselineTokens: 70,
      actualTokens: 10,
      saved: 60,
      baselineMethod: 'structural',
      rerankScore: 0.85,
      ...overrides,
    }
  }

  it('maps lever correctly', () => {
    const ev = toLeverEvent(makeEconomy(), 'sess-1')
    expect(ev.lever).toBe('rag_in_reuse')
  })

  it('accepted=true when retrieved and saved>0', () => {
    const ev = toLeverEvent(makeEconomy(), 'sess-1')
    expect(ev.accepted).toBe(true)
  })

  it('accepted=false for fallback_help', () => {
    const ev = toLeverEvent(makeEconomy({ decision: 'fallback_help', saved: 0 }), 'sess-1')
    expect(ev.accepted).toBe(false)
  })

  it('includes sessionId', () => {
    const ev = toLeverEvent(makeEconomy(), 'my-session')
    expect(ev.sessionId).toBe('my-session')
  })

  it('passes nodeId when provided', () => {
    const ev = toLeverEvent(makeEconomy(), 'sess-1', 'node-abc')
    expect(ev.nodeId).toBe('node-abc')
  })

  it('gateOutcome is accepted for accepted=true', () => {
    const ev = toLeverEvent(makeEconomy(), 'sess-1')
    expect(ev.gateOutcome).toBe('accepted')
  })
})
