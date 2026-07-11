/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 0.3 — agf brief com Ceiling de 500 Tokens
 *
 * AC:
 * 1. agf brief <id> output estimado ≤ 500 tokens (via token-estimator)
 * 2. Context excede 500 tokens → trunca seções de baixo INVEST com prefixo [truncated — use agf context <id> --full]
 * 3. agf brief <id> --full → sem ceiling (comportamento atual)
 * 4. Brief compacto preserva: intenção, AC, blast radius, "NÃO", testWith
 */
import { describe, it, expect } from 'vitest'
import { applyBriefCeiling, estimateBriefTokens, BRIEF_TOKEN_CEILING } from '../core/context/brief-ceiling.js'
import type { ExecutorBrief } from '../core/context/executor-brief.js'

function makeLargeBrief(): ExecutorBrief {
  return {
    task: {
      id: 'node_test',
      title: 'Large test task',
      type: 'task',
      xpSize: 'L',
      estimateMinutes: 120,
      status: 'in_progress',
      priority: 2,
      tags: [],
      metadata: {},
    },
    intent: 'Implementar feature X com TDD',
    imitate: 'src/core/example.ts — segue o mesmo padrão de exportação e testes',
    readTouch: [
      'src/core/context/executor-brief.ts',
      'src/core/context/brief-ceiling.ts',
      'src/cli/commands/brief-cmd.ts',
      'src/tests/brief-ceiling.test.ts',
    ].join(', '),
    contract:
      'export function applyBriefCeiling(brief: ExecutorBrief, full?: boolean): ExecutorBrief — se full=true retorna inalterado; senão aplica ceiling de 500 tokens truncando seções de baixa prioridade. ' +
      'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(
        5,
      ),
    acceptanceCriteria: [
      'GIVEN agf brief <id> WHEN sem --full THEN output ≤ 500 tokens',
      'GIVEN context > 500 tokens WHEN gerado THEN trunca com prefixo [truncated]',
      'GIVEN --full WHEN passado THEN sem ceiling',
      'GIVEN brief WHEN truncado THEN preserva intenção, AC, blast, NÃO, testWith',
    ],
    notList: ['refatorar módulos vizinhos', 'mudar interface pública de briefFormat'],
    blastRadius: ['src/cli/commands/brief-cmd.ts', 'src/core/context/executor-brief.ts'],
    budget: '~2 arquivos, sem novas deps, sem hot-path — tarefa atômica (S)',
    uncertainty:
      'Se o ceiling quebrar o brief, PARE e reporte; escolha a estratégia de truncamento e justifique em 1 linha',
    testWith:
      'import { applyBriefCeiling } from "../core/context/brief-ceiling.js"; const result = applyBriefCeiling(largeBrief); expect(estimateBriefTokens(result)).toBeLessThanOrEqual(500)',
    dod: ['typecheck', 'npm run test:blast', 'lint'],
    selfReview: ['sobrou placeholder?', 'escopo vazou?', 'AC cobertos?'],
    returnSchema: '{"arquivos":["brief-ceiling.ts","brief-cmd.ts"],"testes":{"passed":N,"failed":0},"desvios":[]}',
    readyToDelegate: true,
    blockers: [],
  }
}

describe('brief-ceiling (Task 0.3)', () => {
  it('BRIEF_TOKEN_CEILING constante existe e é 500', () => {
    expect(BRIEF_TOKEN_CEILING).toBe(500)
  })

  it('estimateBriefTokens retorna número positivo para brief com conteúdo', () => {
    const brief = makeLargeBrief()
    const tokens = estimateBriefTokens(brief)
    expect(tokens).toBeGreaterThan(0)
  })

  it('applyBriefCeiling com brief grande → resultado ≤ 500 tokens (AC#1)', () => {
    const brief = makeLargeBrief()
    // Only apply ceiling if over limit
    const initial = estimateBriefTokens(brief)
    if (initial > BRIEF_TOKEN_CEILING) {
      const result = applyBriefCeiling(brief)
      expect(estimateBriefTokens(result)).toBeLessThanOrEqual(BRIEF_TOKEN_CEILING)
    } else {
      // Brief is already small — ceiling is a no-op
      const result = applyBriefCeiling(brief)
      expect(estimateBriefTokens(result)).toBeLessThanOrEqual(BRIEF_TOKEN_CEILING)
    }
  })

  it('truncado contém prefixo [truncated] (AC#2)', () => {
    const brief = makeLargeBrief()
    const result = applyBriefCeiling(brief)
    // If ceiling was applied, some field should contain [truncated]
    const allText = JSON.stringify(result)
    // Either it was already under 500, or it has the truncated marker
    if (estimateBriefTokens(brief) > BRIEF_TOKEN_CEILING) {
      expect(allText).toContain('[truncated')
    }
  })

  it('--full ignora ceiling (AC#3)', () => {
    const brief = makeLargeBrief()
    const result = applyBriefCeiling(brief, { full: true })
    expect(result.contract).toBe(brief.contract)
    expect(result.imitate).toBe(brief.imitate)
  })

  it('preserva intenção, AC, blast, NÃO, testWith após truncamento (AC#4)', () => {
    const brief = makeLargeBrief()
    const result = applyBriefCeiling(brief)
    expect(result.intent).toBe(brief.intent)
    expect(result.acceptanceCriteria).toEqual(brief.acceptanceCriteria)
    expect(result.blastRadius).toEqual(brief.blastRadius)
    expect(result.notList).toEqual(brief.notList)
    expect(result.testWith).toBe(brief.testWith)
  })
})
