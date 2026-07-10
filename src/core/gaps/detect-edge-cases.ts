/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M5 — missing edge-case gaps. A task whose ACs are happy-path only. `required`
 * for high-stakes tasks (security/auth/payments), `recommended` otherwise.
 * Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { tasksMissingEdgeCases, isHighStakes } from '../analyzer/edge-case-detector.js'
import { isActionableForGaps } from './gap-status.js'

export function detectEdgeCases(doc: GraphDocument): Gap[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  return tasksMissingEdgeCases(doc)
    .filter((nodeId) => {
      const node = byId.get(nodeId)
      return !node || isActionableForGaps(node.status) // skip done/satisfied — historical
    })
    .map((nodeId) => {
      const node = byId.get(nodeId)
      const stakes = node ? isHighStakes(node) : false
      return {
        kind: 'missing_edge_case',
        severity: stakes ? 'required' : 'recommended',
        nodeId,
        evidence: `Task ${nodeId} só tem AC de happy-path — sem caso de erro/limite${stakes ? ' (alto risco: security/auth/pagamento)' : ''}`,
        enrichment: {
          action: 'add_nodes',
          instruction: `Adicione AC de erro/limite à task ${nodeId}: entrada inválida, vazio/null, timeout, limite excedido, não autorizado`,
          options: [
            'When <entrada inválida>, Then <erro tratado / status 4xx>',
            'When <limite excedido>, Then <rejeitado com mensagem>',
          ],
          applyVia: [`agf node update ${nodeId} --ac "When <entrada inválida>, Then <erro tratado>"`],
        },
      }
    })
}
