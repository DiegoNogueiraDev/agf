/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M2 — decomposition AC-coverage gaps. For every decomposed parent, each parent
 * AC must be represented by ≥1 child. Uncovered ACs are `recommended` gaps
 * (heuristic token matching — the driver confirms). Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { verifyAcCoverage, decomposedParents } from '../planner/ac-coverage.js'

function short(text: string): string {
  const t = text.trim()
  return t.length > 80 ? `${t.slice(0, 77)}…` : t
}

/** Todos os filhos task/subtask fecharam? Decide QUAL pergunta o gap faz. */
function isFullyDelivered(doc: GraphDocument, parentId: string): boolean {
  const children = doc.nodes.filter((n) => n.parentId === parentId && (n.type === 'task' || n.type === 'subtask'))
  return children.length > 0 && children.every((c) => c.status === 'done')
}

/**
 * PORQUÊ a bifurcação (node_9844108d6e9e): "as subtasks cobrem a AC do pai?" é
 * conselho de PLANEJAMENTO — enquanto há filho aberto, dá para redistribuir a
 * AC. Com todos fechados, "cobrir" significaria escrever AC retroativa para
 * trabalho entregue, que é ficção. Medido: 107 achados, 51 pais, TODOS com
 * filhos 100% done — o sinal inteiro era inacionável.
 *
 * Mas calar por completo esconderia o risco real: AC de pai não coberta com
 * tudo done PODE nunca ter sido entregue. Então o sinal não some, MUDA DE
 * PERGUNTA — vira `ac_delivery_doubt`, com outro dono e outra ação.
 */
export function detectAcCoverage(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []
  for (const parentId of decomposedParents(doc)) {
    const { uncoveredAcs } = verifyAcCoverage(doc, parentId)
    const delivered = isFullyDelivered(doc, parentId)
    for (const ac of uncoveredAcs) {
      const label = short(ac)
      if (delivered) {
        gaps.push({
          kind: 'ac_delivery_doubt',
          severity: 'recommended',
          nodeId: parentId,
          evidence: `AC do pai ${parentId} não coberta por nenhuma subtask E todas as subtasks estão done — pode nunca ter sido entregue: "${label}"`,
          enrichment: {
            action: 'add_nodes',
            instruction: `Verifique no CÓDIGO se "${label}" foi entregue; se sim, registre onde; se não, abra o bug`,
            applyVia: [`agf node show ${parentId}`],
          },
        })
        continue
      }
      gaps.push({
        kind: 'ac_coverage_break',
        severity: 'recommended',
        nodeId: parentId,
        evidence: `AC do pai ${parentId} não coberta por nenhuma subtask: "${label}"`,
        enrichment: {
          action: 'add_nodes',
          instruction: `Cubra a AC "${label}" do pai ${parentId} em alguma subtask (ou atribua-a a uma existente)`,
          applyVia: [`agf node add --type subtask --parent ${parentId} --ac "${label}"`],
        },
      })
    }
  }
  return gaps
}
