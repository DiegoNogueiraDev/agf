/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M8 — design-drift gaps (graph-only). An ADR/decision not linked to any
 * requirement/epic has drifted from the design it should govern. `recommended`.
 * Reuses {@link buildTraceabilityMatrix} (orphanDecisions). Deterministic, ~0 token.
 *
 * Follow-up (not here): wire repo-map blast-radius + seam-audit (filesystem)
 * into `gate design` for architecture-impact grounding.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { buildTraceabilityMatrix } from '../designer/traceability-matrix.js'

export function detectDesignDrift(doc: GraphDocument): Gap[] {
  return buildTraceabilityMatrix(doc).orphanDecisions.map((decisionId) => ({
    kind: 'design_drift',
    severity: 'recommended',
    nodeId: decisionId,
    evidence: `Decision/ADR ${decisionId} não está ligada a nenhum requisito/epic — design à deriva`,
    enrichment: {
      action: 'add_edges',
      instruction: `Ligue a decision ${decisionId} ao requisito/epic que ela governa (ou remova-a se obsoleta)`,
      applyVia: [`agf edge add --from ${decisionId} --to <requirementId> --type related_to`],
    },
  }))
}
