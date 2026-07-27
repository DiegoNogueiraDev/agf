/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M9 — estimate-drift gaps (size↔estimate inconsistency). `recommended`.
 * Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { estimateDrifts, formatRange } from '../planner/reestimate.js'

export function detectEstimateDrift(doc: GraphDocument): Gap[] {
  return estimateDrifts(doc).map(({ node, xpSize, estimateMinutes, expected }) => {
    const range = formatRange(expected)
    return {
      kind: 'estimate_drift',
      severity: 'recommended',
      nodeId: node.id,
      evidence: `Task ${node.id}: estimativa ${estimateMinutes}min não condiz com xpSize ${xpSize} (esperado ${range})`,
      enrichment: {
        action: 'annotate',
        instruction: `Reconcilie ${node.id}: ajuste a estimativa p/ a faixa ${range} OU corrija o xpSize`,
        applyVia: [`agf node update ${node.id} --estimate <min>`, `agf node update ${node.id} --size <XS|S|M|L|XL>`],
      },
    }
  })
}
