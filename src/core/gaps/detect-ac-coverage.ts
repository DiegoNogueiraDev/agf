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

export function detectAcCoverage(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []
  for (const parentId of decomposedParents(doc)) {
    const { uncoveredAcs } = verifyAcCoverage(doc, parentId)
    for (const ac of uncoveredAcs) {
      const label = short(ac)
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
