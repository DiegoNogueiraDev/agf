/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * detect-orphan-commit — código que entrou sem nó no grafo (node_9bb2e60a6390).
 *
 * PORQUÊ: a regra de ouro do projeto é "sem node no grafo, sem código escrito",
 * e ela não tinha cobrador. O custo apareceu concreto na triagem de
 * rastreabilidade: três guardas (REQ-LCR-001/002/003) foram implementadas por
 * commits sem nó e ficaram marcadas como dívida por meses — só um grep pelo id
 * do requisito no código revelou que estavam satisfeitas. Um leitor do grafo
 * concluiria o contrário.
 *
 * DESENHO: puro, com a lista de commits injetada por porta — mesmo padrão de
 * `detectPhantomDone`, que recebe `fileExists`. Assim o detector roda em
 * qualquer projeto que o `agf` dirija e é testável sem repositório de verdade.
 *
 * A JANELA É DO CHAMADOR, de propósito: varrer o histórico inteiro produziria
 * centenas de achados que ninguém vai tratar, e ruído nessa escala mata o sinal.
 * Severidade `recommended` pelo mesmo motivo — bloquear puniria retroativamente
 * trabalho já entregue; o valor está em ver a lista, não em travar quem a herdou.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'

/** Um commit já colhido pelo chamador (janela e formato são decisão dele). */
export interface ProbedCommit {
  sha: string
  subject: string
  /** Caminhos tocados, relativos à raiz do repo. */
  files: readonly string[]
}

/** Porta: devolve os commits da janela que o chamador escolheu. */
export type CommitProbe = () => readonly ProbedCommit[]

/**
 * Só arquivos de código precisam de nó. Cobrar um bump de lockfile ou uma linha
 * de README transformaria o detector em ruído — e ruído faz o sinal inteiro ser
 * ignorado.
 */
function needsNode(path: string): boolean {
  return path.startsWith('src/')
}

/**
 * Todo caminho que qualquer nó declara — pelos DOIS eixos.
 *
 * Olhar só `implementationFiles` produzia falso positivo sistemático: todo
 * commit que adicionava um teste declarado em `testFiles` aparecia como órfão.
 * Num detector de processo, falso positivo custa mais que omissão — ninguém
 * confia numa lista que acusa quem seguiu o fluxo. Os dois campos são
 * declaração; a mesma triangulação física que o `phantom_done` já cruza.
 */
function declaredFiles(doc: GraphDocument): ReadonlySet<string> {
  const declared = new Set<string>()
  for (const node of doc.nodes) {
    for (const file of [...(node.implementationFiles ?? []), ...(node.testFiles ?? [])]) declared.add(file)
  }
  return declared
}

/** Commits recentes cujo código-fonte nenhum nó reivindica. */
export function detectOrphanCommit(doc: GraphDocument, probe: CommitProbe): Gap[] {
  const declared = declaredFiles(doc)
  const gaps: Gap[] = []

  for (const commit of probe()) {
    const orphans = commit.files.filter((f) => needsNode(f) && !declared.has(f))
    if (orphans.length === 0) continue

    const short = commit.sha.slice(0, 7)
    gaps.push({
      kind: 'orphan_commit',
      severity: 'recommended',
      nodeId: commit.sha,
      evidence: `Commit ${short} ("${commit.subject}") tocou ${orphans.length} arquivo(s) que nenhum node declara: ${orphans.join(', ')}`,
      enrichment: {
        action: 'add_nodes',
        instruction: `Crie o node que faltou para ${short}, ou declare os arquivos num node existente`,
        applyVia: [
          `git show --stat ${short}`,
          `agf node add --type task --title "<o que ${short} entregou>" --implementation-files ${orphans[0]}`,
        ],
      },
    })
  }

  return gaps
}
