/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_9bb2e60a6390 — código que entrou sem nó no grafo.
 *
 * A regra de ouro do projeto é "sem node no grafo, sem código escrito", e ela
 * não tinha cobrador. O custo apareceu na triagem de rastreabilidade: três
 * guardas (REQ-LCR-001/002/003) foram implementadas por commits sem nó, e
 * ficaram marcadas como dívida por meses — a única forma de descobrir que
 * estavam satisfeitas foi grep pelo id do requisito no código.
 *
 * O detector cruza os arquivos que os commits recentes tocaram contra os
 * `implementationFiles` que os nós declaram. É puro: recebe a lista de commits
 * por uma porta, como `phantom_done` recebe `fileExists` — assim roda em
 * qualquer projeto e é testável sem repositório de verdade.
 *
 * Ele NÃO fiscaliza o passado: a janela é do chamador, porque varrer histórico
 * inteiro produziria centenas de achados que ninguém vai tratar — ruído que
 * mata o sinal (a lição do gate de lint: catraca, não meta).
 */

import { describe, it, expect } from 'vitest'
import { detectOrphanCommit, type CommitProbe } from '../core/gaps/detect-orphan-commit.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const TS = '2026-01-01T00:00:00.000Z'

function node(id: string, implementationFiles: string[]): GraphNode {
  return {
    id,
    type: 'task',
    title: id,
    status: 'done',
    priority: 3,
    createdAt: TS,
    updatedAt: TS,
    implementationFiles,
  } as GraphNode
}

function doc(...nodes: GraphNode[]): GraphDocument {
  return { nodes, edges: [] } as GraphDocument
}

/** Porta: o que o chamador colheu do git. */
function probe(...commits: Array<{ sha: string; subject: string; files: string[] }>): CommitProbe {
  return () => commits
}

describe('detectOrphanCommit — code that arrived with no node', () => {
  it('flags a commit whose source files no node declares', () => {
    const gaps = detectOrphanCommit(
      doc(node('node_a', ['src/core/outra-coisa.ts'])),
      probe({ sha: 'abc1234', subject: 'feat: guarda nova', files: ['src/core/guarda.ts'] }),
    )

    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('orphan_commit')
    // O achado tem de nomear o arquivo E o commit: sem isso, quem lê não sabe
    // por onde começar a investigar.
    expect(gaps[0].evidence).toContain('src/core/guarda.ts')
    expect(gaps[0].evidence).toContain('abc1234')
  })

  it('does NOT flag a commit whose files are all declared — no false positive', () => {
    const gaps = detectOrphanCommit(
      doc(node('node_a', ['src/core/guarda.ts'])),
      probe({ sha: 'abc1234', subject: 'feat: guarda nova', files: ['src/core/guarda.ts'] }),
    )

    expect(gaps).toEqual([])
  })

  it('ignores files outside src/ — docs, config e lock não precisam de nó', () => {
    // Cobrar nó para um bump de lockfile ou uma linha de README transformaria o
    // detector em ruído, e ruído faz o sinal ser ignorado por inteiro.
    const gaps = detectOrphanCommit(
      doc(),
      probe({ sha: 'abc1234', subject: 'chore: bump', files: ['package-lock.json', 'README.md', '.husky/pre-push'] }),
    )

    expect(gaps).toEqual([])
  })

  it('a commit that mixes declared and undeclared source files is flagged for the undeclared ones only', () => {
    const gaps = detectOrphanCommit(
      doc(node('node_a', ['src/core/declarado.ts'])),
      probe({ sha: 'abc1234', subject: 'feat: dois', files: ['src/core/declarado.ts', 'src/core/orfao.ts'] }),
    )

    expect(gaps).toHaveLength(1)
    expect(gaps[0].evidence).toContain('orfao.ts')
    expect(gaps[0].evidence).not.toContain('declarado.ts')
  })

  it('declarations from ANY node count — the file may belong to another task', () => {
    const gaps = detectOrphanCommit(
      doc(node('node_a', ['src/x.ts']), node('node_b', ['src/core/guarda.ts'])),
      probe({ sha: 'abc1234', subject: 'feat', files: ['src/core/guarda.ts'] }),
    )

    expect(gaps).toEqual([])
  })

  it('an empty probe yields nothing — absence of commits is not a finding', () => {
    expect(detectOrphanCommit(doc(), probe())).toEqual([])
  })

  it('severity is recommended — this is a process signal, not a blocker', () => {
    // Bloquear seria punir retroativamente trabalho já entregue; o valor está
    // em ver a lista, não em travar quem a herdou.
    const gaps = detectOrphanCommit(doc(), probe({ sha: 'a1', subject: 's', files: ['src/core/x.ts'] }))

    expect(gaps[0].severity).toBe('recommended')
  })

  it('carries an actionable next step naming the commit', () => {
    const gaps = detectOrphanCommit(doc(), probe({ sha: 'deadbee', subject: 'feat: x', files: ['src/core/x.ts'] }))

    expect(gaps[0].enrichment?.applyVia?.join(' ')).toContain('deadbee')
  })
})

describe('declarations count from BOTH axes — testFiles is a declaration too', () => {
  it('a commit touching only a declared TEST file is not orphan', () => {
    // Achado ao ler a saida real em vez da contagem: o detector so olhava
    // implementationFiles, entao todo commit que adicionava um teste declarado
    // aparecia como orfao. Falso positivo sistematico — e num detector de
    // processo, falso positivo custa mais que omissao: ninguem confia na lista.
    const withTest = {
      id: 'node_t',
      type: 'task',
      title: 'node_t',
      status: 'done',
      priority: 3,
      createdAt: TS,
      updatedAt: TS,
      testFiles: ['src/tests/guarda.test.ts'],
    } as GraphNode

    const gaps = detectOrphanCommit(
      doc(withTest),
      probe({ sha: 'abc1234', subject: 'test: guarda', files: ['src/tests/guarda.test.ts'] }),
    )

    expect(gaps).toEqual([])
  })
})
