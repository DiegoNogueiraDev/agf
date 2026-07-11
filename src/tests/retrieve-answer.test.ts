/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * The engine already knew it did not know.
 *
 * Asked to verify an acceptance criterion, RAG-IN scored 0.200 against a 0.5 gate and returned
 * `decision: 'fallback_help'`. The command then printed the top candidate anyway — `agf immune`
 * — and the AI output profile stripped `decision` and `confidence` on the way out. What reached
 * the agent was `{"command":"agf immune"}`: a rejected guess wearing the clothes of an answer.
 *
 * A retrieval that refuses must refuse out loud. Below the gate there is no command, only the
 * fallback.
 */

import { describe, it, expect } from 'vitest'
import { answeredCommand, guardDecision } from '../core/rag-in/retrieve-answer.js'
import type { RetrieveDecision } from '../core/rag-in/retrieve.js'

const chunk = {
  id: 'agf-next',
  intent: 'pull the next task',
  command: 'agf next',
  family: 'harness',
  tool: 'agf',
  flags_explained: '',
  danger: false,
  source: 'harness',
} as const

function decision(overrides: Partial<RetrieveDecision>): RetrieveDecision {
  return {
    decision: 'retrieved',
    query: 'q',
    confidence: 0.9,
    top: chunk,
    candidates: [],
    fallback: null,
    ...overrides,
  }
}

describe('answeredCommand — a rejected guess is not an answer', () => {
  it('returns the command when the gate passed', () => {
    expect(answeredCommand(decision({ decision: 'retrieved' }))).toBe('agf next')
  })

  it('returns null when the engine fell back to help', () => {
    expect(answeredCommand(decision({ decision: 'fallback_help', confidence: 0.2 }))).toBeNull()
  })

  it('returns null when there is no candidate at all', () => {
    expect(answeredCommand(decision({ decision: 'retrieved', top: null }))).toBeNull()
  })
})

/**
 * Asked to *show* a node, RAG-IN answered `agf node rm` at 0.667 — above the gate. The words
 * overlap almost entirely ("um nó do grafo"), and nothing in BM25 separates showing from
 * archiving. The costs are not symmetric: refusing costs a `--help`, obeying costs the node.
 */
describe('guardDecision — a read-shaped question never gets a destructive command', () => {
  const rm = { ...chunk, command: 'agf node rm', intent: 'Remove (arquiva) um nó do grafo' }

  it('refuses a destructive command when the query did not ask to destroy', () => {
    const guarded = guardDecision(decision({ query: 'mostrar um nó do grafo', top: rm, confidence: 0.667 }))
    expect(guarded.decision).toBe('fallback_help')
    expect(answeredCommand(guarded)).toBeNull()
    expect(guarded.fallback).toContain('help')
  })

  it('allows it when the query does ask to destroy', () => {
    const guarded = guardDecision(decision({ query: 'remover um nó do grafo', top: rm, confidence: 0.667 }))
    expect(answeredCommand(guarded)).toBe('agf node rm')
  })

  it.each(['apagar um nó', 'delete a node', 'arquivar o nó', 'limpar o cache'])(
    'accepts destructive intent: %s',
    (q) => {
      expect(guardDecision(decision({ query: q, top: rm })).decision).toBe('retrieved')
    },
  )

  it('leaves a harmless command untouched', () => {
    const guarded = guardDecision(decision({ query: 'mostrar um nó do grafo', top: chunk }))
    expect(answeredCommand(guarded)).toBe('agf next')
  })

  it('does not resurrect a decision the gate already rejected', () => {
    const guarded = guardDecision(decision({ decision: 'fallback_help', top: null, confidence: 0.2 }))
    expect(guarded.decision).toBe('fallback_help')
  })
})
