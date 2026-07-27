/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Recall, measured. Not "retrieval feels better" — a number that fails the build when it drops.
 *
 * Twelve intentions a person actually has, phrased the way they would phrase them, in the
 * language this project is written and spoken in. None of them names its command: that is the
 * point of asking in prose. When this suite was written, four of the twelve reached the right
 * command, and eight did not put it in the top three at all.
 *
 * The corpus is bilingual by accident — `agf harness` describes itself in English, `agf trace`
 * in Portuguese — and BM25 cannot cross that. Everything the retrieval layer does to bridge it
 * gets judged here.
 */

import { describe, it, expect } from 'vitest'
import { buildLiveCorpus } from '../core/rag-in/builtin-corpus.js'
import { retrieveCommand } from '../core/rag-in/retrieve.js'

/**
 * `[expected command path, how a person asks for it]` — never naming the command itself.
 *
 * Two of the original twelve were bad questions, not bad retrievals. "rastrear a proveniência de
 * uma mudança" describes `agf provenance` at least as well as `agf trace`, and "criar um papel de
 * agente" collides with `agf agent create`. A benchmark with an ambiguous answer measures nothing
 * and, worse, invites you to bend the ranker until it guesses the way you meant. Replaced with
 * intents that have exactly one right answer.
 */
const INTENTS: ReadonlyArray<readonly [string, string]> = [
  ['next', 'puxar a próxima task desbloqueada'],
  ['done', 'finalizar uma task e marcar como concluída'],
  ['harness', 'medir a prontidão do código para agentes'],
  ['verify-ac', 'verificar se o AC de um nó já está satisfeito pelo código'],
  ['cycle-repair', 'consertar ciclos de dependência no grafo'],
  ['spec-triage', 'triar especificações pendentes'],
  ['savings', 'quantos tokens economizamos até agora'],
  ['question', 'registrar uma pergunta em aberto no grafo'],
  ['role', 'definir o papel do agente nesta task'],
  ['gearshift', 'trocar a marcha de esforço do modelo'],
  ['out-of-scope', 'marcar um item como fora de escopo'],
  ['wire-dormant', 'listar capacidades dormentes'],
]

/** `agf out-of-scope record` answers an `out-of-scope` intent; the group is what matters. */
function matches(command: string, expected: string): boolean {
  const path = command.replace(/^agf /, '')
  return path === expected || path.startsWith(`${expected} `)
}

const corpus = buildLiveCorpus()

describe('RAG-IN recall — asking in prose finds the command', () => {
  const outcomes = INTENTS.map(([expected, query]) => {
    const result = retrieveCommand(query, corpus, { k: 3 })
    return {
      expected,
      query,
      answered: result.decision === 'retrieved' && result.top !== null,
      correct: result.top !== null && matches(result.top.command, expected),
      inTopThree: result.candidates.some((c) => matches(c.chunk.command, expected)),
      got: result.top?.command ?? null,
    }
  })

  it('puts the right command in the top three for at least 11 of 12 intents', () => {
    const misses = outcomes.filter((o) => !o.inTopThree).map((o) => `${o.expected} ← "${o.query}" got ${o.got}`)
    expect(misses.length, `not even in top-3:\n${misses.join('\n')}`).toBeLessThanOrEqual(1)
  })

  it('answers with the right command for at least 9 of 12 intents', () => {
    const wrong = outcomes.filter((o) => !o.correct).map((o) => `${o.expected} → ${o.got}`)
    expect(outcomes.filter((o) => o.correct).length, `wrong or refused:\n${wrong.join('\n')}`).toBeGreaterThanOrEqual(9)
  })

  // Precision is the promise already kept: it may refuse, it may not lie. A wrong command that
  // clears the confidence gate is worse than a refusal, because the agent runs it.
  it('never answers with the wrong command', () => {
    const lies = outcomes.filter((o) => o.answered && !o.correct).map((o) => `${o.expected} → ${o.got}`)
    expect(lies).toEqual([])
  })
})
