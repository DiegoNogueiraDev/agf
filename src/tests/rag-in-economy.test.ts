import { describe, it, expect } from 'vitest'
import { estimateRagInEconomy, toLeverEvent } from '../core/rag-in/economy.js'
import type { RetrieveDecision } from '../core/rag-in/retrieve.js'

const retrieved: RetrieveDecision = {
  decision: 'retrieved',
  query: 'extract a gzipped tar archive',
  confidence: 1,
  top: {
    id: 'tar-extract',
    intent: 'extract a gzipped tar archive',
    command: 'tar -xzf {file.tar.gz}',
    family: 'unix',
    tool: 'tar',
    flags_explained: '',
    danger: false,
    source: 'builtin',
  },
  candidates: [],
  fallback: null,
}

const fallback: RetrieveDecision = {
  decision: 'fallback_help',
  query: 'xyzzy frobnicate',
  confidence: 0.1,
  top: null,
  candidates: [],
  fallback: null,
}

describe('estimateRagInEconomy', () => {
  it('reports positive savings for a retrieved command (counterfactual = LLM generation avoided)', () => {
    const e = estimateRagInEconomy(retrieved)
    expect(e.lever).toBe('rag_in_reuse')
    expect(e.decision).toBe('retrieved')
    expect(e.baselineTokens).toBeGreaterThan(e.actualTokens)
    expect(e.saved).toBe(e.baselineTokens - e.actualTokens)
    expect(e.saved).toBeGreaterThan(0)
  })

  it('labels the baseline method honestly (structural, not measured)', () => {
    expect(estimateRagInEconomy(retrieved).baselineMethod).toBe('structural')
  })

  it('reports zero savings on fallback (no LLM was avoided)', () => {
    const e = estimateRagInEconomy(fallback)
    expect(e.decision).toBe('fallback_help')
    expect(e.saved).toBe(0)
  })

  it('carries the rerank/confidence score for threshold calibration', () => {
    expect(estimateRagInEconomy(retrieved).rerankScore).toBe(1)
  })
})

describe('toLeverEvent', () => {
  it('maps a retrieved economy to an accepted rag_in_reuse lever event', () => {
    const ev = toLeverEvent(estimateRagInEconomy(retrieved), 'sess-1', 'node_x')
    expect(ev.lever).toBe('rag_in_reuse')
    expect(ev.sessionId).toBe('sess-1')
    expect(ev.nodeId).toBe('node_x')
    expect(ev.accepted).toBe(true)
    expect(ev.gateOutcome).toBe('accepted')
    expect(ev.saved).toBeGreaterThan(0)
    expect(ev.tokensBefore - ev.tokensAfter).toBe(ev.saved)
  })

  it('maps a fallback economy to a passthrough event with zero savings', () => {
    const ev = toLeverEvent(estimateRagInEconomy(fallback), 'sess-1')
    expect(ev.gateOutcome).toBe('passthrough')
    expect(ev.accepted).toBe(false)
    expect(ev.saved).toBe(0)
  })
})
