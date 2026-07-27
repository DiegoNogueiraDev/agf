/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M3 — weak/untestable AC gaps. An AC without GWT/checklist structure and
 * without an observable outcome verb cannot be turned into a deterministic test.
 * `recommended` (the driver rewrites). Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'
import { scoreAcTestability } from '../analyzer/ac-testability.js'
import { isActionableForGaps } from './gap-status.js'

const AC_BEARING_TYPES = new Set(['task', 'subtask', 'requirement'])

function short(text: string): string {
  const t = text.trim()
  return t.length > 80 ? `${t.slice(0, 77)}…` : t
}

export function detectWeakAc(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []
  for (const node of doc.nodes) {
    if (!AC_BEARING_TYPES.has(node.type)) continue
    if (!isActionableForGaps(node.status)) continue // done/satisfied → historical, not a gap
    for (const ac of getNodeAcTexts(doc, node.id)) {
      const result = scoreAcTestability(ac)
      if (!result.weak) continue
      const label = short(ac)
      gaps.push({
        kind: 'weak_ac_testability',
        severity: 'recommended',
        nodeId: node.id,
        evidence: `AC fraca em ${node.id}: "${label}" — ${result.reason}`,
        enrichment: {
          action: 'rewrite_ac',
          instruction: `Reescreva a AC "${label}" em Given/When/Then com um resultado observável (e mensurável quando aplicável)`,
          options: ['Given <contexto>, When <ação>, Then <resultado observável e mensurável>'],
          applyVia: [`agf node update ${node.id} --ac "Given …, When …, Then …"`],
        },
      })
    }
  }
  return gaps
}
