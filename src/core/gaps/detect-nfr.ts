/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M4 — missing NFR gaps. A category the graph hints at (perf/security/…) but has
 * no dedicated non-functional requirement. `recommended` (the driver writes the
 * measurable NFR). Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { missingNfrCategories, NFR_EXAMPLE } from '../analyzer/nfr-detector.js'

export function detectNfr(doc: GraphDocument): Gap[] {
  return missingNfrCategories(doc).map((cat) => ({
    kind: 'missing_nfr',
    severity: 'recommended',
    evidence: `O grafo menciona "${cat}" mas não há requisito não-funcional (NFR) cobrindo isso`,
    enrichment: {
      action: 'add_nodes',
      instruction: `Adicione um NFR testável de ${cat} (ex.: "${NFR_EXAMPLE[cat]}")`,
      options: [NFR_EXAMPLE[cat]],
      applyVia: [`agf node add --type requirement --tags nfr --title "NFR ${cat}: ${NFR_EXAMPLE[cat]}"`],
    },
  }))
}
