/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * RAG-OUT earns its keep by *not* generating. Every scaffold it recovers is output the model
 * never had to write, and output is the expensive half of a token bill.
 *
 * So the number that matters is how often it recognises a goal it already has a shape for —
 * without ever handing back the wrong shape, which would cost more than generating from scratch.
 *
 * The gate was sound; its tokeniser was not. `função pura expressão` split into
 * `fun | o | pura | express | o`, because the split ran before the accents were folded. The
 * scaffold that matched a goal word for word scored 0.43 against a 0.5 bar and was rejected.
 */

import { describe, it, expect } from 'vitest'
import { loadDefaultScaffoldCorpus } from '../core/rag-out/scaffold-corpus.js'
import { decideScaffold } from '../core/rag-out/gate.js'
import { structureTokens } from '../core/rag-out/scaffold-body.js'

/** `[scaffold that should answer it, how someone would state the goal]`. */
const GOALS: ReadonlyArray<readonly [string, string]> = [
  ['contract', 'handler REST com validação de entrada e saída'],
  ['interface', 'criar uma interface TypeScript com stubs de teste'],
  ['state-machine', 'um reducer com máquina de estados e matriz de transições'],
  ['formula', 'função pura que calcula uma expressão matemática'],
  ['prd-software', 'escrever um PRD de produto com fases e métricas'],
  ['skill-lifecycle', 'arquivo de skill para uma fase do lifecycle'],
  ['repo-structure', 'estrutura de repositório com README e layout de código'],
  ['cli-ts', 'projeto de CLI em TypeScript com Commander'],
  ['fastapi-project', 'projeto FastAPI em Python com rotas e Pydantic'],
  ['react-component', 'componente React com props tipadas e hooks'],
  ['spring-rest-endpoint', 'endpoint REST em Spring Boot'],
  ['kotlin-ktor-route', 'rota HTTP em Ktor com Kotlin'],
  ['dart-flutter-widget', 'widget Flutter com estado'],
]

const corpus = loadDefaultScaffoldCorpus()

describe('RAG-OUT recall — a goal it has a shape for is a goal it does not generate', () => {
  const outcomes = GOALS.map(([expected, goal]) => {
    // The port the CLI passes: a scaffold whose structure cannot be produced is not recovered.
    const decision = decideScaffold(goal, corpus, { structureTokensOf: (s) => structureTokens(s.structureRef) })
    return {
      expected,
      goal,
      recovered: decision.decision === 'recover',
      picked: decision.best?.id ?? null,
      confidence: decision.confidence,
      reason: decision.reason,
    }
  })

  // Thirteen of thirteen — and it was four until the nine missing templates were written. The
  // count rose because the skeletons exist now, not because the gate was loosened: it still
  // refuses a reference nobody defined (see builtin-templates.test.ts).
  it('recovers a scaffold for every goal it has a shape for', () => {
    const generated = outcomes
      .filter((o) => !o.recovered)
      .map((o) => `${o.expected} (conf ${o.confidence.toFixed(2)}, ${o.reason})`)
    expect(outcomes.filter((o) => o.recovered).length, `generated instead:\n${generated.join('\n')}`).toBe(GOALS.length)
  })

  it('hands over a body, not a filename', () => {
    for (const outcome of outcomes.filter((o) => o.recovered)) {
      const scaffold = corpus.find((s) => s.id === outcome.picked)
      expect(structureTokens(scaffold?.structureRef) ?? 0).toBeGreaterThan(10)
    }
  })

  // Recovering the wrong scaffold is worse than generating: the model pays to read a skeleton
  // it must then throw away, and a slot-filled wrong shape is harder to notice than a blank page.
  it('never recovers the wrong scaffold', () => {
    const wrong = outcomes
      .filter((o) => o.recovered && o.picked !== o.expected)
      .map((o) => `${o.expected} → ${o.picked}`)
    expect(wrong).toEqual([])
  })

  it('ranks the right scaffold first even when it declines to recover it', () => {
    const misranked = outcomes.filter((o) => o.picked !== o.expected).map((o) => `${o.expected} → ${o.picked}`)
    expect(misranked).toEqual([])
  })
})
